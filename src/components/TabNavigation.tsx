import { Layers, Video, Newspaper, Clapperboard, Mic, MonitorPlay, Subtitles, PenLine, ImagePlay, Sparkles, ZoomIn, Wand2, Copy } from 'lucide-react'
import { useContentStore } from '@/store/useContentStore'
import { cn } from '@/lib/utils'

export function TabNavigation() {
  const { activeTab, setActiveTab, videoQueue } = useContentStore()

  // Temporarily limit the visible modes to the Bogdana pipeline + its helpers.
  const VISIBLE_TABS = ['bogdana', 'montage', 'subs', 'upscale', 'uniqueizer'] as const

  const allTabs = [
    {
      id: 'bogdana' as const,
      label: 'Богдана',
      icon: Wand2,
      description: 'Пайплайн · Gemini',
    },
    {
      id: 'text-to-post' as const,
      label: 'text-to-post',
      icon: PenLine,
      description: 'Viral Content',
    },
    {
      id: 'news-to-post' as const,
      label: 'news-to-post',
      icon: Newspaper,
      description: 'Grok X Search',
    },
    {
      id: 'variations' as const,
      label: 'img-to-img',
      icon: Layers,
      description: 'Nano Banana 2 Edit',
    },
    {
      id: 'img-to-video' as const,
      label: 'img-to-video',
      icon: Video,
      description: 'Kling 3.0 Pro',
      badge: videoQueue.length > 0 ? videoQueue.length : undefined,
    },
    {
      id: 'montage' as const,
      label: 'montage',
      icon: Clapperboard,
      description: 'FFmpeg Editor',
    },
    {
      id: 'voice' as const,
      label: 'voice',
      icon: Mic,
      description: 'Minimax TTS',
    },
    {
      id: 'infinitetalk' as const,
      label: 'InfiniteTalk',
      icon: MonitorPlay,
      description: 'Lipsync · Wavespeed',
    },
    {
      id: 'subs' as const,
      label: 'Subs',
      icon: Subtitles,
      description: 'Captions AI',
    },
    {
      id: 'inst-to-post' as const,
      label: 'inst-to-post',
      icon: ImagePlay,
      description: 'Grok · GPT Image 2',
    },
    {
      id: 'nsfw' as const,
      label: 'NSFW',
      icon: Sparkles,
      description: 'Seedream 4.5 · NSFW',
    },
    {
      id: 'upscale' as const,
      label: 'Upscale',
      icon: ZoomIn,
      description: 'Crystal Upscaler',
    },
    {
      id: 'uniqueizer' as const,
      label: 'Уникализатор',
      icon: Copy,
      description: 'Уникальные копии видео',
    },
  ]

  const tabs = allTabs.filter((tab) => (VISIBLE_TABS as readonly string[]).includes(tab.id))

  return (
    <div className="flex flex-col gap-1 p-3 border-r border-border bg-card/30 min-w-[200px]">
      <div className="mb-2 px-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Режимы
        </h2>
      </div>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left group',
              isActive
                ? 'bg-primary/10 border border-primary/20 shadow-sm'
                : 'hover:bg-secondary/50 border border-transparent'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5 mt-0.5 shrink-0 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {tab.label}
                </span>
                {tab.badge !== undefined && (
                  <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 leading-none">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-xs transition-colors mt-0.5 block',
                  isActive ? 'text-primary/70' : 'text-muted-foreground'
                )}
              >
                {tab.description}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
