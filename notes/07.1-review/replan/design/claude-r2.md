# 07.1 재계획 디자인 재확인 — 2회차 Claude (head 048abcb)

- 체크아웃 `/home/user/wt-r2` 048abcb · 비교 `git diff 41a5fe2 048abcb` · 읽기 전용(저장소 수정 0). codex-out-R2.md는 읽지 않았다.
- 기준: 막음 = 파일:줄 근거 + 그대로 하면 실행 불가 또는 규칙 위반. 나머지는 참고. 줄 번호는 `07.1-18-PLAN.md`(이하 18) 048abcb 기준.
- 합성 재현은 **실제 화면 DOM이 아니다** — Playwright Chromium(`/opt/pw-browsers`) 320 뷰포트 · body 여백 16(표 면 288) · 고친 꼴 CSS만 옮긴 합성 HTML(스크래치 `/tmp/claude-0/-home-user/9cba8eba-4aae-5e5a-8eff-66c0f97a5a8f/scratchpad/r2/page.html`). 방향만 근거.

## 결론: 막음 0 · 1회차 막음 B-R1 · B-R3 해결 · 참고 B-R2 해결 · 참고 7

## (1) 1회차 지적

### B-R1 견적 표 상태 메모 — 해결
- 18:214 (바-2): 메모(`notes`)를 도움 함수 하나로 빼서 `cell` = 태그만 · `secondaryLine` = `.lineStatusNote` · `secondaryText` = 같은 글자 · 시트 `상태` 줄(:3271 — 지금 태그만, 소스 `quote-table.tsx:3271` 확인)에 태그 + 메모. 새 문구 0, 기존 클래스.
- 파일 경계: frontmatter :18에 `quote-table.tsx`, :236이 「상태 열 · 시트만」으로 풂, `.css` 금지는 :238이 유지(`project-detail.module.css` 그대로). 모순 없음.
- 픽스처 :184(폰 견적 표 기한 경과 · 실행가 초과 줄) · verify(Task 1 둘째 명령)에 `quote-line-status.spec.ts` 있음. 데스크톱 색 · 굵기 단언(`quote-line-status.spec.ts:344-346` · `:393-395` `row.getByText` + `styleOf`)은 안쪽 span이 자기 색 · 굵기(`project-detail.module.css:21-26`)를 가져 `.cellSecondary`(`Table.module.css:151-154` muted · aux) 안에서도 선다.
- DECISIONS 한 줄 :216(바-3) — 폰 접힌 줄 경고색 빠짐을 frontend.md:14 순서대로 기록.

### B-R3 말줄임 폭 규칙 위치 — 해결
- 소스 확인: 지금 `ui/table/Table.tsx` `renderCell`(:798-825)은 `secondaryLine`이 없으면 `primary`를 감싸개 없이 돌려주고(:818), 있을 때만 `<div>`(:821)를 그린다. `data-cell-text`는 저장소에 0건 — **계획이 새로 단다**는 것이 18:209 ⓐ에 명시돼 있다(「`secondaryLine` 유무와 무관하게 … `<div data-cell-text="">` · 숫자 칸 · `headerHidden` 열은 그대로」 · 접힌 줄 td 내용도 감싸개) · 인수 기준 :241(`Table.tsx` ≥ 2 · `Table.module.css` ≥ 1).
- td 규칙 0: :209 ⓑ 「td(`.cell` · `.collapsedCell`)에는 이 규칙을 걸지 않는다」. `.cell`(`Table.module.css:91-98`)은 높이 · 행간 · padding · border · vertical-align만 — 계획 서술과 같다.
- `/projects`: `projects-table.tsx:141-145` = `span.nameCell` > `Link.link`(`projects.module.css:134-139` — display 지정 없음 = inline), `.nameCell`은 `display: block`(:301-306), 폰 :310-314 `min-width: 5em`. 18:279 (바) 세 줄(overflow · text-overflow · white-space)로 `.nameCell`이 말줄임 상자가 된다 — tsx 수정 불필요 주장 맞음. 경계: frontmatter :19 · Task 2 files :251 · :238 `grep -vxF` 예외 · :301 diff가 세 줄 + 만인지 · :349 Task 3 diff 0 목록에서 뺌. 서로 모순 없음.
- 합성 재현(320 · 실제 DOM 아님):

| 꼴 | 표 폭 | 말줄임 상자 · 폭 | 줄 | 판정 |
|---|---|---|---|---|
| 감싸개 + 글자(행 시트 표) | 288 | 감싸개 77 · 잘림 | 1 | 정상 |
| 글자 칸 둘 + 숫자 칸 | 288 | 77 · 77 둘 다 잘림 | 1 | 정상 |
| 짧은 글자 `짧은` | 288 | 감싸개 99(≥ 5em 75) | 1 | 5em 바닥 먹음 |
| `/projects` 감싸개 > `.nameCell`(세 줄 더함) > inline 링크 | 288 | `.nameCell` 86 · ellipsis · 잘림 | 1 | 정상 |
| 같은 꼴, 세 줄 없음(지금 CSS) | 288 | 감싸개만 ellipsis(안 block이라 「…」 안 닿음 — V10 재확인) | 1 | 세 줄이 필요함 확인 |
| 발행 요청 감싸개 > `.projectLink`(격자) > `.clip` | 288 | `.clip` 91 | 1 | 붕괴 없음(> 5em) |
| `/expenses` 감싸개 > `.titleCell` > `.link` | 288 | `.link` 86 | 1 | 중첩 정상 |
| 결재함 감싸개(`:has(button)`로 빠짐) > span > `button.rowTap`(자기 CSS `inbox-table.module.css:111-119`) | 288 | rowTap 113 | 1 | 정상 |
| 결재함 감싸개(규칙 받음) > span > `Link.rowLink`(자기 width 0 규칙) | 288 | rowLink 113 | 1 | 중첩 정상 |
| 접힌 줄 colSpan 감싸개 | 288 폭 안 | 280 · 잘림 | 1 | 정상 |

- `:not(:has(button))` 판별: 폰에서 대상 표 P1 칸에 버튼 꼴 링크가 없다 — `paid-list.tsx:73-74` · `payment-targets-table.tsx:985-986` `evidenceAction`은 `phone`이면 null, 행동 열은 `headerHidden`이라 감싸개 자체가 없다(:209 ⓐ). 판별에 걸리는 것은 결재함 `button.rowTap`(`inbox-table.tsx:123-130`)뿐이고 자기 CSS가 같은 꼴을 이미 가져 정상(위 표). 행 링크 표의 `a[data-row-link]`는 버튼이 아니라 규칙을 받고, `::after` 누름 면은 기준 상자가 `tbody`(`Table.module.css:467-475` `.rowLinkGroup` relative) · `tr`(`leave.module.css:116-124`)라 감싸개 `overflow: hidden`에 잘리지 않는다.

### B-R2 판독기 경로 — 해결
- 18:277 (라): `Table.tsx:1168` 조건을 「`onRowTap`도 없고 그 줄에 `secondaryText` 글자도 없을 때만 `aria-hidden`」(줄 단위). 근거 서술(`issue-request-table.tsx:225-227` · `project-detail.module.css:306-311`)을 사실대로 적음. behavior :266 끝(지급 완료 · 발행 요청 접힌 줄 `aria-hidden` 없음 · 프로젝트 목록은 그대로) · 점검표 :304 · Task 2 files에 Table.tsx 있음. PC는 접힌 줄 `display: none`이라 두 번 안 읽힘 — 맞음.

## (2) 바뀐 줄의 새 모순 · 규칙 위반 — 막음 0, 참고 7

- R2-1 18:243 인수 기준 「접힌 줄 칸 고유 폭 처리(`width: 0` / `max-width: 0` 중 고른 것)」는 td 규칙 시절 문장이 남은 것이다 — :209 ⓑ 「td 규칙 0 · 감싸개에 width 0」과 어긋나 보인다. 「접힌 줄 감싸개 `width: 0`」으로 한 줄 고치기 권장.
- R2-2 18:209 ⓑ 선택자 대상이 「데이터 행 `[data-cell-text]`」인데 ⓐ가 감싸는 접힌 줄 감싸개도 받는지 문장이 없다. 지금 `.collapsedCell`(`Table.module.css:373-378` · :482)엔 말줄임이 없어서, 감싸개가 규칙을 안 받으면 「접힌 줄 줄 수 ≤ 1」(:184 · :266)이 긴 P2 값에서 깨진다. 「접힌 줄 감싸개도 같은 규칙(그룹 머리글 · 합계 · EMPTY 제외)」을 명시하기 권장. 결재함 접힌 줄 `button.foldTap`은 `:has(button)`로 빠져 지금 그대로다(회귀 줄이 잡는다).
- R2-3 :209 ⓑ 「버튼 꼴 링크 칸 감싸개 computed `overflow`가 `visible`인지 확인하고 아니면 점검표」 — 규칙에 걸리는 감싸개는 늘 `hidden`이라 이 검사는 결국 「점검표에 적기」뿐이다. 폰 대상 P1 칸에 그런 링크가 지금 0이라(위) 실해 없음. 문장만 「있으면 점검표」로 줄여도 된다.
- R2-4 합성 재현: 글자 칸 하나(5em 바닥 75) + nowrap 숫자 칸 둘(`1,234,567,890` · `2026-10-27`)이면 표 296 > 288. 픽스처 값에 기대는 P3(:466) 그대로다. 그때 :184 `scrollWidth ≤ innerWidth` 단언(문서 기준이라 body 여백 16이 흡수하면 통과)과 「표 면 288」 판정이 갈릴 수 있다 — 점검표 표 폭 열로 `/design-review`가 보는 지금 길이면 충분.
- R2-5 :238 「화면별 CSS 예외는 0」 바로 앞에 `projects.module.css` 예외가 있어 문장이 서로 어긋나 읽힌다. 내용은 규칙 위반이 아니다 — 안쪽 block 칸이 자기 말줄임을 갖는 꼴은 이미 `expenses.module.css:187-197` · `inbox-table.module.css:111-119` · `issue-requests.module.css:21-26`에 있고, 결과 규칙(폰 한 줄 말줄임)은 공용 하나라 「화면 하나만 예외」(frontend.md:14)가 아니다. 「폰 행 규칙의 화면별 예외 0 — `.nameCell` 세 줄은 안쪽 block 칸 꼴 맞춤」으로 고치기 권장.
- R2-6 B-R1 PC 모양: 메모가 `.statusLine` gap `--s-2`(`project-detail.module.css:8-13`)에서 `.cellSecondary` `margin-top: --s-1`(`Table.module.css:151-152`)로 바뀌어 태그와 메모 사이가 좁아진다. 다른 표의 셀 아래 줄과 같은 꼴이 되므로 `/design-review` 판정거리(새 값 0).
- R2-7 :209 ⓐ 감싸개는 `Table`을 쓰는 모든 표(PC · 표지 없는 표 포함)의 글자 칸 DOM에 `div` 한 겹을 더한다. `td > a` 같은 바로 자식 선택자 시험이 있으면 PC에서 깨질 수 있는데, 로컬 실행은 폰 375 전체(:224 ⑥)뿐이고 PC는 CI 몫이다. 실행 불가는 아니다(CI가 잡는다). 확인하지 않았다 — `grep -rn "td >" test/e2e` 같은 grep 한 줄을 read_first에 두면 좋다.

## 다른 플랜 바뀐 줄(01 · 02 · 04 · 05 · 09 · 14 · 15 · 16 · 19)
- 새 문구 · 새 토큰 · 새 클래스 · 주 버튼 둘 · 44 미만은 grep으로 찾지 못했다. 02 PickDialog.module.css :344 `height: auto` + `max-height: var(--sheet-max-h)`는 SYSTEM :1066 「높이 내용 따라 최대」와 맞다. 14 본부 Select 즉시 저장 · 안내 글자 0은 §7 원칙과 맞다. 09 `후보 {N}` · 02 `저장할 수 없음 —` 접두는 「바꾸지 않음 + /design-review 판정」으로 닫혔다(1회차 참고 그대로). 19는 18 B-R1과 같은 파일이지만 웨이브 6 · depends_on 07.1-18이라 겹치지 않는다.
