# Codex 디자인 검토

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).
> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.

- Codex 실행: 완료(exit 0)
- diff 기준: origin/main...HEAD
- 경로: `/approvals` · `/admin/vendors` · `/dev/components` — 캡처 하네스가 시드 없이 닿는 경로뿐이라 05-05 화면(`/expenses/[id]` · 견적 줄 표)은 아래 시드 상태 캡처로 따로 쟀다
- 산출물(스크린샷·measurements.json): `test-results/codex-design-review/20261004-120845-30987`(사본: 노트 `05-review/wave6/branch-codex/`)
- Codex 원문(비밀 가림, 커밋 안 함): `test-results/codex-design-review/20261004-120845-30987/codex-output.md`

## 지적 후보

| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |
|---|---|---|---|---|---|---|---|---|
| 1 | /admin/vendors | 320 | #main-content › div.ListScreen-module__ciqCrG__screen › div.ListScreen-module__ciqCrG__bar | visual | 목록 행동 줄에 '숨김 포함'만 있고 1차 버튼은 0개다. 유일한 '거래처 등록'은 아래 EMPTY 줄의 2차 버튼이다. | §6-1·§7-1: 목록 필터 줄 오른쪽 끝에 '{대상} 등록' 1차 버튼 1개 | 시각 지적 — 실측 필요 | 실측: 빈 목록 — 머리 1차 0개, 빈 화면 버튼 「거래처 등록」 93×44. SYSTEM §7-7 :972-973 · §7-20 :1271(DR5 A) 「빈 목록이면 머리 1차를 숨기고 빈 화면 버튼 하나가 등록을 맡는다」. 이 브랜치가 바꾸지 않은 경로, main 같은 값 → **NOT-A-DEFECT · 05-05 밖** |
| 2 | /admin/vendors | 375 | (1과 같음) | visual | (1과 같음) | (1과 같음) | 시각 지적 — 실측 필요 | 1과 한 건 → **NOT-A-DEFECT** |
| 3 | /admin/vendors | 768 | (1과 같음) | visual | (1과 같음) | §6-0 · §6-1 · §7-1 | 시각 지적 — 실측 필요 | 1과 한 건 → **NOT-A-DEFECT** |
| 4 | /admin/vendors | 1280 | (1과 같음) | visual | (1과 같음) | §6-1 · §7-1 | 시각 지적 — 실측 필요 | 1과 한 건 → **NOT-A-DEFECT** |

## 웨이브 6(05-05) 판정 — 2026-10-04, DOM 실측만

브랜치 d0f47792 · main 55647a0b, 모두 `CI=true` 프로덕션 빌드. 시드 상태 캡처(375×667 · 320×568 · 768×1024 · 1280×900): 폼 작성 중 · 바닥까지 스크롤 · 올리는 중(PUT 붙듦) · 첨부됨 · 올리기 실패 행 · 문서(기안자 · 결재자) · 견적 줄 표 · PC 행 행동 실패 · 폰 행 시트(일반 · 최악 · 제출된 줄 · 거래처 없음 · 최악+실패) · 결재함 · 결재 시트. 회귀: `/admin/vendors`(빈 · 시드) · `/admin/people` · `/projects/[id]`(관리자 · PM) 브랜치 대 main. 증거: 노트 `05-review/wave6/`(README · measurements-summary.txt · regression-branch-vs-main.txt).

| # | 판정 | 화면 · 폭 | 실측 | 원인 | 고칠 방향 |
|---|---|---|---|---|---|
| D1 | DEFECT(다듬기) | 폼 · 문서 파일 행, 4폭 | 썸네일 48×48 radius 6px | `ui/attachments/Attachments.module.css:71` `.thumb` `--radius-control` — SYSTEM §7-10 :1031 「48px 정사각, radius 0」 | radius 없앰 |
| D2 | DEFECT(다듬기) | 폼 빈 첨부 영역, 4폭 | 글자 14px(PC) · 15px(폰) | `Attachments.module.css:23` · 폰 `:135` `--text-body` — SYSTEM §7-10 :1030 `--text-aux`(13) | `--text-aux`, 폰 덮어쓰기 삭제 |
| D3 | DEFECT | 견적 줄 표 768 · 1280 | 만들기 실패 뒤 행동 열 104→136/142, 비고 296→276, 왼쪽 열 전부 이동(th 행동 x 1155→1117), 실패 글자 두 줄(118×39) | `app/(app)/projects/[id]/quote-table.tsx:2013-2017` 셀 안 `<p role="status">` — UI-SPEC S1 :356 · Copywriting :290 「합계 행 오른쪽 한 줄」(DR-16) | 실패 글자를 합계 행 상태 한 줄로 |
| D4 | DEFECT(접근성) | 견적 줄 표 768 · 1280 | 행 행동 버튼 aria-describedby 6/6 없음 — 같은 이름 「지출결의 올리기」 다섯 개 | `quote-table.tsx:2009` `RowAction`에 `describedBy` 안 넘김 — UI-SPEC S1 접근성 「그 줄 항목 칸 id」 | 항목 칸 id를 `describedBy`로 |
| D5 | DEFECT | 문서 화면 375 · 320 | 「프로젝트」 3차 링크 156×18 · 154×18(< --touch-min 44) | `app/(app)/expenses/[id]/expense-document.tsx:67` `styles.link`(`expense.module.css:88`) — SYSTEM :231 폰 3차 44 | `buttonLinkClassName("tertiary")` |
| D6 | DEFECT | 폼 375 · 320 | 분할 지급 체크박스 13×13(라벨 343×21) | `expense-form.tsx:360`, `expense.module.css`에 폰 규칙 없음 — 선례 `admin/field-definitions/field-definitions.module.css:126` | 폰 체크박스 `--touch-min` 정사각 |

기대대로(E): E1 모든 상태 · 폭 가로 넘침 0 · 화면 밖 요소 0, 쓰인 색 · radius · 서체 · 글자 크기 모두 tokens.css 변수 값(172개 해석). E2 폰 고정 제출 줄 — 아래끝 = 하단 탭 위끝, 2차 110 왼쪽 · 1차 221 오른쪽, 높이 44, kbd 없음, 바닥 스크롤에서 결재선 아래끝 459 < 제출 줄 위끝 553(올리는 중 102 높이에서도 459 < 520). E3 올리는 중 1차 aria-disabled + describedby `expense-blocked`(4폭), 끝나면 풀림. E4 빈 첨부 영역 480×96 / 폰 전폭×72, 1px dashed `--border-control` · `--surface-muted` · radius 8, 「하나 더」 높이 44. E5 실패 행 `--status-danger-weak` + inset 2px, `다시 올리기` · `지우기` 폰 44 · describedby = 파일명 id(새 `RowAction describedBy`), 완료 행 `크게 보기` · `삭제`(danger) 폰 44. E6 행동 열 머리글 숨김(th w104) · 버튼 nowrap 80×21 · 제출된 줄 `지출결의 열기` 링크 · 거래처 없음 · 취소 줄 빈 칸 · 폰에 열 없음. E7 폰 행 시트 3차 109×44가 일반 줄에서 스크롤 없이 보임(375 y599 · 320 y500), 실패 줄은 3차 위 8px(--s-2) · 두 번째 버튼 없음, 최악 줄 320×568은 본문 스크롤 필요(U2 신호는 일반 줄 기준이라 해당 없음). E8 결재 시트 상세 9행 · dt 폰 84 / PC 96 · `문서 화면 열기` 44. E9 문서 화면 행동 줄은 연차 DocumentActions 그대로(폰 반려 109 왼쪽 · 승인 218 오른쪽). E10 회귀 — `/admin/vendors`(빈 · 시드) · `/admin/people`은 main과 같음(무작위 이름 차이뿐), `/projects/[id]`는 새 행동 열만 — 768에서 항목 199→145 · 거래처 180→136으로 긴 이름이 꺾여 아래 내용이 62px 내려감, 넘침 없음(UI-SPEC S1 「700~1023에서도 열은 숨지 않는다」).

참고(N): N1 loading.tsx · error.tsx는 찍지 못함(300ms 지연 뼈대 · 프로덕션 빌드에서 서버 오류를 낼 길 없음). N2 뒤 플랜 몫은 판정 안 함 — 결재 시트 증빙 썸네일 72×96, 결재 중 기안자 「하나 더」, `거래처 고르기` 3차, `Ctrl+E`, 견적 줄 `지출결의 중` 태그(05-15). N3 결재함 폰 접힌 줄 `기안 · MM-DD` 탭 94×21은 결재함 표 것(05-05 아님). N4 폰 폼 입력 · select 높이 40 = §7-2. N5 긴 파일명은 픽스처 이름이 짧아 재지 못함.

05-05가 만든 화면 결함 6건(D1–D6), 트레이서 흐름을 막는 것은 없다.
