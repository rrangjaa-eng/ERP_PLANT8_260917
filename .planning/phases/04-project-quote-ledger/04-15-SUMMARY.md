---
phase: 04-project-quote-ledger
plan: 15
subsystem: projects
tags: [nextjs, server-actions, drizzle, postgres, money, playwright]

requires:
  - phase: 04-14
    provides: "copyQuoteLines(INSERT…SELECT, version 1, withLineage) · countCopyableLines"
  - phase: 04-20
    provides: "denyWrite(viewer, rule, ids, err) — write.denied 경고의 한 입구"
  - phase: 04-40
    provides: "normalizeMoneyInput · MoneyInputError(KRW 환율 1 · USD 환율 > 0 · 정수 범위)"
  - phase: 04-44
    provides: "validatePreEstimateChange(부호 · 숫자 · 환율 > 0, rev 5 문구)"
  - phase: 04-22
    provides: "validatePeriodChange(형식 · 달력 · 순서 문구)"
  - phase: 04-08/04-46
    provides: "등록 폼 Esc 판정(isFormPristine) · 입력 버리기 확인"
provides:
  - "createProject의 복사 등록(copyFromProjectId) — 출처 현재 차수 견적 줄 · 견적 외 비용만 새 1차로(계보 없음 · 취소 · 보관 · 조정 제외)"
  - "getProjectCopySource — 폼 미리 채움 + 출처 한 줄 {k}"
  - "상세 머리 줄 2차 「프로젝트 복사」 링크 · 목록 ?new=1&copyFrom 미리 채운 등록 폼"
  - "등록 폼 총 매출 예상가(금액 + 통화 + 환율) · 서버 검증 · 커밋 뒤 최근 환율 기억"
  - "등록 기간 형식 · 순서 서버 검증(validateNewProjectPeriod)"
  - "ProjectInputRejectedError(칸 오류) · createProjectAction rejected 봉투"
affects: [04-44, 04-16, projects-register, projects-detail-header]

actuals:
  tokens: 18000
  tasks: 2
  commits: 5
plan_head_before: f639c8e85f4b4e0dbf2e82e126ea6f7ed9c340a2

tech-stack:
  added: []
  patterns:
    - "등록 입력 칸 거부는 domain이 ProjectInputRejectedError(칸 목록)로 쓰기 전에 던지고, 액션이 { rejected: { errors } } 봉투로 돌려준다"
    - "페이지 이동을 버튼 위계로 보일 때 Link에 buttonLinkClassName(variant)"

key-files:
  created:
    - test/integration/project-copy.test.ts
    - test/e2e/project-copy.spec.ts
  modified:
    - domain/projects/index.ts
    - domain/projects/period.ts
    - repositories/quote-lines.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/project-form.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/projects/projects.module.css
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - ui/button/Button.tsx
    - ui/button/Button.module.css
    - test/e2e/project-register.spec.ts

key-decisions:
  - "총 매출 예상가를 비우면 04-01 기본 저장(원화 0 · KRW · 환율 1)과 같다 — 「없음」과 0을 가르는 새 컬럼을 만들지 않는다(0원 예상가는 업무상 없음, CEO 리뷰 B-37)"
  - "복사 출처 거부는 없음 · 범위 밖 · 보관 · uuid 아님을 가르지 않고 한 문구 「복사할 프로젝트 없음 · 새로 고침」(rev 5 밖 · P0 F1 명사형)"
  - "등록 기간 판정은 04-22 validatePeriodChange를 수주중 상태로 부르는 validateNewProjectPeriod — 판정 · 문구 한 곳"
  - "총 매출 예상가 칸 판정은 04-44 validatePreEstimateChange(부호 · 환율 > 0) → 04-40 normalizeMoneyInput(KRW 환율 1 · 범위) 순서, 이 파일에 손 검증기 없음"

patterns-established:
  - "복사 출처 판정은 번호 부여 트랜잭션 앞, 차수 조회 · 줄 복사는 tx 안(04-32 규칙)"

requirements-completed: [PROJ-05, PROJ-01]

coverage:
  - id: D1
    description: "프로젝트 복사 등록 — 견적 줄 · 견적 외 비용만 새 1차로(계보 없음 · version 1), 조정 · 보관 · 취소 줄 · 기간 · 총 매출 예상가 · 매출 제외, 원본 무변경"
    requirement: PROJ-05
    verification:
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(c1)"
        status: pass
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(c2)"
        status: pass
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(c3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "범위 밖 · 보관 · 없는 출처 거부 + write.denied 한 번(금액 없음), 미리 채우기 없음"
    requirement: PROJ-05
    verification:
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(c4)"
        status: pass
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(c5)"
        status: pass
    human_judgment: false
  - id: D3
    description: "상세 「프로젝트 복사」 → 미리 채운 폼 · 출처 한 줄 → Ctrl+Enter → 새 상세에 줄 둘 · 조정 그룹 없음, 복사 폼 Esc(DR-27)"
    requirement: PROJ-05
    verification:
      - kind: e2e
        ref: "test/e2e/project-copy.spec.ts#트레이서"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-copy.spec.ts#DR-27"
        status: pass
    human_judgment: false
  - id: D4
    description: "등록 폼 총 매출 예상가 — KRW · USD 저장, KRW 위조 환율 1 고정, 거부 칸 오류, 커밋 뒤에만 최근 환율 기억, 빈 칸 = 0원"
    requirement: PROJ-01
    verification:
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(p1)~(p4),(p6)"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(d1),(d2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "등록 기간 형식 · 순서 서버 검증(PR #38 「날짜 순서」)"
    requirement: PROJ-01
    verification:
      - kind: integration
        ref: "test/integration/project-copy.test.ts#(p5)"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(d3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "S2 long-text backstop — 출처 한 줄 · 최장 프로젝트명 · 총 매출 예상가 칸이 1280 · 1024 · 375에서 폼 720 · 칸 폭 3종 안, 가로 스크롤 0"
    verification: []
    human_judgment: true
    rationale: "독립 DOM 감사(별도 에이전트, CI=true)가 아직 없다 — 실행자에게 서브에이전트 도구가 없고 자가 감사는 금지(continue-here 「실행자 자가 DOM 감사」). 오케스트레이터가 띄워야 한다"

duration: 40min
completed: 2026-09-26
status: complete
---

# Phase 4 Plan 15: 프로젝트 복사 등록 + 등록 폼 총 매출 예상가 Summary

**상세의 2차 「프로젝트 복사」가 원본 기본 정보를 채운 등록 폼을 열고, 등록하면 04-14 `copyQuoteLines`(계보 없음 · 취소 줄 제외)로 원본 현재 차수의 견적 줄 구조만 새 1차에 들어온다. 등록 폼에는 총 매출 예상가(금액 쉼표 입력 + 통화 + 환율)와 서버 기간 순서 검증이 더해졌다.**

## Performance

- **Duration:** 약 40분
- **Started:** 2026-09-25T23:20Z
- **Completed:** 2026-09-26T00:01Z
- **Tasks:** 2 (Task 1 트레이서 · Task 2 auto tdd)
- **Files modified:** 14

## Accomplishments

- `createProject`가 `copyFromProjectId`를 받는다 — 출처 판정(행 범위 · 보관 · uuid 모양)은 번호 부여 트랜잭션 앞, 출처 현재 차수 조회와 `copyQuoteLines({ withLineage: false, excludeCancelled: true })`는 같은 tx 안. 번호 부여 · 1차 생성 코드는 복제하지 않았다(분기 하나). 행동 로그 detail에 `copiedFromProjectId` · `copiedLineCount`.
- `copyQuoteLines` · `countCopyableLines`에 선택 `excludeCancelled`(기본 false — 새 차수 복사는 취소 줄도 계보째 가져간다). 두 번째 복사 쿼리 없음.
- `getProjectCopySource(viewer, id)` → `{ number, name, clientId, teamId, pmUserId, lineCount }`. 범위 밖이면 null → 일반 등록 폼.
- 범위 밖 · 보관 · 없는 출처는 `denyWrite(viewer, "project.copy-source", { sourceProjectId }, CopySourceMissingError)` — `write.denied` 한 번, 금액 키 없음.
- 목록 `?new=1&copyFrom={id}`: 폼 위 `--fs-sm --muted` 한 줄 `{번호} {프로젝트명}에서 복사 · {k}줄`, 네 칸 미리 채움(= Esc 판정의 처음 값, DR-27), 숨은 칸으로 출처 id. 폼이 열려 있으면 1차 「프로젝트 등록」 미렌더(E2E로 확인).
- 상세 머리 줄 `HeaderCopyActions` 안에 2차 「프로젝트 복사」 링크(`projects` 쓰기일 때만). 가져오기 모달 없음.
- 등록 폼 총 매출 예상가: 금액(280, 04-09 쉼표 입력 훅) · 통화 Select(200) · 환율(280, KRW면 숨김, USD 기본값은 `recentFxRate("USD")` 실제 값). 필수 표시 없음.
- 서버 검증: 액션 zod가 04-44 `validatePreEstimateChange`로 부호 · 환율 > 0을 먼저 거르고(같은 문구), domain이 같은 판정 뒤 04-40 `normalizeMoneyInput`(KRW 환율 1 고정 · 범위)으로 정규화 → `moneyToColumns` 저장. 거부는 `ProjectInputRejectedError` → 액션 `{ rejected: { errors } }` → 칸 아래 `Form.Error` + 1차 옆 `등록하지 못했습니다 · 총 매출 예상가 1칸`, 입력값 유지.
- 환율을 고친 USD 등록만 **커밋 뒤** `rememberFxAfterCommit` 한 번(거부 · 롤백 등록은 설정 무변경 — 통합 (p4)).
- 등록 기간(PR #38 「날짜 순서」): `validateNewProjectPeriod`(period.ts) — 04-22 `validatePeriodChange`를 수주중으로 부르는 한 줄. 종료일 < 시작일 · 형식 아님이 04-22와 같은 문구의 칸 오류, 행 없음.

## Task Commits

1. **Task 1 RED (통합):** `7196deb` test(04-15): add failing integration test for project copy registration
2. **Task 1 RED (E2E):** `d0f54da` test(04-15): add failing E2E for project copy from detail header
3. **Task 1 GREEN:** `fabfaef` feat(04-15): copy a project into a new registration from the detail header
4. **Task 2 RED:** `88de58e` test(04-15): add failing tests for pre-estimate and period on registration
5. **Task 2 GREEN:** `87a133e` feat(04-15): add pre-estimate field and period check to project registration

RED 확인: Task 1 통합 4 실패(복사 줄 0 · `getProjectCopySource` 없음 · 거부 안 됨) · E2E 2 실패(「프로젝트 복사」 링크 없음) · Task 2 통합 5 실패(저장 0 · 오류 클래스 없음) · E2E (d1)~(d3) 3 실패(칸 없음 · 문구 없음). 전부 기능 부재 사유. 리팩터 커밋 없음.

## 추가한 테스트

- `test/integration/project-copy.test.ts:170` (c1) 복사 범위 · 제외 목록 · 계보 없음 · version 1 · 업무 칸 그대로 · 행동 로그 detail
- `test/integration/project-copy.test.ts:227` (c2) 원본 프로젝트 · 차수 · 줄 · 매출 무변경(DB 스냅숏 비교)
- `test/integration/project-copy.test.ts:236` (c3) `{k}` = 실제 복사 줄 수, 기본 정보 넷
- `test/integration/project-copy.test.ts:255` (c4) 범위 밖(projects 쓰기만) 거부 + `write.denied` 1회 · 금액 키 없음 · 행 없음 · 미리 채움 null
- `test/integration/project-copy.test.ts:274` (c5) 보관 · 없는 id · uuid 아님 거부
- `test/integration/project-copy.test.ts:316` (p1) KRW 120,000,000 저장
- `test/integration/project-copy.test.ts:326` (p2) KRW 위조 환율 1350 → 1 고정
- `test/integration/project-copy.test.ts:334` (p3) USD 저장 · 환율 안 고친 저장은 설정 무변경 · 고친 저장만 1350 갱신
- `test/integration/project-copy.test.ts:355` (p4) 환율 0 · 음수 · 상한(KRW · USD 환산) 거부, 행 없음, 최근 환율 무변경
- `test/integration/project-copy.test.ts:381` (p5) 종료일 < 시작일 · 2026-02-30 거부
- `test/integration/project-copy.test.ts:387` (p6) 빈 칸 = 원화 0 · KRW · 환율 1
- `test/e2e/project-copy.spec.ts:94` 트레이서 — 상세 → 복사 폼(미리 채움 · 출처 한 줄 `… · 2줄` · 1차 「프로젝트 등록」 없음) → Ctrl+Enter → 새 상세(번호 다름 · 수주중 · 줄 둘 · 조정 그룹 없음)
- `test/e2e/project-copy.spec.ts:127` DR-27 — 손대지 않은 복사 폼 Esc는 바로 목록, 바꾼 뒤 Esc는 입력 버리기(`프로젝트 등록 · 1칸`) → 2차 취소면 값 유지
- `test/e2e/project-register.spec.ts:294` (d1) `120000000` → `120,000,000` 표시 · 등록 성공
- `test/e2e/project-register.spec.ts:312` (d2) 음수 → 칸 아래 `총 매출 예상가는 0 이상 · 금액을 고쳐 주세요` + 1차 옆 `등록하지 못했습니다 · 총 매출 예상가 1칸` · 다른 칸 유지
- `test/e2e/project-register.spec.ts:333` (d3) 시작일 오늘+5 · 종료일 오늘+1 → 종료일 칸 아래 `종료일이 시작일보다 빠릅니다 · 종료일을 고쳐 주세요` · 목록 검색 결과 없음

## 실행한 검증(실측)

- Task 1 verify: `pnpm vitest run --project integration test/integration/project-copy.test.ts test/integration/document-counters-concurrency.test.ts` → 8 passed · `CI=true pnpm playwright test test/e2e/project-copy.spec.ts test/e2e/project-register.spec.ts`(프로덕션 빌드) → 11 passed. 04-14 회귀 `quote-revisions.test.ts` 포함 28 passed. 트레이서 게이트(interactive · end-of-phase · automated only) 재실행 통과 → 확장 진행.
- Task 2 verify: `pnpm vitest run --project integration test/integration/project-copy.test.ts test/integration/settings.test.ts test/integration/project-period.test.ts` → 55 passed · dev E2E register+copy 14 passed.
- 싼 게이트: `pnpm lint` 0 · `pnpm typecheck` 0 · `pnpm lint:sql` 0 issues · `pnpm build` 0.
- 전체 게이트 한 번: `CI=true pnpm test` → 단위 94 files / **1273 passed** · 통합 53 files / **1393 passed** · E2E **336 passed**(5.0m), 실패 0.
- T-04-SC: `git diff f639c8e -- package.json pnpm-lock.yaml` 비어 있음(새 의존성 0).
- 수용 기준 grep: `domain/projects/index.ts` · `actions.ts`에 날짜 문구 리터럴 · KRW 범위 비교 없음. `insert(quoteLines)`는 기존 새 줄 삽입과 `copyQuoteLines` 둘뿐(두 번째 복사 쿼리 없음).

## Decisions Made

- 빈 총 매출 예상가 = 04-01 기본 저장(원화 0 · KRW · 환율 1). 새 컬럼 없음(B-37 — 0원 예상가는 업무상 없음).
- 복사 출처 거부 문구 `복사할 프로젝트 없음 · 새로 고침`은 rev 5 Copywriting 밖(P0 · F1 명사형) — UI-SPEC 반영 필요. 화면 경로에서는 범위 밖 출처가 미리 채우기 없는 일반 폼으로 열려 숨은 출처 id가 없으므로 이 문구는 방어 경로(동시 보관 · 위조 요청)에서만 serverError로 보인다.
- 복사된 줄의 거래처가 보관된 거래처여도 id를 그대로 옮긴다(계획 Deferred 「엔지 리뷰 §3」 규약 그대로 — 실행 중 문제 없음).
- 04-01 실행된 플랜의 빈자리: 등록 폼 · 액션에 총 매출 예상가 칸이 없었다(스키마 컬럼만 있음). 이 플랜이 채웠다(D-75~D-95 범위 밖 발견).

## Deviations from Plan

### Auto-fixed / 조정

**1. [Rule 3 - 막힘] `ui/button/Button.tsx` · `Button.module.css` 수정(files_modified 밖)**
- 「프로젝트 복사」는 이동이라 `<a>`(Link)인데 옆의 「복사해 새 차수」는 2차 버튼이다. 같은 모양을 내려고 `buttonLinkClassName(variant)`를 Button 모듈에 내보내고 `.btn`에 `text-decoration: none`을 더했다(버튼에는 영향 없음). 새 색 · 서체 · radius 없음.
- 커밋: `fabfaef`

**2. [Rule 3] `app/(app)/projects/projects.module.css`에 `.copySource` · `.numericInput` 추가(files_modified 밖)** — 출처 한 줄(`--fs-sm --muted`, `max-width: var(--form-max)`, 긴 이름 줄바꿈)과 숫자 칸 오른쪽 정렬 · tabular-nums. 커밋 `fabfaef` · `87a133e`.

**3. [계획 문구와 다른 구현] 금액 칸이 `TextField numberKind`가 아니라 같은 04-09 훅 `useCommaInput`을 직접 쓴다** — `TextField`는 자체 라벨 줄을 그려 등록 폼의 `Form.Field` 배치와 라벨이 겹친다. 쉼표 입력 기계는 같다(E2E (d1)이 `120,000,000` 표시를 단언). 커밋 `87a133e`.

**4. [04-22 파일 수정] `domain/projects/period.ts`에 `validateNewProjectPeriod` 추가** — 계획 ①-b가 예고한 편차. 기존 `validatePeriodChange`의 줄은 한 줄도 바꾸지 않고 수주중 상태로 부르는 래퍼만 더했다(수주중에는 진행 이후 규칙이 걸리지 않아 형식 · 달력 · 순서만 남는다). 커밋 `87a133e`.

**5. [계획 해석] 「부호만 이 경로가 더한다」를 04-44 `validatePreEstimateChange` 재사용으로 구현** — 부호 문구가 이미 그 함수에 rev 5 글자로 있어 새 리터럴을 만들지 않았다. 이 함수가 환율 > 0도 보므로 USD 환율 0 거부 문구는 04-44 판정에서 나온다(04-40과 같은 글자). KRW 환율 1 고정 · 범위는 `normalizeMoneyInput`. zod 사전 거르기도 같은 함수를 `superRefine`으로 부른다.

**6. [알려진 한계] `MoneyInputError`의 칸 배정** — `reason === "fx-rate"`만 환율 칸, 나머지(range · precision · not-finite)는 금액 칸. 그래서 `환율은 소수 4자리까지` · `환율이 상한을 넘습니다`도 금액 칸 아래에 뜬다(메시지 문자열로 가르지 않았다). 04-40 문구 네 개가 아직 UI-SPEC 밖인 기존 이월 항목과 같은 묶음이다.

**7. [Rule 2 - 입력 유실 방지] Esc 판정 칸(`PRISTINE_FIELDS`)에 총 매출 예상가 금액 · 통화 · 환율 추가** — 적은 금액이 확인 없이 버려지지 않게 했다. 환율은 숨은 칸으로 늘 실어 통화 전환이 1칸으로 센다. 기존 (c)~(c4) · 복사 DR-27 E2E 통과.

**8. [범위 유지] 1차 옆 `등록하지 못했습니다 · {칸} {n}칸`은 이번에 더한 서버 칸 거부(기간 · 총 매출 예상가)에만** — 필수 네 칸의 기존 막힘 문구(`클라이언트를 고르세요.` 등)는 04-01 동작 그대로 두었다. UI-SPEC은 필수 칸도 `등록하지 못했습니다 · 클라이언트 1칸`형이라 불일치가 남는다(범위 밖 — 기록만).

**9. [미실행] Task 2 ④ 독립 DOM 감사** — 계획은 별도 서브에이전트(sonnet, `CI=true`, 1280 · 1024 · 375)를 요구하지만 이 실행자에게는 서브에이전트 도구가 없고, continue-here 제약상 실행자 자가 DOM 감사는 금지다. 폭별 판정이 없다 → 오케스트레이터가 띄워야 한다(coverage D6 · human_judgment). 전체 게이트 `CI=true pnpm test`는 감사 없이 한 번 돌렸다 — 감사에서 수정이 나오면 게이트를 한 번 더 돌려야 한다.

---

**Total deviations:** 9 (Rule 2 1 · Rule 3 2 · 계획 해석 · 파일 편차 4 · 미실행 1 · 알려진 한계 1)
**Impact on plan:** 기능 범위는 계획 그대로. DOM 감사만 남았다.

## Issues Encountered

- 테스트 준비에서 `quote_lines.quantity`가 numeric(문자열)이라 `quantity: 2` 타입 오류 → `"2"`로 고침(RED 커밋 뒤 GREEN 커밋에 포함).
- React 컴파일러 린트가 `useCommaInput` 결과 객체의 `inputRef`를 렌더 중 접근으로 잡아(8 errors) 구조 분해로 바꿨다(quote-table의 기존 사용과 같은 형태).
- CI 빌드 E2E 로그의 `[WebServer] ⨯ Error: The destination stream closed early.`는 테스트 결과와 무관한 서버 로그 한 줄(11 passed).

## 열린 항목 · 이월

- **독립 DOM 감사(S2 long-text · DR-14 1280 · 1024 · 375)** 미실행 — 오케스트레이터 몫.
- `복사할 프로젝트 없음 · 새로 고침` 문구를 UI-SPEC Copywriting에 올려야 한다.
- 04-40의 cell-error 문구 네 개(UI-SPEC 밖 이월)가 이 등록 경로에서도 금액 칸 오류로 보일 수 있다(외화 · 환율 정밀도 · 상한). 04-24 문구 · 04-49 매출 표 폭 항목은 이 플랜이 건드리지 않았다.
- 필수 칸 막힘 문구와 UI-SPEC `등록하지 못했습니다 · 클라이언트 1칸`의 불일치(04-01 기존 동작).
- 총 매출 예상가 상세 표시 · 수정 칸은 04-44 몫(이미 있음) — 등록 값이 그 부제로 보이는지는 04-44 E2E가 덮는다.
- CLAUDE.md §7 UX: 통화 기본 KRW · USD 환율 기본값 채움 · 필수 표시 없음 · 복사 폼 미리 채움으로 결정 최소화에 맞다. 등록 폼 칸이 셋 늘었지만 계획(S2)이 정한 칸이다 — 충돌 없음.
- **Codex 재확인: 한도로 미실행 — 한도 풀리면 재확인 필요.**

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 복사 등록 · 총 매출 예상가 등록이 끝났다. 다음 플랜으로 진행 가능. DOM 감사 결과에 따라 CSS 수정이 생길 수 있다.

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: test/integration/project-copy.test.ts · test/e2e/project-copy.spec.ts · domain/projects/index.ts · domain/projects/period.ts · repositories/quote-lines.ts · app/(app)/projects/project-form.tsx
- FOUND commits: 7196deb · d0f54da · fabfaef · 88de58e · 87a133e

## 검토 반영 (Opus, Codex 대체 — 한도 풀리면 재확인 필요)

검토 보고: `/mnt/project-files/phase4-prep/04-15-review-opus.md`(BLOCKING 1 · SHOULD-FIX 4 · NIT 6). Codex 사용 한도 때문에 Opus 독립 리뷰로 교차 리뷰를 대신했다 — 한도가 풀리면 Codex로 다시 확인한다.

### B1 독립 DOM 감사 — 닫힘
- 결과 파일: `/mnt/project-files/phase4-prep/04-15-dom-audit.md` — 별도 에이전트 · `CI=true` · 1280 · 1024 · 375 실측
- 판정: **PASS 16 · FAIL 0 · INFO 2**(INFO ① 서버 왕복 전 무대기 측정은 대기 추가 뒤 재확인 PASS, ② 375 포커스 순서는 직접 측정하지 않음)
- 출처 한 줄 · 최장 프로젝트명 · 총 매출 예상가 칸이 720 · 칸 폭 3종 안, 가로 스크롤 0

### SHOULD-FIX 반영
| 항목 | 커밋 | 테스트 |
|---|---|---|
| S1 환율 소수 4자리 · 환율 상한 오류가 금액 칸으로 가던 칸 배정 — `MoneyInputError`에 칸(`amount` \| `fxRate`)을 더해 환율 오류 셋에서 `fxRate`로 채우고 매핑을 그 칸으로 바꿈 | `f4f756e` fix(04-15): route fx-rate precision and range errors to the fx field | `test/integration/project-copy.test.ts:378`, `:384` (p4) |
| S2 보관된 프로젝트 상세의 「프로젝트 복사」 숨김(`project.archivedAt === null`) | `6d5f80b` fix(04-15): hide project copy link on archived project detail | `test/e2e/project-copy.spec.ts:127` |
| S3 USD 기본 환율 = 설정값, 환율을 안 고친 등록은 설정을 덮지 않고 고친 등록만 갱신 — 화면 경로 E2E. touched를 늘 참으로 바꾼 변이에서 실패 확인 | `69039bc` test(04-15): cover USD default fx rate and touched-only remember on registration | `test/e2e/project-register.spec.ts:358` (d4) |

### 이월
- **S4(열린 항목)** — UI-SPEC rev 5 Copywriting에 없는 문구가 이 경로에서 보인다. 코드가 아니라 UI-SPEC 개정(04-UI-SPEC 개정 플랜 또는 `/design-review`) 몫, 머지 묶음 ③/4 Post-build 전에 처리:
  - 「복사할 프로젝트 없음 · 새로 고침」(`domain/projects/index.ts` `COPY_SOURCE_MISSING`)
  - 04-40 금액 오류 문구가 등록 폼 칸 오류로 나옴 — 「환율은 소수 4자리까지」 · 「외화는 소수 2자리까지」 · 「환율이 상한을 넘습니다 · 환율을 고쳐 주세요」 · 「외화 금액이 상한을 넘습니다 · 금액을 고쳐 주세요」, 그리고 `domain/projects/pre-estimate.ts`의 「환율이 없습니다 · USD 환율을 적어 주세요」
  - `등록하지 못했습니다 · 종료일 n칸`(`시작일` · `종료일` 칸 이름의 1차 옆 줄 — rev 5 예시는 `클라이언트` · `총 매출 예상가`뿐)
- **NIT** — 반영 0건. 모두 손댄 파일 밖이거나 동작 · 기대를 바꾸는 판단이 필요해 이월:
  - N1 1차 옆 줄 칸 수 세기(라벨 기준 중복 제거 · 형식은 S4와 함께 UI-SPEC에서 확정)
  - N2 스키마 `superRefine` 선실패로 기간 오류가 같이 안 보임(`app/(app)/projects/actions.ts`)
  - N3 출처 판정과 복사 사이 TOCTOU(tx 안 `archivedAt` 재확인) — 영향 작음
  - N4 USD→KRW 전환 시 소수 금액이 조용히 반올림(04-40 규칙 소관)
  - N5 링크 버튼 `span.wrap` 없음 — DOM 감사가 높이 · 글자 · radius · 색 동일(PASS)을 확인했고, 펼침 줄 간격 1–2px 차이는 따로 재지 않음
  - N6 `copyFromProjectId`를 `z.string().uuid()`로 좁히기 — (c5) 기대가 바뀌어 택일 필요
