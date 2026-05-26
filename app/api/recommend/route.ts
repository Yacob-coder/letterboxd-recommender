import { NextResponse } from 'next/server'
import { getCachedWatchlist, getCachedRatings, getCachedDiary } from '@/lib/letterboxd'
import { getCachedStreamingForFilms } from '@/lib/justwatch'
import { getRecommendations } from '@/lib/recommender'
import { getPosterUrl, getMovieRating } from '@/lib/tmdb'

// TODO: Vercel serverless functions default to a 10s timeout. On cold cache
// (Letterboxd not yet scraped, or JustWatch entries expired after 24h), the
// full pipeline can easily exceed this. Options to mitigate:
//   - Pre-warm via a scheduled job (Vercel Cron)
//   - Bump maxDuration in vercel.json (60s on Pro)
//   - Move scraping to a background worker
// This route only reads from cache to stay well under the 10s limit; the
// 503 path tells the client to retry after the cache is warm.

interface RequestBody {
  selectedServices?: string[]
  selectedGenres?: string[]
  mood?: string
}

const CACHE_EMPTY_MESSAGE = 'Data not yet cached, please wait for cache to populate.'

export async function POST(req: Request) {
  const username = process.env.LETTERBOXD_USERNAME
  if (!username) {
    return NextResponse.json(
      { error: 'LETTERBOXD_USERNAME is not configured' },
      { status: 500 },
    )
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const selectedServices = body.selectedServices ?? []
  const selectedGenres = body.selectedGenres ?? []
  const mood = body.mood

  const watchlist = getCachedWatchlist(username)
  const ratings = getCachedRatings(username)
  const diary = getCachedDiary(username) ?? []

  if (!watchlist || !ratings) {
    return NextResponse.json({ error: CACHE_EMPTY_MESSAGE }, { status: 503 })
  }

  // JustWatch is keyed by title+year; films with no year were never cached.
  const lookupFilms = watchlist
    .filter((f): f is typeof f & { year: number } => f.year !== null)
    .map((f) => ({ title: f.title, year: f.year, slug: f.slug }))

  const streamingAvailability = getCachedStreamingForFilms(lookupFilms)

  if (streamingAvailability.size === 0) {
    return NextResponse.json({ error: CACHE_EMPTY_MESSAGE }, { status: 503 })
  }

  const recommendations = await getRecommendations({
    diary,
    ratings,
    watchlist,
    streamingAvailability,
    selectedServices,
    selectedGenres,
    mood,
  })

  const enriched = await Promise.all(
    recommendations.map(async (rec) => {
      const [posterUrl, communityRating] = await Promise.all([
        getPosterUrl(rec.title, rec.year),
        getMovieRating(rec.title, rec.year),
      ])
      return { ...rec, posterUrl, communityRating }
    }),
  )

  return NextResponse.json({ recommendations: enriched })
}
