---
phase: 08-cutover
plan: 02
subsystem: database
tags: [cutover, postgres, advisory-lock, drizzle, cli, gcs]
status: complete

requires:
  - phase: 07.2-new-features
    provides: "expense_date_change_requests 표 · files owner_kind company_logo(07.2-01 — main에 있어 이번에 분류에 넣음)"
provides:
  - "domain/cutover — dryRunCutover · applyCutover(한 트랜잭션) · cleanupCutoverObjects · 확인 문자열 · 백업 가드"
  - "domain/cutover/tables — 공개 스키마 61표 이름 분류 + 완전성 가드 시험"
  - "repositories/cutover — rowSource(공유 잠금 뒤 다음 문장에서 표시 읽기) · 잠금 · 건수 · 비우기 · 카운터 · 표시 · 파일 키"
  - "저장소 쓰기 지점 12곳(9파일)이 source를 rowSource로"
  - "scripts/cutover-cli.ts → dist/cli/cutover-cli.mjs(08-04 Job이 부른다)"
  - "행동 로그 종류 cutover_apply(끌 수 없음)"
  - "ObjectStorage.release"
affects: [08-01, 08-04, 08-07, 08-08, "새 표를 더하는 모든 플랜(cutover-tables 시험)", "source 칸 표에 새 insert를 더하는 모든 플랜(source-writers 시험)"]

actuals:
  tokens: 24300
  tasks: 3
  commits: 6
plan_head_before: 5e2ac7cc658359d67c344975b4f60a7600221fbd

tech-stack:
  added: []
  patterns:
    - "전환 표시 = settings_simple 키 cutover.at + 같은 키 advisory lock(쓰기 지점 공유 · apply 배타)"
    - "삭제 대상 = 코드의 이름 분류 + information_schema · pg_constraint 완전성 가드(source 칸 기준 아님)"
    - "apply 한 트랜잭션: 표시 배타 잠금 → 삭제 표 · 카운터 SHARE ROW EXCLUSIVE → 표시 확인 → 확인 문자열 대조 → 키 수집 → 비우기(지운 수 = 센 수) → 카운터 초기화 → 표시 → 행동 로그"

key-files:
  created:
    - domain/cutover/tables.ts
    - domain/cutover/index.ts
    - repositories/cutover.ts
    - scripts/cutover-cli.ts
    - test/integration/cutover-demo-delete.test.ts
    - test/integration/cutover-tables.test.ts
    - test/integration/cutover-concurrency.test.ts
    - test/unit/cutover/parse-args.test.ts
    - test/unit/cutover/source-writers.test.ts
  modified:
    - domain/action-log/record.ts
    - repositories/projects.ts
    - repositories/quote-revisions.ts
    - repositories/quote-lines.ts
    - repositories/revenue-entries.ts
    - repositories/revenue-issue-requests.ts
    - repositories/reserve-entries.ts
    - repositories/corp-card-usages.ts
    - repositories/expense-payments.ts
    - repositories/purchase-requests.ts
    - lib/gcp/storage.ts
    - lib/gcp/gcs.ts
    - scripts/build-cli.mjs
    - test/integration/fakes/memory-storage.ts
    - test/integration/quote-revisions.test.ts
    - test/unit/action-log/record.test.ts
    - test/unit/deploy/cli-bundle.test.ts
    - test/unit/lib/gcp/storage-gcs.test.ts
    - test/unit/lib/gcp/storage-local.test.ts

key-decisions:
  - "rowSource는 저장소 규약(plant8/repository-viewer-param)대로 rowSource(viewer, tx) — 플랜 문구 rowSource(tx)에서 viewer만 더함"
  - "files · upload_intents는 FK가 없어 DELETE_ORDER 밖 FILE_TABLES로 두고 맨 먼저 지울 종류로만 비운다(분류 시험이 「FK 없음」을 고정)"
  - "확인 문자열의 총건수 = 표별 건수 합 + 초기화할 카운터 행 수"
  - "CLI는 apply 전에 저장소를 얻는다 — 버킷 설정이 없으면 아무것도 지우기 전에 종료 1"
  - "copyQuoteLines는 원본 source를 잇지 않고 복사 시점의 rowSource를 쓴다(기존 복사 시험 단언 갱신)"

patterns-established:
  - "새 표 → domain/cutover/tables.ts 한 분류에 넣어야 cutover-tables 시험이 녹색"
  - "source 칸 표의 새 insert → rowSource(viewer, tx) + source-writers 고정 목록 갱신"

requirements-completed: [MIG-05]

coverage:
  - id: D1
    description: "dry-run은 아무것도 바꾸지 않고 표별 건수 · 카운터 초기화 행 수 · 지울 객체 수 · kept · 확인 문자열만 돌려준다"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts#dry-run은 건수와 확인 문자열만 돌려주고 아무 행도 바꾸지 않는다"
        status: pass
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts#dry-run은 지울 객체 수와 남는 업무성 표 건수(kept)를 보이고, kept 표에 행을 더해도 확인 문자열은 같다"
        status: pass
    human_judgment: false
  - id: D2
    description: "apply 한 트랜잭션으로 삭제 분류 표 전부가 비고 cert 제외 카운터가 초기화되며 마스터 · 설정 · 실데이터 · 지킬 파일 · action_log(+1)는 그대로, 다음 프로젝트 번호는 서울 연도 두 자리 + 001"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts#삭제 분류 표가 전부 1행 이상인 상태에서 apply하면 전부 비고 유지 표 · 지킬 파일 · cert 카운터는 그대로 · action_log +1"
        status: pass
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts#apply 뒤 새 프로젝트는 source 'live' · 번호는 서울 연도 두 자리 + 001이다"
        status: pass
    human_judgment: false
  - id: D3
    description: "모든 공개 표가 정확히 한 분류 · 삭제 표 FK 순서 · 유지→삭제 FK 없음 · source 표 ⊂ 삭제 · 파일 소유 종류 분류(새 표 누락을 CI가 막는다)"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-tables.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "apply 뒤 저장소 쓰기 지점 12곳 전부 source 'live'(복사 줄 포함) · 새 insert의 rowSource 누락을 단위 시험이 막는다"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts#apply 뒤 저장소 쓰기 지점 12곳이 전부 source 'live'로 쓴다(복사한 줄 포함)"
        status: pass
      - kind: unit
        ref: "test/unit/cutover/source-writers.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "거부 — already_cut_over · confirm_mismatch · backup_not_fresh(4갈래) · 종료 3 · 로그에 backup.kind"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts (백업 가드 4종 · 재실행 · 건수 변경 · CLI 백업 거부)"
        status: pass
    human_judgment: false
  - id: D6
    description: "중간 실패는 한 칸도 안 바꾸고, 겹친 쓰기는 apply 커밋 뒤로 밀린다(live · 행 남음), 동시 apply 둘은 하나만 성공"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-concurrency.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "증빙 객체 — 삭제 전 키 수집 → 커밋 직후 done · pending 로그 → release → delete(10분 · 연속 실패 5 상한) → 고아 기록"
    requirement: MIG-05
    verification:
      - kind: integration
        ref: "test/integration/cutover-demo-delete.test.ts (Task 3 객체 정리 4건)"
        status: pass
      - kind: unit
        ref: "test/unit/lib/gcp/storage-gcs.test.ts · storage-local.test.ts (release)"
        status: pass
    human_judgment: false
  - id: D8
    description: "CLI 인자 규칙 · 종료 코드 0/1/2/3 · 번들 진입점"
    verification:
      - kind: unit
        ref: "test/unit/cutover/parse-args.test.ts · test/unit/deploy/cli-bundle.test.ts"
        status: pass
      - kind: other
        ref: "pnpm build:cli && node dist/cli/cutover-cli.mjs (dry-run 0 · --apply 확인 문자열 없음 2 · 백업 조회 불가 3 · --confirm= 2)"
        status: pass
    human_judgment: false
  - id: D9
    description: "운영 IAM DB 사용자의 DELETE 권한 · 실제 GCS 버킷 release/delete 권한(가정 A1 · T-08-02-10)"
    verification: []
    human_judgment: true
    rationale: "로컬에는 Cloud SQL IAM · GCS가 없다 — 스테이징 apply 리허설(08-07) 또는 운영 apply 첫 문장에서만 드러난다"

duration: 62min
completed: 2026-11-15
---

# Phase 8 Plan 02: 전환 도구(dry-run → apply 한 트랜잭션 · 이름 분류 · rowSource · 객체 정리) Summary

**운영 DB의 연습 업무 기록을 한 트랜잭션으로 비우는 CLI — 61표 이름 분류와 완전성 가드, 확인 문자열 · 백업 3시간 · 재실행 거부, 쓰기 지점 12곳의 rowSource 공유 잠금, 커밋 뒤 증빙 객체 release → delete(상한 · 고아 기록)**

## Performance

- **Duration:** 62분
- **Started:** 2026-11-15T09:20:35Z
- **Completed:** 2026-11-15T10:23Z
- **Tasks:** 3/3 (트레이서 1 + auto 2, 모두 TDD RED → GREEN)
- **Files modified:** 28 (새 9 · 수정 19)

## Accomplishments

- `dryRunCutover`: 표별 건수(파일 표는 지울 소유 종류만) · 초기화할 카운터 행 · `objects` · `kept`(정보) · 확인 문자열 `<총건수>-<sha256 8자리>`. 전환 뒤에는 `{ marker, demoRemaining }`.
- `applyCutover`: 트랜잭션 밖 백업 가드(SUCCESSFUL · 180분) → 표시 배타 잠금 → 파일 표 · 삭제 표 · `document_counters` `SHARE ROW EXCLUSIVE` → 표시 있으면 `already_cut_over` → 확인 문자열 다르면 `confirm_mismatch` → 지울 증빙 키 수집 → 비우기(지운 수 ≠ 센 수면 throw · 전체 롤백) → cert 제외 카운터 삭제 → `cutover.at` = 서울 시각 `+09:00` → `cutover_apply` 행동 로그.
- `rowSource(viewer, tx)`: 공유 advisory 잠금 문장과 표시 읽기 문장을 따로 실행. 저장소 쓰기 지점 12곳(projects 1 · quote-revisions 2 · quote-lines 3 · revenue-entries · revenue-issue-requests · reserve-entries · corp-card-usages · expense-payments · purchase-requests 각 1)이 이것을 쓴다. `repositories/`에 `"demo"` 글자가 없다.
- `cleanupCutoverObjects`: 키마다 `release` → `delete`, `OBJECT_CLEANUP_MAX_MS` 600000 · `OBJECT_CLEANUP_MAX_CONSECUTIVE_FAILURES` 5에서 멈추고 남은 키 전부를 고아로 센다.
- CLI 로그 순서: `cutover.done`(objects = 키 수) → `cutover.objects.pending { total, keys }` → `cutover.objects { total, deleted, orphaned, orphanKeys, stopped }`. 거부는 `cutover.refused { reason, backup? }` 종료 3.

## Task Commits

1. **Task 1 트레이서** — RED `5290390` · GREEN `04fa196`
2. **Task 2 표 분류 · 쓰기 지점 12곳** — RED `1ab3876` · GREEN `df71855`
3. **Task 3 객체 정리 · 거부 · 원자성** — RED `b78ecb8` · GREEN `9fa4bf6`

트레이서 게이트: end-of-phase · 자동 검증만 → Task 1 `<verify>`를 다시 돌려 통과(unit 153/153 · integration 48/48 · lint · typecheck · build:cli) 뒤 확장.

## Verification (마지막 실행)

- 단위: cutover(parse-args · source-writers) · cli-bundle · action-log · storage-gcs · storage-local · import-cycles — 12파일 199/199 통과
- 통합(DB `erp_test_0802`): cutover-demo-delete · cutover-tables · cutover-concurrency · demo-data · document-counters · action-log · schema/action-log-immutable · quote-revisions · projects-create-concurrency · company-logo — 10파일 131/131 통과
- 쓰기 지점 저장소 통합(quote · revenue · reserve · corp-card · payment · purchase · projects-create — 42파일, Task 2 뒤): 995 중 994 통과 → 실패 1(quote-revisions 복사 시험)은 의도된 동작 변경이라 단언을 고친 뒤 그 파일 23/23 통과
- `pnpm lint` 0 · `pnpm typecheck` 0(아래 환경 메모) · `pnpm build:cli` 0 · `node dist/cli/cutover-cli.mjs` 실제 실행 확인
- 변이 확인(E3): rowSource를 한 문장으로 → 동시성 시험 빨강(`'demo'`), apply의 표 잠금 제거 → 빨강(겹친 쓰기가 먼저 끝남). 둘 다 되돌림.
- 전체 통합 · E2E는 돌리지 않았다(CLAUDE.md §5 — CI 몫).

## 실행자가 부른 스킬

- `superpowers:test-driven-development` — 구현 전
- `superpowers:verification-before-completion` — 첫 커밋 전(이후 커밋마다 그 규칙대로 실행 증거 확인)
- `superpowers:systematic-debugging` — quote-revisions 복사 시험 실패 · 동시성 시험 변이 생존 조사 전

## PR 본문 자료

### 260907 대조

옛 저장소(`/home/user/erp_plant8_260907`)가 이 실행 환경에 없어 줄 번호는 다시 확인하지 못했다 — 플랜의 2026-11-04 확인값이다.

| 영역 | 260907 (file:line) | 이 플랜 |
|---|---|---|
| 개시 청소 범위 | `docs/90_결정-기록.md:1587-1592` 업무 자료 전부를 비움 | 같은 계열 — 이름 분류한 업무 기록 표 22개 + 파일 표 2개(지울 종류만)를 비운다(C1) |
| 감사 기록 | 같은 절 ③ 감사 기록 · 알림 · 세션도 비움 · 삭제 막이 트리거를 트랜잭션 안에서 내렸다 되살림 | **다르게 간다** — action_log는 불변(0046)이라 남기고(+1) 트리거를 건드리지 않는다 · 세션도 남긴다 · 알림 기록(notification_log)은 비운다 |
| 파일 정리 순서 | `server/도구/시험파일지우기.mjs:5` 청소 SQL보다 먼저 · `:31-35` 먼저 세어 보기 · 판 이름 찍고 3초 대기 | 키를 삭제 전 같은 트랜잭션에서 읽고 커밋 뒤 release → delete · dry-run이 `objects`로 먼저 센다 · 환경은 `cutover.done.env`(APP_ENV) |
| 실판 열쇠 | `server/도구/이관/gates.mjs:74-75` `--실판허용` + `--백업했다` | 확인 문자열(dry-run과 같은 건수) + 백업 최신성 자동 가드(SUCCESSFUL · 180분) + 운영 확인 입력(08-04) |
| 문서 번호 | `docs/90_결정-기록.md:1587` 번호가 max 기반 | 카운터 표라 삭제만으로 안 돌아온다 — cert 제외 전부 초기화로 첫 번호 = 서울 연도 두 자리 + 001(2027-01-04면 27001) · 첫 순번 1 |
| 시드 자국 | `db/schema/150_seed_cleanup.sql:1-20` | 따르지 않는다(불변 로그) |

### 결정 변경 기록 (decision delta)

플랜의 기록(D8-05 대상 기준 → 이름 분류 C1 · 행동 로그 남김 · 전환 표시 `cutover.at` · 번호 초기화 cert 제외 전부 · D1 = A · D3 = A)은 그대로 구현했다. 실행 중 더한 것:

- **표 수 60 → 61:** 07.2-01(`expense_date_change_requests` · files `company_logo`)이 main에 있어 삭제 표 · 지킬 파일 종류에 넣었다. **07.2-01 실행자에게 넘길 두 줄은 해당 없음**(이미 반영).
- **rowSource 서명:** 플랜 `rowSource(tx)` → `rowSource(viewer, tx)`. 저장소 lint 규칙 `plant8/repository-viewer-param`이 첫 인자 viewer를 강제한다(CLAUDE.md 우선).
- **파일 표 위치:** 플랜 DELETE_ORDER 안의 files · upload_intents를 별도 `FILE_TABLES`로 빼 맨 먼저 지울 종류로만 비운다. 분류 시험 「정확히 하나」를 지키려는 것이고, 두 표에 FK가 없음을 시험이 고정한다.
- **확인 문자열 총건수:** 표별 건수 합 + 초기화할 카운터 행 수(플랜에 정의 없음 — 해시 입력과 같은 범위).
- **CLI 저장소 시점:** apply 전에 `getObjectStorage()`를 부른다 — 버킷 설정 누락이면 DB를 지우기 전에 종료 1.
- **dryRunCutover 인자:** 백업 조회가 필요 없어 deps를 받지 않는다(`dryRunCutover(viewer)`).
- **서울 시각:** `lib/dates`에 시각용 서울 함수가 없어 domain 안에서 `+9h` ISO에 `+09:00`을 붙인다.

### 겹침 표

| 상대 | 상태 | 겹치는 파일 |
|---|---|---|
| 07.2 · 07.3 · 07.4 · 07.5 · 07.6 플랜 | 전부 SUMMARY 있음(main 반영) | 없음 — 아직 main에 없는 07.x 플랜이 없다 |
| 08-01(같은 웨이브 · 병렬) | 진행 중 | 없음 — 08-01은 docs/CUTOVER · OPERATIONS · RESTORE · domain/ops/restore-check-tables · 그 시험들 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] rowSource 첫 인자 viewer**
- **Found during:** Task 1 lint
- **Issue:** `plant8/repository-viewer-param` — 저장소 export는 viewer가 첫 인자
- **Fix:** `rowSource(viewer, tx = db)` · 호출 12곳 모두 그 꼴
- **Commit:** 04fa196

**2. [Rule 1 - 의도된 동작 변경] quote-revisions 복사 시험 단언**
- **Found during:** Task 2 쓰기 지점 저장소 통합
- **Issue:** `(r2) 복사가 업무 컬럼을 전부 보존한다`가 source까지 원본과 같기를 요구 — 플랜은 copyQuoteLines가 rowSource를 쓰게 한다
- **Fix:** source를 비교에서 빼고 원본 `legacy` · 복사본 `demo`(전환 전 rowSource)로 단언
- **Files modified:** test/integration/quote-revisions.test.ts
- **Commit:** df71855

**3. [Rule 2 - 시험 보강] 동시성 시험이 변이를 놓쳤다**
- **Found during:** Task 3 변이 확인
- **Issue:** 한 문장 rowSource 변이가 살아남음 — 기다린 쪽은 트랜잭션의 첫 rowSource(프로젝트)인데 매출 줄만 단언했다. 표 잠금 제거도 「행이 남는다」 단언으로는 못 잡는다
- **Fix:** 겹친 트랜잭션의 프로젝트 source = live 단언 + 끝난 순서(apply 먼저) 단언. psql로 「한 문장 안 잠금 대기 = 대기 전 스냅숏」을 직접 확인한 뒤 고쳤다
- **Commit:** b78ecb8

**4. [Rule 2] cutover_apply 단위 단언**
- `test/unit/action-log/record.test.ts`에 세 배열 · 라벨 단언 한 건(플랜 files 목록 밖 시험 파일). Commit 5290390

**5. [Rule 1 - 시험] 중간 실패 시험의 오류 꼴**
- drizzle이 pg 오류를 「Failed query」로 감싸 RAISE 문구가 `cause`에 있다 — 단언을 `cause.message`로. Commit b78ecb8

**Total deviations:** 5 auto-fixed (Rule 1 ×2 · Rule 2 ×2 · Rule 3 ×1). **Impact:** 동작 범위는 플랜 그대로 — 서명 한 칸 · 시험 단언 보강뿐.

## 환경 메모

- 이 컨테이너의 Node 기본 힙(2GB)으로는 `pnpm typecheck` · `pnpm lint`가 OOM(exit 134)으로 죽는다 — `NODE_OPTIONS=--max-old-space-size=8192`로 돌려 통과. 코드 문제가 아니다(CI 러너 확인은 CI 몫).
- 통합 시험은 오케스트레이터 지시대로 `erp_test_0802`만 썼다(`pnpm db:reset:test`는 공유 `erp_test`를 지우므로 쓰지 않음 — globalSetup이 이 DB를 마이그레이션한다).
- `--run-url`이 든 CLI 실행은 워크트리 가드가 명령을 막아 단위 시험(parse-args)으로만 확인했다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표면(CLI 인자 · 운영 DB 삭제 · 버킷 객체 삭제)은 플랜 위협 모델 T-08-02-01~10에 있다.

## Next

08-04(cutover.yml 워크플로 · Job 배포 줄)가 `dist/cli/cutover-cli.mjs`와 위 인터페이스 계약을 쓴다. 이 PR(C2)의 게이트(/review · /cso · Opus 독립 검토 1명)는 오케스트레이터 몫.

## Self-Check: PASSED

- 만든 파일 9개 디스크에 있음 · 커밋 6개(5290390 · 04fa196 · 1ab3876 · df71855 · b78ecb8 · 9fa4bf6) 로그에 있음
- 수락 기준: Task 1(cutover_apply 3 · prune-scope 무변경 · advisory shared 1 · SHARE ROW EXCLUSIVE 1 · projects rowSource 2 · build-cli cutover-cli 2 · domain/cutover의 @/db import 0 · db/ .github/ deploy.sh infra/ app/ domain/settings/ 무변경 · SETTING_DEFS 단언) · Task 2(repositories "demo" 0 · quote-lines rowSource 4 · quote-revisions 3 · 스키마 질의 4 · leave_adjustments · action_log 분류) · Task 3(storage release 6 · gcs "release" 1 · domain cutover.objects 1 · 거부 단언 8 · CLI pending 1 · 상한 상수 4 · BEFORE DELETE 1 · already_cut_over 2) 전부 통과
- STATE.md · ROADMAP.md 무변경
