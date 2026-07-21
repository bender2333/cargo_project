import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCustomContainers } from '../api/customContainers'
import { CustomContainerDialog } from './CustomContainerDialog'

vi.mock('../api/customContainers', () => ({
  createCustomContainer: vi.fn(),
  deleteCustomContainer: vi.fn(),
  readCustomContainers: vi.fn(),
  updateCustomContainer: vi.fn(),
}))

const mockedRead = vi.mocked(readCustomContainers)

beforeEach(() => {
  mockedRead.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('CustomContainerDialog API failures', () => {
  it('shows a load failure instead of presenting an empty container list', async () => {
    mockedRead.mockRejectedValue(new Error('柜型加载失败'))

    const view = render(
      <CustomContainerDialog
        currentSelectedId="20gp"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(await view.findByText('柜型加载失败')).toBeTruthy()
    expect(view.queryByText('暂无自定义柜型，点击右上角按钮添加。')).toBeNull()
  })
})
