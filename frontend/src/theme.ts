import { createContext, useContext } from 'react'

export type ThemeName = 'default' | 'gruvbox'

export const themeOptions: Array<{ value: ThemeName; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'gruvbox', label: 'Gruvbox' },
]

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
