// Lets any page open the floating chat (optionally with a pre-filled question,
// e.g. the "Ask about this item" button) and read the products the chat found.

import { createContext, useContext } from 'react'
import type { ChatResults } from './chat'

export interface ChatControls {
  openChat: (draft?: string) => void
  chatResults: ChatResults | null // latest search results from the chat, if any
}

export const ChatContext = createContext<ChatControls>({ openChat: () => {}, chatResults: null })

export function useChat(): ChatControls {
  return useContext(ChatContext)
}
