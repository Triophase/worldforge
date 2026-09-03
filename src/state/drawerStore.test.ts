import { beforeEach, describe, expect, it } from 'vitest'
import { useDrawerStore } from './drawerStore'

describe('drawerStore (M8.4, §28)', () => {
  beforeEach(() => {
    useDrawerStore.setState({ assetsOpen: false, propertiesOpen: false })
  })

  it('both drawers default to closed', () => {
    expect(useDrawerStore.getState().assetsOpen).toBe(false)
    expect(useDrawerStore.getState().propertiesOpen).toBe(false)
  })

  it('toggleAssets flips only assetsOpen', () => {
    useDrawerStore.getState().toggleAssets()
    expect(useDrawerStore.getState().assetsOpen).toBe(true)
    expect(useDrawerStore.getState().propertiesOpen).toBe(false)

    useDrawerStore.getState().toggleAssets()
    expect(useDrawerStore.getState().assetsOpen).toBe(false)
  })

  it('toggleProperties flips only propertiesOpen', () => {
    useDrawerStore.getState().toggleProperties()
    expect(useDrawerStore.getState().propertiesOpen).toBe(true)
    expect(useDrawerStore.getState().assetsOpen).toBe(false)
  })

  it('closeAssets/closeProperties always set false, regardless of prior state', () => {
    useDrawerStore.setState({ assetsOpen: true, propertiesOpen: true })
    useDrawerStore.getState().closeAssets()
    useDrawerStore.getState().closeProperties()
    expect(useDrawerStore.getState()).toMatchObject({ assetsOpen: false, propertiesOpen: false })
  })
})
