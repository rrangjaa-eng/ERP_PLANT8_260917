---
phase: 08-cutover
plan: 01
subsystem: ops-docs
tags: [cutover, runbook, migration, restore-rehearsal, pitr]
requires:
  - phase: 04.4
    provides: restore-rehearsal.yml · RESTORE_CHECK_TABLES · docs/RESTORE.md
provides:
  - 9/18 뼈대 DB에서 남은 마이그레이션 한 번 적용 + 실패 시 원자성 통합 시험
  - 프로덕션 복원 리허설이 직원 입력 표 12개를 읽는 확인 목록(CEO-3)
  - docs/CUTOVER.md 첫 운영 승격 · 전환 런북(§0~§6)
  - RESTORE §3 수동 백업 선택 · PITR 클론 절, OPERATIONS §14 PITR 문장 정정
affects: [08-02, 08-04, 08-05, 08-06, 08-07, 08-08]
actuals:
  tokens: 9700
  tasks: 3
  commits: 3
plan_head_before: 5e2ac7cc658359d67c344975b4f60a7600221fbd
commits: 3
status: complete
tech-stack:
  added: []
  patterns: ["문서 줄 상한 · 절 범위 단언 시험(docs-limits)", "임시 DB + 임시 journal 폴더로 마이그레이션 원자성 시험"]
key-files:
  created:
    - test/integration/migration-first-promotion.test.ts
    - docs/CUTOVER.md
  modified:
    - domain/ops/restore-check-tables.ts
    - test/unit/ops/restore-check-tables.test.ts
    - test/unit/docs-limits.test.ts
    - docs/OPERATIONS.md
    - docs/RESTORE.md
key-decisions:
  - "통합 시험 뼈대 자리는 번호를 박지 않고 countThrough(_rate_limits_id_column)로 찾는다(가정 A1 = 3)"
  - "CEO-3 직원 입력 표 12개는 requireRows false — 전환 직전 0행일 수 있다"
requirements-completed: [MIG-04, MIG-05]
duration: 약 40분
completed: 2026-11-15
---

# Phase 8 Plan 01: 첫 운영 승격 시험 · 전환 런북 Summary

9/18 뼈대 DB 위에서 남은 마이그레이션 전부가 한 번에 적용되고 실패 시 한 칸도 안 바뀐다는 것을 통합 시험으로 고정하고, 프로덕션 복원 리허설이 직원 입력 표 12개까지 읽게 했으며, `docs/CUTOVER.md`(141줄)에 승격 → 준비 → 전환일 → 직후 → 되돌릴 수 없는 문 → 공지 문안을 증거 칸과 함께 담았다.

## Accomplishments

- 통합 시험 3건(`migration-first-promotion.test.ts`): 뼈대 확인 · 전체 적용 후 users/accounts 유지 · role_id 채움 · 0019 `first_login_at` 백필 · 끝에 `SELECT 1/0` 항목을 덧붙이면 거부되고 적용 기록 3 · `roles` 표 없음.
- `RESTORE_CHECK_TABLES`에 12개 표 추가(requireRows false), 기존 true 9표 순서 그대로(단위 시험이 고정).
- `docs/CUTOVER.md` §0~§6, `docs/OPERATIONS.md` 포인터(300줄 그대로), docs-limits CUTOVER describe(줄 상한 · D-03 · 절 순서 · §1~§6 토큰 · §3 순서 · 출처 태그 금지 · 표 행 300자).
- B9: `docs/RESTORE.md` §3 수동 백업(ON_DEMAND, `description=`) 선택 · 안전 백업 문장 · PITR 클론 절(150줄), OPERATIONS §14 문장.
- ROADMAP Phase 8 기준 3 · 4 · 목표이지 · REQUIREMENTS MIG-05 문구는 grep으로 확인만(수정 없음).

## Task Commits

| Task | 커밋 |
|---|---|
| 1 트레이서 | 77e6297 feat(08-01): 첫 운영 승격 시험 · 복원 확인 표 · CUTOVER 런북 §1 |
| 2 §2 전환 준비 | b6de9e3 docs(08-01): CUTOVER 런북 §2 전환 준비 |
| 3 §0 · §3~§6 · B9 | fe04843 docs(08-01): CUTOVER 런북 §0 · §3~§6 + 수동 백업 복원 · PITR 클론 정정 |

## Verification

- `vitest --project integration migration-first-promotion` 3/3 · `--project integration restore-verify` 5/5
- `vitest --project unit docs-limits restore-check-tables deploy/workflows` 207/207(+ restore-verify · restore-rehearsal-cli 21/21)
- `pnpm lint`(NODE_OPTIONS 8GB) exit 0 · `pnpm typecheck`(8GB) exit 0
- acceptance grep 전부 통과(OPERATIONS 300줄 · CUTOVER 141줄 · RESTORE 150줄 · `.github/ scripts/ db/ infra/` 변경 없음 · ROADMAP/REQUIREMENTS 변경 없음)
- 호출한 스킬: `superpowers:test-driven-development` · `superpowers:verification-before-completion` (`systematic-debugging`은 시험 실패를 쫓을 일이 없어 호출하지 않음 — 실패는 모두 의도한 RED였다)

## Deviations from Plan

**1. [Rule 3 - Blocker] 기본 `pnpm lint` · `pnpm typecheck`가 기본 힙에서 OOM(exit 134)** — 저장소 전체 대상이라 기본 힙(약 4GB)을 넘었다. `NODE_OPTIONS=--max-old-space-size=8192`로 같은 명령을 다시 돌려 둘 다 exit 0. 코드 변경 없음.

**2. 통합 시험 ①②는 RED 없이 처음부터 통과** — 새 production 코드가 없는 특성화 시험(마이그레이션 동작을 고정)이라 처음 통과가 정상이다. 단위 쪽(CEO-3 표 · CUTOVER 토큰)은 RED → GREEN을 확인했다.

**3. 운영 sha 미확인** — 얕은 이력이라 운영 `/api/health` sha 커밋을 못 받았다. 뼈대 자리는 가정 A1(journal 앞 세 항목) **추정**으로 두었다(시험이 `SKELETON_COUNT === 3`을 단언하므로 다르면 시험이 드러낸다).

**4. 런북 문구 소폭 다듬음** — §1의 rollback-floor 줄은 하한이 0012 · 0015 · 0021 · 0036 외 여러 파일(실제 25개)에 걸려 「… 등이 하한을 올린다」로 적었다. `gcloud sql instances clone --point-in-time` 플래그는 `gcloud sql instances clone --help`로 확인했다.

Total deviations: 1 blocker(환경) · 나머지는 기록용. Impact: 없음.

## 결정 변경 기록 (PR 본문용 — 플랜 그대로)

- 체크리스트 위치: ROADMAP 기준 3 `docs/OPERATIONS.md` → `docs/CUTOVER.md`(OPERATIONS가 가리킨다; 300줄 상한 시험 · RESTORE · CERT-PURGE 선례). 이번 실행에서 새 결정 변경은 없다.
- CEO-3 「비어 있지 않음」 → requireRows false(전환 직전 업무 행 0일 수 있음). 직원 입력 복원은 전환 뒤 리허설 1회(08-08)로 확인.
- 재승격 시점: 전환 1~3영업일 전 → 프로덕션 리허설 앞(§2 (c′)). §3 1번은 델타만.
- 기준 3 「Phase 9 착수 조건」 문구 삭제(Phase 9 안 만듦).
- D1 전환일 2027-01-04 · 번호 27001 · D2 늦게 온 비용 재등록 · D3 설정 화면 「전환 시각」 없음(확인 면 = cutover.yml 요약) — 모두 런북에 반영.

## 260907 대조 (PR 본문용 — 옛 저장소 `/home/user/erp_plant8_260907`)

| 영역 | 260907 (file:line) | 이 플랜 |
|---|---|---|
| 사용자 실행 절차 문서 | `00_이어하기-지시문.md:5192-5195` 「개시 청소 v2 · 시험파일지우기 확장 · `2026-08-28_실판-배포-차례.md`」 — 별도 문서 | `docs/CUTOVER.md` 별도 문서 + OPERATIONS 포인터 한 줄 — 같은 계열 |
| 판 고칠 때 순서 | `docs/91_클라우드런-올리기.md:270` 「더하기만 먼저, 지우기는 다음 배포로」 | 첫 승격은 DROP 마이그레이션(0015 · 0036) 포함, 하한 뒤로 못 돌아간다(승인된 예외 DECISIONS 04-50) → §1에 승격 직전 수동 백업 필수 + 원자성 시험 |
| 실판 접근 열쇠 | `server/도구/이관/gates.mjs:74-75` · `:100` 「--실판허용만 붙이면 되네가 손버릇…」 | §1 · §3에 백업 확인을 사람 단계 + 도구 가드(08-02)로 두 번 — 따른다 |
| 개시 청소 | `docs/90_결정-기록.md:1587-1592` 감사 기록까지 삭제 · 트리거 내렸다 올림 | §3은 행동 로그를 지우지 않는다(0046 불변 트리거) — 다르게 간다 |
| 복원 리허설 | `docs/91_클라우드런-올리기.md` 백업 · 복원 절차 없음 | 260917이 앞선다 — §2가 04.4 워크플로를 프로덕션 대상으로 |
| 계정 발급 | `server/도구/시험계정넣기.mjs:1-18` 관리자에는 업무 권한이 없다 | §2: 운영 첫 업무 계정은 계급을 갖게 발급 |

(줄 번호는 플랜 작성 시점 2026-11-04 확인값 — 이번 실행에서 옛 저장소는 다시 열지 않았다.)

## Known Stubs

없음.

## Threat Flags

없음 — 문서 · 시험 · 확인 목록뿐, 새 네트워크 · 인증 · 파일 접근 면 없음.

## Next Phase Readiness

08-02 · 08-04가 이름을 문서에 맞춘다: `cutover.yml`(env · mode · confirm · confirm_production), Job `plant8-{env}-cutover`, 로그 `cutover.done` · `cutover.refused` · `cutover.objects`, 요약 「전환됨 <시각> · demo 남은 행 0」. 현재 CUTOVER.md는 이 이름을 쓴다.

## Self-Check: PASSED

- 생성 파일 존재: migration-first-promotion.test.ts · docs/CUTOVER.md
- 커밋 3개 존재(77e6297 · b6de9e3 · fe04843), `git rev-list --count`로 측정한 값 3
