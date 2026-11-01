
import { useCallback, useEffect, useState } from 'react'
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRules,
  setAutomationRuleStatus,
  updateAutomationRule,
} from './services/adminAutomationRules'
import type {
  AutomationRule,
  AutomationRuleInput,
} from './services/adminAutomationRules'
import './AdminAutomationRules.css'

interface Props {
  onNotice?: (message: string) => void
}

const EMPTY_FORM: AutomationRuleInput = {
  ruleKey: '',
  ruleName: '',
  description: '',
  eventType: '',
  conditions: {},
  actions: [
    {
      type: 'event.log',
      message: 'Automation rule executed successfully.',
    },
  ],
  isActive: false,
}

const ACTION_EXAMPLE = `[
  {
    "type": "notification.admins",
    "title": "New marketplace event",
    "message": "An automation event has occurred."
  }
]`

const CONDITION_EXAMPLE = `{
  "status": "pending"
}`

export default function AdminAutomationRules({ onNotice }: Props) {
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [form, setForm] = useState<AutomationRuleInput>(EMPTY_FORM)
  const [conditionsText, setConditionsText] = useState('{}')
  const [actionsText, setActionsText] = useState(
    JSON.stringify(EMPTY_FORM.actions, null, 2),
  )

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await getAutomationRules()
      setRules(response.rules)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load automation rules.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  function updateField<K extends keyof AutomationRuleInput>(
    field: K,
    value: AutomationRuleInput[K],
  ) {
    setForm(previous => ({
      ...previous,
      [field]: value,
    }))
  }

  function startNewRule() {
    setEditingRule(null)
    setForm({ ...EMPTY_FORM })
    setConditionsText('{}')
    setActionsText(JSON.stringify(EMPTY_FORM.actions, null, 2))
    setError('')
    setShowForm(true)
  }

  function startEditing(rule: AutomationRule) {
    setEditingRule(rule)

    setForm({
      ruleKey: rule.ruleKey,
      ruleName: rule.ruleName,
      description: rule.description,
      eventType: rule.eventType,
      conditions: rule.conditions,
      actions: rule.actions,
      isActive: rule.isActive,
    })

    setConditionsText(JSON.stringify(rule.conditions, null, 2))
    setActionsText(JSON.stringify(rule.actions, null, 2))
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    if (saving) return
    setShowForm(false)
    setEditingRule(null)
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    let parsedConditions: unknown
    let parsedActions: unknown

    try {
      parsedConditions = JSON.parse(conditionsText)
    } catch {
      setError('Conditions must contain valid JSON.')
      return
    }

    try {
      parsedActions = JSON.parse(actionsText)
    } catch {
      setError('Actions must contain valid JSON.')
      return
    }

    if (
      typeof parsedConditions !== 'object' ||
      parsedConditions === null ||
      Array.isArray(parsedConditions)
    ) {
      setError('Conditions must be a JSON object.')
      return
    }

    if (!Array.isArray(parsedActions)) {
      setError('Actions must be a JSON array.')
      return
    }

    const input: AutomationRuleInput = {
      ...form,
      ruleKey: form.ruleKey.trim(),
      ruleName: form.ruleName.trim(),
      description: form.description.trim(),
      eventType: form.eventType.trim(),
      conditions: parsedConditions as Record<string, unknown>,
      actions: parsedActions,
    }

    setSaving(true)

    try {
      if (editingRule) {
        await updateAutomationRule(editingRule.ruleId, input)
        onNotice?.('Automation rule updated successfully.')
      } else {
        await createAutomationRule(input)
        onNotice?.('Automation rule created successfully.')
      }

      setShowForm(false)
      setEditingRule(null)
      await loadRules()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The automation rule could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(rule: AutomationRule) {
    const nextStatus = !rule.isActive

    const confirmed = window.confirm(
      nextStatus
        ? `Activate "${rule.ruleName}"?`
        : `Deactivate "${rule.ruleName}"?`,
    )

    if (!confirmed) return

    setProcessingId(rule.ruleId)
    setError('')

    try {
      await setAutomationRuleStatus(rule.ruleId, nextStatus)
      onNotice?.(
        nextStatus
          ? 'Automation rule activated.'
          : 'Automation rule deactivated.',
      )
      await loadRules()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not change rule status.',
      )
    } finally {
      setProcessingId(null)
    }
  }

  async function handleDelete(rule: AutomationRule) {
    if (rule.isActive) {
      setError('Deactivate this rule before deleting it.')
      return
    }

    if (rule.executionCount > 0) {
      setError(
        'This rule has execution history and cannot be permanently deleted.',
      )
      return
    }

    const confirmed = window.confirm(
      `Permanently delete "${rule.ruleName}"? This cannot be undone.`,
    )

    if (!confirmed) return

    setProcessingId(rule.ruleId)
    setError('')

    try {
      await deleteAutomationRule(rule.ruleId)
      onNotice?.('Automation rule deleted successfully.')
      await loadRules()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete automation rule.',
      )
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <section className="automation-rules">
      <div className="automation-rules-header">
        <div>
          <h2>Automation Rules</h2>
          <p>
            Create and manage the conditions and actions that control
            marketplace automation.
          </p>
        </div>

        {!showForm && (
          <button
            type="button"
            className="automation-rules-primary"
            onClick={startNewRule}
          >
            + Create rule
          </button>
        )}
      </div>

      <div className="automation-rules-summary">
        <div className="automation-rule-stat">
          <span>Total rules</span>
          <strong>{rules.length}</strong>
        </div>

        <div className="automation-rule-stat">
          <span>Active rules</span>
          <strong>{rules.filter(rule => rule.isActive).length}</strong>
        </div>

        <div className="automation-rule-stat">
          <span>Inactive rules</span>
          <strong>{rules.filter(rule => !rule.isActive).length}</strong>
        </div>
      </div>

      {error && (
        <div className="automation-rules-error" role="alert">
          {error}
        </div>
      )}

      {showForm && (
        <form
          className="automation-rule-form"
          onSubmit={handleSubmit}
        >
          <div className="automation-rule-form-heading">
            <div>
              <h3>
                {editingRule ? 'Edit automation rule' : 'Create automation rule'}
              </h3>
              <p>
                Configure when this rule runs and what actions it performs.
              </p>
            </div>
          </div>

          <div className="automation-rule-form-grid">
            <label>
              Rule name
              <input
                value={form.ruleName}
                onChange={event =>
                  updateField('ruleName', event.target.value)
                }
                maxLength={200}
                required
                placeholder="Example: Notify admins of new listings"
              />
            </label>

            <label>
              Rule key
              <input
                value={form.ruleKey}
                onChange={event =>
                  updateField('ruleKey', event.target.value)
                }
                maxLength={100}
                required
                pattern="[a-z0-9][a-z0-9_.-]{1,99}"
                title="Use lowercase letters, numbers, dots, underscores or hyphens."
                placeholder="new_listing_admin_alert"
              />
            </label>

            <label>
              Event type
              <input
                value={form.eventType}
                onChange={event =>
                  updateField('eventType', event.target.value)
                }
                maxLength={100}
                required
                pattern="[a-z0-9_.-]{1,100}"
                placeholder="listing.created"
              />
            </label>

            <label className="automation-rule-description">
              Description
              <textarea
                value={form.description}
                onChange={event =>
                  updateField('description', event.target.value)
                }
                maxLength={2000}
                rows={3}
                placeholder="Explain what this rule is intended to do."
              />
            </label>
          </div>

          <div className="automation-rule-editor">
            <div>
              <h4>Conditions</h4>
              <p>
                Enter a JSON object. Each field must exactly match the
                corresponding event payload value. Use an empty object
                to match every event of this type.
              </p>
              <textarea
                className="automation-rule-json"
                value={conditionsText}
                onChange={event => setConditionsText(event.target.value)}
                rows={7}
                spellCheck={false}
                required
              />
              <small>Example: {CONDITION_EXAMPLE}</small>
            </div>

            <div>
              <h4>Actions</h4>
              <p>
                Enter a JSON array containing one or more supported
                actions. You can use notification.user,
                notification.admins or event.log.
              </p>
              <textarea
                className="automation-rule-json"
                value={actionsText}
                onChange={event => setActionsText(event.target.value)}
                rows={12}
                spellCheck={false}
                required
              />
              <small>Example: {ACTION_EXAMPLE}</small>
            </div>
          </div>

          <label className="automation-rule-active-option">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={event =>
                updateField('isActive', event.target.checked)
              }
            />
            Activate this rule immediately after saving
          </label>

          <div className="automation-rule-form-actions">
            <button
              type="button"
              className="automation-rules-secondary"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="automation-rules-primary"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : editingRule
                  ? 'Save changes'
                  : 'Create rule'}
            </button>
          </div>
        </form>
      )}

      <div className="automation-rules-list-heading">
        <h3>Configured rules</h3>
        <button
          type="button"
          className="automation-rules-refresh"
          onClick={() => void loadRules()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="automation-rules-empty">
          Loading automation rules...
        </div>
      ) : rules.length === 0 ? (
        <div className="automation-rules-empty">
          <strong>No automation rules yet</strong>
          <p>Create your first rule to define how marketplace events should be handled.</p>
        </div>
      ) : (
        <div className="automation-rules-list">
          {rules.map(rule => (
            <article
              className="automation-rule-card"
              key={rule.ruleId}
            >
              <div className="automation-rule-card-top">
                <div>
                  <h4>{rule.ruleName}</h4>
                  <code>{rule.ruleKey}</code>
                </div>

                <span
                  className={
                    rule.isActive
                      ? 'automation-rule-status active'
                      : 'automation-rule-status inactive'
                  }
                >
                  {rule.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {rule.description && (
                <p className="automation-rule-card-description">
                  {rule.description}
                </p>
              )}

              <div className="automation-rule-metadata">
                <span>
                  Event: <strong>{rule.eventType}</strong>
                </span>
                <span>
                  Executions: <strong>{rule.executionCount}</strong>
                </span>
                <span>
                  Actions: <strong>{rule.actions.length}</strong>
                </span>
                <span>
                  Conditions: <strong>{Object.keys(rule.conditions).length}</strong>
                </span>
              </div>

              <div className="automation-rule-card-actions">
                <button
                  type="button"
                  className="automation-rules-secondary"
                  onClick={() => startEditing(rule)}
                  disabled={processingId === rule.ruleId}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="automation-rules-secondary"
                  onClick={() => void handleStatusChange(rule)}
                  disabled={processingId === rule.ruleId}
                >
                  {processingId === rule.ruleId
                    ? 'Processing...'
                    : rule.isActive
                      ? 'Deactivate'
                      : 'Activate'}
                </button>

                <button
                  type="button"
                  className="automation-rules-danger"
                  onClick={() => void handleDelete(rule)}
                  disabled={
                    processingId === rule.ruleId ||
                    rule.isActive ||
                    rule.executionCount > 0
                  }
                  title={
                    rule.isActive
                      ? 'Deactivate this rule before deleting it.'
                      : rule.executionCount > 0
                        ? 'Rules with execution history cannot be deleted.'
                        : 'Delete this rule permanently.'
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
