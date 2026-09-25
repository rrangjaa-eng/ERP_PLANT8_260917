# Phase 04.1 2차 eng review — Lane C (04.1-06 · 04.1-07 · 교차 일관성 · VALIDATION)

기준 트리: `claude/phase-04.1-plan-1iqtwe` @ 1ad17aa (origin/main 0dab476 병합 완료). READ-ONLY 검토 — 저장소 파일은 고치지 않았다.
판정 대상 밖(재론 금지): 1차 eng review 1~25, Codex 4회차까지 판정된 항목, B-F04 · A-FF01, 사용자 확정 결정(비례 연차 · 월차 입사일 기준 · 월차/연차 분리 · 기안자 겸 담당 승인+회수).

## 0. Scope check

- 06: 파일 29개(새 화면 3 · 셸 2 · 사람 관리 5 · E2E 9 · 문서 2 …), 작업 3개, 약 145k 토큰. 07: 병합·재생성·전체 게이트. 둘 다 범위는 ROADMAP 기준 4·5와 UI-SPEC S1·S2·S9·S10에 맞는다. 줄일 곳: 없음. 이미 판정된 항목이 대부분이라 새 기능 확장도 없다.
- 복잡도 냄새: 06 Task 3 한 task가 액션 3개 · 섹션 · 등록 폼 · E2E 12사례 이상을 다 가진다. 쪼개라는 제안은 하지 않는다(판정됨). 다만 아래 C-01·C-03은 이 task가 기존 코드와 부딪히는 자리다.
- main 최신 확인: `db/migrations` 마지막 = `0010_revenue_entries`(journal idx 10, `when` 엄격 증가 확인). `ui/confirm-dialog` · `lib/dates.ts` · `test/unit/db/migration-journal.test.ts` · `test/unit/document-kinds-import.test.ts`는 main에 없음 — 각각 04.1-05 · 04.1-01 · 04.1-01 · 04.1-02가 만든다(교차 확인 완료). `docs/ARCHITECTURE.md` 마지막 §4 절은 `## 4-7.`(149행)이고 §4-8은 아직 없다.

## 1. Architecture (최대 8)

**[P2] C-03 (confidence: 7/10) `.planning/phases/04.1-approvals-leave/04.1-06-PLAN.md:337` — 섹션 연도를 정하려면 퇴직일이 먼저 필요한데, 퇴직일을 줄 읽기가 연도를 받아야 한다(닭과 달걀)**
- 계획: 「섹션 연도 = `resolveLeaveYear(searchParams.year, seoulToday()의 연도, 대체 연도)` … 사람 상세는 퇴직일이 있으면 min(퇴직 연도, 올해)를 넘긴다 … 그 값 하나를 `getLeaveBalanceForUser`의 `fiscalYear` · `listLeaveAdjustmentsForUser`의 `fiscalYear` · 섹션 `year` prop … 에 같이 넘긴다 — 따로 계산하지 않는다.」
- 기존 코드: `app/(app)/admin/people/[id]/page.tsx:47-52` `const [detail, roles, orgUnits, teams] = await Promise.all([ getPerson(session.viewer, id), …` — `getPerson`의 `PersonDto`(`domain/people/index.ts:59` `export const PERSON_DTO_SPEC`)에는 입사일·퇴직일이 없다. 04.1-03은 입사일·퇴직일을 `LEAVE_BALANCE_DTO_SPEC`에만 둔다(04.1-03:217 「본인·관리자용 … `LEAVE_BALANCE_DTO_SPEC`(퇴직 줄에 필요한 입사일·퇴직일을 여기에만 둔다)」) — 그 읽기가 `getLeaveBalanceForUser(viewer, userId, {fiscalYear}, deps?)`로 연도를 먼저 요구한다. 어느 플랜도 `getPerson`을 넓히지 않는다(`grep getPerson 04.1-0*-PLAN.md` 0건).
- 영향: 실행자는 (a) 올해로 한 번 읽어 퇴직일을 얻고 다시 읽거나(수락 기준 「`resolveLeaveYear(` 정확히 1」은 지킬 수 있지만 잔고 읽기가 둘), (b) repositories를 직접 부르려다 eslint 경계에 막힌다. 입사일·퇴직일 입력 칸의 초기값과 `checkLeaveAdjustment`의 `hireDate`도 같은 출처가 필요하다. 추가로 이 두 필드가 `leave.value` 투영 뒤라, 노출이 꺼진 계급이 보면 퇴직일을 몰라 기본 연도가 올해로 떨어진다.
- 수정 방향: 06 Task 3 ③에 「첫 읽기는 `getLeaveBalanceForUser(…, {fiscalYear: 올해})`로 입사일·퇴직일을 얻고, 섹션 연도가 올해와 다를 때만 그 연도로 한 번 더 읽는다」를 명시하거나, 04.1-03에 연도 없이 입사일·퇴직일만 주는 좁은 읽기(`admin.people` view · `leave.value` 투영)를 하나 더한다. 둘 중 하나를 정해 read_first/interfaces에 적는다.

**[P2] C-04 (confidence: 7/10) `04.1-06-PLAN.md:169` — 연도 select의 「가장 이른 신청 연도」를 줄 도메인 읽기가 없다**
- 계획: 「연도 select 옵션 = min(그 사람의 가장 이른 신청 연도(없으면 올해), 요청 연도) ~ 올해」 · Task 1 ③ 「`getMyLeaveBalance` + `listMyLeave` 병렬」.
- 교차 플랜: 04.1-01:306 「`getLeave`·`listMyLeave(viewer, fiscalYear)`가 이것만 부른다」 — 한 해 목록만 준다. 04.1-01~05 어디에도 「가장 이른 연도」 읽기가 없고(`grep earliest|가장 이른` 0건), 06 `files_modified`에 `domain/leave/index.ts` · `repositories/leave-requests.ts`가 없다.
- 영향: 실행자가 2000년부터 해마다 `listMyLeave`를 부르거나(성능 C-P1), 계획 밖 파일을 고친다(스코프 위반).
- 수정 방향: 06 files에 `domain/leave/index.ts`(+ 리포지토리 한 줄 `min(extract(year …))`)를 더하고 interfaces에 `listMyLeaveYears(viewer)` 또는 `earliestLeaveYear(viewer)`를 적는다. 또는 `listMyLeave` 결과 DTO에 그 값을 싣는다고 01에 적는다.

**[P2] C-06 (confidence: 7/10) `04.1-07-PLAN.md:29` — 07 Task 2가 확인한 뒤 GSD 메타 커밋이 STATE.md를 다시 바꾼다**
- 계획: 「병합 때 `git checkout origin/main -- .planning/STATE.md`로 main의 STATE.md를 가져와 … 최종 트리와 병합한 main 커밋의 diff에 STATE.md가 없다」 · 다섯째 검증 명령이 `.planning/STATE.md`를 금지 경로로 본다.
- 기존 코드: `.claude/gsd-core/workflows/execute-plan.md:541` `gsd_run query commit "docs({phase}-{plan}): complete [plan-name] plan" --files .planning/phases/XX-name/{phase}-{plan}-SUMMARY.md .planning/STATE.md .planning/ROADMAP.md .planning/REQUIREMENTS.md` — 플랜 task가 끝난 **뒤에** STATE.md를 고쳐 커밋한다(이후 `/gsd-verify-work`도 고친다).
- 영향: 07의 검증은 초록인데 브랜치 끝 트리는 STATE.md 차이를 가진 채 `/ship`으로 간다 — 조정자 결정(04.1이 main에 STATE 변경을 가져가지 않는다)이 조용히 깨진다. 판정된 결정 자체를 재론하는 것이 아니라, 그 결정을 지키는 검사의 **실행 순서**가 GSD 흐름과 어긋난다는 지적이다.
- 수정 방향: STATE.md 복원·검사를 `/ship` 직전 단계(또는 `/gsd-verify-work` 뒤) 한 줄로 옮기고, 07에는 「검사는 Post-build 직전에 다시 돈다」만 남긴다.

**[P3] C-09 (confidence: 6/10) `04.1-06-PLAN.md:50` — `ui/table`에 행 전체 링크 기능이 없다**
- 계획: 「행 전체가 `/leave/[id]` 링크다」.
- 기존 코드: `ui/table/Table.tsx:28-57` `TableProps`에 `onRowTap?: (row: Row) => void;`만 있고 href 계열 prop이 없다. 선례 `app/(app)/projects/projects-table.tsx:96` `<Link href={`/projects/${row.id}`} className={styles.link}>`는 한 칸만 링크다.
- 수정 방향: 「종류·기간 칸이 링크 + 폰은 `onRowTap`으로 이동」처럼 기존 선례로 적거나, `ui/table` 변경을 files에 넣는다(SYSTEM.md 절차 필요).

**[P3] C-10 (confidence: 6/10) `04.1-07-PLAN.md:185` — 계약 절 (4)가 없을 수도 있는 §4-8을 무조건 가리킨다**
- 계획: 「(4) 설정·소속 스냅숏은 트랜잭션을 열기 전에 읽는다(`prepareSubmission` — §4-8 잠근 트랜잭션 규약 준수)」 · 같은 문단 「(04-32가 §4-8을 넣었으면 §4-9)」.
- 기존 코드: `docs/ARCHITECTURE.md:149` `## 4-7. 목록·검색 인덱스(Phase 4, 04-05)` 다음이 `## 5.`(168행). `grep 잠근\|트랜잭션 docs/ARCHITECTURE.md` 0건.
- 영향: 04-32가 먼저 병합되지 않으면 새 절 자신이 §4-8이 되어 자기를 인용한다.
- 수정 방향: 「§4-8이 있을 때만 그 번호를 인용, 없으면 `TX_LOCK_TIMEOUT`류 규약 이름 없이 한 줄」로 조건을 붙인다.

## 2. Code quality (최대 8)

**[BLOCKER] C-01 (confidence: 9/10) `04.1-06-PLAN.md:339` + `:308` — 입사일 필수화가 등록 폼을 쓰는 기존 E2E 넷을 깨는데, 계획의 grep이 그 넷을 못 찾는다**
- 계획(:339): 「`people.spec.ts` · `mobile-people.spec.ts`(와 grep으로 찾은 등록 폼 사용 스펙)의 등록 단계에 입사일 채우기를 더한다」, read_first(:315): 「`grep -rln "people?new=1" test/e2e`로 등록 폼을 쓰는 다른 스펙이 있는지 확인한다」, files(:308)에는 `people.spec.ts` · `mobile-people.spec.ts`만.
- 기존 코드: `grep -rln "people?new=1" test/e2e` → **0건**(스펙은 URL이 아니라 링크를 누른다 — `test/e2e/people.spec.ts:24` `await page.getByRole("link", { name: "사람 등록" }).click();`). 같은 폼을 제출하는 스펙이 넷 더 있다: `test/e2e/admin-master-list-first.spec.ts:108` · `test/e2e/corp-cards.spec.ts:27` · `test/e2e/mobile-corp-cards.spec.ts:34` · `test/e2e/single-column.spec.ts:104` — 모두 `await page.getByRole("button", { name: "사람 등록" }).click();` 앞에 입사일 입력이 없다(예: `corp-cards.spec.ts:24-26` 이름·이메일·계급만 채움).
- 영향: 06 Task 3의 E2E 검증 명령(:348)은 이 넷을 돌리지 않아 초록으로 끝나고, 07 Task 2 `pnpm test:e2e:ci`에서 넷이 한꺼번에 깨진다 — 06 수락 기준을 통과한 상태가 틀린 동작이다. 게다가 이 넷은 06 files 밖이라 07에서 고치면 스코프 위반이다.
- 수정 방향: read_first grep을 `grep -rln 'name: "사람 등록" }).click' test/e2e`로 바꾸고, 네 파일을 files_modified와 Task 3 ④·셋째 검증 명령에 더한다.

**[P2] C-02 (confidence: 8/10) `04.1-06-PLAN.md:330` + `:335` — 공용 `ui/select`는 늘 빈 `—` 옵션을 먼저 그린다**
- 계획(:330): 「입사일 없는 전용 사람은 Select 옵션이 `연차` 하나뿐이고(`월차` 옵션 없음 — CX2-03)」, (:335) 「잔고 Select는 `연차`가 기본값이고 … 공용 `ui/select/Select.tsx`는 옵션 비활성을 받지 않고 이 플랜은 고치지 않는다」.
- 기존 코드: `ui/select/Select.tsx:29` `<option value="">—</option>` — `options` 앞에 무조건 붙는다(주석 4-6행 「고를 것이 없으면(옵션 0개) 첫 옵션이 em dash」).
- 영향: 「옵션이 `연차` 하나뿐」을 옵션 목록 전체 비교로 단언하면 `["—","연차"]`라 RED, 아니면 단언이 느슨해진다. 사용자가 `—`를 고르면 `bucket` 빈 값이 서버 zod로 가고, 「할 수 없는 선택지는 보이지 않게」(CLAUDE.md §7)와도 어긋난다. 기본값 `연차`도 `defaultValue`/제어값을 명시하지 않으면 `—`가 선택된다.
- 수정 방향: 계약을 「`—`를 뺀 옵션이 `연차` 하나」로 고쳐 적고, 기본 선택은 제어값 `annual`로 명시, `—` 선택 시 서버 거부 문구 한 줄을 behavior에 둔다(공용 컴포넌트 불변 결정은 그대로).

**[P2] C-05 (confidence: 7/10) `04.1-07-PLAN.md:91` · `:148` · `:208`, `04.1-06-PLAN.md:162` — 검증 명령이 앞 단계에서 「적어 둔」 셸 변수를 읽지만 Bash 호출 사이에 셸 상태가 남지 않는다**
- 계획(07:91): 「`git merge-base HEAD origin/main` 값을 `PHASE_BASE`로, `git rev-parse origin/main` 값을 `MAIN_SHA`로 적어 둔다」, 검증(07:148) `test "$MAIN" = "$MAIN_SHA"` · `grep -vxF -f <(printf '%s\n' "$MANIFEST")`, (07:208) `test "$NOW" = "$REMOTE_HEAD_START"`, 06:162 `git diff "$PLAN_BASE"..HEAD`.
- 기존 환경: Claude Code Bash 도구 설명 「Shell state (env vars, functions) does not persist」 — 각 `<automated>`가 새 셸이다.
- 영향: 대부분은 빈 값에서 git 오류로 **시끄럽게** 실패한다(좋다). 그러나 07:208의 `REMOTE_HEAD_START`는 원격에 브랜치가 없으면 둘 다 빈 값이라 공허하게 통과하고, `MANIFEST`가 비면 07:148의 `grep -vxF -f <(printf '\n')`가 빈 패턴으로 모든 줄을 걸러 manifest 밖 삭제를 못 잡는다(빈 문자열 패턴은 `-x`에서 빈 줄만 맞으므로 이 경우는 실패 쪽 — 다만 실행자가 첫 실패 뒤 변수를 즉석으로 다시 만들며 기록값과 어긋날 수 있다).
- 수정 방향: 시작 때 값을 git이 무시하는 파일(예: 스크래치패드 `04.1-07.env`)에 쓰고 각 검증 명령 첫머리를 `. <그 파일> && test -n "$MAIN_SHA" && test -n "$PHASE_BASE" …`로 한다 — 빈 값이면 멈추는 가드를 명시한다.

**[P2] C-07 (confidence: 6/10) `04.1-06-PLAN.md:268` — 픽스처 사용자 이름이 전부 `E2E Employee`라 「이름 없음」 단언이 성립하지 않는다**
- 계획: 「그 사람 이름과 전용 팀장 이름이 신청 창 글자 어디에도 없다. 양성 대조는 첫 줄(기본 계급 사용자의 결재선 한 줄이 기안자 이름으로 시작)」 · :160 「잔고를 단언하는 사례는 스펙 안에서 `createFixtureUser`로 만든 전용 사용자를 쓴다」.
- 기존 코드: `test/e2e/fixtures.ts:12` `const name = options.roleId === SYSADMIN_ROLE_ID ? "E2E Admin" : "E2E Employee";` — 이름 인자가 없다. 셸 상단 바가 그 이름을 늘 보인다(`test/e2e/keyboard-nav.spec.ts:66` `page.getByRole("button", { name: "E2E Employee" })`).
- 영향: 기안자·팀장 이름이 같아 누수와 정상이 구분되지 않고, 단언 범위를 페이지 전체로 잡으면 상단 바 때문에 늘 RED다. 「신청 창」의 범위도 정의되지 않았다.
- 수정 방향: 이 사례의 사람은 도메인 `registerPerson`(고유 이름 · `userId` 반환)으로 만들고, 단언 범위를 폼 영역 locator로 명시한다. `fixtures.ts`는 files에 없으므로 고치지 않는다.

**[P3] C-11 (confidence: 7/10) `04.1-06-PLAN.md:295` — `aria-disabled` 부재 단언은 공허하다**
- 계획: 「초과 경고가 있어도 1차가 `aria-disabled`가 아니다(E2E 단언)」.
- 기존 코드: `ui/button/Button.tsx:45` `disabled={isDisabled}` — 버튼은 `aria-disabled`를 한 번도 쓰지 않는다.
- 수정 방향: `await expect(submit).toBeEnabled()`로 바꾼다.

**[P3] C-12 (confidence: 5/10) `04.1-06-PLAN.md:333` — 연도 상한 zod가 모듈 로드 때 굳을 수 있다**
- 계획: 「zod가 연차면 `fiscalYear` 정수 2000 ≤ y ≤ `seoulToday()`의 연도를 요구」.
- 기존 코드 모양: `app/(app)/admin/people/actions.ts:20-28` `.schema( z.object({ … }) )`가 모듈 최상위에서 한 번 만들어진다.
- 영향: `.max(Number(seoulToday().slice(0,4)))`로 쓰면 Cloud Run 인스턴스가 새해를 넘기는 동안 옛 상한이 남는다(CEO-11의 새해 규칙과 같은 종류).
- 수정 방향: `.refine(y => y <= Number(seoulToday().slice(0, 4)))`처럼 호출 때 평가한다고 적는다.

**[P3] C-13 (confidence: 5/10) `04.1-06-PLAN.md:328` — `required` 속성을 쓰면 서버 문구가 안 나온다**
- 계획: 「입사일을 비우고 등록하면 `입사일 비어 있음 · 입사일 적기`로 막히고」.
- 기존 코드: `app/(app)/admin/people/person-form.tsx:77` `<TextField id="name" name="name" label="이름" required error={nameError} />` — 같은 폼의 다른 칸은 네이티브 `required`라 브라우저가 제출을 먼저 막는다.
- 수정 방향: 입사일 칸은 `required` 없이 서버 zod 문구로 막는다고 적는다(또는 E2E가 네이티브 검증을 단언).

**[P3] C-14 (confidence: 4/10) `04.1-06-PLAN.md:322` — 월차 조정이 「적립」에 더해지는지는 03의 문자열 계약이 정한다**
- 계획: 「월차 줄 적립이 1일 늘어난다」. 연차는 `조정 -1일` 항목이 따로 있다(04.1-03:298 `연차 15일 · 조정 -1일 · …`).
- 수정 방향: 기대값을 `formatBalanceLines`로 계산해 단언한다고 적는다(숫자·낱말을 06이 새로 정하지 않는다).

## 3. Tests (최대 8)

### 3-1. 경로 추적 (ASCII coverage)

```
[셸] layout.tsx can(leave,view) ─► roleMenu.accountGroup(+연차)
   ├─ role-menu.test (leave 有/無) ............................. PLANNED(06-T1 unit)
   ├─ PC 메뉴 순서(관리자/비관리자, 배열 비교) ................. PLANNED(leave-list E2E)
   ├─ 폰 더보기 → 연차 ......................................... PLANNED(mobile-leave-list)
   ├─ mobile-shell 기대값 = 실제 권한 .......................... PLANNED(ENG-7)
   └─ keyboard-nav / user-menu / admin-nav 회귀 ................ user-menu만 명시 실행 → GAP-3
[/leave] requireSession → view? 404 → resolveLeaveYear → balance ∥ list → 표
   ├─ 404(view 없음) ........................................... PLANNED
   ├─ D6 네 갈래(Y-1 · Y+1 · abc · 1999) ....................... PLANNED
   ├─ 가장 이른 연도 옵션 ...................................... 데이터 출처 없음 → C-04
   ├─ 그룹 순서·합계 없음·EMPTY 두 갈래·write 없음 ............. PLANNED
   └─ loading/error ........................................... grep만(렌더 E2E 없음) → GAP-4 [→E2E 선택]
[/leave/new] change → previewLeaveAction(assertLeaveWrite 첫 줄)
   ├─ 힌트·잔고 행·결재선(투영 켬/끔/둘 다 끔) ................ PLANNED (이름 단언은 C-07)
   ├─ 순차 전송(쥔 응답) ....................................... PLANNED
   ├─ 권한 없는 직접 호출 ...................................... 04.1-02 leave-permission(도메인) ✓
   ├─ 두 번 제출 1건(CEO-12) ................................... PLANNED(E2E) · VALIDATION 행 없음 → GAP-1
   └─ 다시 신청 모드 회귀 ...................................... leave-document.spec 재실행 ✓
[/admin/people/[id]] view → (퇴직일?) → 섹션 연도 → balance ∥ adjustments
   ├─ 섹션 연도 계산 입력(퇴직일) .............................. 출처 없음 → C-03
   ├─ blur 저장 + revalidatePath .............................. PLANNED
   ├─ 조정 연도(Y, Y-1, 월차 null), 퇴직 네 사례 ............... PLANNED · VALIDATION에 퇴직 행 없음 → GAP-1
   ├─ 보기만 / 노출 없음 / 권한 없음 ........................... PLANNED
   └─ 월차 옵션 숨김·복귀·되돌림 ............................... PLANNED (`—` 옵션 → C-02)
[등록 폼] hireDate 필수
   ├─ people / mobile-people ................................... PLANNED
   └─ admin-master-list-first / corp-cards / mobile-corp-cards / single-column ... GAP-2 (CRITICAL, C-01)
[07] merge → manifest 삭제 → db:generate → 빈 DB → 트레이서 → CI=true 전체
   ├─ 갈래 판정·삭제 범위·연속성 ............................... PLANNED(git 명령)
   ├─ 셸 변수 지속 ............................................. C-05
   └─ STATE.md 불변 ............................................ 검사 뒤 GSD 메타 커밋 → C-06
```

### 3-2. GAP 목록

- **GAP-1 [P2] (confidence: 8/10) `.planning/phases/04.1-approvals-leave/04.1-VALIDATION.md:78-83`** — Per-Task 표의 06 행이 CX-R5 · CX-R3 · CX-R4 · D6 · R1 · D4 · ENG-7 · CX-R2 · CX-R5(조정) · S9-FY만 있다. 계획이 실제로 만드는 다음 테스트에 행이 없다: CEO-12 두 번 제출(06:271 「`Ctrl+Enter`를 연달아 두 번 치면 새 신청은 한 건이다」), 등록 입사일 필수(06:328), 퇴직자 기본 섹션 연도(06:324 CXF2-C-F2-01 · 06:325-326 CXF3), CX2-02 계급 B `1단 → 2단`(06:269), A1 `role-menu.test.ts` 두 경우 · PC 메뉴 순서 배열 비교(06:199), 07 Task 1 넷째 명령(병합 트리 빈 DB 트레이서, 07:154). Wave 0 목록(VALIDATION `## Wave 0 Requirements`)에도 `leave-list.spec.ts` · `admin-person-leave.spec.ts` · `mobile-leave-list.spec.ts`가 없다. 수정 방향: 행을 더하거나 `/gsd-validate-phase`가 채운다고 명시(지금 머리말 「나머지 task 행은 `/gsd-validate-phase`가 채운다」가 있어 P2에 그친다).
- **GAP-2 [BLOCKER — C-01과 같은 건]** 등록 폼 스펙 넷.
- **GAP-3 [P3] (confidence: 5/10)** 계정 그룹에 항목이 하나 늘면 PC 메뉴 키보드 이동을 보는 `test/e2e/keyboard-nav.spec.ts`(73행 `menu.getByRole("menuitem", { name: "내 정보" })`)와 `admin-nav.spec.ts`(126행)는 06 검증 명령(:220)에 없다 — 이름으로 찾으므로 깨질 가능성은 낮지만 06 안에서 한 번 돌리면 07에서 늦게 발견하지 않는다.
- **GAP-4 [P3]** `/leave` `loading.tsx`·`error.tsx`는 grep 수락 기준뿐이다(06:239). 05의 결재함 오류 경로 E2E 선례가 있으면 한 사례로 충분.

### 3-3. CRITICAL 회귀 위험
1. C-01 — 기존 E2E 네 파일(사람 등록 · 법인카드 소지자 등록 · 단일 기둥)이 07 전체 게이트에서 동시에 깨진다.
2. C-06 — 브랜치가 STATE.md 변경을 main으로 가져간다(조정자 결정 위반), 검증은 초록.
3. 계정 그룹 변경은 `mobile-shell.spec.ts` 외 셸 스펙도 건드린다(GAP-3).

## 4. Performance (최대 8)

**[P3] C-P1 (confidence: 6/10) `04.1-06-PLAN.md:169`** — C-04를 해마다 `listMyLeave`로 풀면 `/leave` 한 번에 최대 (올해−2000+1)회 조회. 단일 집계 쿼리로 해결(C-04 수정과 같다).

**[P3] C-P2 (confidence: 5/10) `04.1-06-PLAN.md:170`** — 계획 가정 2: 「응답 순서는 Next 16의 서버 액션 순차 전송이 보장한다」. 같은 규칙 때문에(`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:28` 「the second waits for the first to finish」) 날짜를 바꾼 직후 `Ctrl+Enter`의 제출 액션은 대기 중인 미리보기 뒤에 줄을 선다. 사용자 10~30명 규모에서 체감 지연은 미리보기 1~2회 왕복이라 수용 가능 — 다만 1차 `pending`이 켜지는 시점(누른 즉시 vs 제출 요청 시작)을 E2E가 「누른 직후」로 단언하므로 구현은 클릭 즉시 ref·상태를 켜야 한다고 적어 두면 좋다.

**[P3] C-P3 (confidence: 4/10)** 새 E2E(leave-list ~20사례 · admin-person-leave ~12사례 · 각 사례가 전용 본부·팀·계급·사용자 생성, `onStableSeoulDay` 재실행 가능)로 desktop 프로젝트(`fullyParallel: false`) 시간이 늘어난다. 07 게이트 시간 예산을 SUMMARY에 적는 정도로 충분.

**[P3] C-P4 (confidence: 4/10)** `app/(app)/layout.tsx:25-27` `MENUS.map(async (menu) => ((await can(viewer, menu.key, "view")) …` — `leave` 한 키가 늘 뿐, 기존 주석(「사용자 10~30명 사내 시스템이라 개별 호출을 최적화하지 않는다」) 범위 안. 조치 불필요.

## 5. Failure modes

| 경로 | 실패 | 테스트가 잡나 | 오류 처리 | 사용자에게 보이나 |
|---|---|---|---|---|
| 등록 폼 hireDate 필수 | 기존 4스펙 등록 실패 | 07 게이트에서만(늦게) | — | 테스트만 |
| 사람 상세 섹션 연도 | 퇴직일 모름 → 올해로 기본 | 퇴직 E2E가 잡음(실행자 즉석 해결 유도) | 없음 | 잘못된 연도 조정(조용함) |
| 조정 Select `—` 선택 | bucket 빈 값 | 없음 | 서버 zod | 일반 오류 문구 |
| 연도 select 옵션 | 가장 이른 연도 없음 | D6 E2E(옵션 정확 비교) | — | 옵션 부족 |
| 07 셸 변수 비어 있음 | git 오류 / 공허 비교 | 부분 | 없음 | 해당 없음 |
| STATE.md 메타 커밋 | main에 STATE 변경 유입 | 없음(검사 뒤 발생) | 없음 | 조용함 — **CRITICAL** |
| 새해 경계 zod 상한 | 새해 연차 조정 거부 | 없음 | zod 문구 | 보임 |
| 미리보기 뒤 제출 대기 | 제출 지연 | 없음 | pending | 느림만 |

조용한 실패 + 테스트 없음 + 보이지 않음: STATE.md 유입(C-06), 퇴직자 섹션 연도(C-03 — 실행자가 잘못 풀 경우).

## 6. Worktree 병렬화 (waves)

| Wave | Plan | depends_on | 주요 모듈 |
|---|---|---|---|
| 1 | 01 | — | db/schema · domain/approvals · domain/leave · repositories · lib/dates |
| 2 | 03 | 01 | db/schema · domain/leave/balance* · domain/people |
| 3 | 02 | 01, 03 | app/(app)/leave · app/(app)/approvals · domain/approvals |
| 4 | 04 | 01, 02 | app/(app)/admin/settings · domain/settings · playwright.config |
| 5 | 05 | 02, 03, 04 | ui/approval-route · ui/confirm-dialog · app/(app)/approvals · app/(app)/leave |
| 6 | 06 | 03, 05 | ui/shell · app/(app)/leave · app/(app)/admin/people |
| 7 | 07 | 04, 06 | 병합 · db/migrations · docs |

- 완전 직렬 사슬(01→03→02→04→05→06→07). 병렬 lane 없음 — 모두 `domain/leave` · `app/(app)/leave`를 공유한다.
- 유일한 후보: 06 Task 3(사람 상세 · 등록 폼, `app/(app)/admin/people/*`)는 03 + `year-param.ts`에만 기대므로 04·05와 병렬 가능하다. 다만 `test/integration/leak-scan.test.ts` 끝 덧붙이기가 01·02·06에서 겹치고 이득(한 task)이 작아 권하지 않는다. 결론: 순차 실행 유지.

## 7. What already exists (재사용 확인)

- 셸 계정 그룹 합성: `ui/shell/role-menu.ts:153` `function buildAccountGroup(): AccountEntry[]`(인자 없음 — 06이 viewer 인자를 더한다) · `ui/shell/TopBar.tsx:51-56` `adminMenu` 뒤 `accountGroup.filter((entry) => !isSettingsEntry(entry))` — 연차는 href가 `/settings`가 아니라 거르지 않는다. TopBar 수정 불필요.
- 권한 계산: `app/(app)/layout.tsx:24-28` MENUS × `can()` → `allowedMenus` — 06이 고치지 않는다(맞음).
- mobile-shell 기대값: `test/e2e/mobile-shell.spec.ts:150` `roleMenu({ roleId: DEFAULT_ROLE_ID, allowedMenus: [] })` — ENG-7 지적 그대로 존재. `can(viewer)`는 `viewer.id`를 쓰지 않아(`repositories/permissions.ts:16` `void viewer;`) 임의 id로 호출 가능 — 계획대로 성립.
- role-menu 단위 테스트: `test/unit/ui/role-menu.test.ts:40` `doc.match(/「계정」\s*그룹\(([^)]+)\)/)` · `:332` 「accountGroup은 계급과 무관하게 같다」 — 06이 두 경우로 고쳐야 하는 줄.
- 즉시 저장 + revalidate 선례: `app/(app)/admin/people/actions.ts:37-42` `changePersonRoleAction` → `revalidatePath(`/admin/people/${parsedInput.userId}`)` ✓(계획 인용과 일치).
- 버튼 pending: `ui/button/Button.tsx:32` `const isDisabled = pending || disabled;` · `:49` `…` 표시 ✓(CEO-12에 충분).
- 폼 힌트: `ui/form/Form.tsx:41` `FormHint` ✓.
- 목록 표: `ui/table/Table.tsx` `groupBy`(첫 등장 순서 — 상태 순서는 행을 미리 정렬해야 함) · `caption` sr-only ✓, 행 링크 없음(C-09).
- 오류 경계: `app/(app)/error.tsx:25` `화면을 불러오지 못했습니다` ✓(CX-R9).
- 서버 액션 순차 전송 문서: `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:26-30` ✓(CX-R4 근거 성립).
- drizzle 건너뛰기 판정: `node_modules/drizzle-orm/pg-core/dialect.js:60-62` `if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)` ✓(07:25 인용 정확).
- DB 스크립트: `scripts/reset-test-db.sh`(DROP/CREATE erp_test) ✓ · `scripts/dev-db.sh` `create_db_if_missing` ✓(CEO-16 전제 정확).
- 문서 상한: `test/unit/docs-limits.test.ts:23` `toBeLessThanOrEqual(300)` — ARCHITECTURE 현재 237줄, 여유 충분.
- 누수 스캔 등록 강제: `test/unit/leak-scan-coverage.test.ts`가 `app` 아래 모든 `actions.registry.ts`의 import를 요구 ✓(06 새 registry가 걸린다).
- 페이지 세션 가드: `test/unit/page-auth-guard.test.ts` `requireSession` 문자열 검사 ✓.
- E2E에서 도메인 직접 호출 선례: `test/e2e/fixtures.ts`(createAccount) · `test/e2e/projects-list.spec.ts:11` `findUserIdByEmail`(db 직접) — 06 스펙의 `userId` 확보 방법으로 재사용 가능.
- Playwright 프로젝트: 지금 `desktop` · `mobile-375` 둘(`playwright.config.ts`); `desktop-settings`는 04.1-04가 더한다 — 07:205의 세 프로젝트 순서는 04 실행 뒤 성립.

## 8. 요약 표

| ID | 심각도 | 위치 | 한 줄 |
|---|---|---|---|
| C-01 | BLOCKER | 04.1-06-PLAN.md:339/:315 | 입사일 필수화가 기존 E2E 4개를 깨고 계획 grep(0건)이 못 찾음 |
| C-02 | P2 | 04.1-06-PLAN.md:330 | `ui/select`의 `—` 빈 옵션 — 「옵션 연차 하나뿐」·기본값 계약 불성립 |
| C-03 | P2 | 04.1-06-PLAN.md:337 | 섹션 연도에 필요한 퇴직일의 출처가 연도를 먼저 요구 |
| C-04 | P2 | 04.1-06-PLAN.md:169 | 「가장 이른 신청 연도」 도메인 읽기 없음 · files 밖 |
| C-05 | P2 | 04.1-07-PLAN.md:91/:148/:208 | 기록한 셸 변수가 검증 명령 사이에 유지되지 않음 |
| C-06 | P2 | 04.1-07-PLAN.md:29 | 검사 뒤 GSD 메타 커밋이 STATE.md를 다시 바꿈 |
| C-07 | P2 | 04.1-06-PLAN.md:268 | 픽스처 이름이 전부 `E2E Employee` — 이름 누수 단언 무력 |
| GAP-1 | P2 | 04.1-VALIDATION.md:78-83 | CEO-12·등록 입사일·퇴직 연도·CX2-02·A1·07 트레이서 행 없음 |
| C-09~C-14 · GAP-3·4 · C-P1~P4 | P3 | 본문 | 행 링크 · §4-8 인용 · aria-disabled · zod 새해 · required · 월차 조정 문자열 · 셸 스펙 회귀 · 성능 |

집계: BLOCKER 1 · P2 7 · P3 12.
