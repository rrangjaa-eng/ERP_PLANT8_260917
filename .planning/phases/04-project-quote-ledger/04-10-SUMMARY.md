---
phase: 04-project-quote-ledger
plan: 10
subsystem: code-tables
tags: [drizzle-migration, next-safe-action, dto, tdd, code-items]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-08 코드표 설명 규칙(40자 · 고른 값 하나의 설명만 · 오류가 이긴다, SYSTEM.md 개정 ⑥) · 04-50 롤백 스키마 하한 가드 + main 전용 배포 가드"
provides:
  - "code_items.description text 컬럼(NULL 허용) + 마이그레이션 0011(계획 번호와 실제 번호 일치)"
  - "CODE_ITEM_DESCRIPTION_MAX = 40 + normalizeDescription(trim · 빈 값→null · 40자 초과 거부) — updateCodeItemDescription·createCodeItem이 공유"
  - "updateCodeItemDescriptionAction + CodeItemDescriptionInput(인라인 편집 · 빈 값 저장 · 실패해도 입력 유지 · Esc만 서버 값 복귀 · 글자 수 표시)"
  - "코드표 화면 6열(값·이름·설명·정렬·상태·동작), 증빙 종류 세금 규칙 병합 행 colSpan 6/5"
  - "기본 제공 값 14개(상태 3·소분류 4·증빙 종류 7) 설명 — 새 DB는 시드, 기존 DB는 마이그레이션 UPDATE(둘이 글자 그대로 같음)"
  - "「코드 추가」 폼 선택 설명 칸"
affects: ["04-25(고르는 자리 Select 힌트 · 폰 P2 · S14 DOM 감사)", "04-06(정산·완료 상태 설명 추가)"]

actuals:
  tokens: 30421
  tasks: 2
  commits: 6
  plan_head_before: d5d158dda275f240f9b2882687c0a4f5aba6ae54

tech-stack:
  added: []
  patterns:
    - "server-only 의존 체인이 있는 domain 모듈에서 클라이언트 컴포넌트가 쓰는 상수는 잎(leaf) 모듈로 분리한다(domain/code-tables/description-max.ts — domain/action-log/filter-keys.ts와 같은 이유, pnpm build로 실측 확인)"
    - "빈 값도 저장하는 인라인 편집(C-13)은 저장 실패 시 입력을 지우거나 되돌리지 않는다 — 되돌림은 Esc 한 곳(DR-29). CodeItemLabelInput(실패 시 항상 되돌림)과 의도적으로 다른 패턴"

key-files:
  created:
    - db/migrations/0011_code_item_descriptions.sql
    - db/migrations/meta/0011_snapshot.json
    - domain/code-tables/description-max.ts
    - test/integration/code-item-description.test.ts
  modified:
    - db/schema/code-tables.ts
    - db/migrations/meta/_journal.json
    - repositories/code-tables.ts
    - domain/code-tables/index.ts
    - domain/seed/index.ts
    - app/(app)/admin/code-tables/actions.ts
    - app/(app)/admin/code-tables/actions.registry.ts
    - app/(app)/admin/code-tables/code-item-form.tsx
    - app/(app)/admin/code-tables/page.tsx
    - app/(app)/admin/code-tables/code-tables.module.css
    - test/e2e/code-tables.spec.ts

key-decisions:
  - "실제 마이그레이션 번호 0011이 계획 번호와 일치(생성기가 직전 최고 idx 10 + 1을 그대로 줬다) — 번호 정정 불필요"
  - "CODE_ITEM_DESCRIPTION_MAX는 .length(UTF-16 단위)로 센다 — 한글은 글자당 1(엔지 리뷰 C P3 메모 (b))"
  - "시드/마이그레이션 대조 정규식 description:\\s*\"…\"는 domain/seed/index.ts의 모든 description: 키를 잡는다 — 지금은 코드 설명뿐(grep 0건, 엔지 리뷰 C P3 메모 (b))"
  - "domain 함수 시그니처에서 artifacts 표의 선택적 deps? 매개변수는 생략했다 — updateCodeItemLabel 등 같은 파일의 다른 쓰기 함수 전부가 deps 없이 db를 직접 호출하고, 어떤 테스트도 주입을 요구하지 않아 CLAUDE.md Simplicity First(요청받지 않은 유연성 금지)에 따라 기존 패턴을 그대로 따랐다"
  - "createCodeItem의 description 정규화는 updateCodeItemDescription과 같은 normalizeDescription 헬퍼를 공유한다(중복 검증 로직 방지)"

patterns-established:
  - "빈 문자열도 유효 입력으로 저장하는 인라인 편집 컴포넌트는 실패 시 값을 되돌리지 않고 Esc 한 곳에서만 되돌린다(DR-29)"

requirements-completed: [UX-04]

coverage:
  - id: D1
    description: "관리자가 코드표 화면에서 값마다 설명을 인라인으로 고치고 저장한다(빈 값 포함, DB null)"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#설명을 저장하면 DTO의 description이 그 값이다"
        status: pass
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#빈 문자열로 저장하면 description이 null이 된다(C-13 — 지우기)"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#설명을 고치고 포커스를 옮기면 저장되고 새로 고쳐도 남는다"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#설명을 지우면 null로 저장되고 새로 고쳐도 —다"
        status: pass
    human_judgment: false
  - id: D2
    description: "41자 초과 설명은 서버가 거부하고(정확한 Copywriting 문구), 실패해도 입력이 남으며, 40자 초과 동안 글자 수가 보이고, Esc만 서버 값으로 되돌린다(DR-29)"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#41자 설명은 거부되고 이유는 서버 문구다 — DB 값은 그대로다"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#41자 설명은 거부되고 입력이 남는다 — Esc만 서버 값으로 되돌린다"
        status: pass
    human_judgment: false
  - id: D3
    description: "권한 없는 계급·보관된 항목의 설명 저장은 거부되고, 성공 저장은 행동 로그에 남는다"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#코드표 쓰기 권한이 없는 계급의 저장은 거부된다"
        status: pass
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#보관된 코드 항목의 설명 저장은 거부된다(updateCodeItemLabel과 같은 가드)"
        status: pass
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#성공한 저장은 행동 로그에 document_update로 남는다"
        status: pass
    human_judgment: false
  - id: D4
    description: "기본 제공 값 14개(상태 3·소분류 4·증빙 종류 7)가 설명과 함께 시작한다 — 새 DB는 시드, 기존 DB는 마이그레이션. 관리자가 고친 설명은 재시드로 덮이지 않는다"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#빈 DB에 시드를 돌리면 기본 제공 값 14개 전부에 40자 이하 설명이 있다"
        status: pass
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#관리자가 고친 설명은 시드를 다시 돌려도 덮어쓰이지 않는다"
        status: pass
      - kind: other
        ref: "node -e 시드/마이그레이션 대조 스크립트(Task 2 verify) -> ok 14"
        status: pass
    human_judgment: false
  - id: D5
    description: "코드표 표가 값·이름·설명·정렬·상태·동작 여섯 열이고, 증빙 종류 세금 규칙 병합 행의 colSpan이 새 열 수와 맞는다"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#증빙 종류 표의 세금 규칙 행 colSpan이 여섯 열(동작 있음)과 맞는다"
        status: pass
    human_judgment: false
  - id: D6
    description: "「코드 추가」 폼에 선택 설명 칸이 있고 40자 검증을 지난다"
    requirement: "UX-04"
    verification:
      - kind: integration
        ref: "test/integration/code-item-description.test.ts#설명과 함께 추가하면 DTO에 설명이 있다 / 41자 설명으로 추가하면 거부된다"
        status: pass
      - kind: e2e
        ref: "test/e2e/code-tables.spec.ts#「코드 추가」 폼에서 설명과 함께 추가하면 목록에 반영된다"
        status: pass
    human_judgment: false
  - id: D7
    description: "설명이 정확한 40자 상한(UTF-16 .length)을 지키고, 새 마이그레이션 번호·락 타임아웃·squawk 무경고를 지킨다"
    requirement: "UX-04"
    verification:
      - kind: other
        ref: "pnpm lint:sql -> Found 0 issues"
        status: pass
      - kind: other
        ref: "마이그레이션 번호 검증 node 스크립트 -> ok 0011_code_item_descriptions"
        status: pass
    human_judgment: false

duration: 105min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 10: 코드표 값 설명 Summary

**`code_items.description` 컬럼 + 마이그레이션 0011 + `CodeItemDescriptionInput` 인라인 편집(빈 값 저장·실패해도 입력 유지·Esc만 복귀·40자 글자 수) + 기본 제공 값 14개 시드 설명 + 「코드 추가」 설명 칸 — 코드표가 6열이 됐다.**

## Performance

- **Duration:** 105 min
- **Started:** 2026-09-24T09:05:00Z (환경 준비 포함)
- **Completed:** 2026-09-24T10:50:00Z
- **Tasks:** 2 (Task 1 트레이서, Task 2 TDD)
- **Files modified:** 14 (신규 4 · 수정 10)

## Accomplishments
- `code_items.description` text 컬럼(NULL 허용) + 마이그레이션 0011(계획 번호와 실제 번호 일치) — 락 타임아웃 한 쌍 + 기본 제공 값 14개의 `description IS NULL` 채움 UPDATE를 한 파일에 묶었다
- `updateCodeItemDescription`(도메인) — `updateCodeItemLabel`과 같은 권한·보관 가드·행동 로그 순서이되 C-13대로 빈 값도 저장(null로 지우기), 40자 초과는 정확한 Copywriting 문구로 거부
- `CodeItemDescriptionInput` — blur 저장(빈 값 포함) · 실패해도 입력 유지(DR-29, `CodeItemLabelInput`의 「실패 시 되돌림」을 베끼지 않음) · `Esc`만 서버 값 복귀 · 40자 초과 동안 `{len}/40` 글자 수
- 코드표 화면 6열(값·이름·설명·정렬·상태·동작), 증빙 종류 세금 규칙 병합 행 `colSpan` 6/5로 확장
- 기본 제공 값 14개(상태 3·소분류 4·증빙 종류 7) 설명 — 시드(`domain/seed/index.ts`)와 마이그레이션 UPDATE 문이 글자 그대로 같다(대조 검증 node 스크립트 통과, `settled`는 04-06 몫이라 제외)
- 「코드 추가」 폼 선택 설명 칸 + `createCodeItem` 40자 검증(`updateCodeItemDescription`과 같은 `normalizeDescription` 헬퍼 공유)

## Task Commits

Task 1(트레이서 — 스키마부터 코드표 화면 인라인 편집까지):

1. `5ff7d28` — test(04-10): add failing test for code item description save/validate/permission/archive/log (RED — 5 failed | 1 passed, 의도된 미완성 스텁에 대한 어서션 실패, 크래시 없음)
2. `62beec9` — feat(04-10): implement code item description save with 40-char server validation (GREEN — 11 passed)
3. `6e11e37` — feat(04-10): wire updateCodeItemDescriptionAction + inline description input on code table screen

Task 2(TDD — 기본 제공 설명 시드 + 코드 추가 폼 설명 칸):

4. `e2025ab` — test(04-10): add failing test for seed description fill/preserve + create-form description (RED — 2 failed | 8 passed)
5. `d7491e5` — feat(04-10): seed default value descriptions + 「코드 추가」 폼 설명 칸 (GREEN — 10 passed, 전체 타깃 통합 스위트 837 passed)

배포 전 발견 결함 수정(전체 Playwright 게이트에서 드러남):

6. `9fd8c56` — fix(04-10): clear stale description error on unchanged-value blur + empty-state placeholder

**Plan metadata:** (다음 커밋 — 이 SUMMARY와 STATE/ROADMAP)

_Note: Task 1은 `type="tracer"`이지만 코드표 설명 저장이 검증 가능한 입출력 계약이라 핵심 도메인 함수(updateCodeItemDescription)를 RED→GREEN으로 만들고(04-08 Task 1 선례와 같은 결), UI 배선·E2E는 별도 feat 커밋으로 묶었다. Task 2는 plan frontmatter `tdd="true"`로 RED→GREEN 그대로다._

## Files Created/Modified
- `db/migrations/0011_code_item_descriptions.sql` — description 컬럼 추가 + 기본 제공 값 14개 채움(락 타임아웃 한 쌍)
- `db/migrations/meta/0011_snapshot.json`, `_journal.json` — drizzle 생성기 출력 그대로
- `db/schema/code-tables.ts` — `description: text("description")`(NULL 허용, 기본값 없음)
- `repositories/code-tables.ts` — `updateCodeItemDescription`(기계적 UPDATE) + `insertCodeItem`/`seedCodeItem`의 선택 `description`
- `domain/code-tables/index.ts` — `CODE_ITEM_DESCRIPTION_MAX`(잎 모듈 재수출) · `normalizeDescription` · `updateCodeItemDescription` · `createCodeItem` description 지원 · DTO `description` 필드(기존 `code_item.label` 정보 항목 재사용)
- `domain/code-tables/description-max.ts`(신규) — server-only 의존 없는 상수 잎 모듈(클라이언트 번들 보호)
- `domain/seed/index.ts` — 세 코드표 상수에 `description` 리터럴 추가(마이그레이션 UPDATE와 글자 그대로 같음)
- `app/(app)/admin/code-tables/actions.ts`, `actions.registry.ts` — `updateCodeItemDescriptionAction` + `createCodeItemAction`의 선택 `description`
- `app/(app)/admin/code-tables/code-item-form.tsx` — `CodeItemDescriptionInput`(신규) + 「코드 추가」 폼 설명 `TextField`
- `app/(app)/admin/code-tables/page.tsx` — 표 6열, `colSpan` 확장
- `app/(app)/admin/code-tables/code-tables.module.css` — `.descriptionCell`, `.descriptionCount`
- `test/integration/code-item-description.test.ts`(신규) — Task 1·2 behavior 전부
- `test/e2e/code-tables.spec.ts` — (a)(b)(c)(d) + 「코드 추가」 설명 케이스

## Decisions Made
- 실제 마이그레이션 번호 = 계획 번호(0011) — 생성기가 직전 최고 `idx`(10) + 1을 그대로 줬다(SUMMARY 정정 불필요)
- `CODE_ITEM_DESCRIPTION_MAX`는 `.length`(UTF-16 단위)로 센다 — 한글은 글자당 1(엔지 리뷰 C P3)
- 시드/마이그레이션 대조 정규식 `description:\s*"…"`는 `domain/seed/index.ts`의 **모든** `description:` 키를 잡는다 — 지금은 코드 설명뿐(grep 0건, 엔지 리뷰 C P3)
- domain 함수 시그니처의 `deps?` 선택 매개변수(plan artifacts 표 문구)는 생략했다 — 같은 파일의 다른 쓰기 함수(`updateCodeItemLabel` 등)가 전부 deps 없이 db를 직접 부르고 어떤 테스트도 주입을 요구하지 않아, CLAUDE.md Simplicity First(요청받지 않은 유연성 금지)에 따라 기존 패턴을 그대로 따랐다
- `createCodeItem`은 `updateCodeItemDescription`과 같은 `normalizeDescription` 헬퍼를 공유해 40자 검증 로직이 두 곳에 따로 있지 않다

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 41자 오류 뒤 서버 값으로 직접 고쳐 쓰면 오류 줄이 안 지워짐**
- **Found during:** Task 1 wiring 뒤 전체 Playwright 게이트(`CI=true pnpm playwright test test/e2e/code-tables.spec.ts test/e2e/mobile-code-tables.spec.ts test/e2e/code-tables-write-gate.spec.ts`)
- **Issue:** `onBlur`가 값이 서버 값과 같으면 `execute()`를 부르지 않아(저장할 것이 없으므로) `onSuccess`의 `setErrorText(undefined)`도 실행되지 않았다 — 41자 오류 뒤 사용자가 직접 40자로 고쳐 쓰고 blur해도 빨간 오류 줄이 화면에 남았다
- **Fix:** `onBlur`의 no-op 분기(저장 불필요)에서도 `setErrorText(undefined)`를 호출한다 — DR-29의 「입력 값을 되돌리지 않는다」는 그대로(이 수정은 오류 *메시지*만 지우고 입력 값은 건드리지 않는다)
- **Files modified:** `app/(app)/admin/code-tables/code-item-form.tsx`
- **Verification:** 재현 E2E 케이스(41자→blur→오류 확인→40자로 되돌려 쓰기→blur→오류 사라짐 확인)가 수정 뒤 통과. 전체 재실행(reset 뒤) 136 passed
- **Committed in:** `9fd8c56`

**2. [Rule 1 - Bug] 쓰기 권한 있는 관리자에게는 설명 칸이 항상 편집 가능한 입력칸이라 정적 「—」 텍스트가 안 보임**
- **Found during:** 같은 전체 Playwright 게이트
- **Issue:** `page.tsx`의 「—」 대체 표시는 `archivedAt || !canWrite` 분기에만 있다 — 쓰기 권한이 있고 보관되지 않은 항목은 항상 `CodeItemDescriptionInput`(입력칸)을 렌더해, 설명을 지운 관리자 본인 화면에는 빈 입력칸만 보이고 S14 「값이 없으면 — 하나」 시각 신호가 없었다
- **Fix:** 입력칸에 `placeholder="—"`를 더해 빈 값일 때도 같은 시각 신호를 준다(읽기 전용 분기의 리터럴 「—」와 별개 — 편집 가능한 칸의 관례)
- **Files modified:** `app/(app)/admin/code-tables/code-item-form.tsx`
- **Verification:** E2E (c)가 clear 뒤 `toHaveValue("")` + `toHaveAttribute("placeholder", "—")`로 확인
- **Committed in:** `9fd8c56`

---

**Total deviations:** 2 auto-fixed (Rule 1 — 둘 다 전체 Playwright 게이트가 잡은 실제 버그, 스코프 밖 파일 아님)
**Impact on plan:** 둘 다 DR-29·S14 요구사항을 실제로 충족시키는 데 필요했다. 스코프 확장 없음.

## Issues Encountered

DB를 리셋하지 않고 같은 세션에서 전체 Playwright 게이트를 두 번 연달아 돌렸을 때(mobile-code-tables.spec.ts가 `mobile-375` 프로젝트에 속하고 그 프로젝트가 `dependencies: ["desktop"]`을 갖고 있어, 요청한 세 파일만 지정해도 desktop 프로젝트 33개 파일 136개 테스트 전부가 선행 실행된다) `corp-cards.spec.ts`·`revenue-section.spec.ts`(둘 다 이 플랜과 무관한 기존 스펙)에서 실패가 났다. 원인은 그 두 스펙이 고정 문자열(비-유니크)을 쓰는 선례라, DB를 리셋하지 않고 같은 전체 스위트를 두 번 돌리면 이전 실행이 남긴 행과 충돌한다(둘 다 이 플랜 diff 밖의 파일). `pnpm db:reset:test` 뒤 재실행하니 136 passed 0 failed로 깨끗했다 — 실제 회귀가 아니라 재실행 절차(DB 리셋 없이 두 번 실행) 문제였다. 이 플랜이 고치는 코드와는 무관하다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `code_items.description` 컬럼·DTO·인라인 편집·시드가 갖춰져 04-25(고르는 자리 `Select` 설명 힌트 — `SelectOption.description`, 거래처 기본 증빙 종류 힌트, 견적 소분류 옵션 설명)와 04-06(정산·완료 상태 설명 추가)이 그 위에 설 수 있다
- 04-25는 이 화면(코드표 관리)의 독립 DOM 감사(1280·1024·375)를 맡는다 — 이 플랜은 그 CSS를 넣지 않았다(probe_fallback에 따라 의도적으로 미룸). **04-25 감사 항목에 추가할 것:** 글자 수 `43/40`(`--fs-sm --danger`)이 설명 칸 옆에 한 줄로 들어가는지 세 폭(1280·1024·375)에서 확인 — 이 플랜은 그 CSS를 넣지 않아 아직 검증되지 않았다
- 블로커 없음

## Threat Flags

None — 이 플랜이 만든 새 표면(`updateCodeItemDescriptionAction`, `createCodeItemAction`의 `description` 확장, DTO `description` 필드)은 모두 plan `<threat_model>`(T-04-54~57)이 이미 다뤘다.

## Self-Check: PASSED

- `[ -f db/migrations/0011_code_item_descriptions.sql ]` → FOUND
- `[ -f domain/code-tables/description-max.ts ]` → FOUND
- `[ -f test/integration/code-item-description.test.ts ]` → FOUND
- `git log --oneline --all --grep="04-10"` → 6개 커밋 전부 확인(5ff7d28, 62beec9, 6e11e37, e2025ab, d7491e5, 9fd8c56)
- 재실행: `pnpm vitest run --project integration test/integration/code-item-description.test.ts` → 10 passed
- 재실행(DB 리셋 뒤): `CI=true pnpm playwright test test/e2e/code-tables.spec.ts test/e2e/mobile-code-tables.spec.ts test/e2e/code-tables-write-gate.spec.ts` → 136 passed, 0 failed
- `pnpm lint:sql` → Found 0 issues · 마이그레이션 번호 검증 → ok 0011_code_item_descriptions · 시드/마이그레이션 대조 → ok 14
- `pnpm lint` / `pnpm typecheck` / `pnpm build` → 전부 클린

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*
