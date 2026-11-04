export interface ContactPolicyResult {
  allowed: boolean
  reason?: string
}

const patterns: Array<{ expression: RegExp; reason: string }> = [
  { expression: /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}\b/i, reason: 'Email addresses are not permitted in marketplace messages.' },
  { expression: /\b(?:https?:\/\/|www\.)\S+/i, reason: 'External links are not permitted in marketplace messages.' },
  { expression: /\b(?:whatsapp|telegram|instagram|facebook|snapchat|tiktok)\s*(?:me|:|@|\.com)?/i, reason: 'External social and messaging contact details are not permitted.' },
  { expression: /@[a-z0-9_.]{3,}/i, reason: 'Social media handles are not permitted in marketplace messages.' },
  { expression: /\b(?:call|text|chat|message)\s+me\s+(?:on|at)\b/i, reason: 'Requests to move conversations outside the marketplace are not permitted.' },
]

export function validateMarketplaceMessage(value: string): ContactPolicyResult {
  const text = value.trim()
  if (!text) return { allowed: false, reason: 'Write a message before sending.' }

  for (const pattern of patterns) {
    if (pattern.expression.test(text)) {
      return { allowed: false, reason: pattern.reason }
    }
  }

  const digitRuns = text.match(/\d[\d\s().+-]{5,}\d/g) ?? []
  for (const run of digitRuns) {
    const digits = run.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) {
      return {
        allowed: false,
        reason: 'Phone numbers and contact details are not permitted. Keep communication inside the marketplace.',
      }
    }
  }

  const compact = text.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (/(?:whatsapp|telegram|instagram|facebook|gmail|yahoo|outlook)/i.test(compact)) {
    return {
      allowed: false,
      reason: 'External contact details are not permitted in marketplace messages.',
    }
  }

  return { allowed: true }
}
