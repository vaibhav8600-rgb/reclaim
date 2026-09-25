import { lazy, Suspense } from 'react'
import { usePendingPreview } from '../lib/aiPreview'

const AiPreviewSheet = lazy(() => import('./AiPreview').then((m) => ({ default: m.AiPreviewSheet })))

/** Mounted once at the app root; the sheet itself loads only when a preview is waiting. */
export function AiPreviewHost() {
  const preview = usePendingPreview()
  return preview ? <Suspense fallback={null}><AiPreviewSheet preview={preview} /></Suspense> : null
}
