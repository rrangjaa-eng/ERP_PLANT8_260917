---
phase: 06-payment-evidence-cards
plan: 02
subsystem: settings
tags: [settings, pair-grid, permission-grid, document-numbering, purchase-request, code-tables]
requires:
  - phase: 05-expense-approval-leave
    provides: EVIDENCE_MAX_SIZE_MB, allocateExpenseNumber 선례(acf1cf2), expense_team 서식 줄, PermissionGrid, 지급 방식 · 증빙 종류 코드표
  - phase: 06-payment-evidence-cards (06-01)
    provides: DECISIONS 06 SP-9 짝 격자 승격(빈 행 = 검사 안 함)
provides:
  - "설정 키 넷(evidence.required · evidence.prepaid_due_days · purchase.online_vendor_name · payment.method_evidence_pairs, readBy 6)"
  - "SettingDef.pairGrid · describeSettingField의 pair-grid 갈래 · 설정 화면 짝 격자(PermissionGrid 재사용, saveNoun)"
  - "isMethodEvidencePairAllowed(domain/payments/method-evidence-pairs.ts)"
  - "resolveLineDoor · LineDoorKind(domain/quotes/line-door.ts)"
  - "구매 요청 번호: purchaseRequestNumberFormat · loadPurchaseRequestNumberFormat · allocatePurchaseRequestNumber · purchase_request_team 서식 줄 · seqStartGuardFor 구매 요청 갈래"
  - "MAST-05 지급 방식 코드표 E2E 확정"
affects: [06-03, 06-04, 06-08, 06-10, 06-13, 06-14, 06-29]

plan_head_before: 475833bba3c5c0bf911d233de277443964f58312
actuals:
  tokens: 14200
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "새 입력 컴포넌트 없이 §7-13 PermissionGrid를 설정 입력으로 재사용 — 호출자가 promise 사슬로 칸 저장을 차례대로 보낸다"
    - "번호 부여는 서식을 인자로 받고 시작값만 같은 tx로 다시 읽는다 — 05 allocateExpenseNumber 꼴 복제"

key-files:
  created:
    - domain/payments/method-evidence-pairs.ts
    - domain/quotes/line-door.ts
    - test/unit/settings/phase6-keys.test.ts
    - test/e2e/phase6-keys.spec.ts
    - test/e2e/payment-method-codes.spec.ts
    - docs/design/checks/2026-10-06-06-02-pair-grid.md
  modified:
    - domain/settings/keys.ts
    - domain/settings/registry.ts
    - domain/document-numbering/index.ts
    - ui/permission-grid/PermissionGrid.tsx
    - app/(app)/admin/settings/page.tsx
    - app/(app)/admin/settings/settings-form-client.tsx
    - test/unit/domain/document-number-format.test.ts
    - test/integration/document-numbering.test.ts

key-decisions:
  - "PairGridEditor는 짝 목록을 자기 상태(useState + ref)로 들고 서버 재렌더 prop은 무시한다 — 저장마다 revalidatePath가 격자를 다시 그려 낙관적 칸을 되돌리는 깜빡임을 막는다(다른 설정 칸의 useState(initialValue) 규칙과 같다)"
  - "격자 행 · 열 목록도 처음 값을 고정한다(useState) — 서버 재렌더로 rows/columns 참조가 바뀌면 PermissionGrid가 칸을 다시 동기화한다"
  - "라벨은 fieldset legend 한 번(multi-enum 선례), PermissionGrid caption은 시각적으로 숨김 그대로"

patterns-established:
  - "settings-form-client: view model에 pairGrid가 있으면 SimpleFieldEditor 대신 PairGridEditor"

requirements-completed: [EVID-02, EXP-09, EXP-10, EXP-13, MAST-05]

coverage:
  - id: D1
    description: "설정 키 넷이 정의 · 등록 · 서술(pair-grid)되고 readBy 6이며 05 증빙 크기 키는 그대로다"
    requirement: "EVID-02"
    verification:
      - kind: unit
        ref: "test/unit/settings/phase6-keys.test.ts#Phase 6 설정 키 넷 (06-02) · describeSettingField — pair-grid 갈래"
        status: pass
      - kind: unit
        ref: "test/unit/settings/registry-coverage.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "관리자 설정 화면에 증빙 필수 · 선결제 증빙 기한 · 온라인구매 협력사 · 짝 격자가 서고 칸 하나가 그 짝만 더하고 뺀다(즉시 저장 · 재열기 유지 · 연속 저장 차례)"
    requirement: "EXP-13"
    verification:
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/phase6-keys.spec.ts (4 passed)"
        status: pass
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/settings.spec.ts test/e2e/permissions-grid.spec.ts (38 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "짝 판정(isMethodEvidencePairAllowed)과 견적 줄 문 판정(resolveLineDoor)이 순수 함수로 서고 모든 갈래가 단위로 단언된다"
    requirement: "EXP-10"
    verification:
      - kind: unit
        ref: "test/unit/settings/phase6-keys.test.ts#isMethodEvidencePairAllowed · resolveLineDoor"
        status: pass
    human_judgment: false
  - id: D4
    description: "구매 요청 번호 프로젝트 26001-C0001 · 팀 TC26-0001, 서식은 인자로, 시작값 낮추기 가드가 구매 요청 갈래를 지난다"
    requirement: "EXP-09"
    verification:
      - kind: unit
        ref: "test/unit/domain/document-number-format.test.ts#purchaseRequestNumberFormat (06-02)"
        status: pass
      - kind: integration
        ref: "test/integration/document-numbering.test.ts#구매 요청 번호 부여 (06-02, CROSS E-2) · 구매 요청 번호 순번 시작값 낮추기(D2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "지급 방식 코드표 값 추가 · 라벨 수정 · 비활성화가 지출결의 폼 고르기와 짝 격자 행에 반영된다"
    requirement: "MAST-05"
    verification:
      - kind: e2e
        ref: "CI=true pnpm playwright test test/e2e/payment-method-codes.spec.ts test/e2e/code-tables.spec.ts (24 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "S20 화면의 error · partial · long-text · 짝 격자 가로 스크롤 · 클릭 영역 — 독립 DOM 감사"
    verification: []
    human_judgment: true
    rationale: "계획이 별도 에이전트의 CI=true DOM 감사를 요구한다. 실행자는 에이전트를 띄울 수 없어 자체 실측만 했다(아래 표) — 독립 감사는 오케스트레이터가 띄운다"

duration: 30min
completed: 2026-10-06
status: complete
---

# Phase 6 Plan 02: 설정 키 · 짝 격자 · 구매 요청 번호 Summary

**설정 키 넷과 §7-13 PermissionGrid 재사용 짝 격자(칸마다 즉시 저장 · promise 사슬 차례 저장), 짝 · 줄 문 판정 순수 함수 둘, 05 allocateExpenseNumber 꼴의 구매 요청 번호(프로젝트 `26001-C0001` · 팀 `TC26-0001`)와 시작값 낮추기 가드, 지급 방식 코드표 E2E 확정**

## Performance

- **Duration:** 약 30분
- **Started:** 2026-10-06T04:08:53Z
- **Completed:** 2026-10-06T04:38Z(코드 커밋 기준)
- **Tasks:** 3
- **Files modified:** 14(생성 6 포함, 코드 커밋 기준)

## 실행 게이트 ⓪ 결과 (C15)

| 줄 | 결과 |
|---|---|
| C15 | `origin/main`에 05-13-SUMMARY.md 있음 |
| 06-01 | `DECISIONS 06 SP-9` SYSTEM.md 1 · 06-01-SUMMARY에 SP-9 거부 기록 없음(「검사 안 함」 확인) |
| A-05-KEYS | `EVIDENCE_MAX_SIZE_MB` 1 · `allocateExpenseNumber` 1 · `expense_team:` 1 |
| A-05-MONEY | `sumKrw` · `diffKrw` 2 |
| A-05-CODES | `"payment_method"` 1 · `evidence_type` 6 · `bank_transfer` 1 · `listCodeItems` 1 |
| A-UI | `PermissionGrid` 1 · `setSimpleSettingAction` 1 · `describeSettingField` 1 |
| A-NEW | origin/main의 domain · repositories · ui · app에서 `domain/expenses/line-door.ts` 주석 한 줄(`resolveLineDoor` 언급)만 — 코드 정의 없음, 계속 진행 |

`git merge origin/main`은 이미 최신(Already up to date). **06-02 시작 커밋: `475833bba3c5c0bf911d233de277443964f58312`**(이 값을 `plan_head_before`로도 기록). 이름 대응표: 계획 이름과 실제 이름이 모두 같아 대응표 없음.

## Accomplishments

- 설정 키 넷(readBy 6) · `SettingDef.pairGrid` · `pair-grid` 서술 · 설정 화면 짝 격자(`PermissionGrid` 재사용, `saveNoun="짝"`, 새 `ui/` 컴포넌트 없음). 권한표 · 정보 노출표 기본 문구 무변경.
- 칸 하나 = 그 짝만 더하고 뺌(비활성 값의 짝 보존), 연속 클릭은 promise 사슬로 앞 저장 뒤 최신 목록에서 계산해 보냄(E-45).
- `isMethodEvidencePairAllowed`(빈 목록 · 빈 행 = 참), `resolveLineDoor`(공백 제거 · NFC 정확 비교).
- 구매 요청 번호 서식 키 아홉 + 함수 넷 + `purchase_request_team` 서식 줄 + `seqStartGuardFor` 구매 요청 갈래(05 PR #162 P1 꼴).
- MAST-05: 시드 셋 확인 → 추가 · 라벨 수정 → 지출결의 폼과 짝 격자 행 반영 → 비활성화 시 사라짐을 E2E로 확정.

## Task Commits

1. **Task 1: 트레이서 — 설정 키 넷 · 짝 격자** - `b1c9b754` (feat)
2. **Task 2: 판정 둘 + MAST-05 E2E** - `9d4e1272` (feat)
3. **Task 3: 구매 요청 번호 · 낮추기 가드** - `ef619668` (feat)

⚡ Tracer verified end-to-end — expanding(단위 · lint · typecheck · E2E phase6-keys · settings · permissions-grid 재실행 녹색 뒤 Task 2로).

## Verification 결과

| 명령 | 결과 |
|---|---|
| `vitest --project unit` phase6-keys · registry-coverage · keys-hint-style · registry · permission-grid-resync · document-number-format · document-number-separator | 7 파일 87 passed |
| `vitest --project integration` document-numbering · document-counters-concurrency · document-counters | 3 파일 56 passed |
| `CI=true playwright` phase6-keys | 4 passed (18 skipped = 모바일 프로젝트) |
| `CI=true playwright` settings · permissions-grid | 38 passed |
| `CI=true playwright` payment-method-codes · code-tables | 24 passed |
| `pnpm lint` · `pnpm typecheck` | exit 0 · exit 0(경계 플러그인 deprecation 경고만) |

RED 확인: 단위(키 · 판정 · 서식)는 구현 전에 실패(정의 없음 · 모듈 없음 · 함수 없음)를 봤다. 통합 「낮추기(D2)」는 구현 뒤 갈래만 일시로 끈 상태에서 ⑴ ⑵ ⑷가 빨갛고 복원 뒤 녹색임을 확인했다(⑶ ⑸는 가드 없이도 성립하는 케이스).

## 화면 DOM 실측 (실행자 자체 · CI=true 빌드 · 임시 Playwright 스크립트, 커밋 안 함)

| 폭 | 문서 가로 넘침 | 짝 격자 PC 표 | 칸 | 폰 체크박스 | 온라인구매 협력사(120자) |
|---|---|---|---|---|---|
| 1280 | 0 | 보임, 가로 넘침 0 | td 68×45 | — | input 616폭, 칸 안 스크롤 |
| 768 | 0 | 보임, 가로 넘침 0 | td 68×45 | — | input 616폭, 칸 안 스크롤 |
| 375 | 0 | 숨김(폰 select 보임) | — | 44×44 | input 343폭, 칸 안 스크롤 |
| 320 | 0 | 숨김(폰 select 보임) | — | 44×44 | input 288폭, 칸 안 스크롤 |

- S20 error: `선결제 증빙 기한`에 0 → 칸 오류 `저장 실패 · 1 이상만 가능 · 값 확인`, 재열기 시 14 그대로(저장 안 됨).
- S20 partial: `온라인구매 협력사`에 거래처와 맞지 않는 문자열 → 저장됨 · `저장 실패` 0건.
- 스크린샷: `/tmp/claude-0/-home-user-ERP-PLANT8-260917/157802f6-d640-5a76-88ea-648ef79f4d4c/scratchpad/audit-0602-{1280,768,375,320}.png`. 새 색 · 서체 · radius: CSS 파일 변경 0(tokens.css 무변경).

## Deviations from Plan

### 독립 DOM 감사 미실시 (오케스트레이터 몫)

**1. [범위 밖 — 실행 환경 제한] 계획 ⑥ 「별도 에이전트의 CI=true DOM 감사」를 실행자가 못 띄움**
- **Found during:** Task 1 ⑥
- **Issue:** 이 실행자는 하위 에이전트를 띄울 도구가 없다. 감사는 실행자가 아닌 별도 에이전트여야 한다(CLAUDE.md §6).
- **Fix:** 위 표처럼 실행자가 같은 항목을 DOM으로 실측해 점검표 근거로 썼다(독립이 아님을 점검표에도 적었다). 독립 감사는 오케스트레이터가 띄워야 한다 — 위 coverage D6을 `human_judgment: true`로 둔 이유.
- **Files modified:** 없음(임시 스크립트는 삭제)

### 관찰(결함 판정 아님)

- 온라인구매 협력사 칸 폭이 1280에서 616으로 측정됐다. 계획 문장은 `--field-w-long` 480을 말하지만 이 칸은 기존 TextField 폭을 그대로 쓰며 이 플랜은 CSS를 건드리지 않았다. 독립 감사가 기준(480)과 판정해 달라.
- E-45 E2E는 구현 전 RED를 보지 못했다(E2E는 구현 뒤 처음 실행). Next.js가 서버 액션을 자체로 큐잉할 수 있어 이 E2E가 사슬 없이도 통과할 가능성이 있다 — 사슬은 계획대로 구현했고 테스트는 「첫 POST를 붙잡은 동안 둘째 POST 없음」을 단언한다.

**Total deviations:** 1(환경 제한으로 독립 감사 보류), 관찰 2
**Impact on plan:** 코드 · 테스트 범위는 계획 그대로다. 독립 감사만 남았다.

## Issues Encountered

- 임시 DOM 실측 스크립트의 `require`가 ESM에서 정의되지 않아 한 번 실패(원인 확인 뒤 import로 수정, 스크립트는 커밋하지 않고 삭제).

## Known Stubs

None.

## Threat Flags

None — 새 쓰기 경로 · 액션 없음(기존 `setSimpleSettingAction`의 관리자 설정 권한 경계 그대로, 서버가 키 스키마로 재검증).

## acceptance 점검

- 키 넷 4 · `EVIDENCE_MAX_SIZE_MB` 정의 1 · `pairGrid?:` 1 · `"pair-grid"` 2 · `saveNoun` PermissionGrid 4 / 설정 클라이언트 1 · `ui/*pair-grid*` 없음 · 「짝 격자 연속 저장」 1 · `domain/permissions` · `domain/money` · `admin/permissions` diff 비어 있음 · 점검표 `- [ ]` 0.
- Task 2: 순수 함수 파일 import 0 · `domain/payments/index.ts` 없음 · `domain/expenses/line-door.ts` · `domain/seed/expenses.ts` diff 없음.
- Task 3: 서식 키 4 / 5 · 부여 함수 범위 12줄, 전역 풀 읽기 0, 공유 잠금 · 시작값 재읽기 · tx 각 1, 공유 잠금이 첫 줄 · 가드 갈래 각 1 · `repositories/document-counters.ts` · 그 통합 테스트 diff 없음 · `purchase_request_team:` 1.

## Next Phase Readiness

- 06-03 · 06-04 · 06-08 · 06-10이 `readBy`를 지우며 키를 읽는다(registry-coverage가 알려 준다). 06-04는 `isMethodEvidencePairAllowed`, 06-08 · 06-14는 `allocatePurchaseRequestNumber` · `purchase_request_team`, 06-13은 `resolveLineDoor`를 부른다.
- 남은 일: 독립 DOM 감사(S20), PR-B 묶음 `/review` + `/design-review` → `/qa`, `risk: permissions`의 Opus 독립 검토 1(번호 부여 잠금 T-06-151 포함).

---
*Phase: 06-payment-evidence-cards*
*Completed: 2026-10-06*
