import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CollapsibleSection } from './CollapsibleSection'

const dir = dirname(fileURLToPath(import.meta.url))

describe('CollapsibleSection (M8.3, §19/§22)', () => {
  it('starts expanded, with its content visible', () => {
    render(
      <CollapsibleSection title="Transform">
        <p>content</p>
      </CollapsibleSection>,
    )

    expect(screen.getByText('content')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Transform' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicking the header collapses it (aria-expanded flips); clicking again expands it', () => {
    render(
      <CollapsibleSection title="Physics">
        <p>content</p>
      </CollapsibleSection>,
    )
    const header = screen.getByRole('button', { name: 'Physics' })

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders as a labeled region (aria-label matches the title)', () => {
    render(
      <CollapsibleSection title="Joint">
        <p>content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('region', { name: 'Joint' })).toBeInTheDocument()
  })

  it('the collapse transition uses the shared 150-250ms theme token, never a hardcoded duration', () => {
    // §22/M0.2's own "one place to check" convention: this component's
    // CSS module must reference var(--transition-fast), never a literal
    // ms value of its own — otherwise a future theme-wide timing change
    // would silently miss this surface.
    const css = readFileSync(join(dir, 'PropertiesPanel.module.css'), 'utf-8')
    const sectionBodyRule = css.slice(css.indexOf('.sectionBody {'), css.indexOf('.sectionBodyCollapsed'))
    expect(sectionBodyRule).toContain('var(--transition-fast)')
    expect(sectionBodyRule).not.toMatch(/\d+ms/)
  })
})
