// Account API calls. The backend keeps login state in an HttpOnly session
// cookie, so nothing about the login (and never the password) is stored in
// localStorage or readable by this code.

export interface User {
  id: number
  first_name: string | null
  last_name: string | null
  name: string
  email: string
}

export interface SignupData {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
}

async function postJson(url: string, body?: unknown): Promise<{ user: User | null }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Something went wrong. Please try again.')
  return data
}

export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) return null
  return (await res.json()).user
}

export async function login(email: string, password: string): Promise<User> {
  return (await postJson('/api/auth/login', { email, password })).user!
}

export async function signup(data: SignupData): Promise<User> {
  return (await postJson('/api/auth/signup', data)).user!
}

export async function logout(): Promise<void> {
  await postJson('/api/auth/logout')
}

export function firstName(user: User): string {
  return user.first_name || user.name.split(' ')[0]
}
