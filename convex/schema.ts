import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(v.literal('active'), v.literal('expired')),
  }).index('by_code', ['code']),

  members: defineTable({
    roomId: v.id('rooms'),
    displayName: v.string(),
    linkedinUrl: v.string(),
    joinedAt: v.number(),
    sessionToken: v.string(),
  })
    .index('by_roomId', ['roomId'])
    .index('by_roomId_and_sessionToken', ['roomId', 'sessionToken'])
    .index('by_roomId_and_linkedinUrl', ['roomId', 'linkedinUrl']),

  linkedinProfiles: defineTable({
    linkedinUrl: v.string(),
    name: v.union(v.string(), v.null()),
    headline: v.union(v.string(), v.null()),
    imageUrl: v.union(v.string(), v.null()),
    about: v.union(v.string(), v.null()),
    summary: v.union(v.string(), v.null()),
    visibility: v.union(v.literal('public'), v.literal('limited'), v.null()),
    status: v.union(v.literal('pending'), v.literal('ready'), v.literal('partial'), v.literal('failed')),
    fetchedAt: v.union(v.number(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    retryCount: v.number(),
    nextRetryAt: v.union(v.number(), v.null()),
    lastAttemptAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_linkedinUrl', ['linkedinUrl']),
})
