# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start Next.js dev server (http://localhost:3000)
npm run build     # production build (also validates TypeScript via tsc)
npm run lint      # ESLint via next lint
npx tsc --noEmit  # type-check without building
```

**Dev scripts** (use `tsconfig.scripts.json` which overrides to CommonJS so ts-node can resolve `@/` paths):

```bash
npx ts-node --project tsconfig.scripts.json -r tsconfig-paths/register scripts/test-letterboxd.ts
```

Scripts load `.env.local` via `dotenv` using `path.resolve(__dirname, '..', '.env.local')` — this is required because the Next.js env loader is not active outside the Next.js runtime.

## Architecture

This is a Next.js 14 App Router app (no `src/` directory). The only current UI is a placeholder page; the real logic lives in the API route and `lib/`.

### Request flow

```
POST /api/recommend
  → reads cache only (getCachedWatchlist / getCachedRatings / getCachedDiary / getCachedStreamingForFilms)
  → returns 503 if any cache is cold (client must retry after cache warms)
  → getRecommendations() in lib/recommender.ts
      → filters watchlist: exclude diary slugs, rated slugs, low-rated slugs, non-streamable
      → caps candidate list at 100 films (in watchlist order = user priority)
      → takes top 50 rated films as taste signal
      → calls Claude API with a structured prompt
      → parses JSON from <recommendations>…</recommendations> tags in response
```

### Cache warming (not yet implemented as a route)

The Letterboxd scraper (`lib/letterboxd.ts`) and JustWatch fetcher (`lib/justwatch.ts`) expose both **fetching** functions (trigger scrape + populate cache) and **cache-inspector** functions (`getCached*`). The API route only calls the inspectors. Cache warming must be triggered separately — either via a dedicated `/api/warm` route (not yet built) or Vercel Cron.

### Key modules

| File | Purpose |
|---|---|
| `lib/config.ts` | All tuneable constants: model name, country, streaming services list, rating floor |
| `lib/letterboxd.ts` | Cheerio scraper for watchlist, ratings, diary. 1-hour TTL. |
| `lib/justwatch.ts` | Undocumented JustWatch GraphQL API. 24-hour TTL. Batch size 5, 500 ms between batches. |
| `lib/recommender.ts` | Builds Claude prompt, calls Anthropic SDK, parses structured JSON response. |
| `app/api/recommend/route.ts` | POST handler. Cache-only reads; 503 on cold cache. |

### Letterboxd scraping

HTML structure (discovered by fetching live pages — not from docs):
- Films: `li.griditem > div.react-component[data-item-slug][data-item-name="Title (YYYY)"]`
- Ratings: `span.rating` with class `rated-N` where N/2 = stars (e.g. `rated-8` = 4 stars)
- Pagination: `a.next` presence indicates more pages

### JustWatch API

Endpoint `https://apis.justwatch.com/graphql` is reverse-engineered and undocumented — may break without notice. Title matching uses normalized comparison (strips leading "the/a/an", case-insensitive) with ±1 year tolerance. `ADS` monetizationType is treated as `free`.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `LETTERBOXD_USERNAME` | Yes | Letterboxd username to scrape |
| `ANTHROPIC_API_KEY` | Yes | Anthropic SDK reads this automatically |

### Path alias

`@/` maps to the repo root (e.g. `@/lib/config`, `@/types/letterboxd`). Configured in `tsconfig.json` and overridden for scripts in `tsconfig.scripts.json`.
