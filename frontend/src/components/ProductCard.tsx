import { Link } from 'react-router-dom'
import { formatPrice, type CardProduct } from '../api'
import { categoryOf } from '../categories'
import FavoriteButton from './FavoriteButton'

// Used for the Products page, the home page, and products found by the chat.
export default function ProductCard({ product }: { product: CardProduct }) {
  const soldOut = product.total_stock === 0

  // The heart sits next to the link (not inside it), so it's its own button.
  return (
    <div className="product-card-wrap">
      <Link to={`/products/${product.product_id}`} className="product-card">
        <div className="product-image">
          <img src={product.image_url} alt={product.name} loading="lazy" />
          {soldOut && <span className="badge">Sold out</span>}
          <span className="product-cta" aria-hidden="true">
            View details
          </span>
        </div>
        <div className="product-info">
          <p className="eyebrow">{categoryOf(product.garment_type)}</p>
          <h3 className="product-name">{product.name}</h3>
          <p className="product-desc">{product.description}</p>
          <p className="product-price">{formatPrice(product.price)}</p>
        </div>
      </Link>
      <FavoriteButton productId={product.product_id} productName={product.name} />
    </div>
  )
}
