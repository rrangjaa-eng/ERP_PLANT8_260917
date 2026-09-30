# Phase 04 — UI Review

**감사일:** 2026-09-29
**기준:** `04-UI-SPEC.md` rev 5(approved) + `docs/design/SYSTEM.md` · `tokens.css` · `.claude/rules/frontend.md` 「화면 사용성 원칙」
**Screenshots:** not captured — DOM 실측으로 대체(프로젝트 규칙)

## 실측 방법 (실제로 돈 것)

- `pnpm db:reset:test` → `CI=true`의 `pnpm build && pnpm start`(127.0.0.1:3100, erp_test) → 스크래치 Playwright 스펙 2개(스크래치패드에만 둠, 저장소 파일 변경 없음) → `pnpm db:reset:test`.
- 준비 데이터: 시스템 관리자(팀 배정) · 긴 이름 클라이언트 · 프로젝트 6건(2건에 견적 8줄, 1건은 2차까지, 매출 발행·입금 줄) · 리저브 5줄 + 경영관리형 임시 계급.
- 화면 9종 × 폭 4종(1280 · 1024 · 700 · 375) = **36회 측정**: `/projects` · `/projects?new=1` · `/projects/[id]`(줄 있음) · 같은 화면 「차수 열기」 뒤 · `/projects/[id]`(줄 없음) · `/settings` · `/admin/code-tables` · `/pnl/reserves` · `/pnl`.
- 잰 값: `scrollWidth` 대 `clientWidth` · 화면 밖으로 나간 요소 · `getComputedStyle`의 font-size/weight/family/color/background/border-radius/box-shadow · 숫자 셀의 text-align/white-space/font-variant-numeric · 식별자 숫자의 쉼표 · 보이는 1차 버튼(`--accent` 면) · 44px 미만 대상 · 이름 없는 아이콘 버튼 · 제목 구조 · 키보드 Tab 순서와 `:focus-visible` 외곽선 · 셀 편집 → `Ctrl+S` 흐름 · 등록 폼 빈 제출 · 목록 0건.
- 결과: 36회 중 **가로 넘침 0회**, 색·서체·radius·그림자 토큰 밖 값 **0건**, 식별자 쉼표 **0건**, 이름 없는 아이콘 버튼 **0건**, 숫자 셀 규칙 위반 **8셀(1280 상세 행 번호만)**, 폰 44px 미만 대상 **3종**.
- 측정 오판 정리: 「본문으로 건너뛰기」 링크가 `--accent` 면이라 1차 버튼 수에 잡혔다(화면 밖 skip link — 결함 아님). 첫 Tab 측정이 셸 뒤에서 body로 빠진 것은 hydration 전 측정이었고, 재측정에서 본문 필터 → 검색까지 Tab이 정상으로 들어갔다(결함 아님).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | 등록 폼 제출 오류 문구가 계약 `등록하지 못했습니다 · …`가 아니라 `등록 실패 · …` |
| 2. Visuals | 3/4 | 1차 버튼 하나·제목 하나는 지켜짐. 폰 상세 「더보기」·「상태 바꾸기」 40px(계약 44) |
| 3. Color | 4/4 | 측정한 36개 화면-폭 조합의 모든 글자·바탕색이 `tokens.css` 값. radius·그림자 0 |
| 4. Typography | 3/4 | 크기 xs·sm·base·lg 넷(폰 base=15), 굵기 400·600·700. 행 번호 셀이 tabular·우측 정렬 아님 |
| 5. Spacing | 3/4 | 가로 넘침 0/36. 폰 목록 정렬 머리글 버튼 높이 19px |
| 6. Experience Design | 3/4 | 키보드 편집 → Ctrl+S → 합계 행 `저장됨 1줄` 흐름 실측 통과. 빈 제출 뒤 포커스가 첫 오류 칸으로 가지 않음 |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **폰(375) 상세의 「더보기」·「상태 바꾸기」 높이 40px** — 폰에서 누르기 작은 대상. 계약(UI-SPEC Spacing 표 `--touch-min` 44 「폰 「필터」·「더보기」」)은 44다. 목록의 「필터」는 44를 지켰으므로 같은 규칙을 상세 머리 줄 버튼에 적용한다(`min-height: var(--touch-min)` 폰 미디어 쿼리). 반복 지적이므로 `mobile-320-no-overflow.spec.ts`처럼 E2E로 고정.
2. **등록 폼 제출 오류 문구 불일치** — `app/(app)/projects/project-form.tsx:42·244` `등록 실패 · {칸} {n}칸` 대 UI-SPEC Copywriting 385행 `등록하지 못했습니다 · 클라이언트 1칸`. 어느 쪽을 정본으로 할지 정한 뒤 한쪽을 맞춘다(「사용자 판단 필요」 — 아래).
3. **폰 목록 정렬 머리글(「프로젝트명」·「견적」) 높이 19px** — `/projects@375`에서 `button` 높이 19px 대 SYSTEM §3 폰 터치 목표 44. 머리글 셀 안에서 버튼을 셀 높이만큼 늘리거나 폰에서는 정렬을 필터 시트로 옮긴다.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING — 등록 폼 제출 오류.** `project-form.tsx:42`(주석)·`:244` `등록 실패 · ${라벨} ${n}칸` 대 UI-SPEC 385행(Copywriting `Error — 등록 폼 제출`)·59행(P0 표 rev 5 값) `등록하지 못했습니다 · 클라이언트 1칸`. 코드 주석은 같은 Copywriting 행을 인용하면서 다른 문자열을 쓴다. P0(명사형)로 보면 코드 쪽이 규칙에 더 가깝다 → **「사용자 판단 필요」**: 계약 문자열을 `등록 실패 · …`로 고칠지, 코드를 계약에 맞출지. 기록된 결정 없음.
- 통과(실측): 목록 0건 `조건에 맞는 프로젝트가 없습니다` + 「필터 지우기」(UI-SPEC 350행 그대로) · 1차 비활성 이유 `바뀐 칸 없음`이 `aria-describedby`로 연결(P0 표 rev 5 값) · 새 차수 확인 결과 줄 `1차 8줄을 복사해 2차 · 되돌리기 없음`(428행 형식) · 매출 부제 `공급가액 기준 · 입금액만 통장 합계`(1297행) · 목록 부제 `프로젝트 원장`(숫자 없는 6자 — 설명형 부제 기준 8자 미만).
- 폰 상태 시트의 `수주 확정 · 종료일 다음 날 자동으로 정산` 등은 코드표 설명(S14, D-93)에서 오는 값이라 결함 아님.
- 이미 알려진 후속(결함으로 세지 않음): 동명 머리글 서버 라벨.

### Pillar 2: Visuals (3/4)

- **WARNING — 폰 상세 머리 줄 버튼 40px.** `/projects/[id]@375` 「더보기」 h=40 · 「상태 바꾸기」 h=40 (계약: UI-SPEC Spacing `--touch-min` 44 「폰 「필터」·「더보기」」). 40은 `--control-h` 폰 값이다 — 두 토큰 중 잘못된 쪽을 썼다.
- 통과(실측): 모든 화면 h1 하나(목록 「프로젝트」, 상세 = 프로젝트명, 「리저브 대장」, 「설정」, 「코드표」) · 상세 h2 「매출」·「차수」 · 이름 없는 아이콘 버튼 0 · 보이는 1차 버튼은 편집 뒤 「일괄 저장 1 Ctrl+S」 하나(편집 전에는 `aria-disabled` + `--surface` 면 — Button 개정 ⑦ 그대로) · 등록 폼은 「프로젝트 등록 Ctrl+Enter」 하나이고 목록 「프로젝트 등록」은 링크(1차 아님, 코디네이터 대리 결정 2026-09-26 FINDING-001 (b)) · 폰 상세 첫 화면은 이름·상태·기간 먼저, 복사·차수는 「더보기」 뒤(S3 DR-26).
- 확인 모달의 1차 버튼(「고객 승인 표시」·「새 차수 만들기」·「견적 줄 삭제」·이름 없는 `Ctrl+Enter` 하나)은 닫힌 `<dialog>` 안이라 화면에 보이지 않는다 — 결함 아님. 이름 없는 하나는 상태 전환 모달의 동적 라벨(`status-change.tsx:221` `copy?.label ?? ""`)로 열릴 때 채워진다.

### Pillar 3: Color (4/4)

- 실측 글자색 전부 토큰: `--fg` rgb(11,21,18) · `--muted` rgb(78,93,89) · `--faint` rgb(95,110,106) · `--accent` rgb(0,84,70) · `--g-950` rgb(0,33,28)(편집 표 머리글, UI-SPEC Design System이 허용한 예외) · `--warning` rgb(138,90,0) · 1차 위 흰 글자.
- 실측 바탕색 전부 토큰: `--bg` · `--surface` · `--g-100`(편집 표 머리글·합계 행 17곳) · `--accent-weak`(6곳) · 1차 `--accent`. 새 색 0, `border-radius` ≠ 0 요소 0, `box-shadow` 0(36회 모두).
- 포인트 색 분포: 상세 1280에서 `--accent` 글자 10곳 = 3차 행동 링크(「기간 바꾸기」·「줄 추가」 등 — §1-3 ①ⓐ 목록 안). 넓은 면을 칠한 `--warning`/`--danger` 없음.
- 관찰(결함 아님): 편집 직후 0.8초 전 측정에서 「일괄 저장」 바탕이 rgb(99,151,142)였고 0.8초 뒤 `--accent`로 안정 — 배경 전환 애니메이션 중간값.

### Pillar 4: Typography (3/4)

- 실측 크기: 모든 화면 11 · 12 · 14(폰 15) · 18px — UI-SPEC Typography 「xs · sm · base · lg 정확히 넷」 충족. 굵기 400 · 600 · 700만. 글꼴 `Pretendard Variable` 하나.
- **WARNING — 행 번호 셀.** `/projects/[id]@1280` 견적 표 첫 칸 `1`~`8` 8셀: `text-align: start`, `white-space: normal`, tabular 없음 (계약: UI-SPEC Typography 「숫자(… 건수 …)는 tabular-nums, 우측 정렬, nowrap」 + SYSTEM §2-4). 1024 이하에서는 0건(열 접힘). 한 자리~세 자리(최대 300줄, D-86) 폭이 흔들린다. 행 번호가 「숫자 규칙」 대상인지 SYSTEM §7-3에 명시가 없어 **「사용자 판단 필요」**(행 번호를 식별자형 = 규칙 밖으로 볼지).
- 통과: 금액·수량 셀(1280 상세 42셀, 목록 14셀, 리저브 10셀) 전부 우측 정렬 · nowrap · tabular. 문서 번호 `26002`에 쉼표 없음(D-95).

### Pillar 5: Spacing (3/4)

- 가로 넘침: 9화면 × 4폭 = 36회 모두 `scrollWidth == clientWidth`, 화면 밖 요소 0 (SYSTEM §11 감사 폭 1280·1024·375 + 700).
- **WARNING — 폰 목록 정렬 머리글.** `/projects@375` 머리글 버튼 「프로젝트명」·「견적」 h=19 (SYSTEM §3 폰 터치 목표 44). 1280·1024는 데스크톱이라 대상 아님.
- **WARNING — 폰 상세 버튼 40px**(Pillar 2와 같은 결함, 여기서는 치수 토큰 오용으로 셈: `--control-h` 대신 `--touch-min`).
- 통과: 폰 입력·select 40px = `--control-h` 폰 값(계약대로) · 1280 3차 링크 20px은 데스크톱이라 대상 아님.

### Pillar 6: Experience Design (3/4)

- 실측 통과: 견적 표 `gridcell` 100개 렌더 · 셀 포커스 → Enter → 입력 → Enter → 1차가 `일괄 저장 1`로 켜짐 → `Ctrl+S` → 합계 행 `저장됨 1줄 14:10`(토스트 없음, UI-SPEC Toast 행 그대로) · 활성 셀 `outline 2px --accent` · 본문 Tab 순서(상태 → 팀 → 연도 → 기간 시작 → 기간 끝 …) 모두 `2px --focus` 외곽선 · 상단 바 링크는 어두운 바 위 `--g-100` 외곽선 · 목록 0건 = ListEmpty + 「필터 지우기」 · 폰에서 미저장 편집 복원 줄 `저장 안 한 편집 1칸 · 복원 · 버림`(S18) · 「차수 열기」 뒤 잠긴 읽기 섹션이 넘침 없이 렌더(S5 DR-13).
- **WARNING — 등록 폼 빈 제출 뒤 포커스.** 빈 폼에서 「프로젝트 등록」 클릭 → 클라이언트 select·이름 input에 `aria-invalid="true"`는 붙지만 `document.activeElement`는 버튼에 남는다. S19(「오류로 이동」, DR-5)는 표 저장 흐름의 규칙이고 §7-15 폼에 같은 규칙이 있는지는 이번 감사에서 확인하지 못했다 — 폼에도 적용할지 **「사용자 판단 필요」**.
- 이번 감사에서 재지 못한 것(주장하지 않음): 오류 경계 화면(서버 실패 주입), 저장 충돌·상태 바뀜 거부(S19), 300줄 상한·붙여넣기 결합 문구, 확인 모달의 `Esc` 순서(DR-27), 폰 행 시트.
- 범위 밖(결함 아님): DR-P4-02 → Phase 04.6, p99 → Phase 9, PROJ-04 → Phase 5. 이미 알려진 후속: 표마다 복사 형식 · 보관/복원 version+1 · 동명 머리글 서버 라벨 · 견적 표 savedAt 잔존.

---

## 「사용자 판단 필요」

1. 등록 폼 오류 문구 정본: `등록 실패 · {칸} {n}칸`(코드, P0 명사형) 대 `등록하지 못했습니다 · 클라이언트 1칸`(UI-SPEC 385행).
2. 견적 표 행 번호가 숫자 규칙(tabular · 우측 정렬 · nowrap) 대상인지.
3. 등록 폼 제출 오류 때 포커스를 첫 오류 칸으로 옮길지(S19 「오류로 이동」을 §7-15 폼까지 넓힐지).

Registry audit: shadcn 미사용(`shadcn_initialized: false`) — 건너뜀.

---

## Files Audited

- `app/(app)/projects/page.tsx` · `projects-table.tsx` · `project-form.tsx` · `error.tsx` · `loading.tsx`
- `app/(app)/projects/[id]/status-change.tsx` · `quote-table.tsx` · `revision-dialogs.tsx`
- `ui/shell/Shell.tsx` · `ui/button/Button.module.css` · `ui/confirm-dialog/ConfirmDialog.tsx`
- `docs/design/tokens.css` · `.planning/phases/04-project-quote-ledger/04-UI-SPEC.md` · `.claude/rules/frontend.md`
- 실측 화면: `/projects` · `/projects?new=1` · `/projects/[id]`(줄 있음 · 차수 열기 · 줄 없음) · `/settings` · `/admin/code-tables` · `/pnl/reserves` · `/pnl`
