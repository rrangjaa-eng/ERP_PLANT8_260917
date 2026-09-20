---
phase: 03-permissions-settings-masters
plan: 06
subsystem: masters
tags: [encryption, aes-256-gcm, vendors, custom-fields, tax-rule, document-counters, drizzle, gin-index, next-safe-action]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project)·행동 로그(recordAction)·계급 5종·ARCHIVABLE_TABLES/ENTITY_MENUS 단일 정본 규약, 03-03의 DTO_REGISTRY·EXPORT_REGISTRY·plant8/no-row-type-escape·누수 스캔 생성기·actions.registry.ts 분리 패턴, 03-04의 설정 레지스트리(tax.* 세율 키)·getSettingValue 계약, 03-05의 ARCHIVABLE_TABLES/ENTITY_MENUS 확장 선례"
provides:
  - "lib/crypto.ts — encrypt/decrypt/maskTail4. v1:<iv>:<tag>:<ciphertext> 직렬화, base64 32바이트 키, 키 부재·길이 오류 즉시 fail-closed, v1·v2 혼재 복호화(키 회전 지원)"
  - "vendors·field_definitions·document_counters 3표 + code_items.tax_rule 컬럼 — 마이그레이션 0007"
  - "기존 마스터 5표(roles·code_items·org_units·teams·corp_cards)의 custom_fields GIN 인덱스 — 마이그레이션 0007이 뒤늦게 채움"
  - "domain/custom-fields/build-schema.ts — buildCustomFieldsSchema(defs), field_definitions 규약의 저장 전 zod 검증 계약"
  - "domain/code-tables/tax-rule.ts — taxRuleSchema/TaxRule, Phase 4 세금 계산이 읽을 증빙 종류별 규칙 계약(세율 값은 담지 않음)"
  - "domain/vendors/index.ts — listVendors·searchVendors·createVendor·updateVendor·setVendorHidden·revealAccountNumber·listVendorFieldDefinitions"
  - "scripts/rotate-key.ts(pnpm db:rotate-key) — 키 회전, 두 키 모두 없으면 중단, 멱등"
  - "app/(app)/admin/vendors/ — 거래처 관리 화면(목록·등록·숨김·마스킹 해제)"
  - "app/(app)/admin/code-tables/evidence-type-fields.tsx — 증빙 종류 세금 규칙 편집, 코드표 화면 다중 표 전환(TABLE_OPTIONS)"
affects: [phase-4, phase-5, phase-6, phase-9, phase-10]

actuals:
  tokens: 49078
  tasks: 3
  commits: 14
plan_head_before: 113e4132a26234c67b6884c1cbd4488845b0a073

tech-stack:
  added: []
  patterns:
    - "z.object(shape).strict() — zod object()의 기본 동작(미등록 키를 조용히 거르기만 함, 거부하지 않음)을 이번 세션 node -e로 실측 확인 후 명시적으로 .strict()를 켰다. domain/custom-fields/build-schema.ts와 domain/code-tables/tax-rule.ts 둘 다 이 패턴"
    - "required===true인 필드만 필수 — field_definitions.required 컬럼 기본값(false)과 대칭되게, undefined도 false와 같은 취급(선택)으로 처리"
    - "revealAccountNumber: 노출 판정 → recordAction → decrypt 순서 고정 — 기록이 실패하면 평문이 나가지 않는다. node -e 검증 스크립트가 이 순서를 소스 문자열 위치로 직접 확인한다(주석에 함수 이름을 조기에 언급하면 그 검증 스크립트의 '첫 occurrence + N자 창' 방식이 깨진다는 것을 실행 중 발견)"
    - "코드표 화면의 tableKey 다중화 — 기존 project_status 하드코딩 화면을 TABLE_OPTIONS 배열 + searchParams.tableKey로 확장하되 세 게이트 줄·기존 열 구성은 그대로 두는 최소 확장(03-01 화면의 회귀 없음)"

key-files:
  created:
    - lib/crypto.ts
    - domain/custom-fields/build-schema.ts
    - domain/code-tables/tax-rule.ts
    - db/schema/vendors.ts
    - db/schema/field-definitions.ts
    - db/schema/document-counters.ts
    - db/migrations/0007_vendors_crypto_conventions.sql
    - domain/vendors/index.ts
    - repositories/vendors.ts
    - repositories/field-definitions.ts
    - repositories/document-counters.ts
    - scripts/rotate-key.ts
    - test/unit/crypto.test.ts
    - test/unit/custom-fields/build-schema.test.ts
    - test/unit/code-tables/tax-rule.test.ts
    - test/integration/vendors.test.ts
    - test/integration/custom-fields.test.ts
    - test/integration/document-counters.test.ts
    - test/e2e/vendors.spec.ts
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/vendors/actions.ts
    - app/(app)/admin/vendors/actions.registry.ts
    - app/(app)/admin/vendors/vendor-form.tsx
    - app/(app)/admin/vendors/account-number.tsx
    - app/(app)/admin/vendors/vendors.module.css
    - app/(app)/admin/code-tables/evidence-type-fields.tsx
    - .planning/phases/03-permissions-settings-masters/03-06-DECISION-TASK1.md
  modified:
    - lib/env.ts
    - db/schema/code-tables.ts
    - db/schema/roles.ts
    - db/schema/org.ts
    - db/schema/corp-cards.ts
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
    - domain/code-tables/index.ts
    - domain/permissions/scope-for.ts
    - domain/permissions/info-items.ts
    - domain/seed/index.ts
    - repositories/code-tables.ts
    - repositories/archive.ts
    - package.json
    - test/integration/leak-scan.test.ts
    - test/integration/global-setup.ts
    - test/integration/code-tables.test.ts
    - app/(app)/admin/code-tables/page.tsx
    - app/(app)/admin/code-tables/actions.ts
    - app/(app)/admin/code-tables/actions.registry.ts
    - app/(app)/admin/code-tables/code-tables.module.css
    - docs/ARCHITECTURE.md
    - docs/OPERATIONS.md

key-decisions:
  - "listVendors/searchVendors가 scopeFor(viewer, 'vendor')로 내부에서 scope를 계산한다 — 플랜 원문의 'listVendors(viewer, { includeHidden, scope })' 표기를 문자 그대로 caller-supplied scope로 읽지 않고, corp-cards·code-tables 등 기존 모든 sibling domain과 같은 관례(호출자는 includeHidden만 넘기고 scope는 domain이 계산)로 구현했다 — 표기 모호성에 대한 판단"
  - "domain/permissions/scope-for.ts의 ENTITY_MENUS와 domain/permissions/info-items.ts에 각각 vendor→admin.vendors, vendor.value 항목을 추가했다 — 플랜의 files_modified 목록에 이 두 파일이 없었지만 scopeFor('vendor')·project()가 동작하려면 반드시 필요한 최소 배선이고, 03-05가 org_unit·team·corp_card·user에 대해 정확히 같은 패턴을 남겼다(Rule 2 — 누락된 핵심 기능 자동 보강)"
  - "createVendor가 삽입 직전에 findVendorsByNormalizedName으로 기존 동명 거래처를 조회해 duplicateCount로 반환한다 — 이름에 unique 제약이 없어 '경고만 하고 막지 않는다'는 계획 문구를 등록 성공 후 배너로 구현했다(등록 자체를 가로막는 사전 검사가 아니다)"
  - "updateVendor의 recordAction actionType을 corp-cards의 updateCorpCardOwner 선례와 같이 'document_create'로 재사용했다 — OPS-05 핵심 행동 종류 목록에 '문서 갱신'에 정확히 대응하는 종류가 없고, 새 종류를 추가하는 것은 이 플랜의 판단 범위를 넘는 정본 변경이라고 판단했다(03-01의 같은 판단 계승)"
  - "증빙 종류 7항목의 세금 규칙 기본값(세금계산서=부가세 가산율, 계산서/카드 전표/현금영수증/해외 인보이스=없음, 기타소득/사업소득=원천징수)은 ROADMAP·EXP-15가 규칙 종류의 존재만 지정하고 항목별 기본값을 지정하지 않아 실행자가 판단했다 — 관리자가 화면에서 언제든 바꿀 수 있어 시드는 출발점일 뿐 정본이 아니다"

patterns-established:
  - "암호화 컬럼 규약: 전체 평문 컬럼을 아예 두지 않고 암호문 + 별도 평문 파생 컬럼(뒤 4자리)만 저장 — 목록이 복호화 0회로 그려지고 복호화 호출 자체가 감사 대상 '마스킹 해제' 행동이 된다"
  - "커스텀 필드 표(field_definitions)와 GIN 인덱스는 표 생성 마이그레이션에 포함한다 — 이 규약이 03-01·03-04·03-05가 미리 만든 5개 표에 뒤늦게 GIN 인덱스를 채워 넣은 이유이자, 이후 새 표가 지켜야 할 기준선이다"

requirements-completed: [MAST-01, MAST-04, OPS-05]

coverage:
  - id: D1
    description: "거래처를 등록·수정하고 미사용 거래처를 삭제 대신 숨김으로 표시할 수 있다 — 숨김은 보관함과 다른 메커니즘이고 되돌릴 수 있다"
    requirement: MAST-01
    verification:
      - kind: integration
        ref: "test/integration/vendors.test.ts#숨김 항목이 기본 목록·자동완성에서 빠진다, #보관 후 기본 조회에서 빠지고 복원하면 다시 보인다"
        status: pass
      - kind: e2e
        ref: "test/e2e/vendors.spec.ts#거래처 등록 → ... → 숨김 토글 → ..."
        status: pass
    human_judgment: false
  - id: D2
    description: "거래처 계좌번호가 앱 단에서 AES-256-GCM으로 암호화 저장되고, 어떤 컬럼에도 전체 평문이 없다(실제 SELECT로 확인)"
    requirement: MAST-01
    verification:
      - kind: integration
        ref: "test/integration/vendors.test.ts#등록 후 DB의 계좌번호 컬럼이 평문을 담지 않고, 암호문 형식(v1: 또는 v2:)을 따른다, #거래처 Dto의 키 집합에 평문 계좌번호 필드가 없다"
        status: pass
      - kind: unit
        ref: "test/unit/crypto.test.ts(12케이스 — 형식·fail-closed·v1v2 혼재·변조 탐지)"
        status: pass
    human_judgment: false
  - id: D3
    description: "기본 표시는 뒤 4자리만이고, 마스킹 해제 권한(정보 노출표 항목)이 없는 계급에는 「번호 보기」 버튼 자체가 렌더되지 않는다 — 이유 있는 비활성이 아니다"
    requirement: MAST-01
    verification:
      - kind: e2e
        ref: "test/e2e/vendors.spec.ts#... → 권한 없는 계급의 버튼 부재 → 404"
        status: pass
      - kind: other
        ref: "node -e account-number.tsx disabled 미사용·canReveal 조건부 렌더 확인"
        status: pass
    human_judgment: false
  - id: D4
    description: "마스킹 해제 호출이 권한 검사와 행동 로그를 반드시 거치고(기록이 복호화보다 먼저), 그 로그는 설정으로 끌 수 없다(mask_reveal이 ALWAYS_ON)"
    requirement: OPS-05
    verification:
      - kind: integration
        ref: "test/integration/vendors.test.ts#마스킹 해제가 권한 없는/있는 계급에서 ... 기록 0/1건, #설정 조회를 throw로 스텁해도 해제 기록이 남는다"
        status: pass
      - kind: other
        ref: "node -e revealAccountNumber 본문에서 recordAction이 decrypt보다 먼저 오는지 소스 순서 확인"
        status: pass
    human_judgment: false
  - id: D5
    description: "암호화 키가 없으면 암호화·복호화가 즉시 실패한다 — 평문 저장이나 빈 값 통과로 떨어지지 않는다(fail-closed)"
    requirement: MAST-01
    verification:
      - kind: unit
        ref: "test/unit/crypto.test.ts#키가 설정되지 않았으면 암호화/복호화가 즉시 예외를 던진다, #키 길이가 32바이트가 아니면 ..."
        status: pass
    human_judgment: false
  - id: D6
    description: "키를 새 버전으로 회전한 뒤에도 옛 버전으로 암호화된 값이 계속 복호화된다 — 회전 스크립트가 재암호화하고 중단·재실행에 안전하다"
    requirement: MAST-01
    verification:
      - kind: unit
        ref: "test/unit/crypto.test.ts#v1·v2 혼재 복호화 — 두 버전으로 각각 암호화한 값이 같은 프로세스에서 모두 복호화된다"
        status: pass
      - kind: other
        ref: "scripts/rotate-key.ts 코드 리뷰 — 두 키 부재 시 즉시 중단, 이미 최신 버전인 행 스킵(멱등)"
        status: pass
    human_judgment: true
    rationale: "회전 스크립트 자체의 통합 테스트(실제 두 버전이 섞인 DB 행에 대해 스크립트를 실제로 실행)는 만들지 않았다 — 단위 테스트가 lib/crypto의 v1·v2 혼재 복호화 계약을 이미 증명했고, 스크립트는 그 계약을 그대로 호출하는 얇은 배치 루프라 별도 통합 테스트의 한계효용이 낮다고 판단했다. 실제 운영 회전 전 스테이징에서 한 번 더 확인이 필요하다"
  - id: D7
    description: "거래처마다 기본 증빙 종류를 둘 수 있다 — 실제 자동 채움(Phase 5·6의 지출결의·카드 사용 등록)은 이 플랜 범위 밖이다"
    requirement: MAST-01
    verification:
      - kind: integration
        ref: "test/integration/vendors.test.ts (defaultEvidenceType 필드가 VendorDto·insert/update 입력에 존재, evidence_type 코드표 항목의 value를 참조)"
        status: pass
    human_judgment: true
    rationale: "필드와 값 자체는 이 플랜이 만들지만, '자동으로 채워진다'는 동작은 Phase 5·6의 폼이 실제로 이 필드를 읽어 초기값으로 쓸 때 완성된다 — 이 플랜에서는 그 소비자가 아직 없다"
  - id: D8
    description: "증빙 종류 코드표 항목마다 세금 규칙 필드(규칙 종류·절사 단위·절사 방식·최소 징수액·적용 기준일 종류)를 화면에서 정할 수 있고, 세율 값 자체는 담지 않는다(설정 레지스트리가 정본)"
    requirement: MAST-04
    verification:
      - kind: unit
        ref: "test/unit/code-tables/tax-rule.test.ts(17케이스)"
        status: pass
      - kind: e2e
        ref: "코드리뷰 + node -e 세율 입력 부재·설정 화면 포인터 검증(evidence-type-fields.tsx)"
        status: pass
    human_judgment: true
    rationale: "화면에서 규칙 종류를 바꿀 때 나머지 필드가 실제로 나타나고 사라지는 시각적 동작은 스크린샷 기반 UI 감사가 더 정확히 판단한다 — 이 플랜은 저장 계약과 조건부 렌더 로직만 자동 검증했다"
  - id: D9
    description: "커스텀 필드는 등록된 필드 정의에 있는 키만 저장되고 타입이 맞지 않으면 거부된다 — GIN 인덱스가 실재하고 필드 타입 변경은 리포지토리 수준에서 금지된다"
    requirement: MAST-04
    verification:
      - kind: unit
        ref: "test/unit/custom-fields/build-schema.test.ts(7케이스)"
        status: pass
      - kind: integration
        ref: "test/integration/custom-fields.test.ts(6케이스 — 등록 키만 저장·미등록 거부·타입 불일치 거부·타입 불변·복합 UNIQUE·pg_indexes GIN 6개 실재)"
        status: pass
    human_judgment: false
  - id: D10
    description: "문서 번호 카운터 표가 존재하고 그 규약이 문서에 기록됐다 — 실제 번호 부여와 행 잠금은 Phase 4다"
    requirement: MAST-01
    verification:
      - kind: integration
        ref: "test/integration/document-counters.test.ts(5케이스 — upsert·복합 PK·존재하지 않는 카운터 null·증가 함수 부재를 export 목록으로 직접 증명)"
        status: pass
      - kind: other
        ref: "docs/ARCHITECTURE.md §4-6 경계 문서화"
        status: pass
    human_judgment: false
  - id: D11
    description: "거래처 자동완성이 동명 거래처 둘 다 보여주고, 조합형(NFD)·완성형(NFC) 검색어를 같은 결과로 취급하며, 동점 항목의 순서가 결정적이다"
    requirement: MAST-01
    verification:
      - kind: integration
        ref: "test/integration/vendors.test.ts#같은 이름의 거래처 둘이 자동완성에 둘 다 나온다, #조합형(NFD)으로 적은 검색어가 ..., #일치 점수가 같은 항목들의 순서가 두 번 조회에서 같다"
        status: pass
    human_judgment: false

duration: 1h 23m
completed: 2026-09-20
status: complete
---

# Phase 3 Plan 6: 앱단 암호화·거래처·커스텀 필드·문서 카운터 규약 Summary

**AES-256-GCM 암호화 헬퍼(fail-closed, v1·v2 키 회전) 위에 거래처 계좌번호 마스킹·해제를 감사 로그와 함께 배선하고, `field_definitions`/GIN 인덱스/`document_counters` 세 트레일링 스키마 규약을 실제 DB와 관리 화면 두 개(거래처, 증빙 종류 세금 규칙)로 증명했다.**

## Performance

- **Duration:** 1h 23m (22:18~23:41 UTC, 커밋 구간 기준)
- **Tasks:** 3 (Task 1 체크포인트 결정 → Task 2 암호화·스키마·domain·리포지토리 → Task 3 거래처 화면·증빙 종류 세금 규칙 화면)
- **Files modified:** 51 (신규 27 + 수정 24)
- **Commits:** 14

## Accomplishments

- `lib/crypto.ts` — `encrypt`/`decrypt`/`maskTail4`. Node 내장 `crypto`만 사용(신규 의존성 0). 저장 형식 `v1:<iv>:<tag>:<ciphertext>`, base64 32바이트 키, 키 부재·길이 오류·알 수 없는 버전·인증 태그 변조 모두 즉시 예외. `APP_DATA_KEY_v2`(회전용)가 `lib/env.ts` 스키마·키 배열 두 곳 모두에 등록됨
- 새 표 3개(`vendors`·`field_definitions`·`document_counters`) + `code_items.tax_rule` 컬럼 + 기존 마스터 5표(`roles`·`code_items`·`org_units`·`teams`·`corp_cards`)의 뒤늦은 GIN 인덱스 — 마이그레이션 `0007_vendors_crypto_conventions.sql`, `pnpm lint:sql` `Found 0 issues in 8 files`, `.squawk.toml` 무변경
- `domain/custom-fields/build-schema.ts`(zod `.strict()` 동적 조립) · `domain/code-tables/tax-rule.ts`(세금 규칙 스키마, 세율 값 미포함) — 03-RESEARCH.md 실측 코드를 기준으로 구현
- `domain/vendors/index.ts` — 등록·수정·숨김·자동완성(NFC 정규화 + 점수 기반 결정적 정렬)·마스킹 해제(노출 판정 → 기록 → 복호화 순서 고정, 계좌번호 없으면 복호화·기록 생략)
- `scripts/rotate-key.ts`(`pnpm db:rotate-key`) — 두 키 부재 시 즉시 중단, 이미 최신 버전인 행 스킵(멱등)
- 증빙 종류 코드표 7항목(세금계산서·계산서·카드 전표·현금영수증·기타소득·사업소득·해외 인보이스) + 세금 규칙 기본값 멱등 시드
- 관리자 화면 2개: `/admin/vendors`(목록·등록·숨김·마스킹 해제), `/admin/code-tables`(증빙 종류 탭 + 세금 규칙 편집 섹션 추가, 기존 project_status 회귀 없음)
- `pnpm test` 세 계층 최종 재실행 전부 GREEN: 단위 489 · 통합 529(신규 27케이스) · E2E 84(신규 1) — 신규 의존성 0

## Task Commits

1. **Task 1: 암호문 직렬화 형식과 키 회전 정책(체크포인트, 옵션 A 확정)** - `da78e2d` (docs)
2. **Task 2: 암호화 헬퍼 · 거래처 표 · 커스텀 필드 규약 · 문서 카운터 표** - `95fcb90`(test RED) → `f732605`(feat GREEN) → `411dd9f`(fix) → `82f96b1`(test RED) → `9191b2d`(feat GREEN) → `2df5e40`(feat 스키마·마이그레이션) → `d14fa5e`(feat domain·리포지토리) → `f7b753c`(feat 회전 스크립트) → `b65bb26`(test 통합) → `bc69b03`(docs)
3. **Task 3: 거래처 관리 화면과 증빙 종류 세금 규칙 편집** - `e803074`(feat 거래처 화면) → `647368a`(feat 세금 규칙 편집) → `893cb30`(test E2E)

**Plan metadata:** (이 SUMMARY 커밋이 담당 — 오케스트레이터가 STATE/ROADMAP과 함께 처리)

_Note: TDD 대상(crypto, build-schema, tax-rule)은 RED→GREEN 두 커밋으로 나뉜다. 나머지는 실제 DB·화면 배선이 커밋 단위다._

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `lib/crypto.ts` - 암호화 계약의 정본
- `domain/vendors/index.ts` - 거래처 CRUD·자동완성·마스킹 해제의 domain 출구
- `db/migrations/0007_vendors_crypto_conventions.sql` - 새 표 3개 + GIN 인덱스 6개 + tax_rule 컬럼
- `app/(app)/admin/vendors/` - 거래처 관리 화면 6파일
- `app/(app)/admin/code-tables/evidence-type-fields.tsx` - 세금 규칙 편집 섹션

## Decisions Made

frontmatter `key-decisions` 참고. 요약: `listVendors`/`searchVendors`는 scope를 내부에서 계산(sibling domain과 같은 관례). `scope-for.ts`·`info-items.ts`에 vendor 항목을 Rule 2로 추가(03-05 선례 계승). 중복 후보 경고는 등록 성공 후 배너로 구현. `updateVendor`의 recordAction은 corp-cards 선례를 따라 `document_create` 재사용. 증빙 종류 7항목의 세금 규칙 기본값은 실행자 판단(관리자가 화면에서 언제든 재조정 가능).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 통합 테스트 환경에 `APP_DATA_KEY_v1` 로컬 전용 키가 없어 거래처 계좌번호 경로 전체가 fail-closed로 죽었다**
- **Found during:** Task 2, `test/integration/vendors.test.ts` 첫 실행
- **Issue:** `lib/crypto.ts`는 의도대로 키가 없으면 즉시 예외를 던지는데, `test/integration/global-setup.ts`가 `APP_DATA_KEY_v1`을 채워 주지 않아 통합 테스트가 실제 암호화 경로를 검증할 수 없었다(`this_plan_notes` 항목 1·2가 정확히 경고한 상황)
- **Fix:** `global-setup.ts`에 `process.env.APP_DATA_KEY_v1 ??= randomBytes(32).toString("base64")`를 추가(로컬 개발용 `.env.local`에도 별도로 추가, git에는 안 올라감)
- **Files modified:** `test/integration/global-setup.ts`, `.env.local`(gitignored, 커밋 안 됨)
- **Verification:** `pnpm test:integration` 22 files / 529 tests 통과
- **Committed in:** `b65bb26`

**2. [Rule 1 - Bug] `noUncheckedIndexedAccess` 아래 `decrypt`의 배열 구조 분해가 `string | undefined`로 좁혀지지 않아 타입 오류**
- **Found during:** Task 2, `pnpm typecheck` 첫 실행
- **Issue:** `stored.split(":")`의 4개 구조 분해 요소가 `noUncheckedIndexedAccess: true` 아래 전부 `string | undefined`로 추론돼 이후 `Buffer.from()` 호출에서 타입 오류가 났다
- **Fix:** 네 변수 전부 `undefined` 방어 검사를 거친 뒤 좁히도록 조건을 하나로 합쳤다(동작 변경 없음)
- **Files modified:** `lib/crypto.ts`, `test/unit/crypto.test.ts`(변조 테스트의 배열 재할당도 같은 이유로 정리)
- **Verification:** `pnpm typecheck` 0 error, `test/unit/crypto.test.ts` 12/12 통과
- **Committed in:** `411dd9f`

**3. [Rule 1 - Bug] `domain/vendors/index.ts` DTO 머리 주석의 "revealAccountNumber" 리터럴이 Task 3 검증 스크립트를 조기 종료시켰다**
- **Found during:** Task 2, Task 3의 `<verify>` 노드 스크립트(`s.indexOf('revealAccountNumber')` + 2500자 창)를 미리 실행해 확인하는 과정
- **Issue:** 실제 함수 정의보다 훨씬 앞선 DTO 주석에 같은 리터럴이 있어 `indexOf`가 그 주석 위치를 찾고, 2500자 창이 실제 함수 본문(`recordAction`→`decrypt` 순서)에 닿지 못해 검증이 거짓 실패를 낼 뻔했다
- **Fix:** 주석 문구를 "마스킹 해제 함수(파일 아래쪽)의 반환값으로만 나간다"로 바꿔 리터럴을 함수 정의 한 곳에만 남겼다(의미 변경 없음)
- **Files modified:** `domain/vendors/index.ts`
- **Verification:** node -e 검증 스크립트 재실행 `ok`
- **Committed in:** `bc69b03`

**4. [Rule 2 - Missing Critical] `test/integration/code-tables.test.ts`의 하드코딩된 허용 키 집합이 새 `taxRule` 필드로 인해 깨진 것을 즉시 수정**
- **Found during:** Task 2, `pnpm test:integration` 전체 실행
- **Issue:** `CodeItemDto`에 `taxRule` 필드를 추가하자 기존 테스트의 "행 객체 누출 없음" 단언이 하드코딩된 키 집합(`taxRule` 없음)과 어긋나 실패했다
- **Fix:** 허용 키 집합에 `taxRule` 추가
- **Files modified:** `test/integration/code-tables.test.ts`
- **Verification:** 해당 테스트 9/9 통과
- **Committed in:** `d14fa5e`

**5. [Rule 2 - Missing Critical] `domain/permissions/scope-for.ts`·`info-items.ts`에 거래처 항목이 없어 `scopeFor`/`project`가 동작할 수 없었다**
- **Found during:** Task 2, `domain/vendors/index.ts` 첫 통합 테스트 실행(`UnknownScopeEntityError`)
- **Issue:** 플랜의 `files_modified`에 이 두 파일이 없었지만, 03-05가 `org_unit`·`team`·`corp_card`·`user`에 대해 남긴 것과 정확히 같은 한 줄 추가가 없으면 거래처 domain이 원천적으로 동작하지 않는다
- **Fix:** `ENTITY_MENUS`에 `vendor: "admin.vendors"`, `INFO_ITEMS`에 `vendor.value`(staffDefault: true) 한 줄씩 추가
- **Files modified:** `domain/permissions/scope-for.ts`, `domain/permissions/info-items.ts`
- **Verification:** `pnpm test:integration` 통과, leak-scan 396→410케이스로 확장(정상 증가)
- **Committed in:** `d14fa5e`

---

**Total deviations:** 5 auto-fixed (2 Rule 1 — 실행 중 재현된 버그, 2 Rule 2 — 계획에 없던 필수 배선/회귀 보강, 1 Rule 3 — 테스트 환경 블로킹 이슈). **Impact:** 전부 게이트(`pnpm typecheck`·`pnpm test`)를 통과시키거나 이 플랜이 명시적으로 요구한 계약(fail-closed 실제 경로 검증, 마스킹 해제 순서 검증 스크립트)을 충족하는 데 필수였다. 새 기능이나 범위를 벗어나는 변경은 없다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. `listVendors`/`searchVendors`가 `scope`를 내부에서 계산 — 캐릭터가 넘겨받지 않는다**
- **열린 지점:** 플랜 원문이 "`listVendors(viewer, { includeHidden, scope })`"라고 적어 scope를 caller가 넘기는 것처럼 읽힐 여지가 있었다
- **선택:** `scopeFor(viewer, "vendor")`를 domain 함수 안에서 호출하고 caller는 `includeHidden`만 넘긴다
- **이유:** `listCorpCards`·`listCodeItems` 등 이 리포의 모든 sibling domain 함수가 이 패턴이다. scope를 caller에게 계산시키면 domain 밖에서 권한 판정 로직이 중복되거나 잘못 계산될 위험이 생긴다 — 표기의 모호성보다 기존 계약의 일관성을 우선했다

**2. 거래처 등록의 이름 중복 경고를 사전 차단이 아니라 등록 성공 후 배너로 구현**
- **열린 지점:** "서버가 같은 정규화 이름의 기존 거래처를 함께 돌려주면 ... 등록을 막지 않는다"는 순서를 명시하지 않았다
- **선택:** `createVendor`가 삽입 전에 중복 후보 개수를 조회해 `{ vendor, duplicateCount }`로 함께 반환하고, 폼이 성공 후 `duplicateCount > 0`이면 배너를 보여준다
- **이유:** 사전에 차단·확인창을 두면 "등록을 막지 않는다"는 요구와 충돌할 여지가 생긴다 — 성공 후 배너가 그 요구를 가장 직접적으로 만족한다

**3. `updateVendor`의 `recordAction` actionType을 `document_create`로 재사용**
- **열린 지점:** OPS-05 핵심 행동 종류 17개 중 "문서 갱신"에 정확히 대응하는 종류가 없다
- **선택:** corp-cards의 `updateCorpCardOwner`가 이미 같은 상황에서 `document_create`를 재사용한 선례를 그대로 따랐다
- **이유:** 새 행동 종류를 추가하는 것은 OPS-05 정본을 흔드는 결정이라 이 플랜의 판단 범위를 넘는다(03-01·03-05의 같은 판단 계승) — 필요해지면 이후 플랜이 종류를 추가해야 한다

**4. 증빙 종류 7항목의 세금 규칙 기본값**
- **열린 지점:** ROADMAP·EXP-15는 규칙 종류 네 값의 존재만 지정했고, 일곱 증빙 종류 각각에 어느 규칙을 기본으로 둘지는 지정하지 않았다
- **선택:** 세금계산서=부가세 가산율, 계산서·카드 전표·현금영수증·해외 인보이스=없음, 기타소득·사업소득=원천징수(면제 기준은 설정 레지스트리 기본값과 일치)
- **이유:** 한국 세무 관행상 합리적인 매핑이고, 관리자가 화면(Task 3)에서 언제든 바꿀 수 있어 시드가 틀려도 되돌릴 수 없는 결정이 아니다 — 출발점일 뿐 정본이 아니다

## Known Stubs

없음 — 이 플랜은 스텁 없이 암호화→스키마→domain→화면→행동 로그→보관함까지 실제로 동작하는 경로를 만들었다. 거래처 커스텀 필드 입력 UI는 `field_definitions`에 등록된 필드가 있으면 그 타입대로 동적으로 그려지는 실제 동작이다 — 지금은 등록된 필드 정의가 없어(관리 화면은 Phase 10) 빈 목록으로 보일 뿐, 코드가 비어 있거나 가짜 데이터를 그리는 것이 아니다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 기존 것) |
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint:sql` | PASS | `Found 0 issues in 8 files` — `.squawk.toml` 무변경 |
| `pnpm build` | PASS | `/admin/vendors` 포함 21개 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 49 files / 489 tests(신규 3파일 — crypto 12·build-schema 7·tax-rule 17케이스) |
| `pnpm test:integration` | PASS | 22 files / 529 tests(신규 3파일 — vendors 16·custom-fields 6·document-counters 5, leak-scan 410케이스로 확장) |
| `pnpm test:e2e` | PASS(최종 재실행) | 84 tests(신규 1 — vendors.spec.ts). **중간 재실행 중 `corp-cards.spec.ts`·`mobile-corp-cards.spec.ts`·`mobile-people.spec.ts`가 이 세션에서 여러 차례 간헐적으로 실패했다** — 전부 `/admin/people` 사람 등록 폼의 네이티브 GET 제출-하이드레이션 경합으로 추정되는 사전 존재 이슈(03-01-SUMMARY가 `keyboard-nav.spec.ts`에서 이미 "React 하이드레이션 타이밍 경합으로 추정"이라 기록한 것과 같은 종류)이고, 이 플랜은 `person-form.tsx`·`corp-cards` 코드를 전혀 건드리지 않았다(스키마 GIN 인덱스 추가 제외). `test/e2e/vendors.spec.ts`·`code-tables.spec.ts`는 단독 실행·`--workers=1`·전체 스위트 동시 실행 등 모든 조합에서 한 번도 실패하지 않았다. 최종 전체 스위트 재실행에서 84/84 전부 통과 확인 |
| `pnpm test`(세 계층 순차) | PASS | 489+529+84, 최종 재실행 exit 0 |
| `git diff package.json` | 새 스크립트 한 줄만 | `db:rotate-key` — 신규 dependency 줄 0건 |
| `git diff .squawk.toml` | 비어 있음 | 새 예외 추가 없음 |
| CSS 색 리터럴 스캔 | 0건 | `vendors.module.css`·`code-tables.module.css` |
| `lib/crypto.ts` 로그 호출 스캔 | 0건 | node -e 스캔 |
| `APP_DATA_KEY_v2` 등록 위치 스캔 | 2곳(스키마·키 배열) | node -e 스캔 |
| `revealAccountNumber` 기록→복호화 순서 스캔 | 통과 | node -e 소스 위치 비교 |
| `account-number.tsx` disabled/로그 노출 스캔 | 통과 | node -e 스캔 |
| `evidence-type-fields.tsx` 세율 입력 스캔 | 통과 | node -e 스캔, "설정 화면" 포인터 존재 확인 |
| `pg_indexes` GIN 인덱스 실재 확인 | 6개 전부 존재 | `vendors_custom_fields_idx` 등 |

## Issues Encountered

- **E2E 간헐적 실패(사전 존재, 이 플랜 무관):** 위 게이트 결과 표 참고. `corp-cards.spec.ts` 등이 이 세션에서 여러 번 재현됐으나 최종 재실행에서 전부 해소됐다(리소스 압박이 완화되며 재현되지 않음으로 추정) — 코드를 고치지 않았다(스코프 밖, 이 플랜의 변경이 직접 유발한 것이 아니다). 재발하면 별도 조사가 필요하다는 점을 여기 남긴다
- 그 외 문제는 위 Deviations에서 전부 해소됐다

## User Setup Required

**배포 전 반드시 확인해야 하는 항목 — 앱이 뜨는 것과 거래처 계좌번호 기능이 실제로 동작하는 것은 다른 문제다.**

`lib/env.ts`는 `APP_DATA_KEY_v1`을 선택 문자열로 둔다 — 값이 없어도 앱은 정상적으로 뜬다(Phase 1 계약). 하지만 그 상태에서 거래처 계좌번호를 저장하려는 첫 시도는 즉시 500으로 실패한다(fail-closed, 의도된 동작). 배포 후에야 발견되면 곤란하므로, 배포 전에 사람이 직접 확인해야 한다(Task 3 `<verify>`의 `<human-check>` 그대로):

1. **staging·prod 두 환경 모두** GCP Secret Manager에 `app-data-key-v1-{env}` 시크릿이 실제로 등록돼 있는지 확인한다
2. 그 값이 **base64로 인코딩된 32바이트**(Task 1 결정 ②)인지 확인한다 — hex 등 다른 인코딩이면 `Buffer.from(value, "base64")`의 길이가 32가 아니게 되어 `lib/crypto.ts`가 즉시 "APP_DATA_KEY_v1의 길이가 올바르지 않습니다" 예외를 던진다(값은 로그에 남지 않는다 — 길이 실패 자체로 인코딩 오류를 알 수 있다)
3. 확인 명령 예시(값 자체를 로그에 남기지 않고 길이만 확인): Secret Manager 콘솔에서 시크릿 버전을 열어 base64 문자열의 길이가 44자(32바이트 base64 인코딩 표준 길이, 패딩 `=` 포함)인지 눈으로 확인한다
4. 키 회전이 필요해지면(`docs/OPERATIONS.md` §9) `app-data-key-v2-{env}`를 같은 방식으로 추가 등록 후 `pnpm db:rotate-key`를 돌리고, 완료 확인 후에만 v1을 지운다

로컬 개발·통합 테스트는 이미 해결됐다(`test/integration/global-setup.ts`가 로컬 전용 키를 자동 생성한다, `.env.local`에도 추가했다) — 이 항목은 **staging·prod 두 환경**에만 해당한다.

## Next Phase Readiness

- `lib/crypto.ts`의 `encrypt`/`decrypt`가 Phase 5·6·11(기타소득·사업소득 확인 QR 등 민감정보를 다룰 가능성이 있는 모든 후속 페이즈)이 재사용할 수 있는 정본 암호화 계약이다
- `domain/settings/keys.ts`의 `tax.*` 세율 키(03-04 산출)와 이 플랜의 `taxRuleSchema`(규칙 종류·절사·기준일)가 합쳐져 Phase 4의 `domain/money.applyTaxRule`이 실제로 읽을 두 계약이 모두 갖춰졌다 — Phase 4는 증빙 종류 코드표 항목의 `taxRule`을 조회해 규칙 종류를 판정하고, 그 규칙 종류에 해당하는 세율은 `getSettingValue(TAX_*, {asOf})`로 별도 조회한다
- `document_counters` 표와 그 경계(부여 훅·행 잠금은 Phase 4)가 `docs/ARCHITECTURE.md` §4-6에 문서화됐다 — Phase 4가 실제 지출결의 문서 번호 부여 로직을 얹을 자리가 준비됐다
- `vendors` 표의 `defaultEvidenceType` 필드가 Phase 5·6의 지출결의·카드 사용 등록 폼이 거래처를 고르면 자동으로 읽어 채울 수 있는 자리다 — 아직 그 소비자는 없다
- `ARCHIVABLE_TABLES`·`ENTITY_MENUS`·`DTO_REGISTRY`·`ACTION_REGISTRY`에 이 플랜이 각각 한 항목(`vendor`)·두 항목(`vendor`→`admin.vendors`, `vendor.value`)·한 항목(`VendorDto`)·네 항목을 추가해 이 페이즈의 "새 마스터 표는 한 줄 추가" 규약을 그대로 상속했다
- Phase 3의 나머지 플랜(03-07 등)이 있다면 `field_definitions`·GIN 인덱스 규약, `evidence-type-fields.tsx`의 즉시 저장 패턴을 그대로 재사용할 수 있다

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-20*

## Self-Check: PASSED

- 27개 핵심 신규 파일(암호화·스키마·마이그레이션·domain·리포지토리·스크립트·테스트·앱 라우트·결정 기록) 전부 `[ -f ]`로 존재 확인
- 14개 커밋 해시(`da78e2d`·`95fcb90`·`f732605`·`411dd9f`·`82f96b1`·`9191b2d`·`2df5e40`·`d14fa5e`·`f7b753c`·`b65bb26`·`bc69b03`·`e803074`·`647368a`·`893cb30`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 전 항목과 각 태스크의 acceptance criteria를 재실행해 위 "게이트 결과" 표와 일치 확인. `pnpm test`(세 계층) 최종 재실행 exit 0. `commits: 14`는 `git rev-list --count 113e413..HEAD` 실측값
