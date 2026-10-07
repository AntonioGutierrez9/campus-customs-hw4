// Types and fetch helpers for the FastAPI backend.
// All data comes from data/campus_customs.db through the backend.

export interface Product {
  product_id: string
  name: string
  garment_type: string
  description: string
  colors: string[]
  search_tags: string[]
  price: number
  image_url: string
}

/** The fields a product card needs: catalogue products and chat results both have them. */
export interface CardProduct {
  product_id: string
  name: string
  garment_type: string
  description: string
  price: number
  image_url: string
  total_stock?: number
}

export interface ProductSummary extends Product {
  total_stock: number
  sizes_in_stock: string[] // sizes with at least 1 unit, e.g. ["XS", "M", "XXL"]
  color_family: string | null // main garment color group, e.g. "Navy"; null if unknown
}

export interface SizeStock {
  size: string
  quantity: number
}

export interface ProductDetail extends Product {
  sizes: SizeStock[]
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// The catalogue doesn't change while the site is open, so fetch it once.
let productsPromise: Promise<ProductSummary[]> | null = null

export function fetchProducts(): Promise<ProductSummary[]> {
  if (!productsPromise) {
    productsPromise = getJson<ProductSummary[]>('/api/products').catch((err) => {
      productsPromise = null // allow a retry on the next call
      throw err
    })
  }
  return productsPromise
}

export function fetchProduct(productId: string): Promise<ProductDetail> {
  return getJson<ProductDetail>(`/api/products/${encodeURIComponent(productId)}`)
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}
