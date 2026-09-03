import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDismissableMenu } from './useDismissableMenu'

function setup(open: boolean) {
  const onClose = vi.fn()
  const { result } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(document.createElement('div'))
    document.body.appendChild(ref.current)
    useDismissableMenu(open, onClose, ref)
    return ref
  })
  return { onClose, ref: result.current }
}

describe('useDismissableMenu (M0.2/M8.1)', () => {
  it('does nothing while closed', () => {
    const { onClose } = setup(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape while open', () => {
    const { onClose } = setup(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on a mousedown outside the container while open', () => {
    const { onClose } = setup(true)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose on a mousedown inside the container', () => {
    const { onClose, ref } = setup(true)
    ref.current!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
