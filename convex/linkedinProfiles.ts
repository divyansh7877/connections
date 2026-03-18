import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { LINKEDIN_PROFILE_CACHE_TTL_MS } from '../src/lib/room-utils'

const nullableString = v.union(v.string(), v.null())
const nullableNumber = v.union(v.number(), v.null())
const nullableVisibility = v.union(v.literal('public'), v.literal('limited'), v.null())

export const getByLinkedInUrl = internalQuery({
  args: {
    linkedinUrl: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('linkedinProfiles')
      .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', args.linkedinUrl))
      .unique()
  },
})

export const markEnrichmentStarted = internalMutation({
  args: {
    linkedinUrl: v.string(),
    attemptNumber: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('linkedinProfiles')
      .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', args.linkedinUrl))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: 'pending',
        retryCount: args.attemptNumber,
        lastAttemptAt: args.now,
        nextRetryAt: null,
        updatedAt: args.now,
      })
      return existing._id
    }

    return await ctx.db.insert('linkedinProfiles', {
      linkedinUrl: args.linkedinUrl,
      name: null,
      headline: null,
      imageUrl: null,
      about: null,
      summary: null,
      visibility: null,
      status: 'pending',
      fetchedAt: null,
      expiresAt: null,
      retryCount: args.attemptNumber,
      nextRetryAt: null,
      lastAttemptAt: args.now,
      lastError: null,
      createdAt: args.now,
      updatedAt: args.now,
    })
  },
})

export const storeEnrichmentResult = internalMutation({
  args: {
    linkedinUrl: v.string(),
    name: nullableString,
    headline: nullableString,
    imageUrl: nullableString,
    about: nullableString,
    summary: nullableString,
    visibility: nullableVisibility,
    status: v.union(v.literal('ready'), v.literal('partial'), v.literal('failed')),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('linkedinProfiles')
      .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', args.linkedinUrl))
      .unique()

    const payload = {
      linkedinUrl: args.linkedinUrl,
      name: args.name,
      headline: args.headline,
      imageUrl: args.imageUrl,
      about: args.about,
      summary: args.summary,
      visibility: args.visibility,
      status: args.status,
      fetchedAt: args.fetchedAt,
      expiresAt: args.status === 'failed' ? null : args.fetchedAt + LINKEDIN_PROFILE_CACHE_TTL_MS,
      retryCount: 0,
      nextRetryAt: null,
      lastAttemptAt: args.fetchedAt,
      lastError: null,
      updatedAt: args.fetchedAt,
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert('linkedinProfiles', {
      ...payload,
      createdAt: args.fetchedAt,
    })
  },
})

export const storeEnrichmentFailure = internalMutation({
  args: {
    linkedinUrl: v.string(),
    now: v.number(),
    attemptNumber: v.number(),
    lastError: v.string(),
    nextRetryAt: nullableNumber,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('linkedinProfiles')
      .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', args.linkedinUrl))
      .unique()

    const payload = {
      linkedinUrl: args.linkedinUrl,
      status: 'failed' as const,
      retryCount: args.attemptNumber,
      lastAttemptAt: args.now,
      nextRetryAt: args.nextRetryAt,
      lastError: args.lastError,
      updatedAt: args.now,
    }

    if (existing) {
      await ctx.db.patch(existing._id, payload)
      return existing._id
    }

    return await ctx.db.insert('linkedinProfiles', {
      linkedinUrl: args.linkedinUrl,
      name: null,
      headline: null,
      imageUrl: null,
      about: null,
      summary: null,
      visibility: null,
      status: 'failed',
      fetchedAt: null,
      expiresAt: null,
      retryCount: args.attemptNumber,
      nextRetryAt: args.nextRetryAt,
      lastAttemptAt: args.now,
      lastError: args.lastError,
      createdAt: args.now,
      updatedAt: args.now,
    })
  },
})
