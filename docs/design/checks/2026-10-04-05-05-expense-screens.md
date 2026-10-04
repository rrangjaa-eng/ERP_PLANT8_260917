# 05-05 지출결의 화면(폼 · 문서 · 증빙 첨부 · 견적 줄 행 행동) — 점검표
화면: app/(app)/expenses/, ui/attachments/, ui/row-actions/, ui/table/, app/(app)/projects/[id]/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-2 · §7-3 · §7-5 · 05-UI-SPEC S1 · S3 · S4 · S7

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 폼(`/expenses/[id]`)에 설명문 0개(증빙 빈 자리의 `파일을 끌어 놓거나 Ctrl+U · 이미지·PDF 10MB`는 첨부 열기 버튼의 라벨이고 UI-SPEC S4 문구다) — 문구는 잠김 이유(`증빙 올리는 중 · 잠시 뒤 제출`) · 실패(`올리지 못함 · 다시 올리기` · `제출 실패 · …` · `임시 저장 실패 · 다시 시도`) · 견적 줄 행 행동 실패(`지출결의 만들기 실패 · 다시 시도`)뿐이고 모두 명사형 한 줄(폼 PC 1280 촬영: scratchpad/shots/form-1280.png)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 거래처 · 증빙 종류(거래처 기본값) · 통화 · 공급가액(견적 줄 실행가) · 지급 방식이 `지출결의 올리기` 때 서버가 채워 열린다(E2E: 증빙 종류 `세금계산서` · 공급가액 `12,400,000` · 지급 방식 `계좌이체` 단언). 부가세 · 지급 총액 · 분할 안내는 서버 계산 한 줄(`부가세 10% … · 지급 총액 …`)이고 사용자가 고르지 않는다. 사진은 브라우저가 2000px JPEG로 줄이고 해시한다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 올리는 중이면 1차 `지출결의 제출`이 aria-disabled + 이유 글자(aria-describedby)로 막히고(E2E 단언), 행 행동 열은 서버가 권리 없는 사람에게 열째 보내지 않으며 거래처 없음 · 취소 줄 · 표 전체 게이트 줄은 셀이 비어 있다(스크린샷 project-1280.png — 5 · 6번 줄 셀 없음)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 폼 1차는 `지출결의 제출 Ctrl+Enter` 하나(2차 `임시 저장`, 3차 `크게 보기` · `하나 더`), 문서 화면은 서버가 준 행동 중 승인 쪽 하나가 1차, 견적 줄 행은 3차 `지출결의 올리기` 하나(form-1280.png · project-1280.png)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 증빙 행의 `삭제`는 `RowActions` danger라 DOM 맨 끝 · 위험 색이고(form-1280.png 우측 붉은 글자) 확인 창이 아니라 즉시 지움 + 문서 화면에서 사라짐(05-09가 되돌리기를 더한다)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 제목 줄에 항목명이 한 번, 견적 줄 KvList는 번호 · 이름 + 실행가 보조줄 한 번, 상태는 태그 하나(`작성 중` / `결재 중`)이고 번호는 메타 한 줄에만 있다(form-1280.png · doc-1280.png)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 증빙이 0개인 폼은 설명문 없이 첨부 열기 버튼 하나(라벨 `파일을 끌어 놓거나 Ctrl+U · 이미지·PDF 10MB` · 폰 `사진·파일 올리기 · …`)만 선다 — 파일이 생기면 `하나 더 · Ctrl+U`로 바뀐다(Attachments.tsx 빈 상태 분기). 견적 줄 표에 행동 열이 없는 사람은 열 자체가 없다
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 폼 `Ctrl+Enter` 제출 · `Ctrl+U` 파일 열기 · Tab 순서가 DOM 순서(입력 → 증빙 → 결재선 → 버튼), 행 행동 `지출결의 올리기`는 button이라 Tab · Enter로 눌린다. 격자 키보드는 그대로이고 행동 열은 읽기 칸이다(Enter가 편집을 열지 않음 — `isEditableCell` 거짓)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 견적 줄 행 행동 · 증빙 행 행동 모두 `ui/row-actions/RowActions`의 `RowAction`(이동이면 href 링크 `지출결의 열기`, 이동 아니면 button `지출결의 올리기`) — 새 컴포넌트 없음

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 견적 줄 표는 표 안 편집 그대로(열 하나만 맨 오른쪽에 읽기 칸으로 추가, 기존 열 · 키 처리 불변 — quote-table 스펙 166 통과), 폼은 한 건 문서 화면(`Form layout="page"`)이라 패널 결정과 충돌 없음, 색은 무채 바탕 + 딥그린 1차(스킨 A) 그대로, ⑤ 상태 배지 고정 · ② 입력 칸 40 · 행동 44 유지

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 새 CSS는 `expense.module.css` · `Attachments.module.css` · `project-detail.module.css`의 `.doorFailure` 한 규칙이고 모두 var(--s-*) · --text-* · --status-danger · --field-h 토큰만(`pnpm lint` stylelint 0 · `node scripts/design/mark-legacy.mjs --audit` 0건 위반 · tokens.css diff 0). DOM 실측 글자 크기 14 · 22 · 11 · 13px, 굵기 400 · 600 · 700(`/expenses/[id]` 폼 1280)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 폼 1280 · 375 모두 `scrollWidth > clientWidth` 거짓(실측 MEASURE-FORM overflowX=false · MEASURE-PHONE overflowX=false). 행 행동 열은 priority p3라 700 미만에서 숨고 폰 행 시트 3차는 Task 2(`--touch-min`)가 맡으며 `mobile-expense-form.spec.ts`가 320 · 375를 잰다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /tmp/claude-0/-home-user-ERP-PLANT8-260917/d4b5e379-6b93-5c35-ac06-7e0a58358f76/scratchpad/shots/{project-1280,form-1280,doc-1280,form-375}.png (`CI=true` 프로덕션 빌드 · 임시 촬영 스펙, 판정은 DOM 실측 우선)
