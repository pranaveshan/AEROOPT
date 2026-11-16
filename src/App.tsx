import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import { AppShell } from './components/AppShell'
import { Loading, ToastProvider } from './components/ui'
import { MotionConfig } from 'motion/react'

import { MotionPreferenceProvider, useMotionPreference } from './lib/motion'
import { AuthProvider, useAuth } from './lib/session'
import { ThemeProvider } from './lib/theme'
import { Landing } from './pages/Landing'
import { ForgotPassword } from './pages/auth/ForgotPassword'
import { SignIn } from './pages/auth/SignIn'
import { SignUp } from './pages/auth/SignUp'
import { NotFound } from './pages/NotFound'

const Overview = lazy(() => import('./pages/console/Overview'))
const Tasks = lazy(() => import('./pages/console/Tasks'))
const TaskDetail = lazy(() => import('./pages/console/TaskDetail'))
const Schedule = lazy(() => import('./pages/console/Schedule'))
const AircraftList = lazy(() => import('./pages/console/Aircraft'))
const AircraftDetail = lazy(() => import('./pages/console/AircraftDetail'))
const Crew = lazy(() => import('./pages/console/Crew'))
const CrewDetail = lazy(() => import('./pages/console/CrewDetail'))
const Maintenance = lazy(() => import('./pages/console/Maintenance'))
const DecisionEngine = lazy(() => import('./pages/console/DecisionEngine'))
const Evaluation = lazy(() => import('./pages/console/Evaluation'))
const SecurityCentre = lazy(() => import('./pages/console/SecurityCentre'))
const UserManagement = lazy(() => import('./pages/console/UserManagement'))
const AuditLogs = lazy(() => import('./pages/console/AuditLogs'))
const SettingsPage = lazy(() => import('./pages/console/Settings'))

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading label="Checking session" />
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

function MotionShell({ children }: { children: ReactNode }) {
  const { preference } = useMotionPreference()
  return (
    <MotionConfig reducedMotion={preference === 'reduced' ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <MotionPreferenceProvider>
        <MotionShell>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <a href="#main" className="sr-only z-[100] bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:rounded-md">
              Skip to content
            </a>
            <Suspense fallback={<Loading label="Loading page" />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/signin" element={<SignIn />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route
                  path="/console"
                  element={
                    <Protected>
                      <AppShell />
                    </Protected>
                  }
                >
                  <Route index element={<Overview />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="tasks/:id" element={<TaskDetail />} />
                  <Route path="schedule" element={<Schedule />} />
                  <Route path="aircraft" element={<AircraftList />} />
                  <Route path="aircraft/:id" element={<AircraftDetail />} />
                  <Route path="crew" element={<Crew />} />
                  <Route path="crew/:id" element={<CrewDetail />} />
                  <Route path="maintenance" element={<Maintenance />} />
                  <Route path="decision-engine" element={<DecisionEngine />} />
                  <Route path="evaluation" element={<Evaluation />} />
                  <Route path="security" element={<SecurityCentre />} />
                  <Route path="users" element={<UserManagement />} />
                  <Route path="audit" element={<AuditLogs />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
        </MotionShell>
      </MotionPreferenceProvider>
    </ThemeProvider>
  )
}
