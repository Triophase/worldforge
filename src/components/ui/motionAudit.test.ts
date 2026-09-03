import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function findCssModules(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...findCssModules(full))
    } else if (entry.endsWith('.module.css')) {
      files.push(full)
    }
  }
  return files
}

/**
 * `M8.3`/§22: "one place to check" for every transition duration is
 * `theme.css`'s `--transition-fast` token (already validated by
 * `theme.test.ts` to sit within 150-250ms) — this test is the other
 * half of that guarantee: no `.module.css` file anywhere in the app may
 * hardcode its own literal millisecond duration, which would silently
 * drift out of sync with the shared token the moment it changes. Scoped
 * to CSS modules only — the two in-Canvas imperative animations
 * (`CameraRig.tsx`'s `TRANSITION_MS`, `SelectionOutline.tsx`'s
 * `FADE_MS`, both already 200ms) are a separate, already-audited
 * category: CSS custom properties aren't readable from a `useFrame`
 * loop without extra runtime coupling, so JS-side duration constants
 * inside the Canvas are accepted as their own single-purpose source of
 * truth, not a second violation of this same rule.
 */
describe('motion timing audit (M8.3, §22)', () => {
  it('no CSS module outside theme.css hardcodes its own transition duration', () => {
    const files = findCssModules(srcDir).filter((f) => !f.endsWith('theme.css'))
    expect(files.length).toBeGreaterThan(0)

    const offenders = files
      .map((file) => ({ file, css: readFileSync(file, 'utf-8') }))
      .filter(({ css }) => /\d+ms\b/.test(css))
      .map(({ file }) => relative(srcDir, file))

    expect(offenders).toEqual([])
  })
})
