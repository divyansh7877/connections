import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOgProfileData, validateLinkedInProfileUrl } from '../src/scraper.js'

test('validateLinkedInProfileUrl canonicalizes public profile URLs', () => {
  assert.equal(
    validateLinkedInProfileUrl('linkedin.com/in/jordan-lee/detail/recent-activity/'),
    'https://www.linkedin.com/in/jordan-lee',
  )
})

test('validateLinkedInProfileUrl rejects non-profile routes', () => {
  assert.throws(() => validateLinkedInProfileUrl('https://linkedin.com/company/openai'), /Invalid LinkedIn URL/)
})

test('parseOgProfileData extracts name, headline, image, and about', () => {
  const profile = parseOgProfileData(
    `
      <html>
        <head>
          <meta property="og:title" content="Jane Smith - Staff Engineer at Stripe | LinkedIn" />
          <meta property="og:image" content="https://media.licdn.com/example.jpg" />
          <meta property="og:description" content="Payments infrastructure engineer focused on APIs." />
        </head>
      </html>
    `,
    'https://www.linkedin.com/in/jane-smith',
  )

  assert.equal(profile.name, 'Jane Smith')
  assert.equal(profile.headline, 'Staff Engineer at Stripe')
  assert.equal(profile.image_url, 'https://media.licdn.com/example.jpg')
  assert.equal(profile.about, 'Payments infrastructure engineer focused on APIs.')
  assert.equal(profile.visibility, 'public')
  assert.equal(profile.status, 'partial')
})
