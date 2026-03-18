import { useEffect, useMemo, useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { FormEvent } from 'react'
import { makeQrDataUrl } from '~/lib/qr'
import { formatExpiry } from '~/lib/room-utils'
import { getSessionToken } from '~/lib/session'
import type { MemberView } from '~/lib/room-utils'

export const Route = createFileRoute('/rooms/$code')({
  component: RoomPage,
})

function RoomPage() {
  const { code } = Route.useParams()
  const [sessionToken, setSessionToken] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackIsError, setFeedbackIsError] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  useEffect(() => {
    setSessionToken(getSessionToken())
  }, [])

  const roomArgs = useMemo(
    () => (sessionToken ? { code, sessionToken } : { code }),
    [code, sessionToken],
  )

  const { data: room, isPending, error } = useQuery(
    convexQuery(api.rooms.getRoomByCode, roomArgs),
  )

  const joinRoom = useMutation(api.rooms.joinRoom)
  const removeMyMember = useMutation(api.rooms.removeMyMember)

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return ''
    }
    return `${window.location.origin}/rooms/${code}`
  }, [code])

  useEffect(() => {
    if (!joinUrl) {
      return
    }

    void makeQrDataUrl(joinUrl).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [joinUrl])

  useEffect(() => {
    if (!room) {
      return
    }

    const currentMember = room.members.find((member) => member.isCurrentSession)
    if (currentMember) {
      setDisplayName(currentMember.displayName)
      setLinkedinUrl(currentMember.linkedinUrl)
    }
  }, [room])

  if (isPending) {
    return (
      <div className="page-shell">
        <section className="panel panel-main loading-panel">
          <p className="helper-text">Loading room…</p>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <section className="panel panel-main">
          <p className="error-banner">{error.message}</p>
          <Link className="button button-primary inline-link-button" to="/">
            Create a new room
          </Link>
        </section>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="page-shell">
        <section className="panel panel-main">
          <p className="error-banner">Room not found.</p>
          <Link className="button button-primary inline-link-button" to="/">
            Create a new room
          </Link>
        </section>
      </div>
    )
  }

  const currentMember = room.members.find((member) => member.isCurrentSession)
  const isActive = room.status === 'active'

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sessionToken) {
      setErrorFeedback('Could not create a browser session. Refresh and try again.')
      return
    }

    setIsJoining(true)
    setFeedback('')

    try {
      await joinRoom({
        code,
        displayName,
        linkedinUrl,
        sessionToken,
      })
      setSuccessFeedback('You’ve been added to the room.')
    } catch (caughtError) {
      setErrorFeedback(getErrorMessage(caughtError, 'Could not join the room.'))
    } finally {
      setIsJoining(false)
    }
  }

  const handleRemove = async () => {
    if (!sessionToken) {
      return
    }

    setIsRemoving(true)
    setFeedback('')

    try {
      await removeMyMember({ code, sessionToken })
      setSuccessFeedback('Your entry was removed.')
    } catch (caughtError) {
      setErrorFeedback(getErrorMessage(caughtError, 'Could not remove your entry.'))
    } finally {
      setIsRemoving(false)
    }
  }

  const handleCopyLink = async () => {
    if (!joinUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(joinUrl)
      setSuccessFeedback('Room link copied.')
    } catch {
      setErrorFeedback('Clipboard access is not available here.')
    }
  }

  const handleShareLink = async () => {
    if (!joinUrl) {
      return
    }

    try {
      const canShare = typeof navigator.share === 'function'
      if (canShare) {
        await navigator.share({
          title: `Join room ${code}`,
          text: 'Join this Connections room and add your LinkedIn profile.',
          url: joinUrl,
        })
        setSuccessFeedback('Share sheet opened.')
        return
      }

      await navigator.clipboard.writeText(joinUrl)
      setSuccessFeedback('Share is not available here, so the link was copied instead.')
    } catch {
      setErrorFeedback('Could not share the room link.')
    }
  }

  return (
    <div className="page-shell">
      <main className="app-frame">
        <section className="panel panel-main room-shell">
          <div className="room-hero">
            <div>
              <p className="kicker">Active room</p>
              <h2>{`Room ${room.code}`}</h2>
              <p className="status-line">
                {isActive ? `${formatExpiry(room.expiresAt)} • Open to anyone with the link` : 'Room expired'}
              </p>
            </div>
            <div className="badge-cluster">
              <span className="badge">{room.code}</span>
              <span className="badge badge-muted">{room.members.length} member{room.members.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="room-grid">
            <section className="share-card">
              <div className="share-header">
                <div>
                  <p className="section-label">Share this room</p>
                  <h3>Scan once</h3>
                </div>
                <Link className="button button-ghost inline-link-button" to="/">
                  New room
                </Link>
              </div>

              <div className="qr-shell">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code for the room join link" />
                ) : (
                  <p className="helper-text">Preparing QR…</p>
                )}
              </div>

              <label className="input-label" htmlFor="join-link">Join link</label>
              <div className="inline-field">
                <input id="join-link" className="text-input" type="text" readOnly value={joinUrl} />
                <button className="button button-secondary" type="button" onClick={handleCopyLink}>
                  Copy
                </button>
              </div>

              <div className="button-row">
                <button className="button button-secondary" type="button" onClick={handleShareLink}>
                  Share
                </button>
              </div>

              <p className="helper-text">
                The QR is generated locally in the browser, and the direct link works even if someone prefers not to scan.
              </p>
            </section>

            <section className="join-card">
              <div className="section-header">
                <div>
                  <p className="section-label">Join the list</p>
                  <h3>Add your LinkedIn</h3>
                </div>
              </div>

              {currentMember && isActive ? (
                <div className="joined-state">
                  <p className="joined-title">You’re already in this room.</p>
                  <p className="helper-text">Your entry is pinned below on this device until you remove it.</p>
                  <button className="button button-ghost" type="button" onClick={handleRemove} disabled={isRemoving}>
                    {isRemoving ? 'Removing...' : 'Remove my entry'}
                  </button>
                </div>
              ) : null}

              {!currentMember && isActive ? (
                <form className="join-form" onSubmit={handleJoin}>
                  <label className="input-label" htmlFor="display-name">Name</label>
                  <input
                    id="display-name"
                    className="text-input"
                    maxLength={80}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Jordan Lee"
                    required
                  />

                  <label className="input-label" htmlFor="linkedin-url">LinkedIn URL</label>
                  <input
                    id="linkedin-url"
                    className="text-input"
                    value={linkedinUrl}
                    onChange={(event) => setLinkedinUrl(event.target.value)}
                    placeholder="https://www.linkedin.com/in/your-profile"
                    required
                  />

                  <button className="button button-primary" type="submit" disabled={isJoining}>
                    {isJoining ? 'Joining...' : 'Join room'}
                  </button>
                </form>
              ) : null}

              {!isActive ? (
                <div className="expired-state">
                  <p className="joined-title">This room has expired.</p>
                  <p className="helper-text">Create a new room to keep the networking chain moving.</p>
                </div>
              ) : null}

              <p className="feedback-text" data-error={feedbackIsError ? 'true' : 'false'}>{feedback}</p>
            </section>
          </div>
        </section>

        <section className="panel panel-secondary">
          <div className="section-header">
            <div>
              <p className="section-label">People in the room</p>
              <h3>Member list</h3>
            </div>
          </div>
          <div className="members-list">
            {room.members.length === 0 ? (
              <article className="member-card member-card-empty">
                <p>No one has joined yet. Share the QR and start the list.</p>
              </article>
            ) : (
              room.members.map((member) => (
                <article key={member.id} className={`member-card ${member.isCurrentSession ? 'member-card-current' : ''}`}>
                  <div className="member-card-main">
                    <div className="member-avatar-shell" aria-hidden="true">
                      {member.imageUrl ? (
                        <img className="member-avatar" src={member.imageUrl} alt="" />
                      ) : (
                        <span className="member-avatar member-avatar-fallback">
                          {getInitials(member.profileName)}
                        </span>
                      )}
                    </div>

                    <div className="member-meta">
                      <div className="member-name-row">
                        <p className="member-name">
                          {member.profileName}
                          {member.isCurrentSession ? <span className="member-tag">You</span> : null}
                        </p>
                        <span className={`member-status-pill member-status-${member.enrichmentStatus}`}>
                          {getStatusLabel(member)}
                        </span>
                      </div>

                      {member.headline ? <p className="member-headline">{member.headline}</p> : null}
                      <p className="member-summary">{getMemberSummary(member)}</p>
                      <p className="member-time">
                        Joined {new Date(member.joinedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="member-actions">
                    <a className="button button-secondary member-link" href={member.linkedinUrl} target="_blank" rel="noreferrer">
                      Open LinkedIn
                    </a>
                    {member.visibility === 'limited' ? <p className="member-note">Limited profile visibility</p> : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )

  function setSuccessFeedback(message: string) {
    setFeedback(message)
    setFeedbackIsError(false)
  }

  function setErrorFeedback(message: string) {
    setFeedback(message)
    setFeedbackIsError(true)
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function getMemberSummary(member: MemberView) {
  if (member.summary) {
    return member.summary
  }

  if (member.enrichmentStatus === 'pending') {
    return 'Fetching LinkedIn preview…'
  }

  if (member.visibility === 'limited') {
    return 'LinkedIn exposes only limited public profile details for this member.'
  }

  if (member.lastError) {
    return 'Preview unavailable right now. The LinkedIn link still works.'
  }

  return 'Profile preview unavailable right now. The LinkedIn link still works.'
}

function getStatusLabel(member: MemberView) {
  if (member.enrichmentStatus === 'ready') {
    return 'Ready'
  }

  if (member.enrichmentStatus === 'pending') {
    return 'Fetching'
  }

  if (member.visibility === 'limited' || member.enrichmentStatus === 'partial') {
    return 'Limited'
  }

  return 'Unavailable'
}
