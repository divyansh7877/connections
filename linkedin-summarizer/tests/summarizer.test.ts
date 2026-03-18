import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSummaryPrompt, normalizeSummary } from '../src/summarizer.js'

test('normalizeSummary keeps a single short sentence', () => {
  assert.equal(
    normalizeSummary('Payments infrastructure engineer at Stripe focused on APIs. Loves coffee.'),
    'Payments infrastructure engineer at Stripe focused on APIs.',
  )
})

test('normalizeSummary trims to 30 words', () => {
  const summary = normalizeSummary(
    'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one.',
  )

  assert.equal(summary?.split(/\s+/).length, 30)
})

test('buildSummaryPrompt includes the profile fields', () => {
  const prompt = buildSummaryPrompt({
    linkedin_url: 'https://www.linkedin.com/in/jane-smith',
    name: 'Jane Smith',
    headline: 'Staff Engineer at Stripe',
    image_url: null,
    about: 'Payments infrastructure engineer focused on API design.',
    visibility: 'public',
    status: 'ready',
  })

  assert.match(prompt, /Jane Smith/)
  assert.match(prompt, /Staff Engineer at Stripe/)
  assert.match(prompt, /Payments infrastructure engineer/)
})
