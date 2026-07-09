import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'

// GET — đếm chính xác toàn bộ lịch sử (không giới hạn 100 tin gần nhất như UI)
export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient(token)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('agent_messages')
    .select('role, content')
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let replyCount = 0
  let txSuccessCount = 0
  for (const m of data ?? []) {
    if (m.role === 'assistant') replyCount++
    try {
      const parsed = JSON.parse(m.content)
      if (parsed.__txResult && parsed.success) txSuccessCount++
    } catch { /* plain text message, không phải txResult */ }
  }

  return NextResponse.json({ replyCount, txSuccessCount })
}
