import { NextResponse } from 'next/server'
import { getCachedWatchlist, getCachedRatings } from '@/lib/letterboxd'
import { getCachedStreamingForFilms } from '@/lib/justwatch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.LETTERBOXD_USERNAME
  if (!username) {
    console.log('[warmup/status] LETTERBOXD_USERNAME not set')
    return NextResponse.json({ error: 'LETTERBOXD_USERNAME not configured' }, { status: 500 })
  }

  const watchlist = getCachedWatchlist(username)
  const ratings = getCachedRatings(username)
  const letterboxdReady = watchlist !== null && ratings !== null

  let justwatchReady = false
  let streamingSize = 0
  if (watchlist && watchlist.length > 0) {
    const lookupFilms = watchlist
      .filter((f): f is typeof f & { year: number } => f.year !== null)
      .map((f) => ({ title: f.title, year: f.year, slug: f.slug }))
    const streaming = getCachedStreamingForFilms(lookupFilms)
    streamingSize = streaming.size
    justwatchReady = streaming.size >= 40
  }

  console.log(
    `[warmup/status] letterboxdReady: ${letterboxdReady} (watchlist: ${watchlist?.length ?? 0}, ratings: ${ratings?.length ?? 0}), justwatchReady: ${justwatchReady} (${streamingSize} films cached)`,
  )

  return NextResponse.json({ letterboxdReady, justwatchReady })
}
