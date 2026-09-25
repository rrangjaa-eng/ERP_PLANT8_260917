# 최종 전체 검토 — Codex 대신 Fable(한도 소진, 9/29 이후 Codex 재확인 필요)

- 대상: `.planning/phases/04.1-approvals-leave/04.1-01..07-PLAN.md` · `04.1-VALIDATION.md` · `04.1-UI-SPEC.md` @ `945dfff`(`claude/phase-04.1-plan-1iqtwe`)
- 기준: `ROADMAP.md` 04.1 절(성공 기준 1–5, 웨이브 01→03→02→04→05→06→07) · `REQUIREMENTS.md` EXP-03/04/05 · LEAV-01 · ADMN-04 · 코드베이스 인용 실측
- 존중한 것: 2회차 리뷰·checker-r1·fable-delta-r1·cross-notes의 Review Dispositions Ledger(B-A2 · C-N02 deferred 등)와 사용자 고정 결정(D-96 · 월차/연차 분리 · D5 비례 · 기안자=담당 시 승인+회수 · B-F04/A-FF01 범위 밖 · SET LOCAL/NOT VALID 손 삽입 허용)은 다시 제기하지 않았다.
- 방식: 읽기 전용. 플랜이 인용한 코드 위치는 Grep/sed로 실측했고, 연차 산식은 손으로 재계산했다.

## 판정

**막는 문제(BLOCKER) 없음.** 경고 2건, 메모 3건. 일곱 플랜은 자기 검증 명령으로 통과·실패를 판정할 수 있고, 플랜 간 데이터 계약·의존 순서·요구사항 커버리지에 모순을 찾지 못했다.

## WARNING

### W-1. `PLAN_BASE` 공허 통과가 02 · 04 · 05에 남아 있음(delta-r1 W1의 수정이 01 · 03에만 반영)
- 위치: `04.1-02-PLAN.md:181`, `04.1-04-PLAN.md:140`, `04.1-05-PLAN.md:161` — 「`git rev-parse HEAD` 값을 `PLAN_BASE`로 적어 둔다」만 있고 값 파일·`test -n` 가드가 없다.
- 영향 받는 검사: 02:338 · 02:437 · 02:444–445 / 04:213 · 04:217 · 04:219 · 04:282 · 04:318 · 04:327 / 05:247 · 05:368 · 05:376. 새 셸에서 `PLAN_BASE`가 비면 `git diff "$PLAN_BASE"..HEAD`는 `..HEAD`(= `HEAD..HEAD`)로 **성공하며 빈 출력**을 내므로 「비어 있음」 수락 기준이 전부 공허하게 통과한다. 04:219 · 05:247의 `D=$(git diff …) && …` 가드는 git 실패만 잡고 빈 변수는 잡지 못한다.
- 수정(한 줄): 01:228 · 03:167과 같은 모양 — 첫 task 전 `git rev-parse HEAD > .git/gsd-04.1-0N.env`, 각 `$PLAN_BASE` 검사 앞에 `PLAN_BASE=$(cat .git/gsd-04.1-0N.env) && test -n "$PLAN_BASE" &&`를 붙인다(N = 02/04/05).
- 등급 근거: 검증의 공허함이지 구현 결함은 아니고, 07 T2 다섯째 명령(`MAIN_SHA` 기준 금지 경로 diff)이 최종 트리에서 같은 성질을 한 번 더 본다. 그래서 BLOCKER가 아니라 WARNING.

### W-2. `--project mobile-375` task 검증이 desktop 전체를 끌고 옴
- 위치: `04.1-05-PLAN.md:229`, `04.1-05-PLAN.md:292` — `pnpm playwright test test/e2e/mobile-leave-approval.spec.ts --project mobile-375`(`--no-deps` 없음).
- 실측: `playwright.config.ts:99` `dependencies: ["desktop"]` — 같은 파일 주석이 「`--project=mobile-375`만 돌리면 desktop이 먼저 따라온다 … 폰만 빨리 보려면 `--no-deps`」라고 적어 두었다. task 단위 검증마다 desktop 스위트가 먼저 돌아 느리고, desktop 어디든 빨가면 이 스펙이 「did not run」으로 끝나 task 판정이 흐려진다.
- 수정(한 줄): 두 명령에 `--no-deps`를 붙인다(05:290의 `--project desktop-settings --no-deps`와 같은 관례). 플랜 전체 게이트 `pnpm test:e2e:ci`(05:332)가 순서를 이미 보장하므로 task 단위에서는 뺄 수 있다.

## NOTE

- N-1. `04.1-06-PLAN.md:219` `findEarliestLeaveFiscalYear(drafterId)` — 리포지토리 함수가 viewer를 받지 않는다. 기존 `repositories/settings.ts:10 findSimpleValue(viewer, key)` 등은 viewer-first 관례다. 상위 `earliestMyLeaveYear(viewer, …)`가 본인 id만 넘기므로 누수는 없지만 관례 편차(delta-r1 N5와 같은 지적, 미반영).
- N-2. `04.1-02-PLAN.md:401` `grep -rn --exclude=error.tsx "retry" domain/approvals app/(app)/approvals app/(app)/leave` — 세 경로 중 하나가 없으면 grep이 종료 코드 2를 내지만 「0건」 판정에는 영향 없다. 실행 시점(웨이브 3)에는 01이 `domain/approvals`를, 02가 나머지 경로를 만들므로 실제 위험은 낮다.
- N-3. `04.1-VALIDATION.md:6-8` `status: draft` · `nyquist_compliant: false` · Per-Task Verification Map 「나머지 task 행은 `/gsd-validate-phase`가 채운다」(63행) — 절차상 정상이지만 실행 전 `/gsd-validate-phase`를 돌려야 한다. Wave 0 목록(163–175행)은 일곱 플랜의 새 테스트 파일과 일치한다(`mobile-leave-list.spec.ts`는 06:33 · 06:96 · 06:185에 있음).

## 확인한 것(문제 없음)

### 플랜 간 계약 · 순서
- 웨이브 1~7에 플랜이 하나씩이라 같은 웨이브 `files_modified` 겹침은 없다. 01의 `domain/approvals/dto.ts`를 02가 확장(B-A1 `projectActionResult`)하는 것은 depends_on 순서상 안전.
- 05 `listMyInbox(viewer, {withDetails: true, now})` ↔ 01 T4 `listMyInbox(viewer, deps?)`; 06 ↔ 03 「hireDate/resignationDate 항상 포함」 DTO 계약(03:53) ↔ 06 Task 3 첫 읽기=올해 → 연도 해석 → 필요할 때만 둘째 읽기(C-N01); 01/03 손 삽입 ↔ 07:143 재삽입 + 07:158 다섯째 검증 — 모두 맞물린다.
- **입사일 필수화 시점**: 03(웨이브 2)은 `registerPerson`의 입사일을 선택으로 두고(「입사일 없는 사람」 사례가 03 · 05 · 06에 있음), 필수화는 06:65 · 06:353에서만 하며 같은 플랜 06:341 · 06:378이 등록 폼을 제출하는 기존 E2E 여섯을 갱신한다. 실측: `grep -l "초기 비밀번호" test/e2e/*.spec.ts` = 정확히 그 여섯 파일. 따라서 05의 `pnpm test:e2e:ci`(웨이브 5) 시점에 여섯 스펙이 빨개지는 창은 없다.
- E2E 신청 주(`leaveWeekdayRange` week): 02=0, 05=2 · 4–8, 04/05 설정 스펙=9, 06=10–20 — 겹치지 않는다.

### 코드 인용 실측
- `domain/people/index.ts:46-55` PersonDto(정확), `registerPerson` :187; `repositories/settings.ts:10 findSimpleValue`; `domain/settings/registry.ts:137-139`(`def.schema.parse` → `insertHistorizedValue`) · `:172-173`(`FutureCancelOnlyError`); `domain/settings/export.ts:116`(`safeParse`) · `:140`(`applySettingsImport`); `app/(app)/admin/settings/actions.ts:43 cancelHistorizedSettingAction`; `ui/select/Select.tsx:29` `<option value="">—</option>`; `test/e2e/mobile-shell.spec.ts:139-155`(role-menu accountGroup 대조); `scripts/migrate-runner.ts:54 migrationsFolder`; `package.json` `db:reset:test` · `test:e2e:ci`(`CI=true`) · `lint:sql`(`squawk --config .squawk.toml`); `docs/ARCHITECTURE.md` `## 4-1`~`## 4-7`(07의 `## 4-N` 추가 자리) · `test/unit/docs-limits.test.ts`(300줄 상한); `lib/pg-errors.ts:14 isUniqueViolation`(03이 `isCheckViolation`을 같은 파일에 더한다 — 일관); `db/schema/corp-cards.ts:32 check(` 선례; `db/schema/auth.ts`에 아직 `hire_date` 없음(03이 더한다 — 예상대로). 전부 플랜 인용과 일치.
- `.squawk.toml`: `assume_in_transaction = true` · `adding-required-field` 제외 — 03의 nullable `hire_date`/`resignation_date` 추가와 `NOT VALID` CHECK는 규칙에 걸리지 않는다. `NOT VALID`는 기존 행만 건너뛰고 새 INSERT/UPDATE에는 즉시 강제된다는 플랜 주장(A2-02)도 맞다.

### 연차·월차 계산(손 재계산)
- `annualGrantQuarters` = `(annualDays×4×worked + days−1) div days`: 2026-10-01 입사 평년 → ceil(60×92/365)=16쿼터=4일; ENG-11 ceil(60×17/365)=3; 윤년 2028-07-02 30쿼터 — 03 behavior 숫자와 일치.
- D3 픽스처(연차 16/4/2/10 · 월차 20/16/4/0 → `annualRemaining 12` · `monthlyRemaining 0` · 결재 중 4), A2-01 서비스 사례(44/12/32), CX-R02 `{monthly 8, annual 4, over 4}`, ENG-4 퇴직 줄 `남은 연차 12일` — 모두 정합. 두 잔고 합계를 어디에도 쓰지 않는다는 11:43 요구는 UI-SPEC 205–206행과 03 · 05 · 06 수락 기준이 같은 말로 지킨다.
- 요일: 2026-06-01 월 · 2027-02-08 월 · 2027-03-16 화 · 2026-05-20 수 — 픽스처 평일 가정 정확.
- A2-02 경합(`Promise.allSettled` 10회): 앱 검증 + DB CHECK(23514)로 어떤 순서든 정확히 1건만 성립 — 건전.

### 보안 · 누수
- previewRoute · 액션 반환(B-A1) · 결재함 상세(`buildDetailRows`) · 조정 목록(CX-R2) · 충돌 문구(`isApprovalParty` 밖은 일반 문구, ENG-6)가 각각 `approval.value` · `leave.value` 투영과 권한 판정을 거치고, leak-scan 생성기 편입(01 T4, VALIDATION 77행)이 있다. 새 서버 액션은 action-registry-completeness(02)와 document-kinds-import 검출기(B-A3)가 본다. 빠진 투영 경로를 찾지 못했다.

### 요구사항 커버리지
| ID | 플랜 | 검증 |
|----|------|------|
| EXP-03 | 01(nextStep · version) · 02(반려/회수/다시 신청 · 충돌 문구) | VALIDATION 47–48 · 95–107 |
| EXP-04 | 01(결재선 제출 시점 고정 · walkRoute · R/W 결정표) · 05 · 06(표시) | 49–50 · 67–76 · 122 · 125 · 141 |
| EXP-05 | 05(폰 결재 시트 · 결재함) · 06(신청 폼) | 51 · 121 · 126 · 140 · 수동 185 |
| LEAV-01 | 03(부여 · 배분 · 조정 · 퇴직) · 05 · 06(화면) | 52–54 · 78–94 · 117–119 · 123–145 |
| ADMN-04 | 01(17키 등록) · 04(옵션 · 적용 시작일 규칙 · E2E 격리) | 55 · 108–114 |
| 기준 1 · 5 | 02(document-kinds 가드) · 05(registry) · 01 T4(leak-scan) | 56–57 · 77 · 115 · 120 |

### UI-SPEC · CLAUDE.md §7(가볍게)
- Copywriting Contract(178–224행)는 「원인 · 다음 행동」 한 줄, 확인 창은 되돌릴 수 없는 반려·회수·입력 버리기에만, 신청 폼 기본값(오늘 · 내 팀)과 `Ctrl+Enter` 1차, 빈 화면 첫 행동 버튼, 할 수 없는 선택 숨김(월차 옵션 부재 · 설정 `특정 부서` disabled)까지 §7 원칙에 맞다. 06 C-13(입사일 칸에 네이티브 `required`를 두지 않아 서버 문구가 보이게)도 같은 결.

## 정리
- BLOCKER 0 · WARNING 2(W-1 `PLAN_BASE` 가드 02/04/05 누락, W-2 mobile task 검증 `--no-deps`) · NOTE 3.
- 권장: W-1 · W-2는 각 플랜 한두 줄 수정으로 끝난다. 실행 전 `/gsd-validate-phase`로 VALIDATION 나머지 행을 채우고, 9/29 이후 Codex로 이 판정을 재확인한다.

막는 문제 0건
