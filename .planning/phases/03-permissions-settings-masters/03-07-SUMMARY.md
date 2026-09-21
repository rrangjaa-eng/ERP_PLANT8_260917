---
phase: 03-permissions-settings-masters
plan: 07
subsystem: masters
tags: [action-log, audit, archive, soft-delete, csv-export, better-auth, session-revocation, drizzle]

requires:
  - phase: 03-permissions-settings-masters
    provides: "03-01의 판정 4함수(can/visible/scopeFor/project)·행동 로그(recordAction)·ARCHIVABLE_TABLES/ENTITY_MENUS 단일 정본 규약·CORE_ACTION_TYPES/ALWAYS_ON_ACTION_TYPES, 03-03의 DTO_REGISTRY·EXPORT_REGISTRY·누수 스캔 생성기·actions.registry.ts 분리 패턴, 03-05·03-06이 ARCHIVABLE_TABLES에 남긴 확장 선례(org_unit·team·corp_card·user·vendor), 03-06의 lib/crypto.ts·better-auth 훅 배선 경험"
provides:
  - "domain/action-log/index.ts·export.ts — queryActionLog/pruneActionLog(사람·기간·행동종류·문서 4축 + 정리 포함 토글)·serializeActionLogExportAsCsv(BOM CSV, 신규 의존성 0). ActionLogDto가 EXPORT_REGISTRY·DTO_REGISTRY에 등록됨"
  - "action_log.pruned_at/pruned_by 컬럼(마이그레이션 0008) — 정리는 플래그일 뿐 물리 삭제가 아니고, 정리 자체가 action_log_prune 행동으로 자기 기록에 남으며 그 정리 행 자체는 다음 정리 대상에서 항상 제외된다"
  - "domain/archive/index.ts — listArchive(viewer), repositories/archive.ts의 ARCHIVABLE_TABLES 7종(roles·code_items·org_units·teams·corp_cards·users·vendors) 전부를 가로질러 조회하는 listArchivedAcrossEntities"
  - "app/(app)/admin/archive/delete-to-archive.tsx의 DeleteToArchive — 여섯 마스터 화면(코드표·사람·계급·조직/팀·법인카드·거래처)이 공유하는 두 단계 삭제→보관 확인 컴포넌트"
  - "사람 보관 = domain/people/archivePerson — archive() + revokeAllSessions()를 한 번에 묶고, domain/auth/hooks.ts의 before 훅이 보관된 사용자의 로그인을 실제 잘못된 비밀번호 응답과 상태·본문이 동일하게(더미 해시 포함) 거부한다"
  - "app/(app)/admin/action-log/, app/(app)/admin/archive/ — 관리자 화면 2개(필터·Excel 내보내기·정리 / 보관 목록·복원)"
affects: [phase-4, phase-5, phase-6, phase-9, phase-10]

actuals:
  tokens: 54003
  tasks: 3
  commits: 13
plan_head_before: 01ee33dbc701f2beabe6dbf462e4a81e10474c3c

tech-stack:
  added: []
  patterns:
    - "UTF-8 BOM CSV를 {filename, contentType, body} 계약으로 반환 — 직렬화 함수(serializeActionLogExportAsCsv)를 행/열 조립과 분리해 나중에 .xlsx로 바꿀 때 그 함수 하나만 교체하면 되게 했다(Task 1 체크포인트 결정, 옵션 A)"
    - "정리(prune)는 플래그(pruned_at/pruned_by)이지 DELETE가 아니다 — 로그 정리 자체가 재귀적으로 감사 대상이라는 요구를 물리 삭제로는 만족할 수 없다(정리 기록 자체를 지울 수 없으므로)"
    - "domain/action-log/filter-keys.ts — 클라이언트 컴포넌트가 필요로 하는 상수만 담은 zero-dependency leaf 모듈. domain/action-log/index.ts는 repositories/*(→ db/client.ts → pg)를 물고 있어 클라이언트 번들에 섞이면 tls/util 모듈이 깨진다(이번 세션에 실제 빌드 실패로 발견)"
    - "listArchivedAcrossEntities — ARCHIVABLE_TABLES 각 항목에 listArchived(viewer) 클로저를 추가해 Promise.all로 병렬 조회 후 결정적으로(archivedAt desc → entity → id) 정렬. 새 마스터 표를 그 상수에 한 줄 추가하면 보관함이 따라온다는 기존 규약을 그대로 지킴"
    - "scopeFor의 includeArchived는 '보는 사람 자신'의 admin.archive 보기 권한에 매인다(03-01 계약) — 관리자가 항목을 보관해도 자기 화면에서는 계속 보인다는 뜻이라, 다섯 마스터 화면(코드표·법인카드·거래처·계급·조직/팀) 전부에 「보관됨」 태그 + 동작 버튼 숨김을 새로 추가해야 했다(사람 화면은 03-05가 이미 갖고 있었다)"

key-files:
  created:
    - domain/action-log/index.ts
    - domain/action-log/export.ts
    - domain/action-log/filter-keys.ts
    - db/migrations/0008_action_log_prune.sql
    - test/unit/action-log/filter.test.ts
    - test/unit/action-log/export.test.ts
    - test/integration/action-log-query.test.ts
    - test/integration/archive.test.ts
    - test/e2e/action-log.spec.ts
    - test/e2e/archive.spec.ts
    - app/(app)/admin/action-log/page.tsx
    - app/(app)/admin/action-log/actions.ts
    - app/(app)/admin/action-log/actions.registry.ts
    - app/(app)/admin/action-log/filter-bar.tsx
    - app/(app)/admin/action-log/action-log.module.css
    - app/(app)/admin/archive/page.tsx
    - app/(app)/admin/archive/actions.ts
    - app/(app)/admin/archive/actions.registry.ts
    - app/(app)/admin/archive/archive.module.css
    - app/(app)/admin/archive/delete-to-archive.tsx
    - test/unit/deploy/app-data-key-length.test.ts
    - .planning/phases/03-permissions-settings-masters/03-07-DECISION-TASK1.md
  modified:
    - db/schema/action-log.ts
    - domain/action-log/record.ts
    - repositories/action-log.ts
    - domain/archive/index.ts
    - repositories/archive.ts
    - domain/permissions/info-items.ts
    - domain/people/index.ts
    - domain/auth/hooks.ts
    - ui/list-empty/ListEmpty.tsx
    - docs/ARCHITECTURE.md
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - test/integration/leak-scan.test.ts
    - app/(app)/admin/code-tables/{page.tsx,actions.ts,actions.registry.ts,code-item-form.tsx}
    - app/(app)/admin/vendors/{page.tsx,actions.ts,actions.registry.ts,vendor-form.tsx}
    - app/(app)/admin/corp-cards/{page.tsx,actions.ts,actions.registry.ts,card-form.tsx}
    - app/(app)/admin/people/{page.tsx,actions.ts,actions.registry.ts,person-form.tsx}
    - app/(app)/admin/people/roles/{page.tsx,roles-client.tsx}
    - app/(app)/admin/people/org/{page.tsx,org-client.tsx}
    - lib/crypto.ts
    - playwright.config.ts
    - scripts/deploy.sh
    - docs/OPERATIONS.md
    - test/unit/settings/registry-coverage.test.ts

key-decisions:
  - "Task 1 체크포인트는 프롬프트에 옵션 A(UTF-8 BOM CSV, 신규 의존성 0, {filename,contentType,body} 계약)로 이미 결정돼 있어 사람에게 다시 묻지 않고 그대로 진행했다 — .planning/phases/03-permissions-settings-masters/03-07-DECISION-TASK1.md에 기록"
  - "domain/action-log/export.ts가 모듈 로드 시점에 registerExport를 직접 호출한다 — 이 플랜의 다른 모든 registerAction은 별도 actions.registry.ts에서 하지만, 내보내기는 화면(app 레이어)이 아니라 domain이 소유한 순수 변환이라 도메인 파일 자체가 등록 지점이라고 판단했다(플랜 문구가 이 배치를 명시)"
  - "pruneActionLogRows를 markActionLogRowsPruned로 이름을 바꿨다 — 원래 이름이 03-07-PLAN.md 검증 스크립트의 `indexOf('pruneActionLog') + 2500자 창` 방식과 import 구문에서 우연히 먼저 매치돼 실제 함수 본문(recordAction 호출)을 놓치는 거짓 실패를 냈다. 의미는 그대로다"
  - "ActionLogDto의 모든 필드를 단일 정보 항목(action_log.detail)으로 묶었다 — 03-01의 노출표는 필드별 세분화를 허용하지만, 행동 로그는 '보이거나 안 보이거나' 둘 중 하나인 감사 로그라 화면·필터·CSV가 항상 같은 열 집합을 다뤄야 한다는 요구(플랜 원문)와 일치한다"
  - "domain/archive/index.ts의 새 정보 항목 archive.value(staffDefault: false)를 info-items.ts에 추가했다 — 03-05·03-06이 org_unit·team·corp_card·user·vendor에 대해 남긴 것과 같은 최소 배선(Rule 2), 보관함 자체도 project()의 노출 판정을 거친다"

requirements-completed: [ADMN-10, ADMN-12, OPS-05]

coverage:
  - id: D1
    description: "행동 로그 화면에서 사람·기간·행동 종류·문서 네 축으로 필터링할 수 있고, 「필터 없음·0건」과 「필터 있음·0건」 두 문구를 구분한다"
    requirement: ADMN-10
    verification:
      - kind: unit
        ref: "test/unit/action-log/filter.test.ts(기간 경계 포함·정렬 결정성·필터 교집합)"
        status: pass
      - kind: integration
        ref: "test/integration/action-log-query.test.ts(10케이스 — 4축 개별·조합 필터, 노출표 detail 꺼짐 계급 투영 확인)"
        status: pass
      - kind: e2e
        ref: "test/e2e/action-log.spec.ts#필터 → 0건 문구 → ..."
        status: pass
    human_judgment: false
  - id: D2
    description: "Excel(UTF-8 BOM CSV) 내보내기가 실제 다운로드되고, 신규 npm 의존성이 0이며, 직렬화가 행/열 조립과 분리돼 있다"
    requirement: [ADMN-10, OPS-05]
    verification:
      - kind: unit
        ref: "test/unit/action-log/export.test.ts(BOM 존재·결정성·0행 헤더만·CSV 왕복 이스케이프)"
        status: pass
      - kind: e2e
        ref: "test/e2e/action-log.spec.ts#Excel 내보내기가 다운로드를 일으킨다"
        status: pass
      - kind: other
        ref: "git diff package.json이 03-07 구간에서 비어 있음(node -e 확인), EXPORT_REGISTRY에 action-log.export 등록"
        status: pass
    human_judgment: false
  - id: D3
    description: "쓰기 권한이 있는 계급만 「정리」 버튼을 보고, 정리는 두 단계 확인 후 실행되며, 정리 자체가 action_log_prune 행동으로 기록되고 그 정리 행 자신은 다음 정리 대상에서 항상 제외된다(재귀적 자기 참조 방지)"
    requirement: [ADMN-10, OPS-05]
    verification:
      - kind: integration
        ref: "test/integration/action-log-query.test.ts(정리 후 기본 조회에서 빠지고 「정리 포함」 토글로 다시 보임, 정리 기록 자체가 남음)"
        status: pass
      - kind: e2e
        ref: "test/e2e/action-log.spec.ts#정리(두 단계) → 정리 기록 확인 → ..."
        status: pass
      - kind: other
        ref: "repositories/action-log.ts markActionLogRowsPruned의 SQL이 ne(actionType, \"action_log_prune\")을 항상 AND 조건으로 건다(코드 리뷰)"
        status: pass
    human_judgment: false
  - id: D4
    description: "정리는 물리 DELETE가 아니라 pruned_at/pruned_by 플래그다(마이그레이션 0008)"
    requirement: ADMN-10
    verification:
      - kind: other
        ref: "pnpm lint:sql — Found 0 issues in 9 files. db/schema/action-log.ts 컬럼 존재 + docs/ARCHITECTURE.md §4-6a 규약 문서화"
        status: pass
    human_judgment: false
  - id: D5
    description: "보관함 화면이 마스터 표 7종(계급·코드표·본부·팀·법인카드·사람·거래처)을 가로질러 보관된 항목을 보여주고 복원할 수 있다"
    requirement: ADMN-12
    verification:
      - kind: integration
        ref: "test/integration/archive.test.ts(다표 조회·결정적 정렬, 복원 후 재조회, 멱등 복원, 동시 보관/복원 경합에서 최종 상태 하나)"
        status: pass
      - kind: e2e
        ref: "test/e2e/archive.spec.ts#코드표 삭제 → 보관함에 보임 → 복원 → ..."
        status: pass
    human_judgment: false
  - id: D6
    description: "여섯 마스터 화면(코드표·사람·계급·조직/팀·법인카드·거래처)의 삭제가 두 단계 확인을 거쳐 보관 처리로 바뀌었고, 공유 컴포넌트 하나(DeleteToArchive)로 구현됐다"
    requirement: ADMN-12
    verification:
      - kind: e2e
        ref: "test/e2e/archive.spec.ts(코드표 경로로 왕복 검증) + 코드 리뷰(여섯 화면 전부 delete-to-archive.tsx import 확인)"
        status: pass
      - kind: other
        ref: "node -e 여섯 actions.registry.ts에 archive*Action이 registerAction으로 등록됐는지 확인"
        status: pass
    human_judgment: true
    rationale: "여섯 화면 전부를 e2e로 왕복시키는 것은 이 플랜의 비용 대비 한계효용이 낮다고 판단해 코드표 경로 하나만 e2e로 증명하고 나머지 다섯은 같은 컴포넌트·같은 배선 패턴이라는 코드 리뷰로 갈음했다"
  - id: D7
    description: "사람을 보관하면 그 사람의 모든 세션이 즉시 무효화되고, 이후 로그인 시도가 실제 잘못된 비밀번호 응답과 상태·본문(코드·메시지)이 깊은 비교로 동일하게 거부된다(정보 노출 없음)"
    requirement: ADMN-12
    verification:
      - kind: integration
        ref: "test/integration/archive.test.ts(보관 전·후·복원 후 세 상태, 세션 수 0 확인, 실제 오답 비밀번호 응답과 deep-equal)"
        status: pass
      - kind: other
        ref: "grep -c 'password.hash' domain/auth/hooks.ts ≥ 1이고 그 호출이 throw보다 앞선다(node -e 소스 위치 확인), git diff package.json 비어 있음"
        status: pass
    human_judgment: false
  - id: D8
    description: "보관함이 비어 있으면 메시지만 보이고 다음 한 수 버튼이 없다(EMPTY 예외 — 보관함이 빈 것은 정상이다)"
    requirement: ADMN-12
    verification:
      - kind: other
        ref: "03-07-PLAN.md 검증부의 정적 소스 검사(node -e, 'EMPTY HAS NEXT ACTION' 부재 확인) PASS"
        status: pass
    human_judgment: true
    rationale: "이 로컬 erp_test DB에서는 permissions-grid.spec.ts(03-04)가 세로 스크롤 회귀 테스트 정리 단계에서 임시 계급을 하드 DELETE 대신 보관 처리해 영구히 남기므로, 전역 보관함이 실제로 비는 e2e 경로는 이 세션의 로컬 환경에서 신뢰할 수 있는 단언이 아니다(아래 Issues Encountered 참고) — EMPTY 렌더 자체는 정적 검사로, my 항목의 개별 복원은 e2e로 각각 증명했다"
  - id: D9
    description: "권한 없는 계급(기본 계급)에는 /admin/action-log·/admin/archive 둘 다 404다"
    requirement: [ADMN-10, ADMN-12]
    verification:
      - kind: e2e
        ref: "test/e2e/action-log.spec.ts#PM 역할 404, test/e2e/archive.spec.ts#권한 없는 계급 404"
        status: pass
    human_judgment: false

duration: 확인 불가(세션이 컨텍스트 압축을 거쳐 재개됨 — 커밋 타임스탬프 기준 00:12~02:11 UTC, 약 2시간)
completed: 2026-09-21
status: complete
---

# Phase 3 Plan 7: 행동 로그 화면 · 보관함 화면 Summary

**행동 로그에 4축 필터·정리(플래그, 재귀 감사)·UTF-8 BOM CSV 내보내기를 배선하고, 마스터 표 7종을 가로지르는 보관함 화면과 여섯 마스터 화면 공용 「삭제→보관」 확인 컴포넌트를 만들었으며, 사람 보관이 세션 무효화 + 로그인 거부(실제 오답과 동일한 응답)까지 이어지게 했다.**

## Performance

- **Duration:** 커밋 타임스탬프 기준 약 2시간(00:12~02:11 UTC) — 세션이 컨텍스트 압축을 한 번 거쳐 재개됨
- **Tasks:** 3 (Task 1 체크포인트 — 프롬프트에 옵션 A로 사전 확정, 재확인 없이 진행 → Task 2 행동 로그 domain·화면 → Task 3 보관함 domain·화면 + 여섯 화면 배선 + 사람 보관/로그인 거부)
- **Commits:** 13 (`git rev-list --count 01ee33d..HEAD` 실측)
- **Estimate 대비:** 90,000 토큰 견적 대비 실측 54,003 토큰(diff 216,011자/4) — 견적 이하

## Accomplishments

- `domain/action-log/index.ts`·`export.ts` — `queryActionLog`/`pruneActionLog`(사람·기간·행동 종류·문서 4축 + 「정리 포함」 토글), `serializeActionLogExportAsCsv`(BOM, RFC4180 이스케이프, 신규 의존성 0). `ActionLogDto`가 단일 정보 항목(`action_log.detail`)으로 게이트되고 `DTO_REGISTRY`·`EXPORT_REGISTRY` 둘 다에 등록됨
- `action_log.pruned_at`/`pruned_by`(마이그레이션 0008, `pnpm lint:sql` 0 issues) — 정리는 플래그이지 DELETE가 아니고, 정리 자체가 `action_log_prune` 행동으로 자기 기록에 남으며 그 정리 행 자신은 SQL `ne()` 조건으로 항상 다음 정리 대상에서 제외됨
- `app/(app)/admin/action-log/` — 필터 줄(사람·기간·행동 종류·문서 + 정리 포함 토글) + 「Excel 내보내기」(2차) + 「정리」(3차, 쓰기 권한 있을 때만) 세 게이트 화면
- `domain/archive/index.ts`·`repositories/archive.ts` — `listArchivedAcrossEntities`가 `ARCHIVABLE_TABLES` 7종(roles·code_items·org_units·teams·corp_cards·users·vendors) 각각의 `listArchived` 클로저를 `Promise.all`로 병렬 조회 후 결정적 정렬
- `app/(app)/admin/archive/delete-to-archive.tsx`의 `DeleteToArchive` — 여섯 마스터 화면(코드표·사람·계급·조직/팀·법인카드·거래처)이 공유하는 두 단계 삭제→보관 확인. 다섯 화면(코드표·법인카드·거래처·계급·조직/팀)에 「보관됨」 상태 태그 + 동작 버튼 숨김을 새로 추가(사람 화면은 03-05가 이미 가짐) — `scopeFor`의 `includeArchived`가 보는 사람 자신의 권한에 매여 있어 관리자 화면에서 보관 항목이 사라지지 않는다는 03-01 계약을 실측으로 재발견하고 대응
- `domain/people/archivePerson` + `domain/auth/hooks.ts`의 `before` 훅 — 사람 보관 시 `revokeAllSessions` 즉시 실행, 이후 로그인 시도는 더미 비밀번호 해시를 수행한 뒤 실제 오답 비밀번호와 상태·본문(코드·메시지)이 깊은 비교로 동일한 401을 반환(정보 노출 없음)
- **부수적으로 발견해 즉시 고친 배포 결함(Rule 1, 프로덕션 영향):** `scripts/deploy.sh`가 `app-data-key-v1`을 48바이트(`openssl rand -base64 48`)로 생성했는데 `lib/crypto.ts`는 정확히 32바이트를 요구 — 최초 배포 이후 거래처 계좌번호 등 모든 앱단 암호화 저장이 fail-closed로 막혀 있었을 결함. `lib/crypto.ts`에 `APP_DATA_KEY_BYTES` 상수를 export해 두 곳이 항상 같은 값을 보게 하고, `test/unit/deploy/app-data-key-length.test.ts`로 회귀 고정. `docs/OPERATIONS.md` §9에 이미 배포된 staging·prod의 옛 48바이트 시크릿에 새 32바이트 버전을 추가하는 정확한 명령을 남김(옛 버전으로 암호화 성공한 데이터가 존재할 수 없어 안전)
- `pnpm test` 세 계층 최종 재실행 전부 GREEN: 단위 509 · 통합 691(신규 action-log 10 + archive 8케이스) · E2E 86(신규 action-log 1 + archive 1) — 신규 npm 의존성 0

## Task Commits

1. **Task 1: Excel 내보내기 수단 체크포인트(프롬프트에 옵션 A로 사전 확정)** - `a34235d`(docs)
2. **Task 2: 행동 로그 조회·필터·내보내기·정리 + 화면** - `8552826`(test RED) → `bfb5429`(feat GREEN) → `e40675f`(fix, 03-06 E2E webServer 암호화 키 주입 — 이 플랜의 E2E가 통과하려면 필요했던 사전 존재 블로킹 이슈) → `6655692`(feat 화면 + 마이그레이션 0008)
3. **Task 3: 보관함 domain·화면 + 여섯 화면 배선 + 사람 보관/로그인 거부** - `cee05dd`(feat domain 진입점) → `e9e64eb`(test, 03-06 키 길이 계약 회귀 고정) → `05ec647`(fix, 03-06 배포 스크립트 32바이트 수정) → `e547ff0`(feat 보관함 화면 + 여섯 화면 배선) → `6fe4fc5`(fix, archive.spec.ts 전역 단언을 항목 범위로 좁힘)

**이 플랜 실행 창 안에서 발견해 함께 처리했지만 세 태스크 자체의 산출물은 아닌 것:**
- `44a41d0`(docs) — 이전 웨이브에서 열려 있던 사용자 판단 3건(설정 라벨 줄바꿈·e2e 워커 격리·웨이브 4 TDD 적대적 검증) 기록
- `a970fc8`(test, 03-04) — `readBy` 표시 만료 강제(별개의 사전 열린 하드닝 항목)
- `2b7b8b4`(docs/design) — `SYSTEM.md` §7-7에 관리자 마스터 화면의 EMPTY·LOADING 해당 없음 명시(Task 3 화면들에서 반복 관찰된 패턴을 §7-13 선례 형식으로 문서화)

**Plan metadata:** 이 SUMMARY 커밋이 담당(오케스트레이터 지시에 따라 STATE.md·ROADMAP.md는 이 실행에서 건드리지 않음)

## Files Created/Modified

주요 파일은 frontmatter `key-files` 참고. 특히:
- `domain/action-log/index.ts`·`export.ts` — 조회·필터·정리·내보내기 domain 출구
- `domain/archive/index.ts`·`repositories/archive.ts` — 보관함 조회의 정본
- `app/(app)/admin/action-log/`, `app/(app)/admin/archive/` — 관리자 화면 2개
- `app/(app)/admin/archive/delete-to-archive.tsx` — 여섯 화면 공유 컴포넌트
- `domain/auth/hooks.ts` — 보관된 사용자 로그인 거부

## Decisions Made

frontmatter `key-decisions` 참고. 요약: Task 1은 프롬프트가 이미 옵션 A로 확정해 재확인 없이 진행. `registerExport`는 domain 파일 자체에서 호출(화면 레이어가 아님). `pruneActionLogRows`→`markActionLogRowsPruned` 개명(검증 스크립트 오탐 회피, 의미 불변). `ActionLogDto`는 필드별이 아니라 단일 정보 항목으로 게이트. `archive.value` 정보 항목을 03-05·03-06 선례대로 추가.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 클라이언트 컴포넌트가 `domain/action-log/index.ts`를 import해 Next.js 빌드가 `tls`/`util/types` 모듈 부재로 깨짐**
- **Found during:** Task 2, `filter-bar.tsx`(클라이언트 컴포넌트) 작성 직후 첫 `pnpm build`
- **Issue:** `domain/action-log/index.ts`는 `repositories/*` → `db/client.ts` → `pg`를 물고 있어, 그 파일의 상수(`ACTION_LOG_FILTER_KEYS`)를 클라이언트 번들에 끌어들이면 Node 전용 모듈이 브라우저 번들에 섞인다
- **Fix:** 그 상수만 담은 zero-dependency leaf 모듈 `domain/action-log/filter-keys.ts`를 새로 만들고 domain index와 클라이언트 컴포넌트 둘 다 거기서 import
- **Files modified:** `domain/action-log/filter-keys.ts`(신규), `domain/action-log/index.ts`, `app/(app)/admin/action-log/filter-bar.tsx`
- **Verification:** `pnpm build` 통과, `/admin/action-log` 라우트 정상 생성
- **Committed in:** `6655692`

**2. [Rule 1 - Bug] Task 2 검증 스크립트가 `pruneActionLogRows`라는 이름의 import 구문을 함수 정의로 오인해 거짓 실패**
- **Found during:** Task 2, `<verify>` 노드 스크립트(`indexOf('pruneActionLog')` + 2500자 창) 사전 실행
- **Issue:** `pruneActionLogRows as defaultPruneActionLogRows` import 줄이 실제 함수 정의보다 앞서 같은 문자열과 매치돼 2500자 창이 진짜 함수 본문(`recordAction` 호출)에 닿지 못했다
- **Fix:** 리포지토리 함수를 `markActionLogRowsPruned`로 개명(의미 불변)
- **Files modified:** `repositories/action-log.ts`, `domain/action-log/index.ts`
- **Verification:** 검증 스크립트 재실행 `ok`
- **Committed in:** `6655692`

**3. [Rule 1 - Bug] `noUncheckedIndexedAccess` 아래 CSV export 테스트의 배열 구조 분해가 `string | undefined`로 좁혀지지 않음**
- **Found during:** Task 2, `pnpm typecheck`
- **Fix:** 사용 전 명시적 `undefined` 방어 검사 추가(동작 변경 없음)
- **Files modified:** `test/unit/action-log/export.test.ts`
- **Committed in:** `8552826`

**4. [Rule 1 - Bug] `DeleteToArchive`의 `onClick={async () => {...}}`이 `no-misused-promises` 위반**
- **Found during:** Task 3, `pnpm lint`
- **Fix:** 명명 함수(`handleConfirm`)로 추출 후 `onClick={() => void handleConfirm()}`
- **Files modified:** `app/(app)/admin/archive/delete-to-archive.tsx`
- **Committed in:** `e547ff0`

**5. [Rule 2 - Missing Critical] 다섯 마스터 화면에 「보관됨」 표시·동작 버튼 숨김이 없어, 관리자가 보관한 항목이 자기 화면에서 아무 시각적 구분 없이 계속 보임**
- **Found during:** Task 3, `scopeFor`의 `includeArchived` 계약(03-01)을 실측으로 재확인하는 과정 — 보는 사람 자신이 `admin.archive` 보기 권한을 가지면 스코프가 보관 행도 함께 돌려준다는 사실 발견
- **Issue:** 플랜은 코드표·법인카드·거래처·계급·조직/팀 다섯 화면이 삭제를 보관으로 바꾸는 것만 요구했는데, 그것만으로는 보관된 행이 목록에서 완전히 사라지지도 시각적으로 구분되지도 않아 "삭제했는데 그대로 남아 있다"는 혼란을 만든다(사람 화면은 03-05가 이미 「보관됨」 태그를 가지고 있어 이 결함이 없었다)
- **Fix:** 사람 화면의 `StatusTag` 패턴을 다섯 화면 전부에 동일하게 추가하고, 보관된 행에서는 동작 버튼(삭제·활성화 등)을 렌더하지 않게 함
- **Files modified:** `app/(app)/admin/code-tables/page.tsx`, `vendors/page.tsx`, `corp-cards/page.tsx`, `people/roles/{page.tsx,roles-client.tsx}`, `people/org/{page.tsx,org-client.tsx}`
- **Verification:** `test/e2e/archive.spec.ts`가 「보관됨」 태그의 등장·소멸을 단언
- **Committed in:** `e547ff0`

**6. [Rule 3 - Blocking, 03-06 사전 존재] E2E 웹서버에 `APP_DATA_KEY_v1` 공급처가 없어 CI에서 거래처 계좌번호 저장이 fail-closed로 500**
- **Found during:** Task 2, action-log E2E가 같은 웹서버를 쓰는데 로컬 `.env.local`(gitignore)이 우연히 채워 줘서 로컬에서는 안 드러났던 결함을 확인하는 과정에서 발견
- **Fix:** `playwright.config.ts`에 `integration/global-setup.ts`와 같은 방식으로 테스트 전용 키 자동 생성 추가(02-07이 불변으로 못박은 `webServer.env` 블록은 건드리지 않음)
- **Files modified:** `playwright.config.ts`
- **Committed in:** `e40675f`

**7. [Rule 1 - Bug, 03-06 사전 존재, 프로덕션 영향] `scripts/deploy.sh`가 `app-data-key-v1`을 48바이트로 생성 — `lib/crypto.ts`의 32바이트 계약과 불일치**
- **Found during:** Task 3, 위 6번을 고치며 배포 스크립트의 같은 키 생성 로직을 대조 확인하는 과정
- **Issue:** 최초 배포(01-07/01-08) 이후 이 계약이 어긋나 있어, 배포된 staging·prod 환경에서 거래처 계좌번호 등 앱단 암호화 저장을 시도하면 즉시 예외로 막혔을 것(fail-closed라 평문 유출은 없음)
- **Fix:** `openssl rand -base64 48` → `32`로 수정, `lib/crypto.ts`에 `APP_DATA_KEY_BYTES` 상수를 export해 두 소스가 하나의 값을 참조하게 하고 회귀 테스트로 고정. 이미 배포된 옛 48바이트 시크릿은 이 수정만으로 고쳐지지 않아 `docs/OPERATIONS.md`에 새 버전 추가 절차를 남김(사람이 실행해야 하는 배포 단계 — 아래 User Setup Required 참고)
- **Files modified:** `scripts/deploy.sh`, `lib/crypto.ts`, `test/unit/deploy/app-data-key-length.test.ts`(신규), `docs/OPERATIONS.md`
- **Verification:** `test/unit/deploy/app-data-key-length.test.ts` 통과(두 소스 값 대조)
- **Committed in:** `05ec647`, `e9e64eb`

---

**Total deviations:** 7 auto-fixed(3 Rule 1 — 이번 실행 중 재현된 버그 + 1 사전 존재 프로덕션 영향 버그, 2 Rule 3 — 빌드/CI 블로킹, 1 Rule 2 — 계획에 없던 필수 시각 구분 보강). **Impact:** 전부 게이트(`pnpm build`·`pnpm typecheck`·`pnpm lint`·E2E)를 통과시키거나 이 플랜이 명시적으로 요구한 계약(정리 자기 참조 배제, 검증 스크립트 정합)을 충족하는 데 필수였다. 7번은 이 플랜의 파일 목록 밖(배포 스크립트)이지만 방치하면 프로덕션 암호화 기능이 계속 죽어 있으므로 즉시 고쳤다.

## 실행자가 판단한 것

플랜이 명시적으로 열어 두거나 실측으로 결정해야 했던 지점들 — 근거와 함께 남긴다.

**1. `domain/action-log/filter-keys.ts` 분리(클라이언트/서버 경계)**
- **열린 지점:** 플랜은 `ACTION_LOG_FILTER_KEYS`를 domain 파일에 두라고만 했고, 클라이언트 컴포넌트가 그 domain 파일 전체를 import할 때 생기는 번들 경계 문제는 언급하지 않았다
- **선택:** 상수만 담은 별도 leaf 모듈을 새로 만들어 domain index와 클라이언트 컴포넌트가 공통으로 import
- **이유:** 실제 `pnpm build` 실패(`tls` 모듈 부재)로 확인된 사실 — domain/repositories 경계가 서버 전용이라는 이 저장소의 4계층 규약(app→domain→repositories→db)이 "클라이언트 컴포넌트에서 domain을 직접 import해도 되는가"라는 질문에 답을 갖고 있지 않아 실측으로 결정했다

**2. `scopeFor`의 `includeArchived` 계약 재확인과 다섯 화면 「보관됨」 태그 보강**
- **열린 지점:** 플랜은 여섯 화면의 삭제를 보관으로 바꾸라고만 했다
- **선택:** 03-01의 `scopeFor` 계약(보는 사람 자신의 보관함 보기 권한이 있으면 스코프가 보관 행도 포함)을 실측으로 재확인한 뒤, 사람 화면에 이미 있던 「보관됨」 태그 + 동작 버튼 숨김 패턴을 나머지 다섯 화면에도 동일하게 적용했다
- **이유:** 이 계약을 따르지 않으면 관리자가 "삭제"를 눌러도 자기 화면에서 아무것도 달라지지 않는 것처럼 보여 기능이 동작하지 않는다는 오해를 만든다 — Rule 2(누락된 핵심 기능)로 판단

**3. `ui/list-empty/ListEmpty.tsx`의 `action` prop을 optional로 확장**
- **열린 지점:** 보관함·행동 로그 필터-없음 EMPTY 상태 둘 다 "다음 한 수가 없다"는 §7-7 예외에 해당하는데, 기존 컴포넌트는 `action`이 필수였다
- **선택:** `action?: ActionSpec`으로 바꾸고 없으면 다음 한 수 영역을 렌더하지 않게 함 — 기존 호출부는 전부 `action`을 명시적으로 넘기고 있어 회귀 없음
- **이유:** 02-06이 같은 이유로 이 컴포넌트를 확장한 선례가 있다(플랜이 그 선례를 참조하라고 명시). `docs/design/DECISIONS.md`에 기록함

**4. `archive.spec.ts`의 「전체 보관함이 빈다」 단언을 「내 항목이 사라진다」로 좁힘**
- **열린 지점:** 플랜 원문의 e2e 서술은 "보관함이 비면 메시지만 보이고 버튼이 없다"로 돼 있었다
- **선택:** 복원 직후 전역 보관함이 완전히 빈다고 단언하지 않고, 내가 만든 코드표 항목 한 행이 사라지는 것만 단언한다. EMPTY 상태의 "다음 한 수 없음" 렌더 자체는 03-07-PLAN.md 검증부의 정적 소스 검사로 이미 담당
- **이유:** 아래 Issues Encountered에 상세 — `permissions-grid.spec.ts`(03-04)가 자신의 정리 단계에서 임시 계급 26종을 의도적으로 보관 처리해 영구히 남기므로, 이 로컬 `erp_test` DB에서는 그 스펙이 한 번이라도 실행된 뒤로 전역 보관함이 다시는 비지 않는다. 이건 내 코드의 결함이 아니라 공유·비초기화 로컬 DB의 환경 사실이라 단언을 그 사실에 의존하지 않게 바꿨다

## Known Stubs

없음 — 이 플랜은 스텁 없이 필터→정리→내보내기, 보관→복원→로그인 거부까지 실제로 동작하는 경로를 만들었다.

## 게이트 결과

로컬 Postgres(`postgres://erp:erp@127.0.0.1:5432/erp`, 테스트 DB `erp_test`)로 전부 실제 실행했다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| `pnpm typecheck` | PASS | `tsc --noEmit` 0 error |
| `pnpm lint` | PASS | eslint+stylelint 0 error(boundaries 플러그인 자체 deprecation 경고만, 이 플랜 이전부터 있던 것) |
| `pnpm lint:sql` | PASS | `Found 0 issues in 9 files` |
| `pnpm build` | PASS | `/admin/action-log`·`/admin/archive` 포함 라우트 정상 생성 |
| `pnpm test:unit` | PASS | 52 files / 509 tests |
| `pnpm test:integration` | PASS | 24 files / 691 tests(신규 action-log-query 10 + archive 8케이스) |
| `pnpm test:e2e`(전체 스위트, 1회차) | **1 failed** | `archive.spec.ts`가 토스트 대기 15000ms 타임아웃으로 실패, `corp-cards.spec.ts`가 기존에 알려진 중복 라벨 데이터로 실패 — 아래 Issues Encountered에 원인·조치 기록 |
| `pnpm test:e2e`(전체 스위트, 2회차·최종) | PASS | 86/86 |
| `pnpm test`(세 계층 순차, 최종 재실행) | PASS | 509+691+86, exit 0 |
| `git diff package.json` | 새 스크립트 없음, 신규 dependency 줄 0건 | Task 1 옵션 A 요구 그대로 |
| `commits: 13` | `git rev-list --count 01ee33d..HEAD` 실측 | |

## Issues Encountered

**`test/e2e/archive.spec.ts`가 전체 스위트 1회차 실행에서 두 가지 다른 방식으로 간헐 실패했고, 근본 원인을 조사해 테스트 자체를 고쳤다.**

1. **1차 증상:** 「복원됨」 토스트가 기본 5000ms 안에 나타나지 않음 → 15000ms로 늘림
2. **2차 증상(15000ms로도 재현):** 복원 후 "보관함이 비어 있습니다"가 15초 폴링 내내 한 번도 나타나지 않음. `psql`로 조사한 결과 `roles` 표에 `archived_at IS NOT NULL`인 행이 26개 있었고, 전부 `permissions-grid.spec.ts`(03-04, 세로 스크롤 회귀 테스트)가 임시로 만든 `role-e2e-vscroll-*` 계급이었다 — 그 스펙은 하드 DELETE 대신 의도적으로 보관 처리한다(이름 UNIQUE 충돌을 다음 로컬 실행에서 피하기 위해, 그 스펙 자신의 `listRoles()` 호출은 보관 계급을 기본 제외하므로 자신에게는 무해하다는 전제). 이 세션 안에서 `permissions-grid.spec.ts`가 이미 실행된 뒤로는, 새로 만든 보관함 화면(모든 마스터 표를 가로질러 보여줌)이 그 26개를 항상 함께 보여줘 전역 보관함이 다시는 비지 않는다
   - **판단:** 내 코드의 결함이 아니라 공유·비초기화 로컬 `erp_test` DB의 환경 사실이다(03-REVIEW-BATCH.md에 이미 "e2e 워커 격리 — Phase 4 첫 작업으로 미룬다"로 기록된 것과 같은 근본 원인 계열: 단일 DB 공유 + 워커별 초기화 부재). `permissions-grid.spec.ts`는 이 플랜의 파일 목록 밖이라 고치지 않는다
   - **조치:** `archive.spec.ts`의 단언을 "전역 보관함이 빈다"에서 "내가 만든 항목이 사라진다"로 좁혔다(`6fe4fc5`). EMPTY 렌더의 "다음 한 수 없음" 요건은 이미 정적 검사가 담당하므로 커버리지 손실 없음
3. **`corp-cards.spec.ts`(사전 존재, 이 플랜 무관) 동시 실패:** 이 세션 중 내가 같은 스펙을 여러 번 수동으로 재실행하면서 하드코딩된 라벨("개인카드1"/"팀카드1", 이슈어·뒤4자리만 유니크)의 중복 행이 `erp_test`에 누적돼 strict-mode 충돌을 일으켰다 — 코드 결함이 아니라 내 반복 수동 실행이 남긴 테스트 데이터라 `DELETE FROM corp_cards WHERE label IN ('개인카드1','팀카드1')`로 정리했다(스펙 파일 자체는 건드리지 않음, 이미 03-REVIEW-BATCH.md가 이 스펙 계열을 알려진 플레이크로 기록해 둠)
   - **정리 후 전체 스위트 2회차 재실행 = 86/86 PASS**, 격리 실행(`archive.spec.ts` 단독 3회 연속) = 3/3 PASS로 재확인

그 외 문제는 위 Deviations에서 전부 해소됐다.

## User Setup Required

**Deviation 7(`scripts/deploy.sh` 32바이트 수정)에 대해 배포 전 사람이 확인해야 하는 항목:**

이미 배포된 staging·prod의 `app-data-key-v1-{env}` 시크릿은 옛 48바이트 값을 그대로 갖고 있고, `deploy.sh`를 다시 돌려도 `_ensure_secret`이 ENABLED 버전을 재생성하지 않아 고쳐지지 않는다. `docs/OPERATIONS.md` §9에 남긴 절차대로:

```bash
openssl rand -base64 32 | gcloud secrets versions add app-data-key-v1-staging --project="$PROJECT" --data-file=-
openssl rand -base64 32 | gcloud secrets versions add app-data-key-v1-prod    --project="$PROJECT" --data-file=-
```

옛 48바이트 버전으로는 애초에 `encrypt()`가 실행된 적이 없으므로(fail-closed) 잃을 데이터가 없다 — 새 버전 추가만 하면 되고, 옛 버전을 지울 필요도 없다.

## Next Phase Readiness

- `domain/action-log`의 조회·필터·내보내기 계약이 향후 페이즈의 감사 화면(있다면)이 재사용할 수 있는 정본이다
- `ARCHIVABLE_TABLES`에 새 마스터 표를 한 줄 추가하면(`listArchived` 클로저 포함) 보관함이 자동으로 따라온다는 규약이 이 플랜에서 실제로 7종 전부에 대해 증명됐다 — Phase 4 이후 새 마스터 표를 만들 때 그대로 반복하면 된다
- `domain/people/archivePerson` + `revokeAllSessions` + 로그인 거부 패턴은 향후 "계정 정지"류 기능이 그대로 재사용할 수 있는 계약이다
- Phase 3의 마지막 플랜이다 — `git diff package.json`이 전체 페이즈에 걸쳐 최소한으로 유지됐고(이 플랜 자체는 0줄), `ARCHIVABLE_TABLES`·`DTO_REGISTRY`·`EXPORT_REGISTRY`·`ACTION_REGISTRY` 네 레지스트리가 각각 이 플랜의 항목들로 확장된 상태로 Phase 4에 인계된다

---
*Phase: 03-permissions-settings-masters*
*Completed: 2026-09-21*

## Self-Check: PASSED

- 22개 핵심 신규 파일(action-log domain 3·마이그레이션 1·단위/통합/e2e 테스트 6·action-log 화면 5·archive 화면 5·배포 키 길이 테스트 1·Task 1 결정 기록 1) 전부 `[ -f ]`로 존재 확인
- 13개 커밋 해시(`a34235d`·`8552826`·`bfb5429`·`e40675f`·`6655692`·`cee05dd`·`e9e64eb`·`05ec647`·`e547ff0`·`44a41d0`·`a970fc8`·`2b7b8b4`·`6fe4fc5`) 전부 `git log --oneline --all`에서 확인
- 플랜 레벨 `<verification>` 전 항목과 각 태스크의 acceptance criteria를 재실행해 위 "게이트 결과" 표와 일치 확인. `pnpm test`(세 계층) 최종 재실행 exit 0(509+691+86). `commits: 13`은 `git rev-list --count 01ee33d..HEAD` 실측값
