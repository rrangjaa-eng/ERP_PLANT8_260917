# 인수인계 — 이 저장소에서 먼저 알아야 할 것

새 세션(특히 다른 계정)이 Phase 4를 시작할 때 첫 30분에 밟기 쉬운 지뢰들.
전부 2026-09-21 Phase 3 실행 중에 실제로 밟았던 것이고, 각 항목에 그때
만든 방어 장치를 적어 둔다.

## 세션 시작

1. `/gsd-progress` — `.planning/STATE.md`가 상태의 단일 출처다
2. Phase 3의 미해결 항목과 Phase 4로 미룬 것은
   `.planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md`에
   출처·근거와 함께 정리돼 있다

## 함정 1 — 순환 import는 CLI 번들을 조용히 죽인다

`scripts/build-cli.mjs`는 esbuild ESM 번들이다. 런타임 순환 import가 있으면
순환에 걸린 모듈을 top-level await로 감싸고, 그 await가 풀리지 않아
**Node가 "Detected unsettled top-level await"로 exit 13** 한다. Cloud Run Job이
아무 일도 하지 않고 성공처럼 끝난다.

dev 서버·Next 빌드·vitest는 순환을 견디므로 어떤 게이트도 잡지 못했다.
**CI는 `build:cli`를 돌리지 않는다** — 배포 순간까지 아무도 모른다.

방어: `test/unit/import-cycles.test.ts`가 정적으로 잡는다. 이 테스트가
빨간불이면 우회하지 말고 잎(leaf) 모듈로 분리해서 끊어라 —
`domain/permissions/role-name.ts`·`domain/auth/locked-message.ts`·
`domain/action-log/filter-keys.ts`가 그 패턴의 실례다.

## 함정 2 — CI가 CLI 번들을 빌드하지 않는다

위와 같은 이유. 번들을 건드렸으면 `pnpm build:cli` 후 **실제로 실행해 보라**.
빌드 성공은 동작 확인이 아니다.

`test/unit/deploy/cli-bundle.test.ts`가 deploy.sh가 부르는 `--args=dist/cli/*.mjs`
진입점이 build-cli.mjs의 outputs에 전부 있는지 대조한다.

## 함정 3 — `ui/` 아래 경로면 테스트도 domain을 import할 수 없다

`eslint-plugin-boundaries`가 **경로에 `ui/` 세그먼트가 있으면 element type을
`ui`로 분류**한다. `test/unit/ui/role-menu.test.ts`도 `domain/`을 import하면
`boundaries/element-types` 오류다. 그 파일들의 상수 복제는 게으름이 아니라
이 제약 때문이다(`SEED_ROLE_NAMES`, `ADMIN_MENU_KEYS`).

## 함정 4 — 인증 테스트는 `x-client-ip`가 필요하다

`domain/auth/hooks.ts`의 before 훅이 그 헤더 없는 로그인 요청을 fail-closed로
막는다(프록시를 안 거친 요청 차단). `auth.api.signInEmail`을 직접 부르는
테스트는 헤더를 채워야 한다 — 안 하면 `요청 정보가 올바르지 않습니다`로 죽는다.
`test/integration/archived-session.test.ts` 참고.

## 함정 5 — `DROP DATABASE`는 연결이 남아 있으면 무한 대기

`WITH (FORCE)` 없이는 그 DB에 붙은 세션이 하나라도 있으면 영원히 기다린다.
`pool.end()`를 불러도 서버가 소켓을 언제 거두는지는 보장되지 않는다.
CI에서 `afterAll`이 10초 hookTimeout에 걸려 **통합 스위트가 FAIL로 끝나고
e2e 단계가 통째로 skip된 적이 있다**(두 커밋 동안 e2e가 CI에서 안 돌았다).

## 함정 6 — 테스트 DB는 하나다

통합·e2e가 `erp_test` 하나를 공유한다. **병렬로 두 개를 돌리면 서로를 깨뜨린다** —
권한 거부(`can()`가 시드 중간 상태를 봄)와 데드락(`action_log` 동시 insert)으로
나타나고, 원인을 코드에서 찾으면 시간만 버린다. 서브에이전트를 여럿 띄울 때는
**DB·Playwright를 쓰는 작업은 하나만** 돌려라.

후속 과제로 등록돼 있다: "Isolate E2E test DB per Playwright worker"

## 함정 7 — 로컬 dev 통과는 완료 신호가 아니다

`playwright.config.ts`가 `process.env.CI ? "pnpm build && pnpm start" : "pnpm dev"`다.
프로덕션 빌드에서만 나타나는 결함이 실제로 있었다(보관함 복원 토스트가
`revalidatePath`에 같이 쓸려 사라지던 건). 완료 판정은 `CI=true`로.

## 함정 8 — 게이트를 페이즈 끝에 몰지 마라

Phase 3의 가장 큰 교훈이다. `/review`·`/qa`·`/cso`·`/design-review`를 페이즈
끝에 몰았더니 배포를 막는 결함 3건이 한꺼번에 쏟아졌고, 그중 둘은 사용자가
스테이징에서 먼저 발견했다. **웨이브마다 돌려라.**

특히 `/design-review`를 건너뛰면 토큰·컴포넌트 수준은 맞는데 화면 구성이
SYSTEM.md를 벗어난 상태가 된다 — Phase 3에서 관리자 화면 9개가 어디서도
클릭으로 갈 수 없었고(§6-0/§7-8 진입점 미등록), 폼이 목록을 화면 밖으로
밀어냈다(§6-1 위반). 둘 다 사용자가 찾았다.

## 함정 9 — 서브에이전트 보고를 그대로 믿지 마라

실제로 있었던 일:
- 감사자가 CSV BOM을 결함으로 판정했으나 실제 파일 첫 3바이트는 `ef bb bf`였다
- 감사자가 제출 버튼 40px를 §6-3 위반으로 보고했으나, SYSTEM.md 752행이
  "시트 밖 폰 버튼은 그대로 40"이라고 명시한다(인용한 44px 규칙은 405행의
  지출결의 작성 화면 전용이었다)
- 로그 분석 에이전트가 postgres 서비스 컨테이너의 `role "root" does not exist`
  (모든 실행에 있는 잡음)를 실패 원인으로 보고했다

**인용한 원문을 직접 확인하라.**

## 이 페이즈에서 만든 회귀 방어 장치

| 테스트 | 무엇을 막는가 |
|---|---|
| `test/unit/import-cycles.test.ts` | 런타임 순환 import(CLI 번들 교착) |
| `test/unit/deploy/cli-bundle.test.ts` | deploy.sh가 부르는 CLI가 번들에 없는 것 |
| `test/unit/deploy/app-data-key-length.test.ts` | 배포 스크립트와 crypto의 키 길이 불일치 |
| `test/unit/leak-scan-coverage.test.ts` | 누수 스캔이 등록 파일을 빠뜨리는 것 |
| `test/unit/archive-revalidate.test.ts` | 보관 액션이 보관함 재검증을 빠뜨리는 것 |
| `test/unit/settings/registry-coverage.test.ts` | 등록만 되고 안 읽히는 설정 키 · readBy 표시 만료 |
| `test/integration/leak-scan.test.ts` | DTO·액션·내보내기 × 계급 누수(교차곱 생성) |
