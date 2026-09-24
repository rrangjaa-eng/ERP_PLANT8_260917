# Phase 04.5 플랜 최종 전체 검토 (Fable 5.1)

> **Codex 대신 Fable 최종 전체 검토 — 한도 풀리면 Codex 재확인 필요**
> 대상: 브랜치 `claude/plan-phase-04-5-7jtm0f` HEAD `3848397`, `.planning/phases/04.5-custom-field-admin/04.5-01 ~ 09-PLAN.md` 전체
> 기준 문서: 04.5-CONTEXT.md · 04.5-UI-SPEC.md · 04.5-RESEARCH.md · CLAUDE.md · 실제 코드(HEAD 및 origin/main 3커밋 선행분 #54/#71/#70)
> 검토 방식: 플랜 9개 전문 읽기 → 플랜이 인용한 file:line을 실제 코드로 대조 → wave/depends_on/files_modified 교차 → 마이그레이션·권한·테스트 게이트·§7 점검. 계획한 SQL 샘플은 scratchpad에서 squawk 2.65.0으로 실행해 확인.
> 고정 결정(U1=A, U2=A, T2, D3 2단계, X1~X5, R3, R8, O9, O10, 5-A/5-B, PR #40 이후 실행)은 발견으로 다루지 않음.

## 1. 발견

### [MINOR] wave 번호 본문 표기가 frontmatter와 다름
- 근거: `04.5-02-PLAN.md:89` "같은 wave(3)의 03" — frontmatter는 `wave: 4`. `04.5-03-PLAN.md:89` "같은 wave(3)의 02" — frontmatter `wave: 4`. `04.5-05-PLAN.md:89` "같은 wave(4)의 04", `:212` "04는 같은 wave(4)라" — frontmatter `wave: 5`.
- 영향: 실행 순서는 frontmatter(`wave`/`depends_on`)로 결정되므로 실행에는 영향 없음. 사람이 읽을 때 혼선.
- 수정: 본문 괄호 숫자를 4(02·03), 5(05)로 맞춘다.

### [MINOR] `archiveE2EFieldDefinitions` 소유 플랜 표기 불일치 (01 ↔ 08)
- 근거: 생성 위치는 `04.5-08-PLAN.md:42`, `:198`(08이 `test/e2e/fixtures.ts`에 추가). 그러나 `04.5-04-PLAN.md:206`, `04.5-06-PLAN.md:124`·`:178`, `04.5-07-PLAN.md:62`·`:151`은 "01이 만든" 것으로 적음.
- 영향: 08은 wave 2로 04·06·07(wave 5~7)보다 앞서므로 실행 시 존재함. 문서 오류만.
- 수정: 네 곳의 "01" → "08".

### [MINOR] 09가 등록하는 `actions.registry.ts`에 대응하는 `import "./actions.registry"`가 어느 플랜에도 없음
- 근거: 기존 `app/(app)/admin/*/actions.ts` 9개는 모두 첫 줄에 `import "./actions.registry"`를 둔다(예: `app/(app)/admin/vendors/actions.ts`). `04.5-09-PLAN.md`의 `files_modified`에는 `app/(app)/admin/field-definitions/actions.registry.ts`만 있고 `.../field-definitions/actions.ts`가 없다. 01·02·04 어느 플랜도 이 import를 지시하지 않는다.
- 영향: `lib/actions/client.ts`는 런타임에 `ACTION_REGISTRY`를 쓰지 않고, `test/unit/leak-scan-coverage.test.ts`는 registry 파일을 직접 스캔하므로 테스트·동작은 통과. 관례 이탈만.
- 수정: 09의 `files_modified`에 `app/(app)/admin/field-definitions/actions.ts`를 추가하고 작업에 "첫 줄 `import "./actions.registry"` 추가" 한 줄.

### [참고] squawk는 경고 4건만 내고 exit 0
- 근거: 07이 생성할 SQL(컬럼 추가 · `unique(entity,label)` · backfill)을 샘플로 작성해 `squawk` 실행 → `require-lock-timeout`, `require-statement-timeout`, `constraint-missing-not-valid`, `disallowed-unique-constraint` 경고, 종료 코드 0. `.squawk.toml`은 `adding-required-field`를 이미 제외.
- 결론: `pnpm lint:sql` 게이트는 통과. 01의 "경고 시 대응" 문구는 그대로 두어도 됨.

### [참고] `test/e2e/global-setup.ts` 줄 범위 표기 불일치
- 근거: `04.5-07-PLAN.md` 안에서 같은 파일을 "14–31행"과 "14–46행"으로 달리 인용. 실제 관련 블록은 `:14–31`.
- 영향 없음(코스메틱).

### [참고] 03의 grant 기본값 import 순환 가능성 — 이미 대안 명시
- 근거: `domain/permissions/roles.ts` → `visibility.ts` → `domain/viewer` → `roles.ts` 런타임 순환이 생길 수 있음. `04.5-03-PLAN.md:179`가 동적 import 대안을 지시하고, `test/unit/import-cycles.test.ts`(DFS)가 잡아 준다.
- 실행 시 확인만 하면 됨.

### [참고] `test/unit/db/migration-journal.test.ts`는 main·HEAD 어디에도 없음
- 근거: `04.5-07-PLAN.md:316`이 `test ! -f … ||` 조건부로 처리. 저널 마지막 idx는 10(`0010_revenue_entries`), 07은 번호를 손으로 정하지 않고 `pnpm db:generate`로 재생성.
- 결론: 마이그레이션 규칙(예약 번호 없음·머지 전 재생성·가드) 충족.

### [참고] 05의 `returnValidationErrors` 중첩 키(`customFields.{key}._errors`) 타입
- `z.record` 스키마에 대한 중첩 경로 타입은 next-safe-action 8.7.3 `index.d.mts:99` 시그니처상 typecheck에서 드러남. 플랜 결함이 아니라 실행 시 확인 항목.

## 2. 확인되어 문제 없는 항목
- **wave/depends_on/파일 소유**: 01(w1) → 08(w2) → 09(w3) → 02·03(w4) → 04·05(w5) → 06(w6) → 07(w7). 같은 wave 안 `files_modified` 겹침 없음.
- **권한·보안**: 모든 서버 액션이 `authedActionClient` + `can(viewer, "field-definitions", …)`(01/02/03/04/05/08/09) 일관. `visible()` 행 부재 → 숨김, `handleServerError` 허용목록은 `UserFacingError`만 통과. 보관/복원은 `assertCanWrite` 경로 재사용(04). 새 권한 우회 경로 없음. 새 의존성 0.
- **상수·시그니처 교차**: `FIELD_DEFINITION_TARGETS=["vendor"]`, `cf_<hex8>` 키, `cf.<entity>.<key>` 정보항목, `lockCustomFieldGrants`, `insertVisibilityIfAbsent(…, tx)`, `formReason(verb, serverError)`와 원인 문자열 상수(`PERMISSION_DENIED_CAUSE`, `FIELD_DEFINITION_ARCHIVED_CAUSE`, `FIELD_DEFINITION_NOT_FOUND_CAUSE`)가 02·05·06·08에서 동일.
- **인용 file:line**: 플랜이 인용한 `lib/env.ts:54`, `repositories/field-definitions.ts`, `repositories/permissions.ts`(34/56–73/100/119–128), `domain/vendors/index.ts`(30/59/142/160/248/292/299/301/317–318/338–339), `vendor-form.tsx`, `vendors/page.tsx`, `matrix.ts`, `seed/index.ts`, `leak-scan.test.ts`, `roles.ts`, `archive/*`, `info-items.ts:59`, `permission-grid-client.tsx:39–41`, e2e spec 줄, `eslint.config.mjs:40–46`, SYSTEM.md(193/610/636/671/986/992/993), DECISIONS.md:557, `role-menu.test.ts:131/152`, `Button.module.css:72–80`, `globals.css:51`, UI-SPEC 인용 줄 — 모두 실제와 일치.
- **테스트 게이트 실행·실패 가능성**: 단위 가드(`leak-scan-coverage`, `admin-index-link`, `admin-master-list-first`, `admin-table-caption`, `page-auth-guard`, `role-menu`, `archive-revalidate`, `import-cycles`)와 통합(`custom-fields.test.ts`는 DB 행 단언, `vendors.test.ts` customFields 없음 → 03의 "수정 없이 초록" 성립; `update-archived.test.ts`는 05의 비-tx 경로 유지), E2E(`CI=true` → build+start, erp_test 공유)가 플랜 순서대로 실행 가능하고 실패할 수 있는 조건을 가짐.
- **CLAUDE.md §7**: 기본값 선채움(type·sortOrder), 설명문 없음, 확인 창은 보관(되돌릴 수 없는 작업, 기록된 예외)에만. 위반 없음.

판정: 막는 문제 없음
