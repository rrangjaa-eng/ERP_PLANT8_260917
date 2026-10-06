---
phase: quick-261006-biv
plan: 01
type: execute
wave: 1
depends_on: []
risk: migration
files_modified:
  - "db/schema/vendors.ts"
  - "db/migrations/0027_vendor_kind.sql"
  - "db/migrations/0028_vendor_kind_validate.sql"
  - "db/migrations/meta/_journal.json"
  - "db/migrations/meta/0027_snapshot.json"
  - "db/migrations/meta/0028_snapshot.json"
  - "domain/vendors/kind.ts"
  - "domain/vendors/index.ts"
  - "repositories/vendors.ts"
  - "domain/expenses/pick.ts"
  - "domain/projects/references.ts"
  - "domain/reserves/index.ts"
  - "app/(app)/admin/vendors/actions.ts"
  - "app/(app)/admin/vendors/vendor-form.tsx"
  - "app/(app)/admin/vendors/page.tsx"
  - "app/(app)/admin/vendors/vendors.module.css"
  - "docs/design/checks/2026-10-06-거래처-구분.md"
  - "test/unit/vendors/vendor-kind.test.ts"
  - "test/integration/vendor-kind.test.ts"
  - "test/e2e/vendors.spec.ts"
  - "test/e2e/mobile-vendors.spec.ts"
autonomous: true
requirements: [MAST-01]
tags: [vendors, migration, picker-filter, admin-screen]

estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "새 마이그레이션 적용 뒤 vendors.kind는 NOT NULL · 기본 'both'이고, client · supplier · both 밖의 값은 CHECK vendors_kind_check가 막는다(D-1)"
    - "기존 거래처 채우기: projects.client_id · reserve_entries.client_id에만 쓰인 거래처는 'client', quote_lines.vendor_id · expenses.vendor_id에만 쓰인 거래처는 'supplier', 양쪽 다 쓰였거나 아무 데도 안 쓰인 거래처는 'both'다 — vendor_id가 NULL인 견적 줄 · 지출결의가 있어도 결과가 같다(D-2)"
    - "거래처 등록 패널의 「구분」 선택 칸은 「협력사」로 열리고, 수정 패널은 저장된 값으로 열리며, 저장하면 목록 「구분」 열에 「클라이언트」 · 「협력사」 · 「둘 다」 중 그 값이 보인다(D-3 · D-4 · D-5)"
    - "/admin/vendors?kind=client는 클라이언트 · 둘 다만, ?kind=supplier는 협력사 · 둘 다만, 값 없음(또는 다른 값)은 전체를 보인다. 「숨김 포함」 토글 · 「수정」 · 「거래처 등록」 · 패널 닫기 링크가 kind를 지킨다(D-5)"
    - "프로젝트 등록 클라이언트 · 리저브 클라이언트 선택지는 client + both만, 견적 줄 거래처 · 지출결의 거래처 고르기는 supplier + both만 보인다(D-6)"
    - "이미 고른 값은 갈래가 달라도 이름이 남는다 — 견적 줄 vendorName · 리저브 줄 clientName · 지출결의 이름 조회(findVendorNamesByIds)는 거르지 않는다(D-6)"
    - "domain createVendor를 kind 없이 부르면 DB 기본 'both'로 들어간다 — kind를 모르는 기존 통합 · E2E 픽스처가 모든 선택 목록에 그대로 보인다"
    - "서버 저장 검사는 바뀌지 않는다 — 리저브 selectable · 견적 줄 · 지출결의 저장은 kind를 보지 않는다(D-7), 지급 · 수금 기한 · 리저브 칸 숨김도 없다(D-8)"
  artifacts:
    - path: "db/migrations/0027_vendor_kind.sql"
      provides: "kind 칸 추가 + CHECK NOT VALID + 쓰임 기반 채우기 UPDATE 두 문"
      contains: "SET LOCAL lock_timeout = '1s';"
    - path: "db/migrations/0028_vendor_kind_validate.sql"
      provides: "vendors_kind_check 검증(별도 파일, 0026 선례)"
      contains: "VALIDATE CONSTRAINT \"vendors_kind_check\""
    - path: "domain/vendors/kind.ts"
      provides: "import 없는 순수 모듈 — VENDOR_KINDS · VendorKind · VendorSide · VENDOR_KIND_LABELS · DEFAULT_NEW_VENDOR_KIND · vendorKindsFor · servesSide · parseVendorSide · isVendorKind"
      contains: "DEFAULT_NEW_VENDOR_KIND"
    - path: "test/integration/vendor-kind.test.ts"
      provides: "kind 저장 · CHECK · 채우기 SQL(마이그레이션 파일을 읽어 실행) · 네 고르기 목록 거르기 · 이미 고른 값 이름 유지"
      contains: "vendor_kind"
    - path: "test/e2e/vendors.spec.ts"
      provides: "구분 칸 기본값 · 수정 저장값 · 목록 구분 열 · kind 걸러보기 · 링크가 kind를 지킴"
      contains: "구분"
  key_links:
    - from: "domain/expenses/pick.ts searchVendorsForPick"
      to: "repositories/vendors.ts listVendorsForPick"
      via: "kinds: vendorKindsFor(\"supplier\") — limit 앞에서 SQL inArray로 거른다"
      pattern: "vendorKindsFor\\(\"supplier\"\\)"
    - from: "domain/projects/references.ts listProjectFormReferences"
      to: "domain/vendors/kind.ts servesSide"
      via: "한 번 읽은 vendorRows를 clients(client 쪽) · vendors(supplier 쪽) 두 목록으로 나눠 투영"
      pattern: "servesSide\\("
    - from: "domain/reserves/index.ts listReserveReferences"
      to: "domain/vendors/kind.ts servesSide"
      via: "vendorRows를 client 쪽만 남긴 뒤 vendorOptionLabels · CLIENT_OPTION_SPEC 투영"
      pattern: "servesSide\\("
    - from: "app/(app)/admin/vendors/page.tsx"
      to: "domain/vendors/kind.ts parseVendorSide · servesSide · VENDOR_KIND_LABELS"
      via: "?kind= → 표 행만 거르고 editingVendor는 거르지 않은 목록에서 찾는다"
      pattern: "parseVendorSide\\("
    - from: "app/(app)/admin/vendors/vendor-form.tsx"
      to: "app/(app)/admin/vendors/actions.ts createVendorSchema · updateVendorSchema"
      via: "name=\"kind\" select → z.enum(VENDOR_KINDS) → domain VendorInput.kind → repo insert/update"
      pattern: "z\\.enum\\(VENDOR_KINDS"
---

<objective>
거래처에 정식 갈래 칸(클라이언트 · 협력사 · 둘 다)을 더하고, 거래처 목록에 「구분」 열과 갈래 걸러보기를 붙이고, 프로젝트 클라이언트 · 견적 줄 거래처 · 지출결의 거래처 · 리저브 클라이언트 선택 목록을 갈래로 거른다.

Purpose: 지금은 vendors 표에 구분이 없어 네 선택 목록이 같은 거래처 전체를 보인다(사용자 질문 2026-10-06 17:07 → 「정식 구분 칸」 선택). 옛 인트라넷 규칙(고객사 · 협력사, 한 회사가 둘 다일 수 있음, 갈래 필수)을 따른다. 결정은 `261006-biv-CONTEXT.md` 「결정」 1~8(이 플랜에서 D-1~D-8로 부른다) — 잠김, 다시 묻지 않는다.

Output: 마이그레이션 0027(칸 + CHECK NOT VALID + 채우기) · 0028(VALIDATE), 순수 모듈 domain/vendors/kind.ts, 거른 선택 목록 넷, 거래처 화면의 구분 칸 · 열 · 걸러보기, 통합 · 단위 · E2E 테스트. 커밋 셋(태스크마다 하나).

실행 규칙(모든 태스크):
- `risk: migration` — Opus 실행자 + Opus 독립 검토 1명(CLAUDE.md §4 Build).
- 구현 전에 Skill `superpowers:test-driven-development`, "완료"를 말하기 전에 `superpowers:verification-before-completion`, 실패를 쫓기 전에 `superpowers:systematic-debugging`을 실제로 호출한다. 서브에이전트에 위임하면 그 프롬프트에도 세 스킬을 적고 `model`을 명시한다.
- Task 3은 app/의 .tsx · .css를 고치기 전에 Skill `design-gate`를 먼저 호출한다(훅이 강제).
- 커밋은 태스크마다 하나: 제목은 영어 접두어(feat:) + 짧은 요약, 본문은 한국어. 끝맺음(attribution) 줄은 실행 세션의 지시를 따른다.
- `any` 금지, 요청받지 않은 리팩터 · 주석 · 파일 이동 금지. `app/(app)/admin/vendors/page.tsx`는 다른 스레드가 정렬을 고치는 중이라 바꾸는 줄을 아래 Task 3에 적은 것으로 한정한다.
- 테스트는 바뀐 파일과 관련된 것만(전체 통합 스위트 금지, CLAUDE.md §5). 통합 테스트는 로컬 DB(`pnpm db:dev`)가 떠 있어야 한다.

Tracer 메모: 오케스트레이터가 정한 세 갈래(스키마+도메인 → 선택 목록 → 화면)를 그대로 쓴다. Task 1의 통합 테스트가 DB → repositories → domain createVendor/updateVendor 경로를 실제 Postgres로 관통해 증명하고, Task 2 · 3이 그 위로 넓힌다.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261006-biv-vendor-kind-client-supplier-filter/261006-biv-CONTEXT.md
@CLAUDE.md
@.claude/rules/frontend.md

확인한 사실(플래너가 db/schema · 코드에서 직접 읽음 — 다시 탐색하지 않아도 된다):
- 참조 열 이름: `projects.client_id`(db/schema/projects.ts:17, NOT NULL) · `reserve_entries.client_id`(db/schema/reserve-entries.ts:15, NOT NULL) · `quote_lines.vendor_id`(db/schema/quote-lines.ts:22, nullable) · `expenses.vendor_id`(db/schema/expenses.ts:28, nullable). vendors를 가리키는 다섯째 열 `corp_card_usages.merchant_vendor_id`(0025 신설, 쓰는 화면 아직 없음)는 D-2가 꼽은 네 열 밖이라 채우기에서 세지 않는다.
- 마지막 마이그레이션 0026_phase6_tables_validate(journal idx 26). CHECK 선례: db/schema/quote-lines.ts:49(`check(...)` + `sql` import, 칸은 plain `text` + CHECK). `$type<...>()` 선례: db/schema/field-definitions.ts:32. NOT VALID/VALIDATE 짝 선례: 0025 l.179-180 · 0026 전체. 머리 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` + `--> statement-breakpoint`.
- `.squawk.toml`: pg_version 16, assume_in_transaction, adding-required-field 제외 — 상수 기본값 NOT NULL 칸 추가는 0025 l.139처럼 통과, 기존 표 CHECK는 NOT VALID가 필요(constraint-missing-not-valid), 같은 트랜잭션 검증도 걸려 VALIDATE를 다른 파일로 뗀다.
- test/integration/setup.ts가 테스트마다 모든 표를 TRUNCATE + seedMasterData하고 fileParallelism: false다 — 채우기 UPDATE를 테스트 DB 전체에 돌려도 다른 테스트에 새지 않는다.
- test/unit/db/migration-journal.test.ts가 journal idx · tag · when · snapshot 파일 짝을 검사한다.
- 「이미 고른 값이 사라지지 않는다」(D-6)는 이미 있는 장치로 지켜진다 — 화면 코드를 고치지 않는다: 견적 표 편집기는 현재 값이 선택지에 없으면 읽기 글자 그대로 한 선택지로 더한다(app/(app)/projects/[id]/quote-table.tsx:1908-1915, quick 261001-85g) · 읽기 글자는 savedVendor 이름으로 대신한다(previous-revision.tsx:51-56) · 리저브 기존 줄의 클라이언트는 바꿀 수 없고(domain/reserves/index.ts:306 사용자 D6) 머리글은 row.clientName으로 대신한다(reserves-table.tsx:639-642) · 프로젝트 클라이언트는 등록 · 복사 때만 고른다(수정 화면 없음) · 지출결의 거래처 이름은 findVendorNamesByIds(거르지 않음).
- 거래처 화면 패턴: native select = vendor-form.tsx:211-230(`.selectLabel` + `.select`) · 여러 Link 필터 nav + `aria-current` = app/(app)/admin/code-tables/page.tsx:89-100 · code-tables CSS의 `.tableNav` · `.toggle[aria-current="page"]`(폰 CLS 0.18 선례 주석 포함) · 필터 결과 0 = `ListEmpty message="조건에 맞는 건이 없습니다" action 「필터 지우기」`(field-definitions/page.tsx:142, SYSTEM.md §7-7).
- 시각 기준 사진 `vendors-1280` · `vendors-new-1280` · `vendors-390` · `vendors-new-390`이 Task 3으로 바뀐다 — 로컬에서 만들지 않는다(06-01 다섯 줄 5 선례).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: vendors.kind 칸 · 마이그레이션 0027/0028(쓰임 기반 채우기) · domain/repositories 쓰기 경로</name>
  <files>db/schema/vendors.ts, db/migrations/0027_vendor_kind.sql, db/migrations/0028_vendor_kind_validate.sql, db/migrations/meta/_journal.json, db/migrations/meta/0027_snapshot.json, db/migrations/meta/0028_snapshot.json, domain/vendors/kind.ts, domain/vendors/index.ts, repositories/vendors.ts, test/unit/vendors/vendor-kind.test.ts, test/integration/vendor-kind.test.ts</files>
  <precondition>로컬 Postgres가 떠 있다(`pnpm db:dev`) — 통합 테스트의 global-setup이 erp_test에 마이그레이션을 적용한다.</precondition>
  <behavior>
    - 단위 test/unit/vendors/vendor-kind.test.ts: vendorKindsFor("client") = ["client","both"], vendorKindsFor("supplier") = ["supplier","both"]; servesSide 3×2 표(client→client 참·supplier 거짓, supplier→반대, both→둘 다 참); parseVendorSide("client")="client", ("supplier")="supplier", ("both") · ("") · ("x") · (undefined) = null; isVendorKind는 세 값만 참; VENDOR_KIND_LABELS = 클라이언트 · 협력사 · 둘 다; DEFAULT_NEW_VENDOR_KIND = "supplier"(D-3)
    - 통합 (a) createVendor(쓰기 계급, kind "client") → DB 행 · DTO kind "client"; kind 없이 → "both"(DB 기본, 기존 픽스처 호환)
    - 통합 (b) updateVendor(kind "supplier") → "supplier"; kind 없이 updateVendor → 저장값 그대로(M-5 「undefined = 안 바꿈」)
    - 통합 (c) 원문 SQL로 kind='other' INSERT → CHECK 위반(SQLSTATE 23514)으로 거부
    - 통합 (d) 채우기: 마이그레이션 파일 `db/migrations/*_vendor_kind.sql`을 읽어 `--> statement-breakpoint`로 자르고 주석 줄을 뺀 뒤 `UPDATE "vendors"`로 시작하는 문만 db.execute(sql.raw(...))로 실행 → A(프로젝트 클라이언트만)=client · B(리저브 클라이언트만)=client · C(견적 줄 거래처만)=supplier · D(지출결의 거래처만)=supplier · E(리저브 클라이언트 + 지출결의 거래처)=both · F(안 쓰임)=both. 픽스처에 vendor_id가 NULL인 견적 줄이 있어야 한다(setupExpenseProject의 「현장 진행 인력」 줄) — NOT IN + NULL 함정을 잡는다
  </behavior>
  <action>
RED 먼저(Skill superpowers:test-driven-development 호출 뒤): test/unit/vendors/vendor-kind.test.ts와 test/integration/vendor-kind.test.ts를 위 behavior대로 쓰고 `pnpm vitest run --project unit test/unit/vendors/vendor-kind.test.ts`와 `pnpm vitest run --project integration test/integration/vendor-kind.test.ts`가 실패(모듈 · 칸 · 마이그레이션 파일 없음)하는 것을 확인한다. 통합 픽스처는 기존 도우미를 쓴다 — A · C는 test/integration/fixtures/expenses.ts setupExpenseProject(클라이언트 · 스테이지원 · NULL 거래처 줄 포함), B · E의 리저브 줄은 test/integration/reserve-entries.test.ts의 createFinanceViewer · newRow · saveReserves 경로, D · E의 지출결의는 test/integration/expense-create-fields.test.ts의 지출결의 만들기 경로(vendorId 지정), 쓰기 계급은 test/integration/vendors.test.ts의 upsertPermission 방식. 채우기 테스트 (d)는 픽스처를 만든 뒤 모든 픽스처 거래처를 'both'로 되돌리고(이미 기본값이지만 명시) 마이그레이션 문을 실행한다. 마이그레이션 파일은 번호가 아니라 `_vendor_kind.sql` 꼬리로 찾는다(main과 번호가 겹쳐 다시 만들어도 테스트가 그대로다).

GREEN:
1) domain/vendors/kind.ts — import 없는 순수 모듈(클라이언트 컴포넌트 vendor-form.tsx가 import하므로 server 의존 금지). 내보내기: VENDOR_KINDS(as const 튜플 "client","supplier","both" — D-4 표시 순서), VendorKind, VendorSide("client"|"supplier"), VENDOR_KIND_LABELS(Record<VendorKind,string>: 클라이언트 · 협력사 · 둘 다), DEFAULT_NEW_VENDOR_KIND = "supplier"(per D-3, 옛 인트라넷 278곳 중 클라이언트 22곳), vendorKindsFor(side) → [side, "both"], servesSide(kind, side) → kind === side 또는 "both", parseVendorSide(raw: string | undefined) → "client"/"supplier" 아니면 null, isVendorKind(value: string): value is VendorKind. 「both 포함」 규칙은 vendorKindsFor · servesSide 두 곳에만 둔다(per D-5 · D-6).
2) db/schema/vendors.ts(per D-1) — `kind: text("kind").$type<"client" | "supplier" | "both">().notNull().default("both")`를 hidden 옆에 더하고, 테이블 콜백 배열에 `check("vendors_kind_check", sql\`${table.kind} IN ('client','supplier','both')\`)`; drizzle-orm `sql`과 pg-core `check` import를 더한다(quote-lines.ts:1-2 선례). 위 주석 블록에 한 줄: 갈래 = 클라이언트 · 협력사 · 둘 다(261006-biv D-1).
3) `pnpm db:generate --name vendor_kind` → 0027_vendor_kind.sql. 생성된 SQL을 손으로 고친다: 첫 줄들에 한국어 주석(목적 · 채우기 규칙 · NOT VALID 이유 · rollback-floor를 두지 않는 이유 = 옛 리비전은 kind를 모르고도 넣기(DB 기본 'both') · 읽기가 그대로 돈다), 이어서 `SET LOCAL lock_timeout = '1s';` · `SET LOCAL statement_timeout = '5s';` · `--> statement-breakpoint`(0025 머리 선례). ADD COLUMN은 그대로, ADD CONSTRAINT "vendors_kind_check" CHECK 끝에 NOT VALID를 붙인다. 그 뒤 `--> statement-breakpoint`로 나눈 UPDATE 두 문(per D-2): ① kind='client' WHERE (EXISTS projects.client_id = vendors.id OR EXISTS reserve_entries.client_id = vendors.id) AND NOT EXISTS quote_lines.vendor_id = vendors.id AND NOT EXISTS expenses.vendor_id = vendors.id ② kind='supplier' WHERE (EXISTS quote_lines OR EXISTS expenses) AND NOT EXISTS projects AND NOT EXISTS reserve_entries. 반드시 EXISTS/NOT EXISTS 상관 서브쿼리로 쓴다 — quote_lines.vendor_id · expenses.vendor_id가 nullable이라 NOT IN은 NULL 하나에 전체가 거짓이 된다. 보관(archived_at) 행도 쓰임으로 센다. updated_at은 건드리지 않는다(사용자 수정이 아닌 새 칸 채우기). 양쪽 · 무사용은 'both' 그대로.
4) `pnpm db:generate --custom --name vendor_kind_validate` → 0028 파일에 머리 주석(0026 선례 — SHARE UPDATE EXCLUSIVE, 어긋난 행이면 트랜잭션째 되돌아감) + 같은 SET LOCAL 두 줄 + `--> statement-breakpoint` + `ALTER TABLE "vendors" VALIDATE CONSTRAINT "vendors_kind_check";`.
5) `pnpm db:generate`를 한 번 더 돌려 「No schema changes」가 나오는지 본다 — 새 파일이 생기면 스키마와 스냅숏이 어긋난 것이니 그 파일을 지우고 원인을 고친다.
6) repositories/vendors.ts — `import type { VendorKind } from "@/domain/vendors/kind"`; VendorInsertInput에 `kind?: VendorKind`, insertVendor values에 `kind: input.kind`(undefined면 drizzle이 칸을 빼 DB 기본 'both'); VendorUpdateInput Partial에 `kind: VendorKind`. listVendors · listVendorsForPick은 이 태스크에서 건드리지 않는다.
7) domain/vendors/index.ts — VendorDto에 `kind: VendorKind`, VENDOR_DTO_SPEC에 `{ key: "kind", from: "kind", infoItem: "vendor.value" }`(hidden 다음), VendorInput에 `kind?: VendorKind`(주석: createVendor에서 undefined = DB 기본 'both' · updateVendor에서 undefined = 안 바꿈, M-5와 같은 결), createVendor의 repoInsertVendor 인자에 `kind: input.kind`, updateVendor의 updatePayload에 input.kind가 있을 때만 kind를 더한다. 다른 줄은 바꾸지 않는다.
8) 싼 게이트 → 아래 verify. 녹색이면 커밋 하나: 제목 `feat: add vendors.kind column with usage-based backfill`, 본문 한국어(칸 · CHECK NOT VALID/VALIDATE · 채우기 규칙 · domain 기본값 · 테스트).
  </action>
  <verify>
    <automated>pnpm db:generate 2>&1 | grep -q "No schema changes" && grep -q "SET LOCAL lock_timeout = '1s';" db/migrations/*_vendor_kind.sql && grep -q "NOT VALID" db/migrations/*_vendor_kind.sql && grep -q "NOT EXISTS" db/migrations/*_vendor_kind.sql && grep -q 'VALIDATE CONSTRAINT "vendors_kind_check"' db/migrations/*_vendor_kind_validate.sql && pnpm lint:sql && pnpm vitest run --project unit test/unit/vendors/vendor-kind.test.ts test/unit/db/migration-journal.test.ts && pnpm vitest run --project integration test/integration/vendor-kind.test.ts test/integration/vendors.test.ts && pnpm typecheck && pnpm lint</automated>
  </verify>
  <done>마이그레이션 두 개가 squawk를 통과하고 스키마와 스냅숏이 맞는다(db:generate 변경 없음). vendor-kind 단위 · 통합 테스트(저장 · 기본값 · 안 바꿈 · CHECK 거부 · 채우기 A~F)와 기존 vendors 통합 테스트가 녹색이다. 커밋 하나.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 네 선택 목록을 갈래로 거르기 — 프로젝트 클라이언트 · 견적 줄 거래처 · 지출결의 거래처 · 리저브 클라이언트</name>
  <files>repositories/vendors.ts, domain/expenses/pick.ts, domain/projects/references.ts, domain/reserves/index.ts, test/integration/vendor-kind.test.ts</files>
  <behavior>
    - 통합(test/integration/vendor-kind.test.ts에 describe 하나 더): 같은 태그 이름의 거래처 c(client) · s(supplier) · b(both)를 insertVendor(kind 지정)로 만든다
    - listProjectFormReferences(모두 보이는 계급 — project-form-references-visibility.test.ts의 makeRole 방식).clients id에 c · b가 있고 s가 없다; .vendors에 s · b가 있고 c가 없다
    - searchVendorsForPick(지출결의 쓰기 계급 — expense-pick.test.ts 방식, query = 태그).rows에 s · b가 있고 c가 없다
    - listReserveReferences(리저브 쓰기 계급 — reserve-entries.test.ts createFinanceViewer).clients에 c · b가 있고 s가 없다
    - 고정(이미 녹색이어야 함, D-6): 견적 줄 거래처를 kind 'client'로 바꿔도 listQuoteLines 줄의 vendorName이 그 이름이다; 리저브 줄 클라이언트를 kind 'supplier'로 바꿔도 listReserves 행의 clientName이 그 이름이다
  </behavior>
  <action>
RED 먼저: 위 behavior를 test/integration/vendor-kind.test.ts에 더하고 `pnpm vitest run --project integration test/integration/vendor-kind.test.ts`에서 거르기 단언 셋이 실패하고 고정 단언 둘은 녹색인 것을 확인한다(고정 둘이 빨가면 멈추고 systematic-debugging — 기존 장치가 생각과 다른 것이다).

GREEN(per D-6, 고르는 목록만 — 서버 저장 검사는 범위 밖 per D-7):
1) repositories/vendors.ts listVendorsForPick opts에 `kinds: readonly VendorKind[]`(필수 — 호출자 하나) → conditions에 `inArray(vendors.kind, [...opts.kinds])`. limit 앞에서 SQL로 걸러야 50행 자르기가 맞다. listVendors는 그대로 둔다(나머지 셋은 한 번 읽은 행을 메모리에서 나눈다).
2) domain/expenses/pick.ts searchVendorsForPick — listVendorsForPick 호출에 `kinds: vendorKindsFor("supplier")`. 위 주석 한 줄에 「협력사 · 둘 다만(261006-biv D-6)」을 덧붙인다.
3) domain/projects/references.ts listProjectFormReferences — vendorRows를 한 번 읽는 것은 그대로, `servesSide(row.kind, "client")` 행으로 clients, `servesSide(row.kind, "supplier")` 행으로 vendors를 각각 projectMany(VENDOR_OPTION_SPEC, projectDeps)로 투영한다(지금은 vendorOptions 하나를 둘 다에 쓴다). vendorShown · 나머지 필드는 그대로.
4) domain/reserves/index.ts listReserveReferences — vendorRows를 `servesSide(row.kind, "client")`로 거른 배열로 clientLabels(vendorOptionLabels)와 clients 투영을 만든다. saveReserves의 pickable · selectable · repoLockReserveClients는 건드리지 않는다(D-7).
5) 화면 코드(quote-table.tsx · reserves-table.tsx · project-form.tsx)는 고치지 않는다 — 이미 고른 값은 context에 적은 기존 장치가 지킨다. 프로젝트 「복사」의 원본 클라이언트가 협력사 갈래면 등록 폼 기본 선택이 비는 것은 새 문서 등록이라 숨김 거래처와 같은 규칙으로 둔다(SUMMARY에 한 줄).
6) verify 녹색이면 커밋 하나: 제목 `feat: filter vendor pickers by vendor kind`, 본문 한국어(네 목록 · both 포함 · 이름 조회는 거르지 않음 · 저장 검사 범위 밖).
  </action>
  <verify>
    <automated>pnpm vitest run --project integration test/integration/vendor-kind.test.ts test/integration/project-form-references-visibility.test.ts test/integration/expense-pick.test.ts test/integration/reserve-entries.test.ts test/integration/quote-lines-hidden-vendor.test.ts test/integration/quote-line-vendor-name.test.ts && pnpm typecheck && pnpm lint</automated>
  </verify>
  <done>프로젝트 클라이언트 · 리저브 클라이언트 선택지는 client + both, 견적 줄 · 지출결의 거래처 고르기는 supplier + both만 돌려준다. 다른 갈래로 바뀐 거래처도 이미 고른 줄의 이름이 남는다. 관련 기존 통합 테스트가 녹색이다. 커밋 하나.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 거래처 화면 — 「구분」 선택 칸(등록 기본 협력사) · 목록 「구분」 열 · kind 걸러보기</name>
  <files>app/(app)/admin/vendors/actions.ts, app/(app)/admin/vendors/vendor-form.tsx, app/(app)/admin/vendors/page.tsx, app/(app)/admin/vendors/vendors.module.css, docs/design/checks/2026-10-06-거래처-구분.md, test/e2e/vendors.spec.ts, test/e2e/mobile-vendors.spec.ts</files>
  <behavior>
    - E2E(test/e2e/vendors.spec.ts 새 test 「구분 — 등록 기본 협력사 · 수정 저장값 · 목록 구분 열 · kind 걸러보기」): loginAsSysadmin, insertVendor로 같은 태그의 클라이언트 · 협력사 · 둘 다 거래처 셋
    - /admin/vendors 표 머리글에 「구분」 열; 세 행의 구분 칸이 「클라이언트」 · 「협력사」 · 「둘 다」
    - 링크 「클라이언트」 → URL에 kind=client, 클라이언트 · 둘 다 행만(협력사 행 0개), 그 링크가 aria-current="page"; 「협력사」 → 협력사 · 둘 다만; 「전체」 → 셋 다
    - kind=client 상태에서 「숨김 포함」 · 「수정」 · 「거래처 등록」 링크 href에 kind=client가 남는다
    - 「거래처 등록」 패널의 「구분」 칸 값이 supplier; 이름만 넣고 등록 → 새 행 구분 칸 「협력사」
    - 클라이언트 거래처 「수정」 → 「구분」 칸 값 client; 「둘 다」로 바꿔 저장 → 그 행 구분 칸 「둘 다」
    - 폰(test/e2e/mobile-vendors.spec.ts 새 test): 「전체」 · 「클라이언트」 · 「협력사」 링크가 각각 44×44 이상
  </behavior>
  <action>
먼저 Skill `design-gate`를 호출하고 그 절차대로 브리프 · 화면 사용성 원칙 · CHECKLIST §1 · SYSTEM.md 관련 절(§6-1 목록, §7-7 EMPTY, §7-15 등록 폼, §7-16 현재 링크 표시)을 범위 Read한 뒤 점검표 docs/design/checks/2026-10-06-거래처-구분.md를 만든다(빈칸 없이 — 코드 커밋에 함께 들어간다).

RED: 위 behavior대로 E2E를 쓰고 dev 서버로 실패를 확인한다 — `pnpm exec playwright test test/e2e/vendors.spec.ts -g "구분" --project=desktop --no-deps`(dev 통과는 완료 신호가 아니다 — 판정은 아래 CI=true).

GREEN:
1) actions.ts — createVendorSchema · updateVendorSchema에 `kind: z.enum(VENDOR_KINDS, { error: "구분 필요 · 구분 고르기" })`(zod 4.6 문법, 필수 per D-1 「갈래는 필수」). VENDOR_KINDS는 @/domain/vendors/kind에서 import.
2) vendor-form.tsx — EditingVendor에 `kind: VendorKind`. 이름 TextField 바로 아래에 기본 증빙 종류와 같은 모양의 native select 한 칸(per D-4): 감싸개 `styles.selectLabel`, `<label htmlFor="kind">구분</label>`, select id · name "kind", className styles.select, defaultValue = editing?.kind ?? DEFAULT_NEW_VENDOR_KIND(per D-3 — 등록 협력사, 수정 저장값), 옵션은 VENDOR_KINDS 순서로 VENDOR_KIND_LABELS 글자(클라이언트 · 협력사 · 둘 다), 빈 선택지 없음. handleSubmit baseFields에 kind — getStringField(formData, "kind")를 isVendorKind로 좁혀 쓰고, 좁혀지지 않으면 editing?.kind ?? DEFAULT_NEW_VENDOR_KIND(타입 좁히기용; select가 세 값만 내므로 실제로 타지 않는다). 새 안내 문구 · 새 색 · 서체 · radius 없음.
3) page.tsx — 바꾸는 줄을 이것으로 한정한다(per D-5): searchParams 타입에 `kind?: string`; `const kindFilter = parseVendorSide(kindParam)`; vendorsHref의 opts에 `kind?: VendorSide | null`을 더해 값이 있으면 params.set("kind", ...); cancelHref · primaryAction · ListEmpty 등록 · RowAction 「수정」 호출에 kind: kindFilter를 넘긴다; 「숨김 포함」 Link href를 vendorsHref(!includeHidden, { kind: kindFilter })로; filters에 code-tables 선례대로 `<nav aria-label="구분">` + Link 셋 「전체」(vendorsHref(includeHidden)) · 「클라이언트」 · 「협력사」(각 kind), className styles.toggle, 현재 것에 aria-current="page", scroll={false}, 그 옆에 기존 숨김 토글. 표 행은 `const shownVendors = kindFilter ? vendors.filter((v) => servesSide(v.kind, kindFilter)) : vendors`로 거르고 editingVendor는 거르지 않은 vendors에서 찾는 기존 줄 그대로(걸러보기 중 갈래를 바꿔 저장해도 패널이 등록 모드로 튀지 않는다). vendors.length === 0이면 기존 ListEmpty, 아니고 shownVendors.length === 0이면 `ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: vendorsHref(includeHidden) }}`(SYSTEM.md §7-7 · field-definitions 선례), 아니면 StaticTable rows=shownVendors. columns에서 이름 다음에 `{ key: "kind", header: "구분", priority: "p2" }`, cells에서 이름 다음에 VENDOR_KIND_LABELS[vendor.kind]. 정렬 · 다른 열 · 행 행동은 건드리지 않는다.
4) vendors.module.css — code-tables 모듈의 `.tableNav` · `.toggle[aria-current="page"]` 규칙을 같은 역할 토큰으로 옮긴다(이름은 `.kindNav`). 폰(max-width 699.98px)에서는 nav를 전폭(flex: 1 1 100%)으로 두어 「숨김 포함」이 처음부터 다음 줄에 서게 한다(code-tables CLS 0.18 선례). 새 값 · 새 토큰 없음.
5) 싼 게이트(pnpm lint · pnpm typecheck) 녹색 뒤, 실행자가 아닌 별도 에이전트(model: sonnet, 프롬프트에 verification-before-completion 명시)에게 독립 DOM 감사를 맡긴다 — `CI=true` 프로덕션 빌드로 /admin/vendors · ?kind=client · ?kind=supplier · ?new=1 · ?editId=를 320 · 375 · 768 · 1280에서 실측: 가로 넘침 0, 폰 링크 · select 44px, 현재 링크 aria-current와 굵기, 등록 select 값 supplier, 필터 결과 0 줄(테스트 DB에서 협력사만 남기는 상태를 감사 에이전트가 직접 만든다), 첫 렌더 뒤 필터 줄 이동(CLS). 스크린샷 육안 판정 금지. 지적을 고친 뒤 아래 verify를 한 번.
6) 점검표 빈칸을 채우고(근거 = E2E · DOM 감사 실측) 커밋 하나: 제목 `feat: vendor kind field, column and filter on admin vendors`, 본문 한국어(구분 칸 · 기본 협력사 · 열 · 걸러보기 · 링크가 kind 유지 · 필터 결과 0 · 시각 기준 사진 갱신 필요).
7) 시각 기준 사진은 로컬에서 만들지 않는다. SUMMARY에 `visual_baseline_expected: [vendors, vendors-new]`를 적고, PR을 ready로 올리기 전에 `gh workflow run visual-baseline.yml --ref <이 브랜치>`를 한 번 돌린 뒤 워크플로 커밋을 pull한다(06-01 다섯 줄 5 선례).
  </action>
  <verify>
    <automated>pnpm lint && pnpm typecheck && pnpm vitest run --project unit test/unit/ui/admin-master-list-first.test.ts test/unit/vendors && test -s "docs/design/checks/2026-10-06-거래처-구분.md" && CI=true pnpm exec playwright test test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts test/e2e/form-label-section-gap.spec.ts test/e2e/hidden-references.spec.ts test/e2e/mobile-vendors.spec.ts test/e2e/mobile-320-no-overflow.spec.ts test/e2e/mobile-admin-master-list-first.spec.ts --project=desktop --project=mobile-375 --no-deps</automated>
  </verify>
  <done>거래처 등록 패널 「구분」이 협력사로 열리고 수정은 저장값으로 열린다. 목록에 「구분」 열과 전체 · 클라이언트 · 협력사 걸러보기가 있고, 링크들이 kind를 지키며, 필터 결과 0은 「조건에 맞는 건이 없습니다 · 필터 지우기」다. 독립 DOM 감사 지적이 0이고 CI=true E2E가 녹색이다. 점검표가 채워져 같은 커밋에 있다. 커밋 하나.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → server action | createVendorAction · updateVendorAction이 받는 kind(믿을 수 없는 입력) |
| 브라우저 → RSC URL | /admin/vendors?kind= 검색 파라미터 |
| 배포 → 운영 DB | 0027 · 0028이 vendors에 ACCESS EXCLUSIVE · 행 갱신을 잡는다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261006biv-01 | Tampering | actions.ts createVendorSchema · updateVendorSchema | medium | mitigate | `z.enum(VENDOR_KINDS)` 필수 + DB CHECK vendors_kind_check(통합 (c)가 23514 거부를 단언) |
| T-261006biv-02 | Tampering | page.tsx ?kind= | low | mitigate | parseVendorSide 허용 목록 — 밖의 값은 null(전체). 값은 SQL에 들어가지 않고 메모리 거르기에만 쓴다 |
| T-261006biv-03 | Information disclosure | VendorDto.kind | low | mitigate | 정보 노출표 항목 vendor.value 아래 — 가려진 계급은 키가 없다(기존 projectMany 경로, 새 노출 없음) |
| T-261006biv-04 | Denial of service | 0027 · 0028 마이그레이션 잠금 | medium | mitigate | SET LOCAL lock_timeout 1s · statement_timeout 5s, CHECK NOT VALID → 0028 VALIDATE(SHARE UPDATE EXCLUSIVE), EXISTS 기반 세트 UPDATE 두 문(거래처 ~278행) |
| T-261006biv-05 | Tampering (데이터 무결성) | 0027 채우기 UPDATE | medium | mitigate | NOT EXISTS만 사용(nullable vendor_id의 NOT IN 함정 없음) + NULL 거래처 줄이 있는 픽스처로 마이그레이션 원문을 실행하는 통합 테스트 (d) |
| T-261006biv-06 | Elevation of privilege | 선택 목록 거르기 | low | accept | D-7 — 갈래는 권한 경계가 아니고 서버 저장 검사는 이번 범위 밖. 기존 권한 · 노출표 · 리저브 selectable 게이트는 그대로 |
</threat_model>

<verification>
- Task별 verify 세 개가 모두 녹색(로컬은 바뀐 파일 관련 테스트만 — 전체 build · 단위 · 통합 · E2E는 PR ready에서 CI 한 번).
- `git log --oneline -3`이 태스크 커밋 셋(feat: …)을 보인다.
- 소스 대조(D-1~D-8 · MAST-01):

| 출처 | 항목 | 덮는 곳 |
|------|------|---------|
| GOAL | 갈래 칸 · 목록 걸러보기 · 네 선택 목록 거르기 | Task 1 · 3 · 2 |
| REQ | MAST-01(거래처 · 클라이언트 등록 · 수정) | Task 1 · 3 |
| D-1 | kind text NOT NULL DEFAULT 'both' + CHECK, 0027 + 0028 VALIDATE, SET LOCAL 머리, squawk | Task 1 |
| D-2 | 쓰임 기반 채우기(client/supplier/both), 실제 열 이름 확인 | Task 1(통합 (d)) |
| D-3 | 등록 기본 협력사 · 수정은 저장값 | Task 1(DEFAULT_NEW_VENDOR_KIND) · Task 3 |
| D-4 | 셋 중 하나 native select, 새 색 · 서체 · radius 없음 | Task 3 |
| D-5 | 목록 「구분」 열, ?kind=client|supplier(both 포함), 값 없음 = 전체 | Task 1(kind.ts) · Task 3 |
| D-6 | 네 선택 목록 거르기, 이미 고른 값 유지, 이름 조회는 거르지 않음 | Task 2 |
| D-7 | 서버 저장 검사 없음 | Task 2 action 4 · threat 06 |
| D-8 | 기한 · 리저브 숨김 없음 | 범위 밖 — 어떤 태스크도 건드리지 않는다 |
</verification>

<success_criteria>
- vendors.kind가 운영과 같은 마이그레이션 경로(0027 · 0028)로 생기고 기존 거래처가 쓰임대로 채워진다.
- 거래처 화면에서 구분을 고르고(등록 기본 협력사), 목록에서 구분을 보고 걸러 볼 수 있다.
- 네 선택 목록이 갈래로 걸러지고, 이미 고른 값은 사라지지 않는다.
- Post-build 게이트(묶음 PR마다 한 번, CLAUDE.md §4): 코드 `/review` · 화면 `/design-review` → `/qa` · domain/reserves를 건드려 `/cso`. db/schema · db/migrations는 위험 경로라 사용자가 GitHub에서 머지한다(별도 PR로 떼어도 나머지가 이 칸에 의존해 먼저 머지될 수 없다 — PR 구성은 오케스트레이터가 정한다).
</success_criteria>

<output>
Create `.planning/quick/261006-biv-vendor-kind-client-supplier-filter/261006-biv-SUMMARY.md` when done — 커밋 셋 · 마이그레이션 번호 · 채우기 규칙 · DOM 감사 결과 · `visual_baseline_expected: [vendors, vendors-new]` · 「프로젝트 복사 원본 클라이언트가 협력사 갈래면 기본 선택이 빈다」 한 줄을 적는다.
</output>
