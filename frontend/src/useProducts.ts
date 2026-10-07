import { useEffect, useState } from 'react'
import { fetchProducts, type ProductSummary } from './api'

// Loads the full catalogue once and shares it between pages.
export function useProducts() {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchProducts()
      .then((p) => active && setProducts(p))
      .catch(() => active && setError('We could not load products right now. Please try again.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return { products, loading, error }
}
