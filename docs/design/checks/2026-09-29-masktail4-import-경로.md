# 04.3-08 ③-e maskTail4 import 경로만 옮김 — 점검표(화면 변경 없음)
화면: app/(app)/admin/vendors/vendor-form.tsx, app/(app)/admin/vendors/page.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md — 이 변경은 두 파일의 `maskTail4` import 줄 하나씩(`@/lib/crypto` → `@/lib/mask-tail4`)만 바꾼다. 함수 본문은 한 글자도 바뀌지 않고 그대로 옮겼다(E3-11 — 클라이언트 번들이 `lib/crypto.ts` → `lib/gcp/kms.ts` → `google-auth-library`를 끌어와 `pnpm build`가 `child_process`로 실패했기 때문)

## 원칙
- [x] 안내 문구 — 근거: 해당 없음 — 렌더되는 JSX · 문구 변경 없음(`git diff`가 두 파일에서 import 줄 한 줄씩뿐)
- [x] 결정 최소 — 근거: 해당 없음 — 입력 · 기본값 변경 없음(import 줄만)
- [x] 할 수 없는 선택지 숨김·비활성 — 근거: 해당 없음 — 조건부 렌더 변경 없음(import 줄만)
- [x] 주 버튼 하나 — 근거: 해당 없음 — 버튼 변경 없음(import 줄만)
- [x] 위험한 동작 분리·위험 색 — 근거: 해당 없음 — 동작 · 색 변경 없음(import 줄만)
- [x] 같은 말 두 번 없음 — 근거: 해당 없음 — 문구 변경 없음. 마스킹 문자열은 같은 함수가 같은 값(`****-**-1234`)을 만든다(`test/unit/mask-tail4.test.ts`)
- [x] 빈 화면은 첫 행동 버튼 — 근거: 해당 없음 — 빈 상태 변경 없음(import 줄만)
- [x] 키보드만으로 끝남 — 근거: 해당 없음 — 키 처리 변경 없음(import 줄만)
- [x] 같은 종류 행동은 같은 모양 — 근거: 해당 없음 — 컴포넌트 변경 없음(import 줄만)

## 사용자 결정(§1)
- [x] §1 결정 위반 없음 — 근거: 해당 없음 — 옆 패널 · 스킨 · 표 구조 변경 없음(import 줄만)

## 시스템
- [x] 새 색·서체·radius·그림자 없음 — 근거: CSS · 토큰 파일 변경 없음(import 줄만)
- [x] 폰 320 넘침 없음 · 터치 44px — 근거: 해당 없음 — 레이아웃 변경 없음(import 줄만)
- [x] 실제 앱 화면 확인 — 근거: 해당 없음 — 화면 출력이 바뀌지 않는 import 경로 변경이라 `pnpm build` 녹색 · 통합 `vendors.test.ts` 녹색으로 확인. 화면 판정은 페이즈 끝 `/design-review` · `/qa` 몫. 스크린샷 경로: 없음(화면 변경 없음)
