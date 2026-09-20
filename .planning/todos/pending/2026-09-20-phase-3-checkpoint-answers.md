---
created: 2026-09-20T14:54:02.572Z
title: Phase 3 실행 전 결정 4건의 확정 답 (전부 A)
area: planning
severity: minor
files:
  - .planning/phases/03-permissions-settings-masters/03-01-PLAN.md (Task 1 checkpoint)
  - .planning/phases/03-permissions-settings-masters/03-04-PLAN.md (Task 1 checkpoint)
  - .planning/phases/03-permissions-settings-masters/03-06-PLAN.md (Task 1 checkpoint)
  - .planning/phases/03-permissions-settings-masters/03-07-PLAN.md (Task 1 checkpoint)
---

## Problem

Phase 3은 `checkpoint:decision` 게이트 4개로 시작하고 네 건 모두 `one-way`다 —
되돌리려면 마이그레이션이나 재암호화가 필요하다. 2026-09-20 계획 세션에서
근거(03-CONTEXT·03-RESEARCH의 실측, ROADMAP 성공 기준, squawk 실행 결과)를
보면서 네 건을 전부 **권장안 A**로 확정했다.

그런데 그 답이 어디에도 파일로 남아 있지 않다. `/gsd-execute-phase 3`은
`/clear` 뒤 새 세션에서 돌기 때문에, 기록이 없으면 실행자가 체크포인트에서
물을 때 근거를 다시 못 본 채 다르게 답할 수 있다.

## Solution

`/gsd-execute-phase 3` 실행 중 각 체크포인트에서 **`A`** 라고 답한다.
각 플랜의 `resume-signal`이 "「A」라고 답하면 그대로 확정한다"로 돼 있다.

확정된 내용:

**① 03-01 Task 1 — 계급·권한 모델**
- 계급 식별자 5종: `role-ceo` · `role-division-head` · `role-team-lead` ·
  `role-pm` · `role-sysadmin` (이름은 데이터라 바뀌어도 식별자는 영구)
- **`roles`에 순위(rank) 컬럼을 두지 않는다** — 순위 비교가 can()/visible()/
  scopeFor() 밖의 네 번째 판정 경로가 되어 ROADMAP 성공 기준 2를 구조적으로 깬다
- `users`의 관리자 불리언 컬럼을 남긴다 — `.squawk.toml`이 `ban-drop-column`을
  예외로 두지 않아 `pnpm lint:sql`이 DROP COLUMN을 거부한다(실측)
- 백필: 관리자 불리언 true → `role-sysadmin`, false → `role-pm`. 나머지 3종은
  관리자가 화면에서 재배정
- `archived_by`에 FK를 걸지 않는다 — Drizzle 순환 참조를 피하고, 행동 로그가
  권위 있는 행위자 기록을 담는다

**② 03-04 Task 1 — Phase 4 설정 조회 계약**
- 두 저장 표 · `getSettingValue(def, {asOf})` (정의 객체를 넘겨 반환 타입 추론)
- `effective_from <= asOf` 경계 포함
- 미래 페이즈가 읽을 키는 `readBy: { phase: "4" }` 예외 표시 — ADMN-05의
  "등록됐지만 안 읽는 키는 테스트 실패"와 ROADMAP의 "세율 키를 Phase 3에 등록"이
  정면충돌하는 것을 푸는 장치

**③ 03-06 Task 1 — 암호문 직렬화 형식**
- `v1:<iv>:<tag>:<ciphertext>` · 키는 base64 32바이트 · 복호화 실패 fail-closed
- 뒤 4자리는 별도 평문 컬럼 (목록 화면이 행마다 복호화하지 않게 하고, 그래서
  복호화 호출 자체가 "마스킹 해제"라는 의미를 갖는다)
- 키 회전은 새 버전 키 추가 + 재암호화 스크립트, v1·v2 혼재 복호화를 단위 테스트로 증명

**④ 03-07 Task 1 — Excel 내보내기 수단**
- **UTF-8 BOM CSV, 신규 의존성 0**
- 이 선택으로 03-RESEARCH의 "이 페이즈는 새 의존성 0" 판정이 유효하게 남는다 —
  Package Legitimacy Gate를 새로 돌릴 일이 없다
- 서식이 실제로 필요해지면(Phase 9 손익 내보내기) 직렬화 함수 교체 하나로
  `.xlsx`로 승격할 수 있게 반환 형태를 지금 고정한다
