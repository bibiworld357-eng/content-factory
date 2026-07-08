import { useEffect, useRef } from 'react'
import { Trash2, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useContentStore } from '@/store/useContentStore'
import { cn } from '@/lib/utils'
import type { LogLevel } from '@/types'

function levelClass(level: LogLevel): string {
  if (level === 'success') return 'text-emerald-400'
  if (level === 'error') return 'text-red-400'
  return 'text-muted-foreground'
}

function levelPrefix(level: LogLevel): string {
  if (level === 'success') return '✓'
  if (level === 'error') return '✗'
  return '·'
}

export function LogsPanel() {
  const { logs, clearLogs } = useContentStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Логи процесса
          </span>
          {logs.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-1.5 py-0.5">
              {logs.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearLogs}
          disabled={logs.length === 0}
          className="h-6 gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-30"
        >
          <Trash2 className="h-3 w-3" />
          Очистить
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-0.5 font-mono text-xs min-h-0">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full py-8">
            <p className="text-muted-foreground/50 text-xs">Логи появятся во время генерации</p>
          </div>
        ) : (
          <>
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-0.5 leading-relaxed"
              >
                <span className="text-muted-foreground/40 shrink-0 select-none">
                  [{entry.timestamp}]
                </span>
                <span
                  className={cn(
                    'shrink-0 select-none font-bold',
                    levelClass(entry.level)
                  )}
                >
                  {levelPrefix(entry.level)}
                </span>
                <span className={cn('break-all', levelClass(entry.level))}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  )
}
