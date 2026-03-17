import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const createRoom = useMutation(api.rooms.createRoom)
  const [error, setError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateRoom = async () => {
    setError('')
    setIsCreating(true)

    try {
      const result = await createRoom({})
      await navigate({
        to: '/rooms/$code',
        params: { code: result.code },
      })
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, 'Could not create a room right now.'))
      setIsCreating(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <p className="eyebrow">Connections</p>
        <h1>One room. One scan. Everyone leaves with the right LinkedIn links.</h1>
        <p className="lede">
          Replace the awkward scan-everyone spiral with a temporary room for the table, booth, or event cluster.
        </p>
      </header>

      <main className="app-frame">
        <section className="panel panel-main">
          <div className="panel-copy">
            <p className="kicker">Event networking MVP</p>
            <h2>Create a room in one tap.</h2>
            <p>
              Share one QR code. Every attendee joins the same room, adds their LinkedIn profile, and gets the full list back.
            </p>
          </div>

          <div className="action-stack">
            <button className="button button-primary" onClick={handleCreateRoom} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create event room'}
            </button>
            <p className="helper-text">Rooms stay active for 8 hours and then expire automatically.</p>
            {error ? <p className="error-banner">{error}</p> : null}
          </div>
        </section>

        <section className="panel panel-secondary">
          <div className="info-grid">
            <article>
              <p className="card-index">01</p>
              <h3>Host starts a room</h3>
              <p>A shared QR code and link are generated immediately.</p>
            </article>
            <article>
              <p className="card-index">02</p>
              <h3>People add themselves</h3>
              <p>Each attendee submits their name and LinkedIn URL from their own phone.</p>
            </article>
            <article>
              <p className="card-index">03</p>
              <h3>Everyone opens profiles</h3>
              <p>The live room list becomes the group’s connection directory.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
