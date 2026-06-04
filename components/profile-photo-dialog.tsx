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
import { Camera, Loader2, Upload } from 'lucide-react'
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

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentFotoUrl,
  nome,
  onUpdated,
}: ProfilePhotoDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const initials = (nome || 'U').trim().slice(0, 2).toUpperCase()

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
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setSaving(false)
  }

  const handleSave = async () => {
    if (!file) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
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

  const shown = preview || currentFotoUrl || undefined

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
          <Avatar className="h-28 w-28">
            {shown && <AvatarImage src={shown} alt={nome || ''} className="object-cover" />}
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] || null)}
          />
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !file}>
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
