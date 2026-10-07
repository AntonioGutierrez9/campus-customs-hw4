import { Link } from 'react-router-dom'
import { formatPrice, type ProductSummary } from '../api'
import { CATEGORIES, categoryOf } from '../categories'
import { useChat } from '../chatContext'
import { COLLECTIONS } from '../collections'
import ProductCard from '../components/ProductCard'
import { useProducts } from '../useProducts'

/** Up to `count` products, mixing garment types so a row doesn't look repetitive. */
function variedPick(products: ProductSummary[], count: number): ProductSummary[] {
  const groups = CATEGORIES.map((c) => products.filter((p) => categoryOf(p.garment_type) === c))
  const picked: ProductSummary[] = []
  for (let i = 0; picked.length < count && i < products.length; i++) {
    for (const group of groups) if (group[i] && picked.length < count) picked.push(group[i])
  }
  return picked
}

export default function Home() {
  const { products, loading, error } = useProducts()
  const { openChat } = useChat()

  const collections = COLLECTIONS.map((c) => {
    const items = products.filter(c.matches)
    return { ...c, count: items.length, picks: variedPick(items, 4) }
  })
  // Hero photos: the first Yale Classic and the first college piece from the catalogue.
  const heroMain = collections[0]?.picks[0]
  const heroSecond = collections[1]?.picks[0]

  const categories = CATEGORIES.map((name) => {
    const items = products.filter((p) => categoryOf(p.garment_type) === name)
    return { name, count: items.length, cover: items[0] }
  }).filter((c) => c.count > 0)

  const storyImage = products.find((p) => p.name.includes('College Crewneck'))

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">Show your Yale pride</p>
            <h1>
              Make Yale feel like <em>home.</em>
            </h1>
            <p className="hero-lead">
              Welcome to Campus Customs, your place for Yale apparel and merchandise. Whether you are a
              current student, alum, parent, or simply part of the Yale community, we make it easy to
              find something that represents your connection to Yale.
            </p>
            <div className="hero-actions">
              <Link to="/products" className="btn btn-lg">
                Shop All Products
              </Link>
              <button className="btn btn-lg btn-ghost" onClick={() => openChat()}>
                Ask our shopping assistant
              </button>
            </div>
            <p className="hero-note">Campus Customs · A local New Haven store</p>
          </div>

          <div className="hero-visual">
            {heroMain && (
              <Link to={`/products/${heroMain.product_id}`} className="hero-photo hero-photo-main">
                <img src={heroMain.image_url} alt={heroMain.name} />
                <span className="hero-tag">
                  <span>{heroMain.name}</span>
                  <strong>{formatPrice(heroMain.price)}</strong>
                </span>
              </Link>
            )}
            {heroSecond && (
              <Link to={`/products/${heroSecond.product_id}`} className="hero-photo hero-photo-second">
                <img src={heroSecond.image_url} alt={heroSecond.name} />
              </Link>
            )}
            <div className="hero-seal" aria-hidden="true">
              <span>Yale</span>
              <small>New Haven</small>
            </div>
          </div>
        </div>
      </section>

      <section className="ribbon" aria-label="What we carry">
        <div className="container ribbon-items">
          <span>Residential colleges</span>
          <span>Bulldog athletics</span>
          <span>Graduate &amp; professional schools</span>
          <span>Gifts for the Yale family</span>
          <span>Sizes XS – XXL</span>
        </div>
      </section>

      {error && <p className="container notice notice-error">{error}</p>}

      <section className="section container">
        <div className="section-head">
          <div>
            <p className="eyebrow">The shop</p>
            <h2>Shop by category</h2>
          </div>
          <Link to="/products" className="text-link">
            View all {products.length || ''} products →
          </Link>
        </div>
        <div className="category-grid">
          {loading && <p className="muted">Loading categories…</p>}
          {categories.map((c) => (
            <Link
              key={c.name}
              to={`/products?category=${encodeURIComponent(c.name)}`}
              className="category-tile"
            >
              <span className="category-photo">
                {c.cover && <img src={c.cover.image_url} alt="" loading="lazy" />}
              </span>
              <span className="category-name">{c.name}</span>
              <span className="category-count">{c.count} styles</span>
            </Link>
          ))}
        </div>
      </section>

      {collections.map((c, i) => (
        <section key={c.id} className={`collection ${i % 2 ? 'collection-alt' : ''}`}>
          <div className="container">
            <div className="collection-head">
              <div>
                <p className="eyebrow">{c.kicker}</p>
                <h2>{c.title}</h2>
                <p className="collection-blurb">{c.blurb}</p>
              </div>
              <Link to={`/products?collection=${c.id}`} className="btn btn-outline">
                Shop {c.title} · {c.count}
              </Link>
            </div>
            <div className="product-grid product-row">
              {c.picks.map((p) => (
                <ProductCard key={p.product_id} product={p} />
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="home-story">
        <div className="container story-inner">
          {storyImage && (
            <div className="story-image">
              <img src={storyImage.image_url} alt={storyImage.name} loading="lazy" />
            </div>
          )}
          <div className="story-copy">
            <p className="eyebrow">Our story</p>
            <h2>Make Yale Feel Like Home</h2>
            <p>
              For many people, coming to Yale means starting a completely new chapter, sometimes in a
              new city or even a new country. We believe the small things that create a sense of
              belonging can help turn a new place into a home.
            </p>
            <p>
              Find something that represents your school, your community, or simply your Yale
              experience.
            </p>
            <p className="story-tagline">
              Find your community. Show your Yale pride. Make Yale feel like home.
            </p>
            <Link to="/products" className="btn">
              Shop All Products
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
