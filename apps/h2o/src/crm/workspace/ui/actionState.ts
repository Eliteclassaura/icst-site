/** Result state returned by Sales Workspace server actions to their forms. */
export type ActionState = {
  ok?: boolean
  message?: string
  code?: string
  fields?: Record<string, string>
  conflict?: { byName: string | null; at: string | null; what: string | null }
  nonce?: number
}

export const INITIAL_ACTION_STATE: ActionState = {}
