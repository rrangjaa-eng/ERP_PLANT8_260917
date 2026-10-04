# 260930-nto 독립 DOM 감사

- 감사자: 독립 에이전트(실행자 아님). 방법: `CI=true pnpm build` 프로덕션 빌드 + `pnpm start`(playwright.config.ts webServer, DB erp_test, globalSetup이 스키마 초기화) 위에서 Playwright로 getComputedStyle · getBoundingClientRect · Range.getClientRects · elementFromPoint 실측. 스크린샷 육안 판정 없음. 실행자 테스트는 쓰지 않고 감사 전용 측정을 새로 썼다.
- 대상 코드: `ccr-e0753b24-rowactions-underline` 3655ab5 (`git diff 9f0bd3d..HEAD -- app ui`). 감사 중 올라온 e20f136은 문서만(.planning · TODOS.md) 바꿔 app/ · ui/는 3655ab5와 같다.
- 폭: 1280 · 1024 · 768 · 700 · 375 · 320. 허용 오차 0.5px. 토큰은 실측: `--s-4` 16px, `--row-min` 36px(PC) · 44px(폰), `--accent` rgb(0, 84, 70), `--line` rgb(207, 219, 215).
- 시드(repositories 직접): 화면마다 60자 이름 행(「가」×60+스탬프) · 보통 행 · 숨김/비활성 행 · 보관 행. 상태: 일반, 숨김·비활성 포함(`?includeHidden=1` · `?includeInactive=1`), 「삭제」 누름(확인 줄) — 보통 행과 60자 행 각각.
- 「인접 동작 간격」은 `.rowActions`의 flex 항목(「수정」 링크 · 토글 Button 감싸개 · 「삭제」 또는 확인 줄) 사이를 잰다. 한 줄(세로로 겹침)이면 가로, 아니면 세로.
- 폰 44×44의 중심 hit는 요소를 뷰포트 가운데로 스크롤한 뒤 elementFromPoint로 찍었다(상자·간격 측정이 끝난 뒤에 해서 간격 값에 영향 없음).
- 임시 감사 스펙(test/e2e/zz-dom-audit-nto.spec.ts)과 임시 설정(playwright.audit.config.ts)은 실행 뒤 삭제했다. 원본 측정 로그: scratchpad/run2.jsonl(최종) · run1.jsonl(1차 — 측정기 결함 3건 수정 전, 아래 「측정기 수정」 참고).

## 집계

| 판정 | 건수 |
|---|---|
| PASS | 672 |
| FAIL | 1 |
| UNVERIFIED | 1 |
| N/A | 59 |

- PASS 672 = DOM 실측 670 + F 정적 검사 2.
- FAIL 1 = C(행 높이) 코드표 보관 행 35.39px — **이 변경 전부터 있던 결함**(아래). 원본 로그에는 같은 행의 「미달 행 상세」 줄이 따로 있어 FAIL 기록이 2줄이지만 한 건이다.
- N/A = 측정 대상이 애초에 없음(집계 밖): 코드표 폰(375·320) 동작 열 숨김 상태의 간격·44×44·확인 줄(설계상 열 없음), DeleteToArchive 확인 줄 안 1·2차 버튼 상자와 「삭제」↔「취소」 간격(관찰 — 이번 변경 범위 밖 컴포넌트), 「보관 항목이 목록에 보임」 참고 기록.

## 결과 요약

- **이번 변경(FINDING-001 · 002)에 대한 FAIL 0건.** 계획 must_haves.truths 7개 전부 실측으로 충족된다.
  - A: 세 화면 × 6폭 × 전 상태에서 인접 동작 간격이 전부 정확히 16.00px(= `--s-4`). ≥700은 전부 가로(한 줄, nowrap), <700은 wrap이며 세로 16.00px(확인 줄에서는 「수정」↔토글이 가로 16.00, 토글↔확인 줄이 세로 16.00). 「수정」은 전 폭·전 상태 1줄 · `white-space: nowrap`. 폰 행동 요소 전부 ≥44×44 + 중심 hit.
  - B: 모든 폭·상태에서 문서 넘침 0, 표 끝 − 부모 안쪽 끝 0.00, 표 끝 − 스크롤 컨테이너 안쪽 끝 0.00, 컨테이너 내부 넘침 0 — 60자 이름이 확인 문구에 들어가는 「삭제」 확인 줄 포함.
  - D: 3차 Button 7종(관리 4 · 비관리 3) 전부 underline · 1px · offset 2px · border-bottom none · 밑줄 색 `--accent`, hover 1px → 2px에서 상자 높이 19.19 → 19.19(변화 0). 폰 375 상자 ≥44×44, 글자 아래끝→상자 아래끝 12.41px이지만 밑줄은 border가 아니라 글자 밑줄(border-bottom none)이라 상자 바닥에 붙지 않는다. aria-disabled 2종(거래처 「숨기기…」 pending · 매출 「발행 줄 추가」 저장 중)은 밑줄 색 = `--line`, underline 1px 유지.
  - E(D4): 같은 거래처 행 「수정」 링크와 「숨기기」 `<button>`의 7속성 전부 같다.
  - F: `app/(app)/admin/people` diff 0줄. CSS diff에 색·토큰·radius·font 리터럴 0(px는 기존 규약의 `@media (max-width: 699.98px)`와 주석 안에만).
- **C 답: 재현했다.** 코드표 1280에서 가장 낮은 주 행 **35.39px**(실행자가 본 값과 소수점까지 같다). 조건 = 같은 표(project_status)에 **보관된 코드 항목**이 있을 때 그 행. 원인은 이번 diff가 아니다(아래 「C 재현」).
- UNVERIFIED 1건: 폰 375 `/projects/[id]` 「발행 줄 추가」가 보이지 않아 잴 수 없었다(같은 화면 「기간 바꾸기」와 `/leave/new` 「시작일 적기」로 비관리 화면 폰 측정을 대신했다).

## C 재현 — 코드표 보관 행 35.39px

| 폭 | 조건 | 측정값 | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 보관 항목 없음(일반 · 숨김 포함 · 확인 두 상태) | 최저 44.50px | ≥35.5 | PASS |
| 1280 | project_status에 보관 항목 1개(`setCodeItemArchived`) — 시스템 관리자에게 목록에 보임(true) | 최저 **35.39px** = 그 보관 행 `audit-archived-…　감사보관-…　—　953　보관됨`, 6칸 모두 table-cell 35.39px, 칸 안이 전부 글자(입력·버튼 없음) | ≥35.5 | **FAIL** |
| 375 | 같은 DOM, table-row-min.spec.ts와 같은 순서(1280에서 잰 뒤 새로고침 없이 375) | 74.19px | ≥43.5 | PASS |
| 1280 | 참고: 증빙 종류 표(세금 규칙 줄 포함, 14행) | 최저 44.50px | ≥35.5 | PASS |

- DOM 위치: `/admin/code-tables` 표 `<caption>코드표 · 프로젝트 상태</caption>`의 tbody 주 행 중 `item.archivedAt`이 있는 행. 그 행은 이름·설명이 입력 대신 글자, 동작 칸이 빈 칸(`{item.archivedAt ? null : …}`)이라 `.rowActions`도 3차 Button도 없다.
- 원인: `app/(app)/admin/code-tables/code-tables.module.css` `.table td { min-height: var(--row-min); … }`(78-83행) — 표 칸에는 min-height가 적용되지 않는다. 입력(`--control-h` 32px)이 있는 행은 44.50px로 우연히 넘고, 글자만 있는 보관 행은 글자 줄 + 칸 패딩 6×2 + 선 1 = 35.39px로 떨어진다. 거래처·법인카드·보관함은 같은 자리에 `height: var(--row-min)`을 써서(각 모듈 75 · 76 · 23행) 보관 행도 36.00px(거래처 보관 행 실측 36.00).
- 이번 diff와의 관계: 이 규칙은 base 9f0bd3d에도 그대로 있고(당시 65행), 보관 행에는 이번 변경이 넣은 `.rowActions` · 3차 밑줄이 하나도 렌더되지 않는다 — **기존 결함, 이번 변경의 회귀 아님.**
- 실행자가 재현하지 못한 이유(추정, 실측으로 뒷받침): 이 행은 전체 스위트에서 다른 스펙(예: code-tables.spec.ts의 「삭제」 흐름)이 같은 표에 보관 항목을 남긴 시점에만 목록에 섞인다. table-row-min.spec.ts의 코드표 테스트는 자기 시드(`createCodeItem`)만 하므로 단독 실행에서는 보관 행이 없어 통과한다 — 순서·공유 DB 의존 flake.
- 고칠 곳(제안, 감사자는 고치지 않았다): code-tables.module.css `.table td`의 `min-height` → 다른 세 표와 같은 `height: var(--row-min)`. table-row-min.spec.ts 코드표 케이스에 보관 항목 시드를 넣으면 결정적으로 재현된다.

## 측정표

### /admin/vendors

#### A. 행 동작 간격 · 「수정」 한 줄 · 폰 44×44

| 폭 | 상태 · 행 | .rowActions wrap · gap | 인접 동작 간격 | 「수정」 줄 · white-space | 폰 상자 ≥44×44 · 중심 hit | 판정 |
|---|---|---|---|---|---|---|
| 1280 | 일반 · 60자 행 | nowrap · 16px | 수정↔숨기기 가로 16.00 · 숨기기↔삭제 가로 16.00 | 1줄 · nowrap | (PC 대상 아님) | PASS |
| 1280 | 일반 · 보통 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 1280 | 숨김 포함 · 숨김 행 | nowrap · 16px | 수정↔보이기 가로 16.00 · 보이기↔삭제 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 1280 | 확인 · 보통 행 | nowrap · 16px | 수정↔숨기기 가로 16.00 · 숨기기↔확인 줄 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 1280 | 확인 · 60자 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 1024 | 일반 · 60자 행 / 보통 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 (두 행 같음) | 1줄 · nowrap | (PC) | PASS |
| 1024 | 숨김 포함 · 숨김 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 1024 | 확인 · 보통 행 / 60자 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 (두 행 같음) | 1줄 · nowrap | (PC) | PASS |
| 768 | 일반 · 60자 행 / 보통 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 768 | 숨김 포함 · 숨김 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 768 | 확인 · 보통 행 / 60자 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 700 | 일반 · 60자 행 / 보통 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 700 | 숨김 포함 · 숨김 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 700 | 확인 · 보통 행 / 60자 행 | nowrap · 16px | 가로 16.00 · 가로 16.00 | 1줄 · nowrap | (PC) | PASS |
| 375 | 일반 · 60자 행 / 보통 행 | wrap · 16px | 수정↔숨기기 세로 16.00 · 숨기기↔삭제 세로 16.00 | 1줄 · nowrap | 수정 44.00×44.00 · 숨기기 46.45×44.00 · 삭제 44.00×44.00 · hit 전부 true | PASS |
| 375 | 숨김 포함 · 숨김 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 보이기 46.45×44 · 삭제 44×44 · hit true | PASS |
| 375 | 확인 · 보통 행 / 60자 행 | wrap · 16px | 수정↔숨기기 가로 16.00 · 숨기기↔확인 줄 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 숨기기 46.45×44 · hit true | PASS |
| 320 | 일반 · 60자 행 / 보통 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 숨기기 46.45×44 · 삭제 44×44 · hit true | PASS |
| 320 | 숨김 포함 · 숨김 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 보이기 46.45×44 · 삭제 44×44 · hit true | PASS |
| 320 | 확인 · 보통 행 / 60자 행 | wrap · 16px | 가로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 숨기기 46.45×44 · hit true | PASS |

#### B. 가로 넘침

| 폭 | 상태 | 문서 scrollWidth−clientWidth | 표 끝−부모 안쪽 끝 | 표 끝−스크롤 컨테이너 안쪽 끝 · 컨테이너 내부 넘침 | 판정 |
|---|---|---|---|---|---|
| 1280 · 1024 · 768 · 700 · 375 · 320 (각 폭) | 일반 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 1280 · 1024 · 768 · 700 · 375 · 320 | 숨김 포함 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 1280 · 1024 · 768 · 700 · 375 · 320 | 확인 · 보통 행 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 1280 · 1024 · 768 · 700 · 375 · 320 | 확인 · 60자 행(확인 문구에 60자 이름) | 0 | 0.00 | 0.00 · 0 | PASS ×6 |

#### C. 주 행 높이

| 폭 | 상태 | 측정값(최저 행) | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 일반(3행) | 36.00px [60자 행] | ≥35.5 | PASS |
| 1280 | 숨김 포함(4행) | 36.00px | ≥35.5 | PASS |
| 1280 | 확인 · 보통 행(3행) | 36.00px [보관 행 「보관됨」] | ≥35.5 | PASS |
| 1280 | 확인 · 60자 행(3행) | 36.00px [보통 행] | ≥35.5 | PASS |
| 375 | 일반(3행) | 44.50px [보관 행] | ≥43.5 | PASS |
| 375 | 숨김 포함(4행) | 44.50px | ≥43.5 | PASS |
| 375 | 확인 · 보통 행 | 44.50px | ≥43.5 | PASS |
| 375 | 확인 · 60자 행 | 68.50px | ≥43.5 | PASS |

### /admin/corp-cards

#### A. 행 동작 간격 · 「수정」 한 줄 · 폰 44×44

| 폭 | 상태 · 행 | .rowActions wrap · gap | 인접 동작 간격 | 「수정」 줄 · white-space | 폰 상자 ≥44×44 · 중심 hit | 판정 |
|---|---|---|---|---|---|---|
| 1280 · 1024 · 768 · 700 | 일반 · 60자 행 / 보통 행 | nowrap · 16px | 수정↔비활성화 가로 16.00 · 비활성화↔삭제 가로 16.00 (4폭 × 2행 전부) | 1줄 · nowrap | (PC) | PASS ×8 |
| 1280 · 1024 · 768 · 700 | 비활성 포함 · 비활성 행 | nowrap · 16px | 수정↔활성화 가로 16.00 · 활성화↔삭제 가로 16.00 | 1줄 · nowrap | (PC) | PASS ×4 |
| 1280 · 1024 · 768 · 700 | 확인 · 보통 행 / 60자 행 | nowrap · 16px | 수정↔비활성화 가로 16.00 · 비활성화↔확인 줄 가로 16.00 | 1줄 · nowrap | (PC) | PASS ×8 |
| 375 | 일반 · 60자 행 / 보통 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44.00×44.00 · 비활성화 56.59×44.00 · 삭제 44.00×44.00 · hit true | PASS |
| 375 | 비활성 포함 · 비활성 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 활성화 46.45×44 · 삭제 44×44 · hit true | PASS |
| 375 | 확인 · 보통 행 / 60자 행 | wrap · 16px | 수정↔비활성화 세로 16.00 · 비활성화↔확인 줄 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 비활성화 56.59×44 · hit true | PASS |
| 320 | 일반 · 60자 행 / 보통 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 비활성화 56.59×44 · 삭제 44×44 · hit true | PASS |
| 320 | 비활성 포함 · 비활성 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 활성화 46.45×44 · 삭제 44×44 · hit true | PASS |
| 320 | 확인 · 보통 행 / 60자 행 | wrap · 16px | 세로 16.00 · 세로 16.00 | 1줄 · nowrap | 수정 44×44 · 비활성화 56.59×44 · hit true | PASS |

#### B. 가로 넘침

| 폭 | 상태 | 문서 넘침 | 표 끝−부모 안쪽 끝 | 표 끝−스크롤 컨테이너 · 내부 넘침 | 판정 |
|---|---|---|---|---|---|
| 1280 · 1024 · 768 · 700 · 375 · 320 | 일반 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 같은 6폭 | 비활성 포함 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 같은 6폭 | 확인 · 보통 행 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |
| 같은 6폭 | 확인 · 60자 행 | 0 | 0.00 | 0.00 · 0 | PASS ×6 |

#### C. 주 행 높이

| 폭 | 상태 | 측정값(최저 행) | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 일반(3행) | 57.28px | ≥35.5 | PASS |
| 1280 | 비활성 포함(4행) | 57.28px | ≥35.5 | PASS |
| 1280 | 확인 · 보통 행 | 79.67px | ≥35.5 | PASS |
| 1280 | 확인 · 60자 행 | 80.17px | ≥35.5 | PASS |
| 375 | 일반(3행) | 237.00px | ≥43.5 | PASS |
| 375 | 비활성 포함(4행) | 237.00px | ≥43.5 | PASS |
| 375 | 확인 · 보통 행 | 261.00px | ≥43.5 | PASS |
| 375 | 확인 · 60자 행 | 333.00px | ≥43.5 | PASS |

### /admin/code-tables (project_status)

#### A. 행 동작 간격

| 폭 | 상태 · 행 | .rowActions wrap · gap | 인접 동작 간격 | 판정 |
|---|---|---|---|---|
| 1280 · 1024 · 768 · 700 | 일반 · 60자 행 / 보통 행 | nowrap · 16px | 비활성화↔삭제 가로 16.00 (4폭 × 2행) | PASS ×8 |
| 1280 · 1024 · 768 · 700 | 비활성 포함 · 비활성 행 | nowrap · 16px | 활성화↔삭제 가로 16.00 | PASS ×4 |
| 1280 · 1024 · 768 · 700 | 확인 · 보통 행 / 60자 행 | nowrap · 16px | 비활성화↔확인 줄 가로 16.00 | PASS ×8 |
| 375 · 320 | 일반 · 60자 행 / 보통 행, 비활성 포함 · 비활성 행 | — | 동작 칸 `td` display none, `.rowActions` 보이지 않음(설계: <700 동작 열 숨김) | PASS ×6 |
| 375 · 320 | 확인 | — | 「삭제」가 보이지 않아 확인 줄 없음(설계) | N/A |

#### B. 가로 넘침

| 폭 | 상태 | 문서 넘침 | 표 끝−부모 안쪽 끝 | 표 끝−스크롤 컨테이너 · 내부 넘침 | 판정 |
|---|---|---|---|---|---|
| 1280 · 1024 · 768 · 700 | 일반 · 비활성 포함 · 확인(보통 행) · 확인(60자 행) | 0 | 0.00 | 0.00 · 0 | PASS ×16 |
| 375 · 320 | 일반 · 비활성 포함 | 0 | 0.00 | 0.00 · 0 | PASS ×4 |

#### C. 주 행 높이

| 폭 | 상태 | 측정값(최저 행) | 기대 | 판정 |
|---|---|---|---|---|
| 1280 | 일반(7행) · 비활성 포함(8행) · 확인 두 상태(7행) | 44.50px (전 상태 같음) | ≥35.5 | PASS ×4 |
| 375 | 일반(7행) · 비활성 포함(8행) | 111.00px | ≥43.5 | PASS ×2 |
| 1280 | **보관 항목 섞임** | **35.39px** — 위 「C 재현」 | ≥35.5 | **FAIL(기존 결함)** |
| 375 | 보관 항목 섞임 | 74.19px | ≥43.5 | PASS |

### D. 공유 3차 Button 글자 밑줄

| 화면 | 버튼 | 폭 | line · thickness · offset · border-bottom-style | 밑줄 색 = --accent | hover(1280) thickness · 상자 높이 / 폰(375) 상자 · hit · 글자 아래끝→상자 아래끝 | 판정 |
|---|---|---|---|---|---|---|
| /admin/vendors | 「숨기기」 | 1280 | underline · 1px · 2px · none | rgb(0, 84, 70) = 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /admin/vendors | 「숨기기」 | 375 | underline · 1px · 2px · none | 같음 | 46.45×44.00 · hit true · 12.41px(밑줄은 글자 밑줄) | PASS |
| /admin/vendors | 「삭제」(DeleteToArchive) | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /admin/vendors | 「삭제」 | 375 | underline · 1px · 2px · none | 같음 | 44.00×44.00 · hit true · 12.41px | PASS |
| /admin/corp-cards | 「비활성화」 | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /admin/corp-cards | 「비활성화」 | 375 | underline · 1px · 2px · none | 같음 | 56.59×44.00 · hit true · 12.41px | PASS |
| /admin/archive | 「복원」(보관 거래처) | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /admin/archive | 「복원」 | 375 | underline · 1px · 2px · none | 같음 | 44.00×44.00 · hit true · 12.41px | PASS |
| /projects/[id] (비관리, 경영관리 계정) | 「발행 줄 추가」 | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /projects/[id] | 「발행 줄 추가」 | 375 | — | — | 버튼이 보이지 않음 | UNVERIFIED |
| /projects/[id] | 「기간 바꾸기」 | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /projects/[id] | 「기간 바꾸기」 | 375 | underline · 1px · 2px · none | 같음 | 69.36×44.00 · hit true · 12.41px | PASS |
| /leave/new (비관리, 팀 있는 직원) | 「시작일 적기」(막힘 다음 행동) | 1280 | underline · 1px · 2px · none | 같음 | 1px → 2px · 19.19 → 19.19 | PASS |
| /leave/new | 「시작일 적기」 | 375 | underline · 1px · 2px · none | 같음 | 69.36×44.00 · hit true · 12.41px | PASS |

비활성(aria-disabled) 3차 Button:

| 화면 | 상태 | aria-disabled | text-decoration-color vs --line | line · thickness | 판정 |
|---|---|---|---|---|---|
| /admin/vendors 1280 | 「숨기기…」 pending(서버 액션 요청 붙잡음) | true | rgb(207, 219, 215) = rgb(207, 219, 215) | underline · 1px | PASS |
| /projects/[id] 1280 | 「발행 줄 추가」 저장 중(saveLocked) | true | rgb(207, 219, 215) = 같음 | underline · 1px | PASS |

폰 밑줄 위치: 계산된 border-bottom-style이 none이고 밑줄이 text-decoration이라 밑줄은 글자 기준선 + `--underline-offset`(2px)에 그려진다. 상자 아래끝과 글자 줄 상자 아래끝 사이 12.41px는 44px 상자의 세로 가운데 정렬 여백이고, 옛 결함(border가 상자 바닥 = 글자에서 13.5px 아래)과 달리 그 자리에 선이 없다. DOM은 밑줄 선의 y를 직접 돌려주지 않으므로 위치는 계산 스타일로 판정했다.

### E. D4 대응 — /admin/vendors 1280, 같은 행 「수정」 링크 vs 「숨기기」 `<button>`

| 속성 | 「수정」 | 「숨기기」 | 판정 |
|---|---|---|---|
| font-size | 12px | 12px | PASS |
| font-weight | 600 | 600 | PASS |
| color | rgb(0, 84, 70) | rgb(0, 84, 70) | PASS |
| text-decoration-line | underline | underline | PASS |
| text-decoration-thickness | 1px | 1px | PASS |
| text-underline-offset | 2px | 2px | PASS |
| text-decoration-color | rgb(0, 84, 70) | rgb(0, 84, 70) | PASS |

### F. 바뀌지 않아야 할 것(정적)

| 검사 | 측정값 | 기대 | 판정 |
|---|---|---|---|
| `git diff 9f0bd3d..HEAD -- 'app/(app)/admin/people'` | 0줄 | 비어 있음 | PASS |
| CSS diff 추가 줄의 #hex · rgb( · hsl( · radius · font-family · 새 `--토큰:` 선언 · var() 밖 px | 없음. px는 `@media (max-width: 699.98px)` 3곳(people.module.css와 같은 기존 분기점)과 주석뿐. 쓰인 토큰: `--s-4`×3 · `--line-w` · `--line-w-strong` · `--underline-offset` · `--line`(전부 tokens.css에 있음) | 새 리터럴 0 | PASS |

## UNVERIFIED

1. **폰 375 `/projects/[id]` 「발행 줄 추가」** — 1280에서 발행 줄 1개를 저장한 같은 프로젝트를 375로 열었을 때 이 버튼이 DOM에 보이지 않았다(폰 매출 섹션이 편집 버튼을 그리지 않는 것으로 보이나 원인은 확인하지 않음). 비관리 화면의 폰 3차 밑줄은 같은 화면 「기간 바꾸기」와 `/leave/new` 「시작일 적기」로 측정했고 둘 다 PASS.

## 관찰 (FAIL 아님)

1. **C의 코드표 보관 행 35.39px는 기존 결함**(위 절). 이번 PR 범위 밖이지만 table-row-min.spec.ts가 전체 스위트에서 순서에 따라 빨개지는 원인이다 — 후속 한 줄 수정(`min-height` → `height`) 후보.
2. DeleteToArchive 확인 줄(`archive.module.css .confirmRow`, 이번 범위 밖) 안의 1차 「삭제」 · 2차 「취소」는 폰에서 46.30×40.00(`--control-h` 40 — SYSTEM §7-1 「시트 밖 폰 버튼은 40 유지」 예외)이고 둘 사이 간격은 8.00px(`--s-2`). 행 동작 사이(`.rowActions`) 간격과는 별개이며 이번 변경이 건드리지 않았다.
3. 모든 인접 동작 간격이 정확히 16.00px로 나온다 — 60자 행이 동작 칸을 눌러도 ≥700에서 nowrap이 유지돼 「삭제」가 아래로 떨어지지 않는다(PR #108 사람 목록과 같은 동작).

## 측정기 수정 (1차 실행 → 2차 실행)

1차 실행(run1.jsonl)에 FAIL 21건이 더 있었으나 전부 감사 측정기 결함이라 고친 뒤 전체를 다시 돌렸다(2차 = 위 수치). 화면 코드는 두 실행 사이에 바뀌지 않았다.
- 폰 44×44의 「hit=false」 13건(법인카드 375 · 320): elementFromPoint는 뷰포트 밖 좌표에서 null을 돌려준다(320 · 375에서 행이 화면 아래) — 요소를 가운데로 스크롤한 뒤 찍도록 고쳐 전부 hit true.
- 60자 행 확인 줄의 1·2차 버튼 40px 8건(거래처 · 법인카드 375 · 320): 확인 줄 식별을 잘린 글자(앞 40자 = 「가」×40)로 해서 범위 밖 관찰로 분류하지 못했다 — 전체 글자로 식별하도록 고침.
- 3차 버튼 pending 측정 테스트가 route 해제 경합(`Route is already handled`)으로 멈춰 뒤 두 테스트가 돌지 않았다 — 해제를 ignoreErrors로 고침.
