# Codex-B 2차 리뷰 — Sonnet 1차 대조 (읽기 전용)

계획·코드를 직접 열어 5개 신규 지적을 확인했다. 파일 수정 없음.

| # | Codex 심각도 | 제목 | 판정 | 확인한 근거 (file:line) | 필요한 계획 수정 |
|---|---|---|---|---|---|
| 1 | BLOCKER | 05 버킷 준비가 배포자 권한 부족으로 실패 | CONFIRMED | 계획 `04.3-05-PLAN.md` ②(`main()`에서 `ensure_secrets` 다음 무조건 `ensure_cert_bucket` 호출, 기능 플래그 조건 없음); `scripts/bootstrap-gcp.sh:118-121`(배포자 `gha-deployer` 역할 목록 = run.admin·cloudsql.admin·secretmanager.admin·artifactregistry.admin·monitoring.editor·logging.admin·serviceusage.serviceUsageAdmin·compute.networkAdmin — storage 계열 전무); `.github/workflows/deploy.yml:56-63`(staging/production 잡이 그 `gha-deployer`로 `scripts/deploy.sh` 실행) | 05 계획에 **배포자**(런타임 SA가 아니라)용 버킷 관리 권한(`storage.buckets.create/update/setIamPolicy` 또는 최소 범위 커스텀 롤)을 `bootstrap-gcp.sh`에 추가하고, 이미 부트스트랩된 기존 staging/prod 프로젝트에 1회 적용하는 절차를 명시해야 한다. |
| 2 | MAJOR | 06 트랜잭션 내 DELETE가 현재 `DbOrTx` 타입으로 컴파일 안 됨 | CONFIRMED | 계획 `04.3-06-PLAN.md` ③(f)(`withTransaction` 콜백 안에서 `deleteSignatureUploadIntent(SYSTEM_VIEWER, key, tx)` 호출을 요구); `db/client.ts:48`(`export type DbOrTx = Pick<typeof db, "insert" | "update" | "select">` — delete 없음); `lib/db-transaction.ts:9`(`withTransaction`이 그 `DbOrTx`를 그대로 넘김) | 02 계획에 `DbOrTx`에 `"delete"`를 추가하는 작업을 넣고, 그 소유(02 or 06)를 명시하며, 제출 롤백 시 의도 행(upload intent row)이 남지 않음을 검증하는 통합 테스트를 함께 요구해야 한다. |
| 3 | MAJOR | 04의 PM 테스트가 09의 권한 시드를 선행 요구 (실행 순서 불성립) | CONFIRMED | 계획 `04.3-04-PLAN.md` ⑤(f-0)(`createFixtureUser({roleId: "role-pm"})`로 로그인해 `/certs/events` EMPTY 화면을 기대); 계획 `04.3-09-PLAN.md` ①(PM 계급에 `certs.events` view/write 시드 추가는 **09**에서 처음 이뤄짐); `domain/permissions/can.ts:24-27`(권한 행이 없거나 `allowed`가 아니면 false — `getEventDetail`/`listEvents`는 이 경우 `notFound`로 404); `test/e2e/fixtures.ts:10-19`(`createFixtureUser`는 주어진 `roleId`의 기존 시드 권한을 그대로 물려받을 뿐 04 시점 권한을 보강하지 않음) | 04 실행 시점에 `certs.events` PM 권한이 존재하도록, 그 시드 단계를 04 계획으로 옮기거나(09가 idempotent하게 재확인만 하도록), 04의 f-0 테스트가 자체적으로 `certs.events` 권한을 부여했다가 되돌리는 절차를 넣어야 한다. |
| 4 | MAJOR | 뒤 4자리 추측 방어 — 자리당 누적 상한 결정이 계획에 미반영 | 부분 해소되었으나 아직 CONFIRMED (계획 자체는 안 고쳐짐) | 계획 `04.3-03-PLAN.md` Purpose 문단·T-04.3-03 행(자리당 누적 상한은 "이 플랜에 없다 … 결정 대기"라고 명시, UI 계약 충돌을 이유로 듦); `git show bbe62d1`(오너의 「누적 잠금 넣기로 해」를 반영해 `04.3-UI-SPEC.md`에 E3 누적 잠김 상태·I3 「잠금 풀기」 행동·기본 20회 설정을 추가했지만, 커밋 메시지 자체가 "재검토(Codex + 화면 검사기) 전이라 status를 draft로 되돌렸다"고 기록); `04.3-03-PLAN.md`·`04.3-08-PLAN.md`에는 그 UI-SPEC 변경을 반영한 구현 지시가 아직 없음 | 오너의 결정은 Codex가 지적한 "UI 계약과 충돌"(I3 "담당자는 풀 수 없다")은 해소했다. 하지만 (a) UI-SPEC이 아직 `draft`로 재승인 전이고 (b) 03/08 PLAN과 threat register(T-04.3-03)는 여전히 "결정 대기·자리당 누적 상한 없음" 문구 그대로다. UI-SPEC 재승인 후 03(또는 신설 서브플랜)에 자리당 누적 20회 잠금 판정 + I3 담당자 해제 서버 액션 구현을 실제로 넣어야 finding이 닫힌다 — 설계 문서 변경만으로는 계획이 실행 가능해지지 않는다. |
| 5 | MAJOR | 키 회전 뒤 늦은 확인 재전송이 최신 증표를 무효화 | CONFIRMED | 계획 `04.3-03-PLAN.md` ④(d)("`decrypt`가 실패하면(키 회전 등) 그 항목이 없는 것으로 보고 (e)부터 새로 판정한다" — 성공 시 새 증표를 발급해 자리의 `verify_proof_hash`/`verified_until`을 덮어씀); 계획 `04.3-08-PLAN.md` ⑥-d(`rotate-key.ts`의 `TARGETS`에 `cert_submissions.rrn_encrypted`·`cert_events.token_encrypted`만 추가 — `verify_idem_outcome` JSONB 맵 내부의 `p: encrypt(증표)` 필드는 회전 대상에 없음); `lib/crypto.ts:36-45`(`keyFor`는 옛 버전 raw key가 `env`에 없으면 `MissingEncryptionKeyError`를 던짐, 즉 v1 제거 후 v1 암호문 `decrypt`는 반드시 실패) | 08의 `rotate-key` `TARGETS`(또는 별도 절차)에 `verify_idem_outcome` 맵 내부 재생 암호문의 회전/재암호화를 포함시키거나, 03의 (d) 폴백 경로를 "복호화 실패 → 새 증표 발급(기존 증표 무효화)"이 아니라 안전하게 실패하는 방식으로 바꿔야 한다. |

## 1차 지적 중 PARTIAL 항목 (NOT FIXED로 표시된 항목은 없음)

- **#8** 뒤 4자리 추측 — 시간당 제한만 추가, 자리당 누적 상한 결정 대기 (= 위 4번과 동일 사안).
- **#9** 확인 멱등성 — 키별 맵은 추가됐으나 복호화 실패 시 재발급·만료 처리 문제가 남음.
- **#10** 암호화 키 회전 — 재생용 암호문이 08의 회전 대상 밖 (= 위 5번과 동일 사안).
- **#12** 고아 서명 — 의도 행 추적은 추가됐으나 현재 `DbOrTx` 트랜잭션 타입과 불일치 (= 위 2번과 동일 사안).
- **#22** 누수 스캔을 비노출 증명으로 오인 — 실제 반환값·HTML 검증은 추가됐으나 04의 PM 권한 선행 조건이 누락 (= 위 3번과 동일 사안).
