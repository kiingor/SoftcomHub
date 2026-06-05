'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Camera, Loader2, Upload, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'

interface ProfilePhotoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentFotoUrl?: string | null
  nome?: string | null
  /** Chamado com a nova URL após salvar (para atualizar o avatar na tela). */
  onUpdated?: (fotoUrl: string) => void
}

const MAX_BYTES = 5 * 1024 * 1024
const VIEW = 256 // tamanho do preview/recorte (px)
const OUT = 400 // resolução final salva (px)

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentFotoUrl,
  nome,
  onUpdated,
}: ProfilePhotoDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)

  const initials = (nome || 'U').trim().slice(0, 2).toUpperCase()

  // escala base = "cover" do viewport; escala final aplica o zoom do usuário
  const base = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1
  const scale = base * zoom
  const dispW = natural ? natural.w * scale : 0
  const dispH = natural ? natural.h * scale : 0

  // mantém a imagem sempre cobrindo o círculo
  const clampOffset = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEW - dispW, x)),
    y: Math.min(0, Math.max(VIEW - dispH, y)),
  })

  const pickFile = (f: File | null) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.')
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error('Imagem muito grande (máx. 5MB).')
      return
    }
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const b = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight)
      const dw = img.naturalWidth * b
      const dh = img.naturalHeight * b
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(1)
      setOffset({ x: (VIEW - dw) / 2, y: (VIEW - dh) / 2 }) // começa centralizado
      setImgSrc(url)
    }
    img.onerror = () => toast.error('Não foi possível carregar a imagem.')
    img.src = url
  }

  // arrastar para posicionar
  const onPointerDown = (e: React.PointerEvent) => {
    if (!natural) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setOffset(clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy))
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  // zoom mantendo o ponto central
  const handleZoom = (z: number) => {
    if (!natural) {
      setZoom(z)
      return
    }
    const newScale = base * z
    const c = VIEW / 2
    const imgX = (c - offset.x) / scale
    const imgY = (c - offset.y) / scale
    const nx = c - imgX * newScale
    const ny = c - imgY * newScale
    const dw = natural.w * newScale
    const dh = natural.h * newScale
    setZoom(z)
    setOffset({
      x: Math.min(0, Math.max(VIEW - dw, nx)),
      y: Math.min(0, Math.max(VIEW - dh, ny)),
    })
  }

  const reset = () => {
    if (imgSrc) URL.revokeObjectURL(imgSrc)
    setImgSrc(null)
    setNatural(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setSaving(false)
    imgRef.current = null
  }

  const handleSave = async () => {
    if (!natural || !imgRef.current) return
    setSaving(true)
    try {
      // desenha exatamente o que está no círculo, na resolução final
      const canvas = document.createElement('canvas')
      canvas.width = OUT
      canvas.height = OUT
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      const k = OUT / VIEW
      ctx.drawImage(imgRef.current, offset.x * k, offset.y * k, dispW * k, dispH * k)
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/png'),
      )
      if (!blob) {
        toast.error('Erro ao processar a imagem')
        setSaving(false)
        return
      }

      const fd = new FormData()
      fd.append('file', new File([blob], 'avatar.png', { type: 'image/png' }))
      const res = await fetch('/api/perfil/foto', { method: 'POST', body: fd })
      const result = await res.json()
      if (!res.ok) {
        toast.error(result?.error || 'Erro ao salvar a foto')
        return
      }
      toast.success('Foto de perfil atualizada!')
      onUpdated?.(result.foto_url)
      reset()
      onOpenChange(false)
    } catch {
      toast.error('Erro ao salvar a foto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Foto de perfil
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {imgSrc && natural ? (
            <>
              {/* círculo de recorte — arraste a imagem para posicionar */}
              <div
                className="relative cursor-move touch-none select-none overflow-hidden rounded-full border bg-muted"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{ left: offset.x, top: offset.y, width: dispW, height: dispH }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-black/10" />
              </div>

              <div className="flex w-full items-center gap-2 px-2">
                <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => handleZoom(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Arraste para posicionar e use o zoom para centralizar.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
              >
                Trocar imagem
              </Button>
            </>
          ) : (
            <>
              <Avatar className="h-28 w-28">
                {currentFotoUrl && (
                  <AvatarImage src={currentFotoUrl} alt={nome || ''} className="object-cover" />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Escolher imagem
              </Button>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou GIF — até 5MB.</p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !imgSrc}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
