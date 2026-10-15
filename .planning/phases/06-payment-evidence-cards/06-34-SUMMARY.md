---
phase: 06-payment-evidence-cards
plan: 34
subsystem: purchase-requests
tags: [purchase-request, customer-approval-gate, tdd, lock-race]
gap_closure: true
gap_ids: [G-06-D]
requirements: [EXP-10]
status: complete
plan_head_before: 0de565659dc8710f64e6dd1b152864c05e06770f
commits: 3

requires:
  - phase: 06.5-payment-ledger
    provides: PR-C(06.5-02·03·05) — domain/purchase-requests/index.ts · domain/settings/keys.ts
provides:
  - 견적 줄 구매 요청 신청과 취소 되돌리기가 지출결의와 같은 규칙 quote.customer-approval로 고객 승인 전 차수를 막는다(잠긴 tx의 최신 차수)
  - searchLinesForPurchaseLink 결과 projectBlockedReason(06-35 화면이 바닥 줄 이유로 씀), 승인 전 모든 줄 selectable false · reason 같은 문구
  - 설정 힌트 project.customer_approval_gate에 구매 요청
affects: [PR-G2 게이트 (/review + /design-review -> /qa), 06-35]

actuals:
  tokens: 5950
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "고객 승인 판정 도우미 하나(customerApprovalReason)를 신청 tx · 되돌리기 tx · 줄 고르기 목록이 같이 부른다"

key-files:
  created: []
  modified:
    - domain/purchase-requests/index.ts
    - domain/settings/keys.ts
    - test/integration/purchase-requests.test.ts
    - test/unit/settings/keys-hint-style.test.ts

key-decisions:
  - "카드 ① 2026-10-14 14:20 KST 「구매 요청만」 -> 구매 요청 고객 승인 게이트(06-34 서버 · 06-35 화면)"
  - "새 규칙 · 새 문구 없음 — 기존 quote.customer-approval 호출만(registerGateRule 추가 없음)"
---

# Phase 6 Plan 34: 구매 요청 고객 승인 게이트 (G-06-D) Summary

진행 · 정산 프로젝트에서 최신 차수가 고객 승인 전이면 견적 줄 구매 요청 신청과 취소 되돌리기를 지출결의와 같은 `quote.customer-approval` 규칙으로 막고, 줄 고르기 목록에 같은 이유와 `projectBlockedReason`을 싣는다.

## 닫은 것

- **G-06-D** 서버 판정(260907 B15 · 결정 출처: 카드 ① 2026-10-14 14:20 KST 「구매 요청만」 -> 구매 요청 고객 승인 게이트, 06-34 서버 · 06-35 화면). 06-CONTEXT.md는 고치지 않았다.
- 판정은 `lockProjectForLinkWrite`가 돌려준 잠긴 프로젝트 행 + 같은 tx의 `findLatestQuoteRevision`으로 한다(사전 조회는 설정 켬 · PM 이름만). 순서는 프로젝트 행 -> 견적 줄 -> 연결 -> 고객 승인 -> 문 -> 이중 연결 -> 실행가 상한. 번호 · INSERT 앞이라 결번이 없다.
- 목록 이유 순서: 완료 잠김 -> 고객 승인 -> 문 -> 반대쪽 -> 소진.
- 카드 사용(`domain/corp-card-usages/`) · 규칙 정의 · 승인 끄기 · 화면 · 픽스처는 건드리지 않았다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | 7330c5c | 도우미 · 사전 조회 `approvalGate` · 신청 tx 판정 · 목록 이유 + `projectBlockedReason` · 통합 4 |
| 2 | f42031c | 취소 되돌리기 판정 · 설정 힌트 · 통합(되돌리기 · 승인 끄기 경합 · 면제 3 · 카드 사용 무관) · 단위 힌트 |
| 2 (회귀 준비) | 007aaef | 기존 사례 1건(되돌리기 X-2 경합)에 고객 승인 준비 추가 |

## RED 기록

- 통합 Task 1: PM 액션 `AssertionError: expected undefined to be '1차 고객 승인 전 · 고객 승인 표시'` / 다른 직원 `Error: 거부되지 않음` / 목록 `AssertionError: expected false to be true` (selectable false · reason 단언). 승인 뒤 성공 사례는 지금 코드에서도 통과(통과 쪽 사례).
- 통합 Task 2: 취소 되돌리기 `Error: 거부되지 않음`(undoCancelPurchaseRequest가 승인 끈 뒤에도 성공).
- 단위 Task 2: `Expected: "끄면 고객 승인 전 차수에서도 지출결의와 구매 요청을 올릴 수 있습니다." / Received: "끄면 고객 승인 전 차수에서도 지출결의를 올릴 수 있습니다."`

## 변이 (검출력, 커밋 없음)

신청 tx의 `if (approvalReason) throw new GateBlockedError(approvalReason);` 줄을 주석 처리하고 `-t "G-06-D"`를 돌렸다. 붉은 사례 3개:

- 진행 · 1차 미승인 · 담당 PM 요청자 -> 액션 서버 오류
- 같은 프로젝트를 다른 직원이 신청 -> GateBlockedError
- [경합] 승인 끄기가 프로젝트 행을 쥔 채 멈춘 동안 시작한 신청

되돌린 뒤 `git status --porcelain -- domain/purchase-requests/index.ts` 빈 출력.

## 검증 (새로 돌린 결과)

| 명령 | 결과 |
|------|------|
| 통합 `purchase-requests -t "G-06-D"` (Task 1 시점) | 4 passed, 종료 0 |
| 통합 `purchase-requests` + `corp-card-usages` + `expense-pick` 전체 (회귀 수정 뒤) | 3 files, 232 passed, 종료 0 (G-06-D 10건 포함) |
| 단위 `keys-hint-style` | 2 passed |
| E2E desktop `purchase-requests` + `purchase-requests-finish` (CI=true) | 26 passed, 18 skipped(기존 스킵), 종료 0 |
| `pnpm lint` · `pnpm typecheck` | 종료 0 |

수락 grep: 도우미 밖 `"quote.customer-approval"` 호출 1곳, `projectBlockedReason` 2회(타입 + 반환), `registerGateRule` 없음, 힌트 문장 keys.ts · 단위 테스트 각 1, `G-06-D` 통합 3 · 도메인 4. 범위 diff(`domain/corp-card-usages domain/quotes domain/rules *.tsx *.css ui docs/design db .claude test/integration/fixtures`) 빈 출력. `.skip(` 없음, `expect(` 320 -> 348(단언 삭제 없음).

## 가정 (실행 전 드러낸 그대로)

- A-1 면제 · 끄기는 지출결의와 같다(설정 키 공유, 힌트만 넓힘). A-2 승인 끄기는 막지 않는다(연결 문서 판정에 구매 요청 안 더함). A-3 정산 프로젝트 점검 문(S18 미매칭 줄)은 고치지 않는다. 엣지 프로브 EXP-10은 미분류 그대로 둔다.

## Deviations from Plan

**1. [Rule 1 - 회귀 준비] 기존 사례 1건 준비 수정**
- **Found during:** Task 1 회귀 실행
- **Issue:** 취소 되돌리기 `[X-2 경합]` 사례가 정산 프로젝트 · 미승인 차수로 `request()`를 불러 새 게이트에 걸렸다(사례 뜻은 완료 경합 — 게이트와 무관).
- **Fix:** 준비에 `approve(fx)` 한 줄과 `// G-06-D:` 주석. 단언 변경 없음. 계획 Task 2 ⑤ 커밋(007aaef)으로 따로 커밋.
- **Files modified:** test/integration/purchase-requests.test.ts

**2. 실행 위치:** 플랜의 worktree · 브랜치 `claude/06-gap-g2` 대신 오케스트레이터가 지정한 현재 브랜치 `claude/phase-06-gaps-exec-qpq217`에서 실행. 선행조건 06.5-02 · 03은 main 커밋 50902cb(제목 「06.5-02·03·05」)로 충족 처리(리터럴 grep 0).

**3. 실주 면제 사례:** 계획은 「실주 신청이 다른 이유로 막히면 빼라」 했으나 막히지 않아(`lockProjectForLinkWrite`는 completed만 막음) 그대로 포함해 통과.

## Known Stubs

None.

## Threat Flags

None. T-06-34-01~03 구현대로: 액션 직접 호출도 tx 안 판정(액션 사례), 승인 끄기 경합은 같은 프로젝트 행 잠금 뒤 값으로 판정(경합 사례 + 변이로 검출력 확인), 되돌리기도 같은 도우미(되돌리기 사례).

## Self-Check: PASSED

- FOUND: domain/purchase-requests/index.ts · domain/settings/keys.ts · test/integration/purchase-requests.test.ts · test/unit/settings/keys-hint-style.test.ts
- FOUND commits: 7330c5c · f42031c · 007aaef
