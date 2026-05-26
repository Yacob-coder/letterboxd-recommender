import type { DiaryEntry, RatedFilm, WatchlistFilm } from '@/types/letterboxd'
import type { StreamingOffer } from '@/types/justwatch'

export interface RecommendationInput {
  diary: DiaryEntry[]
  ratings: RatedFilm[]
  watchlist: WatchlistFilm[]
  streamingAvailability: Map<string, StreamingOffer[]>
  selectedServices: string[]
  selectedGenres: string[]
  mood?: string
}

export interface Recommendation {
  title: string
  year: number
  slug: string
  streamingService: string
  reason: string
  matchScore: number // 1-10
  posterUrl: string | null
  communityRating: number | null // TMDB vote_average (0–10)
}
