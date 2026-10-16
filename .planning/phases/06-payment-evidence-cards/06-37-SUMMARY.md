---
phase: 06-payment-evidence-cards
plan: 37
subsystem: corp-cards-schema
tags: [migration, partial-unique-index, archive-restore, architecture-s5-exception, risk]
gap_closure: true
gap_ids: [G-06-A]
status: complete
plan_head_before: c4696b71ed7ec5f53d746f3094c1f780f29131b6
commits: 3

requires:
  - phase: 06.5-payment-followup
    provides: 06.5-01 · 06.5-07 · 06.5-10(0036 evidence_amount DROP) main 머지 — 마이그레이션 번호 0037 · DECISIONS.md 끝 항목
provides:
  - corp_cards_issuer_last4_key = 같은 이름 부분 유일 색인(issuer, number_last4 WHERE archived_at IS NULL)
  - CorpCardLast4TakenError · 보관함 복원 거부 허용 목록
  - DECISIONS.md ARCHITECTURE §5 예외 항목(06-37 · G-06-A)
affects: [법인카드 등록, 보관함 법인카드 복원, 배포(위험 경로 PR — 사용자 머지)]

actuals:
  tokens: 6000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "같은 이름의 부분 유일 색인으로 제약 교체 — 이름으로 판정하는 오류 변환 · 옛 리비전 호환 유지"

key-files:
  created:
    - db/migrations/0037_corp_cards_last4_live.sql
    - db/migrations/meta/0037_snapshot.json
    - docs/design/checks/2026-10-16-06-37-corp-card-last4-live.md
  modified:
    - db/schema/corp-cards.ts
    - db/migrations/meta/_journal.json
    - domain/archive/index.ts
    - app/(app)/admin/archive/actions.ts
    - test/integration/corp-cards.test.ts
    - test/integration/archive.test.ts
    - test/unit/app/archive-restore-errors.test.ts
    - docs/design/DECISIONS.md

key-decisions:
  - "색인 이름을 corp_cards_issuer_last4_key 그대로 — domain/corp-cards 등록 오류 변환 · 옛 리비전이 변경 없이 같은 문구를 낸다(가정 A-1)"
  - "롤백 하한 없음 — corp_cards 대상 ON CONFLICT 0건(가정 A-2)"
  - "복원은 선검사 없이 색인 위반 catch 변환만(가정 A-4) — 문구 `같은 발급사와 뒤 4자리 카드 있음 · 복원 불가`"

duration: 약 40분
completed: 2026-10-16
---

# Phase 06 Plan 37: 보관 카드 번호 재등록(G-06-A) Summary

법인카드 유일 제약 `corp_cards_issuer_last4_key`를 같은 이름의 부분 유일 색인(`WHERE archived_at IS NULL`)으로 바꿔 보관한 카드와 같은 발급사 · 뒤 4자리의 재발급 카드를 등록할 수 있게 하고(마이그레이션 0037), 겹치는 보관 카드 복원은 `같은 발급사와 뒤 4자리 카드 있음 · 복원 불가`로 막는다.

**결정 출처**: 사용자 카드 20:42 「보관 카드 재등록 다시 허용」(260907 C02 판정 (a) — 부분 유일 마이그레이션 → 위험 경로 별도 PR, 사용자 머지). 옛 시스템 176:236-240도 보관 안 한 카드끼리만 유일. G-06-A 닫음.

## Commits

| Task | Commit | Title |
|---|---|---|
| 1 (tracer) | 765ed89 | feat(06-37): allow re-registering an archived corp card number |
| 2 | e15e06d | fix(06-37): explain blocked corp card restore when the number is taken |
| 3 | 6cb6807 | docs(06-37): record ARCHITECTURE §5 exception for corp card last4 index |

## 마이그레이션

- 파일: `db/migrations/0037_corp_cards_last4_live.sql`(+ `meta/0037_snapshot.json` · `_journal.json` idx 37) — `pnpm db:generate --name=corp_cards_last4_live`로 생성. main 최신 0036(`0036_drop_expense_evidence_amount`, 06.5-10) 바로 뒤.
- 생성 순서 그대로 DROP CONSTRAINT(8행) → CREATE UNIQUE INDEX(9행) — 순서 바꿈 없음. 손으로 더한 것은 머리 주석 4줄 · `SET LOCAL lock_timeout = '1s'` · `SET LOCAL statement_timeout = '5s'` · `--> statement-breakpoint`뿐. DELETE · UPDATE 0, `-- rollback-floor:` 0.
- 로컬 dev DB 적용(`pnpm db:migrate` → `{"event":"db.migrate","applied":true}`), `\d corp_cards` 색인 줄:
  `"corp_cards_issuer_last4_key" UNIQUE, btree (issuer, number_last4) WHERE archived_at IS NULL`
- `erp_test`는 verify마다 `pnpm db:reset:test`로 새로 만들어 같은 마이그레이션을 탔다.
- **프로덕션 승격은 업무 시간 밖(0021 선례).** 잠금 시간 1s/5s.

## 롤백 하한 없음 근거(A-2)

`grep -rn "onConflict\|ON CONFLICT" repositories/corp-cards.ts domain/corp-cards scripts | grep -i corp` → 0건. 저장소 전체에서 onConflict를 포함하고 corp_cards를 언급하는 파일은 `domain/corp-card-usages/index.ts` 하나인데, 그 줄은 「onConflictDoNothing을 쓰지 않는다」는 주석이고 대상도 `corp_card_usages`다. 옛 리비전은 새 색인 위에서 살아 있는 카드끼리만 같은 이름의 23505로 같은 문구를 받고, 보관 카드와 같은 번호 등록이 될 뿐이다.

## TDD 기록(RED → GREEN)

- Task 1 RED(`-t "G-06-A"`): 3 failed | 1 passed — `Error: 이미 등록된 카드 · 발급사와 뒤 4자리 확인`(전체 유일 제약이 보관 행과 같은 번호 재등록을 막음). 「발급사가 다르면」 회귀 사례는 기존 동작이라 처음부터 녹색.
- Task 1 GREEN: `corp-cards.test.ts` 26 passed · `pnpm lint:sql` 0 issues · `migration-journal` 7 passed · typecheck 0.
- Task 2 RED(통합): `expected [Function] to throw error including '같은 발급사와 뒤 4자리 카드 있음 · 복원 불가' but got 'Failed query: update "corp_cards" set…'`
- Task 2 RED(단위): `법인카드 거부는 문구를 루트 검증 오류로 돌려준다` — `expected undefined to deeply equal { Object (_errors) }`(허용 목록 밖이라 서버 오류)
- Task 2 GREEN: 통합 archive + corp-cards 46 passed · 단위 archive-restore-errors · pg-errors · import-cycles 17 passed.

## 최종 검증(새로 실행)

- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues in 38 files
- 단위 4파일(migration-journal · archive-restore-errors · pg-errors · import-cycles) 24 passed
- 통합(flock · erp_test 재생성) archive + corp-cards 46 passed
- 범위 확인: `git diff --name-only c4696b7..HEAD -- domain/corp-cards repositories/corp-cards.ts "app/(app)/admin/corp-cards" "app/(app)/admin/archive/page.tsx" test/e2e/archive.spec.ts docs/design/SYSTEM.md docs/design/tokens.css ui '*.tsx' '*.css'` 빈 출력

## 가정(실행 전 드러냄 — 모두 유지)

- A-1 색인 이름 그대로 — 도메인 변경 0 · 옛 리비전 호환. 같은 이름이라 DROP이 CREATE보다 먼저(생성 순서가 이미 그랬다).
- A-2 롤백 하한 불필요 — 위 grep.
- A-3 데이터 가드 불필요 — 지금 전체 유일 제약이 모든 행의 중복을 막고 있다.
- A-4 복원은 catch 변환만(선검사 없음).
- A-5 카드 수정 경로 영향 없음 — 발급사 · 뒤 4자리를 바꾸는 함수 없음.

엣지 프로브 EXP-07: `unclassified · unresolved` 유지. 이 플랜이 건드린 엣지(보관 카드와 같은 번호 재등록 · 살아 있는 카드끼리 중복 · 재등록 뒤 옛 카드 복원 · 같은 번호 보관 카드 둘)는 통합 테스트로 드러냈다.

## Opus 독립 검토 요청(`risk:` 태그 — 실행자가 하지 않음)

오케스트레이터가 별도 Opus 에이전트를 띄워 다음을 판정한다. 결과 링크: _(PR 본문 또는 `/review` 기록 — 미정)_
- ⓐ 생성 SQL 순서(DROP 8행 → CREATE 9행) · 잠금 시간 한 쌍 · Squawk 결과(0 issues)
- ⓑ 같은 이름 색인과 `isUniqueViolation`(`lib/pg-errors.ts` — 23505 `constraint` 필드 = 색인 이름) 판정
- ⓒ 롤백 하한 없음 근거(`ON CONFLICT` grep · 옛 리비전 동작)
- ⓓ 복원 변환이 다른 entity의 유일 위반을 삼키지 않는지(`entity === "corp_card"` && 색인 이름 일치일 때만)
- ⓔ DECISIONS.md 「되돌리는 법」이 프로덕션 직접 명령 없이 가능한지(새 마이그레이션 → migrate Job)

PR 본문에 적을 것: 프로덕션 승격은 업무 시간 밖(0021 선례) · 마이그레이션 잠금 시간 1s/5s · 롤백 하한 없음 근거. 위험 경로(`db/migrations/` · `db/schema/`) PR — 사용자가 GitHub에서 머지.

## Deviations from Plan

1. **[범위 — 오케스트레이터 지시] Task 3 회귀의 E2E 둘(`corp-cards.spec.ts` desktop · `mobile-corp-cards.spec.ts` mobile-375)과 `pnpm build`를 로컬에서 돌리지 않았다.** 오케스트레이터가 테스트를 lint · typecheck · lint:sql + 플랜이 이름 붙인 단위 · 통합으로 한정했다. 화면 파일 변경 0이라 CLAUDE.md §5(건드린 화면의 E2E만)에도 해당하는 화면이 없다. PR ready 때 CI가 build · 전체 E2E를 한 번 돈다 — 그 녹색이 이 회귀 확인을 대신한다.
2. **[Rule 2 — 테스트 보강] Task 1 통합에 behavior 넷째(발급사가 다르면 같은 뒤 4자리 등록 — 회귀) 사례를 새로 더했다.** 플랜은 「기존 동작」이라 했지만 기존 사례가 없었다. 처음부터 녹색(회귀 고정용).
3. **Task 1 통합에 「보관 안 된 카드끼리 막힘」 사례를 G-06-A describe 안에도 더했다**(보관 카드가 있는 상태에서 살아 있는 카드 둘째 등록이 DuplicateCorpCardError · 같은 문구) — 부분 색인이 살아 있는 중복을 계속 막는 것(T-06-37-02)을 직접 고정.
4. DECISIONS.md 머리를 선례 「**되돌리는 법(복구 절차)**」 대신 「**되돌리는 법**(복구 절차)」로 썼다 — 플랜 acceptance의 머리 글자 그대로 맞추려고.

체크포인트: 없음(플랜 autonomous: true · 사용자 결정 체크포인트 없음).

## Known Stubs

없음.

## Threat Flags

없음 — 새 엔드포인트 · 인증 경로 없음. 복원 거부 문구는 고정 문자열(원시 SQL · 내부 id 없음 — T-06-37-03).



## Self-Check: PASSED

- 파일 3(0037 SQL · 0037 스냅샷 · 점검표) FOUND · 커밋 765ed89 · e15e06d · 6cb6807 FOUND · `git rev-list --count c4696b7..HEAD` = 3(SUMMARY 커밋 전).
