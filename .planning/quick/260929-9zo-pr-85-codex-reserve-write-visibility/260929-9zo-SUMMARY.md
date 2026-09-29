---
phase: quick-260929-9zo
plan: 01
subsystem: reserves
tags: [permissions, visibility, reserves, pr-85, codex]
status: complete
risk: permissions
requires: [260929-8ls]
provides: [reserve-write-visibility-gate]
affects: [domain/reserves]
tech-stack:
  added: []
  patterns: ["트랜잭션 앞 노출 판정 → planBatch 인자(04-32)", "새 값·바뀐 값만 판정(Codex #5 · Codex B와 같은 결)"]
key-files:
  created: []
  modified: [domain/reserves/index.ts, test/integration/reserve-entries.test.ts]
decisions:
  - "쓰기 경로 노출 게이트를 listReserveReferences와 같은 판정(vendor.value / project.value && scopeFor(project).rows === all)으로, 트랜잭션 앞에서 한 번 읽는다"
  - "② 가시성 거부는 기존 PROJECT_CLIENT_MISMATCH를 재사용 — 불일치·보관 판정보다 먼저, 존재·보관 여부와 무관하게 같은 응답"
  - "④(다른 칸 수정 시 연결 지워짐)는 재현되지 않음 — 판정 추가 없음, 기록만"
requirements: [QUICK-260929-9zo, RSV-01]
metrics:
  completed: 2026-09-29
actuals:
  tokens: 3081
  tasks: 3
  commits: 2
plan_head_before: f7826074d6c337b4592860118098a2775385075c
---

# Quick 260929-9zo: PR #85 Codex ②③ 리저브 쓰기 경로 노출 게이트 Summary

saveReserves가 트랜잭션 앞에서 vendor.value · project.value · projects 보기 범위를 한 번 읽어 planBatch에 `pickable`로 넘긴다. 새 줄 클라이언트(③)와 새로 고르거나 바꾼 프로젝트(②)는 대장 선택지와 같은 게이트로 판정하고, 저장된 연결과 재전송은 막지 않는다. 기존 문구를 재사용하고 새 문구는 없다.

## 기준선

- 수정 전 `pnpm vitest run --project integration test/integration/reserve-entries.test.ts`: **N = 61 통과**(61/61).

## RED 실측 (커밋 0c0c965e)

74개 중 7개 실패, 새 13개 중 나머지 6개와 기존 61개는 통과.

| 테스트 | 실패 첫 줄 |
|---|---|
| T1 (Codex ③) vendor.value 없는 쓰기 권한자의 새 줄 … | `AssertionError: expected null to be an instance of SaveRejectedError` |
| T4 ×2 (Codex ②) project.value 없음 / projects 보기 없음 — 새 줄이 프로젝트를 고르면 … | `AssertionError: expected null to be an instance of SaveRejectedError` |
| T5 ×2 (Codex ②) … 저장된 줄에 프로젝트를 새로 붙이면 … | `AssertionError: expected null to be an instance of SaveRejectedError` |
| T6 ×2 (Codex ②) … 보관된 프로젝트를 골라도 … | `AssertionError: expected [ { rowIndex: +0, …(4) } ] to deeply equal [ ObjectContaining{…} ]` — diff: `"reason": "보관된 프로젝트 · 프로젝트 다시 고르기"`(기대: 「다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기」) |

RED 단계에서 통과한 6개: T2 · T3 · T7 ×2 · T8 · T9.

## GREEN (커밋 328e48bb)

- 통합 74/74 통과(61 + 13). lint · typecheck 통과.
- 변경 내용: saveReserves에 pickable 계산을 더했다(formatErrors denyWrite 뒤, `now` 앞, `Promise.all`, deps.visible/can 주입을 따름). planBatch에 `pickable` 인자를 더했고, 새 줄 분기 조건을 `!pickable.clients || !selectable.has(...)`로 바꿨다. 프로젝트 블록 맨 앞에는 `!pickable.projects && (input.isNew || stored?.projectId !== payload.projectId)` 판정을 넣었고, 걸리면 PROJECT_CLIENT_MISMATCH를 낸다.
- 새 상수 · 문구 · 규칙 · throw · import는 없다. listReserveReferences · listReserves · RESERVE_DTO_SPEC · RESERVE_INPUT_REASONS도 그대로다.

## ④ 판정: 재현되지 않음

T7 ×2가 RED에서도 GREEN에서도 통과했다. 프로젝트가 안 보이는 두 변형 모두 listReserves DTO에 `projectId`가 실려 있고, DTO 필드를 화면 toPayload처럼 그대로 실어 메모만 바꿔 저장하면 projectId는 그대로이고 version은 2가 된다.
근거는 세 가지다.
- RESERVE_DTO_SPEC은 `projectName`에만 `[reserve.amount, project.value]`를 요구하고, `projectId`는 reserve.amount만으로 싣는다.
- `reserves-table.tsx`는 147행에서 `projectId: dto.projectId`로 받아 773행 toPayload에서 `projectId: row.projectId`로 그대로 되돌려 보낸다.
- ② 판정 조건은 저장값과 같은 projectId이면 거짓이다(M4가 이 조건을 T7로 잡는다).

## 문구 재사용 판단

PROJECT_CLIENT_MISMATCH(「다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기」)는 「이 사람에게 보이지 않는 프로젝트」라는 사유를 정확히 말하지는 않는다. 그래도 이미 「쓸 수 없는 프로젝트」의 공용 이유로 쓰이고 있다(prepareRows uuid 모양 · 액션 zod `RESERVE_INPUT_REASONS.projectMismatch`). 새 문구를 만들지 않고, 존재 · 클라이언트 · 보관 여부와 무관하게 같은 응답을 준다. 그래서 떠보기가 막힌다(T6, M9). ③도 기존 CLIENT_NOT_FOUND로, 보관 · 숨김 클라이언트와 같은 응답이다.

## 변이 확인

`-t "Codex ②③"`(13개)로 돌렸고, 매번 `git checkout -- domain/reserves/index.ts`로 되돌렸다. 끝난 뒤 `git diff --quiet`로 작업 트리가 깨끗함을 확인했다.

| 변이 | 내용 | 실패한 테스트 | 기대와 일치 |
|---|---|---|---|
| M1 | ③ 조건에서 `!pickable.clients \|\|` 제거 | T1 | 예 |
| M2 | ③ 판정을 루프 맨 앞(모든 줄 · 재전송 앞)으로 | T2 · T3 | 예 |
| M3 | ② 판정 통째 제거 | T4 ×2 · T5 ×2 · T6 ×2 | 예 |
| M4 | ② 조건 `(input.isNew \|\| stored?.projectId !== payload.projectId)` → `true` | T7 ×2 | 예 |
| M5 | 같은 조건 → `input.isNew` | T5 ×2 | 예 |
| M6 | `input.isNew \|\|`만 제거 | 없음 | 예. **등가 변이이고 테스트 공백이 아니다.** 이 판정에 닿는 새 줄은 stored가 없다(isNew에 stored가 있으면 재전송 분기에서 먼저 continue). 260929-8ls M3과 같은 판단이다 |
| M7 | pickable.projects = project.value만(범위 무시) | 「projects 보기 없음」의 T4 · T5 · T6 | 예 |
| M8 | pickable.projects = 범위만(project.value 무시) | 「project.value 없음」의 T4 · T5 · T6 | 예 |
| M9 | ② 판정을 보관 판정 뒤로 | T6 ×2 | 예 |
| M10 | ② 판정을 루프 맨 앞(재전송 앞)으로 | T8 | 예. T9가 통과하는 것은 정상이다. SF-2 재전송 시점에는 저장값이 이미 같은 projectId라 조건이 거짓이다 |

## 자체 검토 (gstack review checklist Pass 1 + 이 변경 전용 항목)

| 항목 | 결과 | 근거 |
|---|---|---|
| 새 값·바뀐 값만: ③은 새 줄 분기에만, ②는 `input.isNew \|\| stored?.projectId !== payload.projectId`이고 non-null 블록 안인가 | 통과 | index.ts 374행(새 줄 분기 안) · 398행(`if (payload.projectId !== null)` 블록 안). M4 · M5 |
| 저장된 연결 허용 | 통과 | T2(클라이언트) · T7 ×2(프로젝트) |
| 재전송 순서 | 통과 | ③은 ENG-D10 continue 뒤, ②는 ENG-D10 · SF-2 continue 뒤(260929-8ls와 같은 순서). T3 · T8 · T9, M2 · M10 |
| 떠보기 차단 | 통과 | ② 판정은 projectClients 결과(불일치·보관)보다 먼저이고 같은 이유다(T6, M9). ③은 selectable과 같은 CLIENT_NOT_FOUND |
| denyWrite 한 지점 | 통과 | 두 판정 모두 errors.push 후 continue한다. 기존 모음 → denyWrite(INPUT_RULE)를 타고, clientLocked는 켜지 않는다. T1 · T4 expectOneDenied("reserve.input") |
| 노출 판정이 withTransaction 앞에서 한 번 · deps 주입 · 잠긴 tx 안 풀 읽기 없음(04-32) | 통과 | 296–302행 `Promise.all`(visible = `deps?.visible ?? defaultVisible`, scopeFor에 `{ can: deps?.can ?? defaultCan }`). planBatch는 불리언 인자만 쓴다 |
| listReserveReferences와 같은 판정 | 통과 | vendor.value → clients, project.value && scope.rows === "all" → projects(672–679행과 같은 식). M7 · M8 |
| SQL · 데이터 안전 · 경합(Pass 1) | 알려진 한계로 수용 | 새 SQL은 없다. 노출·메뉴 읽기는 잠그지 않는다(아래 한계 1) |
| `any` 없음 · 새 문구/상수/import 없음 · 요청 밖 리팩터 없음 · 고아 변수 없음 · app/·ui/ 변경 없음 | 통과 | 추가 줄의 `any` 0건. `^\+const [A-Z_]+ =` 0건. 제거된 줄 2개는 모두 교체된 줄이다(planBatch 호출 · selectable 조건). app/ · ui/ diff는 0 |
| 테스트: 부정 단언은 거부 뒤 저장 결과에만 · 기존 테스트·헬퍼 무변경 | 통과 | RED 커밋의 삭제 줄 0(149줄 추가만) |

지적 없음. 추가 커밋도 없다.

## 갭 없음 기록

evidenceType(Codex B에서 처리) · archived ids(기존 줄 보관만) · version · amount · restore는 클라이언트나 프로젝트를 새로 고르는 경로가 아니다. 이 판단은 플래너 감사 결과이고, 실행자는 따로 재감사하지 않았다.

## 알려진 한계 (코드 변경 없음)

1. **경합 창:** 노출·메뉴 권한은 트랜잭션 앞에서 읽고 잠그지 않는다. 그래서 판정과 같은 순간에 권한이 바뀌면 경합할 수 있다(evidenceTypeValues와 같은 창, T-q9zo-05 accept). 결과로 생길 수 있는 일은 방금 권한을 잃은 사람의 저장 한 번이다.
2. **보이지 않는 연결 비우기:** 프로젝트가 안 보이는 사람도 저장된 프로젝트 연결을 null로 비울 수는 있다. 화면에서는 「—」로 보이는 연결이다. ②가 non-null 블록 안에 있어서 생기는 일이다(T-q9zo-06 accept). 사용자 결정대로 기록만 하고 사용자에게 알린다.

## 최종 게이트 (순차)

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm vitest run --project unit` | 125 files · 1748 tests 통과 |
| `pnpm vitest run --project integration test/integration/reserve-entries.test.ts` | 74/74 통과 (61 + 13) |
| E2E | 돌리지 않음(화면 변경 없음, CI 몫) |

## Deviations from Plan

None - plan executed exactly as written. T7에는 타입 좁히기용 `if (!dto) return;`을 넣었다. 바로 앞의 `expect(dto?.projectId).toBe(project.id)`가 undefined이면 먼저 실패하므로 동작 차이는 없다.

## Commits

- 0c0c965e test: pin reserve write gates to reference visibility
- 328e48bb fix: gate reserve client and project picks by visibility on write

## Self-Check: PASSED

- FOUND: domain/reserves/index.ts, test/integration/reserve-entries.test.ts
- FOUND: 0c0c965e, 328e48bb (git log)
