---
status: investigating
trigger: "Phase 4 UAT 결함 3건 원인만 찾기(수정 없음) — G-04-4 · G-04-16 · G-04-64 (.planning/phases/04-project-quote-ledger/04-UAT.md Gaps)"
created: 2026-09-29
updated: 2026-09-29
goal: find_root_cause_only
---

## Symptoms

Discovered during Phase 4 UAT evidence cross-check (2026-09-29). Not user-observed failures — evidence gaps the user asked to close with tests.

1. G-04-4 — expected: 프로젝트 목록을 못 불러오면 `app/(app)/projects/error.tsx`가 「프로젝트 목록 불러오기 실패 · 다시 시도」를 보이고 다시 시도가 reset을 부른다. actual: 이 화면을 다루는 테스트·감사 기록이 없다. errors: none. reproduction: UAT test 4. timeline: 04-05에서 만든 뒤 한 번도 검증 기록 없음.
2. G-04-16 — expected: `ui/select`에 오류(error)와 설명 옵션이 함께 오면 설명 힌트 대신 오류가 보인다. actual: 04-25-SUMMARY:63 커밋 안 된 임시 vitest뿐, 커밋된 테스트 없음, 둘을 함께 넘기는 호출부 없음. errors: none. reproduction: UAT test 16.
3. G-04-64 — expected: 매출 입력(revenue section)을 연 채 창을 1024 미만으로 줄여도 입력값·dirty 상태가 남는다(돌아와도 유지). actual: 04-41-SUMMARY:170 · 04-project-quote-ledger/.continue-here.md:311 — 재현 안 됨, 열린 채 이월. errors: none. reproduction: UAT test 64.

## Constraints

- Diagnose only. Do NOT edit app/ui/test code or other .planning files; only this debug file (and scratch files outside the repo, deleted afterwards).
- Integration: `pnpm vitest run --project integration <spec>` only, never concurrent. E2E: one spec at a time with `CI=true` (see playwright.config.ts webServer). Local DB is up.
- For G-04-64 actually try to reproduce (throwaway Playwright script/spec outside the repo or deleted after).

## Current Focus

hypothesis: G-04-4·G-04-16은 코드 결함 없음(테스트 공백만). G-04-64는 정적 분석상 단순 리사이즈로 값·dirty가 사라지는 경로 없음 — E2E 재현으로 확인 필요
next_action: G-04-64 E2E 재현 실행 — Skill 도구가 있는 에이전트가 test-driven-development 호출 뒤 일회용 스펙(아래 「G-04-64 재현 계획」)을 `CI=true`로 한 번 돌리고 지운다

## Evidence

- timestamp: 2026-09-29 — G-04-4: `app/(app)/projects/error.tsx`는 `{ error, retry }`를 받아 `ListEmpty`(tone="error", 「프로젝트 목록 불러오기 실패」 + 「다시 시도」 onClick=retry)를 그린다. 같은 모양이 `app/(app)/error.tsx`·`app/(app)/pnl/reserves/error.tsx`에 있다.
- timestamp: 2026-09-29 — G-04-4: Next 16.3.5(`package.json`)의 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:117-157,331` — `retry`가 v16.3.0부터 안정 API, `reset`은 "대부분 retry를 쓰라". UAT 기대 문구의 "reset"은 옛 이름이고 코드의 `retry`가 맞다.
- timestamp: 2026-09-29 — G-04-4: `test/` 전체에서 `ProjectsError`·`error.tsx`·「화면 불러오기 실패」·「리저브 대장 불러오기 실패」를 쓰는 테스트 0건. `projects-list.spec.ts:622`는 오류 문구가 **없음**(`toHaveCount(0)`)만 단언한다. 세 오류 경계 모두 미검증.
- timestamp: 2026-09-29 — G-04-4: 시험 장치 부재 — 단위 프로젝트는 `test/unit/**/*.test.ts`·environment node·`renderToStaticMarkup`만(클릭 불가, `@testing-library` 없음). E2E에는 RSC 페이지를 던지게 하는 주입 장치가 없다(`lib`·`domain`·`app`에 fault/E2E 훅 grep 0건).
- timestamp: 2026-09-29 — G-04-4: 데이터로 여는 실제 실패 경로 존재 — `app/(app)/projects/page.tsx:69,101` `?new=1`이면 `recentFxRate("USD")` → `domain/settings/registry.ts:95` `def.schema.parse(row.value)`(캐시 없음) → `FX_RECENT_RATE_USD.schema = z.coerce.number().positive()`(`domain/settings/keys.ts:181-188`). `settings_simple`의 `fx.recent_rate.USD`가 0·음수·숫자 아님이면 페이지가 던진다(`domain/money/currency.ts:51-53` 주석도 같은 결과를 적음).
- timestamp: 2026-09-29 — G-04-16: `ui/select/Select.tsx:39-41` `description = error ? null : …`, `aria-describedby = error ? errorId : description ? hintId : undefined`, 렌더는 `error ? <p error> : description ? <SelectHint> : null` — 오류가 힌트를 이기는 논리가 이미 있다.
- timestamp: 2026-09-29 — G-04-16: 일회용 단위 테스트(`renderToStaticMarkup`, node 환경) 3건 통과 — 비제어+error: 오류 문구 있음·설명 없음·`aria-describedby="s-error"` / 제어+error: 오류 있음·설명 없음 / error 없음: 설명 있음·`aria-describedby="s-hint"`. 파일은 실행 직후 삭제.
- timestamp: 2026-09-29 — G-04-16: 호출부 5곳 중 `error`를 넘기는 곳은 `project-form.tsx:261,289,303`(옵션에 description 없음)뿐. description을 싣는 유일한 호출부 `quote-table.tsx:1652-1660`(소분류 `selectEditCell`)은 `error`를 넘기지 않고 호출부에서 `description: row.cellErrors.subcategory ? null : …`로 지운다(오류는 `cellEditError`가 따로 그림). 그래서 Select 안의 「error + description」 분기는 제품 경로에서 한 번도 타지 않는다.
- timestamp: 2026-09-29 — G-04-16: 04-25-SUMMARY:62-69 D2 — 검증이 「임시 vitest … 커밋하지 않음(범위 밖 파일)」, rationale 「04-23/04-07이 … E2E로 닫아야 한다」 — 뒤 플랜이 E2E로 닫을 것을 전제했으나 04-23은 호출부 방식(설명 비우기)을 골라 전제가 사라졌다.
- timestamp: 2026-09-29 — G-04-64: 매출 칸은 `editCell`이 아니라 항상 그려진 입력이다(`revenue-section.tsx:268-380`). 1024 미만이면 `canEditEntries = canWriteEntries && editableWidth`(:241)가 거짓 → 입력이 글자(`formatKrw(row.amount)`·`row.entryDate`·`row.note`)로 바뀐다.
- timestamp: 2026-09-29 — G-04-64: 값의 주인은 부모 상태다 — 날짜·메모는 `onChange`마다 `onIssuedChange/onPaidChange`(→ `quote-table.tsx:1472` `setIssuedEntries`), 금액은 `AmountInputField`의 effect가 해석되는 `rawValue`마다 즉시 `onCommit`(`revenue-section.tsx:173-179`, F4 「입력하는 즉시 반영」). `useCommaInput`(`ui/input/use-comma-input.ts:46`)은 거부 입력을 글자에 넣지 않는다. 따라서 입력 칸이 언마운트돼도 이미 입력한 값은 `issuedEntries/paidEntries`에 있다.
- timestamp: 2026-09-29 — G-04-64: `QuoteLedger`는 RSC `page.tsx:213`의 고정 자리에서 한 번 마운트되고, 폭에 따라 조상 트리가 바뀌는 곳이 없다(`useMinWidth`·`matchMedia` 사용처: `Table.tsx:210-211`·`quote-table.tsx:1606`·reserves뿐). 폭 변화로 `QuoteLedger`가 다시 마운트돼 상태가 초기화되는 경로 없음. `quote-table.tsx:1240` 초기화 블록은 status·revisionId 변화에만 걸린다.
- timestamp: 2026-09-29 — G-04-64: 1024 미만에서도 dirty가 있으면 저장 버튼이 남는다(`quote-table.tsx:2240` `canSave && (editableWidth || dirtyCount > 0)`, `dirtyCount`에 `issuedDirtyCount + paidDirtyCount` 포함 :1222).
- timestamp: 2026-09-29 — G-04-64: 부모에 안 올라가고 사라질 수 있는 것은 셋뿐 — (a) 해석 안 되는 금액 글자(예: `-` 한 글자, `parseNumberInput`이 null) (b) `useCommaInput`의 거부 이유 한 줄(`error`) (c) `type="date"`의 미완성 칸(브라우저가 value ""로 보냄). 그리고 포커스가 사라진다(입력 언마운트). 매출 편집은 `dirtyStorage` 보관본(`editsSnapshot` :1230 — 줄·기간·예상가만)에 들어가지 않지만 리사이즈와는 무관(새로고침 복원 문제).
- timestamp: 2026-09-29 — G-04-64: 재현 시도 막힘 — 일회용 스펙(`test/e2e/zz-g0464-scratch.spec.ts`) Write가 `.claude/hooks/plant8-skill-gate.sh` edit 관문(:242-244 — `.ts` 등 코드 경로는 Skill 도구로 test-driven-development 호출 뒤에만)에 막혔다. 이 세션 관리자에는 Skill·Agent 도구가 없어 관문을 통과할 수 없고, Bash로 파일을 쓰는 우회는 하지 않았다. 파일은 생성되지 않음.

## Eliminated

- G-04-4: 「error.tsx가 `reset` 대신 `retry`를 받아 다시 시도가 안 먹는다」 — Next 16.3 문서상 `retry`가 표준(v16.3.0 stable). 제거.
- G-04-16: 「Select가 오류와 설명을 둘 다 그리거나 aria-describedby가 힌트를 가리킨다」 — 일회용 렌더 3건이 반박. 제거.
- G-04-64: 「폭 변화로 QuoteLedger가 다시 마운트돼 매출 초안이 서버 값으로 돌아간다」 — 조상에 폭 분기 없음, 초기화는 status·revisionId에만. 제거(정적).
- G-04-64: 「금액 칸이 blur에서만 커밋해 입력 중 리사이즈면 값이 사라진다」 — 키 입력마다 커밋(:173-179). 제거(정적).

## Findings per gap

### G-04-4 — ROOT CAUSE FOUND (결함 아님 · 테스트 공백)
- root_cause: 화면 코드는 계약대로다. 공백의 원인은 시험 장치 부재 — 단위 프로젝트는 node + renderToStaticMarkup만이라 「다시 시도」 클릭→retry를 못 보고, E2E에는 RSC 페이지를 실패시키는 주입 장치가 없어 04-05 이후 누구도 이 경계를 띄우지 않았다(`app/(app)/error.tsx`·`pnl/reserves/error.tsx`도 같은 공백).
- files: `app/(app)/projects/error.tsx`, `app/(app)/projects/page.tsx:69,101`, `domain/settings/registry.ts:95`, `domain/settings/keys.ts:181-188`, `ui/list-empty/ListEmpty.tsx`, `vitest.config.ts`
- suggested_fix_direction: E2E 한 건 — `settings_simple`의 `fx.recent_rate.USD`를 잘못된 값(예: 0)으로 바꾼 뒤 `/projects?new=1` 열기 → 「프로젝트 목록 불러오기 실패」·「다시 시도」 보임 → 값을 되돌리고 「다시 시도」 → 목록이 돌아옴(retry 배선까지 확인), `finally`에서 값 복구. 제품 코드 변경 없음. (대안: 단위 `renderToStaticMarkup`로 문구·버튼만 — retry 호출은 못 봄.) UAT 기대 문구의 "reset"은 "retry"로 고쳐 적는다.

### G-04-16 — ROOT CAUSE FOUND (결함 아님 · 테스트 공백)
- root_cause: `Select`의 「오류가 힌트를 이김」 논리는 맞다. 04-25가 검증을 커밋하지 않은 임시 vitest로 했고(범위 밖 파일), 후속 플랜이 E2E로 닫을 것을 전제했으나 유일한 description 호출부(`quote-table.tsx` 소분류)가 `error`를 넘기지 않고 호출부에서 description을 비우는 방식을 골라, 그 분기가 제품 경로에서 영영 안 타고 테스트도 안 생겼다.
- files: `ui/select/Select.tsx:34-69`, `app/(app)/projects/[id]/quote-table.tsx:660-679,1652-1660`, `.planning/phases/04-project-quote-ledger/04-25-SUMMARY.md:62-69`
- suggested_fix_direction: 커밋되는 단위 테스트(`test/unit/ui/select-error-hint.test.ts` 같은 이름, node · `renderToStaticMarkup`) — 비제어·제어 각각 error+설명 → 오류 문구만·`aria-describedby="<id>-error"`·`aria-invalid`, error 없음 → 힌트·`<id>-hint`. 이 세션의 일회용 3건이 그대로 통과함을 확인했다. 제품 코드 변경 없음.

### G-04-64 — INVESTIGATION INCONCLUSIVE (정적으로는 결함 없음 · 재현 미실행)
- checked: 위 Evidence G-04-64 전부(정적). 단순 리사이즈로 값·dirty가 사라지는 경로를 찾지 못했다 — 04-41 DOM 감사 「단순 리사이즈 재현 안 됨」과 일치.
- remaining_possibilities: (1) 결함 없음(가장 유력) (2) 모서리: 해석 안 되는 금액 글자(`-`)·미완성 날짜 칸·거부 이유 줄이 사라짐, 포커스 상실 — 값 유실로 볼지 사용자 판단 (3) 정적으로 못 본 타이밍(prod 빌드에서 키 입력과 matchMedia change가 같은 틱).
- files: `app/(app)/projects/[id]/revenue-section.tsx:107-195,241,268-380`, `app/(app)/projects/[id]/quote-table.tsx:972,1222-1231,1472,1603-1606,2240,2482-2496`, `ui/table/use-editable-width.ts`, `ui/input/use-comma-input.ts`
- 재현 계획(일회용, 실행 뒤 삭제, `CI=true pnpm exec playwright test <spec>` 한 번): `revenue-section.spec.ts`의 `openWithIssuedEntry` 준비를 복사 → (A) 기존 발행 줄 금액을 클릭해 키 입력(blur 없음) → `setViewportSize(1000)` → 읽기 표 글자·「일괄 저장 N」 확인 → 375 → 1280 복귀 → 입력값·N 그대로 (B) 새 발행 줄(메모 포함)·새 입금 줄 금액 포커스 상태로 1000 → 1280 → 저장 → 새로고침 뒤 DB 값 (C) `keyboard.type(delay)` 도중 리사이즈. 통과하면 이 스펙을 회귀 테스트로 승격하고 UAT 64를 pass로, 실패하면 그 단계가 root cause.
- suggested_fix_direction: 재현이 통과하면 제품 수정 없음(회귀 E2E만). 실패 시 가장 작은 수정 후보는 견적 표와 같은 방식 — 매출 입력에 포커스가 있는 동안 `editableWidth`를 참으로 유지(`quote-table.tsx:1606`의 `|| cellEditing`과 같은 결), 또는 입력 언마운트 전에 로컬 글자를 부모로 올린다.
