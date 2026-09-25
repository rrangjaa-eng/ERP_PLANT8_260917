---
phase: 04-project-quote-ledger
plan: 24
subsystem: ui
tags: [nextjs, react, next-safe-action, ui-table, confirm-dialog, localStorage, playwright]
status: complete

requires:
  - phase: 04-14
    provides: createRevisionAction · setCustomerApprovalAction · listRevisionSummaries · listRevisionLinesAction · 승인 게이트 문구
  - phase: 04-40
    provides: lineCellEditability·quoteLockReason·tableLockLine의 approvedSeq 축
  - phase: 04-46
    provides: ui/confirm-dialog(교차 그룹 계약 2) · Button aria-disabled 계약
  - phase: 04-22
    provides: D-68 보관 배선(persist) · unsavedEditsReason
provides:
  - 「복사해 새 차수」 다이얼로그(NewRevisionDialog)
  - 고객 승인 표시·취소 다이얼로그 + 부제 옆 승인 줄(CustomerApprovalLine)
  - 승인 차수 잠김 표시(approvedSeq → 새 줄 칸 단계·잠김 이유·표 위 한 줄)
  - 차수 섹션(RevisionSection) + 이전 차수 읽기 섹션(PreviousRevisionSection)
  - quoteLineReadColumns(열마다 copyText) · QuoteLineCopyRow · quoteLineClipboard · quoteLineClipboardMeta(W1 — 04-19가 가져다 씀)
  - findOtherRevisionDrafts · EnumerableDirtyStorage · PreviousRevisionDraftRow(DR-4)
  - ConfirmDialog primary.blockedBy(근거 칸 오류 id를 1차 aria-describedby로)
affects: [04-19, 04-47, 04-15, 04-16, 04-41]

actuals:
  tokens: 23765
  tasks: 4
  commits: 8
plan_head_before: 2dac7328eba7a531cd8ef73d7f13a87185a8774e

tech-stack:
  added: []
  patterns:
    - "RSC → 클라이언트에는 함수 prop 대신 직렬화 가능한 props 객체(newRevision·customerApproval)를 넘기고 QuoteLedger가 dirtyCount와 함께 그린다"
    - "닫힌 <dialog>는 <p> 밖에 — 트리거만 줄 안에(line 렌더 함수)"
    - "성공 뒤 트리거가 사라지면 언마운트 정리에서 h1 포커스(status-change 선례)"
    - "서버 액션을 직접 await해 순번별 결과를 컴포넌트 상태에 캐시(다시 열면 요청 없음)"

key-files:
  created:
    - app/(app)/projects/[id]/revision-dialogs.tsx
    - app/(app)/projects/[id]/revision-section.tsx
    - app/(app)/projects/[id]/previous-revision.tsx
    - test/e2e/quote-revisions.spec.ts
  modified:
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - ui/confirm-dialog/ConfirmDialog.tsx
    - ui/table/use-dirty-storage.ts
    - domain/projects/period.ts
    - test/unit/ui/confirm-dialog.test.ts
    - test/unit/ui/dirty-storage.test.ts
    - test/e2e/quote-table.spec.ts
    - test/e2e/project-register.spec.ts

key-decisions:
  - "04-24: 머리 줄 차수 버튼은 RSC가 함수 prop을 넘길 수 없어 직렬화 props 객체 + QuoteLedger 렌더(statusChange 선례)로 그린다"
  - "04-24: 승인일 형식 오류는 칸 아래 Form.Error 한 자리 — ConfirmDialog에 blockedBy(오류 id) 추가, 1차 왼쪽 이유 자리에는 다시 쓰지 않는다"
  - "04-24: 승인 표시·취소 뒤 새로 고침은 칸 단계만 서버 값으로 갈고 편집 값은 그대로 둔다(approvedSeq 변화 감지)"
  - "04-24: 부제는 적용 규칙 S3의 `{번호} · 상세 견적 {n}차` 그대로 — quoteDisplayNumber(`26001-2차`)를 부제에 넣지 않았다(S3에 자리 없음 · 기존 E2E 정확 일치)"

requirements-completed: [PROJ-07, PROJ-05, UX-04]

duration: 66min
completed: 2026-09-25
---

# Phase 4 Plan 24: 차수 화면(새 차수 · 고객 승인 · 차수 섹션 · 이전 차수 보관본) Summary

상세 화면에 ConfirmDialog 기반 「복사해 새 차수」·고객 승인 표시/취소(승인일 근거 칸 · 기준값 · 미저장 막힘), 승인 차수 잠김 표시, ui/table 읽기 표의 차수 섹션과 한 번만 받는 이전 차수 읽기 섹션, 같은 프로젝트 다른 차수 보관본을 표 위 한 줄로 되찾는 「복사 / 버림」을 붙였다. 견적 줄 복사 형식(`copyText` + 앱 형식 JSON)의 유일한 정의를 `previous-revision.tsx`에 두었다.

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 RED | `fd53866` | test: 새 차수 다이얼로그 E2E 4건(실패) |
| 1 GREEN | `a42f3c6` | feat: 「복사해 새 차수」 다이얼로그 · page props · 차수 바뀜 시 원장 다시 그리기 |
| 2 RED | `afde973` | test: 고객 승인 E2E 9건 + ConfirmDialog blockedBy 단위 1건(실패) |
| 2 GREEN | `cb8e30a` | feat: 승인 표시·취소 · 부제 승인 줄 · approvedSeq 잠김 표시 · blockedBy |
| 3 RED | `05faf7e` | test: 차수 섹션·이전 차수 읽기 섹션 E2E 6건(실패) |
| 3 GREEN | `db70a4e` | feat: RevisionSection · PreviousRevisionSection · quoteLineReadColumns |
| 4 RED | `edb66c5` | test: findOtherRevisionDrafts 단위 3건 + 복원 줄 E2E 3건(실패) |
| 4 GREEN | `085ad14` | feat: PreviousRevisionDraftRow · quoteLineClipboard · findOtherRevisionDrafts |

## 스킬 호출 기록

- `test-driven-development`: 태스크 1·2·3·4 구현 전 각 1회(4회)
- `verification-before-completion`: 8개 태스크 커밋 직전 각 1회(fd53866 · a42f3c6 · afde973 · cb8e30a · 05faf7e · db70a4e · edb66c5 · 085ad14) + 문서 커밋 직전 1회
- `systematic-debugging`: 2회 — ① quote-table.spec (c)(d)(e) CI 실패(닫힌 승인 다이얼로그 부제의 합계가 페이지 전체 금액 로케이터에 먼저 걸림) ② 두 탭 E2E 「복사」 실패(줄 수신 전에 눌러 `복사하지 못함` — 계획대로의 동작, 테스트가 수신 응답을 기다리게 함)
- RED 증거: 네 태스크 모두 `gsd-tools check tdd-red-evidence` → RED_EVIDENCE_OK

## 실행한 테스트(요약)

- 단위: `vitest --project unit` dirty-storage + confirm-dialog **28/28**
- E2E(dev): `quote-revisions.spec.ts` **22/22**
- E2E(`CI=true`, 프로덕션 빌드): quote-revisions + quote-table + quote-edit-scope **72 통과 · 1 실패** → 원인(아래 편차 5) 수정 뒤 quote-table + project-register + revenue-section **30/30**. 태스크 2 시점 CI=true quote-revisions+quote-edit-scope+quote-table+quote-line-kinds 76 통과(1 실패 → 같은 원인 수정 뒤 quote-table 16/16), project-register+revenue-section 14/14, 태스크 3 시점 CI=true quote-revisions+quote-table 35/35
- `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm build` 0 (최종 커밋 직전)
- 플랜 검증: `git diff --stat d6b41cf -- ui/history-list` 빈 출력(얕은 클론을 `--deepen=400`으로 늘린 뒤 확인) · package.json/pnpm-lock d6b41cf 대비 무변경 · 04-24 커밋이 UI-SPEC을 건드리지 않음 · 전제 `persist(` 1건(이 플랜 diff가 더하지 않음) · 앱 형식 JSON을 만드는 곳은 `previous-revision.tsx`뿐
- **하지 않은 것(오케스트레이터 몫):** 독립 DOM 감사(1280 · 1024 · 375)와 전체 게이트 `CI=true pnpm test` — 지시대로 실행자가 돌리지 않았다. 태스크 4 ⑤의 폭별 실측값은 이 SUMMARY에 없다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 머리 줄 렌더 함수 prop 불가 → 직렬화 props 객체**
- **Found during:** Task 1 · **Issue:** 플랜의 「머리 줄 렌더 함수 prop(`{ dirtyCount }`)」은 RSC(page)에서 클라이언트로 함수를 넘길 수 없다.
- **Fix:** `newRevision` · `customerApproval` props 객체를 page가 만들고 QuoteLedger가 `dirtyCount`와 함께 그린다(statusChange 선례). 미저장 막힘은 같은 `unsavedEditsReason` 한 함수.
- **Commit:** a42f3c6, cb8e30a

**2. [Rule 1 - Bug] 새 차수·승인 변화 뒤 원장이 옛 줄·옛 칸 단계를 들고 있음**
- **Found during:** Task 1 · Task 2 · **Fix:** revisionId가 바뀌면 기존 상태 바뀜 재설정 경로로 다시 그리고, approvedSeq만 바뀌면 칸 단계만 서버 DTO/새 줄 판정으로 갈아 끼운다(편집 값 유지). E2E 「승인 표시 취소 → 수량 다시 편집」이 고정.
- **Files:** quote-table.tsx · **Commit:** a42f3c6, cb8e30a

**3. [Rule 2 - Missing] 승인일 형식 오류를 한 자리에만 쓰는 방법이 ConfirmDialog에 없음**
- **Found during:** Task 2 · **Issue:** `disabledReason`은 1차 왼쪽에 글자를 그려, 칸 아래 Form.Error와 두 자리가 된다(플랜 「같은 사실을 두 자리에 쓰지 않는다」). 04-46 SUMMARY에 이유 id를 잇는 방법이 없었다.
- **Fix:** `ConfirmDialogPrimary.blockedBy?: string`(오류 요소 id) — 1차 aria-disabled + aria-describedby, 이유 자리 비움, Ctrl+Enter 무시. 단위 테스트 1건.
- **Files:** ui/confirm-dialog/ConfirmDialog.tsx · test/unit/ui/confirm-dialog.test.ts · **Commit:** afde973, cb8e30a

**4. [Rule 3] 날짜 형식 판정·문구 재사용**
- `domain/projects/period.ts`의 모듈 지역 `isCalendarDate`·`FORMAT_ERROR`에 `export`만 더해 승인일 칸이 같은 판정·문구를 쓴다(두 번째 구현 없음). 승인일 칸은 기간 칸 선례대로 `type="text"`(inputMode numeric · placeholder 2026-09-18).
- **Commit:** cb8e30a

**5. [Rule 1 - Bug, 테스트] 닫힌 승인 다이얼로그 부제의 합계가 기존 E2E의 페이지 전체 금액 로케이터에 걸림**
- **Found during:** Task 2 · Task 4 CI=true · **Issue:** `page.getByText("1,500,000").first()`가 숨은 `<dialog>` 부제(`상세 견적 1차 · 1,500,000`)를 먼저 잡아 hidden으로 실패(타이밍에 따라).
- **Fix:** quote-table.spec 두 곳 · project-register.spec 한 곳을 `page.locator("table")` 안으로 좁혔다(느슨하게가 아니라 좁힘).
- **Commit:** cb8e30a, 085ad14

**6. [테스트 보정] E2E 두 곳**
- 「차수 열기」 토글은 라벨이 `차수 닫기`로 바뀌므로 이름이 아니라 행 버튼으로 잡음(db70a4e). 복원 줄 「복사」 전에 그 차수 줄 수신 응답(`waitForResponse`)을 기다림 — 받기 전 클릭은 계획대로 `복사하지 못함`(085ad14).

### 계획과 다르게 둔 것 · 충돌 기록

- **표시 번호 `26001-2차`를 부제에 넣지 않음:** 플랜 ③은 부제에 `quoteDisplayNumber`를 요구하나 UI-SPEC 적용 규칙 S3 부제(`26001 · 상세 견적 2차 · 고객 승인 …`)에 그 자리가 없고 플랜이 적용 규칙을 정본으로 둔다. 기존 E2E가 부제를 정확 일치로 단언한다. 부제는 서버가 만든 문자열 그대로, 승인 줄은 부제 바로 아래 `.periodLine` 한 줄(`고객 승인 {날짜} {이름}` + 3차 버튼)로 그렸다.
- **승인자 이름:** 요약 DTO의 `approvedBy`는 사용자 id라 page가 `getPerson`(도메인)으로 이름을 읽는다(`person.value` 노출이 없으면 날짜만).
- **`계산 불가 · 환율 없음` 배지:** 현재 견적 줄 표에 없는 모양이라 읽기 표에도 만들지 않았다(재사용할 대상 없음).
- **표 LOADING 뼈대:** ui/table에 뼈대가 없어 `project-detail.module.css`에 `.previousSkeleton`(머리글 + `--surface` 행 셋, CSS 300ms 지연)을 토큰만으로 더했다.
- **읽기 열의 번호(`sort`)**는 `quoteLineReadColumns(references, rowNumber)`의 두 번째 인자로 받는다(행 모양에 순번이 없어서).
- **복사 줄의 계산 열(견적가·차익):** 견적 줄 표와 같이 저장 전에 다시 계산하지 않고 그 차수 DTO 값을 둔다.
- `page.tsx`의 `<QuoteLedger>`를 프래그먼트로 감싸며 들여쓰기를 바꾸지 않았다(외과적 변경 — 포매터 미강제 파일).

## UI-SPEC rev 5 밖 화면 글자

- 새로 만든 화면 글자는 모두 rev 5 Copywriting · 적용 규칙 S3/S5/S16/S18에 있는 문구다. 형식상 차이: 오류 줄은 `ListEmpty`가 `1차 불러오지 못함` + 2차 버튼 「다시 시도」로 그려 가운데 `·` 글리프가 없다 · 줄 수 칸은 `{n}줄`(S5 예시 `6줄` 꼴) · 승인 다이얼로그 부제 `상세 견적 {n}차 · {합계}`는 플랜 문구.
- 04-40의 셀 오류 네 문구(환율·외화 금액·수량·차익 상한)는 이 플랜이 새로 화면에 올리지 않았다.

## Known Stubs

없음.

## 열린 항목

- 독립 DOM 감사(1280 · 1024 · 375, 항목 (a)~(e))와 전체 게이트 `CI=true pnpm test` — 오케스트레이터 몫(미실행).
- 04-49 열린 이슈(1024 미만에서 열린 매출 표 입력 값이 사라질 수 있음) — 이 플랜 범위 밖, 여전히 열림.
- UI-SPEC 적용 규칙 S4 ③(승인 차수에서 견적가 ≠ 0 줄의 Delete는 모달을 열지 않음) — 이 플랜 태스크에 없어 손대지 않음.
- 표시 번호(`26001-2차`)의 부제 자리 — 위 충돌 기록대로 UI-SPEC 쪽 결정 필요.
- 복원 줄 「복사」는 그 차수 줄을 받기 전(로드 직후 수백 ms)에 누르면 `복사하지 못함`이고 다시 누르면 된다(계획대로) — 사용감 점검 대상.
- 읽기 표 30줄 쪽 나눔 · 쪽 전환 제목 포커스는 04-19 몫(W2).

## Self-Check: PASSED

- 생성 파일 존재: revision-dialogs.tsx · revision-section.tsx · previous-revision.tsx · quote-revisions.spec.ts — FOUND
- 커밋 존재: fd53866 · a42f3c6 · afde973 · cb8e30a · 05faf7e · db70a4e · edb66c5 · 085ad14 — FOUND
