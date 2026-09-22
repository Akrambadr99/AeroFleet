import { describe, expect, it } from 'vitest'
import { initialFleetDecision, reassignSwapReview, requestSwapReview, swapReviewInbox, transitionFleet } from './releaseLedger'

describe('inspection-to-release responsibility', () => {
  it('persists review, stales on replacement evidence, and requires a current handoff', () => {
    let state = transitionFleet(initialFleetDecision, { type: 'release', flightId: 'AX417', at: '2026-09-14', signed: true, reason: 'Release evidence verified.' })
    state = transitionFleet(state, { type: 'adopt-swap', hours: 2 })
    state = transitionFleet(state, { type: 'supersede-inspection', actor: 'maintenance controller', reason: 'New inspection supersedes packet.' })
    state = requestSwapReview(state, 'maintenance controller')
    expect(swapReviewInbox(state, 'release engineer')).toHaveLength(1)
    state = transitionFleet(state, { type: 'supersede-inspection', actor: 'maintenance controller', reason: 'Inspection revision changes evidence.' })
    expect(swapReviewInbox(state, 'release engineer')).toHaveLength(0)
    expect(() => transitionFleet(state, { type: 'revalidate-swap', actor: 'release engineer', reason: 'Current evidence independently reviewed.' })).toThrow(/current swap review/)
    state = requestSwapReview(state, 'maintenance controller')
    const request = swapReviewInbox(state, 'release engineer')[0]
    if (!request) throw new Error('Missing review request.')
    state = reassignSwapReview(state, request.id, 'maintenance controller', 'M. Chen', 'Shift handoff to the qualified release engineer.')
    expect(swapReviewInbox(state, 'M. Chen')).toHaveLength(1)
    expect(() => transitionFleet(state, { type: 'revalidate-swap', actor: 'release engineer', reason: 'Current evidence independently reviewed.' })).toThrow(/assigned/)
    state = transitionFleet(state, { type: 'revalidate-swap', actor: 'release engineer', reviewerIdentity: 'M. Chen', reason: 'Current evidence independently reviewed.' })
    expect(state.swapReviews?.map(item => item.status)).toEqual(['superseded', 'completed'])
    expect(state.swapEvidenceRevision).toBe(state.maintenanceRevision)
  })
})
