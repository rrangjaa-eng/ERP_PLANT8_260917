---
phase: 06-payment-evidence-cards
plan: 31
subsystem: docs
tags: [evidence, runbook, gcs, vitest, postgres]
gap_closure: true
gap_ids: [G-06-C]
plan_head_before: cd0527d4a53d88c9dd324a6ba2e5643944e3c648
commits: 1

requires:
  - phase: 06-payment-evidence-cards
    provides: files.owner_kind 주인 종류 넷(files_owner_kind_check) · evidence/{파일 id} 객체 키
provides:
  - 고아 증빙 청소 런북 대상 1 SQL이 주인 종류 넷 전부의 지운 증빙을 찾는다(결과에 owner_kind 칸)
  - docs-limits 단위 사례 둘 — 대상 1 SQL 모양 · 스키마 주인 종류 목록과 문서 대조
affects: [06-32, 운영 청소 절차]

actuals:
  tokens: 1500
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "문서-스키마 대조 단위 테스트: 스키마 파일을 글자로 읽어 CHECK 목록의 값이 문서에 있는지 단언(DB 클라이언트 미import)"

key-files:
  created: []
  modified:
    - docs/EVIDENCE-STORAGE.md
    - test/unit/docs-limits.test.ts

key-decisions:
  - "대상 1 SQL은 주인 종류를 나열하지 않고 조건을 없앴다 — 객체 키가 종류와 무관하게 evidence/{파일 id}라 다섯째 종류가 생겨도 누락이 없다"

requirements-completed: [EVID-04]

coverage:
  - id: D1
    description: "런북 대상 1 SQL이 주인 종류 넷의 지운 증빙을 모두 찾고 결과에 owner_kind 칸이 있다"
    requirement: EVID-04
    verification:
      - kind: unit
        ref: "test/unit/docs-limits.test.ts#대상 1 SQL은 주인 종류로 거르지 않고 owner_kind 칸 · 30일 창을 가진다"
        status: pass
      - kind: other
        ref: "EXPLAIN 대상 1 SQL on erp_test (psql, ERROR 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "스키마 files_owner_kind_check에 주인 종류가 더해지면 문서 누락을 단위 테스트가 잡는다"
    requirement: EVID-04
    verification:
      - kind: unit
        ref: "test/unit/docs-limits.test.ts#files_owner_kind_check의 주인 종류가 모두 문서에 있다"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-14
status: complete
---

# Phase 06 Plan 31: 고아 증빙 청소 런북 주인 종류 확장 Summary

**고아 증빙 청소 런북의 대상 1 SQL에서 `owner_kind = 'expense'` 조건을 없애 주인 종류 넷(지출결의 · 견적 차수 · 리저브 줄 · 카드 사용)의 지운 증빙을 모두 찾게 하고, 스키마 CHECK 목록과 문서를 대조하는 단위 테스트로 누락 재발을 막았다**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-14T08:15Z (approx.)
- **Completed:** 2026-10-14T08:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- G-06-C(06-VERIFICATION 경고 1) 닫음: 대상 1 SQL이 `SELECT id, owner_kind, object_key, removed_at FROM files WHERE removed_at < now() - interval '30 days' ORDER BY removed_at;`로 바뀜. 30일 창 · 대상 2 SQL · 순서 절의 뜻은 그대로.
- 대상 1 문단에 네 종류 이름과 「객체 키가 모두 evidence/{파일 id}」 한 문장, 순서 3 기록 항목에 주인 종류 추가.
- docs-limits 사례 둘 추가(스키마 파일을 글자로 읽어 `files_owner_kind_check`의 값 4개 이상이 모두 문서에 있는지 단언).

## Task Commits

1. **Task 1: 트레이서 — 대상 1 SQL이 네 주인 종류를 모두 찾는다(RED → GREEN)** - `c1cb9e0` (docs)
2. **Task 2: 런북 SQL EXPLAIN · 범위 확인** - 검증만, 변경 없음 → 커밋 없음(계획대로 Task 1 커밋 하나로 끝)

**Plan metadata:** 이 SUMMARY 커밋(docs: complete plan)

## TDD 증거

RED(고치기 전, `pnpm exec vitest run --project unit test/unit/docs-limits.test.ts`, 2 failed | 89 passed):
- (가) `AssertionError: expected 'SELECT id, object_key, removed_at FRO…' not to match /WHERE[^;]*owner_kind/`
- (나) `AssertionError: quote_revision: expected '# EVIDENCE-STORAGE — 증빙 버킷 런북 (EVID-0…' to contain 'quote_revision'`

두 실패 모두 대상 테스트가 계획한 단언에서 실패(문법 오류 · 0건 발견 아님).
GREEN: 같은 명령 91 passed (91). 계획이 한 커밋을 정해 RED 테스트 커밋을 따로 만들지 않았다(테스트 · 문서가 `c1cb9e0` 하나).

호출한 Superpowers 스킬: `test-driven-development`(코드 전), `verification-before-completion`(커밋 전). `systematic-debugging`은 호출하지 않았다 — 붉은 테스트 · 빌드 실패가 없었다(한 번 `tail` 인자 오류로 비정상 종료 코드가 났으나 lint · typecheck는 종료 코드 0이었다).

## 검증

- lint: 종료 0 (boundaries v5→v6 마이그레이션 경고만 — 기존 설정 경고, 이 변경과 무관), typecheck: 종료 0.
- EXPLAIN(로컬 `erp_test`, 읽기만, `DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp_test`, flock 안): `QUERY PLAN` 3회, `ERROR` 0.
  - 대상 1: `Sort → Seq Scan on files, Filter: removed_at < now() - 30 days`
  - 대상 2 대조: `Seq Scan on files`
  - 대상 2 확인: `Sort → Seq Scan on upload_intents, Filter: completed_at IS NULL AND expires_at < now() - 24h`
- 범위: `git diff --name-only cd0527d..HEAD` = `docs/EVIDENCE-STORAGE.md` · `test/unit/docs-limits.test.ts` 둘뿐. `app domain repositories lib scripts db` 변경 없음.
- 인수 기준: `owner_kind = 'expense'` 0건 · 정확한 SQL 줄 1건 · 세 종류 이름 각 1건 · G-06-C 2건 · files_owner_kind_check 3건 · 문서 112줄(≤150).

## Files Created/Modified
- `docs/EVIDENCE-STORAGE.md` - 대상 1 SQL · 문단 · 순서 3 기록 항목
- `test/unit/docs-limits.test.ts` - G-06-C 사례 둘

## Decisions Made
- 주인 종류 목록 조건 대신 조건 제거(계획 prohibition 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 로컬 테스트 DB에 마이그레이션 적용**
- **Found during:** Task 2
- **Issue:** `pnpm db:reset:test`는 빈 DB만 만들어 `relation "files" does not exist`로 EXPLAIN이 실패(첫 시도, 문서 SQL 문제가 아님)
- **Fix:** `DATABASE_URL`을 명시하고 flock 안에서 `pnpm db:migrate` 후 같은 EXPLAIN 재실행. 파일 변경 없음.
- **Verification:** `QUERY PLAN` 3 · `ERROR` 0

---

**Total deviations:** 1 auto-fixed (1 blocking, 환경 준비)
**Impact on plan:** 파일 변경 없음. 플랜 verify 명령에 `pnpm db:migrate`가 빠져 있었다 — 06-32 이후 같은 verify를 쓰면 같은 걸림이 있다.

## 260907 대조

옛 저장소(rrangjaa-eng/erp_plant8_260907)에는 운영 고아 증빙 청소 런북이 없다. 가장 가까운 것은 `server/도구/시험파일지우기.mjs`(시험 파일 지우기 도구)이고 이 런북에 대응하는 것은 없다. 근거는 GitHub 코드 검색이다(이 세션에서 옛 저장소 클론이 막혀 검색으로 대조). 구현하지 않았다.

## 발견 (고치지 않음)

- 대상 1 문장 「무효 처리한 파일(`voided_at`)은 기록이므로 대상이 아니다」와 달리 SQL은 `voided_at`을 거르지 않는다 — 기존 줄의 어긋남이라 이번 범위 밖(CLAUDE.md §3.3, 언급만).
- 엣지 프로브 EVID-04: 미분류 유지(가정: 떼어 낸 증빙의 객체는 30일 뒤 운영자 절차로만 지운다). 건드리지 않았다.
- 플랜 Task 2 verify 명령은 `pnpm db:reset:test` 뒤 마이그레이션을 적용하지 않아 그대로는 실패한다(위 편차).

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
06-32와 같은 PR-G1 묶음. 이 플랜이 건드린 파일은 06-32와 겹치지 않는다. STATE.md · ROADMAP.md는 오케스트레이터가 갱신한다.

## Self-Check: PASSED

- `docs/EVIDENCE-STORAGE.md`, `test/unit/docs-limits.test.ts` 존재 확인
- 커밋 `c1cb9e0` 존재 확인

---
*Phase: 06-payment-evidence-cards*
*Completed: 2026-10-14*
