import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useTheme } from '../../lib/theme'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  useTheme()
  return (
    <div className="grid min-h-svh bg-canvas lg:grid-cols-[1fr_460px]">
      <div className="relative hidden flex-col justify-between border-r border-line bg-surface p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-ink">A</span>
          <span className="text-[15px] font-semibold tracking-tight">AeroOpt</span>
        </Link>
        <div className="max-w-[420px]">
          <h2 className="text-[26px] leading-tight font-semibold tracking-tight">Operational decisions, constrained and accountable.</h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
            AeroOpt validates every assignment against aircraft capability, crew qualification, duty and rest limits, maintenance windows and task dependencies before
            a schedule is proposed.
          </p>
          <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-[12.5px] text-ink-3">
            <li>Server-enforced role permissions</li>
            <li>Approval gate before schedules take effect</li>
            <li>Audit records for operational changes</li>
          </ul>
        </div>
        <p className="text-[11.5px] text-ink-3">Demonstration deployment · not for operational use</p>
      </div>

      <div className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-ink">A</span>
          <span className="text-[15px] font-semibold tracking-tight">AeroOpt</span>
        </Link>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[13px] text-ink-2">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-5 text-[12.5px] text-ink-2">{footer}</div> : null}
      </div>
    </div>
  )
}
