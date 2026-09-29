---
paths:
  - "test/**"
  - "playwright.config.ts"
  - "vitest.config.ts"
---

# 테스트를 만지는 세션이 먼저 알아야 할 것 (docs/HANDOFF.md 함정 3~7 요약)

- **테스트 DB는 하나다.** 통합·E2E가 `erp_test` 하나를 공유한다. 로컬에서 DB·Playwright를 쓰는 작업은 한 번에 하나만 돌린다. 병렬로 두 개를 돌리면 권한 거부(`can()`이 시드 중간 상태를 봄)·데드락(`action_log` 동시 insert)이 나고, 원인을 코드에서 찾으면 시간만 버린다. CI는 잡마다 Postgres 컨테이너가 따로 떠서 샤드 병렬이 안전하다.
- **로컬 dev 통과는 완료 신호가 아니다.** `playwright.config.ts`가 CI에서만 프로덕션 빌드(`pnpm build && pnpm start`)를 쓴다. 완료 판정은 `CI=true`로, 건드린 화면의 스펙만 골라 돌린다(`CI=true pnpm test:e2e test/e2e/<spec>`). 전체 E2E는 CI가 한 번 돈다.
- **`ui/` 세그먼트가 경로에 있으면 테스트도 `domain/`을 import할 수 없다.** eslint-plugin-boundaries가 경로로 element type을 정한다. `test/unit/ui/*`의 상수 복제(`SEED_ROLE_NAMES`·`ADMIN_MENU_KEYS`)는 이 제약 때문이다.
- **인증 테스트는 `x-client-ip` 헤더가 필요하다.** `domain/auth/hooks.ts`의 before 훅이 그 헤더 없는 로그인 요청을 fail-closed로 막는다. `auth.api.signInEmail`을 직접 부르면 헤더를 채운다(`test/integration/archived-session.test.ts` 참고).
- **`DROP DATABASE`는 연결이 남아 있으면 무한 대기한다.** `WITH (FORCE)` 없이는 `afterAll`이 hookTimeout에 걸려 통합 스위트가 FAIL로 끝나고 e2e가 통째로 skip된 적이 있다.
- 폰 375 전용 스펙은 파일명 `mobile-*.spec.ts`로만 구분한다. 새 스펙은 이 규칙만 지키면 프로젝트에 자동으로 잡힌다.
- 감사자·서브에이전트 보고를 그대로 믿지 않는다. 인용한 원문(SYSTEM.md 줄, 파일 바이트)을 직접 확인한다.
