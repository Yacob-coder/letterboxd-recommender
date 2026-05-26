export interface StreamingOffer {
  provider: string // e.g. "Netflix", "Crave"
  type: 'flatrate' | 'rent' | 'buy' | 'free'
  url: string
}
