import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from '../state/sceneStore'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

function Host() {
  useUnsavedChangesWarning()
  return null
}

function dispatchBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(event)
  return event
}

describe('useUnsavedChangesWarning (D4)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
  })

  it('does not prevent unload when the draft is clean', () => {
    render(<Host />)
    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })

  it('prevents unload (triggering the native prompt) when the draft is dirty', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    render(<Host />)
    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
  })
})
