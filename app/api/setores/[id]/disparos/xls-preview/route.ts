import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDisparoXls, buildDisparoXlsTemplate } from '@/lib/xls-parser'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const buffer = buildDisparoXlsTemplate()
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="modelo-disparo-${id}.xlsx"`,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Arquivo excede 5MB' }, { status: 413 })
  }

  const buffer = await file.arrayBuffer()

  try {
    const result = parseDisparoXls(buffer)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[xls-preview] erro ao parsear:', err)
    return NextResponse.json(
      { error: 'Erro ao processar a planilha. Verifique o formato.' },
      { status: 400 },
    )
  }
}
