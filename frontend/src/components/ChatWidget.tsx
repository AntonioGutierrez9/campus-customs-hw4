import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, matchPath, useLocation } from 'react-router-dom'
import { formatPrice } from '../api'
import { firstName } from '../auth'
import { useAuth } from '../authContext'
import {
  fetchChatHistory,
  sendChatMessage,
  type ChatMessage,
  type ChatResults,
  type PageInfo,
} from '../chat'

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi, welcome to Campus Customs! I'm your shopping assistant. Ask me about Yale gear, prices, sizes, or gift ideas.",
}

const WELCOME_ONLY: ChatMessage[] = [WELCOME]

const SUGGESTIONS = ['Show me navy hoodies', 'Gift ideas for a parent', 'Which crewnecks come in size L?']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: string
  onDraftChange: (draft: string) => void
  onResults: (results: ChatResults) => void // show search results on the page
}

// The database's older replies use **bold**; the chat shows plain text.
const plainText = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1')

export default function ChatWidget({ open, onOpenChange, draft, onDraftChange, onResults }: Props) {
  const { user } = useAuth()
  const location = useLocation()

  // The conversation belongs to whoever is logged in (null = guest). When the
  // user changes (log in / log out), the old conversation is hidden right away
  // and a logged-in user's saved chat is loaded from the backend.
  const owner = user?.id ?? null
  const [chat, setChat] = useState<{ owner: number | null; messages: ChatMessage[] }>({
    owner: null,
    messages: WELCOME_ONLY,
  })
  const messages = chat.owner === owner ? chat.messages : WELCOME_ONLY
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (owner === null) return
    let active = true
    fetchChatHistory().then((saved) => {
      if (active) setChat({ owner, messages: [WELCOME, ...saved] })
    })
    return () => {
      active = false
    }
  }, [owner])

  // Tell the agent which page is open; on a product page, which product.
  const productPage = matchPath('/products/:productId', location.pathname)
  const page: PageInfo = {
    path: location.pathname + location.search,
    product_id: productPage?.params.productId ?? null,
  }

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open]) // messages only changes when the chat does

  // Focus the input when the panel opens; close it with Escape.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    const history: ChatMessage[] = [...messages, { role: 'user', content }]
    setChat({ owner, messages: history })
    // Add the reply only if the same person is still logged in.
    const addMessage = (msg: ChatMessage) =>
      setChat((c) => (c.owner === owner ? { owner, messages: [...c.messages, msg] } : c))
    onDraftChange('')
    setSending(true)
    try {
      const data = await sendChatMessage(history, page)
      // Search results come back as structured data, separate from the text.
      const results = data.products.length
        ? { title: data.results_title || 'Products from your chat', products: data.products }
        : undefined
      addMessage({ role: 'assistant', content: data.reply, products: data.mentioned_products, results })
      if (results) onResults(results)
    } catch (err) {
      addMessage({ role: 'assistant', content: (err as Error).message, isError: true })
    } finally {
      setSending(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(draft)
  }

  return (
    <div className="chat-root">
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Campus Customs shopping assistant">
          <header className="chat-header">
            <span className="chat-avatar">CC</span>
            <div className="chat-title">
              <p className="chat-name">Campus Customs</p>
              <p className="chat-status">
                {user ? `Hi ${firstName(user)}! Your chat is saved` : 'Log in to save your chat'}
              </p>
            </div>
            <button className="chat-close" onClick={() => onOpenChange(false)} aria-label="Close chat">
              ×
            </button>
          </header>

          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.role} ${m.isError ? 'chat-msg-error' : ''}`}>
                <p className="chat-bubble">{plainText(m.content)}</p>
                {m.results && (
                  <button className="chat-results-note" onClick={() => onResults(m.results!)}>
                    <span aria-hidden="true">▦</span> {m.results.products.length}{' '}
                    {m.results.products.length === 1 ? 'product' : 'products'} on the page · View
                  </button>
                )}
                {m.products && m.products.length > 0 && (
                  <div className="chat-products">
                    {m.products.map((p) => (
                      <Link
                        key={p.product_id}
                        to={`/products/${p.product_id}`}
                        className="chat-product"
                      >
                        <span className="chat-product-image">
                          <img src={p.image_url} alt="" />
                        </span>
                        <span className="chat-product-name">{p.name}</span>
                        <span className="chat-product-price">{formatPrice(p.price)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="chat-msg chat-msg-assistant">
                <p className="chat-bubble chat-typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </p>
              </div>
            )}
            {messages.length === 1 && !sending && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="chat-input" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder="Ask about Yale gear…"
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
            />
            <button type="submit" className="chat-send" disabled={!draft.trim() || sending}>
              Send
            </button>
          </form>
        </section>
      )}

      <button
        className={`chat-launcher ${open ? 'is-open' : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-label={open ? 'Close shopping assistant' : 'Open shopping assistant'}
        aria-expanded={open}
      >
        {open ? (
          <span className="chat-launcher-x">×</span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
              />
            </svg>
            <span className="chat-launcher-label">Ask Campus Customs</span>
          </>
        )}
      </button>
    </div>
  )
}
