# 261001-5zp DOM 재감사 (M1 · R3)

감사자: 독립 DOM 감사(구현자 아님). 소스·테스트 파일 수정 없음. 임시 스펙은 실행 뒤 삭제(`git status`에 내 파일 없음).

## 방법
- `CI=true pnpm build` 후 `CI=true pnpm exec playwright test --project=cert-setup --project=certs --no-deps --workers=1 test/e2e/cert.setup.ts <임시 스펙>` (프로덕션 빌드 `next start`, 로컬 erp_test만 사용).
- 임시 스펙(`test/e2e/zz-audit-cert.spec.ts`, 사본은 scratchpad)이 E′2 -> E′4 -> E5 -> E6-b 담당자 -> E6-b 기한을 `mobile-cert-intake.spec.ts`와 같은 헬퍼로 거쳐 각 상태에서 폭 320 / 375 / 390 / 480을 `getBoundingClientRect` · `getComputedStyle` · `elementFromPoint`로 실측(스크린샷 육안 없음).
- 문단 Δ: 링크에 `display:inline;min-width:0;min-height:0;margin:0;padding:0`를 강제한 문단 높이와 원래 높이의 차.
- 모서리: 링크 가로 중앙, top+2 / bottom-2 지점의 `elementFromPoint`가 링크(또는 자손)인지.
- 포커스: `Tab` 키로 링크에 도달시킨 뒤 `:focus-visible` 일치와 outline 계산값.
- 추가 프로브: 링크 상자와 겹치는 다른 상호작용 요소(a · button · input · canvas) 및 sticky/fixed 요소 유무(375 · 320).

## M1 — tel: 링크 (`a[href^="tel:"]`, `.telLink`)
`--touch-min` 계산값 44px. 아래 20개 조합(5상태 x 4폭) 전부 동일 패턴이라 상태별로 정리한다.

| 상태 (스코프) | 폭 | 링크 w x h | 가로 넘침 (scrollWidth-clientWidth) | 문단 높이 (원래 / 리셋) · Δ | top+2 / bottom-2 | 포커스 (`:focus-visible` outline) |
|---|---|---|---|---|---|---|
| E′2 (`p.inquiryLine`) | 320 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 일치 · 2px solid rgb(0,84,70) · offset 2px |
| E′2 | 375 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E′2 | 390 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E′2 | 480 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E′4 (`p.prizeInquiry`) | 320 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E′4 | 375 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E′4 | 390 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E′4 | 480 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E5 (`section.resultBlock`) | 320 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E5 | 375 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E5 | 390 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E5 | 480 | 88.7 x 44.0 | 0 | 24 / 24 · 0 | hit / hit | 동일 |
| E6-b 담당자 | 320 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E6-b 담당자 | 375 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E6-b 담당자 | 390 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E6-b 담당자 | 480 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |
| E6-b 기한 | 320 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E6-b 기한 | 375 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E6-b 기한 | 390 | 88.7 x 44.0 | 0 | 72 / 72 · 0 | hit / hit | 동일 |
| E6-b 기한 | 480 | 88.7 x 44.0 | 0 | 48 / 48 · 0 | hit / hit | 동일 |

추가 프로브(375 · 320, 5상태): 링크 상자와 겹치는 다른 상호작용 요소 0건. E′4의 sticky 제출 줄(`stickySubmit`)은 링크와 세로로 겹치지 않음(링크 y 211~255 · 235~279, 제출 줄 662~800).

### 항목별 판정
| 항목 | 판정 | 근거 |
|---|---|---|
| 44 x 44 이상 (SYSTEM.md §3/§10 · `--touch-min`) | PASS | 5상태 x 4폭 모두 88.7 x 44.0 |
| (a) 320 가로 넘침 없음 | PASS | 전 상태 scrollWidth-clientWidth = 0 (다른 폭도 0) |
| (b) 문단 줄 배치 왜곡 없음 (Δ <= 1px) | PASS | 전 조합 Δ = 0 |
| (c) 끝 모서리 히트 | PASS | 전 조합 top+2 · bottom-2 모두 링크 |
| (d) 포커스 링 | PASS | 전 조합 `:focus-visible` 일치, outline 2px solid (--focus), offset 2px |

## R3
`CI=true ... --project=desktop --no-deps login-logout.spec.ts settings.spec.ts` -> 16 passed.
- `test/e2e/login-logout.spec.ts:108-119` — 로그인 1차 버튼: 1280에서 `height 32px` · `font-size 12px`, 375에서 `height 40px` · `font-size 12px` 단언 존재, 통과.
- `test/e2e/settings.spec.ts:273-298` — 칸 오류 상태: `border-top-color` --danger, `outline-color` --focus(rgb(0,84,70)), `outline-style solid`, 오류 문구 `font-size 12px`, 칸 `height 32px`, 오류 해제 후 테두리 복귀 단언 존재, 통과.

판정: R3 PASS.

## 총평
- M1: PASS (FAIL 항목 없음). R3: PASS.

## 새 발견
- 없음 (High / Medium 없음).
- Low (커버리지, 결함 아님): 커밋된 M1 테스트(`mobile-cert-intake.spec.ts`)는 375 · 320만 보고 390 · 480과 포커스 링은 단언하지 않는다. 이번 실측에서는 그 폭들과 포커스도 통과했으므로 현재 결함은 없고, 회귀 방어만 얕다. 또 문단 Δ 허용치는 0.5이고 리셋이 `display:inline;min-height:0;margin-block:0`뿐이라 `min-width`/`padding`을 포함한 이 감사의 리셋과 조금 다르다(결과는 둘 다 Δ 0).
- 참고: `.planning/quick/.../261001-5zp-SUMMARY.md`는 감사 전부터 untracked였다(내 파일 아님). 이 보고서도 커밋하지 않았다.
