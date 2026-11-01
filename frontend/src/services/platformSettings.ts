
export interface PlatformSettings {
  'platform.name': string
  'platform.currency': string
  'platform.locale': string
  'platform.timezone': string
}

const DEFAULT_SETTINGS: PlatformSettings = {
  'platform.name': 'SMART HELP MARKET BY BIGMAZ',
  'platform.currency': 'NGN',
  'platform.locale': 'en-NG',
  'platform.timezone': 'Africa/Lagos',
}

export async function getPublicPlatformSettings(): Promise<PlatformSettings> {
  try {
    const response = await fetch('/api/settings/public', {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Settings API returned HTTP ${response.status}`)
    }

    const data: unknown = await response.json()

    if (
      typeof data !== 'object' ||
      data === null ||
      !('settings' in data) ||
      typeof data.settings !== 'object' ||
      data.settings === null
    ) {
      throw new Error('The settings API returned an invalid response.')
    }

    const settings = data.settings as Record<string, unknown>

    return {
      'platform.name':
        typeof settings['platform.name'] === 'string' &&
        settings['platform.name'].trim()
          ? settings['platform.name']
          : DEFAULT_SETTINGS['platform.name'],

      'platform.currency':
        typeof settings['platform.currency'] === 'string'
          ? settings['platform.currency']
          : DEFAULT_SETTINGS['platform.currency'],

      'platform.locale':
        typeof settings['platform.locale'] === 'string'
          ? settings['platform.locale']
          : DEFAULT_SETTINGS['platform.locale'],

      'platform.timezone':
        typeof settings['platform.timezone'] === 'string'
          ? settings['platform.timezone']
          : DEFAULT_SETTINGS['platform.timezone'],
    }
  } catch (error) {
    console.error('Unable to load public platform settings:', error)
    return { ...DEFAULT_SETTINGS }
  }
}
