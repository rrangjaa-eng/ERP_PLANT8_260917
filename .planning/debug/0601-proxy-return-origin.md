---
status: diagnosed
trigger: "06.1 UAT #40 — 대리 등록 패널을 닫거나 저장하면 출발 목록이 아니라 항상 ?state=unmatched로 간다"
created: 2026-10-20T15:10:00Z
updated: 2026-10-20T15:55:00Z
phase: 06.1
goal: find_root_cause_only
---

## Symptoms
- expected: 증빙 목록(할 일 기본·전체·공개 등 어느 목록이든)에서 「대리 등록」을 열고 Esc·취소·저장하면 출발한 목록(거르개 포함)으로 돌아가고 포커스는 누른 「대리 등록」 링크로 간다(실행 스레드 판단 P-1 「목록으로 = 출발 목록」).
- actual: 출발 목록 3종(기본 할 일, 전체, 공개+카드)에서 측정 — 도착이 항상 /expenses/evidence?state=unmatched, type 거르개 사라짐, 포커스는 출발이 unmatched일 때만 링크, 나머지는 H1.
- errors: 없음
- reproduction: UAT #40 (/mnt/project-files/06.1-review/verify/staging-uat.md)
- timeline: 스테이징 UAT 2026-10-20에서 발견
- suspects: app/(app)/cards/page.tsx:227-238, ui/side-panel/SidePanel.tsx:62-75·190-192, domain/evidence-records/index.ts:325-350. UI-SPEC 06.1-UI-SPEC.md:661은 unmatched로 적혀 있음.

## Current Focus
bug_class: Bohrbug (결정적 — 같은 입력이면 항상 같은 도착, UAT 2회 + 스크래치 재현 일치)
hypothesis: CONFIRMED — S8 닫을 곳·저장 도착이 `cards/page.tsx:228` 상수 하나에서 나오고 출발 주소가 어디에도 전달되지 않는다. SidePanel `openedFromList`는 직전 기록 URL = closeHref(정확 일치)일 때만 back()이라 unmatched 밖 출발은 replace(상수).
next_action: 진단 반환(goal: find_root_cause_only) — 수정 없음
candidate_causes:
  - "code: closeHref·doneHref 상수 고정(cards/page.tsx:228·235·238) + 링크에 출발 정보 없음(evidence-table.tsx:798·851)"
  - "code: openedFromList 정확 일치 비교(SidePanel.tsx:62-72)"
  - "spec/decision: UI-SPEC S8 :661 저장 도착 = unmatched 고정, P-1 ①(design-review.md:112) 「출발 목록」을 점검표 :10이 그 상수로 구체화 — UAT 체크리스트 #40(prep-uat-tests.md:71)은 '거르개 포함 정확한 출발'로 읽음"
and_gate: "yes — 상수 closeHref AND 정확 일치 openedFromList가 함께여야 증상. 저장 쪽은 상수 doneHref 단독 + 착지 토스트 landingHref(evidence/page.tsx:50)가 state만 남겨 거르개를 한 번 더 잃는다."
blind_spots: "포커스 H1 갈래의 정확한 타이밍(replace 경로에서 loading.tsx 뼈대가 먼저 커밋돼 proxyLinkFor가 링크를 못 찾는다고 추정)은 브라우저로 재지 않았다 — 도착 주소가 고쳐지면(back 경로) 같이 풀리는 종속 증상."

## Evidence
- timestamp: 2026-10-20T15:15:00Z
  checked: app/(app)/cards/page.tsx:226-238
  found: `const evidenceListHref = "/expenses/evidence?state=unmatched";` 하나가 `doneHref: \`${evidenceListHref}&registered=\``(:235)와 `<CardUsageFromEvidencePanel closeHref={evidenceListHref}>`(:238) 둘 다에 쓰인다. 출발 목록을 읽는 코드 없음(params에 from/return 류 없음). 주석 :227 「PR-D D-3(판정 P-1 ①) — 닫기도 저장처럼 출발한 증빙 목록으로 간다. 앱 안에서 그 목록에서 열었으면 SidePanel이 뒤로 가기로 닫는다.」
  implication: 닫기·저장 도착이 출발과 무관한 상수다.

- timestamp: 2026-10-20T15:17:00Z
  checked: ui/side-panel/SidePanel.tsx:62-72, 184-193
  found: `openedFromList(closeHref)`는 Navigation API 직전 같은 문서 항목 URL의 pathname+search가 closeHref와 정확히 같을 때만 true. `leave()`는 true면 `router.back()`, 아니면 `router.replace(closeHref, { scroll: false })`.
  implication: 출발이 `?state=unmatched`일 때만 back()으로 출발 목록 복원(우연히 상수와 같음). 그 밖 출발은 replace(상수) — UAT 측정과 일치.

- timestamp: 2026-10-20T15:19:00Z
  checked: app/(app)/expenses/evidence/evidence-table.tsx:798, :851 · domain/evidence-records/index.ts:320-350
  found: `대리 등록` 링크·Ctrl+E 둘 다 `/cards?new=1&evidence=${row.id}` — 출발 쿼리를 싣지 않는다. `canProxy`는 상태 거르개와 무관하게 짝 없는 카드 줄이면 선다(할 일·전체·미공개·공개·묶음 보기에서도).
  implication: unmatched 밖 목록에서 여는 것이 정상 경로다 — 상수 도착은 그 경로들에서 출발 목록이 아니다.

- timestamp: 2026-10-20T15:21:00Z
  checked: app/(app)/cards/card-usage-form.tsx:268-282, :453-457
  found: `CardUsageFromEvidencePanel`이 `returnFocusTo={() => proxyLinkFor(evidenceId)}`; 저장 성공은 `panelRef.current?.succeed({ href: \`${fromEvidence.doneHref}${data.id}\` })`.
  implication: 포커스 복귀는 도착 목록에 그 증빙 행 링크가 있을 때만 — 출발이 전체·할 일이어도 도착이 unmatched면 행이 보통 거기 있으나, back()이 아닌 replace라 연 요소(opener)가 새로 그려져 문서에 없고, UAT는 H1 포커스로 측정(행이 그 쪽에 없거나 페이지 다름). 포커스 증상은 도착 주소 증상의 종속 결과.

- timestamp: 2026-10-20T15:23:00Z
  checked: app/(app)/expenses/evidence/page.tsx:47-53
  found: 저장 착지 토스트를 닫으면 `landingHref = \`/expenses/evidence?state=${params.state ?? "unmatched"}\``로 replace — type·period·batch·page를 버린다.
  implication: doneHref를 출발 목록으로 바꿔도 토스트 닫기에서 거르개가 한 번 더 사라진다 — 고칠 때 같이 봐야 할 두 번째 자리.

- timestamp: 2026-10-20T15:25:00Z
  checked: test/e2e/evidence-reconcile.spec.ts:158-203 · test/unit/app/cards-page.test.ts
  found: D-3 E2E는 출발을 `/expenses/evidence?state=unmatched`(:166·:203)로만 둔다. 단위 테스트에 S8 closeHref 단언 없음.
  implication: 출발 = 상수인 우연 경로만 검증돼 CI가 초록이었다(왜 안 잡혔나).

- timestamp: 2026-10-20T15:30:00Z
  checked: 결정 기록 — /mnt/project-files/06.1-exec/pr-d/design-review.md:106·112·149, docs/design/checks/2026-10-20-06.1-prd-gate-fixes.md:10, /mnt/project-files/06.1-exec/pr-d/qa.md:64, /mnt/project-files/06.1-review/verify/prep-uat-tests.md:71·102, .planning/phases/06.1-evidence-bulk-intake/06.1-VERIFICATION.md:145·247, 06.1-09-PLAN.md:69, 06.1-UI-SPEC.md:661, docs/design/SYSTEM.md §6-3(:493 「옆 패널 닫기」)
  found: P-1(design-review.md:112)은 바로 이 S8 닫을 곳에 관한 판정이다 — 질문 「§6-3 '직접 연 URL은 목록으로 replace'의 '목록'이 패널 자기 화면 목록(/cards)인가, 건너온 패널의 출발 목록인가(D-3)」, 선택지 ① 「출발 목록(S8 closeHref = 증빙 목록)」 ② 「자기 목록 유지(지금 /cards)」, 기본값 ① 사유 「저장이 이미 출발 목록으로 돌아가므로 닫힘도 맞춘다」. D-3 고칠 방향(:106) 「S8의 closeHref를 출발 증빙 목록(doneHref에서 registered 뺀 것)으로」. 점검표 :10이 이를 「S8의 닫을 곳은 저장 뒤 돌아가는 곳과 같은 주소 /expenses/evidence?state=unmatched」로 구체화. 즉 P-1의 「출발 목록」은 '/cards가 아니라 증빙 화면'이라는 뜻이었고 실행자는 UI-SPEC :661 저장 착지(unmatched)를 그 값으로 썼다. UAT 체크리스트 prep-uat-tests.md:71은 같은 낱말을 '거르개 포함 정확한 출발 목록 + 같은 증빙 링크 포커스'로 읽었다. VERIFICATION.md:145는 이미 「⚠ WARNING — 부분 … 갭은 아니고(UI-SPEC 문면 충족), 사람이 정할 일」로 적었다.
  implication: P-1은 다른 링크가 아니라 이 S8 닫힘 대상이다. 도착을 증빙 화면으로 옮긴 부분(D-3 원래 결함 /cards)은 고쳐졌고, '정확한 출발 목록'은 UI-SPEC·P-1 어디에도 요구로 적힌 적이 없다 — 체크리스트 해석의 확장. 다만 SYSTEM §6-3 「앱 안에서 연 패널은 router.back() … 닫힌 뒤 포커스는 연 요소로」는 unmatched 밖 출발에서 지켜지지 않는다(앱 안에서 열었는데 replace).

- timestamp: 2026-10-20T15:45:00Z
  checked: 스크래치 재현 /tmp/claude-0/-home-user-ERP-PLANT8-260917/d96c8a1a-455f-5014-9ef1-1ad0e417edbd/scratchpad/repro/opened-from-list.cjs — SidePanel.tsx의 실제 `openedFromList` 본문과 cards/page.tsx의 `evidenceListHref` 상수를 소스에서 뽑아 TS 트랜스파일 후 가짜 Navigation API(직전 항목 = UAT 출발 4종)로 실행
  found: 출발 `/expenses/evidence` · `?state=all` · `?state=published&type=card_receipt` → `router.replace(/expenses/evidence?state=unmatched)`; 출발 `?state=unmatched` → `router.back()`(출발 복원). UAT #40 측정 4행과 그대로 일치.
  implication: 가설 확정 — 도착 주소 증상은 상수 closeHref × 정확 일치 비교로 완전히 설명된다.

- timestamp: 2026-10-20T15:47:00Z
  checked: `pnpm exec vitest run --project unit test/unit/ui/side-panel.test.ts test/unit/app/cards-page.test.ts`
  found: 2 files · 25 tests 통과. 둘 다 S8(`?evidence=`) closeHref나 unmatched 밖 출발을 단언하지 않는다.
  implication: 현 테스트는 이 갈래를 막지 못한다(회귀 가드 없음).

- timestamp: 2026-10-20T15:49:00Z
  checked: 다른 「목록으로」 링크·다른 P-1 존재 여부 — app/ui grep, 06.1-UI-SPEC.md:46, /mnt/project-files/06.1-exec/pr-c/design-review.md:78
  found: S8에 「목록으로」 글자 링크는 없다(체크리스트 #40 제목은 SYSTEM §6-3 「목록으로 replace」의 의역). 이름이 같은 P-1이 둘 더 있다 — UI-SPEC :46 P-1(증빙 화면 위치 `/expenses/evidence`)·PR-C design-review :78 P-1(Ctrl+E 주인). #40이 인용한 P-1은 PR-D design-review :112(S8 닫을 곳)이다.
  implication: P-1은 다른 링크가 아니라 바로 이 S8 닫힘 대상이다. 「다른 링크가 출발로 돌아가니 #40은 오해」 갈래는 성립하지 않는다.

## Eliminated
- hypothesis: P-1은 S8 닫힘이 아닌 다른 「목록으로」 링크에 관한 판정이고 그 링크는 출발로 돌아간다(#40은 체크리스트 오독)
  evidence: P-1 원문(pr-d/design-review.md:112)이 「(D-3)」 S8 `closeHref`를 직접 대상으로 한다. S8에 「목록으로」 글자 링크 없음. 같은 이름 P-1(UI-SPEC :46 · PR-C :78)은 주제가 다르다.
  timestamp: 2026-10-20T15:49:00Z

## Resolution
root_cause: S8 대리 등록 패널의 닫을 곳(closeHref)과 저장 도착(doneHref)이 `app/(app)/cards/page.tsx:228` 상수 `/expenses/evidence?state=unmatched` 하나에서 나오고, 출발 목록 주소는 `대리 등록` 링크(`evidence-table.tsx:798·851` — `/cards?new=1&evidence={id}`)에도 서버에도 실리지 않는다; 공용 `SidePanel.openedFromList`(SidePanel.tsx:62-72)는 직전 기록 URL이 closeHref와 pathname+search까지 같을 때만 back()이라, 출발이 우연히 `?state=unmatched`일 때만 출발 목록·연 요소 포커스가 복원되고 그 밖(할 일·전체·공개·미공개·묶음 — `canProxy`는 거르개와 무관하게 선다)은 `router.replace(상수)`로 가 거르개를 잃는다; 저장 착지 토스트 닫기(`expenses/evidence/page.tsx:50` landingHref)도 state만 남겨 type·period·batch·page를 버린다; 결정 층위에서는 PR-D P-1 ①(design-review.md:112 「출발 목록」 = /cards가 아니라 증빙 목록)을 점검표(docs/design/checks/2026-10-20-06.1-prd-gate-fixes.md:10)가 UI-SPEC S8 :661 저장 착지와 같은 상수로 구체화했고, UAT 체크리스트(prep-uat-tests.md:71)는 같은 낱말을 '거르개 포함 정확한 출발'로 읽었다 — 그 해석 차이를 잡는 테스트가 없었다(D-3 E2E 출발이 unmatched뿐).
fix:
verification:
files_changed: []
