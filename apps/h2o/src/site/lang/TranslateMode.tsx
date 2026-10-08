'use client'

import {createContext,useContext,type ReactNode} from 'react'
import type {TranslateMode} from './translate-switch'

/** The layout decides the mode per request; the menu and the note read it, so the server-rendered disclosure is already the true one. */
const Mode=createContext<TranslateMode>('full')
export const TranslateModeProvider=({mode,children}:{mode:TranslateMode;children:ReactNode})=><Mode.Provider value={mode}>{children}</Mode.Provider>
export const useTranslateMode=()=>useContext(Mode)
