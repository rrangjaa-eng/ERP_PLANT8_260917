# Phase 3: 권한·설정·마스터 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-20
**Phase:** 03-permissions-settings-masters
**Areas discussed:** 페이즈 크기와 절단선, 판정 3함수 경계 + isAdmin, 누수 스캔 등록 방식, 마스터 화면의 표, 회사 도메인 연결(충돌)

---

## 논의 방식

Claude가 4개 갈림길 + 문서 충돌 1건을 제시했다. 사용자는 갈림길 4개를 **"네가 추천하는대로 해"** 로 일괄 위임하고, 도메인 연결만 직접 골랐다.

갈림길과 선택지는 사전에 두 문서가 준비했다 — `03-ASSUMPTIONS.md`(사용자 부재 중 분석, 갈림길 8개)와 `03-PATTERNS.md`(패턴 대응, 갈림길 7개). 이 세션은 그중 사용자 결정이 필요한 것만 추려 제시했다.

---

## 페이즈 크기와 절단선

| Option | Description | Selected |
|--------|-------------|----------|
| A. 그대로 진행 | 로드맵을 고치지 않고 계획 단계의 다중 플랜(5~7)을 허용 | ✓ (위임) |
| B. 3A/3B 공식 분할 | 로드맵을 고쳐 메커니즘/마스터로 나눔 | |

**User's choice:** 위임 → Claude가 A 선택 (D-33·D-34)
**Notes:** B는 Phase 4가 3B의 코드표에 의존해 `Depends on: Phase 3`을 쓰는 Phase 4~11 전체 의존 관계를 다시 써야 하는 구조 변경. 절단선(메커니즘 vs 마스터)만 기록해 두고 실제로 터지면 그때 나누기로 했다.

---

## 판정 3함수 경계 + isAdmin

| Option | Description | Selected |
|--------|-------------|----------|
| A. 완전 독립 | `can()`과 `visible()`이 서로를 호출하지 않음. 모순 상태 가능하지만 단순 | ✓ (위임) |
| B. 메뉴 우선(260907 방식) | `visible()`이 대응 `can()`을 먼저 확인. 정보 항목→메뉴 매핑 레지스트리 필요 | |

**User's choice:** 위임 → Claude가 A 선택 (D-35)
**Notes:** REQUIREMENTS가 ADMN-01/ADMN-02를 별개 표로 정의했고, 성공 기준 2는 상호 호출을 요구하지 않았다.

`isAdmin` 처리는 별도 판단으로 **완전 제거**(D-36) + **컬럼은 유지**(D-37)를 택했다. 제거 근거는 성공 기준 2("판정은 세 함수에서만") — `isAdmin` 분기가 남으면 네 번째 판정 경로가 된다. 컬럼 유지 근거는 `.squawk.toml`이 `ban-drop-column`을 예외로 두지 않아 DROP COLUMN 마이그레이션이 `pnpm lint:sql`에서 거부된다는 실측.

변경 반경 실측(2026-09-20): 프로덕션 9개 파일 + 테스트 16개 파일 = 25개. `test/fixtures.ts`의 `createFixtureUser({ isAdmin })`가 테스트 쪽 진원지다.

---

## 누수 스캔 등록 방식

| Option | Description | Selected |
|--------|-------------|----------|
| A. 순수 런타임 등록 | 빠뜨림 감수. 구현 단순, ROADMAP "등록" 문언에 가장 가까움 | ✓ (위임) |
| B. 등록 강제 팩토리 | `defineAction()`으로 등록 없이는 액션을 만들 수 없게 함 | |

**User's choice:** 위임 → Claude가 A 선택 (D-38)
**Notes:** 지금 액션이 `authedActionClient` 하나뿐이라 무엇을 강제해야 하는지의 실측 데이터가 없다(YAGNI). B는 Phase 1의 `authedActionClient` 관례와 `require-action-client` lint를 함께 바꿔야 한다. Phase 7 검수에서 실제 누락이 나오면 얹기로 deferred에 남겼다.

---

## 마스터·관리 화면의 표

| Option | Description | Selected |
|--------|-------------|----------|
| §7-3 정식 구현 | 엑셀식 표 컴포넌트를 이 페이즈가 처음 채움 | |
| 목록+폼으로 우회 | D-25(표는 Phase 4)를 그대로 지킴 | ✓ (위임, 단 예외 1건) |

**User's choice:** 위임 → Claude가 "우회 + 격자 예외" 선택 (D-39·D-40)
**Notes:** 제시된 두 선택지 중 어느 쪽도 그대로 맞지 않았다 — 권한표·정보 노출표의 계급×메뉴×동작은 목록+폼으로 표현할 수 없기 때문이다. 그래서 §7-3(다행 편집·sticky 머리글·오류 셀)은 만들지 않되, **체크박스 격자를 §7-3과 분리된 별개 컴포넌트**로 이 페이즈가 만든다. 격자는 데이터 그리드 라이브러리가 필요한 물건이 아니라 Phase 4의 표 선택과 경쟁하지 않는다.

CLAUDE.md 프론트엔드 규칙에 따라 코드보다 먼저 `SYSTEM.md` §7에 격자 계약을 신설해야 한다(D-30·D-31과 같은 절차).

---

## 회사 도메인 연결 (문서 충돌)

| Option | Description | Selected |
|--------|-------------|----------|
| A. 범위 제외 | 로드맵 문언을 따름. 필요 시점에 `/gsd-quick` | ✓ |
| B. Phase 3 계획에 포함 | 02-CONTEXT.md 결정을 존중 | |
| C. 로드맵에 정식 추가 | 성공 기준으로 올려 충돌 자체를 없앰 | |

**User's choice:** A. 범위 제외 (사용자가 직접 선택)
**Notes:** 02-CONTEXT.md:158은 "Phase 3으로 확정"이라 적었으나 ROADMAP Phase 3 절은 요구사항·성공 기준 어디에도 올리지 않았다. 어느 REQUIREMENTS 항목에도 대응하지 않는 순수 인프라 작업이라 Phase 3의 성공 기준 충족과 무관하다. 충돌은 해소하지 않고 deferred에 기록만 남겼다 — 로드맵을 고치지 않았으므로 02-CONTEXT.md의 문장은 그대로 남아 있다.

---

## Claude's Discretion

사용자 위임으로 D-33~D-40 전부가 Claude 판단이다. 그 밖에 planner 재량으로 넘긴 것:

- DTO 출구 강제 수단 (커스텀 type-aware lint 권장, taint API는 문서 확인 후 2차 방어)
- 설정 레지스트리의 이력형/비이력형 공존 형태 (조회 함수 시그니처는 Phase 4와 맞물림)
- `domain/` 하위 폴더 단위 boundaries 세분화 필요 여부
- 완료 처리 강행 허용 설정 키의 형태 (항목별 boolean 권장)

## Deferred Ideas

- 회사 도메인 연결 — 범위 제외, Phase 3 완료 근처에 `/gsd-quick`
- 누수 스캔 등록 강제 장치 — Phase 7 검수에서 누락 발견 시
- `users.isAdmin` 컬럼 드롭 — Squawk 예외가 필요한 별도 정리 작업
- SYSTEM.md §7-3 엑셀식 표 — Phase 4
- `custom_fields` 관리 화면 — Phase 10 (로드맵 명시)
- 문서 번호 부여 훅 — Phase 4 (로드맵 명시)
- 법정 공휴일 규칙 자동 생성(ADMN-11) — Phase 7
