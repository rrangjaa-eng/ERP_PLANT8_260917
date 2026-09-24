# Checker r3 shard A (plans 01, 02, 13) — prior findings + changed lines (41c47e4..4782585)

verify plan-structure: 01 valid (3 tasks), 02 valid (3 tasks), 13 valid (3 tasks); 0 errors/warnings.

## Prior findings
| ID | Status | Evidence |
|---|---|---|
| r2 W1 scope 02 Task1 ~46 files | RESOLVED (residual INFO) | 02 now 3 tasks: T1 foundation 19 files (02:214), T2 tracer 30 files (02:293), T3 9 files (02:422). estimate still 190k (02:66). |
| r2 I1 reused threat IDs | unchanged, intentional | — |
| r2 I2 13 backstop counts stale | RESOLVED | 13:135 collects by grep at run time, no hard count |
| r2 I3 02 "둘 다/두 명령" vs three | RESOLVED | 02:339 now names two commands consistently |
| codex A1 log-redaction vs old test | RESOLVED | 02 T1 behavior + action ⓪ rewrite 79–88 case; acceptance greps old toContain = 0 |
| codex A2 cert project vs admin-nav | RESOLVED | 02 T1 ⑥: cert-setup depends on desktop+mobile-375; certs workers:1; admin-nav diff forbidden |
| codex A3 server-only import in integration | RESOLVED | 02 T2 read_first leak-scan; action guard proven by E2E direct POST, domain layer by integration; grep acceptance = 0 imports |
| codex A4 01 fs-sm / 번호 없는 문장 | RESOLVED | 01 ①-h now `--fs-md`; verify greps `consent label{font-size:var(--fs-md)`; no "번호 없는 문장" left |
| codex A5 RESEARCH:59 reserved numbers | out of shard A plans (RESEARCH not in diff scope) — not re-checked |

## Owner decision (cumulative lock) — contract check
- 02 schema: `cumulative_failed_attempts` integer not null default 0, `hard_locked_at` null (02:104, 02:243). Matches.
- Fixed 20, not a setting: 01:12 / 01 ①-b. Matches; 02 registers no setting for it.
- recheck returns only lock state: 03:190 (hardLocked / shortLocked). Consistent with 01 #locked-hard.
- unlock via stamp + same-tx cert_unlock: 10:55, 10:231–232. 02 reserves columns only; no conflict.

## Changed-line findings
- INFO-1 01:73 and 01:163 still say 「실물 장면 일곱」 while must_haves/verify now require eight (#locked-hard). Fix: say 여덟.
- INFO-2 02 Task 2 still 30 files / 190k est (low confidence). Tasks sequential; ensure fresh executor context per task.
- INFO-3 01:189 `#locked-hard` button label 「잠금 확인」 (§7 usability): short verb label, no explanatory copy — OK; the two-line lock message conforms to "state-only one-line" guidance only if second line states the action (contact staff). Advisory to confirm against UI-SPEC E3.
- Paths: scripts/dev-db.sh, test/e2e/global-setup.ts, test/integration/global-setup.ts exist; migration-journal.test.ts is created by 02 T1 ⑦. OK.
- TDD order: 02 T1 ⓪ RED commit before feat; T2 ⓪(e) RED; DbOrTx widening RED→GREEN. OK.
- Deps/waves: 13 wave 7 unchanged; 13 verify uses --no-deps with cert-setup+certs — consistent with 02 C4.

Totals: 0 blocker, 0 warning, 3 info. Advisory only — no revision required.
