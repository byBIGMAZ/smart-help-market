import { useCallback, useEffect, useRef, useState } from 'react'
import './AdminPaymentManagement.css'

type PaymentConfiguration = {
  enabled: boolean
  mode: 'test' | 'live'
  publicKey: string | null
  secretKeyConfigured: boolean
  webhookSecretConfigured: boolean
  currencyCode: string
  paymentChannels: string[]
  transactionSettings: { transactionExpiryMinutes: number; minimumAmount: number; maximumAmount: number }
  feeSettings: { feePayer: 'customer' | 'platform'; platformFeeEnabled: boolean; platformFeeType: 'fixed' | 'percentage'; platformFeeValue: number; agentCommissionEnabled: boolean; agentCommissionType: 'fixed' | 'percentage'; agentCommissionValue: number }
  escrowSettings: { enabled: boolean; holdingPeriodHours: number; automaticRelease: boolean }
  inspectionSettings: { enabled: boolean; requirePayment: boolean; bookingExpiryHours: number }
  updatedAt: string
}

const CHANNELS = [
  ['card', 'Cards'], ['bank', 'Bank'], ['ussd', 'USSD'],
  ['mobile_money', 'Mobile money'], ['bank_transfer', 'Bank transfer'],
] as const

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, credentials: 'include',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : `Payment request failed (HTTP ${response.status}).`
    throw new Error(message)
  }
  return data as T
}

function NumberField({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className="payment-field">{label}<input type="number" min={min} max={max} step="1" value={value} onChange={event => onChange(Number(event.target.value))} /></label>
}

export default function AdminPaymentManagement() {
  const [config, setConfig] = useState<PaymentConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [requestingCode, setRequestingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [credentialModalOpen, setCredentialModalOpen] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''))
  const [authorizationToken, setAuthorizationToken] = useState('')
  const [verified, setVerified] = useState(false)
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [credentialError, setCredentialError] = useState('')
  const [credentialMessage, setCredentialMessage] = useState('')
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api<{ configuration: PaymentConfiguration }>('/api/admin/payments/configuration')
      if (!result.configuration) throw new Error('Payment configuration has not been initialized. Run the payment database setup command.')
      setConfig(result.configuration)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load payment configuration.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const update = <K extends keyof PaymentConfiguration>(key: K, value: PaymentConfiguration[K]) => {
    setConfig(current => current ? { ...current, [key]: value } : current)
  }
  const updateNested = (key: 'transactionSettings' | 'feeSettings' | 'escrowSettings' | 'inspectionSettings', field: string, value: string | number | boolean) => {
    setConfig(current => current ? ({ ...current, [key]: { ...current[key], [field]: value } } as PaymentConfiguration) : current)
  }

  const saveConfiguration = async () => {
    if (!config) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await api<{ configuration: PaymentConfiguration }>('/api/admin/payments/configuration', 'PUT', config)
      setConfig(result.configuration)
      setMessage('Payment preferences saved. Live payment processing remains unavailable until gateway credentials and payment verification are implemented and tested.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save payment configuration.') }
    finally { setSaving(false) }
  }

  const resetCredentialDialog = () => {
    setCredentialModalOpen(false)
    setCodeSent(false)
    setOtpDigits(Array(6).fill(''))
    setAuthorizationToken('')
    setVerified(false)
    setSecretKey('')
    setWebhookSecret('')
    setCredentialError('')
    setCredentialMessage('')
  }

  const openCredentialDialog = () => {
    setCodeSent(false)
    setOtpDigits(Array(6).fill(''))
    setAuthorizationToken('')
    setVerified(false)
    setSecretKey('')
    setWebhookSecret('')
    setCredentialError('')
    setCredentialMessage('')
    setCredentialModalOpen(true)
  }

  const requestCode = async () => {
    setRequestingCode(true); setCredentialError(''); setCredentialMessage('')
    try {
      const result = await api<{ message: string }>('/api/admin/payments/credentials/request-code', 'POST', {})
      setCodeSent(true)
      setCredentialMessage(result.message)
      window.setTimeout(() => otpInputRefs.current[0]?.focus(), 50)
    } catch (err) { setCredentialError(err instanceof Error ? err.message : 'Unable to send verification code.') }
    finally { setRequestingCode(false) }
  }

  const verifyCode = async (completeCode: string) => {
    if (verifyingCode || completeCode.length !== 6) return
    setVerifyingCode(true); setCredentialError(''); setCredentialMessage('')
    try {
      const result = await api<{ authorizationToken: string; message: string }>('/api/admin/payments/credentials/verify-code', 'POST', { code: completeCode })
      setAuthorizationToken(result.authorizationToken)
      setVerified(true)
      setOtpDigits(Array(6).fill(''))
      setCredentialMessage(result.message)
    } catch (err) {
      setOtpDigits(Array(6).fill(''))
      setCredentialError(err instanceof Error ? err.message : 'The security code could not be verified.')
      window.setTimeout(() => otpInputRefs.current[0]?.focus(), 50)
    } finally { setVerifyingCode(false) }
  }

  const updateOtpDigit = (index: number, rawValue: string) => {
    const digit = rawValue.replace(/\\D/g, '').slice(-1)
    const next = [...otpDigits]
    next[index] = digit
    setOtpDigits(next)
    if (digit && index < 5) otpInputRefs.current[index + 1]?.focus()
    if (next.every(value => value !== '')) void verifyCode(next.join(''))
  }

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = Array(6).fill('')
    pasted.split('').forEach((digit, index) => { next[index] = digit })
    setOtpDigits(next)
    otpInputRefs.current[Math.min(pasted.length, 5)]?.focus()
    if (pasted.length === 6) void verifyCode(pasted)
  }

  const saveCredentials = async () => {
    if (!authorizationToken || (!secretKey.trim() && !webhookSecret.trim())) return
    setSaving(true); setCredentialError('')
    try {
      const result = await api<{ message: string }>('/api/admin/payments/credentials', 'PUT', { authorizationToken, secretKey, webhookSecret })
      resetCredentialDialog()
      await load()
      setMessage(result.message)
    } catch (err) { setCredentialError(err instanceof Error ? err.message : 'Unable to update credentials.') }
    finally { setSaving(false) }
  }

  if (loading) return <section className="admin-payment-workspace"><div className="admin-empty-panel">Loading secure payment configuration...</div></section>
  if (!config) return <section className="admin-payment-workspace"><div className="admin-error" role="alert">{error || 'Payment configuration unavailable.'}</div><button className="admin-secondary-button" onClick={() => void load()}>Retry</button></section>

  return (
    <section className="admin-payment-workspace">
      <header className="admin-section-heading">
        <div><span className="admin-kicker">SUPER ADMIN CONTROL</span><h2>Payments & Finance</h2><p className="admin-users-description">Configure the payment gateway and financial policies. Every change is enforced by protected server endpoints.</p></div>
        <span className="payment-status-chip">{config.secretKeyConfigured ? 'Secret key stored' : 'Gateway not configured'}</span>
      </header>
      {error && <div className="admin-error" role="alert">{error}</div>}
      {message && <div className="admin-message" role="status">{message}</div>}

      <div className="payment-panel">
        <div className="payment-panel-heading"><div><h3>Paystack Gateway</h3><p>Start in test mode. Live mode must only be enabled after server-side payment verification is ready.</p></div><span className="payment-provider-mark">PAYSTACK</span></div>
        <div className="payment-grid">
          <label className="payment-field">Gateway environment<select value={config.mode} onChange={e => update('mode', e.target.value as 'test' | 'live')}><option value="test">Test mode</option><option value="live">Live mode</option></select></label>
          <label className="payment-field">Default currency<input value={config.currencyCode} maxLength={3} onChange={e => update('currencyCode', e.target.value.toUpperCase())} /></label>
          <label className="payment-field payment-field-wide">Paystack public key<input value={config.publicKey || ''} autoComplete="off" placeholder={config.mode === 'test' ? 'pk_test_...' : 'pk_live_...'} onChange={e => update('publicKey', e.target.value)} /></label>
        </div>
        <div className="payment-credential-status"><span>{config.secretKeyConfigured ? '✓ Secret key is encrypted and stored' : '⚠ Secret key has not been configured'}</span><span>{config.webhookSecretConfigured ? '✓ Additional webhook secret is encrypted and stored' : 'Additional webhook secret not configured'}</span></div>
        <div className="payment-security-note"><strong>Protected credential change</strong><p>Secret values are never returned by the API or shown after saving. Changing payment credentials requires a fresh email code, automatic six-digit verification and a short-lived, single-use authorization. The Paystack secret key is used for webhook signature verification.</p></div>
        <div className="payment-change-credential">
          <div><strong>Payment credentials</strong><p>To replace the Paystack secret key or optional additional webhook secret, complete the protected email verification process.</p></div>
          <button className="admin-primary-button" type="button" onClick={openCredentialDialog}>Change Paystack Secret Key</button>
        </div>
        <label className="payment-toggle-row"><span><strong>Enable payment gateway</strong><small>Configuration switch only. Actual charges remain disabled until the complete transaction and webhook workflow is verified.</small></span><input type="checkbox" checked={config.enabled} onChange={e => update('enabled', e.target.checked)} /></label>
      </div>

      <div className="payment-panel">
        <h3>Accepted payment channels</h3><p>Choose which channels the marketplace intends to offer when the transaction workflow is activated.</p>
        <div className="payment-channel-grid">{CHANNELS.map(([key, label]) => <label key={key}><input type="checkbox" checked={config.paymentChannels.includes(key)} onChange={e => update('paymentChannels', e.target.checked ? [...config.paymentChannels, key] : config.paymentChannels.filter(item => item !== key))} />{label}</label>)}</div>
        <div className="payment-grid">
          <NumberField label="Payment expiry (minutes)" value={config.transactionSettings.transactionExpiryMinutes} min={5} max={1440} onChange={v => updateNested('transactionSettings','transactionExpiryMinutes',v)} />
          <NumberField label="Minimum transaction amount" value={config.transactionSettings.minimumAmount} min={1} onChange={v => updateNested('transactionSettings','minimumAmount',v)} />
          <NumberField label="Maximum transaction amount" value={config.transactionSettings.maximumAmount} min={1} onChange={v => updateNested('transactionSettings','maximumAmount',v)} />
        </div>
      </div>

      <div className="payment-panel">
        <h3>Platform fees & agent commissions</h3>
        <div className="payment-grid">
          <label className="payment-field">Who pays gateway/platform fees<select value={config.feeSettings.feePayer} onChange={e => updateNested('feeSettings','feePayer',e.target.value)}><option value="customer">Customer</option><option value="platform">Platform</option></select></label>
          <label className="payment-field">Platform fee type<select value={config.feeSettings.platformFeeType} onChange={e => updateNested('feeSettings','platformFeeType',e.target.value)}><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label>
          <NumberField label="Platform fee value" value={config.feeSettings.platformFeeValue} onChange={v => updateNested('feeSettings','platformFeeValue',v)} />
          <label className="payment-field">Agent commission type<select value={config.feeSettings.agentCommissionType} onChange={e => updateNested('feeSettings','agentCommissionType',e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
          <NumberField label="Agent commission value" value={config.feeSettings.agentCommissionValue} onChange={v => updateNested('feeSettings','agentCommissionValue',v)} />
        </div>
        <label className="payment-toggle-row"><span><strong>Enable platform fee</strong><small>Fee calculation and collection still require a tested checkout workflow.</small></span><input type="checkbox" checked={config.feeSettings.platformFeeEnabled} onChange={e => updateNested('feeSettings','platformFeeEnabled',e.target.checked)} /></label>
        <label className="payment-toggle-row"><span><strong>Enable agent commission</strong><small>Commission settlement will be connected to verified transactions.</small></span><input type="checkbox" checked={config.feeSettings.agentCommissionEnabled} onChange={e => updateNested('feeSettings','agentCommissionEnabled',e.target.checked)} /></label>
      </div>

      <div className="payment-panel">
        <h3>Escrow & inspection policies</h3>
        <p>These are administrative policy preferences. Do not accept customer funds until the escrow ledger, refund, dispute and release workflows are implemented.</p>
        <label className="payment-toggle-row"><span><strong>Enable escrow policy</strong><small>Controls the intended escrow workflow.</small></span><input type="checkbox" checked={config.escrowSettings.enabled} onChange={e => updateNested('escrowSettings','enabled',e.target.checked)} /></label>
        <div className="payment-grid"><NumberField label="Escrow holding period (hours)" value={config.escrowSettings.holdingPeriodHours} min={1} max={8760} onChange={v => updateNested('escrowSettings','holdingPeriodHours',v)} /></div>
        <label className="payment-toggle-row"><span><strong>Automatic escrow release</strong><small>Keep off until the dispute and release safeguards are complete.</small></span><input type="checkbox" checked={config.escrowSettings.automaticRelease} onChange={e => updateNested('escrowSettings','automaticRelease',e.target.checked)} /></label>
        <label className="payment-toggle-row"><span><strong>Enable paid inspections</strong><small>Inspection booking/payment preferences.</small></span><input type="checkbox" checked={config.inspectionSettings.enabled} onChange={e => updateNested('inspectionSettings','enabled',e.target.checked)} /></label>
        <label className="payment-toggle-row"><span><strong>Require inspection payment</strong><small>Require payment before inspection booking confirmation.</small></span><input type="checkbox" checked={config.inspectionSettings.requirePayment} onChange={e => updateNested('inspectionSettings','requirePayment',e.target.checked)} /></label>
        <div className="payment-grid"><NumberField label="Inspection booking expiry (hours)" value={config.inspectionSettings.bookingExpiryHours} min={1} max={720} onChange={v => updateNested('inspectionSettings','bookingExpiryHours',v)} /></div>
      </div>
      <div className="payment-save-bar"><span>Changes to payment preferences are saved together.</span><button className="admin-primary-button" type="button" disabled={saving} onClick={() => void saveConfiguration()}>{saving ? 'Saving...' : 'Save payment configuration'}</button></div>

      {credentialModalOpen && (
        <div className="payment-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving && !verifyingCode) resetCredentialDialog() }}>
          <section className="payment-credential-modal" role="dialog" aria-modal="true" aria-labelledby="payment-credential-modal-title">
            <div className="payment-modal-heading">
              <div><span className="payment-modal-kicker">SUPER ADMIN SECURITY CHECK</span><h3 id="payment-credential-modal-title">Change Paystack Secret Key</h3></div>
              <button type="button" className="payment-modal-close" aria-label="Close dialog" disabled={saving || verifyingCode} onClick={resetCredentialDialog}>×</button>
            </div>
            <div className="payment-danger-warning" role="alert">
              <strong>Security warning: sensitive payment credentials</strong>
              <p>You are about to change credentials that control access to marketplace payments. Never share your Paystack secret key or email verification code. Only continue if you initiated this change.</p>
            </div>

            {!verified ? (
              <div className="payment-modal-step">
                <p className="payment-modal-instruction">We will send a one-time six-digit code to the registered Super Admin email address. The code expires after 10 minutes and can only be used once.</p>
                {!codeSent ? (
                  <button className="admin-primary-button payment-send-code-button" type="button" disabled={requestingCode} onClick={() => void requestCode()}>{requestingCode ? 'Sending secure code...' : 'Send verification code to my email'}</button>
                ) : (
                  <>
                    <label className="payment-otp-label">Enter the six-digit security code</label>
                    <div className="payment-otp-boxes" aria-label="Six-digit email verification code">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={element => { otpInputRefs.current[index] = element }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? 'one-time-code' : 'off'}
                          pattern="[0-9]*"
                          maxLength={1}
                          aria-label={`Verification digit ${index + 1}`}
                          value={digit}
                          disabled={verifyingCode}
                          onChange={event => updateOtpDigit(index, event.target.value)}
                          onPaste={handleOtpPaste}
                          onKeyDown={event => {
                            if (event.key === 'Backspace' && !otpDigits[index] && index > 0) otpInputRefs.current[index - 1]?.focus()
                            if (event.key === 'ArrowLeft' && index > 0) otpInputRefs.current[index - 1]?.focus()
                            if (event.key === 'ArrowRight' && index < 5) otpInputRefs.current[index + 1]?.focus()
                          }}
                        />
                      ))}
                    </div>
                    <p className="payment-otp-hint">{verifyingCode ? 'Verifying code securely...' : 'Verification starts automatically when the sixth digit is entered. You can also paste the complete code.'}</p>
                    <button className="payment-resend-code" type="button" disabled={requestingCode} onClick={() => void requestCode()}>{requestingCode ? 'Sending...' : 'Resend code'}</button>
                  </>
                )}
              </div>
            ) : (
              <div className="payment-modal-step">
                <div className="payment-verified-banner"><span>✓</span><div><strong>Email verification successful</strong><small>Your one-time code has been cleared. Enter the new credentials below.</small></div></div>
                <label className="payment-field">New Paystack secret key<input type="password" autoComplete="new-password" value={secretKey} placeholder={config.mode === 'test' ? 'sk_test_...' : 'sk_live_...'} onChange={event => setSecretKey(event.target.value)} /></label>
                <label className="payment-field">Additional webhook signing secret (optional)<input type="password" autoComplete="new-password" value={webhookSecret} placeholder="Optional additional signing secret" onChange={event => setWebhookSecret(event.target.value)} /></label>
                <p className="payment-modal-instruction">The new values are encrypted before storage. They will never be displayed or returned by the backend.</p>
                <button className="admin-primary-button payment-save-credentials-button" type="button" disabled={saving || (!secretKey.trim() && !webhookSecret.trim())} onClick={() => void saveCredentials()}>{saving ? 'Encrypting and saving...' : 'Save new payment credentials'}</button>
              </div>
            )}
            {credentialError && <div className="payment-modal-error" role="alert">{credentialError}</div>}
            {credentialMessage && <div className="payment-modal-message" role="status">{credentialMessage}</div>}
          </section>
        </div>
      )}
    </section>
  )
}
