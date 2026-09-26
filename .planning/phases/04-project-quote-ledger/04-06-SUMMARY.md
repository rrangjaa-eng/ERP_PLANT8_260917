---
phase: 04-project-quote-ledger
plan: 06
subsystem: database
tags: [postgres, drizzle, migration, gate-rules, project-status]

requires:
  - phase: 04-01
    provides: projects·quote_* 스키마, 게이트 단일 진입점(domain/rules/gate.ts), project.completed-lock
  - phase: 04-10
    provides: code_items.description 컬럼과 0011 마이그레이션(번호의 앞)
  - phase: 04-28
    provides: domain/quotes/lines.ts 저장 경로(같은 파일을 먼저 고친 플랜)
provides:
  - "0012_project_status_five_values 마이그레이션 — settled → completed 재매핑, 코드표 다섯 값(설명 포함), 네 값 밖이면 RAISE"
  - "domain/projects/status-transitions.ts — PROJECT_STATUSES · ProjectStatus · ALLOWED_TRANSITIONS(import 없는 데이터 모듈)"
  - "게이트 규칙 project.line-edit(완료 → 「완료 · 견적 줄 잠김」) — 옛 project.completed-lock 삭제·교체"
  - "test/integration/project-status.test.ts(04-20·04-21이 확장) · test/integration/migration-upgrade.test.ts(04-41이 확장)"
affects: [04-11, 04-12, 04-13, 04-20, 04-21, 04-22, 04-41, 04-50, phase-5, phase-9, phase-10]

actuals:
  tokens: 27300
  tasks: 2
  commits: 5
plan_head_before: 0db3ea22b24fa6a6b167a2eaf44e2b194093809b

tech-stack:
  added: []
  patterns:
    - "업그레이드 테스트: 난수 이름 임시 DB에 앞 N개 마이그레이션만(임시 폴더 + 자른 journal) 적용 → 옛 데이터 → 전체 적용, 시드 없이 단언 → afterAll DROP WITH (FORCE)"
    - "데이터 마이그레이션 가드: 알려진 값 밖이면 DO $$ … RAISE EXCEPTION으로 전체 롤백(지우지 않는다)"

key-files:
  created:
    - db/migrations/0012_project_status_five_values.sql
    - db/migrations/meta/0012_snapshot.json
    - domain/projects/status-transitions.ts
    - test/integration/project-status.test.ts
    - test/integration/migration-upgrade.test.ts
  modified:
    - db/migrations/meta/_journal.json
    - db/schema/projects.ts
    - domain/seed/index.ts
    - domain/rules/register.ts
    - domain/quotes/lines.ts
    - app/(app)/projects/[id]/page.tsx
    - test/integration/quote-lines.test.ts
    - test/unit/domain/rules-gate.test.ts

key-decisions:
  - "04-06: 프로젝트 상태는 bidding·in_progress·settling·completed·lost 다섯 값 — 옛 settled 행은 0012가 completed로 옮긴다(UPDATE, version+1), 옛 코드표 행은 지운다"
  - "04-06: 완료 잠금 게이트는 project.line-edit 하나 — 완료만 「완료 · 견적 줄 잠김」, 미수주 포함 나머지 네 상태는 통과(D-45). 옛 project.completed-lock은 삭제"
  - "04-06: 0012는 전진 전용 · 첫 줄 -- rollback-floor: 표시 — 복구는 전진 수정 우선, 불가피하면 쓰기 중지 후 SUMMARY의 손실 있는 역 SQL"

patterns-established:
  - "상태·전환 데이터는 import 없는 모듈(domain/projects/status-transitions.ts) 한 곳 — 게이트 규칙과 전환 함수가 같이 읽는다"

requirements-completed: [PROJ-04]

coverage:
  - id: D1
    description: "0012 마이그레이션이 옛 잠금 행을 completed로 옮기고(재시드 없이) 다른 행·줄을 보존하며 코드표를 다섯 값(설명 포함)으로 만든다"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/migration-upgrade.test.ts#(a) 0010 상태의 옛 잠금 행이 completed로 옮겨지고 나머지 행·줄은 그대로이며 코드표가 다섯 값이다"
        status: pass
      - kind: other
        ref: "bash scripts/dev-db.sh && pnpm db:migrate (실제 dev DB erp)"
        status: pass
    human_judgment: false
  - id: D2
    description: "네 값 밖의 상태가 있는 DB에서 0012가 RAISE로 멈추고 아무것도 바뀌지 않는다"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/migration-upgrade.test.ts#(b) 0011 상태에 네 값 밖의 상태가 있으면 남은 마이그레이션이 RAISE로 멈추고 아무것도 바뀌지 않는다"
        status: pass
    human_judgment: false
  - id: D3
    description: "시드 상태 상수와 코드표가 다섯 값(라벨·정렬·설명)으로 같다"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-status.test.ts#(f) 코드표 project_status가 정확히 다섯 값이고 projects.status에 다섯 값 밖의 값이 없다"
        status: pass
    human_judgment: false
  - id: D4
    description: "완료 프로젝트 견적 줄 저장은 project.line-edit가 「완료 · 견적 줄 잠김」으로 거부, 미수주 저장은 통과, 옛 규칙은 등록 목록에 없다"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/rules-gate.test.ts#project.line-edit (D-47·D-45·D-75)"
        status: pass
      - kind: integration
        ref: "test/integration/project-status.test.ts#(g) 미수주 프로젝트의 견적 줄 저장은 통과하고 완료 프로젝트의 저장은 「완료 · 견적 줄 잠김」으로 거부된다"
        status: pass
      - kind: integration
        ref: "test/integration/quote-lines.test.ts#(c)·(c2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "상태 다섯 값 · 사람의 전환 넷 · 메뉴 키 데이터 모듈(import 없음, 순환 없음)"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/import-cycles.test.ts"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-09-24
status: complete
---

# Phase 4 Plan 06: 프로젝트 상태 다섯 값 데이터 Summary

**마이그레이션 0012가 옛 잠금 값 settled를 completed로 옮기고 코드표를 수주중·진행·정산·완료·미수주 다섯 값으로 바꿨다. 완료 잠금은 옛 이진 규칙에서 새 게이트 `project.line-edit`(「완료 · 견적 줄 잠김」)로 끊김 없이 넘어갔고, 옛 데이터 위 업그레이드 테스트로 재매핑·보존·RAISE 가드를 증명했다.**

## Performance

- **Duration:** 약 27분 (2026-09-24T21:05Z → 21:32Z)
- **Tasks:** 2/2
- **Files:** 13 (생성 5 · 수정 8)
- **Commits:** 5 (`git rev-list --count 0db3ea2..HEAD`)

## 실제 마이그레이션 이름

`db/migrations/0012_project_status_five_values.sql` + `meta/0012_snapshot.json` + journal idx 12 — 계획 번호 0012와 같다(생성기 `pnpm db:generate --custom --name project_status_five_values` 출력 그대로). 번호 검증 명령: `ok 0012_project_status_five_values`. 첫 줄: `-- rollback-floor: 0012 상태 재매핑 — 옛 리비전은 다섯 값 DB에서 완료를 잠그지 못한다(04-50 · E2-04)`.

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | 7c64938 | test(04-06): 완료 프로젝트 견적 줄 잠금과 미수주 저장 통과 실패 테스트 (Task 1 RED) |
| 2 | 192f6b6 | feat(04-06): 프로젝트 상태 다섯 값과 완료 견적 줄 잠금 규칙 project.line-edit (Task 1 GREEN) |
| 3 | 3ff7573 | test(04-06): 게이트 규칙 목록에서 옛 이진 규칙이 사라졌다는 실패 테스트 (Task 2 RED) |
| 4 | 2da74dc | feat(04-06): 옛 이진 게이트 규칙 project.completed-lock 삭제 (Task 2 GREEN) |
| 5 | f265219 | test(04-06): 상태 다섯 값 통합 증명과 옛 데이터 업그레이드 테스트(OV-6) |

## Accomplishments

- 0012: 락 타임아웃 한 쌍 → 가드 둘(코드표·프로젝트 행, 네 값 밖이면 RAISE) → `UPDATE projects SET status='completed', version=version+1, updated_at=now() WHERE status='settled'` → 옛 코드표 행 DELETE → `lost` 정렬 4 → `settling`(정산, 2)·`completed`(완료, 3) INSERT(설명 포함). 0009 diff 0줄(`git diff --stat d6b41cf`).
- 시드 상수 다섯 값이 마이그레이션과 글자 그대로 같다(두 통합 테스트가 같은 목록을 한쪽은 시드 DB, 한쪽은 재시드 없는 업그레이드 DB에서 단언).
- `domain/projects/status-transitions.ts`: `PROJECT_STATUSES` · `ProjectStatus` · `ALLOWED_TRANSITIONS`(수주중→진행 · 수주중→미수주 · 미수주→진행 = `projects.status`, 정산→완료 = `projects.complete`), import 없음.
- `project.line-edit` 등록, `lines.ts` 저장 게이트와 `[id]/page.tsx` 편집 판정이 새 규칙을 부른다. Task 1 동안 옛 규칙은 호출자 없이 등록만 남았다가 Task 2에서 삭제(`grep -c completed-lock domain/rules/register.ts` = 0, 머리 주석 교체).

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `pnpm lint:sql` | Found 0 issues in 13 files |
| `bash scripts/dev-db.sh && pnpm db:migrate` (실제 dev DB `erp`) | 성공, 코드표 다섯 값 확인(dev DB 프로젝트 행 0건) |
| 마이그레이션 번호 검증 | ok 0012_project_status_five_values |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | 통과(eslint-plugin-boundaries 설정 폐기 경고만 — 기존) |
| `CI=true pnpm test` | 단위 84 파일 / 905 통과 · 통합 43 파일 / 1066 통과 · E2E 200 통과(2.8m) · 실패 0 |
| 의존성 | `package.json`·`pnpm-lock.yaml` d6b41cf 대비 diff 없음 |

알려진 무관 flake(카드 소유자 편집 E2E)는 이번 전체 게이트에서 나오지 않았다.

## 롤백 자세와 손실 있는 역 SQL (A-28)

0012는 전진 전용이다. 0012는 **머지 묶음 ②**로 나가고, 그 뒤 PR #38 리비전(`status === "settled"` 게이트)으로의 트래픽 롤백은 04-50의 `rollback.sh` 스키마 하한이 0012 첫 줄 `-- rollback-floor:` 표시를 보고 거부한다 — 옛 리비전은 다섯 값 DB에서 완료 행을 잠그지 못하기 때문이다. 복구는 **전진 수정이 먼저**이고, 불가피하면 쓰기를 멈춘 뒤 아래 역 SQL을 적용하고 사람이 트래픽을 옮긴다(배포 창은 04-50 T-04-372, 사용자 확인 대기).

```sql
-- 손실 있음: settling/completed 구분과 0012가 올린 version은 되돌리지 않는다.
UPDATE projects SET status = 'settled' WHERE status IN ('settling', 'completed');
DELETE FROM code_items WHERE table_key = 'project_status' AND value IN ('settling', 'completed');
INSERT INTO code_items (table_key, value, label, sort_order) VALUES ('project_status', 'settled', '완료(정산)', 2);
UPDATE code_items SET sort_order = 3 WHERE table_key = 'project_status' AND value = 'lost';
```

## Deviations from Plan

1. **[계획 해석] 업그레이드 테스트 (a)의 「옛 코드표 네 값」은 넣지 않고 존재를 단언** — 0010 상태 DB에는 0009가 이미 네 값을 넣어 두어 다시 INSERT하면 유일 제약에 걸린다. 적용 전 네 값(`bidding·in_progress·settled·lost`)이 있음을 단언하고 시작한다. 같은 이유로 적용 전 조회는 `description` 없이 한다(0011이 칸을 더한다 — 첫 실행에서 `column "description" does not exist`로 드러난 테스트 쪽 결함, 커밋 전 수정).
2. **[계획 해석] 「시드 상수와 같다」는 같은 리터럴 목록으로 양쪽을 단언** — `PROJECT_STATUS_CODES`는 export되지 않는 상수라 새 export를 만들지 않았다. `project-status.test.ts`(시드된 DB)와 `migration-upgrade.test.ts`(재시드 없는 업그레이드 DB)가 같은 다섯 줄 목록을 `toEqual`로 단언해 시드 = 마이그레이션을 증명한다.
3. **[Rule 1] 시드 머리 주석의 「네 값」 문구를 다섯 값으로** — 상수를 바꾸며 낡게 된 주석(`domain/seed/index.ts`). Task 1 커밋 192f6b6.
4. **RED 증거 기록 형식** — vitest `tap-flat` 출력에는 node-test 형식 요약 줄이 없어 `gsd check tdd-red-evidence`가 0건으로 읽는다. ok/not ok 줄을 세어 `# tests/# pass/# fail`을 덧붙인 기록으로 검증했다(두 RED 모두 `RED_EVIDENCE_OK`, 대상 테스트: quote-lines (c) · rules-gate listGateRules).
5. **Task 1 RED의 (c2) 미수주 케이스는 처음부터 통과** — 옛 규칙도 미수주를 잠그지 않으므로 회귀 방지 케이스다. RED 대상은 (c)였다.

**뮤테이션 확인(단언을 계획보다 느슨하게 바꾸진 않았지만, 구현 뒤 추가된 통과 테스트라서 실행):** 게이트가 미수주도 잠그게 + 시드 `lost` 정렬 3 → (f)(g) 둘 다 실패. 0012에서 `version+1` 제거 + 프로젝트 가드 `IF false` → 업그레이드 (a)(b) 둘 다 실패. 모두 원복 후 초록.

## Known Stubs / 인계

- `app/(app)/projects/[id]/page.tsx`의 `STATUS_LABELS`와 목록(`app/(app)/projects/page.tsx`·`projects-table.tsx`)에 옛 `settled` 라벨이 남아 있다 — 완료 프로젝트 상세 부제는 04-21까지 `completed` 원문을 보인다. 계획이 04-21(코드표 라벨 교체·리터럴 스캔, CEO 리뷰 A-40)에 맡긴 범위라 이 플랜에서 고치지 않았다.
- 재매핑된 demo 행에는 `status_change` 로그가 없다(A-38, 받아들임).
- 누수 스캔 커버리지: 새 모듈은 DTO·액션이 없어 추가 불필요(확인만, `leak-scan.test.ts` 통과).

## TDD Gate Compliance

Task 1: RED 7c64938 → GREEN 192f6b6. Task 2: RED 3ff7573 → GREEN 2da74dc → 통합 증명 f265219. 두 RED 모두 대상 테스트가 계획된 단언으로 실패함을 확인했다.

## 호출한 스킬

`test-driven-development`(구현 전) · `verification-before-completion`(커밋·완료 전) · `systematic-debugging`(업그레이드 테스트 첫 실패 — 원인: 0010 상태에 없는 `description` 칸 조회).

## Next

Ready for 04-20(사람의 전환 넷 — `status-transitions.ts`를 읽는다).

## Self-Check: PASSED
