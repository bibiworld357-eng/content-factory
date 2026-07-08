import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, X, ImageIcon } from 'lucide-react'
import { cn, fileToBase64 } from '@/lib/utils'
import { useContentStore } from '@/store/useContentStore'

export function UploadZone() {
  const { uploadedImage, setUploadedImage } = useContentStore()

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return
      const base64 = await fileToBase64(file)
      const mimeType = file.type || 'image/jpeg'
      const dataUrl = `data:${mimeType};base64,${base64}`
      const previewUrl = URL.createObjectURL(file)
      setUploadedImage({ file, base64, dataUrl, previewUrl })
    },
    [setUploadedImage]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] },
    maxFiles: 1,
    multiple: false,
  })

  if (uploadedImage) {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-border bg-card aspect-square w-full">
        <img
          src={uploadedImage.previewUrl}
          alt="Загруженное фото"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); if (uploadedImage?.previewUrl) URL.revokeObjectURL(uploadedImage.previewUrl); setUploadedImage(null) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2">
            <ImageIcon className="h-3.5 w-3.5 text-white/80 shrink-0" />
            <span className="text-xs text-white/80 truncate">{uploadedImage.file.name}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'aspect-square w-full rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 p-6 text-center',
        isDragActive
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : 'border-border hover:border-primary/50 hover:bg-primary/[0.03] bg-card'
      )}
    >
      <input {...getInputProps()} />
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full transition-colors',
          isDragActive ? 'bg-primary/20' : 'bg-secondary'
        )}
      >
        <UploadCloud
          className={cn(
            'h-7 w-7 transition-colors',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )}
        />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {isDragActive ? 'Отпустите файл...' : 'Перетащите фото сюда'}
        </p>
        <p className="text-xs text-muted-foreground">
          или <span className="text-primary">нажмите для выбора</span>
        </p>
        <p className="text-xs text-muted-foreground/60 pt-1">JPG, PNG, WEBP</p>
      </div>
    </div>
  )
}
