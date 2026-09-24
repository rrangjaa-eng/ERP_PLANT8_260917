# 04.1 eng review 2회차 반영분 델타 교차검토 — Fable r1

Codex 대신 Fable(한도 소진, 9/29 이후 Codex 재확인 필요)

- 대상: `git diff 0861a77 b019428` — 04.1-01~07-PLAN · UI-SPEC · VALIDATION · `cross-notes-A/B/C.md`
- 기준: `docs/designs/plant8-erp-phase04.1-eng-review2-260925.md` T1~T19. 사용자 확정 결정(D-96 · 월차/연차 분리 · D5 · 기안자 겸 담당 승인+회수 · B-F04/A-FF01 범위 밖)은 건드리지 않았다.
- 방식: 플랜 문장 ↔ 실제 코드 대조(읽기 전용). 아래 「실측」은 이 세션에서 직접 확인한 것.

## 1. T1~T19 해소 여부

| # | 판정 | 근거(플랜 위치 · 코드 실측) |
|---|---|---|
| T1 C-01 | 해소 | 06:327(read_first grep 교체) · 06:355(④ 여섯 스펙 입사일 한 줄) · 06:362(셋째 검증 명령에 넷 추가) · 06:378(수락 기준 — 여섯 파일 · diff 4줄). 실측 `grep -rln 'getByRole("button", { name: "사람 등록" }).click' test/e2e` = 정확히 6파일, 줄 번호 108·27·34·104·32·31 일치. `single-column.spec.ts:140`은 링크만 누르는 루프(제출 없음) 확인 |
| T2 B-NEW01 | 해소 | 04:259(①-c 세 검사 · 순서) · 04:244(단위 사례 — 비정규 셋 · year_start · 서울 연초 경계 두 시각) · 04:286(수락 `dateOnly(new Date())` 0건). 실측 `registry.ts:172-173` UTC `dateOnly(new Date())` + 문자열 대소, `actions.ts:43` `z.string().min(1)` — 인용 정확. `RegistryDeps.now`는 지금 없지만 04 Task 2 ①-a가 더한다(04 「변경된 기존 심볼」 행) |
| T3 B-NEW02 | 해소 | 01:309(키 스키마 `z.union([z.literal(""), z.string().uuid()])`) · 01:342·426·507(수락·단위) · 04:245(가져오기 전체 거부 통합 (i)). 실측 `export.ts:127-132`가 단순 키를 `def.schema.safeParse` → `ImportValidationError`, `registry.ts` `setSettingValue`도 `def.schema.parse` → 저장·가져오기 두 경로 모두 막힌다. zod 4.6.5에서 union 실행 확인(v4 uuid·`""` 통과, `not-a-uuid` 거부). `describeSettingField`는 union을 `string`으로 떨어뜨려 기존 렌더와 같다 |
| T4 C-N01 | 해소 | 03:53(⑤ `hireDate`·`resignationDate` 연도 무관 머리 필드 · 보관 대상도 읽음) · 03:340(퇴직자 세 연도 `resignationDate` 단언) · 06:351(③ 읽기 순서 — 첫 읽기 올해 → 대체 연도 → 다를 때만 재읽기). 실측 `domain/people/index.ts:46-55` `PersonDto`에 두 날짜 없음 — 06이 넓히지 않는다는 문장과 일치. cross-notes-C ↔ 03 최종본 대조 일치 |
| T5 A-01 | 해소 | 01:78(truth) · 01:305(④ 상태 조건) · 01:307(⑤ `canSeeLeaveDocument`) · 01:480(⑦ 경고는 진행 중만) · 01:433(통합 `log.warn` 0회) · 05:277(화면은 받은 목록만). `approveDocument` (1)이 종결 문서에서 walkRoute를 불러도 경고를 남기지 않는다고 명시 — (1)→(2) 순서와 모순 없음. 가정 2(01:240 「기안자 · 지금 단계 후보 · 처리한 사람」)와도 일치(종결엔 지금 단계가 없다) |
| T6 A-02 | 해소 | 01:79(truth) · 01:299(① `step_index` = 설정 단계 번호) · 01:301(② 폴백 `max+1`, 같은 tx) · 01:434(통합 — 2·4단 꺼짐 → 폴백 `step_index` 4). 사례 흐름(팀장 1단 승인 → 남은 3단 빈 자리 → 「남은 단계가 전부 비면 대표」)이 01:63 규칙과 맞다 |
| T7 B-A1 | 해소 | 02:63(truth) · 02:232(④ `ApprovalActionResultDto` + `projectActionResult`) · 02:303(통합 — 노출 끔/켬 대조) · 02:313(④ 나머지 두 액션) · 05:58 · 06:289 · UI-SPEC:214. 실측 `domain/permissions/matrix.ts:156` `setVisibilityCell` — 「기존 노출 설정 도메인 함수」 존재. 01에 `dto.ts` 「02가 고치지 않는다」 조건 없음(01 전문 grep) — 02가 files_modified에 넣은 것과 충돌 없음 |
| T8 A-03 | 해소 | 03:44(truth) · 03:240(⑤ `seoulDateToUtcDate`만) · 03:242(⑥ 단위 사례) · 03:251(`TZ=Asia/Seoul` 넷째 검증) · 01:230(01 쪽 문장 정정). 실측 `registry.ts:46-48` `dateOnly = toISOString().slice(0,10)`, `:75` `dateOnly(opts?.asOf ?? new Date())` — 근거 정확. `test/unit/lib/dates.test.ts`는 01:43이 만든다(03 「끝에 덧붙인다」 성립) |
| T9 A-04 | 해소 | 03:61(truth) · 03:225-227(people 세 사례) · 03:342(leave-balance PM 거부 둘) · 03:407(T-04.1-16). 실측 `people.test.ts:94-124` 모양(`DEFAULT_ROLE_ID` viewer · `queryActionLog`) 일치, `can(viewer, "admin.people", "view")` 시그니처(`can.ts:16`) · `document_update` 액션 타입(`record.ts:13`) 존재 |
| T10 B-A3 | 해소 | 02:58(truth) · 02:247(⑧ (a) `import type` 제외 · (d) `"use client"`) · 02:221(검출기 네 사례). 실측 `import-cycles.test.ts:54` `(type\s+)?` 분기 존재 |
| T11 B-C1 | 해소 | 02:375(① `never` 전수 switch · 여섯째 문구) · 02:358(단위 정확 일치) · 02:371(중복 통합 정확 일치) · UI-SPEC:205 |
| T12 C-02 | 해소 | 06:343(옵션 배열 `["—","연차"]` · 제어값 `annual`) · 06:344(`—` 제출 서버 거부) · 06:347(① zod) · 06:349(② 네이티브 required 없음). 실측 `ui/select/Select.tsx:29` `<option value="">—</option>` 항상 첫 옵션 |
| T13 C-04 | 해소 | 06:58(truth) · 06:219(③ `earliestMyLeaveYear` → `findEarliestLeaveFiscalYear` `min(fiscal_year)` 1회) · 06:211(통합 — 호출 1회 카운터) · 06:235(넷째 검증). `leave_requests.fiscal_year` 열은 01:299에 있다 |
| T14 C-05 | 해소 | 07:91(시작 값 파일 `.git/gsd-04.1-07.env` · manifest 파일) · 07:150·154·215(세 검증 명령 첫머리 `. "$ENVF" && test -n`) · `REMOTE_HEAD_START` 빈 값 → `none`. 06:169도 같은 방식으로 정정 |
| T15 C-06 | 해소(자동 게이트 없음 — §2 N2) | 07:30(truth) · 07:95 · 07:202(④ `/ship` 바로 앞 명령 한 줄) · 07:215(다섯째 명령 금지 목록에서 STATE.md 제외) |
| T16 C-07 | 해소 | 06:279-280(계급 A·B·양성 대조를 `registerPerson` 고유 이름으로 · 단언 범위 = 폼 영역) · 06:293(⑤) · 06:307(수락). 실측 `registerPerson` 입력에 `teamId`·`effectiveFrom` 있음(`domain/people/index.ts:162-167`), E2E 픽스처가 이미 domain을 import한다(`test/e2e/fixtures.ts:2-4`) |
| T17 GAP-1 | 해소 | VALIDATION:137-145(06 행 9개) · :151-155(07 행 5개) · 교차 메모 A·B의 01~05 새 사례 행 |
| T18 A2-01 | 해소 | 03:48(truth — 「조회 연도에 유효한 부여」 · 월차 줄 = 창 전체 합) · 03:236(③ D4 규칙) · 03:240(⑤ 배분 연도 범위 H~Y) · 03:316(단위 1월 입사자 2027·2028) · 03:343(서비스 — 2026 사용이 2027 월차에 반영). 수치(44·12·32쿼터 = 11·3·8일) 일치 |
| T19 A2-02 | 해소 | 03:61(truth) · 03:232(① CHECK + `NOT VALID`) · 03:240(⑤ 23514 → `isCheckViolation` → `ValidationError`) · 03:228-229(직접 UPDATE 23514 · `allSettled` 10회) · 03:408(T-04.1-54b). 실측 `lib/pg-errors.ts` `isUniqueViolation`이 오류·`.cause` 둘 다 보는 모양 ✓, `corp-cards/index.ts:149-152` 선례 ✓, `db/schema/corp-cards.ts:32` `check()` ✓, `0004_users_role_id_validate.sql` NOT VALID 선례 ✓. 경합 사례는 순서와 무관하게 「정확히 하나 성공」이 결정적이다(먼저 커밋된 쪽은 옛 값 기준 유효, 뒤쪽은 앱 검증 또는 CHECK) |

## 2. 새로 생긴 문제 · 교차 모순

### WARNING

**W1. 03의 새 수락 기준이 빈 `PLAN_BASE`로 공허하게 통과한다(C-05와 같은 결함의 새 사례)**
- `04.1-03-PLAN.md:266` `git diff -U0 "$PLAN_BASE"..HEAD -- lib/pg-errors.ts`의 `-` 줄 0 · `:268` 같은 모양 `lib/dates.ts`. 이 회차가 새로 더한 줄이다.
- 03의 `PLAN_BASE`는 `:167` 「`git rev-parse HEAD` 값을 `PLAN_BASE`로 적어 둔다」 — 셸 변수만이고 값 파일·`test -n` 가드가 없다(01:228도 같다). 06:169 · 07:91은 같은 회차에 파일 + 가드로 고쳤는데 01·03은 그대로다.
- 실측: `PLAN_BASE=` 빈 값으로 `git diff -U0 "$PLAN_BASE"..HEAD -- lib/pg-errors.ts | grep -c '^-'` → `0`(rc 0, `..HEAD` = `HEAD..HEAD` 빈 diff). 「`-` 줄 0」이 아무것도 검사하지 않은 채 참이 된다. 「파일 끝 덧붙임뿐」 보증(01·03의 「덧붙이기만」 결정 9)이 실제로는 검사되지 않는다.
- 고칠 것: 03:167(과 01:228)에 06:169과 같은 한 줄 — `printf 'PLAN_BASE=%s\n' "$(git rev-parse HEAD)" > "$(git rev-parse --git-dir)/gsd-04.1-03.env"`, `$PLAN_BASE`를 쓰는 수락 기준(03:266·268·292·418·425, 01:333·377·551·592·600·601)은 `. <파일> && test -n "$PLAN_BASE" &&`로 시작.

### NOTE

**N1. 리뷰 밖 변경 — 마이그레이션 SQL 손 삽입 허용(01:297·361·381 · 03:161·232·282 · 07:24·91·143·158).** T1~T19에 없지만 근거가 실측으로 성립한다: squawk 2.65.0 + 이 저장소 `.squawk.toml`(`assume_in_transaction = true`, `require-lock-timeout`·`require-statement-timeout`·`constraint-missing-not-valid` 모두 활성)로 04.1 모양의 합성 SQL을 돌려 보니 생성본 그대로 **3건 경고**, `SET LOCAL` 블록 + CHECK `NOT VALID` 두 손 삽입 뒤 **0건**. 기존 11개 마이그레이션 전부가 `SET LOCAL` 블록을 손으로 넣었다(11/11 실측) · `0006:54-56` 모양 · `0004` NOT VALID 선례 일치. 오케스트레이터 결정 7a의 원문 범위는 RESEARCH:294 「파일 이름 손 리네임 · `_journal.json` 손 편집 금지」이고 「SQL 본문 금지」는 01·03 플랜이 넓혀 적은 것이므로 결정 번복이 아니다 — 다만 리뷰 지시에 없는 변경이라 조정자가 한 줄로 인지·승인하는 것이 맞다. 07 다섯째 검증 명령(07:158)이 재삽입·`lint:sql` 0건·`No schema changes`를 실제로 잡는다(drizzle-kit 0.31.10 메시지 문자열 `No schema changes, nothing to migrate` 실측 일치).

**N2. C-06(T15)의 최종 판정이 자동 게이트 밖으로 나갔다(07:202).** STATE.md 복원·검사는 이제 SUMMARY Post-build 순서의 「`/ship` 바로 앞 줄」이라는 절차 문장에만 있고, 07 다섯째 검증 명령에서는 뺐다(07:215). 07 안에서 검사하면 뒤 메타 커밋이 다시 바꾼다는 이유는 맞다. 누락 위험을 줄이려면 그 한 줄을 `/ship` 실행 전 체크리스트(SUMMARY frontmatter 필드 등)로도 남기는 것을 권한다 — 필수는 아니다.

**N3. 03:240 배분 연도 범위 「Y ≤ H+1이면 H ~ Y」가 Y < H(입사 연도 이전 조회)를 정하지 않는다.** 06:336 E2E가 `?year={Y-2}`로 퇴직자를 읽고, 06:58 규칙은 2000 이상 임의 연도를 허용하므로 Y < H가 실제로 온다. 「Y < H이면 Y 한 해(부여 0)」 한 마디를 더하면 실행자 해석이 갈리지 않는다.

**N4. zod 4.6.5의 `z.string().uuid()`는 RFC 버전 비트를 검사한다(실측: v4·nil 통과, `11111111-1111-1111-1111-111111111111` 거부).** `org_units.id`는 `uuid defaultRandom()`(v4)이라 운영 값은 전부 통과하지만, 테스트가 고정 문자열 id를 설정에 넣으면 거부된다. 01:426 단위 사례가 `randomUUID()`를 쓰므로 계획은 안전 — 실행자 참고.

**N5. 06:219 `findEarliestLeaveFiscalYear(drafterId)`가 01:301 리포지토리 관례 「전부 viewer 첫 인자」와 다르다.** `findEarliestLeaveFiscalYear(viewer, drafterId)`로 맞추는 한 마디.

**N6. 그 자체로는 통과가 쉬운 수락 grep** — 02:401 `grep -c "never"` ≥ 1, 02:267 `grep -c "use client"` ≥ 2, 06:307 `grep -c "registerPerson"` ≥ 1. 각각 실제 테스트 사례(02:358 정확 일치 · 02:221 검출기 · 06:279)가 뒷받침하므로 문제는 아니지만, 이 grep들만으로 「해소」를 판정하지 않도록 실행자에게 알린다.

### 확인했고 문제 없음(교차 모순 점검)

- 06↔03 잔고 DTO 계약: 03:53·240·340 ↔ 06:351·336, cross-notes-C — 일치(연도 무관 머리 필드 · 보관 대상 읽기 · `leave.value` 숨김 시 대체 연도 올해).
- 01↔04 `org_unit_id`: 01:309 스키마 ↔ 04:150·245·257 — 04는 `keys.ts`·`export.ts`를 고치지 않고 기존 스키마 검사에 기댄다(코드 실측과 일치). 04 통합 (i)의 키 이름 `approval_route.leave.step3.org_unit_id`는 01의 키 명명(`approval_route.leave.step2.enabled`)과 같은 규칙.
- 02가 01의 `domain/approvals/dto.ts`를 고치는 것: 01에 소유 제한 없음, 02 files_modified·Task 1 files·key_link에 반영. 직렬 체인(01→03→02)이라 wave 충돌 없음.
- 01/03 손 삽입 ↔ 07 재생성: 두 손 삽입의 종류·위치·검증(07:143·158)이 01:361 · 03:282와 글자 단위로 같다. 07 truth(07:24)도 추가.
- A-01 ↔ approveDocument 순서(01:305 (1)→(2)): 종결 문서에서 (1)이 walkRoute를 부르더라도 경고를 남기지 않는다고 01:480에 명시 — 통합 사례(01:433 옛 version 승인 뒤 `log.warn` 0회)와 일치.
- B-C1 `submitted` 차수 1 → 「지금 담당이 아님」: 제출 직후엔 옛 version이 있을 수 없어 정상 흐름에서 오지 않는다는 설명이 상태 기계와 맞다.
- 05 `retry`: `node_modules/next/dist/docs/.../error.md:117` · `app/(app)/projects/error.tsx` `retry` 실측 일치 · 02:401 grep `--exclude=error.tsx`와 충돌 없음.
- 06 셋째 검증 명령에 추가된 `keyboard-nav` · `admin-nav` · `user-menu` · `admin-people-detail-link` 스펙 파일 존재 실측.
- 07 C-N02 선택 사례의 `pnpm db:seed` 스크립트 존재 실측(`package.json:25`). 필수 게이트가 아니라는 표기 일관.
- 사용자 확정 결정 위배 없음(D-96 월차 창 = 입사일 기준 · 월차/연차 두 줄 분리 유지 · D5 비례 유지 · 기안자 겸 담당 `[승인, 회수]` 유지).

## 3. 판정

- T1~T19 전부가 문장 언급이 아니라 truth · task 본문 · 테스트 사례 · 검증 명령 · 수락 기준에 실제로 들어갔고, 인용한 코드 위치는 전부 실측과 일치한다.
- 새 문제는 WARNING 1건(W1 — 03 새 수락 기준의 공허 통과, 01·03 `PLAN_BASE` 가드 누락) · NOTE 6건.

막는 문제 0건
