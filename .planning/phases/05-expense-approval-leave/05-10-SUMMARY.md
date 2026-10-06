---
phase: 05-expense-approval-leave
plan: 10
subsystem: approvals-home
tags: [next-turn, approvals, expenses, evidence, bottom-tabs, sheet, risk-money]

requires:
  - phase: 05-01
    provides: 종류 중립 결재함 · 시트 승인 콜백 · 막힌 승인 이유(approveBlockedReason) · E4 version 충돌 문구
  - phase: 05-05
    provides: 지출결의 종류 상세(구조 → 투영 → 문자열 행) · 계산 한 줄
  - phase: 05-09
    provides: listEvidenceVoidSignals(G1 원천) · 경영관리 증빙 붙이기 · 증빙 무효 처리
provides:
  - domain/next-turn listNextTurnItems — [결재](내가 담당) · [막힘](내 반려 문서 · 승인 뒤 종류가 알린 막힘) 공급, 종류 이름 분기 없음
  - 종류 필드 blockedAfterApproval(종류당 한 번 호출) + 지출결의 증빙 무효 채움
  - 결재 시트 지출결의 본문: 증빙 썸네일 72x96 · 크게 보기 · 세율 바뀜 줄 · 계산 줄
  - 첫 화면 「내 차례」 [결재] 행 행동(폰 = 행 탭 → 결재 시트, PC = 승인 · 반려) · [막힘] 행 · 6줄 + 더 보기 · 폰 하단 탭 `내 차례 N` · 공급 실패 한 줄
  - 결재함: 막힌 승인 셀(rowApprovalActions) · 지출결의 요약 값(원화 + 원래 통화) · 빈 화면 다음 한 수 = 지출결의 목록(expenses 보기 권한 있을 때만)
affects: [05-11, 05-13, 06-S19]

visual_baseline_expected: [approvals, dev-components, dev-components-panel, project-detail]

actuals:
  tokens: 30000
  tasks: 3
  commits: 12
plan_head_before: 8009a8fe54a6d096cedde02f91e0f87a2a63691a

tech-stack:
  added: []
  patterns:
    - "공급 함수는 종류 요약(nextTurnText · measure)과 종류 필드(blockedAfterApproval)만 읽는다 — 종류 키 리터럴 0"
    - "결재 시트 재료(sheet-material.ts)와 증빙 주소 주입(evidence-url.ts)을 결재함과 첫 화면이 함께 쓴다"
    - "행 행동은 ui/next-turn `actionSlots`로 서버가 넘긴다 — ui/는 app/을 import하지 않는다"

key-files:
  created: [domain/next-turn/index.ts, "app/(app)/home-approval-actions.tsx", "app/(app)/home-approval-actions.module.css", "app/(app)/approvals/row-actions.ts", "app/(app)/approvals/sheet-material.ts", "app/(app)/approvals/evidence-url.ts", test/integration/next-turn.test.ts, test/integration/expense-inbox.test.ts, test/unit/app/approval-row-actions.test.ts, test/e2e/mobile-next-turn-approval.spec.ts, test/e2e/expense-inbox.spec.ts, docs/design/checks/2026-10-05-05-10-next-turn-approval.md]
  modified: [domain/approvals/index.ts, domain/approvals/kinds.ts, domain/expenses/index.ts, domain/expenses/dto.ts, domain/expenses/detail.ts, domain/leave/index.ts, repositories/approvals.ts, repositories/files.ts, ui/next-turn/NextTurn.tsx, ui/next-turn/build-next-turn-view.ts, ui/shell/Shell.tsx, ui/shell/BottomTabs.tsx, "app/(app)/page.tsx", "app/(app)/layout.tsx", "app/(app)/approvals/page.tsx", "app/(app)/approvals/approval-sheet.tsx", "app/(app)/approvals/inbox-table.tsx", docs/design/DECISIONS.md, docs/design/SYSTEM.md]

key-decisions:
  - "DocumentDetailRow는 합집합이 아니라 상위 집합(선택 칸 files) — 합집합은 기존 시험 7곳과 결재함 페이지 타입을 깼다"
  - "승인 뒤 막힘 조회는 기안자의 승인 문서 최근 200건만 종류에 넘긴다(쌓이는 이력의 상한)"
  - "행 승인 막힘 판정은 순수 함수 rowApprovalActions 하나, 이유 글자는 서버 원문 그대로"

requirements-completed: [UX-03, UX-06, EXP-02]

duration: ~1h(이어받은 세션 포함, 플랜 첫 커밋 2026-10-05T01:44Z)
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 10: 첫 화면 「내 차례」 [결재] · [막힘] · 결재함 지출결의 완성 Summary

**팀장은 폰 첫 화면의 [결재] 지출결의 행을 탭해 증빙 썸네일이 있는 결재 시트에서 승인하고(PC는 행에서 승인 · 반려), 기안자는 반려된 문서와 증빙 무효 문서를 [막힘] 행과 하단 탭 `내 차례 N`으로 본다 — 공급 함수는 종류 이름을 모른다.**

## Task Commits
1. Task 1(트레이서) — `05536fda` test RED · `cc320bb0` feat(공급 · 시트 증빙 · 세율 바뀜) · `035a992b` feat(첫 화면 행 행동 · 시트 썸네일 · 점검표). 트레이서 게이트: 폰 E2E 3 통과(verify 재실행) 뒤 확장
2. Task 2 — `71714fb9` docs DECISIONS → `13d532ec` docs SYSTEM §7-7(DECISIONS가 조상) · `6a17e5c3` test RED · `6a1bf8c8` fix(팀 비용 문서 칸 중복 글자) · `da409646` feat(막힌 승인 셀 · 빈 화면 · 컴플라이언스 시험)
3. Task 3 — `a0df29c7` test RED · `df7a0760` feat(막힘 공급 · blockedAfterApproval) · `13169689` feat(첫 화면 막힘 · 탭 건수 · 오류 한 줄) · `66c38e08` test(구조 값 시험 목 보정)

`commits: 12` = `git rev-list --count 8009a8fe..HEAD`(SUMMARY 커밋 전).

## 사용자 결정에 따른 변경(실행자 지시 — 플랜 문서는 고치지 않음)
1. 플랜 :61 `{기안자}이 HH:MM에 증빙을 바꿈` → 시험은 `{붙인 사람}`(경영관리 권한자 이름). 서버 문구 코드는 05-09 `buildConflictMessage` 그대로(`updatedByName`).
2. 플랜 :212 E2E 「결재자가 시트를 연 뒤 기안자가 증빙을 더함」 → 「경영관리 권한자(`makeEvidenceManagerE2E`)가 증빙을 붙임」(`expense-inbox.spec.ts` 셋째 사례). 증빙 무효 E2E의 무효 처리자도 같은 픽스처.
3. 지출결의 금액: 남은 실행가 검사 그대로, 고정 상한 없음(코드 변경 없음).
4. 시각 기준 사진: 변경 확정 목록과 재촬영 방법은 아래 「시각 기준 사진」 — 사용자 지시(10/5 00:55)에 따라 추천안 적용(바뀐 것만 · 저장소 방식으로).

5. 승인 뒤 포커스 — 사용자 지시(10/5 00:55)에 따라 추천안 적용 · **사용자 확정 (10/5 12:41)** 「다음 줄 열기」: PC 결재함 · 첫 화면 「내 차례」에서 한 줄을 승인하면 포커스는 다음 줄의 `승인`이 아니라 열기(결재함 = 문서 칸 버튼 · 링크, 첫 화면 PC = 대상 글자, 폰 = 줄 `열기`)로 간다 — Enter 한 번 더로 다음 문서가 승인되는 것을 막는다. 다음 줄이 없으면 기존 동작 그대로. 05-16으로 구현.

## 시각 기준 사진
- **이번 세션에서 다시 찍은 사진 없음.** 저장소의 갱신 방법은 `visual-baseline.yml`(workflow_dispatch · 페이즈 브랜치 push 뒤 `gh workflow run visual-baseline.yml --ref <브랜치>`)뿐이다 — `visual*.spec.ts`는 `GITHUB_ACTIONS`가 아니면 건너뛰고, 로컬 Chromium은 기준(CI Chromium)과 다르다(`GITHUB_ACTIONS=true --update-snapshots=none` 로컬 실측: 이번에 손대지 않은 projects · vendors 390 · 1280도 비율 0.01~0.02로 빨갛다 → 로컬에서 찍은 사진은 CI에서 전부 실패). push는 지시상 오케스트레이터 몫이라 워크플로를 돌리지 못했다.
- 기대 집합(워크플로가 바꿔 올 사진): `approvals`(1280 · 390 — 빈 화면 행동 글자 `연차 목록 보기` → 시스템 관리자(visual 사용자)는 `expenses` 보기가 있어 `지출결의 목록 보기`; 로컬 1280 비교는 허용 비율 0.002 안이라 초록이었다), `dev-components`(05-01 · 05-09 이월, 갤러리 `무효`), `dev-components-panel`(m4 추정), `project-detail`(05-05 · 05-15 이월). 이 플랜이 바꾼 첫 화면은 visual 사용자(항목 0)에서 달라지지 않는다(`home` 1280 로컬 초록).
- Task 3 acceptance의 「바뀐 사진 파일이 기대 집합 밖」 검사: 이 플랜 기간에 바뀐 사진 0장 → 통과(0). 워크플로가 바꿔 오면 위 네 집합 밖 파일이 있는지 오케스트레이터가 같은 명령으로 확인 필요.

## 화면(독립 DOM 감사 대상 — `CI=true`)
- `/` 폰 375 · 390: 「내 차례」 [결재] 행(대상 — 상황 · 숫자 · `열기` 행 탭 → 결재 시트: 지출결의 본문 · 계산 줄 · 증빙 썸네일 72x96 + `크게 보기` · `문서 화면 열기`), [막힘] 행(반려 · 증빙 무효: 3차 링크 `지출결의 열기` / `증빙 올리기`), 6줄 + `더 보기 N건`, 하단 탭 `내 차례 N`(0이면 `내 차례`), 승인 뒤 블록째 사라짐.
- `/` PC 1280: 행마다 3차 `승인` · `반려`(`aria-describedby` = 그 행 대상 글자 id, 행마다 서로 다름), 막힌 승인(서버 원문 이유 + `반려`), 공급 실패 `불러오기 실패` + `다시 시도`.
- `/approvals`: 0건 빈 화면(`결재할 건이 없습니다` + `지출결의 목록 보기` / 권한 없으면 문장만), PC `내 결재` 행 승인 즉시(토스트 `승인 · 결재 요청됨 → …`), 막힌 승인 셀, 결재 시트(증빙 썸네일), 동시 증빙 변경 거부 문구(시트 열린 채).
- 점검표: `docs/design/checks/2026-10-05-05-10-next-turn-approval.md`(스크린샷: 스크래치패드 `shots10/`).

## Deviations from Plan
1. **[Rule 1] 시트 증빙 행 타입** — 플랜 「문자열 행 | 증빙 행」 합집합은 기존 시험 ~7곳 · 결재함 페이지 타입을 깼다. `DocumentDetailRow`에 선택 칸 `files?`를 더한 상위 집합으로 바꿨다(`value` = 파일 이름 글자 — 칸을 모르는 소비자도 읽음). 커밋 `cc320bb0`. kinds.ts diff 삭제 1줄 = `DocumentDetailRow` 선언 줄(`-export type DocumentDetailRow = { label: string; value: string; tone: ... };`).
2. **[Rule 1] 05-05 시험** `expense-approval-lifecycle` LABEL_ORDER에 `"증빙"`(지급 방식 ~ 비고 사이) — 그 시험 도우미가 파일을 붙이므로 새 증빙 행이 선다(플랜은 그 시험 불변이라 했으나 순서 목록만 최소 수정).
3. **[Rule 1] 잔여 초과 줄** — 세율 바뀜 `warning` 행이 결재함 문서 칸 `잔여 초과`로 오르는 것을 막으려고 페이지의 overdraw를 `label === "잔고"` 경고 행으로 좁혔다(`approvals/page.tsx`).
4. **[Rule 3] 파일 추가** — `app/(app)/approvals/sheet-material.ts`(시트 재료 추출: 결재함과 첫 화면 공용) · `evidence-url.ts`(증빙 주소 서버 액션을 시트의 주입 함수 모양으로). 플랜 files 밖.
5. **[Rule 1] `approvals-inbox-structure-only` 단위 시험 목** — 시트가 지출결의 서버 액션을 부르게 되어 `@/domain/approvals` 전체 목 환경에서 `registerDocumentKind` 오류가 났다 → 그 액션 모듈 목 한 줄(`66c38e08`). 전체 `pnpm test:unit`에서 발견.
6. **[Rule 1] 팀 비용 문서 칸 중복** — `describeExpenseDocuments` team-cost `documentText`가 `지출결의 · {팀} · {내용}`이라 결재함 문서 칸이 `지출결의 · 지출결의 · …`이었다. `{팀} · {내용}`으로 고침(RED 먼저, `6a1bf8c8`).
7. **설계 선택** — 승인 뒤 막힘 조회는 기안자의 승인 인스턴스 최근 200건만 종류에 넘긴다(이력이 쌓여도 상한). 반려는 최근 50건. 공급 함수의 [막힘] 대상 글자는 종류 `nextTurnText.target`(연차는 기안자 이름이라 본인 연차 반려 줄이 `{내 이름} — 연차 반려, {반려자}`로 읽힌다 — 플랜 그대로, 연차 쪽 글자 개선은 05-11 이후 검토).
8. **TDD 증거 한계** — 트레이서 E2E RED는 구현 전 빌드에 돌리지 않았다(통합 RED만 단언 실패로 확인). Task 3 단위 `5 결재 + 3 막힘` 사례는 기존 `buildNextTurnView` 계약 고정이라 처음부터 초록(RED 없음). 증빙 무효 · 반려 통합 · E2E는 RED 확인(통합 4건 실패) 뒤 구현.
9. **E2E 픽스처** — 공급 실패 사례는 등록 안 된 종류의 반려 인스턴스를 `insertApprovalInstance`(리포지토리 함수)로 만들어 서버가 실제로 던지게 했다(요청 가로채기는 서버 렌더 실패를 만들 수 없음). 보기 권한 없는 사람은 `workScope: "team"` 계급에 `expenses` 보기를 주지 않은 새 계급(CHECK는 team · company뿐).
10. 플랜 acceptance의 `grep "evidence" approvals/page.tsx`는 시트 재료가 `sheet-material.ts`로 옮겨 가 주석 한 줄로 충족(`증빙 evidence 갈래`).

**Impact:** 새 의존성 0 · 마이그레이션 0 · 새 토큰 · 색 0 · STATE.md · ROADMAP.md · HANDOFF.json 불변 · `ui/next-turn/build-next-turn-view.ts` diff 삭제 0.

## Verification
- 단위 `pnpm test:unit` 전체: 253 files · 3877 tests 통과(마지막 코드 커밋 뒤). row-actions 3 · system-md-compliance · next-turn 13 · import-cycles · document-kinds-import 포함.
- 통합(`next-turn` · `expense-inbox` · `expense-money` · `evidence-void` · `approvals-inbox-projection` · `leak-scan` · `expense-approval-lifecycle`): 7 files · 2852 tests 통과.
- E2E `CI=true`(프로덕션 빌드, desktop + mobile-375): expense-inbox 3 · leave-document 14 · mobile-next-turn-approval 6 · mobile-next-turn 2 · mobile-page-chrome 7 = 32 통과. 이 플랜 범위 밖 `mobile-w5-review-fixes.spec.ts:47`(320 CLS, `/admin/code-tables`)은 이미 알려진 실패라 돌리지 않았다.
- `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql` 0, stylelint 0, `mark-legacy --audit` 0, `pnpm build`(CI=true 웹서버 빌드) 0.
- acceptance grep: `ui/next-turn`의 `from "@/app` 0 · `page.tsx` document-kinds import 줄 1 · `rejected` 2 · `withdrawn|draft` 0 · `blockedAfterApproval` kinds 1 / next-turn 1 / expenses 1 · `listEvidenceVoidSignals` 2 · 종류 키 리터럴 0 · `nextTurnCount` Shell 3 / layout 3 · `tone="error"` 1 · `지출결의 목록 보기` page 1 · `연차 목록 보기` page · SYSTEM · 컴플라이언스 시험 0 · DECISIONS 커밋이 SYSTEM 커밋의 조상(0) · DECISIONS · build-next-turn-view diff 삭제 0.

## Known Stubs
없음.

## Threat Flags
| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure | domain/approvals/index.ts | `listMyBlockedDocuments`가 반려자 이름을 기안자에게 싣는다(결재선 노출과 별개). 플랜 T-05-1005는 승인 뒤 막힘만 다뤘다 — 반려자 이름 노출 허용 여부 검토 필요 |
| threat_flag: layout-cost | app/(app)/layout.tsx | 모든 화면의 레이아웃이 `listNextTurnItems`를 불러 건수를 구한다(상세 없음 · 실패하면 경고 로그 + 건수 생략) |

## Next Phase Readiness
- 위험 경로 없음(돈 · 결재 경로는 `/review` + `/cso` 필요 — 묶음 게이트). Opus 독립 검토 1명 + 독립 DOM 감사.
- 오케스트레이터: push 뒤 `gh workflow run visual-baseline.yml --ref <브랜치>` → 봇 커밋을 받은 뒤 바뀐 사진 목록을 위 기대 집합과 대조.

## Self-Check: PASSED
