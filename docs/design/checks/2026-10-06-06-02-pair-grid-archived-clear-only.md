# 짝 격자 보관 칸 해제만(F-1 · 리뷰 P3-3) — 점검표
화면: ui/permission-grid/PermissionGrid.tsx, app/(app)/admin/settings/settings-form-client.tsx, app/(app)/admin/settings/pair-grid-axes.ts
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-2(짝 격자) · §7-13 · `/mnt/project-files/notes/06-review/171-design-review.md` F-1

## 원칙
- [x] 안내 문구: 문구를 더하지 않았다 — 보관 칸이 왜 막혔는지는 「(보관됨)」 머리글이 말한다 — 근거: diff에 화면 글자 추가 없음(서버 거부 문구 한 줄만 추가, 오류 한 줄 명사형)
- [x] 결정 최소: 사용자가 보관 값으로 새 짝을 걸지 고민할 일이 없다 — 근거: 빈 보관 칸 disabled, 행 머리 「전체」는 활성 열만
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 빈 보관 칸 `disabled`(PC 격자 · 폰 목록), 잠긴 열 머리 「전체」 `disabled`, 단위 테스트 permission-grid-locked + E2E phase6-keys
- [x] 주 버튼 하나: 해당 없음(저장 버튼 없는 즉시 저장 격자) — 근거: 버튼 추가 없음
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다: 해당 없음 — 근거: 삭제 동작 없음
- [x] 같은 말을 두 번 하지 않는다 — 근거: 글자 변경 없음
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다: 해당 없음 — 근거: 빈 화면 미변경
- [x] 키보드만으로 끝난다 — 근거: 네이티브 checkbox disabled는 Tab에서 빠지고 활성 칸 동작은 그대로(E2E 기존 격자 테스트 통과)
- [x] 같은 종류의 행동은 같은 모양이다 — 근거: 비활성은 네이티브 `disabled` 하나(권한표도 같은 컴포넌트, locked 없으면 변화 없음)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다 — 근거: 스레드 결정 카드 2026-10-06 16:34:42 KST로 「(보관됨)」 표시 확인, 새 색 · 컴포넌트 없음

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: CSS 변경 0, tokens.css diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 크기 속성 변경 없음, 폰 목록 체크박스 클래스 그대로
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 스크린샷 없음(육안 판정 금지) — CI=true 빌드 `/admin/settings`에서 E2E DOM 단언(보관 빈 칸 disabled · 「현금 전체」 뒤 DB에 새 보관 짝 0)
