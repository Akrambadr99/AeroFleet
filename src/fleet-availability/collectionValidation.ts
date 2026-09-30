import { array, booleanValue, finiteNumber, nonEmptyText, nonNegativeInteger, nullable, object, oneOf, optional, refine, text, uniqueBy } from '../workspace/storageValidation'
import type { FleetDecision, FleetEvent, SwapEvidenceReview } from './releaseLedger'
import type { FlightCollection, FlightRecord, MaintenanceCondition } from './flightCollection'

const review = object<SwapEvidenceReview>({
  id: nonEmptyText, flightId: nonEmptyText, assignee: text, requestedBy: text,
  sourceMaintenanceRevision: nonNegativeInteger, status: oneOf('open', 'stale', 'completed', 'superseded'),
  supersedesId: optional(text), decisionReason: optional(text),
})
const event = object<FleetEvent>({
  revision: nonNegativeInteger,
  action: oneOf('release', 'swap-adopted', 'release-reopened', 'inspection-superseded', 'swap-revalidated', 'swap-review-requested', 'swap-review-reassigned'),
  source: text, reason: text, actor: optional(text),
})
const decision = object<FleetDecision>({
  revision: nonNegativeInteger, flightId: nonEmptyText, releaseAt: nullable(text), swapHours: nullable(finiteNumber),
  maintenanceRevision: nonNegativeInteger, swapEvidenceRevision: nullable(nonNegativeInteger), inspectionOwner: nullable(text),
  swapReviews: optional(uniqueBy(array(review), 'id')), history: array(event),
})
const flight = object<FlightRecord>({
  id: nonEmptyText, tail: nonEmptyText, family: nonEmptyText, conditionId: nonEmptyText,
  critical: booleanValue, decision, archived: booleanValue,
})
const condition = object<MaintenanceCondition>({ id: nonEmptyText, revision: nonNegativeInteger, active: booleanValue, flightIds: array(nonEmptyText) })
const audit = object<FlightCollection['audit'][number]>({ action: text, id: text, related: array(text) })

// Structural integrity is separate from dispatch readiness: stale and blocked work is valid data.
export const flightCollectionRule = refine(object<FlightCollection>({
  flights: uniqueBy(array(flight), 'id'), conditions: uniqueBy(array(condition), 'id'), audit: array(audit),
}), value => {
  const memberships = new Map<string, string>()
  for (const item of value.conditions) {
    for (const id of item.flightIds) {
      if (memberships.has(id)) return false
      memberships.set(id, item.id)
    }
  }
  return memberships.size === value.flights.length && value.flights.every(item => memberships.get(item.id) === item.conditionId)
}, 'maintenance memberships must match flight references exactly')
