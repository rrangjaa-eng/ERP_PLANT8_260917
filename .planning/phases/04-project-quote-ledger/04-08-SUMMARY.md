---
phase: 04-project-quote-ledger
plan: 08
subsystem: ui
tags: [design-system, keyboard-shortcuts, next-safe-action, react19, vitest, playwright]

requires:
  - phase: 04-project-quote-ledger
    provides: "04-01 프로젝트 등록 폼(project-form.tsx)·SYSTEM.md §7-15 폼 계약, 04-05 프로젝트 목록"
provides:
  - "lib/shortcut.ts의 isCtrlCombo(event, key) — 04-28 견적 표 키보드가 재사용할 공용 Ctrl 조합 판정"
  - "등록 폼 Ctrl+Enter 제출(연타·이동 지연 중 재입력 가드) · Esc 취소(빈 폼 갈래)"
  - "SYSTEM.md 개정 ①~⑯ 중 ⑦·⑮(04-46)와 ⑧의 C-27·폰 창(04-29) 제외한 전부 + §7-16 신설 + §6-2 스케치 갱신"
  - "DECISIONS.md 2026-09-23 Phase 4(04-08) 기록 15건"
affects: ["04-28", "04-29", "04-46", "이후 모든 화면(SYSTEM.md 규칙 소비)"]

actuals:
  tokens: 30534
  tasks: 2
  commits: 9

tech-stack:
  added: []
  patterns:
    - "isCtrlCombo(event, key) 순수 함수 — ctrlKey만 읽고 metaKey 무시, repeat·isComposing 가드(D-94)"
    - "제출 래치(submittedRef) — 성공 뒤 네비게이션 완료까지 유지, onError에서만 해제"
    - "isFormPristine(initial, current) — 렌더 시 스냅숏 vs 현재값 필드별 비교"

key-files:
  created:
    - lib/shortcut.ts
    - test/unit/lib/shortcut.test.ts
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - app/(app)/projects/project-form.tsx
    - ui/shell/TopBar.tsx
    - ui/next-turn/NextTurn.tsx
    - test/unit/ui/next-turn.test.ts
    - test/unit/design-system-docs.test.ts
    - test/e2e/project-register.spec.ts

key-decisions:
  - "단축키 표기·동작은 Windows Ctrl(D-94) — metaKey를 읽지 않는다"
  - "등록 폼 제출은 submittedRef 래치로 이중화 — isExecuting 가드만으로는 성공 뒤 이동 지연 사이의 재입력을 막지 못한다(엔지 리뷰 C §1 P2)"
  - "SYSTEM.md §7-3 (가) 잠김 정의를 D-78 개정(CEO-D10·D12)으로 갱신 — 정산 프로젝트의 줄 추가는 렌더한다(rev4 원문 반대 방향)"
  - "§7-4 대기 태그 색을 §7-5 의미 목록에 맞춰 accent→muted로 정정(기존 §7-4/§7-5 불일치 해소)"
  - "플랜의 baseline 커밋 d6b41cf가 이 저장소에 없어 실제 04-08 시작 시점 HEAD(b0fc281)를 tokens.css/package.json/pnpm-lock.yaml 불변 검증 기준으로 대신 썼다"

patterns-established:
  - "Ctrl 조합 판정은 lib/shortcut.ts의 isCtrlCombo 하나만 쓴다 — 04-28도 이 함수를 가져다 쓴다"
  - "폼 컴포넌트의 Esc 취소는 isFormPristine 비교로 판정한다 — 04-46이 같은 비교를 재사용해 입력 버리기 확인을 붙인다"

requirements-completed: [UX-05, UX-04]

coverage:
  - id: D1
    description: "등록 폼 Ctrl+Enter가 표준 제출을 부르고, 연타·성공 뒤 이동 지연 중 재입력이 중복 등록을 만들지 않는다"
    requirement: "UX-05"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(a) 마우스 클릭 없이 마지막 칸에서 Control+Enter를 누르면 상세로 이동하고 번호가 부여된다"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(b) Control+Enter를 빠르게 두 번 누르면 상세로 한 번만 이동하고 같은 이름 프로젝트가 정확히 1건이다(C-06)"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(b2) 성공 뒤 상세 이동이 지연되는 사이 다시 눌러도 같은 이름 프로젝트가 정확히 1건이다(엔지 리뷰 C 공백 9)"
        status: pass
      - kind: unit
        ref: "test/unit/lib/shortcut.test.ts#isCtrlCombo"
        status: pass
    human_judgment: false
  - id: D2
    description: "등록 폼 Esc가 빈 폼에서는 목록으로 이동하고, 입력이 있으면 폼과 값을 그대로 둔다(입력 손실 없음)"
    requirement: "UX-04"
    verification:
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(c) 빈 폼의 칸에서 Escape를 누르면 등록 폼이 닫힌 목록 주소로 간다"
        status: pass
      - kind: e2e
        ref: "test/e2e/project-register.spec.ts#(c2) 프로젝트명 한 칸을 적은 뒤 Escape를 누르면 폼이 그대로이고 적은 값이 남는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "SYSTEM.md 개정 ①③④⑤⑥⑧⑨⑩⑪⑫⑬⑭⑯ + §7-16 신설 + §6-2 스케치 갱신 + DECISIONS 기록 15건 — 다음 화면들이 물려받을 시스템 규칙 확정"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts#docs/design/SYSTEM.md — 2026-09-23 개정(04-08)"
        status: pass
    human_judgment: false
  - id: D4
    description: "진행 막대 색과 §1-3 충돌을 DECISIONS.md에 기록하고 이번 페이즈에서는 막대를 만들지 않는다(C-10, D17)"
    verification: []
    human_judgment: true
    rationale: "실제 화면 렌더가 없는 문서 기록 항목 — 자동 검증 대상이 아니다. SYSTEM.md §1-3 목록이 바뀌지 않았음은 텍스트 검사로 확인했으나, '만들지 않기로 한 결정이 맞는가'는 사람 판단."

duration: 41min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 08: 단축키 D-94 트레이서 + SYSTEM.md 보완 개정 Summary

**등록 폼 Ctrl+Enter/Esc를 실제로 배선(제출 래치 + 초기값 스냅숏 비교)하고, SYSTEM.md에 다음 화면들이 물려받을 시스템 규칙 13건(숫자 쉼표·목록 페이지·편집 표 잠김/상한·상태 태그·코드표 설명·페이지 줄·힌트 줄·확인 근거·P0 안내 최소)을 DECISIONS.md 기록과 함께 확정했다.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-09-24T06:12:47Z
- **Completed:** 2026-09-24T06:53:02Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `lib/shortcut.ts`의 `isCtrlCombo(event, key)` — Ctrl 조합 판정 한 함수(자동 반복·한글 조합 중이면 거짓, `metaKey` 무시). 04-28 견적 표 키보드가 같은 함수를 쓴다
- 등록 폼 `Ctrl+Enter` 제출을 실제로 배선 — `submittedRef` 래치(성공 뒤 상세 이동 전까지 유지)로 연타·이동 지연 중 재입력이 중복 등록을 만들지 않는다(엔지 리뷰 C §1 P2, E2E (b)·(b2)로 결정적으로 고정)
- 등록 폼 `Esc` 취소를 실제로 배선 — `isFormPristine`이 참일 때만(입력 없음) 목록으로 이동, 입력이 있으면 폼과 값을 그대로 둔다(DR-27 빈 폼 갈래, 04-46이 입력 버리기 확인을 이어 붙인다)
- `docs/design/SYSTEM.md`에서 맥 커맨드·엔터 글리프(`⌘`·`↵`) 25줄 전부를 `Ctrl+`/`Enter` 표기로 치환하고 상단 바 검색 kbd를 `Ctrl+K`로(TopBar.tsx)
- `docs/design/DECISIONS.md`에 2026-09-23 Phase 4(04-08) 기록 15건 — 개정 ②①③④⑤⑥⑧⑨⑩⑪⑫⑬⑭⑯ + 진행 막대 색 충돌 기록(C-10, D17). 전부 대응하는 SYSTEM.md 개정 커밋보다 먼저 커밋됐다
- SYSTEM.md 개정 13건 반영: 숫자 천 단위 쉼표(①) · 목록 표 위 합계 줄 + 번호 페이지 + 열 접기 1024/1280 확장(③) · 편집 표 잠김 3단계 재정의 + 페이지·줄 수 상한 신설(④, D-78 개정 CEO-D10·D12) · 상태 태그 여섯 낱말(⑤) · 코드표 값 설명(⑥) · §7-16 페이지 줄 신설(⑧) · Form.Hint 두 번째 쓰임(⑨) · 대기 태그 색 정정(⑩) · 담당자 표기(⑪) · 편집 표 저장 흐름·합계 행 톤 순서·권한 밖 줄·충돌 셀·이전 차수 보관본(⑫) · 힌트 줄 자리·표기(⑬) · 확인 근거 한 칸 확장(⑭) · P0 안내 문구 최소(⑯)
- `ui/next-turn/NextTurn.tsx`의 `대기` 태그 색을 `accent`→`muted`로 정정(§7-4/§7-5 불일치 해소) — §7-4 787행에 남아 있던 잔여 1건은 새 문서 테스트가 잡아 함께 고쳤다
- `test/unit/design-system-docs.test.ts`에 27줄짜리 「재실행 가능한 확인」 담당표 중 이 플랜 몫(1·4·5·6·7·8·9(7-16만)·10·13·15~26 + 글리프 넷 + 스케치 + DECISIONS 15건)을 단언하는 새 describe 블록 추가(69개 테스트, 전부 통과)
- `test/e2e/project-register.spec.ts`에 케이스 5개 추가 — (a) 클릭 없이 Ctrl+Enter 제출 (b) 연타 1건 (b2) 성공 뒤 이동 지연 중 재입력 1건(요청 가로채기로 결정적 검증) (c) 빈 폼 Esc → 목록 (c2) 값 있는 폼 Esc → 폼·값 유지

## Task Commits

Task 1 (트레이서 — D-94):

1. `183e113` — docs(04-08): DECISIONS 기록 — 단축키 표기·동작은 Windows Ctrl (D-94)
2. `5555ca2` — docs(04-08): SYSTEM.md 개정 ② — 단축키 표기·동작을 Windows Ctrl로 (D-94)
3. `8307745` — test(04-08): add failing test for isCtrlCombo (RED)
4. `329ba5d` — feat(04-08): implement isCtrlCombo shortcut helper (GREEN)
5. `2e457c1` — feat(04-08): 등록 폼 Ctrl+Enter 제출·Esc 취소 배선 + 상단 바 Ctrl+K 표기

Task 2 (SYSTEM.md 개정 + `대기` 색 + 문서 단언):

6. `83ff41f` — docs(04-08): DECISIONS 기록 — SYSTEM.md 개정 13건 + 진행 막대 충돌 기록
7. `be71d04` — test(04-08): add failing test for NextTurn 대기 태그 muted 색 (RED)
8. `832757e` — feat(04-08): 「내 차례」 대기 태그 색을 muted로 정정 (GREEN)
9. `eccc194` — docs(04-08): SYSTEM.md 개정 13건 + 스케치 갱신 + 문서 단언 (Task 2)

**Plan metadata:** (다음 커밋 — 이 SUMMARY와 STATE/ROADMAP)

## Files Created/Modified

- `lib/shortcut.ts` — `isCtrlCombo(event, key)` 순수 함수(신규)
- `test/unit/lib/shortcut.test.ts` — isCtrlCombo 표 7케이스(신규)
- `app/(app)/projects/project-form.tsx` — Ctrl+Enter 제출 래치, Esc 취소, `isFormPristine`/`snapshotFormValues`
- `ui/shell/TopBar.tsx` — 검색 kbd `Ctrl+K`
- `docs/design/DECISIONS.md` — 2026-09-23 Phase 4(04-08) 기록 15건
- `docs/design/SYSTEM.md` — 개정 ①~⑯ 중 13건 + §7-16 신설 + §6-2 스케치 + §11/§8 보강
- `ui/next-turn/NextTurn.tsx` — `대기` 태그 kind `accent`→`muted`
- `test/unit/ui/next-turn.test.ts` — 대기 색 소스 단언(신규 describe)
- `test/unit/design-system-docs.test.ts` — 2026-09-23 개정 담당 describe 블록(신규, 27개 단언)
- `test/e2e/project-register.spec.ts` — Ctrl+Enter/Esc 케이스 5개(신규 describe)

## Decisions Made

- D-94를 「표기뿐 아니라 동작도 Ctrl」로 해석 — `metaKey`를 아예 읽지 않는다(맥 사용자를 위한 폴백 없음, 직원 전원 Windows 전제와 일치)
- 제출 이중 방지는 `isExecuting` 가드만으로 불충분하다고 판단해 `submittedRef` 래치를 추가(엔지 리뷰 C §1 P2가 지적한 공백을 커버) — 래치는 `onError`에서만 해제, 성공 시엔 페이지 이동으로 컴포넌트가 언마운트될 때까지 유지
- SYSTEM.md §7-3 (가) 잠김 정의는 rev4 초안이 아니라 사용자의 CEO 리뷰 결정(D10 줄 추가 허용·D12 새 줄은 실행가만)을 반영 — DECISIONS ④ 머리글에 `D-78 개정(CEO-D10·D12)`으로 남김
- §7-4/§7-5의 `대기` 색 불일치는 §7-5(의미 목록, 닫힌 목록)를 정본으로 삼아 §7-4를 muted로 맞췄다(§1-3 accent 다섯 곳 규칙 보존)
- design-system-docs.test.ts의 새 describe 블록을 SYSTEM.md 변경과 같은 커밋에 넣었다 — CI 경로 필터(`docs/**` 제외)가 SYSTEM.md 단독 변경 커밋을 건너뛰기 때문(파일 머리 주석의 기존 규약을 그대로 따름)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] §7-9 신규 규칙 문장이 자기 자신이 금지하는 글리프를 포함**
- **Found during:** Task 1 ②(§7-9 규칙 추가)
- **Issue:** UI-SPEC 원문을 그대로 옮기면 "⌘·↵ 글리프를 쓰지 않는다" 문장 안에 금지 대상 글리프(`⌘`, `↵`)가 리터럴로 남아, 이 태스크 자신의 검증 명령(`grep -c "⌘" → 0`)을 깨뜨린다
- **Fix:** "⌘"·"↵" 대신 "맥 커맨드·엔터 글리프"로 서술(같은 §7-9 절과 §11 항목 둘 다)
- **Files modified:** docs/design/SYSTEM.md
- **Verification:** `node -e "...grep 글리프 넷..."` → ok, 42/42 기존 design-system-docs 테스트 그대로 통과
- **Committed in:** `5555ca2`

**2. [Rule 1 - Bug] E2E (c) 케이스가 하이드레이션 경합으로 간헐적 실패**
- **Found during:** Task 1 ⑤(E2E 작성 중 GREEN 확인)
- **Issue:** 로그인 직후 `page.goto("/projects?new=1")`에 바로 이어 `Escape`를 누르면, 클라이언트 컴포넌트(`project-form.tsx`)의 `onKeyDown` 리스너가 아직 하이드레이션되지 않은 상태에서 키 이벤트가 지나가 버려 이동이 일어나지 않는 경우가 있었다(재현: 최소 스크립트로 확인, `page.on("console")`로 핸들러 미호출을 직접 관측)
- **Fix:** `loginAndOpenForm` 헬퍼에 `page.waitForLoadState("networkidle")`를 추가 — (a)·(b)·(b2)는 이미 select/fill 조작으로 충분한 지연이 있어 영향 없음, (c)·(c2)만 이 대기로 안정화
- **Files modified:** test/e2e/project-register.spec.ts
- **Verification:** 같은 스펙 10회 연속 실행(전체 + `-g` 필터 재실행) 전부 7/7 통과
- **Committed in:** `2e457c1`

**3. [Rule 1 - Bug] §7-4 787행에 「대기(--accent)」 잔여 1건**
- **Found during:** Task 2 ④(design-system-docs.test.ts 새 describe 블록 첫 실행)
- **Issue:** ⑩ 개정을 §7-5 보강 줄과 NextTurn.tsx에는 반영했지만, §7-4 자체의 태그 순서 문장(`막힘→오늘→결재→대기`)에 있는 `대기(--accent)`를 놓쳤다 — 새로 작성한 테스트가 즉시 RED로 잡았다
- **Fix:** §7-4 문장의 `대기(--accent)`를 `대기(--muted)`로 정정
- **Files modified:** docs/design/SYSTEM.md
- **Verification:** `pnpm vitest run test/unit/design-system-docs.test.ts` 69/69 통과(수정 전 68/69, 항목 7 실패)
- **Committed in:** `eccc194`(같은 커밋 — 아직 별도 커밋 전 발견해 바로 합쳐 고쳤다)

**4. [Rule 1 - Bug] 플랜의 baseline 커밋 `d6b41cf`가 이 저장소에 없음**
- **Found during:** Task 2 최종 검증(`git diff --stat d6b41cf -- docs/design/tokens.css`)
- **Issue:** `git cat-file -t d6b41cf` → `Not a valid object name`. `git fsck --unreachable`로도 찾지 못했다 — 이 해시는 이 저장소 히스토리에 전혀 존재하지 않는다(플랜 작성 세션과 실행 세션의 저장소 상태 불일치로 추정)
- **Fix:** 플랜 텍스트가 이 해시를 "보완 계획 시작 커밋"(= 04-08 착수 직전)이라 설명하므로, 이 저장소에서 그 지점에 해당하는 실제 커밋 `b0fc281`("wip: phase 04 paused after session D (04-50 done)")을 대신 기준으로 썼다
- **Files modified:** 없음(검증 명령의 기준 커밋만 대체) — `docs/design/tokens.css`·`package.json`·`pnpm-lock.yaml` 모두 `b0fc281` 대비 diff 0
- **Verification:** `git diff --stat b0fc281 -- docs/design/tokens.css`(빈 출력) · `git diff b0fc281 -- package.json`(빈 출력) · `git diff --stat b0fc281 -- pnpm-lock.yaml`(빈 출력)
- **Committed in:** 해당 없음(검증 전용, 코드/문서 변경 없음)

---

**Total deviations:** 4 auto-fixed (3 Rule 1 문서/테스트 버그, 1 Rule 1 검증 기준 불일치)
**Impact on plan:** 전부 이 플랜 자신의 검증 명령을 스스로 충족시키기 위한 수정이거나(①·③), 놓친 규칙 반영을 테스트가 잡아 즉시 고친 것(②)이다. 범위 확장 없음 — 04-28·04-29·04-46 몫(견적 표 코드·C-27/폰 창·`Button`/`ui/confirm-dialog`)은 손대지 않았다.

## Issues Encountered

None beyond the deviations above — all four were caught and fixed within the same TDD/verification loop before commit.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None introduced by this plan. 상단 바 검색 `Ctrl+K`는 표기만 바뀌었고 렌더 여부·동작은 기존부터 죽은 표시였다(F-03 퀵 태스크 몫 — DECISIONS ② 본문에 명시, 새로 만든 스텁이 아니다).

## Threat Flags

None. `T-04-48`·`T-04-130`(등록 폼 제출 경로·이중 제출)과 `T-04-SC`(패키지 무결성)는 계획된 완화 그대로 구현됐고 새 표면을 추가하지 않았다.

## Next Phase Readiness

- `lib/shortcut.ts`의 `isCtrlCombo`가 04-28(견적 표 키보드)에서 바로 재사용 가능하다
- SYSTEM.md 규칙 13건 + §7-16이 확정되어 04-06·04-11·04-16·04-21·04-24·04-30·04-42 등 뒤 플랜이 참조할 수 있다
- 04-46(교차 그룹 계약 1·2 — `Button` `reasonTone`/`aria-disabled`, `ui/confirm-dialog`, §7-17)이 이 플랜 바로 다음이며, `isFormPristine`/입력 버리기 확인을 이어받는다
- 04-29 Task 3이 §7-16에 C-27 한 쪽 틈 번호·폰 6쪽 창 문장을 DECISIONS 기록과 함께 더해야 한다(DR-33, 이 플랜은 의도적으로 비워 뒀다)
- Blocker/concern: 없음 — 이 플랜은 04-04(견적 표)의 사람 확인을 기다리지 않고 완료됐다(D21)

---
*Phase: 04-project-quote-ledger*
*Completed: 2026-09-24*

## Self-Check: PASSED

- All 10 key files verified present with `[ -f ]` (lib/shortcut.ts, test/unit/lib/shortcut.test.ts, project-form.tsx, TopBar.tsx, DECISIONS.md, SYSTEM.md, NextTurn.tsx, next-turn.test.ts, design-system-docs.test.ts, project-register.spec.ts)
- All 9 task commit hashes verified present via `git log --oneline --all`
- All task-level `<acceptance_criteria>` re-verified (Task 1: 4 automated `<verify>` commands green; Task 2: `pnpm vitest run design-system-docs.test.ts + next-turn.test.ts` 69/12 green, `git diff --stat b0fc281 -- tokens.css` empty, `pnpm lint && pnpm typecheck` green, `CI=true pnpm playwright test project-register.spec.ts` 7/7 green — full `CI=true pnpm test` three-layer gate deferred to orchestrator per dispatch `<verification_scope>`)
- Plan-level `<verification>` re-run: `pnpm lint` ✓ · `pnpm typecheck` ✓ · `pnpm lint:sql` ✓ · `pnpm build` ✓ · `pnpm vitest run --project unit` 787/787 ✓ · `project-register.spec.ts` 7/7 (CI=true production build) ✓ · tokens.css/package.json/pnpm-lock.yaml diff 0 vs b0fc281 (documented baseline substitution) ✓ · DECISIONS commits precede SYSTEM.md commits ✓ · no `.planning/` files in this plan's diff ✓
