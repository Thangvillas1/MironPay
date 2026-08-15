const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function normalizeWalletAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const address = value.trim()
  return EVM_ADDRESS.test(address) ? address.toLowerCase() : null
}

export function isSelfTransferAddress(
  destination: unknown,
  ownAddresses: Array<string | null | undefined>,
): boolean {
  const normalizedDestination = normalizeWalletAddress(destination)
  if (!normalizedDestination) return false
  return ownAddresses.some(address => normalizeWalletAddress(address) === normalizedDestination)
}
