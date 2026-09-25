codex
계획 기준 판정입니다. 경로의 `01` 등은 `.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md`를 뜻합니다. 파일 변경·테스트 실행은 하지 않았습니다.

| 기존 지적 | 상태 | 근거 |
|---|---|---|
| MAJOR: 칸·계급 동시 생성 시 노출 누락 | **PARTIAL** | 01 Task 1③④·03 Task 1②가 공유 잠금 뒤 조회로 순서 경합을 막는다. 그러나 조회는 여전히 전역 `db`를 사용한다(`repositories/roles.ts:12`, `repositories/field-definitions.ts:10`). 아래 연결 풀 문제로 누락 가능성이 남는다. |
| MAJOR: 선택형 수정의 최소 선택지 검증 누락 | **RESOLVED** | 02 Task 2④가 저장된 타입을 기준으로 `options` 생략·빈 배열을 거부하고, behavior에 행·버전·로그 불변 테스트를 추가했다. 기존 `domain/custom-fields/build-schema.ts:29`의 빈 선택지 입력 경로를 차단한다. |
| MAJOR: 수정 성공 결과가 재마운트로 사라짐 | **RESOLVED** | 02 Task 2⑥가 `key={id}` 바깥에 액션 상태를 유지한다. behavior는 재검증 후 `version=v+1`과 결과 줄을 함께 확인한다. 재검증 선례는 `app/(app)/admin/vendors/actions.ts:52`. 입력 상태 초기화에는 아래 NOTE가 있다. |
| MAJOR: E2E 필수 칸이 다른 계급에 잠시 공개됨 | **RESOLVED** | 06 Task 1④가 01의 계급 목록 deps에 전용 계급만 주입해 정의·노출을 함께 커밋한다. 노출 행 1개 단언도 추가했다. 커스텀 값을 제출하지 않는 기존 테스트(`test/e2e/vendors.spec.ts:36`)에 대한 공개 창이 제거된다. |
| MINOR: 오래 열린 거래처 폼의 저장 실패 | **RESOLVED** | 05 Task 1②·Task 2④가 `knownKeys` 밖만 거부하고, 존재하지만 입력 대상이 아닌 키는 버려 저장값을 보존한다. 열린 폼의 키 제출(`app/(app)/admin/vendors/vendor-form.tsx:98`)과 UI-SPEC E4 stale을 함께 충족한다. |
| MINOR: 생산·소비 심볼 불일치 | **RESOLVED** | 02 Task 2④가 08 「이름 예약 조회」의 목록 조회 계약으로 통일됐다. 06 Task 1④도 `{id,key}`를 받은 뒤 `findFieldDefinitionById`로 version을 재조회한다(`repositories/field-definitions.ts:17`). |

- **[MAJOR] 공유 잠금과 별도 연결 조회가 연결 풀을 고갈시킴** — **근거:** 01 Task 1④·03 Task 1②는 트랜잭션 연결로 잠금을 잡으면서 목록 조회의 기존 시그니처를 유지한다. 실제 조회는 전역 `db`다(`repositories/roles.ts:12`, `repositories/field-definitions.ts:10`). 풀 기본 크기는 5(`lib/env.ts:54`, `db/client.ts:34`). 생성 트랜잭션 5개가 연결을 차지하면 잠금 보유자는 조회용 연결을, 나머지는 잠금을 기다린다. 현재 브랜치는 무기한 대기할 수 있고, Phase 4 ref의 `db/client.ts:20,41`은 5초 후 실패시킨다. 03 Task 1⑤는 grant 실패를 삼키므로 이미 생성된 계급의 노출 행이 영구 누락될 수 있다. — **고침:** 두 목록 조회에 선택 `tx`를 추가하고 잠금·조회·삽입을 같은 연결로 실행한다. 기존 호출은 유지하며 풀 크기만큼 동시 실행하는 회귀 테스트를 추가한다.

- **[MINOR] 경합 테스트의 200ms 대기는 결정적 RED가 아님** — **근거:** 03 Task 1 behavior는 200ms 안에 잠금 없는 grant가 정의 조회를 끝낸다고 가정한다. 느린 CI에서는 조회가 필드 커밋 뒤에 실행돼 잠금을 제거해도 통과할 수 있다. — **고침:** 고정 지연 대신 정의 조회 완료 또는 실제 잠금 대기를 확인하는 동기화 지점을 두고, 잠금 제거 시 반드시 실패하도록 한다.

- **[NOTE] 입력 상태 초기화에 필요한 컴포넌트 경계가 모순됨** — **근거:** 02 Task 2⑥는 「새 컴포넌트·파일 없음」이면서 선택지 React 상태를 안쪽 `key={version}`으로 초기화하라고 한다. DOM·Fragment의 key만 바꾸면 부모 함수의 훅 상태는 초기화되지 않는다. 해당 폼은 아직 계획 대상이므로 구현 근거 없이 MAJOR로 판정하지 않는다. — **고침:** 같은 파일의 내부 컴포넌트에 선택지 상태를 두고 그 컴포넌트에 key를 지정하도록 명시한다. 충돌 후 새로 불러오기에서 활성·보관 선택지까지 초기화되는지 검증한다.

판정: 막는 문제 있음 (1건)
tokens used
