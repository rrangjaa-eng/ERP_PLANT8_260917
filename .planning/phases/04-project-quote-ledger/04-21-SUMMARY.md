---
phase: 04-project-quote-ledger
plan: 21
subsystem: ui
tags: [project-status, confirm-dialog, lifecycle, action-log, e2e, next-safe-action]

# Dependency graph
requires:
  - phase: 04-project-quote-ledger
    provides: "04-20 statusDestinations · changeProjectStatusAction · 게이트 문자열 / 04-09 코드표(listProjectStatusCatalog) / 04-46 ui/confirm-dialog"
provides:
  - "상세 머리 줄 「상태 바꾸기」·「진행으로 되돌리기」(status-change.tsx) — 목록형 → 확인 모달 → 서버 전환, 즉시 경로, 막힘 이유 표시"
  - "머리 줄 부제 `{번호} · 상세 견적 {n}차 · {상태} {마지막 변경일}` (lastStatusChangeOn — action_log 최신 한 줄, 없으면 등록일)"
  - "PROJECT_STATUS_TAG_KIND 공용 표(목록·상세 공유), 목록 상태 필터·라벨을 코드표에서"
  - "unsavedEditsReason — 저장 안 한 편집이 있으면 상태 바꾸기 막힘"
  - "폰(<700px) 머리 줄 순서 + 복사 동작 「더보기」 슬롯(HeaderCopyActions)"
  - "repositories/action-log.findLatestActionFor"
  - "ui/confirm-dialog 목록형 2차 `취소 Esc` · 막힌 1차 이유 한 번만 보이기"
affects: [04-22, 04-23, 04-31]

# Actuals (#2632) — chars/4 실측(85044fe..HEAD diff), 커밋은 이 SUMMARY 커밋 제외
actuals:
  tokens: 18727
  tasks: 3
  commits: 8
plan_head_before: 85044fe1a4fe00d46fbe8fc16e5eb8fa22b77eda

tech-stack:
  added: []
  patterns:
    - "전환 성공 후 revalidatePath가 상세를 새로 고치지 않으므로 클라이언트가 router.refresh()"
    - "토스트 상태는 상위(QuoteLedger)에 둔다 — 전환 뒤 갈 곳이 없어져 StatusChange가 사라져도 토스트가 남는다"
    - "제출 래치(ref) + ConfirmDialog primary.pending 이중 방어"

key-files:
  created:
    - app/(app)/projects/status-display.ts
    - app/(app)/projects/[id]/status-change.tsx
    - app/(app)/projects/[id]/unsaved-edits.ts
    - test/unit/app/unsaved-edits.test.ts
    - test/e2e/project-lifecycle.spec.ts
  modified:
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects-table.tsx
    - domain/projects/status.ts
    - domain/projects/index.ts
    - domain/quotes/lines.ts
    - repositories/action-log.ts
    - ui/confirm-dialog/ConfirmDialog.tsx
    - ui/confirm-dialog/ConfirmDialog.module.css
    - test/unit/domain/project-status.test.ts
    - test/integration/project-status.test.ts
    - test/unit/ui/confirm-dialog.test.ts

key-decisions:
  - "마지막 변경일은 action_log(entity=project, project.status_changed) 최신 한 줄(occurred_at DESC, seq DESC, prune 표시 줄 포함)의 KST 날짜, 없으면 프로젝트 등록일"
  - "막힌 1차의 보이는 이유는 ConfirmDialog 왼쪽 .reason 하나 — Button 자체 이유 span은 CSS로 숨기고 aria-describedby 대상으로만 남긴다"
  - "미수주 「진행으로 되돌리기」 확인 필요 조건 = 종료일(없으면 시작일) < KST 오늘 || 현재 차수 고객 승인 전 — 승인 여부는 CurrentQuoteRevisionInfo.approved로 내려받는다"

patterns-established:
  - "폰 머리 줄 재배치: .titleBlock display:contents + order, 복사 동작은 「더보기」 토글 뒤로"

requirements-completed: [PROJ-04]

coverage:
  - id: T1
    description: "수주중 → 진행 트레이서(목록형 → 확인 → 토스트 → 태그·부제 갱신)"
    requirement: "PROJ-04"
    verification:
      - kind: e2e
        ref: "test/e2e/project-lifecycle.spec.ts#트레이서"
        status: pass
  - id: T2
    description: "나머지 분기(미수주 닫기·되돌리기 즉시/확인, 정산→완료 대표만, 다른 팀 팀장 버튼 없음, 게이트 막힘, 동시 변경 거부), 마지막 변경일 부제, 목록 상태 색·라벨"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "test/unit/domain/project-status.test.ts"
        status: pass
      - kind: integration
        ref: "test/integration/project-status.test.ts#(i)(i2)"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-lifecycle.spec.ts#(b)(b2)(b3)(c)(d)(e)(g)(h)"
        status: pass
  - id: T3
    description: "저장 안 한 편집 막힘, 폰 머리 줄 순서·「더보기」"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "test/unit/app/unsaved-edits.test.ts"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-lifecycle.spec.ts#(a)(i)(f)"
        status: pass

duration: 43min
completed: 2026-09-25
status: complete
---

# Phase 4 Plan 21: 프로젝트 상태 바꾸기 화면 Summary

**상세 머리 줄에 서버가 준 갈 곳만 보이는 「상태 바꾸기」·「진행으로 되돌리기」(목록형 → 확인 모달 → 서버 전환, 막힘은 게이트 문자열 그대로)와 action_log 기반 `{상태} {마지막 변경일}` 부제, 목록·상세 공용 상태 색 표를 붙였다.**

## Performance

- **Duration:** 약 43분 (기준 커밋 03:02 → 마지막 코드 커밋 03:46 UTC)
- **Completed:** 2026-09-25
- **Tasks:** 3/3
- **Files modified:** 19

## Accomplishments

- 트레이서: 수주중 프로젝트에서 「상태 바꾸기」 → 목록형(진행·미수주, 코드표 설명 2행, `취소 Esc`) → 확인 모달 `진행으로 바꾸기` → 토스트 `진행으로 바꾸기 · {번호}` → 태그·부제 갱신
- 나머지 분기: 미수주 닫기, 미수주 → 진행 되돌리기(즉시 / 종료일 지남·승인 전이면 확인 모달), 정산 → 완료(대표·시스템 관리자만), 다른 팀 팀장은 버튼 없음, 시작일 없음 게이트는 제출 전부터 1차 aria-disabled, 동시 변경 거부 문자열이 1차 왼쪽에 붙고 모달 유지
- 부제의 마지막 변경일(action_log 최신 한 줄 · 없으면 등록일), 목록 상태 필터·라벨을 코드표에서, 옛 `settled` 리터럴 제거(단위 테스트로 재발 차단)
- 저장 안 한 편집이 있으면 `저장 안 한 편집 {n}칸 · 먼저 일괄 저장`으로 트리거 막힘, 폰 머리 줄 순서와 복사 동작 「더보기」

## Task Commits

1. **Task 1: 트레이서(수주중 → 진행)**
   - RED `916035b` test — E2E 트레이서 1 failed
   - RED `bf0fb2e` test — ConfirmDialog 목록형 2차: 단위 1 failed / 16 passed
   - GREEN `c820cc4` fix — ConfirmDialog 목록형 2차 렌더: 단위 17/17
   - GREEN `b19ff10` feat — 트레이서: CI=true E2E 10 passed
2. **Task 2: 나머지 분기 · 마지막 변경일 · 목록 표시**
   - RED `00d9c85` test — 단위 3 failed / 92 passed, 통합 2 failed / 20 passed, E2E 5 failed
   - GREEN `e4d6e20` feat — 단위 95 passed, 통합 872 passed, CI=true E2E 47 passed
3. **Task 3: 저장 안 한 편집 막힘 · 폰 머리 줄**
   - RED `3e3ad22` test — 단위(unsaved-edits 모듈 없음) 실패, E2E (a)·(i)·(f) failed
   - GREEN `1865707` feat — lint·typecheck·lint:sql·build 0, 단위 1055 passed, CI=true E2E 198 passed / 0 failed

트레이서 게이트: 대화형 · end-of-phase · 자동 verify만 → verify 재실행 통과 후 확장(3행 규칙).

## Gates Run

| 게이트 | 결과 |
|--------|------|
| `pnpm lint` | 0 오류 |
| `pnpm typecheck` | 0 오류 |
| `pnpm lint:sql` | 0 오류 |
| `pnpm build` | 성공 |
| 단위(vitest) | 1055 passed |
| 통합 project-status 포함 | 872 passed (Task 2 시점, 전경·단독 실행) |
| E2E `CI=true` project-lifecycle | 198 passed / 0 failed (모바일 프로젝트가 데스크톱 의존이라 의존 프로젝트까지 함께 실행됨) |

전체 게이트 `CI=true pnpm test`는 오케스트레이터 지시대로 돌리지 않았다.

**변이 검증(단언을 바꾸거나 새로 쓴 곳):**
- M1 ConfirmDialog 이유 숨김 CSS 제거 → (a) 실패
- M2 제출 래치만 제거 → (h) 통과(Button pending 가드가 막음), M3 래치 + pending 둘 다 제거 → (h) 실패
- action_log seq 정렬 제거 → 처음엔 살아남음 → (i2)에 명시 bigSeq 역순 삽입 케이스 추가 후 실패

## Files Created/Modified

- `app/(app)/projects/[id]/status-change.tsx` — 상태 바꾸기 클라이언트(목록형 · 확인 · 즉시 경로 · 거부 표시 · 래치)
- `app/(app)/projects/[id]/unsaved-edits.ts` — 저장 안 한 편집 막힘 문자열
- `app/(app)/projects/status-display.ts` — 상태 → 태그 색 표
- `app/(app)/projects/[id]/page.tsx` — 갈 곳·코드표·마지막 변경일 조회, 부제·statusChange 조립
- `app/(app)/projects/[id]/quote-table.tsx` — 머리 줄 배치, 토스트, HeaderCopyActions
- `app/(app)/projects/[id]/project-detail.module.css` — 폰 머리 줄 순서 · 더보기
- `app/(app)/projects/page.tsx` · `projects-table.tsx` — 코드표 라벨·필터, 공용 색 표
- `domain/projects/status.ts` — lastStatusChangeOn
- `domain/projects/index.ts` — ProjectDto.createdAt
- `domain/quotes/lines.ts` — CurrentQuoteRevisionInfo.approved
- `repositories/action-log.ts` — findLatestActionFor
- `ui/confirm-dialog/ConfirmDialog.tsx` · `.module.css` — 목록형 2차, 이유 한 번만

## Decisions Made

frontmatter key-decisions 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ConfirmDialog 목록형에 2차 `취소 Esc`가 없었다 (04-46 결함)**
- **Found during:** Task 1
- **Issue:** primary가 없으면 actions 영역 전체가 렌더되지 않아 UI-SPEC rev 5 「상태 고르기 목록」의 2차가 빠짐
- **Fix:** actions div는 항상 렌더, 1차 부분만 primary 조건부
- **Files modified:** ui/confirm-dialog/ConfirmDialog.tsx, test/unit/ui/confirm-dialog.test.ts
- **Commit:** bf0fb2e(RED) · c820cc4(GREEN)
- 플랜 files_modified 밖 파일.

**2. [Rule 1 - Bug] 막힌 1차의 이유 글자가 두 번 보였다 (04-46 결함)**
- **Found during:** Task 3 (a) strict-mode 위반
- **Issue:** ConfirmDialog 왼쪽 `.reason`과 Button 자체 이유 span이 둘 다 보임
- **Fix:** `.primaryWrap > span > span { display: none; }` — Button 이유는 aria-describedby 대상으로만 남김. 테스트는 보이는 이유 정확히 1개 · 1차 왼쪽 위치 · toHaveAccessibleDescription 단언
- **Files modified:** ui/confirm-dialog/ConfirmDialog.module.css
- **Commit:** 1865707

**3. [Rule 3 - Blocking] 승인 여부를 알 길이 없었다**
- **Found during:** Task 2
- **Issue:** 되돌리기 확인 조건(현재 차수 고객 승인 전)에 필요한 값이 CurrentQuoteRevisionInfo에 없음
- **Fix:** `approved: customerApprovedAt !== null` 추가
- **Files modified:** domain/quotes/lines.ts (플랜 files_modified 밖)
- **Commit:** e4d6e20

**4. [계획·코드 충돌 — 기록] (i) 저장 안 한 편집 E2E를 시스템 관리자로 실행**
- 플랜은 팀장 기준이나 시드의 팀장 권한에 `projects` write가 없어 편집 자체가 불가. 권한을 손으로 켜지 않는다(ENG-D2)는 규칙을 지키려고 시스템 관리자로 실행.

**5. [정정] 동시 변경 거부의 화면 쪽 E2E는 이 플랜 실행 때 없었다**
- 처음 기록("(d)에서 DB로 상태를 바꿔 서버 문자열 확인")은 사실이 아니었다 — (d)는 완료 뒤 줄 잠김 테스트이고, 서버 쪽은 04-20 통합 테스트만 증명했다. 검토(S1) 뒤 E2E (a2)를 더했다: 확인 모달이 열린 사이 DB로 상태를 미수주로 바꾸고 1차를 누르면 `상태가 미수주로 바뀜 · 새로 고침`이 1차 왼쪽에 한 번, 1차 aria-disabled, 모달 유지·토스트 없음(아래 「검토·감사 후 수정」).

**6. [Rule 1 - 테스트 보정] 단언 범위 조정 (변이로 확인)**
- (f) 「더보기」 개수를 `main` 안으로 한정(셸 BottomTabs에도 「더보기」가 있음)
- (i) 저장 신호는 `저장됨 HH:MM` — `/저장됨/`로 맞추고 Ctrl+S 전에 그리드 셀에 포커스
- aria-disabled 버튼 클릭은 `click({force:true})` (Playwright가 enabled로 보지 않음)

**Total deviations:** 자동 수정 3, 기록 3. 새 의존성 없음(package.json·pnpm-lock.yaml이 d6b41cf와 같음).

## Acceptance Greps

- status-change.tsx에 dialog 마크업 0 · spec에 권한 켜기 호출 0 · 고정 날짜 0 · 금지 문구 0
- 「먼저 일괄 저장」은 unsaved-edits.ts에만 · status-change.tsx에 「습니다/됩니다」 0

## 독립 감사 대기

- S7 긴 글 한계: 가장 긴 확인 결과 줄(3줄) + 40자 이름이 480 모달·폰 시트 안에 들어가는지 — 1280 · 1024 · 375
- S3 머리 줄 넘침: 1280 · 1024에서 숨는 버튼·가로 스크롤 0, 375에서 폰 순서·가로 스크롤 0

## Known Stubs

없음.

## Issues Encountered / 다시 볼 것

- 팀장 시드에 `projects` write가 없음 — 의도인지 확인 필요(맞다면 플랜의 팀장 편집 전제가 틀림)
- ~~전환 성공으로 트리거가 사라졌을 때 포커스를 h1로 돌리는 폴백은 실효가 약함(h1에 tabIndex 없음 · 새로 고침 전에 모달이 닫힘)~~ → 검토 B1로 수정(아래)
- 제출 래치는 Button pending 가드 뒤에 있어 단독으로는 변이가 살아남음(M2) — 이중 방어로만 의미

Codex 교차 검토: 한도로 미실행 — 한도 풀리면 Codex 재확인 필요

## 검토·감사 후 수정

**Opus 교차 검토**(`04-21-review-opus.md`, BLOCKER 1 · SHOULD 4 · NIT 6)
- B1 포커스 복귀 — 수정. `548e7af`(RED: 확인 모달 경로·즉시 경로 `toBeFocused` 실패) → `43fa92c`(PageHeader h1 `tabIndex={-1}`, 트리거가 사라지면 StatusChange 언마운트 때 제목에 포커스, 트리거가 남으면 트리거로 — (b)에 단언).
- S1 동시 변경 거부 화면 E2E — `4e17605` (a2). 동작은 이미 있어 곧바로 통과 → onError가 서버 문자열을 버리게 변이시켜 실패 확인 후 되돌림. Deviation 5 정정.
- S2 팀장 시드에 `projects` write 없음 — 04-21 위반 아님(ENG-D2 증명은 시드만으로 섬). 다만 04-22 「팀장이 종료일을 당긴다」(CEO-D13)가 이 권한을 전제하므로 **04-22 전에 사용자 결정 필요**(팀장에게 `projects` write를 줄지, 기간 전용 권한을 둘지).
- S3·S4 백스톱 — 아래 독립 DOM 감사로 판정.
- NIT 미수정(후속): N1 ConfirmDialog의 Button 내부 구조 선택자(04-46 계약 개정 때) · N3 `currentRevisionApproved` 노출 여부 04-24와 맞춤 · N4 `validationErrors`면 모달이 조용히 멈춤 · N5 시작일 없고 종료일만 있을 때 기간 줄 · N6 알 수 없는 상태 `notFound()` 동작 변경, `findLatestActionFor`·`lastStatusChangeOn` 새 호출자 생기면 가드. N2는 문제 없음.

**독립 DOM 감사**(`04-21-dom-audit.md`, CI=true 프로덕션 빌드, DOM 실측) — S7 긴 글 · S3 머리 줄 · 상태 태그 색 · 막힘 이유 1회 · 목록형 모두 **PASS**(1280 · 1024 · 375), FAIL 없음. 실측 못 한 것: 「더보기」 펼침(자식 버튼이 생기는 04-24·04-15 뒤 재감사), 375 미저장 편집 머리 줄(같이 재감사).

## Next Phase Readiness

- 04-22·04-23이 이 머리 줄(StatusChange · HeaderCopyActions 슬롯)과 lastStatusChangeOn을 그대로 쓸 수 있다.

## Self-Check: PASSED

- 생성 파일 5개 존재, 커밋 8개(916035b · bf0fb2e · c820cc4 · b19ff10 · 00d9c85 · e4d6e20 · 3e3ad22 · 1865707) 이력에 있음
