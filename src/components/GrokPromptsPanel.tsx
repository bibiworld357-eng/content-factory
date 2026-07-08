import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Bot, Copy, Check, Loader2, AlertCircle, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { cn } from '@/lib/utils'

export function GrokPromptsPanel() {
  const { grokPrompts, grokTranslations, isGenerating, generations } = useContentStore()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<{ idx: number; lang: 'en' | 'ru' } | null>(null)

  const isWaitingForGrok =
    isGenerating && grokPrompts.length === 0 && generations.some((g) => g.status === 'pending')

  const hasPrompts = grokPrompts.length > 0
  const generationAttempted = generations.length > 0
  const showErrorState = !isGenerating && !hasPrompts && generationAttempted

  // Auto-open when Grok generation starts or when first prompt arrives
  useEffect(() => {
    if (hasPrompts || isWaitingForGrok) setOpen(true)
  }, [hasPrompts, isWaitingForGrok])

  function handleCopy(text: string, idx: number, lang: 'en' | 'ru') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied({ idx, lang })
      setTimeout(() => setCopied(null), 1800)
    })
  }

  if (!hasPrompts && !isWaitingForGrok && !generationAttempted) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {isWaitingForGrok ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          ) : (
            <Bot className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-medium text-foreground">Промпты от Grok</span>
          {hasPrompts && (
            <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
              {grokPrompts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isWaitingForGrok && (
            <span className="text-xs text-muted-foreground">Генерируется...</span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {isWaitingForGrok && (
            <div className="px-4 py-6 flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Ожидание ответа от Grok Vision...</span>
            </div>
          )}

          {showErrorState && (
            <div className="px-4 py-5 flex items-center gap-2.5 text-destructive/80">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-xs">Grok не вернул промпты — смотрите Логи для деталей</span>
            </div>
          )}

          {grokPrompts.map((prompt, index) => {
            const ru = grokTranslations[index] ?? ''
            const isCopiedEn = copied?.idx === index && copied.lang === 'en'
            const isCopiedRu = copied?.idx === index && copied.lang === 'ru'
            return (
              <div key={index} className="p-4 space-y-2">
                <span className="text-xs font-semibold text-primary">Промпт {index + 1}</span>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {/* English */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">EN</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(prompt, index, 'en')}
                        className={cn('h-5 gap-1 text-[10px] px-1.5', isCopiedEn ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground')}
                      >
                        {isCopiedEn ? <><Check className="h-2.5 w-2.5" />Скопировано</> : <><Copy className="h-2.5 w-2.5" />Копировать</>}
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground leading-relaxed break-words bg-secondary/40 rounded-lg p-3 border border-border/50 max-h-28 overflow-y-auto">
                      {prompt}
                    </div>
                  </div>

                  {/* Russian */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <Languages className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">RU</span>
                      </div>
                      {ru && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(ru, index, 'ru')}
                          className={cn('h-5 gap-1 text-[10px] px-1.5', isCopiedRu ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground')}
                        >
                          {isCopiedRu ? <><Check className="h-2.5 w-2.5" />Скопировано</> : <><Copy className="h-2.5 w-2.5" />Копировать</>}
                        </Button>
                      )}
                    </div>
                    <div className={cn(
                      'text-xs leading-relaxed break-words rounded-lg p-3 border max-h-28 overflow-y-auto',
                      ru
                        ? 'text-muted-foreground bg-secondary/40 border-border/50'
                        : 'text-muted-foreground/40 bg-secondary/20 border-border/30 italic'
                    )}>
                      {ru || (isGenerating ? 'Генерируется...' : 'Перевод недоступен')}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
