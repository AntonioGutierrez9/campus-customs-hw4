import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'
import LoggedInCard from '../components/LoggedInCard'

export default function CreateAccount() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '')
    // Quick checks in the browser; the backend checks everything again.
    if (!value('first_name').trim() || !value('last_name').trim()) {
      setError('Please enter your first and last name.')
      return
    }
    if (value('password') !== value('confirm')) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await signup({
        first_name: value('first_name'),
        last_name: value('last_name'),
        email: value('email'),
        password: value('password'),
        confirm_password: value('confirm'),
      })
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
        <h1>Create account</h1>
        <p className="muted">Join Campus Customs to save your chats and find your Yale gear faster.</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="form-row">
            <label>
              First name
              <input className="input" name="first_name" autoComplete="given-name" maxLength={50} required />
            </label>
            <label>
              Last name
              <input className="input" name="last_name" autoComplete="family-name" maxLength={50} required />
            </label>
          </div>
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
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <span className="field-hint">At least 8 characters.</span>
          </label>
          <label>
            Confirm password
            <input
              className="input"
              type="password"
              name="confirm"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </section>
  )
}
