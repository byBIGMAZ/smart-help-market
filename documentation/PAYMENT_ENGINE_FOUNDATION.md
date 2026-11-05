# Payment Engine Foundation

## Current scope

This milestone adds the central transaction ledger and the server-side Paystack adapter. It does not expose a public checkout endpoint yet.

The checkout endpoint must only be connected after a marketplace workflow can calculate the payable amount on the server. A browser must never be allowed to choose or override the amount that Paystack receives.

## Database setup

Run from the backend directory:

```bash
npm run setup:payment-engine
```

The setup is safe to rerun. It creates:

- `marketplace_payment_transactions`: authoritative transaction records, gateway environment, amount in minor currency units, purpose, status, expiry and idempotency key.
- `marketplace_payment_transaction_events`: append-only event history for API, webhook and admin-originated events.

## Paystack adapter

`src/payments/paystack.ts` provides:

- `initializePaystackTransaction`: decrypts the Super Admin-managed credential server-side and initializes a Paystack transaction.
- `verifyPaystackTransaction`: verifies a reference server-side and checks the Paystack environment.

The adapter rejects disabled gateways, missing or mismatched credentials, invalid amounts, invalid references and environment mismatches. The secret key is never returned to the frontend.

## Important integration boundary

No public payment initialization route is enabled in this milestone. Before one is added, each payment purpose must have a server-owned payable record or calculation. Examples include a listing fee attached to a listing draft, an order calculated from a server-side cart, a service booking, or an inspection booking. Do not accept a client-supplied amount as authoritative.

Live mode must remain disabled until callback verification, webhook signature verification, idempotency, amount/currency matching, and fulfillment rules are implemented and tested.

## Super Admin listing-fee policy

The payment configuration now includes `listing_fee_settings` with:

- `enabled`: whether listing publication is intended to require a fee.
- `propertyFee`, `productFee`, and `serviceFee`: integer amounts in the configured payment currency's major unit.

These values are editable only through the Super Admin payment configuration endpoint, which validates them server-side and records the configuration change in the audit log. This is currently a policy/configuration control only. It does not charge users or block listing publication until the listing checkout and publication workflow is implemented.
