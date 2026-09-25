---
phase: 04-project-quote-ledger
plan: 30
subsystem: quotes-ui
status: complete
tags: [quote-table, cell-editability, settling, structural-controls, lock-line, empty-state, move-order, idempotent-insert]
requires: [04-12, 04-22, 04-28, 04-46]
provides:
  - 견적 표가 서버 DTO cellEditability(셀별 edit/readonly/locked)와 structuralEditability로 격자·키보드·붙여넣기를 가른다(`editable` 불린 제거)
  - domain/quotes/edit-scope.ts — tableLockLine · quoteTableEmptyState · visibleHintKeys(QuoteHintKey)
  - 표 위 한 줄 순서(복원 줄 → 잠김 줄) · EMPTY 변형(첫 줄 만들기 / 기간 바꾸기 / 담당 PM / 완료 사실)
  - 잠긴 셀 이유 줄(DR-35, CellIssue kind "reason") — Enter·글자·Delete·붙여넣기
  - 새 줄 crypto.randomUUID + isNew(재전송 멱등, ENG-D10) · archivedLineIds · 이동·가운데 삽입일 때만 order 한 번
  - Ctrl+S / 1차 버튼이 열린 편집기를 먼저 커밋하고 저장(useEffectEvent 지연)
affects: [04-19, 04-23, 04-24, 04-47, 04-49]
tech-stack:
  added: []
  patterns: [server-decided cell editability, blocked-cell reason via grid keyboard hook, save deferred to next commit with useEffectEvent]
key-files:
  created:
    - test/e2e/quote-edit-scope.spec.ts
  modified:
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - domain/quotes/edit-scope.ts
    - ui/table/Table.tsx
    - ui/table/types.ts
    - ui/table/use-grid-keyboard.ts
    - test/unit/domain/quote-edit-scope.test.ts
    - test/e2e/project-period.spec.ts
    - test/e2e/quote-table.spec.ts
decisions:
  - 정산 새 줄의 셀 단계(newLineCells)는 클라이언트가 lineCellEditability를 부르지 않고 page.tsx(서버)가 계산해 prop으로 넘긴다 — 셀 단계 판정은 서버 한 곳
  - 잠긴 셀 이유는 오류가 아니다 — CellIssue에 kind "reason"을 더해 aria-invalid·오류 칸 수(errorCellCount)에서 뺀다
  - 줄 이동은 자리를 바꾼 두 줄을 모두 dirty로(A-03) — 옮긴 줄의 충돌을 「그 값으로」 풀어도 dirty 2가 남는다
  - Ctrl+S는 열린 편집기를 blur로 커밋한 뒤 저장 요청 카운터를 올리고, useEffectEvent가 커밋된 상태로 handleSave를 부른다
metrics:
  duration: 39min
  completed: 2026-09-25
requirements-completed: [PROJ-02, UX-05, UX-04]
plan_head_before: 8c314026431884efe16b955eacc716b5e35a6059
commits: 4
actuals:
  tokens: 13098
  tasks: 2
  commits: 4
---

# Phase 4 Plan 30: 견적 표 셀 단계 격자 · 구조 컨트롤 · 표 위 한 줄 · EMPTY · 순서 전송 Summary

견적 표의 `editable` 불린을 서버가 정한 셀별 단계(cellEditability)와 구조 판정(structuralEditability)으로 바꿨다. 정산 PM은 기존 줄에서 실행가만, 새 줄에서는 수량 1·단가 0을 고정한 채 나머지 칸을 고친다. 잠긴 칸을 누르면 이유 한 줄을 보여 준다. 새 줄은 uuid로 만들어 다시 보내도 한 번만 저장되고, 순서는 이동이나 가운데 삽입이 있을 때만 한 번 싣는다.

## Tasks

| # | 이름 | RED | GREEN |
|---|------|-----|-------|
| 1 (tracer) | 정산 PM 견적 표를 서버 셀 단계로 열고, 실행가만 고쳐 저장(DTO → 격자 → 키보드 → 저장 → E2E) | 1fd4a4d | 77d82a2 |
| 2 | 구조 컨트롤 · 정산 새 줄 · 표 위 한 줄 · 잠긴 셀 이유 · 힌트 줄 · EMPTY · 삭제·취소 모달 · 순서 전송 | 8bfe103 | ed68368 |

## RED 증거

- **Task 1 (E2E `quote-edit-scope.spec.ts`)**
  - 첫 RED 실행: 3 failed / 2 passed. 트레이서는 옛 불린 격자에서 기존 줄 단가 셀의 `aria-readonly`가 `"false"`로 받혀 실패했다. 이것이 04-12 DOM 감사 FAIL을 그대로 재현한 것이다.
  - 둘째 RED 실행(스펙 보강 뒤): 2 failed / 3 passed. `(e3)` 편집기를 연 채 Control+s가 실패했다.
  - `check tdd-red-evidence`: RED_EVIDENCE_OK. Playwright 줄 로그를 TAP 요약으로 바꿔 넣었다.
- **Task 2 (단위 `quote-edit-scope.test.ts`)**
  - 13 failed / 23 passed(36). 시그니처만 둔 스텁이라 전부 단언에서 실패했다.
  - 예: `expected null to be '정산 · 실행가와 새 줄만'`, `expected { message: '' } to deeply equal { message: '이 프로젝트에 견적 줄이 없습니다', action: addLine }`.
- **Task 2 (E2E)**
  - 9 failed / 8 passed(17). 실패한 것은 (a)(c)(c2)(e)(f)(g)(h)(i)(j)이다.
  - `check tdd-red-evidence`: RED_EVIDENCE_OK.
  - (b)(c3)(d)는 구현 전에 이미 통과했다. Task 1이 정산 새 줄의 셀 단계와 완료 읽기 표를 먼저 이어 놓았기 때문이다(아래 편차 4).

## 검증(실행 결과)

- **Task 1**
  - 단위: 36/36
  - E2E: quote-edit-scope · quote-table · project-period 39/39
  - lint · typecheck 0, `pnpm build` 성공
- **Task 2**
  - 단위 `quote-edit-scope.test.ts`: 36/36
  - `CI=true` E2E(프로덕션 빌드, webServer `pnpm build && pnpm start`):
    - quote-edit-scope · archive · project-period · quote-table: **52/52**
    - 프로젝트 화면 스펙 ledger-save-flow · project-lifecycle · revenue-section · number-format · project-register: **34/34**
  - `pnpm lint` 0 errors(기존 boundaries 설정 경고만), `pnpm typecheck` 0
  - `lint:sql`: SQL을 건드리지 않아 대상 아님
- **acceptance grep**
  - `실행가와 새 줄만` 리터럴은 `domain/quotes/edit-scope.ts` 한 곳뿐이다(app·ui에 없음).
  - 새 줄 경로 셋(Ctrl+Enter·줄 추가 / 복제 / 붙여넣기 넘침)과 복원이 모두 `newDraftLine`을 거친다. `newDraftLine`은 `crypto.randomUUID()`를 쓴다.
  - 줄별 `sortOrder`는 없다.
  - `errorCellCount`는 cellErrors와 cellConflicts만 센다(reason 제외).
  - package.json · pnpm-lock.yaml은 d6b41cf 대비 변경이 없다.
- 전체 `CI=true pnpm test`는 지시에 따라 돌리지 않았다.

## Deviations from Plan

**1. [Rule 3 - Blocking] 플랜 files 밖 CSS 한 줄**
- `project-detail.module.css`에 `.lockLine`을 더했다. 토큰은 `--s-2`·`--muted`·`--fs-sm`만 쓴다.
- 표 위 잠김 줄을 렌더할 클래스가 없어서 필요했다.
- 커밋: ed68368

**2. [Rule 1 - 기존 스펙 조정] project-period (3)(3b)**
- 0줄 정산 표를 팀장이 열면, 플랜이 정한 EMPTY 「기간 바꾸기」와 기간 칸의 「기간 바꾸기」가 같은 이름으로 둘이 된다.
- 그래서 `getByRole("button", { name: "기간 바꾸기" })`가 strict 위반으로 실패했다.
- 기간 칸 여는 버튼을 `#period-open`(quote-table.tsx의 PERIOD_TRIGGER_ID)으로 골랐다. 대상 요소는 전과 같고 단언을 느슨하게 하지 않았다.
- 커밋: ed68368

**3. [Rule 1 - 기존 스펙 조정] quote-table 「옮긴 줄의 충돌을 그 값으로 풀어도…」**
- 플랜 ④가 「옮긴 두 줄 모두 dirty」를 정했으므로, `/일괄 저장 1/`을 `/일괄 저장 2/`로 바꿨다.
- 옛 `1`은 새 동작에서 "옮긴 줄이 빠지고 제자리 줄만 남는" 회귀를 잡지 못한다.
- 돌연변이로 확인했다. `resolveConflict`의 `|| taken.moved === true`를 지우자 새 단언이 실패했고(`일괄 저장 2` 없음), 원복했다.
- 커밋: ed68368

**4. [기록] Task 2 E2E 일부가 구현 전에 통과**
- (b) 정산 새 줄 수량 1·단가 0, (c3) 완료 PM 읽기 표, (d) 발행 요청·마감 버튼 없음은 Task 1 GREEN이 이미 성립시켰다.
- 이 셋은 회귀 고정용으로 남긴다.

**5. [기록] (e2) 테스트는 Enter 커밋 뒤 셀에 다시 포커스한 뒤 Ctrl+S를 누른다**
- Enter로 편집을 커밋하면 포커스가 body로 떨어진다. probe로 확인했다.
- 이것은 04-04 격자에 원래 있던 동작이고, 포커스 모델은 04-19 소관이다.
- quote-table (a) 스펙의 관례를 따랐다.

**6. [기록] (j) 복원 줄 locator를 `p`로 좁혔다**
- dev 실행에서는 수화 불일치 오버레이의 diff 글자(`+ 저장 안 한 편집 1칸`)가 두 번째로 잡혔다.
- 원인은 04-22 `use-dirty-storage.ts:100`이 초기 렌더에서 localStorage로 `restorableCount`를 초기화하는 기존 수화 불일치다. RED 실행 때도 이미 있었다.
- 이 플랜에서 고치지 않았다(범위 밖). 04-22 소관으로 남긴다.

## 이월(carry-over) 처리

- **닫음 — 04-12 DOM 감사 FAIL:** 정산 프로젝트의 기존 줄은 실행가만 편집된다.
  - 트레이서 E2E가 옛 불린 격자에서 실패했다(aria-readonly `"false"`). 지금은 통과한다.
- **남김 — DR-36 → 04-49 소관 확인.** DR-14 · DR-24 · DR-3(좁은 폭 편집·열 접기·1024 미만 보기 전용)도 04-49 소관이라 구현하지 않았다.
  - EMPTY의 1024 미만 「첫 줄 만들기」 빼기도 04-49가 한다.
- **플랜 오기 — PLAN:334의 "Task 3 ④"는 낡은 참조다.** 이 플랜에는 Task가 둘뿐이고, 해당 항목(DR-14 · DR-24 · DR-36)은 04-49로 옮겨졌다. 플랜 파일은 고치지 않았다.
- **한도 풀리면 Codex 재확인 필요:** Codex 사용 한도(09-29까지) 때문에 교차 검토를 하지 못했다.

## UX 원칙과 부딪치는 점(기록만 — 범위는 넓히지 않음)

- 편집기가 열린 동안 1차 「일괄 저장」은 aria-disabled "바뀐 칸 없음"으로 보인다. 그런데 누르면 커밋하고 저장한다. 보이는 상태와 실제 동작이 다르다.
- 네트워크 실패 문구가 rev 5에 없다. (i)는 「일괄 저장 1」이 남는 것을 실패 신호로 쓴다.
- Enter로 커밋하면 포커스를 잃는다(키보드만으로 이어 입력하기, §7). 04-19 소관이다.
- 붙여넣기 넘침으로 생긴 줄은 항상 편집 가능하다. 04-47 소관이다.
- 0줄 정산 표를 팀장이 보면 「기간 바꾸기」가 두 개다(표 밖 칸 + EMPTY). 같은 동작이지만 보조기기에서는 이름만으로 구별되지 않는다.

## 메모(남은 것)

- `app/(app)/projects/actions.ts:142`는 id 없는 줄에 서버 uuid를 붙이는 과도기 경로를 그대로 둔다. 입력 스키마의 id 필수화는 하지 않았다.
- 복제 줄의 `duplicatedFrom`은 보내지 않는다.
- 새 줄 셀 단계(newLineCells)는 서버가 계산해 prop으로 넘긴다(decisions 참조).

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: test/e2e/quote-edit-scope.spec.ts · domain/quotes/edit-scope.ts · app/(app)/projects/[id]/quote-table.tsx
- FOUND commits: 1fd4a4d · 77d82a2 · 8bfe103 · ed68368 (`git rev-list --count 8c31402..HEAD` = 4)
