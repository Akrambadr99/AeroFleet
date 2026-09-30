import type { ExplorerPolicy } from '../workspace/collectionExplorer'
import type { FlightRecord } from './flightCollection'
import { swapStaleReasons } from './releaseLedger'

export function flightWorkState(record: FlightRecord): string {
  const decision = record.decision
  if (!decision.releaseAt) return 'release-pending'
  const review = decision.swapReviews?.find(item => item.status === 'open')
  if (review && review.sourceMaintenanceRevision !== decision.maintenanceRevision) return 'review-stale'
  if (swapStaleReasons(decision).length) {
    if (review) return review.assignee === 'release engineer' ? 'review-unclaimed' : 'review-assigned'
    return 'inspection-stale'
  }
  return decision.swapHours === null ? 'released' : 'swap-current'
}
export const flightExplorerPolicy: ExplorerPolicy<FlightRecord> = {
  searchText: record => [record.id, record.tail, record.family, record.conditionId, record.critical ? 'critical' : 'routine'].join(' '),
  revision: record => record.decision.revision,
  state: flightWorkState,
  states: [
    { value: 'release-pending', label: 'Release pending' },
    { value: 'review-unclaimed', label: 'Inspection review unclaimed' },
    { value: 'review-assigned', label: 'Inspection review assigned' },
    { value: 'review-stale', label: 'Review evidence outdated' },
    { value: 'inspection-stale', label: 'Inspection revalidation needed' },
    { value: 'released', label: 'Released; swap not adopted' },
    { value: 'swap-current', label: 'Swap evidence current' },
  ],
}
