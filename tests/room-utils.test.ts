import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_LENGTH,
  createRoomCode,
  deriveRoomStatus,
  getLinkedInProfileRetryDelayMs,
  isLinkedInProfileCacheFresh,
  normalizeDisplayName,
  normalizeLinkedInUrl,
  shouldRefreshLinkedInProfile,
} from '../src/lib/room-utils'

describe('room utils', () => {
  it('creates a room code with the expected shape', () => {
    const code = createRoomCode(() => 0)
    expect(code).toHaveLength(ROOM_CODE_LENGTH)
    expect(code).toMatch(/^[A-Z0-9]+$/)
  })

  it('normalizes a linkedin url without a protocol', () => {
    expect(normalizeLinkedInUrl('linkedin.com/in/jordan-lee')).toBe('https://linkedin.com/in/jordan-lee')
  })

  it('reduces linkedin profile urls to the canonical /in/ slug', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/jordan-lee/detail/recent-activity/')).toBe(
      'https://linkedin.com/in/jordan-lee',
    )
  })

  it('rejects non-linkedin urls', () => {
    expect(() => normalizeLinkedInUrl('https://example.com/jordan')).toThrow(/LinkedIn/)
  })

  it('rejects linkedin urls outside the profile path', () => {
    expect(() => normalizeLinkedInUrl('https://linkedin.com/company/openai')).toThrow(/linkedin\.com\/in/i)
  })

  it('normalizes and trims display names', () => {
    expect(normalizeDisplayName('  Jordan   Lee ')).toBe('Jordan Lee')
  })

  it('derives room status from expiry', () => {
    expect(deriveRoomStatus(Date.now() - 1)).toBe('expired')
    expect(deriveRoomStatus(Date.now() + 60_000)).toBe('active')
  })

  it('detects a fresh cached linkedin profile', () => {
    expect(isLinkedInProfileCacheFresh(Date.now() + 60_000)).toBe(true)
    expect(isLinkedInProfileCacheFresh(Date.now() - 1)).toBe(false)
    expect(isLinkedInProfileCacheFresh(null)).toBe(false)
  })

  it('refreshes missing, stale, and retryable linkedin profiles', () => {
    const now = Date.now()

    expect(shouldRefreshLinkedInProfile(null, now)).toBe(true)
    expect(
      shouldRefreshLinkedInProfile(
        {
          status: 'ready',
          expiresAt: now + 1_000,
          lastAttemptAt: now - 5_000,
          nextRetryAt: null,
        },
        now,
      ),
    ).toBe(false)
    expect(
      shouldRefreshLinkedInProfile(
        {
          status: 'ready',
          expiresAt: now - 1,
          lastAttemptAt: now - 5_000,
          nextRetryAt: null,
        },
        now,
      ),
    ).toBe(true)
    expect(
      shouldRefreshLinkedInProfile(
        {
          status: 'failed',
          expiresAt: null,
          lastAttemptAt: now - 5_000,
          nextRetryAt: now + 10_000,
        },
        now,
      ),
    ).toBe(false)
  })

  it('calculates exponential retry delays for linkedin enrichment', () => {
    expect(getLinkedInProfileRetryDelayMs(0)).toBe(15_000)
    expect(getLinkedInProfileRetryDelayMs(1)).toBe(30_000)
    expect(getLinkedInProfileRetryDelayMs(2)).toBe(60_000)
  })
})
