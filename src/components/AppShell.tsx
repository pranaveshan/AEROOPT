// Console frame: grouped sidebar navigation, role-aware visibility, mobile drawer.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { EASE, fade, transition } from '../lib/motion'

import type { Permission } from '../shared/permissions'
import { ROLE_LABEL } from '../shared/permissions'
import { useAuth } from '../lib/session'
import { useTheme } from '../lib/theme'
import { cn } from './ui'

type IconName = 'overview' | 'tasks' | 'schedule' | 'aircraft' | 'crew' | 'maintenance' | 'engine' | 'evaluation' | 'security' | 'users' | 'audit' | 'settings'

const PATHS: Record<IconName, string> = {
  overview: 'M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5',
  tasks: 'M5 4.5h10M5 10h10M5 15.5h6',
  schedule: 'M4 5.5h12M4 10h12M4 14.5h12M7 3v5M13 8v9',
  aircraft: 'M10 3.5 11.6 8l4.9 1.8-4.9 1.4-.6 3.3-1-1.7-1 1.7-.6-3.3L3.5 9.8 8.4 8Z',
  crew: 'M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 16.5c.6-2.8 2.8-4.3 5.5-4.3s4.9 1.5 5.5 4.3',
  maintenance: 'M12.5 4.2a4 4 0 0 1 1.4 5.9l2.6 2.6-2.1 2.1-2.6-2.6a4 4 0 0 1-5.9-1.4l2.9-.9 2-2Z',
  engine: 'M10 3v3m0 8v3M3 10h3m8 0h3M5.6 5.6l2.1 2.1m4.6 4.6 2.1 2.1m0-8.8-2.1 2.1m-4.6 4.6-2.1 2.1',
  evaluation: 'M4 16V9m4 7V5m4 11v-4m4 4V7',
  security: 'M10 3.2 16 5v4.3c0 3.4-2.4 6.2-6 7.5-3.6-1.3-6-4.1-6-7.5V5Zm-2 6.9 2 2 4-4',
  users: 'M7.5 9a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm6.8-.4a2.2 2.2 0 1 0 0-4.4M3 16.4c.5-2.4 2.4-3.8 4.5-3.8s4 1.4 4.5 3.8m1.6-3.5c1.8.2 3.1 1.4 3.6 3.5',
  audit: 'M6 3.5h8v13H6Zm2 3h4m-4 3h4m-4 3h2',
  settings: 'M10 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm0-9.1v1.7m0 9.6v1.7M3.5 10h1.7m9.6 0h1.7M5.4 5.4l1.2 1.2m6.8 6.8 1.2 1.2m0-9.2-1.2 1.2m-6.8 6.8-1.2 1.2',
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn('size-[16px] shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

interface NavItem {
  label: string
  to: string
  icon: IconName
  permission: Permission
  end?: boolean
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Operations',
    items: [
      { label: 'Overview', to: '/console', icon: 'overview', permission: 'tasks:read', end: true },
      { label: 'Tasks', to: '/console/tasks', icon: 'tasks', permission: 'tasks:read' },
      { label: 'Schedule', to: '/console/schedule', icon: 'schedule', permission: 'schedule:read' },
    ],
  },
  {
    group: 'Resources',
    items: [
      { label: 'Aircraft', to: '/console/aircraft', icon: 'aircraft', permission: 'aircraft:read' },
      { label: 'Crew', to: '/console/crew', icon: 'crew', permission: 'crew:read' },
      { label: 'Maintenance', to: '/console/maintenance', icon: 'maintenance', permission: 'maintenance:read' },
    ],
  },
  {
    group: 'Optimization',
    items: [
      { label: 'Decision Engine', to: '/console/decision-engine', icon: 'engine', permission: 'schedule:read' },
      { label: 'Evaluation', to: '/console/evaluation', icon: 'evaluation', permission: 'analytics:read' },
    ],
  },
  {
    group: 'System',
    items: [
      { label: 'Security Centre', to: '/console/security', icon: 'security', permission: 'security:read' },
      { label: 'User Management', to: '/console/users', icon: 'users', permission: 'users:manage' },
      { label: 'Audit Logs', to: '/console/audit', icon: 'audit', permission: 'audit:read' },
      { label: 'Settings', to: '/console/settings', icon: 'settings', permission: 'settings:manage' },
    ],
  },
]

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          className="grid place-items-center"
          initial={{ opacity: 0, scale: 0.94, filter: 'blur(2px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.94, filter: 'blur(2px)' }}
          transition={{ duration: 0.13, ease: EASE.out }}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="10" cy="10" r="3.4" />
              <path d="M10 2.6v1.6M10 15.8v1.6M2.6 10h1.6M15.8 10h1.6M4.8 4.8l1.1 1.1M14.1 14.1l1.1 1.1M15.2 4.8l-1.1 1.1M5.9 14.1l-1.1 1.1" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M16 12.3A6.6 6.6 0 0 1 7.7 4a6.6 6.6 0 1 0 8.3 8.3Z" />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

export function AppShell() {
  const { user, can, signOut, demoData } = useAuth()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const groups = NAV.map((group) => ({ ...group, items: group.items.filter((item) => can(item.permission)) })).filter((group) => group.items.length)

  return (
    <div className="shell">
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
      <aside className="shell-sidebar" data-open={open} aria-label="Console navigation">
        <div className="flex h-[57px] items-center justify-between border-b border-line px-4">
          <Link to="/console" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-ink">A</span>
            <span className="text-[15px] font-semibold tracking-tight">AeroOpt</span>
          </Link>
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
        <nav className="space-y-4 px-2.5 py-3">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.group]
            return (
              <div key={group.group}>
                <button
                  className="flex w-full items-center justify-between rounded-md py-1 hover:text-ink-2"
                  onClick={() => setCollapsed((current) => ({ ...current, [group.group]: !current[group.group] }))}
                  aria-expanded={!isCollapsed}
                >
                  <span className="nav-group-label">{group.group}</span>
                  <svg viewBox="0 0 20 20" className={cn('mr-2 size-3 text-ink-3 transition-transform', isCollapsed && '-rotate-90')} fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="m5 8 5 5 5-5" />
                  </svg>
                </button>
                {isCollapsed ? null : (
                  <ul className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <NavLink to={item.to} end={item.end} className="nav-link relative" onClick={() => setOpen(false)}>
                          {({ isActive }) => (
                            <>
                              {isActive ? (
                                <motion.span
                                  layoutId="console-nav-active"
                                  className="absolute inset-0 rounded-[9px] border border-accent/25 bg-accent-soft"
                                  transition={transition.move}
                                  aria-hidden
                                />
                              ) : null}
                              <span className="relative z-[1] flex items-center gap-2.5">
                                <Icon name={item.icon} />
                                {item.label}
                              </span>
                            </>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>
        <div className="mt-auto border-t border-line p-3">
          {demoData ? (
            <div className="mb-2 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[11px] text-ink-3">
              Demonstration dataset · no external feeds
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">
              {user?.name?.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">{user?.name}</div>
              <div className="truncate text-[11px] text-ink-3">{user ? ROLE_LABEL[user.role] : ''}</div>
            </div>
            <button
              className="btn btn-ghost btn-icon"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await signOut()
                navigate('/signin')
              }}
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M8 4H5v12h3M12 6.5 15.5 10 12 13.5M15 10H8" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[57px] items-center gap-2 border-b border-line bg-canvas/90 px-3 backdrop-blur sm:px-5">
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 6h12M4 10h12M4 14h12" />
            </svg>
          </button>
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
            <span className="hidden sm:inline">AeroOpt</span>
            <span className="hidden text-ink-3/60 sm:inline">/</span>
            <span className="truncate font-medium text-ink-2">Operations console</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-ink-3 sm:flex">
              <span className="size-1.5 rounded-full bg-ok" />
              All times UTC
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5" id="main">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition.standard}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}

export function PageFallback({ children }: { children?: ReactNode }) {
  return <div className="p-6 text-[13px] text-ink-3">{children ?? 'Loading'}</div>
}
