import type { StoragePort, StorageReader } from '../platform/storage-port'
import { fleetKey, initialFleetDecision, readFleetDecision, requestSwapReview, transitionFleet, swapStaleReasons } from './releaseLedger'
import { readStored, writeStored } from '../workspace/storageValidation'
import { flightCollectionRule } from './collectionValidation'
import type { FleetDecision } from './releaseLedger'
import { claimFlightReview, flightReviewInbox } from './engineerWorkload'
import type { FlightWorkRecord } from './engineerWorkload'

export interface FlightRecord { id: string; tail: string; family: string; conditionId: string; critical: boolean; decision: FleetDecision; archived: boolean }
export interface MaintenanceCondition { id: string; revision: number; active: boolean; flightIds: readonly string[] }
export interface FlightCollection { flights: readonly FlightRecord[]; conditions: readonly MaintenanceCondition[]; audit: readonly { action: string; id: string; related: readonly string[] }[] }
export interface FlightBatch { collection: FlightCollection; updated: string[]; skipped: string[]; blocked: { id: string; reason: string }[] }
const key = 'aerofleet:flight-collection:v1'

function prepared(id: string, stale: boolean): FleetDecision {
  let decision: FleetDecision = { ...initialFleetDecision, flightId: id }
  decision = transitionFleet(decision, { type: 'release', flightId: id, at: '2026-09-16T10:00:00Z', signed: true, reason: 'Signed aircraft maintenance release.' })
  decision = transitionFleet(decision, { type: 'adopt-swap', hours: 2 })
  if (stale) {
    decision = transitionFleet(decision, { type: 'supersede-inspection', reason: 'Updated inspection evidence received.', actor: 'maintenance controller' })
    decision = requestSwapReview(decision, 'maintenance controller')
  }
  return decision
}
export function seedFlightCollection(legacy: FleetDecision = initialFleetDecision): FlightCollection {
  return { flights: [
    { id: 'AX417', tail: 'N742AX', family: 'A320', conditionId: 'MC-42', critical: true, decision: legacy, archived: false },
    { id: 'AX418', tail: 'N742AX', family: 'A320', conditionId: 'MC-42', critical: true, decision: prepared('AX418', true), archived: false },
    { id: 'AX419', tail: 'N742AX', family: 'A320', conditionId: 'MC-42', critical: false, decision: prepared('AX419', true), archived: false },
    { id: 'BX210', tail: 'N811QX', family: 'B737', conditionId: 'MC-77', critical: false, decision: prepared('BX210', true), archived: false },
    { id: 'BX211', tail: 'N811QX', family: 'B737', conditionId: 'MC-77', critical: false, decision: prepared('BX211', false), archived: false },
    { id: 'AX400', tail: 'N742AX', family: 'A320', conditionId: 'MC-42', critical: false, decision: prepared('AX400', false), archived: true },
  ], conditions: [
    { id: 'MC-42', revision: 1, active: false, flightIds: ['AX417', 'AX418', 'AX419', 'AX400'] },
    { id: 'MC-77', revision: 1, active: false, flightIds: ['BX210', 'BX211'] },
  ], audit: [] }
}
export function readFlightCollection(storage: StorageReader): FlightCollection {
  return readStored(storage, key, flightCollectionRule, () => seedFlightCollection(readFleetDecision(storage)), fleetKey)
}
export function saveFlightCollection(storage: StoragePort, value: FlightCollection): FlightCollection {
  return writeStored(storage, key, flightCollectionRule, value)
}
export function flightById(value: FlightCollection, id: string): FlightRecord {
  const record = value.flights.find(item => item.id === id)
  if (!record) throw new Error(`Flight ${id} was not found.`)
  return record
}
export function flightRows(value: FlightCollection, query = '', filter = 'active'): FlightRecord[] {
  const needle = query.trim().toLowerCase()
  return value.flights.filter(item => (filter === 'all' || (filter === 'archived') === item.archived) &&
    (!needle || [item.id, item.tail, item.family, item.conditionId].some(field => field.toLowerCase().includes(needle))))
    .toSorted((a, b) => a.id.localeCompare(b.id))
}
export function flightInbox(value: FlightCollection) {
  return flightReviewInbox(value.flights.filter(item => !item.archived).map(item => ({
    flightId: item.id, family: item.family, critical: item.critical, decision: item.decision,
  })))
}
export function claimSelectedFlight(value: FlightCollection, id: string, engineerId: string, expectedRevision: number): FlightCollection {
  const record = flightById(value, id)
  if (record.archived) throw new Error('Archived flight cannot receive a review claim.')
  const records: FlightWorkRecord[] = value.flights.filter(item => !item.archived).map(item => ({
    flightId: item.id, family: item.family, critical: item.critical, decision: item.decision,
  }))
  const decision = claimFlightReview({ flightId: id, family: record.family, critical: record.critical, decision: record.decision },
    engineerId, records, expectedRevision)
  return { ...value, flights: value.flights.map(item => item.id === id ? { ...item, decision } : item),
    audit: [...value.audit, { action: 'review-claimed', id, related: [engineerId] }] }
}
export function reviseCondition(value: FlightCollection, conditionId: string, expectedRevision: number): FlightBatch {
  const condition = value.conditions.find(item => item.id === conditionId)
  if (condition?.revision !== expectedRevision) throw new Error('Maintenance condition revision changed.')
  const updated: string[] = []; const skipped: string[] = []; const blocked: FlightBatch['blocked'] = []
  const flights = value.flights.map(item => {
    if (!condition.flightIds.includes(item.id) || item.archived) { skipped.push(item.id); return item }
    try {
      const decision = transitionFleet(item.decision, { type: 'supersede-inspection',
        reason: 'Shared maintenance condition evidence updated.', actor: 'maintenance controller' })
      updated.push(item.id); return { ...item, decision }
    } catch (error) { blocked.push({ id: item.id, reason: error instanceof Error ? error.message : 'Inspection update blocked.' }); return item }
  })
  return { collection: { ...value, flights, conditions: value.conditions.map(item => item.id === conditionId ?
    { ...item, revision: item.revision + 1, active: true } : item),
    audit: [...value.audit, { action: 'condition-revised', id: conditionId, related: updated }] }, updated, skipped, blocked }
}
export function revalidateFlights(value: FlightCollection, ids: readonly string[], engineerId: string): FlightBatch {
  const updated: string[] = []; const skipped: string[] = []; const blocked: FlightBatch['blocked'] = []
  const unique = new Set(ids)
  const flights = value.flights.map(item => {
    if (!unique.has(item.id)) return item
    if (item.archived || !swapStaleReasons(item.decision).length) { skipped.push(item.id); return item }
    try {
      const decision = transitionFleet(item.decision, { type: 'revalidate-swap', actor: 'release engineer',
        reviewerIdentity: engineerId, reason: 'Independent inspection evidence accepted.' })
      updated.push(item.id); return { ...item, decision }
    } catch (error) { blocked.push({ id: item.id, reason: error instanceof Error ? error.message : 'Review blocked.' }); return item }
  })
  for (const id of unique) if (!value.flights.some(item => item.id === id)) blocked.push({ id, reason: 'Flight not found.' })
  return { collection: { ...value, flights, audit: [...value.audit, { action: 'batch-revalidated', id: engineerId, related: updated }] }, updated, skipped, blocked }
}
export function createFlight(value: FlightCollection, id: string, conditionId: string): FlightCollection {
  if (!/^\w{2}\d{3}$/.test(id) || value.flights.some(item => item.id === id)) throw new Error('Enter a unique flight ID.')
  const condition = value.conditions.find(item => item.id === conditionId)
  if (!condition) throw new Error('Maintenance condition not found.')
  const record: FlightRecord = { id, tail: conditionId === 'MC-42' ? 'N742AX' : 'N811QX',
    family: conditionId === 'MC-42' ? 'A320' : 'B737', conditionId, critical: false,
    decision: { ...initialFleetDecision, flightId: id }, archived: false }
  return { ...value, flights: [...value.flights, record], conditions: value.conditions.map(item => item.id === conditionId ?
    { ...item, flightIds: [...item.flightIds, id] } : item), audit: [...value.audit, { action: 'flight-created', id, related: [conditionId] }] }
}
export function archiveFlight(value: FlightCollection, id: string): FlightCollection {
  const record = flightById(value, id)
  if (record.archived || (record.decision.swapReviews ?? []).some(item => item.status === 'open'))
    throw new Error('Resolve open review before archiving flight.')
  return { ...value, flights: value.flights.map(item => item.id === id ? { ...item, archived: true } : item),
    audit: [...value.audit, { action: 'flight-archived', id, related: [] }] }
}
