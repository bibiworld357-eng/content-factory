import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContentStore } from '@/store/useContentStore'
import type { VisionProvider } from '@/lib/vision'

const OPTIONS: Array<{ id: VisionProvider; label: string }> = [
  { id: 'grok', label: 'Grok' },
  { id: 'gemini', label: 'Gemini' },
]

/**
 * Compact switch selecting which {@link VisionProvider} the vision-analysis
 * calls use. Persisted in the store so the choice applies across all panels.
 */
export function VisionProviderToggle({ className }: { className?: string }) {
  const { visionProvider, setVisionProvider } = useContentStore()

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Анализатор
      </span>
      <div className="inline-flex rounded-md border border-border bg-card/50 p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setVisionProvider(opt.id)}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              visionProvider === opt.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
