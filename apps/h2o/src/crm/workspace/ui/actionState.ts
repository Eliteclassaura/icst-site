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
}

export const INITIAL_ACTION_STATE: ActionState = {}
