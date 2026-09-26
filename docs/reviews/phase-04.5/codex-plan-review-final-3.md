codex
계획 파일명은 `.planning/phases/04.5-custom-field-admin/` 기준입니다. 이전 두 리뷰의 중복 지적은 합쳐 표시했습니다.

| 이전 지적 | 상태 | 현재 근거 |
|---|---|---|
| final: 칸·계급 동시 생성 시 노출 누락 | RESOLVED | 01 Task 1③④·03 Task 1②: 같은 잠금 뒤 같은 `tx`로 상대 목록 조회 |
| final: 선택형 수정 최소 선택지 검증 | RESOLVED | 02 Task 2④·behavior: 저장된 타입 기준 빈 배열·생략 거부, 행·버전·로그 불변 검사 |
| final: 수정 성공 결과가 재마운트로 사라짐 | RESOLVED | 02 Task 2⑥: 바깥 액션 상태 유지, 본문만 `key={version}` |
| final: E2E 필수 칸의 격리 실패 | PARTIAL | 06 Task 1④가 생성 시 공개 창은 제거했으나, 이후 계급 생성에 의한 재노출 경합은 남음. 아래 MAJOR |
| final: 오래 열린 거래처 폼 저장 실패 | RESOLVED | 05 Task 1②·Task 2④: 존재하지만 입력 대상이 아닌 키는 버리고 저장값 보존 |
| final: 생산·소비 심볼 불일치 | RESOLVED | 02 Task 2④는 목록 기반 이름 조회, 06 Task 1④는 생성 후 `version` 재조회 |
| final: Phase 4 브랜치 미대조 | RESOLVED | fetched ref `15bdf48` 확인. `project.ts:73`의 호출 계약과 `repositories/field-definitions.ts:9`의 두 인자 호출 유지 가능 |
| final-2: 잠금 보유 중 별도 연결 조회 | RESOLVED | 01 Task 1③④·03 Task 1②: 목록 조회에 선택 `tx` 추가·전달, 풀 크기 동시 호출 검사 |
| final-2: 200ms 경합 테스트 | RESOLVED | 03 Task 1 behavior: `defsRead` 또는 실제 advisory-lock 대기를 관측 |
| final-2: 입력 초기화 컴포넌트 경계 모순 | RESOLVED | 02 Task 2⑥·Task 3③: 같은 파일의 별도 본문 컴포넌트에 선택지 상태 배치 |

- **[MAJOR] 공유 잠금 함수가 필수 린트를 위반함** — **근거:** `04.5-01-PLAN.md` Task 1③의 `lockCustomFieldGrants(tx: DbOrTx)`와 03 Task 1② 호출 계약에는 첫 인자 `viewer`가 없다. 실제 규칙은 모든 repository export 함수의 첫 인자 이름을 검사한다(`eslint/rules/repository-viewer-param.mjs:29`, `eslint.config.mjs:77`). 해당 선언으로 규칙을 직접 실행해 오류를 확인했다. — **고침:** `lockCustomFieldGrants(viewer, tx)`로 통일하고 01·03의 호출·수용 기준도 함께 수정한다.

- **[MAJOR] 새 계급 생성이 E2E 전용 칸 격리를 다시 깨뜨림** — **근거:** `04.5-06-PLAN.md` Task 1④는 커밋 후 노출 행이 정확히 1개라고 단언하지만, `04.5-03-PLAN.md` Task 1②⑤는 새 계급에 모든 정의의 노출 행을 추가한다. 칸 커밋과 단언 사이 다른 워커가 계급을 만들면 2개가 된다. 실제 기존 E2E도 계급을 생성하며(`test/e2e/roles.spec.ts:25`), 스펙들은 DB를 공유한다(`test/e2e/permissions-grid.spec.ts:15`). 07 Task 1 역시 전용 계급을 생성한다. — **고침:** 해당 스펙을 다른 계급 생성 스펙과 분리된 Playwright 실행으로 격리하고, 07 전체 게이트에도 그 실행 순서를 반영한다. 생성 직후 계급을 추가하는 재현 검사도 둔다.

- **[MINOR] 거래처 저장 테스트 픽스처에 필수 `id`가 없음** — **근거:** `04.5-05-PLAN.md` Task 2②의 명시적 `insertFieldDefinition` 호출 객체에는 `id`가 없다. 실제 필수 인자다(`repositories/field-definitions.ts:25`); 01도 자동 생성으로 바꾸지 않는다. — **고침:** 픽스처에서 `id: randomUUID()`를 전달한다.

- **[MINOR] 누수 스캔 일부 계급이 상위 차단 때문에 통과함** — **근거:** `04.5-03-PLAN.md` Task 2④는 `admin.vendors`만 켜고 값 부재를 검사한다. 그러나 DTO 전체가 `vendor.value`에 묶여 있고(`domain/vendors/index.ts:59`), 확인한 Phase 4 시드는 시스템 관리자·PM에만 기본 노출 행을 만든다(`origin/claude/gsd-progress-e1nzgu:domain/seed/index.ts:173`). 다른 세 계급은 칸별 필터가 없어도 통과한다. — **고침:** 각 케이스에서 `vendor.value`를 켜고, 차단 전 값 존재 → 해당 칸 차단 후 부재 → 재활성 후 복귀를 검사한다.

- **[MINOR] 수용 기준의 셸 명령에 인용부호가 빠짐** — **근거:** `04.5-03-PLAN.md` Task 1 acceptance의 `git diff … app/(app)/admin/permissions`는 Bash에서 괄호 구문 오류가 난다. — **고침:** 경로를 `"app/(app)/admin/permissions"`로 감싼다.

파일은 수정하지 않았습니다. 구현 전 계획 검토이며, DB·E2E는 실행하지 않았습니다.

판정: 막는 문제 있음 (2건)
tokens used
