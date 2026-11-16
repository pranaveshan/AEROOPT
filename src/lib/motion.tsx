// Central motion system: tokens, variants and the reduced-effects preference.
// Durations and easings live here only — no component invents its own timing.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Transition, Variants } from 'motion/react'

export const DURATION = {
  micro: 0.12,
  control: 0.18,
  dropdown: 0.2,
  standard: 0.22,
  modal: 0.26,
  layout: 0.3,
} as const

/** Exits run 20% shorter than their matching entrance. */
export const exitOf = (duration: number) => duration * 0.8

export const EASE = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
}

export const transition = {
  micro: { duration: DURATION.micro, ease: EASE.out } satisfies Transition,
  control: { duration: DURATION.control, ease: EASE.out } satisfies Transition,
  standard: { duration: DURATION.standard, ease: EASE.out } satisfies Transition,
  move: { duration: DURATION.layout, ease: EASE.inOut } satisfies Transition,
  dropdownIn: { duration: DURATION.dropdown, ease: EASE.out } satisfies Transition,
  dropdownOut: { duration: exitOf(DURATION.dropdown), ease: EASE.in } satisfies Transition,
  modalIn: { duration: DURATION.modal, ease: EASE.out } satisfies Transition,
  modalOut: { duration: exitOf(DURATION.modal), ease: EASE.in } satisfies Transition,
}

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.standard },
  exit: { opacity: 0, transition: { duration: exitOf(DURATION.control), ease: EASE.in } },
}

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.standard },
  exit: { opacity: 0, y: -4, transition: { duration: exitOf(DURATION.control), ease: EASE.in } },
}

/** Lists: 30ms between rows, entrance only. */
export const list: Variants = {
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
}

export const listItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: transition.control },
}

/** Popovers and menus: settle from 0.95 in their trigger's direction. */
export const popover = (origin: 'top' | 'bottom' = 'top'): Variants => ({
  initial: { opacity: 0, scale: 0.95, y: origin === 'top' ? -4 : 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transition.dropdownIn },
  exit: { opacity: 0, scale: 0.97, y: origin === 'top' ? -3 : 3, transition: transition.dropdownOut },
})

export const modalPanel: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transition.modalIn },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: transition.modalOut },
}

export const drawer: Variants = {
  initial: { x: '-100%' },
  animate: { x: 0, transition: { duration: DURATION.layout, ease: EASE.out } },
  exit: { x: '-100%', transition: { duration: exitOf(DURATION.layout), ease: EASE.in } },
}

/** Short, restrained confirmation pulse. */
export const successPulse: Variants = {
  initial: { scale: 1 },
  pulse: { scale: [1, 1.012, 1], transition: { duration: 0.32, ease: EASE.out } },
}

type MotionPreference = 'full' | 'reduced'
const STORAGE_KEY = 'aeroopt.motion'

const MotionPreferenceContext = createContext<{ preference: MotionPreference; setPreference: (value: MotionPreference) => void }>({
  preference: 'full',
  setPreference: () => {},
})

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<MotionPreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'reduced' ? 'reduced' : 'full'
  })

  useEffect(() => {
    document.documentElement.dataset.motion = preference
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  const setPreference = useCallback((value: MotionPreference) => setPreferenceState(value), [])
  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference])
  return <MotionPreferenceContext.Provider value={value}>{children}</MotionPreferenceContext.Provider>
}

export const useMotionPreference = () => useContext(MotionPreferenceContext)

/** True when the user asked for reduced motion, by setting or OS preference. */
export function useReducedMotionSafe(): boolean {
  const { preference } = useMotionPreference()
  const [system, setSystem] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setSystem(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return preference === 'reduced' || system
}
