# 07-18 프로젝트 상세 정보 면 — 점검표
화면: app/(app)/projects/[id]/, app/(app)/projects/project-form.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-2(개정 5) · §7-2(개정 6) · §2-4(개정 12) · 07-UI-SPEC.md SC-19 · SC-22

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 정보 면에 더한 글자는 접힌 줄 `PO 금액 · {값}` · 섹션 제목 `기본` · 라벨 `PO 번호` · 값 `없음` · 버튼 `펼치기` `접기` `고치기` `고치기 취소`뿐 — 설명 문장 0(quote-table.tsx 정보 면 JSX에서 확인)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 면은 항상 접힌 채 시작해 먼저 고를 것이 없고, `고치기` 하나가 칸 묶음을 한꺼번에 열며(값마다 따로 고르지 않음), 바뀐 값은 기존 `일괄 저장 N`에 합쳐져 따로 저장할지 고민할 일이 없다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 기간을 고칠 권리가 없는 계급에게는 `고치기`가 렌더되지 않고(`period.rights === "none"`), 저장 요청 중에는 `고치기`/`고치기 취소`가 `aria-disabled="true"`(Button `disabled`)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 정보 면의 버튼은 전부 3차(`variant="tertiary"`)이고 화면의 1차는 기존 `일괄 저장 N` 하나 그대로
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 면에 삭제 동작 없음(`고치기 취소`는 편집 값을 버릴 뿐 저장된 값은 그대로)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 면을 펼치면 머리의 접힌 줄이 사라지고 `기본` 섹션이 같은 값을 한 번 보인다 · `고치기` 버튼 하나가 펼친 면에만 선다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음(정보 면은 값이 없으면 `없음` muted 한 글자)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 면 머리 버튼은 `<button>`이라 Enter/Space · `고치기` 뒤 PO 번호 칸에 포커스 · Esc 두 단계 · Ctrl+S 저장 · E2E project-info-panel.spec.ts(Enter · Space · Esc · Esc)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 면 안 행동은 전부 Button 3차 · 칸은 기존 `Form.Field` · `periodInput` 모양 그대로

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 면은 합계 면 모양(`--surface-foot` + 1px `--border-surface` + `--radius-surface`) · 견적 줄 표 입력 방식은 건드리지 않음 · 새 면은 카드가 아니라 섹션 선(`--border-row`)으로만 나눔

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: project-detail.module.css에 더한 `.info*` 규칙의 값은 전부 var() 토큰(`--surface-foot` `--border-surface` `--border-row` `--radius-surface` `--text-muted` `--text-aux` `--s-*`) — `git diff -- '*.css'`로 리터럴 값 없음 확인
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 섹션은 flex-wrap + `min-width: 0` + `overflow-wrap: anywhere`(긴 PO 번호 줄바꿈) · 버튼은 기존 Button 3차(폰 터치 높이는 Button이 정함) · 폭별 실측은 독립 DOM 감사(§6)가 맡는다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: Task 1은 Playwright 1280 DOM 실측(project-info-panel.spec.ts 5건 녹색) — 폭별 사진은 독립 DOM 감사 보고서(audit/07-18-dom-audit.md)
