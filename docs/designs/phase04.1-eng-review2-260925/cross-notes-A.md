# 교차 메모 A — 04.1-01 · 04.1-03 수정(eng-review 2회차 반영)이 다른 플랜에 요구하는 것

작성: planner A(01·03 담당), 2026-09-25 수정 회차. 01·03 본문은 이미 고쳤다. 아래는 **다른 플랜 담당(B = 02·04·05, C = 06·07·VALIDATION)** 이 자기 파일에 반영할지 판단할 재료다.

## 1. C-N01 = C-03 (T4) — 06 Task 3 ③ 배선에 필요한 03 계약 (→ planner C)

03은 다음을 보장한다(04.1-03 Task 1 ⑤ · 퇴직 truth · Task 3 퇴직자 연도별 통합 사례):

- `getLeaveBalanceForUser(viewer, userId, { fiscalYear }, deps?)`의 결과(`LEAVE_BALANCE_DTO_SPEC`)는 **조회 연도와 무관하게 늘** 머리 필드 `hireDate` · `resignationDate`(값이 없으면 `null`)를 싣는다. 연도에 따라 있고 없는 것은 **퇴직 줄 재료뿐**이다(조회 연도 = 퇴직 연도일 때만).
- 그래서 지난해 퇴직한 사람을 `fiscalYear: 올해`로 읽어도 `resignationDate`를 받는다. 대상자가 보관 상태여도 읽는다(`findUserById`처럼 보관 필터 없음).
- 권한: `can(viewer, "admin.people", "view")`가 거짓이면 `ForbiddenError`(A-04로 명시).
- 투영: 두 날짜 필드도 `leave.value`다. 시드는 계급 5종 모두에 `leave.value` 참을 두므로 관리자 화면에선 늘 실린다. 필드가 빠졌으면(노출을 끈 계급) 06은 대체 연도 = 올해로 둔다.

06이 고정할 순서(보고서 T4 기본안): 첫 읽기 `getLeaveBalanceForUser(…, { fiscalYear: seoulToday()의 연도 })` → 그 `resignationDate`로 섹션 연도 = `resolveLeaveYear(searchParams.year, 올해, 대체 연도)`(대체 연도 = 퇴직일이 있으면 min(퇴직 연도, 올해)) → 섹션 연도 ≠ 올해일 때만 같은 함수를 그 연도로 한 번 더 읽는다. 03에 새 함수는 필요 없다.

## 2. A-01 (T5) — 05 상세의 walkRoute 상태 조건 (→ planner B)

01은 `getApprovalView` · `canSeeLeaveDocument`에 「DB 상태가 `submitted`·`in_review`일 때만 walkRoute — 종결 상태(`approved`·`rejected`·`withdrawn`)는 저장된 처리 기록만 표시 · 지금 단계 없음 · `approval.route_blocked` 로그 없음」을 넣었다(01 Task 1 ④ ⑤ · Task 3 ⑦ · 통합 describe `종결 상태 조회 — walkRoute 없음(A-01)`).

- 05의 결재 시트 상세(일괄 `loadDetails` 등)가 walkRoute를 직접 부르면 같은 한 줄이 필요하다. `getApprovalView` 결과만 그리면 추가 작업은 없다 — 종결 문서에서는 지금 단계 필드가 없고 단계 목록은 처리한 단계뿐이다.
- 05 E2E가 「끝난 문서 열기」에서 `담당 없음`을 기대하는 곳이 있으면 고친다.

## 3. B-NEW02 (T3) — 04 settings-export 통합 사례 (→ planner B)

01 Task 1 ⑥이 결재선 `org_unit_id` 네 키의 스키마를 `z.union([z.literal(""), z.string().uuid()])`로 바꿨다(단위 사례는 01 Task 3 `route-config.test.ts`). 04에 남은 일은 보고서 그대로다: settings-export 통합에 「비uuid `org_unit_id` 가져오기 → `ImportValidationError`, 아무것도 안 씀」 사례 하나. 04의 설정 화면(`dynamicOptions: "org_units"` · `""` = 특정 부서 없음)은 이 스키마를 그대로 통과한다.

## 4. 마이그레이션 SQL 손 삽입 — 04.1-07 재생성 단계 (→ planner C) · 리뷰가 놓친 항목

- 사실(squawk-cli 2.65.0 · 이 저장소 `.squawk.toml`로 로컬 실측): drizzle-kit 생성본 그대로는 (a) 새 표가 기존 표(`users` 등)를 참조하는 `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`, (b) 기존 표 `users`의 `ADD COLUMN`이 `require-lock-timeout` · `require-statement-timeout`에 걸리고, (c) 기존 표에 거는 `ADD CONSTRAINT … CHECK`는 `constraint-missing-not-valid`에 걸린다. 기존 마이그레이션 11개는 전부 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s'; --> statement-breakpoint` 블록을 손으로 넣어 통과했다(`0006_org_people_cards.sql` 54–56행 · 03-RESEARCH Pitfall 2).
- 01·03 플랜은 이전에 「SQL 손 편집 금지」라 적어 `pnpm lint:sql`을 통과할 길이 없었다. 이번에 01 Task 2 ② · 03 Task 2 ②를 「손 삽입은 `SET LOCAL` 블록(+ 03의 `users` CHECK 끝 `NOT VALID`)만 — 파일 이름 · `_journal.json` 손 편집 금지(결정 7a 원문)는 그대로」로 좁혔다. 두 SUMMARY가 `migration_manifest` 옆에 손 삽입 줄 번호를 적는다.
- **07 Task 1에 필요한 것**: 04.1 마이그레이션을 지우고 `pnpm db:generate`로 재생성하면 손 삽입이 사라진다. 재생성 직후 같은 두 가지를 다시 넣고(01·03 SUMMARY의 줄 번호 참고), 그 뒤 `pnpm db:generate` 재실행이 "No schema changes"인지와 `pnpm lint:sql` 0건을 본다. 07에 「SQL 손 편집 금지」 문구가 있으면 같은 범위로 좁힌다.
- 03이 `users`에 새로 거는 CHECK: `users_resignation_on_or_after_hire_check`(`resignation_date IS NULL OR hire_date IS NULL OR resignation_date >= hire_date`, `NOT VALID`). C-N02(증분 적용 검증)를 VALIDATION에 선택 사례로 넣는다면, 이 제약이 기존 행 위에서도 적용되는지가 좋은 표본이다.

## 5. 참고 — 시그니처 · 도우미 (→ B · C)

- `listMyLeave(viewer, { fiscalYear }, deps?)` 한 시그니처로 통일했다(A-11). 06이 C-04(가장 이른 신청 연도)를 `listMyLeave` 결과 DTO에 싣는 쪽을 고르면 이 시그니처를 쓴다.
- `canSeeLeaveDocument(viewer, leaveRow, deps?: { today?: string; … })` — 스냅숏 기준일은 호출자 입구의 서울 날짜(A-09). 05의 일괄 상세가 `now`를 끝까지 넘기는 경로(CX-B2)와 맞다.
- `lib/dates.ts`에 03이 `seoulDateToUtcDate(date: string): Date`(그 날짜의 UTC 자정 — `getSettingValue` asOf용)를 덧붙인다. 04의 B-NEW01(`cancelHistorizedValue` 서울 기준일 주입)이 asOf `Date`를 만들 일이 있으면 같은 도우미를 쓰면 된다.
- 입사일·퇴직일 역전 거부 문구(계획 가정): `퇴직일이 입사일보다 빠름 · 날짜 확인`. 06의 칸 아래 한 줄 오류가 이 문구를 그대로 보인다.
- 월차 줄 존재 조건이 「조회 연도에 유효한 월차 부여」로 바뀌었다(A2-01). 1월 입사자는 입사 다음 해에도 월차 줄을 본다. 06 E2E가 월차 줄 유무를 리터럴로 단언하면 03 순수 함수로 기대값을 계산하는지 확인한다.
