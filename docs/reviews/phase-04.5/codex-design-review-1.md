Reading additional input from stdin...
OpenAI Codex v0.155.1
--------
workdir: /home/user/ERP_PLANT8_260917
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 01a0d482-5ef0-7aa3-85e9-04a69cce0f1d
--------
user
You are an adversarial senior product designer reviewing the Phase 04.5 「화면 항목 관리」 PLAN (not code) of a Korean internal ERP (APP UI, dense admin screens). Inputs in repo: .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md (approved design contract), 04.5-01..09-PLAN.md, docs/design/SYSTEM.md (design system; tokens only from docs/design/tokens.css), CLAUDE.md §7 「화면 사용성 원칙」 (minimal guide text — only errors/irreversible/locked states, one line saying what to do; minimal decisions — defaults prefilled, system-computable things not asked, impossible choices hidden/disabled, undo instead of confirm dialogs; one primary button per screen, keyboard flow, status via color/badge, dangerous actions separated).

Tasks:
1. For EACH open design item give a recommended resolution + one-line reason, citing plan file:line:
 - OPEN 1-A (08 L37/L110/L200, 02 L207): form-level server error shows 「추가할 수 없음 — {원인} · 다시 시도」; when cause is 「권한 없음」 (permission revoked mid-submit) the 「다시 시도」 can never succeed.
 - OPEN 1-B (06), OPEN 2-A and 2-B (02), OPEN 5-A and 5-B (05 ~L120-125): find their definitions in the plans.
 - UI-SPEC deviations 편차-04a, 편차-04b (04 L113, L267), 편차-06a (06): test substitutions because @testing-library/react is not approved (source inspection + E2E instead of render tests). Is coverage acceptable from a design-contract point of view?
2. Check the plans against §7: any leftover guide text, unnecessary user decisions, missing defaults, confirm dialogs instead of undo, more than one primary button, missing empty-state first action, keyboard flow gaps. Also check state coverage (loading/empty/error/success/partial/locked) for each screen in UI-SPEC.
Evidence rule: BLOCKER/MAJOR must cite plan or UI-SPEC file:line; otherwise [NOTE]. Do not re-open decisions the UI-SPEC marks as user-confirmed (e.g. DeleteToArchive exception).
Output (Korean, concise): per-OPEN table (항목 | 추천 | 이유 | 근거), then findings `[BLOCKER|MAJOR|MINOR|NOTE] title — evidence — fix`, then a line `Recommendation: <action> because <reason>`, and end with exactly one line: `판정: 막는 문제 없음` or `판정: 막는 문제 있음 (N건)`. Do not modify files.
warning: Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.
codex
각 OPEN 항목과 UI-SPEC의 확정 결정을 대조하고, §7 및 화면별 상태·키보드 흐름의 누락을 줄 번호 근거로 검토하겠습니다. 파일은 수정하지 않습니다.

exec
/bin/bash -lc "rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g '*PLAN.md' -g '*UI-SPEC.md' -g 'SYSTEM.md' -g 'tokens.css' .planning docs . | head -100" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
.planning/quick/260924-hgx-admin-people-list-n-1-query-fix-issue-56/260924-hgx-PLAN.md
.planning/quick/260922-i3k-b-admin-3-a-m3/260922-i3k-PLAN.md
.planning/quick/260923-odg-hook/260923-odg-PLAN.md
.planning/quick/260922-o2b-codex-design-review-fixes/260922-o2b-PLAN.md
.planning/quick/260924-cj5-pc-wordmark-links-to-home/260924-cj5-PLAN.md
.planning/quick/260922-c04-codex-cli-sessionstart-codex-auth-json-b/260922-c04-PLAN.md
.planning/phases/04-project-quote-ledger/04-18-PLAN.md
.planning/phases/03-permissions-settings-masters/03-05-PLAN.md
.planning/phases/04-project-quote-ledger/04-13-PLAN.md
.planning/phases/04-project-quote-ledger/04-02-PLAN.md
.planning/phases/04-project-quote-ledger/04-30-PLAN.md
.planning/phases/04-project-quote-ledger/04-40-PLAN.md
.planning/phases/04-project-quote-ledger/04-16-PLAN.md
.planning/phases/04-project-quote-ledger/04-26-PLAN.md
.planning/phases/04-project-quote-ledger/04-19-PLAN.md
.planning/phases/04-project-quote-ledger/04-06-PLAN.md
.planning/phases/04-project-quote-ledger/04-07-PLAN.md
.planning/phases/04-project-quote-ledger/04-14-PLAN.md
.planning/phases/04-project-quote-ledger/04-08-PLAN.md
.planning/phases/04-project-quote-ledger/04-15-PLAN.md
.planning/phases/04-project-quote-ledger/04-28-PLAN.md
.planning/phases/04-project-quote-ledger/04-10-PLAN.md
.planning/phases/03-permissions-settings-masters/03-UI-SPEC.md
.planning/phases/04-project-quote-ledger/04-27-PLAN.md
.planning/phases/03-permissions-settings-masters/03-06-PLAN.md
.planning/phases/03-permissions-settings-masters/03-04-PLAN.md
.planning/phases/04-project-quote-ledger/04-46-PLAN.md
.planning/phases/03-permissions-settings-masters/03-07-PLAN.md
.planning/phases/03-permissions-settings-masters/03-02-PLAN.md
.planning/phases/04-project-quote-ledger/04-43-PLAN.md
.planning/phases/03-permissions-settings-masters/03-03-PLAN.md
.planning/phases/04-project-quote-ledger/04-25-PLAN.md
.planning/phases/03-permissions-settings-masters/03-01-PLAN.md
.planning/phases/04-project-quote-ledger/04-32-PLAN.md
.planning/phases/04-project-quote-ledger/04-44-PLAN.md
.planning/phases/04-project-quote-ledger/04-17-PLAN.md
.planning/phases/04-project-quote-ledger/04-31-PLAN.md
.planning/phases/04-project-quote-ledger/04-20-PLAN.md
.planning/phases/04-project-quote-ledger/04-04-PLAN.md
.planning/phases/04-project-quote-ledger/04-21-PLAN.md
.planning/phases/04-project-quote-ledger/04-22-PLAN.md
.planning/phases/04-project-quote-ledger/04-24-PLAN.md
.planning/phases/04-project-quote-ledger/04-12-PLAN.md
.planning/phases/04-project-quote-ledger/04-29-PLAN.md
.planning/phases/04-project-quote-ledger/04-05-PLAN.md
.planning/phases/04-project-quote-ledger/04-11-PLAN.md
.planning/phases/04-project-quote-ledger/04-23-PLAN.md
.planning/phases/04-project-quote-ledger/04-01-PLAN.md
.planning/phases/04-project-quote-ledger/04-47-PLAN.md
.planning/phases/04-project-quote-ledger/04-UI-SPEC.md
.planning/phases/04-project-quote-ledger/04-09-PLAN.md
.planning/phases/04-project-quote-ledger/04-41-PLAN.md
.planning/phases/04-project-quote-ledger/04-42-PLAN.md
docs/design/tokens.css
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md
docs/design/SYSTEM.md
.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-07-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-04-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-03-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-05-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-08-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-02-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-06-PLAN.md
.planning/phases/01-deploy-skeleton-login/01-01-PLAN.md
.planning/phases/02-design-system-app-shell/02-02-PLAN.md
.planning/phases/02-design-system-app-shell/02-01-PLAN.md
.planning/phases/02-design-system-app-shell/02-08-PLAN.md
.planning/phases/02-design-system-app-shell/02-05-PLAN.md
.planning/phases/02-design-system-app-shell/02-07-PLAN.md
.planning/phases/02-design-system-app-shell/02-03-PLAN.md
.planning/phases/02-design-system-app-shell/02-06-PLAN.md
.planning/phases/02-design-system-app-shell/02-04-PLAN.md
./CLAUDE.md
./docs/design/SYSTEM.md
./docs/design/tokens.css

exec
/bin/bash -lc "pwd; rg --files -g AGENTS.md -g '"'!node_modules'"' /home/user 2>/dev/null; wc -l .planning/phases/04.5-custom-field-admin/*PLAN.md .planning/phases/04.5-custom-field-admin/*UI-SPEC.md docs/design/SYSTEM.md CLAUDE.md; rg -n 'OPEN|편차|사용성 원칙' .planning/phases/04.5-custom-field-admin/*PLAN.md CLAUDE.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
/home/user/ERP_PLANT8_260917
   309 .planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md
   315 .planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md
   307 .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md
   271 .planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md
   367 .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md
   284 .planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md
   390 .planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md
   267 .planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md
   210 .planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md
   390 .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md
  1075 docs/design/SYSTEM.md
   152 CLAUDE.md
  4337 total
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:42:    - "보관 선택지는 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」으로만 보이고 버튼이 없다 — N = 0이면 렌더하지 않고, 개수 상한은 활성에만 건다(UI-SPEC 화면 2, E2 overflow, **OPEN 2-A**)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:86:**OPEN — /plan-design-review(이 플랜이 승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리):**
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207:⑥ `page.tsx`: `editId`가 활성 거래처 정의 id이고 쓰기 권한이 있을 때만 수정 폼을 `key={id}`로 렌더하고(`version`은 prop), 폼이 열려 있으면(`?new=1` 또는 수정) 필터 줄 「화면 항목 추가」를 렌더하지 않는다. 동작 열: 쓰기 권한이면 3차 링크 「수정」(`?editId=<id>`, `aria-label` 「{이름} 수정」). 폼은 두 컴포넌트다(새 파일 없음 — 같은 `field-definition-form.tsx` 안에 비공개 함수 컴포넌트 하나를 더한다, `vendor-form.tsx` 210행 `VendorCustomField` 같은 파일 내 보조 컴포넌트 선례): 바깥 컴포넌트는 `useAction` 상태(결과·`reset`)와 결과 줄만 갖고, 폼 본문(입력 칸 묶음·선택지 `useState`·숨은 `version`·`Form.Actions`)은 같은 파일의 비공개 컴포넌트(예: `FieldDefinitionFormBody`)에 두어 `<FieldDefinitionFormBody key={version} … />`로 렌더하고 액션 상태를 prop으로 받는다. 훅 상태는 컴포넌트 인스턴스에 붙으므로 바깥 함수 안의 `div`·Fragment에 `key`를 주면 DOM만 다시 만들어지고 선택지 상태는 옛 값으로 남는다 — `key`는 반드시 이 본문 컴포넌트 요소에 준다. 페이지의 `key={id}`와 합쳐 입력 쪽 초기화는 UI-SPEC 178행의 `key={id}:{version}` 다시 마운트와 같다. 저장 성공 → `revalidatePath`로 새 `version`이 오면 본문 컴포넌트만 다시 마운트돼 입력·선택지 상태가 저장된 값으로 다시 시작하고, 결과 줄은 바깥 상태에서 그리므로 남는다(결과 줄 포커스는 성공 상태로 다시 마운트될 때도 건다). 숨은 `version`은 prop이라 v+1이 된다. `Form.Actions`를 본문 컴포넌트에 두는 이유: 1차의 「선택지 0개」 비활성이 선택지 상태와 같은 컴포넌트라 끌어올릴 상태가 없다. 등록 모드는 본문 컴포넌트의 key가 바뀌지 않아 08의 「하나 더 추가」 다시 마운트(바깥 층까지) 그대로다. 폼 수정 모드: 숨은 `version`, 타입 자리에 타입 이름 텍스트 + 3차 링크 「새 화면 항목 추가」(`?new=1`, 설명 문구 없음 — §8 규칙 5), 1차 「화면 항목 수정」, 성공 결과 줄 「화면 항목 수정 · {이름} 수정됨」 + 2차 「닫기」. 이유 자리: `serverError`가 충돌 원인 상수면 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 」 + 3차 「새로 불러오기」(`reset()`으로 바깥의 충돌 결과를 지우고 `router.refresh()` — 새 `version`의 `key`로 본문 컴포넌트가 다시 마운트돼 입력·선택지 상태(활성, Task 3부터 보관도)가 최신 행 값이 되고 이름 입력으로 포커스), 보관 원인 상수면 「수정할 수 없음 — 보관된 화면 항목입니다 · 」 + 3차 「목록으로」(`router.replace` 목록), 그 밖은 `formReason("수정", serverError)` 글자(08 OPEN 1-A의 결정이 두 모드에 같이 적용된다). 선택형 활성 0개 이유 「수정할 수 없음 — 선택지 0개 · 선택지 추가」.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:228:  <name>Task 3: 수정 모드 선택지 — 저장된 선택지 「삭제」 = 보관 · 「보관된 선택지 N개」 펼침(OPEN 2-A) · 같은 버전 저장값으로 보관 파생 → 같은 조건부 UPDATE</name>
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:247:③ 폼 수정 모드: 저장된 활성 선택지와 보관 선택지를 Task 2의 본문 컴포넌트(`key={version}`) 초기 상태로 받는다(page가 DTO의 `options`·`archivedOptions`를 넘김 — 새로 불러오기·저장 성공 뒤 다시 마운트로 둘 다 최신 행 값이 된다). 저장된 선택지(초기 활성 ∪ 초기 보관)는 `removeOption`의 `savedOptions`다 — 「삭제」가 보관으로 옮긴다. 보관 목록은 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 버튼과 같은 글자 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」(`kind="muted"`, `variant="text"`), 버튼 없음. N = 0이면 `details`를 렌더하지 않는다. 제출은 활성 배열만 보낸다(서버가 보관을 파생). **OPEN — /plan-design-review (2-A):** `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — UI-SPEC 원문(네이티브 `details`)대로 기본 표시를 **그대로 두고**, 숨기거나 새 아이콘을 넣지 않는다. 결정이 오면 CSS 한 곳만 바꾼다.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:260:    - OPEN 2-A가 SUMMARY 「디자인 리뷰 대기」 목록에 있다
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:292:- OPEN 2-A·2-B가 SUMMARY 「디자인 리뷰 대기」에 있다
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:124:**옛 01의 must_have 중 08로 옮긴 것(조용히 뺀 것 없음 — 메뉴 등록·관리 인덱스·액션 등록부·누수 스캔 계약은 08에서 다시 09로 나눴다):** 관리 인덱스 「화면 항목」 링크와 SYSTEM.md §6-10·`role-menu.test.ts`·`admin-nav.spec.ts`의 10 → 11(UI-SPEC O6 — 한 계획에서 함께) · `MENUS` 등록(아래 「메뉴 등록 위치」) · 목록 표 · 정렬 기본값(`nextSortOrder`) · 칸 오류 문구 · 이름 예약(활성·보관, 「보관함에서 복원」 링크의 두 쓰기 권한) · 폼 전체 이유 자리(OPEN 1-A) · 제출 중 잠금 · 결과 줄(1-C, 「하나 더 추가」) · `FieldDefinitionAdminDto`의 누수 스캔 계약(Codex #6) · 액션 등록부(`actions.registry.ts`) · `test/e2e/fixtures.ts`의 `archiveE2EFieldDefinitions`(03·04·06·07이 쓰는 정리 픽스처 — 이 플랜의 스펙도 08에서 `afterAll`로 붙는다) · 마이그레이션 문장 순서 가드 `test/unit/custom-fields/field-definitions-migration.test.ts`(07의 재생성 뒤 손 편집 재적용을 지키는 단위 테스트 — 파일 이름·위치는 그대로, 만드는 플랜만 08) · `targets.ts` 대상 등록부. 이 플랜에 남은 것: 생성 중간 실패 롤백 테스트(`test/integration/field-definitions-admin.test.ts`)와 기존 칸 노출 행 채움의 실행 검증(같은 파일).
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:96:  - UI-SPEC 문언과의 차이는 SUMMARY에만 두지 않는다. 아래 OPEN 목록의 편차-06a로 디자인 리뷰에 올린다. RTL 도입은 사용자 승인 뒤 별도 작업이다.
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:99:- **OPEN — /plan-design-review (1-B):** `noValidate`를 켜면 기본 칸 「이름」을 비운 제출이 브라우저 말풍선 대신 서버 문구 「이름을 입력하세요.」를 이름 칸 아래에 보인다. 이 문구는 §8 「원인 · 다음 행동」 모양이 아니고, 기본 칸 문구는 이 페이즈 범위 밖이다. 또 이유 자리 요약이 기본 칸(이름) 오류도 세는지 UI-SPEC이 정하지 않았다. 이 플랜의 구현은 둘 다 그대로 둔다 — 이름 문구는 바꾸지 않고, 요약은 커스텀 칸 오류만 센다(이름만 틀리면 이유 자리는 비고 이름 칸 아래에만 오류). 디자인 리뷰가 정하면 요약 대상과 문구만 바꾼다. SUMMARY 「디자인 리뷰 대기」 목록에 적는다.
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:100:- **OPEN — /plan-design-review (편차-06a — 승인된 UI-SPEC 개정 3과 다른 테스트 방식).** UI-SPEC 화면 3은 단위(RTL) 테스트로 세 속성을 증명하라고 했다: 이유 자리 id · 1차 `aria-describedby` · 폼 상단 상자 부재. 이 플랜은 위 「단위(RTL) → 소스 검사 + E2E」 결정대로 나눠 증명한다. 소스 검사 단위 테스트와 `CI=true` E2E의 실제 DOM 단언이다. 디자인 리뷰가 이 대체를 받아들일지 정한다. 결과는 테스트 방식만 바꾸고 화면 동작은 그대로다. SUMMARY 「디자인 리뷰 대기」 목록에도 적는다.
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:107:- 이유 자리 요약이 커스텀 칸만 센다(OPEN 1-B의 잠정 구현) — **reversible**: 요약 입력 배열 한 곳이다.
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:190:    - OPEN 1-B와 편차-06a(단위(RTL) → 소스 검사 + E2E)가 SUMMARY 「디자인 리뷰 대기」 목록에 있다
.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:280:| 디자인 리뷰 대기 | OPEN 1-B(이름 칸 서버 문구 · 요약 대상) · OPEN 편차-06a(UI-SPEC 「단위(RTL)」 → 소스 검사 + E2E — 렌더 러너 없음, 새 의존성은 승인 사항) |
.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:123:**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3이 비워 둔 자리를 기존 문구로 메운 곳 — SUMMARY에만 두지 않는다):**
CLAUDE.md:121:## 7. 화면 사용성 원칙
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:109:- **테스트 (b)(보관함 서버 액션 직접 호출):** `app/(app)/admin/archive/actions.ts`는 `"use server"` → `server-only` 체인이라 Vitest가 import하지 못한다(`test/integration/leak-scan.test.ts` 머리 주석). 그래서 (b)는 ① 소스 검사 단위 테스트(복원 액션이 domain `restore()`만 부르고 자체 권한 판정·다른 쓰기 경로가 없다) + ② (a)의 domain 거부 통합 테스트의 합으로 증명한다. UI-SPEC 문언(액션을 직접 불러 거부)과의 차이를 SUMMARY 편차로 적는다.
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:112:- **OPEN — /plan-design-review (승인된 UI-SPEC 개정 3과 다른 테스트 방식 두 개).** 위 두 결정은 UI-SPEC이 적은 테스트 모양과 다르다. SUMMARY에만 두지 않고 여기 목록에 올려 디자인 리뷰가 받아들일지 정하게 한다. 리뷰 결과는 테스트 방식만 바꾼다. 서버 권한 판정·화면 동작은 그대로다.
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:113:  - **편차-04a — 테스트 (b).** UI-SPEC은 보관함 서버 액션(`restoreArchivedAction`)을 직접 불러 거부를 확인하라고 했다. 이 플랜은 두 가지를 합쳐 증명한다. ① 소스 검사 단위 테스트: 복원 액션이 domain `restore()`만 부르고, 자체 권한 판정(`can(`)도 리포지토리 import도 없다. ② domain 테스트 (a)의 통합 거부. 이유: `"use server"` → `server-only` 체인이라 Vitest가 액션을 import하지 못한다.
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:114:  - **편차-04b — 페이지 「삭제」 렌더 조건 단위 테스트.** UI-SPEC은 렌더 테스트를 적었다. 이 플랜은 소스 검사 단위 테스트(두 쓰기 판정의 AND · 보관 행 제외)와 E2E(두 권한일 때 트리거가 보임)로 대신한다. 이유: React 렌더 러너(`@testing-library/react`)가 없고, 새 의존성은 승인 사항이다.
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:213:    - OPEN 편차-04a·편차-04b가 이유와 함께 SUMMARY 「디자인 리뷰 대기」 목록에 있다
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:239:| T-04.5-SC | Tampering | npm/pip/cargo installs | high | mitigate | 신규 외부 패키지 0개 — 의존성 객체·lockfile diff 없음. 테스트 (b)·페이지 렌더 조건은 렌더 러너 없이 소스 검사로 대신하고 OPEN 편차-04a·편차-04b로 디자인 리뷰에 올린다 |
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:266:| 편차 기록 | 「다른 여섯 항목」 → 실제 일곱(사실 정정) |
.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:267:| 디자인 리뷰 대기 | OPEN 편차-04a(테스트 (b) → 소스 검사 + domain 테스트 (a)) · 편차-04b(페이지 「삭제」 렌더 조건 → 소스 검사 + E2E) |
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:106:**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3에서 벗어난 자리 — SUMMARY에만 두지 않는다, 번호는 옛 08 그대로):**
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:108:2. **권한 시드 수단 — 해소(라운드 2 D3):** UI-SPEC 화면 1대로 `insertPermissionIfAbsent`로 준다(위 「권한 시드 수단」). 승인본과의 편차가 없어졌으므로 디자인 리뷰 대기 목록에 올리지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:160:    - `seed-permissions.test.ts`의 새 `it`(시스템 관리자 `admin.field-definitions` write 회수 → 재시드 → 꺼진 채)이 초록이다 · OPEN 2는 해소로 SUMMARY에 적고 「디자인 리뷰 대기」에 올리지 않는다
.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md:85:- 디자인 리뷰 대기 OPEN 1-A·1-B·2-A와 UI-SPEC 편차 OPEN(04의 편차-04a 테스트 (b) → 소스 검사 + domain 테스트 (a) · 편차-04b 페이지 「삭제」 렌더 조건 → 소스 검사 · 06의 편차-06a 단위(RTL) → 소스 검사 + E2E)을 `/plan-design-review`로 넘긴다.
.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md:386:| 디자인 리뷰 대기 | OPEN 1-A(08·02) · 2-A(02) · 1-B(06) · UI-SPEC 편차 OPEN 편차-04a·편차-04b(04)·편차-06a(06) + 감사에서 넘긴 항목 |
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:37:    - "폼 전체 서버 오류는 `Form.Actions` 1차 옆 이유 자리에 「추가할 수 없음 — {serverError 원문} · 다시 시도」로 보인다 — 원문에 이미 「 · 」가 있으면 「 · 다시 시도」를 붙이지 않는다. 폼 상단 오류 상자 컴포넌트는 쓰지 않는다. 제출 중 권한이 회수되면 원인은 「권한 없음」이다(UI-SPEC Copywriting 137행, 화면 1 권한 · **OPEN 1-A**)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:108:**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리 — SUMMARY에만 두지 않는다, OPEN 2 권한 시드 수단은 09):**
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:172:  <name>Task 2: 목록 표 · 등록 폼 완성 — 빈 상태 기본값 · 칸 오류 · 이름 예약(「보관함에서 복원」은 두 쓰기 권한 + `admin.archive` view가 다 있을 때만) · 폼 전체 이유 자리(OPEN 1-A) · 제출 중 잠금 · 결과 줄(1-C, 「하나 더 추가」) · E2E 정리 픽스처</name>
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200:④ **폼(UI-SPEC 화면 2).** 이름 입력 `maxLength={FIELD_NAME_MAX}`. 칸 오류는 `validationErrors`의 칸 키로 찾아 각 칸의 `error`로 보인다. 이름 오류가 「보관함에서 복원」 변형 상수와 같으면 `TextField`의 문자열 `error` 대신 이름 칸 오류 줄을 `Form.Error`(children)로 그려 「보관함에 같은 이름의 화면 항목이 있습니다 · 」 뒤에 3차 링크 「보관함에서 복원」(`/admin/archive`)을 둔다 — `aria-invalid`·`aria-describedby` 배선은 `TextField`와 같게 맞춘다. 폼 전체 서버 오류(`serverError`)는 `Form.Actions` 안 1차 버튼 옆 이유 자리(`--fs-sm --danger` span, 1차 `aria-describedby`가 가리킴)에 `formReason("추가", serverError)` 결과를 글자로 쓴다(「다시 시도」는 버튼이 아니다 — OPEN 3). 폼 상단 오류 상자 컴포넌트(`ui/form-alert`)는 import하지 않는다. **OPEN 1-A:** 권한이 회수된 경우 원인이 「권한 없음」이라 「다시 시도」가 성공할 수 없다 — UI-SPEC 원문대로 구현하고 디자인 리뷰의 결정을 기다린다. 제출 중에는 1차 `pending`, 입력 전체를 감싼 `fieldset`에 `disabled`, 2차 「취소」도 비활성(링크면 비활성 표현이 되는 버튼 모양으로) — 300ms 넘으면 §7-1 진행 바(`Button`이 이미 하면 그대로 쓴다). 성공(SYSTEM.md §7-15 「화면이 그대로인 폼」): 01의 `router.replace` 닫기 대신 1차 버튼 자리가 결과 줄 「화면 항목 추가 · {이름} 추가됨」(`role="status"`, `tabIndex={-1}`, 성공 직후 포커스)으로 바뀌고 입력은 읽기 전용, 뒤에 3차 링크 「정보 노출표 보기」(`/admin/visibility` — `canViewVisibility`일 때만, **1-C 채택**, D10-13 자동 등록을 바로 확인하는 길) · 3차 「하나 더 추가」 · 2차 「닫기」(`router.replace("/admin/field-definitions")`). 「하나 더 추가」는 폼을 감싼 클라이언트 쪽에서 `key`를 바꿔 다시 마운트하고(React 상태까지 초기화) 이름 입력으로 포커스를 보낸다 — 정렬 기본값은 재검증된 page가 넘긴 새 값이다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:211:    - OPEN 1·3이 SUMMARY 「디자인 리뷰 대기」 목록에 있다(OPEN 2는 09)

exec
/bin/bash -lc 'nl -ba .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md' in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
     1	---
     2	phase: "04.5"
     3	slug: "custom-field-admin"
     4	status: approved
     5	shadcn_initialized: false
     6	preset: none
     7	created: "2026-09-24"
     8	revised: "2026-09-24"
     9	reviewed_at: "2026-09-24"
    10	---
    11	
    12	# Phase 04.5 — UI Design Contract
    13	
    14	> 화면 항목 관리(custom-field-admin)의 시각·상호작용 계약. gsd-ui-researcher가 작성하고 gsd-ui-checker가 검증한다.
    15	> 비대화형 세션 — 열린 질문은 연구자 또는 오케스트레이터가 정했고 `## Assumptions`에 출처와 함께 남겼다.
    16	> 개정(2026-09-24): UI checker BLOCK 1건·FLAG 8건, Codex(GPT) 적대 리뷰 17건 반영.
    17	> 개정 2(2026-09-24): Codex 재검토 남은 항목(#4·5·7·11·12·15·16 + 신규 MAJOR 4건)과 checker FLAG(1-a~d·3·5) 반영 — Assumptions O11~O19.
    18	> 개정 3(2026-09-24): Codex 3차 MAJOR 6건(#4·5 인라인 삭제 확인 → 기록된 시스템 예외, #7 거래처 폼 서버 오류 → 이유 자리, #11 버전 조건부 갱신, #12 보관·복원 이중 권한, 신규 보관 이름 예약)과 MINOR X2 근거 정정 — Assumptions O20~O25. SYSTEM.md 줄 번호는 §7-1 예외 한 줄 추가 뒤 기준(671행 이후 +1).
    19	
    20	새 화면 템플릿은 없다. 세 화면 모두 `docs/design/SYSTEM.md`의 §6-1(관리자 마스터 목록)·§7-13(체크박스 매트릭스)·§6-3/§7-15(폼)를 쓴다. 이 문서는 그 계약을 이 페이즈의 화면에 적용한 결과이고, **기존 코드를 바꾸는 지점은 「변경」으로 명시한다.**
    21	
    22	---
    23	
    24	## Design System
    25	
    26	| Property | Value |
    27	|----------|-------|
    28	| Tool | none — shadcn 아님(`components.json` 없음, 확인함). 자체 시스템 `docs/design/SYSTEM.md` + `docs/design/tokens.css` |
    29	| Preset | not applicable |
    30	| Component library | 내부 `ui/`(React + CSS Modules) |
    31	| Icon library | Lucide(`components/icons/`) — **이 페이즈 화면은 아이콘을 쓰지 않는다**(§9 사용처 해당 없음) |
    32	| Font | Pretendard Variable(`--font-sans`) |
    33	
    34	---
    35	
    36	## Component Inventory
    37	
    38	Enumerated by `find ui -mindepth 1 -maxdepth 1 -type d | wc -l` — 18 modules(디렉터리 단위, `shell`·`logout`·`auth-frame` 같은 셸 모듈 포함 — 전부가 화면 컴포넌트는 아님) — internal `ui/`(repo-local, 패키지 버전 없음, 기준 커밋 d14c5ec) — 2026-09-24.
    39	
    40	비-배타적 목록이다. 표 밖 `ui/` 모듈이나 화면 로컬 컴포넌트를 쓰는 것이 정상 경로다.
    41	
    42	| Component | Import path | 이 페이즈 사용 |
    43	|-----------|-------------|----------------|
    44	| PageHeader | `@/ui/page-header/PageHeader` | 화면 1 제목 줄(`titleSize` 기본) |
    45	| ListEmpty | `@/ui/list-empty/ListEmpty` | 화면 1 EMPTY 두 종류 |
    46	| StatusTag | `@/ui/status-tag/StatusTag` | 「보관됨」(`kind="muted"`, `variant="text"`) — 목록 행·보관 선택지 |
    47	| Button | `@/ui/button/Button` | 1차·2차·3차 전부. `pending`(진행 중), `disabled`+`disabledReason`(이유 있는 비활성) |
    48	| TextField | `@/ui/input/TextField` | 이름·정렬 순서·새 선택지·거래처 커스텀 칸. `error` prop이 `aria-invalid`·`aria-describedby`를 이미 배선 |
    49	| Form(`Form`·`Form.Field`·`Form.Error`·`Form.Actions`·`Form.Hint`) | `@/ui/form/Form` | **화면 2 폼 전체.** `<form noValidate>` 내장, 칸 폭 3종(select 200·short 280·long 480) |
    50	| Select | `@/ui/select/Select` | 화면 2 「타입」(등록 모드). `error` prop 내장 |
    51	| `DeleteToArchive` | `@/app/(app)/admin/archive/delete-to-archive` | 목록 행 「삭제」. **변경 없이 재사용**(라벨 「삭제」, 인라인 확인) — 관리자 마스터 화면 공통의 **기록된 임시 예외**(SYSTEM.md 671행, DECISIONS.md 2026-09-24 「인라인 보관 확인」). 화면 절 끝 「기존 공유 컴포넌트 — 기록된 시스템 예외」 |
    52	| `PermissionGridClient` | `@/app/(app)/admin/permissions/permission-grid-client` | 화면 4. props 모양·CSS 모두 변경 없음 |
    53	| FormAlert | `@/ui/form-alert/FormAlert` | **이 페이즈 화면 어디에도 쓰지 않는다**(§7-15 폼 상단 오류 상자 금지, SYSTEM.md 993행). 거래처 폼의 기존 `serverError` 상자(`vendor-form.tsx:195`)는 **변경** — `Form.Actions` 이유 자리로 옮기고 `FormAlert` import를 지운다(화면 3 변경 5). `ui/form-alert/` 모듈 자체는 다른 화면이 쓰므로 그대로 |
    54	| 네이티브 `<select>` | (거래처 폼 로컬) | 거래처 폼의 선택형 커스텀 칸 — 기존 관례 유지, 오류 배선만 추가(화면 3) |
    55	| Table | `@/ui/table/Table` | 쓰지 않는다(§7-3 편집 그리드용). 목록은 vendors와 같은 읽기용 `<table>` + 로컬 CSS |
    56	
    57	---
    58	
    59	## Spacing Scale
    60	
    61	`docs/design/tokens.css` 값만 쓴다(새 값 금지).
    62	
    63	| Token | Value | Usage |
    64	|-------|-------|-------|
    65	| `--s-1` | 4px | 폼 라벨-입력 세로 간격 |
    66	| `--s-2` | 8px | 인라인 요소 사이(선택지 텍스트와 「삭제」, 결과 텍스트와 3차 버튼) |
    67	| `--s-3` | 12px | 섹션 선 아래 여백 |
    68	| `--s-4` | 16px | 폼 항목 사이 |
    69	| `--s-5` | 20px | PC 컨테이너 좌우 패딩 |
    70	| `--s-6` | 24px | 폼 묶음 사이(+ `1px --line`) |
    71	| `--cell-pad-y` / `--cell-pad-x` | PC 6px / 8px · 폰 10px / 8px | **목록 표 셀 패딩 전부**(SYSTEM.md 190행, tokens.css 112·162행). 셀에 `--s-*`를 직접 쓰지 않는다 |
    72	
    73	SYSTEM.md 지정 예외(8의 배수가 아닌 값 — 전부 SYSTEM.md가 정한 값이고 이 페이즈가 새로 만든 값은 없다):
    74	- 표 셀 패딩 세로 6px(PC)·10px(폰) — SYSTEM.md 190행(`--cell-pad-y`)
    75	- 12px(`--s-3`) — 섹션 선 아래 여백(SYSTEM.md 191행)·버튼 좌우 패딩(665행)
    76	- 20px(`--s-5`) — PC 컨테이너 좌우 패딩(SYSTEM.md 182행 「예외 허용」)
    77	
    78	폰 행동 요소 최소 44×44(`--touch-min`)는 시스템 기본 규칙이다.
    79	
    80	---
    81	
    82	## Typography
    83	
    84	| Role | Size | Weight | Line Height |
    85	|------|------|--------|-------------|
    86	| Body | 14px `--fs-base`(폰 15px) | 400 | 1.6 `--lh-body` · 표 셀 1.5 `--lh-table` |
    87	| Label | 12px `--fs-sm` | 600 | 1.5 |
    88	| Heading | 18px `--fs-lg` | 700 | 1.4 `--lh-head` |
    89	| Tag | 11px `--fs-xs` | 600 | 1.4 `--lh-head` — StatusTag 「보관됨」 |
    90	
    91	4단계·3굵기는 SYSTEM.md가 정한 값이다(§2-2, 한 화면 최대 4단계). `--fs-xl`·`--fs-2xl`은 쓰지 않는다.
    92	
    93	---
    94	
    95	## Color
    96	
    97	| Role | Value | Usage |
    98	|------|-------|-------|
    99	| Dominant (60%) | `--bg` #FFFFFF | 화면 바탕, **읽기용 목록 표 머리글(흰색)** |
   100	| Secondary (30%) | `--surface` #F3F7F5 · `--g-100` #DCE8E4 | `--surface` = 목록 행 hover · 비활성 버튼 면. `--g-100` = **정보 노출표(§7-13) 머리글에만** |
   101	| Accent (10%) | `--accent`(`--g-700` #005446) | 아래 목록만 |
   102	| Destructive | `--danger` #9B1C1C | `Form.Error`·막힘 이유 글자·틀린 칸 테두리. 붉은 버튼 없음 |
   103	
   104	Accent reserved for:
   105	- 1차 버튼 면 — 「화면 항목 추가」·「화면 항목 수정」 제출, 거래처 폼 「거래처 등록/수정」(기존)
   106	- 1차 버튼 면 — `DeleteToArchive` 확인 줄의 1차 「삭제」. 위험 확인의 1차 행동 버튼 자체는 SYSTEM.md 839행(모달 하단 1차 행동)대로라 accent 사용은 맞다. 어긋나는 것은 **표면**이다: 모달·시트가 아니라 목록 행 안에 뜨고(행 안 행동은 3차, 661~663행 표), 수정 폼이 열린 채 확인하면 한 화면에 1차가 둘이 된다(661행 「1개」). 관리자 마스터 공통의 기록된 임시 예외(SYSTEM.md 671행 · X1·X2)
   107	- 3차 버튼·링크 글자와 밑줄(§7-1) — 「화면 항목 추가」(필터 줄)·「보관 포함/보관 제외」·「수정」·「삭제」·「선택지 추가」·선택지 「삭제」·「보관된 선택지 N개」(펼침 `<summary>`)·「새 화면 항목 추가」·「정보 노출표 보기」·「하나 더 추가」·「{칸 이름} 고치기」·「필터 지우기」
   108	- 포커스 링(`:focus-visible`)
   109	
   110	해당 없음: 내 차례 태그, 편집 중 셀, 상단 바 현재 위치 밑줄.
   111	
   112	---
   113	
   114	## Copywriting Contract
   115	
   116	| Element | Copy |
   117	|---------|------|
   118	| Primary CTA | 화면 항목 추가(등록 제출) · 화면 항목 수정(수정 제출) |
   119	| Empty state heading | 등록된 화면 항목이 없습니다 · 화면 항목 추가 (§7-7 한 줄 계약). `write` 없는 열람자: 「등록된 화면 항목이 없습니다」 한 줄만(다음 행동 없음 — 할 수 없는 행동을 권하지 않는다) |
   120	| Empty state body | 없음(한 줄 계약). 필터 결과 0은 「조건에 맞는 건이 없습니다 · 필터 지우기」 |
   121	| Error state | 화면 항목을 불러오지 못했습니다 · 다시 시도 |
   122	| Destructive confirmation | 목록 행 「삭제」 → `{이름} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다` + 1차 「삭제」 + 2차 「취소」(`DeleteToArchive` 기존 문구·방식 그대로 — 인라인 확인은 SYSTEM.md 671행의 기록된 임시 예외). 실패: 「삭제하지 못했습니다 · 다시 시도」. 권한 부족(보관함 권한만 있고 화면 항목 쓰기 없음 — 직접 호출 경로)은 서버 거부 → 같은 실패 줄 |
   123	
   124	화면별 카피(§8 규칙: 버튼=실제 동작, 결과=버튼과 같은 단어, 오류=「원인 · 다음 행동」):
   125	
   126	| 위치 | Copy |
   127	|------|------|
   128	| 필터 토글(기본 보관 제외) | 보관 포함 ↔ 보관 제외 |
   129	| 이름 빈칸(`Form.Error`) | 이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요 |
   130	| 이름 중복 — 활성 정의와 같음(`Form.Error`) | 같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기 |
   131	| 이름 중복 — 보관된 정의와 같음(`Form.Error`, 등록·이름 변경 모두) | 보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원 — 「보관함에서 복원」은 3차 링크(`/admin/archive`), 보는 사람에게 `admin.archive` view가 있을 때만. 없으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기」(평문) |
   132	| 정렬 순서 범위 밖(`Form.Error`) | 0~999 사이 정수가 아닙니다 · 숫자 고치기 |
   133	| 새 선택지 빈칸으로 「선택지 추가」 | 선택지가 비어 있습니다 · 선택지 적기 |
   134	| 새 선택지가 활성 선택지와 같음 | 이미 있는 선택지입니다 · 다른 이름 적기 |
   135	| 활성 선택지 30개(「선택지 추가」 `disabledReason`) | 선택지는 30개까지 · 쓰지 않는 선택지 삭제 |
   136	| 타입=선택, 활성 선택지 0개(1차 `disabledReason`) | 추가할 수 없음 — 선택지 0개 · 선택지 추가 (수정 모드: 수정할 수 없음 — …) |
   137	| 폼 전체 서버 오류(`Form.Actions` 이유 자리) | 추가할 수 없음 — {서버 원인} · 다시 시도 (수정 모드: 수정할 수 없음 — …). {서버 원인} = `serverError` 원문. 원문에 이미 「 · 」(다음 행동)가 있으면 「 · 다시 시도」를 붙이지 않는다(일반 문구 「처리 중 오류가 발생했습니다 · 잠시 후 다시 시도해 주세요」) |
   138	| 수정 충돌 — 폼을 연 뒤 다른 사람이 먼저 저장·보관·복원(`Form.Actions` 이유 자리) | 수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 새로 불러오기 — 「새로 불러오기」는 3차 버튼 |
   139	| 수정 충돌 — 그 사이 정의가 보관됨(`Form.Actions` 이유 자리) | 수정할 수 없음 — 보관된 화면 항목입니다 · 목록으로 — 「목록으로」는 3차 버튼(`router.replace` 목록) |
   140	| 거래처 폼 — 폼 전체 서버 오류(1차 옆 이유 자리, 칸 오류 요약과 같은 자리) | {등록\|수정}할 수 없음 — {서버 원인} · 다시 시도 (위 새 폼과 같은 {서버 원인} 규칙) |
   141	| 등록 성공(버튼 자리 결과) | 화면 항목 추가 · {이름} 추가됨 + 3차 「정보 노출표 보기」 + 3차 「하나 더 추가」 + 2차 「닫기」 |
   142	| 수정 성공(버튼 자리 결과) | 화면 항목 수정 · {이름} 수정됨 + 2차 「닫기」 |
   143	| 수정 모드 타입 옆 3차 | 새 화면 항목 추가 |
   144	| 선택지 행 3차 | 삭제(`aria-label="{선택지} 삭제"`) |
   145	| 거래처 폼 — 필수 칸 빈칸(칸 아래) | 필수 칸이 비어 있습니다 · 값 입력 (선택형: · 선택지 고르기) |
   146	| 거래처 폼 — 보관된 선택지 새 지정(칸 아래) | 보관된 선택지입니다 · 다른 선택지 고르기 |
   147	| 거래처 폼 — 칸 오류 요약(1차 옆 이유 자리) | {등록\|수정}할 수 없음 — {실패 칸 이름들} {N}칸 · {첫 칸 이름} 고치기 |
   148	| 거래처 폼 — 보관 선택지 현재 값 표시 | {값} (보관됨) |
   149	| 관리 인덱스 마스터 그룹 항목 / 화면 제목 | 화면 항목 (부제 「거래처」) |
   150	| 정보 노출표 커스텀 열 저장 실패 | 셀 이유 「저장하지 못했습니다 · 다시 시도」(`ui/permission-grid/PermissionGrid.tsx:190`) + 토스트 「권한 저장 실패 · 다시 시도」(:203) + 원위치. 래퍼(`permission-grid-client.tsx:75`)가 던지는 오류 메시지(서버 문구 또는 「저장하지 못했습니다.」)는 `PermissionGrid`가 받아 버리고 화면에 나오지 않는다. 둘 다 바꾸지 않는다 |
   151	
   152	---
   153	
   154	## UI Considerations
   155	
   156	Applicable state considerations resolved: 32 covered, 6 backstop, 0 unresolved (probe 38 categories across E1~E5 cross-checked; grouped rows added as backstop).
   157	
   158	Elements: E1 `fieldDefinitionsList`(목록) · E2 `fieldDefinitionForm`(등록·수정 폼) · E3 `archiveControl`(행 「삭제」) · E4 `vendorCustomFieldsSection`(거래처 폼 커스텀 칸) · E5 `visibilityMatrixDynamicColumns`(노출표 동적 열).
   159	
   160	| Category | Element | Status | Resolution |
   161	|----------|---------|--------|------------|
   162	| empty | E1 | ✅ covered | 보관 포함 전체 0건 → `ListEmpty` 「등록된 화면 항목이 없습니다 · 화면 항목 추가」(`write` 없으면 「등록된 화면 항목이 없습니다」만). 기본(보관 제외) 0건인데 보관 건 ≥1 → 「조건에 맞는 건이 없습니다 · 필터 지우기」(→ 보관 포함). 서버가 보관 포함 건수로 두 경우를 가른다 |
   163	| loading | E1 | ✅ covered | 해당 없음 — 서버 컴포넌트(§7-7 관리자 마스터 행) |
   164	| error | E1 | ✅ covered | 표 본문 자리 한 줄 `--danger` 「화면 항목을 불러오지 못했습니다 · 다시 시도」 |
   165	| populated | E1 | ✅ covered | 읽기용 표 — **흰 머리글**, 셀 `--cell-pad-y/x`, 행 hover `--surface` |
   166	| partial | E1 | ✅ covered | 보관 포함일 때 보관 행: 상태 「보관됨」, 동작 칸 비움(복원은 `/admin/archive`) |
   167	| zero-one-many | E1 | ✅ covered | 0→EMPTY, N→N행. 그룹 머리글 없음. 정렬 = 정렬 순서 오름차순, 같은 번호면 내부 키 순(`repositories/field-definitions.ts:14` 기존 순서 그대로 — 안정적이지만 등록 순은 아님) |
   168	| overflow | E1 선택지 열 | ✅ covered | 활성 선택지 콤마 목록, 최대 30개×40자 — `word-break: keep-all` + `overflow-wrap: anywhere`(`app/globals.css:21-22` body 상속, 셀에서 덮어쓰지 않는다 — 새 CSS·토큰 없음). 공백 없는 40자도 셀 안에서 강제 줄바꿈, 말줄임 없음. 보관 선택지는 목록에 안 보인다 |
   169	| long-text | E1 이름 열 | ✅ covered | 이름 20자 상한(입력 `maxLength` + 서버 검증) + 같은 `overflow-wrap: anywhere` 상속 — 폰 P1에서도 넘침 없음 |
   170	| empty | E2 | ✅ covered | 해당 없음 — 칸이 항상 있다(타입 기본 「텍스트」, 정렬 순서 기본 = `min(활성 최대값 + 1, 999)`, 활성 정의가 없으면 1) |
   171	| error | E2 | ✅ covered | 서버 칸 오류 → 해당 `Form.Error`, 폼 전체 오류 → `Form.Actions` 이유 자리. `FormAlert` 없음. 값 보존(UX-04) |
   172	| partial | E2 | ✅ covered | 타입=선택·활성 0개 → 1차 `disabled` + `disabledReason` |
   173	| loading | E2 제출 중 | ✅ covered | 1차 `pending`(라벨 뒤 `…`), 입력·선택지 버튼 전체를 `<fieldset disabled>`로 잠금, 300ms 넘으면 §7-1 진행 바. **「취소」도 비활성**(SYSTEM.md 672·1000행 「같은 폼의 다른 버튼도 비활성」) — 응답 뒤 결과 줄의 「닫기」로 나간다 |
   174	| success | E2 | ✅ covered | 화면 2 「SUCCESS」 참고 — 버튼 자리 결과 텍스트, 입력 읽기 전용(§7-15) |
   175	| overflow | E2 선택지 목록 | ✅ covered | 활성 30개 상한, 세로로만 늘어남(가로 스크롤 없음). 보관 선택지는 개수 상한 없음 — 기본 접힌 「보관된 선택지 N개」 펼침 안에만 두어 폼 길이를 늘리지 않는다 |
   176	| long-text | E2 선택지 | ✅ covered | 40자 상한(`maxLength` + 서버), `overflow-wrap: anywhere` |
   177	| concurrency | E2 | ✅ covered | **버전 조건부 갱신**(O20): 폼이 연 행의 `version`을 숨은 값으로 보내고, 서버는 `WHERE id = ? AND version = ? AND archived_at IS NULL` 조건부 UPDATE 한 문장으로 쓰며 `version`을 1 올린다. 0행이면 거부 → 이유 자리 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 새로 불러오기」(보관됐으면 「… — 보관된 화면 항목입니다 · 목록으로」). 오래 열린 폼이 다른 사람의 선택지 보관·이름 변경을 되돌리지 못한다. 선택지 파생(O12)은 같은 버전의 저장값으로 계산해 같은 UPDATE에 쓴다 |
   178	| stale | E2 「새로 불러오기」 | ✅ covered | 3차 「새로 불러오기」 → `router.refresh()`로 최신 행을 받고 폼을 `key={id}:{version}`로 다시 마운트(React 상태 — 타입·활성/보관 선택지 — 까지 최신 행으로), 포커스는 이름 입력. 저장 안 한 입력은 버려진다(최신 행을 보고 다시 고친다). 누르기 전까지는 입력이 그대로 남는다(UX-04) |
   179	| name-reserved | E2 이름 | ✅ covered | 이름은 보관된 정의까지 포함해 거래처 안에서 유일(O22, DB unique `(entity, label)`). 보관 정의와 같으면 `Form.Error` 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」(링크는 `admin.archive` view가 있을 때만). 복원이 같은 이름의 활성 정의 둘을 만들 수 없다 |
   180	| loading | E3 | ✅ covered | `DeleteToArchive` 기존 `pending` |
   181	| error | E3 | ✅ covered | 「삭제하지 못했습니다 · 다시 시도」(기존) |
   182	| permission | E3 · 보관함 복원 | ✅ covered | 필드 정의 보관·복원은 `admin.archive` write **와** `admin.field-definitions` write를 둘 다 서버에서 검사(O21) — 공용 보관함 화면·액션으로 불러도 같다. 행 「삭제」도 둘 다 있을 때만 렌더. 보관함 목록은 `admin.field-definitions` view가 없으면 필드 정의 행을 빼서 누를 수 없는 「복원」을 보이지 않는다 |
   183	| a11y | E3 | 🧪 backstop | 공유 컴포넌트라 트리거에 대상 이름을 붙일 수 없다 — 이름 셀을 `<th scope="row">`로 두어 행 머리글이 「삭제」의 문맥이 되는지 DOM 감사가 확인. 확인 진입·취소·완료 뒤 포커스 이동·복귀 없음, 진행 중 「취소」 미잠금은 관리자 마스터 공통의 **기록된 임시 예외**(SYSTEM.md 671행, DECISIONS.md 2026-09-24 — X3·X4) |
   184	| empty | E4 | ✅ covered | 활성·노출 칸 0개면 구분선 포함 묶음 자체를 렌더하지 않는다 |
   185	| error | E4 | ✅ covered | 화면 3 「검증」 — 칸별 오류 배선은 **변경**(새 로직). 폼 전체 서버 오류도 **변경** — 상단 `FormAlert` 상자를 걷고 1차 옆 이유 자리(`#vendor-form-reason`)에 「{등록\|수정}할 수 없음 — {서버 원인} · 다시 시도」(화면 3 변경 5) |
   186	| partial | E4 기존 빈 필수값 | ✅ covered | 화면 3 「필수 판정」 표 — 수정 모드에서 저장값도 비고 제출값도 비면 「안 바꿈」, 막지 않는다 |
   187	| stale | E4 폼 열린 사이 정의 변경 | ✅ covered | 선택지가 보관됨 → 「보관된 선택지입니다 · 다른 선택지 고르기」. 칸이 보관·노출 해제됨 → 서버가 저장값 되살림(값 유실 없음). 필수로 바뀜 → 「필수 판정」 표대로 |
   188	| hidden | E4 보관·비노출 칸 | ✅ covered | 렌더하지 않는다, 서버가 저장값을 되살린다, 안내 문구 없음 |
   189	| archived value | E4 선택형 | ✅ covered | 화면 3 「보관된 선택지가 현재 값」 |
   190	| zero-one-many | E5 | ✅ covered | 0개 → 지금과 같은 화면, N개 → `INFO_ITEMS` 뒤에 이어 붙는다 |
   191	| overflow | E5 | ✅ covered | §7-13 가로 스크롤 + 계급 열 sticky 그대로 |
   192	| long-text | E5 머리글 | ✅ covered | 이름 20자 상한으로 해결 — `PermissionGrid.module.css:60`의 `white-space: nowrap`은 **바꾸지 않는다**(한 줄 머리글, 최대 폭 ≈ 20자) |
   193	| error | E5 | ✅ covered | 기존 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 원위치 + 토스트 「권한 저장 실패 · 다시 시도」(`PermissionGrid.tsx:190·203`) |
   194	| auto-register | E5 | ✅ covered | 필드 생성과 전 계급 노출 행 생성은 한 트랜잭션 — 둘 중 하나라도 실패하면 생성 전체 실패(「추가할 수 없음 — … · 다시 시도」) |
   195	| scale | E5 | 🧪 backstop | 커스텀 열 20개 × 이름 20자 시드로 DOM 감사가 가로 스크롤 컨테이너 밖 넘침 0, sticky 열 고정을 실측 |
   196	| populated / zero-one-many | E2 | 🧪 backstop | (probe) 수정 모드에 기존 값이 채워지고, 선택지 0·1·30개에서 폼 레이아웃이 깨지지 않는지 DOM 감사가 실측 |
   197	| empty / populated / partial / overflow / zero-one-many / long-text | E3 | 🧪 backstop | (probe) 행마다 한 개의 트리거뿐인 공유 컴포넌트 — 상태는 E1 행과 `DeleteToArchive` 기존 동작을 따른다. 긴 이름 행에서 트리거·확인 줄이 칸 밖으로 넘치지 않는지 DOM 감사가 실측 |
   198	| loading / populated / overflow / zero-one-many / long-text | E4 | 🧪 backstop | (probe) 서버 렌더라 로딩 상태 없음. 커스텀 칸 0·1·N개, 20자 이름 라벨, 40자 선택지에서 폼이 1열로 유지되고 넘침이 없는지 DOM 감사가 실측 |
   199	| empty / loading / populated / partial | E5 | 🧪 backstop | (probe) 커스텀 칸 0개면 기존 노출표와 동일, 보관된 칸 열은 없음, 셀 저장 중·실패는 기존 `PermissionGrid` 동작 — DOM 감사가 커스텀 열 셀 토글·실패 원위치를 실측 |
   200	
   201	---
   202	
   203	## Registry Safety
   204	
   205	해당 없음 — `Tool: none`. 서드파티 레지스트리·블록 없음.
   206	
   207	---
   208	
   209	## Screens
   210	
   211	### 화면 1 — 화면 항목 관리 (`/admin/field-definitions`, 신규)
   212	
   213	§6-1 관리자 마스터 틀(D-39: `?new=1`/`?editId=` 토글, 기본 진입엔 폼 없음). **초점(focal point) = 목록 표의 이름 열.** 1차 버튼은 폼 제출에만 있고 목록 화면의 행동은 전부 3차다.
   214	
   215	```
   216	PC(기본 = 보관 제외)
   217	│ 화면 항목                                                   │ ← PageHeader title="화면 항목" subtitle="거래처"
   218	│ 보관 포함                                     화면 항목 추가 │ ← 필터 줄(vendors와 같은 자리)
   219	╞═════════════════════════════════════════════════════════════╡
   220	│ 이름          타입    필수  정렬  선택지          상태  동작 │ ← 흰 머리글
   221	├─────────────────────────────────────────────────────────────┤
   222	│ 담당자 연락처  텍스트  필수   1   —               —   수정 삭제│
   223	│ 계약 유형     선택    —     2   기본, 특약, MOU  —   수정 삭제│
   224	│ 갱신일        날짜    —     3   —               —   수정 삭제│
   225	보관 포함일 때 추가되는 행:
   226	│ 옛 분류       텍스트  —     9   —            보관됨          │ ← 동작 칸 비움
   227	```
   228	
   229	- **관리자 전용**(ROADMAP 04.5 기준 1 「관리자 외 계급은 화면·액션에 닿지 못한다」): 새 메뉴 키 `admin.field-definitions`는 시드(`domain/seed/index.ts`)에서 **시스템 관리자 계급(`SYSADMIN_ROLE_ID`)에만** `insertPermissionIfAbsent`로 view·write를 준다(이미 있는 행은 덮지 않는다). 다른 계급에는 행을 만들지 않는다 — `can()`은 행이 없으면 거부. 통합 테스트가 비관리자 계급으로 페이지(404)와 **모든 액션**(생성·수정·보관, 노출표 커스텀 열 토글 포함)의 거부를 증명한다
   230	- 권한: `can(viewer, "admin.field-definitions", "view")` 없으면 404. `write` 없으면 「화면 항목 추가」·「수정」과 폼 자체를 렌더하지 않는다(`?new=1`·`?editId=`로 직접 와도 목록만). 「삭제」는 `admin.archive` write **와** `admin.field-definitions` write가 둘 다 있을 때만 렌더한다(vendors처럼 보관함 권한 하나로 판정하지 않는다 — 아래 「보관·복원 권한」). `?editId=`가 보관·없는 ID면 폼 없이 목록만(vendors `page.tsx:65`와 같은 조건). 서버 액션은 매번 권한을 다시 확인하고, 제출 중 권한이 회수되면 `Form.Actions` 이유 자리에 「{추가|수정}할 수 없음 — 권한 없음 · 다시 시도」
   231	- 대상 선택 UI 없음 — 부제 「거래처」 고정. **서버도 거래처만 받는다**: `FIELD_DEFINITION_TARGETS = ["vendor"] as const` 상수 하나. 생성 입력에 entity를 받지 않고 서버가 "vendor"를 넣는다(`.strict()`라 entity를 보내면 거부). 수정·삭제는 대상 정의의 entity가 상수 밖이면 거부. **보관함 경로도 같은 상수로 막는다**: 공유 보관함(`domain/archive/index.ts`)에 이 페이즈가 등록하는 필드 정의 항목은 조회·보관·복원 모두 `FIELD_DEFINITION_TARGETS` 안의 정의만 다룬다(`findById`·목록이 entity 밖 행을 「없음」으로 돌려 `restore()`(76~82행)가 `ArchivableRowNotFoundError`로 끝난다). 프로젝트·견적 줄 정의는 이 페이즈의 변경으로 보관함에 나열되거나 복원되지 않는다(ROADMAP 04.5 「Depends on」 Phase 4 동작 보존)
   232	- **보관·복원 권한**(O21, Codex #12): 필드 정의의 보관·복원은 `admin.archive` write와 `admin.field-definitions` write를 **둘 다** 서버에서 검사한다. 공용 `archive()`·`restore()`(`domain/archive/index.ts:55·76`)는 지금 보관함 권한만 보므로, 보관함 등록부의 필드 정의 항목에 추가 권한 조건(메뉴 `admin.field-definitions`, 동작 `write`)을 두고 공용 함수가 `assertCanWrite` 뒤에 그 항목의 조건을 검사한다 — 다른 여섯 항목은 조건이 없어 동작이 그대로다. 그래서 목록 행 「삭제」, 보관함 화면 「복원」, 보관함 서버 액션 직접 호출 어느 경로로 와도 같은 거부(`ForbiddenError`)가 난다. 보관함 목록은 `admin.field-definitions` view가 없는 사람에게 필드 정의 행을 보이지 않는다. **증명하는 테스트**: 통합 — (a) `admin.archive` view·write만 있고 `admin.field-definitions` 행이 없는 비관리자 계급으로 `archive(viewer, 필드 정의 항목, id)`·`restore(...)`를 직접 불러 거부, 행의 `archived_at` 불변, 행동 로그 없음; (b) 같은 계급으로 보관함 서버 액션(`app/(app)/admin/archive/actions.ts`)을 불러 거부; (c) 같은 계급의 보관함 목록에 필드 정의 행 0건; (d) `admin.field-definitions` write만 있고 `admin.archive` write가 없으면 거부; (e) 시스템 관리자는 보관·복원 성공. 단위 — 필드 정의 페이지가 두 권한 중 하나라도 없으면 「삭제」를 렌더하지 않음
   233	- 필터 줄 「화면 항목 추가」는 폼이 열려 있으면(`?new=1`·`?editId=`) 렌더하지 않는다 — 같은 행동이 두 곳에 보이지 않게
   234	- 열: 이름(`<th scope="row">`) · 타입 · 필수(「필수」/「—」 평문, StatusTag 아님) · 정렬 · 선택지(타입=선택일 때 활성 선택지 콤마 목록, 그 외 「—」) · 상태(「보관됨」/「—」) · 동작. 셀 줄바꿈은 body 상속 `overflow-wrap: anywhere`(덮어쓰지 않는다)
   235	- 반복 행동의 접근 이름: 「수정」 링크 `aria-label="{이름} 수정"`. 「삭제」는 공유 컴포넌트라 이름을 못 붙인다 — 행 머리글로 문맥 제공(E3 backstop)
   236	- 폰(§7-3 칸 접기): P1 = 이름(문자) · 정렬(숫자) · 동작(보관 행은 이 자리에 「보관됨」). P2 접힌 줄 = 타입 · 필수 · 선택지. 상태 열은 폰에서 P1 동작 자리로 합쳐진다
   237	- 순서 바꾸기: 정렬 순서 숫자 입력뿐(드래그 없음). 정수 0~999, 중복 허용. 같은 번호면 내부 키 순(안정적이지만 등록 순이 아님) — 순서를 정하려면 관리자가 서로 다른 번호를 준다. 저장하면 아래 목록이 새로고침되어 새 위치에 보인다. 폰에서 여러 개를 옮기려면 행마다 「수정」 → 숫자 바꾸기 → 「화면 항목 수정」 반복
   238	
   239	### 화면 2 — 화면 항목 등록·수정 폼 (같은 화면 `?new=1` / `?editId=`)
   240	
   241	`ui/form/Form`(`noValidate` 내장) + `className="single-column"`(720).
   242	
   243	```
   244	│ 이름       [____________________] (long 480, maxLength 20)             │
   245	│ 타입       [텍스트 ▾] (select 200)  ← 수정 모드: 「텍스트」 텍스트 + 3차 「새 화면 항목 추가」 │
   246	│ 필수       ☐ 필수                                                     │
   247	│ 정렬 순서   [___] (short 280)                                          │
   248	├────────────────────────────────────────────────── 1px --line + --s-6 ┤ ← 타입=선택일 때만
   249	│ 기본 · 삭제                                                           │ ← 저장된 활성 선택지
   250	│ 특약 · 삭제                                                           │
   251	│ ▸ 보관된 선택지 2개                                                    │ ← 기본 접힘(0개면 렌더 안 함)
   252	│   구형(레거시) [보관됨]                                                │ ← 펼쳤을 때, 버튼 없음
   253	│ 새 선택지 [__________] (short 280, maxLength 40)  선택지 추가           │
   254	│ [화면 항목 추가]  {막힘 이유} {다음 한 수}                        취소   │ ← Form.Actions(제출 중엔 「취소」도 비활성)
   255	```
   256	
   257	- **키**: 서버가 생성 시 자동 생성, 불변, 화면에 안 보임. 이름을 바꿔도 키는 그대로. 충돌하면 서버가 다시 생성한다
   258	- **타입**: 등록 모드 `Select`(텍스트/숫자/날짜/선택). 수정 모드는 텍스트 + 3차 「새 화면 항목 추가」(`?new=1`) — 타입을 바꾸는 방법이 새 칸 만들기뿐임을 행동으로 보인다. 설명 문구는 붙이지 않는다(§8 규칙 5)
   259	- **선택지 상태**: 타입 값·활성 선택지 목록은 React 상태. 「선택지 추가」·`Enter`(새 선택지 입력 안, 폼 제출 대신)는 앞뒤 공백을 잘라 활성 목록 끝에 더한다. 활성과 같으면 오류, **보관 선택지와 같으면 그 선택지를 활성으로 되돌린다**(중복 생성 없음). 선택지 행 「삭제」: 아직 저장 안 한 선택지는 목록에서 **빠지고**, 저장된 선택지는 보관 목록으로 **옮겨진다**(저장 전이라 「취소」하면 원래대로). 두 경우 모두 포커스는 새 선택지 입력으로 간다. 저장된 선택지 문자열은 읽기 전용(이름 변경 없음, Pitfall 2)
   260	- **보관 선택지 표시**: 네이티브 `<details>`(기본 접힘) + `<summary>` 「보관된 선택지 {N}개」(3차 모양), 펼치면 선택지마다 텍스트 + StatusTag 「보관됨」, 버튼 없음. N = 0이면 렌더하지 않는다. 보관 선택지 개수는 상한이 없고 상한(30)은 활성에만 건다
   261	- **저장 계약**(O11·O12): 기존 `field_definitions.options` JSONB 모양(`string[]`)은 **바꾸지 않는다** — 여기에는 활성 선택지만 둔다. 보관 선택지는 **새 열 `archived_options`**(JSONB `string[]`, 기본 `[]`)에 둔다. `listFieldDefinitions(viewer, entity)`의 호출 모양·결과는 Phase 4 호출부에 대해 그대로다. 클라이언트는 활성 선택지 배열만 보낸다. 서버가 `archived_options = (저장된 options ∪ 저장된 archived_options) − 제출된 options`로 파생한다 — 동시 저장이 겹쳐도 저장된 선택지는 어떤 경로로도 사라지지 않는다. 필드 전체 복원은 선택지 상태를 바꾸지 않는다(보관 선택지는 보관된 채로)
   262	- **동시 편집 — 버전 조건부 갱신**(O20, Codex #11): `field_definitions`에 **새 열 `version`**(`integer not null default 1`)을 이 페이즈 마이그레이션(`label`·`archived_at`·`archived_options`와 같은 파일)에 더한다. `updated_at` 동등 비교는 쓰지 않는다 — Postgres `timestamp`는 마이크로초, JS `Date`는 밀리초라 왕복하면 같은 행도 불일치한다. 흐름: ① 수정 폼은 연 행의 `version`을 숨은 입력으로 싣는다. ② 서버는 행을 읽어 제출된 `version`과 다르면 바로 거부하고, 같으면 그 저장값으로 `archived_options`를 파생(O12)한 뒤 `UPDATE … SET label, required, sort_order, options, archived_options, version = version + 1, updated_at = now() WHERE id = ? AND version = ?(제출값) AND archived_at IS NULL` **한 문장**으로 쓴다. ③ 0행이면 거부 — 행이 그 사이 보관됐으면 「수정할 수 없음 — 보관된 화면 항목입니다 · 목록으로」, 아니면 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 새로 불러오기」(둘 다 `Form.Actions` 이유 자리, 칸 값은 그대로 남는다). ④ 「새로 불러오기」(3차)는 `router.refresh()` 후 폼을 `key={id}:{version}`로 다시 마운트해 최신 행(이름·필수·정렬·활성/보관 선택지)을 채우고 포커스를 이름 입력으로 보낸다 — 저장 안 한 입력은 버린다. 「목록으로」(3차)는 `router.replace`로 폼을 닫는다. **보관·복원**은 칸 값을 덮어쓰지 않으므로(보관 시각만 바꾼다, 멱등) 버전을 받지 않지만, 필드 정의 항목의 보관·복원은 같은 문장에서 `version`을 1 올린다 — 그 전에 열린 수정 폼이 보관·복원 뒤 상태를 덮지 못한다. 공용 `DeleteToArchive`·보관함 화면은 바꾸지 않는다. **테스트**(통합): 같은 `version`으로 두 번 저장 → 두 번째 거부·행 불변(먼저 저장이 보관한 선택지가 보관된 채); 폼을 연 뒤 보관 → 수정 거부(보관 문구); 보관·복원 뒤 옛 `version`으로 저장 거부; 순차 저장은 통과
   263	- **제출 중**: 1차 `pending`, 입력·선택지 버튼은 `<fieldset disabled>`, 「취소」도 비활성(SYSTEM.md 672·1000행). 응답 뒤 결과 줄의 「닫기」 또는 이유 자리 다음 한 수로 이어진다
   264	- **SUCCESS**(§7-15 「화면이 그대로인 폼」): 1차 버튼 자리가 결과 텍스트로 바뀌고 입력은 읽기 전용. 결과 줄은 `role="status"`, `tabIndex={-1}`로 포커스를 받는다. 아래 목록은 서버 재검증으로 새로고침된다. 등록: 「화면 항목 추가 · {이름} 추가됨」 + 「정보 노출표 보기」(`/admin/visibility` — 새 칸이 전 계급 보임으로 등록됐으므로) + 「하나 더 추가」 + 「닫기」. 「하나 더 추가」는 폼을 `key`로 다시 마운트해 React 상태(타입 「텍스트」, 선택지 빈 배열, 정렬 기본값 `min(활성 최대값 + 1, 999)`)까지 초기화하고 포커스를 이름 입력으로 보낸다. 수정: 「화면 항목 수정 · {이름} 수정됨」 + 「닫기」(목록으로, `router.replace`)
   265	- 칸 목록·검증 문구·막힘은 Copywriting 표 그대로. **이름은 보관된 정의까지 포함해 거래처 안에서 유일하다**(O22, Codex 신규 MAJOR): 앞뒤 공백을 자른 `label`에 DB unique `(entity, label)`를 건다(보관 여부와 무관하게 이름을 예약 — 부분 인덱스 아님). 마이그레이션은 기존 행의 `label`을 `key`로 채운다(`(entity, key)`가 이미 유일이라 충돌 없음). 등록·이름 변경이 활성 정의와 같으면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」, 보관 정의와 같으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」(3차 링크 `/admin/archive`, `admin.archive` view가 있을 때만 — 없으면 「· 이름 바꾸기」 평문). 서버는 먼저 조회로 두 경우를 가르고, 조회와 쓰기 사이 경합은 unique 위반을 같은 칸 오류로 바꿔 돌려준다. 그래서 공용 `restore()`(이름 검사 없음)가 같은 이름의 활성 정의 둘을 만들 수 없다. **테스트**(통합): 「계약 유형」 보관 → 같은 이름 등록 거부(보관 문구) → 다른 정의를 그 이름으로 변경 거부 → 옛 정의 복원 성공, 활성 「계약 유형」 1건
   266	
   267	### 화면 3 — 거래처 폼의 커스텀 칸 (`/admin/vendors`, 기존 화면 **변경**)
   268	
   269	```
   270	│ 이름 · 사업자 번호 · 기본 증빙 종류 · 계좌 은행 · 예금주 · 계좌번호       │ ← 기존(변경 없음)
   271	├──────────────────────────────────────────── 1px --line + --s-6(신설) ┤
   272	│ 담당자 연락처  [________________]                                     │
   273	│               필수 칸이 비어 있습니다 · 값 입력                         │ ← 칸 오류(신설)
   274	│ 계약 유형      [구형(레거시) (보관됨) ▾]                                 │
   275	│ [거래처 수정]  수정할 수 없음 — 담당자 연락처 1칸 · 담당자 연락처 고치기  취소 │ ← 이유 자리(신설)
   276	```
   277	
   278	**변경 목록**(`vendor-form.tsx`):
   279	1. `<form>`에 `noValidate`를 더하고 커스텀 칸의 `required={def.required}`(217·231행)를 뺀다 — 브라우저가 `handleSubmit` 전에 제출을 막지 않게. `ui/form/Form`으로 옮기지 않는 더 작은 경로를 택했다. 기본 칸 「이름」의 `required`는 이 페이즈 밖이라 두지만 `noValidate`가 말풍선을 끈다
   280	2. 라벨을 `def.key` → `def.label`
   281	3. 기본 칸과 커스텀 칸 사이 `1px --line` + `--s-6` 구분선(텍스트 머리 없음)
   282	4. **칸별 오류 배선(새 로직)**: 서버가 커스텀 키별 오류를 돌려주고, 폼이 키로 찾아 텍스트·숫자·날짜는 `TextField error`로, 네이티브 select는 로컬 `<p id="cf_{key}-error">`(`--fs-sm --danger`) + `aria-invalid` + `aria-describedby`로 보인다(`ui/select`와 같은 배선)
   283	5. **이유 자리(신설)**: 1차 버튼 옆 `<span id="vendor-form-reason">`(`--fs-sm --danger`) + 3차 「{첫 칸 이름} 고치기」(그 칸으로 포커스). 1차 `aria-describedby`가 이 span을 가리킨다(`role="alert"` 아님). **폼 전체 서버 오류도 이 자리로 옮긴다**(Codex #7, SYSTEM.md 993행 「폼 상단 오류 상자를 두지 않는다」): 195행 `{result.serverError ? <FormAlert>…</FormAlert> : null}`를 지우고(`FormAlert` import도 지운다 — 이 파일에서 다른 사용 없음), 같은 span에 「{등록\|수정}할 수 없음 — {serverError 원문} · 다시 시도」를 쓴다(원문에 「 · 」가 이미 있으면 「 · 다시 시도」를 붙이지 않는다 — Copywriting 표). 서버 오류 줄에는 3차 버튼이 없다(다음 행동은 1차를 다시 누르는 것). 한 응답에 칸 오류와 서버 오류가 함께 오면 칸 오류 요약을 보인다(칸을 고치는 것이 먼저). 위치는 1차 「거래처 등록/수정」 바로 오른쪽, 「취소」 링크 왼쪽 — 칸 오류 요약과 같은 한 자리, 한 번에 한 줄. `duplicateNotice`(193행, 같은 이름 거래처 안내)는 오류가 아니라 이 페이즈에서 바꾸지 않는다. **테스트**: 단위(RTL) — `serverError`가 오면 `#vendor-form-reason`에 문구가 나오고 1차 `aria-describedby`가 그 id를 가리키며, `FormAlert`(폼 상단 상자)가 DOM에 없다
   284	6. 값 보존: 입력은 비제어라 오류 뒤에도 남는다(성공 시 reset만 기존대로)
   285	
   286	**필수 판정**(ROADMAP 기준 2 「고칠 때」 = **그 칸을 고칠 때**, 서버 `validatedCustomFields`가 판정 — RESEARCH Pitfall 3 (a)):
   287	
   288	| 모드 | 저장값 | 제출값 | 결과 |
   289	|------|--------|--------|------|
   290	| 등록 | — | 빈칸 | 막힘 — 칸 오류 + 이유 |
   291	| 수정 | 빈칸(칸이 나중에 생겼거나 필수로 바뀜) | 빈칸 | **안 바꿈 — 막지 않는다**(다른 칸 수정 저장 가능) |
   292	| 수정 | 값 있음 | 빈칸(사용자가 지움) | 막힘 — 칸 오류 + 이유 |
   293	| 수정 | 무엇이든 | 값 있음 | 타입 검증만 |
   294	
   295	제출 전 클라이언트 사전 비활성은 두지 않는다 — 판정이 저장값에 달려 있어 관문은 서버 하나다(§7-15).
   296	
   297	**보관된 선택지가 현재 값**: 저장값이 활성 선택지에 없으면 그 값을 `<option value={값}>{값} (보관됨)</option>`로 **활성화된 채** 목록 끝에 한 개 더한다(disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없으므로 쓰지 않는다). 그 거래처의 폼에만 나타나고 새 거래처·다른 거래처에는 없다. 서버 규칙: 거래처 경로만 기존 검증기(`buildCustomFieldsSchema`, `string[]` 선택지)에 `options ∪ {그 행의 저장값 — 저장값이 archived_options에 있을 때만}`을 넘긴다(어댑터는 거래처 경로 안, 검증기·프로젝트·견적 줄 경로는 바꾸지 않는다). 즉 값이 활성 선택지이거나 **저장값과 같으면**(안 바꿈) 통과, 그 밖의 보관 선택지(폼이 열린 사이 관리자가 보관한 경우 포함)면 「보관된 선택지입니다 · 다른 선택지 고르기」. 「선택 없음」을 고르면 지움(필수면 위 표대로 막힘).
   298	
   299	- 보관된 칸·계급별로 끈 칸: 서버가 `fieldDefs`에서 빼서 렌더하지 않고, 저장 시 기존 값을 서버가 되살린다. 안내 문구 없음
   300	- 폰: §6-3 폼 규칙(라벨 위, 전폭)
   301	- **E2E 필수 범위**: 필수 칸이 저장값 빈 상태에서 다른 칸만 고친 수정 저장 — 텍스트·숫자·날짜·선택 **네 타입 모두**. 등록 시 필수 빈칸 막힘과 문구. 채워진 필수 칸 지우기 막힘. 보관 선택지 현재 값 그대로 저장 시 값 유지. 보관 선택지 새 지정 거부와 문구
   302	
   303	### 화면 4 — 정보 노출표 동적 열 (`/admin/visibility`, 기존 화면 확장)
   304	
   305	`PermissionGridClient`와 `PermissionGrid` CSS는 바꾸지 않는다. 서버가 `columns` 끝에 활성 거래처 `field_definitions` 열을 정렬 순서대로 이어 붙인다(머리글 = `label`, 최대 20자 한 줄, `--g-100` 머리글).
   306	
   307	```
   308	│         │ 손익 숫자 │ 팀 비용 │ … │ 담당자 연락처 │ 갱신일 │
   309	│ 대표     │    ☑     │   ☑    │   │      ☑       │   ☑   │
   310	```
   311	
   312	- 셀 = 즉시 저장, 실패 시 원위치 + 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」(기존 `PermissionGrid.tsx:190·203`)
   313	- 새 칸은 생성과 같은 트랜잭션에서 전 계급 보임으로 등록된다(D10-13)
   314	- 칸이 보관되면 다음 조회부터 열이 빠지고, 계급별 값은 남아 복원 시 돌아온다
   315	- 폰: §7-13 기존 규칙 그대로
   316	- 다섯 상태: §7-13 그대로
   317	
   318	### 관리 인덱스
   319	
   320	「화면 항목」은 §6-10 관리 인덱스 **마스터 그룹, 「코드표」 다음**에만 더한다. 「더보기」 시트·PC 사용자 메뉴는 「관리」 한 줄 그대로(SYSTEM.md 640행). `role-menu.ts`에 `{ key: "admin.field-definitions", label: "화면 항목", href: "/admin/field-definitions", group: ADMIN_GROUP_MASTER }`를 더하고, **같은 계획에서 SYSTEM.md 정본 표(636행 부근 마스터 행)와 그 순서 단위 테스트를 함께 고친다**(DESIGN.md §4 절차 — 정본은 SYSTEM.md이지 이 문서가 아니다).
   321	
   322	### 기존 공유 컴포넌트 — 기록된 시스템 예외
   323	
   324	이 페이즈는 `DeleteToArchive`를 **바꾸지 않고** 재사용한다. 아래 X1~X4는 「범위 밖」 선언이 아니라 **관리자 마스터 화면(코드표·사람·계급·조직·법인카드·거래처·화면 항목) 전부에 같게 걸리는 기록된 임시 예외**다 — `docs/design/DECISIONS.md` 2026-09-24 「§7-1 위험 행동 확인: 관리자 마스터 화면의 인라인 보관 확인(`DeleteToArchive`)을 기록된 임시 예외로」, `docs/design/SYSTEM.md` 671행(§7-1 위험 행동 규칙 아래 예외 줄). 후속 작업이 모달·시트 확인 컴포넌트를 만들어 이 화면들을 한꺼번에 옮기면 예외가 사라진다(화면 하나만 먼저 바꾸지 않는다). X5는 SYSTEM.md 명문 규칙이 아니라 같은 후속 작업에서 함께 다룬다(O4·O24).
   325	
   326	| # | 대상 | 현재 동작 | SYSTEM.md 규칙 | 근거 |
   327	|---|------|-----------|----------------|------|
   328	| X1 | `DeleteToArchive`(`app/(app)/admin/archive/delete-to-archive.tsx`) | 확인이 모달·시트가 아니라 행 안 인라인 문구 + 버튼 | 670행 「위험 행동은 **확인 모달**로 구분」, 839·840행(PC 모달·폰 시트) | 기록된 예외 ① |
   329	| X2 | 같은 컴포넌트 50행 | 확인 줄의 1차 「삭제」(`variant="primary"`)가 **목록 행 안**에 뜬다. 1차 버튼 자체는 839행(위험 확인 모달의 1차 행동)과 맞다 — 어긋나는 것은 표면: 행 안 행동은 3차(661~663행 표), 수정 폼이 열린 채 확인하면 한 화면에 1차가 둘(661행 「1개」) | 661~663행 1차 개수·3차 자리 | 기록된 예외 ①의 결과(모달·시트로 옮기면 함께 사라짐) — Color accent 예약 목록 참고 |
   330	| X3 | 같은 컴포넌트 53행 | 확인 진행 중 「취소」가 잠기지 않는다 | 672행 「같은 폼의 다른 버튼도 비활성」 | 기록된 예외 ② |
   331	| X4 | 같은 컴포넌트 | 확인 진입 때 포커스가 확인 줄로 가지 않고, 취소·완료 뒤 트리거(또는 다음 행)로 돌아오지 않는다 | 844행 「열릴 때 첫 행동 요소에 포커스 … 닫힐 때 원래 요소로 복귀」 | 기록된 예외 ③ |
   332	| X5 | 같은 컴포넌트 | 행마다 반복되는 「삭제」에 대상 이름이 든 접근 이름이 없다(행 머리글 `<th scope="row">`로만 문맥 — E3 backstop) | SYSTEM.md 명문 규칙은 아님(화면 1 「수정」 `aria-label`과 불일치) | DECISIONS.md 같은 항목의 「함께 추적하는 것」 |
   333	
   334	X6(거래처 폼 상단 `FormAlert`)은 이 개정에서 **해소** — 화면 3 변경 5가 이유 자리로 옮긴다.
   335	
   336	---
   337	
   338	## Assumptions
   339	
   340	비대화형 세션이라 사용자에게 묻지 않았다. 출처: **R** = 연구자, **O** = 오케스트레이터가 정함.
   341	
   342	| # | 결정 | 출처 | 근거 |
   343	|---|------|------|------|
   344	| R1 | 제목·메뉴 = 「화면 항목」, 경로 `/admin/field-definitions`, 키 `admin.field-definitions` | R | RESEARCH A4·Pattern 1 |
   345	| R2 | 대상 선택 UI 없음(부제 고정) | R | 대상 하나뿐, YAGNI |
   346	| R3 | 목록 필터 기본 = 보관 제외, 보관 행 인라인 복원 없음(`/admin/archive`에서) | R | vendors 선례, checker FLAG |
   347	| R4 | 「필수」는 평문(StatusTag 어휘 확장 안 함) | R | §7-5 닫힌 어휘 |
   348	| R5 | 선택지 이름 변경 UI 없음 | R | Pitfall 2 — 저장값 문자열 일치 |
   349	| R6 | 이름 20자·선택지 40자·활성 선택지 30개·정렬 0~999 상한 | R(O9 적용) | 노출표 CSS를 바꾸지 않는 가장 작은 경로 |
   350	| R7 | 동률 정렬 = 기존 `orderBy(sortOrder, key)` 그대로(같은 번호 → 내부 키 순, 안정적이지만 등록 순 아님). 관리자는 서로 다른 번호로 동률을 푼다. `listFieldDefinitions`는 바꾸지 않는다 | O | ROADMAP 04.5 「Depends on」 — Phase 4 호출부(domain/projects·domain/quotes)에 대한 호출 모양·결과 불변 |
   351	| R8 | 거래처 폼은 `ui/form`으로 옮기지 않고 `noValidate`만 더한다 | R | checker fix_hint보다 작은 경로, 같은 속성 달성 |
   352	| O1 | 「고칠 때」 = 그 칸을 고칠 때(필수 판정 표) | O | ROADMAP 기준 2 |
   353	| O2 | 보관 선택지 현재 값: 「(보관됨)」 표시, 안 바꾸면 저장값 유지, 새 지정 거부. **메커니즘만 바꿈**: 「제출하지 않음」 대신 활성 옵션으로 제출하고 서버가 「저장값과 같음」으로 판정 — disabled 옵션은 FormData에서 빠져 선택 칸 지움(키 생략)과 구분되지 않기 때문 | O(메커니즘 R) | HTML 명세 |
   354	| O3 | 미저장 선택지는 빠지고 저장된 선택지는 보관, 같은 문자열 재추가는 복원. 필드 복원이 선택지를 복원한다고 주장하지 않는다 | O | Codex #3 |
   355	| O4 | `DeleteToArchive` 변경 없이 재사용(라벨 「삭제」, 인라인 확인). **개정 3**: 「범위 밖」이 아니라 관리자 마스터 화면 공통의 기록된 임시 예외(X1~X4, DECISIONS.md 2026-09-24 · SYSTEM.md 671행) — O24 | O(사용자 결정 카드 대기) | D-25(모달 컴포넌트 부재), Codex #4·#5 |
   356	| O5 | ~~필드 정의 동시 수정은 이름·필수·정렬 순서에 한해 마지막 저장이 이긴다~~ — **개정 3에서 폐기, O20으로 대체**(오래 열린 폼이 다른 사람의 선택지 보관을 되돌리는 문제) | O | Codex #11(3차) |
   357	| O6 | 「화면 항목」은 관리 인덱스에만, SYSTEM.md 정본 표·순서 테스트를 같은 계획에서 갱신 | O | SYSTEM.md 640행 |
   358	| O7 | 서버 허용 대상 상수 `["vendor"]` 하나, 프로젝트·견적 줄 요청은 서버가 거부 | O | Codex #13 |
   359	| O8 | 등록 성공 = 버튼 자리 결과 + 입력 읽기 전용 + 「정보 노출표 보기」, 「하나 더 추가」는 key 재마운트로 React 상태까지 초기화 | O | SYSTEM.md 1003행 |
   360	| O9 | 노출표 긴 머리글은 CSS 변경 대신 이름 20자 상한 | O | 더 단순한 쪽 |
   361	| O10 | 정렬은 숫자 입력 유지, 드래그 없음, 규칙은 화면 1 | O | Codex #10 |
   362	| O11 | `field_definitions.options`(JSONB `string[]`)는 모양 불변, 활성 선택지만. 보관 선택지는 새 열 `archived_options`(JSONB `string[]`, 기본 `[]`). 거래처 경로만 `options ∪ {보관된 저장값}`을 기존 검증기에 넘기고 프로젝트·견적 줄 검증은 그대로. `{ active, archived }` 저장 모양은 폐기 | O | ROADMAP 04.5 「Depends on」(`listFieldDefinitions` 결과 불변), Codex 신규 MAJOR(옵션 형식) |
   363	| O12 | 서버가 `archived_options = (저장된 options ∪ 저장된 archived_options) − 제출된 options`로 파생 — 동시 저장에도 저장된 선택지 유실 없음. 개정 3: 파생은 O20의 버전 확인을 통과한 저장값으로 계산해 같은 조건부 UPDATE에 쓴다 | O | Codex #11 |
   364	| O13 | 보관함의 필드 정의 조회·보관·복원도 `FIELD_DEFINITION_TARGETS`(vendor)로 한정 — 프로젝트·견적 줄 정의는 이 페이즈 변경으로 나열·복원되지 않는다 | O | Codex 신규 MAJOR(복원 경로), `domain/archive/index.ts:76-82` |
   365	| O14 | `admin.field-definitions`는 시드에서 시스템 관리자 계급에만 insert-if-absent, 다른 계급은 행 없음. 비관리자의 페이지·전 액션 거부를 통합 테스트로 증명 | O | Codex #12, ROADMAP 04.5 기준 1 |
   366	| O15 | 새 폼 제출 중 「취소」도 비활성(제출 중 취소 허용 규칙 폐기) | O | SYSTEM.md 672·1000행, Codex 신규 MAJOR |
   367	| O16 | 정렬 순서 기본값 = `min(활성 최대값 + 1, 999)`, 활성 없으면 1 | O | Codex 신규 MAJOR(0~999 범위) |
   368	| O17 | 긴 문자열: 목록 셀은 body 상속 `overflow-wrap: anywhere`(새 CSS·토큰 없음). 보관 선택지는 「보관된 선택지 N개」 펼침 뒤로 접고 개수 무제한, 상한 30은 활성에만. 공유 컴포넌트 표는 개정 3에서 「기록된 시스템 예외」 X1~X5로 바뀌고 X6은 해소(O23·O24) | O | Codex #4·5·7·15, checker 1-a·3 |
   369	| O18 | 노출표 실패 문구 = 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」 | O | `PermissionGrid.tsx:190·203`, Codex #16, checker 1-b |
   370	| O19 | 열람 전용 EMPTY는 다음 행동 없는 한 줄, 폼이 열리면 필터 줄 「화면 항목 추가」 숨김, 간격 예외 6/10·12·20px를 SYSTEM.md 지정 예외로 표기 | O | checker 1-c·1-d·5 |
   371	| O20 | 필드 정의 수정은 새 열 `version`(`integer not null default 1`, 이 페이즈 마이그레이션)으로 조건부 UPDATE 한 문장. 충돌은 이유 자리 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 새로 불러오기」(보관됐으면 「… — 보관된 화면 항목입니다 · 목록으로」), 「새로 불러오기」는 refresh + `key={id}:{version}` 재마운트. 필드 정의의 보관·복원은 `version`을 올려 그 전에 열린 폼을 무효로 만든다. `updated_at` 비교는 정밀도 차이(µs vs ms)로 버림 | O(열 선택 R) | Codex #11(3차) |
   372	| O21 | 필드 정의 보관·복원은 `admin.archive` write와 `admin.field-definitions` write를 둘 다 서버에서 검사(보관함 등록부 항목별 추가 권한 조건, 다른 항목은 그대로). 행 「삭제」도 둘 다 있을 때만 렌더, 보관함 목록은 `admin.field-definitions` view 없으면 필드 정의 행을 뺀다. 통합 테스트 (a)~(e)(화면 1 「보관·복원 권한」) | O | Codex #12(3차), `domain/archive/index.ts:38-43·55·76` |
   373	| O22 | 이름은 보관 정의까지 예약 — DB unique `(entity, label)`, 기존 행 `label`은 `key`로 채움. 보관 정의와 같은 이름은 `Form.Error` 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」(링크는 `admin.archive` view 있을 때만). 칸 오류로 둔 이유: 활성 중복 문구와 같은 자리·같은 모양(오케스트레이터 예시는 `Form.Actions` 형식이었으나 이름 칸 오류가 원인에 더 가깝다) | O(자리 R) | Codex 3차 신규 MAJOR, `domain/archive/index.ts:79-82` |
   374	| O23 | 거래처 폼 `serverError`를 상단 `FormAlert`에서 1차 옆 이유 자리(`#vendor-form-reason`)로 옮김, `FormAlert` import 제거. 칸 오류 요약이 우선, 한 번에 한 줄 | O | Codex #7(3차), SYSTEM.md 993행 |
   375	| O24 | `DeleteToArchive` 인라인 확인·진행 중 취소 미잠금·포커스 미복귀를 관리자 마스터 공통 임시 예외로 DECISIONS.md·SYSTEM.md 671행에 기록. 끝나는 조건 = 모달·시트 확인 컴포넌트 + 관리자 마스터 전부 일괄 전환(후속 작업 항목, 아직 로드맵 없음 — Phase 7 성공 기준 5가 가장 가까운 자리) | O(사용자 결정 카드 대기) | Codex #4·#5(3차), CLAUDE.md 「화면 하나만 예외 금지」 |
   376	| O25 | X2 근거 정정: 1차 「삭제」 버튼 자체는 SYSTEM.md 839행과 맞고, 어긋나는 것은 확인 표면(행 안 1차 · 한 화면 1차 둘). Color accent 예약 목록의 설명도 같이 맞춤 | O | Codex 3차 MINOR |
   377	
   378	---
   379	
   380	## Checker Sign-Off
   381	
   382	- [x] Dimension 1 Copywriting: PASS
   383	- [x] Dimension 2 Visuals: PASS
   384	- [x] Dimension 3 Color: PASS
   385	- [x] Dimension 4 Typography: PASS
   386	- [x] Dimension 5 Spacing: PASS
   387	- [x] Dimension 6 Registry Safety: PASS
   388	- [x] Dimension 7 Inventory Provenance: PASS
   389	
   390	**Approval:** approved 2026-09-24 — 개정 3 기준 UI checker VERIFIED + Codex 4차 「막는 문제 없음」(비차단 권고 checker R1~R6·Codex 4차 MINOR는 계획에서 반영)

exec
/bin/bash -lc "nl -ba CLAUDE.md | sed -n '115,152p'; rg -n '"'^##|''^###'"' docs/design/SYSTEM.md; nl -ba docs/design/tokens.css | head -100" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   115	- 모든 화면의 기준은 `docs/design/SYSTEM.md`. 없으면 화면을 만들지 않고 `docs/DESIGN.md` §1부터 시작
   116	- 새 화면·컴포넌트는 `docs/DESIGN.md` §4 절차대로. 새 색·서체·radius 생성 금지, 토큰은 `docs/design/tokens.css`에서만
   117	- 시스템을 벗어나야 하면 `docs/design/DECISIONS.md`에 이유 기록 후 SYSTEM.md를 고친다. 화면 하나만 예외 금지
   118	- UI 완료 판정은 `/design-review`(SYSTEM.md 일관성) → `/qa` 통과 후
   119	- **화면 검증 순서: 싼 게이트(lint·typecheck·build) → 독립 DOM 감사 → 수정 → 전체 게이트 한 번.** 감사는 실행자가 아닌 별도 에이전트가 `CI=true`로 DOM을 실측 판정한다(스크린샷 육안 금지). 전체 게이트를 두 번 돌리지 않기 위한 순서다
   120	
   121	## 7. 화면 사용성 원칙
   122	- 목표: 사람이 읽고 고민하지 않아도 화면이 다음 행동으로 이끌어, ERP를 최대한 쉽게 쓰게 한다.
   123	- 안내 문구는 최소로 한다. 설명문·도움말·자리 표시 설명 대신 알아보기 쉬운 이름, 아이콘, 배치로 뜻이 통하게 한다. 문구는 오류, 되돌릴 수 없는 작업, 잠김 같은 상태에만 한 줄로 쓰고, 무엇을 하면 되는지를 말한다. 빈 화면에는 설명 대신 첫 행동 버튼을 둔다.
   124	- 화면에서 사용자가 할 결정은 최소로 한다. 알 수 있는 값은 기본값으로 미리 채운다(오늘 날짜, 내 팀, 최근·이전 입력값). 시스템이 계산·판단할 수 있는 것(합계, 세금, 상태 전환 조건)은 묻지 않는다. 할 수 없는 선택지는 보이지 않게 하거나 비활성화해 틀린 선택이 불가능하게 한다. "정말 하시겠어요?" 확인 창 대신 되돌리기를 주고, 확인은 되돌릴 수 없는 일에만 쓴다.
   125	- 행동은 동작·컴포넌트·디자인으로 유도한다. 화면마다 다음에 할 일을 주 버튼 하나로 눈에 띄게 한다. 순서가 있는 일은 단계로 보여 주고, 필요한 값이 채워져야 다음 버튼이 켜진다. 입력 칸이 형식을 잡아 준다(숫자 쉼표 자동, 날짜 선택, 검색해서 고르기). 키보드만으로 엑셀처럼 입력·이동·저장할 수 있게 한다. 상태는 색·배지로 보여 주고, 위험한 동작은 떨어뜨려 둔다.
   126	- 적용: 화면 설계(UI-SPEC)·플랜 작성·화면 설계 검토(Codex 포함)·/plan-design-review·/design-review는 "문구 없이 이해되는가, 사용자가 하지 않아도 될 결정이 남았는가"를 점검한다. 사용자가 이미 정한 결정은 바꾸지 않는다.
   127	
   128	## 8. 캐시·컨텍스트·모델 선택
   129	- 조사·탐색·긴 로그는 서브에이전트에 위임, 결론만 받는다
   130	- **모델 선택**: 점검·계획·기획·판단·검토는 Opus 5로 한다. Fable 5는 정말 필요한 순간에만 쓴다 — 아키텍처·보안처럼 되돌리기 어려운 결정, Opus 5가 두 번 이상 틀리거나 판단이 갈리는 문제, 사용자가 명시로 요청한 때. 나머지(조사·탐색·코드 실행·정리·이관·문서 생성 등)는 작업에 알맞은 지능을 골라, 오류가 나지 않는 조건으로 필요한 지능만큼만 쓴다(Sonnet → Haiku 순으로 낮춰 본다). 서브에이전트를 띄울 때는 `model`을 반드시 명시하고, GSD `model_profile`은 `adaptive`로 둔다
   131	- 파일은 Grep으로 위치 찾고 필요한 범위만 Read. 500줄 이상은 range 필수
   132	- 테스트·빌드 출력은 요약만. 실패 시 실패 부분만 인용
   133	- **토큰을 아낀다.** 이미 읽은 파일·이미 받은 도구 결과를 다시 조회하지 않는다. 나머지 수단은 위 세 줄(위임·범위 Read·출력 요약)이다
   134	- 페이즈 끝나면 `/compact` 대신 새 세션. 재개는 `/gsd-progress`
   135	- 반복 규칙(포맷·린트·테스트)은 문장이 아니라 hooks(`.claude/settings.json`)로
   136	- 응답은 짧게. 결과와 다음 행동만
   137	
   138	## 9. @import
   139	기본은 비움. 추가 조건: 월 1회 이하 변경 + 100줄 이하.
   140	
   141	## 10. Next.js 블록
   142	> 아래 블록은 `next dev`가 자동으로 쓰고 다시 추가한다(파일 하단에 원문 영어로 유지). 지워도 `next dev`가 되살린다.
   143	
   144	<!-- BEGIN:nextjs-agent-rules -->
   145	
   146	# This is NOT the Next.js you know
   147	
   148	This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.
   149	
   150	This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
   151	
   152	<!-- END:nextjs-agent-rules -->
10:## 0. 방향
37:## 1. 색
41:### 1-1. 그린 명도 단계 (`--g-*`)
55:### 1-2. 의미 토큰 (컴포넌트는 이것만 쓴다)
81:### 1-3. 색 사용 규칙
92:## 2. 타입
94:### 2-1. 서체 확정
134:### 2-2. 스케일 6단계 (px)
149:### 2-3. 행간 · 자간 · 줄 길이
157:### 2-4. 숫자 · 금액 · 날짜 형식 (앱 전체 고정)
179:## 3. 간격
197:## 4. 형태
199:### 4-1. radius 위계표
209:### 4-2. 테두리 (선 3단계 + UI 경계 1)
220:### 4-3. 그림자 · 깊이
227:### 4-4. 브라우저 기본 표면 (기본값으로 두지 않는다)
243:## 5. 모션
247:### 허용 목록
258:### 금지 목록
261:### `prefers-reduced-motion: reduce`
266:## 6. 레이아웃 템플릿
270:### 6-0. 공통 셸
315:### 6-1. 목록 화면 = 원장 (프로젝트 목록 · 지출결의 목록 · 법인카드 목록 · 결재함)
357:### 6-2. 상세 화면 (프로젝트 상세 = 견적 원장)
380:### 6-3. 폼 화면 (지출결의 한 건 = 화면 하나)
414:### 6-4. 손익 대시보드 (대표·경영관리 첫 화면 = 전사 · 팀장 첫 화면 = 자기 팀)
456:### 6-5. 외부 수령자 화면 (기타소득 지급 확인 = 경품 수령 확인, 폰 전용, 로그인 없음)
491:### 6-6. 인쇄 템플릿 (지출결의서 · 기타소득 확인증)
533:### 6-7. 로그인 화면 (셸 없음 — 상단 바·하단 탭·「더보기」 시트가 전혀 없는 유일한 화면)
566:### 6-8. 시스템 상태 화면 (권한표의 시스템 상태 보기 권한이 있는 계급만, D-17 — 권한이 없으면 404)
589:### 6-9. 오류 페이지 (404 · 권한 없음 · 세션 만료)
610:### 6-10. 「관리」 인덱스 화면 (관리자 화면 10개의 단일 진입점)
653:## 7. 컴포넌트 규칙
657:### 7-1. 버튼 위계
675:### 7-2. 입력 · 오류 표시
709:### 7-3. 표 (이 시스템의 중심 컴포넌트)
784:### 7-4. 「내 차례」 목록
792:### 7-5. 상태 태그
800:### 7-6. 토스트
806:### 7-7. 다섯 상태 (LOADING · EMPTY · ERROR · SUCCESS · PARTIAL)
835:### 7-8. 모달 · 시트
847:### 7-9. 단축키 힌트 줄 (C에서 흡수)
854:### 7-10. 첨부 영역
861:### 7-11. 배너
875:### 7-12. 알림함 · 배지 (계약만 — 구현은 Phase 7)
888:### 7-13. 체크박스 매트릭스 (권한표 · 정보 노출표)
937:### 7-14. 이력 목록 (이력형 설정 값 · 발령일 이력)
973:### 7-15. 폼 (`ui/form` · `ui/select`) — 신설 (Phase 4)
1008:## 8. 카피 규칙
1022:## 9. 아이콘
1032:## 10. 접근성 계약
1044:## 11. 검증 — 모든 화면이 통과해야 하는 것
     1	/* tokens.css — PLANT8 ERP 디자인 토큰
     2	 * 출처: docs/design/SYSTEM.md (이 파일과 어긋나면 SYSTEM.md가 맞다)
     3	 * 규칙: 컴포넌트는 이 변수만 참조한다. 새 값이 필요하면 DECISIONS.md → SYSTEM.md → 여기 순서로 추가한다.
     4	 * 브레이크포인트는 CSS 변수로 쓸 수 없어 주석으로 고정한다:
     5	 *   폰  <700px  · PC ≥1024px · 컨테이너 최대 1280px
     6	 */
     7	
     8	:root {
     9	  /* ---- 1. 색 — 그린 명도 단계 (브랜드 #005446 = --g-700) ---- */
    10	  --g-950: #00211C;
    11	  --g-900: #00312A;
    12	  --g-800: #00443A;
    13	  --g-700: #005446;
    14	  --g-600: #0E7A66;
    15	  --g-400: #6FBFA9;
    16	  --g-300: #9DBDB4;
    17	  --g-100: #DCE8E4;
    18	  --g-50:  #EBF2F0;
    19	
    20	  /* ---- 1. 색 — 의미 토큰 (컴포넌트는 이것만) ---- */
    21	  --bg:            #FFFFFF;
    22	  --surface:       #F3F7F5;
    23	  --fg:            #0B1512;   /* on --bg 18.6 */
    24	  --muted:         #4E5D59;   /* on --bg 6.9 · on --g-100 5.5 */
    25	  --faint:         #5F6E6A;   /* on --bg 5.4 · on --g-50 4.7 · --g-100 위 금지 */
    26	
    27	  --accent:        var(--g-700);   /* on --bg 8.9 */
    28	  --accent-hover:  var(--g-800);   /* white on it 11.1 */
    29	  --accent-weak:   var(--g-50);
    30	  --on-accent-weak: rgba(255, 255, 255, 0.5);  /* 1차 버튼 위 kbd 테두리 전용(§7-1) — preview.html의 rgba(255,255,255,.5) 값 그대로, 화면 픽셀 불변(2026-09-19, 체크포인트 항목 I②) */
    31	
    32	  --success:       var(--g-600);   /* on --bg 5.3 */
    33	  --warning:       #8A5A00;        /* on --bg 5.9 · on --warning-weak 5.3 */
    34	  --warning-weak:  #FBF1DE;
    35	  --danger:        #9B1C1C;        /* on --bg 8.2 · on --danger-weak 7.0 */
    36	  --danger-weak:   #FBE9E9;
    37	
    38	  --line:          #CFDBD7;        /* 장식선 1px */
    39	  --line-ui:       #7C8A86;        /* 인식해야 하는 UI 경계 · on --bg 3.6 */
    40	  --line-strong:   var(--g-900);   /* 2px 강한 선 */
    41	
    42	  --bar:           var(--g-900);
    43	  --bar-fg:        var(--g-100);   /* on --bar 11.3 */
    44	  --bar-muted:     var(--g-300);   /* on --bar 7.0 */
    45	  --bar-leaf:      var(--g-400);   /* 로고 잎 · on --bar 6.6 */
    46	
    47	  --focus:         var(--g-700);
    48	  --scrim:         rgba(0, 33, 28, 0.45);
    49	
    50	  /* 브라우저 기본 표면 (SYSTEM.md §4-4) */
    51	  --sel-bg:        var(--g-100);
    52	  --sel-fg:        var(--fg);
    53	  --caret:         var(--g-700);
    54	  --native-accent: var(--g-700);   /* accent-color: 체크박스·라디오·progress */
    55	  --scrollbar:     var(--line-ui);
    56	  --underline-offset: 2px;
    57	
    58	  /* 인쇄 전용 (print 라우트에서 --fg/--line-strong를 이것으로 덮는다) */
    59	  --print-ink:     #000000;         /* 글자 · 서명 */
    60	  --print-rule:    var(--g-700);    /* 구조 선: 워드마크 · 제목 괘선 · 명세 머리/합계 · 결재 칸 (2px). 인쇄 미디어에서도 유지 (DECISIONS 2026-09-18 인쇄 색) */
    61	  --print-line:    #CFDBD7;         /* 구분 가로선 1px (= --line 값. @media print가 --line을 검정으로 덮으므로 따로 둔다) */
    62	
    63	  /* ---- 1-4. 데이터 색 (손익 대시보드, 2026-09-18) — 색 하나 = 뜻 하나 ---- */
    64	  --viz-1:         var(--g-700);    /* 팀 색 1 = 기획1팀 · 기본 계열 */
    65	  --viz-2:         #1F5FA8;         /* 팀 색 2 = 기획2팀 · #1F5FA8 on #FFFFFF(=--bg) 대비 6.44(양쪽 같은 색 쌍) */
    66	  --viz-2-weak:    #DCE7F5;         /* 팀 색 2 바탕 */
    67	  --seg-1:         var(--g-900);    /* 구성 비율(도넛) 5단, 진한 순 = 큰 비중 */
    68	  --seg-2:         var(--g-700);
    69	  --seg-3:         var(--g-600);
    70	  --seg-4:         var(--g-400);
    71	  --seg-5:         var(--g-100);
    72	
    73	  /* ---- 2. 타입 ---- */
    74	  --font-sans: 'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif;
    75	
    76	  --fs-xs:   11px;
    77	  --fs-sm:   12px;
    78	  --fs-base: 14px;   /* 폰에서 15px (아래 미디어 쿼리) */
    79	  --fs-md:   15px;
    80	  --fs-lg:   18px;
    81	  --fs-xl:   24px;
    82	  --fs-2xl:  32px;   /* 대시보드 KPI 타일 큰 숫자만 (2026-09-18 손익 대시보드 결정) */
    83	
    84	  --lh-tight: 1.3;   /* --fs-xl */
    85	  --lh-head:  1.4;   /* --fs-lg · --fs-xs 태그 */
    86	  --lh-table: 1.5;   /* 표 셀 · --fs-sm */
    87	  --lh-body:  1.6;   /* 본문 */
    88	
    89	  --ls-body:  -0.015em;
    90	  --ls-head:  -0.02em;
    91	  --ls-num:   0;
    92	
    93	  --fw-regular: 400;
    94	  --fw-medium:  600;
    95	  --fw-bold:    700;
    96	  --fw-mark:    800;   /* 로고 워드마크만 */
    97	
    98	  --measure: 64ch;     /* 산문 최대 줄 길이 */
    99	
   100	  /* ---- 3. 간격 (4px 단위) ---- */

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md | sed -n '180,340p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   180	| loading | E3 | ✅ covered | `DeleteToArchive` 기존 `pending` |
   181	| error | E3 | ✅ covered | 「삭제하지 못했습니다 · 다시 시도」(기존) |
   182	| permission | E3 · 보관함 복원 | ✅ covered | 필드 정의 보관·복원은 `admin.archive` write **와** `admin.field-definitions` write를 둘 다 서버에서 검사(O21) — 공용 보관함 화면·액션으로 불러도 같다. 행 「삭제」도 둘 다 있을 때만 렌더. 보관함 목록은 `admin.field-definitions` view가 없으면 필드 정의 행을 빼서 누를 수 없는 「복원」을 보이지 않는다 |
   183	| a11y | E3 | 🧪 backstop | 공유 컴포넌트라 트리거에 대상 이름을 붙일 수 없다 — 이름 셀을 `<th scope="row">`로 두어 행 머리글이 「삭제」의 문맥이 되는지 DOM 감사가 확인. 확인 진입·취소·완료 뒤 포커스 이동·복귀 없음, 진행 중 「취소」 미잠금은 관리자 마스터 공통의 **기록된 임시 예외**(SYSTEM.md 671행, DECISIONS.md 2026-09-24 — X3·X4) |
   184	| empty | E4 | ✅ covered | 활성·노출 칸 0개면 구분선 포함 묶음 자체를 렌더하지 않는다 |
   185	| error | E4 | ✅ covered | 화면 3 「검증」 — 칸별 오류 배선은 **변경**(새 로직). 폼 전체 서버 오류도 **변경** — 상단 `FormAlert` 상자를 걷고 1차 옆 이유 자리(`#vendor-form-reason`)에 「{등록\|수정}할 수 없음 — {서버 원인} · 다시 시도」(화면 3 변경 5) |
   186	| partial | E4 기존 빈 필수값 | ✅ covered | 화면 3 「필수 판정」 표 — 수정 모드에서 저장값도 비고 제출값도 비면 「안 바꿈」, 막지 않는다 |
   187	| stale | E4 폼 열린 사이 정의 변경 | ✅ covered | 선택지가 보관됨 → 「보관된 선택지입니다 · 다른 선택지 고르기」. 칸이 보관·노출 해제됨 → 서버가 저장값 되살림(값 유실 없음). 필수로 바뀜 → 「필수 판정」 표대로 |
   188	| hidden | E4 보관·비노출 칸 | ✅ covered | 렌더하지 않는다, 서버가 저장값을 되살린다, 안내 문구 없음 |
   189	| archived value | E4 선택형 | ✅ covered | 화면 3 「보관된 선택지가 현재 값」 |
   190	| zero-one-many | E5 | ✅ covered | 0개 → 지금과 같은 화면, N개 → `INFO_ITEMS` 뒤에 이어 붙는다 |
   191	| overflow | E5 | ✅ covered | §7-13 가로 스크롤 + 계급 열 sticky 그대로 |
   192	| long-text | E5 머리글 | ✅ covered | 이름 20자 상한으로 해결 — `PermissionGrid.module.css:60`의 `white-space: nowrap`은 **바꾸지 않는다**(한 줄 머리글, 최대 폭 ≈ 20자) |
   193	| error | E5 | ✅ covered | 기존 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 원위치 + 토스트 「권한 저장 실패 · 다시 시도」(`PermissionGrid.tsx:190·203`) |
   194	| auto-register | E5 | ✅ covered | 필드 생성과 전 계급 노출 행 생성은 한 트랜잭션 — 둘 중 하나라도 실패하면 생성 전체 실패(「추가할 수 없음 — … · 다시 시도」) |
   195	| scale | E5 | 🧪 backstop | 커스텀 열 20개 × 이름 20자 시드로 DOM 감사가 가로 스크롤 컨테이너 밖 넘침 0, sticky 열 고정을 실측 |
   196	| populated / zero-one-many | E2 | 🧪 backstop | (probe) 수정 모드에 기존 값이 채워지고, 선택지 0·1·30개에서 폼 레이아웃이 깨지지 않는지 DOM 감사가 실측 |
   197	| empty / populated / partial / overflow / zero-one-many / long-text | E3 | 🧪 backstop | (probe) 행마다 한 개의 트리거뿐인 공유 컴포넌트 — 상태는 E1 행과 `DeleteToArchive` 기존 동작을 따른다. 긴 이름 행에서 트리거·확인 줄이 칸 밖으로 넘치지 않는지 DOM 감사가 실측 |
   198	| loading / populated / overflow / zero-one-many / long-text | E4 | 🧪 backstop | (probe) 서버 렌더라 로딩 상태 없음. 커스텀 칸 0·1·N개, 20자 이름 라벨, 40자 선택지에서 폼이 1열로 유지되고 넘침이 없는지 DOM 감사가 실측 |
   199	| empty / loading / populated / partial | E5 | 🧪 backstop | (probe) 커스텀 칸 0개면 기존 노출표와 동일, 보관된 칸 열은 없음, 셀 저장 중·실패는 기존 `PermissionGrid` 동작 — DOM 감사가 커스텀 열 셀 토글·실패 원위치를 실측 |
   200	
   201	---
   202	
   203	## Registry Safety
   204	
   205	해당 없음 — `Tool: none`. 서드파티 레지스트리·블록 없음.
   206	
   207	---
   208	
   209	## Screens
   210	
   211	### 화면 1 — 화면 항목 관리 (`/admin/field-definitions`, 신규)
   212	
   213	§6-1 관리자 마스터 틀(D-39: `?new=1`/`?editId=` 토글, 기본 진입엔 폼 없음). **초점(focal point) = 목록 표의 이름 열.** 1차 버튼은 폼 제출에만 있고 목록 화면의 행동은 전부 3차다.
   214	
   215	```
   216	PC(기본 = 보관 제외)
   217	│ 화면 항목                                                   │ ← PageHeader title="화면 항목" subtitle="거래처"
   218	│ 보관 포함                                     화면 항목 추가 │ ← 필터 줄(vendors와 같은 자리)
   219	╞═════════════════════════════════════════════════════════════╡
   220	│ 이름          타입    필수  정렬  선택지          상태  동작 │ ← 흰 머리글
   221	├─────────────────────────────────────────────────────────────┤
   222	│ 담당자 연락처  텍스트  필수   1   —               —   수정 삭제│
   223	│ 계약 유형     선택    —     2   기본, 특약, MOU  —   수정 삭제│
   224	│ 갱신일        날짜    —     3   —               —   수정 삭제│
   225	보관 포함일 때 추가되는 행:
   226	│ 옛 분류       텍스트  —     9   —            보관됨          │ ← 동작 칸 비움
   227	```
   228	
   229	- **관리자 전용**(ROADMAP 04.5 기준 1 「관리자 외 계급은 화면·액션에 닿지 못한다」): 새 메뉴 키 `admin.field-definitions`는 시드(`domain/seed/index.ts`)에서 **시스템 관리자 계급(`SYSADMIN_ROLE_ID`)에만** `insertPermissionIfAbsent`로 view·write를 준다(이미 있는 행은 덮지 않는다). 다른 계급에는 행을 만들지 않는다 — `can()`은 행이 없으면 거부. 통합 테스트가 비관리자 계급으로 페이지(404)와 **모든 액션**(생성·수정·보관, 노출표 커스텀 열 토글 포함)의 거부를 증명한다
   230	- 권한: `can(viewer, "admin.field-definitions", "view")` 없으면 404. `write` 없으면 「화면 항목 추가」·「수정」과 폼 자체를 렌더하지 않는다(`?new=1`·`?editId=`로 직접 와도 목록만). 「삭제」는 `admin.archive` write **와** `admin.field-definitions` write가 둘 다 있을 때만 렌더한다(vendors처럼 보관함 권한 하나로 판정하지 않는다 — 아래 「보관·복원 권한」). `?editId=`가 보관·없는 ID면 폼 없이 목록만(vendors `page.tsx:65`와 같은 조건). 서버 액션은 매번 권한을 다시 확인하고, 제출 중 권한이 회수되면 `Form.Actions` 이유 자리에 「{추가|수정}할 수 없음 — 권한 없음 · 다시 시도」
   231	- 대상 선택 UI 없음 — 부제 「거래처」 고정. **서버도 거래처만 받는다**: `FIELD_DEFINITION_TARGETS = ["vendor"] as const` 상수 하나. 생성 입력에 entity를 받지 않고 서버가 "vendor"를 넣는다(`.strict()`라 entity를 보내면 거부). 수정·삭제는 대상 정의의 entity가 상수 밖이면 거부. **보관함 경로도 같은 상수로 막는다**: 공유 보관함(`domain/archive/index.ts`)에 이 페이즈가 등록하는 필드 정의 항목은 조회·보관·복원 모두 `FIELD_DEFINITION_TARGETS` 안의 정의만 다룬다(`findById`·목록이 entity 밖 행을 「없음」으로 돌려 `restore()`(76~82행)가 `ArchivableRowNotFoundError`로 끝난다). 프로젝트·견적 줄 정의는 이 페이즈의 변경으로 보관함에 나열되거나 복원되지 않는다(ROADMAP 04.5 「Depends on」 Phase 4 동작 보존)
   232	- **보관·복원 권한**(O21, Codex #12): 필드 정의의 보관·복원은 `admin.archive` write와 `admin.field-definitions` write를 **둘 다** 서버에서 검사한다. 공용 `archive()`·`restore()`(`domain/archive/index.ts:55·76`)는 지금 보관함 권한만 보므로, 보관함 등록부의 필드 정의 항목에 추가 권한 조건(메뉴 `admin.field-definitions`, 동작 `write`)을 두고 공용 함수가 `assertCanWrite` 뒤에 그 항목의 조건을 검사한다 — 다른 여섯 항목은 조건이 없어 동작이 그대로다. 그래서 목록 행 「삭제」, 보관함 화면 「복원」, 보관함 서버 액션 직접 호출 어느 경로로 와도 같은 거부(`ForbiddenError`)가 난다. 보관함 목록은 `admin.field-definitions` view가 없는 사람에게 필드 정의 행을 보이지 않는다. **증명하는 테스트**: 통합 — (a) `admin.archive` view·write만 있고 `admin.field-definitions` 행이 없는 비관리자 계급으로 `archive(viewer, 필드 정의 항목, id)`·`restore(...)`를 직접 불러 거부, 행의 `archived_at` 불변, 행동 로그 없음; (b) 같은 계급으로 보관함 서버 액션(`app/(app)/admin/archive/actions.ts`)을 불러 거부; (c) 같은 계급의 보관함 목록에 필드 정의 행 0건; (d) `admin.field-definitions` write만 있고 `admin.archive` write가 없으면 거부; (e) 시스템 관리자는 보관·복원 성공. 단위 — 필드 정의 페이지가 두 권한 중 하나라도 없으면 「삭제」를 렌더하지 않음
   233	- 필터 줄 「화면 항목 추가」는 폼이 열려 있으면(`?new=1`·`?editId=`) 렌더하지 않는다 — 같은 행동이 두 곳에 보이지 않게
   234	- 열: 이름(`<th scope="row">`) · 타입 · 필수(「필수」/「—」 평문, StatusTag 아님) · 정렬 · 선택지(타입=선택일 때 활성 선택지 콤마 목록, 그 외 「—」) · 상태(「보관됨」/「—」) · 동작. 셀 줄바꿈은 body 상속 `overflow-wrap: anywhere`(덮어쓰지 않는다)
   235	- 반복 행동의 접근 이름: 「수정」 링크 `aria-label="{이름} 수정"`. 「삭제」는 공유 컴포넌트라 이름을 못 붙인다 — 행 머리글로 문맥 제공(E3 backstop)
   236	- 폰(§7-3 칸 접기): P1 = 이름(문자) · 정렬(숫자) · 동작(보관 행은 이 자리에 「보관됨」). P2 접힌 줄 = 타입 · 필수 · 선택지. 상태 열은 폰에서 P1 동작 자리로 합쳐진다
   237	- 순서 바꾸기: 정렬 순서 숫자 입력뿐(드래그 없음). 정수 0~999, 중복 허용. 같은 번호면 내부 키 순(안정적이지만 등록 순이 아님) — 순서를 정하려면 관리자가 서로 다른 번호를 준다. 저장하면 아래 목록이 새로고침되어 새 위치에 보인다. 폰에서 여러 개를 옮기려면 행마다 「수정」 → 숫자 바꾸기 → 「화면 항목 수정」 반복
   238	
   239	### 화면 2 — 화면 항목 등록·수정 폼 (같은 화면 `?new=1` / `?editId=`)
   240	
   241	`ui/form/Form`(`noValidate` 내장) + `className="single-column"`(720).
   242	
   243	```
   244	│ 이름       [____________________] (long 480, maxLength 20)             │
   245	│ 타입       [텍스트 ▾] (select 200)  ← 수정 모드: 「텍스트」 텍스트 + 3차 「새 화면 항목 추가」 │
   246	│ 필수       ☐ 필수                                                     │
   247	│ 정렬 순서   [___] (short 280)                                          │
   248	├────────────────────────────────────────────────── 1px --line + --s-6 ┤ ← 타입=선택일 때만
   249	│ 기본 · 삭제                                                           │ ← 저장된 활성 선택지
   250	│ 특약 · 삭제                                                           │
   251	│ ▸ 보관된 선택지 2개                                                    │ ← 기본 접힘(0개면 렌더 안 함)
   252	│   구형(레거시) [보관됨]                                                │ ← 펼쳤을 때, 버튼 없음
   253	│ 새 선택지 [__________] (short 280, maxLength 40)  선택지 추가           │
   254	│ [화면 항목 추가]  {막힘 이유} {다음 한 수}                        취소   │ ← Form.Actions(제출 중엔 「취소」도 비활성)
   255	```
   256	
   257	- **키**: 서버가 생성 시 자동 생성, 불변, 화면에 안 보임. 이름을 바꿔도 키는 그대로. 충돌하면 서버가 다시 생성한다
   258	- **타입**: 등록 모드 `Select`(텍스트/숫자/날짜/선택). 수정 모드는 텍스트 + 3차 「새 화면 항목 추가」(`?new=1`) — 타입을 바꾸는 방법이 새 칸 만들기뿐임을 행동으로 보인다. 설명 문구는 붙이지 않는다(§8 규칙 5)
   259	- **선택지 상태**: 타입 값·활성 선택지 목록은 React 상태. 「선택지 추가」·`Enter`(새 선택지 입력 안, 폼 제출 대신)는 앞뒤 공백을 잘라 활성 목록 끝에 더한다. 활성과 같으면 오류, **보관 선택지와 같으면 그 선택지를 활성으로 되돌린다**(중복 생성 없음). 선택지 행 「삭제」: 아직 저장 안 한 선택지는 목록에서 **빠지고**, 저장된 선택지는 보관 목록으로 **옮겨진다**(저장 전이라 「취소」하면 원래대로). 두 경우 모두 포커스는 새 선택지 입력으로 간다. 저장된 선택지 문자열은 읽기 전용(이름 변경 없음, Pitfall 2)
   260	- **보관 선택지 표시**: 네이티브 `<details>`(기본 접힘) + `<summary>` 「보관된 선택지 {N}개」(3차 모양), 펼치면 선택지마다 텍스트 + StatusTag 「보관됨」, 버튼 없음. N = 0이면 렌더하지 않는다. 보관 선택지 개수는 상한이 없고 상한(30)은 활성에만 건다
   261	- **저장 계약**(O11·O12): 기존 `field_definitions.options` JSONB 모양(`string[]`)은 **바꾸지 않는다** — 여기에는 활성 선택지만 둔다. 보관 선택지는 **새 열 `archived_options`**(JSONB `string[]`, 기본 `[]`)에 둔다. `listFieldDefinitions(viewer, entity)`의 호출 모양·결과는 Phase 4 호출부에 대해 그대로다. 클라이언트는 활성 선택지 배열만 보낸다. 서버가 `archived_options = (저장된 options ∪ 저장된 archived_options) − 제출된 options`로 파생한다 — 동시 저장이 겹쳐도 저장된 선택지는 어떤 경로로도 사라지지 않는다. 필드 전체 복원은 선택지 상태를 바꾸지 않는다(보관 선택지는 보관된 채로)
   262	- **동시 편집 — 버전 조건부 갱신**(O20, Codex #11): `field_definitions`에 **새 열 `version`**(`integer not null default 1`)을 이 페이즈 마이그레이션(`label`·`archived_at`·`archived_options`와 같은 파일)에 더한다. `updated_at` 동등 비교는 쓰지 않는다 — Postgres `timestamp`는 마이크로초, JS `Date`는 밀리초라 왕복하면 같은 행도 불일치한다. 흐름: ① 수정 폼은 연 행의 `version`을 숨은 입력으로 싣는다. ② 서버는 행을 읽어 제출된 `version`과 다르면 바로 거부하고, 같으면 그 저장값으로 `archived_options`를 파생(O12)한 뒤 `UPDATE … SET label, required, sort_order, options, archived_options, version = version + 1, updated_at = now() WHERE id = ? AND version = ?(제출값) AND archived_at IS NULL` **한 문장**으로 쓴다. ③ 0행이면 거부 — 행이 그 사이 보관됐으면 「수정할 수 없음 — 보관된 화면 항목입니다 · 목록으로」, 아니면 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 새로 불러오기」(둘 다 `Form.Actions` 이유 자리, 칸 값은 그대로 남는다). ④ 「새로 불러오기」(3차)는 `router.refresh()` 후 폼을 `key={id}:{version}`로 다시 마운트해 최신 행(이름·필수·정렬·활성/보관 선택지)을 채우고 포커스를 이름 입력으로 보낸다 — 저장 안 한 입력은 버린다. 「목록으로」(3차)는 `router.replace`로 폼을 닫는다. **보관·복원**은 칸 값을 덮어쓰지 않으므로(보관 시각만 바꾼다, 멱등) 버전을 받지 않지만, 필드 정의 항목의 보관·복원은 같은 문장에서 `version`을 1 올린다 — 그 전에 열린 수정 폼이 보관·복원 뒤 상태를 덮지 못한다. 공용 `DeleteToArchive`·보관함 화면은 바꾸지 않는다. **테스트**(통합): 같은 `version`으로 두 번 저장 → 두 번째 거부·행 불변(먼저 저장이 보관한 선택지가 보관된 채); 폼을 연 뒤 보관 → 수정 거부(보관 문구); 보관·복원 뒤 옛 `version`으로 저장 거부; 순차 저장은 통과
   263	- **제출 중**: 1차 `pending`, 입력·선택지 버튼은 `<fieldset disabled>`, 「취소」도 비활성(SYSTEM.md 672·1000행). 응답 뒤 결과 줄의 「닫기」 또는 이유 자리 다음 한 수로 이어진다
   264	- **SUCCESS**(§7-15 「화면이 그대로인 폼」): 1차 버튼 자리가 결과 텍스트로 바뀌고 입력은 읽기 전용. 결과 줄은 `role="status"`, `tabIndex={-1}`로 포커스를 받는다. 아래 목록은 서버 재검증으로 새로고침된다. 등록: 「화면 항목 추가 · {이름} 추가됨」 + 「정보 노출표 보기」(`/admin/visibility` — 새 칸이 전 계급 보임으로 등록됐으므로) + 「하나 더 추가」 + 「닫기」. 「하나 더 추가」는 폼을 `key`로 다시 마운트해 React 상태(타입 「텍스트」, 선택지 빈 배열, 정렬 기본값 `min(활성 최대값 + 1, 999)`)까지 초기화하고 포커스를 이름 입력으로 보낸다. 수정: 「화면 항목 수정 · {이름} 수정됨」 + 「닫기」(목록으로, `router.replace`)
   265	- 칸 목록·검증 문구·막힘은 Copywriting 표 그대로. **이름은 보관된 정의까지 포함해 거래처 안에서 유일하다**(O22, Codex 신규 MAJOR): 앞뒤 공백을 자른 `label`에 DB unique `(entity, label)`를 건다(보관 여부와 무관하게 이름을 예약 — 부분 인덱스 아님). 마이그레이션은 기존 행의 `label`을 `key`로 채운다(`(entity, key)`가 이미 유일이라 충돌 없음). 등록·이름 변경이 활성 정의와 같으면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」, 보관 정의와 같으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」(3차 링크 `/admin/archive`, `admin.archive` view가 있을 때만 — 없으면 「· 이름 바꾸기」 평문). 서버는 먼저 조회로 두 경우를 가르고, 조회와 쓰기 사이 경합은 unique 위반을 같은 칸 오류로 바꿔 돌려준다. 그래서 공용 `restore()`(이름 검사 없음)가 같은 이름의 활성 정의 둘을 만들 수 없다. **테스트**(통합): 「계약 유형」 보관 → 같은 이름 등록 거부(보관 문구) → 다른 정의를 그 이름으로 변경 거부 → 옛 정의 복원 성공, 활성 「계약 유형」 1건
   266	
   267	### 화면 3 — 거래처 폼의 커스텀 칸 (`/admin/vendors`, 기존 화면 **변경**)
   268	
   269	```
   270	│ 이름 · 사업자 번호 · 기본 증빙 종류 · 계좌 은행 · 예금주 · 계좌번호       │ ← 기존(변경 없음)
   271	├──────────────────────────────────────────── 1px --line + --s-6(신설) ┤
   272	│ 담당자 연락처  [________________]                                     │
   273	│               필수 칸이 비어 있습니다 · 값 입력                         │ ← 칸 오류(신설)
   274	│ 계약 유형      [구형(레거시) (보관됨) ▾]                                 │
   275	│ [거래처 수정]  수정할 수 없음 — 담당자 연락처 1칸 · 담당자 연락처 고치기  취소 │ ← 이유 자리(신설)
   276	```
   277	
   278	**변경 목록**(`vendor-form.tsx`):
   279	1. `<form>`에 `noValidate`를 더하고 커스텀 칸의 `required={def.required}`(217·231행)를 뺀다 — 브라우저가 `handleSubmit` 전에 제출을 막지 않게. `ui/form/Form`으로 옮기지 않는 더 작은 경로를 택했다. 기본 칸 「이름」의 `required`는 이 페이즈 밖이라 두지만 `noValidate`가 말풍선을 끈다
   280	2. 라벨을 `def.key` → `def.label`
   281	3. 기본 칸과 커스텀 칸 사이 `1px --line` + `--s-6` 구분선(텍스트 머리 없음)
   282	4. **칸별 오류 배선(새 로직)**: 서버가 커스텀 키별 오류를 돌려주고, 폼이 키로 찾아 텍스트·숫자·날짜는 `TextField error`로, 네이티브 select는 로컬 `<p id="cf_{key}-error">`(`--fs-sm --danger`) + `aria-invalid` + `aria-describedby`로 보인다(`ui/select`와 같은 배선)
   283	5. **이유 자리(신설)**: 1차 버튼 옆 `<span id="vendor-form-reason">`(`--fs-sm --danger`) + 3차 「{첫 칸 이름} 고치기」(그 칸으로 포커스). 1차 `aria-describedby`가 이 span을 가리킨다(`role="alert"` 아님). **폼 전체 서버 오류도 이 자리로 옮긴다**(Codex #7, SYSTEM.md 993행 「폼 상단 오류 상자를 두지 않는다」): 195행 `{result.serverError ? <FormAlert>…</FormAlert> : null}`를 지우고(`FormAlert` import도 지운다 — 이 파일에서 다른 사용 없음), 같은 span에 「{등록\|수정}할 수 없음 — {serverError 원문} · 다시 시도」를 쓴다(원문에 「 · 」가 이미 있으면 「 · 다시 시도」를 붙이지 않는다 — Copywriting 표). 서버 오류 줄에는 3차 버튼이 없다(다음 행동은 1차를 다시 누르는 것). 한 응답에 칸 오류와 서버 오류가 함께 오면 칸 오류 요약을 보인다(칸을 고치는 것이 먼저). 위치는 1차 「거래처 등록/수정」 바로 오른쪽, 「취소」 링크 왼쪽 — 칸 오류 요약과 같은 한 자리, 한 번에 한 줄. `duplicateNotice`(193행, 같은 이름 거래처 안내)는 오류가 아니라 이 페이즈에서 바꾸지 않는다. **테스트**: 단위(RTL) — `serverError`가 오면 `#vendor-form-reason`에 문구가 나오고 1차 `aria-describedby`가 그 id를 가리키며, `FormAlert`(폼 상단 상자)가 DOM에 없다
   284	6. 값 보존: 입력은 비제어라 오류 뒤에도 남는다(성공 시 reset만 기존대로)
   285	
   286	**필수 판정**(ROADMAP 기준 2 「고칠 때」 = **그 칸을 고칠 때**, 서버 `validatedCustomFields`가 판정 — RESEARCH Pitfall 3 (a)):
   287	
   288	| 모드 | 저장값 | 제출값 | 결과 |
   289	|------|--------|--------|------|
   290	| 등록 | — | 빈칸 | 막힘 — 칸 오류 + 이유 |
   291	| 수정 | 빈칸(칸이 나중에 생겼거나 필수로 바뀜) | 빈칸 | **안 바꿈 — 막지 않는다**(다른 칸 수정 저장 가능) |
   292	| 수정 | 값 있음 | 빈칸(사용자가 지움) | 막힘 — 칸 오류 + 이유 |
   293	| 수정 | 무엇이든 | 값 있음 | 타입 검증만 |
   294	
   295	제출 전 클라이언트 사전 비활성은 두지 않는다 — 판정이 저장값에 달려 있어 관문은 서버 하나다(§7-15).
   296	
   297	**보관된 선택지가 현재 값**: 저장값이 활성 선택지에 없으면 그 값을 `<option value={값}>{값} (보관됨)</option>`로 **활성화된 채** 목록 끝에 한 개 더한다(disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없으므로 쓰지 않는다). 그 거래처의 폼에만 나타나고 새 거래처·다른 거래처에는 없다. 서버 규칙: 거래처 경로만 기존 검증기(`buildCustomFieldsSchema`, `string[]` 선택지)에 `options ∪ {그 행의 저장값 — 저장값이 archived_options에 있을 때만}`을 넘긴다(어댑터는 거래처 경로 안, 검증기·프로젝트·견적 줄 경로는 바꾸지 않는다). 즉 값이 활성 선택지이거나 **저장값과 같으면**(안 바꿈) 통과, 그 밖의 보관 선택지(폼이 열린 사이 관리자가 보관한 경우 포함)면 「보관된 선택지입니다 · 다른 선택지 고르기」. 「선택 없음」을 고르면 지움(필수면 위 표대로 막힘).
   298	
   299	- 보관된 칸·계급별로 끈 칸: 서버가 `fieldDefs`에서 빼서 렌더하지 않고, 저장 시 기존 값을 서버가 되살린다. 안내 문구 없음
   300	- 폰: §6-3 폼 규칙(라벨 위, 전폭)
   301	- **E2E 필수 범위**: 필수 칸이 저장값 빈 상태에서 다른 칸만 고친 수정 저장 — 텍스트·숫자·날짜·선택 **네 타입 모두**. 등록 시 필수 빈칸 막힘과 문구. 채워진 필수 칸 지우기 막힘. 보관 선택지 현재 값 그대로 저장 시 값 유지. 보관 선택지 새 지정 거부와 문구
   302	
   303	### 화면 4 — 정보 노출표 동적 열 (`/admin/visibility`, 기존 화면 확장)
   304	
   305	`PermissionGridClient`와 `PermissionGrid` CSS는 바꾸지 않는다. 서버가 `columns` 끝에 활성 거래처 `field_definitions` 열을 정렬 순서대로 이어 붙인다(머리글 = `label`, 최대 20자 한 줄, `--g-100` 머리글).
   306	
   307	```
   308	│         │ 손익 숫자 │ 팀 비용 │ … │ 담당자 연락처 │ 갱신일 │
   309	│ 대표     │    ☑     │   ☑    │   │      ☑       │   ☑   │
   310	```
   311	
   312	- 셀 = 즉시 저장, 실패 시 원위치 + 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」(기존 `PermissionGrid.tsx:190·203`)
   313	- 새 칸은 생성과 같은 트랜잭션에서 전 계급 보임으로 등록된다(D10-13)
   314	- 칸이 보관되면 다음 조회부터 열이 빠지고, 계급별 값은 남아 복원 시 돌아온다
   315	- 폰: §7-13 기존 규칙 그대로
   316	- 다섯 상태: §7-13 그대로
   317	
   318	### 관리 인덱스
   319	
   320	「화면 항목」은 §6-10 관리 인덱스 **마스터 그룹, 「코드표」 다음**에만 더한다. 「더보기」 시트·PC 사용자 메뉴는 「관리」 한 줄 그대로(SYSTEM.md 640행). `role-menu.ts`에 `{ key: "admin.field-definitions", label: "화면 항목", href: "/admin/field-definitions", group: ADMIN_GROUP_MASTER }`를 더하고, **같은 계획에서 SYSTEM.md 정본 표(636행 부근 마스터 행)와 그 순서 단위 테스트를 함께 고친다**(DESIGN.md §4 절차 — 정본은 SYSTEM.md이지 이 문서가 아니다).
   321	
   322	### 기존 공유 컴포넌트 — 기록된 시스템 예외
   323	
   324	이 페이즈는 `DeleteToArchive`를 **바꾸지 않고** 재사용한다. 아래 X1~X4는 「범위 밖」 선언이 아니라 **관리자 마스터 화면(코드표·사람·계급·조직·법인카드·거래처·화면 항목) 전부에 같게 걸리는 기록된 임시 예외**다 — `docs/design/DECISIONS.md` 2026-09-24 「§7-1 위험 행동 확인: 관리자 마스터 화면의 인라인 보관 확인(`DeleteToArchive`)을 기록된 임시 예외로」, `docs/design/SYSTEM.md` 671행(§7-1 위험 행동 규칙 아래 예외 줄). 후속 작업이 모달·시트 확인 컴포넌트를 만들어 이 화면들을 한꺼번에 옮기면 예외가 사라진다(화면 하나만 먼저 바꾸지 않는다). X5는 SYSTEM.md 명문 규칙이 아니라 같은 후속 작업에서 함께 다룬다(O4·O24).
   325	
   326	| # | 대상 | 현재 동작 | SYSTEM.md 규칙 | 근거 |
   327	|---|------|-----------|----------------|------|
   328	| X1 | `DeleteToArchive`(`app/(app)/admin/archive/delete-to-archive.tsx`) | 확인이 모달·시트가 아니라 행 안 인라인 문구 + 버튼 | 670행 「위험 행동은 **확인 모달**로 구분」, 839·840행(PC 모달·폰 시트) | 기록된 예외 ① |
   329	| X2 | 같은 컴포넌트 50행 | 확인 줄의 1차 「삭제」(`variant="primary"`)가 **목록 행 안**에 뜬다. 1차 버튼 자체는 839행(위험 확인 모달의 1차 행동)과 맞다 — 어긋나는 것은 표면: 행 안 행동은 3차(661~663행 표), 수정 폼이 열린 채 확인하면 한 화면에 1차가 둘(661행 「1개」) | 661~663행 1차 개수·3차 자리 | 기록된 예외 ①의 결과(모달·시트로 옮기면 함께 사라짐) — Color accent 예약 목록 참고 |
   330	| X3 | 같은 컴포넌트 53행 | 확인 진행 중 「취소」가 잠기지 않는다 | 672행 「같은 폼의 다른 버튼도 비활성」 | 기록된 예외 ② |
   331	| X4 | 같은 컴포넌트 | 확인 진입 때 포커스가 확인 줄로 가지 않고, 취소·완료 뒤 트리거(또는 다음 행)로 돌아오지 않는다 | 844행 「열릴 때 첫 행동 요소에 포커스 … 닫힐 때 원래 요소로 복귀」 | 기록된 예외 ③ |
   332	| X5 | 같은 컴포넌트 | 행마다 반복되는 「삭제」에 대상 이름이 든 접근 이름이 없다(행 머리글 `<th scope="row">`로만 문맥 — E3 backstop) | SYSTEM.md 명문 규칙은 아님(화면 1 「수정」 `aria-label`과 불일치) | DECISIONS.md 같은 항목의 「함께 추적하는 것」 |
   333	
   334	X6(거래처 폼 상단 `FormAlert`)은 이 개정에서 **해소** — 화면 3 변경 5가 이유 자리로 옮긴다.
   335	
   336	---
   337	
   338	## Assumptions
   339	
   340	비대화형 세션이라 사용자에게 묻지 않았다. 출처: **R** = 연구자, **O** = 오케스트레이터가 정함.

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md | sed -n '75,105p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '80,255p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
    75	<objective>
    76	관리자가 선택형 칸을 만들고, 이미 있는 칸의 이름·필수·정렬 순서·선택지를 고친다. 타입은 바꿀 수 없고(새 칸을 만든다), 선택지를 지우면 보관된다. 오래 열린 폼은 다른 사람의 저장을 되돌리지 못한다(버전 조건부 갱신) — 저장된 선택지 문자열은 어떤 저장 경로로도 사라지지 않는다.
    77	
    78	Purpose: ROADMAP 04.5 기준 1(수정·타입 불변)과 기준 2의 선택지 보관 절반. 05(거래처 저장이 보관 선택지 값을 통과시킴)·06(거래처 폼의 「(보관됨)」 표시)이 이 플랜의 `archived_options`를, 04(보관·복원)가 `version`을 읽는다.
    79	
    80	Output: `domain/custom-fields/options.ts` · 수정 domain·액션(버전 조건부) · 수정 모드 폼(새로 불러오기·목록으로) · 선택지 편집기 · 테스트.
    81	
    82	**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인), 실패를 쫓기 전 `systematic-debugging`, 커밋과 「완료」 전 `verification-before-completion`을 호출한다. 서브에이전트 위임 시 세 스킬과 `model`을 적는다. 한 세션에 플랜 하나 — Task 1에서 읽은 파일은 Task 2·3에서 다시 읽지 않는다. E2E 판정은 `CI=true`. 화면 DOM 감사는 07이 별도 에이전트로 한 번에 한다. 새 의존성 0개. 병렬 페이즈 규칙은 01과 같다 — 이 플랜은 공유 파일을 건드리지 않는다.
    83	
    84	**공유 테스트 환경:** 같은 wave(3)의 03과 공유 `erp_test` DB·E2E 포트 3100·`next build` 디렉터리를 같이 쓴다. 그래서 통합 테스트·E2E 명령은 모두 `flock /tmp/plant8-erp-test.lock `을 앞에 붙여 한 번에 하나씩 돈다(단위·lint·typecheck는 잠금 없음). 이 플랜은 따로 `pnpm build`를 돌리지 않는다. `CI=true` E2E의 webServer가 `pnpm build && pnpm start`(`playwright.config.ts` 52행)로 같은 잠금 안에서 프로덕션 빌드를 하므로, 빌드 오류는 E2E 명령에서 드러난다(예상 비용 1.1배 경고에 따른 손질 — 범위는 그대로). `pnpm db:dev`는 로컬 Postgres를 띄울 뿐 DB를 다시 만들지 않는다. 통합 DB는 vitest `test/integration/global-setup.ts`·`setup.ts`가, E2E DB는 `test/e2e/global-setup.ts`(14–46행: 스키마 비움 → 마이그레이션 → `seedMasterData`)가 준비한다. 테스트가 자기 픽스처를 넣는다.
    85	
    86	**OPEN — /plan-design-review(이 플랜이 승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리):**
    87	- **2-A** 보관 선택지 `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — 원문(네이티브 `details`)대로 그대로 둔다(Task 3)
    88	- **2-B** 새 서버 문구 「화면 항목 없음」 — 수정 대상이 없거나 대상 상수 밖일 때의 원인이다. UI-SPEC Copywriting에 없는 문구다(Task 2). 기존 오류 자리에만 한 줄로 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
    89	</objective>
    90	
    91	<execution_context>
    92	@.claude/gsd-core/workflows/execute-plan.md
    93	@.claude/gsd-core/templates/summary.md
    94	</execution_context>
    95	
    96	<context>
    97	@.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md
    98	@.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md
    99	@.planning/phases/04.5-custom-field-admin/04.5-08-SUMMARY.md
   100	@CLAUDE.md
   101	# 범위 Read(UI-SPEC 개정 3, 75ae245 기준):
   102	# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 2」 239–265행(262행 버전 조건부 갱신) · Copywriting 124–150행(138·139행 충돌 문구) · E2 concurrency·stale 줄(177–178행) · Assumptions O3·O11·O12·O20·O22
   103	# .planning/phases/04.5-custom-field-admin/04.5-RESEARCH.md Pitfall 2(보관 선택지 vs z.enum)
   104	# docs/design/SYSTEM.md §7-15(폼) · §7-5(StatusTag 어휘)
   105	</context>
    80	
    81	Purpose: ROADMAP 04.5 기준 2(필수 판정 · 값 보존)와 기준 4(끈 계급의 저장이 값을 지우지 않음)의 서버 절반. 03이 읽기 경로(DTO 출구)를 칸별로 막았고, 이 플랜은 쓰기 경로를 막는다. 06이 이 계약 위에 칸 오류·이유 자리 화면을 그린다.
    82	
    83	Output: 순수 모듈 `domain/custom-fields/preserve.ts` · 거래처 domain의 입력 칸 집합 하나 · 수정의 행 잠금 합치기·쓰기(한 트랜잭션) · 거래처 액션의 칸별 오류 반환 · 거래처 폼 수정 제출 모양 한 줄 · 단위·통합(경합 포함) 테스트 · Phase 3 `custom-fields` 픽스처의 노출 행.
    84	
    85	**실행 순서 — Phase 4 선행:** `app/(app)/admin/vendors/vendor-form.tsx`(04-25)를 Phase 4도 고치므로 그 Phase 4 플랜이 작업 브랜치에 들어온 뒤에만 실행한다 — 먼저 `sh -c 'for p in 04-25; do git ls-tree --name-only HEAD .planning/phases/04-project-quote-ledger/ | grep -q "/$p-SUMMARY.md" || exit 1; done'`를 돌려(01이 착수 때 main을 합쳤다 — 여기서는 합치지 않는다, 마이그레이션 번호 조정은 07 의식만) 종료 코드가 0이 아니면 멈추고 사용자에게 알린다.
    86	
    87	**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. 새 의존성 0개.
    88	
    89	**공유 테스트 환경:** 같은 wave(4)의 04와 공유 `erp_test` DB·E2E 포트 3100·`next build` 디렉터리를 같이 쓴다. 그래서 통합 테스트·`pnpm build`·E2E 명령은 모두 `flock /tmp/plant8-erp-test.lock `을 앞에 붙여 한 번에 하나씩 돈다(단위·lint·typecheck는 잠금 없음). `pnpm db:dev`는 로컬 Postgres를 띄울 뿐 DB를 다시 만들지 않는다. 통합 테스트 DB는 vitest `test/integration/global-setup.ts`가, E2E DB는 `test/e2e/global-setup.ts`(14–46행: 스키마 비움 → 마이그레이션 → `seedMasterData`)가 준비하고, 각 테스트가 자기 픽스처를 넣는다. 이 플랜은 DB를 따로 준비하지 않는다.
    90	
    91	**운영 데이터 선행 조건(01/08 — 그룹 A 소유):** 기존 거래처 정의의 노출 행 일회성 백필은 03 `<objective>`의 선행 조건과 같다. 이 플랜은 그 백필을 전제로 「노출 행 없음 = 입력 칸 아님」을 판정한다.
    92	
    93	**병렬 페이즈 규칙:** `domain/projects/*`·`domain/quotes/*`·프로젝트·견적 폼·`domain/custom-fields/build-schema.ts`·`repositories/field-definitions.ts`의 `listFieldDefinitions`는 고치지 않는다(조건·정렬 불변 — 01이 더한 끝의 선택 `tx`는 두 인자 호출 모양을 바꾸지 않는다). `domain/permissions/project.ts`·`domain/permissions/dto-registry.ts`도 건드리지 않는다.
    94	</objective>
    95	
    96	<execution_context>
    97	@.claude/gsd-core/workflows/execute-plan.md
    98	@.claude/gsd-core/templates/summary.md
    99	</execution_context>
   100	
   101	<context>
   102	@.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md
   103	@.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md
   104	@.planning/phases/04.5-custom-field-admin/04.5-03-SUMMARY.md
   105	@CLAUDE.md
   106	# 범위 Read(UI-SPEC 개정 3, 75ae245 기준):
   107	# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 3」 267–301행(필수 판정 표 · 보관된 선택지가 현재 값 · 보이지 않는 칸) · Copywriting 거래처 폼 줄(140·145–148행) · E4 줄(184–189행) · Assumptions O1·O2·O11
   108	# .planning/phases/04.5-custom-field-admin/04.5-RESEARCH.md Pitfall 3
   109	</context>
   110	
   111	<probe_fallback>
   112	⚠ spec-less probe fallback skipped: phase has no requirement IDs to probe (visible skip). 수용 기준은 ROADMAP 04.5 기준 2·4, UI-SPEC(개정 3) 화면 3 「필수 판정」·「보관된 선택지가 현재 값」과 `## UI Considerations`의 E4 hidden·stale·partial·archived value, Assumptions O1·O2·O11, RESEARCH Pitfall 3에서 끌어왔다.
   113	
   114	**계획 단계 결정(표면화):**
   115	
   116	- **수정 제출에서 「키 없음」과 「빈 값」을 가른다.** UI-SPEC E4 stale은 「칸이 보관·노출 해제됨 → 서버가 저장값 되살림」만 적었다. 반대 방향(폼이 열린 사이 칸이 복원되거나 노출이 켜짐)에서는 폼이 그 칸을 그리지 않았는데 서버는 입력 칸으로 본다. 키 없음 = 비움이면 그 저장값이 지워진다. 그래서 수정 모드에서는 키 없음 = 안 바꿈, 빈 문자열 = 비움으로 정하고, 거래처 폼이 그린 칸을 빈 값까지 모두 보내게 한 줄 바꾼다. 서버 계약과 그 유일한 호출부를 한 커밋에 둔다. 등록에는 저장값이 없어 둘이 같다.
   117	- **입력 칸 집합에 `vendor.value`를 AND로 건다.** 03이 DTO에서 `vendor.value`가 꺼진 사람에게 `customFields`를 통째로 숨긴다. 그런데 폼만 칸을 그리면 기본값이 빈 채로 그려지고, 저장하면 값이 지워진다. 그래서 `vendor.value`가 꺼진 사람의 입력 칸은 0개이고 폼에도 커스텀 칸이 없다. `listVendorFieldDefinitions`가 이 집합을 쓰도록 03의 구현을 좁힌다(같은 파일, 03 다음 wave).
   118	- **입력 밖 존재 키는 버린다(final judge #5).** 거래처 폼은 열 때 받은 칸의 키를 보내므로(`vendor-form.tsx` 96–101행, 수정 모드는 빈 값까지), 폼이 열린 사이 관리자가 칸을 보관·노출 해제하면 정상 사용자도 입력 칸 밖 키를 보낸다. 이를 거부하면 새로 고침 말고 길이 없어 UI-SPEC E4 stale(저장 성공 · 값 유실 없음)과 어긋난다. 그래서 대상 정의 전체 키(`knownKeys`, 보관 포함) 안이면서 입력 칸 밖인 키는 제출값을 버리고 저장값을 유지한다. 위조한 값은 어느 쪽이든 쓰이지 않으므로 T-04.5-05는 그대로 막힌다. `knownKeys` 밖(정의에 없는 키)만 거부해 클라이언트 버그는 크게 드러낸다. 재조회 복구 경로·E2E는 더하지 않는다.
   119	- **없는 키 문구:** UI-SPEC에 없는 상황(정상 화면·오래 열린 폼 모두 정의에 없는 키를 보내지 않는다)이라 새 문구를 만들지 않는다. `UnknownCustomFieldKeyError`(`UserFacingError` 하위)는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(`lib/actions/zod-error-message.ts` 기본 줄과 같은 문자열)를 쓴다.
   120	- **타입 오류 문구:** UI-SPEC은 커스텀 칸의 타입 오류 문구를 따로 정하지 않았다. 칸별 메시지는 기존 `koreanZodErrorMessage`가 그 칸의 이슈만 담은 ZodError를 접어 만든다. 예: 숫자 칸 「abc」 → 「형식이 올바르지 않습니다 · 값을 확인해 주세요」, 없는 선택지 → 「허용되지 않은 값입니다 · {선택지들} 중에서 선택해 주세요」. `lib/actions/zod-error-message.ts`는 바꾸지 않는다. 화면에 새로 나타나는 이 기존 문구를 SUMMARY에 적는다.
   121	- **숨은 필수 칸:** 입력 칸 밖의 필수 칸(보관·끔)은 판정하지 않는다. 볼 수 없는 칸을 채우라고 막을 수 없다.
   122	
   123	**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3이 비워 둔 자리를 기존 문구로 메운 곳 — SUMMARY에만 두지 않는다):**
   124	- **5-A** 커스텀 칸 타입 오류 문구 = 기존 `koreanZodErrorMessage` 줄(예 「형식이 올바르지 않습니다 · 값을 확인해 주세요」). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   125	- **5-B** 없는 키(정의에 없는 키) 거부 문구 = 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(정상 화면·오래 열린 폼에서는 나오지 않는다 — 보관·노출 해제된 칸의 키는 거부하지 않고 버린다). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   126	</probe_fallback>
   127	
   128	<reversibility_notes>
   129	
   130	- 「키 없음 = 안 바꿈, 빈 값 = 비움」 수정 제출 계약 — **reversible**: `preserve.ts` 한 분기와 폼 한 줄이다. 되돌리면 폼이 열린 사이 새로 보이게 된 칸의 값이 지워질 수 있다.
   131	- 입력 칸 집합의 `vendor.value` AND — **reversible**: 판정 함수 한 곳이다.
   132	- 수정의 행 잠금 트랜잭션(`findVendorByIdForUpdate` + `withTransaction`) — **reversible**: `updateVendor` 한 분기와 리포지토리 함수 하나다. 되돌리면 동시 저장이 숨은 칸 값을 되돌리는 틈이 다시 생긴다.
   133	
   134	</reversibility_notes>
   135	
   136	<tasks>
   137	
   138	<task type="auto" tdd="true">
   139	  <name>Task 1: 순수 쓰기 판정 `resolveCustomFieldsWrite` — 없는 키 거부 · 입력 밖 존재 키 버림 · 필수 판정 표 · 보관 선택지 · 타입 검증(칸별 메시지) · 보이지 않는 저장값 되살리기</name>
   140	  <files>domain/custom-fields/preserve.ts, test/unit/domain/custom-fields-preserve.test.ts</files>
   141	  <read_first>
   142	    - `domain/custom-fields/build-schema.ts`(전문 — `FieldDef`, `buildCustomFieldsSchema`, 필수 아닌 칸만 optional, `.strict()`)
   143	    - `lib/actions/zod-error-message.ts`(전문 — `koreanZodErrorMessage`, 기본 줄 문자열) · `lib/actions/user-facing-error.ts`
   144	    - `domain/code-tables/tax-rule.ts`(순수 domain 모듈 선례 — DB·세션 import 없음) · `test/unit/domain/custom-fields-admin.test.ts`(01의 단위 테스트 관례)
   145	    - UI-SPEC 「화면 3」 필수 판정 표·「보관된 선택지가 현재 값」 문단 · Copywriting 거래처 폼 줄
   146	  </read_first>
   147	  <behavior>
   148	    - 입력 모양: `{ mode: "create" | "update", inputDefs, knownKeys, stored, submitted }` — `inputDefs`는 `{ key, label, type, options, archivedOptions, required }`의 칸 정렬 순서 배열, `knownKeys`는 그 대상 정의 전체 키 집합(보관 칸·노출 행 없는 칸 포함, `inputDefs` 키를 모두 포함), `stored`는 그 거래처의 저장 객체(등록이면 빈 객체), `submitted`는 액션이 받은 `customFields` 객체
   149	    - (없는 키) `submitted`에 `knownKeys` 밖 키가 하나라도 있으면(값이 빈 문자열이어도) `UnknownCustomFieldKeyError`를 던지고, 메시지는 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」
   150	    - (입력 밖 존재 키 — E4 stale·hidden) `knownKeys` 안·`inputDefs` 밖 키는 값과 함께 와도 오류가 없다. 그 제출값은 버린다 — 결과의 그 키는 저장값 그대로(저장값이 없으면 결과에 없음, 등록이면 결과에 없음)이고, 필수·보관 선택지·타입 판정에 쓰이지 않는다. 같은 제출의 입력 칸 값은 그대로 반영된다
   151	    - (빈 값) `undefined`·`null`·공백만인 문자열은 빈 값이다. `0`과 `"0"`은 빈 값이 아니다
   152	    - (필수 · 등록) 필수 텍스트 칸이 비면 그 키에 「필수 칸이 비어 있습니다 · 값 입력」, 필수 선택형이 비면 「필수 칸이 비어 있습니다 · 선택지 고르기」
   153	    - (필수 · 수정) 저장값도 비고 제출도 비면 오류가 없고 결과에 그 키가 없다 · 저장값이 있는데 제출이 빈 문자열이면 위와 같은 막힘 문구 · 필수 칸의 키가 제출에 아예 없으면 저장값 그대로(막지 않는다)
   154	    - (필수 아님 · 수정) 제출이 빈 문자열이면 결과에서 그 키가 빠진다(비움) · 키가 없으면 저장값 그대로
   155	    - (보관 선택지) 저장값 「구형」이 `archivedOptions`에 있고 제출도 「구형」이면 통과하고 값 유지 · 제출이 다른 보관 선택지 「폐기」면 그 키에 「보관된 선택지입니다 · 다른 선택지 고르기」 · 등록에서 보관 선택지를 보내도 같은 문구 · 저장값이 활성 선택지면 보관 선택지를 새로 고를 수 없다
   156	    - (타입) 숫자 칸에 「abc」면 그 키에 기존 한국어 한 줄(`koreanZodErrorMessage` 결과) · 선택형에 없는 값이면 기존 「허용되지 않은 값입니다 · … 중에서 선택해 주세요」 · 통과한 값은 기존 검증기가 바꾼 모양 그대로(숫자는 number, 날짜는 기존 `z.coerce.date()` 결과)
   157	    - (여러 칸) 오류가 여럿이면 `CustomFieldsInvalidError.fieldErrors`가 `inputDefs` 순서대로 모든 키를 담는다. 한 칸에는 메시지 하나만 둔다(필수 막힘 → 보관 선택지 → 타입 순으로 첫 것)
   158	    - (되살리기) `stored`에서 `inputDefs` 밖 키(보관 칸·끈 칸·정의가 없어진 키)는 결과에 그대로 들어간다. 입력 칸 값과 합친 새 객체를 돌려주고 인자 객체는 바꾸지 않는다
   159	  </behavior>
   160	  <action>
   161	① RED 먼저. behavior를 표 주도 단위 테스트로 쓰고 빨간 것을 확인한다.
   162	
   163	② `domain/custom-fields/preserve.ts`(순수 — DB·세션·서버 전용 표시 모듈 import 없음):
   164	- 오류 클래스 두 개를 둔다. 둘 다 `UserFacingError` 하위다.
   165	  - `CustomFieldsInvalidError`: `fieldErrors: Record<string, string>`(키 → 메시지 한 줄)를 갖고, `message`는 첫 칸 메시지다. `message`는 액션이 잡지 못했을 때의 폴백이다.
   166	  - `UnknownCustomFieldKeyError`: 메시지는 위 기존 일반 문구다.
   167	- 필수 막힘·보관 선택지 문구는 파일 안 상수로 둔다. 문자열은 UI-SPEC Copywriting 원문 그대로다.
   168	- `resolveCustomFieldsWrite(input)`는 behavior 순서대로 판정한다. 순서는 없는 키(`knownKeys` 밖 → 거부) → 입력 밖 존재 키(`knownKeys` 안·`inputDefs` 밖 → 제출에서 버림) → 칸마다(필수 판정 표 → 보관 선택지) → 타입 검증 → 되살리기다. 버림은 판정 전에 제출 사본에서 그 키를 빼는 것이라 뒤 단계는 `inputDefs` 키만 본다.
   169	- 타입 검증은 기존 `buildCustomFieldsSchema`를 그대로 부른다.
   170	  - 정의는 제출이 비지 않은 입력 칸만 넘기고 `required: false`다. 필수는 이미 위에서 판정했다.
   171	  - 선택형 선택지는 `options`에 `stored[key]`를 더한다. 저장값이 `archivedOptions`에 있을 때만 더한다.
   172	  - `safeParse`의 이슈를 `path[0]`별로 모아, 그 칸 이슈만 담은 ZodError로 `koreanZodErrorMessage`를 부른다.
   173	- 검증기·Phase 4 경로는 바꾸지 않는다. 거래처 경로 어댑터가 이 파일 안에 있다(UI-SPEC O11).
   174	
   175	③ 결과 모양은 `Record<string, unknown>` 새 객체다. 수정 모드의 합치기 규칙:
   176	- 키 없음 → 저장값 유지
   177	- 빈 값 → 뺌
   178	- 값 있음 → 검증된 값
   179	- 입력 칸 밖 저장 키 → 그대로(그 키가 제출에 와도 제출값은 버려져 그대로)
   180	  </action>
   181	  <verify>
   182	    <automated>pnpm vitest run --project unit test/unit/domain/custom-fields-preserve.test.ts &amp;&amp; pnpm typecheck &amp;&amp; pnpm lint</automated>
   183	    <fails_when>vitest failed 개수가 1 이상이거나 tsc·eslint가 error로 끝난다 — 필수 표 네 행 · 보관 선택지 세 경우 · 없는 키 거부(빈 값 포함) · 입력 밖 존재 키 버림(오류 없음 · 저장값 그대로 · 다른 칸 반영) · 키 없음/빈 값 구분 · 되살리기 · 여러 칸 순서 중 하나라도 어긋나면 빨간색이다</fails_when>
   184	  </verify>
   185	  <acceptance_criteria>
   186	    - `grep -v '^\s*//' domain/custom-fields/preserve.ts | grep -cE "from \"@/(repositories|db)|server-only"`가 0이다(순수 모듈)
   187	    - `git diff origin/main -- domain/custom-fields/build-schema.ts lib/actions/zod-error-message.ts`가 비어 있다
   188	    - 막힘·보관 선택지 문구 세 개가 UI-SPEC Copywriting 원문과 글자까지 같다
   189	    - 검증 명령이 초록이다
   190	  </acceptance_criteria>
   191	  <done>거래처 커스텀 값의 쓰기 규칙이 DB 없이 한 함수로 판정되고, 표의 모든 행이 단위 테스트로 고정되어 있다</done>
   192	</task>
   193	
   194	<task type="auto" tdd="true">
   195	  <name>Task 2: 거래처 저장 배선(domain) — 입력 칸 집합 하나(`vendor.value` AND) · 등록·수정이 쓰기 판정을 거침 · 수정의 합치기·쓰기를 행 잠금 한 트랜잭션으로 · 실제 DB 보존·경합 테스트 · Phase 3 픽스처 노출 행</name>
   196	  <files>domain/vendors/index.ts, repositories/vendors.ts, repositories/permissions.ts, test/integration/vendor-custom-fields-save.test.ts, test/integration/custom-fields.test.ts</files>
   197	  <read_first>
   198	    - `domain/vendors/index.ts` 140–175행(`listVendorFieldDefinitions`·`validatedCustomFields` — 01·03이 바꾼 뒤 모양) · `createVendor`(240행 부근) · `updateVendor`(285–340행 — 298행 `existing` 선검사, 318행 `validatedCustomFields`, 320행 `repoUpdateVendor`, 338행 반환 DTO 재조회)
   199	    - `repositories/vendors.ts` 47–50행(`findVendorById`) · 105–110행(`updateVendor` — 전역 `db`로 쓴다)
   200	    - `lib/db-transaction.ts`(`withTransaction`) · `repositories/quote-lines.ts` 21–26행(`tx: DbOrTx = db` 선례) · `domain/quotes/lines.ts` 14행(domain이 `DbOrTx` 타입을 `@/repositories/document-counters`에서 가져오는 선례)
   201	    - `test/unit/vendors/update-archived.test.ts`(주입한 `findVendorById`로 DB 없이 도는 단위 테스트 — 기존 선검사를 트랜잭션 밖에 그대로 두는 이유)
   202	    - `domain/custom-fields/visibility.ts`(03 — `visibleCustomFieldKeys`의 규칙) · `domain/permissions/visible.ts`(`visible(viewer, infoItem)`) · `repositories/permissions.ts` 1–5행(import) · 86–98행 `findVisibility` · 119–128행 `listVisibility`(한 문으로 합칠 두 조회의 모양 — 이 둘은 바꾸지 않는다) · `repositories/field-definitions.ts` 9–15행(`listFieldDefinitions`의 조건·정렬 — 한 문 조회가 같은 조건·정렬을 쓴다) · `eslint.config.mjs` 40–46행(domain → `db` import 금지)
   203	    - `test/integration/setup.ts`(매 테스트 TRUNCATE 뒤 `seedMasterData` — 시드는 커스텀 항목 노출 행을 쓰지 않는다) · `test/integration/custom-fields.test.ts`(전문 118행 — 19·37·54행이 거래처 정의를 직접 넣는다) · `test/integration/custom-field-visibility.test.ts`(03 — 계급·노출 행 픽스처) · `test/integration/quote-lines.test.ts` 80–90행(`insertFieldDefinition` 직접 호출 선례)
   204	  </read_first>
   205	  <behavior>
   206	    - (끈 계급 보존) 거래처 쓰기 권한이 있는 테스트 계급에서 칸 A를 끄고, A 값이 저장된 거래처를 그 계급 사용자가 A 없이 수정 저장한다 → DB의 A 값이 그대로이고 그 사용자의 DTO에는 A가 없다
   207	    - (경합 — 두 연결, Codex #1) 거래처에 칸 A(테스트 계급에게 꺼짐)·칸 E(보임) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 A를 새 값 「관리자가바꾼값」으로 UPDATE하고 커밋하지 않은 채, 테스트 계급 사용자의 `updateVendor`(E만 수정)를 기다리지 않고 시작한다 → 다른 연결로 `pg_stat_activity`에서 `wait_event_type = 'Lock'`이고 `datname = current_database()`인 세션이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → DB의 A는 「관리자가바꾼값」, E는 사용자가 보낸 값이다. 잠금 없는 읽기 → 객체 전체 UPDATE(지금 코드)에서는 A가 옛 값으로 되돌아가 빨갛다 — RED를 실제로 확인한다. 연결 수는 풀(`DB_POOL_MAX` 기본 5) 안에서 셋이다
   208	    - (경합 — 숨김 후 저장, Codex t1t2 MAJOR) 거래처에 칸 A(테스트 계급에게 **보임**) 값이 있다. 테스트가 `db.transaction`으로 연 연결 1에서 그 계급의 `cf.vendor.<A>` 노출 행을 `visible = false`로 UPDATE하고, 같은 연결에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE한 채 커밋하지 않는다 → 테스트 계급 사용자의 `updateVendor`(A에 새 값 「사용자값」)를 기다리지 않고 시작한다 → 다른 연결로 `pg_locks`에 `granted = false` 행이 생길 때까지 폴링한다(50ms 간격, 5초 넘으면 실패) → 연결 1을 커밋한다 → `updateVendor`를 기다린다 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(사용자 제출값은 입력 칸 밖이라 버려짐). 정의·노출을 트랜잭션 전에 읽는 초안에서는 A가 옛 입력 칸 집합에 남아 「사용자값」이 숨은 값을 덮어 빨갛다 — RED를 실제로 확인한다
   209	    - (한 문 조회 — 리포지토리) 거래처 정의 셋(활성 A·B, 보관 C)과 테스트 계급의 `vendor.value` 보임 · `cf.vendor.<A>` 보임 · `cf.vendor.<B>` 꺼짐 · C 행 없음 → `readVendorFieldAccess(SYSTEM_VIEWER, 계급 id)`가 `definitions` 셋(정렬 순서, 보관 포함) · `vendorValueVisible` 참 · `visibleFieldKeys` {A}를 돌려준다 · `vendor.value` 행이 없는 계급은 `vendorValueVisible` 거짓 · `roleId`가 null이면 두 보임 모두 거짓이고 `definitions`는 셋 그대로
   210	    - (경합 — 거래처 정보 끔 + 칸 켬, Codex t1t2-2 MAJOR 회귀) 테스트 계급에 `vendor.value` 보임 · `cf.vendor.<A>` 꺼짐이고 거래처에 A 값이 있다. 연결 1이 한 트랜잭션에서 그 거래처의 A를 「관리자가바꾼값」으로 UPDATE(행 잠금)하고, `vendor.value`를 끄고, `cf.vendor.<A>`를 켠 채 커밋하지 않는다 → 사용자 `updateVendor`(A에 「사용자값」)를 기다리지 않고 시작 → `pg_locks`에 `granted = false` 행이 생길 때까지 폴링(50ms, 5초 넘으면 실패) → 커밋 → 저장은 성공하고 DB의 A는 「관리자가바꾼값」이다(두 보임 변경이 모두 반영된 스냅숏에서 `vendor.value`가 꺼져 입력 칸이 0개)
   211	    - (보관 칸 보존) 칸 B에 값이 있는 거래처를, 픽스처가 B의 `archived_at`을 직접 채운 뒤 시스템 관리자가 수정 저장한다 → B 값 그대로 → 픽스처가 `archived_at`을 null로 되돌리면 DTO에 B 값이 보인다. 보관·복원은 04의 보관 기능을 부르지 않고 `db.update(fieldDefinitions)`로 직접 설정·해제한다 — 04는 같은 wave(4)라 그 산출물에 기대지 않는다
   212	    - (`vendor.value` 끔) `vendor.value`를 끈 계급은 `listVendorFieldDefinitions`가 빈 배열이다. 그 사용자의 수정 저장(커스텀 키 없음)은 모든 커스텀 값을 그대로 둔다. 정의가 있는 커스텀 키를 새 값과 함께 보내도 저장은 성공하고(기본 필드 수정은 반영) 그 칸 저장값은 그대로다
   213	    - (입력 밖 존재 키 — E4 stale·hidden, 저장 성공) 끈 계급 사용자가 A 키(정의 있음, 그 계급에서 꺼짐)를 새 값과 함께 보내며 E를 고친다 → 저장 성공, DB의 A 저장값 불변, E는 보낸 값. 시스템 관리자가 보관된 B 키를 새 값과 함께 보내도 → 저장 성공, B 저장값 불변. 폼이 열린 사이 칸이 보관·노출 해제된 상황과 같은 요청이다
   214	    - (없는 키 — 거부) 누구든 어떤 거래처 정의에도 없는 키를 보내면(값이 빈 문자열이어도, 다른 칸 수정과 함께여도) `UnknownCustomFieldKeyError`이고 DB는 그대로다(행 `updated_at` 불변, 행동 로그 없음)
   215	    - (노출 행 없는 정의) 정의만 있고 노출 행이 하나도 없는 거래처 칸(백필 전 상태)은 시스템 관리자에게도 입력 칸이 아니다 — 그 키를 새 값과 함께 보내도 거부하지 않고 제출값을 버리며, 저장값은 되살리기로 남는다
   216	    - (필수 · 나중에 생긴 칸) 거래처를 만든 뒤 필수 칸 C를 추가한다. 다른 칸만 고쳐 수정 저장(C는 빈 문자열)하면 성공하고 C 키는 없다. 같은 거래처에서 C에 값을 넣어 저장한 뒤 C를 빈 문자열로 저장하면 `CustomFieldsInvalidError` `{ C: "필수 칸이 비어 있습니다 · 값 입력" }`
   217	    - (필수 · 등록) C가 빈 등록은 `CustomFieldsInvalidError`이고 거래처 행이 생기지 않는다
   218	    - (보관 선택지) 선택형 D의 저장값 「구형」을, 픽스처가 `options`에서 빼고 `archived_options`에 넣어(02의 수정 기능을 부르지 않는다 — 02는 이 플랜의 depends_on 밖) 보관한 뒤 「구형」 그대로 저장하면 값 유지. 다른 보관 선택지로 바꾸면 D에 보관 선택지 문구
   219	    - (Phase 3 픽스처) `test/integration/custom-fields.test.ts`의 거래처 정의 세 테스트가 노출 행을 명시로 넣은 뒤 초록이다 — 「등록된 키만 저장」은 값이 저장되고, 「등록되지 않은 키」는 `UnknownCustomFieldKeyError`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다
   220	    - (Phase 4 회귀) `test/integration/quote-lines.test.ts`가 수정 없이 초록
   221	  </behavior>
   222	  <action>
   223	① RED 먼저. behavior를 통합 테스트로 쓰고 빨간 것을 확인한다. 경합 테스트는 지금 코드에서 A가 되돌아가 빨간 것을 실제로 본다. 「경합 — 숨김 후 저장」은 행 잠금은 있고 정의·노출 조회만 트랜잭션 전에 둔 초안에서 빨간 것을 본다(두 RED 출력을 SUMMARY에 인용). 「한 문 조회」는 함수가 없어 빨갛다. 「경합 — 거래처 정보 끔 + 칸 켬」은 두 보임 변경이 저장의 조회 전에 모두 커밋되는 결정적 설계라 여러 문으로 읽는 초안에서도 초록일 수 있다 — 저장의 두 조회 **사이**에 커밋을 끼워 넣는 것은 도메인 안에 테스트 전용 훅 없이는 결정적으로 강제할 수 없으므로, 한 문 구조는 acceptance의 구조 게이트가 고정하고 이 케이스는 끝 상태 회귀를 고정한다(SUMMARY에 이 구분을 적는다).
   224	
   225	② 픽스처(`vendor-custom-fields-save.test.ts`): 파일 머리에 `import { randomUUID } from "node:crypto"`를 더한다. 계급·사용자 픽스처는 03의 통합 테스트 방식을 따른다. 칸은 파일 안 헬퍼 하나로 만든다 — `insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity: "vendor", key, label, type, options?, required, sortOrder })`(`id`는 리포지토리가 요구하는 필수 인자 — `repositories/field-definitions.ts` 22–32행) 뒤 모든 계급(`listRoles(SYSTEM_VIEWER, { includeArchived: true })`)에 `insertVisibilityIfAbsent`로 `cf.vendor.<key>` 보임 행을 명시로 넣는다(01의 생성과 같은 결과를 선택형까지 직접 만든다). 계급별 끄기는 `upsertVisibility`로 한다. 「노출 행 없는 정의」 케이스만 노출 행을 넣지 않는다.
   226	
   227	③ `repositories/vendors.ts`(Phase 4 브랜치 diff 없음 — 계획 때 확인):
   228	- `findVendorByIdForUpdate(viewer, id, tx: DbOrTx)`를 더한다. `findVendorById`와 같은 조회에 `.for("update")`(Drizzle 0.45 `PgSelect.for`)를 붙인다. 트랜잭션 안에서만 부르므로 `tx`는 필수다.
   229	- 기존 `updateVendor(viewer, id, input)`에 마지막 선택 인자 `tx: DbOrTx = db`를 더하고 `db` 대신 `tx`로 쓴다(`repositories/quote-lines.ts` 선례). 기존 호출자는 그대로 돈다.
   230	- `findVendorById`·`updateVendorAccountNumber`·`insertVendor`는 바꾸지 않는다.
   231	- `repositories/permissions.ts`에 `readVendorFieldAccess(viewer, roleId: string | null, tx: DbOrTx = db)`를 더한다 — **SELECT 한 문**(READ COMMITTED에서 한 문 = 한 스냅숏, Codex t1t2-2 MAJOR): `field_definitions`(`entity = 'vendor'`, 보관 포함, `orderBy(sortOrder, key)`)에 `visibility_matrix`를 별칭 둘(Drizzle `alias` — 설치된 `drizzle-orm/pg-core`의 기존 export)로 LEFT JOIN한다. 하나는 `(role_id, 'cf.vendor.' || key)`, 하나는 `(role_id, 'vendor.value')`다(`(role_id, info_item)` 유일이라 행이 늘지 않는다). 돌려주는 모양은 `{ definitions: 정의 행[], vendorValueVisible: boolean, visibleFieldKeys: Set<string> }`이고 행 없음·`roleId` 없음은 거짓이다(정의가 0개면 입력 칸도 0개라 `vendorValueVisible`은 쓰이지 않는다). 기존 `findVisibility`·`listVisibility`는 바꾸지 않는다.
   232	
   233	④ `domain/vendors/index.ts`:
   234	- 파일 안 함수 `vendorInputFieldKeys(viewer, tx?: DbOrTx)`를 둔다(domain은 `db`를 import할 수 없다 — `eslint.config.mjs` 40–46행. 기본값 없이 받은 `tx`를 그대로 넘기고, `= db` 기본값은 리포지토리에만 있다). `readVendorFieldAccess(viewer, viewer.roleId ?? null, tx)`를 **한 번** 부르고, 그 결과만으로 `{ inputDefs, knownKeys }`를 도출한다 — `inputDefs` = `vendorValueVisible`이 참일 때 `archivedAt`이 null이고 `visibleFieldKeys`에 든 정의(칸 정렬 순서, `archived_options`·`label` 포함), 아니면 빈 배열. `knownKeys` = `definitions` **전체**의 키. 규칙은 03의 `visibleCustomFieldKeys`(활성 ∩ `cf.vendor.<key>` 보임)에 `vendor.value` AND를 건 것과 같다.
   235	- `listVendorFieldDefinitions`는 이 집합에 있는 정의만 돌려준다. 01의 보관 제외·`label`과 03의 칸별 보임은 그대로 이 집합이 포함한다.
   236	- 입력 칸 정의·`knownKeys`는 둘 다 `vendorInputFieldKeys`의 결과다(정의 조회를 따로 하지 않는다 — `repositories/field-definitions.ts`의 `listFieldDefinitions`는 이 플랜에서 부르지도 고치지도 않는다). 08의 `listFieldDefinitionsForAdmin`은 비관리자에게 `ForbiddenError`라 쓰지 않는다. `listVendorFieldDefinitions`·`createVendor`는 `tx` 없이(행 삽입 전) 부른다. `updateVendor`는 트랜잭션 **안에서** 행 잠금 **뒤에** `vendorInputFieldKeys(viewer, tx)`로 부른다. 정의 변경은 거래처 행을 건드리지 않으므로 행 잠금이 정의 읽기의 직렬 기준점이다(Codex t1t2 MAJOR — 트랜잭션 전에 읽으면 「숨김 후 저장」 경합에서 숨은 값을 덮는다). 공유 advisory 잠금은 두지 않는다.
   237	- `createVendor`: 저장값 = 빈 객체, 제출값 = `input.customFields ?? {}`로 `resolveCustomFieldsWrite`(`mode: "create"`)를 행 삽입보다 먼저 부른다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
   238	- `updateVendor`:
   239	  - 기존 선검사(`deps.findVendorById` → 없거나 보관이면 `ArchivedVendorError`)는 그 자리에 그대로 둔다. `update-archived` 단위 테스트가 DB 없이 이 경로를 탄다.
   240	  - `input.customFields !== undefined`이면: `withTransaction(async (tx) => …)` 안에서 **먼저** `findVendorByIdForUpdate(viewer, id, tx)`로 행을 잠가 읽는다. 없거나 보관이면 `ArchivedVendorError`다. 그 **뒤에** 같은 `tx`로 입력 칸 정의·`knownKeys`를 계산하고(위 줄), 그 잠근 행의 `customFields`를 저장값으로 `resolveCustomFieldsWrite`(`mode: "update"`)를 부르고, 합친 객체를 `repoUpdateVendor(viewer, id, { …updatePayload, customFields }, tx)`로 같은 트랜잭션에서 쓴다.
   241	  - `input.customFields === undefined`이면 지금처럼 트랜잭션 없이 `repoUpdateVendor` 한 번이다(M-5 — 커스텀 열을 건드리지 않아 경합이 없다).
   242	  - 판정 실패는 트랜잭션 안에서 던져져 롤백된다. 쓰기·행동 로그가 없다.
   243	  - 계좌번호 갱신·`recordAction`·반환 DTO 재조회는 지금 자리 그대로다(트랜잭션 뒤).
   244	  - 잠금은 정의·노출 조회(한 문)·순수 판정·UPDATE 한 번 동안 잡힌다. 정의·노출 조회도 같은 tx 연결이라 두 번째 풀 연결을 잡지 않는다. 트랜잭션 격리 수준은 기본(READ COMMITTED) 그대로다 — REPEATABLE READ는 `FOR UPDATE` 직렬화 오류 재시도를 부른다.
   245	- **원자화 방식(Codex #1) — 행 잠금을 택했다.** 원자적 JSONB 패치(제출한 키만 `||`·`-`로 고침)도 숨은 키를 건드리지 않는다. 그러나 두 가지가 걸린다. (1) 이 저장소에 JSONB 연산자 SQL 선례가 없다. Drizzle `sql` 템플릿은 배열 인자를 목록으로 펼치는 함정도 있다. (2) 필수 판정(「저장값이 있는데 지우면 막힘」)과 보관 선택지(「저장값과 같으면 통과」)가 읽은 뒤 바뀐 저장값으로 판정되는 틈이 남는다. 행 잠금은 `withTransaction` + `tx: DbOrTx = db`(quote-lines) 선례를 그대로 쓰고, Task 1의 순수 함수가 잠근 최신 저장값으로 판정한다. Task 1의 결과 모양도 바뀌지 않는다.
   246	
   247	⑤ `test/integration/custom-fields.test.ts`(Phase 3 파일 — Phase 4 브랜치 diff 없음, Codex #2): 거래처 정의를 `insertFieldDefinition`으로 직접 넣는 세 테스트(19·37·54행 부근)에 그 칸의 노출 행을 명시로 더한다. 파일 안 헬퍼 하나를 둔다. 헬퍼는 `upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: customFieldInfoItem("vendor", key), visible: true, updatedBy: null })`를 부른다. `SYSTEM_VIEWER`의 계급이 시스템 관리자다. 거부 두 테스트의 단언을 제 이유로 좁힌다. 「등록되지 않은 키」는 `rejects.toBeInstanceOf(UnknownCustomFieldKeyError)`, 「선택지에 없는 값」은 `CustomFieldsInvalidError`이고 `fieldErrors.grade`가 있다. 나머지 테스트(`test-entity-…` 대상·중복 키·GIN 인덱스)와 import 순서는 고치지 않는다.
   248	
   249	⑥ `flock /tmp/plant8-erp-test.lock pnpm test:integration` 전체를 한 번 돌려 거래처·견적 줄·프로젝트 회귀를 확인한다.
   250	  </action>
   251	  <verify>
   252	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
   253	    <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(domain/vendors → domain/custom-fields/preserve)와 `update-archived`(선검사가 트랜잭션 밖) 포함</fails_when>
   254	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/vendor-custom-fields-save.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts</automated>
   255	    <fails_when>통합 failed 개수가 1 이상이다 — 끈 계급·보관 칸·`vendor.value` 끔 저장에서 값이 지워지거나, 경합에서 관리자가 바꾼 숨은 칸 값이 되돌아가거나, 「숨김 후 저장」·「거래처 정보 끔 + 칸 켬」 경합에서 사용자 제출값이 관리자 값을 덮거나, 한 문 조회의 모양이 어긋나거나, 없는 키가 거부되지 않거나, 입력 밖 존재 키(끈 칸·보관 칸·노출 행 없는 칸)를 보낸 저장이 거부되거나 그 저장값이 바뀌거나, 필수 표·보관 선택지가 어긋나거나, Phase 3 커스텀 값·Phase 4 견적 줄·누수 스캔이 회귀하면 빨간색이다</fails_when>

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md | sed -n '86,103p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md | sed -n '115,135p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md | sed -n '108,123p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md | sed -n '267,336p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
    86	**OPEN — /plan-design-review(이 플랜이 승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리):**
    87	- **2-A** 보관 선택지 `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — 원문(네이티브 `details`)대로 그대로 둔다(Task 3)
    88	- **2-B** 새 서버 문구 「화면 항목 없음」 — 수정 대상이 없거나 대상 상수 밖일 때의 원인이다. UI-SPEC Copywriting에 없는 문구다(Task 2). 기존 오류 자리에만 한 줄로 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
    89	</objective>
    90	
    91	<execution_context>
    92	@.claude/gsd-core/workflows/execute-plan.md
    93	@.claude/gsd-core/templates/summary.md
    94	</execution_context>
    95	
    96	<context>
    97	@.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md
    98	@.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md
    99	@.planning/phases/04.5-custom-field-admin/04.5-08-SUMMARY.md
   100	@CLAUDE.md
   101	# 범위 Read(UI-SPEC 개정 3, 75ae245 기준):
   102	# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 2」 239–265행(262행 버전 조건부 갱신) · Copywriting 124–150행(138·139행 충돌 문구) · E2 concurrency·stale 줄(177–178행) · Assumptions O3·O11·O12·O20·O22
   103	# .planning/phases/04.5-custom-field-admin/04.5-RESEARCH.md Pitfall 2(보관 선택지 vs z.enum)
   115	
   116	- **수정 제출에서 「키 없음」과 「빈 값」을 가른다.** UI-SPEC E4 stale은 「칸이 보관·노출 해제됨 → 서버가 저장값 되살림」만 적었다. 반대 방향(폼이 열린 사이 칸이 복원되거나 노출이 켜짐)에서는 폼이 그 칸을 그리지 않았는데 서버는 입력 칸으로 본다. 키 없음 = 비움이면 그 저장값이 지워진다. 그래서 수정 모드에서는 키 없음 = 안 바꿈, 빈 문자열 = 비움으로 정하고, 거래처 폼이 그린 칸을 빈 값까지 모두 보내게 한 줄 바꾼다. 서버 계약과 그 유일한 호출부를 한 커밋에 둔다. 등록에는 저장값이 없어 둘이 같다.
   117	- **입력 칸 집합에 `vendor.value`를 AND로 건다.** 03이 DTO에서 `vendor.value`가 꺼진 사람에게 `customFields`를 통째로 숨긴다. 그런데 폼만 칸을 그리면 기본값이 빈 채로 그려지고, 저장하면 값이 지워진다. 그래서 `vendor.value`가 꺼진 사람의 입력 칸은 0개이고 폼에도 커스텀 칸이 없다. `listVendorFieldDefinitions`가 이 집합을 쓰도록 03의 구현을 좁힌다(같은 파일, 03 다음 wave).
   118	- **입력 밖 존재 키는 버린다(final judge #5).** 거래처 폼은 열 때 받은 칸의 키를 보내므로(`vendor-form.tsx` 96–101행, 수정 모드는 빈 값까지), 폼이 열린 사이 관리자가 칸을 보관·노출 해제하면 정상 사용자도 입력 칸 밖 키를 보낸다. 이를 거부하면 새로 고침 말고 길이 없어 UI-SPEC E4 stale(저장 성공 · 값 유실 없음)과 어긋난다. 그래서 대상 정의 전체 키(`knownKeys`, 보관 포함) 안이면서 입력 칸 밖인 키는 제출값을 버리고 저장값을 유지한다. 위조한 값은 어느 쪽이든 쓰이지 않으므로 T-04.5-05는 그대로 막힌다. `knownKeys` 밖(정의에 없는 키)만 거부해 클라이언트 버그는 크게 드러낸다. 재조회 복구 경로·E2E는 더하지 않는다.
   119	- **없는 키 문구:** UI-SPEC에 없는 상황(정상 화면·오래 열린 폼 모두 정의에 없는 키를 보내지 않는다)이라 새 문구를 만들지 않는다. `UnknownCustomFieldKeyError`(`UserFacingError` 하위)는 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(`lib/actions/zod-error-message.ts` 기본 줄과 같은 문자열)를 쓴다.
   120	- **타입 오류 문구:** UI-SPEC은 커스텀 칸의 타입 오류 문구를 따로 정하지 않았다. 칸별 메시지는 기존 `koreanZodErrorMessage`가 그 칸의 이슈만 담은 ZodError를 접어 만든다. 예: 숫자 칸 「abc」 → 「형식이 올바르지 않습니다 · 값을 확인해 주세요」, 없는 선택지 → 「허용되지 않은 값입니다 · {선택지들} 중에서 선택해 주세요」. `lib/actions/zod-error-message.ts`는 바꾸지 않는다. 화면에 새로 나타나는 이 기존 문구를 SUMMARY에 적는다.
   121	- **숨은 필수 칸:** 입력 칸 밖의 필수 칸(보관·끔)은 판정하지 않는다. 볼 수 없는 칸을 채우라고 막을 수 없다.
   122	
   123	**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3이 비워 둔 자리를 기존 문구로 메운 곳 — SUMMARY에만 두지 않는다):**
   124	- **5-A** 커스텀 칸 타입 오류 문구 = 기존 `koreanZodErrorMessage` 줄(예 「형식이 올바르지 않습니다 · 값을 확인해 주세요」). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   125	- **5-B** 없는 키(정의에 없는 키) 거부 문구 = 기존 일반 문구 「입력값이 올바르지 않습니다 · 값을 확인해 주세요」(정상 화면·오래 열린 폼에서는 나오지 않는다 — 보관·노출 해제된 칸의 키는 거부하지 않고 버린다). 기존 오류 자리에만 나오고, 따로 도움말이나 확인 단계를 더하지 않는다
   126	</probe_fallback>
   127	
   128	<reversibility_notes>
   129	
   130	- 「키 없음 = 안 바꿈, 빈 값 = 비움」 수정 제출 계약 — **reversible**: `preserve.ts` 한 분기와 폼 한 줄이다. 되돌리면 폼이 열린 사이 새로 보이게 된 칸의 값이 지워질 수 있다.
   131	- 입력 칸 집합의 `vendor.value` AND — **reversible**: 판정 함수 한 곳이다.
   132	- 수정의 행 잠금 트랜잭션(`findVendorByIdForUpdate` + `withTransaction`) — **reversible**: `updateVendor` 한 분기와 리포지토리 함수 하나다. 되돌리면 동시 저장이 숨은 칸 값을 되돌리는 틈이 다시 생긴다.
   133	
   134	</reversibility_notes>
   135	
   108	**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리 — SUMMARY에만 두지 않는다, OPEN 2 권한 시드 수단은 09):**
   109	
   110	1. **(1-A) 권한 회수 뒤 「다시 시도」:** 제출 중 권한이 회수되면 원인이 「권한 없음」이라 「추가할 수 없음 — 권한 없음 · 다시 시도」의 「다시 시도」가 성공할 수 없다 — UI-SPEC 원문대로 구현하고 디자인 리뷰의 결정을 기다린다(결정이 오면 이 문구만 바꾼다).
   111	3. **「다시 시도」의 모양:** UI-SPEC가 모양을 적지 않은 자리를 버튼이 아닌 글자로 메웠다(위 결정).
   112	</probe_fallback>
   113	
   114	<tasks>
   115	
   116	<task type="auto" tdd="true">
   117	  <name>Task 1: 대상 등록부 · 입력 규칙과 칸 오류 문구 · 이름 예약 · 관리 목록 DTO · 폼 이유 규칙 · 마이그레이션 순서 가드(domain 계약)</name>
   118	  <files>domain/custom-fields/targets.ts, domain/custom-fields/admin-input.ts, domain/custom-fields/admin.ts, lib/actions/form-reason.ts, test/unit/domain/custom-fields-admin.test.ts, test/unit/actions/form-reason.test.ts, test/unit/custom-fields/field-definitions-migration.test.ts, test/integration/field-definitions-admin.test.ts</files>
   119	  <read_first>
   120	    - 01이 만든 `domain/custom-fields/admin-input.ts`·`admin.ts`·`test/integration/field-definitions-admin.test.ts` · 01이 손 편집한 `db/migrations/*_custom_field_admin.sql`(전문)
   121	    - `domain/permissions/info-items.ts`(전문) · `domain/code-tables/tax-rule.ts`(DB 없는 순수 모듈 + 단위 테스트 선례)
   122	    - `repositories/field-definitions.ts`(`listFieldDefinitions`·`FieldDefinitionRow`) · `lib/pg-errors.ts`의 `isUniqueViolation` · `lib/actions/user-facing-error.ts`
   123	    - `app/(app)/admin/vendors/actions.ts` 14–40행(이름 빈칸 zod 메시지 관례) · `lib/actions/handle-server-error.ts`(UserFacingError 메시지 통과 · 일반 문구)
   267	### 화면 3 — 거래처 폼의 커스텀 칸 (`/admin/vendors`, 기존 화면 **변경**)
   268	
   269	```
   270	│ 이름 · 사업자 번호 · 기본 증빙 종류 · 계좌 은행 · 예금주 · 계좌번호       │ ← 기존(변경 없음)
   271	├──────────────────────────────────────────── 1px --line + --s-6(신설) ┤
   272	│ 담당자 연락처  [________________]                                     │
   273	│               필수 칸이 비어 있습니다 · 값 입력                         │ ← 칸 오류(신설)
   274	│ 계약 유형      [구형(레거시) (보관됨) ▾]                                 │
   275	│ [거래처 수정]  수정할 수 없음 — 담당자 연락처 1칸 · 담당자 연락처 고치기  취소 │ ← 이유 자리(신설)
   276	```
   277	
   278	**변경 목록**(`vendor-form.tsx`):
   279	1. `<form>`에 `noValidate`를 더하고 커스텀 칸의 `required={def.required}`(217·231행)를 뺀다 — 브라우저가 `handleSubmit` 전에 제출을 막지 않게. `ui/form/Form`으로 옮기지 않는 더 작은 경로를 택했다. 기본 칸 「이름」의 `required`는 이 페이즈 밖이라 두지만 `noValidate`가 말풍선을 끈다
   280	2. 라벨을 `def.key` → `def.label`
   281	3. 기본 칸과 커스텀 칸 사이 `1px --line` + `--s-6` 구분선(텍스트 머리 없음)
   282	4. **칸별 오류 배선(새 로직)**: 서버가 커스텀 키별 오류를 돌려주고, 폼이 키로 찾아 텍스트·숫자·날짜는 `TextField error`로, 네이티브 select는 로컬 `<p id="cf_{key}-error">`(`--fs-sm --danger`) + `aria-invalid` + `aria-describedby`로 보인다(`ui/select`와 같은 배선)
   283	5. **이유 자리(신설)**: 1차 버튼 옆 `<span id="vendor-form-reason">`(`--fs-sm --danger`) + 3차 「{첫 칸 이름} 고치기」(그 칸으로 포커스). 1차 `aria-describedby`가 이 span을 가리킨다(`role="alert"` 아님). **폼 전체 서버 오류도 이 자리로 옮긴다**(Codex #7, SYSTEM.md 993행 「폼 상단 오류 상자를 두지 않는다」): 195행 `{result.serverError ? <FormAlert>…</FormAlert> : null}`를 지우고(`FormAlert` import도 지운다 — 이 파일에서 다른 사용 없음), 같은 span에 「{등록\|수정}할 수 없음 — {serverError 원문} · 다시 시도」를 쓴다(원문에 「 · 」가 이미 있으면 「 · 다시 시도」를 붙이지 않는다 — Copywriting 표). 서버 오류 줄에는 3차 버튼이 없다(다음 행동은 1차를 다시 누르는 것). 한 응답에 칸 오류와 서버 오류가 함께 오면 칸 오류 요약을 보인다(칸을 고치는 것이 먼저). 위치는 1차 「거래처 등록/수정」 바로 오른쪽, 「취소」 링크 왼쪽 — 칸 오류 요약과 같은 한 자리, 한 번에 한 줄. `duplicateNotice`(193행, 같은 이름 거래처 안내)는 오류가 아니라 이 페이즈에서 바꾸지 않는다. **테스트**: 단위(RTL) — `serverError`가 오면 `#vendor-form-reason`에 문구가 나오고 1차 `aria-describedby`가 그 id를 가리키며, `FormAlert`(폼 상단 상자)가 DOM에 없다
   284	6. 값 보존: 입력은 비제어라 오류 뒤에도 남는다(성공 시 reset만 기존대로)
   285	
   286	**필수 판정**(ROADMAP 기준 2 「고칠 때」 = **그 칸을 고칠 때**, 서버 `validatedCustomFields`가 판정 — RESEARCH Pitfall 3 (a)):
   287	
   288	| 모드 | 저장값 | 제출값 | 결과 |
   289	|------|--------|--------|------|
   290	| 등록 | — | 빈칸 | 막힘 — 칸 오류 + 이유 |
   291	| 수정 | 빈칸(칸이 나중에 생겼거나 필수로 바뀜) | 빈칸 | **안 바꿈 — 막지 않는다**(다른 칸 수정 저장 가능) |
   292	| 수정 | 값 있음 | 빈칸(사용자가 지움) | 막힘 — 칸 오류 + 이유 |
   293	| 수정 | 무엇이든 | 값 있음 | 타입 검증만 |
   294	
   295	제출 전 클라이언트 사전 비활성은 두지 않는다 — 판정이 저장값에 달려 있어 관문은 서버 하나다(§7-15).
   296	
   297	**보관된 선택지가 현재 값**: 저장값이 활성 선택지에 없으면 그 값을 `<option value={값}>{값} (보관됨)</option>`로 **활성화된 채** 목록 끝에 한 개 더한다(disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없으므로 쓰지 않는다). 그 거래처의 폼에만 나타나고 새 거래처·다른 거래처에는 없다. 서버 규칙: 거래처 경로만 기존 검증기(`buildCustomFieldsSchema`, `string[]` 선택지)에 `options ∪ {그 행의 저장값 — 저장값이 archived_options에 있을 때만}`을 넘긴다(어댑터는 거래처 경로 안, 검증기·프로젝트·견적 줄 경로는 바꾸지 않는다). 즉 값이 활성 선택지이거나 **저장값과 같으면**(안 바꿈) 통과, 그 밖의 보관 선택지(폼이 열린 사이 관리자가 보관한 경우 포함)면 「보관된 선택지입니다 · 다른 선택지 고르기」. 「선택 없음」을 고르면 지움(필수면 위 표대로 막힘).
   298	
   299	- 보관된 칸·계급별로 끈 칸: 서버가 `fieldDefs`에서 빼서 렌더하지 않고, 저장 시 기존 값을 서버가 되살린다. 안내 문구 없음
   300	- 폰: §6-3 폼 규칙(라벨 위, 전폭)
   301	- **E2E 필수 범위**: 필수 칸이 저장값 빈 상태에서 다른 칸만 고친 수정 저장 — 텍스트·숫자·날짜·선택 **네 타입 모두**. 등록 시 필수 빈칸 막힘과 문구. 채워진 필수 칸 지우기 막힘. 보관 선택지 현재 값 그대로 저장 시 값 유지. 보관 선택지 새 지정 거부와 문구
   302	
   303	### 화면 4 — 정보 노출표 동적 열 (`/admin/visibility`, 기존 화면 확장)
   304	
   305	`PermissionGridClient`와 `PermissionGrid` CSS는 바꾸지 않는다. 서버가 `columns` 끝에 활성 거래처 `field_definitions` 열을 정렬 순서대로 이어 붙인다(머리글 = `label`, 최대 20자 한 줄, `--g-100` 머리글).
   306	
   307	```
   308	│         │ 손익 숫자 │ 팀 비용 │ … │ 담당자 연락처 │ 갱신일 │
   309	│ 대표     │    ☑     │   ☑    │   │      ☑       │   ☑   │
   310	```
   311	
   312	- 셀 = 즉시 저장, 실패 시 원위치 + 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」(기존 `PermissionGrid.tsx:190·203`)
   313	- 새 칸은 생성과 같은 트랜잭션에서 전 계급 보임으로 등록된다(D10-13)
   314	- 칸이 보관되면 다음 조회부터 열이 빠지고, 계급별 값은 남아 복원 시 돌아온다
   315	- 폰: §7-13 기존 규칙 그대로
   316	- 다섯 상태: §7-13 그대로
   317	
   318	### 관리 인덱스
   319	
   320	「화면 항목」은 §6-10 관리 인덱스 **마스터 그룹, 「코드표」 다음**에만 더한다. 「더보기」 시트·PC 사용자 메뉴는 「관리」 한 줄 그대로(SYSTEM.md 640행). `role-menu.ts`에 `{ key: "admin.field-definitions", label: "화면 항목", href: "/admin/field-definitions", group: ADMIN_GROUP_MASTER }`를 더하고, **같은 계획에서 SYSTEM.md 정본 표(636행 부근 마스터 행)와 그 순서 단위 테스트를 함께 고친다**(DESIGN.md §4 절차 — 정본은 SYSTEM.md이지 이 문서가 아니다).
   321	
   322	### 기존 공유 컴포넌트 — 기록된 시스템 예외
   323	
   324	이 페이즈는 `DeleteToArchive`를 **바꾸지 않고** 재사용한다. 아래 X1~X4는 「범위 밖」 선언이 아니라 **관리자 마스터 화면(코드표·사람·계급·조직·법인카드·거래처·화면 항목) 전부에 같게 걸리는 기록된 임시 예외**다 — `docs/design/DECISIONS.md` 2026-09-24 「§7-1 위험 행동 확인: 관리자 마스터 화면의 인라인 보관 확인(`DeleteToArchive`)을 기록된 임시 예외로」, `docs/design/SYSTEM.md` 671행(§7-1 위험 행동 규칙 아래 예외 줄). 후속 작업이 모달·시트 확인 컴포넌트를 만들어 이 화면들을 한꺼번에 옮기면 예외가 사라진다(화면 하나만 먼저 바꾸지 않는다). X5는 SYSTEM.md 명문 규칙이 아니라 같은 후속 작업에서 함께 다룬다(O4·O24).
   325	
   326	| # | 대상 | 현재 동작 | SYSTEM.md 규칙 | 근거 |
   327	|---|------|-----------|----------------|------|
   328	| X1 | `DeleteToArchive`(`app/(app)/admin/archive/delete-to-archive.tsx`) | 확인이 모달·시트가 아니라 행 안 인라인 문구 + 버튼 | 670행 「위험 행동은 **확인 모달**로 구분」, 839·840행(PC 모달·폰 시트) | 기록된 예외 ① |
   329	| X2 | 같은 컴포넌트 50행 | 확인 줄의 1차 「삭제」(`variant="primary"`)가 **목록 행 안**에 뜬다. 1차 버튼 자체는 839행(위험 확인 모달의 1차 행동)과 맞다 — 어긋나는 것은 표면: 행 안 행동은 3차(661~663행 표), 수정 폼이 열린 채 확인하면 한 화면에 1차가 둘(661행 「1개」) | 661~663행 1차 개수·3차 자리 | 기록된 예외 ①의 결과(모달·시트로 옮기면 함께 사라짐) — Color accent 예약 목록 참고 |
   330	| X3 | 같은 컴포넌트 53행 | 확인 진행 중 「취소」가 잠기지 않는다 | 672행 「같은 폼의 다른 버튼도 비활성」 | 기록된 예외 ② |
   331	| X4 | 같은 컴포넌트 | 확인 진입 때 포커스가 확인 줄로 가지 않고, 취소·완료 뒤 트리거(또는 다음 행)로 돌아오지 않는다 | 844행 「열릴 때 첫 행동 요소에 포커스 … 닫힐 때 원래 요소로 복귀」 | 기록된 예외 ③ |
   332	| X5 | 같은 컴포넌트 | 행마다 반복되는 「삭제」에 대상 이름이 든 접근 이름이 없다(행 머리글 `<th scope="row">`로만 문맥 — E3 backstop) | SYSTEM.md 명문 규칙은 아님(화면 1 「수정」 `aria-label`과 불일치) | DECISIONS.md 같은 항목의 「함께 추적하는 것」 |
   333	
   334	X6(거래처 폼 상단 `FormAlert`)은 이 개정에서 **해소** — 화면 3 변경 5가 이유 자리로 옮긴다.
   335	
   336	---

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md | sed -n '80,245p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
    80	@.planning/phases/04.5-custom-field-admin/04.5-02-SUMMARY.md
    81	@.planning/phases/04.5-custom-field-admin/04.5-05-SUMMARY.md
    82	@CLAUDE.md
    83	# 범위 Read(UI-SPEC 개정 3, 75ae245 기준):
    84	# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 3」 267–301행 전부 · Copywriting 140·145–148행 · E4 줄(184–189행) · Component Inventory 53–54행(폼 상단 상자·네이티브 select) · Assumptions O2·O23·R8
    85	# docs/design/SYSTEM.md §6-3(폼 규칙) · §7-15(화면이 그대로인 폼) · 993행(폼 상단 오류 상자 금지)
    86	</context>
    87	
    88	<probe_fallback>
    89	⚠ spec-less probe fallback skipped: phase has no requirement IDs to probe (visible skip). 수용 기준은 ROADMAP 04.5 기준 2, UI-SPEC(개정 3) 화면 3 변경 1~6·「필수 판정」·「보관된 선택지가 현재 값」·E2E 필수 범위, `## UI Considerations`의 E4 empty·error·partial·stale·hidden·archived value, Assumptions O2·O23·R8에서 끌어왔다.
    90	
    91	**계획 단계 결정(표면화):**
    92	
    93	- **UI-SPEC 「단위(RTL)」 테스트 → 소스 검사 + E2E.** 이 저장소에는 React 렌더 테스트 러너가 없다(`test/unit/ui/next-turn-action.test.ts` 머리 주석 — `@testing-library/react` 미설치). 새 의존성은 이유 한 줄 + 승인 사항이라 이 플랜이 설치하지 않는다. 같은 세 속성을 이렇게 나눠 증명한다.
    94	  - 소스 검사 단위 테스트: 이유 자리 id, 1차의 `aria-describedby`, 폼 상단 상자 부재
    95	  - `CI=true` E2E: `serverError`가 오면 `#vendor-form-reason`에 문구가 나오고, 1차 `aria-describedby`가 그 id이며, 폼 안에 `role="alert"` 상자가 없다(실제 DOM)
    96	  - UI-SPEC 문언과의 차이는 SUMMARY에만 두지 않는다. 아래 OPEN 목록의 편차-06a로 디자인 리뷰에 올린다. RTL 도입은 사용자 승인 뒤 별도 작업이다.
    97	- **칸 이름들 구분자:** UI-SPEC은 「{실패 칸 이름들} {N}칸」만 정했다. 이름 사이는 쉼표 + 공백(「, 」)으로 한다. 가운뎃점은 「원인 · 다음 행동」 구분에 쓰이므로 피한다. 예: 「수정할 수 없음 — 담당자 연락처, 계약 유형 2칸 · 담당자 연락처 고치기」.
    98	- **E2E 격리:** Playwright 설정은 `fullyParallel: false`지만 `workers` 지정이 없어 파일은 여러 워커에서 동시에 돌고 `erp_test` 하나를 나눠 쓴다(`playwright.config.ts` 「함정 6」). `flock`은 프로세스 밖 직렬화라 워커 사이에는 무력하다. 이 스펙이 만든 필수 칸이 **한 순간이라도** 시스템 관리자에게 보이면, 동시에 도는 `vendors.spec.ts`의 등록(36–41행 — 커스텀 값을 보내지 않는다)이 05의 필수 판정에 걸려 막힌다. 그래서 이 스펙의 칸은 처음부터 전용 E2E 계급에만 노출 행을 갖게 만든다. 01 생성 함수의 계급 목록 deps에 그 계급 한 행만 돌려주는 함수를 주입하면, 노출 행이 그 계급에만 생성 트랜잭션 안에서 생긴다. 다른 계급은 행이 없어 숨김이다(`visible()`은 행이 없으면 숨김). 전 계급에 보이게 만든 뒤 따로 끄는 두 단계는 쓰지 않는다 — 그 사이 창이 위 실패를 낸다. 창은 E2E로 잡을 수 없으므로 픽스처 끝의 단언으로 구조를 증명한다: 그 키의 노출 행 중 `onlyRoleId` 행이 있고 `visible = true`이며, 시드 계급 `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID`의 행은 없다. 주입이 무시되면 01이 그 순간의 전 계급에 행을 써 시드 계급에도 생기므로 이 둘의 부재가 곧 주입 증명이다. 행 수를 세지 않는다 — 다른 워커가 UI로 뒤에 만드는 계급이 03의 grant로 행을 받는 것은 의도된 동작이다. 반대 방향 누수도 막는다: 전용 계급은 domain `createRole`이 아니라 리포지토리 `insertRole`로 넣는다(`test/e2e/vendors.spec.ts` 72행 · `test/e2e/permissions-grid.spec.ts` 27행 선례). `createRole`이면 03의 grant가 돌아, 같은 시각 다른 워커 스펙이 만든 필수 칸의 보임 행까지 전용 계급에 생기고, 그 사용자의 거래처 저장이 05의 필수 판정에 막힌다. 주입은 테스트 픽스처에서만 쓰고, 운영 생성 경로의 전 계급 보임 기본값(D10-13)은 그대로다. 05의 입력 칸 집합이 보이는 칸만이라 다른 스펙의 저장은 영향이 없다. 테스트는 그 계급의 픽스처 사용자로 로그인한다.
    99	- **OPEN — /plan-design-review (1-B):** `noValidate`를 켜면 기본 칸 「이름」을 비운 제출이 브라우저 말풍선 대신 서버 문구 「이름을 입력하세요.」를 이름 칸 아래에 보인다. 이 문구는 §8 「원인 · 다음 행동」 모양이 아니고, 기본 칸 문구는 이 페이즈 범위 밖이다. 또 이유 자리 요약이 기본 칸(이름) 오류도 세는지 UI-SPEC이 정하지 않았다. 이 플랜의 구현은 둘 다 그대로 둔다 — 이름 문구는 바꾸지 않고, 요약은 커스텀 칸 오류만 센다(이름만 틀리면 이유 자리는 비고 이름 칸 아래에만 오류). 디자인 리뷰가 정하면 요약 대상과 문구만 바꾼다. SUMMARY 「디자인 리뷰 대기」 목록에 적는다.
   100	- **OPEN — /plan-design-review (편차-06a — 승인된 UI-SPEC 개정 3과 다른 테스트 방식).** UI-SPEC 화면 3은 단위(RTL) 테스트로 세 속성을 증명하라고 했다: 이유 자리 id · 1차 `aria-describedby` · 폼 상단 상자 부재. 이 플랜은 위 「단위(RTL) → 소스 검사 + E2E」 결정대로 나눠 증명한다. 소스 검사 단위 테스트와 `CI=true` E2E의 실제 DOM 단언이다. 디자인 리뷰가 이 대체를 받아들일지 정한다. 결과는 테스트 방식만 바꾸고 화면 동작은 그대로다. SUMMARY 「디자인 리뷰 대기」 목록에도 적는다.
   101	- **예상 비용 다듬기(범위 그대로):** Task 2는 Task 1에서 읽은 `vendor-form.tsx` 전문과 UI-SPEC 화면 3(267–301행)을 다시 읽지 않는다. Task 1 뒤 바뀐 `VendorCustomField`만 Grep으로 위치를 찾아 그 범위만 Read한다. 새로 읽는 것은 `domain/custom-fields/preserve.ts` 하나다. 범위·테스트·파일은 줄이지 않았다.
   102	</probe_fallback>
   103	
   104	<reversibility_notes>
   105	
   106	- 폼 상단 오류 상자 제거 → 이유 자리 — **reversible**: 한 파일의 렌더 자리 이동이다.
   107	- 이유 자리 요약이 커스텀 칸만 센다(OPEN 1-B의 잠정 구현) — **reversible**: 요약 입력 배열 한 곳이다.
   108	
   109	</reversibility_notes>
   110	
   111	<tasks>
   112	
   113	<task type="auto" tdd="true">
   114	  <name>Task 1: 칸 오류와 이유 자리 — 칸 아래 오류(텍스트·숫자·날짜·선택) · `#vendor-form-reason`(칸 오류 요약 + 「{첫 칸} 고치기」 / 서버 오류) · 폼 상단 상자 제거 · `noValidate` · 구분선 · 0칸이면 묶음 없음 · 전용 계급 E2E</name>
   115	  <files>app/(app)/admin/vendors/vendor-form.tsx, app/(app)/admin/vendors/vendors.module.css, lib/actions/form-reason.ts, test/unit/actions/form-reason.test.ts, test/unit/ui/vendor-form-reason.test.ts, test/e2e/vendor-custom-fields.spec.ts, test/e2e/fixtures.ts</files>
   116	  <read_first>
   117	    - `app/(app)/admin/vendors/vendor-form.tsx`(전문 — 05가 바꾼 `handleSubmit`, 136행 `nameError`, 188–206행 커스텀 칸·폼 상단 상자·`formActions`, 210–232행 `VendorCustomField`)
   118	    - `app/(app)/admin/vendors/vendors.module.css`(`.formActions`·`.hint`·`.select` — 토큰만 쓰는 관례) · `docs/design/tokens.css`(`--line`·`--s-6`·`--fs-sm`·`--danger`)
   119	    - `ui/select/Select.tsx`(오류 `<p id="{id}-error">` + `aria-invalid`·`aria-describedby` 배선 선례) · `ui/input/TextField.tsx`(`error` prop) · `ui/button` 1차 버튼이 `aria-describedby`를 넘기는 방식
   120	    - `lib/actions/form-reason.ts`·`test/unit/actions/form-reason.test.ts`(`formReason` — 전체 폼 오류 UI와 함께 08로 옮겨 갔다. 01에 남았으면 01. 어느 쪽인지는 두 SUMMARY 기준)
   121	    - `test/unit/ui/next-turn-action.test.ts`(소스 검사 단위 테스트 관례) · `test/e2e/fixtures.ts`(전문 — `createFixtureUser`, 01의 `archiveE2EFieldDefinitions`) · 01의 칸 생성 함수 시그니처와 `deps`(계급 목록 주입 이름 — Grep으로 그 범위만) · `repositories/roles.ts` `findRoleById` · `repositories/permissions.ts` `listVisibility` · `repositories/field-definitions.ts` `findFieldDefinitionById` · `test/e2e/custom-field-visibility.spec.ts`(03 — 계급별 노출을 끄는 E2E 방식) · `test/e2e/vendor-edit.spec.ts`(수정 폼 여는 방식)
   122	  </read_first>
   123	  <behavior>
   124	    - (단위) `fieldErrorsReason("수정", ["담당자 연락처"])` = `{ text: "수정할 수 없음 — 담당자 연락처 1칸 · ", fix: "담당자 연락처 고치기" }` · 이름 둘이면 「, 」로 잇고 「2칸」, `fix`는 첫 이름
   125	    - (소스 검사) `vendor-form.tsx`(주석 줄 제외)에 폼 상단 오류 상자 컴포넌트 이름이 0회 · `id="vendor-form-reason"`이 1회 · 1차 버튼 props에 `aria-describedby`가 `vendor-form-reason`을 가리킨다 · `<form`에 `noValidate` · 커스텀 칸에 `required={def.required}`가 없다
   126	    - (E2E 격리 준비) 전용 계급(리포지토리 `insertRole` — 03의 grant가 돌지 않는다) + 그 계급 사용자를 만든다(거래처 보기·쓰기, `vendor.value` 보임). 픽스처가 `{ email, password, roleId, roleName }`을 돌려주고, 스펙은 그 `roleId`를 `createE2EFieldDefinition({ onlyRoleId })`에 넘긴다. 이 스펙의 칸은 만들어지는 순간부터 그 계급에 보임 행이 있고, 시스템 관리자를 포함한 시드 계급에는 행이 없어 숨김이다(픽스처가 `onlyRoleId` 행 `visible = true` · `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID` 행 없음을 단언). 전 계급에 보였다가 끄는 창이 없다
   127	    - (E2E 네 타입) 거래처를 먼저 만든 뒤 필수 칸 넷(텍스트·숫자·날짜·선택)을 추가 → 그 거래처 수정 폼에서 「사업자 번호」만 고쳐 「거래처 수정」 → 성공(이유 자리 비어 있음, 목록에 새 사업자 번호)
   128	    - (E2E 등록 막힘) 등록 폼에서 필수 텍스트 칸과 필수 선택형 칸을 비우고 「거래처 등록」 → 두 칸 아래 「필수 칸이 비어 있습니다 · 값 입력」·「필수 칸이 비어 있습니다 · 선택지 고르기」, 이유 자리 「등록할 수 없음 — {두 이름} 2칸 · 」 + 「{첫 이름} 고치기」 → 누르면 첫 칸에 포커스 · 다른 칸에 적은 값이 남아 있다 · 거래처가 생기지 않았다
   129	    - (E2E 지우기 막힘) 필수 텍스트 칸에 값을 넣어 저장한 뒤 그 칸을 비우고 저장 → 막힘 문구와 이유 자리 요약
   130	    - (E2E 서버 오류) 수정 폼을 연 채 픽스처로 그 거래처를 보관 → 「거래처 수정」 → `#vendor-form-reason`에 「수정할 수 없음 — {서버 원문}」(원문 규칙대로 「 · 다시 시도」), 1차 `aria-describedby`가 `vendor-form-reason`, 폼 안에 `role="alert"` 요소 0개, 3차 「… 고치기」 없음
   131	    - (E2E 0칸) 시스템 관리자의 거래처 폼에는 이 스펙의 칸이 없다. `vendor.value`를 끈 두 번째 전용 계급(05의 입력 칸 0개) 사용자의 거래처 폼에는 구분선 요소와 커스텀 칸이 없다
   132	  </behavior>
   133	  <action>
   134	① RED 먼저. 단위·소스 검사·E2E를 쓰고 빨간 것을 확인한다.
   135	
   136	② `lib/actions/form-reason.ts` 끝에 순수 `fieldErrorsReason(verb, names)`를 더한다. 반환은 `{ text, fix }`다. 문구는 UI-SPEC Copywriting 147행 모양이고, 이름 구분자는 「, 」다(계획 단계 결정). 08(또는 01)의 `formReason`은 그대로 둔다. 단위 테스트는 기존 파일 끝에 더한다.
   137	
   138	③ `vendor-form.tsx`:
   139	- (a) `<form>`에 `noValidate`를 더한다. `VendorCustomField`의 커스텀 칸 두 곳(선택형·입력형)에서 정의의 필수 여부를 브라우저 필수 속성으로 넘기는 부분을 뺀다. 라벨이 `def.label`인지 확인한다(01에서 바꿈).
   140	- (b) 커스텀 칸 묶음: `fieldDefs.length > 0`일 때만 구분선 요소(`vendors.module.css`의 새 클래스 — `border-top: 1px solid var(--line)`, 위 간격 `var(--s-6)`, 토큰만)와 칸들을 그린다.
   141	- (c) 칸별 오류: `result.validationErrors?.customFields?.[def.key]?._errors?.[0]`를 `VendorCustomField`에 `error`로 넘긴다.
   142	  - 텍스트·숫자·날짜는 `TextField`의 `error`로 넘긴다.
   143	  - 선택형은 `ui/select/Select.tsx`와 같게 `<p id="cf_{key}-error">`(`vendors.module.css`의 오류 클래스 — `--fs-sm`·`--danger` 토큰)와 select의 `aria-invalid`·`aria-describedby`로 그린다.
   144	- (d) 이유 자리: `.formActions` 안에서 1차 버튼과 「취소」 링크 사이에 `<span id="vendor-form-reason">`(`--fs-sm --danger` 클래스)을 둔다. 1차 버튼에 `aria-describedby="vendor-form-reason"`을 준다.
   145	  - 칸 오류가 하나라도 있으면: `fieldDefs` 순서로 오류가 있는 칸의 `label`을 모아 `fieldErrorsReason(isEditing ? "수정" : "등록", labels)`를 부른다. `text`를 쓰고, 그 뒤 **span 안에** 3차 버튼 `fix`를 둔다. 누르면 `document.getElementById("cf_" + 첫 키)`로 포커스한다.
   146	  - 칸 오류가 없고 `serverError`가 있으면: `formReason(verb, serverError)` 글자만 쓴다. 3차 버튼은 없다.
   147	  - 둘 다 없으면 span은 비어 있다.
   148	- (e) 195행의 폼 상단 오류 상자 줄과 그 import를 지운다. 이 파일에 다른 사용이 없다.
   149	- `duplicateNotice`·기본 칸·계좌번호 줄은 그대로다.
   150	
   151	④ `test/e2e/fixtures.ts` **끝에** 픽스처 세 개를 더한다.
   152	- `createE2EVendorEditor({ vendorValue })`(기본 `true`)
   153	  - 전용 계급을 만든다. 이름은 `E2E` 접두 + 난수다. `repositories/roles.ts`의 `insertRole(SYSTEM_VIEWER, { id, name, sortOrder: 99 })`로 넣는다(`id`는 `role-e2e-` + `randomUUID()`)(`test/e2e/vendors.spec.ts` 72행 · `test/e2e/permissions-grid.spec.ts` 27행 선례). domain `createRole`을 부르지 않는다 — 그러면 03의 grant가 돌아 같은 시각 다른 워커 스펙이 만든 필수 칸의 보임 행까지 이 계급에 생기고, 그 사용자의 거래처 저장이 05의 필수 판정에 막힌다. 이 계급이 칸을 보려면 칸보다 **먼저** 만들어야 한다 — 그러면 01의 생성 경로(잠금 뒤 `listRoles(includeArchived: true)`) 또는 이 스펙의 `onlyRoleId` 주입이 행을 준다.
   154	  - 거래처 메뉴 보기·쓰기 권한 행과 `vendor.value` 노출 행(`vendorValue` 값대로)을 넣는다. 01·03의 insert-if-absent 리포지토리 함수를 쓴다.
   155	  - 반환 계약은 `{ ...credentials, roleId, roleName }`이다. `credentials`는 `createFixtureUser({ roleId })`의 결과다. `createFixtureUser`는 `{ email, password }`만 돌려주므로(`test/e2e/fixtures.ts` 10행) 그 값을 그대로 돌려주면 계급 id가 사라진다. 반환 타입을 명시한다.
   156	    - `roleId`: 이 스펙의 `createE2EFieldDefinition({ onlyRoleId })`가 쓴다.
   157	    - `roleName`: 07 여정이 노출표에서 그 계급 행의 셀을 찾을 때 쓴다. 셀의 aria-label이 계급 이름으로 시작하기 때문이다(`{계급 이름} · [{묶음} · ]{칸 이름}` — `app/(app)/admin/permissions/permission-grid-client.tsx` 39–41행).
   158	  - `createFixtureUser`는 고치지 않는다(더하기만).
   159	- `createE2EFieldDefinition({ label, type, required, options, onlyRoleId })`
   160	  - **먼저**(01의 domain 생성 함수를 부르기 **전**, 잠금 밖) `findRoleById(SYSTEM_VIEWER, onlyRoleId)`(`repositories/roles.ts`)로 그 계급 행을 미리 읽어 둔다. 행이 null이면 던진다. 그런 뒤 01의 domain 생성 함수를 `SYSTEM_VIEWER`로 부르되, **계급 목록 deps에는** 이 미리 읽은 행 하나만 담은 배열을 그대로 돌려주는 함수를 주입한다 — 주입된 함수 자체는 DB를 부르지 않는다(잠금을 쥔 트랜잭션 안에서 전역 `db`로 또 조회하면 01의 T-04.5-07이 막으려던 것과 같은 풀 고갈 경로가 된다). deps의 실제 이름은 01 SUMMARY·코드 기준이다. 01이 계급 목록을 어디서 읽든(트랜잭션 전이든 잠금 안이든) 주입된 함수가 그 자리에서 불리므로, 노출 행은 그 계급에만 생성 트랜잭션 안에서 생긴다. 다른 계급은 행이 없어 숨김이다(`<probe_fallback>` 「E2E 격리」).
   161	  - 만든 뒤 다른 계급의 노출 행을 따로 쓰는 단계는 두지 않는다 — 전 계급 보임이 커밋된 창이 생기면 다른 워커의 등록이 막힌다.
   162	  - 끝에서 단언한다: `listVisibility(SYSTEM_VIEWER)`(`repositories/permissions.ts`)에서 `infoItem`이 `cf.vendor.<key>`인 행 중 `roleId === onlyRoleId`인 행이 있고 그 행의 `visible`이 `true`이며, `roleId`가 `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID`(`domain/permissions/roles.ts` 32·35행 — globalSetup이 만든 시드 계급이라 grant가 다시 돌 일이 없다)인 행은 없다. 어긋나면 던진다. 행 수는 세지 않는다 — 다른 워커가 뒤에 UI로 만드는 계급이 03의 grant로 행을 받는 것은 의도된 동작이다. 생성 전 계급 목록 스냅샷과 대조하지 않는다 — 방금 삽입되고 grant가 아직 도는 계급이 스냅샷에 들어와 거짓 실패를 낸다. `DEFAULT_ROLE_ID`는 기존 4행 import를 고치지 않고 새 import 줄로 더한다(삭제 줄 0).
   163	  - 01의 생성 함수는 `{ id, key }`만 돌려준다. `version`은 `findFieldDefinitionById(SYSTEM_VIEWER, id)`(`repositories/field-definitions.ts`)로 다시 읽어 `{ id, key, version }`을 돌려준다.
   164	- `archiveE2EFieldDefinitionOption(id, option)`: 02의 domain 수정 함수로 그 선택지를 뺀 `options`를 현재 `version`으로 저장한다. 서버가 보관으로 파생한다.
   165	- 거래처 보관은 기존 domain `archive(SYSTEM_VIEWER, "vendor", id)`로 한다.
   166	
   167	⑤ `test/e2e/vendor-custom-fields.spec.ts`(신규):
   168	- behavior의 E2E를 전용 계급 사용자로 쓴다.
   169	- 칸 이름은 `E2E` 접두 + 난수 꼬리(20자 이하)다.
   170	- `afterAll`에서 01의 `archiveE2EFieldDefinitions(접두)`를 부른다.
   171	
   172	⑥ 싼 게이트(lint·typecheck·build)를 먼저 돌리고, 그다음 E2E를 돌린다. 이 플랜 화면의 DOM 감사는 07이 별도 에이전트로 한다.
   173	  </action>
   174	  <verify>
   175	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm vitest run --project unit test/unit/actions/form-reason.test.ts test/unit/ui/vendor-form-reason.test.ts</automated>
   176	    <fails_when>eslint·stylelint·tsc·next build가 error로 끝나거나 두 단위 테스트 중 failed가 1 이상이다 — 요약 문구 · 이유 자리 id · 1차 `aria-describedby` · 폼 상단 상자 부재 · `noValidate` · 커스텀 칸 `required` 부재 중 하나라도 어긋나면 빨간색이다</fails_when>
   177	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/vendor-custom-fields.spec.ts test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts test/e2e/mobile-vendors.spec.ts</automated>
   178	    <fails_when>playwright failed 개수가 1 이상이다 — 네 타입 저장값 빈 필수 칸의 수정 저장이 막히거나, 등록 막힘·지우기 막힘 문구·요약·포커스가 어긋나거나, 서버 오류가 이유 자리에 없거나, 기존 거래처 E2E가 회귀하면 빨간색이다</fails_when>
   179	  </verify>
   180	  <acceptance_criteria>
   181	    - `grep -v '^\s*//' "app/(app)/admin/vendors/vendor-form.tsx" | grep -c "FormAlert"`가 0이다
   182	    - `grep -c 'id="vendor-form-reason"' "app/(app)/admin/vendors/vendor-form.tsx"`가 1이다
   183	    - `git diff origin/main -- test/e2e/fixtures.ts`에 삭제 줄(`^-[^-]`)이 없다
   184	    - `createE2EVendorEditor`의 명시 반환 타입에 `roleId`·`roleName`이 있다. 스펙이 그 `roleId`를 `onlyRoleId`로 넘기고 typecheck가 통과한다
   185	    - `createE2EVendorEditor`가 계급을 리포지토리 `insertRole`로 넣고 domain `createRole`을 부르지 않는다
   186	    - `createE2EFieldDefinition`이 01 생성 함수를 부르기 **전**에 `findRoleById(SYSTEM_VIEWER, onlyRoleId)`로 그 계급 행을 미리 읽고, 계급 목록 deps에는 그 미리 읽은 배열만 돌려주는 함수(DB를 부르지 않음)를 주입해 부르며, 만든 뒤 노출 행을 따로 쓰는 단계가 없다. 끝의 단언(`cf.vendor.<key>` 행 중 `onlyRoleId` 행이 있고 `visible = true` · `SYSADMIN_ROLE_ID`·`DEFAULT_ROLE_ID` 행 없음 — 행 수는 세지 않음)이 있고, E2E 실행에서 그 단언이 한 번도 던지지 않는다
   187	    - `createE2EFieldDefinition`의 반환 `version`은 `findFieldDefinitionById(SYSTEM_VIEWER, id)`로 다시 읽은 값이다
   188	    - `git diff origin/main -- "app/(app)/admin/vendors/vendors.module.css"`에 새 색 리터럴이 없다 — 더한 줄의 값이 `var(--…)` 토큰뿐이다(구분선의 `border-top: 1px solid var(--line)` 폭 `1px`만 예외 — UI-SPEC 화면 3 「변경 목록」 3 「기본 칸과 커스텀 칸 사이 `1px --line` + `--s-6` 구분선」이 그 폭을 직접 지정했고, `stylelint.config.mjs` 머리 주석대로 금지 범위는 색·서체·radius뿐이라 border-width는 대상이 아니다)
   189	    - 화면 문구가 UI-SPEC Copywriting 원문과 같다(막힘 두 변형 · 칸 오류 요약 · 서버 오류 줄)
   190	    - OPEN 1-B와 편차-06a(단위(RTL) → 소스 검사 + E2E)가 SUMMARY 「디자인 리뷰 대기」 목록에 있다
   191	    - 두 검증 명령이 전부 초록이다
   192	  </acceptance_criteria>
   193	  <done>거래처 폼에서 커스텀 칸 오류가 칸 아래와 1차 옆 이유 자리에 보이고, 서버 오류도 같은 자리에 보이며, 폼 상단 상자가 없고, 저장값이 빈 필수 칸 때문에 다른 칸 수정이 막히지 않는다</done>
   194	</task>
   195	
   196	<task type="auto" tdd="true">
   197	  <name>Task 2: 보관된 선택지가 현재 값 — `{값} (보관됨)` 활성 옵션 · 그대로 저장하면 유지 · 폼이 열린 사이 보관된 선택지를 고르면 칸 오류</name>
   198	  <files>app/(app)/admin/vendors/vendor-form.tsx, test/e2e/vendor-custom-fields.spec.ts, test/unit/ui/vendor-form-reason.test.ts</files>
   199	  <read_first>
   200	    - `app/(app)/admin/vendors/vendor-form.tsx` `VendorCustomField`(Task 1 뒤 모양 — Grep으로 위치를 찾아 그 범위만. 전문은 Task 1에서 읽었으니 다시 읽지 않는다) · `customFieldDefaultValue`(47행 부근)
   201	    - UI-SPEC 「보관된 선택지가 현재 값」 문단·O2 — `<context>`의 범위 Read(화면 3 · Assumptions O2)로 이미 읽었으니 다시 읽지 않는다
   202	    - `domain/custom-fields/preserve.ts`(05 — 저장값과 같은 보관 선택지 통과 규칙)
   203	  </read_first>
   204	  <behavior>
   205	    - (소스 검사) 선택형 칸에서 저장값이 활성 선택지에 없을 때 더하는 옵션이 `disabled`가 아니고 글자가 「{값} (보관됨)」이다
   206	    - (E2E 유지) 선택형 칸 「E2E계약…」의 선택지 「구형」을 거래처에 저장 → 픽스처로 「구형」을 보관 → 그 거래처 수정 폼의 선택 칸 현재 값이 「구형 (보관됨)」이고 목록 끝에 있다 → 다른 칸만 고쳐 저장 → 성공, 다시 열어도 「구형 (보관됨)」
   207	    - (E2E 다른 거래처) 새 거래처 등록 폼과 다른 거래처 수정 폼의 그 선택 칸에는 「구형 (보관됨)」 옵션이 없다
   208	    - (E2E 새 지정 거부) 다른 거래처 수정 폼을 연 채 픽스처로 선택지 「신형」을 보관 → 화면에 아직 남은 「신형」을 골라 저장 → 그 칸 아래 「보관된 선택지입니다 · 다른 선택지 고르기」, 이유 자리 요약, 저장값 불변
   209	    - (E2E 선택 없음) 「구형 (보관됨)」 거래처에서 「선택 없음」을 고르면 필수 아님 칸은 지워지고, 필수 칸이면 막힘 문구
   210	  </behavior>
   211	  <action>
   212	① RED 먼저.
   213	
   214	② `VendorCustomField`의 선택형 분기를 바꾼다.
   215	- 조건: 저장값(문자열)이 비어 있지 않고 `def.options`에 없다.
   216	- 그러면 `<option value={값}>{값} (보관됨)</option>`을 목록 **끝에** 하나 더한다. 활성화된 채 둔다 — UI-SPEC O2에 따르면 disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없다.
   217	- `defaultValue`는 그 저장값이다. 새 거래처(저장값 없음)에는 이 옵션이 생기지 않는다.
   218	- 판정은 05의 서버 규칙이 한다. 클라이언트는 제출 전에 막지 않는다(§7-15 — 관문은 서버 하나).
   219	
   220	③ E2E 케이스를 `vendor-custom-fields.spec.ts`에 더한다. Task 1의 전용 계급·픽스처를 쓴다. 소스 검사 한 줄을 `vendor-form-reason.test.ts`에 더한다.
   221	  </action>
   222	  <verify>
   223	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm vitest run --project unit test/unit/ui/vendor-form-reason.test.ts</automated>
   224	    <fails_when>eslint·tsc·next build가 error로 끝나거나 소스 검사 failed가 1 이상이다 — 보관 옵션이 `disabled`이거나 글자가 「{값} (보관됨)」이 아니면 빨간색이다</fails_when>
   225	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/vendor-custom-fields.spec.ts test/e2e/vendor-edit.spec.ts</automated>
   226	    <fails_when>playwright failed 개수가 1 이상이다 — 보관 선택지 현재 값이 그대로 저장되지 않거나, 다른 거래처 폼에 「(보관됨)」 옵션이 나타나거나, 폼이 열린 사이 보관된 선택지가 저장되면 빨간색이다</fails_when>
   227	  </verify>
   228	  <acceptance_criteria>
   229	    - 「(보관됨)」 옵션이 그 거래처 폼에만 있다(E2E 두 폼 대조)
   230	    - 문구 「보관된 선택지입니다 · 다른 선택지 고르기」가 칸 아래에 보인다(UI-SPEC 원문)
   231	    - 두 검증 명령이 전부 초록이다
   232	  </acceptance_criteria>
   233	  <done>선택지가 보관돼도 그 값을 가진 거래처는 값을 잃지 않고 그대로 저장할 수 있으며, 보관된 선택지를 새로 고르는 저장은 칸 오류로 막힌다</done>
   234	</task>
   235	
   236	</tasks>
   237	
   238	<threat_model>
   239	## Trust Boundaries
   240	
   241	| Boundary | Description |
   242	|----------|-------------|
   243	| 서버 → 거래처 폼 | 칸 이름(`label`)·선택지·저장값은 관리자·사용자가 적은 문자열이다 |
   244	| 브라우저 → 거래처 액션 | 폼이 활성화된 「(보관됨)」 옵션을 보내므로 서버 판정(05)만이 관문이다 |
   245	

codex
권한 회수와 대상 없음 오류가 일반 「다시 시도」 문구로 합쳐지는 문제가 보입니다. 테스트 대체는 실제 DOM까지 확인하는 06과, 권한별 숨김을 소스 검사에 의존하는 04를 구분해 평가하고 있습니다.

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md | sed -n '190,330p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md | sed -n '130,211p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   190	    - UI-SPEC `## UI Considerations` 표 전부(154–201행) — 특히 backstop 여섯 줄
   191	    - UI-SPEC 「기존 공유 컴포넌트 — 기록된 시스템 예외」(322–334행 — `DeleteToArchive` 인라인 확인 X1~X4는 결함이 아니라 기록된 예외)
   192	    - `docs/design/SYSTEM.md` §6-3 · §7-3 · §7-13 · 671행 · `docs/design/tokens.css`
   193	    - 01~06·08 SUMMARY의 화면 변경 목록(08 — 전체 폼 오류·이름 예약 UI·복원 링크)
   194	  </read_first>
   195	  <action>
   196	① 싼 게이트를 먼저 돌린다: `pnpm lint`·`pnpm typecheck`·`flock /tmp/plant8-erp-test.lock pnpm build`(`next build`는 공유 `.next`를 쓰므로 잠금).
   197	
   198	② **독립 DOM 감사**는 실행자가 아닌 별도 서브에이전트가 한다.
   199	- `model`을 명시한다. 판정·검토라 CLAUDE.md 모델 선택 규칙대로 Opus 5.
   200	- 프롬프트에 Skill `verification-before-completion`을 명시한다.
   201	- 에이전트는 계획 단계 결정의 테스트 DB 준비 순서를 그대로 밟는다. 순서는 `test/e2e/global-setup.ts` 14–46행과 같다: `pnpm db:reset:test`(빈 DB) → `pnpm db:migrate`(마이그레이션) → `pnpm db:seed`(기본 시드) → 임시 감사 픽스처 시드 → `CI=true` 프로덕션 서버(3100) → Playwright `page.evaluate` 실측. 모두 `DATABASE_URL`을 `erp_test`로 두고, 전체를 `flock /tmp/plant8-erp-test.lock` 하나로 감싼다. 프롬프트에 이 순서와 명령을 그대로 적는다. 스크린샷 육안 판정은 금지다.
   202	- 시드: 텍스트 칸 20개(이름 20자, 공백 없는 문자열 포함), 선택형 칸 셋(활성 선택지 0·1·30개, 30개 중 40자 선택지 포함, 보관 선택지 N개), 20자 이름의 보관된 칸 하나, 커스텀 값이 든 거래처 하나.
   203	- 폭은 1280·1024·375 세 개다.
   204	- 판정 항목 = frontmatter의 `verification: backstop` 여섯 줄. 줄마다 실측값과 통과/실패를 적는다. 예: 넘침 px, sticky 열의 `left` 유지 여부, 1열 여부(칸들의 `left` 동일), `th[scope=row]` 존재, 셀 실패 원위치·문구, 0칸 구분선 부재.
   205	- 노출표 셀 실패는 그 칸을 보관한 뒤 이미 열린 노출표에서 셀을 누르는 방식으로 만든다. 서버가 활성 정의 밖 항목을 거부하기 때문이다.
   206	- 감사가 끝나면 서버를 끄고 `pnpm db:reset:test`로 감사 시드를 지운다(같은 잠금 안에서).
   207	
   208	③ 보고서를 받아 실패 항목만 이 페이즈 화면 파일 안에서 고친다.
   209	- 새 색·서체·radius는 만들지 않는다. 토큰은 `docs/design/tokens.css`에서만 쓴다.
   210	- 시스템을 벗어나야 하면 고치지 말고 SUMMARY에 「디자인 리뷰 대기」로 적는다. CLAUDE.md: DECISIONS.md 기록 + SYSTEM.md 수정은 사용자 결정이다.
   211	- 기록된 예외 X1~X4에 해당하는 관찰은 결함으로 세지 않는다.
   212	- 고친 뒤 실패 항목만 같은 에이전트 방식으로 다시 실측한다.
   213	
   214	④ 고친 파일이 있으면 싼 게이트를 다시 돌린다. 전체 게이트는 Task 3에서 한 번만 돌린다.
   215	  </action>
   216	  <verify>
   217	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build</automated>
   218	    <fails_when>eslint·stylelint·tsc·next build 중 하나라도 error로 끝난다 — 감사 발견 수정이 토큰 밖 값·타입 오류·빌드 실패를 만들었다</fails_when>
   219	    <human-check>독립 DOM 감사 보고서(감사 에이전트 모델명, 1280·1024·375 세 폭, backstop 여섯 줄마다 실측값과 통과/실패, 수정 뒤 재측정 결과)가 04.5-07 SUMMARY에 붙어 있다</human-check>
   220	  </verify>
   221	  <acceptance_criteria>
   222	    - backstop 여섯 줄이 세 폭 모두 통과이거나, 실패 항목이 「디자인 리뷰 대기」로 이유와 함께 SUMMARY에 있다
   223	    - 감사 에이전트가 실행자와 다른 서브에이전트이고 `model`이 명시되어 있다(SUMMARY)
   224	    - 감사 시드 스크립트가 저장소에 없다(`git status --porcelain`에 스크래치패드 밖 새 시드 파일 없음)
   225	    - 수정 diff의 CSS 값이 `var(--…)` 토큰뿐이다
   226	    - 검증 명령이 초록이다
   227	  </acceptance_criteria>
   228	  <done>이 페이즈의 네 화면이 세 폭에서 backstop 여섯 항목을 실측으로 통과하고, 발견은 고쳐졌거나 디자인 리뷰로 넘겨졌다</done>
   229	</task>
   230	
   231	<task type="auto">
   232	  <name>Task 3: 머지 직전 의식 — main 병합 · `insertVisibilityIfAbsent` 재확인 · 자기 마이그레이션 지우고 `pnpm db:generate` 다시 · 채움 순서 재적용 · 공유 파일 더하기만 확인 · 전체 게이트 한 번</name>
   233	  <files>db/migrations/NNNN_custom_field_admin.sql, db/migrations/meta/NNNN_snapshot.json, db/migrations/meta/_journal.json, repositories/permissions.ts, test/unit/ui/role-menu.test.ts, test/e2e/admin-nav.spec.ts, docs/design/SYSTEM.md</files>
   234	  <read_first>
   235	    - `db/migrations/meta/_journal.json`(끝 항목들) · 이 페이즈 마이그레이션 SQL(01이 손으로 넣은 채움 순서 — 01 SUMMARY)
   236	    - `test/unit/custom-fields/field-definitions-migration.test.ts`(01 — 채움 순서 검사) · `test/unit/db/migration-journal.test.ts`(04.1 소유 — 있을 때만)
   237	    - `.squawk.toml` · `scripts/reset-test-db.sh`(빈 DB만) · `scripts/dev-db.sh`(`create_db_if_missing` — 있는 DB는 그대로) · `test/integration/global-setup.ts`(마이그레이션 호출) · `test/e2e/global-setup.ts` 14–46행(스키마 비우기 → 마이그레이션 → 기본 시드)
   238	    - `repositories/permissions.ts`의 `insertVisibilityIfAbsent`(01 — 선택 `tx`) · `git show origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-20-PLAN.md` 215행(인자 둘 계약) · 01 SUMMARY의 생성 롤백 테스트 이름
   239	    - 04 SUMMARY의 「머지 충돌 위험」(`domain/archive/index.ts` 세 곳) · 09 SUMMARY의 관리 인덱스·SYSTEM.md·누수 스캔 변경 줄
   240	  </read_first>
   241	  <action>
   242	① `git fetch origin main`, 그다음 `git merge origin/main`. 충돌은 공유 파일마다 **양쪽 추가를 모두 남기는** 방향으로 푼다. 대상은 오케스트레이터 목록의 더하기만 파일과, 이 페이즈(01·04·06·08·09)가 더한 공유 파일이다.
   243	- `domain/action-log/record.ts`
   244	- `domain/permissions/info-items.ts`
   245	- `domain/permissions/menus.ts`
   246	- `domain/seed/index.ts`
   247	- `test/integration/leak-scan.test.ts`(09의 누수 스캔 배선 포함)
   248	- `_journal.json`
   249	- `vendor-form.tsx`
   250	- `domain/archive/index.ts` · `repositories/archive.ts` · `app/(app)/admin/archive/actions.ts`(04)
   251	- `repositories/permissions.ts`
   252	- `test/e2e/fixtures.ts`(01·06의 픽스처)
   253	- `ui/shell/role-menu.ts` · `docs/design/SYSTEM.md` · `test/unit/ui/role-menu.test.ts` · `test/e2e/admin-nav.spec.ts`(09의 관리 인덱스 링크·메뉴 표)
   254	
   255	다른 페이즈의 줄을 지우지 않는다. 풀기 어려운 충돌은 멈추고 SUMMARY에 적은 뒤 사용자에게 묻는다. 병합 해소로만 손대는 파일은 files_modified에 넣지 않았다. 병합 커밋이 바꾸는 범위는 main이 정하기 때문이다. 대신 ⑤의 보존 검사가 이 목록 전부를 본다.
   256	
   257	② **`insertVisibilityIfAbsent` 조정 — 한 벌로 합치되 선택 `tx`를 지킨다.** 먼저 `git grep -n "export async function insertVisibilityIfAbsent" -- repositories/permissions.ts`로 몇 벌인지 센다.
   258	- 배경: Phase 4 04-20의 계약은 인자 둘 `(viewer, row)`이다(`origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-20-PLAN.md` 215행). 기존 쓰기 패턴도 전역 `db`로 쓴다(`repositories/permissions.ts` 105행 `upsertVisibility`의 `await db`). 반면 01은 같은 함수에 마지막 선택 인자 `tx: DbOrTx = db`를 더했다. 칸 생성 트랜잭션 안에서 노출 행을 쓰기 위해서다(`grantCustomFieldToAllRoles` → `insertVisibilityIfAbsent(…, tx)`).
   259	- **두 벌이면** 한 벌로 합친다. 결과는 main의 이름·앞 두 인자·`onConflictDoNothing` 대상에 이 페이즈의 마지막 선택 인자 `tx: DbOrTx = db`를 더한 모양이다. 쿼리는 전역 `db`가 아니라 `tx`로 시작한다(`await tx` → `.insert(visibilityMatrix)`).
   260	- **main 쪽을 그대로 두고 이 페이즈 쪽을 지우는 해소는 금지다.** 인자 셋 호출이 타입 오류가 나거나, `tx`를 받아도 쿼리가 `db`를 써서 노출 행이 트랜잭션 밖에서 커밋된다. 그러면 노출 행 쓰기가 실패해도 칸 정의가 남아, 01이 증명한 생성 원자성이 깨진다.
   261	- **한 벌인데 main 모양(인자 둘, `db` 사용)이면** 같은 방식으로 선택 `tx`를 더하고 쿼리가 `tx`를 쓰게 고친다. ⑤ 표의 승인 줄은 시그니처 줄과 쿼리 시작 줄이다.
   262	- 호출부는 둘 다 그대로다. 04-20 호출부(인자 둘)는 기본값 `db`로 돈다. 이 페이즈 호출부(인자 셋)도 그대로다. 이 페이즈 호출부를 인자 둘로 줄이는 조정은 금지다.
   263	- 확인: 함수가 한 벌이고, 시그니처에 `tx: DbOrTx`가 있고, 본문이 `tx`로 쓴다. 첫 번째 verify가 자동으로 본다.
   264	- 01이 더한 **생성 롤백 테스트**를 다시 돌린다. 노출 행 INSERT가 중간에 실패하면 칸 정의도 노출 행도 남지 않아야 한다. 파일은 01 SUMMARY가 적은 곳이고, 계획상 `test/integration/field-definitions-admin.test.ts`다. 돌리는 때는 ③에서 마이그레이션을 다시 만들고 (g)를 마친 뒤다. 그 전에는 저널이 정리되지 않아 통합 globalSetup이 마이그레이션을 적용하지 못한다. 명령은 두 번째 verify다.
   265	
   266	③ 마이그레이션을 다시 만든다.
   267	- (a) 이 페이즈 SQL의 손 편집 부분을 스크래치패드에 저장한다. 손 편집 부분은 둘이다. ㉮ `label`을 빈 문자열 기본값으로 더함 → `UPDATE … SET label = key` → 기본값 제거 → unique `(entity, label)`. ㉯ SQL 끝의 기존 거래처 칸 노출 행 채움 — 표시 주석 `-- 04.5: 기존 거래처 칸 노출 행 채움`과 `INSERT INTO "visibility_matrix" … CROSS JOIN "roles" … ON CONFLICT ("role_id", "info_item") DO NOTHING;` 한 문장(01 Task 2 ②).
   268	- (b) 이 페이즈의 SQL·snapshot·`_journal.json` 항목을 지운다. 태그에 `custom_field_admin`이 든 것만이다.
   269	- (c) `pnpm db:generate --name custom_field_admin`을 돌린다. 번호는 drizzle-kit이 main 마지막 + 1로 붙인다. 손으로 번호를 붙이거나 바꾸지 않는다.
   270	- (d) 새 SQL에 (a)의 두 부분을 다시 넣는다. ㉮는 unique 제약과 NOT NULL 전에 채움이 오게 한다. ㉯는 `--> statement-breakpoint`로 나눠 SQL 끝에 표시 주석과 함께 글자 그대로 붙인다 — 08의 문장 순서 가드와 03 Task 2의 선행 조건 grep이 이 주석·문장을 찾는다.
   271	- (e) `pnpm lint:sql`
   272	- (f) **빈 DB 적용 확인** — `flock /tmp/plant8-erp-test.lock bash -c 'pnpm db:reset:test && DATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp_test pnpm db:migrate'`.
   273	  - `pnpm db:reset:test`는 빈 DB만 만든다(`scripts/reset-test-db.sh` 7행). 마이그레이션은 `db:migrate`로 따로 적용한다.
   274	  - 로컬 개발 DB(`erp`)는 이 태스크의 검증에 쓰지 않는다. 옛 번호의 적용 기록 때문에 개발용 `pnpm db:migrate`가 실패할 수 있다. 이때 `pnpm db:dev`는 답이 아니다. 없는 DB만 만들고 있는 DB는 다시 만들지 않는다(`scripts/dev-db.sh`의 `create_db_if_missing`).
   275	  - 개발 DB가 필요하면 로컬 `erp`만 지우고 다시 준비한다: `PGPASSWORD=erp psql -h 127.0.0.1 -U erp -d postgres -c 'DROP DATABASE IF EXISTS erp WITH (FORCE)'` → `pnpm db:dev`(빈 `erp` 생성) → `pnpm db:migrate` → `pnpm db:seed`. 로컬 개발 데이터가 사라지므로 SUMMARY에 적는다. 프로덕션 DB 명령은 금지다.
   276	- (g) `test/unit/db/migration-journal.test.ts`가 있으면 그것과 01의 마이그레이션 검사(`field-definitions-migration.test.ts` — SQL 문장 순서)를 돌린다. 저널 구조 검사(⑤-a)도 이때 돌린다.
   277	- (h) **백필 검증 — 따로 실행하는 단계.** (f)는 빈 DB라 채움 순서가 기존 행에서 통하는지 시험하지 못한다. (g)의 단위 검사는 SQL 글자 순서만 본다. 그래서 기존 행이 있는 DB에 다시 만든 SQL을 실제로 적용한다. 전체를 `flock /tmp/plant8-erp-test.lock bash -c '…'` 하나로 감싸고, `DATABASE_URL`은 `erp_test`다.
   278	  1. `pnpm db:reset:test` — 빈 DB를 만든다.
   279	  2. main까지의 마이그레이션만 적용한다. `git archive origin/main db/migrations | tar -x -C <스크래치패드>/main-mig`로 main의 폴더를 스크래치패드에 푼다. `test/integration/global-setup.ts`의 `migrate(db, { migrationsFolder })` 호출과 같은 임시 스크립트를 그 폴더로 돌린다. 스크립트는 스크래치패드에 두고 저장소에 넣지 않는다.
   280	  3. 옛 모양 행 둘을 `psql`로 넣는다: `field_definitions (id, entity, key, type)` = `('bf-1','vendor','cf_bf000001','text')`, `('bf-2','project','cf_bf000001','text')`. 대상이 다르고 key가 같아서, 채운 뒤 unique `(entity, label)`도 함께 시험한다. 관리자가 끈 행 하나도 넣는다: `visibility_matrix (role_id, info_item, visible)` = `('role-pm','cf.vendor.cf_bf000001',false)`(계급 다섯은 main 마이그레이션 0003이 이미 넣었다).
   281	  4. `pnpm db:migrate` — 이 페이즈 마이그레이션 하나만 더 적용된다.
   282	  5. verify의 조회로 두 행 모두 `label = key`·`version = 1`·`archived_options = []`인지 확인한다. 조회 결과와 `\d field_definitions`(label NOT NULL · 기본값 없음 · unique `(entity, label)`)를 SUMMARY에 붙인다. 이 조회는 ⑥이 DB를 다시 준비하기 **전에** 돈다.
   283	  6. verify의 노출 행 조회로 ㉯가 적용됐는지 확인한다: 모든 계급에 `cf.vendor.cf_bf000001` 행이 있다 · 3에서 끈 `role-pm` 행은 그대로 `false`다(`ON CONFLICT DO NOTHING`) · `cf.project.%` 행은 0이다(거래처 한정) · `role-pm`이 아닌 계급의 `cf.vendor.cf_bf000001` 행은 전부 `visible = true`다(채움이 `true`로 들어갔는지). 조회 결과를 SUMMARY에 붙인다. 이것도 ⑥ 전에 돈다.
   284	
   285	④ 공유 개수를 맞춘다(09가 만든 수 · 표를 main 기준으로 다시 센다).
   286	- `role-menu.test.ts`의 관리 인덱스 링크 수와 `admin-nav.spec.ts`의 라벨 목록을 main의 값 + 1(「화면 항목」)로 맞춘다.
   287	- `docs/design/SYSTEM.md` §6-10 정본 표도 main의 행에 「화면 항목」 한 행을 더한 모양으로 맞춘다.
   288	- 보관함 등록부 항목 수가 main + 1인지, `domain/archive/index.ts`의 항목별 권한 세 곳이 병합 뒤에도 있는지 확인한다(확인만 — 고칠 곳은 ①의 충돌 해소에서 끝난다).
   289	
   290	⑤ **보존 검사 — 「삭제 줄 0」이 아니라 저널 구조 검사 + 승인 목록 대조.** 「모든 공유 파일 삭제 줄 0」은 이 페이즈 계획과 모순이라 쓰지 않는다. JSON 배열 끝에 항목을 더하면 main 마지막 항목의 닫는 `}`에 쉼표가 붙어 그 줄이 `-`로 나온다(`db/migrations/meta/_journal.json` 81행). 또 `vendor-form.tsx`는 01(라벨)·05(제출 수집)·06(폼 변경 1~6)이 main 줄을 바꾼다(현재 100행 · 216행 등).
   291	- (a) **저널 구조 검사** — 줄 diff가 아니라 JSON을 비교한다. verify의 node 한 줄이 확인한다: main의 항목 전부가 같은 자리에 필드까지 같게 남아 있다 · 항목 수 = main + 1 · `idx`가 0부터 빈자리 없이 이어진다 · 마지막 항목이 이 페이즈 항목이다(태그 = 네 자리 번호 + `_custom_field_admin`, 번호 = 그 `idx`). 줄 diff의 `-` 줄은 main 마지막 항목의 닫는 `}` 한 줄뿐이다.
   292	- (b) **공유 파일 보존 검사** — 아래 표의 파일마다 `git diff origin/main -U0 -- <파일>`의 삭제 줄(`-` 한 글자로 시작하는 줄 — `---` 파일 머리는 제외)을 뽑는다. 그 줄은 main에 있는데 이 브랜치에 없는 줄이다. 모두 그 파일의 승인 목록에 있어야 한다.
   293	  - 목록 밖 `-` 줄은 다른 페이즈의 줄을 지운 것이다. main 쪽 줄을 되살린다.
   294	  - 이 페이즈 플랜이 의도한 교체인데 목록에 없으면, 멈추고 사용자에게 그 줄을 보여 승인을 받는다. 스스로 목록을 늘리지 않는다.
   295	  - SUMMARY에 파일마다 `-` 줄 수와 줄별 승인 근거(플랜·항목)를 적는다.
   296	  - 표에 없는 파일이라도 ①에서 충돌이 난 파일은 「승인 줄 없음(더하기만)」으로 같은 검사를 한다.
   297	
   298	| 공유 파일 | 승인된 `-` 줄(이 페이즈가 바꾸는 main 줄) — 이 밖은 전부 보존 | 근거 |
   299	|---|---|---|
   300	| `app/(app)/admin/vendors/vendor-form.tsx` | 01: 칸 라벨 두 줄(선택형 `<label htmlFor={id}>{def.key}</label>` · 입력형 `<TextField … label={def.key} …>`) — 로컬 타입 `VendorFieldDefinition`의 `label: string`은 더하기라 `-` 줄이 없다 · 05: `handleSubmit`의 커스텀 값 수집 줄(`if (raw === "" && !def.required) continue;` 등 99–101행 범위) · 06: `<form ref={formRef} …>` 여는 줄(`noValidate`) · `required={def.required}`가 든 두 줄(`<select …>` · 입력형 `<TextField …>`) · `{fieldDefs.map(…)}` 세 줄(구분선 묶음으로 감싸며 들여쓰기 변경) · `FormAlert` import 줄과 `{result.serverError ? <FormAlert>…` 줄 · 1차 `<Button type="submit" …>` 여는 줄(`aria-describedby`) · `function VendorCustomField(…)` 시그니처 줄(`error` prop) · 선택형 분기의 선택지 렌더 줄(「(보관됨)」 옵션 · 오류 배선) · 07 Task 2: 감사 수정으로 바꾼 줄(Task 2 SUMMARY에 적힌 것만) | UI-SPEC 화면 3 변경 1~6 · 05 ④ · 06 Task 1·2 |
   301	| `db/migrations/meta/_journal.json` | main 마지막 항목의 닫는 `}` 한 줄(쉼표가 붙음) | (a) 구조 검사가 판정 |
   302	| `repositories/permissions.ts` | main의 `insertVisibilityIfAbsent`에 선택 `tx`가 없을 때만: 그 함수의 시그니처 줄과 쿼리 시작 줄(`await db` → `await tx`) — ②의 조정 | 공유 결정(선택 `tx` 보존) · 01 |
   303	| `docs/design/SYSTEM.md` | §6-10 제목의 관리자 화면 수 줄 · 표 마스터 행 한 줄(끝에 「· 화면 항목」) | 09 |
   304	| `test/unit/ui/role-menu.test.ts` · `test/e2e/admin-nav.spec.ts` | 화면 수를 말하는 단언·테스트 제목 줄(수 = main + 1) · 라벨 배열에 원소를 끼워 넣어 바뀐 줄이 있으면 그 줄 | 09 |
   305	| `ui/shell/role-menu.ts` · `domain/permissions/menus.ts` · `domain/permissions/info-items.ts` · `domain/action-log/record.ts` · `domain/seed/index.ts` · `test/integration/leak-scan.test.ts` · `test/e2e/fixtures.ts` · `domain/archive/index.ts` · `repositories/archive.ts` · `app/(app)/admin/archive/actions.ts` | 없음 — 더하기만(verify가 `-` 줄 0을 자동 확인) | 01·03·04·06·08·09의 더하기만 규칙 |
   306	
   307	⑥ **전체 게이트 한 번:** `flock /tmp/plant8-erp-test.lock bash -c 'pnpm db:reset:test && CI=true pnpm test'`.
   308	- DB 준비 순서: `db:reset:test`(빈 DB) → 통합 globalSetup(`test/integration/global-setup.ts`)이 마이그레이션 → E2E globalSetup(`test/e2e/global-setup.ts` 14–30행)이 스키마 비우기 → 마이그레이션 → 기본 시드 → 각 스펙이 자기 픽스처.
   309	- 실패하면 `systematic-debugging` → 수정 → 실패한 계층만 다시 돌린다(같은 잠금). 마지막에 전체 게이트를 한 번 더 돌린다. 이 반복은 SUMMARY에 적는다.
   310	
   311	⑦ 이 태스크 뒤 `/ship` 전에 main이 움직였으면 ①~⑥을 다시 한다. SUMMARY 「다음 단계」에 적는다.
   312	  </action>
   313	  <verify>
   314	    <automated>pnpm lint:sql &amp;&amp; pnpm vitest run --project unit test/unit/custom-fields/field-definitions-migration.test.ts &amp;&amp; (test ! -f test/unit/db/migration-journal.test.ts || pnpm vitest run --project unit test/unit/db/migration-journal.test.ts) &amp;&amp; node -e 'const cp=require("child_process"),fs=require("fs");const m=JSON.parse(cp.execSync("git show origin/main:db/migrations/meta/_journal.json",{encoding:"utf8"})).entries;const h=JSON.parse(fs.readFileSync("db/migrations/meta/_journal.json","utf8")).entries;const last=h[h.length-1];const ok=h.length===m.length+1&amp;&amp;m.every((e,i)=>JSON.stringify(e)===JSON.stringify(h[i]))&amp;&amp;h.every((e,i)=>e.idx===i)&amp;&amp;/^[0-9]{4}_custom_field_admin$/.test(last.tag)&amp;&amp;Number(last.tag.slice(0,4))===last.idx;console.log(ok?"journal OK":"journal FAIL");process.exit(ok?0:1)' &amp;&amp; D="$(git diff origin/main -U0 -- ui/shell/role-menu.ts domain/permissions/menus.ts domain/permissions/info-items.ts domain/action-log/record.ts domain/seed/index.ts test/integration/leak-scan.test.ts test/e2e/fixtures.ts domain/archive/index.ts repositories/archive.ts "app/(app)/admin/archive/actions.ts")" &amp;&amp; test "$(printf '%s\n' "$D" | grep -c '^-[^-]')" = 0 &amp;&amp; N="$(git grep -c "export async function insertVisibilityIfAbsent" -- repositories/permissions.ts)" &amp;&amp; test "${N##*:}" = 1 &amp;&amp; F="$(git grep -A15 "export async function insertVisibilityIfAbsent" -- repositories/permissions.ts)" &amp;&amp; printf '%s\n' "$F" | grep -q "tx: DbOrTx" &amp;&amp; printf '%s\n' "$F" | grep -Eq '(await|return) tx(\.|$)'</automated>
   315	    <fails_when>squawk가 위반을 보고하거나, 채움 순서 검사·04.1의 저널 연속 검사(있을 때) 중 failed가 1 이상이거나, `journal FAIL`이 찍히거나(main 항목이 바뀌거나 빠짐 · `idx` 빈자리 · 이 페이즈 항목이 마지막 하나가 아님 · 번호 ≠ `idx`), 더하기만 공유 파일에서 main 줄이 하나라도 사라졌거나, `insertVisibilityIfAbsent`가 한 벌이 아니거나 선택 `tx` 인자·`tx` 쿼리가 없다(② 조정이 main 모양만 남겼다)</fails_when>
   316	    <automated>flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/field-definitions-admin.test.ts</automated>
   317	    <fails_when>failed 개수가 1 이상이다 — 특히 01의 생성 롤백 테스트(노출 행 INSERT 중간 실패 → 칸 정의·노출 행 0건)가 빨간색이면 병합 뒤 노출 행 쓰기가 트랜잭션 밖으로 나갔다(③(g) 뒤, (h) 전에 돈다)</fails_when>
   318	    <automated>test "$(PGPASSWORD=erp flock /tmp/plant8-erp-test.lock psql -h 127.0.0.1 -U erp -d erp_test -tAc "SELECT count(*) FROM field_definitions WHERE id IN ('bf-1','bf-2') AND label = key AND version = 1 AND archived_options = '[]'::jsonb")" = 2</automated>
   319	    <fails_when>③(h) 직후 결과가 2가 아니다 — 다시 만든 SQL이 기존 행에서 적용되지 않았거나(열 없음으로 psql 오류), `label`이 `key`로 채워지지 않았거나, `version`·`archived_options` 기본값이 틀렸다(⑥ 전에 돈다)</fails_when>
   320	    <automated>test "$(PGPASSWORD=erp flock /tmp/plant8-erp-test.lock psql -h 127.0.0.1 -U erp -d erp_test -tAc "SELECT (SELECT count(*) FROM roles r WHERE NOT EXISTS (SELECT 1 FROM visibility_matrix v WHERE v.role_id = r.id AND v.info_item = 'cf.vendor.cf_bf000001')) || '|' || (SELECT count(*) FROM visibility_matrix WHERE role_id = 'role-pm' AND info_item = 'cf.vendor.cf_bf000001' AND visible = false) || '|' || (SELECT count(*) FROM visibility_matrix WHERE info_item LIKE 'cf.project.%') || '|' || (SELECT count(*) FROM visibility_matrix WHERE info_item = 'cf.vendor.cf_bf000001' AND role_id <> 'role-pm' AND visible = false)")" = "0|1|0|0"</automated>
   321	    <fails_when>③(h) 직후 결과가 `0|1|0|0`이 아니다 — 첫 수가 1 이상이면 재생성에서 노출 행 채움(㉯)이 빠져 기존 거래처 칸이 그 계급에게 숨겨진다 · 둘째 수가 0이면 관리자가 끈 행을 채움이 덮었다(`ON CONFLICT DO NOTHING` 누락) · 셋째 수가 1 이상이면 거래처 밖 대상까지 채웠다 · 넷째 수가 1 이상이면 채움이 visible=true가 아닌 값으로 들어갔다(⑥ 전에 돈다)</fails_when>
   322	    <automated>flock /tmp/plant8-erp-test.lock bash -c 'pnpm db:reset:test &amp;&amp; CI=true pnpm test'</automated>
   323	    <fails_when>종료 코드가 0이 아니거나 단위·통합·E2E 어느 계층이든 failed 개수가 1 이상이다 — 병합 뒤 이 페이즈 또는 Phase 4·병렬 페이즈 동작이 깨졌다(프로덕션 빌드 기준)</fails_when>
   324	  </verify>
   325	  <acceptance_criteria>
   326	    - 이 페이즈 마이그레이션 파일 이름의 번호가 `_journal.json`의 바로 앞 항목(main 마지막) + 1이다
   327	    - 저장소 어디에도 이 페이즈가 손으로 정한 마이그레이션 번호가 없다. 플랜·SUMMARY·코드 모두 `pnpm db:generate` 결과만 인용한다
   328	    - `git grep -c "export async function insertVisibilityIfAbsent" -- repositories/permissions.ts`가 1이다. 그 한 벌이 마지막 선택 인자 `tx: DbOrTx = db`를 받아 쿼리에 쓴다. 04-20 호출부(인자 둘)와 이 페이즈 호출부(인자 셋)가 모두 그대로다
   329	    - 01의 생성 롤백 테스트가 병합·재생성 뒤 다시 돌아 초록이다(SUMMARY에 테스트 이름)
   330	    - 저널 구조 검사가 `journal OK`다 — main 항목 전부 보존, `idx` 연속, 이 페이즈 항목이 마지막 하나
   130	    - `repositories/archive.ts`(전문 — `ArchivableEntry` 25–54행, 거래처 항목 163–178행, `listArchivedAcrossEntities` 181행~) · `repositories/vendors.ts`의 `setVendorArchived`(조건부 UPDATE·`archivedBy`)
   131	    - `domain/archive/index.ts`(전문 — `findEntry` 30행, `assertCanWrite` 38행, `archive` 55행, `restore` 76행, `listArchive`) · `app/(app)/admin/archive/actions.ts`(전문)
   132	    - `test/integration/archive.test.ts`(보관·복원 통합 선례) · `test/unit/archive-revalidate.test.ts`(소스 검사 선례)
   133	    - `domain/custom-fields/targets.ts` · `domain/custom-fields/admin.ts`(01·08·02 — 01 `createFieldDefinition` · 08 이름 예약 판정·문구 · 02 `updateFieldDefinition`) · `domain/custom-fields/visibility.ts`(03 — `customFieldColumns`·`visibleCustomFieldKeys`)
   134	    - UI-SPEC 「화면 1」 230–232행 · 「화면 2」 262·265행
   135	  </read_first>
   136	  <behavior>
   137	    - (a) `admin.archive` 보기·쓰기만 켜고 `admin.field-definitions` 행이 없는 계급으로 `archive(viewer, "field_definitions", id)`·`restore(…)`를 부르면 `ForbiddenError` · 행의 `archived_at`·`version` 불변 · 행동 로그 `archive`·`restore` 없음
   138	    - (b) 소스 검사: `app/(app)/admin/archive/actions.ts`의 복원 액션 본문이 domain `restore(`만 부르고 `can(`·리포지토리 import가 없다(자체 권한 우회 없음) — 거부 자체는 (a)가 증명
   139	    - (c) (a)의 계급으로 `listArchive`하면 칸 정의 행이 0건이고, 거래처 등 다른 항목은 그대로 나온다
   140	    - (d) `admin.field-definitions` 쓰기만 있고 `admin.archive` 쓰기가 없는 계급의 보관·복원이 거부된다
   141	    - (e) 시스템 관리자의 보관 → `archived_at`·`archived_by` 채워짐, `version` + 1, 로그 `archive` · 복원 → 비워짐, `version` + 1, 로그 `restore` · 이미 보관된 칸을 다시 보관하면 버전이 그대로다(멱등)
   142	    - (대상 밖) 리포지토리로 직접 만든 `entity = "project"` 정의는 `archive()`·`restore()`가 `ArchivableRowNotFoundError`로 끝나고 보관함 목록에 없다
   143	    - (보존) 칸 A에 거래처 값이 있고 기획 PM에게서 A를 끈 상태로 A를 보관 → `customFieldColumns`·`listVendorFieldDefinitions`·시스템 관리자 거래처 DTO에서 A가 빠지고 DB의 JSONB 값·노출 행은 그대로 → 복원 → A가 돌아오고 값이 보이며 기획 PM은 여전히 꺼져 있다 · 보관 선택지는 복원 뒤에도 보관된 채
   144	    - (버전 무효화) 수정 폼이 연 버전 v로, 보관 → 복원 뒤 저장하면 충돌 문구로 거부된다
   145	    - (이름 예약) 「계약 유형」 보관 → 같은 이름 등록 거부(보관 문구) → 다른 칸을 그 이름으로 바꾸기 거부 → 옛 칸 복원 성공 · 활성 「계약 유형」 1건
   146	    - (타입 변경 경로) 「계약 유형」(텍스트)을 「계약 유형(옛)」으로 바꾸고 보관 → 새 선택형 「계약 유형」 추가 성공
   147	  </behavior>
   148	  <action>
   149	① RED 먼저.
   150	
   151	② `repositories/field-definitions.ts`: `setFieldDefinitionArchived(viewer, id, value)` — `setVendorArchived`와 같은 조건부 UPDATE(보관은 `archived_at IS NULL`일 때만 시각·보관한 사람을 채우고, 복원은 `IS NOT NULL`일 때만 비움)이고 같은 SET에 `version = version + 1`. 대상 상수 안의 보관 행을 읽는 `listArchivedFieldDefinitions(viewer, entities)`.
   152	
   153	③ `repositories/archive.ts`: `ArchivableEntry`에 선택 필드 `requiredMenu?: string`(주석 한 줄: 보관·복원은 이 메뉴의 write, 보관함 목록은 view를 더 요구 — UI-SPEC O21). 등록부 배열 **끝에** 칸 정의 항목: `entity: "field_definitions"`, `label: "화면 항목"`, `requiredMenu: "admin.field-definitions"`, `setArchived` → `setFieldDefinitionArchived`, `findById` → `findFieldDefinitionById` 결과의 `entity`가 `FIELD_DEFINITION_TARGETS`(`domain/custom-fields/targets.ts` — 순수 모듈이라 repositories가 import해도 순환이 없다) 밖이면 null, `listArchived` → 대상 상수 안의 보관 행을 `{ entity: "field_definitions", label: "화면 항목", id, name: label, archivedAt, archivedBy }`로. 기존 일곱 항목은 건드리지 않는다.
   154	
   155	④ `domain/archive/index.ts`: `archive()`·`restore()`에서 기존 `assertCanWrite` 뒤 `findEntry` 결과에 `requiredMenu`가 있으면 `can(viewer, requiredMenu, "write")`가 거짓일 때 같은 `ForbiddenError`(기존 문구 재사용 — 새 문구 없음)를 던진다(행 조회·쓰기·로그 전에). `listArchive`는 결과에서 `requiredMenu`가 있는 항목의 행을 `can(viewer, requiredMenu, "view")`가 거짓이면 뺀다(항목마다 한 번 판정). `deps.can` 주입을 그대로 쓴다. 이 세 곳 밖의 줄은 고치지 않는다.
   156	
   157	⑤ 소스 검사 단위 테스트 `test/unit/ui/field-definitions-archive-guard.test.ts`에 (b)를 둔다(Task 2가 같은 파일에 페이지 렌더 조건 검사를 더한다).
   158	  </action>
   159	  <verify>
   160	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>
   161	    <fails_when>eslint·tsc가 error로 끝나거나 vitest unit failed가 1 이상이다 — `import-cycles`(repositories/archive → domain/custom-fields/targets)·`archive-revalidate`·(b) 소스 검사 포함</fails_when>
   162	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/field-definitions-archive.test.ts test/integration/archive.test.ts test/integration/field-definitions-admin.test.ts test/integration/custom-field-visibility.test.ts</automated>
   163	    <fails_when>통합 failed 개수가 1 이상이다 — 권한 (a)(c)(d)(e)·대상 밖·값·노출 보존·버전 무효화·이름 예약, 또는 기존 보관함 일곱 항목 회귀</fails_when>
   164	  </verify>
   165	  <acceptance_criteria>
   166	    - `git diff origin/main -- domain/archive/index.ts repositories/archive.ts`에 삭제 줄(`^-[^-]`)이 없다(더하기만) — 머지 충돌 위험(04-07·04-12)을 SUMMARY에 적는다
   167	    - 기존 일곱 항목에 `requiredMenu`가 없다
   168	    - `setFieldDefinitionArchived`의 SET에 `version + 1`이 있고 WHERE가 보관 상태 조건부다
   169	    - 두 검증 명령이 전부 초록이다
   170	  </acceptance_criteria>
   171	  <done>칸은 보관함 권한과 칸 관리 쓰기 권한이 둘 다 있을 때만 보관·복원되고, 보관·복원이 값·노출 설정을 잃지 않으며, 이름 예약 때문에 복원이 같은 이름 둘을 만들 수 없다</done>
   172	</task>
   173	
   174	<task type="auto" tdd="true">
   175	  <name>Task 2: 관리 화면 — 행 「삭제」(두 쓰기 권한일 때만) · 보관 포함 필터·보관 행 · EMPTY 두 종류 · ERROR · 폰 P1/P2 · 복원 재검증 경로 · E2E(보관 → 숨음, 복원 → 다시 보임)</name>
   176	  <files>app/(app)/admin/field-definitions/actions.ts, app/(app)/admin/field-definitions/actions.registry.ts, app/(app)/admin/field-definitions/page.tsx, app/(app)/admin/field-definitions/field-definition-form.tsx, app/(app)/admin/field-definitions/field-definitions.module.css, app/(app)/admin/archive/actions.ts, test/unit/ui/field-definitions-archive-guard.test.ts, test/e2e/field-definitions.spec.ts, test/e2e/mobile-field-definitions.spec.ts</files>
   177	  <read_first>
   178	    - `app/(app)/admin/vendors/page.tsx`(필터 줄 `includeHidden` 토글·`ListEmpty` 두 종류·`canArchive` 판정) · `app/(app)/admin/vendors/vendor-form.tsx` 240–257행(`VendorDeleteButton`) · `app/(app)/admin/vendors/actions.ts`의 `archiveVendorAction` · `actions.registry.ts`의 등록(메뉴 `admin.archive`)
   179	    - `app/(app)/admin/archive/delete-to-archive.tsx`(전문 — props만, 고치지 않는다) · `ui/list-empty/ListEmpty.tsx`
   180	    - `app/(app)/admin/vendors/vendors.module.css`의 폰 칸 접기 · `test/e2e/mobile-vendors.spec.ts`(폰 배치 E2E 선례) · `test/e2e/archive.spec.ts`(보관함 복원 E2E 선례)
   181	    - `docs/design/SYSTEM.md` §7-3(폰 P1/P2) · §7-7(EMPTY·ERROR 한 줄 계약)
   182	    - UI-SPEC 「화면 1」 도해 215–227행 · 230·233·236행 · E1 줄(162–169행)
   183	  </read_first>
   184	  <behavior>
   185	    - (소스 검사) 페이지의 「삭제」 렌더 조건이 `admin.archive` write 판정과 `admin.field-definitions` write 판정의 AND이고 보관 행에는 렌더되지 않는다 · 보관 액션이 `revalidatePath("/admin/archive")`를 부른다(`archive-revalidate` 규약) · 복원 액션이 `/admin/field-definitions`·`/admin/visibility`를 재검증한다
   186	    - (E2E) 칸을 만들고 거래처 하나에 값을 저장 → 목록 행 「삭제」 → 인라인 확인 「{이름} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다」 → 「삭제」 → 기본 목록에서 사라짐 → 「보관 포함」을 누르면 상태 「보관됨」·동작 칸 빈 행 → 거래처 편집 폼과 `/admin/visibility`에 그 칸이 없다 → `/admin/archive`에서 「화면 항목」 행 「복원」 → 거래처 편집 폼에 칸과 저장된 값이 돌아오고 노출표 열도 돌아온다
   187	    - (E2E) 거래처 칸이 전부 보관된 상태(테스트 시작 때 이 스펙의 칸만 있는 조건을 만들 수 없으면 해당 단언은 서버 건수 분기 소스 검사로 대신)에서 기본 목록은 「조건에 맞는 건이 없습니다 · 필터 지우기」, 「필터 지우기」가 보관 포함으로 간다
   188	    - (E2E 폰, `mobile-*.spec.ts` → mobile-375) 목록 행에서 이름·정렬·동작이 보이고 타입·필수·선택지는 접힌 P2 줄에 있으며 가로 스크롤이 없다 · 보관 행은 동작 자리에 「보관됨」
   189	  </behavior>
   190	  <action>
   191	① RED 먼저.
   192	
   193	② `actions.ts`: `archiveFieldDefinitionAction`(`{ id }` → `archive(ctx.viewer, "field_definitions", id)` → `revalidatePath` `/admin/field-definitions`·`/admin/archive`·`/admin/vendors`·`/admin/visibility`). `actions.registry.ts`에 vendors 선례대로 등록(메뉴 `admin.archive`, 동작 `write`, DTO 없음). `app/(app)/admin/archive/actions.ts`의 `restoreArchivedAction` 재검증 목록 **끝에** `/admin/field-definitions`·`/admin/visibility` 두 줄(기존 줄은 그대로).
   194	
   195	③ `field-definition-form.tsx` 끝에 `FieldDefinitionDeleteButton({ id, name })` — `VendorDeleteButton`과 같은 모양으로 `DeleteToArchive`에 `name`·`onArchive`(실패면 `serverError`를 던짐)만 넘긴다. `DeleteToArchive`는 고치지 않는다.
   196	
   197	④ `page.tsx`: `canArchiveWrite = can(viewer, "admin.archive", "write")`와 01·08의 `canWrite`(칸 관리 쓰기 판정 — 어느 플랜에 있는지는 두 SUMMARY 기준)를 계산해 둘 다일 때만 활성 행 동작 열에 「삭제」(「수정」 옆). 필터 줄 왼쪽 3차 토글 「보관 포함」/「보관 제외」(`?includeArchived=1`, 기본 제외, 폼을 연 쿼리를 보존). 목록은 01·08의 `listFieldDefinitionsForAdmin` 결과(보관 포함 전체)로 서버에서 거르고, 전체 0건이면 `ListEmpty` 「등록된 화면 항목이 없습니다 · 화면 항목 추가」(쓰기 권한 없으면 「등록된 화면 항목이 없습니다」만), 기본 필터 0건인데 보관 건이 있으면 「조건에 맞는 건이 없습니다 · 필터 지우기」(→ `?includeArchived=1`). 목록 조회가 던지면 표 본문 자리에 `--danger` 한 줄 「화면 항목을 불러오지 못했습니다 · 다시 시도」(「다시 시도」는 같은 주소로 가는 3차 링크). 보관 행: 상태 「보관됨」, 동작 칸 비움, `?editId=`로 와도 폼 없음(02 조건 유지).
   198	
   199	⑤ `field-definitions.module.css`: vendors 폰 칸 접기와 같은 방식(토큰만) — P1 = 이름·정렬·동작(보관 행은 동작 자리에 「보관됨」), P2 = 타입·필수·선택지, 상태 열은 폰에서 숨고 동작 자리로 합쳐진다. 셀 줄바꿈 속성은 덮어쓰지 않는다.
   200	
   201	⑥ E2E: `field-definitions.spec.ts`에 보관·복원 여정 케이스, `mobile-field-definitions.spec.ts` 신규(파일 이름 규약으로 mobile-375 프로젝트). 만든 칸은 `afterAll`에서 01의 `archiveE2EFieldDefinitions`로 보관한다.
   202	  </action>
   203	  <verify>
   204	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm test:unit</automated>
   205	    <fails_when>eslint·stylelint·tsc·next build가 error로 끝나거나 vitest unit failed가 1 이상이다 — `archive-revalidate`·`field-definitions-archive-guard`·`admin-table-caption`·`page-auth-guard` 포함</fails_when>
   206	    <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/field-definitions.spec.ts test/e2e/mobile-field-definitions.spec.ts test/e2e/archive.spec.ts test/e2e/vendors.spec.ts</automated>
   207	    <fails_when>playwright failed 개수가 1 이상이다 — 삭제 = 보관, 보관 포함 필터, 보관함 복원 뒤 칸·값 복귀, 폰 P1/P2, 또는 기존 보관함·거래처 E2E 회귀</fails_when>
   208	  </verify>
   209	  <acceptance_criteria>
   210	    - `git diff origin/main -- "app/(app)/admin/archive/delete-to-archive.tsx"`가 비어 있다
   211	    - `app/(app)/admin/archive/actions.ts` diff가 재검증 두 줄 추가뿐이다

exec
/bin/bash -lc "rg -n '기본|포커스|Enter|Tab|Escape|안내|설명|힌트|placeholder|로딩|pending|잠금|disabled|EMPTY|ERROR|SUCCESS|PARTIAL|읽기 전용|권한' .planning/phases/04.5-custom-field-admin/04.5-{01,02,03,08,09}-PLAN.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:35:    - "`admin.field-definitions` view·write 권한 행이 있는 시스템 관리자가 `/admin/field-definitions?new=1`에서 이름·타입(텍스트/숫자/날짜)·필수·정렬 순서를 적어 「화면 항목 추가」를 누르면 거래처 폼(`/admin/vendors?new=1`)에 그 칸이 **한글 이름**으로 보인다 — 키(`cf_` + 16진 8자)는 서버가 만들고 화면 어디에도 보이지 않는다(ROADMAP 04.5 기준 1, UI-SPEC 화면 2 등록, A1). 메뉴 등록(`MENUS` → 시드가 시스템 관리자에게 권한 행을 줌)과 관리 인덱스 링크는 08이 한 묶음으로 한다 — 그 전까지 이 플랜의 통합·E2E 테스트는 권한 행을 테스트 준비 단계에서 명시로 넣는다"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:37:    - "칸 생성과 계급 생성(03의 `grantCustomFieldsToRole`)이 동시에 겹쳐도 (계급, 칸) 쌍마다 노출 행이 생긴다 — 칸 생성 트랜잭션은 **첫 문장**으로 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`(`repositories/field-definitions.ts`)를 잡고 그 **뒤에** 계급 목록을 읽는다. 03의 계급 쪽 경로가 같은 잠금 뒤에 칸 정의를 읽으므로 둘은 직렬화되고, 어느 쪽도 상대가 막 커밋한 행을 놓치지 않는다(D10-13 「행 없음 = 숨김」이라 놓치면 영구히 숨음 · T-04.5-07 · 경합 회귀 통합 테스트는 03 Task 1)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:38:    - "잠금·계급 목록 조회·칸 정의 삽입·노출 행 삽입은 전부 **같은 트랜잭션 연결(`tx`)**에서 돈다 — 잠금을 쥔 채 전역 `db`로 계급을 읽으면 잠금 대기 트랜잭션들이 풀(`DB_POOL_MAX` 기본 5, `lib/env.ts:54`)을 다 쥔 때 보유자가 조회용 연결을 영원히(Phase 4 `db/client.ts` 머지 뒤엔 5초 뒤 실패) 기다린다. `createFieldDefinition`을 `DB_POOL_MAX`개 동시에 불러도 전부 성공한다(T-04.5-07 · Codex final-2 #1)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:39:    - "마이그레이션 하나가 `label`(NOT NULL — 기존 행은 `key`로 채움) · `archived_at` · `archived_by` · `archived_options`(JSONB `string[]`, 기본 `[]`) · `version`(integer NOT NULL 기본 1) · unique `(entity, label)`(label 채움 뒤)을 더하고, 이미 있는 거래처 칸 정의마다 `roles` 전 행의 노출표 행(`cf.vendor.<key>`, 보임)을 `ON CONFLICT DO NOTHING`으로 채운다 — 다시 돌려도 행이 늘지 않고, 이미 꺼 둔 행은 꺼진 채다. 번호는 `pnpm db:generate`가 정하고 계획은 번호를 적지 않는다(UI-SPEC O11·O20·O22, D10-13, 그룹 B 요구 · Codex #2)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:41:    - "`admin.field-definitions` view 권한이 없는 계급(기획 PM)은 `/admin/field-definitions`와 `?new=1`에서 404를 받고, write 권한이 없으면 생성 domain 함수가 「권한 없음」 `ForbiddenError`로 끝나며 칸 정의·노출 행·로그가 늘지 않는다(ROADMAP 기준 1, UI-SPEC 화면 1 권한)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:43:    - "`listFieldDefinitions(viewer, entity)`의 호출 모양·정렬(`sortOrder`, `key`)·행 결과는 Phase 4 호출부(`domain/projects`·`domain/quotes`)에 대해 그대로다 — 새 열과 끝의 선택 인자 `tx: DbOrTx = db`(03의 계급 쪽 경로가 잠금과 같은 연결로 읽는 데 씀)가 붙을 뿐 두 인자 호출은 그대로 돌고, `insertFieldDefinition`에서 `label`을 빼면 `key`로 채워 `test/integration/quote-lines.test.ts`·`custom-fields.test.ts` 같은 기존 호출이 그대로 돈다(CONTEXT 「분리로 생긴 조정」, UI-SPEC R7)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:55:      provides: "관리 화면 domain — 생성(권한 게이트·키 생성·키 충돌 재시도·한 트랜잭션·전 계급 노출 행·행동 로그)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:64:      provides: "화면 항목 관리 화면 — 이 플랜은 인증 가드·권한 게이트·제목·`?new=1` 등록 폼(목록 표·결과 줄·칸 오류는 08)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:67:      provides: "한 트랜잭션(중간 실패 롤백) · 전 계급 노출 행 · 로그 · 권한 거부 · 키 충돌 재시도 · label 기본값 · 기존 칸 노출 행 채움(전 계급 · 멱등 · 꺼진 행 유지) · 마이그레이션 문장 순서"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:94:Output: 마이그레이션 1개(`label`·`archived_at`·`archived_by`·`archived_options`·`version`·unique `(entity, label)`·기존 거래처 칸 노출 행 채움) · `domain/custom-fields/{admin-input,admin}.ts` · `repositories/permissions.ts`의 `insertVisibilityIfAbsent`(선택 `tx`) · `/admin/field-definitions` 최소 화면(권한 게이트 + `?new=1` 등록 폼) · 거래처 폼 한글 라벨 · 통합·E2E.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:98:**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`을 호출한다. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. E2E 판정은 `CI=true`다. **공유 테스트 환경 직렬화(공유 결정 3):** 공유 테스트 DB(`erp_test`)·통합 테스트·`db:reset:test`·마이그레이션·E2E 서버 포트 3100·`next build`를 건드리는 명령은 전부 `flock /tmp/plant8-erp-test.lock` 접두로 돌린다(여러 명령을 이으면 `sh -c '…'`로 묶어 잠금 하나 안에서 — flock은 첫 낱말을 실행 파일로 보므로 `CI=true` 같은 환경 변수 대입은 `sh -c '…'` 안이나 `env CI=true …`로 둔다). 단위 테스트·lint·typecheck는 잠그지 않는다. **E2E DB 준비 순서(공유 결정 4):** `pnpm db:reset:test`(빈 DB를 만든다) → Playwright globalSetup `test/e2e/global-setup.ts`(14–31행: 스키마 비우기 → `migrate`로 마이그레이션 → `seedMasterData`로 기본 시드) → 이 스펙의 `beforeAll` 픽스처(권한 행·기획 PM 사용자). `db:dev`는 DB 서버를 띄우고 없는 DB만 만든다 — DB를 다시 만든다고 가정하지 않는다. 화면 검증 순서는 싼 게이트(lint·typecheck·build) → 실행자가 아닌 별도 에이전트의 `CI=true` 독립 DOM 감사(07에서 한 번에) → 수정 → 전체 게이트 한 번이다. 새 의존성 0개. `.planning/`은 GSD 도구로만 쓴다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:112:# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「화면 1」 211–237행(권한 줄) · 「화면 2」 239–265행(키·타입·등록 폼 칸) · Assumptions O11·O20·O22
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:122:**UI Considerations 행 배분(옛 01 → 01·08, 빠진 행 없음):** 이 플랜은 E5 auto-register(한 트랜잭션 노출 행)와 E2(등록 폼)의 **등록 경로 자체**를 덮는다. 옛 01이 덮던 E1(목록)의 populated·zero-one-many·long-text·overflow와 E2의 empty(기본값)·error·loading·success·name-reserved는 전부 08로 옮겼다 — 08의 `must_haves`가 같은 문장으로 받는다. backstop 여섯 줄은 DOM 감사를 하는 07이 옮겼다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:124:**옛 01의 must_have 중 08로 옮긴 것(조용히 뺀 것 없음 — 메뉴 등록·관리 인덱스·액션 등록부·누수 스캔 계약은 08에서 다시 09로 나눴다):** 관리 인덱스 「화면 항목」 링크와 SYSTEM.md §6-10·`role-menu.test.ts`·`admin-nav.spec.ts`의 10 → 11(UI-SPEC O6 — 한 계획에서 함께) · `MENUS` 등록(아래 「메뉴 등록 위치」) · 목록 표 · 정렬 기본값(`nextSortOrder`) · 칸 오류 문구 · 이름 예약(활성·보관, 「보관함에서 복원」 링크의 두 쓰기 권한) · 폼 전체 이유 자리(OPEN 1-A) · 제출 중 잠금 · 결과 줄(1-C, 「하나 더 추가」) · `FieldDefinitionAdminDto`의 누수 스캔 계약(Codex #6) · 액션 등록부(`actions.registry.ts`) · `test/e2e/fixtures.ts`의 `archiveE2EFieldDefinitions`(03·04·06·07이 쓰는 정리 픽스처 — 이 플랜의 스펙도 08에서 `afterAll`로 붙는다) · 마이그레이션 문장 순서 가드 `test/unit/custom-fields/field-definitions-migration.test.ts`(07의 재생성 뒤 손 편집 재적용을 지키는 단위 테스트 — 파일 이름·위치는 그대로, 만드는 플랜만 08) · `targets.ts` 대상 등록부. 이 플랜에 남은 것: 생성 중간 실패 롤백 테스트(`test/integration/field-definitions-admin.test.ts`)와 기존 칸 노출 행 채움의 실행 검증(같은 파일).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:128:- **메뉴 등록 위치 — 09(파일 수 상한과 기존 테스트 결합 때문 — 08에서 나눔):** `domain/permissions/menus.ts`의 `MENUS`에 `admin.*` 키를 더하면 기존 단위 테스트 `test/unit/admin-menu-registry.test.ts`가 같은 키가 `/admin` 인덱스(`ui/shell/role-menu.ts`)에 있기를 요구하고, UI-SPEC O6은 그 인덱스 링크와 SYSTEM.md §6-10 표·순서 테스트를 **같은 계획**에서 고치라고 한다. 공유 결정 1이 인덱스 링크·SYSTEM.md 표·순서 테스트를 08로 보냈고 08의 파일 수 분할로 09가 받았으므로 `MENUS` 등록도 09에 둔다(셋을 떼면 단위 테스트가 빨개지거나 O6이 깨진다). 이 플랜의 화면·domain은 처음부터 최종 권한 판정 `can(viewer, "admin.field-definitions", …)`을 쓴다 — 바뀌는 것은 권한 행이 어디서 오느냐뿐이다. 이 플랜의 통합 테스트는 `beforeEach`에서, E2E는 `beforeAll`에서 `repositories/permissions.ts`의 `upsertPermission`으로 시스템 관리자 view·write 행을 명시로 넣는다(선례: `test/integration/revenue-entries.test.ts` 51–52행). 09가 `MENUS`에 키를 등록하면 시드가 같은 행을 주므로 09가 이 준비 줄을 지운다 — 지운 뒤에도 초록인 것이 시드 경로의 증명이다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:137:- **목록 조회의 선택 `tx`(Codex final-2 #1 · T-04.5-07):** 잠금을 쥔 트랜잭션 안의 조회가 전역 `db`로 가면 풀 고갈 교착이 된다 — 그래서 `listRoles`·`listFieldDefinitions` 끝에 선택 인자 `tx: DbOrTx = db`를 더한다(기존 호출 모양 그대로 — `repositories/quote-lines.ts:23`·`projects.ts:246` 선례. 두 파일은 PATTERNS 공유 파일 목록에 없다). 이 때문에 `repositories/roles.ts`가 16번째 파일이 되어 상한 15를 하나 넘는다 — 시그니처 한 줄과 쿼리 대상 한 단어뿐이라 문맥 비용이 거의 없고, 이미 목록에 있는 파일(`repositories/permissions.ts`)에 tx 판 계급 목록을 따로 두는 대안은 `listRoles` 조회를 복제하므로 택하지 않았다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:138:- **이 플랜의 등록 폼 범위:** 칸 넷(이름·타입·필수·정렬 순서) + 1차 「화면 항목 추가」 + 2차 「취소」. 성공하면 폼을 닫는다(`router.replace("/admin/field-definitions")`). 결과 줄·칸 오류·이유 자리·제출 중 잠금·정렬 기본값·목록 표는 08의 E2 행이다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:146:- 메뉴 키 `admin.field-definitions` — **costly**: 권한표 행이 참조한다(등록은 09, 판정 문자열은 이 플랜부터).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:154:  <name>Task 1: 트레이서 — 권한 행이 있는 시스템 관리자가 `/admin/field-definitions?new=1`에서 텍스트 칸을 추가하면 거래처 폼에 그 한글 이름이 보인다(마이그레이션 → 리포지토리 → domain(한 트랜잭션 + 전 계급 노출 행) → 생성 액션 → 최소 관리 화면·폼 → 거래처 폼 → E2E)</name>
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:156:  <reversibility rating="costly">마이그레이션·항목 키 규약 `cf.<entity>.<key>`·칸 키 형식·메뉴 키 문자열이 운영 데이터(노출 행·JSONB 키·권한 행)에 새겨진다. 모양은 UI-SPEC O11·O20·O22·RESEARCH A1·A4를 따른 계획 재량이다.</reversibility>
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:160:    - `lib/db-transaction.ts`(`withTransaction`) · `db/client.ts` 29–48행(풀 `max: env.DB_POOL_MAX`·`DbOrTx`) · `lib/env.ts` 54행(`DB_POOL_MAX` 기본 5) · `lib/pg-errors.ts`의 `isUniqueViolation`
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:164:    - `test/integration/custom-fields.test.ts`(행 id·픽스처 관례) · `test/integration/setup.ts`(매 테스트 TRUNCATE + `seedMasterData`) · `test/integration/revenue-entries.test.ts` 45–55행(`upsertPermission`으로 권한 행을 테스트에서 준비하는 선례) · `test/e2e/fixtures.ts`(전문 — `createFixtureUser`) · `test/e2e/vendor-edit.spec.ts` 1–40행(`loginAsSysadmin`) · `test/e2e/code-tables-write-gate.spec.ts`(E2E가 `@/repositories/`를 import하는 선례·권한 없는 계급의 접근)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:166:    - UI-SPEC 「화면 1」 229–231행(권한·대상) · 「화면 2」 239–255행(칸 넷·키·타입)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:172:    - (통합) 기획 PM(`DEFAULT_ROLE_ID`) viewer의 `createFieldDefinition`이 메시지 「권한 없음」의 `ForbiddenError`로 끝나고 칸 정의·노출 행·로그 수가 그대로다
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:175:    - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 서로 다른 이름으로 `createFieldDefinition`을 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개 `Promise.all`로 동시에 부르면 전부 성공하고, 새 칸마다 `roles` 전 행의 `cf.vendor.<key>` 노출 행이 하나씩 있다(칸 수 × 계급 수). 계급 목록을 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 이 케이스가 시간 초과로 빨갛다 — RED가 시간 초과 형태임을 SUMMARY에 적는다(교착이 풀에 남아 뒤 케이스까지 멈추므로 RED 확인은 이 케이스만 `-t`로 돌린다)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:182:② **스키마·마이그레이션.** `db/schema/field-definitions.ts`에 `label`(text, NOT NULL) · `archivedAt`·`archivedBy`(거래처 표와 같은 선언) · `archivedOptions`(jsonb, NOT NULL, 기본 빈 배열, `string[]` 타입) · `version`(integer, NOT NULL, 기본 1) · unique 제약 `field_definitions_entity_label_key`(`entity`, `label`)를 더하고 표 위 주석에 한 줄(보관 선택지는 `archived_options`, `options`는 활성만 · 이름은 보관 칸까지 예약 · `version`은 조건부 갱신용 — UI-SPEC O11·O20·O22)을 더한다. `flock /tmp/plant8-erp-test.lock pnpm db:generate --name custom_field_admin`으로 SQL·스냅샷·journal 항목을 만든다(번호는 도구가 정함 — 생성 명령 출력을 SUMMARY에 인용). 생성된 SQL의 `label` 줄을 손으로 세 문장으로 바꾼다: 기본값 빈 문자열의 NOT NULL로 열 추가 → `UPDATE "field_definitions" SET "label" = "key"` → `ALTER COLUMN "label" DROP DEFAULT`. unique `(entity, label)` 제약 추가 문장이 이 채움 **뒤**에 오게 순서를 맞춘다(기존 행이 있는 DB에서 NOT NULL·unique 추가가 실패하지 않게 — RESEARCH Pitfall 1; `(entity, key)`가 이미 유일이라 채움 뒤 충돌 없음). `pnpm lint:sql`이 이 모양을 받는지 확인하고, squawk가 거부하면 규칙을 끄지 말고 squawk가 받는 동등한 채움 모양으로 바꾼다. 손 편집한 SQL 본문을 SUMMARY에 그대로 옮겨 둔다(07의 머지 직전 재생성이 이것을 다시 입힌다). 기존 거래처 칸 노출 행 채움 문장은 Task 2다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:184:③ **리포지토리.** `insertFieldDefinition`에 선택 `label`(없으면 `key`)과 마지막 선택 인자 `tx: DbOrTx = db`를 더하고, 쿼리를 그 `tx`로 돌린다. `listFieldDefinitions`에도 마지막 선택 인자 `tx: DbOrTx = db` 하나만 더하고 쿼리를 그 `tx`로 돌린다 — 조건·정렬(`where(entity)`·`orderBy(sortOrder, key)`)은 그대로이고, 두 인자 호출(`domain/projects/index.ts:30`·`domain/quotes/lines.ts:27`·`domain/vendors`)은 인자를 바꾸지 않는다(CONTEXT 「분리로 생긴 조정」 호출 모양 유지 · `repositories/quote-lines.ts:23` 선례 · 03의 `grantCustomFieldsToRole`이 잠금과 같은 연결로 읽는 데 쓴다). `findFieldDefinitionById`·`updateFieldDefinition`은 바꾸지 않는다. `repositories/roles.ts`의 `listRoles(viewer, opts?)`도 같은 모양으로 끝에 `tx: DbOrTx = db`를 더하고 쿼리를 그 `tx`로 돌린다(조건·정렬 그대로 · `db` import는 기본값에 쓰므로 유지 · 기존 호출부는 인자를 바꾸지 않는다 · `DbOrTx` import는 `quote-lines.ts` 선례대로). 이 선택 `tx` 두 개는 잠금을 쥔 트랜잭션 안의 조회가 두 번째 풀 연결을 요구하지 않게 하려는 것이다(Codex final-2 #1). 같은 파일 끝에 `lockCustomFieldGrants(viewer: Viewer, tx: DbOrTx)`를 더한다(`viewer`는 `plant8/repository-viewer-param` 때문에 첫 인자로 받기만 하고 쓰지 않는다 — 다른 repository 함수와 같은 모양 · `eslint-disable`로 피하지 않는다. `tx`에 기본값 `= db`는 두지 않는다 — 잠금은 트랜잭션 안에서만 의미가 있다) — 모듈 비공개 고정 정수 하나로 `pg_advisory_xact_lock`을 잡는 트랜잭션 잠금(커밋·롤백 때 저절로 풀림, T-04.5-07). 칸 생성(④)과 03의 계급 쪽 경로 `grantCustomFieldsToRole`이 **이 함수 하나**를 부르므로 잠금 번호가 갈라질 수 없다 — 잠금 번호를 domain 상수로 export해 두 곳이 각자 잠그는 방식 대신 리포지토리 함수로 둔 이유: domain은 SQL을 낼 수 없다(boundaries — `domain`은 `db` 금지, `DbOrTx`에 `execute` 없음). `DbOrTx`에 `execute`가 없으므로 `db/client.ts`를 넓히지 않고 select 빌더로 부른다(`tx.select({ … }).from(sql\`pg_advisory_xact_lock(…)\`)` 모양 — drizzle 0.45의 `from()`이 `SQL`을 받는다). 계획 시점 코드베이스에 다른 advisory lock 사용처는 없다. `repositories/permissions.ts`는 `<probe_fallback>`의 `insertVisibilityIfAbsent` 확인 명령 결과대로 재사용(+선택 `tx`)하거나 파일 끝에 더한다 — 어느 쪽이든 쿼리가 넘겨받은 `tx`에서 돈다(공유 결정 5).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:186:④ **domain.** `domain/custom-fields/admin-input.ts`(zod만 import): `createFieldDefinitionInput` — `.strict()` `{ name: 문자열(앞뒤 공백 자름, 1자 이상), type: enum(text|number|date), required: boolean, sortOrder: 정수 }`(대상 없음). 칸 오류 문구·20자·0~999 범위·이름 충돌 문구는 08이 이 스키마에 더한다. `domain/custom-fields/admin.ts`: 모듈 상수 `FIELD_ENTITY = "vendor"`와 노출표 항목 키를 만드는 비공개 함수(`cf.${entity}.${key}`) — 08이 둘을 `targets.ts`로 옮긴다. `createFieldDefinition(viewer, { name, type, required, sortOrder }, deps?)`: `can(viewer, "admin.field-definitions", "write")`가 아니면 메시지 「권한 없음」의 `ForbiddenError`(`domain/permissions/can.ts`) → 키 생성 → `withTransaction` 안에서 **첫 문장** `lockCustomFieldGrants(viewer, tx)`(③) → 그 **뒤에** 계급 목록(`repositories/roles.ts`의 `listRoles(viewer, { includeArchived: true }, tx)` — 잠금을 쥔 **같은 연결**에서 읽는다. 전역 `db`로 읽으면 잠금 대기 트랜잭션들이 풀(`DB_POOL_MAX` 기본 5)을 다 쥔 때 보유자가 여섯 번째 연결을 영원히(Phase 4 머지 뒤엔 5초 뒤 실패) 기다린다. 잠금을 잡은 뒤의 조회라 먼저 커밋된 계급을 전부 본다. 트랜잭션 전에 읽으면 그 사이 만든 계급을 놓치고 03의 계급 쪽 경로도 아직 커밋 전인 이 칸을 못 봐 그 계급에게 칸이 영구히 숨는다 — T-04.5-07. 계급 목록 dep도 잠금 뒤 이 자리에서 불린다: 03의 경합 테스트와 06의 픽스처가 이 순서에 기댄다) → `insertFieldDefinition(viewer, { id: randomUUID(), entity: FIELD_ENTITY, key, label: name, type, required, sortOrder }, tx)` → 계급마다 `insertVisibilityIfAbsent(viewer, { roleId, infoItem, visible: true, updatedBy: viewer.id }, tx)`(전 계급 부여는 이 함수 안 반복문 하나 — 한 번 쓰이는 도우미 모듈을 따로 만들지 않는다; 03이 `domain/custom-fields/visibility.ts`를 만든다) → 커밋 뒤 `recordAction(viewer, { actionType: "document_create", entity: "field_definitions", entityId, detail: { key, entity: FIELD_ENTITY } })`. `can`·키 생성기·계급 목록·노출 행 쓰기·`recordAction`은 `deps`로 주입 가능하게 둔다(중간 실패·충돌 테스트용 — `domain/vendors`의 `*Deps` 선례). 계급 목록 dep의 타입은 `(viewer, opts, tx: DbOrTx) => Promise<…>`(기본값 `listRoles`, `tx`는 `withTransaction` 콜백 인자 그대로)이고, 트랜잭션 콜백 안의 조회·삽입은 전부 `tx`를 넘겨받는다 — 콜백 안에서 전역 `db`로 가는 호출이 없다(06 픽스처·03 경합 테스트의 주입 함수는 세 번째 인자를 받기만 하면 된다). 이 태스크의 키 생성은 한 번이다(충돌 재시도는 Task 2). 반환은 새 행의 `{ id, key }`만(행 타입을 그대로 돌려주지 않는다 — `plant8/no-row-type-escape`). `domain/vendors/index.ts`: `FieldDefinitionDto`에 `label`을 더하고 `listVendorFieldDefinitions`가 `archivedAt`이 null인 정의만 싣는다(보관 칸은 입력에서 숨김 — D10-12). `validatedCustomFields`는 바꾸지 않는다(05).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:188:⑤ **액션·화면.** `app/(app)/admin/field-definitions/actions.ts`: `createFieldDefinitionAction` — vendors 선례대로 `authedActionClient.schema(createFieldDefinitionInput)`, `createFieldDefinition(ctx.viewer, parsedInput)` 호출, 결과를 돌려주지 않는다(DTO 없음), `revalidatePath("/admin/field-definitions")`·`revalidatePath("/admin/vendors")`·`revalidatePath("/admin/visibility")`. 액션 등록부(`actions.registry.ts`)와 누수 스캔 import는 메뉴 등록과 한 묶음으로 08이 만든다(누수 스캔 액션 축이 `action.menu`가 `MENUS`에 있기를 요구한다). `page.tsx`: vendors 페이지와 같은 인증 가드 → `can(viewer, "admin.field-definitions", "view")` 없으면 `notFound()` → `PageHeader title="화면 항목" subtitle="거래처"` → 필터 줄(쓰기 권한이 있고 폼이 닫혀 있을 때만 3차 링크 「화면 항목 추가」 → `?new=1`) → `?new=1`이고 쓰기 권한이 있으면 등록 폼(쓰기 권한이 없으면 `?new=1`로 와도 폼을 렌더하지 않는다). 목록 표·`field-definitions.module.css`는 08이다. `field-definition-form.tsx`(클라이언트): `ui/form/Form` + `className="single-column"`, 칸 넷 — 이름(`TextField`, long) · 타입(`Select`, select 폭, 텍스트/숫자/날짜, 기본 텍스트) · 필수(체크박스 「필수」) · 정렬 순서(`TextField` short, 숫자) → 1차 「화면 항목 추가」 · 2차 링크 「취소」(`/admin/field-definitions`). `useAction(createFieldDefinitionAction)`이 성공하면 `router.replace("/admin/field-definitions")`로 폼을 닫는다 — 결과 줄·칸 오류·이유 자리·제출 중 잠금·정렬 기본값은 08의 E2 행이다. 새 색·간격·radius 없음(이 플랜은 CSS 모듈을 만들지 않는다).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:198:    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 한 트랜잭션(중간 실패 롤백)·전 계급 노출 행·로그·권한 거부·`label` 기본값·풀 크기만큼 동시 생성·Phase 4 견적 줄 저장·거래처 저장·계급 목록 회귀 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:203:    - 마이그레이션 SQL이 하나이고, `label` 채움(`UPDATE … SET "label" = "key"`)이 NOT NULL 기본값 제거와 unique `(entity, label)` 제약보다 먼저 온다(SUMMARY에 손 편집 본문 인용)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:214:  <done>권한 행이 있는 시스템 관리자가 관리 화면에서 거래처 칸을 추가하면 거래처 폼에 한글 이름으로 보이고, 같은 트랜잭션에서 전 계급 노출 행이 생기며 중간에 실패하면 아무것도 남지 않는다 — 이 페이즈의 층 전부가 한 경로로 이어졌다</done>
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:233:② **마이그레이션 끝에 기존 칸 노출 행 채움(그룹 B 요구 · Codex #2 · D10-13).** Task 1의 손 편집 뒤, SQL 파일 끝에 `--> statement-breakpoint`로 나눈 표시 주석 `-- 04.5: 기존 거래처 칸 노출 행 채움`과 문장 하나를 손으로 더한다: `INSERT INTO "visibility_matrix" ("role_id", "info_item", "visible") SELECT r."id", 'cf.vendor.' || fd."key", true FROM "field_definitions" fd CROSS JOIN "roles" r WHERE fd."entity" = 'vendor' ON CONFLICT ("role_id", "info_item") DO NOTHING;` — `updated_at`은 기본값, `updated_by`는 null(시드 행과 같은 결). `pnpm lint:sql`이 받는지 확인한다. 이 본문도 SUMMARY의 손 편집 인용에 더한다(07이 재생성 뒤 다시 입힌다 · 08의 `field-definitions-migration.test.ts`가 이 문장의 존재와 순서를 지킨다).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:235:③ **키 충돌 재시도(A1).** `createFieldDefinition`에서 `isUniqueViolation(error, "field_definitions_entity_key_key")`면 새 키로 `withTransaction` 전체를 다시 연다(잠금·계급 목록 읽기도 새 트랜잭션에서 다시 — 롤백이 잠금을 푼다) — 최대 3번, 넘으면 마지막 오류를 그대로 던진다. 다른 제약 위반(이름 unique `field_definitions_entity_label_key` 포함)은 재시도하지 않고 그대로 던진다(이름 예약 문구는 08).
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:269:| T-04.5-01 | Elevation of Privilege | `/admin/field-definitions` 화면 · `createFieldDefinition` | high | mitigate | page는 `can(viewer, "admin.field-definitions", "view")` 아니면 `notFound()`, `?new=1` 폼은 write일 때만, domain은 `write`를 매번 다시 판정해 「권한 없음」 `ForbiddenError`. 권한 행은 09의 `MENUS` 등록 뒤 시드의 시스템 관리자 루프만 만든다(다른 계급 행 없음 → `can()` 기본 거부) — 이 플랜의 테스트는 시스템 관리자 행만 명시로 넣는다. 통합(기획 PM 거부)·E2E(404)로 증명 — Task 1 |
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:271:| T-04.5-07 | Tampering | 칸 정의 + 노출 행 쓰기 | medium | mitigate | 한 `withTransaction` — `insertVisibilityIfAbsent`가 넘겨받은 `tx`로 돈다. 노출 행 두 개를 쓴 뒤 세 번째가 실패하면 정의·앞 두 행까지 롤백(주입 실패 통합 테스트, 공유 결정 5). 반쪽 상태(정의는 있는데 일부 계급에만 행이 있는 칸)가 남지 않는다. 계급 생성과의 동시 실행: 트랜잭션 첫 문장 `lockCustomFieldGrants(viewer, tx)`(advisory xact lock) 뒤에 계급 목록을 **같은 `tx` 연결로** 읽고(전역 `db` 조회는 잠금 대기 트랜잭션이 풀을 채울 때 교착 — 풀 크기만큼 동시 생성 통합 테스트), 03의 `grantCustomFieldsToRole`이 같은 함수로 잠근 뒤 정의를 읽어 같은 트랜잭션에서 행을 쓴다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생긴다(경합 회귀 통합 테스트는 03 Task 1) — Task 1 |
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:284:- `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test …'`로 E2E 세 파일(`field-definitions` · `vendor-edit` · `vendors`) 통과 — DB 준비는 `db:reset:test` → globalSetup(마이그레이션 → 기본 시드) → 스펙 `beforeAll` 픽스처 순서(공유 결정 4)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:290:- 권한 행이 있는 관리자가 거래처 칸(텍스트·숫자·날짜)을 추가하면 거래처 폼에 한글 이름으로 보이고, 전 계급 노출 행이 같은 트랜잭션에서 생기며 중간 실패는 아무것도 남기지 않는다
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:301:| 함수(신규, repository) | `insertVisibilityIfAbsent`(`repositories/permissions.ts` — main에 있으면 재사용, 선택 `tx`) · `lockCustomFieldGrants`(`repositories/field-definitions.ts` — 칸 생성·계급 쪽 노출 행 부여가 함께 쓰는 트랜잭션 잠금) |
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:303:| 화면(신규) | `/admin/field-definitions`(권한 게이트 + `?new=1` 등록 폼 — 목록·결과 줄·칸 오류는 08) |
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:305:| 테스트 | `test/integration/field-definitions-admin.test.ts`(한 트랜잭션·중간 실패 롤백·전 계급 노출 행·로그·권한 거부·키 충돌 재시도·label 기본값·기존 칸 노출 행 채움) · `test/e2e/field-definitions.spec.ts`(트레이서 + 기획 PM 404) |
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:31:    - "시드가 `admin.field-definitions`의 view·write를 시스템 관리자에게만 `insertPermissionIfAbsent`로 준다(UI-SPEC 화면 1 — 이미 있는 행은 덮지 않는다). 시스템 관리자 전 메뉴 `upsertPermission` 루프는 이 키를 건너뛴다. 다른 계급에는 행이 없다(`can()` 기본 거부). 관리자가 권한표에서 끈 행은 재시드(배포)해도 꺼진 채다. 01의 통합·E2E가 넣던 명시적 권한 준비 줄을 지워도 초록이다"
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:66:플랜 01·08 완성의 나머지 — 메뉴 등록과 관리 인덱스 링크(정본 표·순서 테스트와 한 묶음), 액션 등록부와 `FieldDefinitionAdminDto`의 누수 스캔 계약, 새 메뉴의 시드 권한(UI-SPEC 화면 1의 insert-if-absent), 01이 넣은 권한 준비 줄 정리를 얹는다. 08의 파일 수(21 > 15)를 줄이려고 옛 08 Task 2를 그대로 옮긴 플랜이다 — 누수 스캔 축이 08의 `listFieldDefinitionsForAdmin`·`FIELD_DEFINITION_ADMIN_DTO_FIELDS`를 부르므로 08 뒤에 돈다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:70:Output: 메뉴·관리 인덱스 11번째 링크 · SYSTEM.md §6-10 · 액션 등록부 · 누수 스캔 메뉴 게이트 DTO 축 · 시드 권한(시스템 관리자 view·write, 덮지 않음) · 권한 준비 줄 없이 도는 통합·E2E.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:74:**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`을 호출한다. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. E2E 판정은 `CI=true`다. **공유 테스트 환경 직렬화(공유 결정 3):** 공유 테스트 DB(`erp_test`)·통합 테스트·`db:reset:test`·마이그레이션·E2E 서버 포트 3100·`next build`를 건드리는 명령은 전부 `flock /tmp/plant8-erp-test.lock` 접두로 돌린다(여러 명령을 이으면 `sh -c '…'`로 묶고, `CI=true` 같은 환경 변수 대입은 그 안이나 `env CI=true …`로 둔다 — flock은 첫 낱말을 실행 파일로 본다). 단위 테스트·lint·typecheck는 잠그지 않는다. **E2E DB 준비 순서(공유 결정 4):** `pnpm db:reset:test`(빈 DB를 만든다) → Playwright globalSetup `test/e2e/global-setup.ts`(14–31행: 스키마 비우기 → `migrate`로 마이그레이션 → `seedMasterData`로 기본 시드) → 스펙의 `beforeAll` 픽스처. `db:dev`는 DB 서버를 띄우고 없는 DB만 만든다. 새 의존성 0개. `.planning/`은 GSD 도구로만 쓴다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:89:# 01-SUMMARY가 필요한 이유: 01이 넣은 권한 준비 줄 위치(통합 `beforeEach`·E2E `beforeAll`)를 이 플랜이 지운다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:102:- **권한 시드 수단(UI-SPEC 화면 1 그대로 · 라운드 2 D3):** `admin.field-definitions`를 `MENUS` **끝에** 더하면 기존 시드의 시스템 관리자 전 메뉴 루프(`domain/seed/index.ts` 133행~, `upsertPermission(allowed: true)`)가 배포 시드마다 이 행을 다시 켠다 — 관리자가 권한표에서 끈 값이 되살아나 UI-SPEC 화면 1(229행 「이미 있는 행은 덮지 않는다」)과 어긋난다. 그래서 가장 작은 변경으로 승인본을 따른다: 루프 안 첫 줄에서 이 키만 건너뛰고, 루프 뒤에 `insertPermissionIfAbsent`(`repositories/permissions.ts` 56–73행 — 이미 있음)로 시스템 관리자 view·write만 준다(approve 없음). 루프를 다시 짜지 않는다. 04-20은 비관리자 기본값만 insert-if-absent로 바꾸고 시스템 관리자 루프는 upsert로 둔다 — 이 플랜은 그 파일에 줄만 더한다(07 ⑤ 표의 `-` 줄 0 검사 대상). 회귀 테스트는 기존 `test/integration/seed-permissions.test.ts`(같은 결의 회수 유지 테스트)에 `it` 하나를 더한다 — 새 파일을 만들지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:103:- **`FieldDefinitionAdminDto`의 누수 스캔 계약(Codex #6 · ROADMAP 기준 5):** 이 DTO는 정보 노출표 항목에 매핑되는 사람 단위 값이 없는 구조 메타데이터이고 메뉴 권한 뒤에서만 나간다(`listVendorFieldDefinitions` 주석과 같은 결). DTO 등록부 축은 필드마다 `INFO_ITEMS` 항목을 요구하므로 억지 항목을 만들지 않는다. 대신 조용히 빼지 않고 `leak-scan.test.ts` **끝에** 명시적 검사 경로 「메뉴 게이트 DTO 축」을 더한다 — 이 파일의 `NULL_DTO_EXEMPT_EXPORTS`(검토된 예외 목록) 선례와 같은 결. 목록 `MENU_GATED_DTOS`의 항목 하나 = `{ name: "FieldDefinitionAdminDto", menu: "admin.field-definitions", fields: FIELD_DEFINITION_ADMIN_DTO_FIELDS, list: listFieldDefinitionsForAdmin }`. 생성기 = 목록 × `SEED_ROLES`(기존 생성기와 같은 `flatMap`, 정렬 없음). 검사: (a) 메뉴가 `MENUS`에 있다 (b) 이름이 `DTO_REGISTRY`에 없다(두 축 중 하나에만) (c) 테스트에 적은 검토된 필드 목록과 `FIELD_DEFINITION_ADMIN_DTO_FIELDS`가 같다 — 필드를 더하려면 이 검토 목록도 고쳐야 한다 (d) 시스템 관리자가 거래처 칸 하나를 만든 뒤 `listFieldDefinitionsForAdmin`이 돌려준 DTO의 키 집합이 그 목록과 같다 (e) 계급마다 `listFieldDefinitionsForAdmin({ id: "leak-scan-probe", roleId })`가 `can(viewer, menu, "view")`가 참일 때만 배열을, 거짓이면 `ForbiddenError`를 낸다 · 시드 기준으로 배열을 받는 계급은 시스템 관리자 하나다. 파일 머리의 기존 생성기·예외 목록 줄은 고치지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:104:- **01의 권한 준비 줄:** 01의 통합 테스트 `beforeEach`·E2E `beforeAll`이 넣던 `admin.field-definitions` 권한 행 준비를 Task 1이 지운다 — 지운 뒤에도 초록인 것이 시드 경로의 증명이다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:108:2. **권한 시드 수단 — 해소(라운드 2 D3):** UI-SPEC 화면 1대로 `insertPermissionIfAbsent`로 준다(위 「권한 시드 수단」). 승인본과의 편차가 없어졌으므로 디자인 리뷰 대기 목록에 올리지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:114:  <name>Task 1: 메뉴 등록 · 관리 인덱스 11번째 링크(정본 표·순서 테스트와 한 묶음, O6) · 액션 등록부 · 누수 스캔 메뉴 게이트 DTO 축 · 시드 권한(insert-if-absent)</name>
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:121:    - 08 SUMMARY의 `domain/custom-fields/admin.ts` 심볼(`listFieldDefinitionsForAdmin`·`FIELD_DEFINITION_ADMIN_DTO_FIELDS`·`createFieldDefinition`) · 01 SUMMARY의 권한 준비 줄 위치
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:129:    - (통합) 01이 넣은 권한 준비 줄을 지운 `field-definitions-admin.test.ts`가 그대로 초록이다(시드가 시스템 관리자에게 view·write를 준다)
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:131:    - (E2E) `field-definitions.spec.ts`: 권한 준비 줄 없이 시스템 관리자가 `/admin` → 「화면 항목」 → 「화면 항목 추가」로 01의 트레이서 여정을 시작한다
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:142:⑤ **권한 준비 줄 정리.** `test/integration/field-definitions-admin.test.ts`의 `beforeEach`와 `test/e2e/field-definitions.spec.ts`의 `beforeAll`에서 01이 넣은 `admin.field-definitions` 권한 행 준비(`upsertPermission`)를 지우고, E2E 여정의 시작을 `/admin` 인덱스 클릭으로 바꾼다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:144:⑥ **시드 권한(UI-SPEC 화면 1 · 라운드 2 D3).** RED: `test/integration/seed-permissions.test.ts`의 기존 `describe` 끝에 behavior의 `it` 하나를 더한다(`SYSADMIN_ROLE_ID` import는 새 줄로 더한다 — 기존 줄은 고치지 않는다). 끝에 `try/finally`로 `upsertPermission(allowed: true)`를 되돌린다 — 같은 DB를 쓰는 `field-definitions-admin.test.ts`가 ⑤ 뒤로 시드 행에 기댄다. ①의 `MENUS` 등록 뒤라 기존 루프가 행을 다시 켜서 빨간 것을 확인한다. GREEN: `domain/seed/index.ts` 시스템 관리자 루프의 `for (const menu of MENUS) {` 바로 안 첫 줄에 `if (menu.key === "admin.field-definitions") continue;`(04.5 주석 한 줄 — 아래에서 insert-if-absent로 준다)를 더한다. 루프를 닫는 `}` 다음에 `for (const action of ["view", "write"] as const)`로 `insertPermissionIfAbsent(viewer, { roleId: SYSADMIN_ROLE_ID, menu: "admin.field-definitions", action, allowed: true, updatedBy: null })`와 `permissionsCount++`를 더한다(같은 파일 PM `projects` 블록 선례). 루프 구조와 04-20이 바꾼 줄은 고치지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:150:    <fails_when>통합 failed 개수가 1 이상이다 — 액션 축의 새 케이스, 메뉴 게이트 DTO 축(검토 목록·DTO 키·계급별 게이트), 권한 준비 줄 없이 도는 생성 경로, 시드 권한 정책 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:163:  <done>「화면 항목」이 권한표·관리 인덱스·정본 표에 한 번에 등록되어 시스템 관리자만 인덱스에서 닿고, 새 액션과 관리 DTO가 누수 스캔의 계급별 케이스로 검사된다</done>
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:173:| 권한표 → 관리 화면·관리 DTO | 메뉴 등록이 누가 이 화면과 DTO에 닿는지를 정한다 |
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:179:| T-04.5-01 | Elevation of Privilege | `MENUS` 등록 · 관리 목록 · 관리 인덱스 · 시드 | high | mitigate | 시드가 시스템 관리자에게만 `insertPermissionIfAbsent`로 view·write 행을 만든다(다른 계급 행 없음 → `can()` 기본 거부 · 관리자가 끈 행은 재시드가 되살리지 않음 — `seed-permissions.test.ts`). 누수 스캔 메뉴 게이트 DTO 축이 계급마다 목록 게이트를 증명하고, 권한 준비 줄을 지운 통합·E2E(기획 PM 404는 08 Task 2)가 시드 경로를 증명 — Task 1 |
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:188:- `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test …'`로 E2E 두 파일(`admin-nav` · `field-definitions`) 통과 — DB 준비는 `db:reset:test` → globalSetup(마이그레이션 → 기본 시드) → 스펙 `beforeAll` 픽스처 순서(공유 결정 4)
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:194:- 「화면 항목」이 권한표·관리 인덱스·정본 표에 한 번에 등록되고 시스템 관리자만 닿는다
.planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md:206:| 테스트 | `role-menu.test.ts`·`admin-nav.spec.ts`(10 → 11) · `leak-scan.test.ts`(메뉴 게이트 DTO 축) · `field-definitions-admin.test.ts`·`field-definitions.spec.ts`(01의 권한 준비 줄 제거 · 인덱스에서 시작) · `seed-permissions.test.ts`(새 메뉴 회수 유지) |
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:34:    - "등록 폼의 빈 상태가 없다 — 칸이 항상 있고 타입 기본 「텍스트」, 정렬 순서 기본 = `min(활성 최대값 + 1, 999)`, 활성 정의가 없으면 1이다(UI-SPEC E2 empty, O16)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:36:    - "이름은 보관된 칸까지 포함해 거래처 안에서 유일하다(D10-12 보관 규칙) — 활성 칸과 같으면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」, 보관된 칸과 같으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」이고 「보관함에서 복원」은 복원에 필요한 두 쓰기 권한(`admin.archive` write · `admin.field-definitions` write)과 `admin.archive` view가 다 있을 때만 3차 링크(`/admin/archive`), 아니면 「보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기」 평문이다(링크가 가리키는 `/admin/archive`는 `admin.archive` view 없이 `notFound()`다 — `app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정한다). 서버는 `listFieldDefinitions` 조회로 두 경우를 가르고, 조회와 쓰기 사이 경합은 unique 위반을 같은 칸 오류로 바꾼다(UI-SPEC O22, E2 name-reserved, Codex 4차 MINOR = checker R2)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:37:    - "폼 전체 서버 오류는 `Form.Actions` 1차 옆 이유 자리에 「추가할 수 없음 — {serverError 원문} · 다시 시도」로 보인다 — 원문에 이미 「 · 」가 있으면 「 · 다시 시도」를 붙이지 않는다. 폼 상단 오류 상자 컴포넌트는 쓰지 않는다. 제출 중 권한이 회수되면 원인은 「권한 없음」이다(UI-SPEC Copywriting 137행, 화면 1 권한 · **OPEN 1-A**)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:38:    - "제출 중에는 1차가 `pending`이고 입력 전체가 `fieldset disabled`로 잠기며 「취소」도 비활성이다(UI-SPEC E2 loading, O15)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:39:    - "등록이 성공하면 1차 버튼 자리가 결과 줄 「화면 항목 추가 · {이름} 추가됨」(`role=status`, 포커스를 받음)으로 바뀌고 입력은 읽기 전용이 되며, 3차 「정보 노출표 보기」(`/admin/visibility` — `can(viewer, \"admin.visibility\", \"view\")`일 때만, 1-C · D10-13 자동 등록 확인)·3차 「하나 더 추가」(폼을 key로 다시 마운트해 타입·정렬 기본값까지 초기화하고 이름 입력으로 포커스)·2차 「닫기」가 붙는다. 아래 목록은 서버 재검증으로 새 행을 보인다(UI-SPEC E2 success, O8)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:41:    - "마이그레이션 문장 순서 가드(`test/unit/custom-fields/field-definitions-migration.test.ts`)가 01의 손 편집을 지킨다 — `label` 채움이 NOT NULL 기본값 제거·unique `(entity, label)`보다 먼저, 기존 거래처 칸 노출 행 채움(`INSERT INTO \"visibility_matrix\"` … `ON CONFLICT (\"role_id\", \"info_item\") DO NOTHING`)이 그 뒤에 온다 · `version` NOT NULL 기본 1 · `archived_options` NOT NULL 기본 빈 배열. 07의 머지 직전 재생성에서 손 편집이 사라지면 빨개진다"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:45:      provides: "대상 상수 · 노출표 항목 키 규약(`cf.<entity>.<key>`) · 길이·개수 상한 · 정렬 기본값 — 다른 모듈을 import하지 않는 순수 모듈(클라이언트 폼도 import)"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:51:      provides: "관리 목록(권한 게이트) · 관리 DTO와 검토된 필드 목록 · 이름 예약 판정"
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:70:플랜 01 완성 — 01이 이은 등록 경로 위에 대상 등록부, 목록 표, 등록 폼의 모든 상태(빈 상태 기본값·칸 오류·이름 예약·폼 전체 이유 자리·제출 중 잠금·결과 줄), 관리 목록 DTO, 마이그레이션 순서 가드, E2E 정리 픽스처를 얹는다. 옛 01이 덮던 E1·E2 행과 must_have 중 01이 옮겨 보낸 것을 09와 나눠 받는다(01 `<probe_fallback>`의 목록과 같은 문장 — 메뉴 등록과 관리 인덱스 링크(정본 표·순서 테스트와 한 묶음), 액션 등록부와 `FieldDefinitionAdminDto`의 누수 스캔 계약은 09가 받는다).
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:76:**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`을 호출한다. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. E2E 판정은 `CI=true`다. **공유 테스트 환경 직렬화(공유 결정 3):** 공유 테스트 DB(`erp_test`)·통합 테스트·`db:reset:test`·마이그레이션·E2E 서버 포트 3100·`next build`를 건드리는 명령은 전부 `flock /tmp/plant8-erp-test.lock` 접두로 돌린다(여러 명령을 이으면 `sh -c '…'`로 묶고, `CI=true` 같은 환경 변수 대입은 그 안이나 `env CI=true …`로 둔다 — flock은 첫 낱말을 실행 파일로 본다). 단위 테스트·lint·typecheck는 잠그지 않는다. **E2E DB 준비 순서(공유 결정 4):** `pnpm db:reset:test`(빈 DB를 만든다) → Playwright globalSetup `test/e2e/global-setup.ts`(14–31행: 스키마 비우기 → `migrate`로 마이그레이션 → `seedMasterData`로 기본 시드) → 스펙의 `beforeAll` 픽스처. `db:dev`는 DB 서버를 띄우고 없는 DB만 만든다. 화면 검증 순서는 싼 게이트(lint·typecheck·build) → 실행자가 아닌 별도 에이전트의 `CI=true` 독립 DOM 감사(07에서 한 번에) → 수정 → 전체 게이트 한 번이다. 새 의존성 0개. `.planning/`은 GSD 도구로만 쓴다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:90:# 01-SUMMARY가 필요한 이유: 01이 쓴 손 편집 SQL 본문·`insertVisibilityIfAbsent` 경로(재사용/추가)를 이 플랜이 이어받는다(권한 준비 줄 위치는 09가 이어받는다).
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:92:# .planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md 「Copywriting Contract」 114–150행 · 「화면 1」 211–237행 · 「화면 2」 239–265행(263–265행 SUCCESS·제출 중·이름 예약) · Assumptions O16·O22(357행~) — 「관리 인덱스」·O6은 09
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:104:- **메뉴 등록 · 관리 인덱스 · 액션 등록부 · 권한 시드 수단 · `FieldDefinitionAdminDto`의 누수 스캔 계약 · 01의 권한 준비 줄 정리는 09(파일 수 상한 15 때문에 옛 Task 2를 그대로 옮김).** 이 플랜 동안 `admin.field-definitions`는 아직 `MENUS`에 없으므로 01의 권한 준비 줄은 그대로 둔다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:108:**OPEN — /plan-design-review(승인된 UI-SPEC 개정 3에서 벗어나거나 비어 있는 곳을 메운 자리 — SUMMARY에만 두지 않는다, OPEN 2 권한 시드 수단은 09):**
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:110:1. **(1-A) 권한 회수 뒤 「다시 시도」:** 제출 중 권한이 회수되면 원인이 「권한 없음」이라 「추가할 수 없음 — 권한 없음 · 다시 시도」의 「다시 시도」가 성공할 수 없다 — UI-SPEC 원문대로 구현하고 디자인 리뷰의 결정을 기다린다(결정이 오면 이 문구만 바꾼다).
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:132:    - (단위) `formReason("추가", "권한 없음")` = 「추가할 수 없음 — 권한 없음 · 다시 시도」 · `formReason("추가", "처리 중 오류가 발생했습니다 · 잠시 후 다시 시도해 주세요")`는 「 · 다시 시도」를 붙이지 않는다
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:133:    - (단위) 마이그레이션 가드: `db/migrations/*_custom_field_admin.sql`이 정확히 하나이고, `UPDATE "field_definitions" SET "label" = "key"`가 `label`의 `DROP DEFAULT`와 `field_definitions_entity_label_key` 추가보다 앞, `INSERT INTO "visibility_matrix"`가 그 둘보다 뒤이며 `ON CONFLICT ("role_id", "info_item") DO NOTHING`을 담는다 · `version`은 NOT NULL 기본 1 · `archived_options`는 NOT NULL 기본 빈 배열
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:158:    <fails_when>vitest unit의 failed 개수가 1 이상이다 — 항목 키 규약·키 공간 불변식·정렬 기본값·칸 오류 문구·이름 충돌 문구·이유 자리 규칙·마이그레이션 순서 가드·순환 import 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:168:  <done>칸 정의의 대상·키 규약·상한·기본값이 한 순수 모듈에 있고, 잘못된 이름·정렬과 보관된 이름까지 포함한 이름 충돌이 domain에서 정확한 문구의 오류로 갈리며, 관리 목록이 권한 뒤에서 검토된 필드만 돌려준다</done>
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:172:  <name>Task 2: 목록 표 · 등록 폼 완성 — 빈 상태 기본값 · 칸 오류 · 이름 예약(「보관함에서 복원」은 두 쓰기 권한 + `admin.archive` view가 다 있을 때만) · 폼 전체 이유 자리(OPEN 1-A) · 제출 중 잠금 · 결과 줄(1-C, 「하나 더 추가」) · E2E 정리 픽스처</name>
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:178:    - `ui/form/Form.tsx`(`Form.Error`는 children을 받는다) · `ui/input/TextField.tsx`(`error`는 문자열, `aria-invalid`·`aria-describedby` 배선) · `ui/button/Button.tsx`(`pending`·`disabledReason`) · `ui/status-tag/*`(StatusTag `muted`)
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:180:    - UI-SPEC 「화면 1」 211–237행(열·필수 평문·「화면 항목 추가」 표시 조건) · 「화면 2」 263–265행(SUCCESS·제출 중·이름 예약)
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:189:    - (E2E) 성공하면 결과 줄 「화면 항목 추가 · {이름} 추가됨」에 포커스가 가 있고 입력이 읽기 전용이며, 시스템 관리자에게 「정보 노출표 보기」·「하나 더 추가」·「닫기」가 보이고 아래 목록에 새 행이 있다. 「하나 더 추가」를 누르면 이름이 비고 타입이 「텍스트」로 돌아오며 정렬 순서가 새 기본값이고 이름 입력에 포커스가 있다
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:196:② **액션.** `actions.ts`가 `DuplicateFieldNameError`를 잡아 `canRestore = can(viewer, "admin.archive", "view") && can(viewer, "admin.archive", "write") && can(viewer, "admin.field-definitions", "write")`로 `nameConflictMessage`를 고르고 `returnValidationErrors(createFieldDefinitionInput, { name: { _errors: [문구] } })`로 돌려준다(보관 이름 링크 조건 — Codex 4차 MINOR·checker R2, 복원에 필요한 두 쓰기 권한 + 리비전 검토: 링크가 가리키는 `/admin/archive`는 `admin.archive` view 없이 `notFound()`이므로(`app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정한다 — `domain/permissions/can.ts:27`) view도 함께 검사한다). 그 밖의 `UserFacingError`는 기존 서버 오류 경로(`handle-server-error.ts`)로 원문이 나간다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:198:③ **목록(UI-SPEC 화면 1 · E1).** `page.tsx`: `listFieldDefinitionsForAdmin(viewer)`에서 보관 행을 뺀 목록(보관 포함 필터는 04)을 흰 머리글 읽기용 표로 — 캡션 sr-only 「화면 항목」, 열 일곱: 이름(`th scope="row"`) · 타입(텍스트/숫자/날짜/선택 한글) · 필수(「필수」/「—」 평문) · 정렬 · 선택지(타입이 선택이면 활성 선택지 콤마 목록, 아니면 「—」) · 상태(보관이면 「보관됨」 StatusTag `muted`, 아니면 「—」) · 동작(이 플랜에서는 비움 — 「수정」은 02, 「삭제」는 04). 등록 폼의 정렬 기본값은 활성 정의의 `sortOrder`로 `nextSortOrder`를 계산해 넘긴다. `canViewVisibility = can(viewer, "admin.visibility", "view")`를 폼에 넘긴다. `field-definitions.module.css`는 토큰만(새 색·간격·radius 금지) — 흰 머리글·`--cell-pad-y/x`·행 hover `--surface`, 셀 줄바꿈 속성을 덮어쓰지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200:④ **폼(UI-SPEC 화면 2).** 이름 입력 `maxLength={FIELD_NAME_MAX}`. 칸 오류는 `validationErrors`의 칸 키로 찾아 각 칸의 `error`로 보인다. 이름 오류가 「보관함에서 복원」 변형 상수와 같으면 `TextField`의 문자열 `error` 대신 이름 칸 오류 줄을 `Form.Error`(children)로 그려 「보관함에 같은 이름의 화면 항목이 있습니다 · 」 뒤에 3차 링크 「보관함에서 복원」(`/admin/archive`)을 둔다 — `aria-invalid`·`aria-describedby` 배선은 `TextField`와 같게 맞춘다. 폼 전체 서버 오류(`serverError`)는 `Form.Actions` 안 1차 버튼 옆 이유 자리(`--fs-sm --danger` span, 1차 `aria-describedby`가 가리킴)에 `formReason("추가", serverError)` 결과를 글자로 쓴다(「다시 시도」는 버튼이 아니다 — OPEN 3). 폼 상단 오류 상자 컴포넌트(`ui/form-alert`)는 import하지 않는다. **OPEN 1-A:** 권한이 회수된 경우 원인이 「권한 없음」이라 「다시 시도」가 성공할 수 없다 — UI-SPEC 원문대로 구현하고 디자인 리뷰의 결정을 기다린다. 제출 중에는 1차 `pending`, 입력 전체를 감싼 `fieldset`에 `disabled`, 2차 「취소」도 비활성(링크면 비활성 표현이 되는 버튼 모양으로) — 300ms 넘으면 §7-1 진행 바(`Button`이 이미 하면 그대로 쓴다). 성공(SYSTEM.md §7-15 「화면이 그대로인 폼」): 01의 `router.replace` 닫기 대신 1차 버튼 자리가 결과 줄 「화면 항목 추가 · {이름} 추가됨」(`role="status"`, `tabIndex={-1}`, 성공 직후 포커스)으로 바뀌고 입력은 읽기 전용, 뒤에 3차 링크 「정보 노출표 보기」(`/admin/visibility` — `canViewVisibility`일 때만, **1-C 채택**, D10-13 자동 등록을 바로 확인하는 길) · 3차 「하나 더 추가」 · 2차 「닫기」(`router.replace("/admin/field-definitions")`). 「하나 더 추가」는 폼을 감싼 클라이언트 쪽에서 `key`를 바꿔 다시 마운트하고(React 상태까지 초기화) 이름 입력으로 포커스를 보낸다 — 정렬 기본값은 재검증된 page가 넘긴 새 값이다.
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:206:    <fails_when>playwright failed 개수가 1 이상이다 — 목록 열·키 비노출·줄바꿈, 빈 상태 기본값, 칸 오류 문구, 보관 이름 복원 링크, 결과 줄 포커스·읽기 전용, 「하나 더 추가」 초기화, 기획 PM 404, 정리 픽스처, 기존 거래처 화면 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:210:    - 「정보 노출표 보기」 렌더가 `admin.visibility` 보기 권한 판정에 묶여 있다(1-C) · 「보관함에서 복원」 링크가 `admin.archive` view·write와 `admin.field-definitions` write 세 판정에 묶여 있다 — write만 있고 `admin.archive` view가 없는 계급에는 링크가 없음을 E2E write-only 케이스가 확인한다
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:235:| T-04.5-53 | Elevation of Privilege | 「보관함에서 복원」 링크 | low | mitigate | 링크는 `admin.archive` view·write와 `admin.field-definitions` write가 모두 있을 때만 렌더(view가 없으면 링크가 가리키는 `/admin/archive`가 `notFound()`이므로 — `app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정하므로 write만으로 view를 가정할 수 없다) — 링크는 이동뿐이고 복원 자체의 이중 권한은 04가 서버에서 검사한다 — Task 2 |
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:244:- `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test …'`로 E2E 네 파일(`field-definitions` · `admin-nav` · `vendor-edit` · `vendors`) 통과 — DB 준비는 `db:reset:test` → globalSetup(마이그레이션 → 기본 시드) → 스펙 `beforeAll` 픽스처 순서(공유 결정 4)
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:250:- 등록 폼이 빈 상태 기본값·칸 오류·이름 예약·이유 자리·잠금·결과 줄을 UI-SPEC 문구 그대로 보이고, 목록 표가 UI-SPEC 열 그대로다
.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:262:| 화면(변경) | `/admin/field-definitions` — 목록 표 · 완성된 등록 폼(빈 상태·오류·이름 예약·이유 자리·잠금·결과 줄) · `field-definitions.module.css` |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:29:    - "커스텀 열 셀의 저장 실패는 기존 동작 그대로다 — 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」 + 원위치(UI-SPEC E5 error, O18)"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:30:    - "나중에 만든 계급도 기존 커스텀 항목 행을 받는다 — `createRole`이 계급을 넣은 뒤 대상 상수 안의 모든 칸 정의(보관 포함 — 복원 때 기본값이 살아 있게)에 그 계급의 보임 행을 **없을 때만** 쓴다. 행 쓰기가 실패하면 한 번 다시 시도하고, 그래도 실패하면 경고 로그(`role.custom_field_grant_failed`, `roleId`)를 남긴 채 계급 생성은 남는다 — 그 계급에게 칸이 안 보일 뿐(기본 숨김 쪽으로 실패)이고 조용히 남지 않는다(재시도 성공 · 두 번 실패 두 경로를 통합 테스트가 고정, eng review B-2 · T1). 칸 생성(01)과 동시에 겹쳐도 행이 빠지지 않는다 — 두 경로가 같은 트랜잭션 잠금(01의 `lockCustomFieldGrants`)을 첫 문장으로 잡고 잠금 **뒤에** 상대 쪽 목록(계급 쪽은 칸 정의)을 **같은 `tx` 연결로** 읽는다(전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀 `DB_POOL_MAX`를 채울 때 보유자가 연결을 못 얻어 교착·시간 초과 — 계급 생성은 그 실패를 삼키므로 노출 행이 영구 누락). 고정 지연 없는 동기화 지점으로 경합을 재현한 통합 테스트와 풀 크기만큼 동시 부여 통합 테스트가 이것을 고정한다(ROADMAP 기준 3, CONTEXT 「분리로 생긴 조정」, T-04.5-07 · Codex final-2 #1·#2)"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:34:    - "거래처 폼은 보관된 칸과 보는 사람에게 꺼진 칸을 그리지 않고 안내 문구도 없다 — `listVendorFieldDefinitions`가 활성 ∩ 보임만 돌려준다. 끈 계급의 거래처 화면 HTML에 그 칸의 이름과 값이 없다(UI-SPEC E4 hidden, ROADMAP 기준 4)"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:36:    - "`admin.visibility` 쓰기 권한이 없는 계급은 커스텀 항목(`cf.vendor.<key>`) 셀도 바꿀 수 없다 — `setVisibilityCell`이 `ForbiddenError`로 거부하고 노출 행·행동 로그가 그대로다(통합 테스트, checker WARNING)"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:37:    - "노출 행이 없는 거래처 정의의 값은 누구에게도 보이지 않는다(기본 숨김) — 그래서 이 플랜이 배포되기 전에 기존 거래처 정의 × 모든 계급의 보임 행이 한 번 채워져 있어야 한다. 그 일회성 백필은 01/08의 마이그레이션이 맡는다(`<objective>`의 선행 조건). 이 플랜의 통합·E2E 픽스처는 노출 행을 스스로 만든다 — 01의 `createFieldDefinition`(같은 트랜잭션에서 전 계급 행)으로 만들거나, 직접 넣는 정의에는 `insertVisibilityIfAbsent`로 행을 명시로 더한다(Codex #2)"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:47:      provides: "커스텀 항목 노출 — 노출표 열 · 저장 허용 판정 · 보는 사람의 보이는 키 집합 · 새 계급 기본 행 · DTO 칸 거르기"
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:79:추가한 칸이 정보 노출표에 열로 올라오고, 관리자가 계급별로 끄면 그 계급에게 칸과 값이 거래처 DTO·화면에서 사라진다. 나중에 만든 계급도 기본 보임 행을 받고, 배포 시드는 끈 칸을 되살리지 않는다. 누수 스캔이 커스텀 칸을 포함한다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:83:Output: `domain/custom-fields/visibility.ts` 확장 · 노출표 동적 열 · 저장 액션 비동기 검증 · `createRole` 기본 행 · 거래처 DTO 칸별 거르기 · 누수 스캔 커스텀 축 · 통합·E2E.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:89:**공유 테스트 환경:** 같은 wave(3)의 02와 공유 `erp_test` DB·E2E 포트 3100·`next build` 디렉터리를 같이 쓴다. 그래서 통합 테스트·`pnpm build`·E2E 명령은 모두 `flock /tmp/plant8-erp-test.lock `을 앞에 붙여 한 번에 하나씩 돈다(단위·lint·typecheck는 잠금 없음). `pnpm db:dev`는 로컬 Postgres를 띄울 뿐 DB를 다시 만들지 않는다. 통합 DB는 vitest `test/integration/global-setup.ts`(마이그레이션)와 `test/integration/setup.ts`(매 테스트 TRUNCATE → `seedMasterData`)가, E2E DB는 `test/e2e/global-setup.ts`(14–46행: 스키마 비움 → 마이그레이션 → `seedMasterData`)가 준비한다. 테스트는 그 위에 자기 픽스처를 넣는다. 이 플랜은 DB를 따로 준비하지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:120:- **나중에 만든 계급(CONTEXT가 계획에 맡긴 선택):** 「계급 생성 때 채움」을 택했다 — 「판정 때 커스텀 항목은 기본 보임」은 `visible()`의 「행이 없으면 숨김」에 예외를 만들고, 칸 생성 때 쓰는 행과 판정 규칙이 두 군데서 같은 기본값을 말하게 된다. 시드 계급(대표·본부 책임자·팀장·기획 PM·시스템 관리자)은 첫 배포 때 이미 있으므로 모든 칸보다 먼저 존재하고, 칸 생성(01)이 그들의 행을 쓴다. 뒤 페이즈가 시드 계급을 새로 더하면 그 페이즈가 같은 `grantCustomFieldsToRole`을 불러야 한다 — SUMMARY에 한 줄로 남긴다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:121:- **`vendor.value`와 칸별 판정의 관계:** 기존 DTO 명세의 `{ key: "customFields", infoItem: "vendor.value" }`를 **지우지 않고** 그 뒤에 칸별로 거른다(둘 다 켜져야 보임). PATTERNS는 명세에서 지우는 쪽을 적었지만, 지우면 지금 「거래처 정보」가 꺼진 계급에게 새 칸 값이 새로 보이게 된다(기본 보임 행 때문) — 노출 범위를 넓히지 않는 쪽을 택했고, `dto-registry` 쪽 필드 목록도 그대로라 누수 스캔 DTO 축이 흔들리지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:138:- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄과 그 1회 재시도·경고 로그다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:145:  <name>Task 1: 노출표 — 커스텀 열 합치기 · 저장 액션의 커스텀 키 허용(활성 정의만) · 나중에 만든 계급의 기본 행 · 시드 비재활성</name>
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:153:    - `repositories/permissions.ts`의 `listVisibility`·`insertVisibilityIfAbsent` · `repositories/field-definitions.ts`의 `listFieldDefinitions`(01이 더한 끝의 선택 `tx`)·`lockCustomFieldGrants`(01) · `lib/db-transaction.ts`(`withTransaction`) · `domain/custom-fields/admin.ts`의 `createFieldDefinition` deps(계급 목록 dep의 실제 이름과 세 번째 인자 `tx` — 잠금 뒤에 불린다) · `repositories/roles.ts`의 `insertRole`·`listRoles`(01이 더한 끝의 선택 `tx`) · `lib/env.ts` 54행(`DB_POOL_MAX`) · `test/integration/setup.ts`(`db`·`sql` 사용 모양)
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:155:    - `test/e2e/permissions-grid.spec.ts`(노출표·권한표 셀 토글 E2E 선례)
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:162:    - (통합, 기본 행 쓰기 실패 — eng review B-2 · T1) 칸을 만든 뒤 `vi.spyOn(log, "warn")`(`@/lib/log`)을 걸고 `createRole`에 `grantCustomFieldsToRole` dep을 주입한다. ① 첫 호출만 `new Error("injected")`로 거부하고 두 번째는 진짜 `grantCustomFieldsToRole`에 인자 그대로 넘기는 dep → `createRole`이 `RoleDto`를 돌려주고, 그 계급의 `cf.vendor.<key>` 노출 행이 정확히 하나·`visible = true`이며, dep 호출 2번 · 경고 로그 0번(일시 오류는 재시도로 메워진다). ② 항상 거부하는 dep → `createRole`이 던지지 않고 `RoleDto`를 돌려주며(계급 행이 DB에 있다), dep 호출 정확히 2번, `log.warn`이 `"role.custom_field_grant_failed"`와 `roleId: <새 계급 id>`를 담아 정확히 1번, 그 계급의 `cf.` 노출 행은 0개다(숨김 쪽 실패 · 조용히 남지 않음). 재시도·로그가 없는 구현에서 ①의 행 단언과 ②의 로그 단언이 빨갛다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:163:    - (통합, 칸·계급 동시 생성 경합 — T-04.5-07 · Codex final-2 #2) 01의 `createFieldDefinition`을 시스템 관리자로 부르되 계급 목록 dep에 이 함수를 주입한다: ① 진짜 `listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx)`(dep이 받은 세 번째 인자)로 목록을 읽음 → ② `insertRole`로 계급 R을 직접 넣음(커밋됨) → ③ 프로미스 `defsRead`(와 그 resolve 함수)를 만들고, `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id, { listFieldDefinitions: 래퍼 })`를 **await 없이** 띄워 그 promise를 테스트 변수에 담음 — 래퍼는 진짜 `listFieldDefinitions`에 받은 인자를 그대로 넘겨 행을 받은 뒤 `defsRead`를 풀고 그 행을 돌려준다 → ④ `Promise.race([defsRead, waitForAdvisoryWaiter()])`를 await — `waitForAdvisoryWaiter`는 테스트 파일 안 헬퍼로, `db.execute(sql\`select 1 from pg_locks where locktype = 'advisory' and not granted\`)`가 1행 이상이 될 때까지 조회를 되풀이하는 루프다(타이머로 쉬지 않는다 — 조회 왕복 자체가 간격이고, `Date.now()`로 5초 넘으면 던진다) → ⑤ R이 빠진 목록을 돌려줌. `createFieldDefinition`과 담아 둔 promise를 둘 다 await한 뒤, R의 `cf.vendor.<새 키>` 노출 행이 정확히 하나이고 `visible = true`다. dep 안에서 grant를 await하면 교착이다(칸 트랜잭션이 잠금을 쥔 채 grant가 같은 잠금을 기다린다) — 기다리지 않는다. 고정 지연 없이 결정적이다: 잠금이 **없으면** grant가 곧장 정의를 읽어 `defsRead`가 풀리고(칸은 아직 커밋 전이라 새 칸을 못 봄) 반드시 R 행이 없다(RED). 01이 계급 목록을 잠금 전에 읽는 변형도 grant가 먼저 잠금을 잡고 정의를 읽어 `defsRead`로 끝나 RED다. 잠금이 **있으면** grant는 정의를 읽기 전에 잠금 대기에 걸려 `pg_locks`에 `granted = false` 행이 생기고 → race가 풀려 칸 트랜잭션이 커밋 → grant가 이어서 새 칸을 보고 행을 쓴다(GREEN). 두 경우 모두 관측 가능한 사건으로만 진행한다(`fileParallelism: false`라 다른 파일의 advisory 잠금과 섞이지 않는다)
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:164:    - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 거래처 칸 하나를 `createFieldDefinition`으로 만든 뒤 `insertRole`로 계급 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개를 넣고, 그 계급마다 `grantCustomFieldsToRole`을 `Promise.all`로 동시에 부르면 전부 끝나고 계급마다 그 칸의 `cf.vendor.<key>` 노출 행이 정확히 하나다(`createRole`은 grant 실패를 삼키므로 grant를 직접 불러 실패가 드러나게 한다). 정의를 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 시간 초과로 빨갛다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:166:    - (통합, 권한 거부 — checker WARNING) `admin.visibility` 쓰기가 없는 계급의 사용자(기획 PM `DEFAULT_ROLE_ID` — 테스트 첫 단언으로 `can(pmViewer, "admin.visibility", "write")`가 거짓임을 확인한다)가 `setVisibilityCell(pmViewer, { roleId: DEFAULT_ROLE_ID, infoItem: "cf.vendor.<key>", visible: false })`를 부르면 `ForbiddenError`다. 그 `(계급, cf.vendor.<key>)` 노출 행은 여전히 `visible = true`이고, 행동 로그(`permission_change`) 행 수가 호출 전과 같다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:171:① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다). `createRole` 기본 행 쓰기 실패 케이스(behavior 「eng review B-2 · T1」)도 이 RED에 넣고, 재시도·경고 로그 없이 grant 한 번만 부르는 ⑤ 초안에서 ①·② 단언이 빨간 출력을 SUMMARY에 인용한다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:173:② `domain/custom-fields/visibility.ts`에 더한다: `customFieldColumns(viewer)` — `FIELD_DEFINITION_TARGETS`마다 `listFieldDefinitions`에서 `archivedAt`이 null인 정의를 기존 정렬 그대로 `{ id: customFieldInfoItem(entity, key), label }`로. `isAssignableInfoItem(infoItem)` — `INFO_ITEMS`에 있으면 참, 아니면 `parseCustomFieldInfoItem` → 대상이 상수 안 → 그 대상의 활성 정의에 키가 있으면 참(조회는 `SYSTEM_VIEWER`). `grantCustomFieldsToRole(viewer, roleId, deps?)` — `deps`는 `listFieldDefinitions` 하나만 주입 가능(기본값은 리포지토리 함수 · 01의 `*Deps` 선례 · 운영 호출은 두 인자 그대로), 한 `withTransaction`(`lib/db-transaction.ts`) 안에서 **첫 문장** 01의 `lockCustomFieldGrants(viewer, tx)`(01의 칸 생성과 같은 잠금 — T-04.5-07) → 그 **뒤에** 대상 상수 안의 모든 정의(보관 포함)를 `listFieldDefinitions(viewer, entity, tx)`로 읽음(잠금을 쥔 **같은 연결** — 01 Task 1④와 같은 이유: 전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀을 채울 때 보유자가 연결을 못 얻는다. 잠금을 잡은 뒤의 조회라 먼저 커밋된 칸을 전부 본다) → 정의마다 01의 `insertVisibilityIfAbsent(…, { visible: true }, tx)`. 잠금 전에 정의를 읽거나 잠금 없이 돌리면 동시에 만들어지는 칸을 놓쳐 그 계급에게 칸이 영구히 숨는다(칸 쪽은 잠금 뒤 계급 목록을 읽으므로 둘 중 하나만 먼저 돈다). RED 확인은 두 단계다: 잠금 줄 없이 먼저 구현한 grant로 behavior의 경합 케이스가 빨간 것을 보고 → 잠금을 더하되 정의를 `tx` 없이 읽는 상태에서 풀 고갈 케이스가 시간 초과로 빨간 것을 본 뒤(교착이 풀에 남아 뒤 케이스까지 멈추므로 이 확인은 그 케이스만 `-t`로 돌린다) → `tx`를 넘겨 둘 다 초록으로 만든다(두 실패 출력을 SUMMARY에 인용). 이 모듈은 `domain/permissions/roles.ts`를 import하지 않는다(순환 방지).
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:179:⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:189:    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 열 합치기·저장 허용·새 계급 기본 행·기본 행 쓰기 실패 경로(재시도 뒤 행 있음 · 두 번 실패 시 계급 남음 + 경고 로그 1번 + `cf.` 행 0개)·칸·계급 동시 생성 경합(R의 노출 행 누락)·풀 크기만큼 동시 부여(교착 시간 초과)·시드 비재활성·`admin.visibility` 쓰기 없는 계급의 `cf.` 셀 거부, 또는 기존 노출표·계급·시드 테스트 회귀</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:191:    <fails_when>playwright failed 개수가 1 이상이다 — 커스텀 열 머리글·셀 토글 저장, 또는 기존 권한표·노출표 E2E 회귀</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:196:    - `grantCustomFieldsToRole` 본문에서 `lockCustomFieldGrants(`가 `listFieldDefinitions(`보다 먼저 오고 같은 `withTransaction` 안이며, 그 `listFieldDefinitions(` 호출(주입 dep 경유 포함)이 `tx)`로 끝난다(같은 연결) · 경합 케이스의 잠금 없는 RED 실패 출력, 풀 고갈 케이스의 `tx` 없는 RED 시간 초과 출력, 둘 다 초록인 출력이 SUMMARY에 있다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:197:    - `createRole`의 기본 행 쓰기 실패 경로가 고정돼 있다 — `grep -v '^\s*//' domain/permissions/roles.ts | grep -c "role.custom_field_grant_failed"`가 1이고, `grep -c 'spyOn(log, "warn")' test/integration/custom-field-visibility.test.ts`가 1 이상이며, behavior 「eng review B-2 · T1」의 ①(재시도 뒤 행 하나)·②(계급 남음 · dep 2번 · 경고 로그 1번 · `cf.` 행 0개) 두 케이스의 RED 출력과 초록 출력이 SUMMARY에 있다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:202:  <done>관리자가 노출표에서 새 칸의 열을 보고 계급별로 끌 수 있고, 새 계급은 기본 보임 행을 받으며, 배포 시드가 끈 칸을 되살리지 않는다</done>
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:218:    - (통합) 칸 A·B에 값이 든 거래처를, B를 끈 계급(`admin.vendors` 보기 권한을 테스트에서 켬)으로 `listVendors`·`searchVendors`하면 `customFields`에 A만 있다 · 같은 계급의 `updateVendor`·`setVendorHidden` 반환 DTO에도 B가 없다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:220:    - (통합, 기본 숨김 — Codex #2) `insertFieldDefinition`으로 직접 넣고 노출 행을 하나도 만들지 않은 거래처 정의(백필 전 운영 데이터와 같은 상태)의 값은 시스템 관리자 DTO에도 없다 — 백필이 왜 선행 조건인지 고정한다. 같은 정의에 `insertVisibilityIfAbsent`로 시스템 관리자 행을 넣으면 값이 보인다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:232:④ `test/integration/leak-scan.test.ts` **끝에** `describe("커스텀 칸 축 — …")` 하나: 테스트 안에서 시스템 관리자로 칸 둘과 거래처 하나(두 칸 값은 서로 다른 고유 문자열)를 만들고, 순수 생성기 `buildCustomFieldCases(defs, roles)`(칸 × `SEED_ROLES`, 결정적 순서)의 케이스마다 그 계급에 `admin.vendors` 보기와 `vendor.value` 보임 행(`upsertVisibility`)을 켜고, **먼저** `listVendors`의 JSON 직렬화에 두 칸 값 문자열이 모두 있음을 단언한 뒤, 그 칸만 끄고 그 값 문자열만 사라지고 다른 칸 값은 남아 있음을 단언한다. `domain/seed/index.ts`에 `vendor.value` 행을 더하지 않는다(테스트 안에서만 켠다 — Task 1 acceptance의 seed diff 0 유지 · `domain/vendors`의 `VENDOR_DTO_SPEC`은 모든 칸이 `vendor.value`에 묶여 있고 시드는 이 행을 시스템 관리자·기본 계급에만 주므로, 켜지 않으면 나머지 시드 계급 케이스가 상위 차단으로 헛되이 통과한다). 기존 `describe`·import·헬퍼는 고치지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:242:    <fails_when>통합 failed 개수가 1 이상이다 — 칸별 거르기·노출 행 없는 정의의 기본 숨김·폼 정의 거르기·누수 스캔 커스텀 축, 또는 기존 거래처·커스텀 필드 테스트 회귀</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:271:| T-04.5-42 | Elevation of Privilege | `setVisibilityCell`의 `cf.` 키 | high | mitigate | 셀 쓰기 권한(`admin.visibility` write)은 기존 domain 게이트(`domain/permissions/matrix.ts` 165행) 그대로다. 권한이 없는 계급(기획 PM)이 `cf.vendor.<key>` 셀을 바꾸면 `ForbiddenError`이고 행·행동 로그가 그대로인 통합 테스트가 커스텀 항목 쪽을 고정한다(Task 1, checker WARNING) |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:272:| T-04.5-43 | Denial of Service | 01 이전에 만든 거래처 정의의 값(노출 행 없음 → 기본 숨김) | medium | transfer | 01/08 마이그레이션의 일회성 백필(기존 거래처 정의 × 모든 계급, 없을 때만 보임 행)이 맡는다(그룹 A 소유). 이 플랜은 Task 2 `<precondition>`으로 그 문장의 존재를 확인하고, 노출 행 없는 정의가 누구에게도 안 보인다는 것을 통합 테스트로 고정한다 |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:275:| T-04.5-07 | Tampering | 칸 생성(01) ↔ 계급 생성(`grantCustomFieldsToRole`) 동시 실행 | medium | mitigate | 01과 같은 위협의 계급 쪽 절반. 두 경로가 같은 트랜잭션 잠금 `lockCustomFieldGrants(viewer, tx)`를 첫 문장으로 잡고 잠금 뒤에 상대 목록을 같은 `tx` 연결로 읽어 직렬화된다 — 어느 순서로 겹쳐도 (계급, 칸) 쌍마다 행이 생기고, 잠금 보유자가 두 번째 풀 연결을 요구하지 않아 풀 고갈 교착이 없다. await 없이 띄운 grant와 고정 지연 없는 동기화 지점(`defsRead` · `pg_locks` 대기 행)으로 경합을 재현한 통합 테스트가 잠금 없는 RED → 잠금 뒤 초록으로, 풀 크기만큼 동시 부여 통합 테스트가 같은 연결 조회를 고정한다(Task 1) |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:276:| T-04.5-14 | Information Disclosure | 새 계급 기본 행 | low | accept | 새 계급이 기존 칸을 기본 보임으로 받는 것은 D10-13의 결정(「기본값은 전 계급 보임」)이다. 행 쓰기 실패는 한 번 재시도 뒤 숨김 쪽으로 실패하고 경고 로그 `role.custom_field_grant_failed`(`roleId`)를 남긴다 — 조용히 행 없는 계급이 남지 않는다(Task 1 통합 테스트, eng review B-2) |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:282:- 통합(같은 잠금): `custom-field-visibility`(권한 거부·기본 숨김 포함)·`leak-scan`·`visibility`·`roles`·`seed-permissions`·`vendors`·`custom-fields` 통과
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:283:- `CI=true` E2E(같은 잠금): `custom-field-visibility`·`permissions-grid`·`vendors`·`vendor-edit` 통과
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:292:- 나중에 만든 계급이 기본 보임 행을 받고, 시드는 끈 칸을 되살리지 않는다
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:300:| 변경된 기존 심볼 | `visibilityColumns`(비동기, 두 출처) · `setVisibilityCellAction`(비동기 refine) · `createRole`(+기본 행 · 실패 시 1회 재시도 → 경고 로그, `RoleWriteDeps.grantCustomFieldsToRole` 주입 지점) · 거래처 DTO 출구 다섯(칸별 거르기) · `listVendorFieldDefinitions`(+보임만) |
.planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md:301:| 테스트 | `test/integration/custom-field-visibility.test.ts`(권한 없는 계급의 `cf.` 셀 거부 · 노출 행 없는 정의의 기본 숨김 포함) · `test/integration/leak-scan.test.ts` 커스텀 칸 축 · `test/e2e/custom-field-visibility.spec.ts` |
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:31:    - "등록 폼에서 타입 「선택」을 고르면 구분선(`1px --line` + `--s-6`) 아래 선택지 편집기가 나온다 — 새 선택지(short, `maxLength` 40) + 3차 「선택지 추가」(또는 새 선택지 입력 안의 Enter — 폼 제출 대신)가 앞뒤 공백을 잘라 활성 목록 끝에 더한다. 빈칸은 「선택지가 비어 있습니다 · 선택지 적기」, 활성과 같으면 「이미 있는 선택지입니다 · 다른 이름 적기」, 활성 30개면 「선택지 추가」가 `disabledReason` 「선택지는 30개까지 · 쓰지 않는 선택지 삭제」로 비활성이다(UI-SPEC 화면 2, E2 overflow·long-text)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:35:    - "타입을 바꾸면서 이름을 지키는 길은 「옛 칸의 이름 바꾸기 → (필요하면 보관) → 새 칸을 원래 이름으로 추가」다 — 이름은 보관 칸까지 예약되므로 옛 칸을 그 이름 그대로 보관하면 새 칸이 그 이름을 쓸 수 없다. 화면에 설명 문구는 두지 않고(§8 규칙 5) SUMMARY 「운영 안내」에 적으며, 04가 이 순서를 통합 테스트로 증명한다(UI checker R3)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:38:    - "「새로 불러오기」(3차)는 충돌 결과를 지우고 `router.refresh()` 뒤 폼의 입력 쪽을 새 `version`으로 다시 마운트해(page `key={id}` + 같은 파일의 폼 본문 컴포넌트 `key={version}` — UI-SPEC의 `key={id}:{version}`과 같은 초기화) 최신 행(이름·필수·정렬·활성/보관 선택지)을 채우고 이름 입력으로 포커스를 보낸다 — 저장 안 한 입력은 버리고, 누르기 전까지는 입력이 남는다. 「목록으로」(3차)는 `router.replace`로 폼을 닫는다(UI-SPEC E2 stale)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:39:    - "수정 성공은 1차 자리 결과 줄 「화면 항목 수정 · {이름} 수정됨」(`role=status`, 포커스) + 2차 「닫기」(목록으로 `router.replace`)이고 입력은 읽기 전용이다. 재검증으로 새 `version`이 와서 입력이 다시 마운트돼도 결과 줄은 남고 숨은 `version`은 v+1이라, 「닫기」 → 「수정」으로 이어서 저장해도 충돌이 아니다. 그 밖의 폼 전체 서버 오류는 08의 `formReason(\"수정\", serverError)` 규칙이다(폼 전체 오류 UI는 01 분할로 08이 완성한다, UI-SPEC 화면 2 SUCCESS, Copywriting)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:40:    - "이름 변경도 01·08의 이름 예약을 따른다 — 자기 자신을 뺀 활성·보관 칸과 같으면 같은 두 문구(보관 쪽 「보관함에서 복원」 링크는 두 쓰기 권한일 때만 — 이름 예약 UI와 그 링크 권한은 08이 완성한다)(UI-SPEC O22)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:41:    - "수정 모드의 선택지: 아직 저장 안 한 선택지의 「삭제」는 목록에서 빼고, 저장된 선택지의 「삭제」는 보관 목록으로 옮긴다(「취소」하면 원래대로). 보관 선택지와 같은 문자열을 다시 추가하면 그 선택지가 활성으로 돌아온다(중복 생성 없음). 저장된 선택지 문자열은 읽기 전용이다. 두 경우 모두 포커스는 새 선택지 입력으로 간다. 선택지 행의 「삭제」 접근 이름은 「{선택지} 삭제」다(UI-SPEC 화면 2 선택지 상태, O3, R5)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:42:    - "보관 선택지는 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」으로만 보이고 버튼이 없다 — N = 0이면 렌더하지 않고, 개수 상한은 활성에만 건다(UI-SPEC 화면 2, E2 overflow, **OPEN 2-A**)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:45:    - "목록의 선택지 열은 타입이 선택일 때 활성 선택지 콤마 목록(보관 선택지는 안 보임)이고, 쓰기 권한이 있으면 동작 열에 3차 링크 「수정」(`aria-label` 「{이름} 수정」)이 있다. 폼이 열리면 필터 줄 「화면 항목 추가」는 숨는다(UI-SPEC 화면 1, E1 overflow)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:84:**공유 테스트 환경:** 같은 wave(3)의 03과 공유 `erp_test` DB·E2E 포트 3100·`next build` 디렉터리를 같이 쓴다. 그래서 통합 테스트·E2E 명령은 모두 `flock /tmp/plant8-erp-test.lock `을 앞에 붙여 한 번에 하나씩 돈다(단위·lint·typecheck는 잠금 없음). 이 플랜은 따로 `pnpm build`를 돌리지 않는다. `CI=true` E2E의 webServer가 `pnpm build && pnpm start`(`playwright.config.ts` 52행)로 같은 잠금 안에서 프로덕션 빌드를 하므로, 빌드 오류는 E2E 명령에서 드러난다(예상 비용 1.1배 경고에 따른 손질 — 범위는 그대로). `pnpm db:dev`는 로컬 Postgres를 띄울 뿐 DB를 다시 만들지 않는다. 통합 DB는 vitest `test/integration/global-setup.ts`·`setup.ts`가, E2E DB는 `test/e2e/global-setup.ts`(14–46행: 스키마 비움 → 마이그레이션 → `seedMasterData`)가 준비한다. 테스트가 자기 픽스처를 넣는다.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:87:- **2-A** 보관 선택지 `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — 원문(네이티브 `details`)대로 그대로 둔다(Task 3)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:112:- **버전 조건부 갱신(O20):** 트랜잭션·행 잠금을 쓰지 않는다 — 조건부 UPDATE 한 문장이 원자적이고, 파생에 쓴 저장값과 쓰는 행의 버전이 같다는 것을 `WHERE version = ?`가 보장한다. 판정 순서는 행 없음·대상 밖 → **보관** → 버전 → 이름 예약(보관을 버전보다 먼저 봐야 보관 문구에 닿는다 — 04의 보관이 버전을 올리므로, UI checker R1).
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:113:- **새 서버 문구 하나:** 수정 대상이 없거나 대상 상수 밖이면 원인이 「화면 항목 없음」이다(명사형 — 「권한 없음」과 같은 결). UI-SPEC Copywriting에 없는 문구라 SUMMARY 「새 문구」 표에 남기고 디자인 리뷰에 올린다. 보관·버전 충돌은 UI-SPEC 원문(138·139행)을 쓴다.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:132:    - `.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md`·`04.5-08-SUMMARY.md` — 01·08이 만든 심볼·파일 이름(이름 예약·폼 전체 오류·「보관함에서 복원」 링크 권한은 08). 아래 이름과 다르면 SUMMARY를 따른다
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:136:    - `ui/status-tag/StatusTag.tsx` · `ui/button/Button.tsx`(`disabledReason`)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:140:    - (단위) `addOption({ active: ["기본"], archived: [] }, "  특약 ")` → 활성 `["기본", "특약"]`; `"기본"` → 오류 `duplicate`; `"   "` → 오류 `empty`; 활성 30개면 오류 `limit`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:141:    - (단위) `addOption({ active: ["기본"], archived: ["특약"] }, "특약")` → 활성 `["기본", "특약"]`, 보관 `[]`(복원)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:142:    - (단위) `removeOption(state, "특약", saved = {"기본","특약"})` → 보관으로 이동; 저장 안 한 `"MOU"` 삭제 → 목록에서 빠짐
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:146:    - (E2E) 타입 「선택」 → 「기본」·「특약」 추가(두 번째는 Enter) → 빈칸 추가 시 문구 → 저장 → 거래처 폼(`/admin/vendors?new=1`)의 그 칸 select에 「기본」·「특약」이 있다 → 목록 선택지 열이 「기본, 특약」
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:153:③ `admin-input.ts`의 생성 스키마: 타입 enum에 `select`, `options`(문자열 배열 — 각 원소 자르기, 1~`OPTION_MAX_LENGTH`자, 중복 없음, 최대 `ACTIVE_OPTIONS_MAX`개). 선택형이면 1개 이상, 아니면 비어 있어야 한다(빈 배열 또는 없음). `createFieldDefinition`이 `options`를 저장한다(비선택형은 null, `archived_options`는 열 기본 `[]`).
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155:④ 폼: 타입 값·활성 선택지·보관 선택지를 React 상태로 두고 상태 전이는 `options.ts` 함수로만 한다. 타입이 선택일 때만 구분선 + 선택지 목록(행마다 선택지 텍스트 + 3차 「삭제」, `aria-label` 「{선택지} 삭제」) + 새 선택지 `TextField`(short, `maxLength` 40, 오류는 이 칸의 `error`) + 3차 「선택지 추가」. 새 선택지 입력 안의 Enter는 폼 제출을 막고 추가한다. 추가·삭제 뒤 포커스는 새 선택지 입력으로. 활성 30개면 「선택지 추가」 `disabled` + `disabledReason` 「선택지는 30개까지 · 쓰지 않는 선택지 삭제」. 타입 선택 + 활성 0개면 1차 `disabled` + `disabledReason` 「추가할 수 없음 — 선택지 0개 · 선택지 추가」. 제출 때 활성 배열만 보낸다. 새 CSS는 토큰만.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:176:  <name>Task 2: 수정 모드 — `?editId=` 폼(타입 읽기 전용 + 「새 화면 항목 추가」, 숨은 `version`) · 버전 조건부 수정(보관 먼저, 그다음 버전) · 충돌 두 문구와 「새로 불러오기」·「목록으로」 · 결과 줄 · 목록 「수정」</name>
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:192:    - (E2E) 목록 「수정」(`aria-label` 「{이름} 수정」) → 수정 폼에 값이 채워져 있고 타입 칸이 select가 아니라 텍스트이며 「새 화면 항목 추가」가 `?new=1`로 간다 → 이름을 바꿔 「화면 항목 수정」 → 결과 줄 「화면 항목 수정 · {새 이름} 수정됨」 → 숨은 `version` 입력값이 v+1이 된 뒤에도 결과 줄이 보인다(재검증 뒤 결과 줄 유지) → 「닫기」로 목록 → 다시 「수정」으로 이름을 한 번 더 바꿔 저장하면 충돌 없이 결과 줄(성공 뒤 입력은 읽기 전용이라 이어서 저장하는 길은 「수정」을 다시 여는 것뿐 — UI-SPEC 264행) → 「닫기」 → 거래처 폼 라벨이 두 번째 이름
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:193:    - (E2E) 같은 선택형 칸의 수정 폼을 두 탭(페이지)으로 열어 한쪽이 이름을 바꾸고 새 선택지 하나를 더해 저장한 뒤 다른 쪽이 저장하면 이유 자리에 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 」 + 3차 「새로 불러오기」 → 누르면 충돌 이유 줄이 사라지고 이름 칸이 먼저 저장된 값이며 선택지 편집기의 활성 목록도 먼저 저장된 값(더한 선택지 포함)이고 포커스가 이름 입력에 있다(본문 컴포넌트 `key={version}` 다시 마운트가 선택지 상태까지 초기화하는지 — 같은 함수 안 요소 `key`면 옛 목록이 남아 빨갛다)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:203:④ `domain/custom-fields/admin.ts`의 `updateFieldDefinition(viewer, input, deps?)`: `can(… "write")` 아니면 「권한 없음」 `ForbiddenError` → 행 읽기 → 없거나 `entity`가 `FIELD_DEFINITION_TARGETS` 밖이면 `FieldDefinitionNotFoundError`(UserFacingError, 「화면 항목 없음」) → **보관이면** `FieldDefinitionArchivedError`(보관 원인 상수) → 제출 `version`이 다르면 `FieldDefinitionConflictError`(충돌 원인 상수) → 이름 예약(08의 이름 예약 판정 — `admin.ts` 안에서 `listFieldDefinitions(viewer, "vendor")`의 같은 `label` 찾기, 자기 제외, 08의 `DuplicateFieldNameError`, 실제 함수 이름은 08 SUMMARY) → 선택형이 아닌 칸에 선택지가 오면 거부 · **읽은 행이 선택형인데 `options`가 없거나 빈 배열이면 거부**(`UserFacingError`, 원인은 UI-SPEC 136행 수정 모드 원문의 「선택지 0개 · 선택지 추가」 — `formReason("수정", …)`이 「수정할 수 없음 — 선택지 0개 · 선택지 추가」로 그린다. 30개·40자·중복은 스키마가 이미 본다. 수정 입력에 `type`이 없어 스키마로는 판정할 수 없으므로 읽은 행으로 본다 — 빈 선택지가 저장되면 `build-schema.ts` 29행의 `z.enum`이 비어 거래처 폼 검증이 깨진다) → `updateFieldDefinitionIfVersion`(이 태스크에서는 선택지를 제출 그대로, 보관 파생은 Task 3) → 0행이면 다시 읽어 보관이면 보관 오류, 아니면 충돌 오류 → unique `(entity, label)` 위반은 01·08과 같이 이름 오류로 → 성공이면 `recordAction` `document_update`(entity `field_definitions`, detail 키).
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207:⑥ `page.tsx`: `editId`가 활성 거래처 정의 id이고 쓰기 권한이 있을 때만 수정 폼을 `key={id}`로 렌더하고(`version`은 prop), 폼이 열려 있으면(`?new=1` 또는 수정) 필터 줄 「화면 항목 추가」를 렌더하지 않는다. 동작 열: 쓰기 권한이면 3차 링크 「수정」(`?editId=<id>`, `aria-label` 「{이름} 수정」). 폼은 두 컴포넌트다(새 파일 없음 — 같은 `field-definition-form.tsx` 안에 비공개 함수 컴포넌트 하나를 더한다, `vendor-form.tsx` 210행 `VendorCustomField` 같은 파일 내 보조 컴포넌트 선례): 바깥 컴포넌트는 `useAction` 상태(결과·`reset`)와 결과 줄만 갖고, 폼 본문(입력 칸 묶음·선택지 `useState`·숨은 `version`·`Form.Actions`)은 같은 파일의 비공개 컴포넌트(예: `FieldDefinitionFormBody`)에 두어 `<FieldDefinitionFormBody key={version} … />`로 렌더하고 액션 상태를 prop으로 받는다. 훅 상태는 컴포넌트 인스턴스에 붙으므로 바깥 함수 안의 `div`·Fragment에 `key`를 주면 DOM만 다시 만들어지고 선택지 상태는 옛 값으로 남는다 — `key`는 반드시 이 본문 컴포넌트 요소에 준다. 페이지의 `key={id}`와 합쳐 입력 쪽 초기화는 UI-SPEC 178행의 `key={id}:{version}` 다시 마운트와 같다. 저장 성공 → `revalidatePath`로 새 `version`이 오면 본문 컴포넌트만 다시 마운트돼 입력·선택지 상태가 저장된 값으로 다시 시작하고, 결과 줄은 바깥 상태에서 그리므로 남는다(결과 줄 포커스는 성공 상태로 다시 마운트될 때도 건다). 숨은 `version`은 prop이라 v+1이 된다. `Form.Actions`를 본문 컴포넌트에 두는 이유: 1차의 「선택지 0개」 비활성이 선택지 상태와 같은 컴포넌트라 끌어올릴 상태가 없다. 등록 모드는 본문 컴포넌트의 key가 바뀌지 않아 08의 「하나 더 추가」 다시 마운트(바깥 층까지) 그대로다. 폼 수정 모드: 숨은 `version`, 타입 자리에 타입 이름 텍스트 + 3차 링크 「새 화면 항목 추가」(`?new=1`, 설명 문구 없음 — §8 규칙 5), 1차 「화면 항목 수정」, 성공 결과 줄 「화면 항목 수정 · {이름} 수정됨」 + 2차 「닫기」. 이유 자리: `serverError`가 충돌 원인 상수면 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 」 + 3차 「새로 불러오기」(`reset()`으로 바깥의 충돌 결과를 지우고 `router.refresh()` — 새 `version`의 `key`로 본문 컴포넌트가 다시 마운트돼 입력·선택지 상태(활성, Task 3부터 보관도)가 최신 행 값이 되고 이름 입력으로 포커스), 보관 원인 상수면 「수정할 수 없음 — 보관된 화면 항목입니다 · 」 + 3차 「목록으로」(`router.replace` 목록), 그 밖은 `formReason("수정", serverError)` 글자(08 OPEN 1-A의 결정이 두 모드에 같이 적용된다). 선택형 활성 0개 이유 「수정할 수 없음 — 선택지 0개 · 선택지 추가」.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:213:    <fails_when>단위·통합 failed 개수가 1 이상이다 — 수정 스키마의 `type` 거부, 키 불변·버전 증가, 같은 버전 두 번째 거부, 보관 먼저 판정, 이름 예약, 선택형 선택지 0개·생략 거부, 대상 밖·권한 거부, 로그 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:235:    - (통합) 저장된 `["기본","특약"]`에서 `["기본","MOU"]`를 제출하면 `options = ["기본","MOU"]`, `archived_options = ["특약"]`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:236:    - (통합) 다시 `["기본","MOU","특약"]`을 제출하면 `특약`이 활성으로 돌아오고 `archived_options = []`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:245:② `updateFieldDefinition`의 선택형 경로: 버전 확인을 통과한 **그 읽은 행**의 `options`·`archived_options`로 `deriveArchivedOptions({ storedActive, storedArchived, submittedActive })`를 계산해 `updateFieldDefinitionIfVersion`의 `options: 제출된 활성`, `archivedOptions: 파생값`으로 같은 한 문장에 쓴다(트랜잭션·행 잠금 없음 — `WHERE version`이 파생의 전제를 지킨다). 비선택형 칸은 선택지 열을 건드리지 않는다.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:247:③ 폼 수정 모드: 저장된 활성 선택지와 보관 선택지를 Task 2의 본문 컴포넌트(`key={version}`) 초기 상태로 받는다(page가 DTO의 `options`·`archivedOptions`를 넘김 — 새로 불러오기·저장 성공 뒤 다시 마운트로 둘 다 최신 행 값이 된다). 저장된 선택지(초기 활성 ∪ 초기 보관)는 `removeOption`의 `savedOptions`다 — 「삭제」가 보관으로 옮긴다. 보관 목록은 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 버튼과 같은 글자 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」(`kind="muted"`, `variant="text"`), 버튼 없음. N = 0이면 `details`를 렌더하지 않는다. 제출은 활성 배열만 보낸다(서버가 보관을 파생). **OPEN — /plan-design-review (2-A):** `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — UI-SPEC 원문(네이티브 `details`)대로 기본 표시를 **그대로 두고**, 숨기거나 새 아이콘을 넣지 않는다. 결정이 오면 CSS 한 곳만 바꾼다.
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:311:| 운영 안내 | 타입을 바꾸며 이름을 지키는 순서(옛 칸 이름 바꾸기 → 보관 → 새 칸) — SUMMARY |

exec
/bin/bash -lc "nl -ba docs/design/SYSTEM.md | sed -n '973,1006p'; nl -ba docs/design/SYSTEM.md | sed -n '888,935p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md | sed -n '28,75p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   973	### 7-15. 폼 (`ui/form` · `ui/select`) — 신설 (Phase 4)
   974	
   975	§6-3이 폼 **화면**의 레이아웃이고 §7-2가 **입력 하나**의 규칙이라면, 이 절은 그 둘을 잇는 **컴포넌트 계약**이다. Phase 4가 만들고(사용처 둘 — 프로젝트 등록 폼 · 매출 계약 금액 칸) **Phase 7**이 관리자 폼 8개와 `/account`를 이 계약으로 이관한다(03-OPEN-ITEMS A-H2·A-H3).
   976	
   977	**구성**
   978	
   979	- `Form` — `<form noValidate>` + 한 열, `max-width: var(--form-max)`(720), 왼쪽 정렬. 항목 사이 `--s-4`, 묶음 사이 `--s-6` + `1px --line`
   980	- `Form.Field` — 라벨 열(PC `--label-w` 96, `--fs-sm --muted` 600) + 컨트롤. 폰(<700px)에서 라벨이 위로 올라가고 컨트롤은 전폭
   981	- 칸 폭 **3종만**: select 200 · 짧은 칸(금액·날짜·수량·환율) 280 · 긴 칸(이름·비고) 480
   982	- `Form.Hint` — 컨트롤 바로 아래 한 줄 `--fs-sm --muted`, 숫자만 700. 서버 계산 값의 자리(§6-3). 읽기 전용 행을 따로 두지 않는다
   983	- `Form.Error` — 컨트롤 아래 한 줄 `--fs-sm --danger` 「원인 · 다음 행동」. 컨트롤의 `aria-describedby`가 이 줄을 가리킨다
   984	- `Form.Actions` — 폼 맨 아래 한 줄: 1차(제출) + 옆에 막힘 이유(`--fs-sm --danger`) + 다음 한 수 3차, 오른쪽 끝에 2차. 1차 버튼의 `aria-describedby`가 이유를 가리킨다(`role="alert"`가 아니다 — 누르기 전에 읽혀야 한다, §10)
   985	- **`Form.Actions`는 폼이 자기 제출을 가질 때만 둔다.** `Form.Actions`는 1차 버튼을 데려오므로, 이미 1차를 가진 화면 안에 섞여 들어간 칸에 이것을 두면 한 화면에 1차가 둘이 된다(§7-1 「한 화면에 1개」). 그런 칸은 `Form.Field` + `Form.Hint`/`Form.Error`만 쓰고 **`Form.Actions` 없는 단일 칸 폼**으로 렌더한다 — 제출은 그 화면의 1차 「일괄 저장 ⌘S N」 하나이고, 칸이 dirty면 `N`에 1칸으로 합류해 §7-3 「전부 저장 또는 전부 거부」에 같이 걸린다(위 (사)). `<form>` 요소는 그대로 두되 `Enter` 기본 제출을 막고 ⌘S에 맡긴다. 이것은 화면별 예외가 아니라 §7-15의 일반 규칙이다 — 「이 칸의 저장은 누구 책임인가」를 폼이 아니라 화면이 답한다
   986	- `Select` — 네이티브 `<select>` + 시스템 테두리(§7-2). 커스텀 드롭다운을 만들지 않는다. 고를 것이 없으면 첫 옵션이 `—`이고 제출이 막히며 이유는 `Form.Actions`에 쓴다
   987	- 자동으로 채워진 칸은 입력이 아니라 텍스트 + 「바꾸기」 3차 버튼(§6-3)
   988	
   989	**검증 관문은 서버 하나**(A-H3 해소)
   990	
   991	- 네이티브 `required`·`pattern`·`type="number"` **검증 위임을 걷어낸다.** 브라우저 기본 말풍선(영문·시스템 서체)이 §7-2의 「원인 · 다음 행동」을 가로채기 때문이다. `noValidate`를 `<form>`에 둔다
   992	- 필수 표시 `*`를 두지 않는다(§7-2). 필수인데 비면 **제출 버튼이 이유를 말한다**: `등록할 수 없음 — 클라이언트 · 담당 PM 2칸 · 클라이언트 고르기`
   993	- 서버가 돌려준 필드 오류는 해당 `Form.Error`에, 폼 전체 오류는 `Form.Actions`의 이유 자리에. **폼 상단 오류 상자를 두지 않는다**(§7-7 폼 행 "상단 한 줄 없음")
   994	- 입력값은 오류 뒤에도 남는다(UX-04)
   995	
   996	**다섯 상태**
   997	
   998	| 상태 | 모양 |
   999	|---|---|
  1000	| LOADING | **해당 없음** — 서버 컴포넌트가 기본값을 채워 렌더한다. 제출 중은 §7-1 버튼 규칙(라벨 뒤 `…`, 같은 폼의 다른 버튼도 비활성, 300ms 넘으면 상단 2px 진행 바) |
  1001	| EMPTY | **해당 없음** — 폼은 항상 칸이 있다 |
  1002	| ERROR | 위 「검증 관문」 |
  1003	| SUCCESS | 화면이 바뀌는 폼(등록 → 상세)은 이동 + §7-6 토스트. 화면이 그대로인 폼은 버튼 자리에 결과 텍스트, 입력은 읽기 전용 |
  1004	| PARTIAL | 제출 버튼 비활성 + 옆에 `…할 수 없음 — 이유 · 다음 한 수`(§6-3·UX-06) |
  1005	
  1006	---
   888	### 7-13. 체크박스 매트릭스 (권한표 · 정보 노출표)
   889	
   890	§7-3 표와 분리된 별개 컴포넌트다(D-40) — 정적 격자 + 체크박스이며 다행 편집·범위 복사·오류 셀 inset 선 같은 §7-3의 기계장치가 없다. `ui/permission-grid/`에 둔다(두 화면이 재사용, `DESIGN.md` §4 규칙 3 — 새 컴포넌트는 두 곳 이상에서 쓰일 때만).
   891	
   892	**구조**
   893	- `<table>` + 시각적으로 숨긴 `<caption>`. `role="grid"`가 **아니다** — 셀 편집이 없어 §7-3의 grid 기계장치(활성 셀·`aria-selected`·`aria-readonly`)가 필요 없다. 행 머리글 `<th scope="row">`(계급 이름), 열 머리글 `<th scope="col">`
   894	- **권한표**: 행 = 계급(시드 5종 + 추가분), 열 = 메뉴 × 동작(보기/쓰기/승인) 2단 머리글 — 1행은 메뉴 이름(`colspan=3`), 2행은 동작 이름. 셀 = 체크박스 1개
   895	- **정보 노출표**: 행 = 계급, 열 = 정보 항목(단일 단 머리글, 그룹 없음). 셀 = 체크박스 1개
   896	- 머리글: `--fs-sm --muted` 600, §7-3의 「편집 가능한 표」 신호를 그대로 물려받아 `--g-100` 바탕 + `--g-950` 글자 — 체크박스 격자도 값을 바꾸는 컨트롤이기 때문이다
   897	- **열이 많아지면(권한표, 메뉴×동작 조합) 가로 스크롤.** 행 머리글(계급 열)은 `position: sticky; left: 0` + 오른쪽 `1px --line-strong` 구분선. 열 머리글은 `position: sticky; top: 0`(정보 노출표는 항목 수가 늘면 세로 스크롤도 생기므로 함께 필요). 두 sticky가 겹치는 좌상단 모서리 셀은 `--g-100`으로 채워 배경이 끊기지 않게 한다
   898	- 세로선 없음(§4-2). 메뉴 그룹 경계만 `1px --line`으로 표시
   899	
   900	**체크박스**
   901	- 네이티브 `<input type="checkbox">`. `accent-color`는 §4-4의 `--native-accent` — §1-3의 「포인트 색 다섯 곳」 규칙과는 **별개**이며 여섯 번째 accent 사용처를 추가하는 것이 아니다
   902	- 터치 목표: 체크박스를 감싸는 `<td>`의 클릭 영역을 PC 32×32 · 폰 44×44로 채운다(§3). 셀 전체가 클릭 가능
   903	- 화면에 텍스트 라벨을 두지 않는다(격자 좌표가 라벨이다) — 대신 `aria-label="{계급} · {메뉴} · {동작}"`(권한표) / `aria-label="{계급} · {정보 항목}"`(정보 노출표)로 접근성 트리에 좌표를 문장으로 만든다
   904	
   905	**전체 · 행 · 열 선택**
   906	- 열 머리글에 체크박스 하나 — 그 열 전체를 켜고 끈다. 값이 섞여 있으면 네이티브 `indeterminate`(중간 상태)로 보인다
   907	- **행(계급) 단위 전체 선택은 두지 않는다.** 계급 하나에 딸린 모든 항목을 한 번에 켜는 것은 실수로 광범위한 권한을 부여하는 사고 위험이 크고, 열 단위 선택으로 이미 대량 변경이 가능하다(YAGNI)
   908	- 열 머리글 체크박스 클릭 = 그 열의 모든 셀에 개별 저장 호출을 순차로 보낸다(배치 API 없음 — 이 페이즈의 액션은 셀 단위 하나뿐, D-38)
   909	
   910	**저장 시점과 피드백**
   911	- **셀 하나 = 즉시 저장.** 클릭하면 체크 상태가 먼저 바뀌고(낙관적) 서버 호출이 뒤따른다. 「일괄 저장」 버튼이 없다 — 성공 기준 2(「바꾸면 즉시 메뉴·동작·응답 필드가 바뀐다」)가 이것을 요구한다
   912	- 성공: **체크 상태 자체가 결과다.** 별도 토스트·완료 표시 없음(§7-1 SUCCESS 「행동한 자리에서 결과가 보인다」와 같은 논리)
   913	- 300ms 넘게 걸리면 그 셀만 `--surface` 배경으로 지연 표시(§7-7 LOADING 지연 규칙), 짧으면 아무것도 보이지 않는다
   914	- 실패: 체크 상태를 원래 값으로 되돌리고(낙관적 되돌림) 그 셀에 `1px --danger` 테두리 + hover/focus 시 이유 한 줄(§7-2와 같은 자리, 「원인 · 다음 행동」: `저장하지 못했습니다 · 다시 시도`) + **§7-6 토스트**로도 같은 메시지(`권한 저장 실패 · 다시 시도`) — 화면을 안 보고 있어도 알아야 하는 드문 실패라 토스트를 쓴다(§7-3 「표 저장 결과는 토스트 없음」의 예외 — 이 격자는 합계 행이 없어 결과를 모아 보여줄 자리가 없다)
   915	- 열 머리글 일괄 토글 중 일부만 실패하면(PARTIAL) 실패한 셀만 원위치 + 오류 표시, 나머지는 성공 상태 유지, 토스트는 한 번(`권한 저장 · N칸 중 M칸 실패 · 다시 시도`)
   916	
   917	**다섯 상태**
   918	
   919	| 상태 | 모양 |
   920	|---|---|
   921	| LOADING | 머리글 뼈대 + `--surface` 행 3개(§7-7과 같음) |
   922	| EMPTY | **해당 없음** — 계급은 시드 5종이 항상 있고(ADMN-08) 메뉴·정보 항목도 코드 레지스트리 시드가 항상 있다. 빈 격자가 되는 경우가 없다 |
   923	| ERROR | 격자 자리에 한 줄 `--danger`: `권한표를 불러오지 못했습니다 · 다시 시도`(정보 노출표는 같은 문구를 그 이름으로) |
   924	| SUCCESS | **해당 없음** — 「저장 시점과 피드백」대로 체크 상태 자체가 결과이고 별도 SUCCESS 표시가 없다 |
   925	| PARTIAL | 열 일괄 토글 중 일부 실패(위) 또는 계급별로 서버가 아예 안 보낸 열(정보 노출표가 자기 자신에게 적용될 때 — §7-3 「칸 수 가변」 규칙과 같은 논리, 서버가 안 보낸 열은 클라이언트가 숨기지 않고 처음부터 없다) |
   926	
   927	**키보드 · 스크린리더**
   928	- 별도 방향키 로빙 없음 — 네이티브 `<table>` + 체크박스이므로 `Tab`/`Shift+Tab`이 DOM 순서(행 우선, 왼쪽→오른쪽)대로 이동하는 것으로 충분하다(§7-3의 `role="grid"` 방향키 기계장치를 다시 만들지 않는다 — D-40의 취지)
   929	- `Space`로 체크 토글(네이티브 동작)
   930	- 스크린리더 읽기 순서는 DOM 순서와 같다: 계급 행 진입 시 `<th scope="row">`가 먼저 읽히고, 각 체크박스는 `aria-label`로 메뉴·동작(또는 정보 항목)을 반복해 말한다 — 좌표를 시각적 위치가 아니라 문장으로 전달한다
   931	- 열 머리글 체크박스의 `aria-label`: `"{메뉴} · {동작} 전체 선택"`(권한표) / `"{정보 항목} 전체 선택"`(정보 노출표)
   932	
   933	**폰(375px)**
   934	- 격자를 그대로 그리지 않는다(가로 스크롤 금지 원칙은 §7-3과 같다 — 이 컴포넌트는 §7-3이 아니지만 같은 원칙을 물려받는다). 대신 **선택→목록**으로 축을 접는다: 화면 위에 계급을 고르는 네이티브 `<select>`(§7-2) 하나, 그 아래 선택된 계급의 항목을 §7-8 「시트 상세」와 같은 `dl` 골격(`KvList` 재사용 — 라벨 = 메뉴·동작 또는 정보 항목, 값 자리에 체크박스, 터치 44×44)으로 세로 나열
   935	- 이 화면은 관리자 전용 설정 화면이라(ADMN-01/02, 관리자 운영 콘솔) PC 사용이 기본이고 폰은 확인·긴급 수정용이다 — 위 대안은 그 용도로 충분하다(모든 조합을 폰에서 빠르게 편집하는 것을 목표로 하지 않는다)
    28	  confidence: low
    29	
    30	must_haves:
    31	  truths:
    32	    - "거래처 입력 화면으로 끝까지 확인한다 — 관리 화면에서 칸 추가 → 시스템 관리자의 거래처 폼·노출표에 보임 → 값 저장 → 전용 계급에서 그 칸을 끔 → 그 계급 사용자의 거래처 화면 HTML에 칸 이름과 값이 없음(저장해도 값 유지) → 보관 → 모두에게 숨음 → 보관함에서 복원 → 다시 보이고 값과 계급별 끔이 그대로. 한 E2E가 이 순서를 `CI=true`로 증명한다(ROADMAP 04.5 기준 4)"
    33	    - "머지 직전 마이그레이션 의식을 거친 뒤 이 페이즈 마이그레이션 번호는 `pnpm db:generate`가 붙인 main 마지막 + 1이다. 저널 idx가 이어지고, 손으로 넣은 채움 순서(label 기본값 → key로 채움 → 기본값 제거 → unique `(entity, label)`)와 SQL 끝의 기존 거래처 칸 노출 행 채움(표시 주석 `-- 04.5: 기존 거래처 칸 노출 행 채움` + `INSERT INTO \"visibility_matrix\" … ON CONFLICT … DO NOTHING`)이 새 SQL에 다시 들어가 있다. 어떤 파일에도 손으로 정한 번호가 없다(ROADMAP 04.5 기준 5, 병렬 페이즈 조정)"
    34	    - "main을 합친 뒤에도 공유 파일에서 main 줄이 사라지지 않는다 — `git diff origin/main`의 `-` 줄은 파일별 승인 목록(거래처 폼의 01·05·06 교체, 저널의 쉼표 한 줄 등) 안에만 있고, 저널은 main 항목 전부 보존 · `idx` 연속 · 이 페이즈 항목이 마지막이다. 관리 인덱스 링크 수 = main의 수 + 1, 보관함 등록부 항목 수 = main의 수 + 1, `domain/archive/index.ts`의 항목별 권한 세 곳(04-07·04-12와 충돌 가능)이 남아 있다. `insertVisibilityIfAbsent`는 한 벌이고 선택 `tx`를 받아 쿼리에 쓴다"
    35	    - "전체 게이트 `CI=true pnpm test`(단위 → 통합 → E2E)를 머지 의식 뒤 한 번 돌려 초록이다. 프로젝트·견적 줄 저장(Phase 4 코드)이 그대로 동작하고, 누수 스캔 생성기가 이 페이즈의 새 액션·DTO와 커스텀 칸 축을 포함한다(ROADMAP 04.5 기준 4·5)"
    36	    - statement: "E3 a11y — 화면 항목 목록의 이름 셀이 `<th scope=\"row\">`라 행 머리글이 「삭제」 트리거의 문맥이 된다. 확인 진입·취소·완료 뒤 포커스 이동·복귀가 없고 진행 중 「취소」가 잠기지 않는 것은 기록된 임시 예외(SYSTEM.md 671행, DECISIONS.md 2026-09-24)와 같다 — 독립 DOM 감사가 1280·1024·375에서 실측"
    37	      verification: backstop
    38	    - statement: "E5 scale — 커스텀 열 20개 × 이름 20자 시드에서 `/admin/visibility`의 넘침이 가로 스크롤 컨테이너 밖으로 0이고 계급 열이 sticky로 고정된다 — 독립 DOM 감사가 1280·1024·375에서 실측"
    39	      verification: backstop
    40	    - statement: "E2 populated / zero-one-many — 수정 모드에 기존 값(이름·필수·정렬·활성 선택지·보관 선택지 N개)이 채워지고, 선택지 0·1·30개에서 폼이 1열을 유지하며 가로 넘침이 없다 — 독립 DOM 감사가 1280·1024·375에서 실측"
    41	      verification: backstop
    42	    - statement: "E3 empty / populated / partial / overflow / zero-one-many / long-text — 이름 20자 행과 보관 행을 포함한 목록에서 「삭제」 트리거와 인라인 확인 줄이 칸 밖으로 넘치지 않고, 보관 행에는 트리거가 없다 — 독립 DOM 감사가 1280·1024·375에서 실측"
    43	      verification: backstop
    44	    - statement: "E4 loading / populated / overflow / zero-one-many / long-text — 거래처 폼이 커스텀 칸 0·1·N개, 20자 라벨, 40자 선택지에서 1열을 유지하고 넘침이 없다. 0개면 구분선이 없다. 서버 렌더라 로딩 상태가 없다 — 독립 DOM 감사가 1280·1024·375에서 실측"
    45	      verification: backstop
    46	    - statement: "E5 empty / loading / populated / partial — 커스텀 칸 0개면 노출표가 기존과 같고, 보관된 칸의 열은 없으며, 커스텀 열 셀 토글이 저장되고 실패하면 원위치 + 셀 이유 「저장하지 못했습니다 · 다시 시도」 + 토스트 「권한 저장 실패 · 다시 시도」 — 독립 DOM 감사가 1280·1024·375에서 실측"
    47	      verification: backstop
    48	  prohibitions:
    49	    - statement: "이 페이즈의 마이그레이션이 손으로 정한 번호나 번호 사이 빈자리를 가진 채 main에 들어가서는 안 된다 — 04.1의 저널 연속 검사가 깨지고 병렬 페이즈의 마이그레이션과 충돌한다"
    50	      status: resolved
    51	      verification: judgment
    52	  artifacts:
    53	    - path: "test/e2e/custom-field-journey.spec.ts"
    54	      provides: "ROADMAP 기준 4 여정 — 추가 → 보임 → 계급별 끔 → 보관 → 숨음 → 복원 → 다시 보임"
    55	      min_lines: 60
    56	    - path: "db/migrations/meta/_journal.json"
    57	      provides: "main 마지막 + 1 번호의 이 페이즈 항목 하나(`custom_field_admin`)"
    58	      contains: "custom_field_admin"
    59	  key_links:
    60	    - from: "test/e2e/custom-field-journey.spec.ts"
    61	      to: "test/e2e/fixtures.ts"
    62	      via: "06의 `createE2EVendorEditor`(전용 계급 사용자 — 반환 `{ email, password, roleId, roleName }`) · 01의 `archiveE2EFieldDefinitions`(정리)"
    63	      pattern: "createE2EVendorEditor"
    64	    - from: "db/migrations/NNNN_custom_field_admin.sql"
    65	      to: "db/schema/field-definitions.ts"
    66	      via: "머지 뒤 `pnpm db:generate --name custom_field_admin`이 스키마에서 다시 만든 SQL + 손으로 다시 넣은 채움 순서"
    67	      pattern: "custom_field_admin"
    68	---
    69	
    70	<objective>
    71	페이즈 전체를 거래처 입력 화면으로 끝까지 증명하고(SC-4 여정 E2E), 실행자가 아닌 별도 에이전트의 독립 DOM 감사로 backstop 여섯 개를 실측한 뒤 발견을 고친다. main을 합쳐 마이그레이션 번호를 main 마지막 + 1로 다시 만들고 공유 파일 충돌을 정리한 다음 전체 게이트를 한 번 돌린다.
    72	
    73	Purpose: ROADMAP 04.5 기준 4(여정 E2E)와 기준 5(마이그레이션 머지 의식). CLAUDE.md 화면 검증 순서(싼 게이트 → 독립 DOM 감사 → 수정 → 전체 게이트 한 번)의 마지막 세 단계.
    74	
    75	Output: `test/e2e/custom-field-journey.spec.ts` · 독립 DOM 감사 보고서(SUMMARY에 붙임) · 감사 발견 수정 · main 병합 뒤 다시 만든 마이그레이션 · 전체 게이트 결과 요약.

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md | sed -n '120,165p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '228,273p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md | sed -n '174,198p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md | sed -n '192,206p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-09-PLAN.md | sed -n '133,147p'" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   120	- 버전 조건부 갱신 규칙 — **reversible**: domain 함수와 리포지토리 함수 한 쌍이다(`version` 열 자체는 01의 마이그레이션).
   121	- 보관 선택지 파생 규칙(합집합 − 제출) — **reversible**: 서버 함수 한 곳이다.
   122	- 수정 입력 스키마 모양 — **reversible**: 액션 하나의 계약이다.
   123	
   124	</reversibility_notes>
   125	
   126	<tasks>
   127	
   128	<task type="auto" tdd="true">
   129	  <name>Task 1: 선택형 칸 등록 — 선택지 순수 함수 · 편집기 · 서버 재판정 · 거래처 폼 반영</name>
   130	  <files>domain/custom-fields/options.ts, domain/custom-fields/admin-input.ts, domain/custom-fields/admin.ts, app/(app)/admin/field-definitions/field-definition-form.tsx, app/(app)/admin/field-definitions/field-definitions.module.css, app/(app)/admin/field-definitions/page.tsx, test/unit/domain/custom-fields-admin.test.ts, test/integration/field-definitions-admin.test.ts, test/e2e/field-definitions.spec.ts</files>
   131	  <read_first>
   132	    - `.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md`·`04.5-08-SUMMARY.md` — 01·08이 만든 심볼·파일 이름(이름 예약·폼 전체 오류·「보관함에서 복원」 링크 권한은 08). 아래 이름과 다르면 SUMMARY를 따른다
   133	    - `domain/custom-fields/targets.ts`(상한 상수) · `domain/custom-fields/admin-input.ts` · `domain/custom-fields/admin.ts`의 `createFieldDefinition`
   134	    - `app/(app)/admin/field-definitions/field-definition-form.tsx`(전문) · `page.tsx`(목록 선택지 열)
   135	    - `domain/custom-fields/build-schema.ts`(전문 — `z.enum(options)`)
   136	    - `ui/status-tag/StatusTag.tsx` · `ui/button/Button.tsx`(`disabledReason`)
   137	    - UI-SPEC 「화면 2」 도해 243–255행 · 선택지 상태 259행 · Copywriting 133–136행
   138	  </read_first>
   139	  <behavior>
   140	    - (단위) `addOption({ active: ["기본"], archived: [] }, "  특약 ")` → 활성 `["기본", "특약"]`; `"기본"` → 오류 `duplicate`; `"   "` → 오류 `empty`; 활성 30개면 오류 `limit`
   141	    - (단위) `addOption({ active: ["기본"], archived: ["특약"] }, "특약")` → 활성 `["기본", "특약"]`, 보관 `[]`(복원)
   142	    - (단위) `removeOption(state, "특약", saved = {"기본","특약"})` → 보관으로 이동; 저장 안 한 `"MOU"` 삭제 → 목록에서 빠짐
   143	    - (단위) `deriveArchivedOptions({ storedActive: ["a","b","c"], storedArchived: ["x"], submittedActive: ["a","d"] })` → `["b","c","x"]`(저장 순서 유지, 중복 없음, 제출에 없는 것만)
   144	    - (단위) `createFieldDefinitionInput`이 `type: "select"`에 선택지 0개·31개·41자·공백만·중복을 거부하고, 텍스트 타입에 선택지를 실으면 거부한다
   145	    - (통합) 선택형 생성 → 행의 `options`가 활성 배열, `archived_options`가 `[]`
   146	    - (E2E) 타입 「선택」 → 「기본」·「특약」 추가(두 번째는 Enter) → 빈칸 추가 시 문구 → 저장 → 거래처 폼(`/admin/vendors?new=1`)의 그 칸 select에 「기본」·「특약」이 있다 → 목록 선택지 열이 「기본, 특약」
   147	  </behavior>
   148	  <action>
   149	① RED 먼저(behavior 전부).
   150	
   151	② `domain/custom-fields/options.ts`(순수 — `targets.ts`만 import): `normalizeOption(raw)`(앞뒤 공백 자르기), `addOption(state, raw)` → `{ state, error? }`(`empty` · `duplicate` · `limit` — 보관과 같은 문자열이면 보관에서 빼 활성 끝에 더함), `removeOption(state, value, savedOptions)`(저장된 것이면 보관으로, 아니면 목록에서 뺌), `deriveArchivedOptions({ storedActive, storedArchived, submittedActive })`. 오류 코드 → 문구 대응은 폼이 한다(Copywriting 원문).
   152	
   153	③ `admin-input.ts`의 생성 스키마: 타입 enum에 `select`, `options`(문자열 배열 — 각 원소 자르기, 1~`OPTION_MAX_LENGTH`자, 중복 없음, 최대 `ACTIVE_OPTIONS_MAX`개). 선택형이면 1개 이상, 아니면 비어 있어야 한다(빈 배열 또는 없음). `createFieldDefinition`이 `options`를 저장한다(비선택형은 null, `archived_options`는 열 기본 `[]`).
   154	
   155	④ 폼: 타입 값·활성 선택지·보관 선택지를 React 상태로 두고 상태 전이는 `options.ts` 함수로만 한다. 타입이 선택일 때만 구분선 + 선택지 목록(행마다 선택지 텍스트 + 3차 「삭제」, `aria-label` 「{선택지} 삭제」) + 새 선택지 `TextField`(short, `maxLength` 40, 오류는 이 칸의 `error`) + 3차 「선택지 추가」. 새 선택지 입력 안의 Enter는 폼 제출을 막고 추가한다. 추가·삭제 뒤 포커스는 새 선택지 입력으로. 활성 30개면 「선택지 추가」 `disabled` + `disabledReason` 「선택지는 30개까지 · 쓰지 않는 선택지 삭제」. 타입 선택 + 활성 0개면 1차 `disabled` + `disabledReason` 「추가할 수 없음 — 선택지 0개 · 선택지 추가」. 제출 때 활성 배열만 보낸다. 새 CSS는 토큰만.
   156	
   157	⑤ `page.tsx` 목록 선택지 열: 타입이 선택이면 활성 선택지를 「, 」로 이은 텍스트, 아니면 「—」.
   158	  </action>
   159	  <verify>
   160	    <automated>pnpm lint &amp;&amp; pnpm typecheck</automated>
   161	    <fails_when>eslint·stylelint·tsc 중 하나라도 error를 출력하고 종료 코드가 0이 아니다</fails_when>
   162	    <automated>pnpm vitest run --project unit test/unit/domain/custom-fields-admin.test.ts &amp;&amp; pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/field-definitions-admin.test.ts</automated>
   163	    <fails_when>단위·통합 failed 개수가 1 이상이다 — 선택지 전이·파생·입력 스키마·선택형 저장 중 하나가 깨졌다</fails_when>
   164	    <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/field-definitions.spec.ts</automated>
   165	    <fails_when>webServer의 `pnpm build`가 실패하거나 playwright failed 개수가 1 이상이다 — 빌드 오류, 선택지 편집기·거래처 폼 select 반영·목록 선택지 열 중 하나가 깨졌다</fails_when>
   228	② `domain/custom-fields/visibility.ts`: `visibleCustomFieldKeys(viewer, entity)` — `viewer.roleId`가 없으면 빈 집합, 아니면 그 대상의 활성 정의 키 중 `listVisibility(viewer, { roleId })`에서 `cf.<entity>.<key>` 행이 `visible = true`인 것만(조회 두 번). 순수 `pickVisibleCustomFields(values, keys)` — 값 객체가 없으면 그대로, 있으면 집합 안 키만 남긴 새 객체.
   229	
   230	③ `domain/vendors/index.ts`: 파일 안 로컬 함수 하나로 DTO를 만든다 — 기존 `project(viewer, row, VENDOR_DTO_SPEC)` 결과의 `customFields`에 `pickVisibleCustomFields`를 적용. 다섯 출구(`listVendors`·`searchVendors`·`createVendor`·`updateVendor`·`setVendorHidden`)가 전부 이 함수를 쓰고, 목록·검색은 보이는 키 집합을 호출당 한 번만 계산한다. `VENDOR_DTO_SPEC`(「거래처 정보」 줄 포함)·`registerDto`는 그대로 둔다. `listVendorFieldDefinitions`는 01의 보관 제외에 더해 `visibleCustomFieldKeys`에 있는 정의만 돌려준다. `validatedCustomFields`는 바꾸지 않는다(보이지 않는 칸 값 되살리기는 05).
   231	
   232	④ `test/integration/leak-scan.test.ts` **끝에** `describe("커스텀 칸 축 — …")` 하나: 테스트 안에서 시스템 관리자로 칸 둘과 거래처 하나(두 칸 값은 서로 다른 고유 문자열)를 만들고, 순수 생성기 `buildCustomFieldCases(defs, roles)`(칸 × `SEED_ROLES`, 결정적 순서)의 케이스마다 그 계급에 `admin.vendors` 보기와 `vendor.value` 보임 행(`upsertVisibility`)을 켜고, **먼저** `listVendors`의 JSON 직렬화에 두 칸 값 문자열이 모두 있음을 단언한 뒤, 그 칸만 끄고 그 값 문자열만 사라지고 다른 칸 값은 남아 있음을 단언한다. `domain/seed/index.ts`에 `vendor.value` 행을 더하지 않는다(테스트 안에서만 켠다 — Task 1 acceptance의 seed diff 0 유지 · `domain/vendors`의 `VENDOR_DTO_SPEC`은 모든 칸이 `vendor.value`에 묶여 있고 시드는 이 행을 시스템 관리자·기본 계급에만 주므로, 켜지 않으면 나머지 시드 계급 케이스가 상위 차단으로 헛되이 통과한다). 기존 `describe`·import·헬퍼는 고치지 않는다.
   233	
   234	⑤ E2E: Task 1 스펙 파일에 케이스를 더한다. 값은 01의 거래처 폼으로 저장하고, 끈 셀은 테스트 끝에 다시 켜며, 칸은 `afterAll`에서 보관한다.
   235	
   236	⑥ `test/integration/custom-fields.test.ts`는 이 플랜에서 고치지 않는다. 이 플랜은 쓰기 경로(`validatedCustomFields`)를 바꾸지 않는다. 그 파일은 DB 행을 직접 읽어 단언하므로 DTO 거르기와 무관하게 초록이다. 노출 행 픽스처와 거부 이유 단언은 쓰기 판정이 노출 행에 묶이는 05 Task 2가 더한다.
   237	  </action>
   238	  <verify>
   239	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build</automated>
   240	    <fails_when>eslint·tsc·next build 중 하나라도 error를 출력하고 종료 코드가 0이 아니다 — `plant8/no-row-type-escape` 포함</fails_when>
   241	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/leak-scan.test.ts test/integration/vendors.test.ts test/integration/custom-fields.test.ts</automated>
   242	    <fails_when>통합 failed 개수가 1 이상이다 — 칸별 거르기·노출 행 없는 정의의 기본 숨김·폼 정의 거르기·누수 스캔 커스텀 축, 또는 기존 거래처·커스텀 필드 테스트 회귀</fails_when>
   243	    <automated>flock /tmp/plant8-erp-test.lock env CI=true pnpm playwright test test/e2e/custom-field-visibility.spec.ts test/e2e/vendors.spec.ts test/e2e/vendor-edit.spec.ts</automated>
   244	    <fails_when>playwright failed 개수가 1 이상이다 — 끈 칸의 이름·값이 거래처 화면 HTML에 남았거나, 다시 켠 값이 안 보이거나, 기존 거래처 화면 회귀</fails_when>
   245	  </verify>
   246	  <acceptance_criteria>
   247	    - `domain/vendors/index.ts`에서 `project(viewer, … VENDOR_DTO_SPEC)`를 직접 부르는 곳이 로컬 DTO 함수 하나뿐이다(`grep -v '^\s*//' domain/vendors/index.ts | grep -c "VENDOR_DTO_SPEC)"`가 1 — 주석 줄 제외, 결과를 SUMMARY에 인용)
   248	    - `VENDOR_DTO_SPEC`의 필드 목록 diff가 비어 있다
   249	    - `leak-scan.test.ts` diff가 파일 끝 추가뿐이다(삭제 줄 없음)
   250	    - 커스텀 칸 축의 케이스마다 `vendor.value` 보임 행을 켜는 호출이 있고, 칸을 끄는 호출보다 **앞에** 그 값 문자열이 직렬화에 있다는 단언(양성)이, 뒤에 없다는 단언(음성)이 있다 — 시드 계급 5개 × 칸 2개 케이스 전부에서 양성 단언이 실제로 통과한 출력을 SUMMARY에 인용
   251	    - 세 검증 명령이 전부 초록이다
   252	  </acceptance_criteria>
   253	  <done>관리자가 계급별로 끈 칸은 그 계급의 거래처 DTO·화면·누수 스캔 어디에도 값이 없다</done>
   254	</task>
   255	
   256	</tasks>
   257	
   258	<threat_model>
   259	## Trust Boundaries
   260	
   261	| Boundary | Description |
   262	|----------|-------------|
   263	| 브라우저 → `setVisibilityCellAction` | 계급 id·정보 항목 문자열이 들어온다 — 항목 문자열은 위조될 수 있다 |
   264	| 거래처 DTO → 계급별 사용자 화면 | JSONB에 든 모든 칸 값이 한 행에 있다 — 판정 없이 나가면 끈 칸이 샌다 |
   265	
   266	## STRIDE Threat Register
   267	
   268	| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
   269	|-----------|----------|-----------|----------|-------------|-----------------|
   270	| T-04.5-03 | Tampering | `setVisibilityCellAction`의 `infoItem` | high | mitigate | 비동기 refine `isAssignableInfoItem` — `INFO_ITEMS` 또는 대상 상수 안의 **활성** 정의가 실제로 있는 `cf.` 키만. 위조 키로 임의 노출 행을 만들 수 없다(통합: 없는 키·보관·대상 밖·형식 오류 거부) |
   271	| T-04.5-42 | Elevation of Privilege | `setVisibilityCell`의 `cf.` 키 | high | mitigate | 셀 쓰기 권한(`admin.visibility` write)은 기존 domain 게이트(`domain/permissions/matrix.ts` 165행) 그대로다. 권한이 없는 계급(기획 PM)이 `cf.vendor.<key>` 셀을 바꾸면 `ForbiddenError`이고 행·행동 로그가 그대로인 통합 테스트가 커스텀 항목 쪽을 고정한다(Task 1, checker WARNING) |
   272	| T-04.5-43 | Denial of Service | 01 이전에 만든 거래처 정의의 값(노출 행 없음 → 기본 숨김) | medium | transfer | 01/08 마이그레이션의 일회성 백필(기존 거래처 정의 × 모든 계급, 없을 때만 보임 행)이 맡는다(그룹 A 소유). 이 플랜은 Task 2 `<precondition>`으로 그 문장의 존재를 확인하고, 노출 행 없는 정의가 누구에게도 안 보인다는 것을 통합 테스트로 고정한다 |
   273	| T-04.5-04 | Information Disclosure | 거래처 DTO 출구 다섯 · 폼 정의 목록 | high | mitigate | 모든 출구가 로컬 DTO 함수 하나로 `pickVisibleCustomFields` — 활성 ∩ 보임 키만. 「거래처 정보」 판정이 먼저라 노출 범위가 넓어지지 않는다. 누수 스캔 커스텀 축 + 끈 계급 화면 HTML E2E로 증명 |
   174	  <read_first>
   175	    - 01·Task 1이 만든 `actions.ts`·`page.tsx`·`field-definition-form.tsx`·`field-definitions.spec.ts`(이 세션에서 쓴 그대로 — 다시 읽지 않아도 되면 건너뛴다)
   176	    - `node_modules/next-safe-action/dist/index.d.mts`의 `returnValidationErrors` 선언(99행) — 칸별 오류를 액션 결과 `validationErrors.<칸>._errors`로 돌려주는 방법
   177	    - `app/(app)/admin/vendors/page.tsx`(목록 표·캡션·`th scope`·필터 줄) · `app/(app)/admin/vendors/vendors.module.css`(흰 머리글·`--cell-pad-y/x`·행 hover) · `docs/design/tokens.css`
   178	    - `ui/form/Form.tsx`(`Form.Error`는 children을 받는다) · `ui/input/TextField.tsx`(`error`는 문자열, `aria-invalid`·`aria-describedby` 배선) · `ui/button/Button.tsx`(`pending`·`disabledReason`) · `ui/status-tag/*`(StatusTag `muted`)
   179	    - `docs/design/SYSTEM.md` §7-1(진행 바 300ms) · §7-15 「화면이 그대로인 폼」(1003행 부근) · 672·993·1000행
   180	    - UI-SPEC 「화면 1」 211–237행(열·필수 평문·「화면 항목 추가」 표시 조건) · 「화면 2」 263–265행(SUCCESS·제출 중·이름 예약)
   181	    - `test/e2e/fixtures.ts`(전문) · `db/client.ts`의 `db`
   182	  </read_first>
   183	  <behavior>
   184	    - (E2E) 목록: 시스템 관리자가 만든 칸이 흰 머리글 표의 이름 열(`th scope=row`)에 보이고, 캡션 「화면 항목」이 sr-only이며, 타입 「텍스트」·필수 「—」·정렬 번호·선택지 「—」·상태 「—」 칸이 있고, 키 문자열(`cf_` + 16진 8자)은 표 어디에도 없다 · 20자 이름(`E2E칸` + 16진 16자) 행의 이름 셀 computed `overflow-wrap`이 `anywhere`다(body 상속 — 이 화면 CSS가 덮어쓰지 않는다)
   185	    - (E2E) 빈 상태: `?new=1`을 열면 타입이 「텍스트」, 정렬 순서가 활성 최대값 + 1이다
   186	    - (E2E) 이름 빈칸으로 제출하면 이름 칸 아래 「이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요」, 정렬 순서 1000이면 「0~999 사이 정수가 아닙니다 · 숫자 고치기」, 이미 있는 이름이면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」 — 입력값은 그대로 남는다
   187	    - (E2E) 보관된 칸(`archiveE2EFieldDefinitions`로 보관)과 같은 이름이면 시스템 관리자에게 「보관함에 같은 이름의 화면 항목이 있습니다 · 」 + 링크 「보관함에서 복원」(`/admin/archive`)
   188	    - (E2E write-only) 임시 계급(`insertRole` + `upsertPermission`으로 `admin.field-definitions` view·write와 `admin.archive` write만 주고 `admin.archive` view는 주지 않는다 — `vendors.spec.ts` 72행 선례)의 사용자가 같은 보관 이름으로 등록하면 이름 칸 아래는 「보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기」 평문이고 「보관함에서 복원」 링크가 없다(`admin.archive` view 없이는 `/admin/archive`가 `notFound()`이므로 — `app/(app)/admin/archive/page.tsx:15`)
   189	    - (E2E) 성공하면 결과 줄 「화면 항목 추가 · {이름} 추가됨」에 포커스가 가 있고 입력이 읽기 전용이며, 시스템 관리자에게 「정보 노출표 보기」·「하나 더 추가」·「닫기」가 보이고 아래 목록에 새 행이 있다. 「하나 더 추가」를 누르면 이름이 비고 타입이 「텍스트」로 돌아오며 정렬 순서가 새 기본값이고 이름 입력에 포커스가 있다
   190	    - (E2E) 기획 PM이 `/admin/field-definitions`와 `?new=1`에서 404를 받는다(01 케이스 유지)
   191	    - (E2E) 이 스펙의 칸 이름은 전부 `E2E칸` 접두(20자 이하)이고, `afterAll`이 `archiveE2EFieldDefinitions("E2E칸")`을 불러 이 스펙이 만든 칸(01의 트레이서 칸 포함)만 보관한다 — 다른 스펙은 자기 접두를 쓴다
   192	  </behavior>
   193	  <action>
   194	① RED: behavior의 E2E를 먼저 쓰고 빨간 것을 확인한다. `test/e2e/fixtures.ts` **끝에** `archiveE2EFieldDefinitions(labelPrefix)`를 더한다 — DB 클라이언트(`@/db/client`의 `db`)로 `label`이 접두로 시작하고 아직 보관되지 않은 행의 `archived_at`을 지금으로, `version`을 1 올린다. 이 페이즈의 E2E는 만든 칸을 끝에 항상 보관한다(뒤 스펙 — 거래처·노출표 — 에 칸이 남지 않게).
   195	
   196	② **액션.** `actions.ts`가 `DuplicateFieldNameError`를 잡아 `canRestore = can(viewer, "admin.archive", "view") && can(viewer, "admin.archive", "write") && can(viewer, "admin.field-definitions", "write")`로 `nameConflictMessage`를 고르고 `returnValidationErrors(createFieldDefinitionInput, { name: { _errors: [문구] } })`로 돌려준다(보관 이름 링크 조건 — Codex 4차 MINOR·checker R2, 복원에 필요한 두 쓰기 권한 + 리비전 검토: 링크가 가리키는 `/admin/archive`는 `admin.archive` view 없이 `notFound()`이므로(`app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정한다 — `domain/permissions/can.ts:27`) view도 함께 검사한다). 그 밖의 `UserFacingError`는 기존 서버 오류 경로(`handle-server-error.ts`)로 원문이 나간다.
   197	
   198	③ **목록(UI-SPEC 화면 1 · E1).** `page.tsx`: `listFieldDefinitionsForAdmin(viewer)`에서 보관 행을 뺀 목록(보관 포함 필터는 04)을 흰 머리글 읽기용 표로 — 캡션 sr-only 「화면 항목」, 열 일곱: 이름(`th scope="row"`) · 타입(텍스트/숫자/날짜/선택 한글) · 필수(「필수」/「—」 평문) · 정렬 · 선택지(타입이 선택이면 활성 선택지 콤마 목록, 아니면 「—」) · 상태(보관이면 「보관됨」 StatusTag `muted`, 아니면 「—」) · 동작(이 플랜에서는 비움 — 「수정」은 02, 「삭제」는 04). 등록 폼의 정렬 기본값은 활성 정의의 `sortOrder`로 `nextSortOrder`를 계산해 넘긴다. `canViewVisibility = can(viewer, "admin.visibility", "view")`를 폼에 넘긴다. `field-definitions.module.css`는 토큰만(새 색·간격·radius 금지) — 흰 머리글·`--cell-pad-y/x`·행 hover `--surface`, 셀 줄바꿈 속성을 덮어쓰지 않는다.
   192	  <verify>
   193	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm lint:sql &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build</automated>
   194	    <fails_when>eslint·stylelint·tsc·squawk·next build 중 하나라도 error를 출력하고 종료 코드가 0이 아니다 — 경계 규칙(domain → db 직접 import), 행 타입 유출 규칙, 마이그레이션 SQL 린트 위반 포함</fails_when>
   195	    <automated>pnpm test:unit</automated>
   196	    <fails_when>vitest unit의 failed 개수가 1 이상이다 — 특히 `admin-menu-registry`·`role-menu`(이 플랜은 `MENUS`를 건드리지 않으므로 그대로 초록이어야 한다)·`leak-scan-coverage`·`import-cycles`·`page-auth-guard`</fails_when>
   197	    <automated>flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev &amp;&amp; pnpm db:reset:test &amp;&amp; pnpm vitest run --project integration test/integration/field-definitions-admin.test.ts test/integration/custom-fields.test.ts test/integration/quote-lines.test.ts test/integration/vendors.test.ts test/integration/roles.test.ts'</automated>
   198	    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 한 트랜잭션(중간 실패 롤백)·전 계급 노출 행·로그·권한 거부·`label` 기본값·풀 크기만큼 동시 생성·Phase 4 견적 줄 저장·거래처 저장·계급 목록 회귀 중 하나가 깨졌다</fails_when>
   199	    <automated>flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev &amp;&amp; pnpm db:reset:test &amp;&amp; CI=true pnpm playwright test test/e2e/field-definitions.spec.ts test/e2e/vendor-edit.spec.ts test/e2e/vendors.spec.ts'</automated>
   200	    <fails_when>playwright failed 개수가 1 이상이다 — 추가 → 거래처 폼 한글 라벨, 기획 PM 404, 기존 거래처 화면 중 하나가 깨졌다</fails_when>
   201	  </verify>
   202	  <acceptance_criteria>
   203	    - 마이그레이션 SQL이 하나이고, `label` 채움(`UPDATE … SET "label" = "key"`)이 NOT NULL 기본값 제거와 unique `(entity, label)` 제약보다 먼저 온다(SUMMARY에 손 편집 본문 인용)
   204	    - 마이그레이션 번호를 손으로 붙이거나 바꾸지 않았다 — SQL 파일 이름·스냅샷·journal `idx`가 `pnpm db:generate` 출력 그대로다(SUMMARY에 생성 명령 출력 인용)
   205	    - `grep -n "export async function insertVisibilityIfAbsent" repositories/permissions.ts`가 정확히 한 줄이고, 그 함수 본문의 쿼리가 선택 인자 `tx`로 돈다(중간 실패 롤백 통합 테스트가 초록)
   206	    - `grep -v '^\s*//' repositories/field-definitions.ts | grep -c "pg_advisory_xact_lock"`가 1이고(주석 줄 제외), `createFieldDefinition`의 `withTransaction` 콜백에서 `lockCustomFieldGrants(viewer, tx)`가 첫 await이며 계급 목록 조회(dep)가 그 뒤다 — `db/client.ts` diff가 비어 있다(경합 실행 증명은 03 Task 1의 통합 테스트)
   133	  <action>
   134	① RED: `domain/permissions/menus.ts` **끝에** `{ key: "admin.field-definitions", label: "화면 항목" }`(04.5 주석 한 줄)만 먼저 더하고 `admin-menu-registry.test.ts`가 빨개지는 것을 확인한다. 이어 behavior의 단위·통합·E2E 단언을 쓰고 빨간 것을 확인한다.
   135	
   136	② **관리 인덱스(UI-SPEC 관리 인덱스 · O6 — 네 파일을 같은 태스크에서).** `ui/shell/role-menu.ts`의 `ADMIN_MENUS` 마스터 그룹 「코드표」 다음에 `{ key: "admin.field-definitions", label: "화면 항목", href: "/admin/field-definitions", group: ADMIN_GROUP_MASTER }`. `docs/design/SYSTEM.md` §6-10 제목의 「관리자 화면 10개」 → 11개, 표 마스터 행 끝에 「· 화면 항목」. `test/unit/ui/role-menu.test.ts`의 `ADMIN_MENU_KEYS`(131행)에 키를 더하고 10을 11로(152행 단언과 10을 말하는 테스트 제목), `KEY_BY_LABEL`에 「화면 항목」. `test/e2e/admin-nav.spec.ts`의 라벨 목록 두 곳(사용자 메뉴에 없어야 하는 목록 · 인덱스에 보여야 하는 목록 — 「코드표」 다음)에 「화면 항목」, 10을 말하는 제목을 11로. 주석 속 「10개」는 고치지 않는다. 병렬 페이즈가 관리 화면을 먼저 더해 main의 수가 바뀌어 있으면 07의 머지 직전 의식이 「main의 수 + 1」로 맞춘다.
   137	
   138	③ **액션 등록부.** `app/(app)/admin/field-definitions/actions.registry.ts`: vendors 선례대로 `registerAction({ name: "createFieldDefinitionAction", menu: "admin.field-definitions", action: "write", dtoName: null })`(주석 한 줄: 액션은 값을 돌려주지 않는다 — 관리 DTO는 누수 스캔의 메뉴 게이트 DTO 축이 따로 검사). `test/integration/leak-scan.test.ts`의 registry import 블록 **끝에** 이 파일 import 한 줄.
   139	
   140	④ **메뉴 게이트 DTO 축(Codex #6 · ROADMAP 기준 5).** `leak-scan.test.ts` import 블록 끝에 `FIELD_DEFINITION_ADMIN_DTO_FIELDS`·`listFieldDefinitionsForAdmin`(`@/domain/custom-fields/admin`)·`can`·`ForbiddenError`(`@/domain/permissions/can`)·`SYSADMIN_ROLE_ID` import를 더하고, 파일 **끝에** `<probe_fallback>`의 「`FieldDefinitionAdminDto`의 누수 스캔 계약」대로 `MENU_GATED_DTOS` 목록(주석: 정보 노출표 항목이 없는 관리 메타데이터 DTO의 검토된 목록 — 여기 없는 관리 DTO는 DTO 등록부 축에 있어야 한다)과 생성기, `describe` 하나를 더한다. 검토된 필드 목록은 테스트 안의 문자열 배열 리터럴이다(생산 상수를 그대로 복사해 비교하지 않고 손으로 적는다 — 검토 게이트). (d)의 거래처 칸은 시스템 관리자 viewer로 `createFieldDefinition`을 불러 만든다. `domain/permissions/dto-registry.ts`·`project.ts`는 고치지 않는다.
   141	
   142	⑤ **권한 준비 줄 정리.** `test/integration/field-definitions-admin.test.ts`의 `beforeEach`와 `test/e2e/field-definitions.spec.ts`의 `beforeAll`에서 01이 넣은 `admin.field-definitions` 권한 행 준비(`upsertPermission`)를 지우고, E2E 여정의 시작을 `/admin` 인덱스 클릭으로 바꾼다.
   143	
   144	⑥ **시드 권한(UI-SPEC 화면 1 · 라운드 2 D3).** RED: `test/integration/seed-permissions.test.ts`의 기존 `describe` 끝에 behavior의 `it` 하나를 더한다(`SYSADMIN_ROLE_ID` import는 새 줄로 더한다 — 기존 줄은 고치지 않는다). 끝에 `try/finally`로 `upsertPermission(allowed: true)`를 되돌린다 — 같은 DB를 쓰는 `field-definitions-admin.test.ts`가 ⑤ 뒤로 시드 행에 기댄다. ①의 `MENUS` 등록 뒤라 기존 루프가 행을 다시 켜서 빨간 것을 확인한다. GREEN: `domain/seed/index.ts` 시스템 관리자 루프의 `for (const menu of MENUS) {` 바로 안 첫 줄에 `if (menu.key === "admin.field-definitions") continue;`(04.5 주석 한 줄 — 아래에서 insert-if-absent로 준다)를 더한다. 루프를 닫는 `}` 다음에 `for (const action of ["view", "write"] as const)`로 `insertPermissionIfAbsent(viewer, { roleId: SYSADMIN_ROLE_ID, menu: "admin.field-definitions", action, allowed: true, updatedBy: null })`와 `permissionsCount++`를 더한다(같은 파일 PM `projects` 블록 선례). 루프 구조와 04-20이 바꾼 줄은 고치지 않는다.
   145	  </action>
   146	  <verify>
   147	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; pnpm test:unit</automated>

exec
/bin/bash -lc "nl -ba .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md | sed -n '125,188p'; nl -ba .planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md | sed -n '30,43p'; rg -n 'autoFocus|포커스|Tab|Escape|isComposing|type.*button|기본|false' .planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md .planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md | cut -c 1-700" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
   125	<assumption_delta_decision>
   126	감지기(assumption-delta)가 `chosen` 신호(용어 「custom」)를 냈다 — 정보 항목이 코드가 정한 상수(파생)에서 관리자가 고른 항목(선택)으로 바뀐다.
   127	
   128	- **이제 1차가 되는 명사:** 「정보 항목 키 공간」 = `INFO_ITEMS`(코드 상수) ∪ `cf.<entity>.<key>`(활성 칸 정의).
   129	- **결정: add-alongside.** `INFO_ITEMS`는 정적 상수로 두고, 커스텀 항목은 읽는 자리 넷(노출표 열 · 저장 허용 판정 · 거래처 DTO 출구 · 누수 스캔)에서 옆에 더한다. 이유: `visible()`·`project()`·`dto-registry`를 한 비동기 출처(`listInfoItems()`)로 올리는 promote는 Phase 4의 04-32가 같은 파일을 나란히 고치고 있어 지금 하면 충돌하고, 병렬 제약이 그 두 파일을 금지한다.
   130	- **받아들인 빚:** 정보 항목 목록이 두 곳에 있다. **promote를 강제할 조건:** Phase 10이 프로젝트·견적 줄 대상을 켜고 목록·검색·Excel까지 칸별 판정을 붙일 때 — 읽는 자리가 늘어 옆에 더하기가 흩어진다. 그때 `listInfoItems()` 한 출처로 올린다.
   131	- **불변식 테스트(수용):** `INFO_ITEMS`의 어떤 키도 `cf.`로 시작하지 않는다(01 단위) · 누수 스캔 커스텀 축(이 플랜 Task 2) — 뒤 페이즈가 정적 목록만 보는 판정을 다시 들이면 빨개진다.
   132	</assumption_delta_decision>
   133	
   134	<reversibility_notes>
   135	
   136	- 노출표 두 출처 합치기(읽는 자리마다 옆에 더함) — **costly**(D10-13 원문의 판정): 노출표 격자·저장 허용·누수 스캔 생성기가 동적 항목을 전제하게 된다. 되돌리려면 네 자리를 함께 걷어낸다.
   137	- `vendor.value` AND 칸별 판정 — **reversible**: 거래처 DTO 출구 한 곳의 규칙이다.
   138	- `createRole`의 기본 행 쓰기 — **reversible**: 함수 호출 한 줄과 그 1회 재시도·경고 로그다.
   139	
   140	</reversibility_notes>
   141	
   142	<tasks>
   143	
   144	<task type="auto" tdd="true">
   145	  <name>Task 1: 노출표 — 커스텀 열 합치기 · 저장 액션의 커스텀 키 허용(활성 정의만) · 나중에 만든 계급의 기본 행 · 시드 비재활성</name>
   146	  <files>domain/custom-fields/visibility.ts, domain/permissions/matrix.ts, app/(app)/admin/visibility/actions.ts, domain/permissions/roles.ts, test/integration/custom-field-visibility.test.ts, test/e2e/custom-field-visibility.spec.ts</files>
   147	  <read_first>
   148	    - `.planning/phases/04.5-custom-field-admin/04.5-01-SUMMARY.md`·`04.5-08-SUMMARY.md` — `domain/custom-fields/{targets,visibility,admin}.ts`의 실제 심볼 이름, E2E 픽스처(`test/e2e/fixtures.ts`의 칸 보관 헬퍼)가 01과 08 중 어디에 생겼는지
   149	    - `domain/permissions/matrix.ts` 120–160행(`visibilityColumns`·`readVisibilityGrid`) · 156–181행 `setVisibilityCell`(165행 `admin.visibility` write 판정 → `ForbiddenError`) · `MatrixDeps`
   150	    - `app/(app)/admin/visibility/actions.ts`(전문 28행)
   151	    - `domain/permissions/roles.ts` 1–30행(import — `recordAction` 동적 import 이유) · 98–115행(`createRole`)
   152	    - `domain/seed/index.ts` 150–180행(노출 시드 루프 — 읽기만)
   153	    - `repositories/permissions.ts`의 `listVisibility`·`insertVisibilityIfAbsent` · `repositories/field-definitions.ts`의 `listFieldDefinitions`(01이 더한 끝의 선택 `tx`)·`lockCustomFieldGrants`(01) · `lib/db-transaction.ts`(`withTransaction`) · `domain/custom-fields/admin.ts`의 `createFieldDefinition` deps(계급 목록 dep의 실제 이름과 세 번째 인자 `tx` — 잠금 뒤에 불린다) · `repositories/roles.ts`의 `insertRole`·`listRoles`(01이 더한 끝의 선택 `tx`) · `lib/env.ts` 54행(`DB_POOL_MAX`) · `test/integration/setup.ts`(`db`·`sql` 사용 모양)
   154	    - `test/unit/import-cycles.test.ts`(런타임 순환 검사)
   155	    - `test/e2e/permissions-grid.spec.ts`(노출표·권한표 셀 토글 E2E 선례)
   156	    - UI-SPEC 「화면 4」 303–316행
   157	  </read_first>
   158	  <behavior>
   159	    - (통합) 칸 둘(정렬 2·1)을 만들면 `readVisibilityGrid`의 열이 `INFO_ITEMS` 순서 그대로 뒤에 정렬 1 → 2 순의 `{ id: "cf.vendor.<key>", label: 한글 이름 }` 둘을 더한다 · 칸 하나를 보관(`archived_at` 직접 설정)하면 그 열이 빠진다 · 칸 0개면 열이 `INFO_ITEMS`와 같다
   160	    - (통합) `isAssignableInfoItem`: 활성 칸 키 참 · `INFO_ITEMS` 키 참 · 없는 키·보관된 칸 키·`cf.project.<key>`·`cf.vendor`·`vendor.nope` 거짓
   161	    - (통합) 칸을 만든 뒤 `createRole`로 새 계급을 만들면 그 계급에 기존 칸(보관 포함) 전부의 보임 행이 있다 · 이미 꺼 둔 행은 덮지 않는다
   162	    - (통합, 기본 행 쓰기 실패 — eng review B-2 · T1) 칸을 만든 뒤 `vi.spyOn(log, "warn")`(`@/lib/log`)을 걸고 `createRole`에 `grantCustomFieldsToRole` dep을 주입한다. ① 첫 호출만 `new Error("injected")`로 거부하고 두 번째는 진짜 `grantCustomFieldsToRole`에 인자 그대로 넘기는 dep → `createRole`이 `RoleDto`를 돌려주고, 그 계급의 `cf.vendor.<key>` 노출 행이 정확히 하나·`visible = true`이며, dep 호출 2번 · 경고 로그 0번(일시 오류는 재시도로 메워진다). ② 항상 거부하는 dep → `createRole`이 던지지 않고 `RoleDto`를 돌려주며(계급 행이 DB에 있다), dep 호출 정확히 2번, `log.warn`이 `"role.custom_field_grant_failed"`와 `roleId: <새 계급 id>`를 담아 정확히 1번, 그 계급의 `cf.` 노출 행은 0개다(숨김 쪽 실패 · 조용히 남지 않음). 재시도·로그가 없는 구현에서 ①의 행 단언과 ②의 로그 단언이 빨갛다
   163	    - (통합, 칸·계급 동시 생성 경합 — T-04.5-07 · Codex final-2 #2) 01의 `createFieldDefinition`을 시스템 관리자로 부르되 계급 목록 dep에 이 함수를 주입한다: ① 진짜 `listRoles(SYSTEM_VIEWER, { includeArchived: true }, tx)`(dep이 받은 세 번째 인자)로 목록을 읽음 → ② `insertRole`로 계급 R을 직접 넣음(커밋됨) → ③ 프로미스 `defsRead`(와 그 resolve 함수)를 만들고, `grantCustomFieldsToRole(SYSTEM_VIEWER, R.id, { listFieldDefinitions: 래퍼 })`를 **await 없이** 띄워 그 promise를 테스트 변수에 담음 — 래퍼는 진짜 `listFieldDefinitions`에 받은 인자를 그대로 넘겨 행을 받은 뒤 `defsRead`를 풀고 그 행을 돌려준다 → ④ `Promise.race([defsRead, waitForAdvisoryWaiter()])`를 await — `waitForAdvisoryWaiter`는 테스트 파일 안 헬퍼로, `db.execute(sql\`select 1 from pg_locks where locktype = 'advisory' and not granted\`)`가 1행 이상이 될 때까지 조회를 되풀이하는 루프다(타이머로 쉬지 않는다 — 조회 왕복 자체가 간격이고, `Date.now()`로 5초 넘으면 던진다) → ⑤ R이 빠진 목록을 돌려줌. `createFieldDefinition`과 담아 둔 promise를 둘 다 await한 뒤, R의 `cf.vendor.<새 키>` 노출 행이 정확히 하나이고 `visible = true`다. dep 안에서 grant를 await하면 교착이다(칸 트랜잭션이 잠금을 쥔 채 grant가 같은 잠금을 기다린다) — 기다리지 않는다. 고정 지연 없이 결정적이다: 잠금이 **없으면** grant가 곧장 정의를 읽어 `defsRead`가 풀리고(칸은 아직 커밋 전이라 새 칸을 못 봄) 반드시 R 행이 없다(RED). 01이 계급 목록을 잠금 전에 읽는 변형도 grant가 먼저 잠금을 잡고 정의를 읽어 `defsRead`로 끝나 RED다. 잠금이 **있으면** grant는 정의를 읽기 전에 잠금 대기에 걸려 `pg_locks`에 `granted = false` 행이 생기고 → race가 풀려 칸 트랜잭션이 커밋 → grant가 이어서 새 칸을 보고 행을 쓴다(GREEN). 두 경우 모두 관측 가능한 사건으로만 진행한다(`fileParallelism: false`라 다른 파일의 advisory 잠금과 섞이지 않는다)
   164	    - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 거래처 칸 하나를 `createFieldDefinition`으로 만든 뒤 `insertRole`로 계급 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개를 넣고, 그 계급마다 `grantCustomFieldsToRole`을 `Promise.all`로 동시에 부르면 전부 끝나고 계급마다 그 칸의 `cf.vendor.<key>` 노출 행이 정확히 하나다(`createRole`은 grant 실패를 삼키므로 grant를 직접 불러 실패가 드러나게 한다). 정의를 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 시간 초과로 빨갛다
   165	    - (통합) 기획 PM 계급의 `cf.vendor.<key>`를 `setVisibilityCell`로 끈 뒤 `seedMasterData`를 다시 돌려도 꺼져 있다
   166	    - (통합, 권한 거부 — checker WARNING) `admin.visibility` 쓰기가 없는 계급의 사용자(기획 PM `DEFAULT_ROLE_ID` — 테스트 첫 단언으로 `can(pmViewer, "admin.visibility", "write")`가 거짓임을 확인한다)가 `setVisibilityCell(pmViewer, { roleId: DEFAULT_ROLE_ID, infoItem: "cf.vendor.<key>", visible: false })`를 부르면 `ForbiddenError`다. 그 `(계급, cf.vendor.<key>)` 노출 행은 여전히 `visible = true`이고, 행동 로그(`permission_change`) 행 수가 호출 전과 같다
   167	    - (통합) 칸을 보관해도 그 칸의 노출 행 수가 줄지 않는다
   168	    - (E2E) 시스템 관리자가 칸을 추가 → `/admin/visibility`에 그 이름의 열 머리글이 있고 셀이 전부 켜져 있다 → 기획 PM 행의 그 칸 셀을 끄면 새로 고침 뒤에도 꺼져 있다
   169	  </behavior>
   170	  <action>
   171	① RED 먼저. 통합 픽스처의 칸은 01의 `createFieldDefinition`으로 만든다(같은 트랜잭션에서 전 계급 노출 행이 생긴다). 보관 칸은 `archived_at`을 직접 채운다. `cf.project.<key>`처럼 대상 밖 정의가 필요하면 `insertFieldDefinition`으로 직접 넣는다. 직접 넣은 거래처 정의에는 `insertVisibilityIfAbsent`로 노출 행을 명시로 더한다(Codex #2 — 노출 행 없는 정의에 기대는 테스트를 두지 않는다). 권한 거부 케이스는 도메인 함수 `setVisibilityCell`을 직접 부른다(액션의 스키마 검증과 별개로 domain 게이트를 고정한다). `createRole` 기본 행 쓰기 실패 케이스(behavior 「eng review B-2 · T1」)도 이 RED에 넣고, 재시도·경고 로그 없이 grant 한 번만 부르는 ⑤ 초안에서 ①·② 단언이 빨간 출력을 SUMMARY에 인용한다.
   172	
   173	② `domain/custom-fields/visibility.ts`에 더한다: `customFieldColumns(viewer)` — `FIELD_DEFINITION_TARGETS`마다 `listFieldDefinitions`에서 `archivedAt`이 null인 정의를 기존 정렬 그대로 `{ id: customFieldInfoItem(entity, key), label }`로. `isAssignableInfoItem(infoItem)` — `INFO_ITEMS`에 있으면 참, 아니면 `parseCustomFieldInfoItem` → 대상이 상수 안 → 그 대상의 활성 정의에 키가 있으면 참(조회는 `SYSTEM_VIEWER`). `grantCustomFieldsToRole(viewer, roleId, deps?)` — `deps`는 `listFieldDefinitions` 하나만 주입 가능(기본값은 리포지토리 함수 · 01의 `*Deps` 선례 · 운영 호출은 두 인자 그대로), 한 `withTransaction`(`lib/db-transaction.ts`) 안에서 **첫 문장** 01의 `lockCustomFieldGrants(viewer, tx)`(01의 칸 생성과 같은 잠금 — T-04.5-07) → 그 **뒤에** 대상 상수 안의 모든 정의(보관 포함)를 `listFieldDefinitions(viewer, entity, tx)`로 읽음(잠금을 쥔 **같은 연결** — 01 Task 1④와 같은 이유: 전역 `db`로 읽으면 잠금 대기 트랜잭션이 풀을 채울 때 보유자가 연결을 못 얻는다. 잠금을 잡은 뒤의 조회라 먼저 커밋된 칸을 전부 본다) → 정의마다 01의 `insertVisibilityIfAbsent(…, { visible: true }, tx)`. 잠금 전에 정의를 읽거나 잠금 없이 돌리면 동시에 만들어지는 칸을 놓쳐 그 계급에게 칸이 영구히 숨는다(칸 쪽은 잠금 뒤 계급 목록을 읽으므로 둘 중 하나만 먼저 돈다). RED 확인은 두 단계다: 잠금 줄 없이 먼저 구현한 grant로 behavior의 경합 케이스가 빨간 것을 보고 → 잠금을 더하되 정의를 `tx` 없이 읽는 상태에서 풀 고갈 케이스가 시간 초과로 빨간 것을 본 뒤(교착이 풀에 남아 뒤 케이스까지 멈추므로 이 확인은 그 케이스만 `-t`로 돌린다) → `tx`를 넘겨 둘 다 초록으로 만든다(두 실패 출력을 SUMMARY에 인용). 이 모듈은 `domain/permissions/roles.ts`를 import하지 않는다(순환 방지).
   174	
   175	③ `domain/permissions/matrix.ts`: `visibilityColumns`를 비동기로 바꿔 `INFO_ITEMS` 열 뒤에 `customFieldColumns(viewer)`를 붙이고 `readVisibilityGrid`가 기다린다. `MatrixDeps`에 주입 지점이 필요하면 선택 필드로 더한다. 셀 쓰기(`setVisibilityCell`)는 바꾸지 않는다.
   176	
   177	④ `app/(app)/admin/visibility/actions.ts`: `infoItem`의 정적 `Set` refine을 `isAssignableInfoItem` 비동기 refine으로 바꾸고 메시지는 기존 「알 수 없는 정보 항목입니다.」 그대로. 이 변경으로 쓰이지 않게 된 `infoItemKeys`·`INFO_ITEMS` import를 지운다(자기 변경이 만든 고아만).
   178	
   179	⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.
   180	
   181	⑥ 시드: `domain/seed/index.ts`는 고치지 않는다 — 통합 테스트로 「시드는 커스텀 항목 행을 쓰지 않는다」를 증명한다.
   182	
   183	⑦ E2E(`custom-field-visibility.spec.ts`): 칸은 01의 관리 화면으로 만들고 `afterAll`에서 칸 보관 E2E 헬퍼(01·08 SUMMARY의 실제 이름 — 옛 계획의 `archiveE2EFieldDefinitions`)로 보관한다. 셀을 끈 계급(기획 PM)은 테스트 끝에 다시 켠다(공유 `erp_test` DB — 다른 스펙에 남기지 않는다).
   184	  </action>
   185	  <verify>
   186	    <automated>pnpm lint &amp;&amp; pnpm typecheck &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm build &amp;&amp; pnpm test:unit</automated>
   187	    <fails_when>eslint·tsc·next build가 error로 끝나거나 vitest unit failed가 1 이상이다 — 특히 `import-cycles`(roles ↔ custom-fields 순환)</fails_when>
   188	    <automated>pnpm db:dev &amp;&amp; flock /tmp/plant8-erp-test.lock pnpm vitest run --project integration test/integration/custom-field-visibility.test.ts test/integration/visibility.test.ts test/integration/roles.test.ts test/integration/seed-permissions.test.ts</automated>
    30	
    31	must_haves:
    32	  truths:
    33	    - "대상 등록부 `domain/custom-fields/targets.ts`(다른 모듈을 import하지 않는 순수 모듈)가 `FIELD_DEFINITION_TARGETS = [\"vendor\"]` · `customFieldInfoItem`/`parseCustomFieldInfoItem`(`cf.<entity>.<key>`) · 상한 상수 · `nextSortOrder`를 두고, 01이 `admin.ts`에 둔 모듈 상수·항목 키 함수는 이것으로 바뀐다. `INFO_ITEMS`의 어떤 키도 `cf.`로 시작하지 않는다(D10-13 노출표 두 출처의 키 공간 분리)"
    34	    - "등록 폼의 빈 상태가 없다 — 칸이 항상 있고 타입 기본 「텍스트」, 정렬 순서 기본 = `min(활성 최대값 + 1, 999)`, 활성 정의가 없으면 1이다(UI-SPEC E2 empty, O16)"
    35	    - "칸 오류는 서버가 판정해 해당 칸 아래 `Form.Error`로 보인다 — 이름 빈칸 「이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요」, 정렬 순서 범위 밖 「0~999 사이 정수가 아닙니다 · 숫자 고치기」. 이름은 입력 `maxLength` 20 + 서버 20자 상한이다(domain도 같은 상수로 다시 판정). 오류 뒤에도 입력값이 남는다(UI-SPEC E2 error·long-text, UX-04)"
    36	    - "이름은 보관된 칸까지 포함해 거래처 안에서 유일하다(D10-12 보관 규칙) — 활성 칸과 같으면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」, 보관된 칸과 같으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」이고 「보관함에서 복원」은 복원에 필요한 두 쓰기 권한(`admin.archive` write · `admin.field-definitions` write)과 `admin.archive` view가 다 있을 때만 3차 링크(`/admin/archive`), 아니면 「보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기」 평문이다(링크가 가리키는 `/admin/archive`는 `admin.archive` view 없이 `notFound()`다 — `app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정한다). 서버는 `listFieldDefinitions` 조회로 두 경우를 가르고, 조회와 쓰기 사이 경합은 unique 위반을 같은 칸 오류로 바꾼다(UI-SPEC O22, E2 name-reserved, Codex 4차 MINOR = checker R2)"
    37	    - "폼 전체 서버 오류는 `Form.Actions` 1차 옆 이유 자리에 「추가할 수 없음 — {serverError 원문} · 다시 시도」로 보인다 — 원문에 이미 「 · 」가 있으면 「 · 다시 시도」를 붙이지 않는다. 폼 상단 오류 상자 컴포넌트는 쓰지 않는다. 제출 중 권한이 회수되면 원인은 「권한 없음」이다(UI-SPEC Copywriting 137행, 화면 1 권한 · **OPEN 1-A**)"
    38	    - "제출 중에는 1차가 `pending`이고 입력 전체가 `fieldset disabled`로 잠기며 「취소」도 비활성이다(UI-SPEC E2 loading, O15)"
    39	    - "등록이 성공하면 1차 버튼 자리가 결과 줄 「화면 항목 추가 · {이름} 추가됨」(`role=status`, 포커스를 받음)으로 바뀌고 입력은 읽기 전용이 되며, 3차 「정보 노출표 보기」(`/admin/visibility` — `can(viewer, \"admin.visibility\", \"view\")`일 때만, 1-C · D10-13 자동 등록 확인)·3차 「하나 더 추가」(폼을 key로 다시 마운트해 타입·정렬 기본값까지 초기화하고 이름 입력으로 포커스)·2차 「닫기」가 붙는다. 아래 목록은 서버 재검증으로 새 행을 보인다(UI-SPEC E2 success, O8)"
    40	    - "목록 표는 흰 머리글의 읽기용 표(캡션 sr-only 「화면 항목」)이고 열은 이름(`th scope=row`)·타입·필수(「필수」/「—」 평문)·정렬·선택지·상태·동작이다. 정렬은 정렬 순서 오름차순, 같은 번호면 내부 키 순이다. 키는 어느 열에도 보이지 않는다. 셀 줄바꿈은 body 상속 `overflow-wrap: anywhere`이고 이 화면 CSS가 덮어쓰지 않는다. 이 플랜은 보관 행을 목록에서 뺀다(보관 포함 필터는 04) (UI-SPEC E1 populated·zero-one-many·long-text·overflow, R7)"
    41	    - "마이그레이션 문장 순서 가드(`test/unit/custom-fields/field-definitions-migration.test.ts`)가 01의 손 편집을 지킨다 — `label` 채움이 NOT NULL 기본값 제거·unique `(entity, label)`보다 먼저, 기존 거래처 칸 노출 행 채움(`INSERT INTO \"visibility_matrix\"` … `ON CONFLICT (\"role_id\", \"info_item\") DO NOTHING`)이 그 뒤에 온다 · `version` NOT NULL 기본 1 · `archived_options` NOT NULL 기본 빈 배열. 07의 머지 직전 재생성에서 손 편집이 사라지면 빨개진다"
    42	    - "E2E가 만든 칸은 끝에 항상 보관된다 — `test/e2e/fixtures.ts` 끝의 `archiveE2EFieldDefinitions(labelPrefix)`(03·04·06·07이 같은 이름으로 쓴다)를 `field-definitions.spec.ts`의 `afterAll`이 부른다"
    43	  artifacts:
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:38:    - "잠금·계급 목록 조회·칸 정의 삽입·노출 행 삽입은 전부 **같은 트랜잭션 연결(`tx`)**에서 돈다 — 잠금을 쥔 채 전역 `db`로 계급을 읽으면 잠금 대기 트랜잭션들이 풀(`DB_POOL_MAX` 기본 5, `lib/env.ts:54`)을 다 쥔 때 보유자가 조회용 연결을 영원히(Phase 4 `db/client.ts` 머지 뒤엔 5초 뒤 실패) 기다린다. `createFieldDefinition`을 `DB_POOL_MAX`개 동시에 불러도 전부 성공한다(T-04.5-07 · Codex final-2 #1)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:39:    - "마이그레이션 하나가 `label`(NOT NULL — 기존 행은 `key`로 채움) · `archived_at` · `archived_by` · `archived_options`(JSONB `string[]`, 기본 `[]`) · `version`(integer NOT NULL 기본 1) · unique `(entity, label)`(label 채움 뒤)을 더하고, 이미 있는 거래처 칸 정의마다 `roles` 전 행의 노출표 행(`cf.vendor.<key>`, 보임)을 `ON CONFLICT DO NOTHING`으로 채운다 — 다시 돌려도 행이 늘지 않고, 이미 꺼 둔 행은 꺼진 채다. 번호는 `pnpm db:generate`가 정하고 계획은 번호를 적지 않는다(UI-SPEC O11·O20·O22, D10-13, 그룹 B 요구 · Codex #2)"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:67:      provides: "한 트랜잭션(중간 실패 롤백) · 전 계급 노출 행 · 로그 · 권한 거부 · 키 충돌 재시도 · label 기본값 · 기존 칸 노출 행 채움(전 계급 · 멱등 · 꺼진 행 유지) · 마이그레이션 문장 순서"
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:98:**실행 규율:** 코드를 쓰는 태스크는 먼저 Skill `test-driven-development`(RED를 실제로 확인 → GREEN → 리팩터), 테스트·빌드·린트 실패는 코드를 만지기 전에 Skill `systematic-debugging`, 커밋과 「완료」 전에는 Skill `verification-before-completion`을 호출한다. 서브에이전트에 위임하면 세 스킬과 `model`을 프롬프트에 적는다. 한 세션에 플랜 하나. E2E 판정은 `CI=true`다. **공유 테스트 환경 직렬화(공유 결정 3):** 공유 테스트 DB(`erp_test`)·통합 테스트·`db:reset:test`·마이그레이션·E2E 서버 포트 3100·`next bu
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:122:**UI Considerations 행 배분(옛 01 → 01·08, 빠진 행 없음):** 이 플랜은 E5 auto-register(한 트랜잭션 노출 행)와 E2(등록 폼)의 **등록 경로 자체**를 덮는다. 옛 01이 덮던 E1(목록)의 populated·zero-one-many·long-text·overflow와 E2의 empty(기본값)·error·loading·success·name-reserved는 전부 08로 옮겼다 — 08의 `must_haves`가 같은 문장으로 받는다. backstop 여섯 줄은 DOM 감사를 하는 07이 옮겼다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:124:**옛 01의 must_have 중 08로 옮긴 것(조용히 뺀 것 없음 — 메뉴 등록·관리 인덱스·액션 등록부·누수 스캔 계약은 08에서 다시 09로 나눴다):** 관리 인덱스 「화면 항목」 링크와 SYSTEM.md §6-10·`role-menu.test.ts`·`admin-nav.spec.ts`의 10 → 11(UI-SPEC O6 — 한 계획에서 함께) · `MENUS` 등록(아래 「메뉴 등록 위치」) · 목록 표 · 정렬 기본값(`nextSortOrder`) · 칸 오류 문구 · 이름 예약(활성·보관, 「보관함에서 복원」 링크의 두 쓰기 권한) · 폼 전체 이유 자리(OPEN 1-A) · 제출 중 잠금 · 결과 줄(1-C, 「
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:138:- **이 플랜의 등록 폼 범위:** 칸 넷(이름·타입·필수·정렬 순서) + 1차 「화면 항목 추가」 + 2차 「취소」. 성공하면 폼을 닫는다(`router.replace("/admin/field-definitions")`). 결과 줄·칸 오류·이유 자리·제출 중 잠금·정렬 기본값·목록 표는 08의 E2 행이다.
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:160:    - `lib/db-transaction.ts`(`withTransaction`) · `db/client.ts` 29–48행(풀 `max: env.DB_POOL_MAX`·`DbOrTx`) · `lib/env.ts` 54행(`DB_POOL_MAX` 기본 5) · `lib/pg-errors.ts`의 `isUniqueViolation`
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:175:    - (통합, 풀 고갈 — T-04.5-07 · Codex final-2 #1) 서로 다른 이름으로 `createFieldDefinition`을 `env.DB_POOL_MAX`(`@/lib/env`, 기본 5)개 `Promise.all`로 동시에 부르면 전부 성공하고, 새 칸마다 `roles` 전 행의 `cf.vendor.<key>` 노출 행이 하나씩 있다(칸 수 × 계급 수). 계급 목록을 잠금 뒤 전역 `db`로 읽는 구현에서는 잠금 보유자가 조회용 연결을 얻지 못해 이 케이스가 시간 초과로 빨갛다 — RED가 시간 초과 형태임을 SUMMARY에 적는다(교착이 풀에 남아 뒤 케이스까지 멈추므로 RED 확인은 이 케이스만 `-t`�
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:182:② **스키마·마이그레이션.** `db/schema/field-definitions.ts`에 `label`(text, NOT NULL) · `archivedAt`·`archivedBy`(거래처 표와 같은 선언) · `archivedOptions`(jsonb, NOT NULL, 기본 빈 배열, `string[]` 타입) · `version`(integer, NOT NULL, 기본 1) · unique 제약 `field_definitions_entity_label_key`(`entity`, `label`)를 더하고 표 위 주석에 한 줄(보관 선택지는 `archived_options`, `options`는 활성만 · 이름은 보관 칸까지 예약 · `version`은 조건부 갱신용 — UI-SPEC O11·O20·O22)을 더한다. `flock /tmp/plant8-erp-test.lock pnpm db:generate --name custom_field_a
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:184:③ **리포지토리.** `insertFieldDefinition`에 선택 `label`(없으면 `key`)과 마지막 선택 인자 `tx: DbOrTx = db`를 더하고, 쿼리를 그 `tx`로 돌린다. `listFieldDefinitions`에도 마지막 선택 인자 `tx: DbOrTx = db` 하나만 더하고 쿼리를 그 `tx`로 돌린다 — 조건·정렬(`where(entity)`·`orderBy(sortOrder, key)`)은 그대로이고, 두 인자 호출(`domain/projects/index.ts:30`·`domain/quotes/lines.ts:27`·`domain/vendors`)은 인자를 바꾸지 않는다(CONTEXT 「분리로 생긴 조정」 호출 모양 유지 · `repositories/quote-lines.ts:23` 선례 · 03의 `grantCustomField
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:186:④ **domain.** `domain/custom-fields/admin-input.ts`(zod만 import): `createFieldDefinitionInput` — `.strict()` `{ name: 문자열(앞뒤 공백 자름, 1자 이상), type: enum(text|number|date), required: boolean, sortOrder: 정수 }`(대상 없음). 칸 오류 문구·20자·0~999 범위·이름 충돌 문구는 08이 이 스키마에 더한다. `domain/custom-fields/admin.ts`: 모듈 상수 `FIELD_ENTITY = "vendor"`와 노출표 항목 키를 만드는 비공개 함수(`cf.${entity}.${key}`) — 08이 둘을 `targets.ts`로 옮긴다. `createFieldDefinition(viewer, { name, type, required, sortOrder }, deps?)`: `can(viewer, "
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:188:⑤ **액션·화면.** `app/(app)/admin/field-definitions/actions.ts`: `createFieldDefinitionAction` — vendors 선례대로 `authedActionClient.schema(createFieldDefinitionInput)`, `createFieldDefinition(ctx.viewer, parsedInput)` 호출, 결과를 돌려주지 않는다(DTO 없음), `revalidatePath("/admin/field-definitions")`·`revalidatePath("/admin/vendors")`·`revalidatePath("/admin/visibility")`. 액션 등록부(`actions.registry.ts`)와 누수 스캔 import는 메뉴 등록과 한 묶음으로 08이 만든다(누수 스캔 액션 축이 `action.menu`가 `MENUS`에 있기를 요구한다). `page.tsx`: vendors 페이지와 
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:198:    <fails_when>통합 failed 개수가 1 이상이다(시간 초과 포함) — 한 트랜잭션(중간 실패 롤백)·전 계급 노출 행·로그·권한 거부·`label` 기본값·풀 크기만큼 동시 생성·Phase 4 견적 줄 저장·거래처 저장·계급 목록 회귀 중 하나가 깨졌다</fails_when>
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:203:    - 마이그레이션 SQL이 하나이고, `label` 채움(`UPDATE … SET "label" = "key"`)이 NOT NULL 기본값 제거와 unique `(entity, label)` 제약보다 먼저 온다(SUMMARY에 손 편집 본문 인용)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:227:    - (통합) 준비: 거래처 칸 정의 하나와 프로젝트 칸 정의 하나를 `insertFieldDefinition`으로 직접 넣고(노출 행 없음), 계급 하나를 `archived_at`으로 보관하고, 기획 PM 계급의 그 거래처 칸 항목 행을 `visible = false`로 미리 넣는다 → 읽은 문장을 실행 → 그 거래처 칸 키의 `cf.vendor.<key>` 행이 `roles` 전 행(보관 계급 포함)에 하나씩 있고, 기획 PM 행은 `false` 그대로이며, 프로젝트 칸에는 행이 없다 → 같은 문장을 한 번 더 실행해도 행 수와 값이 같다
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:233:② **마이그레이션 끝에 기존 칸 노출 행 채움(그룹 B 요구 · Codex #2 · D10-13).** Task 1의 손 편집 뒤, SQL 파일 끝에 `--> statement-breakpoint`로 나눈 표시 주석 `-- 04.5: 기존 거래처 칸 노출 행 채움`과 문장 하나를 손으로 더한다: `INSERT INTO "visibility_matrix" ("role_id", "info_item", "visible") SELECT r."id", 'cf.vendor.' || fd."key", true FROM "field_definitions" fd CROSS JOIN "roles" r WHERE fd."entity" = 'vendor' ON CONFLICT ("role_id", "info_item") DO NOTHING;` — `updated_at`은 기본값, `updated_by`는 null(시드 행과 같은 결). `pnpm lint:sql`이 받는지
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:269:| T-04.5-01 | Elevation of Privilege | `/admin/field-definitions` 화면 · `createFieldDefinition` | high | mitigate | page는 `can(viewer, "admin.field-definitions", "view")` 아니면 `notFound()`, `?new=1` 폼은 write일 때만, domain은 `write`를 매번 다시 판정해 「권한 없음」 `ForbiddenError`. 권한 행은 09의 `MENUS` 등록 뒤 시드의 시스템 관리자 루프만 만든다(다른 계급 행 없음 → `can()` 기본 거부) — 이 플랜의 테스트는 시스템 관리자 행만 명시로 넣는다. 통합(기획 PM 거부)·E2E(404)로 증명 — Task 1 |
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:284:- `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test …'`로 E2E 세 파일(`field-definitions` · `vendor-edit` · `vendors`) 통과 — DB 준비는 `db:reset:test` → globalSetup(마이그레이션 → 기본 시드) → 스펙 `beforeAll` 픽스처 순서(공유 결정 4)
.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md:305:| 테스트 | `test/integration/field-definitions-admin.test.ts`(한 트랜잭션·중간 실패 롤백·전 계급 노출 행·로그·권한 거부·키 충돌 재시도·label 기본값·기존 칸 노출 행 채움) · `test/e2e/field-definitions.spec.ts`(트레이서 + 기획 PM 404) |
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:38:    - "「새로 불러오기」(3차)는 충돌 결과를 지우고 `router.refresh()` 뒤 폼의 입력 쪽을 새 `version`으로 다시 마운트해(page `key={id}` + 같은 파일의 폼 본문 컴포넌트 `key={version}` — UI-SPEC의 `key={id}:{version}`과 같은 초기화) 최신 행(이름·필수·정렬·활성/보관 선택지)을 채우고 이름 입력으로 포커스를 보낸다 — 저장 안 한 입력은 버리고, 누르기 전까지는 입력이 남는다. 「목록으로」(3차)는 `router.replace`로 폼을 닫는다(UI-SPEC E2 stale)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:39:    - "수정 성공은 1차 자리 결과 줄 「화면 항목 수정 · {이름} 수정됨」(`role=status`, 포커스) + 2차 「닫기」(목록으로 `router.replace`)이고 입력은 읽기 전용이다. 재검증으로 새 `version`이 와서 입력이 다시 마운트돼도 결과 줄은 남고 숨은 `version`은 v+1이라, 「닫기」 → 「수정」으로 이어서 저장해도 충돌이 아니다. 그 밖의 폼 전체 서버 오류는 08의 `formReason(\"수정\", serverError)` 규칙이다(폼 전체 오류 UI는 01 분할로 08이 완성한다, UI-SPEC 화면 2 SUCCESS, Copywriting)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:41:    - "수정 모드의 선택지: 아직 저장 안 한 선택지의 「삭제」는 목록에서 빼고, 저장된 선택지의 「삭제」는 보관 목록으로 옮긴다(「취소」하면 원래대로). 보관 선택지와 같은 문자열을 다시 추가하면 그 선택지가 활성으로 돌아온다(중복 생성 없음). 저장된 선택지 문자열은 읽기 전용이다. 두 경우 모두 포커스는 새 선택지 입력으로 간다. 선택지 행의 「삭제」 접근 이름은 「{선택지} 삭제」다(UI-SPEC 화면 2 선택지 상태, O3, R5)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:42:    - "보관 선택지는 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」으로만 보이고 버튼이 없다 — N = 0이면 렌더하지 않고, 개수 상한은 활성에만 건다(UI-SPEC 화면 2, E2 overflow, **OPEN 2-A**)"
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:87:- **2-A** 보관 선택지 `summary`의 브라우저 기본 펼침 표시(삼각형)를 남길지 — 원문(네이티브 `details`)대로 그대로 둔다(Task 3)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:140:    - (단위) `addOption({ active: ["기본"], archived: [] }, "  특약 ")` → 활성 `["기본", "특약"]`; `"기본"` → 오류 `duplicate`; `"   "` → 오류 `empty`; 활성 30개면 오류 `limit`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:141:    - (단위) `addOption({ active: ["기본"], archived: ["특약"] }, "특약")` → 활성 `["기본", "특약"]`, 보관 `[]`(복원)
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:142:    - (단위) `removeOption(state, "특약", saved = {"기본","특약"})` → 보관으로 이동; 저장 안 한 `"MOU"` 삭제 → 목록에서 빠짐
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:146:    - (E2E) 타입 「선택」 → 「기본」·「특약」 추가(두 번째는 Enter) → 빈칸 추가 시 문구 → 저장 → 거래처 폼(`/admin/vendors?new=1`)의 그 칸 select에 「기본」·「특약」이 있다 → 목록 선택지 열이 「기본, 특약」
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:153:③ `admin-input.ts`의 생성 스키마: 타입 enum에 `select`, `options`(문자열 배열 — 각 원소 자르기, 1~`OPTION_MAX_LENGTH`자, 중복 없음, 최대 `ACTIVE_OPTIONS_MAX`개). 선택형이면 1개 이상, 아니면 비어 있어야 한다(빈 배열 또는 없음). `createFieldDefinition`이 `options`를 저장한다(비선택형은 null, `archived_options`는 열 기본 `[]`).
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155:④ 폼: 타입 값·활성 선택지·보관 선택지를 React 상태로 두고 상태 전이는 `options.ts` 함수로만 한다. 타입이 선택일 때만 구분선 + 선택지 목록(행마다 선택지 텍스트 + 3차 「삭제」, `aria-label` 「{선택지} 삭제」) + 새 선택지 `TextField`(short, `maxLength` 40, 오류는 이 칸의 `error`) + 3차 「선택지 추가」. 새 선택지 입력 안의 Enter는 폼 제출을 막고 추가한다. 추가·삭제 뒤 포커스는 새 선택지 입력으로. 활성 30개면 「선택지 추가」 `disabled` + `disabledReason` 「선택지는 30개까지 · 쓰지 않는 �
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:193:    - (E2E) 같은 선택형 칸의 수정 폼을 두 탭(페이지)으로 열어 한쪽이 이름을 바꾸고 새 선택지 하나를 더해 저장한 뒤 다른 쪽이 저장하면 이유 자리에 「수정할 수 없음 — 다른 사람이 먼저 고쳤습니다 · 」 + 3차 「새로 불러오기」 → 누르면 충돌 이유 줄이 사라지고 이름 칸이 먼저 저장된 값이며 선택지 편집기의 활성 목록도 먼저 저장된 값(더한 선택지 포함)이고 포커스가 이름 입력에 있다(본문 컴포넌트 `key={version}` 다시 마운트가 선택지 상태까지 초기화하는지 — 같은 함
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207:⑥ `page.tsx`: `editId`가 활성 거래처 정의 id이고 쓰기 권한이 있을 때만 수정 폼을 `key={id}`로 렌더하고(`version`은 prop), 폼이 열려 있으면(`?new=1` 또는 수정) 필터 줄 「화면 항목 추가」를 렌더하지 않는다. 동작 열: 쓰기 권한이면 3차 링크 「수정」(`?editId=<id>`, `aria-label` 「{이름} 수정」). 폼은 두 컴포넌트다(새 파일 없음 — 같은 `field-definition-form.tsx` 안에 비공개 함수 컴포넌트 하나를 더한다, `vendor-form.tsx` 210행 `VendorCustomField` 같은 파일 내 보조 컴포넌트 선례): 바깥 컴포넌트는 `useAc
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:235:    - (통합) 저장된 `["기본","특약"]`에서 `["기본","MOU"]`를 제출하면 `options = ["기본","MOU"]`, `archived_options = ["특약"]`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:236:    - (통합) 다시 `["기본","MOU","특약"]`을 제출하면 `특약`이 활성으로 돌아오고 `archived_options = []`
.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:247:③ 폼 수정 모드: 저장된 활성 선택지와 보관 선택지를 Task 2의 본문 컴포넌트(`key={version}`) 초기 상태로 받는다(page가 DTO의 `options`·`archivedOptions`를 넘김 — 새로 불러오기·저장 성공 뒤 다시 마운트로 둘 다 최신 행 값이 된다). 저장된 선택지(초기 활성 ∪ 초기 보관)는 `removeOption`의 `savedOptions`다 — 「삭제」가 보관으로 옮긴다. 보관 목록은 네이티브 `details`(기본 접힘) + `summary` 「보관된 선택지 {N}개」(3차 버튼과 같은 글자 모양) 안에 선택지마다 텍스트 + StatusTag 「보관됨」(`kind=

exec
/bin/bash -lc "sed -n '188,191p' .planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md; sed -n '174,185p' .planning/phases/04.5-custom-field-admin/04.5-03-PLAN.md; sed -n '30,41p' .planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md" in /home/user/ERP_PLANT8_260917
 succeeded in 0ms:
⑤ **액션·화면.** `app/(app)/admin/field-definitions/actions.ts`: `createFieldDefinitionAction` — vendors 선례대로 `authedActionClient.schema(createFieldDefinitionInput)`, `createFieldDefinition(ctx.viewer, parsedInput)` 호출, 결과를 돌려주지 않는다(DTO 없음), `revalidatePath("/admin/field-definitions")`·`revalidatePath("/admin/vendors")`·`revalidatePath("/admin/visibility")`. 액션 등록부(`actions.registry.ts`)와 누수 스캔 import는 메뉴 등록과 한 묶음으로 08이 만든다(누수 스캔 액션 축이 `action.menu`가 `MENUS`에 있기를 요구한다). `page.tsx`: vendors 페이지와 같은 인증 가드 → `can(viewer, "admin.field-definitions", "view")` 없으면 `notFound()` → `PageHeader title="화면 항목" subtitle="거래처"` → 필터 줄(쓰기 권한이 있고 폼이 닫혀 있을 때만 3차 링크 「화면 항목 추가」 → `?new=1`) → `?new=1`이고 쓰기 권한이 있으면 등록 폼(쓰기 권한이 없으면 `?new=1`로 와도 폼을 렌더하지 않는다). 목록 표·`field-definitions.module.css`는 08이다. `field-definition-form.tsx`(클라이언트): `ui/form/Form` + `className="single-column"`, 칸 넷 — 이름(`TextField`, long) · 타입(`Select`, select 폭, 텍스트/숫자/날짜, 기본 텍스트) · 필수(체크박스 「필수」) · 정렬 순서(`TextField` short, 숫자) → 1차 「화면 항목 추가」 · 2차 링크 「취소」(`/admin/field-definitions`). `useAction(createFieldDefinitionAction)`이 성공하면 `router.replace("/admin/field-definitions")`로 폼을 닫는다 — 결과 줄·칸 오류·이유 자리·제출 중 잠금·정렬 기본값은 08의 E2 행이다. 새 색·간격·radius 없음(이 플랜은 CSS 모듈을 만들지 않는다).

⑥ **거래처 폼 라벨(UI-SPEC 화면 3 변경 2 · Codex #9).** `vendor-form.tsx` 16행 부근 로컬 타입 `VendorFieldDefinition`에 `label: string`을 더하고(domain DTO 변경만으로는 이 타입이 넓어지지 않는다), `VendorCustomField`의 라벨 두 곳(`<label>` 텍스트·`TextField`의 `label`)을 `def.key` → `def.label`로 바꾼다. 입력 이름·값 키(`cf_${def.key}`·`customFields[def.key]`)는 그대로다. 그 밖의 거래처 폼 변경은 06이다.
  </action>

③ `domain/permissions/matrix.ts`: `visibilityColumns`를 비동기로 바꿔 `INFO_ITEMS` 열 뒤에 `customFieldColumns(viewer)`를 붙이고 `readVisibilityGrid`가 기다린다. `MatrixDeps`에 주입 지점이 필요하면 선택 필드로 더한다. 셀 쓰기(`setVisibilityCell`)는 바꾸지 않는다.

④ `app/(app)/admin/visibility/actions.ts`: `infoItem`의 정적 `Set` refine을 `isAssignableInfoItem` 비동기 refine으로 바꾸고 메시지는 기존 「알 수 없는 정보 항목입니다.」 그대로. 이 변경으로 쓰이지 않게 된 `infoItemKeys`·`INFO_ITEMS` import를 지운다(자기 변경이 만든 고아만).

⑤ `domain/permissions/roles.ts`의 `createRole`: `repoInsertRole` 뒤, 로그 전에 `grantCustomFieldsToRole(viewer, row.id)` 한 줄(실패하면 예외가 그대로 올라가게 두지 말고 — `repoInsertRole`(109행)이 트랜잭션 없이 이미 커밋했으므로 계급은 남는다 — **한 번만** 다시 부른다: grant는 자기 `withTransaction`이라 실패한 시도는 롤백되고 `insertVisibilityIfAbsent`는 없을 때만 쓰므로 재시도가 안전하다. 두 번째도 실패하면 `log.warn("role.custom_field_grant_failed", { roleId: row.id, message })`(`@/lib/log` — `domain/system-status/index.ts` 75행의 `message` 모양 선례) 한 줄 뒤 계속한다: 그 계급에게 칸이 안 보이는 쪽으로 실패하고 로그가 그 계급을 가리킨다). 실패 주입 지점으로 `RoleWriteDeps`(87행)에 선택 필드 `grantCustomFieldsToRole`을 더한다 — 타입은 `import type`(6행 `recordAction` 타입과 같은 방식이라 런타임 순환이 없다), 기본값은 진짜 함수, 운영 호출(`createRoleAction`)은 그대로 두 인자다. 정적 import가 `import-cycles` 테스트에서 순환으로 잡히면 이 파일의 `recordAction`과 같은 방식(동적 import)으로 늦춘다.

⑥ 시드: `domain/seed/index.ts`는 고치지 않는다 — 통합 테스트로 「시드는 커스텀 항목 행을 쓰지 않는다」를 증명한다.

⑦ E2E(`custom-field-visibility.spec.ts`): 칸은 01의 관리 화면으로 만들고 `afterAll`에서 칸 보관 E2E 헬퍼(01·08 SUMMARY의 실제 이름 — 옛 계획의 `archiveE2EFieldDefinitions`)로 보관한다. 셀을 끈 계급(기획 PM)은 테스트 끝에 다시 켠다(공유 `erp_test` DB — 다른 스펙에 남기지 않는다).
  </action>
  <verify>

must_haves:
  truths:
    - "대상 등록부 `domain/custom-fields/targets.ts`(다른 모듈을 import하지 않는 순수 모듈)가 `FIELD_DEFINITION_TARGETS = [\"vendor\"]` · `customFieldInfoItem`/`parseCustomFieldInfoItem`(`cf.<entity>.<key>`) · 상한 상수 · `nextSortOrder`를 두고, 01이 `admin.ts`에 둔 모듈 상수·항목 키 함수는 이것으로 바뀐다. `INFO_ITEMS`의 어떤 키도 `cf.`로 시작하지 않는다(D10-13 노출표 두 출처의 키 공간 분리)"
    - "등록 폼의 빈 상태가 없다 — 칸이 항상 있고 타입 기본 「텍스트」, 정렬 순서 기본 = `min(활성 최대값 + 1, 999)`, 활성 정의가 없으면 1이다(UI-SPEC E2 empty, O16)"
    - "칸 오류는 서버가 판정해 해당 칸 아래 `Form.Error`로 보인다 — 이름 빈칸 「이름이 비어 있습니다 · 화면 항목 이름을 적어 주세요」, 정렬 순서 범위 밖 「0~999 사이 정수가 아닙니다 · 숫자 고치기」. 이름은 입력 `maxLength` 20 + 서버 20자 상한이다(domain도 같은 상수로 다시 판정). 오류 뒤에도 입력값이 남는다(UI-SPEC E2 error·long-text, UX-04)"
    - "이름은 보관된 칸까지 포함해 거래처 안에서 유일하다(D10-12 보관 규칙) — 활성 칸과 같으면 「같은 이름의 화면 항목이 이미 있습니다 · 이름 바꾸기」, 보관된 칸과 같으면 「보관함에 같은 이름의 화면 항목이 있습니다 · 보관함에서 복원」이고 「보관함에서 복원」은 복원에 필요한 두 쓰기 권한(`admin.archive` write · `admin.field-definitions` write)과 `admin.archive` view가 다 있을 때만 3차 링크(`/admin/archive`), 아니면 「보관함에 같은 이름의 화면 항목이 있습니다 · 이름 바꾸기」 평문이다(링크가 가리키는 `/admin/archive`는 `admin.archive` view 없이 `notFound()`다 — `app/(app)/admin/archive/page.tsx:15`, `can()`은 동작을 독립 판정한다). 서버는 `listFieldDefinitions` 조회로 두 경우를 가르고, 조회와 쓰기 사이 경합은 unique 위반을 같은 칸 오류로 바꾼다(UI-SPEC O22, E2 name-reserved, Codex 4차 MINOR = checker R2)"
    - "폼 전체 서버 오류는 `Form.Actions` 1차 옆 이유 자리에 「추가할 수 없음 — {serverError 원문} · 다시 시도」로 보인다 — 원문에 이미 「 · 」가 있으면 「 · 다시 시도」를 붙이지 않는다. 폼 상단 오류 상자 컴포넌트는 쓰지 않는다. 제출 중 권한이 회수되면 원인은 「권한 없음」이다(UI-SPEC Copywriting 137행, 화면 1 권한 · **OPEN 1-A**)"
    - "제출 중에는 1차가 `pending`이고 입력 전체가 `fieldset disabled`로 잠기며 「취소」도 비활성이다(UI-SPEC E2 loading, O15)"
    - "등록이 성공하면 1차 버튼 자리가 결과 줄 「화면 항목 추가 · {이름} 추가됨」(`role=status`, 포커스를 받음)으로 바뀌고 입력은 읽기 전용이 되며, 3차 「정보 노출표 보기」(`/admin/visibility` — `can(viewer, \"admin.visibility\", \"view\")`일 때만, 1-C · D10-13 자동 등록 확인)·3차 「하나 더 추가」(폼을 key로 다시 마운트해 타입·정렬 기본값까지 초기화하고 이름 입력으로 포커스)·2차 「닫기」가 붙는다. 아래 목록은 서버 재검증으로 새 행을 보인다(UI-SPEC E2 success, O8)"
    - "목록 표는 흰 머리글의 읽기용 표(캡션 sr-only 「화면 항목」)이고 열은 이름(`th scope=row`)·타입·필수(「필수」/「—」 평문)·정렬·선택지·상태·동작이다. 정렬은 정렬 순서 오름차순, 같은 번호면 내부 키 순이다. 키는 어느 열에도 보이지 않는다. 셀 줄바꿈은 body 상속 `overflow-wrap: anywhere`이고 이 화면 CSS가 덮어쓰지 않는다. 이 플랜은 보관 행을 목록에서 뺀다(보관 포함 필터는 04) (UI-SPEC E1 populated·zero-one-many·long-text·overflow, R7)"
    - "마이그레이션 문장 순서 가드(`test/unit/custom-fields/field-definitions-migration.test.ts`)가 01의 손 편집을 지킨다 — `label` 채움이 NOT NULL 기본값 제거·unique `(entity, label)`보다 먼저, 기존 거래처 칸 노출 행 채움(`INSERT INTO \"visibility_matrix\"` … `ON CONFLICT (\"role_id\", \"info_item\") DO NOTHING`)이 그 뒤에 온다 · `version` NOT NULL 기본 1 · `archived_options` NOT NULL 기본 빈 배열. 07의 머지 직전 재생성에서 손 편집이 사라지면 빨개진다"

codex
기본값·빈 목록의 첫 행동·제출 중 잠금·성공 결과는 대체로 계획에 반영되어 있습니다. 남은 핵심은 재시도로 해결되지 않는 오류의 탈출 경로, 기본 이름 오류의 제출 버튼 옆 요약, 04의 권한 거부·숨김에 대한 실제 실행 검증입니다. 확정된 DeleteToArchive 예외는 결함 집계에서 제외했습니다.

codex
아래 `08:200`은 `04.5-08-PLAN.md:200`을 뜻합니다. 구현 결과가 아닌 **계획의 계약 충족 여부**를 판정했습니다.

| 항목 | 추천 | 이유 | 근거 |
|---|---|---|---|
| OPEN 1-A | 「{추가/수정}할 수 없음 — 권한 없음 · 관리자에게 권한 요청」으로 분기하고 제출 비활성화, 닫기 유지 | 권한이 복구되기 전 재제출은 해결책이 아니다 | [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207) |
| OPEN 1-B | 이름 오류도 화면 순서대로 요약에 포함하고 「이름 고치기」로 포커스 이동; 문구는 「이름이 비어 있습니다 · 이름 입력」 | 브라우저 검증을 제거한 뒤에도 제출 실패 원인과 복구 동선이 이어져야 한다 | [06:99](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:99) |
| OPEN 2-A | 네이티브 삼각형 유지 | 설명 없이 펼칠 수 있음을 드러내며 확정된 `details` 계약에 맞는다 | [02:247](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:247) |
| OPEN 2-B | 「수정할 수 없음 — 화면 항목 없음 · 목록으로」, 실제 3차 이동 버튼 제공 | 없는 대상은 재시도로 수정할 수 없다 | [02:88](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:88), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207) |
| OPEN 5-A | 타입별로 「숫자가 아닙니다 · 숫자 입력」처럼 구체화; 선택지는 「선택할 수 없는 값입니다 · 다른 선택지 고르기」 | 「값 확인」은 모호하고 선택지 전체 나열은 밀집 화면의 오류 한 줄을 과도하게 늘린다 | [05:120](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:120) |
| OPEN 5-B | 「입력 항목을 확인할 수 없습니다 · 새로 불러오기」와 복구 동작 제공 | 사용자에게 보이지 않는 내부 키 오류는 값을 확인해도 고칠 수 없다 | [05:119](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:119), [05:125](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:125) |
| OPEN 3: 재시도 모양 | 일시 오류에 한해 평문 유지 | 기존 제출 버튼으로 재시도할 수 있으므로 별도 버튼은 중복이다 | [08:111](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:111) |
| 편차-04a | **현 상태 불충분**; 실제 서버 액션 경유 거부 E2E 추가 후 수용 | 소스의 위임 형태와 domain 거부만으로 액션 경로의 거부까지 실행 증명하지는 못한다 | [04:113](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:113) |
| 편차-04b | **현 상태 불충분**; 두 쓰기 권한의 조합별 삭제 트리거 DOM 검증 추가 | 모두 허용된 성공 사례만으로 「하나라도 없으면 숨김」을 증명할 수 없다 | [04:114](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:114) |
| 편차-06a | 수용 | 실제 서버 오류 E2E가 이유 문구·`aria-describedby`·상단 오류 상자 부재를 확인하므로 디자인 계약에는 충분하다 | [06:93](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:93), [06:130](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:130) |

- **[MAJOR] 영구적 실패에도 재제출 유도** — [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207). 권한 없음·대상 없음을 일반 오류와 분리하고 위 표의 복구 행동을 명시해야 한다. 거래처가 보관된 오류를 재시도로 검증하는 [06:130](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:130)도 같은 분류로 정리한다.

- **[MAJOR] 이름만 틀리면 제출 옆이 침묵함** — [06:99](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:99), [06:145](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:145). `noValidate`로 기존 브라우저 안내를 없애면서 기본 칸 오류를 요약에서 제외한다. 이름 단독 오류·이름과 커스텀 칸 동시 오류의 요약 및 포커스 검증을 추가한다.

- **[MAJOR] 04의 대체 검증에서 금지 상태가 빠짐** — [04:137](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:137), [04:185](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:185); 요구 계약은 [UI-SPEC:232](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:232). RTL 도입은 불필요하지만, 액션 경유 거부와 권한 부족 시 트리거 부재는 E2E로 보완해야 한다.

- **[MINOR] 빈 목록에서 추가 행동이 중복될 수 있음** — [04:197](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:197)은 EMPTY 추가 링크를 항상 제공하고, [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207)은 필터 줄만 숨긴다. 등록 폼이 열리면 EMPTY의 추가 링크도 숨긴다.

- **[MINOR] 한글 입력의 Enter 계약 누락** — [02:155](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155). 선택지 Enter 추가에 한글 조합 확정 제외를 명시하고, Tab 이동·추가/삭제 후 포커스·닫기 후 복귀를 키보드 여정으로 검증한다.

- **[NOTE] 화면 1 상태** — 로딩은 승인 계약상 해당 없음; EMPTY 첫 행동, 조회 오류, 성공 후 목록 갱신, 보관 행 PARTIAL, 권한별 잠김은 계획에 있다. 빈 상태 중복 외 누락은 확인되지 않았다. [04:197](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:197), [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200)

- **[NOTE] 화면 2 상태** — 기본 타입·정렬, 제출 중 잠금, 값 보존, 성공 결과·포커스, 선택지 0개 PARTIAL, 타입 변경 불가가 명시되어 있다. 남은 ERROR/locked 문제는 1-A·2-B다. [08:34](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:34), [02:155](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155)

- **[NOTE] 화면 3 상태** — 0칸 묶음 생략, 오류·값 보존, 기존 빈 필수값 PARTIAL, 보관값 유지·숨은 칸 보호는 충족한다. 제출 중 잠금과 성공은 기존 흐름에 의존하므로 네 타입이 포함된 회귀 확인을 명시하면 좋다. [06:127](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:127), [06:204](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:204)

- **[NOTE] 화면 4 상태** — 로딩·조회 오류·0개·성공·잠김은 기존 매트릭스 계약을 상속한다. 커스텀 셀 실패 복귀는 감사하지만, 열 전체 토글의 일부 실패와 키보드 Tab/Space 검증은 명시가 약하다. [UI-SPEC:316](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:316), [07:46](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md:46)

- **[NOTE] §7 나머지** — 새 상시 도움말·대상/키 선택·추가 확인 단계는 없다. 정렬 방식, 전 계급 노출 기본값, DeleteToArchive의 확인·복수 primary·포커스 예외는 확정 결정을 유지한다. [UI-SPEC:324](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:324)

Recommendation: MAJOR 3건을 계획에 반영한 뒤 승인 because 현재는 해결 불가능한 재시도와 오류 복구·권한별 검증 공백이 남아 있다.
판정: 막는 문제 있음 (3건)
tokens used
98,360
아래 `08:200`은 `04.5-08-PLAN.md:200`을 뜻합니다. 구현 결과가 아닌 **계획의 계약 충족 여부**를 판정했습니다.

| 항목 | 추천 | 이유 | 근거 |
|---|---|---|---|
| OPEN 1-A | 「{추가/수정}할 수 없음 — 권한 없음 · 관리자에게 권한 요청」으로 분기하고 제출 비활성화, 닫기 유지 | 권한이 복구되기 전 재제출은 해결책이 아니다 | [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207) |
| OPEN 1-B | 이름 오류도 화면 순서대로 요약에 포함하고 「이름 고치기」로 포커스 이동; 문구는 「이름이 비어 있습니다 · 이름 입력」 | 브라우저 검증을 제거한 뒤에도 제출 실패 원인과 복구 동선이 이어져야 한다 | [06:99](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:99) |
| OPEN 2-A | 네이티브 삼각형 유지 | 설명 없이 펼칠 수 있음을 드러내며 확정된 `details` 계약에 맞는다 | [02:247](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:247) |
| OPEN 2-B | 「수정할 수 없음 — 화면 항목 없음 · 목록으로」, 실제 3차 이동 버튼 제공 | 없는 대상은 재시도로 수정할 수 없다 | [02:88](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:88), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207) |
| OPEN 5-A | 타입별로 「숫자가 아닙니다 · 숫자 입력」처럼 구체화; 선택지는 「선택할 수 없는 값입니다 · 다른 선택지 고르기」 | 「값 확인」은 모호하고 선택지 전체 나열은 밀집 화면의 오류 한 줄을 과도하게 늘린다 | [05:120](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:120) |
| OPEN 5-B | 「입력 항목을 확인할 수 없습니다 · 새로 불러오기」와 복구 동작 제공 | 사용자에게 보이지 않는 내부 키 오류는 값을 확인해도 고칠 수 없다 | [05:119](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:119), [05:125](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-05-PLAN.md:125) |
| OPEN 3: 재시도 모양 | 일시 오류에 한해 평문 유지 | 기존 제출 버튼으로 재시도할 수 있으므로 별도 버튼은 중복이다 | [08:111](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:111) |
| 편차-04a | **현 상태 불충분**; 실제 서버 액션 경유 거부 E2E 추가 후 수용 | 소스의 위임 형태와 domain 거부만으로 액션 경로의 거부까지 실행 증명하지는 못한다 | [04:113](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:113) |
| 편차-04b | **현 상태 불충분**; 두 쓰기 권한의 조합별 삭제 트리거 DOM 검증 추가 | 모두 허용된 성공 사례만으로 「하나라도 없으면 숨김」을 증명할 수 없다 | [04:114](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:114) |
| 편차-06a | 수용 | 실제 서버 오류 E2E가 이유 문구·`aria-describedby`·상단 오류 상자 부재를 확인하므로 디자인 계약에는 충분하다 | [06:93](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:93), [06:130](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:130) |

- **[MAJOR] 영구적 실패에도 재제출 유도** — [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200), [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207). 권한 없음·대상 없음을 일반 오류와 분리하고 위 표의 복구 행동을 명시해야 한다. 거래처가 보관된 오류를 재시도로 검증하는 [06:130](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:130)도 같은 분류로 정리한다.

- **[MAJOR] 이름만 틀리면 제출 옆이 침묵함** — [06:99](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:99), [06:145](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:145). `noValidate`로 기존 브라우저 안내를 없애면서 기본 칸 오류를 요약에서 제외한다. 이름 단독 오류·이름과 커스텀 칸 동시 오류의 요약 및 포커스 검증을 추가한다.

- **[MAJOR] 04의 대체 검증에서 금지 상태가 빠짐** — [04:137](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:137), [04:185](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:185); 요구 계약은 [UI-SPEC:232](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:232). RTL 도입은 불필요하지만, 액션 경유 거부와 권한 부족 시 트리거 부재는 E2E로 보완해야 한다.

- **[MINOR] 빈 목록에서 추가 행동이 중복될 수 있음** — [04:197](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:197)은 EMPTY 추가 링크를 항상 제공하고, [02:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:207)은 필터 줄만 숨긴다. 등록 폼이 열리면 EMPTY의 추가 링크도 숨긴다.

- **[MINOR] 한글 입력의 Enter 계약 누락** — [02:155](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155). 선택지 Enter 추가에 한글 조합 확정 제외를 명시하고, Tab 이동·추가/삭제 후 포커스·닫기 후 복귀를 키보드 여정으로 검증한다.

- **[NOTE] 화면 1 상태** — 로딩은 승인 계약상 해당 없음; EMPTY 첫 행동, 조회 오류, 성공 후 목록 갱신, 보관 행 PARTIAL, 권한별 잠김은 계획에 있다. 빈 상태 중복 외 누락은 확인되지 않았다. [04:197](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-04-PLAN.md:197), [08:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:200)

- **[NOTE] 화면 2 상태** — 기본 타입·정렬, 제출 중 잠금, 값 보존, 성공 결과·포커스, 선택지 0개 PARTIAL, 타입 변경 불가가 명시되어 있다. 남은 ERROR/locked 문제는 1-A·2-B다. [08:34](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-08-PLAN.md:34), [02:155](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-02-PLAN.md:155)

- **[NOTE] 화면 3 상태** — 0칸 묶음 생략, 오류·값 보존, 기존 빈 필수값 PARTIAL, 보관값 유지·숨은 칸 보호는 충족한다. 제출 중 잠금과 성공은 기존 흐름에 의존하므로 네 타입이 포함된 회귀 확인을 명시하면 좋다. [06:127](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:127), [06:204](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-06-PLAN.md:204)

- **[NOTE] 화면 4 상태** — 로딩·조회 오류·0개·성공·잠김은 기존 매트릭스 계약을 상속한다. 커스텀 셀 실패 복귀는 감사하지만, 열 전체 토글의 일부 실패와 키보드 Tab/Space 검증은 명시가 약하다. [UI-SPEC:316](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:316), [07:46](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-07-PLAN.md:46)

- **[NOTE] §7 나머지** — 새 상시 도움말·대상/키 선택·추가 확인 단계는 없다. 정렬 방식, 전 계급 노출 기본값, DeleteToArchive의 확인·복수 primary·포커스 예외는 확정 결정을 유지한다. [UI-SPEC:324](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md:324)

Recommendation: MAJOR 3건을 계획에 반영한 뒤 승인 because 현재는 해결 불가능한 재시도와 오류 복구·권한별 검증 공백이 남아 있다.
판정: 막는 문제 있음 (3건)
exit=0
