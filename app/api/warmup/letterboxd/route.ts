import { NextResponse } from 'next/server'
import { fetchWatchlist, fetchRatings, fetchDiary } from '@/lib/letterboxd'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.LETTERBOXD_USERNAME
  console.log('[warmup/letterboxd] start, username present:', !!username)
  if (!username) {
    return NextResponse.json({ error: 'LETTERBOXD_USERNAME not configured' }, { status: 500 })
  }

  const [watchlist, ratings, diary] = await Promise.all([
    fetchWatchlist(username),
    fetchRatings(username),
    fetchDiary(username),
  ])

  console.log(
    `[warmup/letterboxd] done — watchlist: ${watchlist.length}, ratings: ${ratings.length}, diary: ${diary.length}`,
  )
  return NextResponse.json({
    watchlist: watchlist.length,
    ratings: ratings.length,
    diary: diary.length,
  })
}
