import { describe, expect, it, vi } from 'vitest'
import { readFlightCollection, saveFlightCollection, seedFlightCollection } from './flightCollection'
import type { FlightCollection } from './flightCollection'
import { fleetKey, initialFleetDecision } from './releaseLedger'
import { StoredDataError } from '../workspace/storageValidation'

const key = 'aerofleet:flight-collection:v1'
function memory(raw: string | null, legacy: string | null = null) {
  const entries = new Map<string, string>()
  if (raw !== null) entries.set(key, raw)
  if (legacy !== null) entries.set(fleetKey, legacy)
  return { getItem: (id: string) => entries.get(id) ?? null, setItem: vi.fn((id: string, value: string) => { entries.set(id, value) }) }
}
describe('flight collection storage integrity', () => {
  it('round-trips all seeded current, stale, pending and archived flights without changing data', () => {
    const value = seedFlightCollection(); const storage = memory(null)
    expect(readFlightCollection(storage)).toEqual(value)
    expect(storage.setItem).not.toHaveBeenCalled()
    saveFlightCollection(storage, value)
    expect(readFlightCollection(storage)).toEqual(value)
  })
  it.each(['', '{bad', 'null'])('preserves corrupt primary text %s without falling back to legacy', raw => {
    const legacy = JSON.stringify(initialFleetDecision); const storage = memory(raw, legacy)
    expect(() => readFlightCollection(storage)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(raw); expect(storage.getItem(fleetKey)).toBe(legacy)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it.each([
    { flights: [null] },
    { flights: [{ ...seedFlightCollection().flights[0], decision: null }] },
    { flights: [{ ...seedFlightCollection().flights[0], archived: 'false' }] },
    { flights: [{ ...seedFlightCollection().flights[0], decision: { ...initialFleetDecision, revision: -1 } }] },
    { flights: [{ ...seedFlightCollection().flights[0], decision: { ...initialFleetDecision, history: [null] } }] },
    { flights: [{ ...seedFlightCollection().flights[0], decision: { ...initialFleetDecision, swapReviews: {} } }] },
    { flights: [{ ...seedFlightCollection().flights[0], decision: { ...initialFleetDecision, swapReviews: [{ ...seedFlightCollection().flights[1]!.decision.swapReviews![0], status: 'unknown' }] } }] },
    { conditions: [null] }, { audit: [{ action: 'update', id: 'A', related: null }] },
  ])('rejects malformed nested values on read and before write: %j', patch => {
    const value = { ...seedFlightCollection(), ...patch }; const raw = JSON.stringify(value)
    const storage = memory(raw)
    expect(() => readFlightCollection(storage)).toThrow(StoredDataError)
    expect(() => saveFlightCollection(storage, value as unknown as FlightCollection)).toThrow(StoredDataError)
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.getItem(key)).toBe(raw)
  })
  it('rejects duplicate flight and maintenance-condition identities', () => {
    const value = seedFlightCollection()
    expect(() => saveFlightCollection(memory(null), { ...value, flights: [...value.flights, value.flights[0]!] })).toThrow('duplicate identifiers')
    expect(() => saveFlightCollection(memory(null), { ...value, conditions: [...value.conditions, value.conditions[0]!] })).toThrow('duplicate identifiers')
  })
  it('rejects mismatched or unknown flight condition references before persistence', () => {
    const value = seedFlightCollection()
    for (const conditionId of ['MC-77', 'missing']) {
      const storage = memory(JSON.stringify(value))
      const changed = { ...value, flights: value.flights.map(item => item.id === 'AX418' ? { ...item, conditionId } : item) }
      expect(() => saveFlightCollection(storage, changed)).toThrow('maintenance memberships')
      expect(storage.setItem).not.toHaveBeenCalled()
    }
  })
  it('rejects duplicate, dangling or cross-condition fan-out memberships on read', () => {
    const value = seedFlightCollection()
    for (const id of ['AX418', 'BX210', 'missing']) {
      const changed = { ...value, conditions: value.conditions.map(item => item.id === 'MC-42' ? { ...item, flightIds: [...item.flightIds, id] } : item) }
      expect(() => readFlightCollection(memory(JSON.stringify(changed)))).toThrow('maintenance memberships')
    }
  })
  it('preserves optional historical fields and unknown metadata', () => {
    const legacy = { ...initialFleetDecision }
    delete legacy.swapReviews
    const value = { ...seedFlightCollection(legacy), metadata: { keep: true } }
    const storage = memory(JSON.stringify(value))
    expect(readFlightCollection(storage)).toEqual(value)
  })
  it('keeps supported legacy defaults and validates migrated history', () => {
    const old = { revision: 0, flightId: 'AX417', releaseAt: null, swapHours: null, history: [] }
    const storage = memory(null, JSON.stringify(old))
    expect(readFlightCollection(storage).flights[0]?.decision.maintenanceRevision).toBe(0)
    expect(storage.setItem).not.toHaveBeenCalled()
    const broken = memory(null, JSON.stringify({ ...old, history: [null] }))
    expect(() => readFlightCollection(broken)).toThrow(StoredDataError)
    expect(broken.setItem).not.toHaveBeenCalled()
  })
  it('points empty or unreadable legacy recovery at its own key', () => {
    for (const raw of ['', '{broken']) {
      try { readFlightCollection(memory(null, raw)); expect.fail('Expected recovery failure') }
      catch (error) { expect(error).toBeInstanceOf(StoredDataError); expect((error as StoredDataError).key).toBe(fleetKey) }
    }
  })
})
