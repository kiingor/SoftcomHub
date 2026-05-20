import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { resolveMime } from '@/lib/whatsapp-media'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Browsers leave `file.type` empty for unknown extensions (certs, .key, etc.).
    // Infer a canonical MIME so Vercel Blob serves the file with the right
    // Content-Type — both Meta Cloud API and Evolution use that header to
    // classify the media on the recipient side.
    const resolvedType = resolveMime(file.type, file.name)

    // Validate file size based on resolved MIME (WhatsApp/Evolution limits)
    // Videos: 50MB | Images/Audio: 16MB | Documents: 100MB
    const isVideo = resolvedType.startsWith('video/')
    const isImageOrAudio = resolvedType.startsWith('image/') || resolvedType.startsWith('audio/')
    const maxSize = isVideo ? 50 * 1024 * 1024 : isImageOrAudio ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      const maxMB = isVideo ? '50' : isImageOrAudio ? '16' : '100'
      return NextResponse.json({ error: `Arquivo deve ter no maximo ${maxMB}MB` }, { status: 400 })
    }

    // Generate unique filename — keep original extension so WhatsApp clients
    // pick the correct file icon and the recipient OS can open it.
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const filename = `workdesk/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`

    // Upload to Vercel Blob with explicit contentType so /downloads serve
    // with the resolved MIME instead of application/octet-stream.
    const blob = await put(filename, file, {
      access: 'public',
      contentType: resolvedType,
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: resolvedType,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
