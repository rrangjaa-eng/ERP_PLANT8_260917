# Phase 04.1 기술 리뷰 — Codex 원문(2026-09-24 21:24~21:30 KST)

`codex exec -s read-only`, reasoning high. 판정 조정은 `plant8-erp-phase04.1-eng-review-260924.md`에 있다. 절대 경로만 저장소 상대 경로로 바꿨다.

## 갈래 A

### 1. 이전 지적 판정

| ID | 원 지적(한 줄) | 판정 | 근거(file:line) | 남은 문제 |
|---|---|---|---|---|
| 01-H1 | 설정 17키를 원자적 스냅숏으로 읽지 않음 | 고쳐짐 | [04.1-01-PLAN.md:297](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:297), [동시성 검증:399](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:399) | 단일 SELECT와 실제 경주 검증을 명시했다. |
| 01-H2 | 업무 전이와 행동 로그가 비원자적 | 고쳐짐 | [04.1-01-PLAN.md:303](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:303), [record.ts:133](domain/action-log/record.ts:133) | 기존 의존성 주입 계약으로 같은 tx에 기록 가능하다. |
| 01-M1 | 상태·범위·종류 문자열에 DB CHECK 없음 | 고쳐짐 | [04.1-01-PLAN.md:287](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:287) | 지적한 열의 CHECK를 명시했다. |
| 01-M2 | 플랜 규모 과대·낮은 실행 확신 | 거절 이유 불충분 | [04.1-01-PLAN.md:566](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:566) | 플랜·task 개수 제한은 거대한 Task 1의 위험을 해소하지 않는다. 165k로 추정치만 늘렸다. 내부 검증 단위를 더 잘라야 한다. |
| 03-H1 | D-96의 월차 적립 기간과 충돌 | 이유 있는 거절(수용 가능) | [04.1-03-PLAN.md:160](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:160), [경계 테스트:268](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:268) | 사용자 최종 결정인 근속 첫해·최대 11일을 구현한다. |
| 03-H2 | 퇴직 후에도 월차 적립 | 고쳐짐 | [04.1-03-PLAN.md:202](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:202), [당일 포함 검증:270](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:270) | 월차 중단은 해결됐다. 연차의 퇴직 경계는 아래 별도 지적. |
| 03-M1 | 입사일 저장 실패 시 계정만 남음 | 고쳐짐 | [04.1-03-PLAN.md:206](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:206), [기존 보상:170](domain/people/index.ts:170) | 사전 검증·저장 실패 보상·실패 주입 테스트를 명시했다. |
| 03-M2 | 퇴직일이 로그인 세션을 종료하지 않음 | 이유 있는 거절(수용 가능) | [04.1-03-PLAN.md:394](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:394), [04.1-07-PLAN.md:193](.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:193) | 자동 종료 대신 마지막 근무일 뒤 계정 보관을 운영 절차로 명시했다. 수동 처리 의존성은 남는다. |

### 2. 새 지적

- [BLOCKER] [04.1-01-PLAN.md:291](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:291) — **전사 범위가 항상 빈 자리다.** “대상 id가 null이면 0명”인데 [293행](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:293)은 `company`의 대상을 null로 저장한다. 전사 범위의 일반 결재 단계를 건너뛰고 대표 폴백으로 대체할 수 있다. — null 거부를 `team`·`org_unit`에만 적용하고, 대표 이외 계급의 `company` 단계를 검증하라.

- [BLOCKER] [04.1-01-PLAN.md:409](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:409) — **자기 승인 분기가 CEO-5를 다시 깨뜨린다.** 승인자를 제외한 뒤에도 “`self_approve` = 기안자 단독 후보”로 복원한다. 기안자가 1단에서 본인 승인하고 3단의 유일한 담당이기도 하면 다시 후보가 된다. — 자기 승인 복원에도 이번 차수 승인 이력 제외를 적용하고 이 조합을 테스트하라.

- [BLOCKER] [04.1-01-PLAN.md:409](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:409) — **조직 변경으로 ‘최종’이 된 문서를 종결할 쓰기 경로가 없다.** 대표가 앞 단계를 승인한 뒤 마지막 담당자가 퇴직하면 “후보 0명이고 … 승인이 하나 이상이면 최종”이다. 하지만 조회는 읽기 전용이고, [approveDocument:293](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:293)은 후보가 아니면 UPDATE 전에 거부한다. DB는 `in_review`, 사용량은 계속 결재 중으로 남는다. — 추가 승인 없이 version·로그를 함께 갱신하는 종결 처리 경로와 담당 소멸 통합 테스트를 정하라.

- [BLOCKER] [04.1-01-PLAN.md:299](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:299) — **재시드가 관리자의 숨김 설정을 되살린다.** 계획은 새 항목을 `staffDefault: true`로 등록하고 마지막에 `insertVisibilityIfAbsent`를 호출한다. 그 전에 기존 [seed/index.ts:173](domain/seed/index.ts:173)이 PM의 모든 항목을 `upsertVisibility`로 덮어쓴다. 마지막 insert-only 호출은 이미 복구된 권한을 보호하지 못한다. — 기존 루프에서도 새 항목의 설정값을 보존하고, 숨김→전체 재시드→숨김 유지 테스트를 추가하라.

- [BLOCKER] [04.1-03-PLAN.md:202](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:202) — **퇴직 다음 해에도 연차를 새로 부여한다.** `resignationDate` 제한은 월차에만 있고 연차는 입사 연도만 검사한다. 2026년 퇴직자의 2027년 잔고에 다시 15일이 생긴다. “퇴직한 해의 연차를 비례 삭감하지 않는다”는 [162행](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:162)의 결정과 별개다. — 퇴직 연도 이후 부여를 막고, 퇴직 잔여 조회의 기준연도·기준일을 고정하라.

- [BLOCKER] [04.1-03-PLAN.md:41](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:41) — **이력형이라는 이유만으로 과거 잔고가 보존되지는 않는다.** “지난 연도 잔고가 소급해 바뀌지 않는다”지만 기존 [registry.ts:139](domain/settings/registry.ts:139)은 과거 적용일 INSERT를 허용한다. 2000년 기본값만 있는 상태에서 2028년에 `2026-01-01 = 16`을 추가하면 2026년 부여가 15→16으로 바뀐다. — 지난 회계연도 삽입을 일반 저장과 JSON 가져오기 양쪽에서 제한하고 회귀 테스트를 추가하라.

- [MEDIUM] [04.1-03-PLAN.md:202](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:202) — **조정의 계산 계약이 비어 있다.** “조정: 버킷별 부여, 음수 허용”만 있고 유효 시작일·소멸일·음수 부여의 배분 방법은 없다. 월차 +1 뒤 -1을 추가했을 때 양수 grant의 사용 가능량까지 줄이는지조차 불명확하다. — 조정의 기간 귀속과 가용량 차감 규칙을 정의하고, 월차 음수 조정·만료 후 조정·입사일 없는 사람을 검증하라.

- [MEDIUM] [04.1-03-PLAN.md:280](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:280) — **잔고 정의와 고정할 예시가 충돌한다.** “연차 15일 · 사용 3.5일 · 결재 중 1일 · 남음 10.5일”을 요구하면서 [44행](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:44)은 남음에서 진행 중을 제외한다. 같은 조건의 남음은 11.5일이다. — 목록·신청용 잔고의 공제 정의를 구분하고, 하나의 입력 fixture로 문자열과 DTO를 함께 검증하라.

- [MEDIUM] [04.1-01-PLAN.md:348](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:348) — **합의된 마이그레이션 가드에서 마지막 조건을 빼버렸다.** “마지막 스냅숏 = 지금 스키마”를 단위 가드 대신 수동 `db:generate` 재실행으로 넘긴다. 스키마만 바꾼 후속 커밋은 journal 가드를 통과한다. — CI에서 스키마와 마지막 스냅숏 불일치를 자동 실패시키는 검사를 연결하라.

### 3. 판정

판정: 막는 문제 있음 (6건)

Recommendation: 실행 전 계획을 수정하라 because 중복 승인, 숨김 설정 복구, 결재 종결 누락, 잘못된 연차 부여 경로가 남아 있다.
EXIT 0

## 갈래 B

### 1. 이전 지적 판정

| ID | 원 지적(한 줄) | 판정 | 근거(file:line) | 남은 문제 |
|---|---|---|---|---|
| 02-H1 | 신청 액션의 `leave:write` 검사 누락 | 고쳐짐 | [02-PLAN:288](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:288), [client.ts:26](lib/actions/client.ts:26) | 신청·재신청·미리보기 도메인 첫 줄 검사와 거부 테스트가 명시됨. |
| 02-H2 | 반려·회수·재신청 로그가 커밋 뒤 기록됨 | 고쳐짐 | [02-PLAN:284](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:284), [02-PLAN:280](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:280) | 같은 tx의 로그 기록과 실패 시 전체 롤백을 명시함. |
| 02-M1 | 모든 액션의 등록 여부를 증명하지 못함 | 부분 해결 | [02-PLAN:230](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:230), [account/actions.ts:15](app/(app)/account/actions.ts:15) | 탐색 시작점이 registry 파일이다. registry 자체가 없는 액션은 계속 누락된다. 실제 `changePasswordAction`도 이 사각지대에 있다. 액션 파일부터 열거해야 한다. |
| 04-H1 | 설정 한 벌의 동시성 보장 없음 | 고쳐짐 | [04-PLAN:43](.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:43), [01-PLAN:417](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:417) | 단일 SELECT와 다중 키 경주 검증이 추가됨. 칸별 저장 사이의 중간 조합은 허용한다고 보장 범위를 명확히 한 상태. |
| 04-M1 | 설정 전용 관리자의 옵션이 비거나 잘림 | 고쳐짐 | [04-PLAN:173](.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:173), [roles.ts:10](repositories/roles.ts:10), [org-units.ts:10](repositories/org-units.ts:10) | 제안한 리포지토리 인자와 권한 우회 방식은 실제 인터페이스에 맞음. |
| 04-M2 | 접미사 검사만으로 날짜 검증 | 고쳐짐 | [04-PLAN:225](.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:225) | 형식·양수 연도·01-01 검사로 원 지적은 해결. 다른 쓰기 경로의 우회는 아래 지적. |
| 05-M1 | generic 상세가 DTO 투영을 우회 | 부분 해결 | [05-PLAN:203](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:203), [project.ts:28](domain/permissions/project.ts:28) | 최상위 키와 행 모양만 제한한다. `rows.value`에 민감정보를 문자열로 넣으면 그대로 통과한다. 정보 항목별 투영을 **문자열 행 생성 전에** 강제해야 한다. |
| 05-M2 | visibility만 세어 상세 N+1을 놓침 | 부분 해결 | [05-PLAN:193](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:193), [05-PLAN:203](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:203) | 사용·조정·설정 조회는 보강됐지만 사용자·보임 판정·결재선 조회는 계수 밖이다. 전체 SQL 수를 측정하지 않아 나머지 N+1은 통과할 수 있다. |

### 2. 새 지적

- [BLOCKER] [02-PLAN:284](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:284) — **권한 검사 전 충돌 응답으로 문서 정보가 샌다.** “version 불일치면 충돌 오류(후보·기안자 판정보다 먼저)”이고, [340행](.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:340)은 처리자 이름·시각·상태를 사용자에게 반환한다. 무관한 로그인 사용자도 문서 ID와 오래된 version으로 호출하면 이 정보를 얻는다. 실제 [오류 처리기:24](lib/actions/handle-server-error.ts:24)는 해당 메시지를 그대로 내보낸다. — 상세 충돌 정보의 열람 권한을 별도로 검사하고, 무관한 사용자의 stale-version 호출 테스트를 추가하라.

- [BLOCKER] [04-PLAN:225](.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:225) — **1월 1일 검사로 과거 잔고 불변을 보장할 수 없다.** “연도 1 이상, 월 = `01` · 일 = `01`”이면 과거 연도도 저장된다. 기존 [registry.ts:137](domain/settings/registry.ts:137)은 소급 삽입을 막지 않는다. 기본 15일로 계산하던 과거 연도에 새 이력을 넣으면 모든 잔고가 재계산되어 [03-PLAN:41](.planning/phases/04.1-approvals-leave/04.1-03-PLAN.md:41)의 “지난 연도 잔고가 소급해 바뀌지 않는다”가 깨진다. — 확정 연도 설정의 소급 삽입을 막고, 과거 정정은 조정 기록으로 처리하라.

- [BLOCKER] [05-PLAN:52](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:52) — **월차 0일일 때 두 잔고 표시 결정이 구현되지 않는다.** “월차 부여가 있을 때만” 표시하므로 12월 15일 입사자의 다음 해 1월 1일에는 월차 칸이 사라진다. 입사 다음 해에는 항상 두 잔고를 표시한다는 확정 결정과 다르다. — 해당 기간에는 `monthlyRemaining: 0`과 `월차 남음 0일`을 유지하고 이 경계 사례를 시험하라.

- [MEDIUM] [04-PLAN:225](.planning/phases/04.1-approvals-leave/04.1-04-PLAN.md:225) — **설정 가져오기가 `year_start` 검증을 우회한다.** 검사를 `addHistorizedValue`에만 추가하지만 기존 [export.ts:116](domain/settings/export.ts:116)은 값 스키마만 검사하고 [140행](domain/settings/export.ts:140)에서 직접 저장한다. 따라서 `leave.annual_days`의 `2027-03-01`도 가져오기에서는 통과한다. — 적용일 검증을 공통 함수로 추출해 두 경로에 적용하라.

- [MEDIUM] [05-PLAN:204](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:204) — **모바일 처리함 행의 동작이 빠졌다.** 상세는 “`내 결재` 항목”에만 붙이지만 [206행](.planning/phases/04.1-approvals-leave/04.1-05-PLAN.md:206)은 행 탭으로 승인·반려 시트를 열도록 한다. 처리함 행에는 시트 재료가 없다. — 처리함은 문서 링크로 이동시키거나 읽기 전용 상세를 제공하고, 승인 직후 처리함 행을 다시 여는 E2E를 추가하라.

### 3. 판정

판정: 막는 문제 있음 (3건)
Recommendation: 실행 전 수정 후 재검토 because 충돌 응답의 정보 노출, 과거 잔고 소급 변경, 확정된 잔고 표시 규칙 위반이 남아 있다.
EXIT 0

## 갈래 C

### 1. 이전 지적 판정

아래 계획 파일은 `.planning/phases/04.1-approvals-leave/` 기준이다.

| ID | 원 지적(한 줄) | 판정 | 근거(file:line) | 남은 문제 |
|---|---|---|---|---|
| 06-H1 | 연말에 유효한 E2E 신청 기간을 만들 수 없음 | 고쳐짐 | 04.1-02-PLAN.md:180,228; 04.1-06-PLAN.md:240,243 | 과거 신청을 허용하고 같은 해 안의 평일을 생성하도록 변경됨. |
| 06-M1 | PC 메뉴 순서와 TopBar 합성 순서 불일치 | 고쳐짐 | 04.1-06-PLAN.md:189,196; ui/shell/TopBar.tsx:50 | 순서 계약을 맞추고 배열 전체를 검증함. |
| 06-M2 | 입사일 필수화가 UI에만 있음 | 부분 해결 | 04.1-06-PLAN.md:307,402; 04.1-03-PLAN.md:206; scripts/account-cli.ts:87 | 액션 필수화·저장 실패 보상은 추가됐다. 도메인 예외 근거는 틀렸다. CLI는 `registerPerson`이 아니라 `createAccount`를 호출하며, 기존 계정 존재는 신규 등록 입력을 선택값으로 둘 이유가 아니다. |
| 06-M3 | 미리보기 액션의 권한 검사 누락 | 고쳐짐 | 04.1-06-PLAN.md:252; 04.1-02-PLAN.md:288; lib/actions/client.ts:26 | 로그인 검사와 별도로 액션·잔고 도메인에 `assertLeaveWrite`를 명시함. |
| 07-H1 | 마이그레이션 삭제 대상 탐지가 너무 넓음 | 고쳐짐 | 04.1-07-PLAN.md:135 | SQL·스냅숏 삭제 대상은 manifest로 한정됨. journal 문제는 아래에 남음. |
| 07-H2 | journal 전체 복구로 다른 변경을 제거함 | 부분 해결 | 04.1-07-PLAN.md:24,137,148 | 복구 원본만 main으로 바뀌었다. main에 없는 타 페이즈 항목은 여전히 제거된다. 디렉터리를 main과 같게 만들라는 검사도 해당 변경의 보존과 양립하지 않는다. 병합 전에 타 페이즈 전용 항목 부재를 검증해야 한다. |
| 07-M1 | 삭제 커밋 후 병합 중단 시 깨진 브랜치가 남음 | 부분 해결 | 04.1-07-PLAN.md:137,139 | `merge --abort` 경로는 수정됐다. 그러나 삭제된 상태를 먼저 커밋하고 재생성하므로, 생성 실패·작업 중단 시 스키마와 마이그레이션이 불일치하는 HEAD가 남는다. 생성·검증까지 커밋 전에 끝내야 한다. |
| 07-M2 | 자유 형식 SUMMARY에서 마지막 tag를 추측함 | 부분 해결 | 04.1-07-PLAN.md:146 | 여전히 SUMMARY 전체의 정규식 검색이다. 실제 존재하는 SQL 경로라도 예시·과거 산출물일 수 있다. Phase 4 산출물임을 증명하는 구조화된 manifest가 필요하다. |

`04.1-REVIEWS.md`의 MEDIUM 지적은 14개다. 171행은 위험도 평가이며, X-M1에 해당하는 추가 지적은 없다.

### 2. 새 지적

- [BLOCKER] [04.1-06-PLAN.md:196](.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:196) — “`allowedMenus`에 `leave`가 있을 때만” 메뉴를 추가하지만 기존 모바일 테스트 수정이 빠졌다. [mobile-shell.spec.ts:150](test/e2e/mobile-shell.spec.ts:150)은 `allowedMenus: []`로 기대값을 만든다. 02 계획이 기본 계급에 연차 권한을 시드하면 실제 메뉴에는 연차가 있고 기대값에는 없어 반드시 실패한다 — 해당 테스트를 변경 목록에 넣고 실제 권한 조건과 맞춰라.

- [BLOCKER] [04.1-06-PLAN.md:198](.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:198) — “범위 밖이면 올해로”가 187행의 `?year={Y-1}` 빈 목록 테스트와 모순된다. 162행의 범위는 최초 신청 연도부터이고, 해당 픽스처에는 올해 신청만 있다. 지난해 요청은 올해로 바뀌므로 기대 화면이 나올 수 없다 — 과거 연도 조회를 허용하거나, 더 이전 신청을 가진 별도 픽스처로 테스트해라.

- [BLOCKER] [04.1-01-PLAN.md:348](.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md:348) — “마지막 스냅숏 = 지금 스키마” 검사를 명시적으로 guard test 밖으로 뺐다. 확정된 migration guard 요구와 다르며, 스키마만 바뀌어도 해당 테스트는 통과한다 — `migration-journal.test.ts`에서 스키마 일치 실패도 검출하도록 요구를 복원해라.

- [MEDIUM] [04.1-07-PLAN.md:158](.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:158) — “`git show --name-status <병합 커밋>`가 그 목록과 `_journal.json`뿐”이라는 증명이 성립하지 않는다. 137행대로 마이그레이션 트리가 main 부모와 같으면 기본 combined merge diff에는 해당 변경이 표시되지 않는다 — 부모를 명시한 diff로 main 유입분과 manifest 삭제분을 각각 검증해라.

- [MEDIUM] [04.1-07-PLAN.md:204](.planning/phases/04.1-approvals-leave/04.1-07-PLAN.md:204) — 금지 파일 검사가 `--no-merges`라 병합 충돌 해소에서 발생한 덮어쓰기를 놓친다. 검사 경로에는 `.planning/STATE.md`, `domain/permissions/roles.ts`, 금지한 견적·차수·계약 파일도 없다 — 변경 금지 경로를 완전하게 열거하고 최종 트리를 병합한 main 커밋과 비교해라.

- [LOW] [.planning/ROADMAP.md:364](.planning/ROADMAP.md:364) — 아직 “예약 0017~0020”이라고 적혀 있다. 366행에도 Phase 4 예정 번호 범위가 남았다. 계획 본문의 폐지 선언과 상충하는 안내다 — 현재 규칙인 “생성 번호 사용, 병합 직전 main 마지막 + 1로 재생성”으로 정리해라.

### 3. 판정

판정: 막는 문제 있음 (4건)
Recommendation: 실행 전 계획 수정 because 타 페이즈 journal 보존이 해결되지 않았고, E2E 두 곳이 확정적으로 실패하며, 필수 스키마 일치 guard가 빠져 있다.
EXIT 0
