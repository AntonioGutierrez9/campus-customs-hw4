// Chat client for the floating shopping assistant.
// Sends the shopper's message and the recent conversation to the FastAPI
// backend (POST /api/chat), which runs the PydanticAI agent.

import type { CardProduct } from './api'

/** Product card data from the chat API (always built from the database). */
export type ChatProduct = CardProduct

/** Search results the chat found, shown as product cards on the Products page. */
export interface ChatResults {
  title: string
  products: ChatProduct[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  products?: ChatProduct[] // specific products mentioned, shown as small cards in the bubble
  results?: ChatResults // search results this reply put on the page
  isError?: boolean // error notices are shown but never sent back to the agent
}

/** Which page the shopper is on (PageContext in backend/models.py). Only the path and
 *  product id: the backend looks up prices and stock itself. */
export interface PageInfo {
  path: string
  product_id: string | null
}

/** Shape of the POST /api/chat response (ChatResponse in backend/models.py). */
export interface ChatReply {
  reply: string
  products: ChatProduct[] // search results to show on the page
  results_title: string | null
  mentioned_products: ChatProduct[]
}

/** `messages` is the whole conversation; the last one is the new user message. */
export async function sendChatMessage(messages: ChatMessage[], page: PageInfo): Promise<ChatReply> {
  const latest = messages[messages.length - 1]
  const earlier = messages.slice(0, -1).filter((m) => !m.isError)
  // Start the history at the shopper's first message (skip the greeting bubble).
  const firstUser = earlier.findIndex((m) => m.role === 'user')
  const history = (firstUser === -1 ? [] : earlier.slice(firstUser))
    .slice(-12)
    .map(({ role, content }) => ({ role, content }))

  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // history is only used for guests; logged-in chats come from the database.
      body: JSON.stringify({ message: latest.content, history, page }),
    })
  } catch {
    throw new Error("I couldn't reach the Campus Customs server. Please check your connection and try again.")
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    throw new Error(data?.detail ?? 'Sorry, something went wrong on our end. Please try again in a moment.')
  }
  return data as ChatReply
}

/** One saved message from GET /api/chat/history (ChatHistoryMessage in backend/models.py). */
interface SavedMessage {
  role: 'user' | 'assistant'
  content: string
  products: ChatProduct[]
  results_title: string | null
  mentioned_products: ChatProduct[]
}

/** The logged-in shopper's saved chat (the backend only ever returns their own). */
export async function fetchChatHistory(): Promise<ChatMessage[]> {
  const res = await fetch('/api/chat/history')
  if (!res.ok) return []
  const data: { messages: SavedMessage[] } = await res.json()
  return data.messages.map((m) => ({
    role: m.role,
    content: m.content,
    products: m.mentioned_products,
    results: m.products.length
      ? { title: m.results_title || 'Products from your chat', products: m.products }
      : undefined,
  }))
}
