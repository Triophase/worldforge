import { describe, expect, it } from 'vitest'
import {
  IMPORT_INVALID_MESSAGE,
  IMPORT_NEWER_VERSION_MESSAGE,
  validateImportedScene,
} from './importValidation'

const VALID: Record<string, unknown> = {
  schemaVersion: 1,
  name: 'My Scene',
  objects: [],
  joints: [],
  simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
  assets: [],
}

describe('validateImportedScene (M7.2, §27)', () => {
  it('accepts a well-formed file and returns the scene', () => {
    const result = validateImportedScene(VALID)
    expect('scene' in result).toBe(true)
    expect((result as { scene: { name: string } }).scene.name).toBe('My Scene')
  })

  it('rejects a schemaVersion newer than supported with the exact D22 wording', () => {
    const result = validateImportedScene({ ...VALID, schemaVersion: 999 })
    expect(result).toEqual({ error: IMPORT_NEWER_VERSION_MESSAGE })
  })

  it('rejects a non-object payload (e.g. a bare array or primitive)', () => {
    expect(validateImportedScene(null)).toEqual({ error: IMPORT_INVALID_MESSAGE })
    expect(validateImportedScene('a string')).toEqual({ error: IMPORT_INVALID_MESSAGE })
    expect(validateImportedScene(42)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('rejects a missing schemaVersion', () => {
    const { schemaVersion: _drop, ...rest } = VALID as Record<string, unknown>
    expect(validateImportedScene(rest)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('rejects a missing objects array', () => {
    const { objects: _drop, ...rest } = VALID as Record<string, unknown>
    expect(validateImportedScene(rest)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('rejects a missing joints array', () => {
    const { joints: _drop, ...rest } = VALID as Record<string, unknown>
    expect(validateImportedScene(rest)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('rejects a missing simulation object', () => {
    const { simulation: _drop, ...rest } = VALID as Record<string, unknown>
    expect(validateImportedScene(rest)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('rejects an object with assetRef.kind "uploaded" whose key has no matching assets entry', () => {
    const scene = {
      ...VALID,
      objects: [
        {
          id: 'o1',
          name: 'Widget',
          assetRef: { kind: 'uploaded', key: 'missing-asset' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          physics: { bodyType: 'static', mass: 1, friction: 0.5, restitution: 0.3, gravity: true },
        },
      ],
      assets: [],
    }
    expect(validateImportedScene(scene)).toEqual({ error: IMPORT_INVALID_MESSAGE })
  })

  it('accepts an uploaded object whose key resolves within assets', () => {
    const scene = {
      ...VALID,
      objects: [
        {
          id: 'o1',
          name: 'Widget',
          assetRef: { kind: 'uploaded', key: 'asset-1' },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          physics: { bodyType: 'static', mass: 1, friction: 0.5, restitution: 0.3, gravity: true },
        },
      ],
      assets: [{ assetId: 'asset-1', filename: 'widget.glb', format: 'glb', data: 'YQ==' }],
    }
    const result = validateImportedScene(scene)
    expect('scene' in result).toBe(true)
  })

  it('defaults a missing/blank name to "Untitled Scene"', () => {
    const { name: _drop, ...rest } = VALID as Record<string, unknown>
    const result = validateImportedScene(rest)
    expect((result as { scene: { name: string } }).scene.name).toBe('Untitled Scene')
  })

  it('defaults a missing assets array to []', () => {
    const { assets: _drop, ...rest } = VALID as Record<string, unknown>
    const result = validateImportedScene(rest)
    expect((result as { scene: { assets: unknown[] } }).scene.assets).toEqual([])
  })
})
