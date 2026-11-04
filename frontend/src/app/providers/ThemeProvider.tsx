
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { ThemeContext } from './ThemeContext'

import type {
  ResolvedTheme,
  ThemePreference,
} from '../../types/theme'

interface ThemeProviderProps {
  children: ReactNode
}

const THEME_STORAGE_KEY = 'smart-help-market-theme'

function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }

  return 'light'
}

function getInitialTheme(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)

    if (
      savedTheme === 'light' ||
      savedTheme === 'dark' ||
      savedTheme === 'system'
    ) {
      return savedTheme
    }
  } catch {
    // Use system preference when browser storage is unavailable.
  }

  return 'system'
}

export default function ThemeProvider({
  children,
}: ThemeProviderProps) {
  const [theme, setTheme] =
    useState<ThemePreference>(getInitialTheme)

  const [systemTheme, setSystemTheme] =
    useState<ResolvedTheme>(getSystemTheme)

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      '(prefers-color-scheme: dark)',
    )

    const handleSystemThemeChange = (
      event: MediaQueryListEvent,
    ) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener(
      'change',
      handleSystemThemeChange,
    )

    return () => {
      mediaQuery.removeEventListener(
        'change',
        handleSystemThemeChange,
      )
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      resolvedTheme,
    )

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // The selected theme remains active for this session.
    }
  }, [theme, resolvedTheme])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}
