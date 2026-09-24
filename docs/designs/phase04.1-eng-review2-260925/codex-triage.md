# Codex Plan-Review 재검증 (04.1) — 1차 교차검증

## A2-01 — 월차 11일 소멸 전 숨김(입사 다음 해 조회)
- 인용 확인: `04.1-03-PLAN.md:37` "월차 줄(ENG-11 · D4)은 조회 기준일이 근속 첫 1년(입사일 ~ 입사일+1년 전날) 안이거나 조회 연도에 월차 적립이 하나라도 있으면 존재하고 … 그 밖(근속 1년 지나고 그 해 적립 없음)이면 월차 줄이 없다(DTO `monthly` = null)" — 사실.
- 재현: 2026-01-01 입사자는 k=1..11 적립이 전부 2026년 안에 끝나(1~11월 적립일), 근속 첫 1년도 2026-01-01~2026-12-31로 2027엔 이미 지남. 2027년 조회는 "그 해 적립 없음 + 첫해 아님" 조건에 걸려 월차 줄이 사라지지만, 소멸일은 입사 다음 해 12-31 = 2027-12-31이라 아직 유효 잔액이 있을 수 있다. Codex 주장 그대로 재현됨.
- 기존 처리 여부: `round2-brief.md:39`에 "C-F02(VALIDATION 월차 「숨김」)"이 있으나 Codex 자신이 "기존 '적립 0일 표시' 지적과 다른 반례다"라고 구분함(월차-03-PLAN 텍스트에도 반영 안 됨). 04.1-03/04 문서 전체에서 "조회 연도에 유효한 부여가 남아있는지"를 존재 조건에 넣는 문구 없음.
- **판정: 확인(실제 문제, 계획에 대응 없음)** — 존재 조건에 "조회 연도에 유효(미소멸)한 부여 존재"를 추가해야 함.

## A2-02 — 입사일·퇴직일 동시 수정 시 교차검증 경합
- 인용 확인: `04.1-03-PLAN.md` ① "`db/schema/auth.ts` `users`에 `hire_date`·`resignation_date`(date 문자열 모드, null 허용) 두 열을 **추가만** 한다" — CHECK 제약 없음. `db/schema/auth.ts:8` 기존 스키마에 이 두 열 없음(추가 전제 확인).
- ④ "`setHireDate` · `setResignationDate`(… 퇴직일 ≥ 입사일 검증 …)" — 각 함수가 자기 입력값과 "현재 DB의 상대 열 값"을 따로 읽어 비교하는 애플리케이션 레벨 검증으로 보이며, 두 함수가 동시에 각각의 옛 상대값으로 통과할 race가 이론상 가능. DB에 두 값이 모두 있을 때의 `resignation_date >= hire_date` CHECK 없음.
- 기존 처리 여부: revision 문서 전체에서 hire/resignation CHECK 제약 또는 동시 수정 경합 테스트 언급 없음(grep 0건).
- **판정: 확인(실제 문제, 계획에 대응 없음)** — WARNING 등급이라 blocking은 아니지만 04.1-03에 CHECK + 경합 테스트 보완 필요.

## B-NEW01 — 결재선 이력값 취소(cancelHistorizedValue) 경로에 날짜 검증 없음
- 인용 확인:
  - `domain/settings/registry.ts:172-197`(`cancelHistorizedValue`): `const today = dateOnly(new Date()); if (effectiveFrom <= today) { throw new FutureCancelOnlyError(...) }` — **문자열 대소 비교만**, 날짜 형식 검증 전혀 없음. `dateOnly(new Date())`는 `new Date()`(서버 로컬/UTC) 기준이며 주입 가능한 `now`가 없음(`registry.ts:75`의 조회 경로는 `deps?.asOf`를 받지만 취소 경로는 받지 않음).
  - `app/(app)/admin/settings/actions.ts:43-50`(`cancelHistorizedSettingAction`): 스키마가 `z.object({ key: z.string().min(1), effectiveFrom: z.string().min(1) })` — 형식 검증 없이 임의 문자열을 그대로 `cancelHistorizedValue`에 전달.
  - `04.1-04-PLAN.md:42` 근처(effectiveFromRule 관련 truths)는 `addHistorizedValue`/`importSettings` 두 저장 경로에 `validateEffectiveFrom` 강제를 명시하지만, **취소 경로는 언급 없음**.
- 기존 처리 여부: revision 문서(codex-final*.md, round2-brief.md 등) 전체 grep 0건. 04.1-04 plan 본문에도 "일반 저장 `addHistorizedValue`… 와 설정 JSON 가져오기 `importSettings` **두 경로 모두**"라고 명시적으로 두 경로만 언급 — 취소가 빠져 있음이 계획 텍스트 자체로 확인됨.
- **04.1이 이 경로를 건드리는지**: `cancelHistorizedValue`/`registry.ts:172`와 `settings/actions.ts:43`(`cancelHistorizedSettingAction`)은 04.1 이전부터 존재하는 기존 코드(Phase 3 소산으로 보임, 파일 내 주석에 "적용 시작일이 미래"만 언급, `year_start` 규칙과 무관하게 범용 이력값 취소 함수). 04.1-04는 `addHistorizedValue`/`importSettings` 두 경로에 새 `validateEffectiveFrom(year_start 등)`을 추가하지만 `cancelHistorizedValue`는 **수정 대상 목록에 없음**. 즉: 취소 경로 자체는 04.1 이전부터 있던 기존 동작(pre-existing)이나, 04.1-04가 "지난 연도 보호"를 도입하면서 같은 종류의 보호가 취소 경로에는 빠진 것 — 04.1 스코프의 **누락**(새로 만든 지난 연도 보호 조치를 취소 경로까지 일관 적용하지 않음)으로 봐야 함.
- **판정: 확인(실제 문제, 계획에 대응 없음)** — BLOCKER 등급 타당. 취소 액션에도 날짜 정규형 검증 + 서울 기준 `today` 주입을 추가해야 함.

## B-NEW02 — org_unit_id 형식 미검증으로 신규 신청 INSERT 실패 가능
- 인용 확인:
  - `04.1-01-PLAN.md:298`(schema) — `approval_steps`의 `scope_target_id uuid null` (DB 컬럼 타입 uuid).
  - `04.1-01-PLAN.md:308`(keys) — `org_unit_id`는 `z.string() + dynamicOptions "org_units"` — **uuid 형식 검증 없음**, 단순 문자열.
  - `domain/settings/export.ts` import 경로: 비이력형 키는 `const parsed = def.schema.safeParse(raw)` (=z.string()) 뒤 그대로 `simple.push(...)` → `repositories/settings.ts`의 `applySettingsImport`(단순 upsert, uuid 검증 없음)로 저장.
- 재현: JSON 가져오기로 `org_unit_id`에 `"not-a-uuid"`를 넣으면 통과 후 DB에 저장됨. 이후 그 단계가 켜지고 조직범위가 특정 부서(org_unit)로 설정되어 있으면, 제출 시 `approval_steps.scope_target_id`(uuid 컬럼)에 이 값을 넣으려다 DB 레벨에서 INSERT 실패 → 신규 신청 전체가 막힘.
- 기존 처리 여부: revision 문서 grep 0건. B-NEW02가 지적한 "없는 부서=빈 자리" 가정은 04.1-04 `probed_fallback` "계획 가정 2: 동적 옵션 값의 서버 측 존재 검증은 하지 않는다 — 없는 id는 결재 엔진에서 빈 자리가 되어 건너뛰거나 대표에게 간다"에 있으나, 이는 "존재하지만 없어진 uuid"만 가정한 것이고 "**형식 자체가 uuid가 아닌 문자열**"의 경우는 다루지 않음 — Codex 지적이 이 가정의 허점을 정확히 짚음.
- **판정: 확인(실제 문제, 계획에 대응 없음)** — BLOCKER 타당. `org_unit_id` 스키마에 uuid 형식 검증(빈 문자열 또는 uuid만 허용)을 추가하고 가져오기 형식 오류 시 전체 거부를 검증해야 함.

## B-NEW03 — 본문·version 비원자적 조회로 반려→재신청 경합
- 인용 확인: `04.1-02-PLAN.md:228` 근처 `getApprovalView`(버전·행동목록), `04.1-05-PLAN.md:277`대 `getLeave`(본문)를 문서 상세 페이지가 각각 별도 호출로 읽음(예: `05:277` 앞뒤에 `getLeave`가 null이면 notFound, 결재선/버전은 `getApprovalView`가 별도로 계산 — `04.1-02-PLAN.md:298-305` `getApprovalView`도 자체 스냅숏).
- 두 조회가 원자적 단일 스냅숏이라는 명시적 계약(예: 트랜잭션 격리 수준 명시, 같은 SELECT로 본문+version 동시 조회)은 plan 텍스트에서 찾지 못함. 04.1-01 `approveDocument`는 트랜잭션 내부에서 version을 재확인하므로 **승인 자체의 최종 안전성**(잘못된 version이면 conflict)은 보장되지만, "화면에 보여지는 본문 A와 승인 시점 version이 실제로 같은 문서 상태를 가리키는가"의 표시 계약은 없음.
- 기존 처리 여부: revision 문서 grep 0건. Codex 스스로도 "해당 조회 구현이 아직 없어 참고로 둔다"고 낮은 확신으로 분류.
- **판정: 확인(실제 문제이나 근거는 약함/참고 등급)** — 재신청 사이 경합을 막는 결정적 테스트나 동일 스냅숏 계약이 계획에 없는 것은 사실이나, `approveDocument`의 트랜잭션 내 version 재검증이 실제 데이터 손상은 막는다(화면 표시 지연 문제에 가까움). Codex 자신의 "참고" 등급이 타당해 보임.

## C-N01 — 06 플랜이 퇴직일을 먼저 읽을 계약이 없음
- 인용 확인:
  - `domain/people/index.ts:46-54`(`PersonDto`): `id, name, email, roleId, roleName, archivedAt, currentTeamId, currentTeamName` — **hireDate/resignationDate 필드 없음**. `PERSON_DTO_SPEC`(59행대)도 이 8개 필드만 투영.
  - `04.1-06-PLAN.md:337` 부근(섹션 연도를 퇴직일로 정하는 로직)과 `04.1-03-PLAN.md:217`(잔고 DTO가 조회 연도(fiscalYear)를 필수 입력으로 요구 — `getMyLeaveBalance(viewer, {fiscalYear?})` 류)이 실제로 존재.
- 기존 처리 여부: revision 문서에서 `PersonDto`/`getPerson` 언급 0건 — 새 지적.
- **판정: 확인(실제 문제, 계획에 대응 없음)** — BLOCKER 타당. 06 플랜은 관리자 사람 상세에서 퇴직일을 먼저 읽어 섹션 연도를 정해야 하는데, 그 값을 실어나를 DTO/조회 경로가 명시돼 있지 않음(04.1-03이 `LEAVE_BALANCE_DTO_SPEC`에 입사일·퇴직일을 두긴 하나, 이는 잔고 DTO이지 "잔고 조회 전에 연도를 정하기 위한" 선행 조회가 아님 — 순서 계약 자체가 빠짐).

## C-N02 — 마이그레이션 최종 검증이 빈 DB 재구축에 치우침
- 인용 확인:
  - `scripts/migrate-runner.ts:54`(`await migrate(db, { migrationsFolder: ... })`) — drizzle-orm의 `migrate()`는 내부적으로 journal(`drizzle_migrations` 등 적용 이력 테이블) 대비 **미적용분만** 순차 적용하는 증분 방식이며, 배포 시(운영 DB) 기존 데이터·이력 위에서 도는 게 맞음(코드상 스키마 전체 재생성이나 DROP은 하지 않음) — 즉 **운영 배포 경로는 실제로 증분 마이그레이션을 수행**.
  - `04.1-07-PLAN.md` ④ "빈 DB 증명은 **실제로 빈** `erp_test`에서 한다: `pnpm db:reset:test && … pnpm db:migrate`" · ⑤ "병합 트레이서: `pnpm db:reset:test` 뒤 …" — 검증 단계가 전부 빈 DB(reset) 기준.
  - `test/e2e/global-setup.ts:46`(`resetTestSchema`) — "매 실행을 빈 erp_test에서 시작한다"(스키마 DROP/CREATE) — E2E도 항상 빈 스키마에서 시작.
- 기존 단계(01/03의 마이그레이션 검증)도 grep 결과 "기존 데이터 보존 + 재실행 무변경" 검증 문구가 revision 문서에 없음(A2-01 인용문 근처에서 "A-F02=C-F04(01·03 마이그레이션 검증도 db:generate 종료 코드)"만 언급 — db:generate 종료 코드 검사이지 기존 행 보존 검증이 아님).
- **판정: 확인(실제 문제, 계획에 대응 없음)** — WARNING 타당. 운영 배포 경로(`migrate-runner.ts`)는 실제로 증분 적용을 하지만(코드상 안전), **이 페이즈의 테스트/검증 전부가 빈 DB 재구축만 커버**하여 "기존 이력·데이터 보존 + 재실행 무변화"를 증명하는 단계가 07-PLAN에도, 그 이전 어떤 04.1 플랜에도 없음. 기존에 이를 테스트하는 phase도 찾지 못함(grep 0건).

## 종합
- 막는(BLOCKER) 문제로 확인됨: A2-02(WARNING이지만 실질), B-NEW01, B-NEW02, C-N01 — 전부 "확인(계획에 대응 없음)".
- A2-01: 확인, 존재 조건 로직 결함.
- B-NEW03: 확인이나 근거 약함(화면 표시 경합, 데이터 무결성은 트랜잭션이 보호).
- C-N02: 확인, 검증 커버리지 결함(운영 코드 자체는 증분 적용이 맞게 동작함).
- 이미 처리됨/중복으로 판정된 항목 없음 — 7건 전부 신규이며 revision 문서(codex-final*, round2-brief, tests-01-and-open-notes 등)에 대응 문구를 찾지 못함.
