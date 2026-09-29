---
phase: quick-260929-6gr
plan: 01
status: complete
subsystem: reserves (pnl/reserves 리저브 대장)
tags: [reserves, opus-review-follow-up, codex-3, ceo-d18, mutation-testing, risk]
requirements: [QUICK-260929-6gr, RSV-01]
dependency_graph:
  requires: [quick 260929-49c (Codex #3 · #4 · #5 수정), domain/reserves planBatch 보관 프로젝트 판정, domain/reserves/save-contract.ts RESERVE_ARCHIVED_ROW_REASON]
  provides: [splitAlreadyArchived 순수 함수(reserves-table.tsx 모듈 수준 export), 활성 A → 보관 B 거부 통합 테스트, 보관 거부 판정 단위 테스트 5개]
  affects: [app/(app)/pnl/reserves/reserves-table.tsx]
tech_stack:
  added: []
  patterns: [클라이언트 표 모듈의 순수 판정 함수 export + server-only mock 단위 테스트(quote-table restore-edits 선례), 변이 증거로 이미 맞는 동작 고정]
key_files:
  created:
    - test/unit/app/reserves-archive-rejections.test.ts
    - docs/design/checks/2026-09-29-리저브-보관거부-판정-추출.md
  modified:
    - test/integration/reserve-entries.test.ts
    - app/(app)/pnl/reserves/reserves-table.tsx
decisions:
  - "보관 거부 판정식을 글자 그대로 모듈 수준 export 함수 splitAlreadyArchived(cells, sentArchived)로 꺼내 단위 테스트로 고정 — 동작 불변(플래너 선택)"
metrics:
  duration: 17min
  completed: 2026-09-29
  tasks: 3
  files: 4
estimate:
  tokens: 70000
  tasks: 3
actuals:
  tokens: 3362
  tasks: 3
  commits: 2
plan_head_before: 39613032525e3da266a04e703f5d68809d24e81b
---

# Quick 260929-6gr: 리저브 Opus 검토 후속 테스트 — Summary

활성 A → 보관 B 프로젝트 변경 거부 통합 테스트와 보관 거부 판정(순수 함수로 글자 그대로 추출) 단위 테스트 5개를 더했고, 변이 넷(통합 1 · 단위 3)이 각각 새 테스트 하나씩만 실패시키는 것을 실측했다. 제품 동작 · 문구 · 스타일은 바뀌지 않았다.

## 기준선 · 커밋

- 기준 커밋 B = `39613032` (실행 시작 HEAD와 같음 — origin/main 재머지 없음)
- 기준선 N: reserve-entries 통합 **52 passed (52)** → 이후 **53**
- `c912b7e6` test: reject reserve project change from active to archived project (Task 1)
- `41db5a8b` test: pin reserve archive-rejection matching to the archived-row reason (Task 2)
- Task 3 게이트에서 고친 것 없음(추가 커밋 없음)

## Task 1 — 검토 후속 1 · CEO-D18 (통합)

새 테스트 「저장된 줄의 프로젝트를 활성 프로젝트에서 보관된 프로젝트로 바꿔도 같은 이유로 거부, 저장된 활성 프로젝트 그대로(CEO-D18)」를 (b) 뒤 · (c) 앞, 같은 describe 안에 넣었다. 헬퍼 · import는 그대로다.

변이 `stored?.projectId !== payload.projectId` → `stored?.projectId === null` (domain/reserves/index.ts 385행):
- `Tests 1 failed | 52 passed (53)` — 새 테스트 하나만 실패
- 실패 메시지 첫 줄: `AssertionError: expected null to be an instance of SaveRejectedError` (저장이 통과해 거부 오류가 아님)
- `git restore` 뒤 domain diff 없음, 파일 전체 **53 passed**

## Task 2 — 검토 후속 2 · Codex #3 (단위)

- `reserves-table.tsx`: countCells 뒤에 `export function splitAlreadyArchived(cells, sentArchived)` 추가. 판정식 한 줄은 들여쓰기만 다르고 글자 그대로다. onSuccess의 세 선언은 `const { alreadyArchived, remaining } = splitAlreadyArchived(data.rejected.cells, sentArchivedIdsRef.current);` 한 줄로 바꿨고, 주석 세 줄과 그 뒤 처리는 그대로다. `./actions` import 줄에 `type ReserveRejectedCell` 인라인 추가.
- 단위 파일은 5개 모두 통과했다(T1 가름 · T2 중복/없는 줄 남김 · T3 안 보낸 id 남김 · T4 field 남김 · T5 섞임). 추출 전에는 `TypeError: splitAlreadyArchived is not a function`로 5개가 실패했다(export 없음 — 모듈 import는 node 환경에서 server-only mock만으로 성공했고, 추가 mock은 필요 없었다).

변이(각각 따로, 복사본으로 되돌리고 `cmp` 같음):
| 변이 | 결과 | 실패한 테스트 |
|---|---|---|
| m1 이유 조건 제거 | 1 failed \| 4 passed | T2 「(Codex #3 후속) 같은 field row라도 중복 · 없는 줄 거부는 보관 큐에 남고 남은 칸으로 남는다」 |
| m2 보낸 id 조건 제거 | 1 failed \| 4 passed | T3 「(Codex #3 후속) 보내지 않은 id의 보관된 줄 거부는 가르지 않고 남긴다」 |
| m3 field 조건 제거 | 1 failed \| 4 passed | T4 「(Codex #3 후속) 보낸 보관 id라도 field가 row가 아니면 가르지 않고 남긴다」 |

## Task 3 — 최종 자기 검토 게이트 (플랜 verify 스크립트 그대로 실행, exit 0)

- 변이 재실행(`git restore`로 되돌림): M-int `1 failed | 52 passed (53)` · M1/M2/M3 각각 `1 failed | 4 passed (5)` — 넷 모두 죽음, 되돌린 뒤 트리 깨끗
- `pnpm test:unit` 전체: **125 파일 · 1748 passed** (33.5s)
- reserve-entries 통합: **53 passed** (27.8s)
- `pnpm lint` · `pnpm typecheck`: exit 0
- `CI=true pnpm test:e2e test/e2e/reserves.spec.ts --retries=0`: **33 specs, 0 failed** (Codex #3 2개 · Codex #4 2개 포함), 189s(빌드 포함)
- 잠긴 새 문구 넷: B와 개수 같음(각 1 = 1)
- `git diff B -- domain repositories ui lib db` 없음. 바뀐 파일은 플랜의 네 파일뿐
- 자기 diff 확인: 클립보드 형식 · 보관/복원 version · capNotice 코드는 건드리지 않았다. 요청 밖 주석 · 포맷 변경 없음

## 플래너 선택(사용자 결정 아님)

- 함수 이름 `splitAlreadyArchived`, 위치는 reserves-table.tsx 모듈 수준 export(quote-table 선례)
- 단위 파일 `test/unit/app/reserves-archive-rejections.test.ts`
- 새 통합 테스트 제목: 「저장된 줄의 프로젝트를 활성 프로젝트에서 보관된 프로젝트로 바꿔도 같은 이유로 거부, 저장된 활성 프로젝트 그대로(CEO-D18)」
- 점검표 `docs/design/checks/2026-09-29-리저브-보관거부-판정-추출.md`

## Deviations from Plan

없음 — 플랜대로 실행했다. 이 두 항목은 이미 맞는 동작을 고정하는 테스트라, 플랜과 사용자 허용대로 RED 커밋 대신 변이 증거를 남겼다.

## 알려진 한계

- 검토 후속 3(capNotice): 상한 알림은 보낼 줄이 300 아래로 줄어도 저장 시도나 들어간 붙여넣기가 있을 때까지 남는다. 사용자 결정(2026-09-29)에 따라 기록만 한다 — 300줄 상한에 닿는 일이 드물고, 추가 버튼은 atSaveCap으로 다시 켜진다.
- 300줄 붙여넣기 렌더 속도: 49c 기록 그대로(기록만).

## Self-Check: PASSED

- FOUND: test/unit/app/reserves-archive-rejections.test.ts · docs/design/checks/2026-09-29-리저브-보관거부-판정-추출.md · test/integration/reserve-entries.test.ts · app/(app)/pnl/reserves/reserves-table.tsx
- FOUND: c912b7e6 · 41db5a8b (`git rev-list --count B..HEAD` = 2)
