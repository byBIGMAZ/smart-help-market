# Listing Fee Submission and Payment Workflow

## Scope

This milestone connects the Super Admin listing fee policy to owner listing submission for the three supported listing kinds: properties, products and services.

The workflow uses the saved server-side policy. The browser never supplies the payable amount. A successful Paystack redirect is not trusted as proof of payment; the backend verifies the transaction with Paystack before recording payment and submitting the listing for moderation.

## Owner workflow

1. An owner saves a listing as a draft.
2. In Owner Centre, the owner selects the draft and chooses **Submit for review**.
3. The backend reads the listing kind and the matching fee from `marketplace_payment_configuration.listing_fee_settings`.
4. If the policy is disabled or the applicable fee is zero, the backend moves the draft to `pending_review`.
5. If a fee is due, the backend creates a `listing_fee` transaction and initializes Paystack using the server-calculated amount.
6. The owner completes checkout on Paystack.
7. Paystack redirects to Owner Centre. The frontend sends the reference to the backend verification endpoint.
8. The backend checks the provider status, reference, exact amount, currency, customer email and test/live environment.
9. In one database transaction, the backend marks the payment successful, records its event, records the listing fee payment snapshot and moves the listing to `pending_review`.
10. Moderators still approve and publish the listing through the existing moderation workflow.

## Backend routes

Mounted under `/api/listings`:

- `POST /owner/:listingId/submit`: submit a draft or initialize/reuse its listing fee checkout.
- `POST /owner/:listingId/verify-payment`: verify a Paystack reference belonging to the authenticated owner and that listing.

Both routes require an authenticated marketplace session. Listing ownership is checked server-side.

## Database changes

Run `npm run setup:listing-fee-payments` from the backend directory after the payment engine tables have been created.

The idempotent migration adds to `marketplace_listings`:

- `listing_fee_paid_at`
- `listing_fee_amount_minor`
- `listing_fee_currency`
- `listing_fee_transaction_id`, linked to `marketplace_payment_transactions`

Existing listings are preserved. The migration does not create transactions or charge anyone.

## Environment configuration

The backend needs `FRONTEND_ORIGIN` set to the exact frontend origin used by the running application. It is used to construct the Paystack callback URL. Use HTTPS for deployed environments. For local development, localhost is accepted.

The Paystack secret key remains encrypted in the database. The frontend never receives it.

## Security and consistency controls

- The payable amount comes from the server-side listing fee configuration.
- Currency minor-unit conversion is performed on the backend.
- The owner can only submit and verify payments for their own listing.
- Only drafts can start submission.
- An active fee checkout prevents edits to that draft, protecting the fee snapshot from a listing-kind change.
- Active checkout transactions are reused rather than creating a new charge for every click.
- New attempts receive unique idempotency keys and provider references.
- Payment verification checks the transaction against the saved database snapshot.
- Successful payment and listing submission are committed together.
- A successful payment does not automatically publish a listing.
- Pausing the gateway does not prevent verification of an already initialized transaction, provided its saved environment and credential remain configured.
- The Super Admin cannot switch test/live mode while active transactions in the other environment are awaiting completion or verification.

## Current limitations

- This milestone uses the server-side Paystack Verify Transaction API when the owner returns from checkout.
- A signed Paystack webhook receiver, reconciliation, refunds, chargebacks and transaction history UI are separate follow-up work.
- Live payments must remain disabled until the complete payment lifecycle has been tested and approved.
