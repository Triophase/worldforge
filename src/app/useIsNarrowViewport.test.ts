import { renderHook } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DRAWER_BREAKPOINT } from './panelSizing'
import { useIsNarrowViewport } from './useIsNarrowViewport'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

describe('useIsNarrowViewport (M8.4, §28)', () => {
  afterEach(() => {
    setWindowWidth(1024) // restore jsdom's own default for every other test file
  })

  it('is false at or above the breakpoint', () => {
    setWindowWidth(DRAWER_BREAKPOINT)
    const { result } = renderHook(() => useIsNarrowViewport())
    expect(result.current).toBe(false)
  })

  it('is true below the breakpoint', () => {
    setWindowWidth(DRAWER_BREAKPOINT - 1)
    const { result } = renderHook(() => useIsNarrowViewport())
    expect(result.current).toBe(true)
  })

  it('updates live on a resize event, without needing a remount', () => {
    setWindowWidth(1200)
    const { result } = renderHook(() => useIsNarrowViewport())
    expect(result.current).toBe(false)

    act(() => {
      setWindowWidth(600)
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)

    act(() => {
      setWindowWidth(1200)
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(false)
  })
})
