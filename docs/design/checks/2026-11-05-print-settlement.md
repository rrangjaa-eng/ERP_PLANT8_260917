# 프로젝트 정산서 인쇄 · 정산 결재 화면 「인쇄」 입구 — 점검표
화면: app/print/settlements/, app/print/settlements/[id]/settlement.module.css, app/(app)/projects/[id]/settlement/page.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-6 (인쇄 템플릿) · 07.4-UI-SPEC.md P3 · 입구 E3

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 종이에는 설명문이 없다(라벨 · 값 · 절 제목 · 결재란뿐). 계산 불가 칸의 「계산 불가 · {이유}」는 값 자리의 상태 글자(SYSTEM §2-4 :197)이고 손익을 못 보면 절째 없다(안내 문장 없음). 오류 경계 · 준비 전 한 줄 · 404는 지출결의서 · 연차와 같은 공용 컴포넌트다. 입구 「인쇄」는 라벨 한 낱말이다
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 열면 자동으로 인쇄 창이 뜨고(07.4-01 갈래 A) 두 합 · 손익 네 칸 · 두 목록 · 결재란은 모두 서버가 정한다(손익은 화면과 같은 SQL 값, 종이에서 다시 세지 않음). 사용자가 고를 것은 프린터뿐이다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 결재 인스턴스가 없으면 「인쇄」 링크를 만들지 않고(`view?.instanceId`), 폰(<700)에서는 PcOnly가 CSS로 숨긴다. 손익 · 금액 열 · 금액 행은 권한이 없으면 DOM에 없다(감사 단언 8 · F-NoExp)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 인쇄 라우트 화면 바의 1차는 「인쇄 · PDF 저장」 하나(07.4-01 PrintBar 그대로). 정산 결재 화면의 1차(승인 · 반려 행동 줄)는 그대로이고 「인쇄」는 머리 줄 2차다
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 위험 동작 추가 0
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 기안자는 결재란 첫 칸 「기안」에만, 상태 글자는 번호 줄에만 있다(감사 단언 6 — 1개). 프로젝트 이름은 머리 「프로젝트」 행에만 두고 지출결의 행 항목에서 뺀다. 합계 행을 두지 않아 「실행가 합」과 겹치지 않는다(「합계」 0)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 404는 공용 PrintNotFound(「페이지 찾을 수 없음」 + 「첫 화면으로」). 목록 0행은 절 제목 아래 「—」 한 줄(UI-SPEC P3 empty — 종이라 행동 버튼이 없다, E2E 0행 사례)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 화면 바는 버튼 둘(닫기 → 인쇄 · PDF 저장)이고 종이는 읽기 전용이다. 입구는 링크 하나(Tab · Enter)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 입구 「인쇄」는 이동 링크이고 지출결의 · 연차 상세와 같은 2차 버튼 클래스(btn secondary) · 같은 PcOnly 꼴을 쓴다

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 종이 바탕 · 화면 바탕은 07.4-01 공용 틀(기존 토큰)이고 새 면 · 팝업 · 패널 없음. 결재권자 없는 단계 칸 숨김(사용자 결정 2026-11-05)은 공용 toApprovalBoxes 그대로 따른다. 구매 요청 범위는 사용자 카드 Q5 「구매 요청 목록 화면과 같게」 그대로

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 정산서 전용 CSS module은 `app/print/settlements/[id]/settlement.module.css` 하나이고 `.lists td { font-size: 12px }` 한 규칙뿐이다(감사 D1 — UI-SPEC 「표 본문(정산서 목록은 12)」, 글자 px는 app/print/** 인쇄 영구 예외 · 공용 틀 12px와 같은 값). 색 · font-family · radius 리터럴 0(감사 단언 14, `stylelint app/print/**/*.css` 0). 금액 블록 · 손익 칸은 07.4-01 틀 CSS의 `.amountBlock` · `.metric*`를 그대로 쓰고 공용 틀(`app/print/_frame/**`)을 고치지 않았다(`git diff origin/main...HEAD -- app/print/_frame/` 빈 출력)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 종이는 210mm 고정 가로 스크롤(scrollWidth 794, 320 · 375 · 700 · 768)이 SYSTEM §6-6 · UI-SPEC:583 규정이고 화면 바 1차 right ≤ clientWidth(감사 단언 16, 320 · 375 · 700 · 768 · 1280). 입구는 375 · 320에서 접근성 트리 0 · `.head` 높이 = 첫 자식 높이(57.98 = 57.98 · 86.58 = 86.58)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: `test-results/design-capture-07.4-03/`(캡처 스펙 design-capture-07.4-03) — 판정은 스크린샷 육안이 아니라 measurements json의 DOM 실측과 독립 DOM 감사(CLAUDE.md §6)

## 독립 DOM 감사 (Task 3 ④ · ⑤)
- 보고서: `/mnt/project-files/07.4-review/exec/07.4-03-dom-audit.md` (gsd-ui-auditor, Opus, `CI=true` 프로덕션 빌드 · HEAD 2fd732f9 — 계산 스타일 · 상자 · ariaSnapshot · DB action_log · `page.pdf()` + `pdftotext -layout` 쪽별 글자, 스크린샷 육안 판정 없음)
- 결과: UI-SPEC DOM 단언 1~19 중 해당 단언 전부 통과(1 · 9는 공용 틀 몫으로 07.4-01 · 02 판정, 17은 단위 시험 근거). P3 결함 2(D1 · D2) → 고침. F-S1 1쪽 진실은 계획 가정 오류로 판정(아래).

| 단언 | 폭 | 판정 |
|---|---|---|
| 2 종이 · 바 · 3 색 · 4 border 구조선 · 5 라벨 · 6 상태 글자 · 7 결재란(F-S1 2칸 · F-S3 5칸 data-cols=5) · 8 pnl 없음 · 12 404 · 13 회색조 · 14 리터럴 · 15 확인증 · 16 화면 바 · 18 쪽 나눔 · 19 caption | 1280 · 768 · 700 · 375 · 320 + print A4 | 통과 |
| 10 F-S3 PDF(pdftotext) · 11 입구 | print · 1280 · 768 · 700 · 375 · 320 | 통과 |
| 17 계산 불가 | — | 통과(test/unit/print/profit-cells.test.ts 5/5) |
| P3 표 행 글자 12px | print · 1280 | D1 → 고침 |
| P3 보조 줄 | print PDF | D2 → 고침 |
| P3 populated 1쪽(F-S1) | print PDF | 계획 가정 오류(c) — 아래 |
| 세 서류 같은 틀(머리 47.2 · 제목 mt 48 · 괘선 2px rgb(0,84,70) · dl 행 39.4 avoid · 결재 section 106) | print A4 | 통과 |

## 고친 것
- **D1** 두 목록 td 14px(.root 상속) → 12px: `page.tsx`가 두 절을 `settlementStyles.lists`로 감싸고 `settlement.module.css .lists td { font-size: 12px }`. 공용 PrintTable · 틀 CSS 그대로. E2E print-settlement F-S1이 print 미디어 td 계산 font-size 집합 = ["12px"]를 단언한다.
- **D2** 구매 완료 보조 줄 「카드 사용 11-」/「05 · 99,000」 끊김 → 사용일 MM-DD를 `styles.num`(nowrap)으로 감쌌다. E2E가 사용일 span `getClientRects().length` = 1을 단언하고, 다시 찍은 F-S1 PDF 글자는 「카드 사용」/「11-05 ·」/「99,000」(날짜가 한 덩어리).
- 고친 뒤 재실행(`CI=true --no-deps`): desktop print-settlement 8 + mobile-375 mobile-print-entry 13 = 21 passed, 캡처 스펙 단독 5 passed.

## F-S1 쪽 수 판정 — 사용자 카드 대기(추천: 여러 쪽 허용)
- 감사 판정 (c): 계획 진실 「F-S1 1쪽」(PLAN:72 · UI-SPEC:495)의 가정이 틀렸다. 공용 틀의 세로 리듬(제목 위 48 · 절 간격 32 × 4 · 결재란 106 · dl 행 39.4 — 표를 빼고 약 739px)이 A4 본문 약 964px의 대부분을 차지해 정산서 페이지만으로는 1쪽에 넣을 수 없다(공용 틀 변경이나 서류별 예외가 필요 — 범위 밖, 「화면 하나만 예외 금지」).
- 고친 뒤 실측: F-S1 article 1097.9px · PDF 2쪽(2쪽 = 결재란 덩어리), F-S2 992.1px · 2쪽. 넘칠 때 처리는 계약대로다(thead 반복 · tr 쪽 경계 0 · 결재란 덩어리 이동 · 바닥줄 1/2 · 2/2).
- 코드는 바꾸지 않았다. 추천안 「여러 쪽 허용 — 진실을 'F-S1은 1~2쪽, 넘치면 표 머리 반복 · 결재란 덩어리 이동'으로 고침」으로 진행 중이고 사용자 카드 답을 기다린다(계획 파일은 수동 편집하지 않는다).

## 캡처 · 측정
- 캡처 폴더: `test-results/design-capture-07.4-03/` (gitignored, 다음 Playwright 실행이 지운다) — 안정 사본 `/tmp/claude-0/-home-user-ERP-PLANT8-260917/395f17ea-3652-58fd-96e8-08c457a37ba8/scratchpad/design-capture-07.4-03/`. `state-<f-s1 | f-s2-no-pnl | f-s3-multipage | f-x-404 | settlement-entry>-<375 · 320 · 768 · 1280 · 700 · print>.png`, `state-<이름>.pdf`, `measurements-state-*.json`. 감사 증거는 `/tmp/claude-0/-home-user-ERP-PLANT8-260917/395f17ea-3652-58fd-96e8-08c457a37ba8/scratchpad/a03/`.
- F-S3 PDF 텍스트 실측(pdftotext -layout, D1 고친 뒤): 4쪽. 지출결의 표 머리 1 · 2 · 3쪽, 구매 요청 표 머리 3 · 4쪽, 결재란 「결재」 제목과 칸 라벨 다섯(기안 · 팀장 · 본부 책임자 · 본부 책임자 · 대표)이 모두 4쪽, 바닥줄 `PLANT8 ERP 1/4` ~ `4/4`. 감사 실측(고치기 전 5쪽)은 쪽 첫머리 이어진 줄 0 · 행 57개 중복 없음.
- backstop 1 (E3 입구 overflow): `/projects/{id}/settlement` 머리 줄 actions `scrollWidth 50 <= clientWidth 50` — 1280 · 768(700은 감사 단언 11 같은 판정, 375 · 320은 PcOnly로 actions display none).
- backstop 2 (P0 결재란 long-text): F-S3 5칸 칸 안 글자 상자 폭 ≤ 칸 폭 — 1280 112.7 ≤ 112.7, print 146 ≤ 146, 다섯 칸 모두 scrollWidth ≤ clientWidth(긴 이름 「기안담당남궁…」 포함).
- backstop 3 (P3 long-text): F-S3 첫 행 긴 항목 · 지급처 · 품목 셀 상자 폭 = 열 머리 폭(1280: 166.3/166.3 · 151.2/151.2 · 173.9/173.9), 모든 셀 scrollWidth ≤ clientWidth.
- backstop 4 (print-media 회색조): `filter: grayscale(1)`에서 번호 줄 「대표 결재 중」과 결재 칸 상태 글자 DOM 존재(감사 단언 13).
- backstop 5 (print-media 바닥줄): `page.pdf()` 텍스트에 「n / N」 — F-S1 `1/2` · `2/2`, F-S3 `1/4` ~ `4/4`.
- 결재권자가 없는 중간 단계 칸 숨김(사용자 결정 2026-11-05): F-S1(기본 결재선 대표 1단)은 2칸 · 4열, F-S3(4단계, 단계마다 결재권자)는 5칸 · 5열.

## 사람 확인 항목
- [x] 실제 흑백 프린터 · 「PDF로 저장」 출력은 기계 판정이 없어 사람 항목으로 넘겼다 — 근거: SUMMARY 「사람 확인 대기」에 계획 human-check(스테이징에서 지출결의서 · 연차 신청서 · 프로젝트 정산서(F-S3 여러 쪽 포함)를 1회씩 출력 — 결재란 처리자 · 일시 · 상태 글자가 색 없이 읽히고, 표 머리가 쪽마다 있고, 바닥줄 「n / N」이 찍히는지)를 그대로 옮겼고 `/gsd-verify-work`가 묻는다
