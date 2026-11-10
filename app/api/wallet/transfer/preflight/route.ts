import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { runTransferPreflight, TransferPreflightError } from '@/app/lib/transfer-preflight'

// Read-only validation for the mobile Send review screen (no PIN, no funds
// moved). The actual send stays in /api/wallet/transfer.
export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  try {
    const result = await runTransferPreflight({
      supabase,
      userId: user.id,
      destinationAddress: body.destinationAddress,
      amount: body.amount,
      tokenSymbol: body.tokenSymbol,
    })
    return NextResponse.json({
      destinationAddress: result.destinationAddress,
      amount: result.amount,
      tokenSymbol: result.tokenSymbol,
      decimals: result.decimals,
      availableBalance: result.balance,
      networkFee: result.networkFee,
      feeCurrency: result.feeCurrency,
      feeLevel: result.feeLevel,
      recipientUsername: result.recipientUsername,
      safetyChecks: result.safetyChecks,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof TransferPreflightError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[transfer/preflight] failed:', error)
    return NextResponse.json({ error: 'Unable to validate transfer' }, { status: 502 })
  }
}
