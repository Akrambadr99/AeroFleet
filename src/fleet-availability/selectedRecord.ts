import type { StoragePort } from '../platform/storage-port'
import { bindRecord } from '../workspace/recordStorage'
import { readFlightCollection, saveFlightCollection } from './flightCollection'
import { readFleetDecision } from './releaseLedger'

export function openSelectedRecord(storage: StoragePort, id = 'AX417') {
  return bindRecord(storage, id, {
    key: 'aerofleet:flight-release:v1',
    collectionKey: 'aerofleet:flight-collection:v1',
    read: readFlightCollection, save: saveFlightCollection,
    find: (collection, target) => collection.flights.find(item => item.id === target),
    value: record => record.decision, archived: record => record.archived,
    replace: (collection, target, raw) => {
      const value = readFleetDecision({ getItem: () => raw })
      if (value.flightId !== target) throw new Error('Flight identity does not match the selected record.')
      return { ...collection, flights: collection.flights.map(item => item.id === target ? { ...item, decision: value } : item),
        audit: [...collection.audit, { action: 'detail-updated', id: target, related: [] }] }
    },
  })
}
