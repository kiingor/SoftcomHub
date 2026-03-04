import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (images, PDFs and videos)
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Apenas imagens, videos e PDFs sao permitidos' }, { status: 400 })
    }

    // Validate file size (max 50MB for videos, 15MB for others)
    const maxSize = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > maxSize) {
      const maxMB = file.type.startsWith('video/') ? '50' : '15'
      return NextResponse.json({ error: `Arquivo deve ter no maximo ${maxMB}MB` }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'png'
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
