# 03-01 Task 1: 계급·권한 모델의 되돌릴 수 없는 문 — 확정 답

**결정:** 옵션 A — 다섯 항목 전부 계획 문서(03-CONTEXT.md D-33~D-40, 03-RESEARCH.md 실측)
그대로 확정.

**근거:** `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`에 2026-09-20
계획 세션에서 사용자가 이미 검토·확정한 기록이 있다. 이 플랜의 `<resume-signal>`은
「A」 답변을 다섯 항목 그대로 확정하는 것으로 정의한다. 그 기록을 실행 시점에 그대로
적용한다 — 다시 묻지 않는다.

## 다섯 항목

**① 계급 시드 5종과 식별자 문자열(영구)**
`role-ceo`(대표) · `role-division-head`(본부 책임자) · `role-team-lead`(팀장) ·
`role-pm`(기획 PM) · `role-sysadmin`(시스템 관리자). 이름은 데이터, 식별자 문자열은
영구.

**② `roles`에 순위(rank) 컬럼을 두지 않는다**
순위 비교는 `can()`/`visible()`/`scopeFor()` 밖의 네 번째 판정 경로가 되어 ROADMAP
성공 기준 2("판정은 세 함수에서만")를 구조적으로 깬다. 표시 순서용 `sortOrder`만 둔다.

**③ `users`의 관리자 불리언 컬럼(`is_admin`)을 남긴다(드롭하지 않는다)**
`.squawk.toml`이 `ban-drop-column`을 예외로 두지 않아 `pnpm lint:sql`이 DROP COLUMN을
거부한다(03-RESEARCH.md §3 실측). 코드는 이 플랜 이후 이 컬럼을 더 이상 읽지 않는다
(참조 0 메타 테스트는 03-02가 고정한다).

**④ 백필 규칙(03-RESEARCH.md A4)**
`is_admin = true` → `role-sysadmin`. `is_admin = false` → `role-pm`(기본 계급). 나머지
3종(대표·본부 책임자·팀장)은 관리자가 화면에서 재배정한다.

**⑤ 새 마스터 표의 보관함 컬럼**
`archived_at timestamp` · `archived_by text`, `archived_by`에는 FK를 걸지 않는다 —
`roles`·`code_items` ↔ `users` ↔ `roles` 사이의 Drizzle 순환 참조를 피하고, 권위 있는
행위자 기록은 행동 로그(`action_log.actor_id`)가 이미 담당한다.

## Task 2가 이 값을 쓰는 지점

- `domain/permissions/roles.ts`의 `SEED_ROLES` 배열이 ①의 식별자·이름 5쌍을 그대로 쓴다
- `db/schema/roles.ts`가 ②·⑤를 반영(순위 컬럼 없음, `archivedAt`/`archivedBy` FK 없음)
- `db/schema/auth.ts` 편집이 ③(기존 `isAdmin` 컬럼 한 글자도 안 바꿈)을 지킨다
- `db/migrations/0003_*.sql`의 백필 UPDATE 두 문장(Task 3)이 ④를 그대로 구현한다

이 답은 마이그레이션 없이 되돌릴 수 없다(reversibility: one-way) — Task 2부터는 이
문서의 값을 사실로 취급한다.
