import { ConvexError, v } from 'convex/values'
import {
  ROOM_PURGE_GRACE_MS,
  ROOM_TTL_MS,
  createRoomCode,
  deriveRoomStatus,
  normalizeDisplayName,
  normalizeLinkedInUrl,
} from '../src/lib/room-utils'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

const memberView = (member: Doc<'members'>, sessionToken?: string) => ({
  id: member._id,
  displayName: member.displayName,
  linkedinUrl: member.linkedinUrl,
  joinedAt: member.joinedAt,
  isCurrentSession: Boolean(sessionToken && member.sessionToken === sessionToken),
})

async function deleteRoomWithMembers(ctx: any, roomId: Id<'rooms'>) {
  const members = await ctx.db
    .query('members')
    .withIndex('by_roomId', (q: any) => q.eq('roomId', roomId))
    .collect()

  for (const member of members) {
    await ctx.db.delete('members', member._id)
  }

  await ctx.db.delete('rooms', roomId)
}

export const getRoomByCode = query({
  args: {
    code: v.string(),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', args.code)).unique()
    if (!room) {
      return null
    }

    const status = deriveRoomStatus(room.expiresAt)
    const members = await ctx.db
      .query('members')
      .withIndex('by_roomId', (q) => q.eq('roomId', room._id))
      .collect()

    return {
      id: room._id,
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      status,
      members: members
        .sort((left, right) => left.joinedAt - right.joinedAt)
        .map((member) => memberView(member, args.sessionToken)),
    }
  },
})

export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    let code = createRoomCode()
    while (await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).unique()) {
      code = createRoomCode()
    }

    const now = Date.now()
    const expiresAt = now + ROOM_TTL_MS
    const roomId = await ctx.db.insert('rooms', {
      code,
      createdAt: now,
      expiresAt,
      status: 'active',
    })

    await ctx.scheduler.runAfter(ROOM_TTL_MS + ROOM_PURGE_GRACE_MS, internal.rooms.purgeExpiredRooms, {})

    return { roomId, code }
  },
})

export const joinRoom = mutation({
  args: {
    code: v.string(),
    displayName: v.string(),
    linkedinUrl: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', args.code)).unique()
    if (!room) {
      throw new ConvexError('Room not found.')
    }

    const status = deriveRoomStatus(room.expiresAt)
    if (status === 'expired') {
      if (room.status !== 'expired') {
        await ctx.db.patch('rooms', room._id, { status: 'expired' })
      }
      throw new ConvexError('This room is no longer active.')
    }

    const displayName = normalizeDisplayName(args.displayName)
    const linkedinUrl = normalizeLinkedInUrl(args.linkedinUrl)

    const existingSession = await ctx.db
      .query('members')
      .withIndex('by_roomId_and_sessionToken', (q) => q.eq('roomId', room._id).eq('sessionToken', args.sessionToken))
      .unique()
    if (existingSession) {
      throw new ConvexError('This browser is already in the room.')
    }

    const existingLinkedIn = await ctx.db
      .query('members')
      .withIndex('by_roomId_and_linkedinUrl', (q) => q.eq('roomId', room._id).eq('linkedinUrl', linkedinUrl))
      .unique()
    if (existingLinkedIn) {
      throw new ConvexError('That LinkedIn profile is already in this room.')
    }

    const memberId = await ctx.db.insert('members', {
      roomId: room._id,
      displayName,
      linkedinUrl,
      joinedAt: Date.now(),
      sessionToken: args.sessionToken,
    })

    return { memberId }
  },
})

export const removeMyMember = mutation({
  args: {
    code: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', args.code)).unique()
    if (!room) {
      throw new ConvexError('Room not found.')
    }

    const member = await ctx.db
      .query('members')
      .withIndex('by_roomId_and_sessionToken', (q) => q.eq('roomId', room._id).eq('sessionToken', args.sessionToken))
      .unique()

    if (!member) {
      return
    }

    await ctx.db.delete('members', member._id)
  },
})

export const purgeExpiredRooms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const threshold = Date.now() - ROOM_PURGE_GRACE_MS
    const rooms = await ctx.db.query('rooms').collect()

    const expiredRoomIds = rooms
      .filter((room) => room.expiresAt <= threshold)
      .map((room) => room._id)

    for (const roomId of expiredRoomIds) {
      await deleteRoomWithMembers(ctx, roomId)
    }
  },
})
