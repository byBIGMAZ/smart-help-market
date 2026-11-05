# Secure Paystack administration setup

The payment administration workspace is restricted to the existing Super Admin role. Payment credentials are stored separately from ordinary platform settings and are never returned by the API.

## Required backend environment variables

Configure these as Codespaces secrets during development and as deployment secrets in production:

- `RESEND_API_KEY`: Resend API key with permission to send transactional email.
- `PAYMENT_OTP_FROM`: sender identity on a domain verified in Resend, for example `SMART HELP MARKET <security@your-verified-domain.example>`.
- `PAYMENT_CREDENTIALS_ENCRYPTION_KEY`: a base64-encoded 32-byte key used for AES-256-GCM encryption at rest.
- `PAYMENT_OTP_PEPPER`: a random secret of at least 32 characters used to hash one-time codes.

Generate the encryption key locally in a terminal:

```bash
openssl rand -base64 32
```

Generate the OTP pepper:

```bash
openssl rand -hex 32
```

Add the generated values directly to Codespaces Secrets or your production secret manager. Do not paste them into chat, source files, GitHub commits, screenshots, or browser developer tools. Do not rotate the encryption key without first implementing a controlled re-encryption migration for stored credentials.

## Resend setup

1. Create or sign in to the Resend account.
2. Add and verify a domain you control.
3. Create an API key with email sending permission.
4. Add the API key as `RESEND_API_KEY`.
5. Add the verified sender as `PAYMENT_OTP_FROM`.
6. Ensure the Super Admin marketplace account has access to its registered email address.

## Database setup

From the Codespaces terminal:

```bash
cd /workspaces/smart-help-market/backend
npm run setup:payments
```

Expected output includes:

```
PAYMENT MANAGEMENT DATABASE SETUP COMPLETED
Verified public.marketplace_payment_configuration
Verified public.marketplace_payment_credential_otps
Paystack configuration initialized in disabled test mode. No credentials have been added.
```

## Payment safety status

This phase creates the Super Admin configuration and protected credential storage. It does not yet implement customer checkout, transaction initialization, Paystack callback verification, signed webhook processing, refunds, settlement reconciliation, or the escrow ledger. The gateway must remain disabled for customer transactions until those workflows are implemented and tested. Configuration switches for fees, escrow and inspections are policy values only at this stage.
