import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Client service-role — bypass RLS. CHỈ dùng ở server, KHÔNG bao giờ import từ file
// 'use client'. Dùng cho job/cron không có JWT của user (backfill, indexer on-chain).
let _client: SupabaseClient | null = null

export function createAdminSupabaseClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình trong .env.local')
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}
