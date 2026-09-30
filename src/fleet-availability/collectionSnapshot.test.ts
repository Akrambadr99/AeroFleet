import { describe, expect, it, vi } from 'vitest'
import { compareCollectionSnapshot, createCollectionSnapshot } from '../workspace/collectionSnapshot'
import { collectionSnapshotAdapter as adapter } from './collectionSnapshot'
import { createFlight, seedFlightCollection } from './flightCollection'

const key = 'aerofleet:flight-collection:v1'
const createdAt = '2026-09-30T12:00:00.000Z'
function storage(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  values.set('unrelated:workflow', 'preserve this value')
  return { values, getItem: (id: string) => values.get(id) ?? null,
    setItem: vi.fn((id: string, value: string) => { values.set(id, value) }) }
}
function snapshot(payload: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: 'collection-snapshot', version: 1, product: adapter.product,
    scope: adapter.scope, createdAt, payload, ...extra })
}

describe('AeroFleet primary collection snapshot adapter', () => {
  it('exports the complete primary collection, archived work and metadata without storage writes', () => {
    const collection = { ...seedFlightCollection(), sourceMetadata: { note: 'preserved evidence' } }
    const raw = JSON.stringify(collection); const port = storage(raw)
    expect(JSON.parse(createCollectionSnapshot(adapter, port, createdAt))).toEqual({
      format: 'collection-snapshot', version: 1, product: 'AeroFleet', scope: 'flight-collection', createdAt, payload: collection,
    })
    expect(collection.flights.some(record => record.archived)).toBe(true)
    expect(port.values.get(key)).toBe(raw)
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reviews a seeded collection without materializing new saved data', () => {
    const port = storage()
    const result = compareCollectionSnapshot(createCollectionSnapshot(adapter, port, createdAt), adapter, port)
    expect(result.payloadChanged).toBe(false)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.values.has(key)).toBe(false)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('includes independently keyed parent records rather than only the operational rows', () => {
    const groups = adapter.groups(seedFlightCollection())
    expect(groups.map(group => group.key)).toEqual(['flights', 'conditions'])
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('MC-42')
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('AX418')
  })

  it('detects nested history changes even when the operational revision is unchanged', () => {
    const seed = seedFlightCollection()
    const candidate = { ...seed, flights: seed.flights.map(record => record.id === 'AX418' ? {
      ...record, decision: { ...record.decision, history: record.decision.history.map((event, index) =>
        index === 0 ? { ...event, reason: 'Updated supporting evidence' } : event) },
    } : record) }
    const port = storage(JSON.stringify(seed))
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.rows.find(row => row.id === 'AX418')?.status).toBe('changed')
    expect(result.rows.filter(row => row.status === 'changed')).toHaveLength(1)
    expect(result.payloadChanged).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('detects parent-only changes and additions with unchanged surrounding records', () => {
    const seed = seedFlightCollection(); const port = storage(JSON.stringify(seed))
    const parentOnly = { ...seed, conditions: seed.conditions.map(record => record.id === 'MC-42' ?
      { ...record, revision: record.revision + 1 } : record) }
    expect(compareCollectionSnapshot(snapshot(parentOnly), adapter, port).rows.find(row => row.id === 'MC-42')?.status).toBe('changed')
    const added = compareCollectionSnapshot(snapshot(createFlight(seed, 'AX420', 'MC-42')), adapter, port)
    expect(added.rows.filter(row => row.status === 'added')).toHaveLength(1)
    expect(added.rows.filter(row => row.status === 'changed')).toHaveLength(1)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reports audit and collection metadata differences without inventing repeating audit row identities', () => {
    const seed = seedFlightCollection(); const port = storage(JSON.stringify(seed))
    const candidate = { ...seed, audit: [
      { action: 'review-note', id: 'AX418', related: [] }, { action: 'review-note', id: 'AX418', related: [] },
    ], sourceMetadata: { reviewed: true } }
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.payloadChanged).toBe(true)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects malformed nested data, duplicate identities and broken parent membership without writes', () => {
    const seed = seedFlightCollection(); const raw = JSON.stringify(seed); const port = storage(raw)
    for (const candidate of [{ ...seed, flights: [null] }, { ...seed, flights: [...seed.flights, seed.flights[0]] }, { ...seed, conditions: seed.conditions.map(record => ({ ...record, flightIds: [] })) }]) {
      expect(() => compareCollectionSnapshot(snapshot(candidate), adapter, port)).toThrow()
    }
    expect(port.values.get(key)).toBe(raw)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects other products, scopes, versions and truncated text without writes', () => {
    const seed = seedFlightCollection(); const port = storage(JSON.stringify(seed))
    for (const raw of [snapshot(seed, { product: 'DifferentProduct' }), snapshot(seed, { scope: 'unrelated' }),
      snapshot(seed, { version: 99 }), '{private truncated JSON']) {
      expect(() => compareCollectionSnapshot(raw, adapter, port)).toThrow()
    }
    expect(port.setItem).not.toHaveBeenCalled()
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
  })

  it('does not turn corrupt current storage into an apparently valid empty export', () => {
    const port = storage('{private damaged current collection')
    expect(() => createCollectionSnapshot(adapter, port, createdAt)).toThrow()
    expect(port.values.get(key)).toBe('{private damaged current collection')
    expect(port.setItem).not.toHaveBeenCalled()
  })
})
