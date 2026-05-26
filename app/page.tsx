'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { STREAMING_SERVICES } from '@/lib/config'
import type { Recommendation } from '@/types/recommender'

const GENRES = [
  'Horror',
  'Mystery',
  'Action',
  'Thriller',
  'Comedy',
  'Drama',
  'Documentary',
  'Romance',
  'Sci-Fi',
  'True Story',
]

type Status = 'idle' | 'loading' | 'done' | 'error-cache' | 'error-empty' | 'error-generic'

export default function Home() {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<Recommendation[]>([])

  useEffect(() => {
    fetch('/api/warmup').catch(() => {})
  }, [])

  function toggleGenre(genre: string) {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    )
  }

  async function handleFind() {
    setStatus('loading')
    setResults([])

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedServices: STREAMING_SERVICES,
          selectedGenres,
        }),
      })

      if (res.status === 503) {
        setStatus('error-cache')
        return
      }

      if (!res.ok) {
        setStatus('error-generic')
        return
      }

      const data = await res.json()
      const recs: Recommendation[] = data.recommendations ?? []

      if (recs.length === 0) {
        setStatus('error-empty')
        return
      }

      setResults(recs)
      setStatus('done')
    } catch {
      setStatus('error-generic')
    }
  }

  return (
    <main className="min-h-screen px-4 py-12 max-w-2xl mx-auto">
      {/* Header */}
      <h1
        className="text-5xl font-bold mb-10 text-center"
        style={{ fontFamily: 'var(--font-playfair)', color: '#e8b84b' }}
      >
        Minute Movie
      </h1>

      {/* Genre pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {GENRES.map((genre) => {
          const active = selectedGenres.includes(genre)
          return (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className="px-4 py-1.5 rounded-full text-sm font-medium border transition-colors"
              style={{
                borderColor: active ? '#e8b84b' : '#2a2a2a',
                background: active ? '#e8b84b' : 'transparent',
                color: active ? '#0a0a0a' : '#ededed',
              }}
            >
              {genre}
            </button>
          )
        })}
      </div>

      {/* CTA button */}
      <button
        onClick={handleFind}
        disabled={status === 'loading'}
        className="w-full py-3 rounded-lg font-semibold text-base transition-opacity disabled:opacity-60"
        style={{ background: '#e8b84b', color: '#0a0a0a' }}
      >
        Find something to watch
      </button>

      {/* States */}
      <div className="mt-10">
        {status === 'loading' && (
          <p
            className="text-center text-base animate-pulse-gold"
            style={{ color: '#e8b84b' }}
          >
            Finding your next watch...
          </p>
        )}

        {status === 'error-cache' && (
          <p className="text-center text-sm" style={{ color: '#888' }}>
            Getting your data ready, please try again in a moment.
          </p>
        )}

        {status === 'error-empty' && (
          <p className="text-center text-sm" style={{ color: '#888' }}>
            No recommendations found — try adjusting your genre filters.
          </p>
        )}

        {status === 'error-generic' && (
          <p className="text-center text-sm" style={{ color: '#888' }}>
            Something went wrong. Please try again.
          </p>
        )}

        {status === 'done' && (
          <ul className="flex flex-col gap-3">
            {results.map((rec) => (
              <li
                key={rec.slug}
                className="flex gap-4 rounded-xl p-4"
                style={{ background: '#141414', border: '1px solid #2a2a2a' }}
              >
                {/* Poster */}
                <div
                  className="shrink-0 rounded overflow-hidden"
                  style={{ width: 60, height: 90, background: '#141414' }}
                >
                  {rec.posterUrl ? (
                    <Image
                      src={rec.posterUrl}
                      alt={rec.title}
                      width={60}
                      height={90}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full" style={{ background: '#1e1e1e' }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold text-base leading-tight">{rec.title}</span>
                    <span className="text-sm" style={{ color: '#888' }}>
                      {rec.year}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {rec.communityRating !== null && (
                      <span style={{ color: '#aaa' }}>
                        {(rec.communityRating / 2).toFixed(1)} ★
                      </span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: '#e8b84b', color: '#0a0a0a' }}
                    >
                      {rec.streamingService}
                    </span>
                    <span className="text-xs" style={{ color: '#888' }}>
                      Match: {rec.matchScore}/10
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed mt-1" style={{ color: '#777' }}>
                    {rec.reason}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
