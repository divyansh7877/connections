import { load } from 'cheerio'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

export interface ProfileData {
  linkedin_url: string
  name: string | null
  headline: string | null
  image_url: string | null
  about: string | null
  visibility: 'public' | 'limited'
  status: 'ready' | 'partial' | 'failed'
}

export function validateLinkedInProfileUrl(rawValue: string) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error('Invalid LinkedIn URL')
  }

  let value = rawValue.trim()
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`
  }

  const url = new URL(value)
  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com')) {
    throw new Error('Invalid LinkedIn URL')
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0]?.toLowerCase() !== 'in' || !segments[1]) {
    throw new Error('Invalid LinkedIn URL')
  }

  url.protocol = 'https:'
  url.hostname = 'www.linkedin.com'
  url.pathname = `/in/${segments[1]}`
  url.search = ''
  url.hash = ''

  return url.toString()
}

export async function scrapeLinkedIn(url: string) {
  const linkedinUrl = validateLinkedInProfileUrl(url)
  const openGraphProfile = await scrapeWithOpenGraph(linkedinUrl).catch(() =>
    createEmptyProfile(linkedinUrl),
  )

  if (openGraphProfile.status === 'ready') {
    return openGraphProfile
  }

  try {
    const sandboxProfile = await scrapeWithSandbox(linkedinUrl)
    return mergeProfiles(openGraphProfile, sandboxProfile)
  } catch {
    return openGraphProfile
  }
}

export function parseOgProfileData(html: string, linkedinUrl: string): ProfileData {
  const $ = load(html)
  const ogTitle = getMetaContent($, 'meta[property="og:title"]')
  const ogImage = getMetaContent($, 'meta[property="og:image"]')
  const ogDescription = getMetaContent($, 'meta[property="og:description"]')

  const parsedTitle = parseOgTitle(ogTitle)
  const visibility = parsedTitle.name || parsedTitle.headline || ogImage ? 'public' : 'limited'
  const status = parsedTitle.name || parsedTitle.headline || ogImage || ogDescription ? 'partial' : 'failed'

  return {
    linkedin_url: linkedinUrl,
    name: parsedTitle.name,
    headline: parsedTitle.headline,
    image_url: ogImage,
    about: ogDescription,
    visibility,
    status,
  }
}

async function scrapeWithOpenGraph(linkedinUrl: string) {
  const response = await fetch(linkedinUrl, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`LinkedIn returned ${response.status}`)
  }

  const html = await response.text()
  return parseOgProfileData(html, linkedinUrl)
}

async function scrapeWithSandbox(linkedinUrl: string) {
  const core = (await import('@blaxel/core')) as Record<string, any>
  const SandboxCtor = core.SandboxInstance ?? core.Sandbox ?? core.sandbox
  const createSandbox =
    SandboxCtor?.create ??
    SandboxCtor?.start ??
    core.createSandbox ??
    core.startSandbox

  if (typeof createSandbox !== 'function') {
    throw new Error('Blaxel Sandbox SDK is unavailable.')
  }

  const sandbox = await createSandbox({
    memory: 4096,
    ttl: 300,
    metadata: { purpose: 'linkedin-profile-scrape' },
  })

  const script = `
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: ${JSON.stringify(DEFAULT_USER_AGENT)},
    viewport: { width: 1280, height: 900 },
  });

  await page.goto(${JSON.stringify(linkedinUrl)}, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  const text = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/\\s+/g, ' ').trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const result = await page.evaluate(() => {
    const text = (value) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.replace(/\\s+/g, ' ').trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const queryText = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) return text(element.textContent);
      }
      return null;
    };
    const queryImage = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const src = element && 'src' in element ? element.src : null;
        if (src) return src;
      }
      return null;
    };
    const aboutSection = document.querySelector('#about');
    const aboutText = aboutSection ? text(aboutSection.textContent) : null;

    return {
      name: queryText(['h1', '.text-heading-xlarge', '.pv-text-details__left-panel h1']),
      headline: queryText(['.text-body-medium', '.pv-text-details__left-panel .text-body-medium']),
      image_url: queryImage(['img.pv-top-card-profile-picture__image', '.pv-top-card-profile-picture img', 'main img']),
      about: aboutText,
    };
  });

  await browser.close();
  console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
`.trim()

  try {
    const rawOutput = await executeSandboxScript(sandbox, script)
    const parsed = JSON.parse(findJsonLine(rawOutput)) as Partial<ProfileData>

    return {
      linkedin_url: linkedinUrl,
      name: cleanString(parsed.name),
      headline: cleanString(parsed.headline),
      image_url: cleanString(parsed.image_url),
      about: cleanString(parsed.about),
      visibility: parsed.name || parsed.headline || parsed.image_url ? 'public' : 'limited',
      status: parsed.name || parsed.headline || parsed.image_url ? 'ready' : 'failed',
    } satisfies ProfileData
  } finally {
    await closeSandbox(sandbox)
  }
}

function createEmptyProfile(linkedinUrl: string): ProfileData {
  return {
    linkedin_url: linkedinUrl,
    name: null,
    headline: null,
    image_url: null,
    about: null,
    visibility: 'limited',
    status: 'failed',
  }
}

function mergeProfiles(primary: ProfileData, secondary: ProfileData): ProfileData {
  const merged = {
    linkedin_url: primary.linkedin_url,
    name: secondary.name ?? primary.name,
    headline: secondary.headline ?? primary.headline,
    image_url: secondary.image_url ?? primary.image_url,
    about: secondary.about ?? primary.about,
    visibility: secondary.visibility === 'public' || primary.visibility === 'public' ? 'public' : 'limited',
    status: secondary.status === 'ready'
      ? 'ready'
      : secondary.name || secondary.headline || secondary.image_url || primary.name || primary.headline || primary.image_url
        ? 'partial'
        : 'failed',
  } satisfies ProfileData

  if (merged.status === 'partial' && merged.name && merged.headline && merged.image_url) {
    return { ...merged, status: 'ready' }
  }

  return merged
}

function getMetaContent($: ReturnType<typeof load>, selector: string) {
  const value = $(selector).attr('content')
  return cleanString(value)
}

function parseOgTitle(title: string | null) {
  if (!title) {
    return { name: null, headline: null }
  }

  const withoutSuffix = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim()
  const [name, ...headlineParts] = withoutSuffix.split(/\s+[–-]\s+/)
  return {
    name: cleanString(name),
    headline: cleanString(headlineParts.join(' - ')),
  }
}

async function executeSandboxScript(sandbox: Record<string, any>, script: string) {
  const command = `node -e ${JSON.stringify(script)}`

  if (typeof sandbox.runCommand === 'function') {
    const result = await sandbox.runCommand(command)
    return extractSandboxOutput(result)
  }

  if (typeof sandbox.exec === 'function') {
    const result = await sandbox.exec(command)
    return extractSandboxOutput(result)
  }

  if (typeof sandbox.run === 'function') {
    const result = await sandbox.run(command)
    return extractSandboxOutput(result)
  }

  throw new Error('Blaxel Sandbox execution API is unavailable.')
}

async function closeSandbox(sandbox: Record<string, any>) {
  if (typeof sandbox.stop === 'function') {
    await sandbox.stop()
    return
  }

  if (typeof sandbox.close === 'function') {
    await sandbox.close()
    return
  }

  if (typeof sandbox.destroy === 'function') {
    await sandbox.destroy()
  }
}

function extractSandboxOutput(result: unknown) {
  if (typeof result === 'string') {
    return result
  }

  if (result && typeof result === 'object') {
    const candidate = result as Record<string, unknown>
    const stdout = cleanString(candidate.stdout)
    const output = cleanString(candidate.output)
    if (stdout) {
      return stdout
    }
    if (output) {
      return output
    }
  }

  return ''
}

function findJsonLine(output: string) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse()

  const line = lines.find((candidate) => candidate.startsWith('{') && candidate.endsWith('}'))
  if (!line) {
    throw new Error('Sandbox did not return profile JSON.')
  }

  return line
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
