export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches

/** Ask the browser not to evict IndexedDB. Safari grants this for Home Screen apps. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function storageStatus() {
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  const estimate = await navigator.storage?.estimate?.()
  return { persisted, usage: estimate?.usage, quota: estimate?.quota }
}

export function formatBytes(n?: number) {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

/** A photo cropped to a centred square and shrunk to `side` px, as a JPEG data URL (small enough to sync). */
export async function squarePhoto(file: Blob, side = 256): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const crop = Math.min(bitmap.width, bitmap.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: side, height: side })
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side)
  return canvas.toDataURL('image/jpeg', 0.85)
}
