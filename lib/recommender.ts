import Anthropic from '@anthropic-ai/sdk'
import type { Recommendation, RecommendationInput } from '@/types/recommender'
import { CLAUDE_MODEL } from '@/lib/config'

const client = new Anthropic()

interface PromptInput {
  topRated: Array<{ title: string; year: number | null; rating: number }>
  watchlist: Array<{ title: string; year: number | null; slug: string; services: string[] }>
  selectedGenres: string[]
  mood?: string
}

function buildPrompt({ topRated, watchlist, selectedGenres, mood }: PromptInput): string {
  const ratedList = topRated
    .map((f, i) => `${i + 1}. ${f.title} (${f.year ?? 'unknown'}) — ${f.rating}/5`)
    .join('\n')

  const watchlistList = watchlist
    .map(
      (f, i) =>
        `${i + 1}. ${f.title} (${f.year ?? 'unknown'}) [slug: ${f.slug}] — available on: ${f.services.join(', ')}`,
    )
    .join('\n')

  const genreLine = selectedGenres.length
    ? `\n# Genre preference (strong signal, NOT a hard filter)\n${selectedGenres.join(', ')}`
    : ''

  const moodLine = mood ? `\n# Current mood\n${mood}` : ''

  return `You are recommending films to a user based on their Letterboxd taste profile and a candidate list of watchlist films that are currently streamable on their subscribed services.

# User's top-rated films (primary taste signal)
${ratedList}

From this list, identify the user's taste patterns — common genres, directors, eras, themes, tone, narrative styles. Use these patterns when ranking the candidates below.

# Candidate watchlist (ORDERED — earlier = higher user priority)
The user has explicitly added these films to their watchlist. The order is meaningful: films appearing earlier are higher priority for the user. Weigh this watchlist ordering alongside taste matching when ranking.
${genreLine}${moodLine}

${watchlistList}

# Task
Recommend 5-10 films from the candidate watchlist that best match the user's taste, factoring in both taste patterns and watchlist priority order.

For each recommendation provide:
- "title", "year", "slug" — copy exactly from the candidate list
- "streamingService" — pick one provider from the film's listed available services
- "reason" — 1-2 sentences linking the pick to specific taste patterns, watchlist priority, genre preference, or mood
- "matchScore" — integer 1-10

Return ONLY a JSON array, wrapped in <recommendations></recommendations> tags. No other prose outside the tags.

<recommendations>
[
  {
    "title": "Example",
    "year": 2020,
    "slug": "example",
    "streamingService": "Netflix",
    "reason": "...",
    "matchScore": 9
  }
]
</recommendations>`
}

function parseRecommendations(text: string): Recommendation[] {
  try {
    const match = text.match(/<recommendations>([\s\S]*?)<\/recommendations>/)
    if (!match) {
      console.error('Recommender: no <recommendations> tags in response. Raw:', text)
      return []
    }
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) {
      console.error('Recommender: parsed payload is not an array. Raw:', text)
      return []
    }
    return parsed as Recommendation[]
  } catch (err) {
    console.error('Recommender: JSON parse failed. Raw:', text, err)
    return []
  }
}

export async function getRecommendations(input: RecommendationInput): Promise<Recommendation[]> {
  const {
    diary,
    ratings,
    watchlist,
    streamingAvailability,
    selectedServices,
    selectedGenres,
    mood,
  } = input

  const diarySlugs = new Set(diary.map((d) => d.slug).filter(Boolean))
  const ratingSlugs = new Set(ratings.map((r) => r.slug).filter(Boolean))

  console.log(
    `Recommender: input — watchlist: ${watchlist.length}, ratings: ${ratings.length}, diary: ${diary.length}, streamingAvailability: ${streamingAvailability.size} films, selectedServices: [${selectedServices.join(', ')}]`,
  )

  const selectedServicesSet = new Set(selectedServices)

  const filtered: Array<{
    title: string
    year: number | null
    slug: string
    services: string[]
  }> = []

  let afterDiary = 0
  let afterRatings = 0
  let afterStreaming = 0

  for (const film of watchlist) {
    if (diarySlugs.has(film.slug)) continue
    afterDiary++
    if (ratingSlugs.has(film.slug)) continue
    afterRatings++

    const offers = streamingAvailability.get(film.slug) ?? []
    const services = Array.from(
      new Set(
        offers
          .filter((o) => o.type === 'flatrate' || o.type === 'free')
          .map((o) => o.provider)
          .filter((p) => selectedServicesSet.has(p)),
      ),
    )

    if (services.length === 0) continue
    afterStreaming++

    filtered.push({ title: film.title, year: film.year, slug: film.slug, services })
  }

  console.log(
    `Recommender: filter pipeline — after diary exclude: ${afterDiary}, after ratings exclude: ${afterRatings}, after streaming filter: ${afterStreaming}`,
  )

  const cappedWatchlist = filtered.slice(0, 100)
  console.log(`Recommender: candidates after cap: ${cappedWatchlist.length}`)

  if (cappedWatchlist.length === 0) {
    console.warn('Recommender: no streamable watchlist candidates after filtering')
    return []
  }

  const topRated = ratings
    .filter((r): r is typeof r & { rating: number } => r.rating !== null)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 50)
    .map((r) => ({ title: r.title, year: r.year, rating: r.rating }))

  console.log(`Recommender: taste signal — ${topRated.length} rated films`)

  if (topRated.length === 0) {
    console.warn('Recommender: no rated films to derive taste signal from')
    return []
  }

  const prompt = buildPrompt({
    topRated,
    watchlist: cappedWatchlist,
    selectedGenres,
    mood,
  })

  let responseText = ''
  try {
    console.log('Recommender: calling Claude API...')
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const first = response.content[0]
    responseText = first?.type === 'text' ? first.text : ''
    console.log('Recommender: raw Claude response:', responseText)
  } catch (err) {
    console.error('Recommender: Anthropic API call failed:', err)
    return []
  }

  const results = parseRecommendations(responseText)
  console.log(`Recommender: parsed ${results.length} recommendations`)
  return results
}
