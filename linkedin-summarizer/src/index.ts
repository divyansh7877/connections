import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import type { FastifyReply } from 'fastify'
import { pathToFileURL } from 'node:url'
import { scrapeLinkedIn, validateLinkedInProfileUrl } from './scraper.js'
import { summarizeProfile } from './summarizer.js'

const server = Fastify({
  logger: process.env.NODE_ENV !== 'test',
})

server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as { inputs?: unknown } | undefined
  if (typeof body?.inputs !== 'string') {
    return reply.status(400).send({ error: 'Invalid LinkedIn URL' })
  }

  return handleProfileRequest(body.inputs, reply)
})

server.post('/summarize', async (request: FastifyRequest, reply: FastifyReply) => {
  const body = request.body as { linkedin_url?: unknown } | undefined
  if (typeof body?.linkedin_url !== 'string') {
    return reply.status(400).send({ error: 'Invalid LinkedIn URL' })
  }

  return handleProfileRequest(body.linkedin_url, reply)
})

server.get('/health', async () => ({ status: 'ok' }))

async function handleProfileRequest(rawLinkedInUrl: string, reply: FastifyReply) {
  let linkedinUrl: string
  try {
    linkedinUrl = validateLinkedInProfileUrl(rawLinkedInUrl)
  } catch {
    return reply.status(400).send({ error: 'Invalid LinkedIn URL' })
  }

  let scraped
  try {
    scraped = await withTimeout(scrapeLinkedIn(linkedinUrl), 30_000)
  } catch (error) {
    return reply.status(502).send({
      error: 'Failed to fetch profile',
      details: error instanceof Error ? error.message : 'Unknown scrape failure',
    })
  }

  const summarized = await summarizeProfile(scraped)

  return {
    name: summarized.name,
    headline: summarized.headline,
    image_url: summarized.image_url,
    summary: summarized.summary,
    linkedin_url: summarized.linkedin_url,
    visibility: summarized.visibility,
    status: summarized.status,
    about: summarized.about,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms.`)), timeoutMs)
    }),
  ])
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const port = Number(process.env.BL_SERVER_PORT || process.env.PORT || 1338)
  const host = process.env.BL_SERVER_HOST || process.env.HOST || '0.0.0.0'

  server.listen({ port, host }).catch((error: unknown) => {
    server.log.error(error)
    process.exit(1)
  })
}

export default server
