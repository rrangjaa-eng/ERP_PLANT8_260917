# 04-31 `/design-review` — Phase 4 화면 시스템 일치 감사 (독립)

- 일시 2026-09-28 · 브랜치 `claude/gsd-progress-e1nzgu` · 감사자: 독립 에이전트(보고 전용, 소스 수정 없음)
- 기준: `docs/design/SYSTEM.md` §11 「시스템 일치」 + 품질 바닥 · §1-3 · §7-1 · §7-3 · §7-16 · §10 · `DECISIONS.md`(판정 전 grep)
- 방법: `CI=true` 프로덕션 빌드(`pnpm build && pnpm start`) + 임시 스펙 `test/e2e/_dr-p4.spec.ts`(실행 후 삭제). 판정은 전부 `getComputedStyle`·`getBoundingClientRect`·`scrollWidth`·`:focus-visible`·토큰 역매핑(문서의 모든 `--*` 변수를 계산값으로 풀어 비교) 수치. 스크린샷 없음
- 데이터: 전사 범위·모든 메뉴×동작·모든 정보 항목 계급의 PM 계정. 상세 = 12줄(USD 외화 1줄)·진행·발행 1줄·2차 차수(1차 = 이전 차수)·긴 이름. 목록 = 보통 금액 5건(13자 금액 없음 — INFO-2 확인용). 리저브 6줄(긴 메모 1). 코드표 = 시스템 관리자
- 폭 1280 · 1024 · 700 · 375 (높이 800)

## 요약
- **§11 점검 PASS 전 항목 · FINDING 2(medium 0 · polish 2) · DEFERRED-by-record 1 · NEEDS-USER-DECISION 0**
- 새 색 0 · 새 서체 0(`Pretendard Variable`만) · radius 0 · 바깥 그림자 0 · 카드 0 · ⌘/⌥/⇧ 0 · 4.5:1 미달 글자 0 · 가로 스크롤 0

## §11 시스템 일치 × 화면 (실측)
| 점검 | 목록 `/projects` | 등록 `?new=1` | 상세(견적·매출·차수) | 이전 차수 열기 | 리저브 `/pnl/reserves` | 코드표 `/admin/code-tables` |
|---|---|---|---|---|---|---|
| 토큰 밖 색(글자·면·테두리·밑줄) | 0 | 0 | 0 | 0 | 0 | 0 |
| 서체 | Pretendard | 같음 | 같음 | 같음 | 같음 | 같음 |
| radius ≠ 0 / 바깥 `box-shadow` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| 카드(4면 테두리 >80px 상자) | 0 | 0 | 0 | 0 | 0 | 0 |
| `--accent` 사용처 | 이름 링크·「프로젝트 등록」·「필터 지우기」(①) · `진행` 태그(①) · 폰 하단 탭(⑤) · 상단 바 kbd(INFO-4) | + 1차 「프로젝트 등록 Ctrl+Enter」(③) | 3차 버튼 8종(①) · `진행`·`현재` 태그(①) · 편집 셀 밑줄(②) | 3차 「차수 닫기」(①) · `현재`(①) | 3차 「리저브 줄 추가」(①) | 표 전환·「코드 추가」 링크(①) · 행 3차 「비활성화」「삭제」(①) |
| 안내 문단(`main p`) | 부제 `프로젝트 원장` · 합계 줄 · 폰 필터 요약 | 같음 | 부제 · 기간/예상가 칸 줄 · 힌트 줄 · 매출 부제(INFO-6) | 매출 부제 | 부제 · 힌트 줄 | 부제 `프로젝트 상태` |
| 비활성 버튼 | 0 | 0 | 「일괄 저장」 `aria-describedby` → `바뀐 칸 없음` | 0 | 같음 `바뀐 칸 없음` | 0 |
| 보이는 열 1280/1024/700/375 | **13**/9/6/3 | 13/9/6/3(뒤 목록) | 견적 11/9/7/**3** · 발행 3/3/3/2 · 차수 6/6/6/3 | 견적 11 | 9/7/6/3 | 6/6/6/2 |
| 쉼표 없는 4자리+ 숫자 | 날짜·프로젝트 번호(`26001`)만 — 식별자(D-95) | 같음 | 날짜만 | 날짜만 | 날짜만 | 0 |
| `scrollWidth ≤ innerWidth` | 4폭 PASS | PASS | PASS | PASS(1280) | PASS | PASS |

품질 바닥
- `:focus-visible`: Tab 20–40회 순회 전부 `outline: solid 2px` + 색 `--focus`(offset 2px). 격자 셀 `td` offset −2px(§7-3 활성 셀 외곽선), 상단 바 링크·트리거 `--bar-fg`(§4-4 기록 예외). 네이티브 날짜 칸 내부 달력 단추 차례에서만 `input:focus-visible=false`(Chromium 섀도 DOM 안 자체 링) — INFO
- 대비: 텍스트 노드가 있는 전 요소 fg/bg 계산 → 4.5 미만 0건
- 375 터치: 폰 컨트롤 높이 40은 DECISIONS 125행(시트 밖 폰 버튼 40)으로 기록된 값 → 제외. 표 머리글 정렬 링크만 미달(DR-P4-02). 목록 이름 링크(18px)는 폰 행 전체 링크(`phoneRowLink`, DECISIONS 988행)라 제외
- 모달(「복사해 새 차수」): 1280·1024·700 모두 `width 480 · max-width 480px · radius 0 · box-shadow none`. 375는 트리거가 본문에 없음(앞 DOM 감사가 폰 시트 측정)

## INFO 판정 (04-31 DOM 감사의 8건)
| # | 항목 | 판정 | 근거(실측) |
|---|---|---|---|
| 1 | 스킵 링크 `--accent` 면 | PASS | 첫 Tab 뒤 `top 8`, bg `rgb(0,84,70)`=`--accent`, outline 2px `--focus`. §10 「포커스 시에만 보임, 1차 버튼 모양」 |
| 2 | 1280 목록 9열 | PASS | 보통 금액 데이터에서 1280 머리글 13개(`번호…상태`), 1024 = 9 · 700 = 6 · 375 = 3. 9열은 13자 금액이 있을 때의 `columnStep: "narrow"`(04-18, `domain/projects/list-view.ts:78-91`) — 설계대로, `projects-list.spec.ts` 두 테스트가 덮음. 경계 규칙은 max-width 1279.98/1023.98/699.98 CSS |
| 3 | 목록 프로젝트명 링크 `--accent` | PASS | `a.link` color `--accent` + 1px 밑줄. 상세로 가는 이동 = §10 「3차 버튼은 페이지 이동이면 `<a>`」 → §1-3 ① 행동 링크. (굵기 400 — 표 본문 안 이름이라 3차 600과 다름. 시스템 위반 조항 없음, 참고만) |
| 4 | 상단 바 `Ctrl+K` kbd 테두리 | DEFERRED-by-record | `header kbd` border `1px rgb(0,84,70)`=`--g-700`(on `--bar`), 전 화면. DECISIONS 621행 → 잔여 퀵 태스크 F-03이 렌더 여부·모양 결정. Phase 4 범위 밖 |
| 5 | 코드표 전환 링크 `--accent` | PASS(색) · FINDING(현재 표시) | 이동 링크 = ① 행동 링크로 PASS. 다만 현재 표 링크가 다른 링크와 같은 모양 → DR-P4-01 |
| 6 | 매출 부제 `공급가액 기준 · 입금액만 통장 합계` | PASS | UI-SPEC 437–439 PNL-09 표시 의무. 설명문이 아닌 기준 표기 |
| 7 | 포커스 링 미측정 | PASS(측정함) | 위 품질 바닥 — 4개 화면 순회 전부 2px `--focus`/`--bar-fg` |
| 8 | 모달 폭 1024·1000 미측정 | PASS(측정함) | 1024·700 모두 480, radius 0, 그림자 없음 |

## FINDINGS
### DR-P4-01 · polish · 코드표 — 현재 표 링크가 현재 표시 없이 행동 링크 모양
- 실측: `nav[aria-label="코드표 선택"] a[aria-current="page"]`(「프로젝트 상태」) color `rgb(0,84,70)`=`--accent`, `text-decoration: underline` — 옆 「증빙 종류」와 계산값 동일. 현재 위치를 aria로만 말하고 보이는 차이 0(부제 `프로젝트 상태`가 유일한 시각 단서)
- 소스: `app/(app)/admin/code-tables/page.tsx:76-83`(`aria-current` 부여) · `app/(app)/admin/code-tables/code-tables.module.css:14-18`(`.toggle`에 현재 상태 규칙 없음)
- 최소 수정: `.toggle[aria-current="page"] { color: var(--fg); font-weight: var(--fw-bold); text-decoration: none; }` — §7-16 「현재 번호는 `--fg` 700, 밑줄 없음」과 같은 기존 패턴·기존 토큰. 새 결정 불필요
### DR-P4-02 · polish · 목록(375) — 표 머리글 정렬 링크 터치 목표 미달
- 실측(375): `a.sortLink` 「견적」 20×19px, 「프로젝트명」 51×19px (§10 폰 44×44)
- 소스: `ui/table/Table.module.css:23-29`(`.sortLink`, 폰 미디어쿼리 270행에 크기 규칙 없음) · `ui/table/Table.tsx:809`
- 최소 수정: 폰 미디어쿼리 안 `.sortLink { min-height: var(--touch-min); min-width: var(--touch-min); }` — 기존 토큰(`code-tables.module.css`·`projects.module.css`의 폰 `.toggle`과 같은 방식). §10이 이미 정한 값이라 새 결정 불필요. 공용 `ui/table`이라 정렬 머리글이 있는 모든 목록에 같이 적용됨(화면 하나 예외 아님)

## 정리
- 임시 스펙 삭제, `git status --porcelain` = 이 보고서만. 원자료 `/tmp/claude-0/dr/out.json`(보관 안 함)

**디자인 점수: A− — 판정 PASS(polish 2건은 ship 막지 않음, 다음 묶음 또는 이 PR 안에서 처리 권장)**

## 재측정 (DR-P4-01 수정 뒤, 8353610)
- 일시 2026-09-28 · HEAD `8353610` · 독립 에이전트(보고 전용) · `CI=true` 프로덕션 빌드, 임시 스펙 `test/e2e/_dr-remeasure.spec.ts`(실행 후 삭제). 판정은 `getComputedStyle`·`getBoundingClientRect`·`scrollWidth`·Tab 순회 `:focus-visible` 수치. 스크린샷 없음
- 상태 = 표 2(`project_status` 기본 · `evidence_type`) × 「숨김 포함/제외」 2 × 폭 1280·1024·700·375 = 16. 토큰 계산값 `--fg` `rgb(11,21,18)` · `--accent` `rgb(0,84,70)` · `--focus` `rgb(0,84,70)`

| 점검 | 판정 | 근거(실측, 16상태 전부) |
|---|---|---|
| 현재 링크 = `--fg` · 700 · 밑줄 없음 | PASS | `a[aria-current=page]` color `rgb(11,21,18)` · weight `700` · `text-decoration-line: none` |
| 형제 링크 = `--accent` · 600 · 밑줄 | PASS | nav 형제 + 「숨김 포함/제외」 모두 `rgb(0,84,70)` · `600` · `underline`(회귀 없음) |
| 현재 링크 `:focus-visible` 2px `--focus` | PASS | Tab 3–9회째 도달, `:focus-visible=true` · `solid 2px rgb(0,84,70)` · offset 2px |
| 현재 링크 대비 ≥ 4.5:1 | PASS | 18.58:1 (bg `rgb(255,255,255)`) |
| 가로 스크롤 없음 | PASS | `scrollWidth` = `innerWidth` (1280/1024/700/375) |
| 전환 줄 폭·줄바꿈·겹침 | PASS | nav 높이 수정 전 = 뒤: 19.19(1280·1024·700) / 44(375). 굵기 600→700 폭 변화 −0.1px(「프로젝트 상태」 63.6→63.5, 「증빙 종류」 43.3→43.2). 두 링크 같은 y, 간격 16px 유지, 겹침 0 |

전환 링크 상자 (x, y, w, h — 수정 뒤, `project_status` 현재)
- 1280: 「프로젝트 상태」* 1137.2,107.2,63.5,19.2 · 「증빙 종류」 1216.7,107.2,43.3,19.2
- 1024: 881.2,107.2,63.5,19.2 · 960.7,107.2,43.3,19.2
- 700: 557.2,107.2,63.5,19.2 · 636.7,107.2,43.3,19.2
- 375: 237.6,107.2,63.4,44 · 317,107.2,44,44 (폰 44×44 터치 목표 유지)

RED 재현 (ebed3c2 테스트의 진위)
- `git show ebed3c2:…/code-tables.module.css`를 덮어쓰고 `CI=true playwright test test/e2e/code-tables.spec.ts`: **1 failed**(「현재 표 링크는 형제 링크와 색·굵기·밑줄로 구분된다」 — `Expected "rgb(11, 21, 18)" / Received "rgb(0, 84, 70)"`), 나머지 10 통과. 수정 전 계산값은 현재·형제 모두 `rgb(0,84,70)/600/underline`으로 원 FINDING과 일치
- `git checkout --`으로 복원 뒤 재실행: **11/11 passed** → PASS

DR-P4-02 (보류 유지 — `ui/` 동결 중)
- 375 `/projects` `a.sortLink`: 「프로젝트명」 50.7×19.2 · 「견적」 20.3×19.2 — 보고값(51×19 · 20×19)과 같음, 여전히 44×44 미달. 1280/1024/700 정렬 링크 높이도 19.2(데스크톱은 §10 폰 기준 밖). 상태 **DEFERRED(변동 없음)**

정리: 임시 스펙 삭제, 코드표 CSS 복원 확인, `git status --porcelain` = 이 보고서만.

**재측정 판정: DR-P4-01 CLOSED(PASS 6/6) · DR-P4-02 DEFERRED 유지**
