import { useCallback, useEffect, useState } from 'react'
import './AdminSettingsManagement.css'
import {
  getAdminSettings,
  updateAdminSetting,
  type AdminPlatformSetting,
} from './services/adminSettings'

type ContactPolicy = {
  enabled: boolean
  blockPhoneNumbers: boolean
  blockEmails: boolean
  blockExternalLinks: boolean
  blockSocialHandles: boolean
  blockOffPlatformRequests: boolean
}

const CONTACT_POLICY_FIELDS: Array<{
  key: keyof Omit<ContactPolicy, 'enabled'>
  label: string
  help: string
}> = [
  { key: 'blockPhoneNumbers', label: 'Block phone numbers', help: 'Prevent phone numbers from being shared in marketplace messages.' },
  { key: 'blockEmails', label: 'Block email addresses', help: 'Keep email communication inside the marketplace.' },
  { key: 'blockExternalLinks', label: 'Block external links', help: 'Prevent users from sharing external website links.' },
  { key: 'blockSocialHandles', label: 'Block social media handles', help: 'Prevent social media handles and external messaging platform names.' },
  { key: 'blockOffPlatformRequests', label: 'Block off-platform requests', help: 'Prevent requests asking users to continue conversations outside the marketplace.' },
]

const SETTING_LABELS: Record<string, string> = {
  'platform.name': 'Marketplace name',
  'platform.currency': 'Default currency',
  'platform.locale': 'Regional locale',
  'platform.timezone': 'System timezone',
  'communication.contact_policy': 'Contact-sharing protection',
  'help.assistant.enabled': 'SMART HELP assistant',
  'help.ai.engine_name': 'Intelligence engine name',
  'help.ai.learning_enabled': 'Adaptive learning',
  'help.ai.feedback_enabled': 'Response feedback',
  'help.messages.free_limit': 'Free monthly messages',
  'geo.enabled': 'Geographic lookup',
  'geo.provider': 'Location lookup provider',
  'geo.country_code': 'Default country code',
  'geo.cache_ttl_hours': 'Geocoding cache lifetime (hours)',
  'geo.max_results': 'Maximum location results',
}

const SETTING_HELP: Record<string, string> = {
  'platform.name': 'The name displayed across the public marketplace.',
  'platform.currency': 'The default currency used for marketplace prices.',
  'platform.locale': 'The regional language and formatting configuration.',
  'platform.timezone': 'The timezone used for marketplace date and time operations.',
  'communication.contact_policy': 'Choose which contact-sharing patterns are restricted by server-side message validation.',
  'help.assistant.enabled': 'Enable or disable the built-in assistant for signed-in users.',
  'help.ai.engine_name': 'The display name of the built-in marketplace intelligence engine.',
  'help.ai.learning_enabled': 'Allow the built-in engine to improve phrase weights from explicit user corrections.',
  'help.ai.feedback_enabled': 'Allow users to rate assistant responses and submit corrections.',
  'help.messages.free_limit': 'Monthly assistant message allowance per user. Zero means unlimited free use.',
  'geo.enabled': 'Enable server-side location lookup. Configure the GEOCODING_USER_AGENT server environment variable before enabling this feature.',
  'geo.provider': 'Only the Nominatim OpenStreetMap provider is currently implemented. Provider credentials and contact details must remain in server environment configuration.',
  'geo.country_code': 'Restrict location lookup results to a two-letter country code, such as ng.',
  'geo.cache_ttl_hours': 'How many hours successful location lookup results remain cached.',
  'geo.max_results': 'Maximum number of location matches returned by the provider. The current provider supports up to five.',
}

const GROUP_LABELS: Record<string, string> = {
  branding: 'Branding',
  regional: 'Regional preferences',
  communication: 'Contact & communication protection',
  help_centre: 'SMART HELP Centre & BIGMAZ Intelligence',
  help: 'SMART HELP Centre & BIGMAZ Intelligence',
  geography: 'Location & Geographic Intelligence',
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function parseContactPolicy(value: unknown): ContactPolicy {
  let candidate = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { candidate = null }
  }
  const data = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {}
  return {
    enabled: data.enabled !== false,
    blockPhoneNumbers: data.blockPhoneNumbers !== false,
    blockEmails: data.blockEmails !== false,
    blockExternalLinks: data.blockExternalLinks !== false,
    blockSocialHandles: data.blockSocialHandles !== false,
    blockOffPlatformRequests: data.blockOffPlatformRequests !== false,
  }
}

function ToggleControl({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      className={`admin-setting-switch ${checked ? 'is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="admin-setting-switch-thumb" />
      <span className="admin-setting-switch-label">{checked ? 'On' : 'Off'}</span>
    </button>
  )
}

export default function AdminSettingsManagement() {
  const [settings, setSettings] = useState<AdminPlatformSetting[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const fetchSettings = useCallback(async () => {
    const response = await getAdminSettings()
    const nextValues: Record<string, string> = {}
    response.settings.forEach((setting) => {
      nextValues[setting.key] = displayValue(setting.value)
    })
    return { settings: response.settings, values: nextValues }
  }, [])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchSettings()
      setSettings(result.settings)
      setValues(result.values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marketplace settings.')
    } finally {
      setLoading(false)
    }
  }, [fetchSettings])

  useEffect(() => {
    let active = true
    fetchSettings()
      .then((result) => {
        if (active) {
          setSettings(result.settings)
          setValues(result.values)
          setError('')
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load marketplace settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [fetchSettings])

  const applySavedSetting = (updated: AdminPlatformSetting) => {
    setSettings((current) => current.map((item) => item.key === updated.key ? updated : item))
    setValues((current) => ({ ...current, [updated.key]: displayValue(updated.value) }))
  }

  const saveSetting = async (key: string, value: unknown) => {
    setSavingKey(key)
    setError('')
    setNotice('')
    try {
      const response = await updateAdminSetting(key, value)
      applySavedSetting(response.setting)
      setNotice(response.message || 'Setting updated successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update this setting.')
    } finally {
      setSavingKey(null)
    }
  }

  const handleTextSave = async (setting: AdminPlatformSetting) => {
    const value = values[setting.key]?.trim() ?? ''
    if (!value) {
      setError(`${SETTING_LABELS[setting.key] || setting.key} cannot be empty.`)
      setNotice('')
      return
    }
    if (setting.key === 'help.messages.free_limit') {
      const numericValue = Number(value)
      if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
        setError('The monthly message limit must be a non-negative whole number.')
        setNotice('')
        return
      }
      await saveSetting(setting.key, numericValue)
      return
    }
    await saveSetting(setting.key, value)
  }

  const handleBooleanToggle = async (setting: AdminPlatformSetting) => {
    const current = setting.value === true || setting.value === 'true'
    await saveSetting(setting.key, !current)
  }

  const handleContactPolicyToggle = async (
    setting: AdminPlatformSetting,
    field: keyof ContactPolicy,
  ) => {
    const policy = parseContactPolicy(setting.value)
    await saveSetting(setting.key, { ...policy, [field]: !policy[field] })
  }

  const groupedSettings = settings.reduce<Record<string, AdminPlatformSetting[]>>((groups, setting) => {
    const group = setting.group || 'other'
    groups[group] = [...(groups[group] || []), setting]
    return groups
  }, {})

  if (loading) {
    return <section className="admin-settings-section"><div className="admin-empty-panel">Loading marketplace settings...</div></section>
  }

  return (
    <section className="admin-settings-section">
      <div className="admin-section-heading">
        <div>
          <h2><span className="admin-animated-gear admin-settings-heading-gear" aria-hidden="true">⚙</span> Marketplace Settings</h2>
          <p className="admin-users-description">Manage marketplace identity, regional preferences, communication protection and built-in services.</p>
        </div>
        <button type="button" className="admin-secondary-button" onClick={() => void loadSettings()} disabled={savingKey !== null}>Refresh Settings</button>
      </div>

      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-message" role="status">{notice}</div>}

      {settings.length === 0 && (
        <div className="admin-empty-panel">
          <h3>No platform settings are registered</h3>
          <p>Run the platform and feature setup scripts to register supported settings. No configuration has been changed.</p>
        </div>
      )}

      {Object.entries(groupedSettings).map(([group, groupSettings]) => (
        <div className="admin-settings-group" key={group}>
          <div className="admin-settings-group-heading">
            <div>
              <h3>{GROUP_LABELS[group] || group.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</h3>
              <p>Configure the settings registered for this part of the marketplace.</p>
            </div>
          </div>

          {groupSettings.map((setting) => {
            const label = SETTING_LABELS[setting.key] || setting.key.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
            const help = SETTING_HELP[setting.key] || setting.description || 'This setting is registered by the platform.'
            const isContactPolicy = setting.key === 'communication.contact_policy'
            const isBoolean = typeof setting.value === 'boolean' || setting.value === 'true' || setting.value === 'false'
            const policy = isContactPolicy ? parseContactPolicy(setting.value) : null
            const isNumber = typeof setting.value === 'number' || setting.key === 'help.messages.free_limit'
            const isProvider = setting.key === 'geo.provider'
            const isReadOnlyObject = typeof setting.value === 'object' && setting.value !== null && !isContactPolicy

            return (
              <div className="admin-setting-item" key={setting.key}>
                <div className="admin-setting-information">
                  <label>{label}</label>
                  <p>{help}</p>
                  <span className="admin-setting-visibility">{setting.isPublic ? 'Public setting' : 'Private administrator setting'}</span>
                </div>

                <div className="admin-setting-control">
                  {isContactPolicy && policy ? (
                    <div className="admin-setting-policy-controls">
                      <div className="admin-setting-policy-master">
                        <div><strong>Contact restrictions</strong><small>Master control for all contact-sharing restrictions.</small></div>
                        <ToggleControl
                          checked={policy.enabled}
                          disabled={savingKey !== null}
                          label="Enable contact-sharing restrictions"
                          onChange={() => void handleContactPolicyToggle(setting, 'enabled')}
                        />
                      </div>
                      {CONTACT_POLICY_FIELDS.map((field) => (
                        <div className="admin-setting-policy-row" key={field.key}>
                          <div><strong>{field.label}</strong><small>{field.help}</small></div>
                          <ToggleControl
                            checked={policy[field.key]}
                            disabled={savingKey !== null || !policy.enabled}
                            label={field.label}
                            onChange={() => void handleContactPolicyToggle(setting, field.key)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : isBoolean ? (
                    <ToggleControl
                      checked={setting.value === true || setting.value === 'true'}
                      disabled={savingKey !== null}
                      label={label}
                      onChange={() => void handleBooleanToggle(setting)}
                    />
                  ) : isReadOnlyObject ? (
                    <div className="admin-setting-readonly">Managed by the relevant platform module. Raw configuration is not editable here.</div>
                  ) : isProvider ? (
                    <>
                      <select
                        id={`setting-${setting.key}`}
                        value={values[setting.key] ?? 'nominatim'}
                        onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))}
                        disabled={savingKey !== null}
                      >
                        <option value="nominatim">Nominatim (OpenStreetMap)</option>
                      </select>
                      <button type="button" className="admin-primary-button" onClick={() => void handleTextSave(setting)} disabled={savingKey !== null || values[setting.key] === displayValue(setting.value)}>
                        {savingKey === setting.key ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        id={`setting-${setting.key}`}
                        type={isNumber ? 'number' : 'text'}
                        min={isNumber ? (setting.key === 'geo.max_results' || setting.key === 'geo.cache_ttl_hours' ? 1 : 0) : undefined}
                        max={setting.key === 'geo.max_results' ? 5 : setting.key === 'geo.cache_ttl_hours' ? 8760 : undefined}
                        step={isNumber ? 1 : undefined}
                        value={values[setting.key] ?? ''}
                        onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))}
                        disabled={savingKey !== null}
                        maxLength={200}
                      />
                      <button
                        type="button"
                        className="admin-primary-button"
                        onClick={() => void handleTextSave(setting)}
                        disabled={savingKey !== null || values[setting.key] === displayValue(setting.value)}
                      >
                        {savingKey === setting.key ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div className="admin-settings-note">
        <strong>Configuration protection</strong>
        <p>Settings are loaded from the platform configuration database. Switches save immediately through the protected API. Feature-specific controls continue to use their dedicated server-side management pages.</p>
      </div>
    </section>
  )
}
