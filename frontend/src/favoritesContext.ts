// Shares the shopper's favorites (product ids) with every card, page, and the navbar.

import { createContext, useContext } from 'react'

export interface Favorites {
  ids: string[] // newest first
  saved: boolean // true when they're saved to an account, false for a guest visit
  isFavorite: (productId: string) => boolean
  toggle: (productId: string) => void
}

export const FavoritesContext = createContext<Favorites>({
  ids: [],
  saved: false,
  isFavorite: () => false,
  toggle: () => {},
})

export function useFavorites(): Favorites {
  return useContext(FavoritesContext)
}
