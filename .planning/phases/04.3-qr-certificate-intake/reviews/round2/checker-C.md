Checker r2 shard C (07-12): 0 blocker, 4 warning, 3 info.
W1 scope 07/08/10 files 19/19/17 >15 -> accept or split 08 Task 2 deploy.
W2 08 T2 ⑤ "openssl rand not called" unobservable (openssl real, unlogged) -> assert via original-key hash/contract decrypt.
W3 07 T1 ④ revealRrn holds tx conn (FOR SHARE) while recordAction uses 2nd global conn -> pool exhaustion deadlock; write mask_reveal via tx-scoped append (C6 helper) or document pool assumption.
W4 C5 cumulative cap/staff reset: plan 10:47 staff cannot unlock (UI-SPEC:481); plan 03:114/317 marks cap 결정 대기 -> needs user decision or UI-SPEC amend.
I1 T-04.3-16 in 02/03/04/07/10 diff components; T-04.3-22 01 & 11 -> suffix per-plan variants.
I2 07 ② page & 11 ① print route call requireSession before assertCertFeatureEnabled -> swap order.
I3 08 verify runs cert-crypto.test.ts which 07 changes same wave (fine in worktrees).
