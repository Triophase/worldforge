import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Dropdown } from './Dropdown'

describe('Dropdown', () => {
  it('toggles open on trigger click and closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Dropdown trigger="File">
        <div>New Scene</div>
      </Dropdown>,
    )

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Dropdown trigger="File">
          <div>New Scene</div>
        </Dropdown>
        <button type="button">outside</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
