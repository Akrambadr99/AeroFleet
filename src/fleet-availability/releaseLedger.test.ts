import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../data/memory-storage'
import { commitFleet, fleetBlockers, readFleetDecision, transitionFleet } from './releaseLedger'

describe('durable fleet release and swap dependency', () => {
  it('persists release evidence across repository reads', () => {
    const storage = new MemoryStorage()
    expect(fleetBlockers(readFleetDecision(storage))).toHaveLength(1)
    const released = commitFleet(storage, { type: 'release', flightId: 'AX417', at: '2026-09-16T15:00', signed: true, reason: 'Engineering inspection signed.' })
    expect(readFleetDecision(storage)).toEqual(released)
    expect(fleetBlockers(released)).toEqual([])
  })
  it('blocks adoption before release and reopening after adoption', () => {
    const storage = new MemoryStorage()
    expect(() => commitFleet(storage, { type: 'adopt-swap', hours: 5 })).toThrow(/Return-to-service/)
    commitFleet(storage, { type: 'release', flightId: 'AX417', at: '2026-09-16T15:00', signed: true, reason: 'Engineering inspection signed.' })
    const adopted = commitFleet(storage, { type: 'adopt-swap', hours: 5 })
    expect(adopted.history.map(item => item.source)).toEqual(['availability-timeline', 'swap-impact'])
    expect(() => commitFleet(storage, { type: 'reopen-release', reason: 'New inspection finding recorded.' })).toThrow(/depends/)
  })
  it('allows a reasoned reopening before a downstream dependency', () => {
    const released = transitionFleet(readFleetDecision(new MemoryStorage()), { type: 'release', flightId: 'AX417', at: '2026-09-16T15:00', signed: true, reason: 'Engineering inspection signed.' })
    expect(transitionFleet(released, { type: 'reopen-release', reason: 'New inspection finding recorded.' }).releaseAt).toBeNull()
  })
})
