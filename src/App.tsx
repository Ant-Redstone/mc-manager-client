import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import Sidebar from './components/sidebar/Sidebar'
import Navbar from './components/navbar/Navbar'
import Console from './pages/console/Console'
import Overview from './pages/overview/Overview'
import Activity from './pages/activity/Activity'
import Automations from './pages/automations/Automations'
import Players from './pages/players/Players'
import Performance from './pages/performance/Performance'
import ServerSetup from './pages/server/ServerSetup'
import Servers from './pages/servers/Servers'
import Users from './pages/users/Users'
import Files from './pages/files/Files'
import Backups from './pages/backups/Backups'
import Settings from './pages/settings/Settings'
import Account from './pages/account/Account'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import SeltonMelloPrivacyPolicy from './pages/legal/SeltonMelloPrivacyPolicy'
import SeltonMelloTermsOfService from './pages/legal/SeltonMelloTermsOfService'
import { ServerProvider } from './context/ServerContext'
import { ServersProvider } from './context/ServersContext'
import { ToastProvider } from './components/toast/ToastContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PermissionsProvider } from './context/PermissionsContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />
      {/* Public, URL-only legal pages for the Selton Mello Discord bot — not linked
          from any nav/sidebar, and intentionally outside auth/app chrome. */}
      <Route path="/legal/selton-mello-bot/privacy" element={<SeltonMelloPrivacyPolicy />} />
      <Route path="/legal/selton-mello-bot/terms" element={<SeltonMelloTermsOfService />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            {/* ServersProvider wraps ServerProvider: the latter reads
                currentServerId (useServers()) to namespace its status/WS/
                start/stop/properties URLs, so it needs to sit below this in
                the tree. PermissionsProvider's position is free (nothing it
                reads comes from the others), but it must stay above the app
                shell, since Sidebar and Navbar both call usePermissions. */}
            <ServersProvider>
              <ServerProvider>
                <ToastProvider>
                  <PermissionsProvider>
                  <div className="app">
                    <Sidebar />
                    <div className="main-content">
                      <Navbar />
                      <Routes>
                        <Route path="/" element={<Console />} />
                        <Route path="/overview" element={<Overview />} />
                        <Route path="/activity" element={<Activity />} />
                        <Route path="/automations" element={<Automations />} />
                        <Route path="/servers" element={<Servers />} />
                        <Route path="/players" element={<Players />} />
                        <Route path="/performance" element={<Performance />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/server" element={<ServerSetup />} />
                        <Route path="/files" element={<Files />} />
                        <Route path="/backups" element={<Backups />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/account" element={<Account />} />
                      </Routes>
                    </div>
                  </div>
                  </PermissionsProvider>
                </ToastProvider>
              </ServerProvider>
            </ServersProvider>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
