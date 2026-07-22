import { useState } from 'react'
import Workbench from './Workbench'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { getCurrentUser, getToken, removeToken } from './lib/auth'
import type { User } from './lib/auth'

export default function App() {
  const [session, setSession] = useState<User | null | false>(() => getToken() ? getCurrentUser() : false)
  const [showRegister, setShowRegister] = useState(false)

  const handleAuthSuccess = (user: User) => {
    setSession(user)
  }

  const handleLogout = () => {
    removeToken()
    setSession(false)
    setShowRegister(false)
  }

  if (session === false) {
    return showRegister ? (
      <RegisterPage
        onRegisterSuccess={handleAuthSuccess}
        onToggleLogin={() => setShowRegister(false)}
      />
    ) : (
      <LoginPage
        onLoginSuccess={handleAuthSuccess}
        onToggleRegister={() => setShowRegister(true)}
      />
    )
  }

  return <Workbench currentUser={session} onLogout={handleLogout} />
}
