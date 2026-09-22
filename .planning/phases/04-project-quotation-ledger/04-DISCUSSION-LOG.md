# Phase 4: 프로젝트·견적 원장 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-21
**Phase:** 04-project-quotation-ledger
**Areas discussed:** 컨텍스트 게이트, 이월 보안 F1·F2, 프로젝트 상태 4종, 엑셀식 표,
문서 번호 카운터, 인트라넷 데이터 원천·페이즈 크기, 금액 모델·게이트·차수·demo 표시

---

## 컨텍스트 게이트 (plan-phase 진입 전)

| Option | Description | Selected |
|--------|-------------|----------|
| discuss-phase 먼저 | ROADMAP이 「계획 단계에서 정한다」고 미뤄 둔 결정을 CONTEXT.md에 박는다 | ✓ |
| 컨텍스트 없이 계획 진행 | 요구사항 + 리서치만으로 계획하고 계획 게이트에서 뒤집는다 | |

**User's choice:** discuss-phase 먼저
**Notes:** `/gsd-plan-phase 04`가 `has_context: false`로 게이트를 걸었다. 워크플로는 「명령을
출력하고 종료」를 지시하지만(#1009 — 중첩 서브컨텍스트에서 AskUserQuestion이 깨짐) 이 세션은
Skill이 최상위 컨텍스트로 주입돼 해당하지 않아, 순서만 지키고 왕복은 생략했다.

---

## 이월 보안 F1·F2

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 맨 앞 | UI 컴포넌트보다 앞에, 회귀 테스트와 함께 별도 커밋 | ✓ |
| Phase 4 계획에 정식 태스크로 | 계획자가 플랜 안에 배치. 추적은 정확하나 5플랜 상한에 압력 | |
| Phase 4에 넣지 않음 | 03-OPEN-ITEMS에 남겨 계속 이월 | |

**User's choice:** Phase 4 맨 앞
**Notes:** 두 건 모두 원문 직접 확인함. F1은 Dockerfile 40행 이후 런타임 스테이지에
`APP_ENV`가 없어 `lib/env.ts` zod 기본값 `"local"`로 떨어지는 것, F2는
`repositories/vendors.ts:47`이 `archivedAt` 필터 없이 `eq(vendors.id, id)` 하나뿐인 것.

---

## 프로젝트 상태 4종

| Option | Description | Selected |
|--------|-------------|----------|
| 전부 반영 | PROJ-04·EXP-08·PNL-07 + ROADMAP 기준 4를 고친다 | ✓ |
| 상태만 4종, 용어는 나중에 | PNL-07 용어 변경은 Phase 10으로 | |
| 보강하지 않음 | 진행·완료 2종 유지 | |

**User's choice:** 전부 반영

| 곁들인 질문 | 선택 |
|---|---|
| 프로젝트 번호 부여 시점 | **등록 시 — 수주중부터** (vs 진행 전환 시) |
| 수주중 지출결의 + 고객 승인 게이트 | **올릴 수 있고 게이트 면제** (vs 사전 견적 승인 필요 / 못 올림) |
| 미수주 → 진행 되살리기 | **가능, 상태 전이로** (vs 불가, 복사해서 새로) |

**Notes:** 번호 시점과 수주중 지출결의는 서로 묶여 있다 — 지출결의 번호가 `26001-0001`로
프로젝트 번호에 업혀 있어, 번호가 없으면 수주중에 지출결의를 문서로 만들 수 없다.

---

## 엑셀식 표

| Option | Description | Selected |
|--------|-------------|----------|
| 자체 구현 | DOM 기반, tokens.css만, 새 의존성 0 | ✓ |
| TanStack Table + 자체 상호작용 | 열·행 모델은 라이브러리, DOM은 직접 | |
| 완성형 그리드 (AG Grid 등) | 범위 선택·클립보드를 바로 얻지만 유료 + 자체 DOM·테마 | |

**User's choice:** 자체 구현

| 곁들인 질문 | 선택 |
|---|---|
| ui/table 범위 | **둘로 나누되 칸 접기 공유** (vs 하나로 editable prop / ui/table만) |
| 관리자 읽기 표 6개 이관 시점 | **Phase 7로** (vs Phase 4 지금 / 한 화면만 시범) |
| 충돌 감지 | **행별 updatedAt 비교** (vs version 정수 컬럼 / 감지 안 함) |

**Notes:** canvas 기반 그리드(Glide 등)는 이 프로젝트가 UI를 실제 DOM 실측으로 검증하므로
애초에 후보가 아니라고 논의에서 명시했다. §7-3이 요구하는 폰 칸 접기·서버가 안 보내는 열·
고정 오류 셀·외화 2행은 어느 라이브러리에도 없다.

---

## 문서 번호 카운터

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 유지 + 문서 정정 | counter_key·period·value 유지, 매핑을 ARCHITECTURE.md에 | ✓ |
| ROADMAP대로 개명 | RENAME COLUMN 마이그레이션 | |

**User's choice:** 기존 유지 + 문서 정정

| 곁들인 질문 | 선택 |
|---|---|
| 지출결의 뒷자리 순번 통 | **전사 한 통** (26GA와 공유) — 사용자가 해석을 확인해 줌 |
| 견적 차수 번호 `26001-1차` | **차수는 정수, 표시만 1차** (vs 문자열 번호로 저장) |
| ADMN-09 서식 설정 범위 | **서식 문자열 한 줄씩, Phase 4는 2종만** (vs 7종 전부 / 코드 고정) |

---

## 인트라넷 데이터 원천 · 페이즈 크기

| Option | Description | Selected |
|--------|-------------|----------|
| 덤프는 gitignore, 익명화 픽스처만 커밋 | extract가 환경 변수 경로를 읽는다 | ✓ |
| 스키마만 받고 합성 데이터 | amount_basis 표본 대조는 Phase 8로 | |
| 기준 7을 Phase 8로 미룸 | CEO OV-1을 뒤집음 | |

**User's choice:** 덤프는 gitignore, 익명화 픽스처만 커밋

| 곁들인 질문 | 선택 |
|---|---|
| 덤프 시점 | **지금 준비해 줄 수 있음** |
| 페이즈 크기 / 리저브 분리 | **계획자 판단에 맡김** (vs 지금 떼기 / 상한 무시) |
| 토큰 감시 테스트 범위 | **app/ + ui/만** (vs 레포 전체) |

**Notes:** `--form-max`가 레포 전체로는 4곳(docs 목업)에서 쓰이고 있어 범위를 좁히지 않으면
테스트가 오늘 바로 통과해 아무것도 못 잡는다는 실측을 제시했다.

---

## 금액 모델 · 게이트 · 차수 · demo 표시 (추가 라운드)

사용자가 첫 네 영역 뒤 「회색지대를 더 볼래」를 골랐다. 제시한 넷을 모두 선택했다.

| 질문 | 선택 | 버린 대안 |
|---|---|---|
| Money 수치 표현 | **최소단위 정수 + bigint** | numeric + 십진 문자열 · 원 단위 실수 number |
| rules.gate 반환 | **`{ allowed, reason, ruleKey }`** | boolean + 예외에 이유 · boolean만 |
| 견적 차수의 줄 소유 | **줄이 차수에 속하고 새 차수는 복사본** | 줄은 프로젝트 소유 + 스냅샷 표 · 새 차수로 FK 이월 |
| source='demo' 강제 | **업무 표마다 컬럼 + 누락 감지 테스트** | 프로젝트에만 두기 · createdAt으로 판정 |

**Notes:** 넷 다 뒤 페이즈가 물려받는 것이라 계획자가 조용히 고르면 되돌리기가 비싸다고
보고 별도 라운드로 올렸다. Money 표현과 차수 소유 구조는 `one-way`로 기록했다.

---

## Claude's Discretion

사용자가 위임한 것은 없다. 아래는 이번 논의가 **정하지 않은 채로 남긴** 것이고 CONTEXT.md의
같은 절에 적혀 있다.

- `Money`의 객체 모양 (단일 객체 vs 금액만 브랜디드 + 행 컬럼)
- `ui/form`의 칸 폭 변형 API 형태
- 엑셀 그리드의 범위 선택·클립보드 구현 세부
- `custom_fields`를 프로젝트·견적 줄에 어떤 키로 적용할지
- 목록 p99 500ms 증명 방법
- `rules.gate`의 `rule` 인자 모양 (반환 형태만 정해졌다)

## Deferred Ideas

- 관리자 읽기 표 6개 이관 + DOM 감사 2·6·7 → Phase 7
- RSV-02 (리저브에서 매출 충당) → Phase 9
- PROJ-06 (완료 시 미결 점검) → Phase 6
- 번호 서식 설정 키 5종 → 각 문서를 만드는 페이즈
- 인트라넷 적재·검증·델타 이전·전환 → Phase 8
