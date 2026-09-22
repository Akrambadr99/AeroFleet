import type { StoragePort } from '../workspace/repository'

export interface FleetEvent {
  revision: number
  action: 'release' | 'swap-adopted' | 'release-reopened'
  source: string
  reason: string
}
export interface FleetDecision {
  revision: number
  flightId: string
  releaseAt: string | null
  swapHours: number | null
  history: readonly FleetEvent[]
}
export type FleetAction =
  | { type: 'release'; flightId: string; at: string; signed: boolean; reason: string }
  | { type: 'adopt-swap'; hours: number }
  | { type: 'reopen-release'; reason: string }

export const fleetKey = 'aerofleet:flight-release:v1'
export const initialFleetDecision: FleetDecision = {
  revision: 0, flightId: 'AX417', releaseAt: null, swapHours: null, history: [],
}

export function readFleetDecision(storage: StoragePort): FleetDecision {
  const raw = storage.getItem(fleetKey)
  if (!raw) return initialFleetDecision
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('revision' in value) ||
    typeof value.revision !== 'number' || !('history' in value) || !Array.isArray(value.history) ||
    !('releaseAt' in value) || (value.releaseAt !== null && typeof value.releaseAt !== 'string') ||
    !('swapHours' in value) || (value.swapHours !== null && typeof value.swapHours !== 'number') ||
    !('flightId' in value) || typeof value.flightId !== 'string') throw new Error('Invalid fleet release record.')
  return value as FleetDecision
}

export function fleetBlockers(state: FleetDecision): string[] {
  return state.releaseAt ? [] : ['Return-to-service evidence must be recorded before a swap plan is adopted.']
}

export function transitionFleet(state: FleetDecision, action: FleetAction): FleetDecision {
  let next: FleetDecision
  switch (action.type) {
    case 'release':
      if (state.releaseAt) throw new Error('Release is already recorded.')
      if (!action.signed || action.reason.trim().length < 12) throw new Error('Signed evidence and a release rationale are required.')
      next = { ...state, flightId: action.flightId, releaseAt: action.at }
      break
    case 'adopt-swap':
      if (fleetBlockers(state).length) throw new Error(fleetBlockers(state)[0])
      if (!Number.isInteger(action.hours) || action.hours < 0 || action.hours > 6) throw new Error('Swap utilization is outside the feasible window.')
      if (state.swapHours !== null) throw new Error('A swap plan is already adopted.')
      next = { ...state, swapHours: action.hours }
      break
    case 'reopen-release':
      if (!state.releaseAt) throw new Error('There is no release to reopen.')
      if (state.swapHours !== null) throw new Error('The adopted swap plan depends on this release.')
      if (action.reason.trim().length < 12) throw new Error('Explain why the release is being reopened.')
      next = { ...state, releaseAt: null }
      break
  }
  const event: FleetEvent = {
    revision: state.revision + 1,
    action: action.type === 'adopt-swap' ? 'swap-adopted' : action.type === 'reopen-release' ? 'release-reopened' : 'release',
    source: action.type === 'adopt-swap' ? 'swap-impact' : 'availability-timeline',
    reason: action.type === 'adopt-swap' ? 'Adopted feasible swap at ' + String(action.hours) + ' hours' : action.reason,
  }
  return { ...next, revision: event.revision, history: [...state.history, event] }
}

export function commitFleet(storage: StoragePort, action: FleetAction): FleetDecision {
  const next = transitionFleet(readFleetDecision(storage), action)
  storage.setItem(fleetKey, JSON.stringify(next))
  return next
}
