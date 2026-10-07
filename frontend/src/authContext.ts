// Shares the logged-in user with every page (navbar, login, create account).

import { createContext, useContext } from 'react'
import type { SignupData, User } from './auth'

export interface AuthState {
  user: User | null
  checking: boolean // true while we ask the backend who is logged in
  login: (email: string, password: string) => Promise<User>
  signup: (data: SignupData) => Promise<User>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  user: null,
  checking: true,
  login: () => Promise.reject(new Error('not ready')),
  signup: () => Promise.reject(new Error('not ready')),
  logout: () => Promise.resolve(),
})

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
