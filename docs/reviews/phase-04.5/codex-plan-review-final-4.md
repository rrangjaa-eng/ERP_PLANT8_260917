codex
| 이전 지적 | 상태 | 현재 계획의 근거 |
|---|---|---|
| final: 칸·계급 동시 생성 시 노출 누락 | RESOLVED | 01 Task 1③④·03 Task 1②: 동일 잠금 뒤 같은 `tx`로 목록 조회·삽입 |
| final: 선택형 수정 최소 선택지 검증 누락 | RESOLVED | 02 Task 2④·behavior: 저장된 타입 기준 빈 배열·생략 거부, 행·버전·로그 불변 검사 |
| final: 수정 성공 결과 소실 | RESOLVED | 02 Task 2⑥: 바깥 액션 상태 유지, 본문만 `key={version}` |
| final: E2E 필수 칸의 일시적 공개 | RESOLVED | 06 Task 1④: 생성 트랜잭션부터 전용 계급만 노출 |
| final: 오래 열린 거래처 폼 저장 실패 | RESOLVED | 05 Task 1②·Task 2④: 존재하지만 입력 대상 밖인 키는 버리고 저장값 유지 |
| final: 생산·소비 심볼 불일치 | RESOLVED | 02 Task 2④: 목록 기반 이름 조회. 06 Task 1④: 생성 후 `version` 재조회 |
| final: Phase 4 브랜치 미대조 | RESOLVED | ref `15bdf48` 대조 완료. `project.ts:73` 호출 계약 및 `repositories/field-definitions.ts:9`의 두 인자 호출 유지 가능 |
| final-2: 잠금 보유 중 별도 연결 조회 | RESOLVED | 01 Task 1③④·03 Task 1②: 운영 경로에 선택 `tx` 전달, 풀 크기 동시 호출 검사 |
| final-2: 200ms 경합 테스트 | RESOLVED | 03 Task 1 behavior: `defsRead` 또는 실제 advisory-lock 대기 관측 |
| final-2: 입력 초기화 컴포넌트 경계 모순 | RESOLVED | 02 Task 2⑥·Task 3③: 별도 본문 컴포넌트에 선택지 상태 배치 |
| final-3: 공유 잠금 함수의 린트 위반 | RESOLVED | 01 Task 1③·03 Task 1②: `lockCustomFieldGrants(viewer, tx)`로 통일 |
| final-3: 새 계급 생성이 E2E 격리 단언을 깨뜨림 | RESOLVED | 06 Task 1④: 전체 행 수 단언 제거, 전용 계급 보임·시드 계급 행 부재 검사. 여정 계급도 repository로 생성 |
| final-3: 거래처 저장 픽스처의 필수 `id` 누락 | RESOLVED | 05 Task 2②: `id: randomUUID()` 명시 |
| final-3: 누수 스캔의 상위 차단으로 인한 공허한 통과 | RESOLVED | 03 Task 2④: `vendor.value` 활성화 후 값 존재→칸 차단 후 부재 검사 |
| final-3: 셸 경로 인용부호 누락 | RESOLVED | 03 Task 1 acceptance: `"app/(app)/admin/permissions"`로 수정 |

`01` 등은 `.planning/phases/04.5-custom-field-admin/04.5-01-PLAN.md`를 뜻합니다. 상태는 **계획 수정 여부** 기준입니다. 9개 계획과 상위 계약·현재 코드·Phase 4 ref를 대조했으며, 파일 수정과 DB·E2E 실행은 하지 않았습니다.

- **[MINOR] 복원 안내 링크가 404로 연결될 수 있음** — **근거:** `04.5-08-PLAN.md` Task 2②④는 두 메뉴의 **write**만으로 링크를 표시한다. 실제 보관함 페이지는 별도로 **view**를 요구한다(`app/(app)/admin/archive/page.tsx:15`). 권한은 동작별 독립 조회다(`domain/permissions/can.ts:27`). 승인 UI-SPEC O22도 view를 요구한다. — **수정:** 두 쓰기 권한에 `admin.archive` view도 AND로 추가하고, write만 있는 경우 링크가 없는 테스트를 넣는다.

- **[MINOR] E2E 주입 함수가 동일 연결 규칙을 다시 벗어남** — **근거:** `04.5-06-PLAN.md` Task 1④는 잠금 안에서 호출되는 계급 목록 dep에 `findRoleById` 조회를 넣는다. 해당 함수는 전역 `db`를 사용한다(`repositories/roles.ts:19–21`). 운영 경로의 수정은 유효하지만 테스트 픽스처에는 추가 연결 의존이 남는다. — **수정:** 생성 함수를 부르기 전에 전용 계급을 조회하고, dep는 확보한 행 배열만 반환하게 한다.

- **[MINOR] CSS 수용 기준이 요구한 구분선을 거부함** — **근거:** `04.5-06-PLAN.md` Task 1③(b)는 `border-top: 1px solid var(--line)`을 요구하면서 같은 Task acceptance는 새 px 리터럴이 없고 값이 전부 `var(--…)`일 것을 요구한다. — **수정:** 승인 UI-SPEC의 `1px` 구분선 두께를 명시적 예외로 둔다.

- **[NOTE] 한 세션 범위가 여전히 큼** — **근거:** 02·04·05·06·07의 `estimate`가 각각 10만~12만 토큰이며 모두 「한 세션에 플랜 하나」다. 특히 07은 여정·독립 감사·수정·병합·마이그레이션 재생성·전체 게이트를 묶는다. — **수정:** 최소한 07의 감사와 병합 검증을 별도 실행 단위로 나누고 산출물·검증 계약을 유지한다.

판정: 막는 문제 없음
tokens used
