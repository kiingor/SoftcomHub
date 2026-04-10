import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { audio_url, setor_id, mensagem_id } = body

    if (!audio_url || !setor_id || !mensagem_id) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: audio_url, setor_id, mensagem_id' },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()

    // Fetch OpenAI config from setor
    const { data: setor, error: setorError } = await supabase
      .from('setores')
      .select('openai_api_key, openai_ativo')
      .eq('id', setor_id)
      .single()

    if (setorError || !setor) {
      return NextResponse.json({ error: 'Setor não encontrado' }, { status: 404 })
    }

    if (!setor.openai_ativo || !setor.openai_api_key) {
      return NextResponse.json({ error: 'OpenAI não configurada neste setor' }, { status: 400 })
    }

    // Download audio file from URL
    const audioController = new AbortController()
    const audioTimeout = setTimeout(() => audioController.abort(), 15000)

    let audioBuffer: ArrayBuffer
    let contentType: string
    try {
      const audioRes = await fetch(audio_url, { signal: audioController.signal })
      clearTimeout(audioTimeout)
      if (!audioRes.ok) {
        return NextResponse.json({ error: 'Falha ao baixar o áudio' }, { status: 502 })
      }
      audioBuffer = await audioRes.arrayBuffer()
      contentType = audioRes.headers.get('content-type') || 'audio/ogg'
    } catch (fetchErr: any) {
      clearTimeout(audioTimeout)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: 'Timeout ao baixar o áudio' }, { status: 504 })
      }
      return NextResponse.json({ error: `Erro ao baixar áudio: ${fetchErr.message}` }, { status: 502 })
    }

    // Determine file extension from content type
    const extMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/mp4': 'm4a',
      'audio/aac': 'aac',
      'audio/webm': 'webm',
      'audio/opus': 'opus',
    }
    const ext = extMap[contentType.split(';')[0]] || 'ogg'

    // Build multipart form data for Whisper API
    const formData = new FormData()
    const audioBlob = new Blob([audioBuffer], { type: contentType })
    formData.append('file', audioBlob, `audio.${ext}`)
    formData.append('model', 'whisper-1')
    formData.append('language', 'pt')

    // Call OpenAI Whisper API with 30s timeout
    const whisperController = new AbortController()
    const whisperTimeout = setTimeout(() => whisperController.abort(), 30000)

    try {
      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${setor.openai_api_key}`,
        },
        body: formData,
        signal: whisperController.signal,
      })
      clearTimeout(whisperTimeout)

      if (!whisperRes.ok) {
        const errorData = await whisperRes.json().catch(() => ({}))
        console.error('[IA] Whisper API error:', whisperRes.status, errorData)
        return NextResponse.json(
          { error: `Erro na API Whisper: ${whisperRes.status}` },
          { status: 502 },
        )
      }

      const whisperData = await whisperRes.json()
      const transcricao = whisperData.text?.trim()

      if (!transcricao) {
        return NextResponse.json({ error: 'Transcrição vazia' }, { status: 502 })
      }

      // Save transcription to mensagem.conteudo in database
      const { error: updateError } = await supabase
        .from('mensagens')
        .update({ conteudo: transcricao })
        .eq('id', mensagem_id)

      if (updateError) {
        console.error('[IA] Error updating mensagem:', updateError)
        // Still return the transcription even if save fails
      }

      return NextResponse.json({ transcricao })
    } catch (fetchError: any) {
      clearTimeout(whisperTimeout)
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'Timeout: Whisper não respondeu em 30 segundos' }, { status: 504 })
      }
      console.error('[IA] Whisper fetch error:', fetchError.message)
      return NextResponse.json({ error: `Erro ao chamar Whisper: ${fetchError.message}` }, { status: 502 })
    }
  } catch (error: any) {
    console.error('[IA] Transcrição route error:', error)
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 })
  }
}
