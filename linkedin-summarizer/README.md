# LinkedIn Summarizer

Blaxel-hosted Fastify agent that accepts a LinkedIn profile URL and returns:

- `name`
- `headline`
- `image_url`
- `summary`
- `linkedin_url`
- `visibility`
- `status`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Start the agent locally:

```bash
bl serve --hotreload
```

3. Run the package tests:

```bash
npm test
```

4. Deploy:

```bash
bl deploy
```
