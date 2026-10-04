---
phase: quick-261001-hfi
plan: 01
type: execute
wave: 1
depends_on: []
risk: migration-permissions
files_modified:
  - "db/schema/holidays.ts"
  - "db/migrations/0021_holidays_archive.sql"
  - "db/migrations/meta/0021_snapshot.json"
  - "db/migrations/meta/_journal.json"
  - "repositories/holidays.ts"
  - "domain/permissions/scope-for.ts"
  - "test/integration/holidays.test.ts"
  - "test/integration/migration-upgrade.test.ts"
  - "test/unit/permissions/scope-for.test.ts"
  - "domain/holidays/admin.ts"
  - "repositories/archive.ts"
  - "domain/archive/index.ts"
  - "test/integration/holidays-admin.test.ts"
  - "test/integration/archive.test.ts"
  - "domain/settings/registry.ts"
  - "repositories/settings.ts"
  - "test/integration/settings.test.ts"
  - "test/unit/settings/registry.test.ts"
  - "app/(app)/admin/holidays/actions.ts"
  - "app/(app)/admin/holidays/actions.registry.ts"
  - "app/(app)/admin/holidays/delete-undo.tsx"
  - "app/(app)/admin/holidays/delete-holiday.tsx"
  - "app/(app)/admin/archive/actions.ts"
  - "app/(app)/admin/archive/archive-table.tsx"
  - "test/unit/holidays/holiday-undo.test.ts"
  - "test/unit/archive-revalidate.test.ts"
  - "test/e2e/holidays.spec.ts"
  - "docs/design/checks/2026-10-01-공휴일-보관함.md"
  - "app/(app)/admin/code-tables/page.tsx"
  - "domain/projects/references.ts"
  - "app/(app)/projects/[id]/page.tsx"
  - "app/(app)/projects/[id]/quote-table.tsx"
  - "test/integration/project-form-references-subcategories.test.ts"
  - "test/e2e/code-tables.spec.ts"
  - "test/e2e/quote-readonly-labels.spec.ts"
  - "docs/design/checks/2026-10-01-견적-분류-코드표.md"
  - "docs/design/DECISIONS.md"
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
autonomous: true
requirements: [QUICK-261001-hfi, ADMN-12, MAST-04, OPS-05, ADMN-10]

estimate:
  tokens: 330000
  raw_tokens: 330000
  tasks: 4
  confidence: low

must_haves:
  truths:
    - "(D-01 · ADMN-12) 공휴일 화면에서 임시·선거 공휴일을 삭제하면 행이 물리 삭제되지 않고 보관된다(archived_at · archived_by). 같은 달력 잠금 트랜잭션에서 대체공휴일 재계산과 holiday_change op delete 로그(항상 켜짐, D-4220)가 함께 남고, 로그가 실패하면 보관도 되돌아간다"
    - "(D-01) 보관된 공휴일은 영업일 계산(isBusinessDayKst · addBusinessDaysKst) · 대체일 배정(findBlockingDates) · 공휴일 목록 · 연도 목록 · 날짜 중복 판정 어디에서도 공휴일로 잡히지 않는다. 같은 날짜에 공휴일을 다시 넣을 수 있다(부분 유일 인덱스 holidays_date_active_key)"
    - "(D-01) 보관함 화면에 「공휴일」 항목(이름 = `날짜 이름`)이 보이고, 보관함 「복원」과 공휴일 화면 결과 줄 「되돌리기」 둘 다 같은 행(같은 id)을 되살린다 — 재계산 + holiday_change op restore 로그가 같은 트랜잭션. 오늘·지난 날짜이거나 그 날짜에 다른 공휴일이 있으면 복원이 거부되고 이유가 화면에 한 줄로 보인다"
    - "(D-01) 범용 archive()로 공휴일을 보관하려 하면 ProtectedRowError — 공휴일 보관은 재계산을 지나는 deleteHoliday로만 한다. 보관함 경로 복원은 admin.archive 쓰기 + admin.holidays 쓰기를 둘 다 요구한다"
    - "(ADMN-12 예외 · 사용자 결정 2026-10-01) 미래 설정값 취소는 행 삭제와 settings_change 로그(detail cancelled 참)를 한 트랜잭션에서 한다 — 로그가 실패하면 예정값도 남고, 취소할 예정값이 없으면 오류이며 로그를 남기지 않는다. 미래 발령 취소는 85g에서 이미 같은 모양(document_delete, 같은 tx)이다. ADMN-12 문구에 「아직 적용되지 않은 예약의 취소는 삭제가 아니며 행동 로그로 남는다」 예외가 들어가고 ADMN-12가 근거와 함께 완료 표시된다"
    - "(D-02 i · MAST-04) 코드표 관리 화면에 「견적 분류」 선택지(quote_subcategory)가 생겨 추가·수정·비활성화·보관이 된다. 비활성·보관한 분류는 견적 표의 새 줄 선택지에서 빠지지만 기존 견적 줄의 그룹 머리글 · 소분류 칸에는 코드 값이 아니라 이름으로 계속 보인다"
    - "(D-02 ii · D-03 · D-04 · D-05) REQUIREMENTS.md · ROADMAP.md: MAST-05(Phase 6) · OPS-08(Phase 5) · OPS-09(Phase 6) · OPS-10(Phase 9) · OPS-11(Phase 10) 신설, MAST-04 · OPS-05 문구 갱신(정리 = 조건 삭제, 주민등록번호 열람은 CERT-02), ADMN-10의 대표 계정 404는 Phase 7 전 메뉴 권한 검수 확정 항목, v1 91개 91/91 매핑. `roadmap validate` 경고 0"
    - "위험 경로(db/schema · db/migrations · domain/permissions) 변경은 커밋 A 하나에만 있고, 커밋 A까지만 담은 로컬 브랜치 quick/phase23-gaps-2-risk가 있다(PR① — 사용자 머지). 나머지 커밋은 위험 경로를 건드리지 않는다(PR② — 무인 머지 가능)"
  artifacts:
    - path: "db/migrations/0021_holidays_archive.sql"
      provides: "holidays.archived_at · archived_by 추가, holidays_date_key 제거, 부분 유일 인덱스 holidays_date_active_key(date) WHERE archived_at IS NULL — 첫 줄 rollback-floor 표식 + SET LOCAL 타임아웃 한 쌍"
      contains: "rollback-floor"
    - path: "repositories/holidays.ts"
      provides: "모든 읽기에 archived_at IS NULL, ON CONFLICT에 부분 인덱스 술어, archiveHolidayById · restoreHolidayById · findHolidayById · listArchivedHolidays · deleteSubstituteById(대체 행만 물리 삭제)"
      contains: "isNull(holidays.archivedAt)"
    - path: "domain/holidays/admin.ts"
      provides: "deleteHoliday = 보관, restoreHoliday(viewer, id, deps) — 잠금 · 게이트 · 보관 해제 · 재계산 · op restore 로그를 한 트랜잭션"
      contains: "restoreHoliday"
    - path: "repositories/archive.ts"
      provides: "ARCHIVABLE_TABLES의 holiday 항목(label 공휴일, isProtected 참)"
      contains: "entity: \"holiday\""
    - path: "domain/archive/index.ts"
      provides: "DOMAIN_RESTORERS.holiday → restoreHoliday"
      contains: "holiday:"
    - path: "domain/settings/registry.ts"
      provides: "cancelHistorizedValue — withTransaction 안에서 deleteFutureHistorizedValue(..., tx) + recordAction(settings_change, { tx }), 지운 행이 없으면 FutureValueNotFoundError"
      contains: "withTransaction"
    - path: "app/(app)/admin/holidays/actions.ts"
      provides: "restoreHolidayAction({ id }) — 거부 사유는 루트 _errors"
      contains: "restoreHolidayAction"
    - path: "app/(app)/admin/code-tables/page.tsx"
      provides: "TABLE_OPTIONS에 quote_subcategory 「견적 분류」"
      contains: "quote_subcategory"
    - path: "domain/projects/references.ts"
      provides: "subcategoryLabels — 비활성 · 보관 포함 전 분류의 이름(표시 전용), subcategories는 그대로 활성만"
      contains: "subcategoryLabels"
  key_links:
    - from: "domain/holidays/calendar.ts loadHolidayLookup · domain/notify/tick.ts"
      to: "repositories/holidays.ts findHolidayDates"
      via: "archived_at IS NULL 필터 — 보관된 날은 영업일"
      pattern: "isNull\\(holidays.archivedAt\\)"
    - from: "domain/holidays/candidates.ts allocateSubstitutes"
      to: "repositories/holidays.ts findBlockingDates"
      via: "보관된 수동 공휴일이 대체일 자리를 막지 않는다(막으면 2027-10-04형 재계산이 유일 위반으로 보관 자체를 되돌린다)"
      pattern: "findBlockingDates"
    - from: "app/(app)/admin/archive/actions.ts restoreArchivedAction"
      to: "domain/holidays/admin.ts restoreHoliday"
      via: "domain/archive restore() → DOMAIN_RESTORERS.holiday"
      pattern: "DOMAIN_RESTORERS"
    - from: "app/(app)/admin/holidays/delete-undo.tsx 되돌리기"
      to: "app/(app)/admin/holidays/actions.ts restoreHolidayAction"
      via: "삭제 결과의 id로 같은 행 복원(재추가 아님)"
      pattern: "restoreHolidayAction"
    - from: "domain/settings/registry.ts cancelHistorizedValue"
      to: "domain/action-log/record.ts recordAction"
      via: "같은 tx 전달({ tx }) — 기록 실패 시 예정값 삭제도 되돌아감(85g cancelFutureAssignment 선례)"
      pattern: "settings_change"
    - from: "app/(app)/projects/[id]/quote-table.tsx subcategoryLabel"
      to: "domain/projects/references.ts subcategoryLabels"
      via: "app/(app)/projects/[id]/page.tsx가 내려주는 표시 전용 목록"
      pattern: "subcategoryLabels"
---

<objective>
Phase 2·3 요구사항 갭 남은 몫(사용자 결정 D-01~D-05, 2026-10-01)을 닫는다.

1. ADMN-12(D-01) — 공휴일 삭제를 보관함으로. 공휴일 표를 기존 보관 체계(ARCHIVABLE_TABLES · scope-for 등록 · domain/archive 복원 경로)에 넣고, 삭제(보관) · 복원을 행동 로그에 남긴다. 남은 예약 취소 두 경로는 사용자 결정(2026-10-01)대로 ADMN-12 문구의 예외로 두고, 미래 설정값 취소의 로그를 삭제와 같은 트랜잭션으로 묶는다(미래 발령 취소는 85g에서 이미 그렇다).
2. MAST-04(D-02 i) — 견적 분류 코드표(데이터는 이미 있음)를 코드표 관리 화면 선택지에 넣는다. 이 화면으로 분류를 처음 비활성·보관할 수 있게 되므로, 기존 견적 줄이 코드 값으로 보이는 회귀를 같은 묶음에서 막는다.
3. 요구사항 분리(D-02 ii · D-03 · D-04 · D-05) — MAST-05 · OPS-08~11 신설, MAST-04 · OPS-05 문구 갱신, ADMN-10 대표 404를 Phase 7 확정 항목으로, 추적표 · 커버리지 86 → 91.

Purpose: 「지우지 않는다」 원칙의 마지막 사용자 대상 물리 삭제 중 하나(공휴일)를 없애고, 감사 기록 요구사항을 실제 페이즈 경계와 맞춘다. `risk:` 플랜이다 — 마이그레이션 · 스키마 · domain/permissions를 건드린다. 실행자 Opus + Opus 독립 검토 1명(CLAUDE.md §4 Build), 화면 플랜이라 독립 DOM 감사(§6).
Output: 여섯 커밋 — A(위험 경로, PR①) · B1 · B2 · C1 · C2 · D(PR②, PR① 위에 쌓음). 작업마다 RED → GREEN 기록. 마이그레이션 0021은 사용자 승인(2026-10-01, 단일 마이그레이션) — PR① 본문과 SUMMARY에 「프로덕션 승격은 업무 시간 밖」을 적는다.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.claude/rules/tests.md

범위 밖(건드리지 않는다): MAST-01 · MAST-02(메모만), ADMN-10 코드 수정(D-04 — Phase 7 확정 항목으로 문서화만), 지급 방식 코드표 값 · 화면(D-02 ii — Phase 6), OPS-08~11의 구현(각 페이즈), 예약 취소 두 경로를 보관함으로 옮기는 일(사용자 결정 — 예외로 둔다), settings_change · document_delete를 항상 켜짐으로 바꾸는 일(요청 없음), 코드표 tableKey 허용 목록 부재(기존 — 메모만), 이 목록 밖의 리팩터.

**커밋 · PR 나누기(반드시 이 순서와 경계):**
- 커밋 A(Task 1) = 위험 경로 전부 + 그 위에서 main이 올바르게 돌기 위한 repositories/holidays.ts 호환 수정 + 테스트. A 직후 `git branch quick/phase23-gaps-2-risk HEAD`(로컬만, 푸시하지 않음 — 푸시 · PR은 오케스트레이터).
- 커밋 B1 · B2 · C1 · C2 · D(Task 2~4)는 `quick/phase23-gaps-2`에 이어서. db/schema · db/migrations · domain/permissions · domain/auth · lib/crypto* · .github/workflows · infra · .claude/ 를 건드리지 않는다.
- PR① = `quick/phase23-gaps-2-risk` → main(사용자 머지 · 본문에 「0021 단일 마이그레이션 사용자 승인 2026-10-01 · ARCHITECTURE §5 예외 · rollback-floor · 프로덕션 승격은 업무 시간 밖」). PR② = `quick/phase23-gaps-2` → base `quick/phase23-gaps-2-risk`(쌓음). PR①이 머지되고 스테이징이 초록이 된 뒤 PR② base를 main으로 바꾸고 origin/main을 머지 커밋으로 반영한다(force push 금지).
- 마이그레이션 번호가 PR #88 등과 겹치면 내 것을 지우고 `pnpm db:generate --name holidays_archive`로 다시 만든 뒤 머리 주석을 다시 단다(CLAUDE.md 세션 운영).

**가정(SUMMARY에 그대로 옮긴다):**
- A-1 결과 줄 「되돌리기」는 방금 지운 사람의 즉시 취소다 — 보관함 복원과 같은 restoreHoliday를 부르고 권한은 admin.holidays 쓰기. 보관함 화면 경로는 여기에 admin.archive 쓰기가 더해진다(ADMN-12 「관리자만 보관함에서 복원」).
- A-2 로그 종류는 범용 archive/restore가 아니라 holiday_change(항상 켜짐, D-4220)를 쓰고 detail.op는 삭제 = "delete"(사용자 행동 이름 유지 — 기존 테스트 · 로그와 연속), 복원 = "restore".
- A-3 공휴일 관리 화면 목록은 보관 행을 보이지 않는다(보관 행은 보관함 화면에만) — 코드표 목록이 보관함 열람자에게 「보관됨」 행을 보이는 것과 다르다. 공휴일은 날짜 계산 데이터라 한 화면에 섞으면 「쉬는 날인가」를 다시 판단하게 된다.
- A-4 scope-for 등록(holiday → admin.holidays)은 D-01 대로 같은 규약(새 마스터 표는 한 줄)을 따른 것이며 지금 소비처는 없다.
- A-5 대체공휴일 행의 물리 삭제(재계산 deleteFutureSubstitutes · 추가/복원 시 그 날짜 대체 행 제거)는 규칙에서 다시 만들어지는 파생 데이터라 ADMN-12 대상이 아니다.
- A-6 결과 줄 문구 「{날짜} {이름} 삭제됨」 · 2단계 삭제 확인 문구는 바꾸지 않는다.
- A-7 「견적 대분류」는 별도 표가 없다 — D-62(04-CONTEXT) 「대분류 = 그룹 머리글, 소분류에서 파생」. 코드표 하나(quote_subcategory)가 둘 다를 정하므로 선택지 이름은 「견적 분류」.
- A-8 domain/system-status는 공휴일 표를 읽지 않는다(formatKstMinute만) — 실측. 공휴일 읽기는 repositories/holidays.ts 한 파일뿐이고 import하는 곳은 domain/holidays/{admin,candidates,calendar}.ts와 테스트다.
- A-9 예약 취소 로그 종류는 지금 그대로 — 설정값 취소 settings_change, 발령 취소 document_delete. 둘 다 선택 종류(기본 켜짐)라 관리자가 행동 로그 설정에서 끄면 남지 않는다. 항상 켜짐으로 바꾸는 것은 요청 범위 밖이다(필요하면 후속).

**ADMN-12 물리 삭제 감사(실측, 2026-10-01 a034f25):**

| 경로 | 사용자 행동? | 이 quick 뒤 |
|---|---|---|
| 공휴일 수동 삭제 deleteHoliday → deleteHolidayById | 예 | 보관(Task 1~3) |
| 대체공휴일 재계산 deleteFutureSubstitutes · 추가/복원 시 대체 행 제거 | 아니오(파생) | 물리 유지(A-5) |
| 설정 미래 예정값 취소 cancelHistorizedValue → repositories/settings.ts deleteFutureHistorizedValue | 예(예약 취소) | ADMN-12 예외(R9). 지금은 삭제 뒤 별도 문장으로 settings_change를 남기고 지운 행이 없어도 기록한다 → Task 2 B2가 같은 tx + 없으면 오류로 고친다 |
| 미래 팀 발령 취소 cancelFutureAssignment → repositories/team-memberships.ts deleteMembership | 예(예약 취소) | ADMN-12 예외(R9). document_delete 같은 tx · 없으면 NotFoundError — 85g e10cf57에서 이미 됨 |
| 행동 로그 정리 pruneActionLog | 예 | 삭제 아님(pruned_at 표시) |
| better-auth 세션 삭제 · 리저브 ledger.delete(메모리 Map) | 아니오 | 업무 데이터 아님 |

→ 사용자 결정(2026-10-01): 예약 취소는 삭제가 아니다(R9 예외). 공휴일 보관 · 설정값 취소 같은 tx 로그가 검증되면 ADMN-12를 Task 4에서 근거와 함께 완료 표시한다.

**문구 표(Task 4가 그대로 쓴다 — 앞뒤 공백 · 구두점 그대로):**

REQUIREMENTS.md
- R1 22행 MAST-04 본문 → `견적 대분류·소분류, 프로젝트 상태 같은 코드표를 관리 화면에서 추가·수정·비활성화한다 (2026-10-01: 지급 방식 코드표는 MAST-05로 분리)`
- R2 MAST-04 줄 바로 아래 새 줄 → `- [ ] **MAST-05**: 지급 방식 코드표를 관리 화면에서 추가·수정·비활성화한다. 값은 Phase 6 계획에서 정한다 (2026-10-01 MAST-04에서 분리)`
- R3 114행 ADMN-10 본문 끝에 덧붙임 → ` (2026-10-01: 새 배포 직후 대표 계정이 행동 로그 화면에서 404를 받는 문제 — 계급 기본 권한 — 는 Phase 7 전 메뉴 권한 검수의 확정 항목)`
- R4 131행 OPS-05 본문 → `직원 계정별 핵심 행동만 로그로 남긴다: 로그인, 문서 생성·삭제, 설정·권한 변경. 단순 조회·화면 이동 같은 잡음은 남기지 않는다. 관리자는 로그를 정리(조건 삭제)할 수 있고 감사 기록 자체는 고치지 않는다. Excel 내보내기와 마스킹 해제는 설정으로 끌 수 없는 핵심 로그다 (2026-10-01 분리: 문서 제출·승인·반려·회수 → OPS-08, 지급·구매 처리 → OPS-09, 손익 열람 → OPS-10, 인센티브 열람 → OPS-11, 주민등록번호 열람 기록 → CERT-02)`
- R5 OPS-07 줄 바로 아래 새 네 줄:
  `- [ ] **OPS-08**: 문서 제출·승인·반려·회수를 핵심 행동 로그로 남긴다 (2026-10-01 OPS-05에서 분리)`
  `- [ ] **OPS-09**: 지급·구매 처리를 핵심 행동 로그로 남긴다 (2026-10-01 OPS-05에서 분리)`
  `- [ ] **OPS-10**: 손익 열람을 민감 정보 열람 로그로 남긴다 (2026-10-01 OPS-05에서 분리)`
  `- [ ] **OPS-11**: 인센티브 열람을 민감 정보 열람 로그로 남긴다 (2026-10-01 OPS-05에서 분리)`
- R6 추적표: `| MAST-04 | Phase 3 | Gaps Found |` 아래 `| MAST-05 | Phase 6 | Pending |`, `| OPS-07 | Phase 1 | Complete |` 아래 `| OPS-08 | Phase 5 | Pending |` · `| OPS-09 | Phase 6 | Pending |` · `| OPS-10 | Phase 9 | Pending |` · `| OPS-11 | Phase 10 | Pending |` 네 줄. ADMN-10 행 → `| ADMN-10 | Phase 3 (새 배포 직후 대표 계정의 행동 로그 화면 404 — 계급 기본 권한 — 는 Phase 7 전 메뉴 권한 검수 확정 항목, 2026-10-01) | Gaps Found |`(OPS-06 행의 괄호 주석 선례).
- R7 커버리지: `- v1 requirements: 91 total (2026-09-23: MIG-01~03 → Out of Scope, 89 → 86; 2026-10-01: MAST-05 · OPS-08~11 분리 추가, 86 → 91)` · `- Mapped to phases: 91` · `**By phase:** 1 (9) · 2 (1) · 3 (13) · 4 (11) · 04.1 (5) · 04.2 (4) · 04.4 (1) · 5 (9) · 6 (12) · 7 (3) · 8 (2) · 9 (11) · 10 (6) · 11 (4)`
- R8 꼬리말: `*2026-09-24: ...*` 줄 바로 아래 → `*2026-10-01: quick 261001-hfi — 지급 방식 코드표 MAST-04 → MAST-05(Phase 6), OPS-05에서 문서 제출·승인·반려·회수(OPS-08 · Phase 5) · 지급·구매 처리(OPS-09 · Phase 6) · 손익 열람(OPS-10 · Phase 9) · 인센티브 열람(OPS-11 · Phase 10) 분리, 주민등록번호 열람 기록은 CERT-02. OPS-05 로그 정리는 조건 삭제(감사 기록 수정 없음). ADMN-12에 예약 취소 예외. ADMN-10 대표 404 → Phase 7 확정 항목. v1 86 → 91 (91/91 mapped)*`
- R9 116행 ADMN-12 본문 끝에 덧붙임(사용자 결정 2026-10-01). 고치기 전 줄 = `- [ ] **ADMN-12**: "지우지 않는다": 사용자가 무엇을 삭제해도 보관함으로 이동하며, 관리자만 보관함에서 보고 복원할 수 있다. 삭제·복원은 행동 로그에 남는다` → 고친 뒤 줄 = `- [ ] **ADMN-12**: "지우지 않는다": 사용자가 무엇을 삭제해도 보관함으로 이동하며, 관리자만 보관함에서 보고 복원할 수 있다. 삭제·복원은 행동 로그에 남는다. 아직 적용되지 않은 예약(미래 설정값·미래 발령)의 취소는 삭제가 아니며 행동 로그로 남는다 (2026-10-01 사용자 결정)`(체크 표시는 mark-complete가 바꾼다 — 손으로 [x] 하지 않는다)

ROADMAP.md
- M1 Phase 5 `**Requirements**:` 줄 끝에 `, OPS-08` · Phase 6 줄 끝에 `, MAST-05, OPS-09` · Phase 9 줄 끝에 `, OPS-10` · Phase 10 줄 끝에 `, OPS-11`
- M2 Phase 3 성공 기준 6(158행)의 `관리자가 정리할 수 있다` → `관리자가 정리(조건 삭제)할 수 있다(감사 기록 자체는 고치지 않는다)`, 같은 줄의 `관리자만 보고 복원한다.` → `관리자만 보고 복원한다(아직 적용되지 않은 예약의 취소는 삭제가 아니며 행동 로그로 남는다).`
- M3 Phase 7 성공 기준 5(740행) 마지막 문장 뒤에 덧붙임 → ` 새 배포 직후 대표 계정이 행동 로그 화면에서 404를 받는 문제(계급 기본 권한 — ADMN-10 갭, 2026-10-01 사용자 결정)도 이 검수의 확정 항목이다`
- M4 Coverage 첫 문단 → `v1 요구사항 91개 전부가 정확히 한 페이즈에 속한다(2026-09-23: 데이터 이전 제외로 MIG-01~03을 Out of Scope로 옮겨 89 → 86; 2026-10-01: MAST-05 · OPS-08~11 분리 추가로 86 → 91). v2(NOTI-05, AUTH-05, CERT-05)는 어느 페이즈에도 없다.`
- M5 Coverage 표: 5 행 `| 5 | 9 | ..., UX-06, OPS-08 |` · 6 행 `| 6 | 12 | ..., PROJ-06, MAST-05, OPS-09 |` · 9 행 `| 9 | 11 | ..., RSV-02, OPS-10 |` · 10 행 `| 10 | 6 | ..., ADMN-07, OPS-11 |` · `| **Total** | **91** | |` · 하드 제약 9 → `9. 91/91 매핑, v2 미매핑 ✓`
- 15행(CEO 리뷰 반영 문단의 역사 기록 「86개」)은 고치지 않는다.

<interfaces>
선례(그대로 따른다):
- 보관 칸: `archivedAt: timestamp("archived_at")` · `archivedBy: text("archived_by")`(FK 없음) — db/schema의 vendors · code-items 등. 보관 = `.set({ archivedAt: new Date(), archivedBy: viewer.id }).where(and(eq(id), isNull(archivedAt)))` RETURNING, 복원 = `.set({ archivedAt: null, archivedBy: null }).where(and(eq(id), isNotNull(archivedAt)))`(repositories/vendors.ts).
- Drizzle 0.45: `onConflictDoNothing({ target: holidays.date, where: isNull(holidays.archivedAt) })` → `ON CONFLICT (date) WHERE archived_at IS NULL DO NOTHING`(부분 유일 인덱스 추론 — 술어 없으면 Postgres가 부분 인덱스를 추론하지 못해 오류). 스키마 쪽은 `uniqueIndex("holidays_date_active_key").on(table.date).where(sql\`${table.archivedAt} is null\`)` — 저장소에 uniqueIndex 선례가 없으므로 생성된 SQL을 눈으로 확인하고 통합 테스트로 추론을 고정한다.
- 마이그레이션 머리: 0015 첫 여섯 줄 — `-- rollback-floor: <이유>` 첫 줄(scripts/rollback.sh가 가장 새 표식을 하한으로 쓴다), 이유 · ARCHITECTURE §5 「확장 전용」 예외 설명 주석, `SET LOCAL lock_timeout = '1s';` · `SET LOCAL statement_timeout = '5s';` 각각 뒤 `--> statement-breakpoint`. drizzle migrate()는 대기 마이그레이션 전부를 한 트랜잭션에서 돈다. .squawk.toml은 require-concurrent-index-creation 등을 이미 제외한다.
- repositories/holidays.ts(262행): insertHolidayRows 93 · insertSubstituteRows 112 · deleteFutureSubstitutes 126 · findHolidayDates 145 · findBlockingDates 159 · listHolidaysForYear 189 · listHolidayYears 203 · insertManualHoliday 238 · findHolidayByDate 252 · deleteHolidayById 258.
- domain/holidays/admin.ts: addHoliday 226(잠금 안에서 ensureHolidayCandidatesLocked → findHolidayByDate: 대체 행이면 deleteHolidayById, 아니면 DuplicateHolidayError → insertManualHoliday → recompute(해-1) → holiday_change op add `{ tx }`), deleteHoliday 283(지운 행이 규칙 행 · 오늘 이전이면 HolidayNotDeletableError로 트랜잭션째 되돌림, 이미 없으면 `{ deleted: false }`). 오류 클래스는 UserFacingError 상속 — lib/actions/handle-server-error.ts가 메시지를 그대로 serverError로 낸다.
- domain/archive/index.ts: archive()는 isProtected면 ProtectedRowError, restore()는 assertCanWrite(admin.archive) 뒤 DOMAIN_RESTORERS[entity] 있으면 통째로 위임 — 시그니처 `(viewer, id, deps?: Partial<ArchiveDeps>) => Promise<void>`(quote_line · reserve_entry 선례).
- repositories/archive.ts: ArchivableEntry `{ entity, label, setArchived, findById, isProtected?, listArchived }` — reserve_entry 항목(196-219행)이 「범용 보관 금지 + 도메인 복원」 선례. holiday_change 로그는 이미 entity "holiday"를 쓴다.
- domain/permissions/scope-for.ts ENTITY_MENUS: 한 줄 추가 규약(code_items → admin.code-tables 등).
- app/(app)/admin/holidays/delete-undo.tsx: undoFailure(result)가 `validationErrors.date._errors[0]`의 「 · 」 앞부분을 원인으로 `되돌리기 실패 · {원인}`(retry 거짓), 그 밖은 `되돌리기 실패 · 다시 시도`(retry 참). handleUndo가 지금은 addHolidayAction(removed)을 다시 부른다.
- app/(app)/admin/archive/archive-table.tsx: RestoreButton onError → `복원 · 실패 · 다시 시도` 토스트(원인 무시). restoreArchivedAction은 /admin/holidays를 revalidate하지 않는다.
- app/(app)/admin/code-tables/page.tsx 22-26행 TABLE_OPTIONS(project_status · evidence_type) · DEFAULT_TABLE_KEY project_status, nav aria-label 「코드표 선택」, tableKey는 TABLE_OPTIONS로 검증.
- domain/projects/references.ts 85-115행: subcategories = quote_subcategory 활성 · 미보관만(includeInactive false · includeArchived false). 소비처: app/(app)/projects/[id]/page.tsx 248행(QuoteTable subcategories) · 271행(읽기 전용 references) → quote-table.tsx 1634행 subcategoryLabel(그룹 머리글 1655 · 시트 제목 2489), 1869행 · 2334행이 previous-revision.tsx의 QuoteLineReadReferences.subcategories로 넘김(이 파일은 라벨에만 쓴다 — 49 · 203행). 선택지 · 기본값은 1283 · 1391 · 1662 · 1881 · 1934행 — 이 다섯 곳은 활성 목록을 그대로 쓴다.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 공휴일 보관 칸 · 부분 유일 인덱스 · 모든 읽기에서 보관 제외 (커밋 A · 위험 경로 · PR①)</name>
  <files>db/schema/holidays.ts, db/migrations/0021_holidays_archive.sql, db/migrations/meta/0021_snapshot.json, db/migrations/meta/_journal.json, repositories/holidays.ts, domain/permissions/scope-for.ts, test/integration/holidays.test.ts, test/integration/migration-upgrade.test.ts, test/unit/permissions/scope-for.test.ts</files>
  <precondition>로컬 Postgres(erp_test)가 떠 있다 — `pnpm db:dev`. 다른 DB · Playwright 작업이 동시에 돌고 있지 않다(.claude/rules/tests.md).</precondition>
  <reversibility rating="costly">holidays_date_key DROP과 rollback-floor — 이 마이그레이션 아래 리비전으로 되돌리려면 역 SQL과 쓰기 중단이 필요하다. 사용자가 단일 마이그레이션으로 승인(2026-10-01) — 프로덕션 승격은 업무 시간 밖.</reversibility>
  <read_first>
    db/schema/holidays.ts (전체)
    db/schema/vendors.ts 의 archivedAt · archivedBy 두 줄(보관 칸 선례)
    db/migrations/0015_*.sql 첫 10행(머리 주석 · SET LOCAL 선례)
    repositories/holidays.ts 1-56행(readWithin · 잠금) · 93-262행
    test/integration/holidays.test.ts 1-60행(픽스처 · import) · 220-360행(수동 행 삭제를 쓰는 테스트)
    test/integration/migration-upgrade.test.ts 238-330행(0015 · 0016 「옛 데이터 위 적용」 describe)
    domain/permissions/scope-for.ts 의 ENTITY_MENUS · test/unit/permissions/scope-for.test.ts 의 엔티티별 케이스 하나
  </read_first>
  <behavior>
    - h1: 임시 공휴일 행을 raw update로 보관(archived_at 채움)하면 findHolidayDates · listHolidaysForYear · findHolidayByDate가 그 행을 돌려주지 않고, 그 해에 보관 행만 있으면 listHolidayYears에도 그 해가 없다
    - h2: 보관된 임시 공휴일 날짜는 findBlockingDates의 manual에 없다. 그 날짜(평일)에 isBusinessDayKst가 참이다
    - h3: 같은 날짜로 insertManualHoliday가 성공(true)한다 — 활성 행이 있으면 지금처럼 false(ON CONFLICT 부분 인덱스 추론)
    - h4: insertHolidayRows도 같은 술어로 활성 중복만 건너뛴다(보관 행과 같은 날짜 법정 행은 들어간다)
    - h5(migration-upgrade): 0021 직전 스키마에 공휴일 행을 넣고 0021을 적용하면 행 수 · 값이 그대로이고 archived_at이 NULL, 제약 holidays_date_key가 없고 부분 유일 인덱스 holidays_date_active_key가 있다. 활성 행 두 개 같은 날짜 삽입은 유일 위반, 한쪽이 보관이면 성공
    - s1(scope-for 단위): scopeFor(viewer, "holiday")는 admin.holidays 보기 권한으로 판정하고 includeArchived = admin.archive 보기 여부 — 다른 엔티티 케이스와 같은 모양
  </behavior>
  <action>
    먼저 Skill `test-driven-development`를 호출한다.

    RED:
    (a) test/integration/holidays.test.ts에 describe 「보관된 공휴일은 공휴일이 아니다(ADMN-12 · D-01)」 — 고유 날짜의 임시 공휴일을 insertManualHoliday로 넣고 db.update(holidays).set({ archivedAt: new Date() })로 보관한 뒤 h1~h4. 날짜는 기존 테스트와 겹치지 않는 먼 해를 고른다(공유 DB).
    (b) test/integration/migration-upgrade.test.ts에 0015 · 0016 describe 모양 그대로 「공휴일 보관 칸 · 부분 유일 인덱스(0021)」 describe 하나 — h5. 인덱스 · 제약 존재는 pg_indexes · pg_constraint 조회로 단언.
    (c) test/unit/permissions/scope-for.test.ts에 s1.
    (d) 세 파일을 돌려 의도한 이유(archived_at 칼럼 없음 · 엔티티 미등록)로 실패하는지 확인하고 출력 요약을 SUMMARY에 남긴다.

    GREEN:
    - db/schema/holidays.ts: archivedAt · archivedBy 두 칸을 선례 그대로 더하고, `unique("holidays_date_key").on(table.date)`를 `uniqueIndex("holidays_date_active_key").on(table.date).where(sql\`${table.archivedAt} is null\`)`로 바꾼다(D-01 — 보관 행이 날짜를 붙잡으면 재계산이 그 날짜에 대체일을 놓다가 유일 위반으로 보관 자체를 되돌리고, 같은 날짜 재추가도 막힌다). check 두 개는 그대로.
    - `pnpm db:generate --name holidays_archive`로만 SQL을 만든다(손으로 쓰지 않는다). 생성된 파일 맨 위에 0015 선례대로 머리 주석을 붙인다: 첫 줄 `-- rollback-floor: 0021 holidays_date_key 제거 — 직전 리비전의 ON CONFLICT (date)가 부분 인덱스를 추론하지 못하고 보관 행을 공휴일로 읽는다`, 다음 줄들에 quick 261001-hfi · D-01 · ARCHITECTURE §5 「확장 전용」 예외 한 건 · 근거 문서(DECISIONS.md 2026-10-01 261001-hfi 항목, PR②) 설명, 그다음 SET LOCAL 두 줄(각각 `--> statement-breakpoint`). 생성된 SQL에 ADD COLUMN 두 개 · DROP CONSTRAINT holidays_date_key · CREATE UNIQUE INDEX ... WHERE 가 있는지 확인한다. `pnpm lint:sql` 초록(새 경고를 squawk-ignore로 덮어야 하면 그 이유를 같은 줄 주석으로 — 선례 파일 방식).
    - repositories/holidays.ts(호환 수정 — 이 커밋에 있어야 PR① 머지 직후 main이 맞다): insertHolidayRows · insertManualHoliday의 onConflictDoNothing에 `where: isNull(holidays.archivedAt)`; findHolidayDates · findBlockingDates · listHolidaysForYear · listHolidayYears · findHolidayByDate의 where에 `isNull(holidays.archivedAt)`를 and로 더한다. deleteFutureSubstitutes · insertSubstituteRows · deleteHolidayById는 이 커밋에서 바꾸지 않는다(Task 2).
    - domain/permissions/scope-for.ts ENTITY_MENUS에 `holiday: "admin.holidays"` 한 줄(D-01 · A-4). 주석은 더하지 않는다.

    커밋 전: Skill `verification-before-completion`을 호출하고 아래 verify를 실제로 돌려 통과 출력을 확인한다. `git diff --stat`에 app/ · ui/ · domain/holidays · domain/archive가 없는지 본다.
    커밋 A: 제목 `feat: archive columns and partial unique date index for holidays`, 본문 한국어(D-01 · 부분 유일 인덱스 이유 · rollback-floor · 호환 수정 범위 · 위험 경로 PR① 분리). 커밋 직후 `git branch quick/phase23-gaps-2-risk HEAD`(푸시하지 않는다).
  </action>
  <verify>
    <automated>pnpm lint:sql && pnpm vitest run --project integration test/integration/holidays.test.ts test/integration/holidays-admin.test.ts test/integration/migration-upgrade.test.ts test/integration/notify-tick.test.ts && pnpm vitest run --project unit test/unit/permissions/scope-for.test.ts && pnpm typecheck && pnpm lint</automated>
  </verify>
  <done>h1~h5 · s1 통과, 기존 holidays · holidays-admin · notify-tick 통합이 그대로 초록, lint:sql · typecheck · lint 초록. 0021 첫 줄이 rollback-floor. 커밋 A 하나에 위험 경로 변경이 전부 있고, 커밋 뒤 `test "$(git rev-parse quick/phase23-gaps-2-risk)" = "$(git rev-parse HEAD)"`가 참이다.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 공휴일 삭제 = 보관, restoreHoliday, 보관함 등록(커밋 B1) + 미래 설정값 취소 로그를 같은 트랜잭션으로(커밋 B2) · PR②</name>
  <files>repositories/holidays.ts, domain/holidays/admin.ts, repositories/archive.ts, domain/archive/index.ts, test/integration/holidays-admin.test.ts, test/integration/holidays.test.ts, test/integration/archive.test.ts, domain/settings/registry.ts, repositories/settings.ts, test/integration/settings.test.ts, test/unit/settings/registry.test.ts</files>
  <read_first>
    domain/holidays/admin.ts 190-315행(오류 클래스 · addHoliday · deleteHoliday)
    domain/holidays/candidates.ts 20-120행(withHolidayCalendarLock · allocateSubstitutes · recomputeFutureSubstitutes)
    repositories/archive.ts 26-60행 · 196-235행(reserve_entry 선례)
    domain/archive/index.ts 40-100행
    test/integration/holidays-admin.test.ts 1-80행(createViewer · createViewOnlyViewer · NOW_0924) · 240-260행(op 로그 조회 도우미) · 472행~ deleteHoliday describe
    test/integration/archive.test.ts 의 restore · listArchive 케이스 하나씩
    domain/settings/registry.ts 101-112행(RegistryDeps) · 224-261행(cancelHistorizedValue) · repositories/settings.ts 85-98행(deleteFutureHistorizedValue)
    domain/org/index.ts 279-315행(85g cancelFutureAssignment — 같은 tx 선례) · lib/db-transaction.ts withTransaction
    test/unit/settings/registry.test.ts 175-245행 · test/integration/settings.test.ts 105-130행(취소 케이스)
  </read_first>
  <behavior>
    - d1: deleteHoliday(내일 이후 임시 공휴일) → `{ deleted: true, id, date, name, kind }`, 행은 남고 archived_at · archived_by(viewer.id)가 채워짐, holiday_change op delete 로그 한 건(entity holiday, entityId = id)
    - d2: 기존 deleteHoliday 케이스(규칙 행 · 오늘 이전 거부, 동시 중복 삭제 뒤 사람은 `{ deleted: false }` 로그 없음, 로그 실패 시 롤백 = 보관도 안 됨, 2027-10-04 대체일 재배치, 해 경계)가 보관 의미로 그대로 통과
    - r1: restoreHoliday(보관된 내일 이후 임시 공휴일) → `{ restored: true }`, archived_at · archived_by가 NULL, 재계산으로 대체일이 원래 자리로, holiday_change op restore 로그 한 건 — 같은 트랜잭션(로그 실패 시 복원도 롤백)
    - r2: 이미 활성인 행 · 없는 id → `{ restored: false }` 로그 없음(동시 중복 복원 포함)
    - r3: 날짜가 오늘 이전 → HolidayNotRestorableError 「오늘·지난 날짜 · 복원 불가」, 그 날짜에 활성 수동 · 법정 공휴일 → HolidayNotRestorableError 「이미 공휴일({이름}) · 복원 불가」, 그 날짜의 활성 행이 대체공휴일이면 그 대체 행을 지우고 복원 후 재계산으로 대체일이 다음 빈 날로
    - r4: admin.holidays 쓰기 없음 → HolidayForbiddenError(보기 전용 viewer)
    - a1: 범용 archive(viewer, "holiday", id) → ProtectedRowError. restore(viewer, "holiday", id)는 admin.archive 쓰기 없으면 ForbiddenError, 있으면 restoreHoliday에 위임(r1과 같은 결과 · 같은 로그)
    - a2: listArchive가 보관된 공휴일을 entity holiday · label 「공휴일」 · name `{날짜} {이름}`으로 돌려준다
    - a3: 보관 뒤 같은 날짜 addHoliday 성공 → 그 뒤 옛 행 복원은 r3 중복 거부
    - s1(통합 settings, B2): 미래 예정값 취소 → 그 행이 없어지고 settings_change(entity settings_historized, detail { key, effectiveFrom, cancelled: true }) 로그 한 건
    - s2(통합, B2): recordAction이 던지도록 주입하면 취소가 실패하고 예정값 행이 그대로 남는다(같은 트랜잭션)
    - s3(통합, B2): 없는 미래 예정값 취소 → FutureValueNotFoundError 「취소할 예정값 찾을 수 없음」, 로그 없음(지금은 지운 행이 없어도 기록한다)
    - s4(단위 registry, B2): 기존 거부 케이스(지난 날짜 · 비이력형 · 권한 없음)는 그대로 삭제 · 로그를 부르지 않는다. 성공 케이스는 deleteFutureHistorizedValue가 tx와 함께, recordAction이 `{ tx }`와 함께 불린다
  </behavior>
  <action>
    먼저 Skill `test-driven-development`를 호출한다.

    RED: holidays-admin.test.ts deleteHoliday describe의 단언을 「행이 사라짐」에서 「행이 남고 보관됨」으로 바꾸고(d1 · d2), restoreHoliday describe(r1~r4 · a3)를 새로 둔다. archive.test.ts에 a1 · a2. holidays.test.ts의 수동 행 deleteHolidayById 사용처(225 · 266 · 301 · 350행 근처)는 아래 이름 변경에 맞춰 archiveHolidayById로 바꾼다. 돌려서 의도한 이유(행이 지워짐 · restoreHoliday 없음 · holiday 미등록)로 실패하는지 확인하고 요약을 SUMMARY에 남긴다.

    GREEN:
    - repositories/holidays.ts: findHolidayById(보관 여부 무관) · archiveHolidayById(viewer, id, tx) — 미보관 조건부 UPDATE RETURNING, 없으면 null · restoreHolidayById(viewer, id, tx) — 보관 조건부 UPDATE RETURNING, 없으면 null · listArchivedHolidays(viewer) — 보관 행의 id · `${date} ${name}` · archivedAt · archivedBy. deleteHolidayById는 deleteSubstituteById로 이름을 바꾸고 where에 kind = 'substitute'를 더한다(ADMN-12 — 수동 공휴일을 물리 삭제하는 함수가 남지 않게, A-5).
    - domain/holidays/admin.ts deleteHoliday(D-01): deleteHolidayById 자리에 archiveHolidayById. 거부 판정 · 재계산 · 로그(op "delete", A-2)는 그대로, 결과에 id를 더한다(`DeleteHolidayResult`의 deleted 참 쪽에 id). addHoliday의 대체 행 제거는 deleteSubstituteById. 머리 주석의 「지우고」 「addHoliday를 다시 부른다」 두 표현만 보관 · restoreHoliday로 고친다.
    - 새 오류 클래스 HolidayNotRestorableError(UserFacingError). 새 restoreHoliday(viewer, id, deps?: HolidayWriteDeps): Promise<{ restored: boolean }> — admin.holidays 쓰기 아니면 HolidayForbiddenError → withHolidayCalendarLock 안에서 findHolidayById(없거나 보관 아님 → `{ restored: false }`) → date ≤ today면 거부(r3 문구) → findHolidayByDate(활성): 대체 행이면 deleteSubstituteById, 그 밖이면 거부(r3 문구) → restoreHolidayById(null이면 `{ restored: false }`) → recompute(해-1, { today }, tx) → recordAction holiday_change `{ op: "restore", date, name, kind }` `{ tx }` → `{ restored: true }`. 문구는 명사형 한 줄(CLAUDE.md §7).
    - repositories/archive.ts ARCHIVABLE_TABLES 끝에 holiday 항목(reserve_entry 모양): label 「공휴일」, setArchived는 value에 따라 archiveHolidayById · restoreHolidayById(그 결과는 버린다), findById = findHolidayById, isProtected() 참(보관은 재계산을 지나는 deleteHoliday로만), listArchived = listArchivedHolidays를 entity holiday · label 「공휴일」로 매핑. 바로 위에 reserve_entry처럼 한 줄 근거 주석.
    - domain/archive/index.ts DOMAIN_RESTORERS에 `holiday: async (viewer, id, deps) => { await restoreHoliday(viewer, id, { recordAction: deps?.recordAction }); }` — 보관함 경로는 restore()의 admin.archive 쓰기 + restoreHoliday의 admin.holidays 쓰기 둘 다(A-1).

    커밋 전: Skill `verification-before-completion` 호출, 아래 verify의 공휴일 · 보관함 부분 실제 실행. `git diff --stat`에 위험 경로 없음.
    커밋 B1: 제목 `feat: holiday delete archives and restores through the archive`, 본문 한국어(D-01 · ADMN-12 · 대체 행만 물리 삭제 · 가정 A-1 · A-2 · A-5).

    — 커밋 B2 (ADMN-12 예외의 전제 · 사용자 결정 2026-10-01) — 실측: cancelHistorizedValue는 deleteFutureHistorizedValue(db 직접) 뒤 별도 문장으로 recordAction을 부른다 — 같은 트랜잭션이 아니고, 지운 행이 없어도 기록한다.
    RED: s1~s3을 test/integration/settings.test.ts 취소 케이스 옆에, s4를 test/unit/settings/registry.test.ts 기존 cancel describe에(성공 케이스의 호출 단언을 tx 포함으로). 돌려서 s2(행이 지워진 채 남음) · s3(로그가 남음) · s4(tx 없음)가 의도한 이유로 실패하는지 확인하고 요약을 SUMMARY에 남긴다.
    GREEN(85g cancelFutureAssignment 모양 그대로):
    - repositories/settings.ts deleteFutureHistorizedValue(viewer, key, effectiveFrom, tx: DbOrTx = db): Promise<boolean> — RETURNING으로 지운 행이 있었는지 돌려준다.
    - domain/settings/registry.ts: 새 오류 클래스 FutureValueNotFoundError(UserFacingError, 문구 「취소할 예정값 찾을 수 없음」). cancelHistorizedValue의 기존 검증(종류 · 권한 · 적용 시작일 규칙 · 미래만)은 그대로 두고, 그 뒤 삭제와 기록을 withTransaction 안으로 — 지운 행이 없으면 FutureValueNotFoundError(트랜잭션째 되돌림), 있으면 같은 actionType · entity · detail로 recordAction(..., { tx }). 단위 테스트가 DB 없이 돌도록 RegistryDeps에 withTransaction 주입 자리를 더한다(기본값 lib/db-transaction의 withTransaction). 함수 머리에 85g와 같은 한 줄 근거 주석.
    - app/(app)/admin/settings/actions.ts는 고치지 않는다(UserFacingError 문구가 serverError로 그대로 간다).
    커밋 전: Skill `verification-before-completion` 호출, 아래 verify 전체 실제 실행.
    커밋 B2: 제목 `fix: log future setting cancel in the same transaction`, 본문 한국어(ADMN-12 예약 취소 예외의 전제 · 85g 발령 취소와 같은 모양 · 지운 행 없으면 오류 · A-9).
  </action>
  <verify>
    <automated>pnpm vitest run --project integration test/integration/holidays-admin.test.ts test/integration/holidays.test.ts test/integration/archive.test.ts test/integration/action-log.test.ts test/integration/settings.test.ts test/integration/settings-export.test.ts && pnpm vitest run --project unit test/unit/settings/registry.test.ts && pnpm typecheck && pnpm lint && CHANGED="$(git diff --name-only quick/phase23-gaps-2-risk)" && ! printf '%s\n' "$CHANGED" | grep -qE '^(db/|domain/permissions/|domain/auth/|lib/crypto|\.github/workflows/|infra/|\.claude/)'</automated>
  </verify>
  <done>d1 · d2 · r1~r4 · a1~a3 · s1~s4 통과, 기존 holidays · archive · action-log · settings · settings-export 초록, typecheck · lint 초록. 수동 공휴일을 물리 삭제하는 리포지토리 함수가 없다(deleteSubstituteById는 kind substitute만). 미래 설정값 취소와 그 로그가 한 트랜잭션. 커밋 B1 · B2 두 개, 위험 경로 diff 없음.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 공휴일 「되돌리기」 = 복원, 보관함 화면에 공휴일 (커밋 C1 · PR② · 화면)</name>
  <files>app/(app)/admin/holidays/actions.ts, app/(app)/admin/holidays/actions.registry.ts, app/(app)/admin/holidays/delete-undo.tsx, app/(app)/admin/holidays/delete-holiday.tsx, app/(app)/admin/archive/actions.ts, app/(app)/admin/archive/archive-table.tsx, test/unit/holidays/holiday-undo.test.ts, test/unit/archive-revalidate.test.ts, test/e2e/holidays.spec.ts, docs/design/checks/2026-10-01-공휴일-보관함.md</files>
  <read_first>
    .claude/skills/design-gate/SKILL.md (Skill로 호출 — 읽기 목록은 스킬이 정한다)
    app/(app)/admin/holidays/actions.ts · actions.registry.ts · delete-undo.tsx · delete-holiday.tsx (전체)
    app/(app)/admin/archive/actions.ts · archive-table.tsx 60-120행
    test/unit/holidays/holiday-undo.test.ts · test/unit/archive-revalidate.test.ts (전체)
    test/e2e/holidays.spec.ts 1-60행(픽스처 · 로그인) · 326행~ 삭제/되돌리기 describe
  </read_first>
  <behavior>
    - u1(단위 holiday-undo): 되돌리기가 restoreHolidayAction({ id })를 부른다(addHolidayAction이 아니다). 루트 `validationErrors._errors[0]` = 「이미 공휴일(개천절) · 복원 불가」면 `되돌리기 실패 · 이미 공휴일(개천절)` retry 거짓, serverError만 있으면 `되돌리기 실패 · 다시 시도` retry 참
    - u2(단위 archive-revalidate): deleteHoliday · restoreHoliday를 부르는 액션도 revalidatePath("/admin/archive")를 부른다. restoreArchivedAction은 revalidatePath("/admin/holidays")를 부른다
    - e1(E2E): 내일 이후 임시 공휴일 삭제 → 결과 줄 「{날짜} {이름} 삭제됨」 → /admin/archive에 「공휴일」 · `{날짜} {이름}` 행 → /admin/holidays로 돌아가 「되돌리기」 → 같은 이름 행이 목록에 다시 있고 보관함에서 사라짐
    - e2(E2E): 삭제 뒤 보관함 화면 「복원」 → 토스트 「복원 · {날짜} {이름} 복원됨」, /admin/holidays 목록에 다시 있음
    - e3(E2E): 지난 날짜로 보관된 공휴일 픽스처(spec이 직접 넣음)를 보관함에서 「복원」 → 오류 토스트 `복원 · 실패 · 오늘·지난 날짜`
  </behavior>
  <action>
    먼저 Skill `test-driven-development`를 호출하고, 화면 파일을 고치기 전에 Skill `design-gate`를 호출해 점검표를 `docs/design/checks/2026-10-01-공휴일-보관함.md`로 복사한다(「화면:」 줄 = app/(app)/admin/holidays · app/(app)/admin/archive). 커밋 전 모든 항목이 근거와 함께 [x]여야 한다(훅이 강제).

    RED: u1 · u2를 단위 테스트에, e1~e3을 holidays.spec.ts 삭제/되돌리기 describe에 쓴다(e3 픽스처는 spec이 리포지토리 · db로 직접 넣고 끝에 지운다 — 기존 픽스처 방식). 단위를 돌려 실패를 확인하고, E2E는 `CI=true`로 한 번 돌려 실패 이유를 SUMMARY에 남긴다.

    GREEN:
    - holidays/actions.ts: restoreHolidayAction = authedActionClient, 스키마 `{ id: z.string().uuid() }`, restoreHoliday 호출, HolidayNotRestorableError는 `returnValidationErrors(schema, { _errors: [message] })`(루트), 결과 그대로 반환, revalidatePath("/admin/holidays") · ("/admin/archive"). deleteHolidayAction에도 revalidatePath("/admin/archive")를 더한다. 「되돌리기는 addHolidayAction을 다시 부른다」는 주석을 restoreHolidayAction 기준으로 고친다.
    - holidays/actions.registry.ts: restoreHolidayAction을 admin.holidays · write · dtoName null로 등록(기존 두 줄 모양).
    - delete-holiday.tsx: show에 결과의 id를 같이 넘긴다. delete-undo.tsx: RemovedHoliday에 id, handleUndo가 restoreHolidayAction({ id: removed.id }), undoFailure가 루트 `_errors[0]`을 읽는다(「 · 」 앞부분 규칙 유지). 결과 줄 문구 · 되돌리기 버튼 · 배치는 바꾸지 않는다(A-6).
    - archive/actions.ts: restoreArchivedAction에 revalidatePath("/admin/holidays"). HolidayNotRestorableError는 holidays 액션과 같은 루트 _errors로 돌려준다.
    - archive-table.tsx RestoreButton: onError에서 루트 `validationErrors._errors[0]`이 있으면 `복원 · 실패 · {「 · 」 앞부분}`, 없으면 지금 문구 그대로. 새 색 · 서체 · radius 없음 — 기존 토스트 tone error.
    - archive-revalidate 단위 테스트의 감지 정규식을 deleteHoliday · restoreHoliday 호출까지 넓힌다.

    화면 검증: 싼 게이트(lint · typecheck · build) → 아래 E2E `CI=true` → SUMMARY에 「DOM 감사 메모: /admin/holidays 결과 줄(삭제됨 · 되돌리기 · 되돌리기 실패 문구), /admin/archive 공휴일 행 · 복원 성공/거부 토스트 — 375 · 320 · 768 · 1280」. 독립 DOM 감사는 오케스트레이터가 별도 에이전트로 돌린다.
    커밋 전: Skill `verification-before-completion` 호출, verify 실제 실행.
    커밋 C1: 제목 `feat: holiday undo restores the archived row`, 본문 한국어(D-01 · 되돌리기 = 같은 행 복원 · 보관함 복원 거부 사유 토스트 · revalidate).
  </action>
  <verify>
    <automated>pnpm vitest run --project unit test/unit/holidays/holiday-undo.test.ts test/unit/archive-revalidate.test.ts && pnpm vitest run --project integration test/integration/leak-scan.test.ts && pnpm typecheck && pnpm lint && pnpm build && CI=true pnpm test:e2e test/e2e/holidays.spec.ts test/e2e/mobile-holidays.spec.ts test/e2e/archive.spec.ts</automated>
  </verify>
  <done>u1 · u2 · e1~e3 통과, archive · mobile-holidays E2E가 CI=true에서 그대로 초록, leak-scan 초록(새 액션 등록). 점검표가 전부 [x]. 커밋 C1 하나, 위험 경로 diff 없음.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: 견적 분류 코드표 선택지 + 비활성 분류 이름 유지(커밋 C2), 요구사항 분리 문서(커밋 D)</name>
  <files>app/(app)/admin/code-tables/page.tsx, domain/projects/references.ts, app/(app)/projects/[id]/page.tsx, app/(app)/projects/[id]/quote-table.tsx, test/integration/project-form-references-subcategories.test.ts, test/e2e/code-tables.spec.ts, test/e2e/quote-readonly-labels.spec.ts, docs/design/checks/2026-10-01-견적-분류-코드표.md, docs/design/DECISIONS.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md</files>
  <read_first>
    app/(app)/admin/code-tables/page.tsx 1-90행
    domain/projects/references.ts 20-120행 · repositories/code-tables.ts 의 listCodeItems 시그니처와 행의 활성 · 보관 칸 이름
    app/(app)/projects/[id]/page.tsx 240-275행 · quote-table.tsx 940-950행(props 타입) · 1630-1665행 · 1865-1885행 · 2330-2350행
    test/e2e/code-tables.spec.ts 40-70행(링크 두 개 단언) · test/e2e/quote-readonly-labels.spec.ts (전체, 58행)
    test/integration/project-form-references-visibility.test.ts 1-60행(픽스처 선례)
    docs/design/DECISIONS.md 882행~(04-41 §5 예외 기록 모양)
    .planning/REQUIREMENTS.md · .planning/ROADMAP.md — 위 context 「문구 표」의 행만 Grep으로 찾아 범위 Read
  </read_first>
  <behavior>
    - c1(통합): quote_subcategory에 고유 항목 셋(활성 · 비활성 · 보관)을 만들면 listProjectFormReferences의 subcategories에는 활성 하나만, subcategoryLabels에는 셋 다 { value, label }로 있다
    - c2(E2E code-tables): 「코드표 선택」 nav 링크가 셋(프로젝트 상태 · 증빙 종류 · 견적 분류)이고 서로 붙어 있지 않다. 「견적 분류」를 누르면 시드 분류(무대·시공 등)가 보이고 새 항목 추가 · 비활성화가 된다
    - c3(E2E quote-readonly-labels): 고유 분류 항목으로 견적 줄을 저장한 뒤 그 항목을 비활성화하면 프로젝트 상세(편집 가능한 계정)의 그룹 머리글 · 소분류 칸에 코드 값이 아니라 이름이 보이고, 새 줄 소분류 선택지에는 그 항목이 없다. 보기 전용 계급의 읽기 표도 이름을 본다
    - c4(문서): 문구 표 R1~R9 · M1~M5가 정확히 들어가고 `roadmap validate` 경고 0, 이전 문구(지급 방식이 MAST-04 본문에 있는 상태 · OPS-05의 「정리(수정·」 표현)가 REQUIREMENTS.md에 남지 않는다
  </behavior>
  <action>
    먼저 Skill `test-driven-development`를 호출한다. 화면 파일을 고치기 전에 Skill `design-gate`를 호출해 점검표를 `docs/design/checks/2026-10-01-견적-분류-코드표.md`로 복사한다(「화면:」 줄 = app/(app)/admin/code-tables · app/(app)/projects/[id]).

    — 커밋 C2 (D-02 i · MAST-04) —
    RED: c1(새 통합 파일, 픽스처는 project-form-references-visibility 선례 · 고유 이름) · c2(code-tables.spec.ts의 링크 두 개 단언을 세 개로, 연속한 두 링크 쌍마다 간격 단언) · c3(quote-readonly-labels.spec.ts에 test 하나 — 그 파일의 createProject · saveQuoteLines 픽스처 방식, 분류 항목은 고유 값으로 만들고 끝에 보관해 다른 spec에 영향 없게). 돌려서 실패 이유(subcategoryLabels 없음 · 링크 둘 · 코드 값 표시)를 SUMMARY에 남긴다.
    GREEN:
    - code-tables/page.tsx TABLE_OPTIONS 끝에 `{ key: "quote_subcategory", label: "견적 분류" }`(A-7). 기본값 · 순서 앞 두 개는 그대로.
    - domain/projects/references.ts: quote_subcategory를 비활성 · 보관 포함으로 한 번 읽어 subcategories(활성 · 미보관 — 지금과 같은 결과)와 새 subcategoryLabels(전부, CodeOption 모양)로 나눈다. ProjectFormReferences 타입에 subcategoryLabels.
    - projects/[id]/page.tsx: QuoteTable에 subcategoryLabels prop을 더하고, 271행 읽기 전용 references의 subcategories 자리에 references.subcategoryLabels를 넘긴다(previous-revision.tsx는 그 목록을 라벨로만 쓰므로 그 파일은 고치지 않는다).
    - quote-table.tsx: props 타입에 subcategoryLabels, 1634행 subcategoryLabel이 subcategoryLabels에서 찾는다, 1869행 · 2334행이 previous-revision에 넘기는 references의 subcategories 자리에 subcategoryLabels. 선택지 · 기본값 다섯 곳(1283 · 1391 · 1662 · 1881 · 1934)은 활성 subcategories 그대로 둔다.
    - 화면 검증: lint · typecheck · build → 아래 E2E `CI=true`(mobile-code-tables 44×44 · mobile-320 넘침 포함 — 링크 셋이 320에서 넘치면 기존 토큰 · 기존 nav 줄바꿈 규칙으로만 고친다) → SUMMARY 「DOM 감사 메모: /admin/code-tables?tableKey=quote_subcategory 링크 셋 · 목록, /projects/[id] 비활성 분류 줄의 그룹 머리글 · 소분류 칸 · 새 줄 선택지 — 375 · 320 · 768 · 1280」.
    - 커밋 전 Skill `verification-before-completion`, C2 verify 부분 실제 실행. 커밋 C2: 제목 `feat: quote category code table on the code-table admin screen`, 본문 한국어(D-02 i · A-7 D-62 · 비활성 · 보관 분류 이름 유지 이유 — 이 화면으로 처음 비활성화가 가능해져 생기는 회귀를 막음).

    — 커밋 D (D-02 ii · D-03 · D-04 · D-05, 문서만) —
    - .planning/REQUIREMENTS.md · .planning/ROADMAP.md를 context 「문구 표」 R1~R9 · M1~M5 그대로 Edit로 고친다(오케스트레이터 지시 — 해당 gsd-tools 명령이 없다. 표에 없는 줄은 건드리지 않는다).
    - docs/design/DECISIONS.md 끝에 04-41 항목 모양으로 `## 2026-10-01 — quick 261001-hfi ARCHITECTURE §5 예외: holidays_date_key 제거 → 부분 유일 인덱스(공휴일 보관, D-01)` — 결정 · 이유(보관 행이 날짜를 붙잡으면 재계산 · 재추가가 막힘) · rollback-floor 0021 · 되돌리는 법(전진 수정 우선, 불가피하면 쓰기 중단 → 보관 행 처리 → ADD CONSTRAINT holidays_date_key UNIQUE(date) → DROP INDEX holidays_date_active_key, 칼럼은 둔다) · 사용자 승인(2026-10-01, 단일 마이그레이션 — expand/contract 두 단계 대안은 위험 경로 PR이 하나 더 늘어 택하지 않음) · 프로덕션 승격은 업무 시간 밖.
    - `node .claude/gsd-core/bin/gsd-tools.cjs roadmap validate` 경고 0 확인.
    - 완료 표시(이 플랜 frontmatter requirements를 자동으로 전부 표시하지 않는다 — execute-plan의 update_requirements 단계는 아래 규칙으로 대체):
      · OPS-05 → `node .claude/gsd-core/bin/gsd-tools.cjs requirements mark-complete OPS-05`. 그 전에 근거를 Grep으로 확인해 SUMMARY에 파일:행으로 적는다 — recordAction login(domain/auth) · document_create · document_delete · settings_change · permission_change 호출처, ALWAYS_ON_ACTION_TYPES의 excel_export · mask_reveal, pruneActionLog = pruned_at 표시(조건 삭제, 수정 경로 없음), CORE_ACTION_TYPES 레지스트리, test/integration/action-log*.test.ts. 이후 페이즈 문서의 생성 · 삭제 로그는 같은 레지스트리를 쓰고 Phase 7 전 메뉴 검수가 확인한다는 점을 적는다. 하나라도 없으면 표시하지 않고 SUMMARY에 그 사실을 적는다.
      · MAST-04 → mark-complete(사용자 해석 수용 2026-10-01 — 「견적 분류」 한 항목 = quote_subcategory, 대분류 = 그룹 머리글(D-62), 프로젝트 상태 코드표는 Phase 3에 이미 있음). 근거: C2 커밋 · c1~c3 통과 출력 · code-tables/page.tsx TABLE_OPTIONS 세 항목. C2 verify가 초록이 아니면 표시하지 않는다.
      · ADMN-12 → mark-complete(사용자 결정 2026-10-01 — 예약 취소 예외 R9). 근거: 커밋 A · B1 · B2 · C1, d1 · r1 · a1~a3 · s1~s3 · e1~e3 통과 출력, 「ADMN-12 물리 삭제 감사」 최종 표(사용자 대상 물리 삭제 = 예외로 정한 예약 취소 둘뿐, 둘 다 같은 tx 로그). 이 근거 중 하나라도 초록이 아니면 표시하지 않는다.
      · ADMN-10 → 표시하지 않는다(D-04, Phase 7).
      · 순서: R1~R9 · M1~M5 Edit → roadmap validate → mark-complete OPS-05,MAST-04,ADMN-12(근거가 선 것만) → 추적표에서 세 행이 Complete인지 Grep.
    - 커밋 D: 제목 `docs: split phase-specific log and code-table requirements`, 본문 한국어(D-02 ii · D-03 · D-04 · D-05 · ADMN-12 예약 취소 예외 · 86 → 91 · §5 예외 기록 · 완료 표시 결과).
  </action>
  <verify>
    <automated>pnpm vitest run --project integration test/integration/project-form-references-subcategories.test.ts test/integration/project-form-references-visibility.test.ts && pnpm typecheck && pnpm lint && pnpm build && CI=true pnpm test:e2e test/e2e/code-tables.spec.ts test/e2e/mobile-code-tables.spec.ts test/e2e/mobile-320-no-overflow.spec.ts test/e2e/quote-readonly-labels.spec.ts test/e2e/quote-table.spec.ts && node .claude/gsd-core/bin/gsd-tools.cjs roadmap validate | grep -q '"warnings": \[\]' && grep -qF '| MAST-05 | Phase 6 | Pending |' .planning/REQUIREMENTS.md && grep -qF '| OPS-11 | Phase 10 | Pending |' .planning/REQUIREMENTS.md && grep -qF 'v1 requirements: 91 total' .planning/REQUIREMENTS.md && grep -qF '| **Total** | **91** | |' .planning/ROADMAP.md && ! grep -qF '견적 대분류·소분류, 지급 방식' .planning/REQUIREMENTS.md && grep -qF '미래 설정값·미래 발령)의 취소는 삭제가 아니며' .planning/REQUIREMENTS.md</automated>
  </verify>
  <done>c1~c4 통과, code-tables · mobile-code-tables · mobile-320 · quote-readonly-labels · quote-table E2E가 CI=true에서 초록, build 초록, 점검표 전부 [x]. 문서 R1~R9 · M1~M5 반영, roadmap validate 경고 0, OPS-05 · MAST-04 · ADMN-12가 근거와 함께 Complete(ADMN-10은 Gaps Found 유지). 커밋 C2 · D 두 개, 위험 경로 diff 없음.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 브라우저 → Server Action | deleteHolidayAction · restoreHolidayAction · restoreArchivedAction의 id(uuid) — 권한은 서버가 판정 |
| 공휴일 표 → 날짜 계산 | 영업일 · 지급 예정일 · 알림 tick이 공휴일 표를 읽는다(보관 행이 섞이면 날짜가 틀어짐) |
| 배포 → DB 스키마 | 0021이 직전 리비전과 호환되지 않는 구간 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-hfi-01 | Elevation of privilege | restoreHoliday · DOMAIN_RESTORERS.holiday · restoreHolidayAction | high | mitigate | Task 2 — restoreHoliday가 admin.holidays 쓰기를 직접 판정, 보관함 경로는 restore()의 admin.archive 쓰기가 앞에. r4 · a1 테스트가 고정. 액션은 actions.registry.ts 등록 → leak-scan(Task 3) |
| T-hfi-02 | Tampering(데이터 무결성) | repositories/holidays.ts 읽기 다섯 · calendar · notify tick | high | mitigate | Task 1 — 모든 읽기에 archived_at IS NULL, h1 · h2(영업일) · notify-tick 통합 회귀 |
| T-hfi-03 | Repudiation | deleteHoliday · restoreHoliday | medium | mitigate | holiday_change(항상 켜짐, D-4220) op delete/restore를 같은 tx `{ tx }`로, 로그 실패 시 롤백 테스트(d2 · r1) |
| T-hfi-04 | Denial of service | 0021 배포 구간 · 되돌리기 | medium | mitigate | rollback-floor 첫 줄(rollback.sh 하한), lock_timeout 1s · statement_timeout 5s, 작은 표. 잔여(직전 리비전의 공휴일 추가 · 새 해 생성이 배포 몇 분 동안 실패)는 사용자 수용(2026-10-01) — 프로덕션 승격은 업무 시간 밖 |
| T-hfi-05 | Information disclosure | listArchive의 공휴일 이름 | low | accept | 공휴일 이름은 민감 정보가 아니고 보관함은 archive.value 투영(ArchiveEntryDto)을 그대로 지난다 |
| T-hfi-06 | Tampering | 범용 archive()로 재계산 우회 보관 | medium | mitigate | holiday 항목 isProtected 참 → ProtectedRowError(a1) |
| T-hfi-07 | Tampering(경합) | 동시 삭제 · 복원 · 추가 | medium | mitigate | 기존 달력 advisory 잠금 안에서 전부, 조건부 UPDATE로 멱등, 부분 유일 인덱스가 활성 중복의 최종 방어(h3 · h5 · r2 · a3) |
| T-hfi-09 | Repudiation | domain/settings/registry.ts cancelHistorizedValue | medium | mitigate | Task 2 B2 — 예정값 삭제와 settings_change 기록을 한 트랜잭션에, 지운 행이 없으면 오류 · 기록 없음(s1~s3). 잔여: 선택 종류라 설정으로 끌 수 있음(A-9) |
| T-hfi-08 | Information disclosure | subcategoryLabels(비활성 · 보관 분류 이름) | low | accept | 이미 그 분류를 쓴 견적 줄을 보는 사람에게 이름만 — projects 보기 게이트 뒤, 85g T-85g-02와 같은 판단 |
</threat_model>

<verification>
1. 작업별 verify가 모두 초록(작업 중 테스트는 CLAUDE.md §5 「단계에 맞게」 — 바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E만, 전체 통합은 돌리지 않는다. DB · Playwright 작업은 한 번에 하나).
2. PR을 ready로 바꿀 때 한 번: `pnpm build && pnpm test:unit`. 전체 통합 · E2E는 CI가 한 번 돈다.
3. `git diff --name-only origin/main quick/phase23-gaps-2-risk`에 위험 경로 + repositories/holidays.ts + 그 테스트만 있고, `git diff --name-only quick/phase23-gaps-2-risk quick/phase23-gaps-2`에 db/ · domain/permissions/ · domain/auth/ · lib/crypto* · .github/workflows/ · infra/ · .claude/ 가 없다.
4. Post-build(묶음 = PR마다 한 번, 건너뛰지 않는다 — 오케스트레이터가 호출):
   - PR①(위험): Opus 독립 검토 1명 → `/review` → `/ship`(본문에 「0021 단일 마이그레이션 사용자 승인 2026-10-01 · §5 예외 · rollback-floor · 프로덕션 승격은 업무 시간 밖」) → 사용자가 GitHub에서 머지. 스테이징 배포 초록 확인.
   - PR②(코드 + 화면): Opus 독립 검토(같은 risk 플랜) → `/review` → 독립 DOM 감사(CI=true, 별도 에이전트) → `/design-review` → `/qa` → `/cso`(판단: 새 복원 권한 경로 · 외부 입력 id) → `/ship` → §4 머지 조건이 맞으면 세션 머지.
</verification>

<success_criteria>
- 공휴일 삭제가 보관이 되고, 보관함 · 결과 줄 두 경로로 같은 행이 복원되며, 삭제 · 복원이 항상 켜진 행동 로그에 같은 트랜잭션으로 남는다(D-01).
- 미래 설정값 취소가 로그와 같은 트랜잭션이고, ADMN-12에 예약 취소 예외 문구가 들어가 ADMN-12가 근거와 함께 완료된다.
- 보관된 공휴일이 어떤 날짜 계산에도 들어가지 않고 같은 날짜 재추가가 된다.
- 코드표 관리 화면에서 견적 분류를 관리할 수 있고, 비활성 · 보관 분류가 기존 견적 줄에서 이름으로 보인다(D-02 i).
- REQUIREMENTS · ROADMAP이 D-02 ii · D-03 · D-04 · D-05대로 분리되고 91/91 매핑, 완료 표시는 근거가 선 것만(OPS-05 · MAST-04 · ADMN-12, ADMN-10 제외).
- 여섯 커밋(A · B1 · B2 · C1 · C2 · D)이 각각 RED → GREEN 기록과 함께, 위험 경로는 커밋 A에만 — PR①/PR② 분리 가능.
</success_criteria>

<output>
`.planning/quick/261001-hfi-phase-2-3/261001-hfi-SUMMARY.md`를 만든다. 작업별 RED 출력 요약 · GREEN 통과 출력 요약 · 커밋 해시(A는 quick/phase23-gaps-2-risk 끝), 가정 A-1~A-9, ADMN-12 물리 삭제 감사 표(최종), 「DOM 감사 메모」(Task 3 · Task 4), OPS-05 · MAST-04 · ADMN-12 근거(파일:행 · 테스트 출력), 완료 표시 결과, PR① 본문용 한 줄 「0021 단일 마이그레이션 사용자 승인 2026-10-01 · 프로덕션 승격은 업무 시간 밖」, 「열린 결정」(실행 중 새로 생긴 것만 — 사용자 결정 2026-10-01로 앞선 세 건은 닫힘), 후속 메모(예약 취소 로그 종류를 항상 켜짐으로 할지 — A-9, Phase 5 · 6 · 9 · 10 계획이 OPS-08 · MAST-05 · OPS-09 · OPS-10 · OPS-11을 가져가야 함, CERT-02 페이즈 표기 불일치 04.3 ↔ 11, 코드표 tableKey 허용 목록 부재, MAST-01 · MAST-02 범위 밖).
</output>
