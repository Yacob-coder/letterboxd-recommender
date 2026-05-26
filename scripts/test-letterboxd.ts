import path from 'path'
import { config } from 'dotenv'

config({ path: path.resolve(__dirname, '..', '.env.local') })

import { fetchWatchlist, fetchRatings, fetchDiary } from '@/lib/letterboxd'

const username = process.env.LETTERBOXD_USERNAME ?? ''
if (!username) {
  console.error('Error: LETTERBOXD_USERNAME is not set in .env.local')
  process.exit(1)
}

async function main() {
  console.log(`Testing Letterboxd scraper for user: ${username}\n`)

  console.log('=== fetchWatchlist ===')
  const watchlist = await fetchWatchlist(username)
  console.log(`Total: ${watchlist.length} films`)
  if (watchlist[0]) console.log('First:', watchlist[0])

  console.log('\n=== fetchRatings ===')
  const ratings = await fetchRatings(username)
  console.log(`Total: ${ratings.length} films`)
  if (ratings[0]) console.log('First:', ratings[0])

  console.log('\n=== fetchDiary ===')
  const diary = await fetchDiary(username)
  console.log(`Total: ${diary.length} entries`)
  if (diary[0]) console.log('First:', diary[0])
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
