import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentRoot = resolve(process.cwd(), 'src/components')

describe('component network boundary', () => {
  it('keeps raw HTTP requests out of React components', () => {
    const violations = readdirSync(componentRoot, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .filter((file) => {
        const source = readFileSync(join(componentRoot, file), 'utf8')
        return /from ['"]\.\.\/api\/client['"]/.test(source)
          || /\bfetch(?:WithAuth)?\s*\(/.test(source)
      })

    expect(violations).toEqual([])
  })
})
