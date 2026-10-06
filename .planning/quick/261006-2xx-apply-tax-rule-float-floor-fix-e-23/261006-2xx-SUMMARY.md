---
phase: quick-261006-2xx
plan: 01
subsystem: domain/money
status: complete
tags: [money, tax, rounding, E-23, risk]
requires: []
provides:
  - "round()의 몫 소수 6자리 정규화 — 부가세·원천세·회사 대납 10원 절사·올림 부동소수 오차 제거"
  - "06-03 ready 게이트가 grep하는 it: 「E-23 원천징수 712,500 · 8.8% · 10원 절사 → 62,700」"
affects: [domain/money/tax.ts applyTaxRule, grossFromTotal, toKrw, quoteAmount, domain/revenue]
tech-stack:
  added: []
  patterns: ["Number(x.toFixed(6)) 정규화 — `* 1e6` 꼴 금지(큰 정수 깨짐)"]
key-files:
  created: []
  modified:
    - domain/money/index.ts
    - test/unit/domain/money-tax.test.ts
    - test/unit/domain/money.test.ts
decisions:
  - "E-23: round()는 value / unit을 Number(toFixed(6))로 정규화한 뒤 trunc·round·ceil — 세율 저장 형식(소수)은 유지"
metrics:
  completed: 2026-10-06
  tasks: 2
  files: 3
actuals:
  tokens: 1128
  tasks: 2
  commits: 2
plan_head_before: acf1cf2f5762c577ca6f2ccc87d34985cb06c5dd
---

# Phase quick-261006-2xx Plan 01: E-23 원천세 10원 절사 부동소수 결함 수정 Summary

`round()`가 부동소수 몫을 그대로 절사·올림하던 결함을 `Number((value / unit).toFixed(6))` 한 줄 정규화로 고쳤다. 부가세·원천세·회사 대납 세 경로가 함께 바로잡혔다(712,500 × 8.8% 10원 절사: 62,690 → 62,700).

## 커밋

| Task | 커밋 | 제목 |
|------|------|------|
| 1 RED | 00a8b399 | test: E-23 원천세 10원 절사 부동소수 재현 케이스 |
| 2 GREEN | 8e9c97af | fix: round()가 부동소수 오차로 한 단위를 잃지 않게 소수 6자리 정규화 (E-23) |

## RED (Task 1)

`pnpm test:unit test/unit/domain/money.test.ts test/unit/domain/money-tax.test.ts` → **Tests 4 failed | 70 passed (74)**

| 실패 케이스 | 받은 값 | 기대값 |
|------------|--------|--------|
| E-23 원천징수 712,500 · 8.8% · 10원 절사 → 62,700 | 62690 | 62700 |
| E-23 부가세 — 세율 설정 8.8% · 10원 절사 · 712,500 → 62,700 | 62690 | 62700 |
| E-23 회사 대납(flat) 712,500 · 8.8% · 10원 절사 → 62,700 | 62690 | 62700 |
| E-23 올림은 딱 떨어지는 값을 한 단위 더 올리지 않는다 — 100,000 × 0.07 · 10원 올림 → 7,000 | 7010 | 7000 |

경계 고정 2건(큰 정수 불변 · grossFromTotal 역산 경계)은 고치기 전에도 녹색이었다. 원천징수 케이스 이름 grep = 1.

## GREEN (Task 2)

- `pnpm test:unit test/unit/domain test/unit/certs` → **Test Files 61 passed · Tests 1233 passed (1233)**, 실패 0
- 새 6건 전부 녹색(verbose 확인). 기존 단언 값 변화 없음
- `pnpm typecheck` exit 0 · `pnpm lint` exit 0(경고는 기존 eslint-plugin-boundaries v6 설정 이관 안내뿐)
- 범위: origin/main 대비 domain · test 아래 변경 = domain/money/index.ts · money-tax.test.ts · money.test.ts 셋. domain/money/tax.ts 변경 없음
- 통합 · E2E는 돌리지 않았다(§5 — ready 뒤 CI)

## Deviations from Plan

없음. 플랜대로 실행했다(실행자 모델만 오케스트레이터 지정으로 Opus — 돈 경로 risk 규칙).

## 범위 밖 같은 꼴 결함

`domain`·`repositories`·`app`·`lib`의 `Math.trunc/floor/ceil` 사용처를 훑었다. 세율 곱(부동소수)을 절사·올림하는 곳은 없다(전부 정수 나눗셈·페이지·바이트·시간). 발견 없음.

## Threat Flags

없음. 새 입력 · 엔드포인트 없음. T-q2xx-01 · T-q2xx-02 완화 케이스 녹색.

## Self-Check: PASSED

- FOUND: domain/money/index.ts (toFixed(6)), test/unit/domain/money-tax.test.ts, test/unit/domain/money.test.ts
- FOUND: 00a8b399, 8e9c97af (git rev-list acf1cf2f..HEAD = 2)
