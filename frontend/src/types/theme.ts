
export type ThemePreference = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}
