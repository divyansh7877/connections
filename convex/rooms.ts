import { ConvexError, v } from 'convex/values'
import {
  LINKEDIN_PROFILE_PENDING_STALE_MS,
  ROOM_PURGE_GRACE_MS,
  ROOM_TTL_MS,
  createRoomCode,
  deriveRoomStatus,
  normalizeDisplayName,
  normalizeLinkedInUrl,
  shouldRefreshLinkedInProfile,
} from '../src/lib/room-utils'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

function memberView(
  member: Doc<'members'>,
  profile: Doc<'linkedinProfiles'> | null,
  sessionToken?: string,
) {
  return {
    id: member._id,
    displayName: member.displayName,
    linkedinUrl: member.linkedinUrl,
    joinedAt: member.joinedAt,
    isCurrentSession: Boolean(sessionToken && member.sessionToken === sessionToken),
    profileName: profile?.name ?? member.displayName,
    headline: profile?.headline ?? null,
    imageUrl: profile?.imageUrl ?? null,
    summary: profile?.summary ?? null,
    visibility: profile?.visibility ?? null,
    enrichmentStatus: profile?.status ?? 'pending',
    lastError: profile?.lastError ?? null,
  }
}

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

    const membersWithProfiles = await Promise.all(
      members.map(async (member) => {
        const profile = await ctx.db
          .query('linkedinProfiles')
          .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', member.linkedinUrl))
          .unique()

        return { member, profile }
      }),
    )

    return {
      id: room._id,
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      status,
      members: membersWithProfiles
        .sort((left, right) => left.member.joinedAt - right.member.joinedAt)
        .map(({ member, profile }) => memberView(member, profile, args.sessionToken)),
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

    const cachedProfile = await ctx.db
      .query('linkedinProfiles')
      .withIndex('by_linkedinUrl', (q) => q.eq('linkedinUrl', linkedinUrl))
      .unique()

    const joinedAt = Date.now()

    const memberId = await ctx.db.insert('members', {
      roomId: room._id,
      displayName,
      linkedinUrl,
      joinedAt,
      sessionToken: args.sessionToken,
    })

    const shouldQueueRefresh = shouldRefreshLinkedInProfile(cachedProfile, joinedAt)
      && !(cachedProfile?.status === 'pending'
        && typeof cachedProfile.lastAttemptAt === 'number'
        && joinedAt - cachedProfile.lastAttemptAt < LINKEDIN_PROFILE_PENDING_STALE_MS)

    if (shouldQueueRefresh) {
      await ctx.scheduler.runAfter(0, internal.linkedinProfilesActions.enrichLinkedInProfile, {
        linkedinUrl,
        attemptNumber: cachedProfile?.retryCount ?? 0,
      })
    }

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
