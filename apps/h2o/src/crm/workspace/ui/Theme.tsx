'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { THEMES, THEME_LABEL, type CrmTheme } from '../theme'

/**
 * DARK-1: the theme wrapper and switch. The CRM layout provides the signed-in user's stored theme and the server
 * action that saves a new one; the wrapper puts the theme on `data-theme` (crm.css: "system" follows the device,
 * "light"/"dark" pin it), so the first paint is already right. The switch is a form bound to that action: it saves the
 * choice on the user and the page re-renders with the new theme. (The action comes in through the provider, so this
 * module imports nothing from the app routes.)
 */
type SaveTheme = (fd: FormData) => Promise<void>
const ThemeContext = createContext<{ theme: CrmTheme; save: SaveTheme | null }>({ theme: 'system', save: null })

export function CrmThemeProvider({ theme, save, children }: { theme: CrmTheme; save: SaveTheme; children: ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme, save }}>
      <div className="c-theme" data-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function ThemeSwitch() {
  const { theme, save } = useContext(ThemeContext)
  if (!save) return null
  return (
    <form className="c-theme-switch" action={save}>
      <fieldset>
        <legend>Theme</legend>
        {THEMES.map((t) => (
          <button key={t} type="submit" name="theme" value={t} className="c-btn is-small" aria-pressed={theme === t}>
            {THEME_LABEL[t]}
          </button>
        ))}
      </fieldset>
    </form>
  )
}
