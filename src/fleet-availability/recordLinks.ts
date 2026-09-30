import type { FlightCollection } from './flightCollection'

type Record = FlightCollection['flights'][number]
function selected(path: string, id: string) { return path + (path.includes('?') ? '&' : '?') + 'record=' + encodeURIComponent(id) }
export function recordDetailPath(record: Record) { return selected('/fleet/' + record.tail + '/availability', record.id) }
export function recordDecisionPath(record: Record) { return selected('/fleet/' + record.tail + '/swaps/N811QX?hours=2', record.id) }
