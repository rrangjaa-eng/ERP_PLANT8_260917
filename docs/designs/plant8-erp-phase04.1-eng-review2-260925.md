# Phase 04.1 「결재 모듈·연차」 기술 리뷰 2회차(/plan-eng-review) — 2026-09-25

- 대상: `.planning/phases/04.1-approvals-leave/04.1-01~07-PLAN.md`(수정본), 브랜치 `claude/phase-04.1-plan-1iqtwe` @ `1ad17aa`
- 방식: Opus 3갈래(A=01·03 · B=02·04·05 · C=06·07·교차) + Codex 3갈래(같은 분할) 동시 실행 → Sonnet 1차 대조(codex-triage.md) → Fable 최종 판정(judge.md)

## 결론

**막는 문제 1건(C-01).** 그 밖에 경고 6건(judge.md 최종 판정), P2 12건, P3 36건.

- C-01: 06(사람 관리)의 입사일 필수화가 기존 E2E 4개(`admin-master-list-first` · `corp-cards` · `mobile-corp-cards` · `single-column`)를 깨는데, 계획의 read_first grep(`people?new=1`, 0건 매치)이 이 넷을 찾지 못한다. 06은 거짓 녹색으로 끝나고 07 전체 게이트에서야 넷이 동시에 깨진다.
- 경고 6건은 Opus 3갈래 자체 발견(A-01·A-02·B-A1) 3건과 Codex 새 지적(B-NEW01·B-NEW02·C-N01) 3건이다. 전부 플랜 문장 한두 줄 + 테스트 사례 하나로 닫힌다.
- 참고 2건(C-N02·B-A2)은 이번 회차에서 반영을 강제하지 않는다 — 근거는 「참고(반영 선택)」 절.
- 1차 리뷰(ENG-1~25)·Codex 4회차 판정·범위 밖 항목(B-F04·A-FF01)·사용자 확정 결정(비례 연차·월차 입사일 기준·월차/연차 분리·기안자 겸 담당 승인+회수)은 이번 회차에서 다시 올리지 않았다.

**다음 세션**: 반영 지시를 `/gsd-plan-phase 04.1` 수정 회차로 넣고 → 체커 + Codex(바뀐 부분만) → 최종 전체 Codex 「막는 문제 없음」이 나올 때까지 반복 → `/plan-design-review 04.1` + Codex로 간다.

## 반영 지시(다음 세션 — 막는 문제)

1. **C-01** `04.1-06-PLAN.md:339` · `:315`(read_first) · `:308`(files) — 입사일 필수화가 등록 폼을 쓰는 기존 E2E 넷(`admin-master-list-first.spec.ts:108` · `corp-cards.spec.ts:27` · `mobile-corp-cards.spec.ts:34` · `single-column.spec.ts:104`)을 깨는데, 계획의 read_first grep(`people?new=1`)이 실제로 쓰는 셀렉터(`getByRole("link"/"button", { name: "사람 등록" })`)와 달라 0건이 나와 못 찾는다. **고칠 것**: read_first grep을 `grep -rln 'name: "사람 등록" }).click' test/e2e`로 바꾸고, 네 스펙을 files_modified · Task 3 ④ · 셋째 검증 명령에 더한다. 각 스펙의 등록 단계에 입사일 입력 한 줄을 추가한다.

## 반영 지시(경고 — 같은 수정 회차)

2. **B-NEW01** `04.1-04-PLAN.md:42`(공통 검증 함수는 두 쓰기 경로만 부른다고 명시) · `domain/settings/registry.ts:172-175`(`cancelHistorizedValue` — 문자열 대소 비교만, `dateOnly(new Date())` UTC, 주입 가능한 `now` 없음) · `app/(app)/admin/settings/actions.ts:43`(형식 검증 없는 `z.string().min(1)`) — 이력값 취소(세 번째 쓰기 경로)에 날짜 정규형 검증도 서울 기준일 주입도 없다. **고칠 것**: 04.1-04 Task 2 ①에 ①-c 「`cancelHistorizedValue`도 `validateEffectiveFrom`의 형식 검사 + `seoulToday(deps?.now)` 기준 `past_year`/이미 적용 판정을 거친다」 + 단위 사례(비정규 날짜 문자열 거부 · 연초 서울 경계).
3. **B-NEW02** `04.1-01-PLAN.md:308`(`org_unit_id`는 `z.string()`만, uuid 형식 검증 없음) · `:298`(`scope_target_id uuid null` 컬럼) · `domain/settings/export.ts:127-132`(비uuid 문자열도 그대로 저장) — 가져오기로 비uuid `org_unit_id`가 저장되면 그 단계가 켜졌을 때 제출 시 `scope_target_id` INSERT가 22P02로 실패해 신규 신청 전체가 막힌다. **고칠 것**: 01:308 키 정의를 `z.union([z.literal(""), z.string().uuid()])`로 바꾸고, 04 settings-export 통합에 「비uuid `org_unit_id` 가져오기 → `ImportValidationError`, 아무것도 안 씀」 사례를 더한다.
4. **C-N01 = C-03** `04.1-06-PLAN.md:337`(섹션 연도가 퇴직일을 먼저 요구) · `04.1-03-PLAN.md:217`(잔고 DTO의 입사일·퇴직일은 `LEAVE_BALANCE_DTO_SPEC`에만 있고 그 조회는 연도를 먼저 요구) · `domain/people/index.ts:46-55`(`PersonDto`에 입사일·퇴직일 없음) — 섹션 연도를 정하려면 퇴직일이 필요한데 퇴직일을 얻는 유일한 경로가 연도를 먼저 요구하는 닭과 달걀 문제. **고칠 것**: 06 Task 3 ③에 「첫 읽기는 `getLeaveBalanceForUser(…, {fiscalYear: 올해})`로 입사일·퇴직일을 얻고, 섹션 연도가 올해와 다를 때만 그 연도로 한 번 더 읽는다」를 고정하거나, 03에 연도 없이 입사일·퇴직일만 주는 좁은 읽기를 하나 더한다.
5. **A-01** `04.1-01-PLAN.md:304`(`getApprovalView` — 상태 조건 없이 walkRoute) · `:461`(W13 결정표) · `:473`(`route_blocked` 로그) — walkRoute 입력에 DB 상태가 없어 정상 최종 승인된 문서도 「끝 · 승인 ≥1 · 행동 전」=W13이 되어 끝난 문서를 열 때마다 가짜 `route_blocked` 경고와 `담당 없음` 표시가 생긴다. **고칠 것**: `getApprovalView`·`canSeeLeaveDocument`·05 상세에 「상태가 `submitted`·`in_review`일 때만 walkRoute — 종결 상태는 저장된 처리 기록만 표시, route_blocked 로그 없음」 한 줄 + 통합 사례(최종 승인 뒤 `getApprovalView` → `log.warn` 0회).
6. **A-02** `04.1-01-PLAN.md:298`(`UNIQUE(route_id, step_index)`) · `:300`(대표 폴백 행 삽입에 `step_index` 값 없음) — 1·3단만 켠 결재선(흔한 구현 `steps.length+1`=3)에서 기존 3단 행과 UNIQUE 충돌 → 폴백 승인이 원시 23505로 실패, 문서 영구 정체. **고칠 것**: ② 리포지토리 항목에 「폴백 행 `step_index` = 그 차수 `max(step_index)+1`(행 0개면 1)」 + 통합 사례(2·4단 꺼짐·3단 빈 자리 → 대표 폴백 승인 성공, `step_index` 4).
7. **B-A1** `04.1-02-PLAN.md:224`(액션이 다음 담당 이름·차감 일수를 그대로 반환) · `04.1-01-PLAN.md:84`(CX-R3, 미리보기·상세는 `approval.value`/`leave.value` 투영을 거친다) · `test/integration/leak-scan.test.ts:138-140`(등록 여부만 검사, 실제 반환값 투영은 안 봄) — 액션 반환 경로가 CX-R3로 막은 이름·일수 누수를 다시 연다. **고칠 것**: 02 ④에 네 액션 결과를 등록 DTO로 `project()`하고, 필드가 빠지면 토스트를 `승인 · 결재 요청됨`류로 줄인다는 문구 + 통합 사례(계급 `approval.value` 끄면 반환 JSON에 이름 없음).

## 반영 지시(P2·P3 — 같은 수정 회차, 싼 것부터)

**P2 (12건, dedupe 완료 — 위 블로커·경고와 중복 없음)**

8. **A-03** `04.1-03-PLAN.md:217`·`:350` — `LEAVE_ANNUAL_DAYS`를 「Y-01-01 시점 asOf」로 읽을 `Date` 생성 방식이 수락 기준(`new Date(` 0건)과 부딪치고, 로컬(TZ=Asia/Seoul) 개발기에서 전년도 값을 읽을 수 있다(CI는 UTC라 못 잡음). `lib/dates.ts`에 `seoulDateToUtcDate` 류 도우미 하나로 고정.
9. **A-04** `04.1-03-PLAN.md:372`·`:217` — `setHireDate`·`setResignationDate`·`addLeaveAdjustment`의 PM 거부, 날짜 역전 거부, 행동 로그, 잔고 보기 권한 거부 behavior 사례가 threat 표에만 있고 테스트엔 없다. `people.test.ts`·`leave-balance.test.ts`에 네 사례 추가.
10. **B-A3** `04.1-02-PLAN.md:239` — document-kinds import 가드가 `import type`·`"use client"` 예외 없이 걸려 클라이언트 컴포넌트가 가드를 맞추려다 서버 코드를 번들에 끌어올 위험. 검출 정규식에서 `import type`을 빼고 `"use client"` 파일은 건너뛴다.
11. **B-C1** `04.1-02-PLAN.md:346`·`:368` — `buildConflictMessage`에 다시 신청 뒤 지금 상태(`submitted`, 차수>1)의 문구가 없어 `undefined`나 틀린 동사가 나올 수 있다. `{기안자}이/가 HH:MM에 다시 신청함 · 새로 고침` 매핑 + switch 전수 커버.
12. **C-02** `04.1-06-PLAN.md:330`·`:335` — 공용 `ui/select`는 늘 빈 `—` 옵션을 먼저 그리는데 계획은 「옵션이 `연차` 하나뿐」이라 단언한다. 계약을 「`—` 제외 옵션이 연차 하나」로 고치고 기본 선택은 제어값 `annual`로 명시, `—` 선택 시 서버 거부 사례 추가.
13. **C-04** `04.1-06-PLAN.md:169` — 연도 select의 「가장 이른 신청 연도」를 줄 도메인 읽기가 없다(files 밖). `domain/leave/index.ts`(+리포지토리 `min(extract(year…))`)를 06 files에 추가하거나 `listMyLeave` 결과 DTO에 싣는다.
14. **C-05** `04.1-07-PLAN.md:91`·`:148`·`:208` — 검증 명령이 앞 단계에서 「적어 둔」 셸 변수(`PHASE_BASE`·`MAIN_SHA`·`REMOTE_HEAD_START`)를 읽지만 Bash 호출 사이에 셸 상태가 유지되지 않아 빈 값 비교가 공허하게 통과할 수 있다. 값을 스크래치패드 파일에 쓰고 각 검증 명령 첫머리에서 `test -n` 가드.
15. **C-06** `04.1-07-PLAN.md:29` — 07 검사 뒤 GSD 메타 커밋(플랜 종료 커밋)이 STATE.md를 다시 바꿔, 검증은 초록인데 최종 트리는 조정자 결정(04.1이 main에 STATE 변경을 안 가져간다)을 어긴다. 검사를 `/ship` 직전 단계로 옮긴다.
16. **C-07** `04.1-06-PLAN.md:268` — E2E 픽스처 이름이 전부 `E2E Employee`라 기안자·팀장 이름이 같아 누수와 정상이 구분 안 된다. `registerPerson`(고유 이름)으로 사례별 사용자 생성.
17. **GAP-1** `04.1-VALIDATION.md:78-83` — CEO-12 두 번 제출, 등록 입사일 필수, 퇴직자 기본 섹션 연도, CX2-02, A1 role-menu, 07 Task1 넷째 명령의 VALIDATION 행이 06에 없다. 행을 채우거나 `/gsd-validate-phase`에 명시적으로 위임.
18. **Codex A2-01**(triage 확인) `04.1-03-PLAN.md:37` — 월차 부여가 조회 연도에 없으면(근속 1년 지나고 그 해 적립 0) 줄이 사라지지만 소멸일(입사 다음 해 12-31)까지는 아직 유효 잔액이 있을 수 있다. 존재 조건에 「조회 연도에 유효(미소멸)한 부여 존재」 추가.
19. **Codex A2-02**(triage 확인) `04.1-03-PLAN.md`(hire/resignation 두 열 「추가만」, CHECK 없음) — 입사일·퇴직일 동시 수정 시 각 함수가 옛 상대값으로 따로 검증해 `퇴직일 ≥ 입사일`이 깨질 수 있다. DB CHECK + 경합 테스트 추가.

**P3 (36건, 한 줄씩 — 이번 회차에서 강제 반영하지 않음, 플랜 수정 시 값싸게 같이 처리 권장)**

- A-05 조직 스냅숏만으론 보관된 처리자 이름·계급/부서 라벨을 못 줌 → `findUserNamesByIds` 필요(04.1-01:300)
- A-06 read_first의 `origin/claude/gsd-progress-e1nzgu` 참조가 로컬에 없음 → `git fetch` 한 줄(04.1-01:223)
- A-07 「기존 관례 withTimezone」이 사실과 다름(실측 0건) → 무 tz로 명시(04.1-01:298)
- A-08 번호 사례(`LV26-…`)가 시계 주입을 요구하지 않아 연도 바뀌는 날 깨짐(04.1-01:278)
- A-09 `canSeeLeaveDocument`가 `deps.now`를 안 받아 실제 시계로 돌 위험(04.1-01:306)
- A-10 `nextStep` 36칸 중 허용 칸 표가 플랜에 없음(04.1-01:56)
- A-11 `listMyLeave` 시그니처가 플랜 안에서 두 가지(04.1-01:306 vs 526)
- A-12(confidence 4) `buildLeaveGrants`에 넘길 `fiscalYears` 범위 미정(04.1-03:213)
- A-13 `listMyInbox` 결재선 읽기가 일괄인지 불명(N+1 우려, 04.1-01:300)
- B-C2 차감 일수 출처가 종류 경계 밖(종류 분기 금지와 충돌 우려, 04.1-02:224)
- B-C3 오류 경계 재시도가 `reset`으로 적힘(Next 16.3 표준은 `retry`, 04.1-05:323)
- B-C4 ConfirmDialog `aria-disabled` 막힘이 `ui/button` API와 안 맞음(04.1-05:48)
- B-C5 참조 브랜치가 로컬에 없음(04.1-05:159)
- B-C6 `resubmitLeave`가 판정 전에 쓰고 막힘 오류가 관련자 판정보다 먼저 나감(04.1-02:298)
- B-C7 E2E 픽스처 이름 모두 같아 이름 단언 공허(04.1-02:209)
- B-C8 승인 뒤 결재함 리렌더 방법 미기재(04.1-02:229)
- B-T4 옛 탭 충돌 표시 E2E가 문서 화면에만 있음, 결재함 PC 행은 없음(04.1-05:270)
- B-T5 `/leave/new` 404 게이트를 grep으로만 확인(04.1-02:62)
- B-T6 사유 없음 + Ctrl+Enter 0건 E2E 없음(C4의 테스트 쪽)
- B-T7 `cancelHistorizedValue`가 UTC 기준이라 서울 1/1 새벽에 올해 행 취소 가능(04.1-04:42) — B-NEW01과 별개로 「올해」 경계만
- B-R1 Task 2 verify에 01의 동시성·투영 테스트가 없어 회귀가 한 task 동안 안 드러남(04.1-02:309)
- B-P1 설정 화면이 결재선 17키를 경고 계산에서 다시 읽음(04.1-04:190, 성능)
- B-P2 `leave` 메뉴 추가로 매 요청 권한 조회 1회 증가(무시 가능 수준, `app/(app)/layout.tsx:25`)
- C-09 `ui/table`에 행 전체 링크 기능 없음(04.1-06:50)
- C-10 계약 절 (4)가 아직 없을 §4-8을 무조건 인용(04.1-07:185)
- C-11 `aria-disabled` 부재 단언이 공허(버튼이 애초 안 씀, 04.1-06:295)
- C-12 zod 연도 상한이 모듈 로드 때 굳을 수 있음(04.1-06:333)
- C-13 `required` 네이티브 속성이 서버 zod 문구를 가림(04.1-06:328)
- C-14(confidence 4) 월차 조정이 「적립」에 더해지는지는 03의 문자열 계약이 정함(04.1-06:322)
- C-GAP-3 계정 그룹 항목 증가로 `keyboard-nav`·`admin-nav` 회귀가 06 검증에 없음
- C-GAP-4 `/leave` loading/error가 grep 수락 기준뿐(04.1-06:239)
- C-P1 「가장 이른 연도」를 해마다 조회로 풀면 반복 쿼리(04.1-06:169, C-04와 같이 해결)
- C-P2 서버 액션 순차 전송으로 미리보기 뒤 제출이 줄을 섬(04.1-06:170)
- C-P3(confidence 4) 신규 E2E 다수로 desktop 프로젝트 실행 시간 증가
- C-P4(confidence 4) 레이아웃 메뉴 권한 조회 1회 증가, 무시 가능
- Codex B-NEW03(confidence 낮음, Codex 자체 참고) 본문과 승인 `version`의 동일 스냅숏 계약 없음(04.1-02:228) — 트랜잭션 내 version 재검증이 데이터 손상은 막음

## 참고(반영 선택)

- **C-N02**(judge.md #8, 참고): 07의 마이그레이션 최종 검증이 빈 DB 재구축(`db:reset:test`)에만 치우쳐 있다. 운영 배포 경로(`scripts/migrate-runner.ts:54`)는 실제로 증분 적용이라 안전하지만, 「기존 데이터 위 재생성 파일만 적용 → 행 보존 · 재실행 무변경」을 증명하는 사례가 없다. 04.1 스키마 변경(새 테이블 4개 + `users` null 허용 열 2개, 전부 추가만)에서는 실패 경로가 보이지 않아 이번 회차 필수는 아니다. 07 ④ VALIDATION에 선택 사례로 추가 권장.
- **B-A2**(judge.md #9, 참고 — 기결정 파생): 가져오기의 과거 연도 가드(`값을 바꿀 때만 거부`)는 오케스트레이터가 이미 수용한 ENG-5 편차(`tests-01-and-open-notes.md` 항목 8)의 직접 결과다. 그 결과로 빈 새 환경에 지난 연도 실제 값(예: 운영에서 넣은 2027-01-01=16)을 복원하면 대상 기본값(15)과 달라 가져오기 전체가 거부된다. 결정 번복 요구가 아니므로 등급을 올리지 않는다 — `docs/OPERATIONS.md`에 「새 환경 복원은 이 가드에 걸린다」 한 줄을 남기고, 복원 전용 모드(`--restore`, SYSTEM viewer 한정)는 04.4(복원 리허설) 후보로 넘긴다.

## 0단계 — 범위 점검

- 7개 플랜, 완전 직렬 체인(01→03→02→04→05→06→07), 약 90만 토큰 추정 유지. 세 레인 모두 범위를 더 줄일 여지가 없다고 판단(1차 리뷰·사용자 결정 반영 완료, HOLD SCOPE 유지).
- 06 Task 3 하나가 액션 3개·섹션·등록 폼·E2E 12사례 이상을 묶는 복잡도가 있으나 쪼개라는 제안은 하지 않는다(1차에서 이미 판정).

## 아키텍처

- 결재 엔진과 연차 도메인의 분리, 제출 시 결재선 고정, version 조건 UPDATE 우선 구조는 1차 리뷰대로 유지되어 타당하다.
- 이번 회차 약점은 walkRoute의 「종결 상태」·「빈틈 있는 step_index」 가장자리(A-01·A-02)와, 06↔03 사이의 「퇴직일을 먼저 읽는 계약」 누락(C-N01=C-03)이다. 셋 다 앞선 수정(1차 반영 지시 1~9)이 walkRoute 후보 판정 쪽만 다뤘고, 조회·표시 경로는 다루지 않은 데서 나온다.
- `cancelHistorizedValue`(B-NEW01)는 04.1 이전부터 있던 범용 함수인데, 04.1-04가 도입한 「지난 연도 보호」가 취소 경로에는 일관 적용되지 않은 누락이다.

## 코드 품질

- 실측 대조로 확인된 기존 인터페이스는 대부분 플랜 가정과 일치한다(eng-A 표 17건 중 15건 일치, 2건 불일치는 A-06·A-07로 P3).
- 액션 반환값이 DTO 투영을 우회하는 패턴(B-A1)과 충돌 문구 매핑 누락(B-C1)이 반복되는 축 — 「신규 조회·반환 경로는 등록된 DTO를 통과해야 한다」는 원칙을 07 SUMMARY나 다음 페이즈 참고로 명시할 가치가 있다.

## 테스트

```
결재 엔진(01·02)
  walkRoute 결정표 ── 단위: W1~W13, 자기 승인 재진입, 전사 단계 (1차 반영 완료)
  종결 상태 문서 조회 ─ GAP(A-01) — getApprovalView가 종결 상태도 walkRoute 돌림, 사례 없음
  폴백 행 step_index ─ GAP(A-02) — 빈틈 있는 결재선 사례 없음(통합 CEO-1은 전부 꺼짐이라 빈틈 없음)
  액션 반환값 투영 ─── GAP(B-A1) — 누수 스캔은 dtoName 등록만 검사, 실제 반환값 미검사
  충돌 문구(재신청 뒤)─ GAP(B-C1) — submitted+차수>1 매핑 없음

잔고(03)
  buildLeaveGrants ── 단위: 월차 k=1..11 · 퇴직 경계 (1차 반영 완료)
  월차 소멸 전 은닉 ── GAP(Codex A2-01) — 근속 1년 지나고 당해 적립 0인 해 조회 시 존재 조건 오판
  입사·퇴직 역전 ───── GAP(Codex A2-02) — DB CHECK·경합 테스트 없음
  설정 취소 경로 ───── GAP(B-NEW01) — cancelHistorizedValue 날짜 검증 없음

화면(05·06)
  E2E(등록 폼 4개) ─── GAP(C-01, BLOCKER) — 계획 grep이 못 찾음, 07에서야 동시에 깨짐
  퇴직일 선행 조회 ─── GAP(C-N01=C-03) — 06↔03 계약 없음
  가장 이른 신청 연도 ─ GAP(C-04) — 도메인 읽기 files 밖

병합(07)
  journal 가드 (a)~(f) ─ 유지(1차 반영 완료)
  마이그레이션 증분 검증 GAP(C-N02, 참고) — 빈 DB 재구축만 커버
  셸 변수 지속성 ────── GAP(C-05)
  STATE.md 재유입 ───── GAP(C-06)
```

## 성능

- 30명 규모에서 CRITICAL급 성능 문제 없음. P3 다수(B-P1·B-P2·C-P1~P4)는 관리자 화면·메뉴 권한 조회의 소폭 증가로, 대부분 무시 가능한 수준이거나 C-04(가장 이른 연도) 수정과 함께 자연히 닫힌다.

## 실패 모드

| 실패 | 사용자에게 보이는 것 | 테스트 | 처리 | 조용히 틀림? |
|---|---|---|---|---|
| 등록 폼 hireDate 필수(C-01) | 기존 E2E 4개가 07에서 동시 실패 | 07에서만(늦음) | — | **CRITICAL** — 06은 거짓 녹색 |
| 이력값 취소(B-NEW01) | 특권 사용자의 비정규 입력으로 과거 잔고 취소 가능 | 없음 | 없음 | 예 — 정상 UI 경로는 안전 |
| org_unit_id 비uuid(B-NEW02) | 가져오기 뒤 신규 연차 신청 전체가 원시 오류로 막힘 | 없음 | 원시 22P02 | 아니오(오류는 보임, 원인 불명확) |
| 퇴직일 선행 조회 없음(C-N01) | 사람 상세 섹션 연도가 올해로 잘못 고정될 수 있음 | 부분(타입 오류로 실행자가 자연히 잡을 가능성) | — | 가능 |
| 종결 문서 walkRoute(A-01) | 끝난 문서 열 때마다 `route_blocked` 경고 · `담당 없음` | 없음 | 로그만 | 예 — 운영 신호가 소음에 묻힘 |
| 폴백 step_index 충돌(A-02) | 빈틈 있는 결재선에서 폴백 승인 시 23505 | 없음 | 원시 오류 | 아니오(보임, 문서는 영구 정체) |
| 액션 반환값 누수(B-A1) | 결재자/기안자에게 투영 꺼진 이름·일수 노출 | 없음(누수 스캔은 등록만 검사) | — | 예 |
| STATE.md 재유입(C-06) | main에 조정자 결정 위반 커밋 유입 | 없음(검사 뒤 발생) | 없음 | 예 — CRITICAL 후보 |

## 이미 있는 것(재사용)

- `authedActionClient` · `UserFacingError` · `recordAction` deps · `registerDto`/누수 스캔 · `createFixtureUser` · `ui/button` `pending` · `ConfirmDialog` · 설정 이력형 `addHistorizedValue` · `scripts/reset-test-db.sh` · `ui/table` `CellIssue`(충돌 한 줄용, B-T4 표적) · `test/unit/leak-scan-coverage.test.ts`의 `findRegistryFiles`(재귀 파일 탐색, GAP-1류 가드에 재사용 가능). 새 의존성 없음.

## NOT in scope

- 지출결의 문서 종류(Phase 5) · 알림(04.2) · 공휴일 제외(04.2 뒤) · 첫 화면 「내 차례」 결재 행(Phase 4 병합 뒤) · 연차 수당 정산(D-97) · 퇴직일 로그인 차단(운영 절차 대체) · B-F04(설정 화면 보기 전용) · A-FF01(재시드 노출 되돌림, 1차 반영 지시 15) · B-A2의 `--restore` 복원 전용 모드(04.4 복원 리허설 후보).

## 병렬화

Sequential implementation, no parallelization opportunity. 완전 직렬 사슬(01→03→02→04→05→06→07) — 모두 `domain/leave` · `app/(app)/leave`를 공유하는 공유 로컬 DB(`erp` · `erp_test`)와 마이그레이션 두 개(01·03)가 체인을 강제한다.

## 결정 기록

이번 회차에는 사용자에게 물을 질문이 없었다. 플랜 수정은 전부 되돌리기 쉬운 편집이고 사용자 목표를 바꾸지 않는다.

### 자동 결정(질문 없이 정함)

- **Codex 결과의 심각도 분류는 Fable이 정한다**(프로젝트 지침) — judge.md의 9건 최종 판정(BLOCKER 1 · 경고 6 · 참고 2)을 그대로 채택했다. Codex 자신의 1차 등급(예: B-NEW01·B-NEW02를 BLOCKER로, C-N01을 BLOCKER로 표기)은 Fable이 완화 요인(정상 UI 경로에서는 안전, 실행자가 부분적으로 자연히 잡음 등)을 반영해 경고로 낮췄다.
- **B-A2는 참고로 유지** — 오케스트레이터가 이미 수용한 ENG-5 편차(`tests-01-and-open-notes.md` 항목 8, 「지난 연도 행은 값을 바꿀 때만 거부」)의 직접적 결과이기 때문이다. CLAUDE.md §7 「사용자가 이미 정한 결정은 바꾸지 않는다」에 따라 여기서 등급을 올려 되묻지 않는다.
- **C-N02는 참고로 유지** — 운영 배포 경로 자체(`migrate-runner.ts`)는 증분 적용이 맞게 동작하고, 04.1의 스키마 변경이 전부 「추가만」이라 현재로선 실패 경로가 보이지 않는다. 검증 커버리지 결함일 뿐 실행을 막지 않는다.

## Implementation Tasks

| # | 우선순위 | 작업 | Files | Verify |
|---|---|---|---|---|
| T1 | P1 | C-01: read_first grep 교체 + 등록 폼 E2E 4개에 입사일 필드 추가 | `04.1-06-PLAN.md`(read_first·files·Task3④·검증명령), `test/e2e/admin-master-list-first.spec.ts` · `corp-cards.spec.ts` · `mobile-corp-cards.spec.ts` · `single-column.spec.ts` | 넷 다 `pnpm playwright test`로 GREEN |
| T2 | P2 | B-NEW01: `cancelHistorizedValue`에 형식 검사 + 서울 기준일 주입 | `04.1-04-PLAN.md`(Task2①-c), `domain/settings/registry.ts` | 비정규 날짜 거부 · 연초 서울 경계 단위 사례 |
| T3 | P2 | B-NEW02: `org_unit_id` uuid 제약 | `04.1-01-PLAN.md:308`, `04.1-04-PLAN.md`(settings-export 통합) | 비uuid 가져오기 전체 거부 통합 사례 |
| T4 | P2 | C-N01=C-03: 퇴직일 선행 조회 계약 고정 | `04.1-06-PLAN.md`(Task3③) 또는 `04.1-03-PLAN.md`(좁은 읽기 추가) | 퇴직자 사람 상세에서 섹션 연도 정확 |
| T5 | P2 | A-01: 종결 상태 문서는 walkRoute 생략 | `04.1-01-PLAN.md:304` | 최종 승인 뒤 `getApprovalView` → `log.warn` 0회 |
| T6 | P2 | A-02: 폴백 행 `step_index` = max+1 | `04.1-01-PLAN.md:300`(②) | 2·4단 꺼짐·3단 빈 자리 → 폴백 승인 성공 |
| T7 | P2 | B-A1: 액션 반환값 `project()` | `04.1-02-PLAN.md:224`(④) | 투영 꺼진 계급의 반환 JSON에 이름/일수 없음 |
| T8 | P2 | A-03: 연차 이력 asOf 변환 도우미 한 곳 고정 | `04.1-03-PLAN.md:217`, `lib/dates.ts` | TZ=Asia/Seoul 로컬에서도 정확한 연도 |
| T9 | P2 | A-04: 사람관리 권한·검증 behavior 사례 4개 | `04.1-03-PLAN.md`(Task1·3), `test/integration/people.test.ts` · `leave-balance.test.ts` | PM 거부·날짜 역전 거부·행동 로그·보기 거부 GREEN |
| T10 | P2 | B-A3: document-kinds 가드 예외(import type·use client) | `04.1-02-PLAN.md:239` | 클라이언트 타입 import 오탐 사례 GREEN |
| T11 | P2 | B-C1: 재신청 뒤 충돌 문구 매핑 | `04.1-02-PLAN.md:346` | 다시 신청 상태 정확 일치 단언 |
| T12 | P2 | C-02: `ui/select` 빈 옵션 계약 재기술 | `04.1-06-PLAN.md:330` | 옵션 비교·기본값·`—` 선택 거부 사례 |
| T13 | P2 | C-04: 가장 이른 신청 연도 도메인 읽기 | `04.1-06-PLAN.md:169`(files), `domain/leave/index.ts` | 연도 select 옵션 정확 |
| T14 | P2 | C-05: 07 셸 변수 지속성 | `04.1-07-PLAN.md:91`·`:148`·`:208` | 빈 값 가드 · 값 유지 확인 |
| T15 | P2 | C-06: STATE.md 재유입 검사를 ship 직전으로 | `04.1-07-PLAN.md:29` | main diff에 STATE.md 없음 |
| T16 | P2 | C-07: E2E 픽스처 고유 이름 | `04.1-06-PLAN.md:268` | 이름 누수 단언이 실제로 판별력 있음 |
| T17 | P2 | GAP-1: VALIDATION 06 행 보강 | `04.1-VALIDATION.md:78-83` | 누락 행 채움 또는 `/gsd-validate-phase` 위임 명시 |
| T18 | P2 | Codex A2-01: 월차 존재 조건에 유효 부여 검사 추가 | `04.1-03-PLAN.md:37` | 1월 입사자 다음 해 조회·차감 사례 |
| T19 | P2 | Codex A2-02: hire/resignation DB CHECK + 경합 테스트 | `04.1-03-PLAN.md`(①), `db/schema/auth.ts` | 역전 CHECK 위반 · 동시 수정 경합 사례 |

## 부록 — Outside Voice(Codex) 요약

- 실행: `codex exec -s read-only`, reasoning high, gstack 타임아웃 래퍼. 갈래 A(01·03)·B(02·04·05)·C(06·07·교차)를 16:57Z(01:57 KST)에 동시 시작, 세 갈래 모두 EXIT 0.
- 갈래 A 판정: `막는 문제 없음`. Recommendation: 「03의 두 경계 조건을 보완한 뒤 구현하라 because 유효한 월차가 숨겨지고, 동시 날짜 수정으로 재직 기간이 역전될 수 있다.」
- 갈래 B 판정: `막는 문제 있음(2건)`. Recommendation: 「실행 전 계획 수정 because 취소 경로로 과거 잔고 보호를 우회할 수 있고, 허용된 설정 입력이 신규 신청을 중단시킬 수 있다.」
- 갈래 C 판정: `막는 문제 있음(1건)`. Recommendation: 「계획 수정 후 재검토 because 관리자 화면의 선행 날짜 조회 계약이 빠져 있고, 병합 검증에 기존 DB 업그레이드 경로가 없다.」
- Sonnet 1차 대조(codex-triage.md): Codex 새 지적 7건(A2-01·A2-02·B-NEW01·B-NEW02·B-NEW03·C-N01·C-N02) 전부 인용·재현 확인 — 「이미 처리됨/중복」 0건, 전부 revision 문서에 대응 문구 없는 신규 지적.
- Claude(Fable) 최종 교차검증: judge.md에서 Codex 새 지적 중 B-NEW01·B-NEW02·C-N01·C-N02 4건 + Opus 자체 발견 C-01(BLOCKER)·A-01·A-02·B-A1·B-A2 5건, 합 9건을 판정 — BLOCKER 1(C-01, Opus 발견) · 경고 6(B-NEW01·B-NEW02·C-N01·A-01·A-02·B-A1) · 참고 2(C-N02·B-A2). Codex 1차 등급 대비 3건(B-NEW01·B-NEW02·C-N01) BLOCKER→경고로 완화, 근거는 각 항목의 「완화」 문단(정상 UI 경로 안전 · 실행자 부분 자연 발견 등).
- 겹친 지적: C-N01(Codex)=C-03(Opus 갈래 C)이 같은 결함을 각자 찾았다 — 교차 검증됨.

## 부록 — 낮춘 지적

confidence ≤4로 보고된 항목(등급은 내리지 않았으나 근거가 약함을 표시):

- A-12(4/10) `buildLeaveGrants`의 `fiscalYears` 범위 미정 — P2로 유지하되 실행자 재량 여지 있음
- C-14(4/10) 월차 조정이 「적립」에 더해지는지는 03의 문자열 계약이 정함 — P3
- C-P3(4/10) 신규 E2E 다수로 desktop 프로젝트 실행 시간 증가 — P3, SUMMARY 기록으로 충분
- C-P4(4/10) 레이아웃 메뉴 권한 조회 1회 증가, 무시 가능 — P3

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| plan-eng-review | 1차 리뷰 뒤 수정본 게이트(2회차) | 결재 엔진 가장자리·잔고 경계·권한·병합 절차·테스트 커버리지 | 2 | issues_open | 막는 1 · 경고 6 · P2 12 · P3 36 |
| codex-plan-review | 게이트 필수(프로젝트 지침) | 적대적 독립 검토, 3갈래 | 2(3갈래) | issues_found | 막는 후보 3(A0·B2·C1) → Fable 판정 경고 2 + 경고 1(C-N01) + 참고 2, 근거 약한 신규 2(A2-01·B-NEW03) |
| plan-ceo-review | 소수점 페이즈 면제(PR #68 skill-gate) | HOLD SCOPE 유지, 이번 회차는 실행 가능성만 | 0(면제) | not_run | 대상 아님 |
| plan-design-review | 다음 게이트 | 반영 지시 완료 뒤 화면 일관성 검토 | 0 | not_run | 미실행 |

**OUTSIDE COVERAGE:** Codex 3갈래가 7개 플랜 전부와 기존 코드(`domain/settings`·`domain/people`·`scripts/migrate-runner.ts` 등)를 직접 열어 대조했다.

**CROSS-MODEL:** 두 모델이 겹친 지적 1건(C-N01=C-03, 퇴직일 선행 조회 없음) — Codex와 Opus 갈래 C가 독립적으로 같은 결함을 찾았다. Codex만 찾은 것 중 확인 4건(B-NEW01·B-NEW02·C-N01·C-N02). Opus만 찾은 것 5건(C-01·A-01·A-02·B-A1·B-A2).

**VERDICT:** 막는 문제 있음(1건) — eng review required after revision. 다음 세션이 T1~T19를 `/gsd-plan-phase 04.1` 수정 회차로 넣고 → 체커 → Codex(바뀐 부분) 재검토를 「막는 문제 없음」까지 반복한 뒤, 최종 전체 Codex 재확인 → `/plan-design-review 04.1` + Codex로 간다.

NO UNRESOLVED DECISIONS
