/**
 * DARK-1: the Sales Workspace colour theme. "system" (the default) follows the device's light/dark setting; "light"
 * and "dark" pin it. The choice is stored on the user (`users.crm_theme`), so it follows them to every device.
 * The CRM layout puts it on a wrapper (`data-theme`); crm.css holds the two token sets.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export type CrmTheme = (typeof THEMES)[number]
export const THEME_LABEL: Record<CrmTheme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Any stored or posted value → a known theme ("system" for anything else). */
export const themeFrom = (v: unknown): CrmTheme => (THEMES as readonly unknown[]).includes(v) ? (v as CrmTheme) : 'system'
