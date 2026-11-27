# System Administrator Guide — MOBA 2017 Elections

You control the platform. Every change you make is recorded in the audit log, which the Electoral Committee can
read and verify. You can see **who** has voted, never **how** anyone voted.

## 1. Members

1. **Members → Bulk registration**: download the template, fill it from the MOBA 2017 list (Excel → Save As →
   CSV UTF-8), upload. Review the preview: invalid rows and duplicates are listed and skipped. Choose whether to
   approve immediately, then **Import**. Download the failed-records report to fix and re-upload problem rows.
2. **Add member** for individual registrations.
3. Approve, reject (with reason), suspend, reactivate or deactivate from the member page. Deactivation keeps the
   record for the audit trail; it can be reversed.

## 2. Login credentials

* **Credentials → Send credentials** emails a unique temporary password to every approved, active member who has
  none yet. Members who already received credentials are skipped — nothing is re-issued silently.
* A failed email can be **retried** (same password, no new credentials).
* **Generate new credentials** on a member page issues a new password (old one stops working). It needs your
  password and a reason.
* Temporary passwords expire after the number of days set in **Settings**.

## 3. Preparing an election

1. **Elections → New election**: title, year, voting period (Ghana time), instructions, rules, results visibility,
   tie-break procedure.
2. **Positions**: add positions or “Add standard MOBA positions”. Set seats (usually 1) and whether abstention is
   allowed.
3. **Candidates**: register each candidate (link the member email where possible), add a photo, biography and
   manifesto, then approve.
4. **Voter roll**: “Add all approved members” or pick individuals.
5. **Announcements**: optionally publish and email a notice.
6. **Overview → Schedule election** once the readiness checklist is green. You can still edit until the opening
   time; at the opening time the ballot locks automatically.

## 4. During voting

* Voting opens and closes automatically on the server clock. You may also **Open voting now** or **Close voting
  now**.
* Watch participation on the **Voter roll** tab and the overview; send **Remind non-voters** if needed.
* Vote counts are **sealed** until voting closes — for you too.
* **Emergency procedures** (password + reason of at least 20 characters, flagged EMERGENCY in the audit log):
  * *Postpone* — only while nobody has voted.
  * *Extend voting* — moves the closing time later; non-voters are notified.
  * *Withdraw a candidate* — from the candidate page; removes them from ballots not yet cast; votes already cast
    are kept and reported with a “withdrawn” label.
  * *Cancel election* — final; no results are produced.

## 5. Results

1. After closing, open **Results** to check the provisional results and the integrity line (ballots must equal
   participation records — publication is refused otherwise).
2. **Publish results** (password required) freezes an official, hashed snapshot and notifies members.
3. **Ties** are never broken automatically. Apply MOBA's tie-break procedure (e.g. a run-off) and record the
   outcome with **Record tie-break outcome**; counts never change.
4. **Withdraw publication** only to correct an error (reason required, audited).
5. **Reports** offers CSV/PDF results, participation, candidates, members and audit exports.
6. Archive the election when finished.

## 6. Staff accounts and settings

* **Staff accounts**: create administrators and Electoral Committee members, change roles, reset logins, suspend,
  sign out everywhere. The last active administrator cannot be removed. Keep at least two administrators.
* **Settings**: organisation name, support contacts (shown on the Help page), temporary-password validity,
  lockout policy. **Database protection** must show “Hardened” before any live election.

## 7. Good practice

* Never share accounts. Sign out on shared computers.
* Do not deploy new code during voting.
* Ask the Electoral Committee to run **Verify integrity** on the audit log before and after voting.
