export function shellQuote(value) {
  if (value === '') {
    return "''"
  }
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) {
    return value
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

export function createSshInvocation(sshTarget, remoteScript) {
  return {
    file: 'ssh',
    args: [sshTarget, remoteScript],
    display: `ssh ${shellQuote(sshTarget)} ${shellQuote(remoteScript)}`,
  }
}

export function createScpInvocation(sshTarget, sources, stagingDir) {
  if (sources.length === 0) {
    throw new Error('No dist files found to upload.')
  }

  const normalizedStagingDir = stagingDir.endsWith('/') ? stagingDir : `${stagingDir}/`
  const remoteTarget = `${sshTarget}:${normalizedStagingDir}`
  return {
    file: 'scp',
    args: ['-r', ...sources, remoteTarget],
    display: `scp -r ${sources.map(shellQuote).join(' ')} ${shellQuote(remoteTarget)}`,
  }
}
