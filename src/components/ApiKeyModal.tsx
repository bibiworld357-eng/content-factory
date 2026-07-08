import { useState, useEffect } from 'react'
import { Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useContentStore } from '@/store/useContentStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function ApiKeyModal({ open, onClose }: Props) {
  const { apiKeys, setApiKeys } = useContentStore()
  const [grokKey, setGrokKey] = useState(apiKeys.grok)
  const [wavespeedKey, setWavespeedKey] = useState(apiKeys.wavespeed)
  const [minimaxKey, setMinimaxKey] = useState(apiKeys.minimax)
  const [captionsKey, setCaptionsKey] = useState(apiKeys.captions ?? '')
  const [showGrok, setShowGrok] = useState(false)
  const [showWavespeed, setShowWavespeed] = useState(false)
  const [showMinimax, setShowMinimax] = useState(false)
  const [showCaptions, setShowCaptions] = useState(false)

  const canSave = grokKey.trim().length > 0 && wavespeedKey.trim().length > 0
  const hasExistingKeys = apiKeys.grok.length > 0 && apiKeys.wavespeed.length > 0

  useEffect(() => {
    if (open) {
      setGrokKey(apiKeys.grok)
      setWavespeedKey(apiKeys.wavespeed)
      setMinimaxKey(apiKeys.minimax)
      setCaptionsKey(apiKeys.captions ?? '')
    }
  }, [open])

  function handleSave() {
    if (!canSave) return
    setApiKeys({ grok: grokKey.trim(), wavespeed: wavespeedKey.trim(), minimax: minimaxKey.trim(), captions: captionsKey.trim() })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && canSave) onClose() }}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => { if (!canSave) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!canSave) e.preventDefault() }}
      >
        <DialogHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl text-center">Добро пожаловать в Content Factory</DialogTitle>
          <DialogDescription className="text-center text-base pt-1">
            Настройка API-ключей
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2" onKeyDown={(e) => { if (e.key === 'Enter' && canSave) handleSave() }}>
          <div className="space-y-2">
            <Label htmlFor="grok-key" className="text-foreground/90">
              Grok xAI API Key
            </Label>
            <div className="relative">
              <Input
                id="grok-key"
                type={showGrok ? 'text' : 'password'}
                placeholder="xai-..."
                value={grokKey}
                onChange={(e) => setGrokKey(e.target.value)}
                className="pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowGrok((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showGrok ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wavespeed-key" className="text-foreground/90">
              Wavespeed API Key
            </Label>
            <div className="relative">
              <Input
                id="wavespeed-key"
                type={showWavespeed ? 'text' : 'password'}
                placeholder="ws-..."
                value={wavespeedKey}
                onChange={(e) => setWavespeedKey(e.target.value)}
                className="pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowWavespeed((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showWavespeed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minimax-key" className="text-foreground/90">
              Minimax API Key <span className="text-muted-foreground font-normal">(Voice)</span>
            </Label>
            <div className="relative">
              <Input
                id="minimax-key"
                type={showMinimax ? 'text' : 'password'}
                placeholder="sk-api-..."
                value={minimaxKey}
                onChange={(e) => setMinimaxKey(e.target.value)}
                className="pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowMinimax((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showMinimax ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="captions-key" className="text-foreground/90">
              Captions AI API Key <span className="text-muted-foreground font-normal">(Subs)</span>
            </Label>
            <div className="relative">
              <Input
                id="captions-key"
                type={showCaptions ? 'text' : 'password'}
                placeholder="sk-..."
                value={captionsKey}
                onChange={(e) => setCaptionsKey(e.target.value)}
                className="pr-10 font-mono text-xs"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowCaptions((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showCaptions ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            Ключи сохраняются только в вашем браузере
          </p>

          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full mt-2"
            size="lg"
          >
            {hasExistingKeys ? 'Сохранить изменения' : 'Сохранить и продолжить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
