import type { FleetDecision, SwapEvidenceReview } from './releaseLedger'
import { reassignSwapReview, swapStaleReasons } from './releaseLedger'

export interface ReleaseEngineer {
  id: string
  name: string
  aircraftFamilies: readonly string[]
  maxOpenReviews: number
  available: boolean
}
export interface FlightWorkRecord { flightId: string; family: string; critical: boolean; decision: FleetDecision }
export interface FlightReviewItem {
  flightId: string
  reviewId: string
  assigneeId: string | null
  maintenanceRevision: number
  critical: boolean
  actionable: boolean
}

export const releaseEngineers: readonly ReleaseEngineer[] = [
  { id: 'eng-lee', name: 'Morgan Lee', aircraftFamilies: ['A320', 'A321'], maxOpenReviews: 2, available: true },
  { id: 'eng-sana', name: 'Sana Farouk', aircraftFamilies: ['A320'], maxOpenReviews: 1, available: true },
  { id: 'eng-theo', name: 'Theo Grant', aircraftFamilies: ['B737'], maxOpenReviews: 2, available: false },
]

export function flightReviewInbox(records: readonly FlightWorkRecord[], actorId?: string): FlightReviewItem[] {
  return records.flatMap(({ flightId, critical, decision }) => (decision.swapReviews ?? []).filter(item =>
    item.status === 'open').map(item => ({
    flightId, reviewId: item.id, assigneeId: item.assignee === 'release engineer' ? null : item.assignee,
    maintenanceRevision: item.sourceMaintenanceRevision, critical,
    actionable: item.sourceMaintenanceRevision === decision.maintenanceRevision && swapStaleReasons(decision).length > 0,
  }))).filter(item => actorId === undefined || item.assigneeId === actorId)
    .sort((a, b) => Number(b.critical) - Number(a.critical) ||
      Number(b.actionable) - Number(a.actionable) || a.maintenanceRevision - b.maintenanceRevision ||
      a.flightId.localeCompare(b.flightId) || a.reviewId.localeCompare(b.reviewId))
}

export function engineerWorkload(records: readonly FlightWorkRecord[], actorId: string): number {
  return flightReviewInbox(records, actorId).filter(item => item.actionable).length
}

export function engineerEligibility(records: readonly FlightWorkRecord[], record: FlightWorkRecord, actorId: string): string[] {
  const engineer = releaseEngineers.find(item => item.id === actorId)
  const blockers: string[] = []
  if (!engineer?.available) blockers.push('Release engineer is unavailable.')
  if (engineer && !engineer.aircraftFamilies.includes(record.family)) blockers.push('Engineer lacks aircraft-family release qualification.')
  if (engineer && engineerWorkload(records, actorId) >= engineer.maxOpenReviews) blockers.push('Engineer is at capacity.')
  if (actorId === record.decision.inspectionOwner) blockers.push('Inspection author cannot independently review their evidence.')
  return blockers
}

export function rankReleaseEngineers(records: readonly FlightWorkRecord[], record: FlightWorkRecord): ReleaseEngineer[] {
  return releaseEngineers.filter(item => engineerEligibility(records, record, item.id).length === 0)
    .toSorted((a, b) => engineerWorkload(records, a.id) - engineerWorkload(records, b.id) || a.id.localeCompare(b.id))
}

function currentReview(state: FleetDecision): SwapEvidenceReview {
  const review = (state.swapReviews ?? []).find(item => item.status === 'open' &&
    item.sourceMaintenanceRevision === state.maintenanceRevision)
  if (!review || !swapStaleReasons(state).length) throw new Error('No current inspection review can be claimed.')
  return review
}

export function claimFlightReview(record: FlightWorkRecord, actorId: string, records: readonly FlightWorkRecord[],
  expectedRevision: number): FleetDecision {
  const state = record.decision
  if (state.revision !== expectedRevision) throw new Error('Flight release revision changed before claim.')
  const review = currentReview(state)
  if (review.assignee !== 'release engineer') throw new Error('Review is already assigned to an engineer.')
  const blockers = engineerEligibility(records, record, actorId)
  if (blockers.length) throw new Error(blockers[0])
  const revision = state.revision + 1
  return { ...state, revision, swapReviews: state.swapReviews?.map(item => item.id === review.id ?
    { ...item, assignee: actorId } : item),
    history: [...state.history, { revision, action: 'swap-review-reassigned', source: 'engineer-work-queue',
      reason: 'Qualified engineer claimed inspection review.', actor: actorId }] }
}

export function transferFlightReview(record: FlightWorkRecord, nextActorId: string, supervisor: string,
  reason: string, records: readonly FlightWorkRecord[]): FleetDecision {
  if (supervisor !== 'maintenance supervisor' || reason.trim().length < 12) throw new Error('Maintenance supervisor and transfer reason are required.')
  const review = currentReview(record.decision)
  if (review.assignee === 'release engineer') throw new Error('Unclaimed review should be claimed from the team queue.')
  const blockers = engineerEligibility(records, record, nextActorId)
  if (blockers.length) throw new Error(blockers[0])
  return reassignSwapReview(record.decision, review.id, record.decision.inspectionOwner ?? '', nextActorId, reason)
}
