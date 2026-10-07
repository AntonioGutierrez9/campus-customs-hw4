import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { useFavorites } from '../favoritesContext'
import { useProducts } from '../useProducts'

export default function Favorites() {
  const { ids, saved } = useFavorites()
  const { products, loading } = useProducts()

  // Product details come from the catalogue; favorites only store ids.
  const byId = new Map(products.map((p) => [p.product_id, p]))
  const favorites = ids.map((id) => byId.get(id)).filter((p) => p !== undefined)

  return (
    <>
      <section className="page-banner">
        <div className="container">
          <h1>Your Favorites</h1>
          <p>The Yale gear you've saved, all in one place.</p>
        </div>
      </section>

      <section className="section container">
        {!saved && (
          <p className="notice favorites-note">
            You're browsing as a guest, so these favorites last until you leave or refresh.{' '}
            <Link to="/login">Log in</Link> or <Link to="/create-account">create an account</Link> to
            keep them, and we'll save the ones you've picked.
          </p>
        )}

        {loading ? (
          <p className="muted">Loading your favorites…</p>
        ) : favorites.length === 0 ? (
          <div className="empty-favorites center">
            <p className="empty-heart" aria-hidden="true">♡</p>
            <h2>Start building your Yale collection</h2>
            <p className="muted">
              Tap the heart on any hoodie, crewneck, or tee you love and it will wait for you here.
            </p>
            <div className="empty-actions">
              <Link to="/products" className="btn">
                Browse products
              </Link>
              <Link to="/products?collection=classics" className="btn btn-outline">
                Start with Yale Classics
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="result-count">
              {favorites.length} {favorites.length === 1 ? 'favorite' : 'favorites'}
            </p>
            <div className="product-grid">
              {favorites.map((p) => (
                <ProductCard key={p.product_id} product={p} />
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}
