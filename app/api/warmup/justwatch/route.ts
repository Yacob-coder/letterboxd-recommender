import { NextResponse } from 'next/server'
import { getCachedWatchlist } from '@/lib/letterboxd'
import { getStreamingForFilms } from '@/lib/justwatch'

export const dynamic = 'force-dynamic'

export async function GET() {
  const username = process.env.LETTERBOXD_USERNAME
  console.log('[warmup/justwatch] start, username present:', !!username)
  if (!username) {
    return NextResponse.json({ error: 'LETTERBOXD_USERNAME not configured' }, { status: 500 })
  }

  const watchlist = getCachedWatchlist(username)
  console.log('[warmup/justwatch] letterboxd cache:', watchlist ? `${watchlist.length} films` : 'empty')
  if (!watchlist) {
    return NextResponse.json({ error: 'Letterboxd cache not ready' }, { status: 503 })
  }

  const lookupFilms = watchlist
    .filter((f): f is typeof f & { year: number } => f.year !== null)
    .slice(0, 50)
    .map((f) => ({ title: f.title, year: f.year, slug: f.slug }))

  console.log(`[warmup/justwatch] looking up ${lookupFilms.length} films`)
  await getStreamingForFilms(lookupFilms)
  console.log('[warmup/justwatch] done')

  return NextResponse.json({ streamingCached: lookupFilms.length })
}
