import { recordDetailPath, recordDecisionPath } from './recordLinks'
import { Link } from 'react-router-dom'
import { saveCurrentCollection } from '../workspace/recordStorage'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { releaseEngineers } from './engineerWorkload'
import { archiveFlight, claimSelectedFlight, createFlight, flightInbox, flightRows, readFlightCollection,
  revalidateFlights, reviseCondition, saveFlightCollection } from './flightCollection'

export function FlightCollectionPage() {
  const [collection, setCollection] = useState(() => readFlightCollection(window.localStorage))
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('active')
  const [engineer, setEngineer] = useState('eng-lee'); const [checked, setChecked] = useState<string[]>([])
  const [newId, setNewId] = useState(''); const [notice, setNotice] = useState('')
  const selectedId = params.get('flight') ?? 'AX418'
  const selected = collection.flights.find(item => item.id === selectedId)
  function choose(id: string) { setParams(current => { const next = new URLSearchParams(current); next.set('flight', id); return next }) }
  function persist(next: typeof collection, message: string) { try { setCollection(saveCurrentCollection(window.localStorage, collection, next, readFlightCollection, saveFlightCollection)); setNotice(message); return true } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed. Your input is preserved.'); return false } }
  function run(action: () => typeof collection, success: string) {
    try { return persist(action(), success) } catch (error) { setNotice(error instanceof Error ? error.message : 'Flight operation failed.'); return false }
  }
  return <main className="suite-page"><header className="suite-title"><div><small>FLEET / RELEASE RESPONSIBILITY</small>
    <h1>Flight release workspace</h1><p>Independent aircraft decisions, shared maintenance evidence and release-engineer work.</p></div></header>
    <section className="metrics" aria-label="Flight summary">
      <article><small>Active flights</small><strong>{collection.flights.filter(item => !item.archived).length}</strong></article>
      <article><small>Review queue</small><strong>{flightInbox(collection).length}</strong></article>
      <article><small>Stale swaps</small><strong>{collection.flights.filter(item => !item.archived && item.decision.swapHours !== null && item.decision.swapEvidenceRevision !== item.decision.maintenanceRevision).length}</strong></article>
    </section>
    <section className="suite-card" aria-label="Flight review queue"><h2>Inspection review queue</h2>
      {flightInbox(collection).length ? <ul>{flightInbox(collection).map(item => <li key={item.reviewId}>
        <button onClick={() => { choose(item.flightId) }}>{item.flightId}</button> · {item.critical ? 'critical' : 'routine'} ·
        {item.assigneeId ?? 'team queue'} · {item.actionable ? 'actionable' : 'stale'}</li>)}</ul> : <p>No active inspection reviews.</p>}
      <label>Release engineer <select value={engineer} onChange={event => { setEngineer(event.target.value) }}>
        {releaseEngineers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </section>
    <section className="suite-card" aria-label="Flight collection"><h2>Flights</h2>
      <label>Search flights <input value={query} onChange={event => { setQuery(event.target.value) }} /></label>
      <label>Show <select value={filter} onChange={event => { setFilter(event.target.value) }}><option value="active">Active</option>
        <option value="archived">Archived</option><option value="all">All</option></select></label>
      {flightRows(collection, query, filter).length ? <ul>{flightRows(collection, query, filter).map(record => <li key={record.id}>
        <label><input type="checkbox" checked={checked.includes(record.id)} onChange={event => {
          setChecked(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))
        }} /> Select {record.id}</label>
        <button aria-current={selectedId === record.id ? 'true' : undefined} onClick={() => { choose(record.id) }}>
          {record.id} · {record.tail} · {record.family}</button> · r{record.decision.revision} · {record.conditionId}
        {record.archived ? ' · archived' : ''}</li>)}</ul> : <p>No flights match this view.</p>}
      <button disabled={!checked.length} onClick={() => { const result = revalidateFlights(collection, checked, engineer)
        persist(result.collection, `${String(result.updated.length)} revalidated; ${String(result.skipped.length)} skipped; ${String(result.blocked.length)} blocked.`)
      }}>Revalidate selected swaps</button>
      <form onSubmit={event => { event.preventDefault(); if (run(() => createFlight(collection, newId, 'MC-42'), 'Flight created.')) setNewId('') }}>
        <label>New flight ID <input value={newId} onChange={event => { setNewId(event.target.value) }} required pattern="[A-Za-z]{2}[0-9]{3}" /></label>
        <button type="submit">Create A320 flight</button></form>
    </section>
    <section className="suite-card" aria-label="Selected flight"><h2>{selected?.id ?? 'Select a flight'}</h2>{selected && <>
      <p>{selected.tail} · {selected.family} · condition {selected.conditionId} · decision r{selected.decision.revision}</p>
      <p>Release {selected.decision.releaseAt ?? 'pending'} · swap {selected.decision.swapHours ?? 'not adopted'} hours · inspection r{selected.decision.maintenanceRevision}</p>
      <p>Reviewer {selected.decision.swapReviews?.find(item => item.status === 'open')?.assignee ?? 'none'}</p>
      <button onClick={() => { run(() => claimSelectedFlight(collection, selected.id, engineer, selected.decision.revision), 'Review claimed by named engineer.') }}>Claim selected review</button>
      <button onClick={() => { const condition = collection.conditions.find(item => item.id === selected.conditionId)
        if (!condition) return
        try { const result = reviseCondition(collection, condition.id, condition.revision)
          persist(result.collection, `${String(result.updated.length)} related flights updated; ${String(result.blocked.length)} blocked.`)
        } catch (error) { setNotice(error instanceof Error ? error.message : 'Condition update failed.') }
      }}>Revise linked maintenance condition</button>
      <button onClick={() => { run(() => archiveFlight(collection, selected.id), 'Flight archived.') }}>Archive flight</button>
      <details><summary>Flight history</summary><ol>{selected.decision.history.map(item => <li key={item.revision}>{item.action} · r{item.revision} · {item.reason}</li>)}</ol></details>
    </>}</section>
    <section className="suite-card" aria-label="Flight audit"><h2>Collection audit</h2><ol>{collection.audit.toReversed().slice(0, 8).map((item, index) =>
      <li key={index}>{item.action} · {item.id} · {item.related.join(', ') || 'none'}</li>)}</ol></section>
    <nav aria-label="Selected record workflows">{selected && !selected.archived && <><Link to={recordDetailPath(selected)}>Open record details</Link>{' · '}<Link to={recordDecisionPath(selected)}>Open decision workflow</Link></>} <button onClick={() => { try { setCollection(readFlightCollection(window.localStorage)); setNotice('Workspace refreshed; selection preserved.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Refresh failed.') } }}>Refresh workspace</button></nav>
    <p role="status">{notice}</p>
  </main>
}
