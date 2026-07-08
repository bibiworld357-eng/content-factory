import { Volume2, VolumeX } from 'lucide-react'
import { useContentStore } from '@/store/useContentStore'
import { getDurationLabel, calculateKlingPrice, formatPrice } from '@/lib/pricing'
import { cn } from '@/lib/utils'

export function VideoSettingsPanel() {
  const { videoSettings, setVideoSettings, videoQueue } = useContentStore()
  const { resolution, aspectRatio, duration, withSound, videosPerPrompt } = videoSettings

  const selectedCount = videoQueue.filter((q) => q.selected && q.videoPrompt).length
  const totalVideos = selectedCount * videosPerPrompt
  const totalCost = calculateKlingPrice(duration, withSound, totalVideos)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
        Настройки видео
      </h3>

      {/* Resolution */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">Разрешение</label>
        <div className="grid grid-cols-2 gap-2">
          {(['720p', '1080p'] as const).map((res) => (
            <button
              key={res}
              onClick={() => setVideoSettings({ resolution: res })}
              className={cn(
                'rounded-lg border py-2 text-sm font-medium transition-colors',
                resolution === res
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground'
              )}
            >
              {res === '720p' ? '720p (HD)' : '1080p (Full HD)'}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">Соотношение сторон</label>
        <div className="grid grid-cols-3 gap-2">
          {(['9:16', '16:9', '1:1'] as const).map((ar) => (
            <button
              key={ar}
              onClick={() => setVideoSettings({ aspectRatio: ar })}
              className={cn(
                'rounded-lg border py-2 text-xs font-medium transition-colors',
                aspectRatio === ar
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground'
              )}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      {/* Duration with Pricing */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">Длительность</label>
        <div className="grid grid-cols-2 gap-2">
          {([3, 5, 10, 15] as const).map((dur) => (
            <button
              key={dur}
              onClick={() => setVideoSettings({ duration: dur })}
              className={cn(
                'rounded-lg border py-2 transition-colors',
                duration === dur
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground'
              )}
            >
              <div className="text-sm font-semibold">{dur}s</div>
              <div className="text-[10px] opacity-70">
                {formatPrice(calculateKlingPrice(dur, withSound, 1))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sound Toggle */}
      <div className="rounded-xl border border-border bg-card p-4">
        <button
          onClick={() => setVideoSettings({ withSound: !withSound })}
          className="w-full flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            {withSound ? (
              <Volume2 className="h-4 w-4 text-primary" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-foreground">Генерация со звуком</span>
          </div>
          <div
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              withSound ? 'bg-primary' : 'bg-secondary'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                withSound ? 'left-[22px]' : 'left-0.5'
              )}
            />
          </div>
        </button>
        {withSound && (
          <p className="text-xs text-muted-foreground mt-2">
            Стоимость увеличивается в 1.5 раза
          </p>
        )}
      </div>

      {/* Videos Per Prompt */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Видео на промпт</label>
          <input
            type="number"
            min={1}
            max={5}
            value={videosPerPrompt}
            onChange={(e) => {
              const v = Math.max(1, Math.min(5, parseInt(e.target.value) || 1))
              setVideoSettings({ videosPerPrompt: v })
            }}
            className="w-14 h-8 rounded-md border border-input bg-input text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>1 (минимум)</span>
          <span>5 (максимум)</span>
        </div>
      </div>

      {/* Total Cost Display */}
      {selectedCount > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-foreground">Итого:</span>
            <span className="text-lg font-bold text-primary">{formatPrice(totalCost)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedCount} изображени{selectedCount === 1 ? 'е' : selectedCount < 5 ? 'я' : 'й'} ×{' '}
            {videosPerPrompt} видео × {getDurationLabel(duration, withSound)}
          </p>
        </div>
      )}
    </div>
  )
}
