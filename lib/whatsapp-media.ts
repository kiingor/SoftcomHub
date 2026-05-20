// Mapping of file extensions to canonical MIME types and WhatsApp compatibility.
// Used at upload time (normalize Content-Type for Vercel Blob) and at send time
// (validate against Meta whitelist, choose proper Evolution mimetype).

const EXT_TO_MIME: Record<string, string> = {
  // Imagens
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  // Áudio
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  amr: 'audio/amr',
  wav: 'audio/wav',
  // Vídeo
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  // Documentos suportados pela Meta
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  // Documentos NÃO suportados pela Meta — entram só por Evolution
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  json: 'application/json',
  xml: 'application/xml',
  // Certificados digitais
  cer: 'application/pkix-cert',
  crt: 'application/x-x509-ca-cert',
  pem: 'application/x-pem-file',
  p12: 'application/x-pkcs12',
  pfx: 'application/x-pkcs12',
  key: 'application/pkcs8',
}

// MIMEs que a Meta Cloud API efetivamente entrega como `type: 'document'`.
// Qualquer outro vira 200 OK fake (silent reject) e o cliente não recebe.
// Fonte: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
const META_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
])

export function extFromFilename(filename?: string | null): string {
  if (!filename) return ''
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)
  return m?.[1] || ''
}

export function extFromUrl(url?: string | null): string {
  if (!url) return ''
  const path = url.split('?')[0]
  return extFromFilename(path)
}

/** Returns the canonical MIME for a given extension, or empty string when unknown. */
export function mimeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || ''
}

/**
 * Best-effort MIME inference. Priority:
 *   1. explicit MIME if non-empty and not octet-stream/x-empty
 *   2. canonical MIME from extension
 *   3. explicit MIME as-is (octet-stream fallback)
 *   4. application/octet-stream
 */
export function resolveMime(explicitMime: string | null | undefined, filename?: string | null): string {
  const explicit = (explicitMime || '').toLowerCase()
  const isGeneric = !explicit || explicit === 'application/octet-stream' || explicit === 'application/x-empty'
  if (!isGeneric) return explicit
  const fromExt = mimeFromExt(extFromFilename(filename))
  if (fromExt) return fromExt
  return explicit || 'application/octet-stream'
}

/** True if Meta Cloud API will actually deliver this document MIME. */
export function isMetaDocumentMime(mime: string): boolean {
  return META_DOCUMENT_MIMES.has(mime.toLowerCase().split(';')[0].trim())
}

/** True if the MIME is delivered as an image by Meta. */
export function isMetaImageMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return m === 'image/jpeg' || m === 'image/png'
}

/** True if the MIME is delivered as audio by Meta (voice note only for ogg/opus). */
export function isMetaAudioMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'].includes(m)
}

/** True if the MIME is delivered as video by Meta. */
export function isMetaVideoMime(mime: string): boolean {
  const m = mime.toLowerCase().split(';')[0].trim()
  return m === 'video/mp4' || m === 'video/3gpp'
}

/**
 * Returns a structured compatibility verdict for a given file
 * being sent through the Meta Cloud API.
 *
 *   accepted: file will be delivered
 *   reason: human-readable message for the attendant when not accepted
 */
export function checkMetaCompatibility(
  mime: string,
  filename?: string | null,
): { accepted: boolean; kind: 'image' | 'audio' | 'video' | 'document' | 'unsupported'; reason?: string } {
  if (isMetaImageMime(mime)) return { accepted: true, kind: 'image' }
  if (isMetaAudioMime(mime)) return { accepted: true, kind: 'audio' }
  if (isMetaVideoMime(mime)) return { accepted: true, kind: 'video' }
  if (isMetaDocumentMime(mime)) return { accepted: true, kind: 'document' }

  const ext = extFromFilename(filename)
  const isCert = ['cer', 'crt', 'pem', 'p12', 'pfx', 'key'].includes(ext)
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)

  let reason = `Tipo "${mime || ext || 'desconhecido'}" não é entregue pelo WhatsApp Oficial (Meta).`
  if (isCert) reason += ' Use o canal Evolution para enviar certificados, ou converta o arquivo para PDF.'
  else if (isArchive) reason += ' Use o canal Evolution para enviar arquivos compactados.'
  else reason += ' Formatos aceitos: PDF, Word, Excel, PowerPoint, TXT, JPEG, PNG, MP4, OGG/AAC/MP3.'

  return { accepted: false, kind: 'unsupported', reason }
}
