import { useCallback, useEffect, useState } from 'react'
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
  const [code, setCode] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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

  const requestCode = async () => {
    setRequestingCode(true); setError(''); setMessage('')
    try {
      const result = await api<{ message: string }>('/api/admin/payments/credentials/request-code', 'POST', {})
      setMessage(result.message)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to send verification code.') }
    finally { setRequestingCode(false) }
  }

  const saveCredentials = async () => {
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await api<{ message: string }>('/api/admin/payments/credentials', 'PUT', { code, secretKey, webhookSecret })
      setMessage(result.message)
      setCode(''); setSecretKey(''); setWebhookSecret('')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update credentials.') }
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
        <div className="payment-credential-status"><span>{config.secretKeyConfigured ? '✓ Secret key is encrypted and stored' : '⚠ Secret key has not been configured'}</span><span>{config.webhookSecretConfigured ? '✓ Webhook secret is encrypted and stored' : 'Webhook secret not configured'}</span></div>
        <div className="payment-security-note"><strong>Protected credential change</strong><p>Secret values are never returned by the API or shown after saving. Paystack webhook signatures are verified using the Paystack secret key. Request a one-time code to the registered Super Admin email, then enter the new credentials. Codes expire after 10 minutes and are single-use.</p></div>
        <div className="payment-credential-form">
          <label className="payment-field">New Paystack secret key<input type="password" autoComplete="new-password" value={secretKey} placeholder="Paste secret key. It will not be shown again." onChange={e => setSecretKey(e.target.value)} /></label>
          <label className="payment-field">Additional webhook signing secret (optional)<input type="password" autoComplete="new-password" value={webhookSecret} placeholder="Optional additional signing secret" onChange={e => setWebhookSecret(e.target.value)} /></label>
          <div className="payment-otp-row"><label className="payment-field">Email verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} placeholder="6-digit code" onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button className="admin-secondary-button" type="button" disabled={requestingCode} onClick={() => void requestCode()}>{requestingCode ? 'Sending...' : 'Email me a code'}</button></div>
          <button className="admin-primary-button" type="button" disabled={saving || code.length !== 6 || (!secretKey.trim() && !webhookSecret.trim())} onClick={() => void saveCredentials()}>{saving ? 'Securing credentials...' : 'Verify code & save credentials'}</button>
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
    </section>
  )
}
