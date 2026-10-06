# 06-28 수정 — 종결 사유 칸 오류 연결(DOM 감사 관찰 ①) — 점검표
화면: app/(app)/expenses/[id]/close-expense-button.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-15(Form.Error) · §7-17(확인 모달) · UI-SPEC S23 · Copywriting 「Error — 사유 근거 칸」 · 06-28-PLAN ⑤(`Form.Error` id를 `primary.blockedBy`로)

지금 화면(착수 전): 사유 501자에서 1차 `종결`은 `aria-disabled` + 왼쪽 이유 `사유 500자 넘음 · 줄여 적기`로 막히지만, 사유 textarea에는 `aria-invalid` · `aria-describedby`가 없다(06-28 DOM 감사 관찰 ① — 둘 다 null). 칸을 읽는 보조 기술은 칸이 틀렸다는 사실을 듣지 못한다.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자 0. 500자 넘음은 05 상수 `사유 500자 넘음 · 줄여 적기`(messages.tooLong) 그대로이고 자리만 1차 왼쪽에서 칸 아래 `Form.Error`로 옮겼다(칸 오류는 칸 아래 — 04-24 `blockedBy` 선례 revision-dialogs.tsx 고객 승인일 칸)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 입력 칸 · 기본값 변화 없음(사유 한 칸 그대로)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 501자에서 1차는 `blockedBy`로 막힘(ConfirmDialog가 `disabled` 갈래 + Ctrl+Enter 무시) — E2E 「error — 사유 501자」가 aria-disabled · Ctrl+Enter 뒤 모달 유지를 단언
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 모달 1차 `종결` 하나 · 2차 `취소 Esc` 그대로(버튼 변화 없음)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 변화 없음 — S23 「붉은 버튼 없음 · 위험은 확인 모달이 가른다」 그대로. 오류 줄 색은 `Form.Error`(공용 `--status-danger` 오류 톤)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 500자 넘음은 칸 아래 한 자리만 — `blockedBy`일 때 ConfirmDialog는 1차 왼쪽 이유 자리에 다시 쓰지 않는다(ConfirmDialog.tsx `blockedBy` 주석). E2E가 320에서 보이는 같은 글자 노드 1개를 단언. 빈 사유는 지금처럼 1차 왼쪽 한 자리(UI-SPEC 「비면 … 왼쪽」, 칸은 aria-invalid 아님)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음(문서 화면 모달 칸 오류만)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 칸 포커스 · Ctrl+Enter · Esc 동작 그대로. 501자에서 Ctrl+Enter는 아무 일도 하지 않고(E2E), 500자로 줄이면 1차가 풀린다(E2E `aria-disabled` 없음)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 칸 오류는 `ui/form` `Form.Error`(다른 모달 칸 오류와 같은 컴포넌트), ui/ 변경 없음

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 모달 · 폭 480(UQ-6) · 행동 버튼 44(②) 그대로, 칸 아래 오류 한 줄만 더함

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: CSS 변경 0(`git diff --stat -- '*.css'` 0줄) — 공용 `Form.Error` 클래스와 기존 `decision-dialogs.module.css .reason`(textarea는 `.reason textarea` 자손 선택자로 그대로 꾸며진다)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: E2E 「error — 사유 501자」가 320×740에서 문서 `scrollWidth ≤ clientWidth`를 단언(CI=true 프로덕션 빌드 통과). 폰 시트 실측 E2E 「폰 375 · 320」 그대로 통과
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(사유 — CLAUDE.md §6 「스크린샷 육안 판정 금지」 · DOM 실측 판정). CI=true 프로덕션 빌드 E2E `expense-close.spec.ts` 11건이 textarea `aria-invalid="true"` · describedby 대상 글자 · 1차 막힘 · 320 넘침 0을 실측했다. 독립 DOM 감사 재측정은 다음 `/design-review` 몫
