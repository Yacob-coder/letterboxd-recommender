export interface WatchlistFilm {
  title: string
  year: number | null
  slug: string
  // Letterboxd CDN URLs are not stable long-term; posters are resolved via TMDB using the slug
  posterUrl: string
}

export interface RatedFilm {
  title: string
  year: number | null
  slug: string
  rating: number | null // 0.5–5.0 in half-star increments; null if unrated
}

export interface DiaryEntry {
  title: string
  year: number | null
  slug: string
  rating: number | null // 0.5–5.0 in half-star increments; null if unrated
  watchedDate: string   // YYYY-MM-DD
  rewatch: boolean
}
