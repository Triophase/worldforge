import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('becomes visible on hover and hides again on mouse-leave', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip label="Delete" delayMs={0}>
        <Button>x</Button>
      </Tooltip>,
    )

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await user.hover(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Delete'))

    await user.unhover(screen.getByRole('button'))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('becomes visible on focus and hides again on blur', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip label="Delete" delayMs={0}>
        <Button>x</Button>
      </Tooltip>,
    )

    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeInTheDocument())

    await user.tab()
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})
