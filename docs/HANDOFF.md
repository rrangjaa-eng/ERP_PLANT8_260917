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

## 함정 10 — 디자인 시스템이 문서로만 있으면 지켜지지 않는다

Phase 3 `/design-review` 결과 **26건**(비관리자 11 · 관리자 15, High 4). 원인은
게으름이 아니라 **구조**다. 실측으로 확인한 것:

| 계약 | 강제 수단 | 결과 |
|---|---|---|
| 색·서체·radius (§1·§2) | `tokens.css` 변수 + 화면이 변수만 참조 | 관리자 화면 20개 상태에서 팔레트 밖 색 **1건**뿐 |
| 라벨 열 96px (§6-3) | `ui/input/TextField` 컴포넌트가 `--label-w` 사용 | 전 폼에서 **정확히 96px** |
| 폼 폭 720 · 칸 폭 280/480/200 (§6-3) | **없음** — `--form-max` 토큰은 정의만 되고 **사용처 0** | 폼 7개 전부 PC에서 **1240px** |
| 오류 표시 (§7-2) | `TextField`는 맞게 구현돼 있다(`aria-invalid`·`aria-describedby`·아래 한 줄) | 그런데 네이티브 `required`가 **먼저** 떠서 영문 말풍선이 첫 관문이 된다 |
| 목록 우선 (§6-1) | **없음** — 산문 규칙 | 마스터 화면 **6개 전부** 폼을 목록 위에 상시 렌더 |

**규칙은 하나다: 컴포넌트가 된 계약은 지켜졌고, 산문으로 남은 계약은 전부
어긋났다.** 예외가 없다.

복제 실측 (`grep -rlE "^\.select" --include=*.module.css`):

```
.select         6개 파일      .toggle        5개 파일
.selectLabel    6개 파일      .table         8개 파일
.formActions    4개 파일      <form> 직접 작성  9개 파일
```

`ui/`에 컴포넌트가 15개 있는데 **Form도 Select도 Table도 없다.** 3차 링크
스타일(`color: var(--accent)` + 밑줄)은 `ui/button` 밖에서 **7곳**에 따로
적혀 있다.

이 복제가 결함을 만든 방식이 기록에 남아 있다:
- 폰 터치 목표 44×44 한 줄 수정을 **세 번** 따로 해야 했다 — `ui/button`(9be176d) →
  `code-tables.module.css`(7aa0536) → `ui/list-empty`(e19c30e). 같은 역할, 다른 파일
- `people.module.css`의 `.detailLink`는 그 셋 중 **폰 media query만** 복사해 갔다.
  기본 규칙이 통째로 없어서 브라우저 기본 파랑 `#0000EE`로 렌더됐다(A-H4)
- `.selectLabel`은 화면마다 복사본이라 `<select>`가 전폭 블록 라벨을 쓴다.
  같은 폼 안에서 `TextField`는 96px 왼쪽 라벨, `<select>`는 위 라벨 — **한 폼에
  라벨 배치가 두 가지**다(A-H2)

**Phase 4에서 할 것**: 화면을 더 만들기 전에 `ui/form`(폼 래퍼 + `--form-max` +
칸 폭 변형) · `ui/select` · `ui/table`을 먼저 만들고, 기존 화면을 그리로 옮긴다.
`03-OPEN-ITEMS.md`의 A-H2·A-H3·A-M1·A-M6·A-M7이 전부 이 한 작업으로 닫힌다 —
화면마다 고치면 7번씩 고쳐야 한다.

**검증도 같이**: `--form-max`처럼 정의만 되고 아무도 안 쓰는 토큰이 또 생기지
않게, 사용처 0인 토큰을 잡는 단위 테스트를 둬라.

## /retro — Phase 3 수치 (2026-09-14 ~ 09-21)

| | |
|---|---|
| 커밋 | 245 (Claude 214 · 사람 31) · 활동일 5 · 세션 19 |
| 유형 | fix 67 · docs 94 · feat 42 · test 20 |
| **fix 비율** | **27%** |
| 테스트 파일 변경 | 1061 · 테스트 삽입 비율 36% |
| PR | 20 (#1~#21) |
| 핫스팟 | `.planning/STATE.md` 22 · `scripts/deploy.sh` 21 · `docs/design/DECISIONS.md` 14 · `docs/design/SYSTEM.md` 11 |

**fix 27%가 이 페이즈의 진짜 지표다.** 커밋 4개 중 1개가 앞서 만든 것을
되돌리는 작업이었다. 그중 대부분이 게이트를 뒤로 미룬 대가다 — `/review` 14건,
`/design-review` 26건, 사용자 스테이징 QA 3건이 전부 **페이즈 끝에** 한꺼번에
왔다. 웨이브마다 돌렸으면 나눠서 맞았을 것들이고, 무엇보다 **사용자가 먼저
발견한 3건**(관리자 화면 도달 불가 · 폼이 목록을 밀어냄 · 행동 로그 UUID)은
게이트가 잡았어야 했다.

`docs/design/SYSTEM.md`가 11번, `DECISIONS.md`가 14번 바뀐 것도 같은 신호다.
계약을 코드로 옮기지 않으니 계약 문서 쪽을 계속 손봐야 했다.

**삽입 줄 수(260만)는 읽지 마라** — 벤더링된 `.claude/skills/` 디렉터리가
대부분이다. 실제 애플리케이션 변경은 PR #21 기준 `+32,655 / -336`, 337개 파일이다.

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
