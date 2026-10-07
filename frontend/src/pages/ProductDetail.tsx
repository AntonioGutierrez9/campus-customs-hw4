import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProduct, formatPrice, type ProductDetail as Detail } from '../api'
import { categoryOf } from '../categories'
import { useChat } from '../chatContext'
import FavoriteButton from '../components/FavoriteButton'

const LOW_STOCK = 5

interface Loaded {
  id: string
  status: 'ok' | 'missing' | 'error'
  product?: Detail
}

export default function ProductDetail() {
  const { productId = '' } = useParams()
  const { openChat } = useChat()
  // Results and the chosen size are tagged with the product id, so switching to
  // another product shows "loading" and clears the size without extra effects.
  const [result, setResult] = useState<Loaded | null>(null)
  const [selection, setSelection] = useState<{ id: string; size: string } | null>(null)

  useEffect(() => {
    let active = true
    fetchProduct(productId)
      .then((p) => active && setResult({ id: productId, status: 'ok', product: p }))
      .catch(
        (err: Error) =>
          active &&
          setResult({ id: productId, status: err.message.startsWith('404') ? 'missing' : 'error' }),
      )
    return () => {
      active = false
    }
  }, [productId])

  const status = result?.id === productId ? result.status : 'loading'
  const product = result?.id === productId ? result.product : undefined
  const selected = selection?.id === productId ? selection.size : null
  const setSelected = (size: string) => setSelection({ id: productId, size })

  if (status === 'loading') return <p className="container section muted">Loading product…</p>
  if (status !== 'ok' || !product) {
    return (
      <section className="container section center">
        <h1>{status === 'missing' ? 'Product not found' : 'Something went wrong'}</h1>
        <p className="muted">
          {status === 'missing'
            ? "We couldn't find that item in our catalogue."
            : 'We could not load this product right now. Please try again.'}
        </p>
        <Link to="/products" className="btn">
          Back to all products
        </Link>
      </section>
    )
  }

  const category = categoryOf(product.garment_type)
  const inStockSizes = product.sizes.filter((s) => s.quantity > 0)
  const selectedStock = product.sizes.find((s) => s.size === selected)

  return (
    <section className="container section">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span>/</span> <Link to="/products">Products</Link> <span>/</span>{' '}
        <Link to={`/products?category=${encodeURIComponent(category)}`}>{category}</Link>{' '}
        <span>/</span> <span aria-current="page">{product.name}</span>
      </nav>

      <div className="detail">
        <div className="detail-image">
          <img src={product.image_url} alt={product.name} />
        </div>

        <div className="detail-info">
          <p className="eyebrow">{product.garment_type}</p>
          <h1 className="detail-name">{product.name}</h1>
          <div className="detail-price-row">
            <p className="detail-price">{formatPrice(product.price)}</p>
            <FavoriteButton productId={product.product_id} productName={product.name} withLabel />
          </div>
          <p className="detail-desc">{product.description}</p>

          <div className="detail-block">
            <p className="detail-label">Colors in this design</p>
            <div className="color-list">
              {product.colors.map((c) => (
                <span key={c} className="color-pill">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="detail-block">
            <p className="detail-label">
              Size{selected ? `: ${selected}` : ''}
              <span className="muted"> · {inStockSizes.length} of {product.sizes.length} sizes in stock</span>
            </p>
            <div className="size-grid">
              {product.sizes.map((s) => {
                const out = s.quantity === 0
                return (
                  <button
                    key={s.size}
                    className={`size-btn ${out ? 'is-out' : ''} ${selected === s.size ? 'is-selected' : ''}`}
                    disabled={out}
                    onClick={() => setSelected(s.size)}
                    title={out ? `${s.size}: out of stock` : `${s.size}: ${s.quantity} in stock`}
                    aria-label={out ? `${s.size}, out of stock` : `${s.size}, ${s.quantity} in stock`}
                  >
                    {s.size}
                  </button>
                )
              })}
            </div>
            <p className="stock-note">
              {selectedStock
                ? selectedStock.quantity <= LOW_STOCK
                  ? `Only ${selectedStock.quantity} left in size ${selectedStock.size}`
                  : `In stock: ${selectedStock.quantity} available in size ${selectedStock.size}`
                : inStockSizes.length > 0
                  ? 'Select a size to see availability. Crossed-out sizes are sold out.'
                  : 'This item is currently sold out in every size.'}
            </p>
          </div>

          <button
            className="btn btn-block"
            onClick={() => openChat(`Can you tell me more about the ${product.name}?`)}
          >
            Ask our assistant about this item
          </button>
          <Link to="/products" className="text-link back-link">
            ← Continue shopping
          </Link>
        </div>
      </div>
    </section>
  )
}
