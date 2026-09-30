import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../workspace/repository'
import { saveCurrentCollection } from '../workspace/recordStorage'
import { openSelectedRecord } from './selectedRecord'
import { readFlightCollection, saveFlightCollection } from './flightCollection'
import { readFleetDecision, saveFleetDecision, transitionFleet } from './releaseLedger'

class MemoryStorage implements StoragePort {
  data = new Map<string, string>()
  fail = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, raw: string) { if (this.fail) throw new Error('Storage full'); this.data.set(key, raw) }
}
const edit = (state: ReturnType<typeof readFleetDecision>) => transitionFleet(state, { type: 'release', flightId: 'AX417', at: '2026-09-16T15:00', signed: true, reason: 'Independent release evidence verified.' })
const key = 'aerofleet:flight-release:v1'
describe('selected flight persistence', () => {
  it('preserves the primary migration source when a secondary record opens first', () => {
    const storage = new MemoryStorage()
    const before = readFlightCollection(storage)
    const peer = before.flights[1]
    if (!peer) throw new Error('Secondary fixture missing')
    const bound = openSelectedRecord(storage, peer.id)
    expect(readFlightCollection(bound)).toEqual(before)
    expect(storage.data.size).toBe(0)
  })
  it('rejects a release that changes the selected flight identity', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const changed = { ...edit(readFleetDecision(bound)), flightId: 'AX490' }
    expect(() => saveFleetDecision(bound, changed)).toThrow('identity')
    expect(storage.data.size).toBe(0)
  })
  it('imports legacy history once and preserves its backup', () => {
    const storage = new MemoryStorage()
    const legacy = edit(readFleetDecision(storage))
    saveFleetDecision(storage, legacy)
    const backup = storage.getItem(key)
    const bound = openSelectedRecord(storage)
    expect(readFleetDecision(bound)).toEqual(legacy)
    saveFleetDecision(bound, legacy)
    expect(readFlightCollection(storage).flights[0]?.decision).toEqual(legacy)
    expect(storage.getItem(key)).toBe(backup)
    saveFleetDecision(storage, readFleetDecision(new MemoryStorage()))
    expect(readFleetDecision(openSelectedRecord(storage))).toEqual(legacy)
  })
  it('saves detail changes in the collection and reloads them without changing peers', () => {
    const storage = new MemoryStorage()
    const before = readFlightCollection(storage)
    const bound = openSelectedRecord(storage)
    const changed = edit(readFleetDecision(bound))
    saveFleetDecision(bound, changed)
    const after = readFlightCollection(storage)
    expect(after.flights[0]?.decision).toEqual(changed)
    expect(after.flights.slice(1)).toEqual(before.flights.slice(1))
    expect(readFleetDecision(openSelectedRecord(storage))).toEqual(changed)
    expect(after.audit.at(-1)).toMatchObject({ action: 'detail-updated', id: 'AX417' })
  })
  it('rejects a stale detail snapshot and preserves the newer decision', () => {
    const storage = new MemoryStorage()
    const first = openSelectedRecord(storage), stale = openSelectedRecord(storage)
    const changed = edit(readFleetDecision(first))
    saveFleetDecision(first, changed)
    expect(() => saveFleetDecision(stale, edit(readFleetDecision(stale)))).toThrow('changed in another view')
    expect(readFleetDecision(openSelectedRecord(storage))).toEqual(changed)
  })
  it('merges a selected edit with an unrelated record update', () => {
    const storage = new MemoryStorage()
    const bound = openSelectedRecord(storage)
    const before = readFlightCollection(storage)
    const peer = before.flights[1]
    if (!peer) throw new Error('Peer fixture missing')
    const newer = { ...before, flights: before.flights.map(item => item.id === peer.id ? { ...item, critical: !item.critical } : item) }
    saveFlightCollection(storage, newer)
    saveFleetDecision(bound, edit(readFleetDecision(bound)))
    expect(readFlightCollection(storage).flights[1]).toEqual(newer.flights[1])
  })
  it('rejects missing and archived records without writing', () => {
    const storage = new MemoryStorage()
    expect(() => openSelectedRecord(storage, 'missing')).toThrow('not found')
    expect(() => openSelectedRecord(storage, 'AX400')).toThrow('archived')
    expect(storage.data.size).toBe(0)
  })
  it('keeps the snapshot retryable when storage rejects a save', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const changed = edit(readFleetDecision(bound))
    storage.fail = true
    expect(() => saveFleetDecision(bound, changed)).toThrow('Storage full')
    storage.fail = false
    saveFleetDecision(bound, changed)
    expect(readFleetDecision(openSelectedRecord(storage))).toEqual(changed)
  })
  it('rejects a stale whole-workspace save after a detail edit', () => {
    const storage = new MemoryStorage()
    const stale = readFlightCollection(storage)
    const bound = openSelectedRecord(storage)
    saveFleetDecision(bound, edit(readFleetDecision(bound)))
    expect(() => saveCurrentCollection(storage, stale, stale, readFlightCollection, saveFlightCollection)).toThrow('Workspace changed')
    expect(readFlightCollection(storage).flights[0]?.decision.releaseAt).not.toBeNull()
  })
})
