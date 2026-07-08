import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Trash2, Upload, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EndFrameDropzoneProps {
  itemId: string
  endImage?: string
  isUploading: boolean
  onDrop: (itemId: string, files: File[]) => void
  onRemove: (itemId: string) => void
  onImageUrlDrop?: (itemId: string, imageUrl: string) => void
  onImageClick?: (imageUrl: string, title: string) => void
  index: number
}

export function EndFrameDropzone({ itemId, endImage, isUploading, onDrop, onRemove, onImageUrlDrop, onImageClick, index }: EndFrameDropzoneProps) {
  const [isImageDragActive, setIsImageDragActive] = useState(false)
  
  const handleDrop = useCallback(
    (files: File[]) => {
      onDrop(itemId, files)
    },
    [itemId, onDrop]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    multiple: false,
    noClick: !!endImage,
    noDrag: true, // Disable react-dropzone drag handling, we'll handle it manually
  })
  
  // Handle drag & drop from GenerationGrid
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsImageDragActive(true)
  }, [])
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsImageDragActive(false)
  }, [])
  
  const handleDropEvent = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsImageDragActive(false)
    
    // Try to get image URL from dataTransfer
    const imageUrl = e.dataTransfer.getData('application/x-image-url')
    if (imageUrl && onImageUrlDrop) {
      onImageUrlDrop(itemId, imageUrl)
      return
    }
    
    // Fallback to file drop
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleDrop(files)
    }
  }, [itemId, onImageUrlDrop, handleDrop])

  return (
    <div
      {...getRootProps()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden transition-all",
        endImage
          ? "bg-secondary/30"
          : "border-2 border-dashed cursor-pointer",
        !endImage && (isDragActive || isImageDragActive)
          ? "border-primary bg-primary/10"
          : !endImage
          ? "border-border/50 bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40"
          : "",
        isImageDragActive && "ring-2 ring-primary ring-offset-2"
      )}
    >
      <input {...getInputProps()} />
      {endImage ? (
        <>
          <img
            src={endImage}
            alt={`End ${index + 1}`}
            crossOrigin={endImage.startsWith('http') ? 'anonymous' : undefined}
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={(e) => {
              e.stopPropagation()
              if (onImageClick) {
                onImageClick(endImage, `END кадр #${index + 1}`)
              }
            }}
          />
          <div className="absolute bottom-1.5 left-1.5 right-1.5">
            <div className="text-[10px] font-semibold bg-primary/90 text-primary-foreground px-2 py-0.5 rounded text-center">
              END
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(itemId)
            }}
            className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center transition-colors z-10"
          >
            <Trash2 className="h-3 w-3 text-white" />
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
          {isUploading ? (
            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
          ) : isDragActive ? (
            <>
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-[10px] font-medium text-primary">Отпустите</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground/50" />
              <span className="text-[10px] font-medium text-muted-foreground">END кадр</span>
              <span className="text-[9px] text-muted-foreground/60">опционально</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
