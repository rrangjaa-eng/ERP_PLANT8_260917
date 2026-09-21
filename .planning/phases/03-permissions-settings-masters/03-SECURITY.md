# Phase 3 — 보안 감사 기록 (Security Record)

- 페이즈: 03-permissions-settings-masters
- 감사일: 2026-09-21
- 기준: ASVS Level 1, block_on: high
- 위협 레지스터: 03-01~03-07 일곱 개 계획에 걸쳐 고유 위협 T-03-01 ~ T-03-54(54건) + 계획마다 반복되는 공통 항목 T-03-SC(7건) = 총 61행
- 심각도 분포: high 32 · medium 22 · low 7
- 집계: 총 61 · 완화(mitigated) 57 · 수락(accepted) 3 · 열림(open) 0

## 열려 있던 위협과 해소

### T-03-30 — Elevation of Privilege (high) — CLOSED

위협 모델은 "zod 스키마가 계급 식별자를 등록된 계급 집합으로 제한"하는 검증을 계급이 바뀌는 두 진입점 **모두**에 요구했다: 사람 등록(`registerPerson`)과 계급 변경(`changePersonRole`).

- `registerPerson`(`domain/people/index.ts`)에는 `findRoleById` 조회 + `archivedAt` 검사가 이미 있었다.
- `changePersonRole`은 같은 검사 없이 `roleId`를 `repoUpdateUserRole`로 그대로 흘려보냈다. 유일한 방어는 DB 외래키 `users_role_id_roles_id_fk`(`db/migrations/0003_permissions_masters_spine.sql`에서 NOT VALID로 생성, `db/migrations/0004_users_role_id_validate.sql`에서 VALIDATE)였는데, 이 FK는 존재하지 않는 role_id만 막고 **보관(archived)된 role_id는 통과**시킨다.
- `repositories/permissions.ts`의 `findPermission`은 `roles.archived_at`을 필터링하지 않으므로, 보관된 계급의 권한 행은 여전히 완전히 유효하다. 결과적으로 이 경로로 은퇴한 계급을 특정 사용자에게 재활성화할 수 있는 구멍이었다.

**수정**: 커밋 `f8fdb44`("계급 변경도 등록된·보관되지 않은 계급만 받게 한다")에서 `registerPerson`과 동일한 `findRoleById` + `archivedAt` 검사를 `changePersonRole`에 추가했다(`ChangePersonRoleDeps`에 `findRoleById` 주입, `domain/people/index.ts` 226~232행). 단위 테스트 `test/unit/people/change-person-role.test.ts`가 미등록 id 분기와 보관된 계급 분기를 모두 커버하며, 두 경우 모두 액션 로그 행이 기록되지 않음을 검증한다.

## 수락한 위험 3건

### T-03-08 — Spoofing (medium) — 수락

- 근거: 계급을 클라이언트가 스스로 지정해 스푸핑할 수 있는지가 우려였으나, `lib/auth.ts` 35행에서 `roleId`를 `{ type: "string", required: false, input: false }`로 등록해 회원가입 요청 바디로 넘어온 값을 아예 받지 않는다.
- 무엇을 감수하는가: 서버 측 기본값/후속 로직이 role 배정을 대신 처리한다는 전제에 의존한다 — 이 전제가 깨지면(예: 다른 코드 경로에서 `input: true`로 재등록) 재검토 필요.

### T-03-14 — Tampering (low) — 수락

- 근거: `lib/auth.ts`는 관리자 여부를 나타내는 boolean 필드를 더 이상 등록하지 않는다. `roleId`와 마찬가지로 `input: false`로 막혀 있어 클라이언트가 가입 요청에 admin 플래그를 실어 보내도 반영되지 않는다.
- 무엇을 감수하는가: 관리자 승격은 오직 계급 변경 경로(T-03-30에서 강화됨)로만 이뤄진다는 가정.

### T-03-41 — DoS (high) — 수락

- 근거: `lib/crypto.ts`는 fail-closed로 설계되어 있다 — 키가 없으면 `MissingEncryptionKeyError`, 길이가 32바이트(base64 인코딩 `APP_DATA_KEY_BYTES = 32`)가 아니면 `InvalidEncryptionKeyLengthError`를 즉시 던진다(평문 저장이나 빈 값 통과로 떨어지지 않음). `scripts/deploy.sh` 278행이 `app-data-key-v1` 시크릿을 32바이트로 시딩한다. `test/unit/deploy/app-data-key-length.test.ts`가 배포 스크립트의 값과 `APP_DATA_KEY_BYTES` 상수를 교차 검증한다. 운영자 복구 절차는 `docs/OPERATIONS.md` §9에 문서화되어 있다.
- 무엇을 감수하는가: 키가 없거나 회전 후 남지 않은 경우 평문 유출로 저하(fail-open)되는 대신 암호화 필드를 다루는 기능 전체가 죽는다(fail-closed) — 이 트레이드오프 자체가 의도된 설계이며, 감수하는 대상은 "가용성 저하가 기밀성 저하보다 낫다"는 선택이다.

## 비차단 보강 항목 5건 (수정하지 않고 후속 과제로만 기록)

- **R1 (T-03-16)** — `app/(app)/admin/permissions/actions.registry.ts`와 `app/(app)/admin/visibility/actions.registry.ts`를 아무 곳에서도 import하지 않아, `setPermissionCellAction`/`setVisibilityCellAction`이 죽은 등록으로 남아 leak scan이 보지 못한다. `test/integration/leak-scan.test.ts`는 존재하는 9개 registry 파일 중 7개만 import한다(code-tables, settings, people, corp-cards, vendors, action-log, archive — permissions와 visibility 누락). export 축 검사도 `Array.isArray(EXPORT_REGISTRY)`만 확인할 뿐 `length > 0`을 확인하지 않아, export import를 통째로 제거해도 그린으로 통과한다. 조치: 두 registry import 추가 + `EXPORT_REGISTRY.length >= 2` 단언 추가.
- **R2 (T-03-06)** — 03-01의 불변식 "domain·repositories에 물리 삭제 호출 0건"이 더 이상 성립하지 않는다. `repositories/settings.ts`와 `repositories/team-memberships.ts`가 미래 예정이며 아직 적용되지 않은 행을 취소 메커니즘으로 물리 삭제한다(도메인에서 가드됨). 보관 가능한(archivable) 엔티티 중 삭제 경로를 가진 것은 없다. 조치: 불변식을 ARCHIVABLE_TABLES 범위로 재정의해 페이즈 자체 점검이 사실과 맞도록 한다.
- **R3 (T-03-18)** — `domain/permissions/matrix.ts`의 자기 잠금(self-lockout) 가드는 `admin.permissions`/`write` 조합만 막는다(105~107행). 본인 계급의 `admin.permissions`/`view`를 끄면 권한 격자 화면이 그만큼 영구적으로 404가 되는데 이 경로는 막혀 있지 않다. 조치: 가드를 `view`까지 확장.
- **R4** — 위협 항목 T-03-28/36/45/53이 인용하는 마이그레이션 번호(0004~0007)가 실제 파일과 어긋난다. 실제로는 `db/migrations/0005_settings_registry.sql`, `0006_org_people_cards.sql`, `0007_vendors_crypto_conventions.sql`, `0008_action_log_prune.sql`이며, 0004는 FK VALIDATE 단계(`0004_users_role_id_validate.sql`)로 별도 분리되었다. 완화 내용 자체는 실제 파일 기준으로 재확인해 문제없음 — 문서 표기 오차일 뿐이다.
- **R5 (T-03-33)** — `app/(app)/admin/corp-cards/actions.ts`의 `createCorpCardAction` 스키마에는 `updateCorpCardOwnerAction`(42행)에 있는 owner XOR `superRefine` 검증이 없다. 도메인 검사와 DB CHECK 제약은 여전히 강제하므로, 선언된 3중 방어 중 생성(create) 경로에서는 2겹만 유효하다. 조치: `createCorpCardAction`에도 동일한 `superRefine`을 추가.

## 결론

Phase 3의 유일한 열린 고위험 위협(T-03-30, 계급 변경 시 보관된 계급 방어 누락)은 커밋 `f8fdb44`로 닫혔고, 남은 3건의 수락 위험은 각각 코드 증거로 뒷받침되며, 5건의 비차단 보강 항목은 다음 작업 사이클로 이월한다 — threats_open: 0.
