import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()
crons.interval('purge expired rooms', { hours: 1 }, internal.rooms.purgeExpiredRooms, {})

export default crons
