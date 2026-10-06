---
phase: 06-payment-evidence-cards
plan: 01
subsystem: ui
tags: [design-system, status-map, decisions, system-md, roadmap, requirements]
requires:
  - phase: 05-expense-approval-leave
    provides: ui/status-tag/status-map.ts, ui/pick-dialog/PickDialog, ui/list-screen/ListScreen, StatusTag text variant
provides:
  - "DECISIONS 06 SP-1 · 2 · 3 · 4 · 5 · 7 · 8 · 9 (여덟) + 합계 글자 14 굵게 항목, 결정자 = 사용자 확인 2026-10-06"
  - "SYSTEM 아홉 절 개정(절마다 (DECISIONS 06 SP-n)) + §1-4 대비 문장 + §6-1 · §7-3 합계 글자"
  - "status-map.ts STATUS_KIND Phase 6 낱말 아홉 + 단위 테스트"
  - "tokens.test.ts --accent-weak 위 다섯 쌍 4.5 이상 + 실측값 고정"
  - "ROADMAP 기준 1 · 3 · 06-01 줄, REQUIREMENTS EXP-07 · EXP-15 · EXP-09 · MAST-05 · 추적표 EVID-01 문구 정렬"
affects: [06-02, 06-29, 06-15, 06-17, 06-13, 06-28, 06-19]

actuals:
  tokens: 11000
  tasks: 3
  commits: 10
plan_head_before: 3ad8780b353b7a5d3526e8cc643d276dcb0a1e7d

tech-stack:
  added: []
  patterns:
    - "DECISIONS 먼저 → SYSTEM → 컴포넌트(C1) 순서로 디자인 기준 승격"
    - "상태 낱말 정본 = status-map.ts 한 표(페이즈 전용 낱말 파일 없음)"

key-files:
  created:
    - docs/design/checks/2026-10-06-06-01-sp-promotion.md
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - ui/status-tag/status-map.ts
    - test/unit/ui/status-map.test.ts
    - test/unit/design/tokens.test.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "SP 여덟 전부 사용자 확인(거부 없음), SP-9 빈 행 의미 = 검사 안 함"
  - "REQ-ROUTE = one-time-exception (REQUIREMENTS 다섯 줄만 실행자가 수정)"
  - "06 낱말 아홉은 B2 예외로 이 플랜이 한꺼번에 status-map에 더함"

patterns-established:
  - "statusKind는 표 밖 낱말에 accent를 돌려주므로 accent 낱말 테스트는 `word in STATUS_KIND`를 함께 단언"

requirements-completed: [EXP-07, EXP-09]

coverage:
  - id: D1
    description: "DECISIONS 06 SP 여덟 항목이 SP-1·4·8 → SP-2·3·5·7·9 → SYSTEM 승격 순서로 서고 철회된 여섯째는 없다"
    requirement: "EXP-09"
    verification:
      - kind: other
        ref: "sh -c 'grep -oE \"^## .* — 06 SP-[0-9]\" docs/design/DECISIONS.md | ... = SP-1,2,3,4,5,7,8,9' (exit 0) + git log 순서 1c5ea268 → 09ce071e → b5ac6406"
        status: pass
    human_judgment: false
  - id: D2
    description: "SYSTEM 아홉 절에 (DECISIONS 06 SP-n) 꼬리표 여덟과 절 이름 다섯이 있다"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts (+ 계획 verify grep 통과)"
        status: pass
    human_judgment: false
  - id: D3
    description: "status-map.ts에 Phase 6 낱말 아홉이 있고 색이 단언된다"
    requirement: "EXP-07"
    verification:
      - kind: unit
        ref: "test/unit/ui/status-map.test.ts#Phase 6(SP-2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "--accent-weak 위 다섯 쌍 대비 4.5 이상이고 실측값이 SYSTEM 문장과 같다"
    verification:
      - kind: unit
        ref: "test/unit/design/tokens.test.ts#고른 행 면(--accent-weak) 위 실측"
        status: pass
    human_judgment: false
  - id: D5
    description: "/dev/components 갤러리 상태 배지 구역이 새 낱말 아홉을 포함해 그려진다"
    verification:
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/dev-components.spec.ts (13 passed, 18 skipped)"
        status: pass
    human_judgment: false
  - id: D6
    description: "ROADMAP 기준 1 · 3 · 06-01 줄과 REQUIREMENTS 다섯 줄이 D-607 · UA-619 · Q5 · MAST-05와 같은 뜻으로 정렬됐다"
    verification: []
    human_judgment: true
    rationale: "문구의 뜻 일치는 사용자가 정한 제안 문구를 그대로 옮긴 것이라 기계가 판정하지 않는다(grep은 문구 존재만 본다)"

duration: 20min
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 01: SP 승격 · 낱말 · 요구사항 정렬 Summary

**Phase 6 디자인 기준(06 SP-1 · 2 · 3 · 4 · 5 · 7 · 8 · 9)을 DECISIONS → SYSTEM 순서로 세우고 status-map에 상태 낱말 아홉과 `--accent-weak` 대비 단언을 더했으며, ROADMAP 기준 1 · 3과 REQUIREMENTS 다섯 줄을 사용자가 승인한 문구로 맞췄다**

## Performance

- **Duration:** 약 20분(시작 시각을 기록하지 못해 첫 파일 편집 시각 ~03:49Z 기준 추정)
- **Started:** 2026-10-06T03:49Z(추정)
- **Completed:** 2026-10-06T04:05Z
- **Tasks:** 3(트레이서 1 · 자동 1 · 해결된 체크포인트 1)
- **Files modified:** 8(생성 1 포함)

## 실행 게이트 ⓪ 결과 (C15)

| 줄 | 결과 |
|---|---|
| C15 | `origin/main`에 05-13-SUMMARY.md 있음 |
| C15-심볼 | `"지출결의 중": "accent"` 1 · `export function PickDialog` 1 · `export function ListScreen` 1 |
| C15-05기준 이름 넷 | `BlockedCandidateFilter` 1 · `blockedAfterApprovalCandidates?: BlockedCandidateFilter` 1 · `listNumberedByLineChain(` 1 · `evidenceTypeInactive: boolean` 1 |
| A8 문구 | `건 · 먼저 결재`(domain/settlements/index.ts) 1 |
| acf1cf2 이름 셋 | `installmentSeqFor` 1 · `seqStartGuardFor(key: string)` 1 · `shareLockDocumentCounter(` 1 |
| C15-체커 | 종료 코드 0 — 05 머지 `acf1cf2f`(05-13 SUMMARY 추가 커밋)의 후손인 체커 재실행 기록 커밋 `b4955bcc` |
| UA-601 | `### 7-15.` · `### 7-17.` 절 머리 2건 |
| UA-609 | StatusTag.tsx `"text"` 4건 |

`origin/main`(b55de77e)은 이미 HEAD 조상이라 `git merge`는 불필요했다. design-gate 점검표: `docs/design/checks/2026-10-06-06-01-sp-promotion.md`(모든 항목 `- [x]` + 근거).

## Accomplishments

- DECISIONS에 06 SP 항목 여덟 + 합계 글자 14 굵게(사용자 결정 ⑥) 항목. 철회된 여섯째 제안은 DECISIONS · SYSTEM 어디에도 없다(`SP-6` 0건).
- SYSTEM §7-3 「일괄 처리 표」 · §7-20 `primaryAction` 버튼 갈래 · §6-1 「하위 목록」 · §7-8 「옆 패널 위의 고르기 목록」 · §7-5 SP-2 보강 · §6-3 「제출 뒤 문서 화면」 · §8 규칙 7 용어 · §7-17 「첨부 보기 칸」(+ 상태 계약 둘) · §7-2 「짝 격자」. `(DECISIONS 06 SP-n)` 꼬리표 서로 다른 여덟.
- `STATUS_KIND`에 낱말 아홉(`구매 요청 중` · `확인 전` accent / `지급 완료` · `카드 사용` · `확인됨` · `구매 완료` · `발행됨` success / `선결제` warning / `면제` muted). 페이즈 전용 낱말 파일 없음, 맨 낱말 0줄.
- `tokens.test.ts`: `--accent-weak` 면 위 다섯 쌍 허용 + 실측값(4.63 · 5.22 · 7.18 · 5.74 · 4.71) 고정, `--status-warning` × `--surface-group` 확인. SYSTEM §1-4 문장에 같은 쌍.
- SYSTEM §6-1 · §7-3 합계 줄 금액이 `--text-body` `--fw-bold`(14 굵게). `--text-subtitle` 700 수: merge-base 4건 → 2건(§7-17 · §7-17-1 제목 두 곳만 남음).
- 사용자 확인으로 결정자 줄 갱신, ROADMAP · REQUIREMENTS 문구 정렬.

## Task Commits

1. **Task 1 (트레이서 — SP 승격):**
   - `1c5ea268` docs: 06 SP-1 · SP-4 · SP-8 결정 기록
   - `09ce071e` docs: 06 SP-2 · SP-3 · SP-5 · SP-7 · SP-9 결정 기록
   - `b5ac6406` docs: SYSTEM — 06 SP 승격
   - `2fda23fd` feat(06-01): status-map에 Phase 6 낱말 아홉 추가 (RED 9건 실패 확인 뒤 GREEN, 점검표 포함)
2. **Task 2 (대비 단언 · 합계 글자):**
   - `3288951a` test(06-01): `--accent-weak` 위 대비 쌍 다섯 단언
   - `cd67e869` docs: 합계 줄 금액 14 굵게 결정 기록
   - `c12943dd` docs: SYSTEM — 합계 줄 금액 14 굵게 · 대비 문장
3. **Task 3 (해결된 체크포인트):**
   - `724a072b` docs: 06 SP 여덟 결정자에 사용자 확인 기록
   - `e992bb64` docs(06-01): ROADMAP 기준 1 · 3과 REQUIREMENTS 다섯 줄 문구 정렬
4. 점검표 보강 `e967319f` docs: 06-01 점검표 Task 2 항목과 갤러리 E2E 근거

**Plan metadata:** 이 SUMMARY 커밋(docs(06-01): complete ...)

## Task 3 — 사용자 답 (체크포인트 해결)

**⑴ SP 확인:** 여덟 전부 확인, 거부 없음. 스레드 결정 카드(fkdwi, 2026-10-06 KST): SP-1 「올리기」 12:29:47 · SP-2 「더하기」 12:29:50 · SP-3 「올리기」 12:29:54 · SP-4 「올리기」 12:29:58 · SP-5 「올리기」 12:30:10 · SP-7 「올리기」 12:30:12 · SP-8 「올리기」 12:30:15 · SP-9 빈 행 의미 「검사 안 함」 12:30:21. DECISIONS 각 `**결정자**` 「사용자 확인 대기(06-01 Task 3)」 → 「사용자 확인 2026-10-06 {시각} KST · 스레드 결정 카드」(`724a072b`). 거부 없음이라 되돌림 커밋 · 후속 재계획 없음, SP-9 판정 함수 변경 지시 없음.

**⑵ 경로 = `one-time-exception`.** 사용자가 12:30:25 KST 카드에서 「이번만 예외」를 골랐고, 프로젝트 채팅에 승인 문장을 적었다: **「요구사항 5줄 예외 승인」**(fkdwi, 2026-10-06 12:31:56 KST, 메시지 cmsg_01JxAnD1jDpD9cQroZfV4bYG6CLZpuvxhaBfB2kGxDRAoJ). 이 예외는 REQUIREMENTS EXP-07 · EXP-15 · EXP-09 · MAST-05 · 추적표 EVID-01 다섯 줄에만 적용했다. 상태 칸 `Pending` 유지, `git diff --numstat` 추가 5 · 삭제 5 = 10(상한 이하). 사용자가 제안 문구를 고치지 않아 플랜 제안 문구를 그대로 썼다.

### ROADMAP before → after (`/gsd-phase --edit 6 --force`, 수정 3줄)

- 기준 1: `지급 완료액은 실제 이체 금액(부가세 포함·원천징수 차감 후)으로 적고 domain/money.grossFromTotal()(Phase 4)로 공급가액을 역산해 계산값과 다르면 차이를 표시한다(Issue 8)` → `…으로 적고, 서버가 다시 계산한 지급 총액과 다르면 차이와 사유를 남긴다. 부가세 규칙 지급은 grossFromTotal()(Phase 4)로 공급가액을 역산하며 세율은 증빙일 기준 이력 설정(TAX_VAT_RATE)이다. 원천징수 지급은 공급가액을 역산하지 않고 차이만 보인다(UA-619)(Issue 8)`
- 기준 3: `직원이 자기 카드·자기 팀 카드 사용을 등록하면 견적 줄` → `…등록하면(공용 카드 — 소지자 · 팀 없음 — 는 대리 등록 권한자만 등록한다, Q5 · U-2) 견적 줄`, 그리고 `사용액은 같은 금액 모델(통화·환율·원화 환산액)로 적힌다.` → `사용액은 전표의 결제 합계(부가세 포함)로 적고 공급가·부가세는 서버가 증빙 종류 규칙으로 역산하며(D-607), 같은 금액 모델(통화·환율·원화 환산액)로 적힌다. 구매 완료 때 경영관리가 적는 카드 금액도 결제 합계다.`
- 06-01 줄: `디자인 기준 SP-1~6 · 상태 낱말 매핑 한 파일 · D-607/R-9 요구사항·ROADMAP 문구 정렬 (W1)` → `06 SP 승격(SP-1 · 2 · 3 · 4 · 5 · 7 · 8 · 9) · status-map 낱말 · 실행 게이트 · 요구사항 문구 (W1)` (재계획 커밋이 고치지 않아 변경함)
- 마일스톤 범위(`roadmap.milestone-scope`) 전 · 후 동일. 다른 ROADMAP 줄은 건드리지 않았다.

### REQUIREMENTS before → after

- EXP-07: 끝 `…연결 없는 카드 사용은 서버가 막는다(이중 계산 방지)` → `…(이중 계산 방지). 사용액은 전표의 결제 합계로 적고 공급가는 서버가 역산한다(D-607). 공용 카드(소지자 · 팀 없음)의 사용은 대리 등록 권한자만 등록한다(Q5 · U-2)`
- EXP-15: `사람은 공급가액만 적는다.` → `사람은 공급가액만 적는다(법인카드 사용·구매 완료는 예외 — 결제 합계를 적고 서버가 공급가를 역산한다, D-607).`
- EXP-09: `시스템이 공급가액으로 역산해 계산값과 다르면 차이를 표시한다` → `부가세 규칙은 시스템이 공급가액으로 역산하고, 계산값과 다르면 차이를 표시한다(원천징수는 차이만)`
- MAST-05: `값은 Phase 6 계획에서 정한다` → `기본 값은 계좌이체 · 법인카드 · 현금이다(Phase 5 시드 — 06-02 확정, 관리자가 더하고 바꾼다)`
- 추적표: `| EVID-01 | Phase 5 | Pending |` → `| EVID-01 | Phase 5(지출결의) + Phase 6(카드 사용) | Pending |`
- OPS-09: 문구 변경 없음. 청구 플랜(C16)은 06-03 · 06-04 · 06-12.

## 검증 결과

- 단위(`pnpm exec vitest run --project unit` status-map · design-system-docs · tokens): 3 파일 405 passed, 0 failed
- `pnpm lint` exit 0(boundaries 설정 경고 1건은 기존) · `pnpm typecheck` exit 0
- E2E `CI=true pnpm playwright test test/e2e/dev-components.spec.ts --grep-invert @wave-merge`: 13 passed · 18 skipped · 0 failed (db:dev · db:reset:test는 오케스트레이터 지시로 돌리지 않음)
- merge-base 기준 `tokens.css` · `package.json` · `pnpm-lock.yaml` diff 비어 있음
- DECISIONS 06 SP id 집합 = {1,2,3,4,5,7,8,9}, `SP-6` 0건. SYSTEM `(DECISIONS 06 SP-n)` 서로 다른 8건, `(DECISIONS 06 SP-6)` 0건
- 시각 기준 사진 갱신 = 06-29 Task 3(로컬 생성 안 함)

## Decisions Made

- 06 낱말 아홉은 B2 예외(처음 쓰는 플랜이 더한다)로 이 플랜이 한꺼번에 더했다 — DECISIONS 06 SP-2에 예외 이유 기록.
- `statusKind`가 표 밖 낱말에 `accent`를 돌려주기 때문에 accent 낱말(`구매 요청 중` · `확인 전`) 테스트는 `word in STATUS_KIND`도 단언해 RED가 유효하도록 했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `/gsd-phase --edit 6`에 `--force` 추가**
- **Found during:** Task 3 (ROADMAP 정렬)
- **Issue:** edit-phase 워크플로는 진행 중 페이즈 편집을 `--force` 없이 막는다(Phase 6은 진행 중).
- **Fix:** `--edit 6 --force`로 호출. 스킬 호출은 훅에 막히지 않았다. 대화형 질문(필드 선택 · 새 값 · diff 확인)은 해결된 체크포인트의 사용자 답(제안 문구 그대로)으로 대신하고, 워크플로의 write 단계대로 섹션 안 세 줄만 제자리 교체했으며 `milestone-scope` 전 · 후가 같고 STATE Roadmap Evolution 항목을 `state.add-roadmap-evolution`으로 남겼다.
- **Files modified:** `.planning/ROADMAP.md`
- **Commit:** `e992bb64`

**2. [Rule 1 - Bug] 플랜 verify 「`grep -c "사용자 확인 대기" docs/design/DECISIONS.md` = 0」가 기존 줄 때문에 1**
- **Found during:** Task 3
- **Issue:** 06 SP 여덟의 결정자 줄은 모두 갱신해 0건이다. 남은 1건은 DECISIONS 1040행의 05 이전 항목(「재검토 후보(사용자 확인 대기)」)이고 `origin/main`에도 있다.
- **Fix:** 이 플랜과 무관한 기존 기록이라 수정하지 않았다(CLAUDE.md §3.3).
- **Files modified:** 없음

**Total deviations:** 2(Rule 3 하나 · 검증 문구 한계 하나). **Impact:** 범위 확대 없음.

## Issues Encountered

- 합계 줄 글자 문장만 맞췄다. §7-3의 괄호 「합계 행은 표 안의 한 행이라 본문 크기이고, 합계 줄은 표 밖에서 …」는 두 글자가 같아져 설명이 어색하지만 플랜 범위(두 곳 교체)라 그대로 뒀다. 합계 줄을 그리는 컴포넌트 CSS 확인은 합계 줄을 쓰는 화면 플랜(06-15 등) 몫이다.
- 훅이 `.claude/gates/phase-06.log`에 `review` 한 줄을 써 수정 상태로 남았다 — 이 플랜의 변경이 아니라 커밋하지 않았다.

## Known Stubs

없음.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- W1 두 플랜(06-01 · 06-27)이 끝났다. W2(06-02 · 06-29)는 SYSTEM의 SP-1 · 7 · 8 · 9 계약과 `status-map` 낱말 위에서 시작할 수 있다. PR-A(06-27)는 사용자 머지 대상이다.
- 06-28 `종결` 낱말은 그 플랜이 더한다.

## Self-Check: PASSED
