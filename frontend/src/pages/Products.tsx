import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatPrice, type ProductSummary } from '../api'
import { CATEGORIES, categoryOf } from '../categories'
import { useChat } from '../chatContext'
import { collectionById } from '../collections'
import ProductCard from '../components/ProductCard'
import { useProducts } from '../useProducts'

type Sort = 'name' | 'price-asc' | 'price-desc'

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

// Price ranges that fit the catalogue's prices ($32–$98).
const PRICE_RANGES = [
  { id: 'under-40', label: 'Under $40', min: 0, max: 40 },
  { id: '40-60', label: '$40 – $60', min: 40, max: 60 },
  { id: '60-80', label: '$60 – $80', min: 60, max: 80 },
  { id: '80-up', label: '$80 & up', min: 80, max: Infinity },
]

// Swatch colors for the main-color groups the API returns.
const SWATCHES: Record<string, string> = {
  Navy: '#1d2d55',
  Gray: '#9aa1a9',
  'Cream & White': '#f2ead7',
  Coral: '#e98a74',
}

interface Filters {
  collection: string | null // a home-page collection id (classics, colleges, game-day)
  category: string // 'All' or a category name
  colors: string[]
  sizes: string[] // in stock in at least one of these sizes
  price: string | null // a PRICE_RANGES id
}

type Facet = keyof Filters

function matches(p: ProductSummary, f: Filters, skip?: Facet): boolean {
  const collection = collectionById(f.collection)
  if (skip !== 'collection' && collection && !collection.matches(p)) return false
  if (skip !== 'category' && f.category !== 'All' && categoryOf(p.garment_type) !== f.category) return false
  if (skip !== 'colors' && f.colors.length && !(p.color_family && f.colors.includes(p.color_family))) return false
  if (skip !== 'sizes' && f.sizes.length && !f.sizes.some((s) => p.sizes_in_stock.includes(s))) return false
  if (skip !== 'price' && f.price) {
    const range = PRICE_RANGES.find((r) => r.id === f.price)
    if (range && !(p.price >= range.min && p.price < range.max)) return false
  }
  return true
}

/** How many products each option would show, given the other filters. */
function countBy(products: ProductSummary[], f: Filters, facet: Facet, key: (p: ProductSummary) => string[]) {
  const counts: Record<string, number> = {}
  for (const p of products) {
    if (!matches(p, f, facet)) continue
    for (const k of key(p)) counts[k] = (counts[k] ?? 0) + 1
  }
  return counts
}

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])

export default function Products() {
  const { products, loading, error } = useProducts()
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false) // phones: filters slide open
  const { chatResults } = useChat()

  // Filters live in the URL (?category=Hoodies&color=Navy&size=M&price=40-60&sort=price-asc),
  // so links can point to them and Back from a product page keeps them.
  const filters: Filters = {
    collection: collectionById(params.get('collection'))?.id ?? null,
    category: params.get('category') ?? 'All',
    colors: list(params.get('color')),
    sizes: list(params.get('size')),
    price: params.get('price'),
  }
  const sort = (params.get('sort') as Sort) || 'name'

  function update(changes: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      const v = Array.isArray(value) ? value.join(',') : value
      if (v && v !== 'All' && v !== 'name') next.set(key, v)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }
  const toggleIn = (values: string[], v: string) =>
    values.includes(v) ? values.filter((x) => x !== v) : [...values, v]

  const activeCount =
    (filters.collection ? 1 : 0) +
    (filters.category !== 'All' ? 1 : 0) + filters.colors.length + filters.sizes.length + (filters.price ? 1 : 0)
  const clearAll = () => update({ collection: null, category: null, color: null, size: null, price: null })
  const collection = collectionById(filters.collection)

  // Only ~100 products, so filtering on every render is instant.
  const filtered = products.filter((p) => matches(p, filters))
  const visible =
    sort === 'price-asc'
      ? [...filtered].sort((a, b) => a.price - b.price)
      : sort === 'price-desc'
        ? [...filtered].sort((a, b) => b.price - a.price)
        : filtered // already sorted by name from the API

  const categoryCounts = countBy(products, filters, 'category', (p) => [categoryOf(p.garment_type)])
  const colorCounts = countBy(products, filters, 'colors', (p) => (p.color_family ? [p.color_family] : []))
  const sizeCounts = countBy(products, filters, 'sizes', (p) => p.sizes_in_stock)
  const priceCounts = countBy(products, filters, 'price', (p) =>
    PRICE_RANGES.filter((r) => p.price >= r.min && p.price < r.max).map((r) => r.id),
  )
  const colorOptions = Object.keys(SWATCHES).filter((c) => products.some((p) => p.color_family === c))
  const prices = products.map((p) => p.price)

  // /products?view=chat shows the products the chat assistant found, using the
  // same banner, grid, and ProductCard as the normal catalogue view.
  if (params.get('view') === 'chat' && chatResults) {
    const count = chatResults.products.length
    return (
      <>
        <section className="page-banner">
          <div className="container">
            <p className="banner-kicker">From your shopping assistant</p>
            <h1>{chatResults.title}</h1>
            <p>
              {count} {count === 1 ? 'product' : 'products'} from our catalogue that match what you
              asked for.
            </p>
          </div>
        </section>
        <section className="section container">
          <div className="results-bar">
            <p className="result-count">
              {count} {count === 1 ? 'product' : 'products'}
            </p>
            <Link to="/products" className="text-link">
              ← Show all products
            </Link>
          </div>
          <div className="product-grid">
            {chatResults.products.map((p) => (
              <ProductCard key={p.product_id} product={p} />
            ))}
          </div>
        </section>
      </>
    )
  }

  // Active filters as removable pills above the grid.
  const pills = [
    ...(collection ? [{ label: collection.title, clear: () => update({ collection: null }) }] : []),
    ...(filters.category !== 'All' ? [{ label: filters.category, clear: () => update({ category: null }) }] : []),
    ...filters.colors.map((c) => ({ label: c, clear: () => update({ color: toggleIn(filters.colors, c) }) })),
    ...filters.sizes.map((s) => ({ label: `Size ${s}`, clear: () => update({ size: toggleIn(filters.sizes, s) }) })),
    ...(filters.price
      ? [{ label: PRICE_RANGES.find((r) => r.id === filters.price)?.label ?? '', clear: () => update({ price: null }) }]
      : []),
  ]

  return (
    <>
      <section className="page-banner">
        <div className="container">
          {collection && <p className="banner-kicker">{collection.kicker}</p>}
          <h1>
            {collection
              ? collection.title
              : filters.category === 'All'
                ? 'All Products'
                : filters.category}
          </h1>
          <p>
            {collection?.blurb ??
              'Yale sweatshirts, hoodies, tees and more, all ready to show your Bulldog pride.'}
          </p>
        </div>
      </section>

      <section className="section container shop-layout">
        <aside className={`filters ${filtersOpen ? 'is-open' : ''}`} aria-label="Product filters">
          <div className="filters-head">
            <h2>Filters</h2>
            {activeCount > 0 && (
              <button className="text-button" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>

          <div className="filter-group" role="group" aria-label="Product type">
            <p className="filter-title">Product type</p>
            {['All', ...CATEGORIES].map((c) => (
              <label key={c} className="filter-option">
                <input
                  type="radio"
                  name="category"
                  checked={filters.category === c}
                  onChange={() => update({ category: c })}
                />
                <span>{c}</span>
                <span className="filter-count">
                  {c === 'All'
                    ? Object.values(categoryCounts).reduce((a, b) => a + b, 0)
                    : (categoryCounts[c] ?? 0)}
                </span>
              </label>
            ))}
          </div>

          <div className="filter-group" role="group" aria-label="Color">
            <p className="filter-title">Color</p>
            <div className="swatches">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  className={`swatch ${filters.colors.includes(c) ? 'is-active' : ''}`}
                  aria-pressed={filters.colors.includes(c)}
                  onClick={() => update({ color: toggleIn(filters.colors, c) })}
                  disabled={!colorCounts[c] && !filters.colors.includes(c)}
                >
                  <span className="swatch-dot" style={{ background: SWATCHES[c] }} />
                  {c} <span className="filter-count">{colorCounts[c] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group" role="group" aria-label="In stock in size">
            <p className="filter-title">In stock in size</p>
            <div className="size-filter">
              {SIZES.map((s) => (
                <button
                  key={s}
                  className={`size-chip ${filters.sizes.includes(s) ? 'is-active' : ''}`}
                  aria-pressed={filters.sizes.includes(s)}
                  onClick={() => update({ size: toggleIn(filters.sizes, s) })}
                  title={`${sizeCounts[s] ?? 0} products in stock in ${s}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="filter-hint">Only shows products with that size in stock.</p>
          </div>

          <div className="filter-group" role="group" aria-label="Price">
            <p className="filter-title">Price</p>
            {PRICE_RANGES.map((r) => (
              <label key={r.id} className="filter-option">
                <input
                  type="radio"
                  name="price"
                  checked={filters.price === r.id}
                  onChange={() => update({ price: r.id })}
                  disabled={!priceCounts[r.id] && filters.price !== r.id}
                />
                <span>{r.label}</span>
                <span className="filter-count">{priceCounts[r.id] ?? 0}</span>
              </label>
            ))}
            {filters.price && (
              <button className="text-button" onClick={() => update({ price: null })}>
                Any price
              </button>
            )}
            {prices.length > 0 && (
              <p className="filter-hint">
                Prices range from {formatPrice(Math.min(...prices))} to {formatPrice(Math.max(...prices))}.
              </p>
            )}
          </div>

          <button className="btn btn-block filters-done" onClick={() => setFiltersOpen(false)}>
            Show {visible.length} products
          </button>
        </aside>

        <div className="shop-results">
          <div className="shop-toolbar">
            <button className="btn btn-small btn-outline filters-toggle" onClick={() => setFiltersOpen(true)}>
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
            {loading ? (
              <p className="muted">Loading products…</p>
            ) : (
              <p className="result-count">
                {visible.length} {visible.length === 1 ? 'product' : 'products'}
              </p>
            )}
            <label className="sort-control">
              Sort by
              <select className="input" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                <option value="name">Name A–Z</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
          </div>

          {pills.length > 0 && (
            <div className="active-filters">
              {pills.map((pill) => (
                <button key={pill.label} className="filter-pill" onClick={pill.clear}>
                  {pill.label} <span aria-hidden="true">×</span>
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button className="text-button" onClick={clearAll}>
                Clear all
              </button>
            </div>
          )}

          {error && <p className="notice notice-error">{error}</p>}

          <div className="product-grid">
            {visible.map((p) => (
              <ProductCard key={p.product_id} product={p} />
            ))}
          </div>

          {!loading && !error && visible.length === 0 && (
            <div className="empty center">
              <p className="muted">No products match these filters.</p>
              <button className="btn" onClick={clearAll}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
