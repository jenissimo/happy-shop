import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  applyThemeToDocument,
  persistTheme,
  readStoredTheme,
  THEMES,
  type ThemeId,
} from './themes'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  themes: typeof THEMES
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme())

  useEffect(() => {
    applyThemeToDocument(theme)
    persistTheme(theme)
  }, [theme])

  const setTheme = (next: ThemeId) => {
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}
