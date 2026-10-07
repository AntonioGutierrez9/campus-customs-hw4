import { Link } from 'react-router-dom'
import { CATEGORIES } from '../categories'

const YEAR = new Date().getFullYear()

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">Campus Customs</p>
          <p className="footer-tagline">Make Yale feel like home.</p>
          <p className="footer-text">
            Yale apparel and merchandise for students, alumni, families, and everyone who calls
            Yale home. A local New Haven store.
          </p>
        </div>
        <div>
          <p className="footer-heading">Shop</p>
          <ul className="footer-links">
            <li>
              <Link to="/products">All Products</Link>
            </li>
            {CATEGORIES.slice(0, 4).map((c) => (
              <li key={c}>
                <Link to={`/products?category=${encodeURIComponent(c)}`}>{c}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="footer-heading">Campus Customs</p>
          <ul className="footer-links">
            <li>
              <Link to="/about">About Us</Link>
            </li>
            <li>
              <Link to="/login">Log in</Link>
            </li>
            <li>
              <Link to="/create-account">Create account</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        © {YEAR} Campus Customs · New Haven, Connecticut
      </div>
    </footer>
  )
}
