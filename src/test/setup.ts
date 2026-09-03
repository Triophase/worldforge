import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import 'vitest-webgl-canvas-mock'
import { afterEach } from 'vitest'

// jsdom has no ResizeObserver; @react-three/fiber's <Canvas> needs one to
// size itself. A no-op stub is enough for tests, which never rely on real
// resize notifications firing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
})
