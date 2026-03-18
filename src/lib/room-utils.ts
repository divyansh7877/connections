export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const ROOM_TTL_MS = 1000 * 60 * 60 * 8
export const ROOM_PURGE_GRACE_MS = 1000 * 60 * 60 * 24
export const LINKEDIN_PROFILE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7
export const LINKEDIN_PROFILE_PENDING_STALE_MS = 1000 * 60 * 5
export const LINKEDIN_PROFILE_MAX_RETRIES = 3
export const LINKEDIN_PROFILE_RETRY_BASE_DELAY_MS = 1000 * 15

export type RoomStatus = 'active' | 'expired'
export type LinkedInVisibility = 'public' | 'limited'
export type LinkedInEnrichmentStatus = 'pending' | 'ready' | 'partial' | 'failed'

export type MemberView = {
  id: string
  displayName: string
  linkedinUrl: string
  joinedAt: number
  isCurrentSession: boolean
  profileName: string
  headline: string | null
  imageUrl: string | null
  summary: string | null
  visibility: LinkedInVisibility | null
  enrichmentStatus: LinkedInEnrichmentStatus
  lastError: string | null
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

  const pathSegments = url.pathname.split('/').filter(Boolean)
  if (pathSegments[0]?.toLowerCase() !== 'in' || !pathSegments[1]) {
    throw new Error('Enter a valid LinkedIn profile URL in the linkedin.com/in/... format.')
  }

  url.hostname = 'linkedin.com'
  url.pathname = `/in/${pathSegments[1]}`
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

export function isLinkedInProfileCacheFresh(expiresAt: number | null, now = Date.now()) {
  return typeof expiresAt === 'number' && expiresAt > now
}

export function getLinkedInProfileRetryDelayMs(retryCount: number) {
  return LINKEDIN_PROFILE_RETRY_BASE_DELAY_MS * 2 ** retryCount
}

export function shouldRefreshLinkedInProfile(
  cache:
    | {
        status: LinkedInEnrichmentStatus
        expiresAt: number | null
        lastAttemptAt: number | null
        nextRetryAt: number | null
      }
    | null
    | undefined,
  now = Date.now(),
) {
  if (!cache) {
    return true
  }

  if (cache.status === 'pending') {
    if (typeof cache.lastAttemptAt === 'number' && now - cache.lastAttemptAt < LINKEDIN_PROFILE_PENDING_STALE_MS) {
      return false
    }
    return true
  }

  if (cache.status === 'ready' || cache.status === 'partial') {
    return !isLinkedInProfileCacheFresh(cache.expiresAt, now)
  }

  if (typeof cache.nextRetryAt === 'number' && cache.nextRetryAt > now) {
    return false
  }

  return true
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
