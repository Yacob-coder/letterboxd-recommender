import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { fetchWatchlist, fetchRatings, fetchDiary } from '@/lib/letterboxd'
import { getStreamingForFilms } from '@/lib/justwatch'

export async function GET() {
  const username = process.env.LETTERBOXD_USERNAME
  if (!username) {
    return NextResponse.json({ error: 'LETTERBOXD_USERNAME not configured' }, { status: 500 })
  }

  const [watchlist, ratings, diary] = await Promise.all([
    fetchWatchlist(username),
    fetchRatings(username),
    fetchDiary(username),
  ])

  const lookupFilms = watchlist
    .filter((f): f is typeof f & { year: number } => f.year !== null)
    .map((f) => ({ title: f.title, year: f.year, slug: f.slug }))

  await getStreamingForFilms(lookupFilms)

  return NextResponse.json({
    watchlist: watchlist.length,
    ratings: ratings.length,
    diary: diary.length,
    streamingCached: lookupFilms.length,
  })
}
