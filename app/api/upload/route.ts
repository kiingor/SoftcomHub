import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size based on type (WhatsApp/Evolution limits)
    // Videos: 50MB | Images/Audio: 16MB | Documents: 100MB
    const isVideo = file.type.startsWith('video/')
    const isImageOrAudio = file.type.startsWith('image/') || file.type.startsWith('audio/')
    const maxSize = isVideo ? 50 * 1024 * 1024 : isImageOrAudio ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      const maxMB = isVideo ? '50' : isImageOrAudio ? '16' : '100'
      return NextResponse.json({ error: `Arquivo deve ter no maximo ${maxMB}MB` }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'bin'
    const filename = `workdesk/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
