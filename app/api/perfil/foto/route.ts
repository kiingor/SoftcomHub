import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/perfil/foto  (multipart/form-data, campo "file")
 *
 * Define a foto de perfil do usuário LOGADO (self-service):
 * - identifica o colaborador pela sessão (cookies);
 * - sobe a imagem no bucket público `avatars` (caminho <colaborador_id>.<ext>);
 * - salva a URL pública em colaboradores.foto_url (com cache-buster).
 *
 * Requisitos (feitos no Supabase Studio):
 * - bucket público `avatars`
 * - coluna colaboradores.foto_url text
 */
const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: Request) {
  try {
    // 1) Quem é o usuário logado (via sessão/cookies)
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // 2) Arquivo
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo (file) é obrigatório' }, { status: 400 })
    }
    const ext = ALLOWED[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'Formato inválido. Use PNG, JPG, WEBP ou GIF.' },
        { status: 400 },
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Imagem muito grande (máx. 5MB).' }, { status: 400 })
    }

    const service = createServiceClient()

    // 3) Colaborador do usuário logado
    const { data: colab, error: colabErr } = await service
      .from('colaboradores')
      .select('id')
      .eq('email', user.email)
      .single()
    if (colabErr || !colab) {
      return NextResponse.json({ error: 'Colaborador não encontrado' }, { status: 404 })
    }

    // 4) Upload (upsert no mesmo caminho por colaborador)
    const path = `${colab.id}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await service.storage
      .from('avatars')
      .upload(path, buffer, { contentType: file.type, upsert: true })
    if (upErr) {
      console.error('[PerfilFoto] Erro no upload:', upErr)
      return NextResponse.json(
        { error: 'Erro ao subir a imagem. Verifique se o bucket "avatars" existe.' },
        { status: 500 },
      )
    }

    // 5) URL pública + cache-buster (mesmo caminho muda de conteúdo no upsert)
    const { data: pub } = service.storage.from('avatars').getPublicUrl(path)
    const fotoUrl = `${pub.publicUrl}?v=${Date.now()}`

    // 6) Salva na coluna
    const { error: updErr } = await service
      .from('colaboradores')
      .update({ foto_url: fotoUrl })
      .eq('id', colab.id)
    if (updErr) {
      console.error('[PerfilFoto] Erro ao salvar foto_url:', updErr)
      return NextResponse.json(
        { error: 'Imagem enviada, mas falhou ao salvar. A coluna foto_url existe?' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, foto_url: fotoUrl })
  } catch (error) {
    console.error('[PerfilFoto] Erro inesperado:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    )
  }
}
