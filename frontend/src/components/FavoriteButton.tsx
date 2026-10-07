import type { MouseEvent } from 'react'
import { useFavorites } from '../favoritesContext'

interface Props {
  productId: string
  productName: string
  withLabel?: boolean // product page shows "Save to favorites"; cards show just the heart
}

export default function FavoriteButton({ productId, productName, withLabel = false }: Props) {
  const { isFavorite, toggle } = useFavorites()
  const active = isFavorite(productId)

  function onClick(e: MouseEvent) {
    // Product cards are links, so don't open the product page when tapping the heart.
    e.preventDefault()
    e.stopPropagation()
    toggle(productId)
  }

  return (
    <button
      type="button"
      className={`fav-btn ${withLabel ? 'fav-btn-label' : 'fav-btn-icon'} ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Remove ${productName} from favorites` : `Add ${productName} to favorites`}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 20.5l-1.3-1.2C5.6 14.7 2.5 11.9 2.5 8.4 2.5 5.6 4.7 3.5 7.4 3.5c1.6 0 3.1.7 4.6 2.3 1.5-1.6 3-2.3 4.6-2.3 2.7 0 4.9 2.1 4.9 4.9 0 3.5-3.1 6.3-8.2 10.9L12 20.5z"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      {withLabel && <span>{active ? 'Saved to favorites' : 'Save to favorites'}</span>}
    </button>
  )
}
