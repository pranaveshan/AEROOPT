import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center bg-canvas px-5">
      <div className="max-w-[420px] text-center">
        <div className="mono text-[12px] text-ink-3">HTTP 404</div>
        <h1 className="mt-2 text-[24px] font-semibold">This page does not exist</h1>
        <p className="mt-2 text-[13px] text-ink-2">The route may have moved, or you may not have access to it.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/console" className="btn btn-primary">
            Go to console
          </Link>
          <Link to="/" className="btn btn-secondary">
            Public site
          </Link>
        </div>
      </div>
    </div>
  )
}
