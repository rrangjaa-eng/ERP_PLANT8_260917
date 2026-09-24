1. **[MAJOR] 동시 저장에서 숨은 값이 덮어써짐** — `04.5-05-PLAN.md` Task 2는 먼저 읽은 `existing.customFields`를 병합해 저장한다. 실제 읽기와 UPDATE는 분리돼 있다(`domain/vendors/index.ts:299`, `repositories/vendors.ts:105`). 그 사이 관리자가 숨은 칸을 수정하면 제한 계급의 저장이 이전 값으로 되돌린다 — 거래처 행 잠금과 병합·쓰기를 같은 트랜잭션으로 묶거나 원자적 JSONB 패치를 사용하고, 두 연결 경합 테스트를 추가한다.

2. **[MAJOR] 기존 정의의 노출 행 이관 누락으로 회귀 테스트가 실패함** — `04.5-03-PLAN.md` Task 2·`04.5-05-PLAN.md` Task 2는 노출 행이 있는 키만 허용하면서 기존 `custom-fields.test.ts`가 “수정 없이 초록”이라고 요구한다. 그러나 기존 테스트는 정의만 직접 INSERT한다(`test/integration/custom-fields.test.ts:19`); 시드도 정적 항목만 채운다(`domain/seed/index.ts:166`). 정상 등록 케이스는 거부되고 타입 오류 테스트는 엉뚱한 이유로 통과한다 — 기존 거래처 정의의 노출 행을 일회성으로 채우고, 테스트 픽스처에도 명시적으로 노출 행을 추가한다.

3. **[MAJOR] 병합 절차가 생성 원자성을 제거할 수 있음** — `04.5-07-PLAN.md` Task 3②는 main의 `insertVisibilityIfAbsent`만 남기고 호출부를 맞추라고 한다. 반면 01은 선택 `tx`가 필요하다. 병렬 브랜치 `04-20-PLAN.md:215`의 계약은 두 인자이며, 기존 쓰기 패턴도 전역 `db`를 사용한다(`repositories/permissions.ts:105`) — 병합 후에도 선택 `tx`와 실제 쿼리의 `tx` 사용을 보존한다고 명시하고, 노출 행 일부 INSERT 후 실패할 때 정의·노출 행 모두 롤백되는 테스트를 둔다.

4. **[MAJOR] DOM 감사의 DB 준비 순서가 실행 불가능함** — `04.5-07-PLAN.md` Task 2는 `db:reset:test → 픽스처 시드` 순서다. 해당 명령은 빈 DB만 만든다(`scripts/reset-test-db.sh:7`); 마이그레이션과 기본 시드는 별도 global setup에서 수행한다(`test/e2e/global-setup.ts:14`, `:28`). Task 3의 “`db:dev`로 DB 재생성”도 실제로는 없는 DB만 생성한다 — 테스트 DB 환경을 고정하고 마이그레이션 → 기본 시드 → 감사 시드를 명시한다. 재생성 SQL의 기존 행 백필 검증도 별도로 실행한다.

5. **[MAJOR] 같은 wave의 검증이 공유 DB·서버를 충돌시킴** — 02·03(W2), 04·05(W3)의 각 Task 검증이 독립적으로 통합 테스트·E2E·빌드를 실행한다. 통합 테스트는 매 테스트마다 전체 표를 TRUNCATE하고(`test/integration/setup.ts:14`), E2E는 스키마를 삭제하며 고정 포트 3100을 쓴다(`test/e2e/global-setup.ts:46`, `playwright.config.ts:54`). `fileParallelism: false`는 별도 실행 프로세스를 직렬화하지 않는다 — 공유 환경의 검증을 직렬화하는 실행 규칙을 넣거나 실행자별 DB·포트·빌드 디렉터리를 분리한다.

6. **[MAJOR] 새 DTO를 누수 스캔에서 의도적으로 제외함** — `04.5-01-PLAN.md` Task 1 및 위협표 T-04.5-09는 `FieldDefinitionAdminDto`를 만들면서 “DTO 등록 없음”으로 처리한다. 이는 ROADMAP 성공 기준 5와 충돌한다. 실제 생성기는 등록된 DTO만 순회한다(`test/integration/leak-scan.test.ts:45`) — 금지된 등록부 구현 파일을 수정하지 않고 새 DTO 등록·검사 경로를 추가한다. 메타데이터 예외가 필요하다면 조용히 제외하지 말고 명시적인 검사 계약을 둔다.

7. **[MAJOR] 최종 ‘삭제 줄 0’ 게이트가 계획 자체와 모순됨** — `04.5-07-PLAN.md` Task 3⑤는 `_journal.json`까지 삭제 줄 0을 요구한다. JSON 배열 끝에 항목을 추가하려면 기존 마지막 `}`에 쉼표가 붙는다(`db/migrations/meta/_journal.json:81`). 거래처 폼 예외도 06의 일부 교체만 허용하여 01의 라벨 변경과 05의 제출 변경을 배제한다(`vendor-form.tsx:100`, `:216`) — 타 페이즈 코드 보존 검사와 승인된 변경 목록으로 바꾸고, journal은 기존 항목 보존·연속성을 구조적으로 검사한다.

8. **[MINOR] 전용 계급 픽스처가 필요한 roleId를 반환하지 않음** — `04.5-06-PLAN.md` Task 1④는 `createE2EVendorEditor`가 `createFixtureUser({ roleId })`를 그대로 반환하도록 한다. 실제 반환값은 이메일·비밀번호뿐이다(`test/e2e/fixtures.ts:10`). 다음 픽스처의 `onlyRoleId`와 07 여정의 계급 지정에 사용할 ID가 사라진다 — `{ ...credentials, roleId }` 반환 계약을 명시한다.

9. **[MINOR] 라벨 변경에 필요한 클라이언트 타입 수정 누락** — `04.5-01-PLAN.md` Task 1⑦는 `def.label`로 바꾸지만 로컬 `VendorFieldDefinition`에는 `label`이 없다(`app/(app)/admin/vendors/vendor-form.tsx:16`). domain DTO 변경만으로 이 타입이 확장되지 않는다 — 로컬 타입에도 `label: string`을 추가하도록 명시한다.

10. **[MINOR] 첫 플랜이 단일 실행 세션에 과도하게 큼** — `04.5-01-PLAN.md` Task 1 하나에 스키마·트랜잭션·권한·액션·화면·세 테스트 계층 등 약 30개 파일이 묶이고, 자체 예상도 130,000토큰이다. 병렬 Phase 4는 이미 28파일 플랜을 컨텍스트 초과로 분할했다(`origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-20-PLAN.md:116`) — 최소 등록 트레이서와 오류·이름 예약·완성 UI를 별도 순차 플랜으로 나눈다.

판정: 막는 문제 있음 (10건)
