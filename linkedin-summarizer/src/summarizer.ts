import type { ProfileData } from './scraper.js'

export interface ProfileSummary extends ProfileData {
  summary: string | null
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

export async function summarizeProfile(profile: ProfileData): Promise<ProfileSummary> {
  if (!profile.name && !profile.headline && !profile.about) {
    return {
      ...profile,
      summary: null,
    }
  }

  try {
    const summary = await requestSummary(profile)
    return {
      ...profile,
      summary: normalizeSummary(summary),
    }
  } catch {
    return {
      ...profile,
      summary: null,
    }
  }
}

export function buildSummaryPrompt(profile: ProfileData) {
  return [
    'You are generating a one-line professional introduction for a networking app.',
    'Write exactly one sentence in English, under 30 words.',
    'Be specific, concrete, and human. Avoid buzzwords, hashtags, and emojis.',
    '',
    `Name: ${profile.name ?? 'Unknown'}`,
    `Headline: ${profile.headline ?? 'Unknown'}`,
    `About: ${profile.about ?? 'Unknown'}`,
    '',
    'One-line intro:',
  ].join('\n')
}

export function normalizeSummary(rawSummary: string | null) {
  if (!rawSummary) {
    return null
  }

  const flattened = rawSummary.replace(/\s+/g, ' ').trim()
  if (!flattened) {
    return null
  }

  const firstSentence = flattened.match(/[^.!?]+[.!?]?/)
  const sentence = firstSentence ? firstSentence[0].trim() : flattened
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 30)
  if (words.length === 0) {
    return null
  }

  const clipped = words.join(' ').replace(/[,:;]+$/, '')
  return /[.!?]$/.test(clipped) ? clipped : `${clipped}.`
}

async function requestSummary(profile: ProfileData) {
  const prompt = buildSummaryPrompt(profile)
  const endpoint = getModelEndpoint()
  const headers = getHeaders()
  const model = process.env.BL_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 80,
      messages: [
        {
          role: 'system',
          content: 'You write concise, natural networking intros.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    throw new Error(`Model request failed with ${response.status}`)
  }

  const payload = (await response.json()) as ChatCompletionResponse
  const content = payload.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
      .join(' ')
      .trim()
  }

  throw new Error('Model response did not include summary text.')
}

function getModelEndpoint() {
  const override = process.env.BLAXEL_MODEL_ENDPOINT?.trim()
  if (override) {
    return override
  }

  const workspace = process.env.BL_WORKSPACE?.trim()
  if (workspace) {
    return `https://run.blaxel.ai/${workspace}/models/${process.env.BL_MODEL?.trim() || 'gpt-4o-mini'}/chat/completions`
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return 'https://api.openai.com/v1/chat/completions'
  }

  throw new Error('No model endpoint configured.')
}

function getHeaders() {
  const headers = new Headers({
    'Content-Type': 'application/json',
  })

  const blaxelToken = process.env.BLAXEL_AGENT_TOKEN?.trim()
  if (blaxelToken) {
    headers.set('Authorization', `Bearer ${blaxelToken}`)
    headers.set('X-Blaxel-Authorization', `Bearer ${blaxelToken}`)
  }

  const workspace = process.env.BL_WORKSPACE?.trim()
  if (workspace) {
    headers.set('X-Blaxel-Workspace', workspace)
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim()
  if (openAiKey) {
    headers.set('Authorization', `Bearer ${openAiKey}`)
  }

  return headers
}
