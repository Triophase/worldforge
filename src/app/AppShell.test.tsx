import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDrawerStore } from '../state/drawerStore'
import { AppShell } from './AppShell'
import { ASSETS_MIN, DRAWER_BREAKPOINT } from './panelSizing'

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

describe('AppShell', () => {
  it('renders the five distinct layout regions from idea.md §3', () => {
    render(<AppShell />)
    expect(screen.getByText('Worldforge')).toBeInTheDocument() // toolbar
    expect(screen.getByRole('region', { name: 'Assets' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Viewport' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Properties' })).toBeInTheDocument()
    expect(screen.getByText('00.00s')).toBeInTheDocument() // transport bar
  })

  it('renders Assets and Properties as separate panel elements', () => {
    render(<AppShell />)
    const assets = screen.getByRole('region', { name: 'Assets' })
    const properties = screen.getByRole('region', { name: 'Properties' })
    expect(assets).not.toBe(properties)
    expect(assets).not.toContainElement(properties)
  })

  it('the transport bar reflects an idle simulation (M3.4): Play enabled, Pause/Reset disabled', () => {
    render(<AppShell />)
    const transportBar = screen.getByText('00.00s').closest('footer')!
    expect(within(transportBar).getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(within(transportBar).getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(within(transportBar).getByRole('button', { name: 'Reset' })).toBeDisabled()
    // Speed (M3.5) is never gated on simulation phase — changeable any time.
    for (const speed of ['0.25x', '0.5x', '1x', '2x']) {
      expect(within(transportBar).getByRole('button', { name: speed })).toBeEnabled()
    }
  })

  it('opens a File menu dropdown and closes it on Escape', () => {
    render(<AppShell />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('dragging the assets resize handle changes its width, clamped to the panel minimum', () => {
    render(<AppShell />)
    const handle = screen.getByRole('separator', { name: 'Resize assets panel' })
    const assetsRegion = screen.getByRole('region', { name: 'Assets' })
    const initialWidth = assetsRegion.parentElement?.style.width

    fireEvent.mouseDown(handle, { clientX: 300 })
    fireEvent.mouseMove(window, { clientX: -500 }) // drag far left
    fireEvent.mouseUp(window)

    expect(assetsRegion.parentElement?.style.width).toBe(`${ASSETS_MIN}px`)
    expect(assetsRegion.parentElement?.style.width).not.toBe(initialWidth)
  })

  it('dragging the assets handle far right is constrained by the viewport-width floor, not the panel max alone', () => {
    render(<AppShell />)
    const handle = screen.getByRole('separator', { name: 'Resize assets panel' })
    const assetsRegion = screen.getByRole('region', { name: 'Assets' })

    fireEvent.mouseDown(handle, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 5000 }) // an enormous drag right
    fireEvent.mouseUp(window)

    const finalWidth = Number.parseInt(assetsRegion.parentElement?.style.width ?? '0', 10)
    // jsdom's default window width (1024) makes the viewport-floor the
    // binding constraint here, well below the panel's own 420px max —
    // proving the viewport never gets squeezed below its minimum.
    expect(finalWidth).toBeLessThan(420)
    expect(finalWidth).toBeGreaterThanOrEqual(ASSETS_MIN)
  })

  describe('drawer mode (M8.4, §28)', () => {
    beforeEach(() => {
      useDrawerStore.setState({ assetsOpen: false, propertiesOpen: false })
    })

    afterEach(() => {
      setWindowWidth(1024) // restore jsdom's own default for every other test
    })

    it('at or above the breakpoint, Assets/Properties render inline exactly as before this task (no resize handles hidden)', () => {
      setWindowWidth(DRAWER_BREAKPOINT)
      render(<AppShell />)

      expect(screen.getByRole('region', { name: 'Assets' }).parentElement!.style.width).not.toBe('')
      expect(screen.getByRole('separator', { name: 'Resize assets panel' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Assets' })).not.toBeInTheDocument() // no drawer trigger
    })

    it('below the breakpoint, both drawers are closed by default and hidden from assistive tech', () => {
      setWindowWidth(DRAWER_BREAKPOINT - 1)
      render(<AppShell />)

      // `{ hidden: true }` — the wrapper is `aria-hidden` while closed, so
      // the default role query (which excludes inaccessible elements) would
      // never find it; that's the exact behavior being asserted here.
      const assetsWrapper = screen.getByRole('region', { name: 'Assets', hidden: true }).parentElement!
      // `PropertiesPanel`'s own region sits one level deeper than
      // `AssetLibraryPanel`'s — nested inside `.propertiesSlot`, itself
      // inside the drawer wrapper — so reaching the wrapper needs one
      // more `.parentElement` step here than for Assets.
      const propertiesWrapper = screen.getByRole('region', { name: 'Properties', hidden: true }).parentElement!
        .parentElement!
      expect(assetsWrapper).toHaveAttribute('aria-hidden', 'true')
      expect(propertiesWrapper).toHaveAttribute('aria-hidden', 'true')
      expect(assetsWrapper.className).not.toMatch(/drawerOpen/)
    })

    it('below the breakpoint, no resize handle is rendered and the drawer trigger icons appear in the toolbar', () => {
      setWindowWidth(DRAWER_BREAKPOINT - 1)
      render(<AppShell />)

      expect(screen.queryByRole('separator', { name: 'Resize assets panel' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Assets' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Properties' })).toBeInTheDocument()
    })

    it('clicking the Assets drawer icon opens it without changing the viewport region\'s presence/size', () => {
      setWindowWidth(DRAWER_BREAKPOINT - 1)
      render(<AppShell />)
      const viewportBefore = screen.getByRole('region', { name: 'Viewport' })

      fireEvent.click(screen.getByRole('button', { name: 'Assets' }))

      const assetsWrapper = screen.getByRole('region', { name: 'Assets' }).parentElement!
      expect(assetsWrapper).toHaveAttribute('aria-hidden', 'false')
      expect(assetsWrapper.className).toMatch(/drawerOpen/)
      expect(screen.getByRole('region', { name: 'Viewport' })).toBe(viewportBefore) // same element, unaffected
    })

    it('the drawer container is fixed-position, never part of the flex layout that sizes the viewport', () => {
      setWindowWidth(DRAWER_BREAKPOINT - 1)
      render(<AppShell />)
      const assetsWrapper = screen.getByRole('region', { name: 'Assets', hidden: true }).parentElement!
      expect(assetsWrapper.style.width).toBe('') // no inline width, unlike inline mode
    })

    it('resizing across the breakpoint live-switches modes without remounting the Assets/Properties panels', () => {
      setWindowWidth(1200)
      render(<AppShell />)
      expect(screen.getByRole('separator', { name: 'Resize assets panel' })).toBeInTheDocument()
      // Capture the actual DOM nodes hosting the panels — proving these
      // exact nodes survive the mode switch is what rules out an
      // unmount/remount (which would lose any of their own internal
      // React state, e.g. the Assets panel's search text).
      const assetsHost = screen.getByRole('region', { name: 'Assets' })
      const propertiesHost = screen.getByRole('region', { name: 'Properties' })

      fireEvent(window, (() => {
        setWindowWidth(600)
        return new Event('resize')
      })())

      expect(screen.queryByRole('separator', { name: 'Resize assets panel' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Assets' })).toBeInTheDocument()
      expect(document.body.contains(assetsHost)).toBe(true)
      expect(document.body.contains(propertiesHost)).toBe(true)

      fireEvent(window, (() => {
        setWindowWidth(1200)
        return new Event('resize')
      })())

      expect(screen.getByRole('separator', { name: 'Resize assets panel' })).toBeInTheDocument()
      expect(document.body.contains(assetsHost)).toBe(true)
      expect(document.body.contains(propertiesHost)).toBe(true)
    })

    it('M8.5/§29: opening a drawer moves focus into it; closing returns focus to the toolbar trigger', () => {
      setWindowWidth(DRAWER_BREAKPOINT - 1)
      render(<AppShell />)
      const trigger = screen.getByRole('button', { name: 'Assets' })

      trigger.focus()
      fireEvent.click(trigger)

      const drawer = screen.getByRole('region', { name: 'Assets' }).parentElement!
      expect(document.activeElement).toBe(drawer)

      fireEvent.click(trigger) // toggles closed again
      expect(document.activeElement).toBe(trigger)
    })
  })
})
