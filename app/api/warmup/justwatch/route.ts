import { NextResponse } from 'next/server'
import { getCachedWatchlist } from '@/lib/letterboxd'
import { getStreamingForFilms } from '@/lib/justwatch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.LETTERBOXD_USERNAME
  if (!username) {
    return NextResponse.json({ error: 'LETTERBOXD_USERNAME not configured' }, { status: 500 })
  }

  const watchlist = getCachedWatchlist(username)
  if (!watchlist) {
    return NextResponse.json({ error: 'Letterboxd cache not ready' }, { status: 503 })
  }

  const lookupFilms = watchlist
    .filter((f): f is typeof f & { year: number } => f.year !== null)
    .map((f) => ({ title: f.title, year: f.year, slug: f.slug }))

  await getStreamingForFilms(lookupFilms)

  return NextResponse.json({ streamingCached: lookupFilms.length })
}
