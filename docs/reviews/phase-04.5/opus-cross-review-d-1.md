# Phase 04.5 플랜 D1~D10 반영 교차 검토 — 1라운드

> **Codex 대신 Opus 독립 검토(Codex 한도 9/29) — 한도 풀리면 Codex 재확인 필요**

- 대상: `.planning/phases/04.5-custom-field-admin/04.5-0{1,2,4,5,6,7,8,9}-PLAN.md`의 커밋 전 변경(디자인 리뷰 `docs/designs/plant8-erp-phase04.5-design-review-260925.md` 「구현 과제」 D1~D9 + Codex t1t2-3 MINOR(D10))
- 범위: 바뀐 부분과 그 변경이 깨뜨리는 곳. 확정 결정(U1-A, U2-A, T2 「저장 때 다시 확인」, D3 두 단계 — 05 계약은 일부러 그대로)과 어긋나는 것은 지적하지 않았다.
- 방법: 플랜 문장을 실제 코드와 대조했다. `domain/vendors/index.ts` 248·292·301, `app/(app)/admin/archive/archive-table.tsx` 71, `app/(app)/admin/vendors/page.tsx` 65·80, `ui/button/Button.tsx`(`disabledReason`), `lib/actions/*`, `db/client.ts`(`DbOrTx`), `node_modules/drizzle-orm/logger.d.ts`, `test/e2e/vendors.spec.ts` 72–107, `test/e2e/archive.spec.ts` 55, `domain/archive/index.ts`, `domain/permissions/{can,visible,info-items}.ts`, `repositories/{roles,permissions}.ts`, `docs/design/SYSTEM.md` 669·986·992, `app/globals.css` 51, `ui/button/Button.module.css`

## D 항목별 반영 확인

| 항목 | 판정 | 비고 |
|---|---|---|
| D1 (01·02·06·08) | 반영됨 | `formReason` → `{ text, next, blocked }`, 원인 표는 `lib/actions/form-reason.ts`(import 0개) 하나. 02·06·08 모두 같은 API와 상수(`PERMISSION_DENIED_CAUSE`, `FIELD_DEFINITION_*_CAUSE`, 거래처 원문 셋)를 쓴다. 이유 글자는 `Button`의 `disabledReason`에 한 번만 있고 span에는 3차 버튼만 둔다(`Button.tsx`가 `isDisabled && !pending`일 때 옆에 글자로 그림 — 실측 일치). 도메인이 `lib/actions`를 import하는 것은 `can.ts:4` 선례가 있다. 거래처 domain 문구는 그대로 둔다 |
| D2 (06·09) | 반영됨 | 09 ⑦이 SYSTEM.md 992행(실측 `클라이언트 · 담당 PM 2칸`)을 고친다. DECISIONS 항목 둘은 기존 모양을 따른다. `docs-limits`는 ARCHITECTURE·OPERATIONS만 검사하므로 줄 수 영향 없음 |
| D3 (06) | 반영됨(두 단계 — 확정 결정) | `noValidate`는 06 L29·L147에 이미 있어 이름 빈 제출이 서버까지 간다(`vendor-form.tsx:141` 이름에 `required`가 있지만 `noValidate`가 무력화) |
| D4 (02·07·09) | 반영됨, MINOR 2건 | 아래 m-1·m-2 |
| D5 (02) | 반영됨 | 없는 칸 → `next: "list"`, 1차 비활성 |
| D6 (04) | 반영됨, **BLOCKER 1건** | 아래 B-1 |
| D7 | 반영됨(참고 1건) | 09 L108 머리말 「OPEN — /plan-design-review」가 남음. 항목 2는 해소로 적혀 있고 D7 대상도 아니라 참고로만 둔다 |
| D8 (04) | 반영됨 | 빈 분기는 소스 검사가 고정하고, E2E는 건수와 무관한 결과를 단언한다(워커 병렬로 0건을 만들 수 없음 — 타당) |
| D9 (02) | 반영됨 | `nativeEvent.isComposing` 소스 검사. `test/unit/ui/next-turn-action.test.ts` 선례 있음 |
| D10 (05) | 실행 가능 | `db/client.ts:41`가 `pool`을 export하고 `DbOrTx = Pick<typeof db, "insert"|"update"|"select">`(48행)이다. `drizzle(pool, { schema, logger: { logQuery } })`의 반환형이 이 Pick을 만족한다. drizzle 0.45 pg 방언은 소문자 `select … left join`을 내고, `logQuery(query, params)` 계약(`logger.d.ts:3`)에 인자 하나짜리 함수를 넘겨도 된다. `Promise.all` 두 조회로 바꾸면 기록이 2개가 되므로 제대로 된 이유로 빨개진다 |

## 지적

### [BLOCKER] B-1 — 04 권한 조합 E2E ②: 임시 계급에 `archive.value` 노출이 없어 보관함 행이 비어 보이고, 테스트가 엉뚱한 이유로 실패한다
- 근거:
  - `.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:189`: 임시 계급 준비는 `setPermissionCell`뿐이다(`admin.archive` view·write + `admin.field-definitions` view). 그런 다음 「`/admin/archive`에서 B 행(표시 이름 「화면 항목」 · 이름 B)이 보이고」를 단언한다. 188행(①)과 04 전체에 `upsertVisibility`나 `archive.value`가 한 번도 나오지 않는다(grep 0건).
  - `domain/archive/index.ts:102-110`: `ARCHIVE_ENTRY_DTO_SPEC`의 모든 필드(`entity`·`label`·`id`·`name`…)가 `infoItem: "archive.value"`로 투영된다. `domain/permissions/project.ts:30-31`은 보이지 않는 필드를 뺀다.
  - `domain/permissions/visible.ts`: 「행이 없으면 false — 새 기능 정보는 기본 숨김」. `domain/permissions/info-items.ts:59`: `archive.value`는 `staffDefault: false`다. `repositories/roles.ts:34-45`의 `insertRole`은 노출 행을 만들지 않는다.
  - 결과: 임시 계급의 보관함 행은 이름·종류가 빈 칸으로 렌더된다(`app/(app)/admin/archive/page.tsx` → `archive-table.tsx:61-62`). 그래서 `locator("tr", { hasText: B })`가 행을 찾지 못한다. 「복원」을 눌러도 `entity`·`id`가 `undefined`로 넘어가 zod 검증 실패가 된다. 어느 쪽이든 「권한 거부」가 아닌 이유로 빨갛거나 엉뚱하게 초록이다. `test/e2e/vendors.spec.ts:74`의 선례도 임시 계급에 `upsertVisibility(… "vendor.value" …)`를 따로 넣는다.
- 수정: 04 L189(과 L188의 계급 준비 문장)에 「`upsertVisibility(SYSTEM_VIEWER, { roleId: 임시 계급, infoItem: "archive.value", visible: true })` — `vendors.spec.ts:74` 선례」를 더한다. 같은 줄에 「보관함 행이 이름 B와 종류 「화면 항목」을 보인다」는 선행 단언도 둔다. 그래야 실패 이유가 권한 거부 하나로 좁혀진다.

### [MINOR] m-1 — 02 `summary` CSS 게이트가 같은 플랜의 지시와 모순된다
- 근거: `04.5-02-PLAN.md:258`이 `cursor: pointer`, `width: fit-content`, `border-bottom: var(--line-w) solid var(--accent)`(키워드 `solid`)를 지시한다. 그런데 `04.5-02-PLAN.md:271`의 수용 기준은 「`summary` 규칙의 선언 값이 `var(--…)` 토큰뿐」이다. 글자 그대로 실행하면 지시대로 쓴 CSS가 게이트에서 빨개진다.
- 수정: 271행을 「색·크기·굵기·선 두께 값이 `var(--…)` 토큰뿐(키워드 `pointer`·`fit-content`·`solid`는 허용), 리터럴 색·px 0개」로 좁힌다.

### [MINOR] m-2 — `summary`가 폰 터치 목표(44×44)를 받지 못한다
- 근거: `docs/design/SYSTEM.md:193` 「폰에서 모든 행동 요소 최소 44×44」. 3차 버튼은 `ui/button/Button.module.css:72-80`의 폰 미디어 쿼리로 `min-height: var(--touch-min)`을 받는다. 02 L258은 `.tertiary`의 글자 선언만 옮기고 이 폰 규칙은 빠뜨렸다. 07 DOM 감사가 폰 폭에서 걸 가능성이 높다.
- 수정: 02 L258에 「폰(`max-width: 699.98px`)에서 `min-height: var(--touch-min)` — `Button.module.css` 72–80행과 같은 조건」을 더한다. 09 ⑦의 SYSTEM 한 줄에도 「3차 글자 모양(폰 터치 목표 포함)」으로 반영한다.

### [MINOR] m-3 — 05의 트랜잭션 안 `ArchivedVendorError` 문구가 정해져 있지 않아 06의 원인 표와 어긋날 수 있다
- 근거: `04.5-05-PLAN.md:241`은 「없거나 보관이면 `ArchivedVendorError`다」라고만 하고 메시지는 적지 않았다. 06의 원인 표는 `domain/vendors/index.ts:301`의 원문 「보관되었거나 존재하지 않는 거래처는 수정할 수 없습니다.」과 정확히 같을 때만 `blocked: true`가 된다. 06 L127의 어긋남 검사는 그 글자가 소스에 「있다」만 확인하므로, 두 번째 throw가 다른 문구여도 초록이다. 폼을 연 사이 보관이 경합으로 트랜잭션 안에서 잡히면 「· 다시 시도」와 1차 활성이 나온다 — U1-A가 막으려던 불가능한 재시도다.
- 수정: 05 L241에 「메시지는 선검사와 같은 글자(301행)」를 적는다(계약 변경이 아니라 문구 고정). 06 L127 어긋남 검사는 「`ArchivedVendorError(` 인자가 전부 표의 키와 같다」로 강화한다.

## 참고 (file:line 근거가 약하거나 결정 사항)
- 막힌 동안 1차의 `aria-describedby`는 3차 버튼만 든 span을 가리키고, 이유 글자는 `Button` 안의 id 없는 span에 있다. 비활성 버튼은 탭 순서 밖이라 실제 영향은 작다. 02 「선택지 0개」와 같은 모양(U1-A 결정)이라 지적하지 않는다. 필요하면 TODO-1(§10 서버 오류 알림) 때 함께 본다.
- 08의 권한 회수 E2E는 `upsertPermission`(리포지토리)을 쓰고 04는 `setPermissionCell`(domain)을 쓴다. 08은 `admin.field-definitions`가 `MENUS`에 들어가기 전(wave 2 < 09)에 돌므로 이 차이는 의도로 보인다. 둘 다 존재한다(`repositories/permissions.ts:34`, `domain/permissions/matrix.ts:89`).
- 02 E2E의 `archiveE2EFieldDefinitions(전체 이름)`은 접두 일치다. 이름에 고유 접미를 쓰면 다른 칸과 겹치지 않는다(현 픽스처 관례로 충분).
- 09 L108의 「OPEN — /plan-design-review」 머리말이 남아 있다(항목 2는 해소로 적힘). D7 대상 밖이라 문구 정리만 권한다.
(1회차 판정: 막는 문제 있음 (1건) — 아래 2회차가 대체)

## 2회차 (바뀐 곳만 — 04 L188–189 · 02 L258·L271 · 09 L108·L152 · 07 L205 · 05 L241 · 06 L129)

| 지적 | 상태 | 근거 file:line |
|---|---|---|
| B-1 `archive.value` 노출 행 | **RESOLVED** | `04.5-04-PLAN.md:188`: 임시 계급 준비에 `upsertVisibility(… "archive.value" …)`를 더했다. `repositories/permissions.ts`의 `upsertVisibility(viewer, { roleId, infoItem, visible })` 모양이고 `vendors.spec.ts:74` 선례와 같다. `04.5-04-PLAN.md:189`: 복원 전에 이름 B와 「화면 항목」을 먼저 단언하므로 실패 이유가 권한 거부 하나로 좁혀진다 |
| m-1 게이트·지시 모순 | **RESOLVED** | `04.5-02-PLAN.md:271`: 색·크기·굵기·선 두께·최소 높이만 토큰으로 요구하고, `pointer`·`fit-content`·`solid`를 명시로 허용한다. 258행 지시와 모순이 없다 |
| m-2 폰 터치 목표 | **RESOLVED** | `04.5-02-PLAN.md:258`: 폰 미디어 쿼리에 `min-height: var(--touch-min)`을 두고 `display`는 바꾸지 않는다. `02:271`에 grep 게이트, `04.5-07-PLAN.md:205`에 폰 폭 높이 44 이상 실측, `04.5-09-PLAN.md:152`의 SYSTEM 한 줄에도 반영했다. `min-height`는 `display: list-item`에도 적용되므로 표식 유지와 충돌하지 않는다 |
| m-3 트랜잭션 안 문구 | **RESOLVED** | `04.5-05-PLAN.md:241`: 메시지를 301행 원문 그대로로 고정했다(계약은 그대로). `04.5-06-PLAN.md:129`: `new ArchivedVendorError("…")` 호출이 2개 이상이고 인자가 전부 원인 표의 키여야 한다. 06(wave 6)은 05(wave 5) 뒤에 돌므로 호출 2개 전제가 성립한다 |
| 참고: 09 「OPEN」 머리말 | **RESOLVED** | `04.5-09-PLAN.md:108`: 「디자인 리뷰 해소(옛 OPEN … 남은 대기 항목 없음)」로 바뀌었다 |

새 지적:
- 참고(막지 않음): `06:129`의 정규식은 문자열 리터럴 인자(`new ArchivedVendorError("…")`)만 센다. 05 실행자가 두 곳을 같은 모듈 상수로 합치면 개수가 1이 되어 빨개진다. 05 L241이 「글자 그대로」라고만 적어서, 리터럴 두 번과 상수 하나 중 무엇인지는 실행자가 해석해야 한다. 막히면 SUMMARY에 적고 정규식을 「리터럴 또는 같은 상수」로 넓히면 된다. 실패 방향이 안전 쪽(빨강)이라 BLOCKER가 아니다.
- 바뀐 줄이 다른 게이트를 깨는 곳은 찾지 못했다. 02:271의 `outline` grep 0회 조건은 폰 규칙 추가와 충돌하지 않는다.

판정: 막는 문제 없음
