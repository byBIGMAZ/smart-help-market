
export interface MessagePolicy {
  enabled: boolean
  blockPhoneNumbers: boolean
  blockEmails: boolean
  blockExternalLinks: boolean
  blockSocialHandles: boolean
  blockOffPlatformRequests: boolean
}

export const defaultMessagePolicy: MessagePolicy = {
  enabled: true,
  blockPhoneNumbers: true,
  blockEmails: true,
  blockExternalLinks: true,
  blockSocialHandles: true,
  blockOffPlatformRequests: true,
}

export function parseMessagePolicy(value: unknown): MessagePolicy {
  let candidate = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { candidate = null }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return defaultMessagePolicy
  }
  const data = candidate as Record<string, unknown>
  return {
    enabled: data.enabled !== false,
    blockPhoneNumbers: data.blockPhoneNumbers !== false,
    blockEmails: data.blockEmails !== false,
    blockExternalLinks: data.blockExternalLinks !== false,
    blockSocialHandles: data.blockSocialHandles !== false,
    blockOffPlatformRequests: data.blockOffPlatformRequests !== false,
  }
}

export function validateMessageAgainstPolicy(text: string, policy: MessagePolicy) {
  if (!text.trim()) return { allowed: false, reason: 'Write a message before sending.' }
  if (text.length > 5000) return { allowed: false, reason: 'Messages cannot exceed 5,000 characters.' }
  if (!policy.enabled) return { allowed: true as const }

  const checks: Array<[boolean, RegExp, string]> = [
    [policy.blockEmails, /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}\b/i, 'Email addresses are not permitted. Keep communication inside the marketplace.'],
    [policy.blockExternalLinks, /\b(?:https?:\/\/|www\.)\S+/i, 'External links are not permitted in marketplace messages.'],
    [policy.blockSocialHandles, /(?:^|\s)@[a-z0-9_.]{3,}/i, 'Social media handles are not permitted in marketplace messages.'],
    [policy.blockSocialHandles, /\b(?:whatsapp|telegram|instagram|facebook|snapchat|tiktok)\b/i, 'External social and messaging contacts are not permitted.'],
    [policy.blockOffPlatformRequests, /\b(?:call|text|chat|message)\s+me\s+(?:on|at)\b/i, 'Requests to move conversations outside the marketplace are not permitted.'],
  ]

  for (const [enabled, expression, reason] of checks) {
    if (enabled && expression.test(text)) return { allowed: false as const, reason }
  }

  if (policy.blockPhoneNumbers) {
    const runs = text.match(/\d[\d\s().+\-/]{5,}\d/g) ?? []
    for (const run of runs) {
      const digits = run.replace(/\D/g, '')
      if (digits.length >= 7 && digits.length <= 15) {
        return { allowed: false as const, reason: 'Phone numbers are not permitted. Keep communication inside the marketplace.' }
      }
    }
    const spoken = text.toLowerCase()
      .replace(/zero/g, '0').replace(/oh/g, '0')
      .replace(/one/g, '1').replace(/two/g, '2')
      .replace(/three/g, '3').replace(/four/g, '4')
      .replace(/five/g, '5').replace(/six/g, '6')
      .replace(/seven/g, '7').replace(/eight/g, '8')
      .replace(/nine/g, '9')
      .replace(/[^0-9]/g, '')
    if (spoken.length >= 7 && spoken.length <= 15) {
      return { allowed: false as const, reason: 'Phone numbers are not permitted. Keep communication inside the marketplace.' }
    }
  }

  return { allowed: true as const }
}
