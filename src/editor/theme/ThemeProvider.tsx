import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
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

  // The viewport rebuilds its Pixi checkerboard from computed CSS tokens in a
  // passive effect. Apply the attribute during the layout phase so it always
  // observes this theme, rather than the one from the previous render.
  useLayoutEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  useEffect(() => {
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
