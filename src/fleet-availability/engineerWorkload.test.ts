import { describe, expect, it } from 'vitest'
import { initialFleetDecision, requestSwapReview, transitionFleet } from './releaseLedger'
import { claimFlightReview, engineerEligibility, flightReviewInbox } from './engineerWorkload'

function awaiting(flightId: string) {
  let state = transitionFleet(initialFleetDecision, { type: 'release', flightId, at: '2026-09-14', signed: true, reason: 'Release packet signed by engineering.' })
  state = transitionFleet(state, { type: 'adopt-swap', hours: 2 })
  state = transitionFleet(state, { type: 'supersede-inspection', actor: 'maintenance controller', reason: 'A new inspection superseded dispatch evidence.' })
  return requestSwapReview(state, 'maintenance controller')
}
describe('named release-engineer workload', () => {
  it('projects two flights and enforces capacity and named release', () => {
    const first = { flightId: 'AX417', family: 'A320', critical: true, decision: awaiting('AX417') }
    const second = { flightId: 'AX418', family: 'A320', critical: false, decision: awaiting('AX418') }
    expect(flightReviewInbox([second, first]).map(item => item.flightId)).toEqual(['AX417', 'AX418'])
    const claimed = claimFlightReview(first, 'eng-sana', [first, second], first.decision.revision)
    expect(engineerEligibility([{ ...first, decision: claimed }, second], second, 'eng-sana')).toContain('Engineer is at capacity.')
    expect(() => transitionFleet(claimed, { type: 'revalidate-swap', actor: 'release engineer', reviewerIdentity: 'eng-lee', reason: 'New inspection evidence independently reviewed.' })).toThrow(/assigned/)
    expect(transitionFleet(claimed, { type: 'revalidate-swap', actor: 'release engineer', reviewerIdentity: 'eng-sana', reason: 'New inspection evidence independently reviewed.' }).swapEvidenceRevision).toBe(1)
  })
  it('rejects unqualified or stale claims', () => {
    const record = { flightId: 'AX417', family: 'A320', critical: true, decision: awaiting('AX417') }
    expect(() => claimFlightReview(record, 'eng-theo', [record], record.decision.revision)).toThrow(/unavailable/)
    expect(() => claimFlightReview(record, 'eng-lee', [record], 0)).toThrow(/revision changed/)
  })
})
