import { SelectedRecordRoute } from './SelectedRecordRoute'
import { useRecordContext } from '../workspace/RecordScope'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { validateNote } from '../domain/workbench/domain'
import { useWorkbench } from '../state/useWorkbench'
import { commitFleet, readFleetDecision, swapStaleReasons } from './releaseLedger'
import {
  earliestDispatchable,
  flightLegs,
  maintenanceEvents,
  releaseFindings,
} from './releaseProjection'

function RecordContent() {
  const { storage, guard, recordId } = useRecordContext()

  const { tail } = useParams()
  const { state, dispatch } = useWorkbench()
  const flights = flightLegs.filter(flight => flight.tail === tail)
  const [flightId, setFlightId] = useState(recordId)
  const [releaseAt, setReleaseAt] = useState('2026-09-16T15:00')
  const [inspectionSigned, setInspectionSigned] = useState(false)
  const [notice, setNotice] = useState('')
  const [fleet, setFleet] = useState(() => readFleetDecision(storage))
  const flight = flights.find(item => item.id === flightId) ?? flights[0]
  const events = useMemo(() => maintenanceEvents.map(item =>
    item.id === 'INSP-204' ? { ...item, signed: inspectionSigned } : item,
  ), [inspectionSigned])
  const findings = flight ? releaseFindings(flight, events, releaseAt) : []
  const packet = state.items.find(item => item.id === 'AF-204')
  const noteError = validateNote(state.note)
  const canRelease = flight?.id === recordId && !fleet.releaseAt && findings.length === 0 &&
    state.role === 'approver' && !noteError

  function release() {
    if (!canRelease) {
      setNotice('Release blocked. Resolve findings, select approver authority, and explain the decision.')
      return
    }
    setFleet(commitFleet(storage, { type: 'release', flightId: flight.id, at: releaseAt, signed: inspectionSigned, reason: state.note }))
    dispatch({ type: 'submit-success', id: 'AF-204' })
    setNotice(`${flight.id} release recorded against packet AF-204.`)
  }

  function reopen() {
    try {
      setFleet(commitFleet(storage, { type: 'reopen-release', reason: state.note }))
      setNotice('Release reopened; downstream swap eligibility recalculated.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Reopening failed.') }
  }

  function supersedeInspection() {
    try {
      setFleet(commitFleet(storage, { type: 'supersede-inspection', reason: state.note }))
      setNotice('Inspection evidence revised; downstream swap must be revalidated.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Inspection revision failed.') }
  }

  return <div className="suite-page">
    <header className="suite-title">
      <div>
        <small>FLEET / RELEASE EVIDENCE</small>
        <h1>Aircraft availability timeline</h1>
        <p>{tail} · Review maintenance evidence before returning an aircraft to service.</p>
      </div>
    </header>
    {flight ? <>
      <section className="suite-card" aria-label="Flight and release context">
        <h2>Proposed release</h2>
        {flight.id !== recordId && <p role="alert">No schedule is configured for {recordId}. Existing evidence may be reviewed, but a new release requires this flight's own schedule.</p>}
        <label className="suite-field"><span className="suite-field-label">Flight assignment</span>
          <select value={flight.id} onChange={event => { setFlightId(event.target.value); }}>
            {flights.map(item => <option key={item.id} value={item.id}>{item.id} · {item.departure}</option>)}
          </select>
        </label>
        <label className="suite-field"><span className="suite-field-label">Release time</span>
          <input type="datetime-local" value={releaseAt} onChange={event => { setReleaseAt(event.target.value); }} />
        </label>
        <p>Last maintenance end: <time>{earliestDispatchable(flight, events)}</time></p>
        <p>Flight departs: <time>{flight.departure}</time></p>
      </section>
      <section className="suite-card" aria-label="Maintenance evidence">
        <h2>Evidence chain</h2>
        <ol>{events.filter(event => event.tail === flight.tail).map(event =>
          <li key={event.id}><strong>{event.id}</strong> · {event.id === 'GRD-204' ? 'Grounded for inspection' : event.id === 'H2-204' ? 'Hangar H2 reserved' : event.kind} · {event.startsAt}–{event.endsAt}
            {event.kind === 'inspection' && <label> <input type="checkbox" checked={inspectionSigned}
              onChange={change => { setInspectionSigned(change.target.checked); }} /> Engineering signature present</label>}
          </li>)}</ol>
        <h3>Release findings</h3>
        {findings.length ? <ul>{findings.map(item => <li key={item.code + item.eventId}>
          <strong>{item.code}</strong> · {item.message} ({item.eventId})
        </li>)}</ul> : <p>All scheduled evidence gates pass.</p>}
      </section>
      <section className="suite-card" aria-label="Release decision">
        <h2>Decision</h2>
        <p>Packet AF-204: {fleet.releaseAt ? 'completed' : packet?.status === 'completed' ? 'reopened' : packet?.status ?? 'unavailable'}</p>
        <p>Durable release: {fleet.releaseAt ?? 'pending'} · Revision {fleet.revision}</p>
        <p>Inspection evidence revision: {fleet.maintenanceRevision}</p>
        {swapStaleReasons(fleet).map(reason => <p role="alert" key={reason}>{reason}</p>)}
        <label className="suite-field"><span className="suite-field-label">Authority</span>
          <select value={state.role} onChange={event => { dispatch({ type: 'role', role: event.target.value as typeof state.role }); }}>
            <option value="observer">Observer</option><option value="operator">Operator</option><option value="approver">Approver</option>
          </select>
        </label>
        <label className="suite-field"><span className="suite-field-label">Release rationale</span>
          <textarea value={state.note} onChange={event => { dispatch({ type: 'note', note: event.target.value }); }} />
        </label>
        {noteError && <p>{noteError}</p>}
        <button disabled={!canRelease} onClick={guard(release)}>Record return to service</button>
        {fleet.releaseAt && <button onClick={guard(reopen)}>Reopen release</button>}
        {fleet.releaseAt && <button onClick={guard(supersedeInspection)}>Record new inspection revision</button>}
        <details><summary>Release history</summary><ol>{fleet.history.map(item =>
          <li key={item.revision}>{item.action} · {item.source} · {item.reason}</li>)}</ol></details>
        <p role="status">{notice || state.notice}</p>
      </section>
    </> : <p role="alert">No flight assignments exist for this aircraft.</p>}
  </div>
}

export function AircraftAvailabilityTimelinePage() { return <SelectedRecordRoute><RecordContent /></SelectedRecordRoute> }
