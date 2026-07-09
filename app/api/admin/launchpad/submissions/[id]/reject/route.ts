import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { createAdminSupabaseClient } from '@/app/lib/supabase-admin'
import { isAdminEmail } from '@/app/lib/admin'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const notes = typeof body.notes === 'string' ? body.notes : null

  const admin = createAdminSupabaseClient()
  const { data: submission } = await admin.from('launchpad_submissions').select('status').eq('id', id).single()
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.status !== 'pending_review') {
    return NextResponse.json({ error: `Submission already ${submission.status}` }, { status: 400 })
  }

  const { error } = await admin.from('launchpad_submissions').update({
    status: 'rejected', admin_notes: notes, reviewed_by: user.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
