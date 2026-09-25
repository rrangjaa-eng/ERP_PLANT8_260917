Checker r2 shard B (03-06, TARGETED cross-plan only — not full line-by-line): 1 blocker, 2 warnings.
B1 02-PLAN:304 + T-04.3-10 (460) PNG cap 200KB vs 06 184,320 -> set 02 to 184,320 / reference SIGNATURE_MAX_PNG_BYTES.
W1 02:268 orphan verify_idem_key_hash; 10:~146 clears it; 02 must specify verify_idem_outcome map shape 03 expects (countRecentMisses jsonb_each).
W2 12:131 purge must null verify_idem_outcome (IP hashes), verify_proof_hash, verified_until; assert.

FULL line-by-line pass (03-06): 1 blocker, 5 warnings, 3 info.
B2 04 T3 E2E (f-0)(f) + T1 integration PM-scope: role-pm has no certs.events perms until plan 09 (domain/seed/index.ts:133-162) -> grant in tests (upsertPermission) or move PM seed into 04.
W3 05 T2: test/unit/deploy/fakebin/gcloud has no `storage buckets` branch, exits 1 -> add to files_modified + branches + state file.
W4 04 T2/T3 TDD: T2 behaviour (blocked reasons, discard dialog N, invalid-cell pinning) tested only after -> tests first / pure helpers with unit tests first.
W5 06 ink threshold 288 distinct px vs client summed stroke length >=24 -> same measure both sides or overlapping-stroke case must pass.
W6 scope 04 25 files, 06 20, 03 16 -> split 04 T1 (qrcode+winner-rules).
W7 04 T3 ⑤(f) route undecided (createCertEvent has no creator) -> name one route (insert event with created_by via db/client).
I 03 isDefiniteResult "여덟 가지" lists six; 06 E5 kind name distinct from verify `submitted`; 03 replay ok after submit -> check submitted_at before replay or document.
