import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import * as authApi from './auth'
import type { ChatResults } from './chat'
import { AuthContext, type AuthState } from './authContext'
import ChatWidget from './components/ChatWidget'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import Toast from './components/Toast'
import { ChatContext } from './chatContext'
import * as favoritesApi from './favorites'
import { FavoritesContext, type Favorites } from './favoritesContext'
import FavoritesPage from './pages/Favorites'
import About from './pages/About'
import CreateAccount from './pages/CreateAccount'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import ProductDetail from './pages/ProductDetail'
import Products from './pages/Products'

const NO_FAVORITES: string[] = []

export default function App() {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const { pathname } = useLocation()

  // Start each new page at the top, like a normal website.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const openChat = (draft = '') => {
    setChatDraft(draft)
    setChatOpen(true)
  }

  // ----- Products found by the chat -----
  // When the chat API returns search results, keep them here and show them on
  // the Products page (/products?view=chat) without reloading the page.
  const navigate = useNavigate()
  const [chatResults, setChatResults] = useState<ChatResults | null>(null)

  const showChatResults = useCallback(
    (results: ChatResults) => {
      setChatResults(results)
      navigate('/products?view=chat')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // On phones the chat covers the screen, so close it to reveal the cards.
      if (window.matchMedia('(max-width: 760px)').matches) setChatOpen(false)
    },
    [navigate],
  )

  // ----- Login state -----
  const [user, setUser] = useState<authApi.User | null>(null)
  const [checking, setChecking] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  // On page load, ask the backend whether the session cookie is still valid.
  useEffect(() => {
    authApi
      .fetchCurrentUser()
      .then(setUser)
      .finally(() => setChecking(false))
  }, [])

  const auth: AuthState = {
    user,
    checking,
    async login(email, password) {
      const u = await authApi.login(email, password)
      setUser(u)
      setToast(`Welcome back, ${authApi.firstName(u)}! You're logged in.`)
      return u
    },
    async signup(data) {
      const u = await authApi.signup(data)
      setUser(u)
      setToast(`Welcome to Campus Customs, ${authApi.firstName(u)}! Your account is ready.`)
      return u
    },
    async logout() {
      await authApi.logout()
      setUser(null)
      setToast("You've been logged out.")
    },
  }

  // ----- Favorites -----
  // Guests: kept in memory for this visit only. Logged in: loaded from and saved
  // to the favorites table. Like the chat, the list belongs to whoever is logged
  // in, so logging out hides it right away.
  const favOwner = user?.id ?? null
  const [favState, setFavState] = useState<{ owner: number | null; ids: string[] }>({
    owner: null,
    ids: [],
  })
  const favoriteIds = favState.owner === favOwner ? favState.ids : NO_FAVORITES
  const guestFavorites = useRef<string[]>([]) // carried into the account on login

  useEffect(() => {
    if (favOwner === null) return
    let active = true
    const fromGuestVisit = guestFavorites.current
    ;(async () => {
      for (const id of fromGuestVisit) await favoritesApi.addFavorite(id).catch(() => null)
      const ids = await favoritesApi.fetchFavorites().catch(() => [])
      if (active) {
        guestFavorites.current = []
        setFavState({ owner: favOwner, ids })
      }
    })()
    return () => {
      active = false
    }
  }, [favOwner])

  async function toggleFavorite(productId: string) {
    const had = favoriteIds.includes(productId)
    const next = had ? favoriteIds.filter((id) => id !== productId) : [productId, ...favoriteIds]
    setFavState({ owner: favOwner, ids: next }) // update the heart right away
    if (favOwner === null) {
      guestFavorites.current = next
      return
    }
    try {
      const saved = had
        ? await favoritesApi.removeFavorite(productId)
        : await favoritesApi.addFavorite(productId)
      setFavState((f) => (f.owner === favOwner ? { owner: favOwner, ids: saved } : f))
    } catch {
      setFavState((f) => (f.owner === favOwner ? { owner: favOwner, ids: favoriteIds } : f))
      setToast("Sorry, we couldn't update your favorites. Please try again.")
    }
  }

  const favorites: Favorites = {
    ids: favoriteIds,
    saved: favOwner !== null,
    isFavorite: (id) => favoriteIds.includes(id),
    toggle: toggleFavorite,
  }

  return (
    <AuthContext.Provider value={auth}>
    <FavoritesContext.Provider value={favorites}>
    <ChatContext.Provider value={{ openChat, chatResults }}>
      <Navbar />
      <main className="site-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:productId" element={<ProductDetail />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <ChatWidget
        open={chatOpen}
        onOpenChange={setChatOpen}
        draft={chatDraft}
        onDraftChange={setChatDraft}
        onResults={showChatResults}
      />
      {toast && <Toast message={toast} onDone={clearToast} />}
    </ChatContext.Provider>
    </FavoritesContext.Provider>
    </AuthContext.Provider>
  )
}
