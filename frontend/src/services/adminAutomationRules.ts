export interface AutomationRule {
  ruleId: string
  ruleKey: string
  ruleName: string
  description: string
  eventType: string
  conditions: Record<string, unknown>
  actions: AutomationAction[]
  isActive: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  executionCount: number
}

export type AutomationAction =
  | {
      type: 'notification.user'
      recipientUserId: string | number
      title: string
      message: string
      notificationType?: string
      metadata?: Record<string, unknown>
    }
  | {
      type: 'notification.admins'
      title: string
      message: string
      notificationType?: string
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event.log'
      message: string
    }

export interface AutomationRuleInput {
  ruleKey: string
  ruleName: string
  description: string
  eventType: string
  conditions: Record<string, unknown>
  actions: AutomationAction[]
  isActive: boolean
}

interface RulesListResponse {
  status: 'ok'
  rules: AutomationRule[]
  total: number
}

interface RuleResponse {
  status: 'ok'
  message: string
  rule: AutomationRule
}

interface DeleteRuleResponse {
  status: 'ok'
  message: string
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `/api/admin/automation${path}`,
    {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    },
  )

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed with status ${response.status}.`,
    )
  }

  return data as T
}

export async function getAutomationRules(): Promise<RulesListResponse> {
  return request<RulesListResponse>('/rules')
}

export async function createAutomationRule(
  input: AutomationRuleInput,
): Promise<RuleResponse> {
  return request<RuleResponse>('/rules', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateAutomationRule(
  ruleId: string,
  input: AutomationRuleInput,
): Promise<RuleResponse> {
  return request<RuleResponse>(`/rules/${encodeURIComponent(ruleId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function setAutomationRuleStatus(
  ruleId: string,
  isActive: boolean,
): Promise<RuleResponse> {
  return request<RuleResponse>(
    `/rules/${encodeURIComponent(ruleId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    },
  )
}

export async function deleteAutomationRule(
  ruleId: string,
): Promise<DeleteRuleResponse> {
  return request<DeleteRuleResponse>(
    `/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'DELETE',
    },
  )
}