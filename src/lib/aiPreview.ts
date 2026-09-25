import { useSyncExternalStore } from 'react'
import type { AiTask } from '../../shared/ai'
import { getMeta, setMeta } from '../db/repo'

/**
 * "Show what's sent before each AI request" (Settings → AI): every request waits here until the user has seen
 * exactly what will go to the AI and tapped Send. Bulk reading of records asks once for the whole batch.
 */

export const AI_PREVIEW_KEY = 'aiPreview'

export type Preview = { task: AiTask; input: unknown } | { batch: { title: string; fileName: string; size: number }[] }

let pending: { preview: Preview; resolve: (send: boolean) => void } | undefined
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

export const usePendingPreview = () =>
  useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => pending?.preview,
  )

/** Resolves true to send. Straight away when previews are off (the default). */
export async function confirmAiSend(preview: Preview): Promise<boolean> {
  if (!(await getMeta<boolean>(AI_PREVIEW_KEY))) return true
  pending?.resolve(false) // only one at a time
  return new Promise((resolve) => {
    pending = { preview, resolve }
    notify()
  })
}

export function answerPreview(send: boolean, stopAsking = false) {
  if (stopAsking) void setMeta(AI_PREVIEW_KEY, false)
  pending?.resolve(send)
  pending = undefined
  notify()
}

/** Thrown when the user decides not to send: callers treat it as "nothing happened". */
export class AiCancelled extends Error {
  constructor() {
    super('Not sent.')
  }
}
