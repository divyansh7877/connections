const SESSION_STORAGE_KEY = 'connections-session-token'

export function getSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const token = crypto.randomUUID()
  window.localStorage.setItem(SESSION_STORAGE_KEY, token)
  return token
}
