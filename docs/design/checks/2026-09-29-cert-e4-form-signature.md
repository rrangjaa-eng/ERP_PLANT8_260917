# 확인증 수령자 E4 폼 · E5 · 서명 칸(04.3-06) — 점검표
화면: app/c/[token]/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-5 · §7-1 · §7-7 · §10 · 04.3-UI-SPEC E1 · E4 · E5 · E6 · Copywriting E

> 첫 범위(Task 1 — 서버 제출 완성, 2df2ff6): `intake-flow.tsx`는 결과 이름 `submitted` → `saved`와 확인 응답의 `version`을 제출에 싣는 두 줄만 바꿨다(보이는 변화 없음).
> 둘째 범위(Task 2 — E4 폼 완성): 경품 블록(라벨 「경품」 + 값) · 문의 줄 · 주민등록번호 두 칸(`rrn-fields.tsx` — 묶음 이름 · 칸별 접근 이름 · 자동 이동 · 13자리 붙여넣기) · 주소 칸 부제를 라벨 안으로 · 연락처 `inputMode=tel` · 동의 블록(`consent-block.tsx` — 전문 제자리 펼침 `aria-expanded` · `aria-controls`, 전문 `--fs-md --fg` 1.6 · 64ch, 법무 확인 전 초안) · 제출 결과 갈래(E5 · 칸 오류 · 되묻기 · 확인 시간 지남 → E3 · E6-a · E6-b · 결과 불명) · 값의 주인(draft — 같은 자리 재확인 때 되살림) · 제출 줄 2px 선 + 안전 영역.
> 셋째 범위(Task 3 — 서명 칸 계약 ①-i): `signature-pad.tsx` — `tabindex=0` · `role=application` · 접근 이름 `서명 칸`/`서명 칸 · 서명함` · 키 안내 줄(`:focus-visible`일 때만 보임, 숨어도 `aria-describedby`) · 펜 십자 · Space/Enter 펜 · 방향키 8(Shift 24, 대각선) · Backspace 마지막 획 · `.sr-only aria-live=polite` 상태 알림 여섯 문장 · 「서명 있음」 = 제출 PNG 잉크 픽셀 ≥ 288(`domain/certs/signature-ink.ts`, 서버와 같은 함수) · 기준선(논리 y 155, 점선) · 자리표시 왼쪽 위 · 「다시 쓰기」 → 비우고 포커스 캔버스. 좌표는 `signature-geometry.ts`(순수).
> 지금 화면 기준 어긋남(만들기 전): 주민등록번호 뒤 칸 빈 라벨 · 자동 이동 · 붙여넣기 없음 · 전문 `--fs-sm --muted`에 `aria-controls` 없음 · 경품 라벨 없음 · 주소 부제가 라벨 위 · 제출 결과 불명 · 칸 오류 제출 줄 없음 · 확인 시간 지남이 E2(값 버림) · 막힘 이유가 이름 공백만 적어도 채운 것으로 봄. 서명 칸 키보드 · 알림 · 잉크 판정은 Task 3.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: E4 문장은 Copywriting E 표 그대로(경품 아래 문의 줄 · 주소 부제 · 동의 요약 · 칸 오류 둘 · 막힘 이유 · 결과 불명). 칸 오류 제출 줄은 §6-5 확정 문장 `주민등록번호를 고쳐 주세요 · 나머지는 채워졌습니다`의 꼴에 틀린 칸 이름만 바꿔 넣는다(`fixFieldsLine` — 새 문장 꼴 없음). 외부 수령자 화면은 SYSTEM §6-5 · §8 규칙 6 예외(`~해 주세요`체)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 주민등록번호 13자리를 한 번에 붙여 넣으면 두 칸으로 나눠 채우고 6자리를 치면 뒤 칸으로 간다 · 전달 방법 · 경품 · 동의 판(`consentVersion` · `retentionYears` · `winnerVersion`)은 확인 응답 값을 그대로 되돌려 보낸다 · 확인 시간이 지나 다시 확인하면 적은 값이 되살아난다(다시 적지 않는다). 이름 · 연락처 비움은 UI-SPEC A3 결정
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 빈 칸이 있으면 1차 비활성 + 빈 칸만 나열한 이유(`info`) · 택배가 아닌 자리는 주소 칸이 없다 · 서명이 없으면 「다시 쓰기」가 없다
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: E4 1차는 「확인증 제출」 하나(`type=submit`, 폼 Enter도 같은 제출) · 「전문 보기」 · 「다시 쓰기」는 3차 · 전화는 `tel:` 링크
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 수령자 화면에 삭제 동작 없음 · 「다시 쓰기」는 서명 칸 아래 오른쪽 3차(획만 비움)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 주민등록번호 보이는 라벨은 묶음 이름 하나, 칸은 `aria-label`로만 앞 6 · 뒤 7 · 칸 오류는 칸 아래 한 줄(두 칸이 같은 id를 가리킨다) · 제출 줄은 막힘 이유(info) 또는 서버 거부 · 결과 불명 줄(block) — 같은 문장을 두 자리에 쓰지 않는다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음 — E4는 빈 화면 상태가 없다(당첨자 0명 행사는 만들 수 없다)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 칸 Tab 순서 이름 → 앞 6 → 뒤 7 → (주소) → 연락처 → 동의 → 전문 보기 → 서명 → 제출, 폼 Enter = 제출(`noValidate` 폼) · 서명 칸은 Space/Enter · 방향키 · Backspace로 그리고 지운다(캔버스 안 Enter는 제출하지 않는다) · Tab은 떠난다. E2E `mobile-cert-submit` 첫 흐름이 키보드만으로 두 획 · 지우고 다시 · 알림 · 이름 · 제출까지 녹색(CI=true)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 전화는 모두 `tel:` 링크(`contactLine` 하나), 동작은 `Button`(3차 둘 · 1차 하나)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 외부 수령자 화면은 표 · 옆 패널이 없는 한 열 폼(SYSTEM §6-5), 색은 토큰만

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `intake.module.css` 추가분은 `var(--…)`만(서명 선 색은 `getComputedStyle`의 `--fg` — 리터럴 없음, 인쇄는 04.3-11이 `brightness(0)`으로 검정으로 찍는다), 입력 칸은 `ui/input/TextField.module.css`의 `input external` · `inputError` · `error errorExternal`을 `composes`로 가져온다(개정 ⑦ (a)) · `grep -nE '#[0-9a-fA-F]{3,8}|rgb' app/c/[token]/intake.module.css` 0건
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 주민등록번호 두 칸은 `minmax(0, 1fr) auto minmax(0, 1fr)` 격자(줄어든다) · 서명 칸 폭 100% · `aspect-ratio: 520 / 200` · `touch-action: none` · 동의 라벨 `min-height: var(--touch-min)` · 3차는 Button 기본 44 · 입력 48. `CI=true` E2E 375px 42건 녹색. 320 · 200% 확대 실측은 독립 DOM 감사(오케스트레이터 · 04.3-13 backstop)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 없음 — 스크린샷 육안 판정 금지(CLAUDE.md §6). `CI=true` E2E(375px, 프로덕션 빌드) `mobile-cert-submit` · `mobile-cert-intake` · `mobile-cert-verify`(+ regression) 42건이 DOM으로 확인했고, PC 1280 · 폰 390 독립 DOM 감사는 오케스트레이터 몫
