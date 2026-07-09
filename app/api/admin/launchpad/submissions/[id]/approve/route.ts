import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { isAdminEmail } from '@/app/lib/admin'
import { createSaleOnChain } from '@/app/lib/launchpad-chain'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient(token)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data: submission } = await admin.from('launchpad_submissions').select('*').eq('id', id).single()
    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    if (submission.status !== 'pending_review') {
      return NextResponse.json({ error: `Submission already ${submission.status}` }, { status: 400 })
    }

    const treasury = process.env.AGENT_OWNER_ADDRESS!
    const { txHash, saleId } = await createSaleOnChain({
      projectId: submission.project_id,
      treasury,
      capUsdc: submission.target,   // total raise target = the sale-wide cap
      minUsdc: submission.min_contribution,
      maxUsdc: submission.cap,      // per-wallet max, named `cap` in the submission form
      startTime: new Date(submission.start_at),
      endTime: new Date(submission.end_at),
    })

    const { error: saleErr } = await admin.from('launchpad_sales').insert({
      submission_id: submission.id,
      project_id: submission.project_id,
      sale_id_hash: saleId,
      contract_address: process.env.IDO_LAUNCHPAD_CONTRACT,
      treasury_address: treasury,
      create_tx_hash: txHash,
    })
    if (saleErr) return NextResponse.json({ error: saleErr.message }, { status: 500 })

    await admin.from('launchpad_submissions').update({
      status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ ok: true, projectId: submission.project_id, txHash })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[admin/launchpad/approve]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
