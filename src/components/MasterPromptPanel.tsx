import { useState } from 'react'
import { Pencil, Check, X, ChevronDown, ChevronUp, Dna } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useContentStore } from '@/store/useContentStore'
import { DNA } from '@/lib/api'
import { cn } from '@/lib/utils'

export function MasterPromptPanel() {
  const { masterPrompt, setMasterPrompt } = useContentStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(masterPrompt)
  const [showDna, setShowDna] = useState(false)

  function handleEdit() {
    setDraft(masterPrompt)
    setEditing(true)
  }

  function handleSave() {
    setMasterPrompt(draft.trim() || masterPrompt)
    setEditing(false)
  }

  function handleCancel() {
    setDraft(masterPrompt)
    setEditing(false)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          <span className="text-sm font-medium text-foreground">Мастер-промпт</span>
        </div>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
            Редактировать
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSave}
              className="h-7 w-7 text-muted-foreground hover:text-emerald-400"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[120px] text-sm leading-relaxed"
            autoFocus
          />
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {masterPrompt}
          </p>
        )}

        <button
          onClick={() => setShowDna((v) => !v)}
          className={cn(
            'w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
            showDna
              ? 'border-primary/30 bg-primary/5 text-primary'
              : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/20 hover:text-foreground'
          )}
        >
          <Dna className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left font-medium">DNA — встраивается в каждый промпт</span>
          {showDna ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showDna && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary/80 leading-relaxed font-mono">{DNA}</p>
          </div>
        )}
      </div>
    </div>
  )
}
