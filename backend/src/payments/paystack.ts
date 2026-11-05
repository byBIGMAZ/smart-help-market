import { createDecipheriv } from 'node:crypto'
import { getDatabasePool } from '../database'

export interface PaystackInitializeInput {
  amountMinor: number
  email: string
  reference: string
  currency: string
  callbackUrl: string
  channels: string[]
  metadata: Record<string, unknown>
}

export interface PaystackInitializeResult {
  authorizationUrl: string
  accessCode: string
  reference: string
}

export interface PaystackVerifiedTransaction {
  status: string
  reference: string
  amount: number
  currency: string
  paidAt: string | null
  gatewayMode: string
  providerTransactionId: string | null
  customerEmail: string | null
}

interface StoredPaymentConfiguration {
  enabled: boolean
  mode: 'test' | 'live'
  secret_key_ciphertext: string | null
  secret_key_mode: 'test' | 'live' | null
}

function decryptCredential(ciphertext: string): string {
  const rawKey = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY
  if (!rawKey) throw new Error('Payment credential encryption is not configured.')
  const key = Buffer.from(rawKey, 'base64')
  if (key.length !== 32) throw new Error('Payment credential encryption key must be 32 bytes.')

  const parts = ciphertext.split('.')
  if (parts.length !== 3) throw new Error('Stored payment credential has an invalid format.')
  const iv = Buffer.from(parts[0], 'base64')
  const authTag = Buffer.from(parts[1], 'base64')
  const encrypted = Buffer.from(parts[2], 'base64')
  if (iv.length !== 12 || authTag.length !== 16 || encrypted.length === 0) {
    throw new Error('Stored payment credential is invalid.')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

async function getConfiguredSecretKey(): Promise<{ secretKey: string; mode: 'test' | 'live' }> {
  const result = await getDatabasePool().query<StoredPaymentConfiguration>(
    `SELECT enabled, mode, secret_key_ciphertext, secret_key_mode
     FROM public.marketplace_payment_configuration
     WHERE configuration_id = 1 LIMIT 1`,
  )
  const config = result.rows[0]
  if (!config?.enabled) throw new Error('The payment gateway is currently disabled.')
  if (!config.secret_key_ciphertext || config.secret_key_mode !== config.mode) {
    throw new Error('The Paystack secret key is missing or does not match the selected environment.')
  }
  const secretKey = decryptCredential(config.secret_key_ciphertext)
  const expectedPrefix = config.mode === 'live' ? 'sk_live_' : 'sk_test_'
  if (!secretKey.startsWith(expectedPrefix)) throw new Error('The stored Paystack credential does not match the selected environment.')
  return { secretKey, mode: config.mode }
}

async function paystackRequest<T>(path: string, secretKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...init?.headers,
    },
  })
  const body = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null
  if (!response.ok || !body?.status || body.data === undefined) {
    const safeMessage = typeof body?.message === 'string' ? body.message.slice(0, 180) : 'Paystack did not accept the request.'
    throw new Error(`Paystack request failed: ${safeMessage}`)
  }
  return body.data
}

export async function initializePaystackTransaction(input: PaystackInitializeInput): Promise<PaystackInitializeResult> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Payment amount must be a positive integer in the currency subunit.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
    throw new Error('A valid customer email address is required.')
  }
  if (!/^[A-Z]{3}$/.test(input.currency) || !/^[A-Za-z0-9.=\-]{8,100}$/.test(input.reference)) {
    throw new Error('Payment currency or transaction reference is invalid.')
  }
  const { secretKey } = await getConfiguredSecretKey()
  const data = await paystackRequest<{
    authorization_url?: string
    access_code?: string
    reference?: string
  }>('/transaction/initialize', secretKey, {
    method: 'POST',
    body: JSON.stringify({
      amount: String(input.amountMinor),
      email: input.email,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.channels,
      metadata: input.metadata,
    }),
  })
  if (!data.authorization_url || !data.access_code || data.reference !== input.reference) {
    throw new Error('Paystack returned an incomplete or mismatched transaction response.')
  }
  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  }
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerifiedTransaction> {
  if (!/^[A-Za-z0-9.=\-]{8,100}$/.test(reference)) throw new Error('Transaction reference is invalid.')
  const { secretKey, mode } = await getConfiguredSecretKey()
  const data = await paystackRequest<{
    status?: string
    reference?: string
    amount?: number
    currency?: string
    paid_at?: string | null
    domain?: string
    id?: number | string
    customer?: { email?: string }
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, secretKey)
  if (data.reference !== reference || !Number.isSafeInteger(data.amount) || typeof data.currency !== 'string' || typeof data.status !== 'string') {
    throw new Error('Paystack returned transaction details that could not be validated.')
  }
  if ((mode === 'test' && data.domain !== 'test') || (mode === 'live' && data.domain !== 'live')) {
    throw new Error('The Paystack transaction environment does not match the configured environment.')
  }
  return {
    status: data.status,
    reference: data.reference,
    amount: data.amount as number,
    currency: data.currency,
    paidAt: data.paid_at ?? null,
    gatewayMode: mode,
    providerTransactionId: data.id === undefined ? null : String(data.id),
    customerEmail: data.customer?.email ?? null,
  }
}
