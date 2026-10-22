# 07-12 SYSTEM 개정 묶음 — 점검표
화면: ui/status-tag/, ui/shell/, ui/table/, docs/design/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-5 · §7-2 · §7-3 · §1-4

## 원칙
- [x] 안내 문구: 화면에 새 설명문을 더하지 않았다. 새 낱말 여섯은 상태 글자(`text` 변형)뿐이다 — 근거: status-map.ts 표 줄 여섯만 추가, 마크업 변경 없음
- [x] 결정 최소: 사용자가 할 결정이 늘지 않는다 — 근거: 낱말 → 색은 표 한 곳이 정하고 호출부는 낱말만 넘긴다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: `알림 규칙` 메뉴 자리는 키가 없는 계급에게 adminIndexGroups가 거른다(단위 시험 role-menu-notification-rules)
- [x] 주 버튼 하나: 화면 구성 변경 없음 — 근거: 개정 문장은 정본 문서이고 07 화면 플랜이 쓴다
- [x] 위험한 동작은 떨어뜨려 두고 위험 색이다 — 근거: 해당 변경 없음
- [x] 같은 말을 두 번 하지 않는다 — 근거: 낱말 표 한 곳, 중복 낱말 없음(`잠김`은 사람 로그인 잠김 뜻을 SYSTEM에 구분해 적음)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 화면 변경 없음
- [x] 키보드만으로 끝난다 — 근거: 포커스 칸 안쪽 2px accent 선으로 포커스 위치가 보이고 키 처리는 바뀌지 않는다
- [x] 같은 종류의 행동은 같은 모양이다 — 근거: 표 면 역할 토큰 하나를 다시 가리킬 뿐 모양 종류가 늘지 않는다

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 면 값은 중립 원시 n-50 · n-60 · n-100(웜톤 아님), 견적 표 입력 방식 변경 없음. 개정 11은 사용자 10/7 13:04 · 13:09 · 13:12 확정(decisions.md:28-31)이며 스킨 A의 「옅은 초록 그룹 줄」을 중립 면으로 바꾸는 것은 DECISIONS 「07 SYSTEM 개정 11」에 기록한다

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 기존 원시 n-50 · n-60 · n-100을 역할 토큰이 다시 가리킬 뿐, 새 토큰 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 크기·간격 변경 없음. 새 낱말 줄바꿈은 /dev/components 감사(4폭)에서 실측 대상
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(스크린샷 육안 금지, CLAUDE.md §6) · 독립 DOM 감사 audit/07-12-dom-audit.md 몫(오케스트레이터)

## 검토 3회차 — 화면 표 칸 편집기(Codex P2 · Table.module.css:81)
- [x] 개정 11은 시스템 규칙이라 `StaticTable`(.inputCells) 밖 동적 편집 표에도 같다 — 근거: 견적 · 매출 · 발행 요청(project-detail) · 리저브(reserves) · 지급 대상(expenses) · 증빙(evidence-table) · 경품(event-detail) 모듈의 `.cellInput` · `.cellInputNumeric` · `.cellSelect` 쉬는 면 `--accent-weak` → 투명, 포커스 = `--surface-base` + 안쪽 `--focus-w` `--accent` 선(바깥 `--focus` 링 제거). 새 토큰 0 · `evidence-table.tsx` 그대로(모듈 CSS만).
- [x] 단위 시험이 다섯 모듈의 편집기 규칙을 잠근다 — 근거: `test/unit/design/tokens.test.ts` 「화면 표 칸 편집기 — 개정 11」.
- [x] 실측(Chromium, CI=true 프로덕션 빌드, 1280): 아홉 편집기 모두 쉼 · hover 계산 배경 투명(칸 면 n-0 또는 n-60), 포커스 rgb(255, 255, 255) + outline 2px solid rgb(0, 84, 70) · offset -2px. g-50 계산 배경 0. 글자 대비 15.53~16.79 · 밑줄 · 포커스 선 8.25~8.91.
