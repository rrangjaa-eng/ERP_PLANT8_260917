---
created: 2026-09-22T12:20:43.782Z
title: 새 세션 인수인계 — 관리자 메뉴 → 코덱스 디자인 리뷰 → Phase 4 실행
area: planning
severity: minor
files:
  - ui/shell/role-menu.ts
  - ui/shell/MoreSheet.tsx
  - docs/design/SYSTEM.md
  - docs/design/DECISIONS.md
  - test/unit/ui/role-menu.test.ts
  - .planning/phases/04-project-quote-ledger/
---

## Problem

Phase 4 계획(`/gsd-plan-phase 4`)이 끝난 시점에 사용자와 합의한 다음 작업 순서를 다음 세션으로 넘긴다. 세션 메모리의 task 목록은 세션이 끝나면 사라지므로 디스크에 남긴다.

Phase 4는 **계획만** 끝났고 실행은 아직이다. 사용자 결정으로 관리자 메뉴 정리와 코덱스 디자인 리뷰를 Phase 4 실행보다 **먼저** 한다 — 정리된 SYSTEM.md 기준 위에서 Phase 4의 새 화면(프로젝트·견적·리저브)을 만들기 위해서다. 역순이면 리뷰에서 나온 수정이 새 화면까지 번진다.

## Solution

세 가지를 이 순서로 한다.

### ① 관리자 메뉴 정리 — 옵션 B (`/gsd-quick`)

드롭다운/「더보기」 시트에 「관리」 **한 줄**만 두고, 새 `/admin` 인덱스 화면에서 관리 화면 10개를 3그룹으로 보여준다.

| 그룹 | 항목 |
|---|---|
| 마스터 | 사람 · 거래처 · 법인카드 마스터 · 코드표 |
| 설정·권한 | 권한표 · 정보 노출표 · 시스템 설정 |
| 운영 기록 | 시스템 상태 · 행동 로그 · 보관함 |

현재 `ui/shell/role-menu.ts`의 `ADMIN_MENUS`가 평평한 10개이고, 계정 그룹 3줄까지 더해 관리자는 드롭다운 하나에서 13줄을 본다.

**범위(한 파일로 안 끝남 → `/gsd-quick` 필요):**
`docs/design/SYSTEM.md` 개정(§6-0 (a)·§6-8·§7-8) → `docs/design/DECISIONS.md`에 이유 기록 → `ui/shell/role-menu.ts` → `ui/shell/MoreSheet.tsx`·TopBar → `app/(app)/admin/page.tsx` 신규 → `test/unit/ui/role-menu.test.ts`

**주의:** `role-menu.test.ts`는 상수가 아니라 SYSTEM.md 문장 기준으로 통과/실패가 갈리게 짜여 있다 — 문서를 먼저 고쳐야 한다.
**근거:** 관리 화면은 Phase 7(공휴일·지급일·알림·SMTP 설정)에서 더 늘어난다. 항목이 적은 지금이 구조를 바꾸기에 제일 싸다.
**완료 후:** Post-build 넷 — `/review` → `/qa` → `/design-review` → `/ship`

### ② 코덱스 전체 통합 디자인 리뷰

**Phase 4 실행 전에** 한다(사용자 확정).

**대상은 현존 화면만** — 앱 셸·로그인·내 계정·관리자 10화면 + 새 `/admin` 인덱스. 프로젝트/견적/리저브 화면은 아직 없으므로 제외.

**네트워크 이상 없음**(2026-09-22 실측): 프록시가 `api.openai.com`·`chatgpt.com`·`auth.openai.com` 전부에 CONNECT 터널을 연다. 앞서 본 421/403은 프록시가 아니라 Cloudflare(OpenAI 엣지)가 맨 curl에 준 응답이었고, `api.openai.com/v1/models`가 OpenAI 정품 401 JSON을 반환한다. `codex-cli 0.155.1` + `/root/.codex/auth.json` 존재. 블로커 없음.

**설정:** `review.default_reviewers=["codex"]`, `models.codex="gpt-5.6-sol"`, `effort.codex="xhigh"`
**착수 시 정할 것:** `/gsd-review --codex`(플랜 대상)와 `/design-review`(화면 일관성)는 대상이 다르다. 화면 대상 통합 리뷰이므로 코덱스에 넘길 범위·입력을 정해야 한다. ①의 Post-build `/design-review`와 중복되지 않게 정리한다.

### ③ `/gsd-execute-phase 4`

7플랜 / 4웨이브. 실행 후 Post-build 넷 필수이며, 권한·외부 입력을 건드리므로 **`/cso` 포함**.

**실행 전 알아야 할 체크포인트:**
- `04-01` Task 1 — 일방통행 결정 7건 묶음(`checkpoint:decision`, blocking). `A`로 답하면 전체 권고 채택
- `04-03` — `autonomous: false`. 인트라넷 덤프 경로 필요(`checkpoint:human-action`) + `amount_basis` 규칙을 경영관리가 표본 대조(`checkpoint:human-verify`). **「보류」면 ROADMAP 성공 기준 7이 미착수로 남고 페이즈는 6/7로 끝난다**(플랜에 명시됨)
- `04-04` Task 3 — 실제 Excel 3×3 붙여넣기(`checkpoint:human-verify`)

**주의:** `04-01`은 49파일 / 추정 토큰이 예산과 동률(여유 0). 계획에 재분할 방아쇠 3개가 적혀 있다 — 컨텍스트 60% 초과, `moneyColumns` 헬퍼 폴백, `db:generate` 2회 이상.

---

재개는 `/gsd-progress`. PR #34(`claude/gsd-plan-phase-4-1pszl3`)에 계획 산출물이 전부 올라가 있다.
