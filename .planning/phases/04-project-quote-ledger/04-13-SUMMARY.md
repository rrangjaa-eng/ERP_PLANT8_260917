---
phase: 04-project-quote-ledger
plan: 13
subsystem: quotes
status: complete
tags: [quote-lines, line-kind, adjustment, out-of-quote, gate, permissions, drizzle, migration]

requires:
  - phase: 04-12
    provides: "편집 범위 순수 함수(lineCellEditability · structuralEditability) · 저장 세 단계 · restoreQuoteLine · quoteLineRowInputSchema(이미 domain으로 옮겨져 있었다)"
  - phase: 04-26
    provides: "quote.line-cap 게이트 — 조정·견적 외 비용 줄도 같은 셈을 지난다"
  - phase: 04-20
    provides: "denyWrite(viewer, rule, ids, err) — 거부 운영 로그 write.denied의 한 입구"
provides:
  - "quote_lines.line_kind(quote · out_of_quote · adjustment, 기본 quote, 인라인 CHECK quote_lines_line_kind_check) — 마이그레이션 0014_quote_line_kind"
  - "권한표 메뉴 projects.adjustment(견적 조정 줄) — 시드 기본값 없음(시스템 관리자는 모든 메뉴 규칙대로 켜짐)"
  - "QUOTE_LINE_KINDS · QuoteLineKind, lineCellEditability·structuralEditability의 lineKind·canAdjust 입력"
  - "project.line-edit ctx의 lineKind · actorCanWrite · actorCanAdjust(필수)"
  - "resolveLineKind · quoteLineFormatErrors(domain/quotes/lines.ts)"
  - "QuoteLineDto.lineKind · QuoteLineListCtx.canAdjust · QuoteLineWriteRow.lineKind(새 줄만)"
affects: [04-23, 04-14, 04-15, 04-17, 04-40, 04-31]

actuals:
  tokens: 30206
  tasks: 2
  commits: 4
plan_head_before: de1d3d84b204ca8a6cd2d97c3847ec25a81c9a04
commits: 4

tech-stack:
  added: []
  patterns:
    - "줄 종류는 한 컬럼(line_kind)이 정본 — 기존 줄의 판정 종류는 잠근 tx로 다시 읽은 DB 행, 새 줄만 요청 값"
    - "견적가 0인 종류(조정·견적 외 비용)는 서버가 수량 1 · 원화 단가 0 · 소분류 = 종류 값으로 정규화한 뒤 판정·저장한다"
    - "저장 입구는 두 권한 중 하나로 열고, 줄마다의 권한은 게이트가 ctx(actorCanWrite · actorCanAdjust)로 판정 — 두 권한은 트랜잭션 전에 읽는다"

key-files:
  created:
    - db/migrations/0014_quote_line_kind.sql
    - db/migrations/meta/0014_snapshot.json
    - test/integration/quote-line-kinds.test.ts
  modified:
    - db/schema/quote-lines.ts
    - db/migrations/meta/_journal.json
    - domain/permissions/menus.ts
    - domain/quotes/edit-scope.ts
    - domain/rules/register.ts
    - domain/quotes/lines.ts
    - repositories/quote-lines.ts
    - test/unit/domain/quote-edit-scope.test.ts
    - test/unit/domain/quote-lines.test.ts
    - test/integration/projects-list.test.ts
    - test/unit/domain/rules-gate.test.ts
    - test/integration/project-period.test.ts

key-decisions:
  - "조정 줄의 편집 칸은 항목·거래처·실행가·비고, 구조는 추가·삭제만(이동·복제·새 차수 없음) — 조정 권한이 없으면 전부 잠김이고 잠김 이유 글자는 만들지 않는다(DR-22)"
  - "조정 줄은 상태 칸도 서버가 미착수로 고정한다(취소가 없는 종류) — 견적 외 비용은 상태를 견적 줄 규칙대로 둔다"
  - "쓰기 권한 없이 견적 줄·견적 외 비용을 건드리는 요청은 게이트가 「견적 줄 · 쓰기 권한 없음」으로 거부한다(rev 5 밖 방어 문구)"
  - "종류 변경 요청 거부 「줄 종류는 바뀌지 않음 · 새로 고침」은 규칙 이름 project.line-edit로 denyWrite를 지난다"
  - "게이트 ctx의 새 세 필드는 선택이 아니라 필수 — 빠뜨린 호출자가 쓰기 권한을 가진 것처럼 통과하지 않게 한다"

patterns-established:
  - "줄 종류 축: 판정 함수 입력에 lineKind · canAdjust를 더하고, 없으면 견적 줄 · 조정 권한 없음으로 본다(화면 쪽 기존 호출자는 그대로 둔다)"

requirements-completed: [PROJ-02]

coverage:
  - id: D1
    description: "마이그레이션 0014 — line_kind 기본 quote, 세 값 인라인 CHECK, 락 타임아웃 한 쌍, lint:sql 0건, 번호 규칙, .squawk.toml 무변경, 다시 생성해도 차이 없음"
    requirement: "PROJ-02"
    verification:
      - kind: other
        ref: "pnpm lint:sql (Found 0 issues in 15 files) · pnpm db:migrate · 번호 검증 node 명령(ok 0014_quote_line_kind) · git diff --stat d6b41cf -- .squawk.toml(빈 출력) · pnpm db:generate(No schema changes)"
        status: pass
      - kind: integration
        ref: "test/integration/migration-upgrade.test.ts(단독 실행 2/2 · 통합 전체 49파일 1257/1257)"
        status: pass
    human_judgment: false
  - id: D2
    description: "조정 권한만 있는 경영관리가 완료 프로젝트에 조정 줄을 저장(견적가 0 · 수량 1 · 단가 0 · 차익 계산)하고 목록 실행가에 들어간다 · PM의 조정 새 줄은 거부"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/quote-line-kinds.test.ts#(t1)~(t3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "종류 축 결정표(조정 · 견적 외 비용 · 게이트) · 행 스키마 소분류 superRefine · resolveLineKind · 종류별 음수 실행가"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "test/unit/domain/quote-edit-scope.test.ts#줄 종류 축 결정표(04-13) · project.line-edit 게이트 — 조정 줄"
        status: pass
      - kind: unit
        ref: "test/unit/domain/quote-lines.test.ts#quoteLineRowInputSchema · resolveLineKind · quoteLineFormatErrors"
        status: pass
    human_judgment: false
  - id: D4
    description: "PM 조정 칸 변경·보관 거부(write.denied 한 번, 금액 키 없음) · 경영관리 보관·보관함 · 조정 줄 복원 권한(OV-2) · 상한에 조정 줄 포함 · 조정 권한만의 견적 줄 변경·새 줄·보관 거부(GAP 2) · 종류 변경 거부 · 빈 소분류 조정 줄(GAP 6) · 정산·완료 조정 줄 추가 · 견적 외 비용 음수·정산 새 줄·정산 보관 거부 · 견적 줄 음수 거부"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/quote-line-kinds.test.ts#(k1)~(k9) · (o1)~(o4)"
        status: pass
    human_judgment: false
  - id: D5
    description: "불변식 — 세 종류 줄 실행가 합이 상세 합계 · 목록 · 집계에서 같다(금지 항목의 합계 쪽)"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "test/integration/projects-list.test.ts#(g)"
        status: pass
    human_judgment: false
  - id: D6
    description: "PM 화면에서 조정 줄이 같은 표 안 읽기 전용 행으로 보이고 합계가 그 행을 포함함이 눈으로 확인되는 것(금지 항목의 화면 쪽)"
    verification: []
    human_judgment: true
    rationale: "화면은 04-23 소관(E2E로 단언 예정) — 이 플랜은 서버·DTO까지만 만들었다"

duration: 38min
completed: 2026-09-25
---

# Phase 4 Plan 13: 견적 줄 종류(조정 · 견적 외 비용) 서버 규칙 Summary

**`quote_lines.line_kind` 한 컬럼(견적 줄 · 견적 외 비용 · 조정)을 정본으로 두고, 경영관리의 `projects.adjustment` 쓰기로만 조정 줄을 상태와 무관하게 만들고 고치며, 견적 외 비용·조정 줄은 서버가 견적가 0으로 저장하고 실행가 음수를 받는다 — 모든 종류가 같은 합계에 들어간다는 불변식을 테스트로 고정했다.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-09-25T16:31:05Z
- **Completed:** 2026-09-25T17:09:12Z
- **Tasks:** 2 (Task 1 tracer · Task 2 tdd)
- **Files modified:** 15 (새로 만든 것 3 포함)

## Accomplishments

- 마이그레이션 **`0014_quote_line_kind`** (계획 번호 그대로 — 생성기도 0014를 줬다). 생성기가 따로 낸 `ADD CONSTRAINT … CHECK` 문장을 지우고 CHECK를 `ADD COLUMN` 안에 인라인으로 옮겼다(제약 이름 `quote_lines_line_kind_check`, 스냅숏과 같음). 락 타임아웃 한 쌍으로 시작. `pnpm lint:sql` 0건, 다시 생성해도 차이 없음, `.squawk.toml` 무변경
- 실제 로컬 DB(`erp`)에 `pnpm db:migrate` 적용 — 컬럼 기본값 `'quote'` · NOT NULL · CHECK 확인. 기존 행이 `quote`로 채워지는 것은 같은 문장을 두 행짜리 임시 표에 돌려 확인(dev DB에는 견적 줄이 0줄이라 빈 경로), 틀린 값 `bogus`는 `erp_test`에서 CHECK 위반으로 거부됨을 확인(트랜잭션 되돌림)
- 권한표 메뉴 `projects.adjustment`(「견적 조정 줄」) — 시드가 기본으로 켜 주는 계급 없음
- 편집 범위 함수에 종류 축: 조정 줄은 조정 권한으로만(항목·거래처·실행가·비고 편집, 추가·삭제 가능, 이동·복제 불가), 권한이 없으면 전부 잠김(이유 글자 없음). 견적 외 비용은 견적 줄의 상태 규칙 그대로 + 수량·단가 늘 잠김
- 게이트 `project.line-edit`: ctx에 `lineKind`·`actorCanWrite`·`actorCanAdjust`. 조정 거부 = `조정 줄 · 경영관리만`, 쓰기 없는 견적 줄 변경 = `견적 줄 · 쓰기 권한 없음`
- 저장: 입구가 「`projects` 쓰기 또는 `projects.adjustment` 쓰기」이고 두 권한은 `prepareQuoteLineSave`(트랜잭션 전)에서 읽는다 — 잠금 안의 새 `can()` 없음(grep: `can` 호출은 트랜잭션 밖 두 곳뿐). 기존 줄 종류는 `currentById`(잠근 tx로 다시 읽은 행)에서, 다른 종류를 실은 요청은 거부. 조정·견적 외 비용 줄은 수량 1 · 원화 단가 0 · 소분류 = 종류 값으로 정규화한 뒤 판정·저장
- 보관함 복원: `restoreQuoteLine` 입구도 두 권한 중 하나, 게이트에 그 줄의 종류와 조정 권한을 싣는다(OV-2)
- DTO `lineKind`, 목록 셀 단계 입력 `canAdjust`, 저장 결과의 셀 단계는 실제 두 권한으로

## Task Commits

1. **Task 1 RED** — `278e876` test(04-13): add failing tracer tests for adjustment quote lines
2. **Task 1 GREEN** — `c94e128` feat(04-13): add quote line kinds and let finance save adjustment lines
3. **Task 2 RED** — `3867bc6` test(04-13): add failing tests for line kind rules, schema and restore
4. **Task 2 GREEN** — `578034f` feat(04-13): enforce out-of-quote and line kind rules on save and restore

### RED 확인(실패 줄)

- Task 1(통합 3건): (t1)(t2) `Error: 견적 줄 저장 권한이 없습니다.`(입구가 조정 권한을 모름) · (t3) `expected [Function] to throw error including '조정 줄 · 경영관리만' but got '오류 1칸 · 전부 거부 · [실행가] 숫자가 아닙니다 …'`(음수 실행가가 종류와 무관하게 거부)
- Task 2 단위 9건: 견적 외 비용 수량·단가 `expected [] to deeply equal [ 'quantity', 'unitPrice' ]` · 빈 소분류 `expected [ '소분류를 고르세요.' ] to deeply equal []` · 모르는 종류 `expected [] to not deeply equal []`(스키마에 lineKind 없음) · `resolveLineKind is not a function` 4건 · `quoteLineFormatErrors is not a function` 2건(새 함수 — 기능 없음으로 인한 실패)
- Task 2 통합 4건: (k3) `Error: 견적 줄 복원 권한이 없습니다.` · (k7) `promise resolved … instead of rejecting` · (o1) `expected '' to be 'out_of_quote'` · (o2) `Error: 정산 · 새 줄은 실행가만`

### 처음부터 초록이던 테스트 — 변이로 확인

Task 1이 입구를 넓히면서 게이트의 권한 축을 같이 넣어야 했다(안 넣으면 조정 권한만 있는 사람이 진행 프로젝트의 견적 줄을 고칠 수 있는 구멍이 Task 1 커밋에 생긴다). 그래서 Task 2의 일부 통합 케이스는 쓰는 순간 초록이었다. 코드를 잠시 망가뜨려 잡는지 확인하고 되돌렸다(되돌림은 `cmp`로 확인):

- 쓰기 권한 판정 제거 → (k5)(k6) 빨강(GAP 2)
- 조정 줄 분기 제거 → (t1)(t2)(t3)(k1)(k2)(k3)(k4)(k8)(k9) 빨강
- 상한 셈에서 조정 줄 제외 → (k4) `promise resolved … instead of rejecting`
- 목록 합계 쿼리에서 조정 줄 제외 → projects-list (g) `expected 470000 to be 350000`

## 검증(실행 결과)

- Task 1: `pnpm lint:sql` 0건 · `pnpm db:migrate` 성공 · 번호 검증 `ok 0014_quote_line_kind` · `.squawk.toml` diff 0줄 · `pnpm lint`(오류 0, 기존 boundaries 설정 경고만) · `pnpm typecheck` 0 · 통합 quote-line-kinds + quote-lines + leak-scan 908/908 · 트레이서 게이트 재실행 초록
- Task 2: 단위 quote-edit-scope + quote-lines 59/59 · 단위 전체 1197/1197 · `pnpm db:migrate` 성공 · 통합 quote-line-kinds + projects-list + quote-line-cap + archive + leak-scan 909/909 · 통합 전체 49파일 1257/1257 · lint · typecheck 0
- 의존성: `package.json`·`pnpm-lock.yaml`이 d6b41cf와 같다(새 패키지 0)
- `CI=true pnpm test` 전체 게이트·E2E는 돌리지 않았다(오케스트레이터가 한 번 돌린다)

## Files Created/Modified

- `db/schema/quote-lines.ts` — `lineKind` 컬럼 + `check("quote_lines_line_kind_check", …)`
- `db/migrations/0014_quote_line_kind.sql` · `meta/0014_snapshot.json` · `meta/_journal.json` — 생성기 출력(SQL만 인라인 CHECK로 손봄)
- `domain/permissions/menus.ts` — `projects.adjustment`
- `domain/quotes/edit-scope.ts` — `QUOTE_LINE_KINDS`, 종류·조정 권한 입력
- `domain/rules/register.ts` — 게이트 ctx 세 필드, 조정·쓰기 권한 판정, 머리 주석을 지금의 등록 목록으로 정정
- `domain/quotes/lines.ts` — 입구 권한, 종류 판정·정규화·음수 허용, 종류 변경 거부, 스키마 `lineKind`·`superRefine`, DTO `lineKind`, 복원 권한
- `repositories/quote-lines.ts` — 삽입이 `line_kind`를 쓴다(갱신은 쓰지 않는다)
- `test/integration/quote-line-kinds.test.ts` — 신규(424줄, 16케이스)
- `test/integration/projects-list.test.ts` — (g) 불변식
- `test/unit/domain/quote-edit-scope.test.ts` · `test/unit/domain/quote-lines.test.ts` — 결정표 · 스키마 · 종류 · 음수
- `test/unit/domain/rules-gate.test.ts` · `test/integration/project-period.test.ts` — 게이트 ctx 모양 변경에 맞춤(아래 편차 1)

## Decisions Made

frontmatter `key-decisions` 참고. 새 방어 문구(UI-SPEC rev 5에 없음 — 화면이 만들지 않는 요청에만 닿는다): `견적 줄 · 쓰기 권한 없음` · `줄 종류는 바뀌지 않음 · 새로 고침`. `조정 줄 · 경영관리만`은 플랜 truths 문구 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 게이트 ctx 모양이 바뀌어 앞 플랜 테스트 두 곳을 맞췄다**
- **Found during:** Task 1
- **Issue:** `project.line-edit` ctx에 필수 세 필드를 더하자 `test/unit/domain/rules-gate.test.ts`(12건)가 `견적 줄 · 쓰기 권한 없음`으로 떨어졌고, `test/integration/project-period.test.ts` (n)은 ctx를 정확히 비교한다
- **Fix:** rules-gate는 ctx 도우미에 `{ lineKind: "quote", actorCanWrite: true, actorCanAdjust: false }`를 더했다(판정 단언은 그대로). project-period (n)은 실제 ctx(시스템 관리자라 `actorCanAdjust: true`)로 정확 일치 단언을 유지했다 — 느슨하게 하지 않았다
- **Files modified:** test/unit/domain/rules-gate.test.ts, test/integration/project-period.test.ts
- **Committed in:** c94e128

**2. [계획과 코드의 차이] 행 스키마는 이미 domain에 있었다 · `actions.ts`는 고치지 않았다**
- 04-12가 `quoteLineRowInputSchema`·`quoteLinesInputSchema`를 `domain/quotes/lines.ts`로 옮겨 두었고 액션이 이미 그것을 쓴다. 이 플랜은 그 스키마에 `lineKind`와 `superRefine`만 더했다. 액션은 행을 그대로 넘기므로 `lineKind`가 도메인까지 간다(typecheck 0) — `app/(app)/projects/actions.ts` 변경 없음
- 플랜이 말한 `lines.ts` 348행 「게이트 판정(완료 잠금)」 주석은 04-12 재작성 뒤 이미 없었다. `saveQuoteLines` 입구에 배치 단위 상태 게이트도 남아 있지 않았다(B-36 — 확인만, 상태 판정은 줄마다 `project.line-edit` 하나). `register.ts` 머리 주석은 지금의 등록 목록으로 고쳤다

**3. [순서] Task 2의 일부 케이스가 처음부터 초록**
- 위 「변이로 확인」 참고. 쓰기 권한·조정 권한 판정은 Task 1에서 입구를 넓히는 것과 떼어 낼 수 없어 같이 들어갔다

**4. [판정 범위] 조정 줄의 상태 칸도 서버가 미착수로 고정**
- 플랜은 수량·단가·소분류 고정만 적었다. 조정 줄은 상태 칸이 잠김이라, 요청 값을 판정하면 경영관리에게도 이유가 맞지 않는 거부가 난다 — 다른 고정 칸처럼 서버 값으로 쓴다

**5. [지시와 저장소의 차이] 지시에 있던 가드 테스트 `test/unit/db/migration-journal.test.ts`는 저장소에 없다**
- journal을 읽는 테스트는 `test/integration/migration-upgrade.test.ts` 하나이고 통합 전체 실행에서 통과했다. 번호 규칙은 플랜의 node 검증 명령(`ok 0014_quote_line_kind`)으로 확인했다. 새 가드 테스트는 만들지 않았다(범위 밖)

**6. [테스트 수정] Task 2 단위 테스트 도우미에 `id`를 더함**
- RED 커밋의 `quoteLineFormatErrors` 테스트 입력에 `QuoteLineWriteRow` 필수 `id`가 없어 typecheck가 걸렸다. 입력 모양만 고쳤고 단언은 그대로다(578034f)

---

**Total deviations:** 6(1 blocking, 1 계획-코드 차이, 1 순서, 1 판정 범위, 1 지시-저장소 차이, 1 테스트 입력)
**Impact on plan:** 범위 확장 없음. 프로덕션 코드는 계획한 파일 안에서만 바꿨다.

## Issues Encountered

- 없음(예상 밖 테스트 실패 없음 — rules-gate 12건은 ctx 모양 변경으로 예상한 실패였다).

## Deferred Items / 후속

- **04-49 이월: 매출 표 1024 미만 전환 시 열린 입력 유실 가능** — 이 플랜 범위 밖(오케스트레이터 지시로 유지)
- **04-23(화면):** `app/(app)/projects/[id]/page.tsx`의 `listQuoteLines` 호출이 아직 `canAdjust`를 넘기지 않아, 경영관리도 상세 화면에서 조정 줄이 잠김으로 온다(기본값 false — 안전한 쪽). 04-23이 `can(viewer, "projects.adjustment", "write")`를 읽어 넘기고, 조정 권한만 있는 사람의 `canEditLines`·`structuralEditability`(조정 종류)도 그린다
- 게이트 단독으로 보면 견적 외 비용의 수량·단가 변경은 진행 상태에서 이유 없이 통과한다(잠김이지만 상태 잠김 이유가 없어서). 저장 경로는 두 칸을 서버 값으로 정규화해 도달하지 않는다 — 게이트 자체를 막을지는 04-23 화면 작업 때 판단
- 조정 줄이 섞인 표의 순서 이동: `reorder` 판정은 견적 줄 기준(조정 권한만 있는 사람은 순서를 못 바꾼다). 조정 그룹 고정 순서의 화면 쪽은 04-23
- 한도 풀리면 Codex 재확인 필요(이번 실행은 Codex 호출 없음)

## Known Stubs

없음.

## Threat Flags

없음 — 새 입구(조정 권한)는 플랜 threat_model T-04-63·63d·63e·64·63c가 다룬다.

## User Setup Required

None - 운영에서 관리자가 권한표에서 경영관리 담당 계급에 「견적 조정 줄」 쓰기를 켜야 조정 줄을 쓸 수 있다(시드 기본값 없음 — 의도).

## Next Phase Readiness

- 04-23이 DTO `lineKind` · `cellEditability`만으로 조정·견적 외 비용 그룹을 그릴 수 있다
- 04-14·04-15(복사)는 `line_kind`로 조정 줄 제외를 판정하면 된다

## Self-Check: PASSED

- FOUND: db/migrations/0014_quote_line_kind.sql · db/migrations/meta/0014_snapshot.json · test/integration/quote-line-kinds.test.ts
- FOUND: 278e876 · c94e128 · 3867bc6 · 578034f

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-25*
