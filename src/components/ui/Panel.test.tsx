import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Panel } from './Panel'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Panel', () => {
  it('renders its children inside a container', () => {
    render(<Panel>content</Panel>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('uses the panel background, border, and a non-zero border-radius token', () => {
    const css = readFileSync(join(dir, 'Panel.module.css'), 'utf-8')
    expect(css).toMatch(/background:\s*var\(--color-panel-bg\)/)
    expect(css).toMatch(/border:\s*1px solid var\(--color-border\)/)
    expect(css).toMatch(/border-radius:\s*var\(--radius-md\)/)
  })
})
