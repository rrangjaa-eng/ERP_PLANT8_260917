---
phase: 06-payment-evidence-cards
plan: 33
subsystem: corp-card-usages
tags: [card-usage, form-defaults, tdd, pure-function]
gap_closure: true
gap_ids: [G-06-B]
status: complete
plan_head_before: 50902cbf5b109a5acbb9ba020ae4eabae800f723
commits: 2

requires:
  - phase: 06.5-payment-ledger
    provides: PR-C(06.5-02·03·05) — domain/corp-card-usages/index.ts · 통합 테스트 파일 위에 얹음
provides:
  - 카드 사용 새 건 카드 기본값 순서 순수 함수 pickDefaultCardId (직전 -> 본인 개인 한 장 -> 오늘 팀 카드 한 장 -> 옵션 한 장 -> 빈칸)
  - cardUsageFormDefaults가 eligibleCards 결과로 그 함수를 부른다 (proxyHolderNames 조회 없음)
affects: [PR-G2 게이트 (/review + /design-review -> /qa), 06-34, 06-35]

actuals:
  tokens: 2760
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "기본값 순서 판정을 DB를 읽지 않는 순수 함수로 떼어 단위 표 사례로 갈래를 고정"

key-files:
  created:
    - domain/corp-card-usages/default-card.ts
    - test/unit/domain/card-default-order.test.ts
  modified:
    - domain/corp-card-usages/index.ts
    - test/integration/corp-card-usages.test.ts

key-decisions:
  - "개인 카드가 두 장 이상이면 팀 카드로 내려가지 않고 빈칸(A-1)"
  - "공용 카드는 옵션이 한 장뿐일 때(4번)만 채워진다(A-3)"
---

# Phase 6 Plan 33: 카드 기본값 순서 (G-06-B) Summary

카드 사용 새 건의 카드 기본값을 직전 등록 카드 -> 본인 개인 카드(한 장) -> 오늘 소속 팀 카드(한 장) -> 옵션 한 장 -> 빈칸 순서로 고르는 순수 함수 `pickDefaultCardId`를 더하고 `cardUsageFormDefaults`에 연결했다.

## 닫은 것

- **G-06-B**(260907 C03 · 사용자 카드 2026-10-06 20:42 KST 「카드 기본값 순서 더하기」). 옛 순서(배정 개인 -> 팀 -> 공용 첫 장)와 달리 추천안대로 공용 첫 장은 채우지 않는다(옵션이 공용 한 장뿐이면 4번으로만).
- 화면 파일 · 스키마 · 저장 검증 변경 없음. 폼은 이미 `initialDefaults.corpCardId`로 고른 값을 연다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | 25084c7 | `default-card.ts` · `cardUsageFormDefaults` 연결 · 단위 9 · 통합 1 |
| 2 | 1176f4b | 통합 사례 4(직전 우선 · 옵션 밖 직전 건너뜀 · 대리 등록 팀 카드 · 개인 두 장 빈칸) |

## RED 기록

- 단위: `Error: Cannot find package '@/domain/corp-card-usages/default-card' imported from .../test/unit/domain/card-default-order.test.ts` (모듈 없음)
- 통합: `AssertionError: expected null to be '2fc104af-…'` (기본 카드 null — 지금 코드는 옵션이 둘이라 비움)

## 변이 (검출력, 커밋 없음)

`default-card.ts` 2번 갈래의 「두 장 이상이면 null」을 지워(개인 여럿이면 팀으로 내려가게) 돌렸다.

- 단위 붉은 단언: `AssertionError: expected 'T' to be null` (개인 두 장 + 팀 한 장 -> 빈칸 사례)
- 통합 붉은 단언: `AssertionError: expected 'e04662bf-…' to be null` (본인 개인 카드 P1 · P2와 팀 카드 T -> 기본 카드 비움)
- 되돌린 뒤 `git status --porcelain -- domain/corp-card-usages/default-card.ts` 빈 출력.

## 검증 (새로 돌린 결과)

| 명령 | 결과 |
|------|------|
| 단위 `card-default-order` | 9 passed, 종료 0 |
| 통합 `-t "G-06-B"` | 5 passed (78 skipped), 종료 0 |
| 통합 `corp-card-usages` + `corp-card-usages-proxy` 전체 | 2 files, 160 passed, 종료 0 |
| E2E desktop `card-usage` + `card-proxy` (CI=true) | 42 passed, 18 skipped(기존 스킵), 종료 0 |
| E2E mobile-375 `mobile-card-usage-320` (CI=true) | 3 passed, 종료 0 |
| `pnpm lint` · `pnpm typecheck` | 종료 0 |

범위 확인: `git diff --name-only 50902cb..HEAD -- '*.tsx' '*.css' ui docs/design db .claude` 빈 출력. 새 `.skip(` 없음. 기존 단언 삭제 없음(통합 파일은 import 줄 하나만 수정, 나머지는 추가).

## 가정 (실행 전 드러낸 그대로)

- A-1 개인 카드 두 장 이상이면 빈칸 · A-2 팀 카드는 사용일(오늘) 소속 팀 기준(`teamIdOn`) · A-3 공용 카드는 순서에 없고 옵션 한 장일 때만. 사용자가 다르게 보면 카드로 묻는다. 엣지 프로브 EXP-07은 미분류 그대로 둔다.

## Deviations from Plan

None - plan executed exactly as written. (플랜의 worktree · 브랜치 `claude/06-gap-g2` 대신 오케스트레이터가 지정한 현재 브랜치에서 실행. 선행조건 06.5-03은 main 커밋 50902cb 제목이 「06.5-02·03·05」라 리터럴 grep은 0이지만 충족으로 처리.)

실행 중 메모: 첫 E2E 시도가 `webServer` 60초 타임아웃으로 붉었다. 이후 `/api/health` 503을 내는 낡은 `next-server`(포트 3100)가 남아 있던 환경 문제로 확인했고(코드 원인 아님), 그 프로세스를 끈 뒤 같은 명령이 녹색이었다. 코드 · 설정 변경 없음.

## Known Stubs

None.

## Threat Flags

None. T-06-33-01~03 모두 구현대로: 후보는 `eligibleCards` 결과뿐, 옵션 밖 직전 카드 건너뜀(통합 검증), 모호하면 빈칸(변이로 검출력 확인).

## Self-Check: PASSED

- FOUND: domain/corp-card-usages/default-card.ts · test/unit/domain/card-default-order.test.ts
- FOUND commits: 25084c7 · 1176f4b
