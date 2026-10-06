# 06-06 지출결의 문서 화면 「증빙」 섹션 확인부(S4) — 증빙 금액 · 확인 줄 · 1차 `증빙 확인`(P2 · P5) · 금액 고쳐 확인 · 빈 금액(F2) · 초과 한 줄(Q-F) — 점검표
화면: app/(app)/expenses/[id]/evidence-review-section.tsx, app/(app)/expenses/[id]/expense-document.tsx, app/(app)/expenses/[id]/payment-action-row.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-3(제출 뒤 문서 화면 · SP-3 제자리 편집) · §7-5(상태 태그 — 표 · 값 칸은 text 변형) · §7-10 · §7-15 · UI-SPEC S4 · 「지출결의 상태 → 1차」 P2 · P5 · Copywriting 「표시 — 증빙 금액」 · 「표시 — 증빙 확인 결과」 · 「Error — 증빙 금액 칸」 · 「거부 — 문서 화면 응답 없음」

지금 화면(착수 전, 06-04): 증빙 섹션은 05 첨부 영역뿐이라 증빙 금액 · 확인 여부가 보이지 않는다. 증빙이 있는 결재 통과 문서도 1차가 곧바로 `지급 완료`라 확인 없이 지급된다(O-2 미반영). 패널 상태(PaymentPanelProvider)는 지급 섹션만 감싼다.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 값 낱말(상태 다섯 · `—`)과 2행 사실(입력한 사람 · 날, 확인한 사람 · 시각 · `{전} → {새}`), 지급 권한 없는 사람의 담당 표기 `확인은 경영관리`(UI-SPEC S4 「기안자·PM」 원문)뿐이다. 오류는 「Error — 증빙 금액 칸」 원문 넷(action-row.ts · tax-inclusive.ts 상수)과 `결과를 받지 못함 · 새로 고침`(행동 줄 이유 자리) — 설명문 · 도움말 0
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 금액 칸을 열면 지금 증빙 금액이 들어 있고(빈 금액이면 빈 칸 — 승인액을 몰래 채우지 않는다, F2), 부가세 · 지급 총액 · 초과 차액은 서버(`previewPayable` · `evidenceOverrunLine`)만 셈한다. 확인 상태는 서버 `resolveEvidenceStatus` 하나, 다음 1차는 응답 뒤 다시 읽은 행(`resolveExpenseActionRow`)이 정한다 — 화면은 상태로 1차를 고르지 않는다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 1차 `증빙 확인`과 3차 `바꾸기`는 지급 권한자의 P2 · P5(`확인 전`)에만 선다. 확인됨 · 면제 · 선결제 · 증빙 없음, 지급 권한 없는 사람 · 대표에게는 버튼 요소 0(값 + 2행만). 빈 금액(F2)이면 1차는 aria-disabled + 이유 `증빙 금액 없음`(Button disabledReason — 숨기지 않고 왜 막혔는지 보인다)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 확인부에 저장 버튼 없음 — 고친 금액과 확인은 행동 줄 1차 `증빙 확인 Ctrl+Enter` 하나가 함께 보낸다(SP-3 ①). P2에서 `지급 완료`는 그 자리에 없다(E2E 트레이서 toHaveCount(0)), 확인 뒤 응답 행이 P4가 되어야 1차가 `지급 완료`로 바뀐다
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 확인은 다시 확인 · 06-11 확인 풀림으로 되돌릴 수 있어 확인 모달 없음(UI-SPEC 「제자리 편집」). P5의 2차 `지급 취소`는 06-04 그대로 행동 줄 오른쪽 끝(`secondaryWrap` margin-left auto) · ConfirmDialog
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 확인 줄은 라벨 `확인` + 값 낱말 하나, 2행은 사람 · 시각 · 금액 전후만(낱말을 되풀이하지 않는다). 증빙 금액 2행은 입력한 사람 · 날만. 증빙 필수 off의 증빙 없음은 낱말 대신 `—`(UI-SPEC rev 10)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 화면 상태 없음(확인부는 결재 통과 문서의 증빙 섹션 안에만). 값 없음은 `—`, 빈 금액(F2)은 설명 대신 열린 칸이 첫 포커스
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 1차 `증빙 확인`은 Ctrl+Enter(06-03 행동 줄 키 그대로, 자동 반복 keydown은 무시 — M-3). 확인 뒤 포커스는 이체액 칸(M-3 — 입력 → 1차 흐름), P5면 결과 글자. 금액 칸 `Enter`는 제출 막음 · `Esc`는 서버 값으로 되돌리고 닫은 뒤 3차 `바꾸기`로 포커스
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 3차 `바꾸기`는 05 지출결의 폼 · 06-04 `지급 예정일 바꾸기`와 같은 `valueRow` + `fill` + Button tertiary, 금액 칸은 이체액 칸과 같은 `useCommaInput("krw")` · `textInput numeric` · Form.Field width="short"(`--field-w-short`) · Form.Hint · Form.Error

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 새 틀 없이 문서 화면 증빙 섹션 안 KvList 두 행 + `Form` 단일 칸 — 입력 칸 높이 `--field-h`(② 40) · 칸 폭 `--field-w-short` 그대로. 상태는 §7-5 StatusTag text 변형(⑤ 상태 배지 고정 — 태그 색은 status-map.ts 한 표)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 새 CSS 파일 · 새 클래스 0 — `expense.module.css` 기존 클래스(subLine · muted · valueRow · fill · textInput · numeric · taxLine · taxSegment · stale)와 `ui/num` Num · `ui/status-tag` StatusTag만. `git diff --stat -- '*.css' docs/design/tokens.css` 0줄
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 2행 숫자 묶음은 `taxSegment`(nowrap) 사이 ` · `에서만 꺾이고, 1차는 06-03 행동 줄(폰 고정 · 44px) 그대로. 독립 DOM 감사(CI=true · 375 · 320)를 오케스트레이터 항목으로 SUMMARY에 넘긴다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(사유 — 오케스트레이터 지시 「시각 기준 사진을 로컬에서 만들지 않는다」 · CLAUDE.md §6 「스크린샷 육안 판정 금지」). CI=true 프로덕션 빌드 E2E(payment-single)가 실제 화면에서 확인 줄 · 2행 · 1차 전환 · 포커스를 단언했고, 독립 DOM 감사 항목을 SUMMARY에 넘겼다
