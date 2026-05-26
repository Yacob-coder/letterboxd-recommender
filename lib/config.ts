export const DEFAULT_COUNTRY = 'CA'

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

// Community rating floor — films below this are excluded from recommendations
export const MINIMUM_LETTERBOXD_RATING = 2.5

// Disney+ includes Hulu content in Canada.
// Prime Video: only flatrate and free offers count — not rent or buy.
export const STREAMING_SERVICES: string[] = [
  'Netflix',
  'Apple TV+',
  'Disney+',
  'Crave',
  'Prime Video',
]
