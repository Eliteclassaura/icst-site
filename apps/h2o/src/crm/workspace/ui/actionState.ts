/** Result state returned by Sales Workspace server actions to their forms. */
export type ActionState = {
  ok?: boolean
  message?: string
  code?: string
  fields?: Record<string, string>
  conflict?: { byName: string | null; at: string | null; what: string | null }
  nonce?: number
  /** W1-1: "New contact" refused because the address already belongs to this contact (an id, never the address). */
  existingId?: string
  /** A success that needs a person's attention (PEOPLE-FIX-1: the change was made but the notice email failed). */
  warn?: boolean
  /** The record a successful action created (Patch C: a new sending profile opens on its own page). */
  id?: string
}

export const INITIAL_ACTION_STATE: ActionState = {}
