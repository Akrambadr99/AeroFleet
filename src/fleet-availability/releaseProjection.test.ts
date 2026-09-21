import { describe, expect, it } from 'vitest'
import { earliestDispatchable, flightLegs, maintenanceEvents, releaseFindings } from './releaseProjection'

describe('aircraft release projection', () => {
  const flight = flightLegs[0]!
  it('finds an unsigned inspection without confusing the completed grounding with an active hold', () => {
    expect(releaseFindings(flight, maintenanceEvents, '2026-09-16T15:00').map(item => item.code))
      .toEqual(['UNSIGNED_INSPECTION'])
  })
  it('rejects a release after departure', () => {
    expect(releaseFindings(flight, maintenanceEvents, '2026-09-16T16:00').map(item => item.code))
      .toContain('RELEASE_AFTER_DEPARTURE')
  })
  it('excludes other tails and accepts signed evidence', () => {
    const signed = maintenanceEvents.map(item => item.id === 'INSP-204' ? { ...item, signed: true } : item)
    expect(releaseFindings(flight, signed, '2026-09-16T15:00')).toEqual([])
  })
  it('identifies the last blocking maintenance end', () => {
    expect(earliestDispatchable(flight, maintenanceEvents)).toBe('2026-09-16T14:30')
  })
})
