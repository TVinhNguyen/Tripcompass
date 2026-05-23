"use client"

// =============================================================================
// <OnboardingTour /> — Spotlight tour engine.
//
// Highlights a target element with a soft ring, dims the rest of the screen,
// and shows a Back / Next / Skip popover next to it. Stores "seen" state in
// localStorage so it never replays automatically — callers can pass a fresh
// `storageKey` (e.g. include user.id) to make it per-account.
//
// Why custom instead of a lib like driver.js / shepherd?
//   • <500 LOC, no extra dependency, matches the project's design tokens.
//   • Only needs spotlight + popover — no advanced quirks the libs solve.
//
// Scope:
//   • Pure overlay; doesn't trap focus aggressively (Esc + Skip suffice).
//   • Target lookup via [data-tour="..."] — keeps step config and DOM
//     decoupled so refactors of layout don't break tour steps.
//   • Recalculates position on resize/scroll/step change.
//
// Usage:
//   <OnboardingTour
//     storageKey={`tour_planner_${user.id}`}
//     enabled={!hasItineraries}
//     steps={[
//       { target: '[data-tour="ai-chat"]', title: '…', body: '…' },
//       ...
//     ]}
//   />
// =============================================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowRight, X } from "lucide-react"

export interface TourStep {
  target: string  // CSS selector, typically [data-tour="..."]
  title: string
  body: string
  // Where the popover should sit relative to the target. Defaults to "bottom"
  // and falls back automatically if the target is near a viewport edge.
  preferredPlacement?: "top" | "bottom" | "left" | "right"
}

interface OnboardingTourProps {
  steps: TourStep[]
  storageKey: string
  enabled: boolean
}

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const POPOVER_W = 320
const POPOVER_GAP = 16
const SPOTLIGHT_PAD = 8

export function OnboardingTour({ steps, storageKey, enabled }: OnboardingTourProps) {
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetBox, setTargetBox] = useState<Box | null>(null)
  const mountedRef = useRef(false)

  // Decide whether to start the tour. Runs once when the gate (`enabled`)
  // becomes true and we haven't shown it before. Idempotent — additional
  // re-renders with the same key are no-ops.
  useEffect(() => {
    if (!enabled) return
    if (mountedRef.current) return
    if (typeof window === "undefined") return
    if (window.localStorage.getItem(storageKey) === "1") return
    mountedRef.current = true
    // Wait one frame so target elements have laid out.
    requestAnimationFrame(() => setActive(true))
  }, [enabled, storageKey])

  // Recompute the target box on step change, resize, or scroll. We use
  // getBoundingClientRect each time rather than caching — cheap and dodges
  // stale offsets after layout shifts.
  const recalc = useCallback(() => {
    if (!active) return
    const step = steps[stepIdx]
    if (!step) return
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) {
      setTargetBox(null)
      return
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
    const rect = el.getBoundingClientRect()
    setTargetBox({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    })
  }, [active, stepIdx, steps])

  useLayoutEffect(() => {
    if (!active) return
    recalc()
    const onResize = () => recalc()
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onResize, true)
    // Re-measure after a short delay too — covers async layout (fonts, images).
    const t = setTimeout(recalc, 200)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onResize, true)
      clearTimeout(t)
    }
  }, [active, recalc])

  // Esc to skip.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish()
      if (e.key === "ArrowRight" || e.key === "Enter") next()
      if (e.key === "ArrowLeft") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, steps.length])

  const finish = useCallback(() => {
    setActive(false)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1")
    }
  }, [storageKey])

  const next = useCallback(() => {
    if (stepIdx < steps.length - 1) setStepIdx(stepIdx + 1)
    else finish()
  }, [stepIdx, steps.length, finish])

  const back = useCallback(() => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }, [stepIdx])

  if (!active) return null
  if (typeof document === "undefined") return null

  const step = steps[stepIdx]
  if (!step) return null

  // Decide popover position. Default below target; flip above if target sits
  // in the bottom 40% of the viewport.
  let popoverTop = 0
  let popoverLeft = 0
  if (targetBox) {
    const placeBelow =
      step.preferredPlacement === "bottom" ||
      (step.preferredPlacement === undefined && targetBox.top + targetBox.height + POPOVER_GAP + 200 < window.innerHeight)

    popoverTop = placeBelow
      ? targetBox.top + targetBox.height + POPOVER_GAP
      : Math.max(POPOVER_GAP, targetBox.top - POPOVER_GAP - 200)

    popoverLeft = Math.min(
      Math.max(POPOVER_GAP, targetBox.left + targetBox.width / 2 - POPOVER_W / 2),
      window.innerWidth - POPOVER_W - POPOVER_GAP,
    )
  } else {
    // Target not found — center the popover so the user can still skip.
    popoverTop = window.innerHeight / 2 - 100
    popoverLeft = window.innerWidth / 2 - POPOVER_W / 2
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Hướng dẫn nhanh"
    >
      {/* Dim layer with a cut-out hole where the target sits. SVG mask is the
          cheapest way to render a punched-through rectangle. */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetBox && (
              <rect
                x={targetBox.left - SPOTLIGHT_PAD}
                y={targetBox.top - SPOTLIGHT_PAD}
                width={targetBox.width + SPOTLIGHT_PAD * 2}
                height={targetBox.height + SPOTLIGHT_PAD * 2}
                rx={12}
                ry={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(26,26,26,0.62)" mask="url(#tour-mask)" />
      </svg>

      {/* Spotlight ring around the target so it pops visually. */}
      {targetBox && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[#d4a853] shadow-[0_0_0_4px_rgba(212,168,83,0.25)] transition-all"
          style={{
            top: targetBox.top - SPOTLIGHT_PAD,
            left: targetBox.left - SPOTLIGHT_PAD,
            width: targetBox.width + SPOTLIGHT_PAD * 2,
            height: targetBox.height + SPOTLIGHT_PAD * 2,
          }}
        />
      )}

      {/* Popover */}
      <div
        className="absolute rounded-2xl border border-[#e8e2d9] bg-white p-5 shadow-2xl"
        style={{ top: popoverTop, left: popoverLeft, width: POPOVER_W }}
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Bỏ qua hướng dẫn"
          className="absolute right-3 top-3 rounded-full p-1.5 text-[#8b8378] transition-colors hover:bg-[#f5f0e8] hover:text-[#1a1a1a]"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c4785a]">
          Bước {stepIdx + 1} / {steps.length}
        </p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-[#1a1a1a]">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#6b6b6b]">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-[#8b8378] transition-colors hover:text-[#1a1a1a]"
          >
            Bỏ qua
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center gap-1 rounded-full border border-[#e8e2d9] px-3 py-1.5 text-xs font-medium text-[#1a1a1a] transition-colors hover:border-[#3d5a3d]"
              >
                <ArrowLeft className="h-3 w-3" />
                Trước
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1 rounded-full bg-[#3d5a3d] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2d4a2d]"
            >
              {stepIdx === steps.length - 1 ? "Xong" : "Tiếp"}
              {stepIdx < steps.length - 1 && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
