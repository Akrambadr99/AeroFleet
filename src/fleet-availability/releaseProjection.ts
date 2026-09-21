export interface FlightLeg {
  id: string
  tail: string
  departure: string
  arrival: string
}

export interface MaintenanceEvent {
  id: string
  tail: string
  startsAt: string
  endsAt: string
  kind: 'grounding' | 'inspection' | 'hangar' | 'release'
  signed: boolean
}

export interface ReleaseFinding {
  code: 'GROUNDING' | 'OVERLAP' | 'UNSIGNED_INSPECTION' | 'RELEASE_AFTER_DEPARTURE'
  message: string
  eventId: string
}

export const flightLegs: readonly FlightLeg[] = [
  { id: 'AX417', tail: 'N742AX', departure: '2026-09-16T15:40', arrival: '2026-09-16T18:10' },
  { id: 'AX490', tail: 'N742AX', departure: '2026-09-17T08:00', arrival: '2026-09-17T10:50' },
  { id: 'AX122', tail: 'N811QX', departure: '2026-09-16T16:15', arrival: '2026-09-16T19:20' },
]

export const maintenanceEvents: readonly MaintenanceEvent[] = [
  { id: 'GRD-204', tail: 'N742AX', startsAt: '2026-09-16T09:00', endsAt: '2026-09-16T14:30', kind: 'grounding', signed: true },
  { id: 'INSP-204', tail: 'N742AX', startsAt: '2026-09-16T11:00', endsAt: '2026-09-16T13:20', kind: 'inspection', signed: false },
  { id: 'H2-204', tail: 'N742AX', startsAt: '2026-09-16T13:20', endsAt: '2026-09-16T14:30', kind: 'hangar', signed: true },
  { id: 'RTS-204', tail: 'N742AX', startsAt: '2026-09-16T15:00', endsAt: '2026-09-16T15:00', kind: 'release', signed: false },
]

export function releaseFindings(
  flight: FlightLeg,
  events: readonly MaintenanceEvent[],
  proposedRelease: string,
): ReleaseFinding[] {
  const findings: ReleaseFinding[] = []
  for (const event of events.filter(item => item.tail === flight.tail)) {
    if (event.kind === 'grounding' && event.startsAt <= flight.departure && event.endsAt > proposedRelease) {
      findings.push({ code: 'GROUNDING', eventId: event.id, message: 'Grounding remains active at the proposed release.' })
    }
    if (event.kind === 'inspection' && !event.signed && event.endsAt <= flight.departure) {
      findings.push({ code: 'UNSIGNED_INSPECTION', eventId: event.id, message: 'Inspection requires an engineering signature.' })
    }
    if (event.kind !== 'release' && event.startsAt < flight.arrival && event.endsAt > flight.departure) {
      findings.push({ code: 'OVERLAP', eventId: event.id, message: 'Maintenance overlaps the assigned flight.' })
    }
  }
  if (proposedRelease >= flight.departure) {
    findings.push({ code: 'RELEASE_AFTER_DEPARTURE', eventId: flight.id, message: 'Release must precede departure.' })
  }
  return findings
}

export function earliestDispatchable(
  flight: FlightLeg,
  events: readonly MaintenanceEvent[],
): string {
  const blockingEnd = events
    .filter(event => event.tail === flight.tail && event.kind !== 'release')
    .reduce((latest, event) => event.endsAt > latest ? event.endsAt : latest, '')
  return blockingEnd
}
