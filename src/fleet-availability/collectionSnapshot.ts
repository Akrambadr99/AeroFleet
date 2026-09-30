import type { SnapshotAdapter } from '../workspace/collectionSnapshot'
import { readFlightCollection, type FlightCollection } from './flightCollection'
import { flightCollectionRule } from './collectionValidation'

/** Only this primary collection is included; other browser-local workflows remain separate. */
export const collectionSnapshotAdapter: SnapshotAdapter<FlightCollection> = {
  product: 'AeroFleet',
  scope: 'flight-collection',
  label: 'Flight release collection',
  read: readFlightCollection,
  validate: flightCollectionRule,
  groups: collection => [
    { key: 'flights', label: 'Flights', records: collection.flights.map(record => ({
      id: record.id, label: `${record.tail} · ${record.family}${record.archived ? ' · Archived' : ''}`, value: record,
    })) },
    { key: 'conditions', label: 'Maintenance conditions', records: collection.conditions.map(record => ({
      id: record.id, label: record.id, value: record,
    })) },
  ],
}
