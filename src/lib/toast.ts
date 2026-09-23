import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  message: string
  action?: { label: string; onClick: () => void }
}

let current: Toast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, action?: Toast['action']) {
  current = { id: Date.now(), message, action }
  clearTimeout(timer)
  timer = setTimeout(dismissToast, action ? 5000 : 2600)
  emit()
}

export function dismissToast() {
  current = null
  emit()
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
