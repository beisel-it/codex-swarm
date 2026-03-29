import { createContext, useContext } from 'react'

export type ThemeName = 'default' | 'gruvbox' | 'gruvbox-dark' | 'dark'

// Keep gruvbox-dark operator-visible until a later product decision removes it.
export const themeOptions = [
  { value: 'default', label: 'Default' },
  { value: 'gruvbox', label: 'Gruvbox' },
  { value: 'gruvbox-dark', label: 'Gruvbox Dark' },
  { value: 'dark', label: 'Dark' },
] as const satisfies Array<{ value: ThemeName; label: string }>

export type ThemeContextValue = {
  activeTheme: ThemeName
  setActiveTheme: (theme: ThemeName) => void
  themes: typeof themeOptions
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
