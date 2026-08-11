import { createPublicClient, http, parseAbiItem, type PublicClient } from 'viem'

// Config chain ARC Testnet dùng chung cho các file mới của tính năng ARC leaderboard.
// Các route cũ (register-onchain, reputation, validate, feedback) tự định nghĩa riêng,
// không đụng vào để tránh phá vỡ code đang chạy ổn định.
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
}

export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const
export const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713' as const

// Native USDC on Arc Testnet — same address used by scripts/test-payroll-claim.mjs
// and scripts/measure-paybatch-gas.mjs.
export const USDC_TOKEN = '0x3600000000000000000000000000000000000000' as const

export const USDC_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

// Block deploy của 2 contract — verify bằng eth_getCode binary search ngày 2026-07-02.
// Không bao giờ quét trước các block này — tránh lãng phí ~29.2M block rỗng.
export const IDENTITY_REGISTRY_DEPLOY_BLOCK = 29_241_340n
export const REPUTATION_REGISTRY_DEPLOY_BLOCK = 29_241_344n

// Event ABIs — verify thật trên chain ngày 2026-07-02 (decode được log thật,
// agentId/value/valueDecimals khớp đúng ý nghĩa: value=7000, valueDecimals=2 → điểm 70.00).
export const NEW_FEEDBACK_EVENT = parseAbiItem(
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
)
export const FEEDBACK_REVOKED_EVENT = parseAbiItem(
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)'
)

// eth_getLogs trên RPC này giới hạn cứng 10,000 block/lần và 20,000 kết quả/lần
// (verify thật — RPC trả lỗi kèm range gợi ý khi vượt).
export const MAX_LOG_RANGE = 10_000n

let _client: PublicClient | null = null
export function arcPublicClient(): PublicClient {
  if (!_client) _client = createPublicClient({ chain: arcTestnet, transport: http() })
  return _client
}
