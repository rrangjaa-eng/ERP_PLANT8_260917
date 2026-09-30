---
phase: quick-260930-aq2
plan: 01
status: complete
subsystem: admin/people, admin/system-status
tags: [ui-review, w1, w3, design-gate]
requirements: [QUICK-260930-aq2, OPS-03]
commits: 6
plan_head_before: 5888119c064513a1e7c46e31fad3455a2c499cec
key-files:
  created:
    - test/unit/app/people-list-hidden-id.test.ts
    - docs/design/checks/2026-09-30-04.4-ui-review-warnings.md
  modified:
    - app/(app)/admin/people/page.tsx
    - app/(app)/admin/system-status/system-status.module.css
    - test/e2e/system-status.spec.ts
actuals:
  tasks: 3
  commits: 6
---

# Quick 260930-aq2: 04.4 UI-REVIEW WARNING 3건 Summary

W1(person.id 없는 행)과 W3(폰 「실행 기록」 줄 상자)는 재현되어 실패 테스트 후 최소 수정으로 닫았다. W2(PC 배지 nowrap 넘침)는 실측으로 재현되지 않아 코드 변경이 없다.

## Task 결과

| Task | 경고 | 판정 | 커밋 |
|------|------|------|------|
| 1 | W1 | 재현(확정 결함) → 수정 | 1fed66b (test, RED) · a3f989b (fix + 점검표) |
| 2 | W2 | 재현 안 됨 (a) → 코드·커밋 없음 | — |
| 3 | W3 | 재현 → 수정 | 4622e9d (test, 실패 실측) · 321167d (fix + 점검표) |
| 후속 | W-A (DOM 감사) | 재현 → 수정 | 0408cb7 (test, RED) · 5d6a4a3 (fix + 점검표) |

## 실측

CI=true 프로덕션 빌드, Playwright `getBoundingClientRect`·`offsetWidth`·`scrollWidth`.

### W2 — PC 700 · 768 · 900, 두 배지 행(registerPerson 직후)
판정 (a): 재현 안 됨. 세 폭 모두 세 부등식(문서·표·표 부모 넘침 없음) 통과. 탐침은 `git checkout`으로 버렸고 CSS는 바꾸지 않았다.

| 폭 | 문서 scroll/client | 표 offsetWidth | 표 부모 client/scroll | 상태 열 th 폭(있는 그대로 → 배지 nowrap을 normal로 주입) |
|----|----|----|----|----|
| 700 | 700/700 | 660 | 700/700 | 166 → 144 |
| 768 | 768/768 | 728 | 768/768 | 166 → 151 |
| 900 | 900/900 | 860 | 900/900 | 166 → 165 |

표는 뷰포트보다 40px 좁다(여백). 넘침 없음. 이메일 열이 남는 폭을 흡수한다(253 / 305 / 403). 주입 뒤에도 표 폭은 같다. UI-SPEC Responsive 1(PC 한 줄)과의 어긋남도 발생하지 않았으므로 divergence 기록 없음(W2 코드 변경 없음).

### W3 — 폰 360 · 640, 「정리」 실패 행(URL 있음)의 「복원 리허설」 dd
판정 (b): 재현. 참조 = 링크에 display inline을 준 같은 dd. 글자 위치 = 링크 글자 아래끝(dd 위 기준).

| 폭 | 상태 | dd 높이 | 참조 dd 높이 | 차 | 글자 아래끝(dd 기준) | 참조 | 차 |
|----|------|----|----|----|----|----|----|
| 360 | 수정 전 | 105 | 85 | +20 | 82.4 | 74 | 8.4 |
| 640 | 수정 전 | 57 | 37 | +20 | 34.4 | 26 | 8.4 |
| 360 | 수정 후 | 85 | 85 | 0 | 74 | 74 | 0 |
| 640 | 수정 후 | 37 | 37 | 0 | 26 | 26 | 0 |

dd line-height 24px, font-size 15px. 수정 후에도 링크 boundingBox는 44×44 이상이고 화면 안이다(E2E 단언).

## 수정 내용

- W1 `app/(app)/admin/people/page.tsx`: Fragment key `person.id ?? nameId`. id가 있으면 id key를 유지해 DeleteToArchive `useState`가 목록이 밀릴 때 다른 사람 행으로 넘어가지 않게 하고(오케스트레이터의 순번 key 제안 대신), 없을 때만 행 머리글과 같은 순번(UI-SPEC 접근성 관계 ①)을 쓴다. 「상세」 링크·삭제 버튼은 `person.id`가 있을 때만 그린다(id 없는 행의 동작 칸은 빈 칸, 자리 문구 없음). 원인: `PERSON_DTO_SPEC`이 id·archivedAt을 함께 `person.value`로 가려 `!person.archivedAt`가 참이 되고 보관 권한이 있으면 모든 행에 id 없는 삭제 버튼이 생겼다.
- W3 `system-status.module.css`: 폰 `.runLink`에 `margin-block: calc((1lh - var(--touch-min)) / 2);` 한 줄과 주석. 44 상자(min-width/height 44, inline-flex)는 그대로다. 새 토큰·색·서체 없음.

## 알려진 대가 (W3)

히트 영역이 글자 줄 위아래로 (44 − 1lh)/2 = 10px씩 이웃 줄·행과 겹친다. SYSTEM.md §3 44×44 규칙은 지킨다.

## 검증

| 항목 | 결과 |
|------|------|
| `pnpm lint` | 통과 (boundaries 폐기 경고만) |
| `pnpm typecheck` | 통과 |
| 단위 `pnpm test:unit` | 163 파일 · 2208 테스트 통과 |
| 통합 `pnpm test:integration` | 81 파일 · 2548 테스트 통과 |
| E2E `CI=true` (지정한 5개 스펙 경로 → mobile 프로젝트가 desktop에 의존해 전체 desktop이 함께 돔) | 529 통과, 실패 0. people 11 · mobile-people 5 · admin-people-detail-link 1 · mobile-320-no-overflow 3 · system-status 11 |
| RED 실측 (W1) | 가린 경우 `expect(keys.every(key => key !== null)).toBe(true)` 실패 후 수정으로 통과. 보이는 경우는 수정 전에도 통과(회귀 고정) |
| `pnpm build` | CI=true E2E가 `pnpm build && pnpm start`를 돌며 통과(별도 실행 없음) |
| 탐침 흔적 | `console.log`·`addStyleTag` 없음, 작업 트리 깨끗 |

## Deviations from Plan

1. **[측정 정의 변경] W3 글자 기준선 단언.** 플랜은 「링크 글자와 앞 텍스트 노드의 기준선 차 ≤1px」이었다. 360px에서 링크가 앞 글자와 다른 줄로 내려가(3줄) 그 비교가 줄 위치 차(약 31px)를 재서 의미가 없었다. 대신 「링크 글자 아래끝(dd 위 기준)이 참조와 같다」로 바꿨다(수정 전 8.4px 차, 수정 후 0). dd 높이 차 ≤1px 단언은 플랜 그대로다.
2. **[구조] W3 E2E를 폭별 describe 대신 한 테스트 안에서 `setViewportSize`로 360·640을 순회.** serial describe에서 앞 실패가 뒤 폭을 건너뛰어 640 실측이 빠졌기 때문. `expect.soft`로 두 폭을 모두 잰다.
3. **[정보] 지정한 5개 스펙 경로 실행이 전체 E2E(529개)를 돌렸다.** mobile-* 프로젝트가 desktop 프로젝트에 의존한 결과. 전부 통과했다.

## 독립 DOM 감사 후속 — W-A (W3 수정의 회귀)

감사 결과(260930-aq2-DOM-AUDIT.md W-A): W3 수정 뒤 폰 360·375·640에서 `.runLink` 44×44 상자의 아래 약 6px이 다음 「알림 발송」 dt/dd에 가려 `elementFromPoint`가 링크가 아니다(감사 격자 968점 중 836점 적중 = 86%, 실효 탭 높이 약 38px). 음수 margin-block으로 margin box만 줄이자 border box가 dd 아래끝 밖으로 나가 뒤에 오는 형제가 위에 그려진다.

- RED 0408cb7: 같은 W3 E2E에 링크 상자 안 5×5점(1px 안쪽)을 `document.elementFromPoint`로 재어 링크 또는 자손이 아니면 실패. 360·640 모두 링크가 아닌 적중점 6개로 실패를 눈으로 확인했다.
- 수정 5d6a4a3: 폰 `.runLink`에 `position: relative;` 한 줄(+ 인접 주석 한 구절, 점검표 근거 갱신). 25점 모두 적중하고 dd 높이 = 참조 단언(360: 85, 640: 37)도 그대로 통과한다. 색·서체·토큰 추가 없음.
- 감사자 참고: `1lh`는 링크 자신의 line-height로 풀려 margin-block이 약 -12.4px으로 계산된다(dd의 24px 기준 -10px이 아님). 그래도 dd 높이는 참조와 일치한다(차 0). 이 단언이 그 값의 정합성을 지킨다.
- 검증: `pnpm lint` · `pnpm typecheck` 통과, `CI=true` system-status.spec.ts 8개 통과.

## 범위 밖 관찰 (손대지 않음)

- person.value가 꺼진 계급 행의 이름·이메일 셀이 비어, 폰 접힌 줄이 ` · 계급 · 소속`처럼 시작한다.
- UI-REVIEW INFO 4건.
- UI-SPEC Responsive 1 「PC 한 줄」 문구와의 어긋남은 W2가 재현되지 않아 생기지 않았다. UI-SPEC·SYSTEM.md·DECISIONS.md는 수정하지 않았다.

## 인계

독립 DOM 감사는 실행자가 자체 판정하지 않는다 — 실행 뒤 오케스트레이터가 별도 에이전트(Sonnet, CI=true, DOM 실측)를 360·375·640·700·768·900에서 돌린다(/admin/people는 가린 계급 포함, /admin/system-status는 360·375·640). push하지 않았다. STATE.md·ROADMAP.md·HANDOFF.json은 건드리지 않았다.

## Threat Flags

없음. 새 엔드포인트·권한 경로 없음(표시 변경만, T-qaq2-01·02·04 완화: 가린 행에 다른 식별자를 쓰지 않고 id 없는 삭제 버튼 경로를 없앴으며 id가 있으면 id key 유지).

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: test/unit/app/people-list-hidden-id.test.ts, docs/design/checks/2026-09-30-04.4-ui-review-warnings.md, 수정한 page.tsx·system-status.module.css·system-status.spec.ts
- 커밋 존재: 1fed66b, a3f989b, 4622e9d, 321167d, 0408cb7, 5d6a4a3 (`git rev-list --count 5888119..HEAD` = 6)

## Post-build (오케스트레이터)

- `/review`: 차단 지적 없음(P1·P2 0). P3 3건 반영 — 07cb16e(단위 테스트 tbody 한정 href 단언 · E2E 폭 변경 뒤 scrollIntoViewIfNeeded · 점검표 폭별 문구). 나머지 P3(이웃 줄 겹침 주석, `lh` 단위 Firefox 111–119 미지원 시 옛 동작, serial 의존)는 그대로 둔다.
- `/qa`: 문제 0건, 건강 점수 100(성능·접근성 미채점). 두 계급 × 7폭 넘침 0 · 콘솔 오류 0 · 「실행 기록」 아래 가장자리 클릭 → 이동.
- `/design-review`: Design B · AI Slop A. 두 수정은 의도대로 동작.
  - DR-1(사용자 결정: 수정 안 함(2026-09-30, 폰 키보드 사용 드묾)): 폰 360·375에서 링크가 줄바꿈으로 혼자 떨어지면 44 상자 둘레 포커스 링(52×52)이 윗줄 글자에 9.4px 걸린다. 줄을 부풀리지 않는 W3와 「링크 상자 44×44」(계획 기준)를 함께 지키는 한 피할 수 없다. 해법은 히트 영역을 `::after`로 옮기고 링크 상자는 글자 크기로 두는 것 — 계획 기준 문구를 바꾸므로 사용자 결정으로 넘긴다.
  - DR-2(후속): 링크 밑줄 굵기 1px → 호버 2px(SYSTEM §4-4·§7-1)가 `.runLink`·사람 `.detailLink`·`.toggle`에 없다. 이 PR 전부터이고 여러 화면에 걸쳐 있다.

## 후속 과제(범위 밖, 기록만)

- action-log 필터(`app/(app)/admin/action-log/filter-bar.tsx:60`, `page.tsx:86`): person.value가 꺼진 계급에서 id·이름 없는 option이 key undefined로 중복된다 — W1과 같은 부류. 근본 원인은 `PersonDto.id`가 항상 있는 것으로 타입이 선언된 점.
- 사람 목록(권한 좁은 계급): 이름·이메일·상태·동작 열이 전부 비어 있음(DR-4, 제품 결정 필요) · 폰 요약 줄이 「 · 」로 시작(DR-5) · 보기 권한만 있는 계급에 「사람 등록」 버튼이 보임(DR-6) · 「상세」「삭제」 사이 간격 0(DR-7) · 표 행 높이가 `--row-min` 미달(DR-8).
