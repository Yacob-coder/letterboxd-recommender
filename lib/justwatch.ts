// Undocumented, reverse-engineered JustWatch GraphQL API.
// This may break if JustWatch changes their schema — function signatures here
// are stable; internals may need to be updated when that happens.

import type { StreamingOffer } from '@/types/justwatch'
import { DEFAULT_COUNTRY } from '@/lib/config'

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 5000

const JUSTWATCH_GQL = 'https://apis.justwatch.com/graphql'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours — availability data changes slowly

interface CacheEntry {
  data: StreamingOffer[]
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function getCached(key: string): StreamingOffer[] | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCached(key: string, data: StreamingOffer[]): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Strip leading articles for a loose title comparison ("The " / "A " / "An ").
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|an?)\s+/, '')
    .trim()
}

// Map JustWatch's monetizationType to our StreamingOffer union.
// ADS-supported is treated as free; unknown types are dropped.
function mapMonetizationType(raw: string): StreamingOffer['type'] | null {
  switch (raw) {
    case 'FLATRATE':
      return 'flatrate'
    case 'RENT':
      return 'rent'
    case 'BUY':
      return 'buy'
    case 'FREE':
    case 'ADS':
      return 'free'
    default:
      return null
  }
}

// JustWatch returns duplicate offers per presentation type (SD/HD/4K).
// De-duplicate by provider+type, keeping the first (highest-quality) URL.
function deduplicateOffers(offers: StreamingOffer[]): StreamingOffer[] {
  const seen = new Set<string>()
  return offers.filter(({ provider, type }) => {
    const key = `${provider}::${type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const SEARCH_QUERY = `
  query GetStreamingOffers(
    $country: Country!
    $language: Language!
    $first: Int!
    $filter: TitleFilter
  ) {
    popularTitles(
      country: $country
      first: $first
      filter: $filter
      sortBy: POPULAR
      sortRandomSeed: 0
    ) {
      edges {
        node {
          id
          content(country: $country, language: $language) {
            title
            originalReleaseYear
          }
          ... on Movie {
            offers(country: $country, platform: WEB) {
              monetizationType
              standardWebURL
              package {
                clearName
              }
            }
          }
        }
      }
    }
  }
`

// Cache inspector — returns offers for any of the given films that have
// already been cached. Films not in the cache are simply absent from the map.
// Used by route handlers that should only read from a pre-warmed cache.
export function getCachedStreamingForFilms(
  films: Array<{ title: string; year: number; slug: string }>,
  country: string = DEFAULT_COUNTRY,
): Map<string, StreamingOffer[]> {
  const map = new Map<string, StreamingOffer[]>()
  for (const { title, year, slug } of films) {
    const offers = getCached(`jw:${country}:${title.toLowerCase()}:${year}`)
    if (offers !== null) map.set(slug, offers)
  }
  return map
}

export async function getStreamingAvailability(
  title: string,
  year: number,
  country: string = DEFAULT_COUNTRY,
): Promise<StreamingOffer[]> {
  const cacheKey = `jw:${country}:${title.toLowerCase()}:${year}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(JUSTWATCH_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: {
          country,
          language: 'en',
          first: 4,
          filter: { searchQuery: title, objectTypes: ['MOVIE'] },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()
    const edges: unknown[] = json?.data?.popularTitles?.edges ?? []

    if (edges.length === 0) {
      console.warn(`JustWatch: no results for "${title}" (${year})`)
      setCached(cacheKey, [])
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const top = (edges[0] as any)?.node
    const jwTitle: string = top?.content?.title ?? ''
    const jwYear: number = top?.content?.originalReleaseYear ?? 0

    const titleMatch = normalizeTitle(jwTitle) === normalizeTitle(title)
    const yearMatch = Math.abs(jwYear - year) <= 1

    if (!titleMatch || !yearMatch) {
      console.warn(
        `JustWatch: top result "${jwTitle}" (${jwYear}) does not match "${title}" (${year}) — skipping`,
      )
      setCached(cacheKey, [])
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawOffers: any[] = top?.offers ?? []
    const offers = deduplicateOffers(
      rawOffers.flatMap((offer) => {
        const type = mapMonetizationType(offer.monetizationType)
        if (!type || !offer.standardWebURL) return []
        return [{ provider: offer.package?.clearName ?? '', type, url: offer.standardWebURL }]
      }),
    )

    setCached(cacheKey, offers)
    return offers
  } catch (err) {
    console.error(`JustWatch error for "${title}" (${year}):`, err)
    return []
  }
}

export async function getStreamingForFilms(
  films: Array<{ title: string; year: number; slug: string }>,
  country: string = DEFAULT_COUNTRY,
): Promise<Map<string, StreamingOffer[]>> {
  const results = new Map<string, StreamingOffer[]>()

  for (let i = 0; i < films.length; i += BATCH_SIZE) {
    const batch = films.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async ({ title, year, slug }) => {
        const offers = await getStreamingAvailability(title, year, country)
        if (offers.length === 0) {
          console.warn(`JustWatch: no streaming data found for "${title}" (${year})`)
        }
        results.set(slug, offers)
      }),
    )

    if (i + BATCH_SIZE < films.length) await delay(BATCH_DELAY_MS)
  }

  return results
}
