---
phase: 06-payment-evidence-cards
plan: 36
subsystem: pre-settle-check
tags: [pre-settle-check, evidence, ui, e2e, design-gate]
gap_closure: true
gap_ids: [G-06-E]
plan_head_before: 02ff1e9e9d08e4b0905fcb8afa85fc997b9209e4
commits: 3

requires:
  - phase: 06-payment-evidence-cards
    provides: 완료 전 점검 DTO(06-19) · 정산 결재 재점검(06-22) · 증빙 상태 낱말(06-06)
  - phase: 06.5-payment-followup
    provides: 06.5-01 · 07 · 09가 고친 domain/pre-settle-check/index.ts(loadPreSettleInputs 범위 배선)
provides:
  - 순수 분류 preSettleExpenseGroup(결재 통과 + 증빙 갈래 -> 증빙 대기, 결재 중 · 반려 -> 막힘)
  - 점검 DTO 그룹 evidencePending { count, rows, outOfScopeCount } — 막힘 건수 밖, 범위 · 금액 투영은 openExpenses와 같음
  - 정산 프로젝트 상세 「완료 전 점검」의 `증빙 대기 {n}건` 경고 그룹(건수 --status-warning)
affects: [domain/settlements 게이트(막힘 건수만 따라옴), next-turn, 정산 목록]

actuals:
  tokens: 11000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "분류는 순수 함수 하나에 두고 게이트 호출부는 막힘 건수만 본다 — 조건을 게이트 안에 다시 쓰지 않는다(06-19 Pitfall 4)"

key-files:
  created:
    - docs/design/checks/2026-10-15-06-36-pre-settle-evidence-pending.md
  modified:
    - domain/pre-settle-check/summary.ts
    - domain/pre-settle-check/index.ts
    - app/(app)/projects/[id]/pre-settle-check.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - test/e2e/pre-settle-check.spec.ts
    - test/integration/pre-settle-check.test.ts
    - test/unit/domain/pre-settle-check.test.ts

key-decisions:
  - "카드 ② 2026-10-14 14:20 KST 「경고만」이 D-611의 「결재 통과 · 증빙 없음 = 막힘」 갈래를 대체한다. 결재 중 · 반려를 막는 D-611 나머지는 그대로"
  - "증빙 대기는 막힘 판정 경로(GROUP_ORDER · GROUP_KEYS · preSettleLogDetail · forcedResultLine · liveExpenseIds)에 넣지 않았다 — 막힘 건수만 바뀌어 게이트가 따라온다"

requirements-completed: [PROJ-06]

duration: 26min
completed: 2026-10-15
status: complete
---

# Phase 06 Plan 36: 완료 전 점검 증빙 대기 경고 그룹 Summary

**결재 통과 · 증빙 없는 지출결의를 완료 전 점검의 막힘에서 빼 `증빙 대기 {n}건` 경고 그룹(DTO `evidencePending` + 화면 그룹, 새 토큰 0)으로 보이게 하고, 결재 중 · 반려는 그대로 막는 것을 단위 · 통합 · E2E로 고정했다 — G-06-E 닫음**

## Performance

- **Duration:** 26 min
- **Completed:** 2026-10-15T03:07Z
- **Tasks:** 3
- **Files modified:** 8 (코드 4 · 테스트 3 · 점검표 1)

## Accomplishments

- G-06-E 닫음. 결정 출처 카드 ② 2026-10-14 14:20 KST 「경고만」(`/mnt/project-files/06-review/verify/260907-gaps-adjudicated.md:35-39` Q2 ㉡). D-611(`06-CONTEXT.md:53`)의 결재 통과 갈래를 대체.
- `domain/pre-settle-check/summary.ts`: 순수 함수 `preSettleExpenseGroup` + 타입 `PreSettleExpenseGroup`. `openExpenseState` · `GROUP_ORDER` · `summarizePreSettle` · `forcedResultLine`은 손대지 않았다.
- `domain/pre-settle-check/index.ts`: 한 반복에서 두 목록(막는 `open` · 막지 않는 `pending`)에 나눠 담고, `listExpenseIdsInScope` 한 번 호출에 두 목록 id를 함께 넘겨 같은 범위 거르기 · 같은 `projectAmounts` 투영을 탄다. `liveExpenseIds` · `GROUP_KEYS` · `preSettleLogDetail`은 그대로.
- 화면: `GroupHeading`에 선택 prop `warning`, 막는 그룹 뒤 · 매출 줄 앞에 `증빙 대기 {n}건` + 같은 `expenseColumns` 표 + `OutOfScope`. CSS는 `.preSettleWarning { color: var(--status-warning); }` 한 클래스.
- `domain/settlements` · `domain/next-turn` · `repositories` · `ui` · `SYSTEM.md` · `tokens.css` 변경 0(`git diff --name-only`로 확인).

## Task Commits

1. **Task 1 (tracer): 증빙 대기 경고 그룹 — 분류 · DTO · 화면 · E2E · 점검표** - `8d52f53` (feat)
2. **Task 2: 서버 계약 고정 — 단위 여섯 · 통합 신규 8 · 뜻이 바뀐 단언 옮기기** - `6831e2f` (test)
3. **Task 3: 폰 320 사례 · 점검표 줄** - `3317971` (test)

Task 2 ⑤(회귀 수정 `fix(06-36)`)는 회귀가 전부 녹색이라 커밋 없음.

## TDD 증거

**RED(Task 1, 고치기 전, `CI=true`, `--project=desktop test/e2e/pre-settle-check.spec.ts --grep "G-06-E"`, 1 failed):**
`Error: expect(locator).toBeVisible() failed — Locator: section.getByText('미결 없음', { exact: true }) — Expected: visible — Error: element(s) not found` (`test/e2e/pre-settle-check.spec.ts:193`). 준비(결재 통과 · 증빙 무효 → 정산)는 통과해 화면까지 갔고 기능이 없어서 실패(오타 · 준비 오류 아님).
**GREEN:** 같은 명령 1 passed → 파일 전체 17 passed.

**Task 2의 RED 대용 = 물림 확인(mutation).** 단위 · 통합은 트레이서가 함수를 먼저 구현한 뒤에 썼으므로 구현 전 RED가 없다. 대신 커밋 `6831e2f` 뒤 `summary.ts`의 approved 갈래를 `"openExpenses"`로 바꿔 돌렸다:
- 단위 `test/unit/domain/pre-settle-check.test.ts`: **2 failed | 42 passed**(`결재 통과 · 증빙 없음 → 증빙 대기` · `결재 통과 · 선결제 · 증빙 없음 → 증빙 대기`).
- 통합 `test/integration/pre-settle-check.test.ts`: **10 failed | 39 passed**(옮긴 단언 2 + 잠금 경합 1 + G-06-E 신규 7).
- `git checkout -- domain/pre-settle-check/summary.ts`로 되돌림, 작업 트리 깨끗 확인.

호출한 Superpowers 스킬: `test-driven-development`(코드 전) · `systematic-debugging`(통합 3건 붉음 때) · `verification-before-completion`(커밋 전). `design-gate` 스킬을 호출하고 점검표를 첫 화면 커밋에 함께 스테이징했다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `pnpm exec vitest run --project unit test/unit/domain/pre-settle-check.test.ts` | 44 passed |
| 통합 `test/integration/pre-settle-check.test.ts`(flock · `DATABASE_URL=…/erp_test`) | 49 passed (기존 41 + 신규 8) |
| 통합 `settlement-approval` · `next-turn` · `leak-scan` · `project-auto-settlement` | 4 files, 4286 passed |
| E2E desktop `pre-settle-check` · `pm-settlement-flow` · `settlement-approval` · `next-turn-phase6`(`CI=true`) | 28 passed |
| E2E `mobile-375 --no-deps mobile-settlement-wave13`(`CI=true`) | 4 passed |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | 종료 0 / 0 / 0 |

참고: playwright 요약의 「18 skipped」는 desktop이 의존하는 `visual` 프로젝트 쪽이고 스펙 파일에 `.skip(` 은 0개다(이 플랜 이전과 같은 동작).

인수 기준 grep 전부 통과: `preSettleExpenseGroup` export 1 · `G-06-E` summary.ts 1 · `GROUP_ORDER` / `GROUP_KEYS` / `liveExpenseIds` 줄 불변 · `evidencePending` index.ts 3 · tsx 1 · `증빙 대기` tsx 3 · `.preSettleWarning` 1 · CSS 새 색 · px 0 · 금지 경로 diff 0 · E2E `G-06-E` 2 · 점검표 `- [ ]` 0 · 통합 `G-06-E` 7 · `evidencePending` 23 · `expect(` 수 증가(통합 141→182, 단위 48→56) · `.skip(` 0.

## UI-SPEC 델타 (S18, 갱신)

- **empty(explicit):** `미결 없음`은 막는 세 그룹(미결 지출결의 · 미매칭 견적 줄 · 매출 미입력)이 모두 빌 때 — 증빙 대기 그룹은 그 판정에 들지 않고 `미결 없음` 아래에 따로 선다. 매출 줄은 늘 남는다(D-613).
- **partial · zero-one-many(explicit):** 막힘 0이어도 증빙 대기 그룹 행은 보인다(기안 버튼 살아 있음). 머리글 건수 `증빙 대기 1건` · `2건`, 0이면 그룹을 접는다. 막힘 건수 = 막는 그룹 항목 수 합(증빙 대기 · 강행 허용 그룹 제외).
- **populated(explicit):** 제목(부제 없음) · 막는 그룹 셋(있는 것만) · 증빙 대기 그룹 · 매출 줄 순서. 섹션 로드 오류 갈래(S18 error)는 그대로.
- **overflow · long-text(backstop):** 증빙 대기 그룹도 행을 전부 세우고(페이지 없음), 긴 항목 이름은 PC 말줄임 + `title` · 폰 줄바꿈 — 독립 DOM 감사로 실측(아래 요청).

## 가정 A-1 ~ A-5 처리

- **A-1** 결재 중 문서의 증빙 없음은 막힘 그대로: 단위(submitted + no_evidence → openExpenses) + 통합(결재 중 선결제 제출 → `openExpenses` `prepaid_no_evidence`, 막힘 1). 아래 편차 2 참고.
- **A-2** `미결 없음`(초록)과 `증빙 대기`(주황)가 함께 선다: E2E G-06-E가 단언. `/design-review`가 다르게 보면 사용자 카드로 묻는다(문구는 새로 만들지 않았다).
- **A-3** 행 상태 글자 색 그대로(`ui/status-tag` 무변경).
- **A-4** 강행 허용 설정은 증빙 대기에 영향 없음: `GroupHeading`에 `allowed={false}` + 경고 갈래라 강행 꼬리 없음.
- **A-5** 정산 기안 행동 로그 상세에 증빙 대기를 싣지 않음: 통합이 `detail`이 `{ kind: "settlement", round: 1 }`뿐임을 단언.

## Deviations from Plan

**1. [오케스트레이터 지시 — 브랜치] 작업 트리 · 브랜치**
플랜의 `../plant8-06-gap-g3` 작업 트리 · `claude/06-gap-g3` 브랜치를 만들지 않고 이미 체크아웃된 `claude/phase-06-gaps-exec-qpq217`(origin/main `02ff1e9` 기준)에서 작업. 푸시 · PR은 오케스트레이터 몫.

**2. [Rule 3 - 막힘] 결재 중 · 증빙 없음 통합 사례는 선결제 제출 문서로**
- **Found during:** Task 2 ③
- **Issue:** `voidEvidence`가 승인 뒤에만 되고(`domain/evidence/index.ts:633` `승인 뒤에만 무효 처리`) 증빙 없는 제출은 선결제만 가능해, 결재 중 · 낱말 `증빙 없음`(`no_evidence`)인 실문서를 통합에서 만들 수 없다.
- **Fix:** 통합은 결재 중 선결제 제출(낱말 `prepaid_no_evidence`)로 「결재 중이면 증빙 갈래도 막힘」을 단언. 낱말 `no_evidence` + submitted 조합은 단위(`preSettleExpenseGroup`)가 고정한다.
- **Commit:** `6831e2f`

**3. [카드 ②로 뜻이 바뀐 단언 — 플랜 목록 밖 1건] 무효 ∥ 정산 최종 승인 잠금 경합**
- **Found during:** Task 2 ③ 첫 통합 실행(`test/integration/pre-settle-check.test.ts`, 사례 「무효 ∥ 정산 최종 승인 — 잠금 뒤 재점검…(X-12)」, 파일 약 762행 부근).
- **Issue:** 무효가 커밋되면 승인이 `완료 전 점검 1건`으로 거부된다고 한 단언인데, 카드 ②로 무효 뒤 결재 통과 문서는 증빙 대기라 막지 않는다. 플랜 Task 2 ② 목록(세 곳)에 없던 네 번째 옮길 단언.
- **Fix:** 플랜 ⑤의 규칙대로 지우지 않고 잠금 경합 구조(프로젝트 행 잠금 · `waitBlockedBy` · 무효 UPDATE · COMMIT)를 그대로 두고 기대값만 옮겼다: 거부 → `{ status: "approved", final: true }` · 프로젝트 `completed` · 재점검 DTO `evidencePending.rows`가 `["no_evidence"]` · `blockedCount` 0(무효가 커밋돼 재점검에 보였으나 막지 않음). 「재점검이 잠금 뒤 새 막힘을 본다」는 같은 describe의 [U1-1] 구매 요청 취소 사례가 같은 뜻으로 지킨다. 06.5 플랜 파일이 아니라 멈추지 않았다. 단언 수는 줄지 않았다.
- **Commit:** `6831e2f`

**4. [가정 보정] 기안 로그 상세**
플랜 behavior는 「행동 로그 상세에 preSettle 없음」. 실제 `submitSettlement`는 `forcedResultLine`이 없으면 `preSettle`을 싣지 않으므로(`domain/settlements/index.ts:378`) 통합은 `detail`이 `{ kind: "settlement", round: 1 }`와 같고 `evidencePending` 글자가 없다고 단언했다(뜻 같음).

**5. [순서] TDD 순서**
Task 2 단위 · 통합은 Task 1(트레이서)이 함수를 구현한 뒤에 썼다(플랜이 Task 1에 분류 · DTO를 넣으라 한 순서). 구현 전 RED는 Task 1 E2E 하나이고 Task 2는 위 물림 확인이 RED 역할이다.

**Total deviations:** 1 지시 편차 + 1 Rule 3 + 1 단언 이동(플랜 목록 밖) + 2 기록. **Impact:** 코드 범위 확장 없음.

## 관찰 (고치지 않음)

- 통합 「막힘 0 · 강행 그룹만(결재 통과 · 증빙 없음 + allow_open_expenses 켬) — 승인 · completed」(`:641`)는 플랜대로 고치지 않고 돌렸고 녹색이다. 지금은 증빙 없음이 강행 없이도 막지 않아 제목의 「강행 그룹」 설명이 낡았다(이름만 낡음, 단언 유효). 범위 밖이라 두었다.
- 엣지 프로브 PROJ-06: 미분류 유지.

## 260907 대조

비교만 하고 차이를 구현하지 않았다. 옛 저장소는 접근하지 않았고 로컬 노트 인용만 썼다.

| 항목 | 260907(옛) | 이번 구현(06-36) | 근거 | 판정 |
|---|---|---|---|---|
| 완료 점검에서 증빙 없는 문서 | 증빙은 일부러 뺀다 — 세금계산서가 다음 달에 와서 12월 행사가 해마다 이월됨(옛 `S/projects.ts:4093-4095,4281-4282`, `OD/06_업무/13_성과-정산.md:128-131`) | 결재 통과 · 증빙 없음은 막지 않고 경고 그룹으로 보임. 결재 중 · 반려는 막음 | `/mnt/project-files/06-prep/pr-e-260907-compare.md:113-118`, `/mnt/project-files/06-review/verify/260907-gaps-adjudicated.md:35-39` | 다름(의도) — 카드 ② ㉡. 옛은 증빙을 아예 안 봄(경고도 없음 = 선택지 ㉢), 이번은 경고 표시 |
| 선결제 · 증빙 대기 | 해당 규칙 없음(증빙을 안 봄) | 선결제 · 증빙 없음도 증빙 대기 그룹 | pr-e-260907-compare.md:113-118 선택 ㉡ 설명 | 옛에 없음 |
| 완료 뒤 증빙 붙이기 | 확인하지 못함(옛 코드 접근 안 함) | 완료 뒤에도 증빙 담당이 붙일 수 있음 | 이 저장소 `domain/evidence/index.ts:198,257`(06-11 U-4) · gaps-adjudicated.md:38 | 옛 확인 못 함 |
| 결재 중 · 반려 문서 | 확인하지 못함(옛 점검이 지출결의 상태를 어디까지 보는지 로컬 노트에서 못 찾음) | 결재 중 · 반려는 막음 | 이 플랜 must_haves · gaps-adjudicated.md:38 | 옛 확인 못 함 |

로컬 노트(`/mnt/project-files/notes/260907-audit-full` · `260907-full-inventory` · `260907-screen-compare`)를 `rg --type md`로 훑었으나 완료 점검의 증빙 규칙을 더 구체적으로 적은 줄은 찾지 못했다(`S/projects.ts:4093-4095` 원문은 보지 못했고 위 두 문서의 인용을 그대로 옮겼다).

## 독립 DOM 감사 요청 (실행자는 하지 않음 — 오케스트레이터가 별도 에이전트, `model` 명시 Sonnet)

조건: `CI=true` 프로덕션 빌드 + 로컬 `erp_test`(`DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp_test`, flock), E2E 준비와 같은 방식(`test/e2e/pre-settle-check.spec.ts`의 `setupSettling` 꼴)으로 프로젝트 셋을 만든다. 스크린샷 육안 금지, DOM 실측. 측정 스크립트는 scratchpad에만.

- ⓐ 증빙 대기 1건만 남은 정산 프로젝트
- ⓑ 반려 1건 + 증빙 대기 2건(선결제 하나 포함) 프로젝트
- ⓒ 증빙 대기 30건 · 항목 이름 42자 하나 포함 프로젝트

폭 **375 · 320 · 768 · 1280** × 프로젝트 ⓐⓑⓒ 마다 아래 ①~⑥:

1. 그룹 순서(`미결 지출결의` → … → `증빙 대기` → 매출 줄)와 ⓐ의 `미결 없음` 있음 · ⓑ의 `미결 없음` 없음
2. `증빙 대기` 건수 span의 계산된 color = `--status-warning` 값, `미결 지출결의` 건수 = `--status-danger` 값
3. 증빙 대기 행 수 = 건수(ⓒ 30행 전부 — S18 overflow)
4. 긴 이름 행: ≥700 `text-overflow: ellipsis` · `title` = 전체 이름, <700 줄바꿈(S18 long-text)
5. 문서 `scrollWidth = clientWidth`
6. `정산 결재 올리기`의 `aria-disabled`(ⓐ 없음 · ⓑ 있음, 이유 `완료 전 점검 1건` — 증빙 대기 미포함)

결과 표(폭 × 프로젝트 × ①~⑥)는 PR 본문 또는 `/review` 기록에 붙이고 아래 줄에 링크:

- 감사 결과 링크: (오케스트레이터가 채움 — 아직 없음)

## Known Stubs

None.

## Threat Flags

None — 새 네트워크 · 인증 · 파일 접근 면 없음. T-06-36-01(범위 밖 문서 번호 · 금액 노출)은 통합 범위 사례(DTO 글자에 B 문서 번호 · id 없음 · 키 셋 `["count","outOfScopeCount","rows"]`)와 `leak-scan` 회귀 통과로 확인했다.

## Issues Encountered

None. (첫 E2E 시도는 프로덕션 빌드가 콜드라 webServer 60초 제한에 걸렸고, 빌드 캐시를 데운 뒤 재시도해 통과.)

## Next Phase Readiness

PR-G3 = 이 플랜 하나. 남은 것: 독립 DOM 감사 → `/review` + `/design-review`(Codex 디자인 검토는 거기서만) → `/qa`. 위험 경로 · 돈 · 결재 경로 변경 없음(`/cso` 없음, 세션 머지 가능).

## Self-Check: PASSED

- 생성 · 수정 파일 8개 존재 확인(`docs/design/checks/2026-10-15-06-36-pre-settle-evidence-pending.md` 포함).
- 커밋 `8d52f53` · `6831e2f` · `3317971` 존재 확인(`git log 02ff1e9..HEAD`).
- `.claude/gates/phase-06.log`는 건드리지 않았다(커밋에 없음).

---
*Phase: 06-payment-evidence-cards*
*Completed: 2026-10-15*
