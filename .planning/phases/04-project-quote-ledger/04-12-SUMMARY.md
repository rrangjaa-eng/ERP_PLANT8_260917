---
phase: 04-project-quote-ledger
plan: 12
subsystem: quotes
status: complete
tags: [quote-lines, settling, gate, idempotent-insert, archive, restore, tx-safety]
requires: [04-11, 04-20, 04-22, 04-32, 04-44]
provides:
  - domain/quotes/edit-scope.ts (lineCellEditability · structuralEditability · quoteCellsZero · orderChange · quoteLockReason · linkedDocumentReason · QUOTE_LINE_STATUSES)
  - 견적 줄 저장 세 단계(prepareQuoteLineSave · writeQuoteLinesInTx · finishQuoteLineSave · rememberFxAfterCommit)
  - restoreQuoteLine + domain/archive DOMAIN_RESTORERS
  - quoteLineRowInputSchema · quoteLinesInputSchema
  - linkedDocumentsByLine(Phase 5 조회 지점)
affects: [04-13, 04-14, 04-26, 04-30, 04-40, 04-07, 04-46]
tech-stack:
  added: []
  patterns: [three-stage save (pool before / tx only / after commit), ON CONFLICT DO NOTHING replay triage, domain restorer table]
key-files:
  created:
    - domain/quotes/edit-scope.ts
    - test/unit/domain/quote-edit-scope.test.ts
  modified:
    - domain/quotes/lines.ts
    - domain/rules/register.ts
    - domain/projects/ledger.ts
    - domain/archive/index.ts
    - domain/revenue/index.ts
    - repositories/quote-lines.ts
    - repositories/archive.ts
    - repositories/projects.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - test/integration/quote-lines.test.ts
    - test/integration/tx-safety.test.ts
    - test/integration/project-period.test.ts
decisions:
  - 정산 새 줄의 견적 칸 0 = 원화 단가 0 · 수량 없음 또는 1(수량 > 0 검증은 그대로)
  - 순서 불일치(order 집합 다름)와 보관된 줄 수정은 소속 규칙(quote.line-membership)으로 denyWrite
  - 보관함 복원은 restore()의 보관함 쓰기 권한 확인 뒤 DOMAIN_RESTORERS로 넘기고, restoreQuoteLine이 projects 쓰기를 한 번 더 확인
  - 이미 복원된 줄의 복원은 멱등(아무것도 하지 않음 · 로그 없음)
metrics:
  duration: 78min
  completed: 2026-09-25
requirements-completed: [PROJ-02, UX-04]
plan_head_before: 47231833742d928eef7069eb33d59c39f0d0be07
commits: 6
actuals:
  tokens: 33791
  tasks: 3
  commits: 6
---

# Phase 4 Plan 12: 견적 줄 정산 편집 범위 · 멱등 저장 · 보관/복원 Summary

견적 줄 저장을 트랜잭션 전·안·뒤 세 단계로 나누고, 칸·구조 단위 게이트(정산은 실행가와 견적 칸 0인 새 줄만)와 ON CONFLICT 멱등 삽입 · order 순서 · 같은 트랜잭션 보관 · 도메인 복원을 붙였다.

## Tasks

| # | 이름 | RED | GREEN |
|---|------|-----|-------|
| 1 (tracer) | 편집 범위 순수 함수 · 셀 게이트 · 저장 세 단계 · A-21/A-03/B-01 | 80ce0b7 | ba3cafd |
| 2 | 정산 구조 판정 · 멱등 삽입 · order/append · 보관·합계 제외 · 취소 · 입력 검증 | 63ee5e0 | 6fb63c0 |
| 3 | 도메인 복원 · 경합 · 유령 로그 · ENG-D6 · 풀 2 셋 다 성공 | 1cfbb37 | e13d0e4 |

## 검증(실행 결과)

- Task 1: 단위 29/29 · 통합(quote-lines·conflict·leak-scan·project-period·tx-safety) 910/910 · tracer 게이트 재실행 910/910 · lint · typecheck 0
- Task 2: 단위 47/47 · 통합 11파일 982/982 · lint · typecheck 0
- Task 3: 단위 44/44 · 통합(quote-lines·archive·project-status·project-period·revenue-entries·tx-safety) 117/117 · 추가 7파일 908/908 · lint · typecheck · build · lint:sql 0
- 뮤테이션: tx-safety (d)(커밋 뒤 단계를 시간 초과 변환으로 감싸면 빨강) · quote-lines (m)(보관을 tx 밖으로 옮기면 빨강 — 검토 S6 뒤 성립, 아래 「검토 반영」) · quote-lines (t)(견적 줄 로그에서 `{ tx }`를 빼면 빨강)
- 의존성: package.json·pnpm-lock.yaml이 d6b41cf와 같다
- 전체 CI=true 게이트와 E2E는 오케스트레이터가 돌린다(이 실행자는 돌리지 않음)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 과도기 id 붙이기(actions.ts)** — 화면(quote-table, 04-30 소관)이 새 줄을 id 없이 보낸다. 도메인은 id를 요구하므로 액션이 id 없는 줄에 서버 uuid + `isNew`를 붙인다. 액션 스키마의 줄 `id`는 「있으면 uuid」(선택)로 두었다 — 04-30이 화면 uuid를 실으면 필수로 좁힌다. 재전송 멱등(ENG-D10)은 화면 uuid부터 실제로 효과가 있다. (ba3cafd · 6fb63c0)

**2. [Rule 3 - Blocking] page.tsx 편집 가능 판정** — 옛 게이트 ctx 호출을 `lineCellEditability` 기반 `editable`로 바꿨다(플랜 파일 목록 밖). (ba3cafd)

**3. [Rule 3 - Blocking] quote-table.tsx 페이로드 타입** — `lineStatus`가 enum이 되어 화면 페이로드의 줄 상태·baseline 상태만 `QuoteLineStatus`로 좁혔다(런타임 검증은 서버 스키마). 화면 타입 정리는 04-30. (6fb63c0)

**4. [Rule 1 - Test premise] tx-safety (d)** — 견적 줄 감사 기록이 tx 안으로 옮겨져(플랜 ④) 「커밋 뒤 감사 기록 실패」 전제가 사라졌다. 같은 단언(오류 · UserFacing 아님 · 줄 저장됨)을 커밋 뒤 남은 풀 단계(`projectMany` 투영)로 옮겼고 뮤테이션으로 확인했다. (ba3cafd)

**5. [Rule 1 - Test premise] project-period (n)** — 게이트 ctx 모양 변경에 맞춰 정확한 ctx로 단언(느슨하게 하지 않음). Task 2에서 정산 새 줄 규칙(D12)이 생겨 그 테스트의 새 줄을 단가 0 줄로 바꾸고 `quoteCellsZero: true`까지 단언했다. (ba3cafd · 6fb63c0)

**6. [분할] Task 1에 id 필수 · `{ rows }` 입력 · 새 줄 max+1 append를 앞당겼다** — 테스트 호출 지점을 두 번 옮기지 않으려고. (ba3cafd)

**7. [테스트 위치] (o) 입력 검증** — `actions.ts`가 "use server" 서버 전용 체인이라 테스트가 import하지 못한다. 줄 스키마를 `domain/quotes/lines.ts`의 `quoteLineRowInputSchema`·`quoteLinesInputSchema`로 옮겨(04-13이 가려던 방향) `safeParse`로 단언했다. `projectId` uuid는 액션 스키마(`z.string().uuid()`)로 적용했고 테스트는 grep으로만 확인된다.

**8. [문구] 소속 거부 문구** — 옛 「줄을 찾을 수 없습니다」 대신 UI-SPEC rev 5 `차수와 프로젝트가 맞지 않음 · 새로 고침`.

**9. [절차] 04-12 실행자가 Task 1에서 스킬 호출 없이 테스트·코드를 수정함 — 코디네이터 점검(18:48 KST)이 잡아 이후 호출함.** 이후 Task 1 RED를 구현 파일을 HEAD로 되돌린 상태에서 다시 실행해 보였다(매트릭스 (a) `expected +0 to be 5` · (b) `expected null to be an instance of SaveRejectedError` · (e) 1줄 · (f) 옛 문구, tx-safety (d)·period (n) `기존 줄을 저장하려면 버전 정보가 필요합니다`).

## 새 문구(rev 5에 없는 방어 문구)

- `보관된 줄 · 새로 고침` — 보관된 줄 id를 고치는 요청
- `연결 문서 있음 · 삭제 대신 취소` — 연결 문서 줄의 보관(화면은 `견적 줄 취소` 모달로 간다)

## 메모

- 정산 새 줄의 수량은 「1」로 저장·표시된다. 사용자가 「수량 1」 표시가 이상하다고 하면 표시만 바꾼다(저장 규칙 그대로).
- 전역 풀 in-tx 감사(`global-db-in-tx-audit.md`): **닫음** — saveQuoteLines의 트랜잭션 안 풀 호출(`can` · `visible` · `findQuoteRevisionById` · `findProjectById` · `listFieldDefinitions`)은 `prepareQuoteLineSave`로 트랜잭션 앞에 옮겼다. **남음** — saveRevenue의 `can()`이 합성 저장 tx 안에서 풀로 돈다(그룹 B).
- 04-46 E2E quote-table (h) 「+1 dirty」 단언은 04-30의 화면 dirty 변경이 필요하다 — 04-30 소관으로 남긴다.
- 한도 풀리면 Codex 재확인 필요.

## Known Stubs

| 파일 | 줄 | 이유 |
|------|----|------|
| domain/quotes/lines.ts | 218 | `linkedDocumentsByLine`가 빈 Map — 지출결의가 없는 페이즈라 의도된 조회 지점(Phase 5가 채움). WINDOWS.md에 기록 |

## 검토 반영(Opus 독립 리뷰 `04-12-review-opus.md` — BLOCKING 0 · SHOULD-FIX 6 · NIT 10)

| 항목 | 처리 | 커밋 | RED(실패 줄) |
|------|------|------|--------------|
| S3 재전송 no-op이 로그를 남김 | 삽입·갱신·순서·보관 중 실제로 쓴 것이 없으면 `document_update` 로그를 건너뜀. 통합 (w)에 로그 수 단언 | d2c7ccd | (w) `expected 2 to be 1` |
| S1 완료 프로젝트에 값이 그대로인 줄이 쓰임 | 플랜 게이트 의미(A-21 — DB 현재 값과 정규화 값 비교, 바뀐 칸만 판정)대로 **거부가 아니라 no-op**: 바뀐 칸이 없는 기존 줄은 쓰지 않는다(version·updated_at·로그 그대로). 버전 충돌 판정은 04-04 그대로. 통합 (c3) 추가 · 04-04 충돌 (a)는 같은 값 재저장으로 버전 증가를 보던 전제라 항목명 한 칸을 고쳐 같은 의도 유지 | 7dff0a4 | (c3) `expected 2 to be 1`(version) |
| S2 정산 새 줄 `lineStatus` 미판정 | `quoteCellsZero`에 상태(없음 · `not_started`) 조건 — DTO 잠김 칸과 같은 칸. 단위 케이스 · 통합 (h)에 취소 새 줄 | 2932c9c | 단위 `expected true to be false` · (h) `promise resolved … instead of rejecting` |
| S4 섞인 배치 재전송 | **동작 그대로.** 플랜 04-12-PLAN.md:170 「기존 줄 수정이 섞인 배치의 재전송은 버전 충돌로 전부 거부되어 새 줄도 다시 들어가지 않는다(중복 0 — 충돌 표시로 끝나는 것은 04-04 동작 그대로)」. 재전송 멱등 계약(ENG-D10)은 **새 줄만** 덮는다 — 04-30·그룹 B는 이 범위를 전제로 한다 | — | — |
| S5 보관된 줄 id `isNew` 재전송 테스트 없음 | 통합 (w4) 추가(새 줄 저장 → 보관 → 같은 페이로드 재전송 = 소속 거부 · 보관 그대로). 변이: `stored.archivedAt !== null` 조건 제거 → 빨강 → 복구 → 초록 | 42b48c0 | 변이 시 `promise resolved … instead of rejecting` |
| S6 (m)이 보관 단계에 닿지 않음 | (m)에 사전 판정을 통과한 보관 저장 + `recordAction` 거부 → 보관 되돌아감 단언. 변이: 보관을 tx 대신 풀로 → 빨강 → 복구 → 초록. 위 「검증」의 (m)·(t) 위치 표기를 quote-lines로 고침 | 68b092c | 변이 시 `expected <날짜> to be null` |
| NIT-7 page.tsx 고아 import | `import "@/domain/rules/register"` 제거(lines.ts가 등록을 불러옴) | aae8520 | 동작 변화 없음 — typecheck·lint |

- 검증: 단위 quote-edit-scope 23/23 · 단위 전체 1161/1161 · 통합 quote-lines + quote-lines-conflict 45/45 · 관련 통합(tx-safety·project-period·ledger-ownership·fx-remember-concurrency·project-status·projects-list·quote-line-visibility·revenue-entries) S1 뒤 통과 · `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` 0. E2E·CI=true 전체 게이트는 돌리지 않음(오케스트레이터 몫).
- 남긴 NIT(이월): 1 거부 지점 여럿(재전송 판정 `denyWrite` · 경합 경로 `MEMBERSHIP_MISMATCH`/`ARCHIVED_LINE`) · 2 범용 `archive(viewer, "quote_line", id)` 우회 경로 · 3 보관함 목록 팀 범위 · 4 복원 거부 `write.denied` 단언 없음 · 5 `duplicatedFrom` 검증 없음(04-30 계약에 「복제는 반드시 duplicatedFrom」) · 6 `revisionId`·`vendorId` uuid 검증 · 8 `prepareQuoteLineSave` 차수 재조회 · 9 04-30 전 정산 화면 불일치(04-30 수용 기준에 「정산 잠김 칸 거부는 표 위 한 줄」) · 10 합성 저장 `saveRevenue` `can()` 풀 호출(그룹 B — tx-safety (g) 매출 포함 변형).
- 남은 틈(메모): 바뀐 칸 판정은 기존 줄의 사용자 정의 필드를 보지 않는다 — 기존 줄 갱신이 사용자 정의 필드를 쓰지 않으므로(repositories/quote-lines.ts update) 지금은 영향 없음.
- 한도 풀리면 Codex 재확인 필요.

## Self-Check: PASSED

- FOUND: domain/quotes/edit-scope.ts · test/unit/domain/quote-edit-scope.test.ts
- FOUND: 80ce0b7 · ba3cafd · 63ee5e0 · 6fb63c0 · 1cfbb37 · e13d0e4
