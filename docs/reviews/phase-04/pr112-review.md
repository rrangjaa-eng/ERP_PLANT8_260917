# PR #112 Post-build `/review` 기록 — quick 260930-kc9 (PR #104 후속 F(2))

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-30 |
| 브랜치 | claude/pr104-followup-f2 (origin/main 9d695fc 이미 반영 — 머지 불필요, 검토 헤드 27e1ce7) |
| 범위 | `git diff 9d695fc..27e1ce7`, `.planning` 제외 18파일 +577/−61 |
| 검토자 | 핵심 패스(오케스트레이터) + 전문 5명(testing · maintainability · performance · design · simplification, Opus) + Red Team 1 + 적대 1(Opus). security는 인증·권한 변경 없음(scope)으로 제외. Codex 패스 생략 — CLAUDE.md 외부 검토 금지 |
| 결과 | critical 0 · 수정 4(아래 F1~F4) · 사용자 결정 요청 1(D1) · 참고(수정 안 함) 6 · 품질 8.5/10 |
| 확인 | typecheck rc=0 · lint rc=0 · 단위 `test/unit/ui/text-field-hint.test.ts` 8/8 · `CI=true` E2E `settings-approval-route.spec.ts` + `quote-revisions.spec.ts` 55/55 |

Scope Check: CLEAN — Intent: ISSUE-001 · DR-104-01~05 · G1~G3(PR 본문 · PLAN) · Delivered: 같은 항목. PLAN 항목 모두 반영(260930-kc9-PLAN.md 대조).

## 수정 (이 세션)

| # | 출처 | 발견 | 수정 · 확인 |
|---|---|---|---|
| F1 | 적대 (conf 8) + 수렴 패스 | `.rowNumber`에 굵기 · 줄높이가 없어 행 번호가 400 · 1.6(상속)으로 그려진다. SYSTEM §2-2 `--fs-xs`는 11 / **1.4** / **600**이고 용도에 「행 번호」가 있다 | `project-detail.module.css` `.rowNumber`에 `font-weight: var(--fw-medium)` · `line-height: var(--lh-head)`. RED: `quote-revisions` DR-104-04 fontWeight 400 ≠ 600, lineHeight 17.6px ≠ 15.4px → GREEN |
| F2 | Red Team (conf 8) | 설정 화면 결재선 복원 줄 「복원」·「버림」이 폰에서 폭 32.3 — DR-104-01과 같은 결함인데 상세 · 리저브만 고쳤다(SYSTEM §3 3차 44×44) | `settings.module.css` 폰 `.restoreAction`에 `min-width: var(--touch-min)`. 새 E2E `settings-approval-route` 「DR-104-01」 375 · 320 RED 32.3 → GREEN. 점검표 `2026-09-30-설정-힌트-이력-쉼표.md` 갱신 |
| F3 | maintainability (conf 6) | `text-field-hint.test.ts`의 RED 단계 주석과 `Record<string, unknown>` + `as TextFieldProps` 단언이 hintId 도입 뒤에도 남아 props 타입 검사를 끈다 | 주석 삭제, `Partial<TextFieldProps>`로 바꾸고 단언 제거. typecheck · 단위 8/8 |

| F4 | 수렴 패스 (conf high) | F2 뒤 점검표 `2026-09-30-설정-힌트-이력-쉼표.md`에 「CSS 변경 없음 · CSS 변경 0」이 남아 스스로 어긋났다 | 문구를 CSS 한 줄(--touch-min)로 고침 |

수렴 패스: 수정분 `27e1ce7..HEAD`만 Opus 1명이 다시 검토 — F1 줄높이 · F4 문구 2건을 찾아 반영했다. 7명 전체 재실행은 하지 않았다(수정이 CSS 두 줄 · 테스트 · 문서라 전체 diff 판정이 바뀌지 않음).

## 사용자 결정 요청

| # | 출처 | 발견 |
|---|---|---|
| D1 | design (conf 6) + 적대 (conf 7), 다중 | `quote-table.tsx:2267` 폰(<700) · PC 사이 머리 줄 순서를 key 배열로 바꾸면 React가 DOM 노드를 옮긴다. 옮겨지는 묶음 안에 인라인 `<dialog>`(ConfirmDialog, 포털 없음 — `StatusChange` 두 개 · `NewRevisionDialog`)가 있어, 확인 창이 열린 채 700을 넘나들면(폰 회전 390↔844, 창 크기 조절) HTML dialog removing steps로 top layer에서 빠진다: 배경 막기 · Esc · 포커스 가둠이 사라지고 `[open]`은 남아 effect가 다시 `showModal()`하지 않는다. 연차 선례(`document-actions.tsx`)는 버튼만 두 자리에 조건부 렌더라 해당 없음 — 이번 방식에서 새로 생긴 것 |

선택지와 추천은 PR #112 댓글 「[사용자 결정 요청]」에 있다.

## 참고 — 수정 안 함

| # | 출처 | 내용 | 수정 안 한 이유 |
|---|---|---|---|
| N1 | testing (conf 6) | `formatNumberValue`의 numberKind 네 분기는 지금 이력형 키에 numberKind가 없어 도달 불가 · 테스트 없음 | PLAN 213행이 이 분기를 명시했다(계획 게이트 통과분) |
| N2 | testing (conf 5) | select · checkbox · fieldset의 오류+힌트 aria-describedby 순서를 재는 테스트 없음 | 서버 저장 실패를 일부러 만들어야 하는 E2E — 중간 신뢰도, 동작은 코드로 확인(오류 id 먼저) |
| N3 | 적대 (conf 6) | 설정 경고 `<p>`와 RouteStepEditor 단계 오류가 칸의 aria-describedby에 없다 | ISSUE-001 범위는 힌트(사용자 결정 2026-09-30). 단계 오류는 저장 버튼 aria-describedby가 이미 가리킴 |
| N4 | 적대 (conf 5) | 정수 아닌 이력 값은 `String()` — 1e-6 미만이면 지수 표기 | 비율 키 입력은 0~1 실무 값(0.088 등)이라 발생하지 않는다 |
| N5 | 적대 · maintainability 공통 인지 | `@/app/(app)/leave/use-phone-width` 경로 간 import | DECISIONS 2026-09-29 선례. `ui/`로 옮기는 것은 파일 이동이라 요청 없이 하지 않는다 |
| N6 | 적대 (by design) | 수화 전 폰 Tab 순서는 PC 순서 | 사용자 결정(CSS order 유지)대로. 수화 뒤 맞음 |

## 메모
- 로컬 dev(`CI` 없음)에서 `settings-approval-route.spec.ts` 7건이 변경 전 · 후 똑같이 실패한다(저장 흐름). `CI=true`(프로덕션 빌드)에서는 전부 통과 — 기존 dev 모드 현상, 이 PR과 무관.
- `settings-approval-route.spec.ts`는 `desktop-settings` 프로젝트(`dependencies: ["mobile-375"]`)라 파일만 지정해도 607개가 딸려 온다. 단독 실행은 `--no-deps`.
- 게이트 기록: 훅이 `.claude/gates/phase-02.log`(미추적, 커밋 안 함 — PR #104 선례)에 적었다. 들어갈 줄: `review 2026-09-30T19:06Z session=cde46464-0ee6-59d4-9cf5-532be0beda64`.
