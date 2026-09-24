# Phase 04.1 기술 리뷰 2회차 — Codex 원문(2026-09-25 01:57 KST)

## 갈래 A (01·03)

### 새 지적

- [참고] A2-01 — [03:37](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:37), [03:45](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:45) — **소멸하지 않은 월차 11일이 숨겨진다.** 2026-01-01 입사자는 2026년에 적립을 모두 마친다. 2027년에는 근속 첫해도 아니고 당해 적립도 없어 `monthly=null`이지만, 월차는 2027-12-31까지 유효하다. 기존 ‘적립 0일 표시’ 지적과 다른 반례다. — 표시 조건에 **조회 연도에 유효한 월차 부여의 존재**를 포함하고, 1월 입사자의 다음 해 조회·차감 사례를 추가하라. 기존 연차 구현이 없어 계획 근거만으로 참고 분류한다.

- [WARNING] A2-02 — [03:209](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:209), [03:217](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:217), 기존 [db/schema/auth.ts:8](/home/user/ERP_PLANT8_260917/db/schema/auth.ts:8) — **입사일·퇴직일의 교차 검증이 동시 수정에 깨진다.** 기존 값이 입사 1월·퇴직 12월이면, 입사를 10월로 바꾸는 요청과 퇴직을 3월로 바꾸는 요청이 각각 옛 값을 검증해 모두 통과할 수 있다. 계획은 두 열만 추가하고 DB 제약은 두지 않는다. — 두 값이 모두 있을 때 `resignation_date >= hire_date`를 강제하는 CHECK와 경합 테스트를 추가하라.

### 판정

막는 문제 없음

Recommendation: 03의 두 경계 조건을 보완한 뒤 구현하라 because 유효한 월차가 숨겨지고, 동시 날짜 수정으로 재직 기간이 역전될 수 있다.

## 갈래 B (02·04·05)

### 새 지적

- [BLOCKER] B-NEW01 — 계획 [04.1-04:42](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:42), 코드 [registry.ts:172](/home/user/ERP_PLANT8_260917/domain/settings/registry.ts:172), [settings/actions.ts:43](/home/user/ERP_PLANT8_260917/app/(app)/admin/settings/actions.ts:43), [repositories/settings.ts:93](/home/user/ERP_PLANT8_260917/repositories/settings.ts:93) — **과거 연도 보호에서 취소 경로가 빠졌다.** 취소 액션은 임의 문자열을 받고 도메인은 문자열 대소만 비교한다. `January 1, 2025`는 미래로 판정되지만 DB의 date 비교에서는 과거 행을 가리켜 삭제할 수 있다. 정상 형식도 서울 1월 1일 오전에는 UTC 기준 때문에 이미 적용된 행을 취소할 수 있다 — 취소에도 날짜 정규형 검증과 주입 가능한 서울 기준일을 적용하고, 과거 날짜 별칭·연초 경계 회귀 사례를 추가하라.

- [BLOCKER] B-NEW02 — 계획 [04.1-04:150](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:150), [04.1-01:298](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:298), [04.1-01:308](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:308), 코드 [export.ts:127](/home/user/ERP_PLANT8_260917/domain/settings/export.ts:127), [repositories/settings.ts:135](/home/user/ERP_PLANT8_260917/repositories/settings.ts:135) — **없는 부서가 항상 빈 자리로 처리된다는 가정이 틀렸다.** `org_unit_id`는 `z.string()`이므로 가져오기에서 `not-a-uuid`도 저장된다. 그러나 제출 시 고정하는 `scope_target_id`는 UUID다. 켜진 특정 부서 단계에 이 값이 있으면 폴백 전에 단계 INSERT가 실패해 신규 신청을 막는다 — 존재 여부와 형식 검증을 분리하라. 설정 경계에서 빈 문자열 또는 UUID만 허용하고, 잘못된 형식의 가져오기가 전체 거부되는지 검증하라.

- [참고] B-NEW03 — 계획 [04.1-02:228](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:228), [04.1-02:298](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:298), [04.1-05:277](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:277) — 본문과 승인용 `version`의 동일 시점 조회 계약이 없다. `getLeave`로 반려 본문 A를 읽은 뒤 B로 재신청되고, `getApprovalView`가 새 version을 읽으면 A를 보면서 B를 승인하는 경합이 가능하다. 해당 조회 구현이 아직 없어 참고로 둔다 — 본문·차수·version을 같은 스냅숏으로 반환하고, 두 조회 사이 재신청을 끼우는 결정적 테스트를 명시하라.

### 판정

막는 문제 있음(2건)

Recommendation: 실행 전 계획 수정 because 취소 경로로 과거 잔고 보호를 우회할 수 있고, 허용된 설정 입력이 신규 신청을 중단시킬 수 있다.

## 갈래 C (06·07·교차)

### 새 지적

- [BLOCKER] C-N01 — 계획 [06:337](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:337), [03:217](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:217) · 기존 코드 [domain/people/index.ts:46](/home/user/ERP_PLANT8_260917/domain/people/index.ts:46), [사람 상세:48](/home/user/ERP_PLANT8_260917/app/(app)/admin/people/[id]/page.tsx:48) — **퇴직일을 먼저 읽을 계약이 없다.** 06은 퇴직일로 섹션 연도를 정한 다음 잔고를 조회하지만, 기존 `getPerson`의 `PersonDto`에는 입사일·퇴직일이 없다. 03이 날짜를 넣는 잔고 DTO는 이미 조회 연도를 요구한다. 지난 회차에서 고친 연도 선택 규칙을 실행할 데이터 경로가 빠졌다. — 잔고 조회에 앞서는 관리자용 날짜 조회·DTO와 노출 규칙을 명시하고, `날짜 조회 → 섹션 연도 결정 → 잔고·조정 조회` 순서를 고정한다.

- [WARNING] C-N02 — 계획 [07:143](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:143), [07:152](/home/user/ERP_PLANT8_260917/.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:152) · 기존 코드 [scripts/migrate-runner.ts:54](/home/user/ERP_PLANT8_260917/scripts/migrate-runner.ts:54), [E2E 초기화:46](/home/user/ERP_PLANT8_260917/test/e2e/global-setup.ts:46) — **최종 마이그레이션 검증이 빈 DB 재구축에만 치우쳤다.** 운영 경로는 기존 적용 이력과 데이터 위의 증분 적용인데, 테스트·개발 DB를 모두 비우고 E2E도 스키마를 삭제한다. 전체 녹색으로 기존 데이터 보존까지 증명할 수 없다. — 기록한 `MAIN_SHA`의 마이그레이션과 대표 데이터를 넣은 DB에 재생성 파일만 추가 적용하고, 기존 행·적용 이력 보존과 재실행 무변경을 검증한다. VALIDATION에도 해당 경로를 추가한다.

### 판정

막는 문제 있음(1건)

Recommendation: 계획 수정 후 재검토 because 관리자 화면의 선행 날짜 조회 계약이 빠져 있고, 병합 검증에 기존 DB 업그레이드 경로가 없다.
