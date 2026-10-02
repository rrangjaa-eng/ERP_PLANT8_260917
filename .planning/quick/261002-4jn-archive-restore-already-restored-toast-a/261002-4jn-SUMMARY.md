---
phase: quick-261002-4jn
plan: 01
status: complete
requirements: [ADMN-12]
commits: [ef772b5, ecd2f6e]
---

# 261002-4jn 요약 — 보관함 복원 후속(quick 261001-hfi 회고 #3·#4)

## 한 일
- **① 이미 복원됨(ef772b5):** `restore()`가 `{ restored }`를 돌려준다. 이미 활성인 행은 복원기·로그 없이 `{ restored: false }`. 공휴일은 달력 잠금 안의 `restoreHoliday` 결과를 그대로 돌린다. `restoreArchivedAction`이 `{ restored }`를 반환하고 보관함 토스트는 거짓이면 「복원 · {이름} 이미 복원됨」.
- **② 날짜 점유(ecd2f6e):** `listArchivedHolidays`가 `dateTaken`(같은 날짜 활성·대체일 아닌 공휴일, 별칭 EXISTS)을 싣고 `listArchive`의 restorable이 그 경우 거짓. 대체일만 있으면 막지 않는다.

## 실행 방식 편차
- 훅(plant8-skill-gate)이 STATE 현재 페이즈 04.3의 계획 게이트 기록이 main에 없어 gsd-executor 위임을 막았다. 261001-hfi와 같이 메인 세션이 계획대로 직접 실행했다(사용자에게 선택 카드로 알림).

## 검증(실행 결과)
- 통합 `test/integration/archive.test.ts`: 새 3건 RED 확인 → 13/13 통과. leak-scan 포함 실행 통과.
- `pnpm typecheck` · `pnpm lint` · `pnpm lint:sql` 통과.
- `CI=true pnpm test:e2e test/e2e/archive.spec.ts`: 1 passed(두 탭 — 「복원됨」 / 낡은 탭 「이미 복원됨」 · 행 사라짐). 첫 실행은 webServer 60초 대기 초과(콜드 빌드), 재실행 통과.

## 받아들인 위협
- T-q4jn-01: 보관함 쓰기 권한자가 도메인 권한 없이 id의 「이미 활성」 여부만 알 수 있음(값 노출·변경 없음).
- T-q4jn-03: 범용 경로의 진짜 동시 복원은 둘 다 참일 수 있음(기존 동작). 공휴일은 잠금으로 하나만 참.
