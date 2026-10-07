import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { firstName, type User } from '../auth'
import { useAuth } from '../authContext'
import { useFavorites } from '../favoritesContext'

function initials(user: User): string {
  const first = user.first_name?.[0] ?? user.name[0] ?? ''
  const last = user.last_name?.[0] ?? ''
  return (first + last).toUpperCase()
}

const MAIN_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/products', label: 'Products', end: false },
  { to: '/about', label: 'About Us', end: false },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, checking, logout } = useAuth()
  const favorites = useFavorites()

  return (
    <header className="site-header">
      <div className="announcement">
        Yale apparel &amp; merchandise from a local New Haven store
      </div>
      <nav className="navbar container" aria-label="Main">
        <Link to="/" className="brand" aria-label="Campus Customs home">
          <span className="brand-mark">CC</span>
          <span className="brand-text">
            <span className="brand-name">Campus Customs</span>
            <span className="brand-sub">Yale Bulldog Blue · New Haven</span>
          </span>
        </Link>

        <button
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="nav-links"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="sr-only">Menu</span>
          <span className="menu-bar" />
          <span className="menu-bar" />
          <span className="menu-bar" />
        </button>

        {/* Clicking any link closes the mobile menu. */}
        <div
          id="nav-links"
          className={`nav-links ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen(false)}
        >
          {MAIN_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
              {link.label}
            </NavLink>
          ))}
          <NavLink to="/favorites" className="nav-link nav-favorites">
            Favorites
            {favorites.ids.length > 0 && (
              <span className="nav-badge" aria-label={`${favorites.ids.length} saved`}>
                {favorites.ids.length}
              </span>
            )}
          </NavLink>
          <div className="nav-account">
            {user ? (
              <>
                <span className="nav-user" title={user.email}>
                  <span className="nav-avatar" aria-hidden="true">
                    {initials(user)}
                  </span>
                  Hi, {firstName(user)}
                </span>
                <button className="btn btn-small btn-outline" onClick={() => logout()}>
                  Log out
                </button>
              </>
            ) : (
              !checking && (
                <>
                  <NavLink to="/login" className="nav-link">
                    Log in
                  </NavLink>
                  <NavLink to="/create-account" className="btn btn-small">
                    Create account
                  </NavLink>
                </>
              )
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
