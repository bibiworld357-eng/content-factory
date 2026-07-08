import { AlertCircle, RefreshCw, Play, Pause, Volume2, VolumeX, Maximize, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { formatPrice } from '@/lib/pricing'
import { cn } from '@/lib/utils'

export function VideoGenerationGrid() {
  const { videoGenerations } = useContentStore()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set())

  if (videoGenerations.length === 0) return null

  function handleOpenInNewTab(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleFullscreen(videoElement: HTMLVideoElement) {
    if (videoElement.requestFullscreen) {
      videoElement.requestFullscreen()
    }
  }

  function togglePlay(id: string, videoElement: HTMLVideoElement) {
    if (playingId === id) {
      videoElement.pause()
      setPlayingId(null)
    } else {
      // Pause all other videos
      document.querySelectorAll('video').forEach((v) => v.pause())
      videoElement.play()
      setPlayingId(id)
    }
  }

  function toggleMute(id: string) {
    setMutedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Сгенерированные видео — {videoGenerations.length}
        </h3>
        <span className="text-xs text-muted-foreground">
          {videoGenerations.filter((g) => g.status === 'completed').length} / {videoGenerations.length} готово
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {videoGenerations.map((item, index) => (
          <div
            key={item.id}
            className="group relative rounded-xl overflow-hidden border border-border bg-card"
          >
            {/* Processing State */}
            {item.status === 'processing' && (
              <div className="aspect-video bg-secondary/50 flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <span className="text-xs text-muted-foreground font-medium">Генерация видео...</span>
              </div>
            )}

            {/* Pending State */}
            {item.status === 'pending' && (
              <div className="aspect-video bg-secondary/30 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground/60">Ожидание...</span>
              </div>
            )}

            {/* Error State */}
            {item.status === 'failed' && (
              <div className="aspect-video bg-destructive/5 border border-destructive/20 flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle className="h-8 w-8 text-destructive/60" />
                <span className="text-xs text-destructive/80 text-center line-clamp-3">
                  {item.error ?? 'Ошибка генерации'}
                </span>
              </div>
            )}

            {/* Completed State */}
            {item.status === 'completed' && item.videoUrl && (
              <div className="aspect-video bg-black relative group/video">
                <video
                  poster={item.posterUrl}
                  src={item.videoUrl}
                  loop
                  muted={mutedIds.has(item.id)}
                  controls
                  controlsList="nodownload"
                  className="w-full h-full object-contain"
                  onClick={(e) => togglePlay(item.id, e.currentTarget)}
                  onEnded={() => setPlayingId(null)}
                />

                {/* Play/Pause Overlay */}
                <button
                  onClick={(e) => {
                    const video = e.currentTarget.parentElement?.querySelector('video')
                    if (video) togglePlay(item.id, video)
                  }}
                  className={cn(
                    'absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity',
                    playingId === item.id ? 'opacity-0 group-hover/video:opacity-100' : 'opacity-100'
                  )}
                >
                  {playingId === item.id ? (
                    <Pause className="h-12 w-12 text-white drop-shadow-lg" />
                  ) : (
                    <Play className="h-12 w-12 text-white drop-shadow-lg" />
                  )}
                </button>

                {/* Controls Overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover/video:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white font-medium">Видео {index + 1}</span>
                      {item.withSound && (
                        <button
                          onClick={() => toggleMute(item.id)}
                          className="h-6 w-6 rounded bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                        >
                          {mutedIds.has(item.id) ? (
                            <VolumeX className="h-3 w-3 text-white" />
                          ) : (
                            <Volume2 className="h-3 w-3 text-white" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        title="Fullscreen"
                        className="h-7 w-7 rounded bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          const video = e.currentTarget.closest('.group\\/video')?.querySelector('video')
                          if (video) handleFullscreen(video)
                        }}
                      >
                        <Maximize className="h-3.5 w-3.5 text-white" />
                      </button>
                      <button
                        title="Открыть в новой вкладке"
                        className="h-7 w-7 rounded bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenInNewTab(item.videoUrl!)
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info Badge */}
            <div className="p-3 border-t border-border/50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {item.duration}s {item.withSound ? '🔊' : ''}
                </span>
                <span className="text-xs font-semibold text-primary">{formatPrice(item.cost)}</span>
              </div>
              {item.status === 'completed' && (
                <div className="text-[10px] text-muted-foreground/60 line-clamp-2">
                  {item.videoPrompt}
                </div>
              )}
            </div>

            {/* Status Badge */}
            <div
              className={cn(
                'absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1',
                item.status === 'completed'
                  ? 'bg-emerald-500 text-white'
                  : item.status === 'failed'
                  ? 'bg-destructive text-white'
                  : item.status === 'processing'
                  ? 'bg-primary text-white'
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              {item.status === 'processing' && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
              {index + 1}
            </div>
          </div>
        ))}
      </div>

      {videoGenerations.some((g) => g.status === 'completed') && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              videoGenerations
                .filter((g) => g.status === 'completed' && g.videoUrl)
                .forEach((g, i) => {
                  setTimeout(() => {
                    handleOpenInNewTab(g.videoUrl!)
                  }, i * 300)
                })
            }}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Открыть все ({videoGenerations.filter((g) => g.status === 'completed').length})
          </Button>
        </div>
      )}
    </div>
  )
}
