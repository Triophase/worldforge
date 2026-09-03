import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SCENE_NAME, useSceneStore } from '../../state/sceneStore'
import { SceneNameEditor } from './SceneNameEditor'

describe('SceneNameEditor (D31, M6.5)', () => {
  beforeEach(() => {
    useSceneStore.setState({ name: DEFAULT_SCENE_NAME, isDirty: false })
  })

  it('shows the current scene name as static text', () => {
    useSceneStore.setState({ name: 'Robot Arm Rig' })
    render(<SceneNameEditor />)
    expect(screen.getByRole('button', { name: 'Rename scene' })).toHaveTextContent('Robot Arm Rig')
  })

  it('clicking switches to an editable input pre-filled with the current name', () => {
    useSceneStore.setState({ name: 'Robot Arm Rig' })
    render(<SceneNameEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename scene' }))
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Robot Arm Rig')
  })

  it('committing on blur renames the scene and marks the draft dirty', () => {
    render(<SceneNameEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename scene' }))

    const input = screen.getByRole('textbox', { name: 'Scene name' })
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.blur(input)

    expect(useSceneStore.getState().name).toBe('New Name')
    expect(useSceneStore.getState().isDirty).toBe(true)
    expect(screen.getByRole('button', { name: 'Rename scene' })).toHaveTextContent('New Name')
  })

  it('Escape reverts without committing', () => {
    useSceneStore.setState({ name: 'Original' })
    render(<SceneNameEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename scene' }))

    const input = screen.getByRole('textbox', { name: 'Scene name' })
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(useSceneStore.getState().name).toBe('Original')
  })
})
