---
phase: quick-260929-8ls
plan: 01
subsystem: domain/reserves
tags: [reserves, evidence-type, code-tables, codex-b, pr-85, risk]
status: complete
requires: []
provides:
  - "리저브 저장 증빙 판정: known(비활성·보관 포함)으로 모르는 값 거부, active는 새 줄·바꾼 증빙에만"
affects: [RSV-01]
tech-stack:
  added: []
  patterns:
    - "Codex #5와 같은 결 — 활성 규칙은 새로 고르거나 바꾼 값에만(input.isNew || stored.x !== payload.x)"
key-files:
  created: []
  modified:
    - domain/reserves/index.ts
    - test/integration/reserve-entries.test.ts
decisions:
  - "증빙 코드 집합은 트랜잭션 앞 한 번(04-32) 비활성·보관 포함으로 읽고 known/active 두 집합으로 나눈다"
  - "planBatch 새 판정은 재전송 no-op·버전 재전송 no-op continue 뒤, 프로젝트 판정 뒤에 둔다 — 한 줄 한 이유, 거부는 기존 INPUT_RULE denyWrite 한 지점"
metrics:
  duration: "14m"
  completed: 2026-09-29
  tasks: 3
  files: 2
plan_head_before: fd83d9daab9076666f7d9e5ed29aa9ac6fc5a805
actuals:
  tokens: 2200
  tasks: 3
  commits: 2
---

# Quick 260929-8ls Plan 01: Codex B — 비활성·보관 증빙 코드가 붙은 기존 리저브 줄 수정 허용 Summary

증빙 종류 코드가 나중에 비활성·보관돼도 그 코드가 붙은 저장된 리저브 줄의 다른 칸(메모 등) 수정과 새 줄 재전송은 통과하고, 새 줄이거나 바꾼 증빙은 여전히 활성·보관 아닌 코드만 받는다 — 코드표를 트랜잭션 앞 한 번 전체로 읽어 known/active 두 집합으로 나눈다.

## 커밋

| 순서 | 해시 | 제목 | 파일 |
|---|---|---|---|
| RED | 2913d2cd | test: pin reserve evidence code rule to new or changed values | test/integration/reserve-entries.test.ts |
| GREEN | f39783d4 | fix: allow inactive evidence codes already on saved reserve rows | domain/reserves/index.ts |

자체 검토 지적 없음 → 추가 커밋 없음. 측정: `git rev-list --count fd83d9da..HEAD` = 2.

## 기준 · RED · GREEN 실측

- 기준 N: `pnpm test:integration test/integration/reserve-entries.test.ts` → **53 passed (53)** (수정 전 코드).
- RED(2913d2cd, 수정 전 코드): total 60, failed 3 — 정확히 기대한 셋, 셋 다 같은 첫 줄:
  - (Codex B) 비활성 증빙 종류가 붙은 저장된 줄은 메모만 고쳐도 저장된다 — 증빙 칸 그대로 | `Error: 오류 1칸 · 전부 거부 · [증빙 종류] 코드표에 없는 증빙 종류 · 증빙 종류 고르기`
  - (Codex B) 보관된 증빙 종류가 붙은 저장된 줄은 메모만 고쳐도 저장된다 — 증빙 칸 그대로 | 같은 메시지
  - (Codex B) 새 줄 재전송(ENG-D10)은 그 사이 증빙 코드가 비활성돼도 no-op — 한 행 그대로 | 같은 메시지
  - 거부 고정 4개((b)(b')(c)(c'))와 기존 53개는 통과. lint·typecheck 통과.
- GREEN(f39783d4): total 60, failed 0, (Codex B) 7개 전부 통과. lint·typecheck 통과.

## 변이 확인 (`-t "Codex B"`, 매번 `git checkout -- domain/reserves/index.ts`로 되돌림, 끝에 `git diff --quiet` 깨끗)

| 변이 | 내용 | 실패한 테스트 | 기대와 일치 |
|---|---|---|---|
| M1 | 조건 `(input.isNew \|\| stored?.evidenceType !== payload.evidenceType)` → `true` | (a) 비활성 메모 수정 · (a') 보관 메모 수정 | 예 |
| M2 | 같은 조건 → `input.isNew` | (b) 비활성으로 바꾸기 · (b') 보관으로 바꾸기 | 예 |
| M3 | `input.isNew \|\|`만 제거 | 없음 | 예 — **등가 변이, 테스트 공백 아님**(이 판정에 닿는 새 줄은 stored가 없다 — isNew+stored는 재전송 분기에서 먼저 continue. Codex #5 조건과 같은 모양·의도 표시로 남김) |
| M4 | prepareRows에 known 대신 active | (a) · (a') · (d) 재전송 | 예 |
| M5 | active = `item.active`만 | (b') 보관으로 바꾸기 · (c') 새 줄 보관 | 예 |
| M6 | active = `item.archivedAt === null`만 | (b) 비활성으로 바꾸기 · (c) 새 줄 비활성 | 예 |
| M7 | planBatch 새 판정 블록 통째 제거 | (b) · (b') · (c) · (c') | 예 |

## 자체 검토 (gstack review checklist Pass 1 + 이 변경 전용 항목)

| 항목 | 결과 | 근거 |
|---|---|---|
| 코드표 조회가 withTransaction 앞에서 한 번뿐(04-32) | 통과 | saveReserves `const evidence = await evidenceTypeValues(...)`(withTransaction 앞), planBatch는 인자로 받은 Set만 씀 |
| 새 판정이 재전송 no-op·버전 재전송 no-op continue 뒤, 칸 오류 모음 → denyWrite 한 지점 | 통과 | planBatch 판정은 프로젝트 판정 뒤·plan push 앞, errors → 기존 `if (errors.length > 0) denyWrite(INPUT_RULE…)`. 새 throw 없음. (d) 통과가 위치 증명 |
| prepareRows가 known으로 코드표에 없던 값을 트랜잭션 전에 거부 | 통과 | prepareRows 본문 무변경, 기존 「코드표에 없는 증빙 종류는 …」 not-a-code 테스트 통과 |
| active가 비활성·보관 둘 다 뺌 | 통과 | M5·M6 각각 잡힘 |
| 선택지(listReserveReferences)·대장 읽기·RESERVE_INPUT_REASONS 그대로 | 통과 | diff는 evidenceTypeValues·saveReserves 두 줄·planBatch 시그니처·판정 블록뿐 |
| 거부 문구가 비활성/없음을 구별하지 않음 | 통과 | 같은 EVIDENCE_NOT_IN_TABLE 재사용(파일 내 3회) |
| `any` 없음·요청 밖 리팩터 없음·고아 import 없음·새 의존성 없음 | 통과 | 추가 줄의 `any` 0건, repoListCodeItems 계속 사용, package.json 무변경 |
| 테스트가 시드 코드를 바꾸지 않고 부정 단언이 저장 결과 뒤에만 | 통과 | 모든 코드 `codexb-<uuid8>`로 테스트 안에서 생성, countRows/storedRow 단언은 save 뒤 |
| SQL 보간·N+1 (Pass 1 SQL) | 해당 없음 | Drizzle 파라미터 쿼리 한 번 |
| TOCTOU·경합 (Pass 1 Race) | 수용(알려진 한계 1) | 아래 |
| Enum 완전성 | 해당 없음 | 새 값·상태 없음 |

지적 없음 — 추가 커밋 없음.

## 최종 게이트 (로컬, 전경 실행)

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | exit 0 (오류 0, boundaries 설정 경고는 기존) |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm test:unit` | 125 files / **1748 passed** |
| `pnpm test:integration test/integration/reserve-entries.test.ts` | **60 passed (60)** = N(53) + 7 |

E2E는 화면 변경이 없어 로컬에서 돌리지 않음(CI 몫). 작업 트리 깨끗(`.planning/quick/260929-8ls-…/` 제외). 제품 코드 변경은 RED 커밋 부모 대비 `domain/reserves/index.ts` 하나.

## Deviations from Plan

None - plan executed exactly as written.

## 알려진 한계 (코드 변경 없음)

1. **경합 창:** 코드 집합은 트랜잭션 앞에서 읽고 code_items 행을 잠그지 않는다 — 판정과 같은 순간의 비활성·보관과는 경합할 수 있다(수정 전과 같은 창, T-q8ls-04 accept). 결과는 방금 비활성된 코드가 한 줄에 붙는 정도, 금액 영향 없음.
2. **빈 문자열 관찰:** 증빙 `""`은 수정 전처럼 검사 없이 `""`로 저장된다(액션 zod가 허용, 판정은 truthy). 이 플랜 범위 밖 — 관찰만.

## 독립 Opus 검토 반영

실행자 단계에서는 받은 지적 없음. 오케스트레이터가 독립 검토 지적을 넘기면 Task 3 3번 절차(receiving-code-review로 근거 확인 → 동의 시 실패 테스트 → 수정 → 게이트 → 한 지적 한 커밋, 비동의는 이 표에 이유 기록, 사용자 결정 변경 요구는 오케스트레이터로 상향)로 반영한다.

| 지적 | 판단 | 결과 |
|---|---|---|
| (없음) | — | — |

## Self-Check: PASSED

- FOUND: domain/reserves/index.ts, test/integration/reserve-entries.test.ts
- FOUND: 2913d2cd, f39783d4 (git log)
