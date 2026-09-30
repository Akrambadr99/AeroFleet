# Flight collection triage

The collection view now keeps search (`q`), lifecycle (`show`), work state (`state`), sorting (`sort`), page and page size (`size`) in the URL. Search replaces the current history entry; deliberate view changes add history entries. Unsupported values fall back to defaults, query length is bounded, and out-of-range pages display the last available page. Changing a view constraint returns to page one.

The flight facet distinguishes pending release, unclaimed or assigned inspection review, outdated review evidence, needed inspection revalidation, released flight without a swap, and current swap evidence. Search includes aircraft tail, family, maintenance condition and criticality. These are summaries; existing engineer qualification, workload, revision and bulk-operation rules remain authoritative.

Both selected-record workflow links carry the collection context. Returning restores the view and actual flight identity. A flight outside the current page remains the working record, with an explicit explanation and Show selected record recovery. Unknown flight IDs do not silently open another flight.

Checkbox selection survives filtering, sorting and paging while the collection is mounted. Select this page and Clear this page affect only visible IDs; Clear selection affects all checked IDs. The counter and warning disclose selections outside the current page. Reload or leaving this route clears transient checkbox selection, not the saved domain data. Global engineer workload and the review queue intentionally cover all active records regardless of collection filters.

Controls use visible labels, native keyboard interaction, responsive wrapping, text work-state labels and polite result/selection announcements. Page size is disclosed under View options. Reset view retains the working flight and checked IDs. Empty filtered lists include recovery guidance.

Pure projection tests cover immutable filtering, deterministic sorting, pagination, URL parsing, scoped selection and safe return paths. React tests cover URL restoration, keyboard paging and hidden selection. Browser tests cover both workflow round trips, reload, history, real claim-driven facet changes, selection scope and a tablet screenshot. Full-gate results are recorded in the portfolio report; this document does not itself claim validation completion.
