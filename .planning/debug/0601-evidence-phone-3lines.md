---
status: diagnosed
trigger: "06.1 Codex 디자인 검토 — /expenses/evidence 폰 상태 칸에 사유 2행이 남아 행이 3줄"
created: 2026-10-20T15:10:00Z
updated: 2026-10-20T15:40:00Z
phase: 06.1
goal: find_root_cause_only
---

## Symptoms
- expected: 폰(375·320)에서 증빙 목록 행은 두 줄 이내이고 P1 셀 안 2행은 폰에서 숨긴다(SYSTEM.md §7-3). 넓은 화면에서는 「확인 필요」 2행 = 사유만(D-2) 유지.
- actual: 375에서 상태 칸 136x92, 320에서 107x111 — 사유 2행이 남아 행이 3줄. 06.1-13 DOM 감사에도 올라왔던 건.
- errors: 없음
- reproduction: /mnt/project-files/06.1-review/verify/codex/SUMMARY.md, dom-json/
- timeline: 06.1 검증 Codex 디자인 검토 2026-10-20
- suspects: app/(app)/expenses/evidence/evidence-table.tsx:765-773 과 그 module.css

## Current Focus
bug_class: Bohrbug (deterministic CSS/markup — same numbers in 06.1-05, 06.1-13, 06.1 verify)
hypothesis: CONFIRMED — shared ui/table renders every column secondaryLine as .cellSecondary at all widths (no phone hide) and never moves P1 secondaries into the folded line; evidence list's two P1 secondaries (counterparty kindLine + status reason) therefore stay in the main row on <700.
next_action: return diagnosis (find_root_cause_only)

## Eliminated
- hypothesis: evidence-table.module.css has a phone rule that fails (wrong selector) for the status 2nd line
  evidence: module has no rule for status/secondary at all (149 lines read); the 2nd line is drawn by ui/table, not screen CSS
  timestamp: 2026-10-20T15:25:00Z
- hypothesis: only the status cell drives the 3-line row height
  evidence: dom-json 375 — 미공개 rows with no status 2nd line are also 92px (counterparty cell 124x92, 2 lines: 44 min-height + kindLine); 320 — 미공개 card rows also 111px (kindLine wraps). Status cell content is ~89.5px < row height.
  timestamp: 2026-10-20T15:30:00Z
- hypothesis: UI-SPEC or DECISIONS exempts the status cell on phone
  evidence: UI-SPEC :413-414 says P2 includes "(2행 종류)" and phone = P1 only per §7-3; DECISIONS.md has no entry; only informal "07로 미룸" at 06.1-05-SUMMARY.md:289 (not in 07 artifacts)
  timestamp: 2026-10-20T15:35:00Z

## Evidence
- timestamp: 2026-10-20T15:15:00Z
  checked: docs/design/SYSTEM.md §7-3 :849, :852, :855, :861
  found: ":855 접힌 줄에 외화 2행·거래처·날짜·오류 이유가 들어간다. 그 대신 P1 셀 안의 2행(외화·오류 이유)은 폰에서 숨긴다 — 같은 정보를 두 번 보이지 않는다. 행은 두 줄이 되고 터치 목표 44px가 확보된다"; :849 외화 2행은 폰에서 접힌 줄로
  implication: phone P1 in-cell 2nd lines must hide and move to folded line
- timestamp: 2026-10-20T15:18:00Z
  checked: ui/table/Table.tsx:814-822 renderCell, :947-951 p2Values, Table.module.css:150-158 .cellSecondary, :428-498 phone block
  found: secondaryLine always rendered as div.cellSecondary; phone block has no .cellSecondary rule; folded line built only from priority p2 columns
  implication: SYSTEM §7-3:855 is not implemented in the shared component
- timestamp: 2026-10-20T15:22:00Z
  checked: dom-json after-20261020-132432-6847 (CI=true, main 9122c31)
  found: 375 status td 136x92 3 lines; ?state=all 375 td:nth-of-type(7) > div.cellSecondary > a 69x15 visible; folded row only "10-17 · 미공개"; counterparty cell 124x92 2 lines on every card row
  implication: both P1 secondaries render on phone; kind/reason absent from folded line
- timestamp: 2026-10-20T15:28:00Z
  checked: 06.1-05-DESIGN-REVIEW.md:25,50 · 06.1-05-SUMMARY.md:289 · 06.1-13-DOM-AUDIT.md:25,45,73
  found: 06.1-05 confirmed "SYSTEM 어긋남 · 공용 ui/table(기존) — 판정 거리 P1", recommended shared fix in separate PR ("이 화면만의 예외 금지"); summary deferred to 07 informally; 06.1-13 called it "해석 갈림"
  implication: known, pre-existing, not decided/exempted
- timestamp: 2026-10-20T15:33:00Z
  checked: evidence-records-section.tsx:112-120 · PR-D design-review.md:149 · 06.1-VERIFICATION.md:146 · UI-SPEC :470
  found: document 「붙은 증빙」 StaticTable draws `StatusTag 확인 필요 · {사유}` (no status column there); list omits prefix because 1st line tag already says 확인 필요 — recorded intent
  implication: prefix difference is intended; same phone in-cell-line class exists there via .evidencePicked (expense.module.css:269-273), separate component

## Resolution
root_cause: ui/table never implements SYSTEM §7-3:855 — Table.tsx:814-822 renders every secondaryLine as .cellSecondary at all widths, Table.module.css phone block has no hide rule, and Table.tsx:947-951 builds the folded line from P2 columns only. The evidence list puts secondaryLine on two P1 columns (counterparty kindLine :732 — UI-SPEC :413 says P2; status reason/attached :765-773), so on <700 both stay in the main row (375: 92px, 320: 111px) and the folded line has only date · visibility.
fix: (not applied — diagnose only)
verification:
files_changed: []
