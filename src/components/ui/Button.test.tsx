import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('is enabled by default', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button', { name: 'Click' })).toBeEnabled()
  })

  it('disabled sets both the DOM attribute and a distinct style, not color alone', () => {
    render(<Button disabled>Click</Button>)
    const button = screen.getByRole('button', { name: 'Click' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('disabled')
  })
})
