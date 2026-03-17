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
})
