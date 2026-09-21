# 03-04 Task 1: Phase 4가 물려받을 설정 조회 계약 — 확정 답

**결정:** 옵션 A — 네 항목 전부 계획 문서(03-04-PLAN.md Task 1, 03-RESEARCH.md §5)
그대로 확정.

**근거:** `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`에 2026-09-20
계획 세션에서 사용자가 이미 검토·확정한 기록이 있다("② 03-04 Task 1 — Phase 4 설정
조회 계약"). 이 플랜의 `<resume-signal>`은 「A」 답변을 네 항목 그대로 확정하는 것으로
정의한다. 그 기록을 실행 시점에 그대로 적용한다 — 다시 묻지 않는다.

## 네 항목

**① 값 저장 표를 둘로 나눈다**
`settings_simple(key, value jsonb)`(키당 행 하나, upsert) ·
`settings_historized(key, effective_from date, value jsonb)`(키당 여러 행, `(key,
effective_from)` 복합 UNIQUE). 등록 레지스트리는 하나이고 각 항목이 이력 여부를
메타(`kind`)로 갖는다.

**② 조회 함수의 시그니처**
`getSettingValue(def, opts?)` — `def`는 정의 객체(키 문자열이 아니다), `opts.asOf`는
선택적 날짜(이력형 키에서만 쓰이고 비이력형은 무시한다). 반환은 `def`의 zod 스키마가
보장하는 타입. 「어느 날짜를 넘길지」는 호출자(Phase 4의 금액 모듈)의 책임이다.

**③ 유효값 규칙: `effective_from <= asOf` 중 최댓값, 경계 포함**
적용 시작일이 조회 기준일과 정확히 같으면 그 행이 유효하다. 해당하는 행이 없으면
레지스트리 기본값으로 떨어지고, 기본값도 없으면 예외를 던진다(fail-closed).

**④ 「등록됐으나 읽히지 않는 키」 검출과 그 예외**
검출은 소스 검색(정의 상수 이름이 `domain/settings/` 밖의 프로덕션 코드에서 참조되는지)
으로 한다. 항목이 `readBy: { phase: "N" }` 표시를 달면 검출에서 제외하되 테스트 출력에
목록으로 남긴다. 이 예외가 필요한 이유: ROADMAP 성공 기준 4가 세율·면제 기준·절사
기본값을 Phase 3에 등록하라면서 그 값을 읽는 주체는 Phase 4의 금액 모듈이라고
지정해, 예외 없이는 두 요구가 모순이기 때문이다.

## Task 2가 이 값을 쓰는 지점

- `db/schema/settings.ts`가 ①을 그대로 구현(`settingsSimple`·`settingsHistorized`)
- `domain/settings/registry.ts`의 `getSettingValue`/`setSettingValue`/
  `addHistorizedValue`/`cancelHistorizedValue`가 ②·③을 구현
- `test/unit/settings/registry-coverage.test.ts`가 ④의 검출·예외·ROADMAP 실재 검사를
  구현
- `docs/ARCHITECTURE.md` §4-2가 이 계약을 한 줄로 기록해 Phase 4 계획이 읽을 수
  있게 한다

이 답은 저장된 이력 행의 재해석과 Phase 4~7 모든 호출 지점의 변경 없이는 되돌릴 수
없다(reversibility: one-way) — Task 2부터는 이 문서의 값을 사실로 취급한다.
