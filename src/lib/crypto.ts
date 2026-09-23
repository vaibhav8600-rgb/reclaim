/**
 * End-to-end encryption for anything that leaves the device.
 *
 * Key: PBKDF2-SHA256 (600k iterations, OWASP 2023) from the user's passphrase → AES-256-GCM.
 * File: "RCL1" | u32 header length | header JSON | ciphertext.
 * The header (salt, iterations, iv, kind) is authenticated as GCM additional data, so it can't be
 * altered, and any device can re-derive the key from a single file plus the passphrase.
 */

const MAGIC = 'RCL1'
/** Bytes backed by a plain ArrayBuffer, as WebCrypto and Blob require. */
export type Bytes = Uint8Array<ArrayBuffer>
export const KDF_ITERATIONS = 600_000

export interface VaultParams {
  /** base64 */
  salt: string
  iterations: number
}

export interface SealedHeader extends VaultParams {
  v: 1
  kind: 'snapshot' | 'document'
  /** base64 */
  iv: string
  mimeType?: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("That passphrase doesn't match your backups.")
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
export const fromBase64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const newVaultParams = (): VaultParams => ({ salt: toBase64(crypto.getRandomValues(new Uint8Array(16))), iterations: KDF_ITERATIONS })

/** Non-extractable AES key; safe to keep in IndexedDB so the passphrase is needed once per device. */
export async function deriveKey(passphrase: string, params: VaultParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(params.salt), iterations: params.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(key: CryptoKey, plaintext: Bytes | string, header: Omit<SealedHeader, 'v' | 'iv'>): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const headerBytes = enc.encode(JSON.stringify({ v: 1, ...header, iv: toBase64(iv) } satisfies SealedHeader))
  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerBytes }, key, data)
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, headerBytes.length)
  return new Blob([enc.encode(MAGIC), len, headerBytes, ciphertext], { type: 'application/octet-stream' })
}

export function readHeader(buf: ArrayBuffer): { header: SealedHeader; headerBytes: Bytes; body: Bytes } {
  const bytes = new Uint8Array(buf)
  if (dec.decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('Not a Reclaim encrypted file.')
  const len = new DataView(buf).getUint32(4)
  const headerBytes = bytes.slice(8, 8 + len)
  return { header: JSON.parse(dec.decode(headerBytes)) as SealedHeader, headerBytes, body: bytes.slice(8 + len) }
}

export async function open(key: CryptoKey, buf: ArrayBuffer): Promise<Bytes> {
  const { header, headerBytes, body } = readHeader(buf)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(header.iv), additionalData: headerBytes }, key, body)
    return new Uint8Array(plain)
  } catch {
    throw new WrongPassphraseError()
  }
}

export const openText = async (key: CryptoKey, buf: ArrayBuffer) => dec.decode(await open(key, buf))
