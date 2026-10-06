# 06-07 DOM 감사 D-1 수정(/cards 목록 연결 칸) — 점검표
화면: app/(app)/cards/card-usage-list.tsx, app/(app)/cards/page.tsx, app/(app)/cards/cards.module.css
기준: BRIEF.md 「가장 잦은 작업」 3(법인카드 사용 등록 → 뒤 목록에서 어디에 이었는지 확인) · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3(표 — 거래처 같은 문자 칸은 한 줄 말줄임) · UI-SPEC S8 연결 열 · 06-07-PLAN S9 long-text backstop(:70)

지금 화면(고치기 전): `/cards` 목록 연결 칸이 팀 비용 건만 `팀 비용 · {팀}`이고, 견적 줄 · 견적 외 비용 건은 `—`(DOM 감사 D-1, 네 폭 공통). 등록 직후 어디에 이었는지 목록에서 확인할 수 없다.
고칠 계획: 서버가 목록 DTO에 `linkLabel`(`{프로젝트} · {줄 번호} {항목}` / `{프로젝트} · 견적 외 비용 · {항목}`)을 만들어 보내고(줄 번호는 S15와 같은 셈), 칸은 `row.linkLabel ?? "—"`. 칸은 한 줄 말줄임 + `title` 전문(새 CSS 클래스 하나, 토큰 · 기존 말줄임 꼴만).

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 설명문 0. 연결 칸 값 글자만(UI-SPEC S8 열 정의 그대로)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 줄 번호 · 글자는 서버가 셈한다(domain `listCardUsages` → `linkLabel`), 입력 칸 변경 없음
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 읽기 칸만 바뀜, 선택지 변경 없음
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 목록 1차 `카드 사용 등록` 그대로
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 행 행동 변경 없음
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 머리글 `연결` · 칸 값 `{프로젝트} · {줄}` — 머리글 낱말을 칸에서 되풀이하지 않는다(견적 외 비용 갈래의 `견적 외 비용`은 갈래 이름이라 UI-SPEC S8 그대로)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 목록 변경 없음
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 읽기 표 · 키 동작 변경 없음
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 새 행동 없음(칸은 글자)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 표 면 · 옆 패널 구조 그대로, 칸 글자와 말줄임만

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 새 CSS는 `.linkCell`(display grid · `minmax(0, max-content)` · PC 상한 16em — 지출결의 목록 거래처 칸 `.vendorCell`과 같은 값)과 `.linkText`(overflow · text-overflow · white-space)뿐, 색 · 서체 · radius 없음. 단순 `max-width: 16em` 말줄임은 320에서 문서를 70px 넘겨(E2E 실측) 격자 칸으로 최소 폭 기여를 0으로 했다
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: CI=true E2E `test/e2e/mobile-card-usage-320.spec.ts`가 320에서 문서 scrollWidth = clientWidth를 단언(긴 프로젝트 이름 연결 건 포함), 새 터치 대상 없음
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 해당 없음(CLAUDE.md §6 「스크린샷 육안 판정 금지」). 대신 CI=true 프로덕션 빌드 E2E가 DOM으로 단언: test/e2e/card-usage.spec.ts 연결 칸 글자 · `title` · 한 줄(white-space nowrap) · 견적 외 비용 갈래 글자, test/e2e/mobile-card-usage-320.spec.ts 320 한 줄 · 칸 안 말줄임(scrollWidth > clientWidth) · 문서 넘침 0
