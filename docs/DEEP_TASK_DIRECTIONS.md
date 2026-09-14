# AeroFleet deep task directions

Architecture: Reducer-backed fleet timeline projection.

1. Reconcile a late flight assignment against a newly grounded aircraft
2. Project component cycles across reassigned flight legs
3. Preserve a planner draft after hangar capacity changes
4. Explain availability gaps across maintenance and operations
5. Enforce independent return-to-service signoff
6. Recover a work package after a stale technician roster response
7. Deep-link a selected tail and forecast horizon
8. Bulk-shift maintenance slots with partial conflicts
9. Apply MEL expiry at the operator timezone boundary
10. Recompute engine and APU cycles after corrected utilization
11. Retain audit evidence when a tail number changes
12. Show parts shortages on the availability timeline
13. Prevent flight release after a superseding grounding event
14. Compare maintenance-program revisions effective on a date
15. Restore keyboard focus to the exact assignment conflict
