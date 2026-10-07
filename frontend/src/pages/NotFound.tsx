import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="container section center">
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for doesn't exist.</p>
      <Link to="/" className="btn">
        Back to home
      </Link>
    </section>
  )
}
