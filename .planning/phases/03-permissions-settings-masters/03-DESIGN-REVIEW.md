# 03-DESIGN-REVIEW.md — 비관리자 화면 디자인 리뷰 (SYSTEM.md 대조)

- 대상 커밋: `f04e390` (`claude/gsd-execute-phase-3-uofrn0` HEAD, 2026-09-21). 워킹 트리의 미커밋 변경(`ui/shell/*` · `app/(app)/layout.tsx` · `app/(auth)/login/login-error.ts` · `app/(app)/admin/**`)은 다른 에이전트가 진행 중이라 **보지 않았다** — 그 상태로는 `pnpm build`가 타입 오류(`app/(app)/admin/vendors/page.tsx:132`)로 실패하기도 했다. HEAD를 스크래치 worktree에 체크아웃해 프로덕션 빌드로 잰 값이다
- 기준: `docs/design/SYSTEM.md` (§1·§2·§3·§4·§5·§6-0·§6-1·§6-7·§7-1·§7-2·§7-4·§7-6·§7-7·§7-8·§8·§10). `docs/design/DECISIONS.md`에 기록된 이탈은 결함으로 세지 않았다
- 결과: **11건** (High 2 · Medium 3 · Low 6). 폰 375에서 터치 목표 44px 미달 두 종류가 비관리자 화면 전부에 걸린다

---

## 1. 검토 범위와 방법

**본 것**
- `/login`(인증 프레임) · `/`(내 차례 홈) · `/projects` `/expenses` `/cards` `/approvals` `/pnl` · `/account` · `/settings`
- 셸: PC 상단 바 · 사용자 메뉴 · 폰 하단 탭 · 「더보기」 시트 · 스킵 링크
- 계급: `role-pm`(기본)으로 전 화면, `role-sysadmin`으로 셸(상단 바·사용자 메뉴·하단 탭·시트, `/`·`/projects`). 본문 컴포넌트는 계급 분기가 없어 sysadmin 본문은 따로 재지 않았다
- 폭: PC 1440×900 · 폰 375×800

**제외한 것과 이유**
- `/admin/**` 전부 — 다른 에이전트가 재구성 중이라 판정이 곧 무효가 된다
- 태블릿 700–1023, 확대 200%, 인쇄 — 요청 범위 밖
- 워킹 트리의 미커밋 셸 변경 — 위 대상 커밋 항목 참고

**잰 방법** — 코드 의도나 스크린샷 육안이 아니라 프로덕션 빌드(`CI=true`, `pnpm build && pnpm start`)의 라이브 DOM을 Playwright로 실측했다. 임시 스펙 `test/e2e/tmp-dr-*.spec.ts` 2개(측정 26건 + 후속 4건), 종료 후 삭제
- 가로 오버플로: `document.documentElement.scrollWidth` vs `clientWidth`
- 터치 목표: 보이는 `a[href]·button·input·[role=menuitem]·[aria-disabled]` 전부의 `getBoundingClientRect()`
- 스타일: `getComputedStyle` — 색(전 요소의 color·background·border·outline을 `tokens.css` 팔레트 rgb 집합과 대조) · 글자 크기(§2-2 6단계 집합과 대조) · 굵기 · radius · box-shadow(inset 아닌 것) · transition-duration(일반 / `prefers-reduced-motion: reduce` 에뮬레이션)
- 대비: 텍스트 노드마다 글자색과 가장 가까운 불투명 배경의 WCAG 비율 계산
- 줄바꿈: 텍스트 노드마다 `Range.getClientRects()`의 서로 다른 top 개수
- 카피: 전 텍스트 노드 추출 후 §8 규칙(느낌표·사과·`~하세요`·안내문·`총/약`) 패턴 대조, 버튼 라벨·placeholder 전수
- 상호작용: 첫 Tab(스킵 링크) → 이후 Tab 12회의 `document.activeElement`와 `outline` · 사용자 메뉴 열기/Esc · 시트 열기/Tab 순환/Esc · 로그인 실패·비밀번호 변경 실패 · 제출 직후 버튼 상태 · `Meta+K`/`Control+K`
- 서체: `document.fonts.check("14px 'Pretendard Variable'")` · `<link>` 존재 · `body` 계산값

---

## 2. 화면별 판정

FAIL = High·Medium 결함이 하나라도 걸림. 괄호는 결함 번호. 수치는 실측값.

| 화면 | PC 1440 | 폰 375 |
|---|---|---|
| `/login` | **PASS** — 셸 없음(header 0 · nav 0 · 하단 탭 0), 워드마크 `--fg` 800 18px 가운데(중심 x 720), 입력 32px `1px --line-ui`, 1차 버튼 1개 32px, 실패 문구 `role=alert` `--danger` 한 줄(y 489, 비밀번호 칸 아래 473·버튼 위 527), 입력값 보존, `?reason=password-changed` `role=status` 폼 위(y 394 < 폼 431), 포커스 링 2px `--focus` offset 2, 오버플로 0. 비고 L-2·L-6 | **PASS** — 입력·버튼 40px(§7-1·§7-2 폰 40, DECISIONS 2026-09-18 시트 항목 3이 시트 밖 40 확정), 프레임 347 전폭, 오버플로 0, `body` 15px/24px. 비고 L-2·L-6 |
| `/` 내 차례 | **PASS** — 상단 바 38px `--g-900` sticky 패딩 20, `main` max 1280 왼쪽 정렬 패딩 20, h1 18/700 `-0.36px`, 부제 12 `--muted`, 「내 차례」 0건 블록 없음 + EMPTY 한 줄(DECISIONS 2026-09-20 기록) + 3차 링크 `--accent` 밑줄 1px, 첫 Tab = 스킵 링크(top 8, 32px, `--accent` 면), 오버플로 0. 비고 L-3·L-5 | **FAIL** (H-1 · H-2) — 3차 링크 「프로젝트 보기」 79.8×25, 상단 바 사용자 버튼 73.3×19.2. 그 외: 상단 바 44px 패딩 14, `main` 패딩 14/하단 72, 오버플로 0 |
| `/projects` | **PASS** — 현재 메뉴 `--bar-fg` 700 + `inset 0 -2px --g-400`, 나머지 `--bar-muted` 400, 위 홈과 같은 골격. 비고 L-3 | **FAIL** (H-1 · H-2) — 「지출결의 보기」 79.8×25 |
| `/expenses` | **PASS** — 동일 | **FAIL** (H-1 · H-2) — 「법인카드 보기」 79.8×25 |
| `/cards` | **PASS** — 동일 | **FAIL** (H-1 · H-2) — 「결재함 보기」 67×25 |
| `/approvals` | **PASS** — 동일, 현재 메뉴 「결재」 700 + inset | **FAIL** (H-1 · H-2) — 「지출결의 목록 보기」 108.6×25 |
| `/pnl` | **PASS** — 동일 | **FAIL** (H-1 · H-2) — 「프로젝트 보기」 79.8×25 |
| `/account` 내 정보 | **FAIL** (M-1 · M-2) — 입력 폭 1136, `form` max-width none, h2 21px, 라벨 열 96(x 20→124) 자체는 맞음, 배너 `role=status` 2px `--line-strong` 제목 위(y 58 < h1 119), 1차 1개(스킵 링크 제외) · 2차 1개, 오류 시 입력 테두리 `--danger` + 아래 12px `--danger` 한 줄·값 보존. 비고 L-1·L-4 | **FAIL** (H-2 · M-1 · M-2) — h2 22.5px, 라벨 위로 올라감(라벨 y 292.9 < 입력 314.1), 입력·버튼 40px |
| `/settings` | **PASS** — EMPTY 한 줄(DECISIONS 2026-09-20 여섯 화면에 포함). 비고 L-3 | **FAIL** (H-1 · H-2) — 「내 정보 보기」 70.4×25 |
| 셸 · PC 사용자 메뉴 | **PASS** — pm: 내 정보 · 로그아웃 / sysadmin: 시스템 상태 · 내 정보 · 로그아웃(§6-0 (a) 정확히), 「설정」 없음, `2px --line-strong` 흰 면 radius 0 shadow none 폭 160, 열리면 첫 항목 포커스, Esc → 닫힘 + 트리거 포커스 + `aria-expanded=false`. 비고 L-5 | 해당 없음(PC 전용 — 그러나 폰에서도 열린다, H-2 참고) |
| 셸 · 폰 하단 탭 | 해당 없음(`display:none` 실측) | **PASS** — pm 내 차례·프로젝트·지출결의·더보기 / sysadmin 내 차례·결재·손익·더보기(§6-0 표), 각 90.75×44, nav 46(44+2px 선), svg 0, 현재 탭 `--accent` + `inset -2px`, `/projects`에서 pm만 현재 표시·sysadmin은 없음 |
| 셸 · 「더보기」 시트 | 해당 없음 | **FAIL** (M-3) — 그 외는 계약대로: 첫 행 검색 `--surface` 44px, 이어서 하단 탭에 없는 1차 메뉴(pm 법인카드·결재·손익 / sysadmin 프로젝트·지출결의·법인카드 + 시스템 상태), 「계정」 그룹 내 정보·설정·로그아웃, 행 44px, 닫기 44×44, 위 `2px --line-strong`, `::backdrop` `rgba(0,33,28,.45)`, 제목 18/700, svg 1(닫기 x만), 열리면 첫 링크 포커스, Tab 12회 동안 본문 요소로 나가지 않음(로그아웃 다음 한 번 `body`를 거쳐 닫기 버튼으로 순환 — inert 바깥, 네이티브 `<dialog>` 동작), Esc → 트리거 포커스 |

**전 화면 공통 PASS** — 팔레트 밖 색 0건 · §2-2 밖 글자 크기는 아래 결함 2건(h2)과 `sr-only` h1(시각 노출 없음)뿐 · 굵기 400/600/700/800만 · radius 0 · 비인셋 box-shadow 0 · 대비 4.5:1 미달 텍스트 0건(최저 4.95 = 시트 검색 행 `--faint` on `--surface`) · 375에서 2줄로 꺾인 텍스트 0건(45자 이메일 부제도 12px에서 332px 한 줄) · placeholder 0건 · Pretendard 로드 확인(`fonts.check` true, `<link>` 있음) · `caret-color`·`accent-color` `--g-700`, `scrollbar-width: thin` · 버튼 transition 120ms → reduce 시 0.01ms · 포커스 순서 = DOM 순서(스킵 링크 → 상단 바 메뉴 → 사용자 → 본문)

---

## 3. 결함 목록 (심각도 순)

### H-1 (High) 폰: 목록 EMPTY의 3차 링크가 25px 높이 — 7화면 전부

- 파일: `ui/list-empty/ListEmpty.module.css:24-34` (`.tertiary` — `padding: 0`, 폰 `min-height` 없음)
- 위반: §3 「터치 목표: 폰에서 모든 행동 요소 최소 44×44」 · §10 「터치 목표 폰 44×44」
- 실측(375): `/` 「프로젝트 보기」 79.8×25 · `/projects` 「지출결의 보기」 79.8×25 · `/expenses` 「법인카드 보기」 79.8×25 · `/cards` 「결재함 보기」 67×25 · `/approvals` 「지출결의 목록 보기」 108.6×25 · `/pnl` 「프로젝트 보기」 79.8×25 · `/settings` 「내 정보 보기」 70.4×25
- 비고: 같은 3차 버튼인 `ui/button/Button.module.css`는 폰에서 `min-width/min-height: var(--touch-min)`을 이미 준다(wave 6 결함 2 수정). `ListEmpty`의 `.tertiary`는 별도 클래스라 그 수정을 받지 못했다. 지금 비관리자 화면의 본문 행동 요소는 이 링크 하나뿐이라, 폰에서 본문의 유일한 「다음 한 수」가 전부 미달이다

### H-2 (High) 폰: 상단 바 사용자 버튼 19px 높이, 열리는 드롭다운 항목 35px

- 파일: `ui/shell/TopBar.module.css:79-86` (`.userTrigger` `padding: 0`, 폰 보정 없음), `:107-118` (`.userMenuItem` `padding: 8px 12px`), `ui/shell/TopBar.tsx:147-181` (폰에서도 같은 `role=menu` 렌더)
- 위반: §3·§10 터치 44×44. §6-0은 사용자 메뉴를 「(a) PC 상단 바 우측 사용자 진입점」으로만 규정하고 폰은 「메뉴는 ≡ 뒤 시트로」
- 실측(375, 전 화면): 버튼 「E2E Employee」 73.3×19.2 (x 287.7, 상단 바 44 안에서 y 12.4) · sysadmin 「E2E Admin」 55.8×19.2. 탭하면 PC와 같은 드롭다운이 열린다: 폭 160(x 201–361), 항목 「내 정보」 156×35.2 · 「로그아웃」 156×35.2, Esc로 닫힘·포커스 복귀·`aria-expanded=false`
- 비고: 동작 자체(Esc·포커스 복귀)는 맞다. 문제는 폰에서 §6-0이 시트로 보내라고 한 진입점이 44px 미만 컨트롤 두 겹으로 남아 있다는 것. 「더보기」 시트에 같은 항목(내 정보·로그아웃)이 이미 44px 행으로 있으므로 폰에서 이 트리거를 표시만 남기거나 44로 키우는 두 선택이 있다 — 판단은 SYSTEM.md 쪽

### M-1 (Medium) `/account`가 §6-3 폼 템플릿을 따르지 않는다

- 파일: `app/(app)/account/page.tsx:17-20`, `app/(app)/account/change-password-form.tsx:35-37` (`<form>` · `<h2>` 스타일 없음), `ui/input/TextField.module.css:15-29` (`.field { width: 100% }`, `.input { width: 100% }` — 칸 폭 상한 없음)
- 위반: §6-3 「한 열, max 720(`--form-max`), 왼쪽 정렬」 · 「칸 폭: select 200 · 짧은 칸 280 · 긴 칸 480」 · §2-2 「화면당 크기 … 6단계 안에서」(21px은 어느 단계도 아님) · §6-2/§7-2 설정·폼 화면은 「섹션(2px 선)으로 이어진다」. `02-CONTEXT.md` D-30이 「내 계정은 §6-3 폼 템플릿을 그대로 쓴다」고 정했고 DECISIONS.md에 예외 기록 없음
- 실측(1440): `form` 폭 1240 · `max-width: none` · `border-top: 0`; 입력 `#currentPassword` `#newPassword` 폭 1136(x 124→1260) · 높이 32; h2 「비밀번호 변경」 21px/700, `margin: 17.43px 0`, 위·아래 선 0 — 브라우저 기본값(1.5em)이다; 이름 값 `<p>E2E Employee</p>` 폭 1240, 라벨·`dt` 없음(§6-3 라벨-값 구조 아님). 375: h2 22.5px, 입력 347(전폭 — 폰 전폭은 §6-3이 허용)
- 비고: 라벨 열 96(x 20, 입력 x 124 = 96+8) · 라벨 12px `--muted` 600 · 1차 1개 + 2차 1개 · 배너 위치·역할·선은 전부 계약대로다. 어긋난 것은 폼 열 폭·칸 폭·h2·섹션 선 넷

### M-2 (Medium) 비밀번호 변경 검증 오류가 「원인 · 다음 행동」 형식이 아니다

- 파일: `app/(app)/account/actions.ts:19` (`z.string().min(8, "8자 이상이어야 합니다.")`), 같은 문구 계열 `domain/auth/password.ts:84`
- 위반: §7-2 「오류(서버 검증): 입력 아래 `--fs-sm --danger` 한 줄 **「원인 · 다음 행동」**」 · §8-3 「오류 = 원인 · 다음 행동. 가운뎃점으로 나눈 한 줄. 원인만 쓰고 끝내지 않는다」 · §8-6 명사형 종결 우선
- 실측: 새 비밀번호 `short` 제출 → `#newPassword` 테두리 `rgb(155,28,28)`, 아래 `p#newPassword-error` 「8자 이상이어야 합니다.」 12px `--danger`(y 337, 입력 아래 4px), 값 `short` 보존, `aria-invalid=true` + `aria-describedby` 연결. 가운뎃점 없음, 다음 행동 없음, 마침표 종결
- 비고: 자리·색·크기·ARIA는 맞고 문구 형식만 어긋난다. 예: `8자 미만 · 8자 이상으로`

### M-3 (Medium) 「더보기」 시트의 검색 행이 이유 없는 비활성 컨트롤이다

- 파일: `ui/shell/MoreSheet.tsx:95-104` (`<span aria-disabled="true">검색 … <span>프로젝트 · 지출결의 · 거래처</span>`), `ui/shell/MoreSheet.module.css:118-128` (`.searchRow` `cursor: not-allowed`, `--faint` on `--surface`)
- 위반: §7-1 「비활성 버튼은 이유를 옆에 글자로 쓴다 … 이유 없는 비활성 버튼은 금지(UX-06)」 · §11 「이유 없는 비활성 버튼 0개」. DECISIONS.md 2026-09-18 시트 항목 5는 대상 목록(`프로젝트 · 지출결의 · 거래처`)을 「안내 문구가 아니라 범위 표시」로 인정했을 뿐, 검색이 **동작하지 않는 상태로 비활성 표시**되는 것을 기록하지 않았다
- 실측(375, pm·sysadmin 동일): 첫 행 `span[aria-disabled=true]` 375×44, `background rgb(243,247,245)`(`--surface`), 글자 `rgb(95,110,106)`(`--faint`, 대비 4.95), `cursor: not-allowed`, 오른쪽 12px `--muted` 「프로젝트 · 지출결의 · 거래처」. 비활성 이유 텍스트 없음. 탭·클릭에 반응 없음(포커스 불가 요소)
- 비고: §7-8은 「첫 항목 검색(`--surface` 면)」을 요구하므로 행 자체는 계약 항목이다. 문제는 검색이 없는 지금 이 행이 「막힌 컨트롤 + 이유 없음」으로 보인다는 것. L-5(⌘K)와 같은 뿌리(명령 팔레트 미구현)

### L-1 (Low) 임시 비밀번호 배너 문구가 명령형이고 다음 한 수가 버튼이 아니다

- 파일: `app/(app)/account/page.tsx:16`
- 위반: §8-6 「문장은 명사형 종결 우선. 외부 수령자 화면과 오류의 「다음 행동」만 `~해 주세요`체 허용」 · §8-5 「다음 한 수를 버튼으로 보인다」
- 실측: `p[role=status]` 「임시 비밀번호를 쓰고 있습니다 — 바꾸세요.」 12px 600 `--fg`, `2px solid --line-strong`, 안에 행동 요소 0개. `—`(em dash)로 나눴고 §8-3의 가운뎃점이 아님
- 비고: D-08(01-CONTEXT)은 배너의 존재와 위치만 정했고 문구는 어디에도 확정되지 않았다. 바로 아래에 변경 폼이 있어 실동선은 막히지 않는다

### L-2 (Low) 로그인 프레임 최대 폭 480 — §6-7의 360과 다르고 DECISIONS.md에 없다

- 파일: `ui/auth-frame/AuthFrame.module.css:16` (`max-width: var(--modal-w)`)
- 위반: §6-7 「PC · 폰 공통 (최대 폭 360, 가운데 정렬)」. SYSTEM.md 머리말 「시스템을 벗어나야 하면 `DECISIONS.md`에 이유를 쓰고 이 문서를 고친다」 — 이유는 `02-03-SUMMARY.md:50·157`에만 있고 DECISIONS.md·SYSTEM.md 어디도 고쳐지지 않았다
- 실측(1440): 프레임 x 480 폭 480 `max-width: 480px`, 폼 폭 480, 입력 폭 376, 워드마크 중심 720(= 1440/2, 가운데 정렬은 맞음). 375: 347 전폭
- 비고: 값 자체가 나쁘다는 판정이 아니다. 기록되지 않은 이탈이라는 판정이다 — 기록하거나 360으로 맞추거나

### L-3 (Low) EMPTY 한 줄에 가운뎃점이 없다

- 파일: `ui/list-empty/ListEmpty.tsx:34-47`, `ui/list-empty/ListEmpty.module.css:5-13` (`gap: var(--s-3)`)
- 위반: §7-7 EMPTY 「표 본문 자리에 한 줄: **「무엇이 없다 · 다음 한 수」**」, 예시 전부 `·`로 연결. DECISIONS.md 2026-09-19(표 뼈대 없이 한 줄)와 2026-09-20(홈 한 줄 유지)은 표 뼈대·문구 존재를 다뤘고 구분 기호는 언급 없음
- 실측: 7화면 모두 `p.row` textContent가 「표시할 항목이 없습니다프로젝트 보기」처럼 이어지고, 메시지와 링크 사이는 12px `gap`뿐(`·` 글리프 없음). 스크린 리더는 두 어절을 붙여 읽는다
- 비고: 시각적으로는 색(`--muted` → `--accent`)과 밑줄로 갈리지만 계약이 정한 형식 그대로는 아니다

### L-4 (Low) 「내 정보」(메뉴) ≠ 「내 계정」(화면 제목)

- 파일: `ui/shell/role-menu.ts:67` (`label: "내 정보"`), `app/(app)/account/page.tsx:17` (`title="내 계정"`)
- 위반: §8-7 「용어는 앱 전체에서 하나」 · §6-0 「브레드크럼 없음. 화면 제목이 위치를 말한다」 — 누른 항목과 도착한 제목이 다르다
- 실측: PC 사용자 메뉴·폰 시트 항목 텍스트 「내 정보」(`href="/account"`), 도착 화면 `h1` 「내 계정」. 목록 화면의 EMPTY 링크도 「내 정보 보기」(`/settings`)
- 비고: SYSTEM.md 자체가 §6-0·§7-8에서는 「내 정보」, §6-7 A④·§7-11에서는 「내 계정 화면」이라 둘을 섞어 쓴다. 코드보다 문서에서 먼저 하나로 정할 일

### L-5 (Low) 상단 바의 `⌘K`가 눌러도 아무것도 열지 않는다

- 파일: `ui/shell/TopBar.tsx:133-135` (`<span><kbd>⌘K</kbd></span>` — 이벤트 핸들러 없음), 전역 키 핸들러 없음
- 위반: §6-0 「1차 메뉴 5개 · 명령 팔레트 `⌘K` · 사용자」(명령 팔레트가 존재한다는 전제) · §7-9 「내용은 그 화면에서 실제로 되는 것만」(힌트 줄 규칙이지만 같은 원칙)
- 실측(1440, `/account`): `kbd` 22.8×19.6 표시, 부모 `span`은 `tabindex` 없음·`cursor: auto`; `Meta+K`·`Control+K` 입력 후 `dialog[open]` 0 → 0, `[role]` 목록 불변(`status`·`presentation`), URL 불변. 375에서는 `display: none`(실측 visible false)
- 비고: 「더보기」 시트의 검색 행(M-3)과 같은 미구현 기능의 PC 쪽 표면. 표시만 남길지 감출지 결정이 필요하다

### L-6 (Low) 로그인 제출 중에 다른 입력이 비활성화되지 않는다

- 파일: `app/(auth)/login/login-form.tsx:46-75` (`pending`은 `<Button>`에만 전달, `TextField`에 `disabled` 없음)
- 위반: §6-7 다섯 상태 LOADING 「제출 버튼이 §7-1 진행 중 상태(라벨 뒤 `…`, **다른 입력 비활성**)」
- 실측(1440·375 동일): 클릭 직후 버튼 텍스트 「로그인…」, `disabled=true`, 면 `--accent` 유지, 스피너 svg 0; 같은 폼의 `input` 2개 `disabled` `[false, false]`
- 비고: 버튼 쪽(`…`·비활성·스피너 없음)은 §7-1 그대로다. 300ms 뒤 상단 진행 바는 재지 못했다(§4 참고)

---

## 4. 측정하지 못한 것과 이유

| 항목 | 이유 |
|---|---|
| §7-6 토스트 | 비관리자 화면에 토스트를 띄우는 행동이 없다(비밀번호 변경 성공은 세션 만료 → `/login` 이동으로 끝난다). 컴포넌트 `ui/toast/Toast.tsx`만 존재 |
| §7-7 LOADING의 300ms 진행 바 | 루프백 서버라 응답이 300ms 안에 끝나 진행 바가 그려질 조건이 만들어지지 않았다. 네트워크 지연 주입은 하지 않았다 |
| §7-4 「내 차례」 행 구조(태그·이유·금액·다음 한 수 같은 줄, 폰 두 줄) | 데이터 원천이 없어 `buildNextTurnView([])` — 항목 0으로 블록이 렌더되지 않는다(D-24, Phase 4). 블록 없음 자체는 §7-4대로 확인 |
| 목록 화면(§6-1)의 표·필터·그룹 머리글·합계 행 | Phase 4 범위(DECISIONS.md 2026-09-19). 지금은 EMPTY 한 줄뿐이라 §7-3 표 규칙은 대조 대상이 없었다 |
| 목록 화면의 ERROR·PARTIAL 상태 | 서버 조회가 없어 오류를 유발할 경로가 없다. `app/(app)/error.tsx`의 오류 경계는 강제 발생시키지 않았다 |
| 계정 잠금 안내(§6-7 A③) | 잠금을 일으키려면 실패 반복이 필요하고, 그 로직(`domain/auth/lockout.ts`)이 워킹 트리에서 수정 중이라 HEAD 결과가 곧 바뀐다 |
| `::selection` 색 | `getComputedStyle(el, "::selection")`은 Chromium에서 저작 값을 돌려주지 않아 실측 불가. `caret-color`·`accent-color`·`scrollbar-width`는 잤다(전부 계약값) |
| hover 상태 색(§5 120ms 전환의 목적지 색) | 마우스 hover를 각 요소마다 걸지 않았다. transition 속성·시간은 잤다 |
| 태블릿 700–1023 · 확대 200% · 인쇄 | 요청 범위 밖 |
| sysadmin의 본문 화면 | 셸만 잤다. 본문 컴포넌트(`PageHeader`·`ListEmpty`·`ChangePasswordForm`)에 계급 분기가 없음은 코드로 확인했고 실측은 pm만 |
| 워킹 트리의 미커밋 셸 변경(`ui/shell/*`, `login-error.ts`, `layout.tsx`) | 다른 에이전트가 수정 중. 이 리뷰는 `f04e390`의 값이며, H-2·M-3·L-4·L-5는 그 변경이 머지된 뒤 같은 방법으로 다시 재야 한다 |
