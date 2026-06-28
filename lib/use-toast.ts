import { useState, useEffect } from "react"

export type ToastType = "success" | "error" | "info"

export type ToastItem = {
  id: string
  message: string
  type: ToastType
}

type Listener = (items: ToastItem[]) => void

let store: ToastItem[] = []
const listeners = new Set<Listener>()

function broadcast() {
  const snapshot = [...store]
  listeners.forEach(fn => fn(snapshot))
}

export function toast(message: string, type: ToastType = "info") {
  const id = Math.random().toString(36).slice(2, 9)
  store = [...store, { id, message, type }]
  broadcast()
  setTimeout(() => {
    store = store.filter(t => t.id !== id)
    broadcast()
  }, 4000)
}

export function useToastStore(): ToastItem[] {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    setItems([...store])
    listeners.add(setItems)
    return () => {
      listeners.delete(setItems)
    }
  }, [])

  return items
}
