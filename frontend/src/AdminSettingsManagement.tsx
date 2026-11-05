import { useCallback, useEffect, useState } from 'react'
import './AdminSettingsManagement.css'
import {
  getAdminSettings,
  updateAdminSetting,
  type AdminPlatformSetting,
} from './services/adminSettings'

type EditableSettingKey =
  | 'platform.name'
  | 'platform.currency'
  | 'platform.locale'
  | 'platform.timezone'
  | 'communication.contact_policy'
  | 'help.assistant.enabled'
  | 'help.ai.learning_enabled'
  | 'help.ai.feedback_enabled'
  | 'help.messages.free_limit'
  | 'help.messages.pack_size'
  | 'help.messages.pack_price_ngn'

const SETTING_LABELS: Record<EditableSettingKey, string> = {
  'platform.name': 'Marketplace Name',
  'platform.currency': 'Default Currency',
  'platform.locale': 'Regional Locale',
  'platform.timezone': 'System Timezone',
  'communication.contact_policy': 'In-App Contact Restrictions',
  'help.assistant.enabled': 'Help Assistant Enabled',
  'help.ai.learning_enabled': 'Adaptive Learning Enabled',
  'help.ai.feedback_enabled': 'Response Feedback Enabled',
  'help.messages.free_limit': 'Included Monthly Messages',
  'help.messages.pack_size': 'Paid Package Message Quantity',
  'help.messages.pack_price_ngn': 'Paid Package Price (NGN)',
}

const SETTING_HELP: Record<EditableSettingKey, string> = {
  'platform.name': 'The name displayed across the marketplace.',
  'platform.currency': 'The default currency used for marketplace prices.',
  'platform.locale': 'The regional language and formatting configuration.',
  'platform.timezone': 'The timezone used for platform date and time operations.',
  'communication.contact_policy': 'Configure phone, email, external link, social handle and off-platform contact restrictions using the JSON policy.',
  'help.assistant.enabled': 'Turn the SMART HELP assistant on or off for signed-in users.',
  'help.ai.learning_enabled': 'Allow BIGMAZ AI to update bounded intent weights from explicit user corrections. Disable this to pause adaptive model updates.',
  'help.ai.feedback_enabled': 'Allow users to rate assistant responses and submit corrections.',
  'help.messages.free_limit': 'Number of assistant messages each user receives per calendar month before the usage limit is reached.',
  'help.messages.pack_size': 'Number of additional assistant messages in a future paid package.',
  'help.messages.pack_price_ngn': 'Proposed package price in Nigerian Naira. This is configuration only until payment processing is integrated.',
}

function getStringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
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

  response.settings.forEach(setting => {
    nextValues[setting.key] = getStringValue(setting.value)
  })

  return {
    settings: response.settings,
    values: nextValues,
  }
}, [])

const loadSettings = useCallback(async () => {
  setLoading(true)
  setError('')

  try {
    const result = await fetchSettings()

    setSettings(result.settings)
    setValues(result.values)
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to load marketplace settings.',
    )
  } finally {
    setLoading(false)
  }
}, [fetchSettings])

useEffect(() => {
  let active = true

  fetchSettings()
    .then(result => {
      if (active) {
        setSettings(result.settings)
        setValues(result.values)
        setError('')
      }
    })
    .catch(err => {
      if (active) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load marketplace settings.',
        )
      }
    })
    .finally(() => {
      if (active) {
        setLoading(false)
      }
    })

  return () => {
    active = false
  }
}, [fetchSettings])

  const handleValueChange = (key: string, value: string) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))

    setNotice('')
  }

  const handleSave = async (key: EditableSettingKey) => {
    const value = values[key]?.trim()

    if (!value) {
      setError(`${SETTING_LABELS[key]} cannot be empty.`)
      setNotice('')
      return
    }

    setSavingKey(key)
    setError('')
    setNotice('')

    try {
      let settingValue: unknown = value
      if (key === 'help.assistant.enabled' || key === 'help.ai.learning_enabled' || key === 'help.ai.feedback_enabled') {
        if (value !== 'true' && value !== 'false') {
          setError('Choose true or false for this setting.')
          setNotice('')
          return
        }
        settingValue = value === 'true'
      } else if (key.startsWith('help.messages.')) {
        const numericValue = Number(value)
        if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
          setError('Help Centre message and price settings must be non-negative whole numbers.')
          setNotice('')
          return
        }
        settingValue = numericValue
      }
      const response = await updateAdminSetting(key, settingValue)

      setSettings((current) =>
        current.map((setting) =>
          setting.key === key ? response.setting : setting,
        ),
      )

      setValues((current) => ({
        ...current,
        [key]: getStringValue(response.setting.value),
      }))

      setNotice(response.message || 'Setting updated successfully.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to update this setting.',
      )
    } finally {
      setSavingKey(null)
    }
  }

  const getSetting = (key: EditableSettingKey) =>
    settings.find((setting) => setting.key === key)

  if (loading) {
    return (
      <section className="admin-settings-section">
        <div className="admin-empty-panel">
          Loading marketplace settings...
        </div>
      </section>
    )
  }

  return (
    <section className="admin-settings-section">
      <div className="admin-section-heading">
        <div>
          <h2><span className="admin-animated-gear admin-settings-heading-gear" aria-hidden="true">⚙</span> Marketplace Settings</h2>
          <p className="admin-users-description">
            Manage the identity and regional configuration of the
            marketplace.
          </p>
        </div>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => void loadSettings()}
          disabled={savingKey !== null}
        >
          Refresh Settings
        </button>
      </div>

      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="admin-message" role="status">
          {notice}
        </div>
      )}

      <div className="admin-settings-group">
        <div className="admin-settings-group-heading">
          <div>
            <h3>Branding Configuration</h3>
            <p>
              Control the name and identity displayed across the
              marketplace.
            </p>
          </div>
        </div>

        {(['platform.name'] as EditableSettingKey[]).map((key) => {
          const setting = getSetting(key)

          if (!setting) return null

          return (
            <div className="admin-setting-item" key={key}>
              <div className="admin-setting-information">
                <label htmlFor={`setting-${key}`}>
                  {SETTING_LABELS[key]}
                </label>

                <p>{SETTING_HELP[key]}</p>

                <span className="admin-setting-visibility">
                  {setting.isPublic ? 'Public setting' : 'Private setting'}
                </span>
              </div>

              <div className="admin-setting-control">
                <input
                  id={`setting-${key}`}
                  type="text"
                  value={values[key] ?? ''}
                  onChange={(event) =>
                    handleValueChange(key, event.target.value)
                  }
                  disabled={savingKey !== null}
                  maxLength={200}
                />

                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={() => void handleSave(key)}
                  disabled={
                    savingKey !== null ||
                    values[key] === getStringValue(setting.value)
                  }
                >
                  {savingKey === key ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="admin-settings-group">
        <div className="admin-settings-group-heading">
          <div>
            <h3>Regional Configuration</h3>
            <p>
              Configure the currency, locale and timezone used by the
              marketplace.
            </p>
          </div>
        </div>

        {(['platform.currency', 'platform.locale', 'platform.timezone'] as EditableSettingKey[]).map(
          (key) => {
            const setting = getSetting(key)

            if (!setting) return null

            return (
              <div className="admin-setting-item" key={key}>
                <div className="admin-setting-information">
                  <label htmlFor={`setting-${key}`}>
                    {SETTING_LABELS[key]}
                  </label>

                  <p>{SETTING_HELP[key]}</p>

                  <span className="admin-setting-visibility">
                    {setting.isPublic ? 'Public setting' : 'Private setting'}
                  </span>
                </div>

                <div className="admin-setting-control">
                  <input
                    id={`setting-${key}`}
                    type="text"
                    value={values[key] ?? ''}
                    onChange={(event) =>
                      handleValueChange(key, event.target.value)
                    }
                    disabled={savingKey !== null}
                    maxLength={200}
                  />

                  <button
                    type="button"
                    className="admin-primary-button"
                    onClick={() => void handleSave(key)}
                    disabled={
                      savingKey !== null ||
                      values[key] === getStringValue(setting.value)
                    }
                  >
                    {savingKey === key ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )
          },
        )}
      </div>

      <div className="admin-settings-group">
        <div className="admin-settings-group-heading">
          <div>
            <h3>Contact &amp; Communication Security</h3>
            <p>Control which contact-sharing patterns are blocked by server validation.</p>
          </div>
        </div>
        {(() => {
          const key: EditableSettingKey = 'communication.contact_policy'
          const setting = getSetting(key)
          if (!setting) return <p>Run the backend settings seed to activate this policy.</p>
          return (
            <div className="admin-setting-item" key={key}>
              <div className="admin-setting-information">
                <label htmlFor={`setting-${key}`}>{SETTING_LABELS[key]}</label>
                <p>{SETTING_HELP[key]}</p>
                <span className="admin-setting-visibility">Private setting</span>
              </div>
              <div className="admin-setting-control">
                <textarea
                  id={`setting-${key}`}
                  value={values[key] ?? ''}
                  onChange={(event) => handleValueChange(key, event.target.value)}
                  disabled={savingKey !== null}
                  rows={7}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={() => {
                    try {
                      JSON.parse(values[key] || '')
                      void handleSave(key)
                    } catch {
                      setError('Contact policy must be valid JSON.')
                      setNotice('')
                    }
                  }}
                  disabled={savingKey !== null || values[key] === getStringValue(setting.value)}
                >
                  {savingKey === key ? 'Saving...' : 'Save Contact Policy'}
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="admin-settings-group">
        <div className="admin-settings-group-heading">
          <div>
            <h3>SMART HELP Centre &amp; BIGMAZ Intelligence</h3>
            <p>Control the built-in BIGMAZ assistant, adaptive learning, response feedback and monthly usage. The assistant runs using the marketplace's own intelligence engine without a paid external AI API.</p>
          </div>
        </div>
        {([
          'help.assistant.enabled',
          'help.ai.learning_enabled',
          'help.ai.feedback_enabled',
          'help.messages.free_limit',
          'help.messages.pack_size',
          'help.messages.pack_price_ngn',
        ] as EditableSettingKey[]).map((key) => {
          const setting = getSetting(key)
          if (!setting) return null
          const isBoolean = key === 'help.assistant.enabled' || key === 'help.ai.learning_enabled' || key === 'help.ai.feedback_enabled'
          return (
            <div className="admin-setting-item" key={key}>
              <div className="admin-setting-information">
                <label htmlFor={`setting-${key}`}>{SETTING_LABELS[key]}</label>
                <p>{SETTING_HELP[key]}</p>
                <span className="admin-setting-visibility">Private administrator setting</span>
              </div>
              <div className="admin-setting-control">
                {isBoolean ? (
                  <select
                    id={`setting-${key}`}
                    value={values[key] ?? 'false'}
                    onChange={(event) => handleValueChange(key, event.target.value)}
                    disabled={savingKey !== null}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : (
                  <input
                    id={`setting-${key}`}
                    type="number"
                    min="0"
                    step="1"
                    value={values[key] ?? ''}
                    onChange={(event) => handleValueChange(key, event.target.value)}
                    disabled={savingKey !== null}
                  />
                )}
                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={() => void handleSave(key)}
                  disabled={savingKey !== null || values[key] === getStringValue(setting.value)}
                >
                  {savingKey === key ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )
        })}
        {!getSetting('help.assistant.enabled') && (
          <p>Run the Help Centre database setup command to create these settings.</p>
        )}
      </div>

      <div className="admin-settings-note">
        <strong>Configuration protection</strong>
        <p>
          Setting keys, groups, descriptions and visibility are managed
          by the platform configuration system. This page only changes
          the values of existing settings.
        </p>
      </div>
    </section>
  )
}