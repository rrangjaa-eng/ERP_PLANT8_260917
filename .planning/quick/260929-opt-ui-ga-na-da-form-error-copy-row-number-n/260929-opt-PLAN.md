---
phase: quick-260929-opt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/04-project-quote-ledger/04-UI-SPEC.md
  - docs/design/checks/2026-09-29-04-ui-가나다.md
  - test/e2e/quote-revisions.spec.ts
  - test/e2e/project-register.spec.ts
  - app/(app)/projects/[id]/quote-table.tsx
  - app/(app)/projects/[id]/previous-revision.tsx
  - app/(app)/projects/project-form.tsx
autonomous: true
requirements: [QUICK-260929-opt]
# risk 태그 없음: 돈·권한·DB 잠금·마이그레이션을 건드리지 않는다(열 정의 align 값 두 줄 + 폼 effect 하나 + E2E + 문서 한 줄). 실행자 = Sonnet 기본.
# 위험 경로 없음(db/·domain/auth·domain/permissions·lib/crypto·배포·.claude/ 변경 0). ui/table 변경 0.

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "(가) 04-UI-SPEC.md 385행 「Error — 등록 폼 제출」 행이 코드(project-form.tsx 241~245행)와 같은 명사형 `등록 실패 · {칸} {n}칸`을 쓰고, 예는 `등록 실패 · 총 매출 예상가 1칸`이다({칸}은 FIELD_LABELS가 덮는 시작일·종료일·총 매출 예상가 중 거부된 첫 칸). 그 문서 커밋은 이 한 줄(1 추가 · 1 삭제)만 바꾸고 코드 변경은 0이다"
    - "(나) 1280에서 현재 차수 「견적 줄」 표와 이전 차수 읽기 표(「상세 견적 1차 견적 줄」) 둘 다 「번호」 머리글 th와 각 줄 td의 계산값이 text-align right · white-space nowrap · font-variant-numeric tabular-nums다(SYSTEM §2 177행 숫자 칸 규칙). 공유 Table의 기존 `.alignRight`를 열 정의 `align: \"right\"`로 받을 뿐이고 ui/table 변경은 0이다"
    - "(다) 빈 등록 폼에서 「프로젝트 등록」을 눌러 거부되면 document.activeElement가 DOM 순서의 첫 오류 칸인 클라이언트 select(#clientId)다(S19 「오류로 이동」을 §7-15 폼에 적용, 04-UI-REVIEW 79행)"
    - "(다) 종료일이 시작일보다 앞선 등록을 1차 클릭으로 보내 서버가 칸을 거부(result.data.rejected)하면 포커스가 종료일 칸(#endDate)으로 간다"
    - "(다) 포커스 이동은 액션 결과가 새로 도착했을 때만 한 번 일어난다. 거부 뒤 쉼표 칸(총 매출 예상가)에 입력해 다시 그려져도 포커스는 그 칸에 남고, 성공이면 기존대로 상세로 이동하며(기존 (a)·(d1) 통과), 입력 중 쉼표 칸 자체 오류만으로는 포커스가 움직이지 않는다"
    - "RED 커밋(test:)이 수정 전 새 E2E 세 개의 실패((나) toEqual · (다) toBeFocused)를 남기고, GREEN 커밋(fix:) 뒤 두 스펙 파일 전체가 CI=true 프로덕션 빌드에서 통과한다"
  artifacts:
    - path: ".planning/phases/04-project-quote-ledger/04-UI-SPEC.md"
      provides: "385행 등록 폼 제출 오류 문구 = 코드 명사형"
      contains: "등록 실패 · 총 매출 예상가 1칸"
    - path: "docs/design/checks/2026-09-29-04-ui-가나다.md"
      provides: "빈칸 없는 design-gate 점검표 — 「화면:」 줄에 화면 파일 셋"
      contains: "app/(app)/projects/[id]/previous-revision.tsx"
    - path: "test/e2e/quote-revisions.spec.ts"
      provides: "1280 두 견적 표 「번호」 열 숫자 규칙 E2E 하나(제목 표식 `PR #104 (나)`)"
      contains: "PR #104 (나)"
    - path: "test/e2e/project-register.spec.ts"
      provides: "등록 폼 거부 → 첫 오류 칸 포커스 E2E 둘(제목 표식 `PR #104 (다)`)"
      contains: "PR #104 (다)"
    - path: "app/(app)/projects/project-form.tsx"
      provides: "result에만 걸린 effect — 거부 응답이면 #project-form 안 첫 aria-invalid 칸에 focus()"
      contains: "[aria-invalid=\"true\"]"
  key_links:
    - from: "app/(app)/projects/[id]/quote-table.tsx 열 정의 key \"sort\"(머리글 「번호」, 1635~1643행)"
      to: "ui/table/Table.tsx 812·886행 `column.align === \"right\" ? styles.alignRight` → Table.module.css 67~70행 `.alignRight`"
      via: "align: \"right\""
      pattern: "align: \"right\""
    - from: "app/(app)/projects/[id]/previous-revision.tsx quoteLineReadColumns 56행 `column({ key: \"sort\", header: \"번호\", … })`"
      to: "같은 Table `.alignRight`(PreviousRevisionTable이 이 열을 쓴다 — 199행)"
      via: "align: \"right\""
      pattern: "key: \"sort\", header: \"번호\""
    - from: "app/(app)/projects/project-form.tsx useAction(createProjectAction)의 result(next-safe-action 8.7.3 — useState라 응답마다만 새 객체)"
      to: "Select(error prop → aria-invalid) · input(aria-invalid) 중 DOM 순서 첫 칸"
      via: "useEffect(…, [result]) + document.getElementById(\"project-form\")?.querySelector('[aria-invalid=\"true\"]')"
      pattern: "\\}, \\[result\\]\\);"
---

<objective>
PR #104 사용자 [지시](댓글 5894569505) UI (가)(나)(다) — 결정은 잠겨 있다(다시 묻지 않는다). 04-UI-REVIEW.md 「사용자 판단 필요」 1·2·3에 대한 사용자 답을 그대로 옮긴다.

- (가) 문구: 코드의 명사형 `등록 실패 · {칸} {n}칸`(project-form.tsx 241~245행)이 정본이다. 문서 `04-UI-SPEC.md` **385행만** 코드에 맞춘다. 코드 변경 0.
- (나) 견적 표 행 번호 열에 숫자 규칙(tabular-nums · 오른쪽 정렬 · nowrap). 자리: `quote-table.tsx` 열 key "sort"(머리글 「번호」) + 같은 종류의 열인 `previous-revision.tsx` 56행(이전 차수 읽기 표) — 둘 다 같은 모양이어야 해서 함께 바꾼다(오케스트레이터 결정, 공개). 열은 1280 이상에서만 보인다(collapseBelow 1280). ui/table은 바꾸지 않는다 — 열 정의가 `align: "right"`이면 Table이 기존 `.alignRight`(right + tabular-nums + nowrap)를 붙인다.
- (다) 등록 폼 제출이 거부되면(서버 validationErrors: clientId·name·pmUserId·teamId·preEstimate, 또는 `result.data.rejected` 칸 오류) DOM 순서의 첫 오류 칸으로 포커스를 옮긴다(S19 「오류로 이동」을 §7-15 폼에). Ctrl+Enter는 requestSubmit이라 같은 길이다. 성공·이동·관계없는 다시 그리기·입력 중 쉼표 칸 자체 오류에서는 포커스를 가져가지 않는다.

Purpose: 사용자가 정한 세 판단을 문서·화면·E2E로 고정한다.
Output: docs 커밋((가) 한 줄) → RED 커밋(E2E 셋) → GREEN 커밋(열 정의 두 줄 + 폼 effect + 채운 점검표).
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/rules/frontend.md
@.claude/rules/tests.md
@.claude/skills/design-gate/CHECKLIST.md
@docs/design/checks/2026-09-29-04-폰-터치-44.md

범위 Read만(통째로 읽지 않는다):
- `.planning/phases/04-project-quote-ledger/04-UI-SPEC.md` 385행 (Grep으로 `Error — 등록 폼 제출` 확인)
- `.planning/phases/04-project-quote-ledger/04-UI-REVIEW.md` 76~92행(Pillar 6 포커스 지적 · 「사용자 판단 필요」 1~3)
- `docs/design/SYSTEM.md` 177행(§2 숫자 칸 규칙) · 742행(§7-3 첫 칸 행 번호) · 1035~1095행(§7-15 폼)
- `app/(app)/projects/project-form.tsx` 123~139행(useAction · 마운트 effect) · 217~247행(오류 파생 · blockedReason) — 파일 405행
- `app/(app)/projects/[id]/quote-table.tsx` 1633~1643행(열 key "sort") — 파일 2516행, 이 범위만
- `app/(app)/projects/[id]/previous-revision.tsx` 44~57행(quoteLineReadColumns) · 187~222행(PreviousRevisionTable)
- `ui/table/Table.tsx` 805~815행 · 880~890행(align 적용 — 읽기만) · `ui/table/Table.module.css` 67~70행(`.alignRight`) · 231~241행(collapse-1280)
- `test/e2e/quote-revisions.spec.ts` 1~112행(import · makeTeam · makeAccount · login · makeProject · quoteTable · quoteRows) · 587~613행(copyRevision · revisionTable · previousTable · dataRowTexts) · 670~712행(「차수 열기」 선례) · 파일 끝
- `test/e2e/project-register.spec.ts` 1~19행(import) · 131~187행(loginAndOpenForm · fillRequiredFields · (e) 선례) · 357~398행((d2)·(d3) 선례) · 426~432행(describe 끝)
- `playwright.config.ts` 45~106행(desktop 프로젝트 = 기본 뷰포트 1280 · `mobile-*.spec.ts`만 mobile-375 · CI면 webServer가 `pnpm build && pnpm start`)
</context>

<tasks>

<task type="auto">
  <name>Task 1: design-gate + 점검표(지금·계획) 준비, (가) UI-SPEC 385행을 코드 문구에 맞춰 docs 커밋</name>
  <files>docs/design/checks/2026-09-29-04-ui-가나다.md, .planning/phases/04-project-quote-ledger/04-UI-SPEC.md</files>
  <action>
    ① 먼저 Skill `design-gate`를 호출한다(docs/design/ 파일을 쓰기 전 — 훅이 강제). 스킬 §1 순서대로 필요한 절만 읽는다: CHECKLIST.md 전체 · frontend.md 「화면 사용성 원칙」 · BRIEF.md 「가장 잦은 작업」「성공 기준」 · SYSTEM.md 177행(§2 숫자 칸: 우측 정렬 · tabular-nums · nowrap) · 742행(§7-3 첫 칸 행 번호) · §7-15 폼(1035~1095행 범위 Read).

    ② 점검표 `docs/design/checks/2026-09-29-04-ui-가나다.md`를 CHECKLIST.md §2 틀을 복사해 만든다(코드를 쓰기 전에, 이 태스크에서는 커밋하지 않는다 — GREEN 커밋에 함께 들어간다). 머리 줄들:
    - 제목: `# UI (가)(나)(다) — 견적 번호 열 숫자 규칙 · 등록 폼 오류로 이동 (quick 260929-opt) — 점검표`
    - 「화면:」 줄 = 쉼표로 구분한 세 파일, 정확히 `화면: app/(app)/projects/project-form.tsx, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/previous-revision.tsx` (엄격 모드 — 커밋하는 화면 파일마다 이 줄에 있어야 한다. 구분자는 틀대로 쉼표).
    - 「기준:」 줄: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §2(177행 숫자 칸) · §7-3(742행 행 번호) · §7-15 폼 · 04-UI-SPEC S19 「오류로 이동」 · 04-UI-REVIEW 「사용자 판단 필요」 1·2·3 · PR #104 [지시] 5894569505.
    - 「지금(수정 전):」 한 줄 — (나) 1280 현재 차수 「견적 줄」 표와 이전 차수 읽기 표의 「번호」 열은 열 정의 align 값이 left라 Table이 `.alignRight`를 붙이지 않는다(왼쪽 정렬 · tabular-nums·nowrap 없음) · (다) 빈 폼 제출 → 클라이언트 select·프로젝트명 input에 aria-invalid가 붙지만 포커스는 「프로젝트 등록」 버튼에 남는다(04-UI-REVIEW 79행), 종료일 거부도 같다 · (가) UI-SPEC 385행 `등록하지 못했습니다 · 클라이언트 1칸` ≠ 코드 `등록 실패 · {칸} {n}칸`.
    - 「계획:」 한 줄 — (가) 문서 385행만 코드에 맞춤(코드 변경 0) · (나) 두 열 정의의 align을 right로 — 공유 Table의 기존 `.alignRight`를 받는다, ui/table·CSS·토큰 변경 0, 같은 종류의 두 열이 같은 모양 · (다) project-form.tsx에 액션 result가 바뀔 때만 도는 effect 하나 — 거부 응답이면 #project-form 안 첫 aria-invalid 칸에 포커스, 문구·색·배치 변경 0.
    - 「결과(수정 후):」 줄은 아직 쓰지 않는다(Task 3에서 실측값으로 더한다). 원칙·§1·시스템 항목은 틀 그대로 두고(체크 안 함, 근거 비움) Task 3에서 채운다.

    ③ (가) 문서 한 줄: Edit 도구로 `.planning/phases/04-project-quote-ledger/04-UI-SPEC.md` 385행 전체를 바꾼다.
    - 지금 줄(정확히): `| Error — 등록 폼 제출 | 버튼 옆 \`등록하지 못했습니다 · 클라이언트 1칸\`(§6-3 ERROR 행 — 1차는 살아 있다) |`
    - 새 줄(정확히, 백틱 포함): `| Error — 등록 폼 제출 | 버튼 옆 \`등록 실패 · {칸} {n}칸\` — 예 \`등록 실패 · 총 매출 예상가 1칸\`({칸} = 거부된 첫 칸 라벨: 시작일·종료일·총 매출 예상가, n = 거부된 칸 수 · §6-3 ERROR 행 — 1차는 살아 있다) |`
    - 오케스트레이터 결정(계획 뒤 추가): 1126행(§7-15 본문)도 같은 문구의 본문 계약이라 같은 결정(코드가 정본)으로 맞춘다. 지금 줄(정확히): `  \`등록하지 못했습니다 · 클라이언트 1칸\`과 칸 아래 \`Form.Error\` — 1차는 살아 있다(§6-3).` → 새 줄(정확히): `  \`등록 실패 · {칸} {n}칸\`(예 \`등록 실패 · 총 매출 예상가 1칸\`)과 칸 아래 \`Form.Error\` — 1차는 살아 있다(§6-3).` 59행(개정 이력 표 — 역사 기록)은 건드리지 않고 SUMMARY 「범위 밖 관찰」에 적는다. 04-UI-REVIEW.md도 건드리지 않는다. 385·1126 두 줄만 바꾼다.
    - CLAUDE.md §2는 `.planning/` 수동 편집을 금지하지만 이 한 줄은 사용자가 PR #104 [지시]로 명시한 편집이다(커밋 본문에 근거를 적는다). 훅이 이 Edit를 막으면 우회하지 말고 멈춰 그 메시지를 보고한다.

    ④ 커밋 직전 Skill `verification-before-completion`을 호출하고(훅이 강제 — 문서 커밋도 같다) UI-SPEC 파일 하나만 스테이징해 커밋한다. 제목 `docs: align registration submit error copy in 04-UI-SPEC with code`, 본문 한국어 1~2줄(PR #104 [지시] (가) — 명사형 코드 문구 `등록 실패 · {칸} {n}칸`이 정본, UI-SPEC 385·1126행 맞춤 · 코드 변경 0 · 사용자 명시 지시라 .planning 편집). 커밋 끝에 system-reminder의 attribution 줄. 점검표는 스테이징하지 않는다.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && F=.planning/phases/04-project-quote-ledger/04-UI-SPEC.md && test "$(sed -n 385p "$F")" = '| Error — 등록 폼 제출 | 버튼 옆 `등록 실패 · {칸} {n}칸` — 예 `등록 실패 · 총 매출 예상가 1칸`({칸} = 거부된 첫 칸 라벨: 시작일·종료일·총 매출 예상가, n = 거부된 칸 수 · §6-3 ERROR 행 — 1차는 살아 있다) |' && C="$(git log --format='%H %s' -10 | grep ' docs: align registration submit error copy in 04-UI-SPEC with code$' | head -1 | cut -d' ' -f1)" && test -n "$C" && test "$(git show --numstat --format= "$C" | tr -s '\n')" = "$(printf '2\t2\t%s' "$F")" && test -z "$(git status --porcelain -- "$F")" && K="docs/design/checks/2026-09-29-04-ui-가나다.md" && test -f "$K" && H="$(grep -m1 '^화면:' "$K")" && printf '%s' "$H" | grep -qF 'app/(app)/projects/project-form.tsx' && printf '%s' "$H" | grep -qF 'app/(app)/projects/[id]/quote-table.tsx' && printf '%s' "$H" | grep -qF 'app/(app)/projects/[id]/previous-revision.tsx' && grep -Eq '^지금\(수정 전\): .+' "$K" && grep -Eq '^계획: .+' "$K" && git diff --quiet -- app ui test && test -z "$(git ls-files --others --exclude-standard -- app ui test)"</automated>
  </verify>
  <done>UI-SPEC 385행이 새 줄과 정확히 같고 docs 커밋은 그 파일 1추가·1삭제만 담는다 · 점검표 파일이 「화면:」(세 파일)·「지금(수정 전):」·「계획:」을 갖고 아직 커밋되지 않았다 · app/·ui/·test/ 변경 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED — (나) 1280 두 견적 표 「번호」 숫자 규칙 · (다) 거부 뒤 첫 오류 칸 포커스 E2E, 수정 전 실패 확인 후 test 커밋</name>
  <files>test/e2e/quote-revisions.spec.ts, test/e2e/project-register.spec.ts</files>
  <precondition>로컬 Postgres가 떠 있다(`pnpm db:dev`, playwright.config.ts 기본 DATABASE_URL erp_test) · 포트 3100이 비어 있다 · Task 1 docs 커밋이 있다</precondition>
  <behavior>
    - (나) 1280: 현재 차수 「견적 줄」 표와 「차수 열기」로 연 「상세 견적 1차 견적 줄」 표에서 「번호」 th + 두 줄의 td 계산값 = [{번호, right, nowrap, tabular-nums}, {1, …}, {2, …}] — 수정 전에는 left · normal · normal이라 실패
    - (다) f1: 빈 폼 제출 → #clientId가 aria-invalid이고 포커스를 가진다 — 수정 전에는 버튼에 남아 실패. 이어서 총 매출 예상가에 1000 입력 → 값 1,000 · 포커스가 그 칸에 남는다(관계없는 다시 그리기 가드)
    - (다) f2: 종료일 < 시작일 등록을 1차 클릭으로 제출 → #endDate가 aria-invalid이고 포커스를 가진다 — 수정 전 실패
    - 두 파일의 기존 테스트는 수정 전에도 전부 통과한다
  </behavior>
  <action>
    시작 전에 Skill `test-driven-development`를 호출한다(CLAUDE.md §4 Build · §5 — 훅이 강제). 예상 밖 실패(빌드·로그인·시드·로케이터)가 나오면 고치기 전에 Skill `systematic-debugging`을 호출한다. 이 태스크에서 app/·ui/·docs/design/ 파일은 건드리지 않는다. 기존 테스트·도우미는 바꾸지 않고 더하기만 한다. `any` 금지.

    ① `test/e2e/quote-revisions.spec.ts` 파일 끝에 도우미 하나와 describe 하나(테스트 하나)를 더한다. 이 파일에 이미 있는 도우미(makeTeam · makeAccount · makeProject · copyRevision · login · quoteTable · quoteRows · revisionTable · previousTable)와 import(`Locator` 타입 포함, `DEFAULT_ROLE_ID`)를 그대로 쓴다 — 새 import가 필요 없다.
    - 도우미 `numberColumnCells(table: Locator)`: `table.evaluate`로 <table> 안에서 `thead th` 중 trim한 글자가 정확히 「번호」인 칸의 cellIndex를 찾고, tbody 줄 중 칸이 둘 이상인 줄(dataRowTexts와 같은 거르기 — 그룹 머리 줄·폰 접힌 줄 제외)의 같은 index 칸을 모은다. 머리글 칸 + 줄 칸마다 `{ text(trim), textAlign, whiteSpace, fontVariantNumeric }`(getComputedStyle)를 배열로 돌려준다. 머리글을 못 찾으면 빈 배열(단언이 크게 실패한다). 위에 한국어 주석 한 줄(PR #104 [지시] (나) — SYSTEM §2 177행 숫자 칸 규칙).
    - describe 제목 `견적 줄 「번호」 열 숫자 규칙 (PR #104 [지시] (나) — SYSTEM §2 숫자 칸)`, 테스트 제목 정확히 `1280에서 현재 차수 견적 줄 표와 이전 차수 읽기 표의 「번호」 머리글·칸이 숫자 규칙(오른쪽 정렬 · tabular-nums · nowrap)이다 (PR #104 (나))` — verify가 제목의 `PR #104 (나)` 표식으로 판정한다.
    - 준비: makeTeam → makeAccount(DEFAULT_ROLE_ID, team.id) → makeProject(줄 둘: 「번호 무대」 1_000_000/600_000 · 「번호 조명」 500_000/300_000) → copyRevision(project.id, project.revisionId)(2차가 현재 · 1차가 이전) → login → `page.setViewportSize({ width: 1280, height: 800 })` → 상세 goto → quoteRows 2개 확인 → quoteTable 안 columnheader 「번호」(exact) visible.
    - 단언: 기대값 = 머리글 「번호」와 줄 「1」「2」 각각 `{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }`. 현재 표 `expect.soft(await numberColumnCells(quoteTable(page))).toEqual(기대값)` → `revisionTable(page).getByRole("button", { name: "차수 열기" })`(이전 차수 하나라 버튼 하나) 클릭 → previousTable(page, 1) visible · 그 안 「번호 무대」(exact) visible → `expect.soft(await numberColumnCells(previousTable(page, 1))).toEqual(기대값)`. soft라 RED 한 번에 두 표의 실제 값이 모두 보인다.
    - 글자 확인: RED 출력에서 두 표의 text가 번호·1·2로 나왔는지 본다. 편집 표에서 줄이 더 잡히면(빈 입력 줄 등) 편집 표만 `td[role="gridcell"]`이 있는 줄로 좁힌다(quoteRows와 같은 기준) — 기대값을 느슨하게 바꾸지 않는다.

    ② `test/e2e/project-register.spec.ts`의 describe 「프로젝트 등록 폼 — Ctrl+Enter 제출 · Esc 취소 (Phase 4 04-08 Task 1)」(131행) 안, 테스트 (d4) 뒤 · describe 닫는 괄호(약 432행) 앞에 테스트 둘을 더한다. 같은 describe의 loginAndOpenForm · fillRequiredFields와 파일 import(insertVendor · SYSTEM_VIEWER · addDays · kstToday)를 쓴다. 제목 정확히:
    - (f1) `(f1) 빈 폼 제출이 거부되면 포커스가 첫 오류 칸(클라이언트)으로 가고, 그 뒤 쉼표 칸 입력은 포커스를 뺏기지 않는다 (PR #104 (다))`: loginAndOpenForm → `page.getByRole("button", { name: "프로젝트 등록" })` 클릭 → `#project-form #name` aria-invalid "true"(거부 도착 확인) → `#project-form #clientId` aria-invalid "true" · `toBeFocused()` → 가드: `page.getByLabel("총 매출 예상가")`에 fill("1000") → toHaveValue("1,000") → 그 칸 `toBeFocused()`(쉼표 칸 입력은 다시 그리기를 일으킨다 — effect가 매 렌더 돌면 포커스가 클라이언트로 튄다).
    - (f2) `(f2) 종료일이 시작일보다 앞선 등록을 1차 클릭으로 보내면 포커스가 종료일 칸으로 간다 (PR #104 (다))`: (d3)과 같은 거래처 준비(이름에 `E2E오류포커스-${Date.now()}`) → loginAndOpenForm → fillRequiredFields → 시작일 오늘+5 · 종료일 오늘+1(`#startDate`·`#endDate` 또는 getByLabel) → 「프로젝트 등록」 클릭(Ctrl+Enter를 쓰지 않는다 — 포커스가 칸 밖 버튼에 있어야 이동을 잴 수 있다) → `#project-form #endDate` aria-invalid "true" · `toBeFocused()` → URL이 여전히 `/projects?new=1`.

    ③ RED 확인 — 한 번에 하나만(두 파일을 한 호출로, 워커 하나): `CI=true pnpm exec playwright test test/e2e/quote-revisions.spec.ts test/e2e/project-register.spec.ts --project=desktop --workers=1 --reporter=list` (Bash timeout 1200000 — CI면 먼저 프로덕션 빌드를 한다). 기대: 새 세 테스트만 실패 — (나)는 toEqual(left · normal · normal), (다) 둘은 toBeFocused(포커스가 버튼). 기존 테스트는 전부 통과. 빌드·로그인·시드·로케이터 오류면 RED가 아니다 → systematic-debugging. 포트 3100이 남아 있으면 PID를 찾아 `kill <PID>`로만 끈다(`pkill -f` 금지). 출력은 요약만, 실패는 실패 줄만 인용한다. RED 실측값(두 표의 textAlign·whiteSpace·fontVariantNumeric, 수정 전 activeElement)을 SUMMARY용으로 적어 둔다.
    ④ `pnpm lint`와 `pnpm typecheck` 통과.
    ⑤ 커밋 직전 Skill `verification-before-completion`을 호출하고 두 스펙 파일만 커밋한다. 제목 `test: pin quote row-number numeric rule and registration focus-to-first-error`, 본문 한국어 1~2줄(RED — PR #104 [지시] (나)(다) · 수정 전: 1280 「번호」 열 left/normal/normal, 거부 뒤 포커스가 버튼에 남음). 커밋 끝에 attribution 줄.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && S="$(mktemp -d)" && { PLAYWRIGHT_JSON_OUTPUT_NAME="$S/r.json" CI=true pnpm exec playwright test test/e2e/quote-revisions.spec.ts test/e2e/project-register.spec.ts --project=desktop --workers=1 --reporter=json >/dev/null 2>&1; true; } && node -e 'const r=require(process.argv[1]);const out=[];const walk=s=>{for(const sp of s.specs||[])out.push(sp);for(const c of s.suites||[])walk(c)};for(const s of r.suites||[])walk(s);const msg=sp=>sp.tests.flatMap(t=>t.results).flatMap(x=>x.errors||[]).map(e=>e.message||"").join("\n");for(const sp of out)console.log(sp.ok?"PASS":"FAIL",sp.title);const na=out.filter(sp=>sp.title.includes("PR #104 (나)"));const da=out.filter(sp=>sp.title.includes("PR #104 (다)"));const rest=out.filter(sp=>!sp.title.includes("PR #104 ("));const ok=na.length===1&&na.every(sp=>!sp.ok&&msg(sp).includes("toEqual"))&&da.length===2&&da.every(sp=>!sp.ok&&msg(sp).includes("toBeFocused"))&&rest.length>0&&rest.every(sp=>sp.ok);process.exit(ok?0:1)' "$S/r.json" && pnpm lint && pnpm typecheck && git diff --quiet -- app ui && C="$(git log --format='%H %s' -10 | grep ' test: pin quote row-number numeric rule and registration focus-to-first-error$' | head -1 | cut -d' ' -f1)" && test -n "$C" && test "$(git show --name-only --format= "$C" | tr -s '\n' | LC_ALL=C sort | tr '\n' ' ')" = "test/e2e/project-register.spec.ts test/e2e/quote-revisions.spec.ts "</automated>
  </verify>
  <done>CI=true 프로덕션 빌드에서 새 세 테스트가 예상 matcher((나) toEqual · (다) toBeFocused)로 실패하고 두 파일의 기존 테스트는 전부 통과한다 · lint·typecheck 통과 · RED 커밋은 두 스펙 파일만 담는다 · app/·ui/ 변경 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — 「번호」 열 align right 두 줄 · 등록 폼 거부 시 첫 오류 칸 포커스 effect, 점검표 채워 fix 커밋</name>
  <files>app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/previous-revision.tsx, app/(app)/projects/project-form.tsx, docs/design/checks/2026-09-29-04-ui-가나다.md</files>
  <behavior>
    - Task 2의 새 세 테스트와 두 스펙 파일의 기존 테스트가 전부 통과한다(CI=true)
    - 화면 변경은 열 정의 두 줄의 align 값 + project-form.tsx에 더한 effect뿐 — CSS·토큰·문구·ui/ 변경 0
  </behavior>
  <action>
    화면 파일을 고치기 전에 design-gate가 이 에이전트에서 호출돼 있어야 한다(Task 1 — 훅이 다시 요구하면 Skill `design-gate`를 다시 호출한다). Task 2 스펙이 RED인 상태에서 시작한다(test-driven-development 규율). 게이트나 스펙이 예상 밖으로 실패하면 고치기 전에 Skill `systematic-debugging`.

    ① (나) 열 정의 두 줄 — PR #104 [지시] (나):
    - `app/(app)/projects/[id]/quote-table.tsx` 1635~1643행 열 key "sort"(머리글 「번호」)의 align 줄만 `align: "right",`로 바꾼다(지금 값은 left). priority · collapseBelow · pasteRole · cell은 그대로.
    - `app/(app)/projects/[id]/previous-revision.tsx` 56행 `column({ key: "sort", header: "번호", … })` 안의 align 값만 `"right"`로 바꾼다(같은 줄의 다른 글자는 그대로). copyText(복사 글자)는 align과 무관하다.
    - `ui/table/Table.tsx`·`Table.module.css`는 바꾸지 않는다 — Table이 812·886행에서 `align === "right"`면 th·td에 `.alignRight`(67~70행: text-align right · tabular-nums · nowrap)를 붙인다. 이 열은 collapseBelow 1280이라 1280 미만(폰 포함)에서는 지금처럼 숨는다.

    ② (다) `app/(app)/projects/project-form.tsx` — PR #104 [지시] (다), S19 「오류로 이동」:
    - 기존 마운트 effect(134~139행) 바로 뒤에 `useEffect` 하나를 더한다. 의존성은 `[result]` 하나뿐. 본문: result가 거부 응답일 때만 — `result.validationErrors`가 있거나, `result.data`가 있고 그 안에 `"rejected"` 키가 있을 때(222행과 같은 좁히기) — `document.getElementById("project-form")`(135·205행과 같은 방식)에서 `querySelector<HTMLElement>('[aria-invalid="true"]')`로 DOM 순서 첫 오류 칸을 찾아 있으면 `focus()`한다. 위에 한국어 주석 한 줄(PR #104 [지시] (다) — S19 「오류로 이동」을 §7-15 폼에: 거부 응답이 올 때만 첫 오류 칸으로).
    - 왜 result에 거는가(주석에 길게 쓰지 않는다): next-safe-action 8.7.3의 useAction은 result를 useState로 들고 응답마다만 새 객체를 넣는다 — 쉼표 칸 입력 같은 관계없는 다시 그리기에서는 effect가 돌지 않고, 성공이면 오류가 없어 포커스를 건드리지 않으며(기존 onSuccess 이동 그대로), useCommaInput의 입력 중 오류는 result를 바꾸지 않는다.
    - 하지 않는 것: serverError(FormAlert)에 포커스 · isExecuting·executionId에 걸기 · 매 렌더 실행 · handleSubmit/handleKeyDown/onSuccess/onError 변경 · 새 state·ref · import 변경(useEffect는 이미 import돼 있다) · 기존 줄 삭제.

    ③ 게이트를 순서대로(CLAUDE.md §6 싼 게이트 → 건드린 스펙): `pnpm lint` → `pnpm typecheck` → `CI=true pnpm build` → Task 2와 같은 E2E 한 호출(`CI=true pnpm exec playwright test test/e2e/quote-revisions.spec.ts test/e2e/project-register.spec.ts --project=desktop --workers=1 --reporter=list`, Bash timeout 1200000). 두 파일 전부 통과해야 한다. (f1)의 가드가 실패하면 effect가 너무 자주 돈다 — 의존성부터 확인. 전체 E2E는 CI가 돈다. 포트 3100 잔존 프로세스는 PID로만 끈다.

    ④ 점검표 `docs/design/checks/2026-09-29-04-ui-가나다.md`를 채운다(design-gate §4 — 훅이 빈 체크 상자와 빈 「근거:」를 막는다):
    - 「계획:」 아래에 `결과(수정 후): …` 한 줄을 더한다 — GREEN 실측(1280 두 표 「번호」 th·td 3칸씩 right · nowrap · tabular-nums / 빈 제출 activeElement = #clientId / 종료일 거부 = #endDate / 쉼표 칸 입력 뒤 포커스 유지).
    - 모든 항목을 체크(`- [x]`)하고 근거 한 줄씩. 근거 방향: 안내 문구·같은 말 두 번 = 화면 문구 변경 0((가)는 문서를 코드에 맞춘 것) · 결정 최소 = 입력·선택지 추가 0, 거부 뒤 사용자가 오류 칸을 찾지 않아도 된다 · 할 수 없는 선택지 = 렌더 조건 변경 0 · 주 버튼 하나 = 1차 「프로젝트 등록」·「일괄 저장」 그대로 · 위험한 동작 = 변경 0 · 빈 화면 = 변경 0 · 키보드 = 거부 뒤 키보드 사용자가 첫 오류 칸에 선다(Ctrl+Enter도 requestSubmit으로 같은 길), Tab 순서·표 엑셀 키 변경 0 · 같은 종류 같은 모양 = 「번호」 열이 수량·단가 등 다른 숫자 열과 같은 `.alignRight`, 현재 표와 이전 차수 읽기 표가 같은 모양(SYSTEM §2 177행) · §1 결정 = 견적 엑셀식·옆 패널·스킨 A 미접촉 · 새 색 = CSS 변경 0, 기존 `.alignRight` 클래스만 · 폰 320·44 = 「번호」 열은 collapseBelow 1280이라 폰에서 숨음 그대로, CSS 변경 0, 폼 포커스는 배치를 바꾸지 않음 · 실제 앱 화면 = 스크린샷 육안 판정 금지(CLAUDE.md §6) — CI=true 실제 앱 E2E DOM 실측(quote-revisions 1280 · project-register 포커스)으로 대신(04-폰-터치-44 점검표 선례).

    ⑤ 커밋 직전 Skill `verification-before-completion`을 호출한 뒤 네 파일(TSX 셋 · 점검표)만 한 커밋으로 커밋한다. 제목 `fix: numeric rule for quote row-number column and focus first error on registration reject`, 본문 한국어 2~3줄((나) 1280 현재·이전 차수 견적 표 「번호」 열 align right — Table 기존 .alignRight(tabular-nums·nowrap), ui/table 변경 0 · (다) 등록 폼 거부 응답이 올 때만 첫 aria-invalid 칸으로 포커스(S19) · PR #104 [지시] 5894569505). 커밋 끝에 attribution 줄. PLAN·SUMMARY·STATE는 커밋하지 않는다(오케스트레이터 몫).
    SUMMARY는 `.planning/quick/260929-opt-ui-ga-na-da-form-error-copy-row-number-n/260929-opt-SUMMARY.md`에 frontmatter `status: complete`로 쓰되 커밋하지 않는다 — 세 커밋 해시, RED 실측값과 GREEN 실측값, 그리고 「범위 밖 관찰」: UI-SPEC 59행(개정 이력 표 — 역사 기록이라 그대로)에 옛 문구 `등록하지 못했습니다 · 클라이언트 1칸`이 남아 있다(385·1126행은 맞춤) · 04-UI-REVIEW 「사용자 판단 필요」 1~3은 PR #104 [지시]로 정해졌지만 그 문서는 고치지 않았다.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && pnpm lint && pnpm typecheck && CI=true pnpm build && S="$(mktemp -d)" && { PLAYWRIGHT_JSON_OUTPUT_NAME="$S/g.json" CI=true pnpm exec playwright test test/e2e/quote-revisions.spec.ts test/e2e/project-register.spec.ts --project=desktop --workers=1 --reporter=json >/dev/null 2>&1; true; } && node -e 'const r=require(process.argv[1]);const out=[];const walk=s=>{for(const sp of s.specs||[])out.push(sp);for(const c of s.suites||[])walk(c)};for(const s of r.suites||[])walk(s);for(const sp of out)console.log(sp.ok?"PASS":"FAIL",sp.title);const mk=out.filter(sp=>sp.title.includes("PR #104 ("));process.exit(mk.length===3&&out.length>3&&out.every(sp=>sp.ok)?0:1)' "$S/g.json" && R="$(git log --format='%H %s' -20 | grep ' test: pin quote row-number numeric rule and registration focus-to-first-error$' | head -1 | cut -d' ' -f1)" && test -n "$R" && git log --format='%s' "$R"..HEAD | grep -qx 'fix: numeric rule for quote row-number column and focus first error on registration reject' && N="$(git -c core.quotePath=false diff --name-only "$R" HEAD -- app ui docs/design test)" && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\n' ' ')" = "app/(app)/projects/[id]/previous-revision.tsx app/(app)/projects/[id]/quote-table.tsx app/(app)/projects/project-form.tsx docs/design/checks/2026-09-29-04-ui-가나다.md " && for f in "app/(app)/projects/[id]/quote-table.tsx" "app/(app)/projects/[id]/previous-revision.tsx"; do D="$(git diff -U0 "$R" HEAD -- "$f" | grep -E '^[-+][^-+]')"; test "$(printf '%s\n' "$D" | wc -l)" = 2 && printf '%s\n' "$D" | sed -n 1p | grep -q '^-.*align: "left"' && test "$(printf '%s\n' "$D" | sed -n 1p | sed 's/^-//; s/align: "left"/align: "right"/')" = "$(printf '%s\n' "$D" | sed -n 2p | sed 's/^+//')" || { echo "FAIL align diff $f"; exit 1; }; done && git diff -U0 "$R" HEAD -- "app/(app)/projects/[id]/previous-revision.tsx" | grep -q '^+.*key: "sort", header: "번호".*align: "right"' && P="app/(app)/projects/project-form.tsx" && G="$(git diff "$R" HEAD -- "$P")" && test "$(printf '%s\n' "$G" | grep -cE '^-[^-]')" = 0 && test "$(printf '%s\n' "$G" | grep -cE '^\+[^+]')" -le 15 && printf '%s\n' "$G" | grep -E '^\+' | grep -qF '[aria-invalid="true"]' && printf '%s\n' "$G" | grep -Eq '^\+.*\}, \[result\]\);' && K="docs/design/checks/2026-09-29-04-ui-가나다.md" && ! grep -Eq '^[[:space:]]*([-*+]|[0-9]+\.) \[ \]' "$K" && ! grep -Eq '근거:[[:space:]]*$' "$K" && grep -Eq '^결과\(수정 후\): .+' "$K" && H="$(grep -m1 '^화면:' "$K")" && printf '%s' "$H" | grep -qF 'app/(app)/projects/project-form.tsx' && printf '%s' "$H" | grep -qF 'app/(app)/projects/[id]/quote-table.tsx' && printf '%s' "$H" | grep -qF 'app/(app)/projects/[id]/previous-revision.tsx' && test -z "$(git status --porcelain -- app ui docs/design test)"</automated>
  </verify>
  <done>lint·typecheck·CI=true build 통과 · 두 스펙 파일 전부 통과(새 셋 포함, CI=true) · RED 이후 바뀐 파일은 정확히 넷(TSX 셋 · 점검표), ui/ 변경 0 · 두 열 정의 diff는 각각 align left→right 한 줄 · project-form.tsx는 지운 줄 0 · 더한 줄 15 이하 · `[aria-invalid="true"]`와 `}, [result]);` 포함 · 점검표 빈 체크 상자·빈 근거 0, 「결과(수정 후):」 있음, 「화면:」에 세 파일 · 작업 트리 깨끗 · SUMMARY 작성(미커밋, status: complete).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 없음(새 경계 0) | 열 정의 align 값 두 줄 · 클라이언트 폼의 포커스 이동 effect(DOM 읽기 + focus만) · 테스트 전용 시드 · 문서 한 줄. 서버 액션·권한 판정·입력 검증·데이터 경로 변경 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q-opt-01 | Tampering | project-form.tsx 포커스 effect | low | accept | 서버 응답(result)을 읽기만 하고 입력 값·제출 경로(handleSubmit · createProjectAction · submittedRef 래치)는 그대로. Task 3 verify가 project-form.tsx 지운 줄 0 · 더한 줄 15 이하를 판정 |
| T-q-opt-02 | Tampering | test/e2e 시드(quote-revisions · project-register) | low | accept | 테스트 스키마(erp_test)만 쓴다 — global-setup이 매 실행 리셋. 프로덕션 DB 명령 없음 |
</threat_model>

<verification>
- (가): Task 1 verify — UI-SPEC 385행이 새 줄과 정확히 같고 docs 커밋은 1추가·1삭제뿐.
- RED: Task 2 verify — CI=true에서 새 세 테스트가 (나) toEqual · (다) toBeFocused로 실패, 기존 테스트 통과, RED 커밋 = 두 스펙 파일.
- GREEN: Task 3 verify — lint · typecheck · CI=true build · 두 스펙 CI=true 전부 통과 · 바뀐 파일 넷 · 열 정의 diff 한 줄씩 · 폼 diff 더하기만 · 점검표 빈칸 0.
- 이 플랜 밖(오케스트레이터 몫, 실행자가 하지 않는다): 독립 DOM 감사(별도 에이전트, CI=true, 1280 두 견적 표 + 등록 폼 거부 포커스) → PR 묶음의 `/review` → `/design-review` → `/qa`. 전체 E2E는 CI.
</verification>

<success_criteria>
- UI-SPEC 385행 = 코드 문구 `등록 실패 · {칸} {n}칸`(예 `등록 실패 · 총 매출 예상가 1칸`), 코드 변경 0.
- 1280: 현재·이전 차수 견적 표 「번호」 th·td가 right · nowrap · tabular-nums. ui/table 변경 0.
- 등록 폼 거부 → 첫 오류 칸 포커스(빈 제출 = 클라이언트, 종료일 거부 = 종료일). 관계없는 다시 그리기·성공·입력 중 쉼표 칸 오류에서는 포커스를 가져가지 않는다.
- 커밋 셋: docs:(가) → test:(RED) → fix:(GREEN + 점검표). 새 의존성·토큰·색·문구 0, 요청 밖 리팩터 0.
</success_criteria>

<output>
Create `.planning/quick/260929-opt-ui-ga-na-da-form-error-copy-row-number-n/260929-opt-SUMMARY.md` when done (frontmatter `status: complete`, 커밋하지 않는다 — 오케스트레이터가 문서 커밋을 맡는다)
</output>
