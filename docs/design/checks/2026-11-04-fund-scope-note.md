# 권한표 자금 본부 표지 · 미지정 잠김 한 줄 — 점검표
화면: app/(app)/admin/permissions/, ui/permission-grid/, app/(app)/pnl/page.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-13 (체크박스 매트릭스 — 07.3 D-7318 그룹 줄 본부 조건 표지)

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 추가한 글자는 그룹 줄 표지 「경영관리본부만」(명사형 보조 글자)과, 설정이 비었을 때만 서는 잠김 한 줄 `자금 기능 본부 미지정 · 설정` 하나다. 도움말 문단 · 툴팁 없음(DECISIONS 2026-11-04 버린 대안)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 표지 이름은 readFundDivision(자금 게이트와 같은 출처)이 채운다. 관리자가 고를 것 없음
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 잠김 한 줄의 「설정」 링크는 admin.settings 보기 권한자에게만 그린다(권한이 없으면 링크 없는 글자만, T-07.3-04-04)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 해당 없음 — 권한표는 칸 즉시 저장 화면이고 버튼 변경 0. 잠김 줄의 「설정」은 3차 링크
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 위험 동작 추가 0
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 표지는 그룹 줄에 한 번(PC) 또는 값 칸에 한 번(폰, 라벨에는 붙이지 않음). 자금 본부 미지정은 표지 「자금 본부 미지정」과 표 위 잠김 한 줄이 다른 일을 한다(표지 = 어디가 막혔나, 한 줄 = 고칠 길)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 화면 변경 0
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 표지는 비대화형 글자, 체크박스 Tab 순서 변경 0. 잠김 줄 「설정」은 기존 링크(Tab 도달). 표지는 aria-describedby로 읽힌다(E2E permissions-grid)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 「설정」은 projects/settlement 선례와 같은 3차 링크 클래스

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 색 · 표 · 패널 변경 0. 이 변경 자체는 D-7318(사용자 문구 「<본부>만」)이며 DECISIONS.md 기록 뒤 SYSTEM.md §7-13을 고쳤다

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `.groupNote`는 `--s-2` · `--text-muted` · `--text-aux` · `--fw-regular`만(CSS diff에 색 · px 없음), `.mobileCell`에 `align-items: center`만 더했다. 새 클래스 이름은 `.groupNote` 하나
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: E2E permissions-grid 폰 375 · 320(scrollWidth <= innerWidth · 표지 행 라벨 줄 수 · dt 71px = main 기준선) · 체크박스 44px 그대로 · DOM 실측 measurements-state-fund-note-default.json
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /tmp/claude-0/-home-user-ERP-PLANT8-260917/30ed6bf6-3ae4-50c2-9db0-a6fc33c75269/scratchpad/capture-07.3-04/state-fund-note-default-{1280,768,375,320}.png · state-fund-note-unset-{1280,768,375,320}.png (CI=true 프로덕션 빌드, 판정은 같은 폴더 measurements-*.json의 DOM 수치 — 독립 DOM 감사 결과는 이 파일 아래 감사 표에 이어 적는다)

## 독립 DOM 감사 (2026-11-04 · gsd-ui-auditor · CI=true 프로덕션 빌드 · 1280 · 1024 · 375 · 320)
판정은 DOM 실측만(스크린샷 육안 없음). DOM 결함 0 · 20/24. 보고서: `.planning/phases/07.3-management-fund-scope/07.3-UI-REVIEW.md` · 원자료 `/mnt/project-files/07.3-review/exec-04/audit-default.json` · `audit-unset.json` · `audit-dom.js`. 폰 기준선 = main 실측 `/mnt/project-files/07.3-review/design/r1/extra/measure-baseline.json`.

| 폭 | 점검 | 실측 | 판정 |
|---|---|---|---|
| 1280/1024/375/320 | 권한표 가로 넘침(기본 · 미지정) | scrollWidth = innerWidth | PASS |
| 1280/1024/375/320 | 설정 「권한」 절 가로 넘침 | scrollWidth = innerWidth | PASS |
| 전체 | 표지 white-space · 줄 수 | `nowrap` · 1줄 | PASS |
| 전체 | 표지 글자색 · 크기 = `--text-muted` · `--text-aux` | rgb(82,97,92) · 13px, 토큰 probe와 같음 | PASS |
| 1280/1024 | 표지가 그룹 이름과 같은 줄 | sameLine true ×8 | PASS |
| 1280 | 그룹 줄 높이(표지 있음 대 없음) | 표지 37.30 ×8 · 없음 37.30 ×29(첫 그룹 「프로젝트」만 36.80, 표지와 무관) | PASS |
| 1280/1024 | 표지는 자금 메뉴 8개에만 | 38그룹 중 8 · 자금 밖 0 | PASS |
| 1280/1024 | 칸 · 행 머리 체크박스 aria-describedby → 표지 id | 칸 18/18 · 행 머리 3/3, 그룹 ×8 | PASS |
| 1280/1024 | 그룹 줄 접근성 글자에 「 · 」 | `매출 정산 · 경영관리본부만` ×8 | PASS |
| 375/320 | 폰: 표지는 자금 행에만 | 111행 중 24(8×3) · 자금 밖 0 | PASS |
| 375/320 | 폰 표지 행 라벨 줄 수 · 행 높이 = main 기준선 | 24행 모두 기준선과 같음(줄 1/2 · dt 71px) | PASS |
| 375/320 | 표지는 라벨에 없음 | labelHasNote false ×24 | PASS |
| 375/320 | 표지 세로 중심이 체크박스 안(같은 줄) | true ×24 | PASS |
| 375/320 | 표지가 값 칸 안(넘침 없음) | note right 248 ≤ dd right 359/304 | PASS |
| 375/320 | 폰 체크박스 aria-describedby → 표지 | true ×24 | PASS |
| 전체(미지정) | 표지 글자 | 「자금 본부 미지정」 ×8그룹 / ×24폰 행 · 1줄 · nowrap | PASS |
| 전체(미지정) | 표 위 잠김 한 줄 하나 | 1 × `자금 기능 본부 미지정 · 설정` | PASS |
| 1280/1024(미지정) | 잠김 줄 1줄 | p 22.8px · 글자 중심 대 링크 중심 Δ0.5px | PASS |
| 375/320(미지정) | 잠김 줄 1줄(44px) | p 44px = 3차 링크 min-height `--touch-min` 44(SYSTEM §233) · Δ0.5px 한 줄 | PASS |
| 전체(미지정) | 잠김 줄 가로 넘침 | 0 | PASS |
| 전체(미지정) | 「설정」 링크 3차 모양 | `.btn .tertiary` · `--accent` · href `/admin/settings?group=권한#setting-permissions.fund.division_org_unit` | PASS(크기는 남은 경고) |
| 전체(미지정, admin.settings 보기 없는 계정) | 링크 없는 잠김 줄 | `자금 기능 본부 미지정` 1 · 링크 0 · 넘침 0 (계정: 권한표 보기만 있는 임시 계급) | PASS |
| 전체 | 설정 「권한」 절 구조 | Form.Field 라벨 · select · 힌트(aria-describedby) — 다른 select 설정과 같은 렌더러 | PASS |
| 전체 | 설정 앵커 | `#setting-permissions.fund.division_org_unit` 있음 · 기본 「경영관리본부」 · 미지정 「—」 | PASS |

**고친 것:** 독립 DOM 감사 결함은 0이라 없었다. `/review` 지적 둘을 고쳤다.
- (P2, `ed202d0b`) 폰 값 칸 `.mobileCell`에 `flex-wrap: wrap` — 긴 본부 이름(12자)이 칸 · 문서를 넘치던 것(문서 넘침 10px · 16자 38px)을 표지가 통째로 다음 줄로 내려 해결. 16자는 칸(약 190px)보다 넓어 칸 안에서 3px 넘치지만 문서 넘침은 0(한계 사례, 새 클래스 · 토큰 없음).
- (P3, `4ceb67fd`) 표지용 `readFundDivision` · `can(admin.settings)` 조회를 격자 조회보다 먼저 시작하고, 실패하면 표지 · 잠김 줄 없이 격자만 그린다(권한표 불러오기 실패로 번지지 않음).
**캡처 폴더:** `/tmp/claude-0/-home-user-ERP-PLANT8-260917/30ed6bf6-3ae4-50c2-9db0-a6fc33c75269/scratchpad/capture-07.3-04/` (`state-fund-note-default-{1280,768,375,320}.png` · `state-fund-note-unset-{1280,768,375,320}.png` · `measurements-state-fund-note-{default,unset}.json`). 폰 기준선은 실행 때 main 대조 없이 위 `measure-baseline.json` 상수로 E2E가 잰다(실행일 값과 달랐던 것 없음).

### 남은 경고 (고치지 않음 — 시스템 수준 · 이 플랜 밖)
- 잠김 줄 「설정」 3차 링크가 힌트 글자(13px)보다 크다(PC 14px · 폰 15px) — permissions/page.tsx:55-60. 공용 3차 컴포넌트라 고치려면 SYSTEM 변경(DECISIONS 먼저 · 사용자 승인).
- 설정 「자금 기능 본부」 힌트(domain/settings/keys.ts · 07.3-01)가 용어 6개로 8개 메뉴를 가리킨다(증빙 무효 처리 · 결재 중 증빙 붙이기는 암시만).
- admin.settings 보기 없는 계정의 잠김 줄 `자금 기능 본부 미지정`에는 다음 걸음이 없다(잠김 한 줄 · 명사형 규칙상 허용, 선택: `· 시스템 관리자` 꼬리).

