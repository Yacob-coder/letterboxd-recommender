import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'
import type { WatchlistFilm, RatedFilm, DiaryEntry } from '@/types/letterboxd'

const BASE_URL = 'https://letterboxd.com'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_PAGES = 100 // safety cap

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

// Letterboxd renders each film as:
//   <li class="griditem">
//     <div class="react-component" data-item-slug="midsommar"
//          data-item-name="Midsommar (2019)" ...>
//     </div>
//   </li>
// Year is embedded in data-item-name as "Title (YYYY)".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGridItem($: ReturnType<typeof cheerio.load>, el: any) {
  const rc = $(el).find('div.react-component')
  const slug = rc.attr('data-item-slug') ?? ''
  const nameAttr = rc.attr('data-item-name') ?? ''
  const nameMatch = nameAttr.match(/^(.+?)\s+\((\d{4})\)$/)
  const title = nameMatch ? nameMatch[1] : nameAttr
  const year = nameMatch ? parseInt(nameMatch[2], 10) : null
  return { slug, title, year }
}

// Converts a "rated-N" CSS class to a numeric rating out of 5.
// Letterboxd encodes ratings as half-stars: rated-8 = 4 stars (8 / 2).
function parseRatingClass(className: string): number | null {
  const match = className.match(/\brated-(\d+)\b/)
  return match ? parseInt(match[1], 10) / 2 : null
}

export async function fetchWatchlist(username: string): Promise<WatchlistFilm[]> {
  const cacheKey = `watchlist:${username}`
  const cached = getCached<WatchlistFilm[]>(cacheKey)
  if (cached) return cached

  const films: WatchlistFilm[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= MAX_PAGES) {
      const url = `${BASE_URL}/${username}/watchlist/page/${page}/`
      const html = await fetchPage(url)
      const $ = cheerio.load(html)

      const items = $('li.griditem')
      items.each((_, el) => {
        const { slug, title, year } = parseGridItem($, el)
        if (!slug) return
        // Poster URL is a Letterboxd CDN path; not stable long-term.
        // Resolve posters via TMDB using the slug instead.
        const posterUrl = $(el).find('div.react-component').attr('data-poster-url') ?? ''
        films.push({ title, year, slug, posterUrl })
      })

      hasMore = $('a.next').length > 0
      console.log(`fetchWatchlist[${username}]: page ${page} — ${items.length} films`)
      page++
      if (hasMore) await delay(300)
    }
  } catch (err) {
    console.error(`fetchWatchlist error for ${username}:`, err)
    // Return whatever was collected before the error rather than discarding it
  }

  console.log(
    `fetchWatchlist[${username}]: done — ${page - 1} pages scraped, ${films.length} films total`,
  )
  setCached(cacheKey, films)
  return films
}

export async function fetchRatings(username: string): Promise<RatedFilm[]> {
  const cacheKey = `ratings:${username}`
  const cached = getCached<RatedFilm[]>(cacheKey)
  if (cached) return cached

  const films: RatedFilm[] = []
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= MAX_PAGES) {
      const url = `${BASE_URL}/${username}/films/ratings/page/${page}/`
      const html = await fetchPage(url)
      const $ = cheerio.load(html)

      const items = $('li.griditem')
      items.each((_, el) => {
        const { slug, title, year } = parseGridItem($, el)
        if (!slug) return
        // Rating appears as a span with class like "rated-8" (= 4 stars) in the griditem
        const ratingClass = $(el).find('span.rating').attr('class') ?? ''
        const rating = parseRatingClass(ratingClass)
        films.push({ title, year, slug, rating })
      })

      hasMore = $('a.next').length > 0
      console.log(`fetchRatings[${username}]: page ${page} — ${items.length} films`)
      page++
      // Ratings pages are rate-limited more aggressively than watchlist
      if (hasMore) await delay(1000)
    }
  } catch (err) {
    console.error(`fetchRatings error for ${username}:`, err)
    // Return whatever was collected before the error rather than discarding it
  }

  console.log(
    `fetchRatings[${username}]: done — ${page - 1} pages scraped, ${films.length} films total`,
  )
  setCached(cacheKey, films)
  return films
}

export async function fetchDiary(username: string): Promise<DiaryEntry[]> {
  const cacheKey = `diary:${username}`
  const cached = getCached<DiaryEntry[]>(cacheKey)
  if (cached) return cached

  try {
    const url = `${BASE_URL}/${username}/rss/`
    const xml = await fetchPage(url)

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
    const doc = parser.parse(xml)
    const raw = doc?.rss?.channel?.item ?? []
    const items: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw]

    const entries: DiaryEntry[] = items.map((item) => {
      const title =
        (item['letterboxd:filmTitle'] as string) ?? (item.title as string) ?? ''
      const rawYear = item['letterboxd:filmYear'] as string | undefined
      const year = rawYear ? parseInt(rawYear, 10) || null : null

      // RSS uses memberRating; fall back to rating if absent
      const rawRating =
        (item['letterboxd:memberRating'] as string | undefined) ??
        (item['letterboxd:rating'] as string | undefined)
      const rating = rawRating ? parseFloat(rawRating) || null : null

      const watchedDate = (item['letterboxd:watchedDate'] as string) ?? ''
      const rewatch = (item['letterboxd:rewatch'] as string) === 'Yes'

      // Slug derived from diary link: /username/film/<slug>/
      const link = (item.link as string) ?? ''
      const slugMatch = link.match(/\/film\/([^/]+)\/?/)
      const slug = slugMatch?.[1] ?? ''

      return { title, year, slug, rating, watchedDate, rewatch }
    })

    console.log(
      `fetchDiary[${username}]: done — 1 page scraped, ${entries.length} entries (RSS cap: 50)`,
    )
    setCached(cacheKey, entries)
    return entries
  } catch (err) {
    console.error(`fetchDiary error for ${username}:`, err)
    return []
  }
}
