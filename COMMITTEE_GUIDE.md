# Electoral Committee Guide — MOBA 2017 Elections

Your account is **read-only**. You can see everything needed to observe and verify the election, but you cannot
change anything — the server rejects every change you attempt, even through direct requests. A yellow
**READ-ONLY ACCESS** banner is always shown.

Nobody — the committee, the administrators or the developers using the application — can see how an individual
member voted.

## What you can review

| Area | What you see |
|---|---|
| **Overview** | Elections, member counts, email problems, database protection status |
| **Elections** | Schedule and status history, positions, candidates (with reasons for any decision), the voter roll and **who has voted and when** |
| **Member records** | Registration, approval, account and credential status, email history and activity for every member |
| **Email delivery** | Delivery status of every email (contents are never shown) |
| **Audit log** | Every administrative and system action, with reasons; filter, search and export |
| **Reports** | CSV/PDF downloads; results once officially published |

## Verification checklist

**Before voting opens**
1. Overview → “Database protection active”.
2. Audit log → **Verify integrity** → “Audit trail verified”. Note the chain-head hash.
3. Elections → check positions, approved candidates and the voter roll count.

**During voting**
4. Watch participation on the election page. Every automatic opening/closing appears in the status history as
   “automatic (system clock)”.
5. Any EMERGENCY entry in the audit log (postponement, extension, withdrawal, cancellation) must have a reason —
   follow up with the administrator.

**After voting**
6. On the election page, ballots stored must equal members recorded as voted (an integrity warning is shown
   otherwise).
7. Audit log → **Verify integrity** again; the earlier chain head must still appear in the chain.
8. When results are published, compare the published SHA-256 with the value in the `RESULTS_PUBLISHED` audit entry.

## Voters' receipts

Members receive a receipt code after voting. Anyone can enter it on **Verify a receipt** to confirm that a ballot
with that receipt is stored and counted. The receipt never reveals choices or identity.

## Results before publication

Provisional results are visible only to the System Administrator after voting closes. You see results once they
are officially published (configurable by MOBA 2017 — see DEVELOPMENT_PLAN.md §4).
