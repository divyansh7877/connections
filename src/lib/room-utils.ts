export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const ROOM_TTL_MS = 1000 * 60 * 60 * 8
export const ROOM_PURGE_GRACE_MS = 1000 * 60 * 60 * 24

export type RoomStatus = 'active' | 'expired'

export type MemberView = {
  id: string
  displayName: string
  linkedinUrl: string
  joinedAt: number
  isCurrentSession: boolean
}

export type RoomView = {
  id: string
  code: string
  createdAt: number
  expiresAt: number
  status: RoomStatus
  members: Array<MemberView>
}

export function createRoomCode(randomInt = defaultRandomInt) {
  let code = ''
  while (code.length < ROOM_CODE_LENGTH) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeLinkedInUrl(rawValue: string) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error('LinkedIn URL is required.')
  }

  let value = rawValue.trim()
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a valid LinkedIn profile URL.')
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) {
    throw new Error('Only LinkedIn URLs are allowed.')
  }

  if (!url.pathname || url.pathname === '/') {
    throw new Error('LinkedIn profile URL must include a path.')
  }

  url.hash = ''
  url.search = ''
  return url.toString()
}

export function normalizeDisplayName(rawValue: string) {
  if (typeof rawValue !== 'string') {
    throw new Error('Name is required.')
  }

  const value = rawValue.trim().replace(/\s+/g, ' ')
  if (value.length < 2) {
    throw new Error('Name must be at least 2 characters.')
  }

  if (value.length > 80) {
    throw new Error('Name must be 80 characters or fewer.')
  }

  return value
}

export function deriveRoomStatus(expiresAt: number, now = Date.now()): RoomStatus {
  return now >= expiresAt ? 'expired' : 'active'
}

export function formatExpiry(expiresAt: number, now = Date.now()) {
  const diffMs = expiresAt - now
  if (diffMs <= 0) {
    return 'Expired'
  }

  const totalMinutes = Math.round(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `Expires in ${minutes} min`
  }

  return `Expires in ${hours}h ${minutes}m`
}

function defaultRandomInt(max: number) {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return bytes[0] % max
}
