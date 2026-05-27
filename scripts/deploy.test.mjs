import { describe, expect, it } from 'vitest'

import { createScpInvocation, createSshInvocation } from './deployCommands.mjs'

describe('deploy command invocations', () => {
  it('passes the remote shell script to ssh as one argument', () => {
    const remoteScript = 'set -e; echo "$backup"'

    expect(createSshInvocation('cargo-server', remoteScript)).toEqual({
      file: 'ssh',
      args: ['cargo-server', remoteScript],
      display: `ssh cargo-server 'set -e; echo "$backup"'`,
    })
  })

  it('uploads concrete dist entries without relying on local shell glob expansion', () => {
    expect(createScpInvocation('cargo-server', ['dist/index.html', 'dist/assets'], '/tmp/cargo-dist')).toEqual({
      file: 'scp',
      args: ['-r', 'dist/index.html', 'dist/assets', 'cargo-server:/tmp/cargo-dist/'],
      display: 'scp -r dist/index.html dist/assets cargo-server:/tmp/cargo-dist/',
    })
  })
})
