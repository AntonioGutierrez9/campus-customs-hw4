import { Link } from 'react-router-dom'
import { categoryOf } from '../categories'
import { useProducts } from '../useProducts'

export default function About() {
  const { products } = useProducts()
  const image =
    products.find((p) => categoryOf(p.garment_type) === 'Hoodies') ?? products[0]

  return (
    <>
      <section className="page-banner">
        <div className="container">
          <h1>About Campus Customs</h1>
          <p>A local New Haven store for everyone who is part of Yale.</p>
        </div>
      </section>

      <section className="section container about">
        <div className="about-copy">
          <p className="lead">
            Campus Customs is a local New Haven store focused on helping students, alumni, families,
            and visitors show their Yale pride.
          </p>
          <p>
            We offer a wide selection of Yale apparel and merchandise, with options for different
            schools, residential colleges, sports, and members of the Yale community. Our goal is
            simple: make it easy to find Yale gear that you actually want to wear or share with
            someone else.
          </p>
          <h2>Making Yale feel like home</h2>
          <p>
            Being part of Yale means something different to everyone. For some, Yale has been part
            of their lives for years. For others, especially those arriving from another city or
            another country, it is the beginning of a completely new experience. We believe that
            the small things that create a sense of belonging can help turn a new place into a
            home. Wearing something that represents your school, college, or community is one simple
            way to feel part of Yale.
          </p>
          <p>
            Whether you are looking for a Yale sweatshirt for yourself, something from your
            residential college, or a gift for someone in your family, Campus Customs is here to
            help you find it, and hopefully make Yale feel a little more like home.
          </p>
          <Link to="/products" className="btn">
            Shop All Products
          </Link>
        </div>
        {image && (
          <div className="about-image">
            <img src={image.image_url} alt={image.name} />
          </div>
        )}
      </section>
    </>
  )
}
