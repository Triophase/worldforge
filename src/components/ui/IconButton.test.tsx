import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton label="Delete object" icon={<span aria-hidden>x</span>} />)
    expect(screen.getByRole('button', { name: 'Delete object' })).toBeInTheDocument()
  })

  it('M8.2: an optional shortcut appends to the tooltip text without changing the accessible name', async () => {
    render(<IconButton label="Play" shortcut="Space" icon={<span aria-hidden>x</span>} />)
    const button = screen.getByRole('button', { name: 'Play' }) // aria-label unaffected

    fireEvent.focus(button)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Play (Space)')
  })

  // Type-level check (spec §29): omitting `label` must fail to compile.
  // Never called — this only needs to type-check under `tsc -b`.
  function _typeCheckOnly() {
    // @ts-expect-error label is required
    return <IconButton icon={<span />} />
  }
  void _typeCheckOnly
})
