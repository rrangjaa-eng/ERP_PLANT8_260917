# 확인증 행사 화면(04.3-04 I1 · I2 · I3) — 점검표
화면: ui/table/Table.tsx, ui/table/types.ts, app/(app)/certs/events/, app/(app)/certs/events/[id]/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-1 · §6-2 · §7-1 · §7-3 · §7-7 · §7-15 · §7-17 · 04.3-UI-SPEC I1 · I2 · I3

> 첫 범위(커밋 6610d78): 04.3-04 Task 3 ⓪-b — `ui/table` 머리글 `<th>`에 선택 속성 `aria-describedby` 하나(더하기만, 삭제 0줄).
> 이번 범위: I1 목록 · I2 만들기(`app/(app)/certs/events/`) · I3 상세 읽기(`app/(app)/certs/events/[id]/`). 오류 문구는 사용자 결정 A(2026-09-29, PR #88) — 명사형 「원인 · 다음 행동」.
> 검토 반영 범위(04.3-04 독립 검토 · DOM 감사): I3 `[id]/qr-section.tsx` — 「링크 복사」를 누르면 버튼을 span으로 바꿔 그려 포커스가 body로 사라졌다 → 버튼을 그대로 두고 라벨 자리만 `링크 복사됨`(`--success`), `role="status"` 영역은 처음부터 빈 채로(성공은 sr-only 알림, 실패는 보이는 한 줄). I2 `event-create-form.tsx` — 여러 줄 서버 셀 오류(모양 중복 · 같은 사람 · 구별 표시의 이름)가 한 줄을 고치거나 지워도 다른 줄에 남아 제출을 막았다 → 보이는 셀 오류 · 합계 행 오류 수는 고정 오류를 지금 줄로 `validateWinnerRows`에 다시 돌려 재현되는 것만(`keepReproducedCellErrors`). 새 색 · 서체 · 문구 없음 — 아래 항목을 이 기준으로 다시 확인했다.
> 지금 화면 기준 어긋남(만들기 전): 화면 없음 — UI-SPEC 오류 문장이 높임말(`~합니다 · ~해 주세요`)이라 DECISIONS 2026-09-26 명사형 통일과 어긋남 → 결정 A대로 명사형으로 옮겨 만든다.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 설명문은 I2 · I3의 구별 표시 상시 힌트 한 줄뿐(UI-SPEC 「필드 제약 힌트 — §8-5 안내 문구 아님」, 문장 그대로). 셀 오류 12종 · 만들기 실패 · 목록 조회 실패 · 링크 복사 실패는 명사형(`create-form-rules.ts` · `error.tsx` · `qr-section.tsx`, `error-copy-noun-style.test.ts` 녹색). 행사 이름이 외부에 나간다는 사실은 화면에 쓰지 않음(⑦)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 당첨일 초기값 오늘(KST, 서버가 넘김) · 새 줄 수량 1 · 전달 현장 · `수령자 화면` 열은 `buildPublicRows`로 계산 · 합계 `합계 · N명` · 제출 수는 서버 집계 · 이미 풀린 여러 줄 오류를 사용자가 다른 줄까지 다시 만져 지우지 않아도 된다(시스템이 재판정, E2E (d) · 단위 `keepReproducedCellErrors`, 검토 반영)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 쓰기 권한 없거나 1024 미만이면 1차 「행사 만들기」 · EMPTY 3차 · 폼을 그리지 않음(`useEditableWidth`) · 막힘은 1차 비활성 + 이유 한 줄(`createBlockReason`, `reasonTone` block) · 닫힌 행사는 QR · 링크 · 「링크 복사」 없음
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 목록은 머리 1차 「행사 만들기」 하나, 폼이 열리면(`?new=1`) 그 1차를 그리지 않고 폼의 1차 「행사 만들기」 하나. 상세는 1차 없음(「링크 복사」는 3차)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 화면에 되돌릴 수 없는 동작 없음(「링크 닫기」는 04.3-10). 입력 버리기는 N ≥ 1에서만 Phase 4 `ConfirmDialog`
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 오류 셀 수는 합계 행 한 자리(`replacesIssueCount`로 표 자체 셈과 합침) · 제출 셀은 보이는 `3/12` + sr-only 문장(보이는 글자 aria-hidden) · 막힘 이유는 1차 옆 한 줄 · 링크 복사 성공은 보이는 곳이 버튼 라벨 한 자리(status 영역은 sr-only 알림), 실패는 status 한 줄(검토 반영)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: I1 EMPTY `확인증 행사가 없습니다` + 3차 「행사 만들기」 · 당첨자 표 EMPTY `당첨자가 없습니다` + 「첫 줄 만들기 Ctrl+Enter」
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 당첨자 표 `enableGridKeyboard`(Tab · 방향키 · Enter 편집 · Esc · Delete 줄 · Ctrl+Enter 새 줄 · Ctrl+C · Ctrl+V 범위 붙여넣기) + 힌트 줄 · 폼 칸 Enter 제출 · 표 밖 Esc = 「취소 Esc」
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 이동(목록 1차 · EMPTY 3차 · 행 링크)은 `<a>`, 동작(만들기 · 취소 · 링크 복사)은 `<button>` — §10. 링크 복사는 누른 뒤에도 같은 `<button>`이라 포커스가 남는다(E2E (e) `toBeFocused`, 검토 반영)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 당첨자 입력은 표 안 엑셀식(모달 · 옆 패널 없음). 만들기는 한 건 등록이 아니라 표 + 두 칸 한 트랜잭션이라 UI-SPEC I2의 `?new=1` 토글(프로젝트 등록 선례)을 따름. 색은 토큰만(웜톤 없음), 표는 Phase 4 `ui/table`(스킨 A)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `events.module.css` · `event-detail.module.css`는 `var(--…)`만, `grep -rnE '#[0-9a-fA-F]{3,8}' app/(app)/certs --include=*.css` 0건 · QR은 `currentColor`(`--fg` on `--bg`)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 목록 · 상세 표는 `ui/table` 칸 접기(P1만 열, P2 접힌 줄 · `phoneRowLink`), 긴 글은 `keep-all` + `overflow-wrap: anywhere` · QR 160 고정 · 만들기 폼은 1024 미만에 없음. 실측은 독립 DOM 감사(오케스트레이터) 몫
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 없음 — 육안 판정 대신 E2E `test/e2e/cert-events.spec.ts`(1280 · 1000 폭, `CI=true`)가 DOM으로 확인. 독립 DOM 감사(PC 1280 · 폰 390)는 오케스트레이터가 따로 한다(지시 7)
