import type { ScoreAction } from '@/app/api/score/add/route'

export async function addScore(action: ScoreAction, accessToken: string) {
  try {
    await fetch('/api/score/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action }),
    })
  } catch { /* fire-and-forget, không block tx */ }
}
