import type { Locale } from '../types'
import type { PlaybackSequence } from '../lib/playback'
import type { PlaybackSpeed } from '../hooks/usePlaybackController'

export type { PlaybackSpeed }

const T = {
  en: {
    title: 'Loading playback',
    description: 'Play the recommended loading order step by step.',
    play: 'Play',
    pause: 'Pause',
    prev: 'Previous',
    next: 'Next',
    reset: 'Reset',
    finish: 'Skip to end',
    step: 'Step',
    of: 'of',
    speed: 'Speed',
    speedSlow: 'Slow',
    speedNormal: 'Normal',
    speedFast: 'Fast',
    exportInstructions: 'Export instructions',
    notAvailable: 'Playback is only available after a calculated automatic plan.',
    placeAt: 'Place at',
    label: 'Label',
    supportType: 'Support',
    floor: 'floor',
    fullSupport: 'fully supported',
    partialSupport: 'partial support',
  },
  zh: {
    title: '装柜作业回放',
    description: '按推荐装载顺序逐步演示。',
    play: '播放',
    pause: '暂停',
    prev: '上一步',
    next: '下一步',
    reset: '回到开头',
    finish: '跳到结束',
    step: '步骤',
    of: '/',
    speed: '速度',
    speedSlow: '慢',
    speedNormal: '正常',
    speedFast: '快',
    exportInstructions: '导出指令单',
    notAvailable: '只有自动排布完成后才能使用作业回放。',
    placeAt: '放置坐标',
    label: '标签',
    supportType: '支撑',
    floor: '地面',
    fullSupport: '完全支撑',
    partialSupport: '部分支撑',
  },
} as const

type Props = {
  sequence: PlaybackSequence
  cursor: number
  playing: boolean
  speed: PlaybackSpeed
  locale: Locale
  available: boolean
  onCursorChange: (cursor: number) => void
  onTogglePlay: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
  onReset: () => void
  onFinish: () => void
  onExport: () => void
}

export function PlaybackPanel({
  sequence,
  cursor,
  playing,
  speed,
  locale,
  available,
  onCursorChange,
  onTogglePlay,
  onSpeedChange,
  onReset,
  onFinish,
  onExport,
}: Props) {
  const t = T[locale]

  if (!available) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#64748b]" data-testid="playback-panel-empty">
        <h3 className="mb-2 text-base font-bold text-[#0f172a]">{t.title}</h3>
        <p>{t.notAvailable}</p>
      </div>
    )
  }

  const currentStep = sequence.steps[cursor - 1] ?? null
  const supportLabel = currentStep
    ? currentStep.box.supportType === 'floor'
      ? t.floor
      : currentStep.box.supportType === 'fully-supported'
        ? t.fullSupport
        : t.partialSupport
    : ''

  return (
    <div className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4" data-testid="playback-panel">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">{t.title}</h3>
        <span className="text-xs text-[#475569]" data-testid="playback-step-counter">
          {t.step} {cursor} {t.of} {sequence.total}
        </span>
      </div>
      <p className="text-xs text-[#64748b]">{t.description}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button className="archive-button" type="button" data-testid="playback-reset" onClick={onReset} disabled={cursor === 0}>
          {t.reset}
        </button>
        <button
          className="archive-button"
          type="button"
          data-testid="playback-prev"
          onClick={() => onCursorChange(cursor - 1)}
          disabled={cursor <= 0}
        >
          {t.prev}
        </button>
        <button
          className="archive-button success"
          type="button"
          data-testid="playback-toggle"
          onClick={onTogglePlay}
          disabled={cursor >= sequence.total && !playing}
        >
          {playing ? t.pause : t.play}
        </button>
        <button
          className="archive-button"
          type="button"
          data-testid="playback-next"
          onClick={() => onCursorChange(cursor + 1)}
          disabled={cursor >= sequence.total}
        >
          {t.next}
        </button>
        <button className="archive-button" type="button" data-testid="playback-finish" onClick={onFinish} disabled={cursor >= sequence.total}>
          {t.finish}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-[#475569]">
        <span className="font-semibold">{t.speed}:</span>
        {(['slow', 'normal', 'fast'] as PlaybackSpeed[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded-full border px-2 py-0.5 ${speed === s ? 'border-[#0ea5e9] bg-[#e0f2fe] text-[#0369a1]' : 'border-[#cbd5e1] bg-white text-[#475569]'}`}
            data-testid={`playback-speed-${s}`}
            onClick={() => onSpeedChange(s)}
          >
            {s === 'slow' ? t.speedSlow : s === 'normal' ? t.speedNormal : t.speedFast}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto archive-button"
          data-testid="playback-export"
          onClick={onExport}
          disabled={sequence.total === 0}
        >
          {t.exportInstructions}
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={sequence.total}
        value={cursor}
        className="w-full"
        data-testid="playback-slider"
        aria-label={t.title}
        onChange={(event) => onCursorChange(Number(event.target.value))}
      />

      {currentStep && (
        <div className="rounded-lg border border-[#bae6fd] bg-[#f0f9ff] p-3 text-xs text-[#0c4a6e]" data-testid="playback-current-step">
          <div className="font-semibold">{t.label}: {currentStep.box.label} — #{currentStep.box.id}</div>
          <div>{t.placeAt}: ({Math.round(currentStep.box.x)}, {Math.round(currentStep.box.y)}, {Math.round(currentStep.box.z)}) mm</div>
          <div>{t.supportType}: {supportLabel}</div>
        </div>
      )}

      <ol className="max-h-48 list-decimal overflow-auto pl-5 text-xs text-[#475569]" data-testid="playback-list">
        {sequence.steps.map((step, idx) => (
          <li
            key={step.box.id}
            className={`cursor-pointer py-0.5 ${idx + 1 === cursor ? 'font-bold text-[#0ea5e9]' : ''}`}
            onClick={() => onCursorChange(idx + 1)}
          >
            #{step.step} · {step.box.label} · ({Math.round(step.box.x)}, {Math.round(step.box.y)}, {Math.round(step.box.z)})
          </li>
        ))}
      </ol>
    </div>
  )
}
