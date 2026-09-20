# Phase 3: 권한·설정·마스터 — 가정과 갈림길

**작성:** 2026-09-20 (사용자 부재 중 분석, `discuss-phase-assumptions` 서브에이전트)
**목적:** 사용자가 돌아왔을 때 이 문서만 읽고 각 갈림길에서 선택지를 고르면 바로 `/gsd-plan-phase 3`로 넘어갈 수 있게 한다.

**코드베이스 상태:** Phase 1·2만 완료. `domain/`·`repositories/`는 인증 관련 6개 파일뿐이고 권한·설정·마스터 관련 코드는 전무하다(그린필드). 따라서 이 문서의 대부분은 "코드가 이미 이렇게 되어 있다"가 아니라 "로드맵·아키텍처 문서가 이렇게 쓰여 있고, 실제 구현 시 갈림길이 여기 있다"는 성격이다.

---

## 갈림길 우선순위 요약 (사용자 결정 필요 순)

1. **페이즈 크기 — Phase 3을 쪼갤 것인가** (가장 크다, 계획 5플랜 상한에 영향)
2. **2계층 읽기 강제 수단 — 린트로 끝나는가, 타입 강제가 실제로 가능한가**
3. **누수 스캔 테스트 생성기의 입력 소스 — 런타임 레지스트리 vs 파일 스캔**
4. **이력형 설정과 단순 설정이 한 레지스트리에 공존하는 형태**
5. **can/visible/scopeFor 세 함수의 시그니처와 책임 경계**
6. **회사 도메인 연결이 Phase 3 범위인가** (Phase 2 CONTEXT.md와 ROADMAP 불일치 발견)
7. **커스텀 필드 규약(Issue 13) 필드 타입 변경 금지의 실무적 의미**
8. **암호화 헬퍼 — 이미 있는 것과 없는 것** (확인 완료, 결정 불필요에 가까움)

---

## Assumptions

### 1. 페이즈 크기 — 쪼갤 것인가

- **Assumption:** Phase 3은 그대로 두되(쪼개지 않음), 계획 단계에서 5플랜 상한을 넘길 가능성이 높다는 것을 미리 인지하고 `/gsd-plan-phase 3`가 자연스럽게 여러 플랜(추정 5~7개)으로 나누도록 둔다. 쪼갤 경우의 절단선은 "메커니즘(권한 판정 3함수+누수 스캔+설정 레지스트리+암호화 헬퍼)" vs "마스터 데이터(사람·계급·조직·거래처·법인카드·코드표)"다.
  - **Why this way:** ROADMAP.md Phase 3 절 자체가 "이 페이즈는 메커니즘과 마스터를 세우는 데서 끝나며, 전 메뉴 대상 검수는 Phase 7 끝에서 한다"고 이미 스코프를 좁혀 놓았다(`.planning/ROADMAP.md:142`). CEO 리뷰가 "Phase 3은 메커니즘+마스터로 좁히고 전 메뉴 검수는 패리티 마지막 페이즈 끝으로"라고 명시적으로 이미 한 번 쪼갠 결과다(`.planning/ROADMAP.md:15`). REQUIREMENTS.md 트레이서빌리티가 이미 Phase 3에 13개 요구사항(ADMN-01/02/03/05/06/08/10/12, OPS-05, MAST-01~04)을 배정했고 "By phase" 줄에 "3 (13)"으로 전체 11페이즈 중 최다다(`.planning/REQUIREMENTS.md:283`). Phase 4도 "11개 요구사항으로 5플랜 상한에 닿을 수 있다"고 로드맵이 스스로 경고한 전례가 있다(`.planning/ROADMAP.md:181`) — Phase 3(13개)은 그보다 많다.
  - **If wrong (쪼개지 않고 그대로 뒀는데 실제로 너무 크면):** `/gsd-plan-phase 3`가 실행 중 계획 상한(5플랜)을 넘겨 리플랜을 요구하거나, 억지로 5플랜에 욱여넣어 한 플랜이 과도하게 커져(예: "권한표+정보노출표+누수스캔"을 한 플랜에) TDD 사이클이 깨진다.
  - **Confidence:** Likely — 로드맵 문언은 명확하지만 "쪼개지 않는다"가 실제 계획 단계에서 버텨줄지는 계획해봐야 안다.
  - **사용자 결정 필요:** **예.** 선택지:
    - **A. 그대로 진행, 계획 단계에서 자연 발생하는 다중 플랜을 허용한다** (권장 — 로드맵이 이미 Phase 7 끝 검수로 범위를 덜어냈고, MVP 모드이므로 플랜 수 자체보다 성공 기준 6개 충족이 우선. 성공 기준을 쪼개는 것은 로드맵 재작성을 요구해 사용자 부재 중 임의로 할 수 없는 큰 변경이다).
    - **B. 로드맵을 수정해 Phase 3을 3A(메커니즘: 권한 판정+누수 스캔+설정 레지스트리+암호화+보관함+행동 로그)·3B(마스터: 사람·계급·조직·거래처·법인카드·코드표)로 공식 분할** — Phase 4(프로젝트·견적)가 Phase 3B의 코드표(견적 대소분류 등)에 의존하므로 순서 종속이 생기고, `Depends on: Phase 3`을 쓰는 Phase 4~11 전체의 의존 관계 문서를 다시 써야 한다. 근거 없이 사용자 부재 중 로드맵을 고치는 것은 `.planning/` 수동 편집 금지 원칙과도 부딪힌다.
    - 권장: **A**. B는 사용자 승인 없이 진행할 수 없는 구조 변경이다.

### 2. can() / visible() / scopeFor() 세 함수의 경계

- **Assumption:** 세 함수는 서로 다른 계층·다른 반환 타입을 가진다.
  - `can(viewer, menu, action)` → `boolean`. 권한표(계급×메뉴×동작) 판정. 호출 지점은 `app/`(메뉴 렌더·버튼 활성화)과 Server Action 진입부(쓰기 차단).
  - `visible(viewer, infoItem)` → `boolean`. 정보 노출표(계급×정보 항목) 판정. 호출 지점은 `domain/`의 `project(viewer, dto)` 내부 — DTO의 필드 단위 마스킹/제거에 쓰인다.
  - `scopeFor(viewer)` → 쿼리 빌더에 붙는 조건절(예: Drizzle의 `SQL` 조각이나 `where` 콜백). `repositories/`에서 행 필터로만 쓰인다.
  - 세 함수 모두 `domain/`에 있고 `repositories/`는 `scopeFor`의 반환값만 소비하며 자기 판정 로직을 갖지 않는다.
  - **Why this way:** ROADMAP.md가 이미 이 세 이름과 대략적 책임을 명시했다 — "판정은 `can()`/`visible()`/`scopeFor()` 세 함수에서만 이루어진다. 읽기는 2계층이다: repositories는 `scopeFor(viewer)`로 행만 거르고 전체 컬럼을 반환하며, domain의 출구는 `project(viewer, dto)`를 거친 DTO뿐"(`.planning/ROADMAP.md:144`). `docs/ARCHITECTURE.md:24`도 `project(viewer, dto)`를 domain 출구로 이미 4계층 다이어그램에 넣어 뒀다. `repositories/users.ts:9`의 기존 주석("viewer는 Phase 3의 scopeFor(viewer) 자리")이 정확히 이 예상과 일치한다.
  - **겹치는 지점(주의):** `can()`과 `visible()`의 경계가 실제로는 흐릿하다 — 예를 들어 "손익 숫자를 보는 메뉴 접근"은 `can(viewer, 'pnl', 'view')`인가 `visible(viewer, 'pnl_amount')`인가? ROADMAP 성공 기준 2는 "메뉴·동작·응답 필드가 바뀐다"고 셋을 한 문장에 묶어 이 구분을 명확히 풀어주지 않는다. REQUIREMENTS ADMN-01(권한표=메뉴×동작)과 ADMN-02(정보 노출표=정보 항목)는 별개 표로 정의돼 있어(`.planning/REQUIREMENTS.md:105-107`) 개념적으로는 분리돼 있지만, "메뉴가 없으면 그 메뉴에 딸린 기능도 못 가진다" 같은 상호 의존(260907 권한 기준선의 "메뉴 먼저, 기능 나중" 원칙, `.planning/research/ERP260907-CONTEXT.md:178`)이 이 프로젝트에도 적용되는지는 로드맵에 없다.
  - **If wrong:** `can`과 `visible`의 경계를 잘못 그으면(예: 메뉴 접근 가능 여부와 필드 노출 여부를 한 표로 합침) ADMN-01·ADMN-02를 별개 UI 표로 요구한 REQUIREMENTS와 어긋나 관리 화면을 다시 설계해야 하거나, 반대로 완전히 분리하면 "메뉴 없이 필드만 보이는" 모순된 상태가 생겨 260907이 겪었던 것과 같은 혼란이 재현된다.
  - **Confidence:** Confident (세 함수 존재·이름·대략적 계층은) / Unclear (정확한 시그니처와 두 판정의 상호 의존 여부는).
  - **사용자 결정 필요:** **예 (시그니처는 planner 재량이지만 상호 의존 원칙은 사용자 확인 필요).** 선택지:
    - **A. 완전 독립** — 메뉴 접근(`can`)과 필드 노출(`visible`)을 서로 참조하지 않는다. 관리자가 실수로 메뉴는 막고 필드는 열어둘 수 있다(모순 상태 가능하지만 단순).
    - **B. 메뉴 우선(260907 방식)** — `visible()`이 내부적으로 대응하는 `can()`을 먼저 확인한다(메뉴가 없으면 필드도 자동으로 숨김). 관리자 실수를 줄이지만 두 표 사이에 암묵적 매핑 규칙이 생겨 "정보 항목이 어느 메뉴에 속하는지"를 코드에 등록해야 한다.
    - 권장: **A** — Phase 3 성공 기준 2가 "판정은 세 함수에서만"이라 했지 상호 호출을 요구하지 않았고, B는 정보 항목→메뉴 매핑이라는 추가 레지스트리를 만들어야 해 이 페이즈가 이미 큰데(항목 1) 범위를 더 키운다. A를 택하고 실무에서 문제가 보이면 Phase 7 전 메뉴 검수에서 보강한다.

### 3. 2계층 읽기의 강제 수단 — 린트로 되는 부분과 안 되는 부분

- **Assumption:** "repositories는 domain 안에서만 호출된다"는 **이미 Phase 1의 eslint-plugin-boundaries 설정으로 강제되어 있다** — 새로 만들 필요가 없다. 반면 "domain의 출구는 DTO뿐(행 객체가 app/으로 못 나간다)"은 **boundaries로는 강제 불가능**하고 새로운 수단(타입 강제 또는 커스텀 lint 규칙)이 필요하다.
  - **Why this way:** `eslint.config.mjs:41-47`의 `boundaries/element-types` 규칙을 실측한 결과: `{ from: "app", allow: ["app", "domain", "lib", "ui"] }` — `repositories`가 목록에 없고 `default: "disallow"`이므로 **app→repositories import는 Phase 1부터 이미 컴파일 타임에 막혀 있다.** 이것이 로드맵이 말하는 "repositories는 domain 안에서만 호출(린트)"의 정체다. 반면 domain의 "출구가 DTO뿐"이라는 요구는 import 경계 문제가 아니라 **domain이 export하는 함수의 반환 타입** 문제라서 `boundaries/element-types`가 다룰 수 있는 영역 밖이다 — `domain/*`은 이미 `app`에서 import 가능하고(`{ from: "app", allow: [..., "domain", ...] }`), domain 함수가 `UserRow`(= `InferSelectModel<typeof users>`, 전체 컬럼)를 그대로 반환해도 boundaries는 통과시킨다. 실제로 `repositories/users.ts:7`이 이미 `export type UserRow = InferSelectModel<typeof users>`를 export하고 있어, 오늘 시점에도 이 타입을 domain이 그대로 통과시켜 app에 넘기는 걸 막을 장치가 코드에 없다.
  - **강제 후보(cost 비교):**
    1. **커스텀 ESLint 규칙(타입 인지, type-aware)** — 이미 `money-boundary`(`eslint/rules/money-boundary.mjs`)가 타입 기반 규칙의 전례다. domain 함수의 반환 타입이 `repositories`에서 export된 Row 타입(또는 그 배열/Promise)과 구조적으로 일치하면 에러. 장점: `pnpm lint`가 CI에서 이미 돌고 있어 파이프라인 추가 비용이 0에 가깝다. 단점: TypeScript 구조적 타이핑 특성상 "DTO가 우연히 Row와 같은 필드 집합"인 경우 오탐/누락 가능성.
    2. **Branded 타입** — Row 타입에 `readonly __brand: "row"` 같은 필드를 붙여 `app/`에서 그 타입을 쓰면 타입 에러가 나게 한다. tsc가 강제하므로 lint보다 강하지만, repositories가 반환하는 모든 Row 정의에 브랜드를 일일이 추가해야 하고 Drizzle의 `InferSelectModel`이 만드는 타입을 감싸는 래퍼가 필요해 반복 작업이 생긴다.
    3. **React `experimental_taint` API(2차 방어)** — ROADMAP이 "React taint API가 2차 방어다"라고 명시(`.planning/ROADMAP.md:144`)했으나, 이는 **런타임 방어**(직렬화 시점에 값이 새 나가면 에러)이지 컴파일 타임 강제가 아니다. Next.js 16의 taint API 사용법은 `node_modules/next/dist/docs/`에서 확인이 필요하다(현재 세션에서 미확인).
  - **If wrong (강제 수단을 안 정하거나 lint만으로 충분하다고 가정하면):** domain 함수가 실수로 Row 타입을 그대로 반환해도 빌드가 통과하고, ADMN-03이 요구하는 "우회 경로 없음"이 깨진 채로 이후 페이즈들이 그 domain 함수를 계속 참조해 정보 노출이 새는 채로 굳어진다 — Phase 7 끝 전 메뉴 검수에서야 발견되면 그때는 수십 개 호출 지점을 고쳐야 한다.
  - **Confidence:** Confident (boundaries가 이미 app↛repositories를 막고 있다는 것) / Unclear (DTO 출구 강제를 lint로 할지 타입으로 할지, taint API 실현 가능성).
  - **사용자 결정 필요:** **아니오 (planner 재량 권장)** — 다만 이 사실 자체(boundaries가 이미 절반을 공짜로 해결했다)는 계획 단계에서 반드시 반영해야 하므로 문서화 목적으로 여기 남긴다. 권장 방향: 커스텀 lint 규칙(옵션 1)을 우선하고, taint API는 Next.js 16 문서 확인 후 여력이 되면 2차 방어로 추가(비용이 이미 다른 lint 규칙과 같은 패턴이라 팀 관행에 맞음).

### 4. 누수 스캔 테스트 생성기의 입력 — 열거 방식

- **Assumption:** 세 입력(액션 레지스트리, DTO 타입 목록, Excel 내보내기 함수 목록) 모두 **런타임 등록 방식**(코드에서 명시적으로 배열/맵에 등록)이 되어야 한다. 타입 수준 추출(TS 컴파일러 API로 `"use server"` export나 DTO 타입을 자동 스캔)이나 파일 시스템 스캔(디렉터리 관례로 추론)은 채택하지 않는다.
  - **Why this way:** ROADMAP 성공 기준 3이 "입력은 액션 레지스트리 × 계급, DTO 타입 목록 × 계급, Excel 내보내기 함수 × 계급"이라 이름 붙였고(`.planning/ROADMAP.md:144`), "이후 페이즈는 액션·DTO·내보내기 함수를 등록만 하면 검사가 따라온다"고 명시했다 — "등록"이라는 단어 자체가 수동/명시적 레지스트리를 가리킨다. ADMN-03도 "서버 액션 레지스트리 × DTO 타입 목록 × Excel 내보내기 함수 × 계급에서 자동 생성"이라고 같은 단어를 쓴다(`.planning/REQUIREMENTS.md:107`). 현재 코드에는 액션이 `lib/actions/client.ts`의 `authedActionClient` 하나만 있고 각 액션의 메타(어느 DTO를 반환하는지, 어느 메뉴에 속하는지)를 추적할 곳이 없다 — 즉 자동 스캔이 성립하려면 컴파일러 API 수준의 정적 분석이 필요한데, 이 리포는 그런 인프라(예: ts-morph)를 쓴 전례가 없다(`package.json` 의존성에 없음, 확인 완료).
  - **비용·깨지는 조건 비교:**
    - **런타임 등록(채택 후보):** 비용 낮음(배열에 `{name, dto, exportedBy}` 객체 push). 깨지는 조건: 개발자가 등록을 빼먹으면 그 액션/DTO는 검사 대상에서 조용히 빠진다 — ADMN-03의 "노출표 항목에 매핑되지 않은 DTO 타입이 있으면 테스트가 실패한다"는 조건이 **등록된 것들에 대해서만** 성립하고, 등록 자체를 빼먹는 것은 이 장치가 못 잡는다. 이를 보완하려면 "액션 클라이언트를 통과한 모든 Server Action은 등록이 강제된다"는 별도 lint/런타임 검사가 필요하다(예: `authedActionClient`가 등록 메타를 필수 인자로 요구하게 만드는 방법).
    - **타입 수준 추출(비채택):** 빠뜨림이 구조적으로 불가능(모든 `"use server"` export를 컴파일러가 훑는다)하지만 구현 비용이 높고(ts-morph 등 신규 의존성 필요 — "새 의존성은 이유 한 줄 + 승인" 절차 필요), 통합 테스트 실행 시간이 늘어난다.
    - **파일 스캔(비채택):** 디렉터리 관례(`app/**/actions.ts`)에 의존해 깨지기 쉽고, 이 리포에는 아직 그런 관례가 없다.
  - **If wrong (자동 스캔이 필요한데 런타임 등록만 하면):** 신규 페이즈(4~7)에서 액션·DTO를 추가할 때 "등록"을 깜빡해도 CI가 통과해버려, Phase 7 끝 검수 시점에야 "노출표에 매핑 안 된 DTO 발견"이 아니라 "애초에 검사 대상에 없던 DTO 발견"이라는 더 나쁜 상황(성공 기준 3의 보장이 형식적으로만 성립)이 된다.
  - **Confidence:** Likely — ROADMAP 문언("등록")이 강한 근거지만, "등록 자체를 강제하는 장치"까지 로드맵이 명시하지는 않아 설계 디테일은 planner 재량.
  - **사용자 결정 필요:** **예.** 선택지:
    - **A. 순수 런타임 등록 + 등록 누락은 감수** (구현 가장 단순, ROADMAP 문언에 가장 가깝다. 권장 — MVP 모드이고 Phase 7에서 전 메뉴 검수로 어차피 한 번 더 훑는다).
    - **B. 런타임 등록 + `authedActionClient`를 감싸는 팩토리가 메타 등록을 타입 레벨로 강제**(예: 액션 정의 시 `defineAction({ menu, dto, ... })` 형태를 강제해 등록 없이는 액션 자체를 만들 수 없게 함) — 빠뜨림을 구조적으로 차단하지만 Phase 1이 이미 만든 `authedActionClient` 사용 패턴(및 관련 커스텀 lint `require-action-client`)을 Phase 3에서 확장/변경해야 해 기존 액션 작성 관례가 바뀐다.
    - 권장: **A로 시작하고, Phase 7 검수에서 누락이 실제로 발견되면 B로 보강**(YAGNI — 지금은 액션이 하나도 없어 실측 데이터가 없다).

### 5. 이력형 설정 키와 단순 설정 키의 공존

- **Assumption:** 설정 레지스트리는 키마다 `historized: boolean` 같은 메타를 갖는 단일 표/타입 정의이며, 이력형 키는 `(key, effective_from, value)` 행을 여러 개 가지는 별도 값 저장 표를 통해, 단순 키는 `(key, value)` 단일 행 표를 통해 값을 저장하되 **등록 레지스트리 자체는 하나**(타입·이력 여부·검증 스키마를 한 곳에 선언)다.
  - **Why this way:** ROADMAP 성공 기준 4가 "설정 키는 코드의 typed registry 한 곳에 등록되고 설정 화면이 자동 생성된다"면서 같은 문단에서 "세율·면제 기준(...)은 적용 시작일이 있는 이력형 설정 키로 **이 레지스트리에** 등록된다"와 "로그인 잠금 N·15분(Phase 1)도 **이 레지스트리의** 키다"를 나란히 적어(`.planning/ROADMAP.md:144`) 하나의 레지스트리 안에 이력형·비이력형이 공존해야 함을 분명히 했다. 260907도 이력형 값을 별도 표(`money_rules`)로 관리하면서 "언제부터 무슨 값"의 이력 목록으로 지난 성과를 다시 열어도 그때 세율로 계산되게 했다(`.planning/research/ERP260907-CONTEXT.md:112`) — 이 프로젝트도 EXP-15가 "문서에는 계산 시점의 세율 버전 id가 저장되어 재계산 시 차이가 표시된다"고 같은 요구를 한다(`.planning/REQUIREMENTS.md:50`).
  - **겹치는 지점:** "적용 시작일"의 조회 방향이 규칙 종류마다 다르다 — 원천징수·회사 대납은 지급일(미지급이면 지급 예정일) 기준, 부가세는 증빙일(없으면 작성일) 기준으로 그 시점에 유효한 버전을 찾아야 한다(Eng OV-5, `.planning/ROADMAP.md:144`). 즉 이력형 값 조회 함수는 단순 "최신값"이 아니라 "특정 시점 기준 유효값"을 반환해야 하고, 이 조회는 Phase 4의 `domain/money.applyTaxRule()`이 호출하므로 **Phase 3이 만드는 이력형 설정 조회 API의 시그니처가 Phase 4의 계약**이 된다.
  - **If wrong:** 이력형·비이력형을 처음부터 별도 레지스트리 두 개로 만들면 "설정 화면이 자동 생성된다"(ADMN-05)는 요구가 두 화면으로 쪼개지거나 통합 로직이 이중화되고, Phase 4가 기대하는 단일 `applyTaxRule()` 호출 지점과 설정 조회 방식이 어긋나 Phase 4 계획에서 리워크가 생긴다.
  - **Confidence:** Confident — ROADMAP 문언이 "이 레지스트리에"라는 표현을 반복해 명확하다.
  - **사용자 결정 필요:** **아니오** — 설계가 로드맵에 이미 강하게 암시돼 있어 planner 재량으로 충분하나, "특정 시점 기준 유효값 조회 함수의 정확한 시그니처"(예: `getSetting(key, { asOf: date })`)는 Phase 4와 맞물리므로 계획 단계에서 Phase 4 관점을 함께 검토할 필요가 있다는 점만 남긴다.

### 6. 암호화 헬퍼 — APP_DATA_KEY_v1은 이미 있다

- **Assumption:** `APP_DATA_KEY_v1` 환경 변수는 **Phase 1에서 이미 계약이 만들어져 있다.** Phase 3의 일은 새 환경 변수를 추가하는 게 아니라, 이미 존재하는 계약을 실제로 읽어 쓰는 `encrypt()/decrypt()` 헬퍼(AES-256-GCM, `v1:` 접두어)를 domain에 구현하는 것뿐이다.
  - **Why this way:** 직접 확인 완료 — `lib/env.ts:67`에 `APP_DATA_KEY_v1: optionalString()`가 이미 스키마에 있고, `ENV_KEYS` 배열(`lib/env.ts:135`)에도 포함되어 있다. `docs/ARCHITECTURE.md:111`도 환경 변수 표에 `APP_DATA_KEY_v1`을 "암호화 키 자리(Phase 3부터 사용)"로 이미 기록해 뒀고, §10 "이후 페이즈가 교체·추가하는 지점"이 "Phase 3: ... 암호화 헬퍼(`APP_DATA_KEY_v1` 사용 시작)"라고 명시한다(`docs/ARCHITECTURE.md:122`). 다만 `optionalString()`이라 값이 없어도 앱이 뜬다 — Phase 3에서 이 키가 없을 때 앱을 fail-closed로 죽일지, 암호화 기능만 비활성화할지는 정해져 있지 않다.
  - **If wrong:** 만약 이 가정이 틀려서 실제로는 아직 시크릿이 Secret Manager/GitHub Actions 변수에 등록되지 않았다면(코드 계약과 실제 배포 인프라 상태는 별개), Phase 3의 암호화 기능이 스테이징/프로덕션에서 값 없이 배포되어 "거래처 계좌번호 저장 시 500 에러" 같은 배포 후 장애로 처음 발견된다.
  - **Confidence:** Confident (코드 계약 존재) / Unclear (실제 Secret Manager에 값이 채워졌는지 — 이 세션에서 GCP를 조회할 수 없어 확인 불가).
  - **사용자 결정 필요:** **아니오 — 확인만 필요.** 계획 단계 또는 배포 직전 체크리스트에 "Secret Manager에 `APP_DATA_KEY_v1` 실제 값 존재 확인"을 사람 체크포인트로 넣을 것을 권장한다(Phase 1 D-03처럼 로컬에서 되는 것과 실제 GCP가 필요한 것을 분리하는 기존 패턴을 그대로 따르면 됨).

### 7. Phase 2가 남긴 빚 중 Phase 3에 걸리는 것

- **Assumption:** `WINDOWS.md`의 open 항목 5개 중 Phase 3에 직접 영향을 주는 것은 **없다.** 4건(#1~4)은 Phase 1의 `.squawk.toml` lint-warning 제외 항목(better-auth 스키마 특성)이라 권한·설정·마스터 표 설계와 무관하고, 1건(#7)은 `SYSTEM.md` §2-2/§6-9 토큰 충돌로 "KPI 타일을 처음 만드는 페이즈"(Phase 9~10)에서 정리하기로 이미 사용자가 결정해 뒀다(`.planning/WINDOWS.md:24`, DECISIONS.md 기록).
  - **Why this way:** `WINDOWS.md` YAML 표를 직접 읽어 확인(`.planning/WINDOWS.md:16-29`) — open 상태 5건의 phase·file 열을 대조한 결과 Phase 3의 화면(사람·조직·권한표·설정·거래처·법인카드·코드표)이 쓸 컴포넌트(폼·목록·표)와 겹치는 항목이 없다.
  - **다만 별도로 발견한 것 — SYSTEM.md가 계약만 하고 구현이 없는 컴포넌트:** `SYSTEM.md` §7-3(엑셀식 표)은 계약만 있고 컴포넌트 구현은 Phase 2가 의도적으로 미뤘다(D-25, `02-CONTEXT.md:46`: "표(§7-3)는 만들지 않는다 ... Phase 4가 라이브러리 선택과 함께 다시 만들게 된다"). Phase 3의 성공 기준 1·5(사람 등록, 거래처·법인카드·코드표 관리 화면)는 목록·폼 템플릿(§6-1·§6-3)만으로 될 가능성이 높지만, 만약 이 화면들 중 하나라도 "표 안에서 여러 줄을 한 번에 편집"하는 엑셀식 입력을 요구한다면(예: 코드표 여러 항목을 한 번에 정렬·수정) §7-3 컴포넌트가 아직 없어 Phase 3이 그것을 앞당겨 만들어야 하는 상황이 생긴다.
  - **If wrong:** Phase 3 계획 단계에서 마스터 관리 화면 중 하나가 표 컴포넌트를 필요로 하는데 이를 놓치면, Phase 4가 표 컴포넌트를 선택하기도 전에 Phase 3이 임시 표를 만들었다가 Phase 4에서 버려지는 이중 작업이 생긴다.
  - **Confidence:** Confident (WINDOWS.md 대조는 직접 확인) / Likely (마스터 화면들이 목록·폼 템플릿만으로 충분한지는 실제 화면 설계 전이라 단정 불가).
  - **사용자 결정 필요:** **아니오** — planner가 각 마스터 화면(사람·거래처·법인카드·코드표)을 목록+폼(추가/수정은 모달 또는 별도 화면)으로 설계하면 §7-3 없이 갈 수 있다는 것이 기본 가정이며, 코드표처럼 "여러 행을 한 번에 관리"가 자연스러운 화면만 계획 단계에서 재확인하면 된다.

---

## 발견한 충돌 (로드맵/요구사항/잠긴 결정 사이)

### 충돌 A: 회사 도메인 연결이 Phase 3 범위인가

- **로드맵 Phase 3 절**은 도메인 연결을 요구사항·성공 기준 어디에도 언급하지 않는다(ADMN-01~12, MAST-01~04, OPS-05 목록에 없음, `.planning/ROADMAP.md:142-147`).
- **Phase 2 CONTEXT.md의 deferred 섹션**은 "회사 도메인 연결(예: `erp.plant8.co.kr`) — Phase 1 이월 항목이 '2~3'이었다. **Phase 3으로 확정**한다. 직원 공개는 계정·권한(Phase 3)이 선 뒤이고..."라고 명시적으로 결정했다(`02-CONTEXT.md:158`).
- **의견:** 이것은 로드맵 성공 기준에 반영되지 않은 Phase 2 세션의 결정이다. Phase 3 ROADMAP 절이 이후 갱신되지 않았거나, 도메인 연결이 애초에 "성공 기준"이 아니라 "배포 부수 작업"으로 간주되어 로드맵에 굳이 안 올라간 것일 수 있다. `deploy.sh`에는 이미 도메인 인자 자리가 있다(D-15, `01-CONTEXT.md:41`)고 하니 실제 작업량은 작을 가능성이 있다. **로드맵이 이겨야 한다고 본다** — 로드맵의 요구사항·성공 기준 목록이 계획의 1차 출처(CLAUDE.md 워크플로 원칙)이고, 도메인 연결은 어느 요구사항(REQUIREMENTS.md)에도 대응하지 않는 순수 인프라 작업이라 Phase 3의 "성공 기준 충족" 여부와 무관하다. 다만 사용자가 실제로 이번 페이즈에서 직원에게 도메인을 공개하고 싶다면 계획에 선택 작업으로 끼워 넣을 수 있다.
- **사용자 결정 필요:** **예.** 선택지:
  - **A. Phase 3 범위에서 제외** — 로드맵 문언을 따른다. 도메인 연결은 필요해지는 시점(전 직원 계정 발급 완료 후, 즉 Phase 3 완료 시점 근처)에 별도 `/gsd-quick`으로 처리 (권장 — Phase 3 계획을 깨끗하게 유지).
  - **B. Phase 3 계획에 포함** — Phase 2 CONTEXT.md 결정을 존중해 이번 페이즈 계획에 명시적 작업으로 추가한다.

### 충돌 B (경미): 완료 처리 강행 설정 키의 세분화 수준

- 260907은 완료 승인 전 조건이 3~4개(매출·미결 지출결의·계약금액 정합 등, `ERP260907-CONTEXT.md:39`)였는데 현재 PROJ-06/EXP-16 등은 "미결 지출결의·미매칭 견적 줄·매출 미입력" 셋으로 정리돼 있다(`.planning/REQUIREMENTS.md:31`). 이 자체는 Phase 6 범위(PROJ-06)라 Phase 3에 직접 영향은 없지만, **그 점검이 참조할 설정 키(강행 허용 on/off)의 등록은 Phase 3 레지스트리 몫**이다. 로드맵에 명시적 충돌은 없으나, 이 설정 키의 이름·형태를 Phase 3이 미리 잘못 좁게 설계하면(예: on/off 하나만) Phase 6에서 실제로 필요한 것이 "점검 항목별 on/off 셋"으로 드러날 때 재설계가 필요하다.
- **의견:** 이것은 로드맵끼리의 충돌이 아니라 설계 디테일 리스크이므로 사용자 결정보다는 계획 단계에서 "강행 허용 여부"를 항목별 boolean 배열로 미리 넉넉하게 설계해 두는 것으로 충분하다(Unclear, 결정 불요).

---

## Needs External Research

- **React 19/Next.js 16의 `experimental_taint` API 정확한 사용법과 이 프로젝트의 RSC 흐름(Server Action → domain → DTO)에 적용 가능한지**는 `node_modules/next/dist/docs/`를 계획 단계에서 직접 확인해야 한다(이 세션은 코드베이스 분석에 한정해 문서를 열지 않았다).
- **AES-256-GCM 구현에 Node.js 내장 `crypto` 모듈로 충분한지, 아니면 라이브러리가 필요한지**는 이번 조사 범위 밖이다(신규 의존성 여부는 "새 의존성은 이유 한 줄 + 승인" 절차 대상).
- **법정 공휴일 규칙 자동 생성(ADMN-11)에 쓸 수 있는 한국 공휴일 계산 라이브러리/규칙(음력 변환 포함) 유무**는 Phase 3이 아니라 Phase 7(ADMN-11이 Phase 7 배정, `.planning/REQUIREMENTS.md:256`)의 몫이라 이번 조사에서 제외했다.

---

*분석 근거: `.planning/ROADMAP.md`(Phase 1~7 절 전문), `.planning/REQUIREMENTS.md`(전문), `.planning/PROJECT.md`(전문), `.planning/research/ERP260907-CONTEXT.md`(전문), `docs/ARCHITECTURE.md`(전문), `.planning/phases/01-*/01-CONTEXT.md`·`02-*/02-CONTEXT.md`(D-1~D-32 전문), `.planning/WINDOWS.md`, 코드베이스(`domain/`·`repositories/`·`lib/`·`eslint.config.mjs`·`app/(app)/settings`·`app/(app)/admin` 직접 열람).*
