import type { StoragePort } from '../workspace/repository'
import { readFlightCollection } from './flightCollection'

export function activeRecordWork(storage: StoragePort) {
  return readFlightCollection(storage).flights.filter(item => !item.archived).map(item => ({ flightId: item.id, family: item.family, critical: item.critical, decision: item.decision }))
}
export function selectedRecordWork(storage: StoragePort, id: string) {
  const record = activeRecordWork(storage).find(item => item.flightId === id)
  if (!record) throw new Error('Active record not found.')
  return record
}
