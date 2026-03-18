'use node'

import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import {
  LINKEDIN_PROFILE_MAX_RETRIES,
  getLinkedInProfileRetryDelayMs,
  normalizeLinkedInUrl,
  shouldRefreshLinkedInProfile,
} from '../src/lib/room-utils'

type AgentResponse = {
  linkedin_url: string
  name: string | null
  headline: string | null
  image_url: string | null
  summary: string | null
  about?: string | null
  visibility: 'public' | 'limited'
  status: 'ready' | 'partial' | 'failed'
}

class EnrichmentError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'EnrichmentError'
    this.retryable = retryable
  }
}

export const enrichLinkedInProfile = internalAction({
  args: {
    linkedinUrl: v.string(),
    attemptNumber: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const linkedinUrl = normalizeLinkedInUrl(args.linkedinUrl)
    const attemptNumber = args.attemptNumber ?? 0
    const now = Date.now()

    const existing = await ctx.runQuery(internal.linkedinProfiles.getByLinkedInUrl, {
      linkedinUrl,
    })

    if (!args.force && !shouldRefreshLinkedInProfile(existing, now)) {
      return
    }

    await ctx.runMutation(internal.linkedinProfiles.markEnrichmentStarted, {
      linkedinUrl,
      attemptNumber,
      now,
    })

    try {
      const profile = await fetchLinkedInProfile(linkedinUrl)
      await ctx.runMutation(internal.linkedinProfiles.storeEnrichmentResult, {
        linkedinUrl,
        name: profile.name,
        headline: profile.headline,
        imageUrl: profile.image_url,
        about: profile.about ?? null,
        summary: profile.summary,
        visibility: profile.visibility,
        status: profile.status,
        fetchedAt: Date.now(),
      })
    } catch (error) {
      const message = getErrorMessage(error)
      const retryable = error instanceof EnrichmentError ? error.retryable : false
      const nextAttemptNumber = attemptNumber + 1
      const shouldRetry = retryable && nextAttemptNumber < LINKEDIN_PROFILE_MAX_RETRIES
      const nextRetryAt = shouldRetry ? Date.now() + getLinkedInProfileRetryDelayMs(attemptNumber) : null

      await ctx.runMutation(internal.linkedinProfiles.storeEnrichmentFailure, {
        linkedinUrl,
        now: Date.now(),
        attemptNumber: nextAttemptNumber,
        lastError: message,
        nextRetryAt,
      })

      if (shouldRetry) {
        await ctx.scheduler.runAfter(getLinkedInProfileRetryDelayMs(attemptNumber), internal.linkedinProfilesActions.enrichLinkedInProfile, {
          linkedinUrl,
          attemptNumber: nextAttemptNumber,
          force: true,
        })
      }
    }
  },
})

async function fetchLinkedInProfile(linkedinUrl: string): Promise<AgentResponse> {
  const baseUrl = process.env.BLAXEL_AGENT_URL?.trim()
  if (!baseUrl) {
    throw new EnrichmentError('BLAXEL_AGENT_URL is not configured.', false)
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  const token = process.env.BLAXEL_AGENT_TOKEN?.trim()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-Blaxel-Authorization', `Bearer ${token}`)
  }

  const workspace = process.env.BLAXEL_WORKSPACE?.trim()
  if (workspace) {
    headers.set('X-Blaxel-Workspace', workspace)
  }

  let response: Response
  try {
    const summarizeUrl = baseUrl.endsWith('/') ? `${baseUrl}summarize` : `${baseUrl}/summarize`
    response = await fetch(summarizeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ linkedin_url: linkedinUrl }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new EnrichmentError(getErrorMessage(error), true)
  }

  if (!response.ok) {
    const body = await response.text()
    const retryable = response.status === 429 || response.status >= 500
    throw new EnrichmentError(body || `Agent request failed with ${response.status}.`, retryable)
  }

  const payload = (await response.json()) as Partial<AgentResponse>
  if (payload.linkedin_url !== linkedinUrl) {
    throw new EnrichmentError('Agent response returned a mismatched LinkedIn URL.', false)
  }

  const status = payload.status === 'ready' || payload.status === 'partial' || payload.status === 'failed'
    ? payload.status
    : inferStatus(payload)

  return {
    linkedin_url: linkedinUrl,
    name: sanitizeNullableString(payload.name),
    headline: sanitizeNullableString(payload.headline),
    image_url: sanitizeNullableString(payload.image_url),
    about: sanitizeNullableString(payload.about),
    summary: sanitizeNullableString(payload.summary),
    visibility: payload.visibility === 'public' ? 'public' : 'limited',
    status,
  }
}

function inferStatus(payload: Partial<AgentResponse>): AgentResponse['status'] {
  const hasCoreData = Boolean(payload.name || payload.headline || payload.image_url || payload.summary)
  return hasCoreData ? 'partial' : 'failed'
}

function sanitizeNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'LinkedIn enrichment failed.'
}
