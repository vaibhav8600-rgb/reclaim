/**
 * Photos of a multi-page report → one PDF record, each photo a page. A PDF keeps the pages together everywhere a
 * record goes (storage, Drive, preview), and the AI reads it page by page, so findings can say which page.
 * A minimal PDF 1.4 writer: JPEG pages embedded as-is (DCTDecode), no library.
 */

export interface PdfImage {
  jpeg: Uint8Array
  width: number
  height: number
}

/** Page width in points (A4); each page's height follows its photo. */
const PAGE_WIDTH = 595

export function imagesToPdf(images: PdfImage[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b
    parts.push(bytes)
    length += bytes.length
  }
  const obj = (n: number, ...body: (Uint8Array | string)[]) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    body.forEach(push)
    push('\nendobj\n')
  }

  push('%PDF-1.4\n%âãÏÓ\n') // the second line marks the file as binary
  // 1 catalog, 2 page tree, then per page: page, content, image
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${images.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${images.length} >>`)
  images.forEach((img, i) => {
    const p = 3 + 3 * i
    const h = Math.round((PAGE_WIDTH * img.height) / img.width)
    const draw = `q ${PAGE_WIDTH} 0 0 ${h} 0 0 cm /Im${i} Do Q`
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${h}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`)
    obj(p + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
    obj(p + 2, `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`, img.jpeg, '\nendstream')
  })
  const size = 3 + 3 * images.length
  const xref = length
  push(`xref\n0 ${size}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const b of parts) {
    out.set(b, at)
    at += b.length
  }
  return out
}

/** Shrink a photo to a JPEG page (keeps its orientation). */
async function toJpeg(file: Blob, maxSide: number, quality: number): Promise<PdfImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) })
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t prepare a page.'))), 'image/jpeg', quality))
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/**
 * Photos → one PDF, small enough for the AI to read (under `maxBytes`): sharp pages first, smaller ones if needed.
 */
export async function photosToPdf(photos: Blob[], maxBytes: number): Promise<Blob> {
  let pdf: Uint8Array | undefined
  for (const [side, quality] of [[2000, 0.8], [1600, 0.72], [1300, 0.65], [1000, 0.6]] as const) {
    const pages = []
    for (const p of photos) pages.push(await toJpeg(p, side, quality)) // one at a time: phones have little memory for big photos
    pdf = imagesToPdf(pages)
    if (pdf.length <= maxBytes) break
  }
  return new Blob([pdf! as BlobPart], { type: 'application/pdf' })
}
