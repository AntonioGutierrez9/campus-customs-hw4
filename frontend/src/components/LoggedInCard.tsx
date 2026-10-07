import { Link } from 'react-router-dom'
import { firstName, type User } from '../auth'
import { useAuth } from '../authContext'

// Shown on the Log in / Create account pages when someone is already logged in.
export default function LoggedInCard({ user }: { user: User }) {
  const { logout } = useAuth()
  return (
    <section className="auth-page container">
      <div className="auth-card center">
        <h1>You're logged in</h1>
        <p className="muted">
          Hi {firstName(user)}, you're signed in as <strong>{user.email}</strong>.
        </p>
        <div className="auth-actions">
          <Link to="/products" className="btn btn-block">
            Continue shopping
          </Link>
          <button className="btn btn-block btn-outline" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </div>
    </section>
  )
}
