# 06-15 지급 대상(S1) · 일괄 지급 모달(S2) — 점검표
화면: app/(app)/expenses/(list)/page.tsx, app/(app)/expenses/payment-targets-table.tsx, app/(app)/expenses/batch-payment-dialog.tsx, app/(app)/expenses/status-filter.tsx, app/(app)/expenses/expenses.module.css, app/(app)/expenses/list-columns.ts
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-1 목록 · §7-3 편집 표 · §7-7 로딩 · 오류 · §7-17 확인 모달 · 06-UI-SPEC S1 · S2

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 UI-SPEC 문구 그대로 — 빈 화면 두 줄(`지급할 건이 없습니다` · `조건에 맞는 건이 없습니다` — 05 빈 화면 꼴), 로드 오류 `지급 대상 불러오지 못함`, 모달 결과 줄(`견적 줄 N줄 잠김` · `선결제 N건 · 증빙 기한 지급일부터 N일` — 되돌릴 수 없는 일), 칸 오류 05 `DATE_FORMAT_ERROR`, 막힌 행 이유(서버 문구 그대로). 설명 문단 없음
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 지급 권한자의 `/expenses` 기본 보기가 지급 대상, 지급일 기본 오늘(KST), 지급 총액 · 합계는 서버 계산(입력 칸 없음), 이체액은 지급 총액 그대로(편집은 06-17)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 고를 수 없는 행의 선택 칸은 `aria-disabled` + 이유 글자(서버 판정 `selectable`), 지급 권한 없는 사람에게 `지급 대상` 보기 값 없음, 1024 미만은 선택 칸 · 1차 없음, 증빙 select는 서버 열거(`PAYMENT_EVIDENCE_FILTERS`)만
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 머리 1차 `지급 완료 N` 하나(0건이면 비활성 + `고른 건 없음`), 모달 1차 `지급 완료 N건` 하나
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 해당 없음 — 지급은 확인 모달(ConfirmDialog, 결과 줄)로 한 번 더 거르고 삭제 · 취소 동작은 더하지 않았다
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 막힌 행 이유 줄은 선택 칸 이유와 같은 글자면 그리지 않는다(`blockedReason`이 null), 결과 글자는 필터 줄 한 자리(`aria-live`)에만, 토스트 없음
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 0건은 `지급 완료 보기` 버튼 하나 · 필터 0건은 `필터 지우기` 하나, 둘 다 합계 · 선택 열 · 1차 없음(DR5)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 표 `enableGridKeyboard`(Tab · 방향키 · Space 고르기 · Esc), 머리 1차 · 모달 1차 `Ctrl+Enter`(06-29 Table.selection `onPrimary`), 필터 select는 바꾸면 바로 제출(05 `requestSubmit`)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 행 → 문서 화면은 링크(`data-row-link`, 05 목록과 같음), 처리 행동은 버튼. 빈 화면 두 행동(`지급 완료 보기` · `필터 지우기`)은 05 `ListEmpty`의 onClick 갈래 — 같은 2차 버튼 모양이고, 같은 경로(`/expenses?…`) 링크는 Next 프리페치 응답이 닫히지 않아(실측) 링크 대신 router.push(SUMMARY 편차 · 질문 후보)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 확인 모달 = 끝내야 하는 한 건(§1 팝업 · 모달 · 패널 구분), 모달 폭 05 ConfirmDialog 그대로(UQ-6 480), 입력 칸 높이 05 `.textInput` 값 복사(②), 폰 1차는 숨김(④ 필터 아래 자리에 1차 없음 — 보기 전용), 합계 글자 14 굵게(⑥ `--text-body` · `--fw-bold`), 상태는 05 StatusTag(⑤)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `expenses.module.css` 추가는 `.dateInput`(05 `.textInput` 값 복사) · `.batchResult` · `.batchDone`(`--status-success`) · `.batchBlocked`(`--status-danger`)뿐, 옛 토큰 grep 0, `tokens.css` diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 700 미만은 05 `phoneRowLink` 행 링크 그대로, 1024 미만은 선택 · 1차를 그리지 않는다. 필터 폼에 `max-width: 100%`(projects `.filterFields` 선례 — 긴 팀 이름 select가 320에서 넘치던 것을 `mobile-320-no-overflow`가 잡아 고침). E2E 「좁은 폭」(800 · 390) 녹색, 320 넘침은 05 `mobile-320-no-overflow` · `mobile-expense-320` 회귀 스펙으로 확인 — 4폭 실측은 독립 DOM 감사 몫
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 실행자는 `CI=true` 빌드 E2E의 DOM 단언(1280 · 800 · 390)으로 확인했다. 촬영 · 375 · 320 · 768 · 1280 판정은 독립 DOM 감사와 오케스트레이터 `/design-review`(SUMMARY 「캡처·GPT 검사 대상 경로」) 몫
