/**
 * DARK-1: the Sales Workspace colour theme. New or invalid preferences default to "dark"; "system" remains an
 * explicit choice that follows the device, while "light" and "dark" pin it. The choice is stored on the user
 * (`users.crm_theme`), so it follows them to every device.
 * The CRM layout puts it on a wrapper (`data-theme`); crm.css holds the two token sets.
 */
export const THEMES = ['system', 'light', 'dark'] as const
export type CrmTheme = (typeof THEMES)[number]
export const THEME_LABEL: Record<CrmTheme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Any stored or posted value → a known theme ("dark" for an absent or invalid preference). */
export const themeFrom = (v: unknown): CrmTheme => (THEMES as readonly unknown[]).includes(v) ? (v as CrmTheme) : 'dark'
