import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { PoolClient } from 'pg'
import { getDatabasePool } from '../database'
import { requireAuthenticatedSession } from '../auth/requireAuthenticatedSession'
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from '../payments/paystack'

const router = Router()

type ListingKind = 'properties' | 'products' | 'services'

interface PaymentConfiguration {
  enabled: boolean
  mode: 'test' | 'live'
  publicKey: string | null
  currencyCode: string
  paymentChannels: string[]
  transactionSettings: { transactionExpiryMinutes?: number }
  listingFeeSettings: {
    enabled: boolean
    propertyFee: number
    productFee: number
    serviceFee: number
  }
}

interface ListingPaymentRow {
  listing_id: string
  status: string
  is_demo: boolean
  owner_user_id: string
  kind: ListingKind | null
  email: string
  listing_fee_paid_at: Date | null
}

function isListingKind(value: unknown): value is ListingKind {
  return value === 'properties' || value === 'products' || value === 'services'
}

function getCurrencyExponent(currency: string): number | null {
  const code = currency.toUpperCase()
  if (['JPY', 'KRW', 'XOF', 'XAF', 'CLP', 'UGX', 'RWF'].includes(code)) return 0
  if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(code)) return 3
  if (['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'GBP', 'EUR', 'CAD', 'AUD'].includes(code)) return 2
  return null
}

function getMajorFee(config: PaymentConfiguration, kind: ListingKind): number | null {
  if (!config.listingFeeSettings || typeof config.listingFeeSettings.enabled !== 'boolean') return null
  if (!config.listingFeeSettings.enabled) return 0
  const amount = kind === 'properties'
    ? config.listingFeeSettings.propertyFee
    : kind === 'products'
      ? config.listingFeeSettings.productFee
      : config.listingFeeSettings.serviceFee
  if (!Number.isSafeInteger(amount) || amount < 0) return null
  return amount
}

function getFrontendOrigin(): string {
  const configured = process.env.FRONTEND_ORIGIN?.trim()
  if (!configured) throw new Error('FRONTEND_ORIGIN is not configured for secure payment callbacks.')
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('FRONTEND_ORIGIN must use HTTPS.')
  }
  return url.origin
}

async function readOwnedDraft(listingId: string, userId: string, client: PoolClient): Promise<ListingPaymentRow | null> {
  const result = await client.query(
    `SELECT
       l.listing_id::text AS listing_id,
       l.status,
       l.is_demo,
       l.owner_user_id::text AS owner_user_id,
       l.listing_details->>'kind' AS kind,
       u.email,
       l.listing_fee_paid_at
     FROM public.marketplace_listings l
     INNER JOIN public.marketplace_users u ON u.user_id = l.owner_user_id
     WHERE l.listing_id = $1 AND l.owner_user_id = $2
     FOR UPDATE OF l`,
    [listingId, userId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    ...row,
    kind: isListingKind(row.kind) ? row.kind : null,
  } as ListingPaymentRow
}


router.post('/owner/:listingId/submit', requireAuthenticatedSession, async (req, res) => {
  const userId = String(res.locals.authenticatedUserId ?? '')
  const listingId = typeof req.params.listingId === 'string' ? req.params.listingId : ''

  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  if (!/^[1-9]\d*$/.test(listingId)) {
    res.status(400).json({ error: 'Invalid listing ID.' })
    return
  }

  const db = getDatabasePool()
  const client = await db.connect()
  let transactionId: string | null = null
  let reference = ''
  let amountMinor = 0
  let currencyCode = ''
  let customerEmail = ''
  let paymentChannels: string[] = []
  let callbackUrl = ''
  let expiresAtMinutes = 30
  let existingAuthorizationUrl: string | null = null

  try {
    await client.query('BEGIN')
    const listing = await readOwnedDraft(listingId, userId, client)
    if (!listing || listing.is_demo) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'Your listing draft was not found.' })
      return
    }
    if (listing.status !== 'draft') {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'Only draft listings can be submitted for review.' })
      return
    }
    if (!listing.kind || !listing.email) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'The listing type or account email could not be validated.' })
      return
    }

    const configResult = await client.query(
      `SELECT enabled, mode, public_key AS "publicKey",
              currency_code AS "currencyCode",
              payment_channels AS "paymentChannels",
              transaction_settings AS "transactionSettings",
              listing_fee_settings AS "listingFeeSettings"
       FROM public.marketplace_payment_configuration
       WHERE configuration_id = 1
       LIMIT 1`,
    )
    const config = configResult.rows[0] as PaymentConfiguration | undefined
    const fee = config ? getMajorFee(config, listing.kind) : 0
    if (fee === null) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'The configured listing fee policy is invalid. Please contact marketplace support.' })
      return
    }

    if (listing.listing_fee_paid_at) {
      await client.query(
        `UPDATE public.marketplace_listings
         SET status = 'pending_review', updated_at = NOW()
         WHERE listing_id = $1 AND owner_user_id = $2 AND status = 'draft'`,
        [listingId, userId],
      )
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'listing.submitted_for_review', 'marketplace_listing', $2, $3::jsonb)`,
        [userId, listingId, JSON.stringify({ feeAlreadyPaid: true })],
      )
      await client.query('COMMIT')
      res.status(200).json({ status: 'ok', submitted: true, message: 'Your paid listing has been submitted for review.' })
      return
    }

    if (fee <= 0) {
      await client.query(
        `UPDATE public.marketplace_listings
         SET status = 'pending_review', updated_at = NOW()
         WHERE listing_id = $1 AND owner_user_id = $2 AND status = 'draft'`,
        [listingId, userId],
      )
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'listing.submitted_for_review', 'marketplace_listing', $2, $3::jsonb)`,
        [userId, listingId, JSON.stringify({ feeRequired: false })],
      )
      await client.query('COMMIT')
      res.status(200).json({ status: 'ok', submitted: true, feeRequired: false, message: 'Your listing has been submitted for review.' })
      return
    }

    if (!config?.enabled || !config.publicKey) {
      await client.query('ROLLBACK')
      res.status(503).json({ error: 'A listing fee is required, but the payment gateway is not ready. Please try again later or contact support.' })
      return
    }

    const exponent = getCurrencyExponent(config.currencyCode)
    if (exponent === null) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'The configured payment currency is not supported for listing fees.' })
      return
    }
    const minorAmount = fee * (10 ** exponent)
    if (!Number.isSafeInteger(minorAmount) || minorAmount <= 0) {
      await client.query('ROLLBACK')
      res.status(409).json({ error: 'The configured listing fee exceeds the supported payment amount.' })
      return
    }

    const existing = await client.query(
      `SELECT transaction_id::text AS id, reference, authorization_url,
              amount_minor::text AS amount_minor, currency_code
       FROM public.marketplace_payment_transactions
       WHERE user_id = $1
         AND purpose_key = 'listing_fee'
         AND subject_type = 'marketplace_listing'
         AND subject_id = $2
         AND status IN ('initialized', 'pending')
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [userId, listingId],
    )

    if (existing.rows[0]) {
      transactionId = String(existing.rows[0].id)
      reference = String(existing.rows[0].reference)
      existingAuthorizationUrl = typeof existing.rows[0].authorization_url === 'string'
        ? existing.rows[0].authorization_url
        : null
      amountMinor = Number(existing.rows[0].amount_minor)
      currencyCode = String(existing.rows[0].currency_code).trim()
      if (!existingAuthorizationUrl) {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'Your checkout is being prepared. Please wait a moment and try again.' })
        return
      }
    } else {
      reference = `SHMLF-${randomUUID()}`
      expiresAtMinutes = Number.isSafeInteger(config.transactionSettings?.transactionExpiryMinutes)
        ? Math.min(1440, Math.max(5, Number(config.transactionSettings.transactionExpiryMinutes)))
        : 30
      const inserted = await client.query(
        `INSERT INTO public.marketplace_payment_transactions
           (reference, user_id, gateway_mode, purpose_key, subject_type, subject_id,
            amount_minor, currency_code, customer_email, status, idempotency_key,
            expires_at, metadata)
         VALUES ($1, $2, $3, 'listing_fee', 'marketplace_listing', $4,
                 $5, $6, $7, 'initialized', $8,
                 NOW() + ($9::text || ' minutes')::interval, $10::jsonb)
         RETURNING transaction_id::text AS id`,
        [
          reference, userId, config.mode, listingId, minorAmount,
          config.currencyCode, listing.email, `listing-fee:${listingId}:${randomUUID()}`,
          expiresAtMinutes,
          JSON.stringify({ listingKind: listing.kind, feeMajor: fee }),
        ],
      )
      transactionId = String(inserted.rows[0].id)
      amountMinor = minorAmount
      currencyCode = config.currencyCode
      customerEmail = listing.email
      paymentChannels = Array.isArray(config.paymentChannels) ? config.paymentChannels : []
      callbackUrl = `${getFrontendOrigin()}/owner/listings?payment=return&listingId=${encodeURIComponent(listingId)}`
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Listing fee checkout preparation failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(500).json({ error: 'The listing payment could not be prepared.' })
    return
  } finally {
    client.release()
  }

  if (existingAuthorizationUrl) {
    res.status(200).json({
      status: 'ok',
      paymentRequired: true,
      reference,
      amountMinor,
      currencyCode,
      authorizationUrl: existingAuthorizationUrl,
      message: 'Continue your existing listing fee checkout.',
    })
    return
  }

  try {
    const checkout = await initializePaystackTransaction({
      amountMinor,
      email: customerEmail,
      reference,
      currency: currencyCode,
      callbackUrl,
      channels: paymentChannels,
      metadata: { purpose: 'listing_fee', listingId, transactionId },
    })
    const eventClient = await db.connect()
    try {
      await eventClient.query('BEGIN')
      await eventClient.query(
        `UPDATE public.marketplace_payment_transactions
         SET status = 'pending', authorization_url = $1, access_code = $2, updated_at = NOW()
         WHERE transaction_id = $3 AND user_id = $4 AND status = 'initialized'`,
        [checkout.authorizationUrl, checkout.accessCode, transactionId, userId],
      )
      await eventClient.query(
        `INSERT INTO public.marketplace_payment_transaction_events
           (transaction_id, event_type, event_source, payload)
         VALUES ($1, 'checkout.initialized', 'api', $2::jsonb)`,
        [transactionId, JSON.stringify({ reference, amountMinor, currencyCode })],
      )
      await eventClient.query('COMMIT')
    } catch (error) {
      await eventClient.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      eventClient.release()
    }
    res.status(200).json({
      status: 'ok',
      paymentRequired: true,
      reference: checkout.reference,
      amountMinor,
      currencyCode,
      authorizationUrl: checkout.authorizationUrl,
      message: 'Continue to Paystack to pay your listing fee.',
    })
  } catch (error) {
    await db.query(
      `UPDATE public.marketplace_payment_transactions
       SET status = 'failed', failure_message = $1, updated_at = NOW()
       WHERE transaction_id = $2 AND status = 'initialized'`,
      [error instanceof Error ? error.message.slice(0, 300) : 'Checkout initialization failed.', transactionId],
    ).catch(() => undefined)
    console.error('Listing fee Paystack initialization failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(503).json({ error: 'Paystack could not prepare checkout. Your listing draft is safe. Please try again.' })
  }
})

router.post('/owner/:listingId/verify-payment', requireAuthenticatedSession, async (req, res) => {
  const userId = String(res.locals.authenticatedUserId ?? '')
  const listingId = typeof req.params.listingId === 'string' ? req.params.listingId : ''
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : ''

  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' })
    return
  }
  if (!/^[1-9]\d*$/.test(listingId) || !/^[A-Za-z0-9.=\-]{8,100}$/.test(reference)) {
    res.status(400).json({ error: 'A valid listing and payment reference are required.' })
    return
  }

  const db = getDatabasePool()
  try {
    const transactionResult = await db.query(
      `SELECT transaction_id::text AS id, amount_minor::text AS amount_minor,
              currency_code, customer_email, status, gateway_mode
       FROM public.marketplace_payment_transactions
       WHERE reference = $1 AND user_id = $2
         AND purpose_key = 'listing_fee'
         AND subject_type = 'marketplace_listing'
         AND subject_id = $3
       LIMIT 1`,
      [reference, userId, listingId],
    )
    const transaction = transactionResult.rows[0]
    if (!transaction) {
      res.status(404).json({ error: 'The listing fee transaction was not found in your account.' })
      return
    }
    if (transaction.status === 'success') {
      res.status(200).json({ status: 'ok', paid: true, submitted: true, message: 'This listing fee has already been confirmed.' })
      return
    }

    const verified = await verifyPaystackTransaction(reference)
    const expectedAmount = Number(transaction.amount_minor)
    const matches = verified.reference === reference &&
      verified.status === 'success' &&
      verified.amount === expectedAmount &&
      verified.currency === String(transaction.currency_code).trim() &&
      verified.gatewayMode === transaction.gateway_mode &&
      (verified.customerEmail ?? '').toLowerCase() === String(transaction.customer_email).toLowerCase()

    if (!matches) {
      const providerStatus = verified.status.toLowerCase()
      const mappedStatus = ['failed', 'abandoned', 'reversed'].includes(providerStatus)
        ? providerStatus
        : 'pending'
      await db.query(
        `UPDATE public.marketplace_payment_transactions
         SET status = $1, updated_at = NOW()
         WHERE transaction_id = $2 AND status <> 'success'`,
        [mappedStatus, transaction.id],
      )
      res.status(409).json({ error: 'Payment has not been confirmed with the expected amount, currency, account and environment. Your listing remains a draft.' })
      return
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const locked = await client.query(
        `SELECT status, amount_minor::text AS amount_minor, currency_code
         FROM public.marketplace_payment_transactions
         WHERE transaction_id = $1 AND user_id = $2
         FOR UPDATE`,
        [transaction.id, userId],
      )
      const current = locked.rows[0]
      if (!current) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Payment transaction not found.' })
        return
      }
      if (current.status !== 'success') {
        await client.query(
          `UPDATE public.marketplace_payment_transactions
           SET status = 'success', provider_transaction_id = $1,
               paid_at = COALESCE($2::timestamptz, NOW()),
               failure_message = NULL, updated_at = NOW()
           WHERE transaction_id = $3`,
          [verified.providerTransactionId, verified.paidAt, transaction.id],
        )
        await client.query(
          `INSERT INTO public.marketplace_payment_transaction_events
             (transaction_id, event_type, event_source, payload)
           VALUES ($1, 'payment.verified_success', 'api', $2::jsonb)`,
          [transaction.id, JSON.stringify({
            reference,
            amountMinor: verified.amount,
            currencyCode: verified.currency,
            gatewayMode: verified.gatewayMode,
            providerTransactionId: verified.providerTransactionId,
          })],
        )
      }

      const listing = await client.query(
        `SELECT status FROM public.marketplace_listings
         WHERE listing_id = $1 AND owner_user_id = $2
         FOR UPDATE`,
        [listingId, userId],
      )
      if (!listing.rows[0]) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'The listing no longer belongs to this account.' })
        return
      }
      await client.query(
        `UPDATE public.marketplace_listings
         SET listing_fee_paid_at = COALESCE(listing_fee_paid_at, NOW()),
             listing_fee_amount_minor = $1,
             listing_fee_currency = $2,
             listing_fee_transaction_id = $3,
             status = CASE WHEN status = 'draft' THEN 'pending_review' ELSE status END,
             updated_at = NOW()
         WHERE listing_id = $4 AND owner_user_id = $5`,
        [verified.amount, verified.currency, transaction.id, listingId, userId],
      )
      await client.query(
        `INSERT INTO public.marketplace_audit_logs
           (actor_user_id, action_key, target_type, target_id, details)
         VALUES ($1, 'listing.fee_paid_and_submitted', 'marketplace_listing', $2, $3::jsonb)`,
        [userId, listingId, JSON.stringify({ reference, amountMinor: verified.amount, currencyCode: verified.currency })],
      )
      await client.query('COMMIT')
      res.status(200).json({
        status: 'ok',
        paid: true,
        submitted: true,
        message: 'Payment confirmed. Your listing has been submitted for review.',
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Listing fee verification failed:', error instanceof Error ? error.message : 'Unknown error')
    res.status(503).json({ error: 'Payment verification is temporarily unavailable. Your listing has not been published.' })
  }
})

export default router
