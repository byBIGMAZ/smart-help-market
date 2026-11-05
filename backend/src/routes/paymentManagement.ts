import { Router } from 'express'
import { createCipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { getDatabasePool } from '../database'
import { requireSuperAdmin } from '../auth/requireSuperAdmin'

const router = Router()
const OTP_LIFETIME_MINUTES = 10

function getEncryptionKey(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_ENCRYPTION_KEY
  if (!raw) throw new Error('Payment credential encryption is not configured.')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('Payment credential encryption key must be 32 bytes.')
  return key
}

function encryptCredential(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}

function hashOtp(code: string): string {
  const pepper = process.env.PAYMENT_OTP_PEPPER
  if (!pepper || pepper.length < 32) throw new Error('Payment OTP protection is not configured.')
  return createHmac('sha256', pepper).update(code).digest('hex')
}

function hashAuthorizationToken(token: string): string {
  const pepper = process.env.PAYMENT_OTP_PEPPER
  if (!pepper || pepper.length < 32) throw new Error('Payment OTP protection is not configured.')
  return createHmac('sha256', pepper).update(`payment-credential-change:${token}`).digest('hex')
}

function cleanString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

router.use(requireSuperAdmin)

router.get('/configuration', async (_req, res) => {
  try {
    const result = await getDatabasePool().query(
      `SELECT enabled, mode, public_key AS "publicKey",
              (secret_key_ciphertext IS NOT NULL) AS "secretKeyConfigured",
              (webhook_secret_ciphertext IS NOT NULL) AS "webhookSecretConfigured",
              currency_code AS "currencyCode", payment_channels AS "paymentChannels",
              transaction_settings AS "transactionSettings", fee_settings AS "feeSettings",
              escrow_settings AS "escrowSettings", inspection_settings AS "inspectionSettings",
              listing_fee_settings AS "listingFeeSettings", updated_at AS "updatedAt"
       FROM public.marketplace_payment_configuration WHERE configuration_id = 1`,
    )
    res.status(200).json({ status: 'ok', configuration: result.rows[0] ?? null })
  } catch (error) {
    console.error('Payment configuration load failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'Payment configuration could not be loaded.' })
  }
})

router.put('/configuration', async (req, res) => {
  const mode = req.body?.mode
  const enabled = req.body?.enabled
  const publicKey = cleanString(req.body?.publicKey, 300)
  const currencyCode = cleanString(req.body?.currencyCode, 3).toUpperCase()
  const paymentChannels = req.body?.paymentChannels
  const transactionSettings = req.body?.transactionSettings
  const feeSettings = req.body?.feeSettings
  const escrowSettings = req.body?.escrowSettings
  const inspectionSettings = req.body?.inspectionSettings
  const listingFeeSettings = req.body?.listingFeeSettings

  if (!['test', 'live'].includes(mode) || typeof enabled !== 'boolean' ||
      !/^[A-Z]{3}$/.test(currencyCode) ||
      !Array.isArray(paymentChannels) ||
      paymentChannels.length === 0 ||
      !paymentChannels.every((v: unknown) => typeof v === 'string' && ['card','bank','ussd','mobile_money','bank_transfer'].includes(v)) ||
      ![transactionSettings, feeSettings, escrowSettings, inspectionSettings, listingFeeSettings].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    res.status(400).json({ error: 'Payment configuration contains invalid values.' })
    return
  }

  if (mode === 'live' && !publicKey.startsWith('pk_live_')) {
    res.status(400).json({ error: 'A valid Paystack live public key is required for live mode.' })
    return
  }
  if (mode === 'test' && publicKey && !publicKey.startsWith('pk_test_')) {
    res.status(400).json({ error: 'Use a Paystack test public key in test mode.' })
    return
  }

  try {
    const current = await getDatabasePool().query(
      `SELECT secret_key_ciphertext, secret_key_mode, webhook_secret_ciphertext FROM public.marketplace_payment_configuration WHERE configuration_id = 1`,
    )
    if (enabled && (!publicKey || !current.rows[0]?.secret_key_ciphertext || current.rows[0]?.secret_key_mode !== mode)) {
      res.status(409).json({ error: 'Configure the public and encrypted secret keys before enabling payments.' })
      return
    }
    if (!Number.isSafeInteger(transactionSettings.transactionExpiryMinutes) || !Number.isSafeInteger(transactionSettings.minimumAmount) || !Number.isSafeInteger(transactionSettings.maximumAmount) ||
        !Number.isSafeInteger(escrowSettings.holdingPeriodHours) || !Number.isSafeInteger(inspectionSettings.bookingExpiryHours) ||
        !Number.isFinite(feeSettings.platformFeeValue) || !Number.isFinite(feeSettings.agentCommissionValue) ||
        typeof feeSettings.platformFeeEnabled !== 'boolean' || typeof feeSettings.agentCommissionEnabled !== 'boolean' ||
        !['fixed', 'percentage'].includes(feeSettings.platformFeeType) || !['fixed', 'percentage'].includes(feeSettings.agentCommissionType) ||
        !['customer', 'platform'].includes(feeSettings.feePayer) ||
        typeof escrowSettings.enabled !== 'boolean' || typeof escrowSettings.automaticRelease !== 'boolean' ||
        typeof inspectionSettings.enabled !== 'boolean' || typeof inspectionSettings.requirePayment !== 'boolean' ||
        transactionSettings.transactionExpiryMinutes < 5 || transactionSettings.transactionExpiryMinutes > 1440 ||
        transactionSettings.minimumAmount < 1 || transactionSettings.maximumAmount <= transactionSettings.minimumAmount ||
        feeSettings.platformFeeValue < 0 || feeSettings.agentCommissionValue < 0 ||
        (feeSettings.platformFeeType === 'percentage' && feeSettings.platformFeeValue > 100) ||
        (feeSettings.agentCommissionType === 'percentage' && feeSettings.agentCommissionValue > 100) ||
        escrowSettings.holdingPeriodHours < 1 || escrowSettings.holdingPeriodHours > 8760 ||
        inspectionSettings.bookingExpiryHours < 1 || inspectionSettings.bookingExpiryHours > 720 ||
        typeof listingFeeSettings.enabled !== 'boolean' ||
        !Number.isSafeInteger(listingFeeSettings.propertyFee) || !Number.isSafeInteger(listingFeeSettings.productFee) || !Number.isSafeInteger(listingFeeSettings.serviceFee) ||
        listingFeeSettings.propertyFee < 0 || listingFeeSettings.productFee < 0 || listingFeeSettings.serviceFee < 0 ||
        listingFeeSettings.propertyFee > 100000000 || listingFeeSettings.productFee > 100000000 || listingFeeSettings.serviceFee > 100000000) {
      res.status(400).json({ error: 'One or more payment limits, fees or policy values are outside the allowed range.' })
      return
    }
    const result = await getDatabasePool().query(
      `UPDATE public.marketplace_payment_configuration
       SET enabled = $1, mode = $2, public_key = NULLIF($3, ''),
           currency_code = $4, payment_channels = $5::jsonb,
           transaction_settings = $6::jsonb, fee_settings = $7::jsonb,
           escrow_settings = $8::jsonb, inspection_settings = $9::jsonb,
           listing_fee_settings = $10::jsonb,
           updated_by = $11, updated_at = NOW()
       WHERE configuration_id = 1
       RETURNING enabled, mode, public_key AS "publicKey",
         (secret_key_ciphertext IS NOT NULL) AS "secretKeyConfigured",
         (webhook_secret_ciphertext IS NOT NULL) AS "webhookSecretConfigured",
         currency_code AS "currencyCode", payment_channels AS "paymentChannels",
         transaction_settings AS "transactionSettings", fee_settings AS "feeSettings",
         escrow_settings AS "escrowSettings", inspection_settings AS "inspectionSettings",
         listing_fee_settings AS "listingFeeSettings", updated_at AS "updatedAt"`,
      [enabled, mode, publicKey, currencyCode, JSON.stringify(paymentChannels),
       JSON.stringify(transactionSettings), JSON.stringify(feeSettings),
       JSON.stringify(escrowSettings), JSON.stringify(inspectionSettings), JSON.stringify(listingFeeSettings),
       res.locals.superAdminUserId],
    )
    await getDatabasePool().query(
      `INSERT INTO public.marketplace_audit_logs (actor_user_id, action_key, target_type, target_id, details)
       VALUES ($1, 'payment.configuration.updated', 'payment_configuration', '1', $2::jsonb)`,
      [res.locals.superAdminUserId, JSON.stringify({ mode, enabled, currencyCode })],
    )
    res.status(200).json({ status: 'ok', configuration: result.rows[0] })
  } catch (error) {
    console.error('Payment configuration update failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'Payment configuration could not be updated.' })
  }
})

router.post('/credentials/request-code', async (_req, res) => {
  try {
    const db = getDatabasePool()
    const admin = await db.query<{ email: string }>(
      'SELECT email FROM public.marketplace_users WHERE user_id = $1 AND account_status = $2 LIMIT 1',
      [res.locals.superAdminUserId, 'active'],
    )
    const email = admin.rows[0]?.email
    if (!email) {
      res.status(400).json({ error: 'The Super Admin account does not have a registered email address.' })
      return
    }

    const recent = await db.query(
      `SELECT created_at FROM public.marketplace_payment_credential_otps
       WHERE admin_user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [res.locals.superAdminUserId],
    )
    if (recent.rowCount) {
      res.status(429).json({ error: 'Please wait at least 60 seconds before requesting another code.' })
      return
    }

    const resendKey = process.env.RESEND_API_KEY
    const from = process.env.PAYMENT_OTP_FROM
    if (!resendKey || !from) {
      res.status(503).json({ error: 'Secure email delivery is not configured yet. Configure Resend on the backend first.' })
      return
    }

    const code = randomInt(0, 1000000).toString().padStart(6, '0')
    const codeHash = hashOtp(code)
    await db.query(
      `UPDATE public.marketplace_payment_credential_otps
       SET consumed_at = NOW() WHERE admin_user_id = $1 AND consumed_at IS NULL`,
      [res.locals.superAdminUserId],
    )
    await db.query(
      `INSERT INTO public.marketplace_payment_credential_otps (admin_user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [res.locals.superAdminUserId, codeHash],
    )

    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'SMART HELP MARKET payment security code',
        text: `Your one-time code to change payment credentials is ${code}. It expires in 10 minutes and can only be used once. If you did not request this code, ignore this email.`,
      }),
    })
    if (!mail.ok) {
      await db.query(
        `UPDATE public.marketplace_payment_credential_otps
         SET consumed_at = NOW() WHERE admin_user_id = $1 AND code_hash = $2`,
        [res.locals.superAdminUserId, codeHash],
      )
      console.error('Resend email delivery failed with status:', mail.status)
      res.status(502).json({ error: 'The verification email could not be delivered. Check the Resend configuration.' })
      return
    }
    res.status(200).json({ status: 'ok', message: `A one-time code was sent to ${email.replace(/^(.).+(@.+)$/, '$1••••$2')}.`, expiresInSeconds: OTP_LIFETIME_MINUTES * 60 })
  } catch (error) {
    console.error('Payment OTP request failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'A payment security code could not be issued.' })
  }
})

router.post('/credentials/verify-code', async (req, res) => {
  const code = cleanString(req.body?.code, 6)
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'Enter the complete six-digit email verification code.' })
    return
  }

  try {
    const db = getDatabasePool()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const otp = await client.query(
        `SELECT otp_id, code_hash, attempts
         FROM public.marketplace_payment_credential_otps
         WHERE admin_user_id = $1 AND consumed_at IS NULL AND verified_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [res.locals.superAdminUserId],
      )
      const record = otp.rows[0]
      const suppliedHash = Buffer.from(hashOtp(code), 'hex')
      const storedHash = record ? Buffer.from(record.code_hash, 'hex') : Buffer.alloc(0)
      const matches = Boolean(record && record.attempts < 5 && storedHash.length === suppliedHash.length && timingSafeEqual(storedHash, suppliedHash))
      if (!matches) {
        if (record && record.attempts < 5) {
          await client.query('UPDATE public.marketplace_payment_credential_otps SET attempts = attempts + 1 WHERE otp_id = $1', [record.otp_id])
        }
        await client.query('COMMIT')
        res.status(400).json({ error: 'The code is invalid, expired or has reached its attempt limit.' })
        return
      }

      const authorizationToken = randomBytes(32).toString('base64url')
      await client.query(
        `UPDATE public.marketplace_payment_credential_otps
         SET verified_at = NOW(), credential_change_token_hash = $2
         WHERE otp_id = $1`,
        [record.otp_id, hashAuthorizationToken(authorizationToken)],
      )
      await client.query('COMMIT')
      res.status(200).json({ status: 'ok', authorizationToken, message: 'Email code verified. You may now enter the new payment credentials.' })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Payment OTP verification failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'The security code could not be verified.' })
  }
})

router.post('/credentials/cancel-verification', async (req, res) => {
  const authorizationToken = cleanString(req.body?.authorizationToken, 200)
  if (!authorizationToken) {
    res.status(200).json({ status: 'ok' })
    return
  }
  try {
    await getDatabasePool().query(
      `UPDATE public.marketplace_payment_credential_otps
       SET consumed_at = NOW(), credential_change_token_hash = NULL
       WHERE admin_user_id = $1 AND credential_change_token_hash = $2 AND consumed_at IS NULL`,
      [res.locals.superAdminUserId, hashAuthorizationToken(authorizationToken)],
    )
    res.status(200).json({ status: 'ok' })
  } catch (error) {
    console.error('Payment credential verification cancellation failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'The temporary credential authorization could not be cancelled.' })
  }
})

router.put('/credentials', async (req, res) => {
  const authorizationToken = cleanString(req.body?.authorizationToken, 200)
  const secretKey = cleanString(req.body?.secretKey, 500)
  const webhookSecret = cleanString(req.body?.webhookSecret, 500)
  if (authorizationToken.length < 40 || (!secretKey && !webhookSecret)) {
    res.status(400).json({ error: 'Complete email verification and enter at least one new credential.' })
    return
  }
  if (secretKey) {
    const currentMode = await getDatabasePool().query<{ mode: string }>(
      'SELECT mode FROM public.marketplace_payment_configuration WHERE configuration_id = 1',
    )
    const expectedPrefix = currentMode.rows[0]?.mode === 'live' ? 'sk_live_' : 'sk_test_'
    if (!secretKey.startsWith(expectedPrefix)) {
      res.status(400).json({ error: 'The Paystack secret key prefix does not match the saved gateway environment.' })
      return
    }
  }
  try {
    const db = getDatabasePool()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const otp = await client.query(
        `SELECT otp_id
         FROM public.marketplace_payment_credential_otps
         WHERE admin_user_id = $1
           AND credential_change_token_hash = $2
           AND verified_at IS NOT NULL
           AND consumed_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [res.locals.superAdminUserId, hashAuthorizationToken(authorizationToken)],
      )
      const record = otp.rows[0]
      if (!record) {
        await client.query('ROLLBACK')
        res.status(401).json({ error: 'Your verification has expired or has already been used. Request a new code.' })
        return
      }
      const encryptedSecret = secretKey ? encryptCredential(secretKey) : null
      const encryptedWebhook = webhookSecret ? encryptCredential(webhookSecret) : null
      await client.query(
        `UPDATE public.marketplace_payment_configuration
         SET secret_key_ciphertext = COALESCE($1, secret_key_ciphertext),
             secret_key_mode = CASE WHEN $1 IS NOT NULL THEN mode ELSE secret_key_mode END,
             webhook_secret_ciphertext = COALESCE($2, webhook_secret_ciphertext),
             updated_by = $3, updated_at = NOW()
         WHERE configuration_id = 1`,
        [encryptedSecret, encryptedWebhook, res.locals.superAdminUserId],
      )
      await client.query('UPDATE public.marketplace_payment_credential_otps SET consumed_at = NOW(), credential_change_token_hash = NULL WHERE otp_id = $1', [record.otp_id])
      await client.query(
        `INSERT INTO public.marketplace_audit_logs (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'payment.credentials.rotated', 'payment_configuration', '1', $2::jsonb)`,
        [res.locals.superAdminUserId, JSON.stringify({ secretKeyChanged: Boolean(secretKey), webhookSecretChanged: Boolean(webhookSecret) })],
      )
      await client.query('COMMIT')
      res.status(200).json({ status: 'ok', message: 'Payment credentials were encrypted and updated. Their values will not be displayed.' })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Payment credential update failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'Payment credentials could not be updated.' })
  }
})

export default router
