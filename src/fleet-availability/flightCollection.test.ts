import { describe, expect, it } from 'vitest'
import { archiveFlight, claimSelectedFlight, createFlight, flightById, flightInbox, readFlightCollection,
  revalidateFlights, reviseCondition, saveFlightCollection, seedFlightCollection } from './flightCollection'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
describe('persisted flight release collection', () => {
  it('holds distinct decisions and a real critical-first review queue', () => {
    const state = seedFlightCollection()
    expect(state.flights).toHaveLength(6)
    expect(flightInbox(state).map(item => item.flightId)).toEqual(['AX418', 'AX419', 'BX210'])
  })
  it('claims only the selected qualified flight and survives storage reload', () => {
    const port = storage(); const state = seedFlightCollection()
    const next = claimSelectedFlight(state, 'AX418', 'eng-lee', flightById(state, 'AX418').decision.revision)
    saveFlightCollection(port, next)
    expect(flightInbox(readFlightCollection(port)).find(item => item.flightId === 'AX418')?.assigneeId).toBe('eng-lee')
    expect(flightInbox(readFlightCollection(port)).find(item => item.flightId === 'AX419')?.assigneeId).toBeNull()
    expect(() => claimSelectedFlight(next, 'AX419', 'eng-theo', flightById(next, 'AX419').decision.revision)).toThrow('unavailable')
  })
  it('fans maintenance revision only to linked active flights with per-record outcomes', () => {
    const state = seedFlightCollection()
    const next = reviseCondition(state, 'MC-42', 1)
    expect(next.updated).toEqual(['AX418', 'AX419'])
    expect(next.blocked.map(item => item.id)).toEqual(['AX417'])
    expect(next.collection.flights.find(item => item.id === 'BX210')?.decision.revision).toBe(flightById(state, 'BX210').decision.revision)
    expect(next.collection.flights.find(item => item.id === 'AX418')?.decision.swapReviews?.at(-1)?.status).toBe('stale')
    expect(() => reviseCondition(next.collection, 'MC-42', 1)).toThrow('revision changed')
  })
  it('returns partial selected revalidation and preserves archive constraints', () => {
    const state = seedFlightCollection()
    const claimed = claimSelectedFlight(state, 'AX418', 'eng-lee', flightById(state, 'AX418').decision.revision)
    const result = revalidateFlights(claimed, ['AX418', 'AX419', 'BX211', 'missing'], 'eng-lee')
    expect(result.updated).toEqual(['AX418'])
    expect(result.skipped).toEqual(['BX211'])
    expect(result.blocked.map(item => item.id)).toEqual(['AX419', 'missing'])
    expect(() => archiveFlight(state, 'AX419')).toThrow('open review')
    const created = createFlight(state, 'AX420', 'MC-42')
    expect(created.conditions.find(item => item.id === 'MC-42')?.flightIds).toContain('AX420')
    expect(archiveFlight(created, 'AX420').flights.find(item => item.id === 'AX420')?.archived).toBe(true)
  })
})
