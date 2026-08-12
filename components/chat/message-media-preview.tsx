'use client'

import { cn } from '@/lib/utils'
import { Download, FileIcon } from 'lucide-react'

/**
 * Componente leve pra renderizar mídia em views de monitoramento/relatório
 * (Setor, Monitoramento global, Dashboard de tickets).
 *
 * Espelha a precedência usada pelo MessageMedia do WorkDesk:
 *   1. MIME explícito (mais confiável — vem do upload/Vercel Blob)
 *   2. Extensão da URL (preserva mesmo quando integrador classifica errado)
 *   3. `tipo` do banco (último fallback)
 *
 * NÃO tem features avançadas do WorkDesk (transcrição IA, retry, etc) —
 * só preview de imagem, vídeo, áudio nativo e card de download.
 */
interface MessageMediaPreviewProps {
  url?: string | null
  mediaType?: string | null
  tipo?: string | null
  conteudo?: string | null
  className?: string
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']
const AUDIO_EXTS = ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus', 'amr']
const VIDEO_EXTS = ['mp4', '3gp', 'mov', 'avi', 'mkv']
const DOC_EXTS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
  'csv', 'xml', 'json', 'zip', 'rar', '7z', 'tar', 'gz',
  'cer', 'crt', 'pem', 'p12', 'pfx', 'key',
]

export function MessageMediaPreview({
  url,
  mediaType,
  tipo,
  conteudo,
  className,
}: MessageMediaPreviewProps) {
  if (!url) return null

  const ext = (url.toLowerCase().split('?')[0].split('.').pop() || '').trim()
  const mimeIsImage = mediaType?.startsWith('image/')
  const mimeIsAudio = mediaType?.startsWith('audio/')
  const mimeIsVideo = mediaType?.startsWith('video/')
  const anyMime = !!(mimeIsImage || mimeIsAudio || mimeIsVideo)
  const extIsKnown =
    IMAGE_EXTS.includes(ext) || AUDIO_EXTS.includes(ext) ||
    VIDEO_EXTS.includes(ext) || DOC_EXTS.includes(ext)

  const isImage = mimeIsImage
    || (!anyMime && IMAGE_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'imagem')
  const isAudio = mimeIsAudio
    || (!anyMime && AUDIO_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'audio')
  const isVideo = mimeIsVideo
    || (!anyMime && VIDEO_EXTS.includes(ext))
    || (!anyMime && !extIsKnown && tipo === 'video')

  if (isImage) {
    return (
      <div className={cn('mb-1.5', className)}>
        <img
          src={url}
          alt={conteudo || 'Imagem'}
          className="max-w-full rounded-md max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
        />
      </div>
    )
  }

  if (isVideo) {
    return (
      <div className={cn('mb-1.5', className)}>
        <video
          controls
          preload="metadata"
          className="max-w-full rounded-md max-h-64 w-full bg-black"
        >
          <source src={url} type={mediaType || 'video/mp4'} />
        </video>
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className={cn('mb-1.5', className)}>
        {/*
          `min-w` é o que impede o player de colapsar. O balão da mensagem é um
          flex item sem largura própria (só `max-w-[80%]`), então ele se
          dimensiona pelo conteúdo; um `w-full` sozinho pede 100% de um pai que
          por sua vez espera o conteúdo definir a largura. A referência é
          circular e o player virava uma tira de ~26px, sem barra de progresso
          nem tempo — inutilizável.

          O piso de 200px cabe na tela mais estreita que atendemos: em 360px,
          80% são 288px, menos o padding do balão sobram 264px.
        */}
        <audio controls src={url} className="h-9 w-full min-w-[200px] max-w-full" />
      </div>
    )
  }

  // Fallback: card de download genérico
  const fileName = (conteudo && !/^https?:\/\//.test(conteudo)) ? conteudo : url.split('/').pop()?.split('?')[0] || 'arquivo'
  return (
    <a
      href={url}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'mb-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-background/50 hover:bg-background transition-colors text-xs',
        className,
      )}
    >
      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate font-medium">{fileName}</span>
      <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  )
}
