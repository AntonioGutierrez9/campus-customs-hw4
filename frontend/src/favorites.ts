// Favorites API (logged-in shoppers only). Guests keep favorites in memory in
// App.tsx, so they last for the current visit and disappear on refresh.

async function call(method: string, url: string): Promise<string[]> {
  const res = await fetch(url, { method })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()).product_ids
}

export const fetchFavorites = () => call('GET', '/api/favorites')

export const addFavorite = (productId: string) =>
  call('PUT', `/api/favorites/${encodeURIComponent(productId)}`)

export const removeFavorite = (productId: string) =>
  call('DELETE', `/api/favorites/${encodeURIComponent(productId)}`)
