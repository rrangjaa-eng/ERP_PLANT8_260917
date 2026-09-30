---
phase: quick-260930-kc9
plan: 01
subsystem: settings-ui, project-detail-ui, reserves-ui, ui-button
tags: [a11y, aria-describedby, touch-target, kbd, tab-order, design-gate]
requires: [PR #104 merge f3242c8]
provides: [settings hint aria-describedby, history number commas, phone restore 44x44, disabled primary kbd, row-number look, phone header Tab order]
affects: [ui/input/TextField.tsx, app/(app)/admin/settings, app/(app)/projects/[id], app/(app)/pnl/reserves, ui/button]
key-files:
  created: [test/unit/ui/text-field-hint.test.ts, docs/design/checks/2026-09-30-설정-힌트-이력-쉼표.md, docs/design/checks/2026-09-30-상세-복원-kbd-번호-tab순서.md]
  modified: [domain/settings/export.ts, test/e2e/mobile-touch-targets.spec.ts, docs/design/SYSTEM.md, docs/design/checks/2026-09-30-7-1-7-8-44-예외-역참조.md, ui/input/TextField.tsx, app/(app)/admin/settings/settings-form-client.tsx, app/(app)/admin/settings/page.tsx, test/e2e/settings.spec.ts, app/(app)/projects/[id]/project-detail.module.css, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/previous-revision.tsx, app/(app)/pnl/reserves/reserves.module.css, ui/button/Button.module.css, test/e2e/quote-revisions.spec.ts, test/e2e/reserves.spec.ts]
status: complete
plan_head_before: f3242c854e0a818804def76bff352fcdadb0edf2
commits: 13
actuals:
  tokens: 120000
  tasks: 3
  commits: 13
---

# Phase quick-260930-kc9 Plan 01: F(2) PR #104 후속 Summary

PR #104 후속 폴리시 9건 — 설정 칸 힌트를 aria-describedby로 잇고(ISSUE-001), 이력 숫자에 쉼표(DR-104-03), 폰 복원 줄 44×44(DR-104-01), 비활성 1차 kbd 대비(DR-104-02), 번호 칸 행 번호 모양(DR-104-04), 폰 머리 줄 Tab 순서(DR-104-05), 주석·제목·문서 포인터(G1~G3). ISSUE-002는 손대지 않았다.

## 커밋 (git log f3242c8..HEAD = 13, 그중 merge 1 + main 문서 커밋 1 포함)
| 해시 | 제목 |
|---|---|
| b64911c | docs: narrow settings export effective-value comments (G1) |
| 71af3f0 | test: name batch save in PC touch-target test title (G2) |
| 726474a | docs: generalize SYSTEM 7-1 and 7-8 phone 44 exception pointer (G3) |
| 5920cde | chore: merge origin/main (#110) into F(2) branch (오케스트레이터, 충돌 0) |
| 499f2e7 | test: add failing tests for settings hint describedby and history commas (ISSUE-001, DR-104-03) |
| 3d6cd6c | fix: link settings hints to controls via aria-describedby (ISSUE-001) |
| dba328b | fix: format historized setting numbers with thousand separators (DR-104-03) |
| 216762f | test: add failing E2E for detail polish (DR-104-01, 02, 04, 05) |
| 551165f | fix: widen phone restore actions to 44 (DR-104-01) |
| 9545a21 | fix: use base kbd look on disabled primary buttons (DR-104-02) |
| 8296041 | fix: apply row-number look to quote number cells (DR-104-04) |
| 4d23611 | fix: match phone header DOM order to visual order (DR-104-05) |
(9d695fc는 main의 #110 문서 커밋이다.) 의도별 커밋은 계획대로 11개(G1 · G2 · G3 · RED · ISSUE-001 · DR-104-03 · RED · 01 · 02 · 04 · 05). 전부 push됨.

## RED 증거 (실제 실패 줄)
- 단위 text-field-hint(8개 중 hintId 4개 실패, 기존 동작 4개 통과): `expected '<div ...><input id="t" hintId="t-hint" class=.../>' to contain 'aria-describedby="t-hint"'` (hintId가 input DOM으로 샘)
- ISSUE-001 E2E 힌트 연결: 41개 키 모두 `힌트 id 요소 0개`; 임계값 칸 `Expected: "setting-auth.lockout.threshold-hint" Received: ""`; 구분자 `Expected: "...separator-error ...separator-hint" Received: "setting-document_number.project.separator-error"`
- DR-104-03: `Expected: "125,000" Received: "125000"`
- DR-104-01 상세·리저브: `복원 @375 폭 Expected: >= 44 Received: 32.296875` (375·320 · 복원·버림 모두)
- DR-104-02: `비활성 kbd opacity Expected "1" Received "0.8"` · 테두리 `rgba(255, 255, 255, 0.5)` · 대비 `3.3447839694316164` (1280 · 1024)
- DR-104-04: 현재 격자·이전 차수 읽기 표 모두 `fontSize 14px / color rgb(11, 21, 18) / minWidth 0px` (기대 11px / rgb(95, 110, 106) / 28px)
- DR-104-05: 보이는 순서 단언은 통과(가드), `폰 Tab → 더보기 expect(locator).toBeFocused() failed Received: inactive`

## 게이트 (숫자)
- 매 커밋 직전: `pnpm lint` exit 0 · `pnpm typecheck` exit 0
- Task 1: integration settings-export 15/15
- 단위: text-field-hint + select-error-hint 12/12, button 7/7, `pnpm test:unit` 169 파일 / 2253 테스트 통과
- Task 2 CI=true: settings.spec + settings-approval-route.spec (경로 둘을 주면 desktop 전체가 딸려 옴) — 621 passed (12.3m)
- Task 3 CI=true: mobile-touch-targets + mobile-320-no-overflow (`--project=mobile-375 --no-deps`) 9 passed (49s) · quote-revisions + reserves + project-lifecycle + project-period (`--project=desktop`) 102 passed (2.9m)
- CSS 가드: project-detail `order:` 줄 5 · order 줄 diff 0 · `min-width: var(--touch-min)` 2 / 1 · `.btn[aria-disabled="true"] .kbdOnAccent` 1
- 위험 경로(db/ · domain/auth · domain/permissions · .claude/ · package.json · lockfile) diff 0

## 판단 기록
- aria-describedby 순서: 오류 id 먼저, 힌트 id 뒤(지금 고칠 것이 먼저 읽힘). hintId 미지정 화면은 전과 같음(단위 테스트로 고정).
- 자리별 부착: 텍스트·숫자 = input(TextField hintId), select = select, 체크박스 = input, multi-enum = fieldset, 결재선 단계 칸 = 체크박스·select, 이력형 = div role=group(aria-labelledby = 라벨 id). raw 칸 오류 <p>에 `setting-{key}-error` id를 더해 같은 규칙. 「설정 내보내기」 안내 줄은 범위 밖으로 불변.
- formatValue 숫자 분기: numberKind 있으면 종류별 포맷터, 없으면 정수 formatCount · 소수는 저장값 그대로. 비율 키는 0~1 소수에 자릿수 제한이 없어 formatQuantity(2자리 0.088→0.09) · formatFxRate(4자리)가 반올림해 잘못 보여 주고 1 미만이라 쉼표도 불필요하다. 새 포맷터 없음.
- DR-104-04: ui/table TableColumn에 td 클래스 prop이 없고 결정이 파일을 quote-table · previous-revision으로 정해, 공유 ui/table을 넓히지 않고 칸 렌더 안 span(.rowNumber)이 모양을 싣는다. td는 14px로 남아 행 높이 · 정렬 그대로. **독립 DOM 감사는 글자 요소(td의 첫 자식 span)를 재야 한다** — td 자체 font-size는 14px다. previous-revision은 column({text})를 펼친 뒤 cell만 덮어 copyText는 문자열로 유지.
- usePhoneWidth 경로 간 import: `@/app/(app)/leave/use-phone-width`(eslint boundaries가 app→app 허용, 선례 leave/year-param), 파일 이동 없음.
- DR-104-05: 폰 CSS order 규칙은 한 줄도 안 바꿨다(order 줄 diff 0). 폰 DOM = [상태 바꾸기, 일괄 저장, 복사 묶음]이고 order 값(0 · 0 · 1 · 2)이 같은 순서라 수화 전후 보이는 순서가 같다. key("copy"·"status"·"save")로 옮겨 다시 마운트하지 않는다.
- DR-104-05 계정: 시스템 관리자가 다섯 요소를 모두 봄(추가 시드 불필요).

## Deviations from Plan
1. **[Rule 3 - Blocking] Playwright 실행 방법.** `mobile-375`가 `dependencies: ["desktop"]`라 mobile 스펙 경로(또는 settings-approval-route)를 주면 desktop 전체가 딸려 와 `-g` 무시됨(첫 시도가 20분 타임아웃, 프로세스는 PID로 종료). 이후 `--project=mobile-375 --no-deps` / `--project=desktop`으로 스펙별 실행. 이 때문에 Task 2의 CI=true 결과는 621 전체 통과이고, Task 3은 두 번을 프로젝트별로 나눠 9 + 102 통과. 코드 영향 없음.
2. **[정보] main 이동.** 첫 push 전 origin/main이 #110(9d695fc)으로 이동 → 중단·보고 → 오케스트레이터가 5920cde로 merge, 이후 재개.
3. RED 커밋 접두어는 계획대로 `test:`(훅 경고는 권장 사항 안내이며 차단 아님).
4. 계획의 export.ts 줄 번호가 1 어긋남(61/64) — 영향 없음.
5. .claude/gates 로그 변경 없음(git status 깨끗).

## Known Stubs
없음.

## Threat Flags
없음 (새 입력 · 서버 액션 · 쿼리 · 권한 변경 없음).

## 스킬 호출 순서 (커밋별)
- 모든 태스크 시작: test-driven-development 먼저(Task 1 · 2 · 3 각각). design-gate: G3 · Task 2 · Task 3 화면 편집 전.
- b64911c, 71af3f0, 726474a, 499f2e7, 3d6cd6c, dba328b, 216762f, 551165f, 9545a21, 8296041, 4d23611: 각 커밋 직전 verification-before-completion 호출 후 lint · typecheck 실측(+해당 테스트)하고 커밋.
- systematic-debugging: 예상 밖 실패가 없어(RED 실패는 전부 의도한 이유) 호출하지 않음. 전체 스위트가 딸려 온 실행은 Playwright 프로젝트 의존 때문이었고 설정 파일로 원인을 확인.

## 대기(오케스트레이터)
- 독립 DOM 감사(CI=true, 별도 에이전트) — DR-104-04는 td 안 span(글자 요소)을 잰다는 점 전달
- 전체 게이트(CI)
- 문서 커밋(SUMMARY · STATE · PLAN)

## Self-Check: PASSED
- 커밋 13개 전부 git log에 존재, origin/claude/pr104-followup-f2 = 4d23611
- 점검표 3개 `- [ ]` 0개, 생성 파일 존재 확인
