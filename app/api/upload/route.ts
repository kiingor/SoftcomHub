import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { type NextRequest, NextResponse } from 'next/server'

// Client-side direct upload to Vercel Blob.
//
// Files now go straight from the browser to Blob storage; this route only
// mints the upload token. This bypasses the 4.5MB request-body limit that
// Vercel serverless functions impose — previously any file above ~4.5MB
// (e.g. an 8MB .zip) was rejected by the platform before reaching our code,
// surfacing as a generic "Upload failed" on the client.
//
// The browser sets the contentType (resolved via resolveMime) so Vercel Blob
// serves the file with the right Content-Type — both Meta Cloud API and
// Evolution use that header to classify the media on the recipient side.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // No allowedContentTypes restriction: certs/archives/xml must pass
        // through (Evolution channel). Size is capped at the WhatsApp/Evolution
        // document limit; the client also pre-validates per media type.
        addRandomSuffix: false,
        maximumSizeInBytes: 100 * 1024 * 1024,
      }),
      // onUploadCompleted intentionally omitted: nothing to persist
      // server-side, and on localhost Blob can't resolve a callback URL.
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 400 },
    )
  }
}
