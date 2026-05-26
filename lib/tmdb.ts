const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

interface TmdbSearchResult {
  posterPath: string | null
  voteAverage: number | null
}

async function searchMovie(title: string, year: number): Promise<TmdbSearchResult | null> {
  const cacheKey = `tmdb:${title.toLowerCase()}:${year}`
  const cached = getCached<TmdbSearchResult | null>(cacheKey)
  if (cached !== null || cache.has(cacheKey)) return cached

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    console.error('TMDB_API_KEY is not set')
    return null
  }

  try {
    const url = new URL(`${TMDB_BASE}/search/movie`)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('query', title)
    url.searchParams.set('year', String(year))
    url.searchParams.set('language', 'en-US')
    url.searchParams.set('page', '1')

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = json?.results ?? []
    if (results.length === 0) {
      setCached(cacheKey, null)
      return null
    }

    const top = results[0]
    const result: TmdbSearchResult = {
      posterPath: top.poster_path ?? null,
      voteAverage: typeof top.vote_average === 'number' ? top.vote_average : null,
    }
    setCached(cacheKey, result)
    return result
  } catch (err) {
    console.error(`TMDB error for "${title}" (${year}):`, err)
    return null
  }
}

export async function getPosterUrl(title: string, year: number): Promise<string | null> {
  const result = await searchMovie(title, year)
  if (!result?.posterPath) return null
  return `${TMDB_IMAGE_BASE}${result.posterPath}`
}

export async function getMovieRating(title: string, year: number): Promise<number | null> {
  const result = await searchMovie(title, year)
  return result?.voteAverage ?? null
}
