// Single source for the Arc Testnet JSON-RPC endpoint. The original
// rpc.testnet.arc.network host stopped resolving (NXDOMAIN, Oct 2026) —
// rpc.testnet.arc.io is the current public endpoint, and the one Circle's
// own SDK chain definitions moved to. Override with ARC_RPC_URL if it moves
// again, instead of editing every viem chain definition.
export const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'
