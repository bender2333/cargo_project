export function createClientId() {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }

  return `cargo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
