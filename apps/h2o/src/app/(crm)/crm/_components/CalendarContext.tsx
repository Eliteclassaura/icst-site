'use client'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { DEFAULT_CALENDAR, type BusinessCalendar } from '../../../../crm/workspace/time'

/**
 * Patch L1: the viewer's business calendar (their display zone + their office's holidays) for client components that
 * compute quick dates when clicked. Provided once by the CRM layout from the server-side session.
 */
const CalendarContext = createContext<BusinessCalendar>(DEFAULT_CALENDAR)

export function CrmCalendarProvider({ zone, holidays, children }: { zone: string; holidays: string[]; children: ReactNode }) {
  const key = holidays.join(',')
  const value = useMemo<BusinessCalendar>(() => ({ zone, holidays: new Set(key ? key.split(',') : []) }), [zone, key])
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}

export const useCrmCalendar = (): BusinessCalendar => useContext(CalendarContext)
