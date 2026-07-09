import type { Address, Hex } from 'viem'
import { circleClient } from './circle'

/**
 * EVM signer for @circle-fin/x402-batching's BatchEvmScheme, backed by a Circle
 * Developer-Controlled EOA wallet. Circle never exposes the wallet's raw private
 * key, so instead of signing locally we ask Circle to sign the EIP-712 typed
 * data remotely via signTypedData() — the resulting signature is a standard
 * ECDSA signature, recoverable via ecrecover just like a locally-signed one.
 */
export function createCircleX402Signer(walletId: string, address: Address) {
  return {
    address,
    async signTypedData(params: {
      domain: { name: string; version: string; chainId: number; verifyingContract: Address }
      types: Record<string, Array<{ name: string; type: string }>>
      primaryType: string
      message: Record<string, unknown>
    }): Promise<Hex> {
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...params.types,
        },
        domain: params.domain,
        primaryType: params.primaryType,
        message: params.message,
      }

      const res = await circleClient.signTypedData({
        walletId,
        // EIP-712 uint256 fields (value/validAfter/validBefore) arrive as BigInt —
        // JSON.stringify can't serialize those natively, so stringify them instead.
        data: JSON.stringify(typedData, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signature = (res.data as any)?.signature ?? (res.data as any)?.data?.signature
      if (!signature) throw new Error('Circle signTypedData did not return a signature')
      return signature as Hex
    },
  }
}
