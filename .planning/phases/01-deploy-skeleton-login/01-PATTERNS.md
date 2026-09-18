# Phase 1: 배포 스켈레톤·로그인 - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 24 (created; repo is greenfield app-code-wise)
**Analogs found:** 3 / 24 (real in-repo analogs) — remaining 21 have no in-repo analog; cite RESEARCH.md code examples instead

## Repo State Note

리포에 애플리케이션 코드가 없다(그린필드). 트래킹된 비-문서 파일은 `scripts/install_pkgs.sh`, `scripts/gsd-relativize.sh`, `.claude/settings.json`, `.gitignore`, `.gitattributes`, `CLAUDE.md`, `TODOS.md`, `docs/*` 뿐이다. 아래 표에서 "analog"가 있는 항목은 실제 트래킹된 파일이고, 없는 항목은 RESEARCH.md의 `## Architecture Patterns` 절 아래 Pattern 1~9(코드 예시)을 참조점으로 쓴다.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.claude/settings.json` (SessionStart dev-db hook 추가, D-01) | config | event-driven | `.claude/settings.json` (기존 파일 수정) | exact — 이미 존재, 훅 항목만 추가 |
| `scripts/dev-db.sh` | utility | batch | `scripts/install_pkgs.sh` | role-match |
| `scripts/deploy.sh` | utility | batch | `scripts/install_pkgs.sh` | role-match (셸 스크립트 관례만; 배포 로직은 RESEARCH.md Pattern 7-8) |
| `scripts/rollback.sh` | utility | batch | `scripts/install_pkgs.sh` | role-match (로직은 RESEARCH.md Pattern 8) |
| `scripts/bootstrap-gcp.sh` | utility | batch | `scripts/install_pkgs.sh` | role-match (로직은 RESEARCH.md Pattern 9, 511줄 이후 — 필요 시 offset 511부터 추가 Read) |
| `scripts/account-cli.ts` (CLI create/reset/unlock) | utility | CRUD | 없음 | no analog — RESEARCH.md Pattern 3 (`setUserPassword`/`revokeUserSessions`) 참조 |
| `db/client.ts` | config/service | request-response | 없음 | no analog — RESEARCH.md Pattern 6 (Cloud SQL connector vs Auth Proxy 스위치) |
| `lib/auth.ts` (betterAuth 인스턴스 — SKELETON.md: domain 훅을 등록해야 하므로 `db/`가 아니라 `lib/`) | service | request-response | 없음 | no analog — RESEARCH.md Pattern 1 |
| `db/schema/*.ts` (users, login_attempts, better-auth 테이블) | model | CRUD | 없음 | no analog — Drizzle 스키마, RESEARCH.md 프로젝트 구조 절 |
| `db/migrations/*.sql` | migration | batch | 없음 | no analog — RESEARCH.md Pattern 7 (`drizzle-kit generate` → Squawk) |
| `domain/auth/hooks.ts` (login_attempts lockout) | service | event-driven | 없음 | no analog — RESEARCH.md Pattern 2 (before/after hooks, 전체 코드 포함) |
| `domain/auth/lockout.ts` | service | CRUD | 없음 | no analog — RESEARCH.md Pattern 2와 동일 소스 |
| `domain/system-status/*.ts` | service | request-response | 없음 | no analog — RESEARCH.md OPS-06 행, `pg_stat_activity` + Cloud SQL Admin API 조합은 계획에서 신규 설계 |
| `repositories/users.ts` | model | CRUD | 없음 | no analog — RESEARCH.md 프로젝트 구조 절 "viewer 인자 필수" 규칙만 명시, 구현 예시 없음(계획에서 설계) |
| `repositories/login-attempts.ts` | model | CRUD | 없음 | no analog — 위와 동일 |
| `lib/actions/client.ts` (`authedActionClient`) | middleware | request-response | 없음 | no analog — RESEARCH.md Pattern 4 (전체 코드 포함) |
| `app/(auth)/login/page.tsx` + `login-form.tsx` | component/controller | request-response | 없음 | no analog — 화면 구조는 RESEARCH.md 프로젝트 구조 절; 로그인은 better-auth 클라이언트 SDK(`authClient.signIn.email`)라 Server Action 없음 |
| `app/(app)/account/page.tsx` + `actions.ts` | component/controller | request-response | 없음 | no analog — Pattern 3(`changePassword` revokeOtherSessions) + Pattern 4 |
| `app/admin/system-status/page.tsx` (라우트 그룹이 아니라 실제 `/admin/system-status` 경로 — D-17) | component/controller | request-response | 없음 | no analog — D-17(404 for non-admin), D-18(캐시 없음) 참조, 코드 예시 없음 |
| `app/api/auth/[...all]/route.ts` | route | request-response | 없음 | no analog — better-auth 라우트 핸들러 표준 마운트, Pattern 1 참조 |
| `eslint/rules/require-action-client.mjs` | utility | transform | 없음 | no analog — RESEARCH.md Pattern 5 (설계 스텁 포함) |
| `.github/workflows/ci.yml` | config | event-driven | 없음 | no analog — RESEARCH.md OPS-04 행 + Architecture Diagram의 CI 단계 나열 |
| `.github/workflows/deploy.yml`·`account.yml` | config | event-driven | 없음 | no analog — RESEARCH.md D-05 승격 흐름 + Architecture Diagram |
| `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md` | config/doc | — | 없음 | no analog — RESEARCH.md Architecture Patterns 절의 다이어그램/구조를 초안 골격으로 사용(D-07 근거: CONTEXT.md canonical_refs) |

## Pattern Assignments

### `.claude/settings.json` (config, event-driven)

**Analog:** `.claude/settings.json` (자기 자신, 수정 대상)

기존 SessionStart 훅 배열에 D-01의 dev-db 훅을 같은 매처(`startup|resume`)로 추가한다. 기존 구조:
```json
"hooks": {
  "SessionStart": [
    {
      "matcher": "startup|resume",
      "hooks": [
        { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/install_pkgs.sh" }
      ]
    }
  ]
}
```
새 훅은 이 `hooks` 배열 안에 `scripts/dev-db.sh` 커맨드를 추가하는 형태(같은 matcher 블록에 두 번째 command 항목으로 넣거나, 새 matcher 블록을 추가 — 계획에서 결정). `CLAUDE_CODE_REMOTE` 분기는 `scripts/install_pkgs.sh`의 첫 5줄 패턴을 그대로 따른다(아래 참조).

---

### `scripts/dev-db.sh`, `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/bootstrap-gcp.sh` (utility, batch)

**Analog:** `scripts/install_pkgs.sh` (전체 33줄 — shebang, 조기 종료, `ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"` 패턴, 주석 스타일)

**Shell 관례 excerpt** (전체 파일):
```bash
#!/bin/bash
# <한 줄 설명: 이 스크립트가 언제·왜 돌아가는지>

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
```
- 클라우드/로컬 환경 분기는 `$CLAUDE_CODE_REMOTE` 체크로 통일 (D-01의 "Docker 있으면 컨테이너, 없으면 apt" 분기는 `dev-db.sh` 안에서 `command -v docker`로 별도 검사)
- 실패해도 세션을 막지 않는 방어적 패턴: `|| true`, `|| echo "... unavailable" >&2` (install_pkgs.sh 전체에서 반복됨) — `dev-db.sh`에 적용, `deploy.sh`/`rollback.sh`는 반대로 실패 시 반드시 non-zero exit로 중단해야 함(OPS-01 요구사항, install_pkgs.sh 패턴과 다르게 적용)
- 마지막 줄 `exit 0` 명시적 반환 관례 유지

**Note:** deploy.sh/rollback.sh/bootstrap-gcp.sh의 실제 로직(gcloud 명령 시퀀스)은 이 리포에 analog가 없다. RESEARCH.md Pattern 7(migrate Job), Pattern 8(0%→스모크→100%, rollback), Pattern 9(WIF 부트스트랩, RESEARCH.md 512줄 이후 — 필요 시 `offset=511`로 추가 Read)를 그대로 인용한다.

---

## Shared Patterns

### 코딩 규칙 (CLAUDE.md 전역)
**Source:** `/home/user/ERP_PLANT8_260917/CLAUDE.md`
**Apply to:** 모든 신규 파일
- `any` 금지, TDD(실패 테스트 → 최소 구현), 새 의존성은 이유 한 줄 + 승인
- 커밋 메시지: 영어 접두어(`feat:`/`fix:`/`chore:`/`docs:`) + 짧은 요약, 본문 한국어
- 4계층 import 경계: `app/ → domain/ → repositories/(viewer 필수) → db/` (역방향 import 금지, `eslint-plugin-boundaries`로 강제)

### 인증/세션 (better-auth 설정 전체)
**Source:** RESEARCH.md Pattern 1 (RESEARCH 예시는 `db/auth.ts`; 플랜 배치는 `lib/auth.ts`), 이 문서 179번째 줄 부근 — 전체 코드 블록 그대로 복사 가능
**Apply to:** `lib/auth.ts`, `app/api/auth/[...all]/route.ts`, `lib/actions/client.ts`

### Server Action 미들웨어 (`authedActionClient`)
**Source:** RESEARCH.md Pattern 4 — 전체 코드 블록
**Apply to:** `lib/actions/client.ts`, `app/(app)/account/actions.ts` (로그인은 better-auth 라우트 + 클라이언트 SDK라 Server Action 없음)

### 잠금 로직 (before/after hooks + login_attempts)
**Source:** RESEARCH.md Pattern 2 — 전체 코드 블록 (DB 저장 필수, 인스턴스 메모리 카운트 금지 — F3 실패 모드)
**Apply to:** `domain/auth/hooks.ts`, `domain/auth/lockout.ts`

### 세션 전체 만료 (비밀번호 변경/재발급)
**Source:** RESEARCH.md Pattern 3 — 전체 코드 블록
**Apply to:** `domain/auth/password.ts`(`finalizePasswordChange` — 액션은 domain만 부른다), `domain/auth/accounts.ts`(`resetPassword`), `scripts/account-cli.ts`

### DB 연결 스위칭 (로컬 Auth Proxy vs Cloud Run connector)
**Source:** RESEARCH.md Pattern 6 — 전체 코드 블록 + 커넥션 공식(16A) 주의사항
**Apply to:** `db/client.ts`

## No Analog Found

리포에 애플리케이션 코드가 전혀 없으므로 아래 전부가 "no analog" 상태다. 각 파일의 참조점은 RESEARCH.md의 해당 Pattern/절이다(위 표의 세 번째 열 참조).

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `db/*`, `domain/*`, `repositories/*`, `app/*`, `lib/actions/*`, `eslint/rules/*`, `.github/workflows/*` | 다양 | 다양 | 그린필드 — 위 File Classification 표에서 각 파일의 RESEARCH.md 참조 절을 사용 |

## Metadata

**Analog search scope:** 리포 루트 전체 (`git ls-files`), `.claude/`, `scripts/`, `docs/`
**Files scanned:** `.claude/settings.json`, `scripts/install_pkgs.sh`, `scripts/gsd-relativize.sh`, `.gitignore` (`.claude/gsd-core/`, `.claude/skills/`는 지시에 따라 analog 대상에서 제외)
**Pattern extraction date:** 2026-09-18
**Tracked-source gate:** 위에 인용한 두 analog(`.claude/settings.json`, `scripts/install_pkgs.sh`)는 `git ls-files`로 트래킹 확인됨. gitignored 미러 경로는 인용하지 않았다.
