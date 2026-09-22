import type { StoragePort } from '../workspace/repository'

export interface FleetEvent {
  revision: number
  action: 'release' | 'swap-adopted' | 'release-reopened' | 'inspection-superseded' | 'swap-revalidated' | 'swap-review-requested' | 'swap-review-reassigned'
  source: string
  reason: string
  actor?: string
}
export interface FleetDecision {
  revision: number
  flightId: string
  releaseAt: string | null
  swapHours: number | null
  maintenanceRevision: number
  swapEvidenceRevision: number | null
  inspectionOwner: string | null
  swapReviews?: readonly SwapEvidenceReview[] | undefined
  history: readonly FleetEvent[]
}
export interface SwapEvidenceReview {
  id: string
  flightId: string
  assignee: string
  requestedBy: string
  sourceMaintenanceRevision: number
  status: 'open' | 'stale' | 'completed' | 'superseded'
  supersedesId?: string
  decisionReason?: string
}
export type FleetAction =
  | { type: 'release'; flightId: string; at: string; signed: boolean; reason: string }
  | { type: 'adopt-swap'; hours: number }
  | { type: 'reopen-release'; reason: string }
  | { type: 'supersede-inspection'; reason: string; actor?: string }
  | { type: 'revalidate-swap'; reason: string; actor: string; reviewerIdentity?: string }

export const fleetKey = 'aerofleet:flight-release:v1'
export const initialFleetDecision: FleetDecision = {
  revision: 0, flightId: 'AX417', releaseAt: null, swapHours: null, maintenanceRevision: 0,
  swapEvidenceRevision: null, inspectionOwner: null, swapReviews: [], history: [],
}

export function readFleetDecision(storage: StoragePort): FleetDecision {
  const raw = storage.getItem(fleetKey)
  if (!raw) return initialFleetDecision
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('revision' in value) ||
    typeof value.revision !== 'number' || !('history' in value) || !Array.isArray(value.history) ||
    !('releaseAt' in value) || (value.releaseAt !== null && typeof value.releaseAt !== 'string') ||
    !('swapHours' in value) || (value.swapHours !== null && typeof value.swapHours !== 'number') ||
    !('flightId' in value) || typeof value.flightId !== 'string') throw new Error('Invalid fleet release record.')
  const record = value as Omit<FleetDecision, 'maintenanceRevision' | 'swapEvidenceRevision' | 'inspectionOwner'> &
    Partial<Pick<FleetDecision, 'maintenanceRevision' | 'swapEvidenceRevision' | 'inspectionOwner'>>
  return { ...record, maintenanceRevision: record.maintenanceRevision ?? 0,
    swapEvidenceRevision: record.swapEvidenceRevision ?? (record.swapHours === null ? null : 0), inspectionOwner: record.inspectionOwner ?? null,
    swapReviews: record.swapReviews ?? [] }
}

export function requestSwapReview(state: FleetDecision, requestedBy: string, assignee = 'release engineer'): FleetDecision {
  if (!swapStaleReasons(state).length) throw new Error('Only a stale adopted swap can be submitted for review.')
  if (requestedBy !== state.inspectionOwner) throw new Error('The inspection owner must hand off the superseded evidence.')
  if (!assignee.trim() || assignee === requestedBy) throw new Error('Assign an independent release engineer.')
  const current = (state.swapReviews ?? []).find(review => review.status === 'open')
  if (current?.sourceMaintenanceRevision === state.maintenanceRevision) throw new Error('Current inspection already has a review request.')
  const previous = current ?? [...(state.swapReviews ?? [])].reverse().find(review => review.status === 'stale')
  const review: SwapEvidenceReview = {
    id: `SWAP-${state.flightId}-${String(state.revision + 1)}`, flightId: state.flightId, requestedBy, assignee,
    sourceMaintenanceRevision: state.maintenanceRevision, status: 'open',
    ...(previous ? { supersedesId: previous.id } : {}),
  }
  return { ...state, revision: state.revision + 1, swapReviews: [...(state.swapReviews ?? []).map(item =>
    item.id === previous?.id ? { ...item, status: 'superseded' as const } : item), review],
    history: [...state.history, { revision: state.revision + 1, action: 'swap-review-requested', source: 'swap-review-request',
      reason: `Review ${review.id} requested for inspection revision ${String(review.sourceMaintenanceRevision)}`, actor: requestedBy }] }
}

export function swapReviewInbox(state: FleetDecision, assignee: string): SwapEvidenceReview[] {
  return (state.swapReviews ?? []).filter(review => review.assignee === assignee && review.status === 'open')
}

export function reassignSwapReview(state: FleetDecision, id: string, actor: string, assignee: string, reason: string): FleetDecision {
  const review = (state.swapReviews ?? []).find(item => item.id === id)
  if (review?.status !== 'open') throw new Error('Only an open review may be reassigned.')
  if (actor !== review.requestedBy || reason.trim().length < 12) throw new Error('Inspection owner and a handoff reason are required.')
  if (!assignee.trim() || assignee === review.requestedBy || assignee === review.assignee) throw new Error('Choose a different independent reviewer.')
  return { ...state, revision: state.revision + 1, swapReviews: state.swapReviews?.map(item => item.id === id ?
    { ...item, assignee } : item), history: [...state.history, { revision: state.revision + 1,
    action: 'swap-review-reassigned', source: 'swap-review-handoff', reason, actor }] }
}

export function swapReviewPolicy(state: FleetDecision, actor: string): { allowed: boolean; blockers: string[]; queue: 'dispatch' | 'release-review' } {
  const blockers = swapStaleReasons(state)
  if (!blockers.length) return { allowed: false, blockers: ['No stale swap requires independent review.'], queue: 'dispatch' }
  const authorization: string[] = []
  if (actor !== 'release engineer') authorization.push('Only a release engineer may review superseded inspection evidence.')
  if (actor === state.inspectionOwner) authorization.push('The inspection author cannot independently revalidate the swap.')
  return { allowed: authorization.length === 0, blockers: authorization, queue: 'release-review' }
}

export function swapStaleReasons(state: FleetDecision): string[] {
  return state.swapHours !== null && state.swapEvidenceRevision !== state.maintenanceRevision
    ? ['The adopted swap relies on superseded inspection evidence. Revalidate it before dispatch.'] : []
}

export function fleetBlockers(state: FleetDecision): string[] {
  return state.releaseAt ? [] : ['Return-to-service evidence must be recorded before a swap plan is adopted.']
}

export function transitionFleet(state: FleetDecision, action: FleetAction): FleetDecision {
  let next: FleetDecision
  switch (action.type) {
    case 'release':
      if (state.releaseAt) throw new Error('Release is already recorded.')
      if (!action.signed || action.reason.trim().length < 12) throw new Error('Signed evidence and a release rationale are required.')
      next = { ...state, flightId: action.flightId, releaseAt: action.at }
      break
    case 'adopt-swap':
      if (fleetBlockers(state).length) throw new Error(fleetBlockers(state)[0])
      if (!Number.isInteger(action.hours) || action.hours < 0 || action.hours > 6) throw new Error('Swap utilization is outside the feasible window.')
      if (state.swapHours !== null) throw new Error('A swap plan is already adopted.')
      next = { ...state, swapHours: action.hours, swapEvidenceRevision: state.maintenanceRevision }
      break
    case 'reopen-release':
      if (!state.releaseAt) throw new Error('There is no release to reopen.')
      if (state.swapHours !== null) throw new Error('The adopted swap plan depends on this release.')
      if (action.reason.trim().length < 12) throw new Error('Explain why the release is being reopened.')
      next = { ...state, releaseAt: null }
      break
    case 'supersede-inspection':
      if (!state.releaseAt) throw new Error('A release must exist before inspection evidence can be superseded.')
      if (action.reason.trim().length < 12) throw new Error('Explain the new inspection evidence.')
      next = { ...state, maintenanceRevision: state.maintenanceRevision + 1, inspectionOwner: action.actor ?? 'maintenance controller' }
      break
    case 'revalidate-swap':
      if (!swapStaleReasons(state).length) throw new Error('There is no stale swap to revalidate.')
      { const policy = swapReviewPolicy(state, action.actor); if (!policy.allowed) throw new Error(policy.blockers[0]) }
      { const reviews = state.swapReviews ?? []; if (reviews.length) {
        const current = reviews.find(review => review.status === 'open' && review.sourceMaintenanceRevision === state.maintenanceRevision)
        if (current?.assignee !== (action.reviewerIdentity ?? action.actor)) throw new Error('A current swap review must be assigned to this engineer.')
      } }
      if (action.reason.trim().length < 12) throw new Error('Explain the revalidation decision.')
      next = { ...state, swapEvidenceRevision: state.maintenanceRevision, swapReviews: state.swapReviews?.map(review =>
        review.status === 'open' ? { ...review, status: 'completed' as const, decisionReason: action.reason } : review) }
      break
  }
  const event: FleetEvent = {
    revision: state.revision + 1,
    action: action.type === 'adopt-swap' ? 'swap-adopted' : action.type === 'reopen-release' ? 'release-reopened' : action.type === 'supersede-inspection' ? 'inspection-superseded' : action.type === 'revalidate-swap' ? 'swap-revalidated' : 'release',
    source: action.type === 'adopt-swap' || action.type === 'revalidate-swap' ? 'swap-impact' : 'availability-timeline',
    reason: action.type === 'adopt-swap' ? 'Adopted feasible swap at ' + String(action.hours) + ' hours' : action.reason,
    ...(('actor' in action && action.actor) ? { actor: action.actor } : {}),
  }
  return { ...next, revision: event.revision, history: [...state.history, event],
    ...(action.type === 'supersede-inspection' ? { swapReviews: (next.swapReviews ?? []).map(review =>
      review.status === 'open' ? { ...review, status: 'stale' as const } : review) } : {}) }
}

export function commitFleet(storage: StoragePort, action: FleetAction): FleetDecision {
  const next = transitionFleet(readFleetDecision(storage), action)
  storage.setItem(fleetKey, JSON.stringify(next))
  return next
}
export function saveFleetDecision(storage: StoragePort, decision: FleetDecision): FleetDecision {
  storage.setItem(fleetKey, JSON.stringify(decision))
  return decision
}
