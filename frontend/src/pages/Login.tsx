import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'
import LoggedInCard from '../components/LoggedInCard'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await login(String(form.get('email')), String(form.get('password')))
      navigate('/')
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  if (user && !submitting) return <LoggedInCard user={user} />

  return (
    <section className="auth-page container">
      <div className="auth-card">
        <h1>Log in</h1>
        <p className="muted">Welcome back! Log in to chat with our assistant and keep your history.</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input className="input" type="email" name="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-block" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-switch">
          New to Campus Customs? <Link to="/create-account">Create an account</Link>
        </p>
      </div>
    </section>
  )
}
