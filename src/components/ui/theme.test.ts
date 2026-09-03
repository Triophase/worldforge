import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = dirname(fileURLToPath(import.meta.url))

function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '')
  const r = Number.parseInt(n.slice(0, 2), 16) / 255
  const g = Number.parseInt(n.slice(2, 4), 16) / 255
  const b = Number.parseInt(n.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function readToken(css: string, name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`token --${name} not found`)
  return match[1]
}

describe('theme tokens', () => {
  const css = readFileSync(join(dir, 'theme.css'), 'utf-8')

  it('panel background is measurably lighter than the page background', () => {
    const bg = relativeLuminance(readToken(css, 'color-bg'))
    const panelBg = relativeLuminance(readToken(css, 'color-panel-bg'))
    expect(panelBg).toBeGreaterThan(bg)
  })

  it('every transition duration is between 150ms and 250ms inclusive', () => {
    const durations = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]))
    expect(durations.length).toBeGreaterThan(0)
    for (const ms of durations) {
      expect(ms).toBeGreaterThanOrEqual(150)
      expect(ms).toBeLessThanOrEqual(250)
    }
  })
})
