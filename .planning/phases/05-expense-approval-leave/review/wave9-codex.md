# Codex 디자인 검토 — 웨이브 9 (05-07)

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).

- Codex 실행: 완료(exit 0) · diff 기준 `75b1b2d0...HEAD`(05-07 직전 웨이브 8 판 · 05-07-SUMMARY `plan_head_before`)
- 경로: `/expenses/new`(캡처 하네스의 sysadmin으로 시드 없이 닿는다). 골라내기 · 저장된 팀 비용 문서 · 견적 줄 문서 · ③ · ⑤는 아래 시드 상태 캡처로 따로 쟀다
- 산출물: `test-results/codex-design-review/20261004-193928-22456`(사본: 노트 `05-review/wave9/branch-codex/`) · 원문 사본 `05-review/wave9/wave9-codex-raw.md`

## 지적 후보

지적 없음 — Codex 원문 `[]`(네 폭 가로 넘침 없음 · 칸 간격 24 · 입력 높이 PC 32 / 폰 40을 기준 안으로 봤다).

## 웨이브 9(05-07) 판정 — 2026-10-04, DOM 실측만

브랜치 8862dcc3 · 기준 75b1b2d0(git worktree, 지움), 둘 다 `CI=true` 프로덕션 빌드, 375×667 · 320×568 · 768×1024 · 1280×900. 시드 상태: `/expenses/new` 첫 그림 · 거래처 고르기(열림 · 검색 + ↓) · 견적 줄 고르기(열림 · 고름) · 견적 줄 바꾸기(열림 · ↓ · 닫힌 줄 클릭 + Enter · 열린 줄 고름) · 저장 안 한 비고 · 날짜를 적은 뒤 줄 바꾸기 / 새 문서에서 줄 고르기(전후 칸 값) · 저장된 팀 비용 문서 ⑤(+ Esc 복귀 · 고른 뒤) · 거래처 바꾸기 · 제출된 팀 비용 문서 · ③(새 차수 + 고객 승인 뒤, 3차가 여는 골라내기 · Esc 복귀). 웨이브 6 · 7 · 8 하네스도 브랜치에서 다시 돌렸다(16/16 통과). 기준 판은 `/expenses/new` 404 · 견적 줄 폼만 있다. 증거: 노트 `05-review/wave9/`(README · measurements-pick.txt · measurements-summary.txt · branch-states · base-states).

| # | 판정 | 화면 · 폭 | 실측 | 원인 | 고칠 방향 |
|---|---|---|---|---|---|
| D1 | DEFECT(§7 사용성 — 말없이 사라짐) | 견적 줄 바꾸기(저장된 문서) · `/expenses/new` 견적 줄 고르기 · 4폭 | 줄 바꾸기 전 `비고 = 웨이브9 저장 안 한 메모` · `지급 예정일 = 2026-10-17` → Enter 뒤 둘 다 빈 값. beforeunload 없음(앱 안 이동) · 상태 줄 · 되돌리기 없음, 결과 줄은 `거래처 · 증빙 종류 · 공급가액이 그 줄 값으로 바뀜`만 말한다. 새 문서: `비고 = 웨이브9 새 문서 메모` → 빈 값, 결과 줄은 `… · 팀 비용 칸 지워짐`만. 4폭 같음 | `app/(app)/expenses/[id]/expense-form.tsx:573-588` `pickLine`이 바뀐 칸(`dirty`)을 저장하지 않고 `changeExpenseLineAction({ expectedVersion: version })` → `router.refresh()`, `page.tsx:78` `key={expense.quoteLineId …}`가 폼을 서버 값으로 다시 띄운다. 새 문서 갈래 `:558-567`은 줄 문서를 만들고 `router.replace` — 클라이언트 칸 값이 버려진다. 서버 줄 바꾸기는 비고 · 지급 예정일 · 지급 방식을 건드리지 않는다(저장된 적이 없을 뿐) | 가장 작은 수정: 저장된 문서는 `const base = dirty ? await persist("save") : version; if (base === null) return false;` 뒤 `expectedVersion: base` — 확인 창 없이 잃는 것 없음(줄 값은 결과 줄이 이미 말한다). 새 문서는 버려지는 칸을 결과 줄에 더한다(`· 비고 지워짐` 등 — `팀 비용 칸 지워짐`과 같은 꼴, `pick-line.tsx:91-94`) 또는 만든 문서에 비고 · 날짜를 실어 저장. 05-07-SUMMARY 「추천안 적용」이 이 손실을 받아들인 선택으로 적었으니 고치면 그 기록도 바뀐다 |
| D2 | DEFECT(접근성) | 골라내기 전 변형 · 4폭 | 1차 `이 줄로` · `이 거래처로`의 `aria-describedby`가 목록 전체 — 설명 글자 340자(줄 바꾸기) · 359(줄 고르기) · 730–859(거래처), 걸러진 뒤에도 행 글자 26–59자. 결과 줄은 한 번도 가리키지 않는다 | `ui/pick-dialog/PickDialog.tsx:329` `aria-describedby={listId}` | `aria-describedby={line ? resultId : undefined}` |
| D3 | DEFECT(배치 흔들림) | 골라내기 · 4폭 | 상자 높이가 목록을 따라가 입력 중 검색 칸이 움직인다: 거래처 고르기 검색 칸 y 149→439(375) · 137→340(320) · 115→438(768) · 107→376(1280), 견적 줄 고르기 171→357(1280). PC는 ↓(결과 줄 나타남)에도 모달이 16px 움직인다(y 124→108 · 186→170) | `ui/pick-dialog/PickDialog.module.css:8-9` `max-height` + `margin: auto`뿐(PC는 내용 높이로 가운데), 폰 `:251-261` 아래 붙은 시트가 내용 높이 | 상자를 고정: 폰 `.dialog { height: var(--sheet-max-h); }`, PC는 위를 고정(예: `margin-block: calc((100dvh - var(--sheet-max-h)) / 2) auto` — 토큰만, 목록은 `.body` 안에서 스크롤) |
| D4 | DEFECT(UI-SPEC :313 「폰에서는 kbd를 그리지 않는다」) | 골라내기 시트 375 · 320 · `/expenses/new` 375 · 320 | 시트 행동 줄에 kbd `Esc` 28×17 · `Enter` 36×17이 보인다. `/expenses/new` 증빙 `증빙 올리기` 버튼에 kbd `Ctrl+U` 42×17(폼 제출 줄은 kbd를 숨긴다 — 저장된 폼 375 kbd 0) | `PickDialog.tsx:324,329` `shortcut="Esc"/"Enter"` + `PickDialog.module.css` 폰 미디어에 kbd 규칙 없음 · `expense-form.tsx:818` `shortcut="Ctrl+U"`가 `.formBar kbd { display: none }`(`expense.module.css:214-216`) 밖 | 폰 미디어 `.actions kbd { display: none; }` · `shortcut={phone ? undefined : "Ctrl+U"}`(`phone`은 `expense-form.tsx:317`에 있다). 확인 모달 시트의 폰 kbd는 재지 않았다 |
| D5 | DEFECT(계약 · 다듬기) | 견적 줄 고르기 · 거래처 고르기/바꾸기 · 4폭 | 부제 없음(`h2 + p` 0) — UI-SPEC S14 표는 `프로젝트 {N} · 고를 수 있는 줄 {M}`(고르기) · `거래처 {N}`을 정한다. 견적 줄 바꾸기는 있다(`26017 … · 견적 줄 7 · 고를 수 있는 줄 5`) | `pick-line.tsx:62-66`이 `mode === "change"`에서만 `subtitle` · `pick-vendor.tsx:39` 부제 없음 | 고르기 모드 부제 · `거래처 ${items.length}` 채우기 |
| E1 | 정상 | 전 상태 · 4폭 | 가로 넘침 없음 · 상자 scrollWidth = clientWidth · 색 · radius · 서체 · 크기 전부 토큰 값 | | |
| E2 | 정상 | 시트 · 모달 크기 | 폰 `max-height` = `--sheet-max-h`(375×667 586.96 · 320×568 499.84), 아래 붙음, 위 radius 16, 행동 줄 110×44 / 221×44(375) · 92×44 / 184×44(320) — 2:1 · ≥ `--touch-min`, 닫기 x 44×44, 검색 44, 행 ≥ 62. PC 폭 480 = `--dialog-w`, radius 12 | | |
| E3 | 정상 | 키보드 · aria | 열면 검색 칸 포커스 · ↓ 첫 행 `aria-selected=true` · 닫힌 줄은 포커스 · `aria-selected=false` · `aria-disabled=true` · `aria-describedby` → `지출결의 26017-0001 결재 중 · 12,400,000` / `거래처 없음`, Enter 무반응(열린 채) · 1차는 고를 수 있는 행 전까지 `aria-disabled` · Esc → 트리거(③ · ⑤ `#expense-next-step`)로 복귀 · 줄 바꾼 뒤 포커스 `바꾸기` · 거래처 고른 뒤 `#vendor-pick` | | |
| E4 | 정상 | 행 모양 | 현재 줄 700 + 왼쪽 2px `--accent` · 고른 행 `--surface-selected` · 번호 11px `--text-faint` · 고를 수 없는 행 `--text-muted` + 이유 13px · 금액 줄바꿈 없음 · 긴 항목 keep-all 줄바꿈 | | |
| E5 | 정상 | `/expenses/new` | 첫 포커스 `견적 줄 고르기`(R6-06) · 종류 `—` · 사용일 오늘 · 팀 소속 · 1차 하나 · 폰 3차 99×44 / 96×44 · 기준 판 404 | | |
| E6 | 정상 | 팀 비용 문서 읽기 행 | `프로젝트 미연결 · 미수주 비용` `--text-muted` · 팀 · 사용일 · 내용 행, 견적 줄 행 없음 | | |
| E7 | 정상 | ③ · ⑤ 다음 한 수 | ③ 3차가 견적 줄 바꾸기, ⑤ 3차가 거래처 고르기를 연다 · 폰 3차 44 | | |
| E8 | 정상 | 웨이브 6–8 회귀 | 16/16. 웨이브 6 · 7 실측 그대로(견적 표 머리 ±1px는 시드 이름 폭) · 웨이브 8 D1 고침 유지(계산 한 줄 768 · 1280 전 종류 한 줄 h21, 종류를 바꿔도 아래 칸이 움직이지 않음) · 견적 줄 폼 1280 칸 y가 기준 판과 같다 | | |
| N1 | 메모(문구) | 결과 줄 | 거래처 `증빙 종류 → 세금계산서` vs UI-SPEC `증빙 종류가 그 거래처 기본값으로 바뀜` · 새 문서 줄 고르기 `… 채워짐` vs `바뀜` | `pick-vendor.tsx:53` · `pick-line.tsx:92` | 코드나 UI-SPEC 한쪽으로 맞춤 |
| N2 | 메모(설계 선택) | `/expenses/new` 막힘 줄 | ⑤ · ⑥이 걸려도 고정 ⑧ `증빙 없음 · 증빙 올리기`(`submit-block.ts:19-23` `NEW_DOC_BLOCK`), 첫 저장 뒤 바로잡힌다 — SUMMARY 기록 | | |
| N3 | 이월 | 폰 입력 40 · 결재함 foldTap 21 · 설정 버튼 40(웨이브 6 N3 · N4) | | | |
| N4 | 재지 않음 | 50건 넘음 줄 · `2차 고객 승인 전` 접힌 그룹 · 외화 행 `fx` · 줄 바꾸기 `redirectTo` · 검색 실패(저장소 E2E가 덮는다) | | | |

§7 요약: 폼 · 골라내기 모두 1차 하나, 문구는 라벨 · 이유 · 결과 줄뿐, `/expenses/new`가 묻는 결정은 종류 하나다. 남은 숨은 결정은 D1 — 「줄을 바꾸기 전에 저장할지」를 화면이 대신 「버림」으로 정한다. 먼저 저장하면 확인 창 없이 잃는 것이 없다.
