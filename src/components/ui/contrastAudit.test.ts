import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(dir, 'theme.css'), 'utf-8')

function readToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`token --${name} not found`)
  return match[1]!
}

/** WCAG 2.1 relative luminance / contrast ratio, per the standard formula. */
function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '')
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = channel(Number.parseInt(n.slice(0, 2), 16))
  const g = channel(Number.parseInt(n.slice(2, 4), 16))
  const b = channel(Number.parseInt(n.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const bg = readToken('color-bg')
const panelBg = readToken('color-panel-bg')
const panelBgRaised = readToken('color-panel-bg-raised')
const border = readToken('color-border')
const text = readToken('color-text')
const textMuted = readToken('color-text-muted')
const accent = readToken('color-accent')
const danger = readToken('color-danger')

const BACKGROUNDS = { bg, panelBg, panelBgRaised } as const

/**
 * `M8.5`/D41: WCAG 2.1 AA, the exact numeric standard the spec's own
 * decision log names — 4.5:1 for normal text, 3:1 for large text (24px+,
 * or 18.66px+ bold) and for UI-component visual boundaries (an input's
 * border against its panel background). Checks every text/icon color
 * token against every background it's actually used on in this app
 * (`bg`/`panelBg`/`panelBgRaised` — the only three backgrounds any
 * component ever renders on top of), so a future token change that
 * silently drifts out of AA compliance fails the build rather than
 * requiring another manual eyeball pass.
 */
describe('contrast audit (M8.5, D41 — WCAG 2.1 AA)', () => {
  describe.each(Object.entries(BACKGROUNDS))('against --color-%s', (_name, backgroundHex) => {
    it('--color-text meets the 4.5:1 normal-text minimum', () => {
      expect(contrastRatio(text, backgroundHex)).toBeGreaterThanOrEqual(4.5)
    })

    it('--color-text-muted meets the 4.5:1 normal-text minimum', () => {
      expect(contrastRatio(textMuted, backgroundHex)).toBeGreaterThanOrEqual(4.5)
    })

    it('--color-accent meets the 4.5:1 normal-text minimum (used as text/icon color, e.g. the non-owner banner)', () => {
      expect(contrastRatio(accent, backgroundHex)).toBeGreaterThanOrEqual(4.5)
    })

    it('--color-danger meets the 4.5:1 normal-text minimum (error banner text/icons)', () => {
      expect(contrastRatio(danger, backgroundHex)).toBeGreaterThanOrEqual(4.5)
    })

    it('--color-border meets the 3:1 UI-component-boundary minimum', () => {
      expect(contrastRatio(border, backgroundHex)).toBeGreaterThanOrEqual(3)
    })
  })
})
