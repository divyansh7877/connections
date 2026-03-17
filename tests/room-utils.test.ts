import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_LENGTH,
  createRoomCode,
  deriveRoomStatus,
  normalizeDisplayName,
  normalizeLinkedInUrl,
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

  it('rejects non-linkedin urls', () => {
    expect(() => normalizeLinkedInUrl('https://example.com/jordan')).toThrow(/LinkedIn/)
  })

  it('normalizes and trims display names', () => {
    expect(normalizeDisplayName('  Jordan   Lee ')).toBe('Jordan Lee')
  })

  it('derives room status from expiry', () => {
    expect(deriveRoomStatus(Date.now() - 1)).toBe('expired')
    expect(deriveRoomStatus(Date.now() + 60_000)).toBe('active')
  })
})
