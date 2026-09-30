import { describe, expect, it } from 'vitest'
import { DEFAULT_COLLECTION_VIEW, projectCollection } from '../workspace/collectionExplorer'
import { claimSelectedFlight, seedFlightCollection } from './flightCollection'
import { flightExplorerPolicy, flightWorkState } from './collectionTriage'

describe('flight triage', () => {
  it('distinguishes pending release, unclaimed inspection, and current swap evidence', () => {
    const records = seedFlightCollection().flights
    expect(flightWorkState(records.find(item => item.id === 'AX417')!)).toBe('release-pending')
    expect(flightWorkState(records.find(item => item.id === 'AX418')!)).toBe('review-unclaimed')
    expect(flightWorkState(records.find(item => item.id === 'BX211')!)).toBe('swap-current')
  })
  it('recalculates ownership after a real qualified claim', () => {
    const initial = seedFlightCollection(), flight = initial.flights.find(item => item.id === 'AX418')!
    const next = claimSelectedFlight(initial, flight.id, 'eng-lee', flight.decision.revision)
    expect(flightWorkState(next.flights.find(item => item.id === flight.id)!)).toBe('review-assigned')
    expect(flightWorkState(flight)).toBe('review-unclaimed')
  })
  it('searches aircraft metadata without broadening the lifecycle scope', () => {
    const result = projectCollection(seedFlightCollection().flights, { ...DEFAULT_COLLECTION_VIEW, query: 'a320', state: 'swap-current' }, flightExplorerPolicy)
    expect(result.rows).toEqual([])
    const archived = projectCollection(seedFlightCollection().flights, { ...DEFAULT_COLLECTION_VIEW, scope: 'archived', query: 'MC-42' }, flightExplorerPolicy)
    expect(archived.rows.map(item => item.id)).toEqual(['AX400'])
  })
  it('does not label a review with outdated source evidence as current ownership', () => {
    const flight = seedFlightCollection().flights.find(item => item.id === 'AX418')!
    expect(flightWorkState({ ...flight, decision: { ...flight.decision, maintenanceRevision: flight.decision.maintenanceRevision + 1 } })).toBe('review-stale')
  })
})
