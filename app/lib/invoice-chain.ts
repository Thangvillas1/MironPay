import { keccak256, toBytes, recoverMessageAddress, type Address, type Hex } from 'viem'

export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface InvoiceContent {
  receiveAddress: string
  lineItems: InvoiceLineItem[]
  taxBps: number
  discountAmount: number
  dueDate: string // ISO
  notes: string | null
  nonce: string // crypto.randomUUID(), stops two identical invoices hashing the same
}

export function computeInvoiceTotal(lineItems: InvoiceLineItem[], taxBps: number, discountAmount: number): number {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0)
  const tax = (subtotal * taxBps) / 10000
  const total = subtotal + tax - discountAmount
  return Math.round(total * 100) / 100
}

/** Canonical content hash the issuer signs and anyone can independently
 *  recompute to detect tampering — every field that could be forged after
 *  the fact is included, so changing any of them invalidates the signature. */
export function invoiceContentHash(content: InvoiceContent): Hex {
  const canonical = JSON.stringify({
    receiveAddress: content.receiveAddress.toLowerCase(),
    lineItems: content.lineItems,
    taxBps: content.taxBps,
    discountAmount: content.discountAmount,
    dueDate: content.dueDate,
    notes: content.notes,
    nonce: content.nonce,
  })
  return keccak256(toBytes(canonical))
}

/** Verifies the issuer's wallet actually produced `signature` over
 *  `contentHash` (personal_sign / EIP-191, matching how Circle's
 *  signMessage(message, encodedByHex: true) signs a raw hex payload —
 *  same recovery scheme already relied on by MironPayrollClaim.claim()). */
export async function verifyInvoiceSignature(
  contentHash: Hex,
  signature: Hex,
  issuerAddress: Address
): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({ message: { raw: contentHash }, signature })
    return recovered.toLowerCase() === issuerAddress.toLowerCase()
  } catch {
    return false
  }
}
