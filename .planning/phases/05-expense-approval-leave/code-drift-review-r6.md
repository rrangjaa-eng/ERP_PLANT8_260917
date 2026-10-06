# Phase 5 계획 ↔ main(fb277b08) 어긋남 조사 — Round 6

- **기준 커밋**: origin/main **fb277b08**(#158 04.6 스킨 A 머지). 계획 브랜치 `claude/phase-05-execute-pxok9w` HEAD **563d4550**은 fb277b08을 머지 커밋 d3941068로 포함한다(`git merge-base --is-ancestor fb277b08 HEAD` = 0).
- **범위**: `git log b41944d..fb277b08` 11커밋 — #152(04.5 화면 항목 관리) · #159(DEF-1 보관함 · SYSTEM 폼 간격 24) · #157(시각 회귀 기준 사진 워크플로) · #160(design-gate CHECKLIST) · #161(Safari 캡처) · #158(04.6 스킨 A, 04.6 SUMMARY 32/33).
- **조사 대상**: HEAD의 `.planning/phases/05-expense-approval-leave/` 05-01~05-15-PLAN · 05-RESEARCH · 05-VALIDATION · 05-REVIEWS · `.continue-here.md`. UI-SPEC은 이번 라운드에 이미 고쳐졌다(33fefee8). 디자인 검토 지적 R6-01~R6-11(`design-review-r6-opus.md`)은 되풀이하지 않고 id로만 가리킨다.
- **방법**: 읽기만 했다(`git show <ref>:<path>` · `git diff` · `git grep` · 게이트 명령 실행). 체크아웃은 바꾸지 않았다. 이 보고서 말고는 아무 파일도 쓰지 않았다. 형식은 `code-drift-review-r5.md`를 따른다.
- **표시**: 표시가 없는 줄은 적힌 ref(대부분 fb277b08 · HEAD 563d4550)에서 직접 확인했다. **[추정]**은 아직 쓰이지 않은 Phase 5 코드가 어떤 모양일지 예측한 것이다.

## 요약

| 등급 | 수 | 한 줄 |
|---|---|---|
| **P1 막는 문제** | **2** | 05-01 E6 전제가 04.6 뒤 달라짐(`stepResult` 없어짐, 결과가 `status: StatusWord`로 바뀜) — 웨이브 1에서 `본인 승인`을 쓰면 typecheck가 깨짐 · Phase 5가 바꾸는 화면을 기존 테스트와 시각 기준 사진이 고정하고 있는데, 어느 플랜에도 그 테스트를 고치는 일이 없음 |
| P2 권장 | 3 | 05-11 머리 줄 버튼은 `quote-table.tsx`에 그려짐(플랜 files에 없음) · 결재함 열 이름 · 뼈대가 `list-columns.ts`로 옮겨짐(`measureHeader` 반영 자리) · 04.6 `screen-routes.ts`에 새 화면 행이 없음 |
| P3 사소 | 5 | MAST-05 비고 미반영(이제 할 수 있음) · `.continue-here.md` · P-4 설명 낡음 · RESEARCH 버킷 이름 낡음 · 04.6 완료 기록(VERIFICATION · STATE) 없음 · 재사용할 새 헬퍼(`expectSheetDocumentLink` · 시트 `href`) |

**중복 구현은 없다.** 플랜 files_modified 267줄 가운데 b41944d에 없다가 fb277b08에 생긴 파일은 0개다(기계 대조). 04.6이 만든 `ui/status-tag/status-map.ts` · `ui/list-screen` · `ui/detail-screen` · `ui/num` · `ui/row-actions` · `ui/table/TableSkeleton` · `lib/actions/form-reason.ts`는 플랜이 「쓰는」 쪽이고, 새로 만드는 쪽이 아니다.

**결재 엔진 · 도메인은 그대로다.** b41944d → fb277b08 사이에 `domain/approvals/` · `repositories/approvals.ts` · `domain/leave/` · `domain/quotes/` · `domain/settings/` · `lib/gcp/` · `lib/storage/` · `lib/env.ts` · `infra/` · `scripts/{deploy,bootstrap-gcp,verify-gcp}.sh` · `.github/workflows/verify.yml` · `docs/OPERATIONS.md` · `docs/ARCHITECTURE.md` · `test/unit/docs-limits.test.ts` · `CLAUDE.md` · `.planning/config.json`의 diff는 0이다(`git diff --stat`). 그래서 E1~E4와 Round 5의 인프라 · 문서 사실(F5~F7)은 지금도 맞다. 바뀐 것은 화면(`app/` · `ui/`)과 테스트 고정 장치다.

---

## 05-01 착수 게이트 — 지금 상태 (HEAD 563d4550, origin/main = fb277b08, 실행해서 확인)

| 게이트 | 결과 | 근거 |
|---|---|---|
| P-1 04.1 결재 모듈 파일 | 통과 | MISSING 0 |
| P-2 04.1 SUMMARY | 통과 | 7 |
| P-3 Phase 4 PLAN = SUMMARY | 통과 | 44 = 44 |
| P-4 브랜치가 main 포함 | **통과**(Round 5 때는 실패) | d3941068 머지 커밋. 단 05-01-PLAN.md:156의 설명 「지금은 종료 코드 1」은 낡았다(P3 N8) |
| P-5 VALIDATION validated | **실패** | `05-VALIDATION.md:6` `status: draft` — 실행 전 `/gsd-validate-phase 5` |
| P-6 04.5 머지 | 통과 | PLAN 9 = SUMMARY 9 · `db/migrations/0023_custom_field_admin.sql` |
| P-7 04.6 머지 | **통과** | PLAN 33 · superseded 1(04.6-32) · SUMMARY 32. `ui/list-screen/ListScreen.tsx` · `ui/detail-screen/DetailScreen.tsx` · `ui/status-tag/status-map.ts`가 계획한 이름 그대로 있다(대응 이름 바꿈 불필요). 완료 기록은 P3 N10 참고 |
| P-8 「04.6 의존」 표시 0 | **실패** | 아래 표 — 11개 파일 · 23줄 |

**P-8 정확 표시**(`04\.6 의존 — 04\.6 머지 판 기준으로 다시 씀`, P-8 grep과 같은 정규식) 파일별 줄 수: 05-01 **1**(:400) · 05-02 **1**(:69) · 05-05 **2**(:179 · :237) · 05-06 **2**(:151 · :197) · 05-07 **2**(:144 · :190) · 05-08 **3**(:156 · :199 · :237) · 05-09 **3**(:170 · :211 · :262) · 05-10 **3**(:155 · :196 · :238) · 05-11 **2**(:176 · :258) · 05-13 **2**(:170 · :208) · 05-15 **2**(:117 · :158) = **23**. 05-03 · 05-04 · 05-12 · 05-14 · UI-SPEC · RESEARCH · VALIDATION은 0이다. 05-03:385 · 05-04:406 · :415는 Ledger 문장이라 P-8 정규식에 걸리지 않는다. 표시 지우기는 `/gsd-plan-phase 5 --reviews` Round 6 몫이다(R6-02와 이 보고서의 반영 뒤).

---

## Round 5 지적 상태

| # | 등급(R5) | 지금 | 근거(ref:줄) |
|---|---|---|---|
| F1 게이트에 04.5 · 04.6 없음 | P1 | **해소**(계획 반영 82d02cc4). 게이트 결과는 위 표 — P-5 · P-8만 실패 | 05-01-PLAN.md:48 · :158-160 · :224 |
| F2 04.6 스킨 A가 화면 전제를 뒤집음 | P1 | **바뀜**: UI-SPEC은 해소됐다(33fefee8, 표시 0). 플랜 문장은 R6-02로 넘어갔다(표시 23줄 남음) | 위 P-8 표 · design-review-r6-opus.md:71 · :82-95 |
| F3 04.6이 Phase 5 파일 18개를 먼저 고침 | P1 | **바뀜** — 실제 겹침이 확정됐다(아래 표). ⓪-a 다시 적기 결과: **E5 같음 · E7 같음(모양만 바뀜) · E6 다름 → 새 P1 N1**. `decision-dialogs.tsx` · `leave/[id]/document-actions.tsx` · `conflict-line.tsx`의 TSX는 바뀌지 않았다(CSS만) | `git diff --numstat b41944d fb277b08` |
| F4 `RowSheet.action` 타입 충돌 | P1 | **계획 반영**(기존 `action?: ReactNode`를 씀). `RowSheet.tsx:24` 그대로다. **U2(1차 vs 3차)는 아직 열림** — R6에서 추천이 3차로 바뀌었다(design-review-r6.md 「UNRESOLVED」) | fb277b08 `ui/table/RowSheet.tsx:24` |
| F5 문서 300줄 한도 | P1 | **해소** — OPERATIONS 300 · ARCHITECTURE 295 · docs-limits 그대로다. 계획은 `docs/EXPENSES.md` · `docs/EVIDENCE-STORAGE.md`로 뗐다. ARCHITECTURE는 05-13 §4-9 한 줄(+1 → 296)만 늘고, OPERATIONS는 「줄 수 불변」 조각만 붙는다 | 05-12-PLAN.md:195 · :281 · 05-13-PLAN.md:175 · 05-03-PLAN.md:247 |
| F6 GCS 어댑터 · 포트 선례 | P2 | 해소 — `lib/gcp/gcs.ts` · `lib/storage/` 변경 0 | — |
| F7 버킷 이름 · 바인딩 · verify | P2 | 해소(스크립트 · verify.yml 변경 0). RESEARCH에 옛 이름이 남았다(P3 N9) | 05-RESEARCH.md:368 |
| F8 세션 · 테스트 단계 | P2 | 해소 — 「여러 세션」 · 50% 문장 0건. 전체 단위 · 통합은 CI 몫으로 적혔다 | 05-05:288 등 |
| F9 `risk:` · 위험 경로 PR 분리 | P2 | 해소 — `risk:` 9개 플랜(05-01 · 03 · 04 · 06 · 08 · 09 · 11 · 13 · 14) | frontmatter |
| F10 OPS-08 | P2 | 해소 — 05-03 · 05-09 · 05-10 · 05-11 | grep |
| F11 지급 방식 코드표 | P2 | ① 해소(`CODE_TABLES`는 아직 셋 — `domain/code-tables/index.ts:34-38`이고 화면은 `TABLE_OPTIONS = CODE_TABLES` 그대로 — `code-tables/page.tsx:29`). ② MAST-05 비고는 아직 없다(P3 N7) | REQUIREMENTS.md:23 · :202 |
| F12 칸 이름 구분자 「, 」 · form-reason | P2 | 해소 — `lib/actions/form-reason.ts`가 main에 들어왔다(#152) | 05-06:191 · 05-07:140 |
| F13 누수 스캔 구조 · 폼 선택지 DTO | P2 | 해소 — main `test/integration/leak-scan.test.ts:66`(`skipDbReset()`) · `:276`(`MENU_GATED_DTOS`) | — |
| F14 `asOf` | P3 | 해소(설정 코드 변경 0) | — |
| F15 05-06 read_first | P3 | 해소 | — |
| F16 `ConfirmDialog` 새로 고침 꼬리 | P3 | 해소 — `ConfirmDialog.tsx` 변경 0(CSS만) · `splitRefreshTail` `:70` · `failure` `:33` | — |
| F17 `Button.nextStep` | P3 | 해소 — `Button.tsx:34`. 04.6은 1차 버튼에 `data-ui="primary-button"` 훅만 더했다(원칙 점검이 셈) | — |
| F18 `QuoteLineDto.vendorName` · quote-table | P3 | 계획 반영. 그런데 `quote-table.tsx`가 04.6-12에서 `DetailScreen` 전체를 그리게 됐다(+55/-51) → 새 P2 N3 | `quote-table.tsx:2311-2325` |
| F19 줄 번호 | P3 | 다시 바뀜 — 예: SYSTEM §7-7 EMPTY 줄은 이제 `SYSTEM.md:957`. 절 이름 grep 원칙은 그대로 유지한다 | — |
| F20 `.continue-here.md` 낡음 | P3 | **열림**(더 낡음) → P3 N8 | — |
| F21 시드 루프 · 민감 메뉴 | P3 | 해소. 같은 예외 선례가 하나 더 생겼다 — `domain/seed/index.ts`가 `admin.field-definitions`를 루프에서 `continue`로 빼고 `insertPermissionIfAbsent`로 준다(#152). `expenses.evidence_void`를 같은 꼴로 바꿀지는 계획 결정(지금 = 루프가 켬)이다 | fb277b08 `domain/seed/index.ts` 루프 첫 줄 · `test/integration/seed-permissions.test.ts:28-42` |

### F3 겹침 — 실제로 바뀐 것(b41944d → fb277b08)

| 파일 | Phase 5 | 04.6 / 04.5 변경 | 계획에 영향 |
|---|---|---|---|
| `app/(app)/leave/status-display.ts` | 05-01 T3 | +38/-10(`leaveStatusWord` · 결과 `status: StatusWord`) | **N1** |
| `app/(app)/approvals/page.tsx` | 05-01 T4 · 05-10 | +26/-7(`ListScreen` · `processedStatusWord` · 시트 `href`) | N1(E5 같음) · N2 |
| `app/(app)/approvals/inbox-table.tsx` | 05-01 T4 · 05-10 | +21/-23(`status: StatusWord` · 열 이름 `INBOX_COLUMN_LABELS`) | **N4** |
| `app/(app)/approvals/approval-sheet.tsx` | 05-01 T4 · 05-10 | +79/-132(`SidePanel` 제어 형태) | E7 같음 |
| `app/(app)/approvals/list-columns.ts` · `loading.tsx` | 없음 | 새 파일 · 뼈대 | **N4** |
| `app/(app)/leave/[id]/page.tsx` | 05-01 T4 | +9/-11(`DetailScreen`, `withdrawSubtitle` 자리 그대로 — :130) | 없음 |
| `app/(app)/projects/[id]/page.tsx` · `quote-table.tsx` | 05-05 · 05-08 · 05-11 · 05-15 | +17/-17 · +55/-51(`frame` · `DetailScreen`이 quote-table 안으로) | **N3** |
| `app/(app)/expenses/page.tsx` | 05-08 | +3/-4(`ListScreen` + `ListEmpty` 「법인카드 보기」) | **N2** |
| `app/(app)/page.tsx` · `ui/next-turn/NextTurn.tsx` | 05-10 | +3/-4 · +5/-15(`StatusTag status` · `Num`) | R6-02 |
| `app/(app)/admin/settings/settings-form-client.tsx` | 05-04 | +3/-3 | 없음(read_first 있음) |
| `test/e2e/settings-approval-route.spec.ts` | 05-03 | +4/-4(토큰 이름만) | 없음 |
| `test/e2e/project-lifecycle.spec.ts` | 05-11 | +84/-7 | read_first 있음 |
| `playwright.config.ts` | 05-05 | +19/-1(`visual` 프로젝트 · desktop 의존) | **N2** |
| `domain/permissions/menus.ts` · `test/integration/seed-permissions.test.ts` | 05-08 · 05-09 | +2(04.5 `admin.field-definitions`) · +16 | 덧붙이기라 충돌 없음 |
| `domain/code-tables/index.ts` · `domain/seed/index.ts` | 05-03 | +5(`isFixedProjectStatusLabel`) · +14 | 덧붙이기라 충돌 없음 |
| `test/integration/leak-scan.test.ts` | 05-03 · 04 · 05 · 11 | +163(04.5) | F13 반영됨 |
| `docs/design/SYSTEM.md` · `DECISIONS.md` | 05-02 | +332/-227 · +327 | R6-02 ⑥ · N2(b) |
| `TODOS.md` | 05-13 | +34/-55 | read_first 있음 |
| `test/unit/deploy/workflows.test.ts` | 05-12 | +123(visual-baseline describe) | 덧붙이기라 충돌 없음 |

---

## P1 — 막는 문제

### [P1] N1 — 05-01 E6 전제가 달라졌다: `stepResult`가 없어졌고, 단계 결과가 `status: StatusWord`가 됐다. 웨이브 1에서 `본인 승인`을 쓰면 typecheck가 깨진다
- **어긋남**:
  - **계획**: 05-01은 「`routeListSteps` · `stepResult` 한 파일, `stepResult`가 `approved` ∧ `selfApproved`면 `{ kind: "success", label: "본인 승인" }`」이라고 쓴다(05-01-PLAN.md:256 E6 · :353 ③ · :346 behavior · :370 acceptance · :58 truth).
  - **main(04.6-18 뒤)**:
    - `stepResult`가 없다.
    - `routeListSteps`는 `stepStatusKey(step)` → `LeaveStatusKey`로 키를 얻는다(`status-display.ts:119`).
    - 결과는 `result: { text: leaveStatusDisplay(key).label, status: leaveStatusWord(key) }`다(`:154`).
    - 타입은 `RouteListStep.result: { text: string; status: StatusWord }`다(`:99`).
    - `ui/approval-route/ApprovalRoute.tsx:18`도 같은 모양이고 `<StatusTag status=…>`로 그린다.
  - **결과**: `StatusWord`는 `keyof typeof STATUS_KIND | \`${string} 결재 중\``이다(`status-map.ts:59`). `본인 승인`은 표에 없으므로 E6을 구현하면 **타입 오류**가 난다.
  - **순서 문제**: R6-01은 낱말 넷의 `status-map.ts` 추가를 **05-05 Task 1(웨이브 5)**에 붙인다. 그런데 `본인 승인`을 처음 쓰는 플랜은 **05-01 Task 3(웨이브 1)**이다. 게다가 frontend 규칙(DECISIONS → SYSTEM → 토큰/표)상 먼저 와야 하는 05-02 B2는 **같은 웨이브 1에서 병렬**이다(`depends_on: []` 둘 다 — 05-01:6 · 05-02:6).
  - **⓪-b 판정**: E6 기대 문장(「`stepResult`」 · 「`{kind, label}`」)이 「다름」이다. 그래서 ⓪-b가 「`04.1 전제 불일치 E6`」로 멈춘다.
- **⓪-a 다시 적기 결과(이 라운드가 대신 끝냄 — 05-01:254 「화면 재대조 라운드가 미리 끝냈으면 생략」)**:
  - **E5 = 같음.**
    - 결재함 `page.tsx:88`은 `(item.summary ?? {}) as LeaveSummary`로 여전히 캐스트한다.
    - 연차 기간 서식 import가 남아 있다(`formatLeavePeriod` — `leave/labels`).
    - 처리함 상태 낱말은 새 지역 함수 `processedStatusWord`(`page.tsx:69`)가 정한다. 이 함수는 인스턴스 상태만 봐서 종류 중립이다(지울 필요 없음).
  - **E7 = 같음(모양만 바뀜).**
    - 시트는 여전히 `app/(app)/approvals/approval-sheet.tsx` 한 파일이다.
    - 승인 서버 액션 연결도 여전히 한 곳이다(`approval-sheet.tsx:10` import · `:69` `useAction(approveAction…)`).
    - 시트는 이제 `SidePanel` 제어 형태(`onClose`) 안의 내용이다(`:9` · `:51-56`). PC도 같은 패널(오른쪽 480)이다. 시트 항목에 `href`(문서 링크)가 더해졌다(`:35`).
    - 콜백 prop `onApprove`로 바꾸는 계획(②)은 그대로 성립한다.
  - **E6 = 다름**(위 내용).
  - **name_map 바꿀 줄**:
    - 「결재 상태 → 낱말 매핑」 = `leaveStatusWord`(StatusWord) + `leaveStatusDisplay`(글자)
    - 「결재함 열 이름」 = `app/(app)/approvals/list-columns.ts`
    - 「결재 시트」 = `approval-sheet.tsx`(SidePanel 내용)
- **계획 위치**: 05-01-PLAN.md:6(depends_on) · :58 · :94 · :256(E6) · :328 · :346 · :353 · :370 · files_modified(`status-map.ts` 없음)
- **근거**: fb277b08 `app/(app)/leave/status-display.ts:49` · :95-99 · :119 · :145-154 · `ui/approval-route/ApprovalRoute.tsx:18` · `ui/status-tag/status-map.ts:5-59` · b41944d 같은 파일 :71 · :91(`stepResult` — 옛 모양)
- **고칠 모양**:
  - ⓪-b E6 기대 문장을 바꾼다: 「단계 결과 = `stepStatusKey` → `LeaveStatusKey` → `{ text: leaveStatusDisplay(key).label, status: leaveStatusWord(key) }`, `RouteStepSource`에 `selfApproved` 없음」.
  - Task 3 ③을 바꾼다: `LeaveStatusKey`에 결재선 전용 키 하나(예: `self_approved`)를 더한다. `stepStatusKey`의 `approved` 갈래에서 `selfApproved`면 그 키로 보낸다. `leaveStatusDisplay`(글자 `본인 승인`, `kind: "success"`)와 `leaveStatusWord`(`"본인 승인"`) 두 switch에 같은 갈래를 더한다(`never` 망라 검사가 빠짐을 잡는다).
  - behavior(:346)와 acceptance(:370)를 바꾼다: `result.status === "본인 승인"` · `statusKind("본인 승인") === "success"`.
  - 05-01 Task 3 files에 `ui/status-tag/status-map.ts` · `test/unit/ui/status-map.test.ts`(`CURRENT_CALL_SITES.success`에 `본인 승인`)를 **이 낱말 하나만** 더한다. 나머지 셋(`작성 중` · `지출결의 중` · `무효`)은 R6-01대로 05-05가 한다. R6-01의 「처음 쓰는 플랜」 원칙을 그대로 적용한 결과다.
  - 순서: 05-01 `depends_on`에 `05-02`를 둔다(05-01 → 웨이브 2, 뒤 웨이브가 하나씩 밀린다). 또는 05-01 Task 3 앞에 「05-02 Task 1(B2 DECISIONS → SYSTEM §7-5) 커밋이 브랜치에 있음」 확인 한 줄을 둔다. 웨이브를 덜 바꾸는 쪽은 후자다.
- **사용자 결정 필요**: 아니오(이미 정한 낱말 · 색을 어느 플랜이 먼저 넣는지의 순서 문제다).

### [P1] N2 — Phase 5가 바꾸는 화면을 기존 테스트 · 시각 기준 사진이 고정하고 있다. 어느 플랜도 그것을 고치지 않는다(CI가 ready에서 빨개짐)
- **어긋남**:
  - **(a) 시각 회귀(04.6-13 · #157)**:
    - CI에서 `desktop` 프로젝트는 `visual`에 의존한다(`playwright.config.ts:95` — `CI && !E2E_SKIP_DESKTOP`이면 `["visual"]`). `visual`은 `toHaveScreenshot`으로 기준 사진과 비교한다(`test/e2e/visual.spec.ts`).
    - 기준 사진은 수동 `visual-baseline.yml`(workflow_dispatch, main이 아닌 브랜치에서만)으로만 만든다(`.github/workflows/visual-baseline.yml:9` · :18).
    - Phase 5 플랜에는 `visual` · 기준 사진 언급이 **0건**이다(grep).
    - 확실히 바뀌는 사진:
      - **`dev-components`(1280 · 390)** — 갤러리가 `Object.keys(STATUS_KIND)`로 배지를 그린다(`app/(app)/dev/components/page.tsx:37` · :96). N1 · R6-01이 낱말 넷을 더하면 사진이 바뀐다.
      - **`approvals`(1280 · 390)** — 시스템 관리자로 찍는다(`visual-fixtures.ts:123`). 05-10 ②가 EMPTY 행동을 `can(viewer,"expenses","view")`일 때 `지출결의 목록 보기`로 바꾼다(05-10-PLAN.md:198). 시스템 관리자는 시드 루프로 `expenses` 보기를 받는다(`domain/seed/index.ts` 루프). 그래서 이 사진도 바뀐다.
    - [추정] `home`(05-10 내 차례) · `project-detail`(05-05 · 05-15 행동 열)도 바뀔 수 있다.
  - **(b) `test/unit/ui/system-md-compliance.test.ts:48-60`**(04.1부터 있음)은 두 가지를 고정한다.
    - SYSTEM에 `결재할 건이 없습니다 · 연차 목록 보기` 문장이 있어야 한다.
    - `approvals/page.tsx`에 `href: "/leave"`가 있어야 한다.
    - 그래서 05-10 ②가 이 단위 테스트를 깨뜨린다. 또 그 SYSTEM 예시(`SYSTEM.md:957` §7-7 EMPTY — 「지출결의 목록이 생기기 전까지」)를 고치는 B 항목이 05-02에 없다. 어느 플랜에도 이 테스트 파일이 없다(grep 0).
  - **(c) 04.6-19가 `/expenses` 자리 화면을 E2E로 고정했다.**
    - `test/e2e/page-chrome.spec.ts:232-247`(기획 PM — `/expenses` 빈 화면 + 링크 `법인카드 보기` 하나)
    - `test/e2e/mobile-design-review-p2.spec.ts:20`(`/expenses`의 「없습니다」 줄 링크가 2차 모양 · 44)
    - 05-08이 이 화면을 원장으로 바꾸면 두 스펙이 깨진다. 05-08 files_modified에 둘 다 없다(05-08-PLAN.md files).
  - 셋 모두 플랜의 「건드린 화면 E2E만」 검증 범위 밖이라 실행 중에는 안 보이고, ready 뒤 CI 전체에서 터진다.
- **근거**: 위 파일:줄 · fb277b08 `test/e2e/visual-fixtures.ts:104-127`(찍는 화면 9개) · `test/e2e/dev-components.spec.ts:93-97`(배지 수 = `STATUS_KIND` 낱말 × 2 — 이 스펙은 스스로 맞춰져 깨지지 않음)
- **고칠 모양**:
  - **05-13 Task 2**에 단계 하나를 둔다. 순서: 「싼 게이트 · DOM 감사 통과 뒤, ready 전에 그 브랜치에서 `visual-baseline.yml`을 수동 실행 → 커밋된 기준 사진 diff를 SUMMARY에 화면 이름으로 적음(바뀌리라 예상한 화면만 바뀌었는지 — 판정은 DOM 실측, 사진 육안 판정 아님)」. `.github/workflows/`는 고치지 않으니 위험 경로가 아니다.
  - **05-10** files_modified에 `test/unit/ui/system-md-compliance.test.ts`를 더한다(기대 `href: "/expenses"` · SYSTEM 예시 문장). SYSTEM §7-7 예시 개정은 05-02에 B 한 항목으로 더한다(DECISIONS → SYSTEM 순서). 또는 05-10이 그 DECISIONS 한 줄을 맡는다.
  - **05-08** files_modified에 `test/e2e/page-chrome.spec.ts`(자리 화면 넷 → 셋, `/expenses`는 원장 단언으로) · `test/e2e/mobile-design-review-p2.spec.ts`(빈 원장의 첫 행동 링크로 — R6-02 ③의 `ListScreen` DR5 A 모양을 따름)를 더한다.
- **사용자 결정 필요**: 아니오.

---

## P2 — 권장

### [P2] N3 — 05-11 「정산 결재 올리기」 머리 줄 버튼은 `quote-table.tsx`가 그린다. 05-11 files에는 그 파일이 없다
- **어긋남**:
  - **main 모양**: 프로젝트 상세의 머리 줄(`DetailScreen` `actions.secondary` = 상태 바꾸기 · 복사)은 `quote-table.tsx` 안에서 그린다(`quote-table.tsx:2271` `copyActions` · :2281 `statusActions` · :2311-2325 `<DetailScreen … actions={{ secondary, primary }}>`). `page.tsx`는 `frame`(제목 · 메타)과 `statusChange` 같은 props만 넘긴다(`page.tsx:225` · :235-237).
  - **계획**:
    - 05-11 truth는 「프로젝트 상세 머리 줄 2차 `정산 결재 올리기`」와 「같은 자리 3차 `정산 결재 중`…」을 쓴다(05-11-PLAN.md:48 · :62).
    - read_first는 `page.tsx`의 「머리 줄 버튼군」을 가리킨다(:156).
    - files_modified는 `app/(app)/projects/[id]/page.tsx`만 둔다(:20). `quote-table` 언급은 0건이다.
  - b41944d에서도 머리 줄 버튼은 quote-table에 있었다. 그러니 Round 4 · 5가 못 본 틈이다. 04.6-12가 `DetailScreen`을 quote-table 안으로 옮겨서 더 분명해졌다.
- **근거**: fb277b08 `app/(app)/projects/[id]/quote-table.tsx:2271-2325` · `page.tsx:225-237` · b41944d 같은 파일 `styles.headerActions` 블록
- **고칠 모양**:
  - 05-11 Task 1 files · files_modified에 `app/(app)/projects/[id]/quote-table.tsx`를 더한다. `page.tsx`가 정산 결재 버튼 상태(없음 · 올리기 · 문서 링크 + 글자)를 props로 넘기고, quote-table이 `actions.secondary` 배열에 넣는다.
  - read_first를 「`quote-table.tsx`의 `statusActions` · `<DetailScreen` (`grep -n`)」으로 바꾼다.
  - quote-table은 05-05 · 05-08 · 05-15도 고친다. 05-13 「병합 충돌 규칙」 목록(05-13-PLAN.md:112)에 이 파일을 더한다.

### [P2] N4 — 결재함 열 이름 · 뼈대가 `list-columns.ts`로 옮겨졌다. `measureHeader`(05-01 T4 ⓐ · 05-10)가 반영될 자리가 그 파일인데 files에 없다
- **어긋남**:
  - **main 모양**:
    - 열 머리글은 상수 `INBOX_COLUMN_LABELS`(`days: "일수"`)다(`app/(app)/approvals/list-columns.ts:3-9`). `inbox-table.tsx:136`이 이 상수를 읽는다.
    - 로딩 뼈대도 `INBOX_SKELETON_COLUMNS`로 같은 낱말을 쓴다(`loading.tsx` — 「뼈대 머리글 = 진짜 열 이름」, 04.6 UI-SPEC loading D10 · SC 10).
  - **계획**:
    - 05-01 Task 4 ⓐ는 숫자 열 머리글을 서버 `measureHeader`(연차만 `일수`, 섞이면 `금액 · 일수`, null이면 열을 뺌)로 그린다고 쓴다(05-01-PLAN.md:407 · acceptance `grep -c "measureHeader" inbox-table.tsx`).
    - 그런데 files(`:383`)에 `list-columns.ts` · `loading.tsx`가 없다.
  - **결과**: 뼈대는 늘 `일수`를 보이고, 실제 표는 `금액 · 일수`가 된다. 04.6 규칙(뼈대 = 진짜 열 이름)과 어긋난다.
- **근거**: fb277b08 `app/(app)/approvals/list-columns.ts:1-19` · `loading.tsx` · `inbox-table.tsx:136`
- **고칠 모양**:
  - 05-01 Task 4 files에 `list-columns.ts`(+ 필요하면 `loading.tsx`)를 더한다.
  - 뼈대의 숫자 열 머리글은 데이터 전에는 알 수 없다. 그래서 UI-SPEC loading 행에 한 줄로 정한다. 계획 판단 후보: Phase 5 결재함의 기본 합성 머리글 `금액 · 일수` 고정, 또는 뼈대에서 숫자 열 생략.
  - 이것은 R6-02와 같은 플랜 개정 라운드에서 처리한다(사용자 결정 아님 — 이미 정한 「진짜 열 이름」 규칙을 어떻게 적용할지의 문제다).

### [P2] N5 — 04.6 화면 점검 표(`screen-routes.ts`)에 Phase 5 새 화면 행이 없다
- **어긋남**:
  - 04.6-29가 원칙 점검(`design-principles.spec.ts`) · 대비(`a11y.spec.ts`) · 글자 위계(`type-hierarchy.spec.ts`)를 「UI-SPEC 화면 목록 전 화면」 표 하나로 돌리게 만들었다(`test/e2e/screen-routes.ts:12-16` · :38-).
  - 새 화면은 이 표에 행이 있어야 막는 모드 점검을 받는다. 늦게 머지되는 페이즈는 `mergeFile`로 조건부 행을 둔다(`:35` · cert · field-definitions 선례).
  - Phase 5 새 화면(`/expenses/{expenseId}` 폼 · 문서, `/expenses/new`, `/projects/{projectId}/settlement`)을 이 표에 더하는 플랜이 없다(`screen-routes` grep 0).
  - 행이 없어도 테스트는 깨지지 않는다(전수 대조 단언 없음 — 확인함). 대신 새 화면이 04.6 막는 모드 점검을 **조용히 건너뛴다**.
  - `/expenses`(원장)는 이미 행이 있다(`:41`).
- **근거**: fb277b08 `test/e2e/screen-routes.ts:12-16` · :22-35 · :38-60 · `test/e2e/design-principles.spec.ts:20-26`
- **고칠 모양**:
  - 05-13 Task 2(접근성 · 폭 E2E를 이미 맡음)에 「`screen-routes.ts`에 세 행(`as: "sysadmin"` 또는 기안자, 자리표시 `{expenseId}`) + `createScreenFixtures`에 지출결의 · 정산 결재 한 건씩」을 더한다.
  - 05-13이 만들 `expense-a11y.spec.ts`(05-13-PLAN.md:171)는 이 표와 겹치니, 표 행으로 대신할지 한 줄로 정한다.

---

## P3 — 사소

- **[P3] N7 — MAST-05 비고**: 05-03-PLAN.md:221은 「main 반영 뒤 REQUIREMENTS 추적표 MAST-05 비고를 `/gsd-quick`으로」라고 쓴다. 그 조건(브랜치가 main 포함)은 d3941068로 이미 충족됐다. fb277b08 `REQUIREMENTS.md:23` · :202에는 비고가 아직 없다. 실행 세션을 기다리지 않고 계획 레인에서 지금 할 수 있다(문서만 바뀜).
- **[P3] N8 — 낡은 상태 문장**:
  - `.continue-here.md` BLOCKING CONSTRAINTS ②는 「이 브랜치는 main을 반영하지 않는다」고 쓴다. 지금은 d3941068로 반영했다.
  - 같은 절 ④는 「main 0022, 04.5가 0023」이라고 쓴다. 지금 main 마지막은 `0023_custom_field_admin`이고, Phase 5 마이그레이션 넷(05-01 · 05-03 · 05-04 · 05-11)은 0024~0027이 된다(05-13이 재생성).
  - `remaining_work` 첫 줄(PR #156 머지)과 `next_action`(04.5 · 04.6 머지 확인)은 끝났다.
  - 05-01-PLAN.md:156 P-4 설명 「지금은 종료 코드 1」도 낡았다. 다음 `/gsd-pause-work`나 이번 `--reviews` 라운드에서 고친다(R5 F20 이어짐).
- **[P3] N9 — RESEARCH 버킷 이름**: `05-RESEARCH.md:368`은 `plant8-{env}-evidence`라고 쓴다. 플랜(05-12, R5 F7)은 `{프로젝트}-plant8-{env}-evidence`다. RESEARCH는 실행자 입력이 아니지만 05-12 read_first가 RESEARCH를 가리키면 헷갈린다. 한 줄 고친다.
- **[P3] N10 — 04.6 완료 기록**: P-7 명령은 통과한다. 그런데 main에 `04.6-VERIFICATION.md`가 없다(`.planning/phases/04.6-a/`에 reviews/ · W*-MERGE · SUMMARY만 있음). `STATE.md`는 「04.6 executing, plan 4」이고, ROADMAP 진행표(`ROADMAP.md:907-922`)에는 04.3 · 04.5 · 04.6 행이 없다. #158 제목도 「(실행 중)」이다. 게이트 · 리뷰(`reviews/04.6-PR158-review.md` · `-cso.md` · `04.6-final-qa.md`)는 있다. 05-01 P-7은 머지 사실만 보니 막히지 않는다. 다만 「04.6 완료」를 전제로 하는 문장(05-01:48 「04.6이 main에 머지됐으며」)은 머지 기준임을 알고 읽는다. STATE · ROADMAP 정리는 04.6 쪽 일이고 Phase 5 계획을 바꿀 필요는 없다.
- **[P3] N11 — 재사용할 새 헬퍼**:
  - 04.6이 결재 시트에 문서 링크를 더했고(`ApprovalSheetItem.href` — `approval-sheet.tsx:35`, `page.tsx` `toSheet`), E2E 헬퍼 `expectSheetDocumentLink(panel, leaveId)`를 만들었다(`test/e2e/leave-org.ts`). 05-05 `expense-submit-mobile-approval.spec.ts` · 05-10 `expense-inbox.spec.ts`가 시트 → 문서 이동을 단언할 때 이 헬퍼를 쓰도록 read_first에 한 줄 더한다.
  - 지출결의 종류 등록의 `href`가 시트 링크로 그대로 나온다. 그러니 종류 등록 `href`(05-03)가 `/expenses/{id}`인지가 시트 링크의 정답이다.

---

## 확인했고 그대로인 것

- **마이그레이션**: main 마지막은 `0023_custom_field_admin`(04.5)이다. 플랜은 번호를 미리 적지 않는다(05-01:158의 `0023_custom_field_admin`은 P-6 확인용 04.5 이름뿐 — grep). 다음 빈 번호는 0024다. `test/unit/custom-fields/field-definitions-migration.test.ts`는 0023 문장 순서만 보고 「마지막 번호」를 고정하지 않는다.
- **권한 · 메뉴 키**: main MENUS에 `expenses` · `approvals` · `leave` · `admin.field-definitions`(04.5)가 있다. `expenses.team` · `expenses.evidence_void`는 아직 없다(05-08 · 05-09가 만듦). 04.5 변경(노출표 커스텀 열 · `createRole` 커스텀 칸 부여 · `admin.field-definitions` insert-if-absent · 셸 관리 그룹 한 줄)은 `expenses.*`와 겹치지 않는다. 커스텀 칸 대상은 `vendor` 하나다(`domain/custom-fields/targets.ts:3`) — 지출결의는 대상이 아니다.
- **코드표**: `CODE_TABLES` = `project_status` · `evidence_type` · `quote_subcategory`(index.ts:34-38). `payment_method`는 05-03이 더한다(F11 반영 그대로). 04.6-10이 프로젝트 상태 다섯 값의 이름을 `PROJECT_STATUS_WORD`(`domain/projects/status-word.ts`)로 고정했고, `updateCodeItemLabel`이 그 다섯의 이름 변경을 거부한다. 지급 방식 표와는 무관하다. 05-11이 쓰는 「상태가 … 바뀜」 문구 라벨은 이제 코드표 라벨이 아니라 그 고정 낱말이다(`status.ts` `readStatusCatalog`). 문구 모양은 같다.
- **lint · 테스트 규칙(04.6 새 장치) — 디자인 쪽은 R6-02가 다룸**: `eslint/restrictions.mjs`(app/** `<table>` · `<dialog>` 금지) · `test/unit/ui/screen-frames.test.ts`(모든 `app/**/page.tsx`는 `ListScreen` · `DetailScreen` import, `PageHeader` import 금지, 이관 전 표시 0) · `stylelint.config.mjs`(app/** 글자 크기 `--text-body|aux|tag`만, 날 px · 색 금지) · `test/unit/eslint-restrictions.test.ts` · `scripts/design/mark-legacy.mjs --audit`(플랜이 인용한 옵션 그대로 있음 — :4) · `test/unit/design-system-docs.test.ts`(SYSTEM 옛 토큰 이름 0). 플랜의 해당 문장 수는 R6-02 표(design-review-r6-opus.md:86-95)가 셌다. 이 라운드가 더한 것은 N2(b)의 `system-md-compliance` 하나뿐이다. 05-02 verify는 `design-system-docs.test.ts`를 이미 돌린다(05-02-PLAN.md:109).
- **Playwright**: `webServer.env` 블록 · desktop testIgnore 구조는 그대로다. 05-05 ⑤의 `STORAGE_DRIVER` 한 줄은 `test/unit/e2e/playwright-config.test.ts`(프로젝트 · 의존 · visual 단언만)와 충돌하지 않는다.
- **배포 · 문서 · 인프라**: `lib/gcp/gcs.ts` · `lib/storage/signature-store.ts` · `infra/names.sh` · 배포 스크립트 셋 · `verify.yml`(choice `policies` · `notify-tick`) · `docs/OPERATIONS.md`(300) · `docs/ARCHITECTURE.md`(295) · `docs/CERT-PURGE.md`(76) · `docs-limits.test.ts`는 b41944d와 같다. 05-12 `workflows.test.ts` 덧붙이기는 04.6이 더한 `visual-baseline.yml` describe 뒤에 붙으므로 충돌하지 않는다.
- **E2E 헬퍼**: `test/e2e/fixtures.ts` · `leave-org.ts`는 덧붙이기만 했다(04.5 커스텀 칸 헬퍼 · `expectSheetDocumentLink`). 플랜이 쓰는 `createFixtureUser` 등은 그대로다.
- **연차 문서 화면**: `app/(app)/leave/[id]/page.tsx`는 `DetailScreen`으로 바뀌었다. 하지만 `decision=` 조립 · `withdrawSubtitle`(:124-130)은 그대로라 05-01 T4 ⓑ의 `kindLabel` 자리가 같다.
- **CLAUDE.md · 훅 · config**: b41944d → fb277b08 사이 변경이 0이다(`.claude/`는 design-gate CHECKLIST §1 사용자 결정 줄과 gates 로그만 — 디자인 쪽, R6 범위).

## 사용자 결정 필요

- **이 라운드의 새 지적(N1~N11)은 모두 사실 정정 · 파일 목록 · 순서 문제라 사용자 결정이 필요 없다.**
- 남은 결정은 앞 라운드 것 하나뿐이다. **U2**(폰 행 시트 문서 행동 1차 vs 3차)는 R5에서 열렸고, R6 디자인 검토가 추천을 「3차 유지」로 바꿔 `design-review-r6.md` 「UNRESOLVED DECISIONS」에 올렸다. 같은 목록에 R6-06 · R6-08도 있다. 여기서 되풀이하지 않는다.
- N4의 뼈대 숫자 열 머리글은 계획자가 UI-SPEC loading 행에서 정할 수 있는 적용 문제다. 플랜 개정 때 판단이 갈리면 그때 카드로 묻는다.
