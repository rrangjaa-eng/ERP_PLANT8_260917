# EVIDENCE-STORAGE — 증빙 버킷 런북 (EVID-01)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·번호·이메일은 적지 않는다(D-03) — `<프로젝트>` 자리 표시.
> OPERATIONS.md가 줄 예산이 없어 이 절을 별도 문서로 둔다(04.3 `CERT-PURGE.md` 선례).

증빙 파일(지출결의 영수증 · 세금계산서)의 바이트는 앱 서버를 지나지 않는다. 브라우저가 서버가 만든 V4 서명 주소로
GCS 증빙 버킷에 직접 올리고, 서버는 GCS 메타데이터(크기 · 형식 · 서명에 묶인 sha256)만 다시 확인한다.
로컬 · CI는 `STORAGE_DRIVER=local`(저장소 루트의 `.data/uploads`)이라 이 문서의 버킷을 쓰지 않는다.

## 1. 이름과 접두어

- 버킷: `<프로젝트>-plant8-<환경>-evidence`(환경 = `staging` · `prod`). 이름 규칙은 `infra/names.sh`의 `evidence_bucket`,
  부트스트랩은 단일 파일이라 같은 값을 상수 `EVIDENCE_BUCKET_SUFFIX`로 들고 있다(단위 테스트가 둘이 같은지 본다).
- 서울 `asia-northeast3` · 균일 버킷 수준 접근 · 공개 접근 방지 강제.
- 접두어 둘:
  - `incoming/{업로드 의도 id}` — 브라우저 업로드 자리. 수명 주기 규칙이 **7일 지난 객체를 지운다**(완료 통보 없이 남은 업로드).
  - `evidence/{파일 id}` — 완료 통보가 `incoming/`에서 옮긴 완료 증빙. **삭제 규칙 없음** + 임시 보존 표식(`temporaryHold`)
    이중 방어. 표식은 버킷 복사 · 이관 때 따라가지 않으므로 1차 보호는 접두어 분리다.
- 소프트 삭제는 기본값(7일)을 그대로 둔다 — 증빙은 법정 보관 대상이라 잘못 지운 객체를 7일 안에 되살릴 수 있어야 한다
  (서명 버킷은 파기 대상 개인정보라 0일로 둔다 · 반대 이유). 객체 키가 의도 id · 파일 id라 덮어쓰기가 없어 버전 관리는 켜지 않는다.

## 2. 누가 무엇을 하나

| 단계 | 하는 일 |
|---|---|
| 소유자 `scripts/bootstrap-gcp.sh` (d-3) | 버킷 생성(또는 설정 맞춤) · 수명 주기 규칙(`incoming/` 7일 삭제 하나, 매번 다시 적용) · 배포 SA에 그 버킷만 `roles/storage.admin` · 런타임 SA **자기 자신에** `roles/iam.serviceAccountTokenCreator`(IAM signBlob — 개인 키 없이 서명) |
| 배포 `scripts/deploy.sh` `ensure_evidence_bucket` | `ensure_cert_bucket` 바로 뒤. 버킷 확인(없으면 이 문서를 가리키며 `deploy failed at ensure_evidence_bucket`) · 균일 접근 · 공개 접근 방지 맞춤 · 런타임 SA에 그 버킷만 `roles/storage.objectUser` |
| 배포 `ensure_evidence_cors` | `deploy_service`가 서비스 주소를 실제 `status.url`로 확정한 **뒤** CORS를 맞춘다 — 원점 = 그 주소 하나 · 메서드 `PUT` `GET` · 헤더 `Content-Type` `x-goog-content-length-range` `x-goog-meta-sha256` |
| 배포 서비스 환경 변수 | `STORAGE_DRIVER=gcs` · `GCS_EVIDENCE_BUCKET=<프로젝트>-plant8-<환경>-evidence`(둘 다 비밀 아님) |

프로젝트 범위 저장소 역할은 누구에게도 주지 않는다. 서비스 계정 키 파일은 없다.

## 3. 처음 켤 때 · 권한이 바뀐 PR

부트스트랩 스크립트가 바뀐 PR은 **머지 전에** 소유자가 그 PR 브랜치의 `scripts/bootstrap-gcp.sh`를 Cloud Shell에서 한 번
다시 돌린다(멱등). 머지 = 스테이징 자동 배포라 버킷이 없으면 배포가 `ensure_evidence_bucket`에서 멈춘다(OPERATIONS §8 서명 버킷과 같다).

```bash
bash scripts/bootstrap-gcp.sh --project <프로젝트> --github-repo <owner/name>
```

버킷 이름이 전역에서 이미 쓰였으면 create가 실패한다 — 그때는 멈추고 이름을 정한다(`infra/names.sh` · 부트스트랩 상수 둘을 함께 바꾼다).

## 4. 점검(읽기만)

소유자 Cloud Shell에서 환경 변수로 돌린다(`--project` 플래그 없음, T-1-32). Actions `verify`의 선택지 한 줄은 아직 없다(`.github/workflows/verify.yml` — 위험 경로라 따로 더한다):

```bash
INPUT_CHECK=evidence-bucket PROJECT=<프로젝트> REGION=asia-northeast3 bash scripts/verify-gcp.sh
```

환경마다 버킷 원문 · 균일 접근 · 공개 접근 방지 · 위치, 수명 주기(`incoming/` 7일 · `evidence/`를 지우는 규칙 없음),
버킷 역할 둘(런타임 `objectUser` · 배포 SA `admin`), 스테이징 CORS 원점 = 스테이징 `status.url`을 본다.
첫 배포 전에는 CORS 줄과 런타임 `objectUser` 줄이 실패하는 것이 정상이다. 런타임 자기 signBlob 바인딩은 배포 SA가 읽을 수 없어
이 점검에 없고, 아래 스모크의 서명 PUT `PASS`가 증명한다.

## 5. staging 스모크(DB · 앱 없음)

실제 GCS가 드라이버의 V4 서명을 받는지 확인한다(05-12 Task 3 · 05-13 staging 확인 전). 소유자 Cloud Shell, 이 저장소의 해당
브랜치 체크아웃 · `pnpm install --frozen-lockfile` 뒤:

```bash
P=<프로젝트>; SA=plant8-staging-runtime@$P.iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding gs://$P-plant8-staging-evidence --project=$P --member=serviceAccount:$SA --role=roles/storage.objectUser
gcloud iam service-accounts add-iam-policy-binding $SA --project=$P --member=user:$(gcloud config get-value account) --role=roles/iam.serviceAccountTokenCreator
gcloud auth application-default login --impersonate-service-account=$SA
pnpm tsx scripts/gcs-sign-smoke.ts --bucket $P-plant8-staging-evidence
gcloud auth application-default revoke
gcloud iam service-accounts remove-iam-policy-binding $SA --project=$P --member=user:$(gcloud config get-value account) --role=roles/iam.serviceAccountTokenCreator
gcloud storage ls gs://$P-plant8-staging-evidence/incoming/ gs://$P-plant8-staging-evidence/evidence/
```

- 첫 줄(런타임 버킷 역할)은 다음 배포의 `ensure_evidence_bucket`이 같은 바인딩을 다시 맞추므로 멱등이다.
- 둘째 줄은 사람이 런타임 SA를 가장하기 위한 **임시** 권한이고, 여섯째 줄이 되돌린다. 바인딩 전파에 1~2분 걸릴 수 있다.
- 스모크 서명은 Cloud Run과 같은 갈래(런타임 SA 자신의 토큰으로 자기 signBlob)다.
- 통과 = 출력의 `put` · `metadata` · `move` · `metadata-after-move` · `retain` · `get` · `oversize-put`(4xx) · `delete` 여덟 줄이 전부 `PASS`이고
  종료 코드 0, 마지막 `ls`가 아무것도 찍지 않는다(스크립트가 실패해도 자기 객체를 지운다).
- `put`이 `FAIL put 403 SignatureDoesNotMatch`면 서명 조립(`lib/gcp/gcs-v4.ts`)을, `FAIL put 403 AccessDenied`류면 역할을 본다.

05-13 staging 확인(앱 전체 경로 — 지출결의에서 증빙을 올리고 크게 보기)은 첫 배포 뒤 같은 버킷으로 다시 본다.

## 6. 남는 객체 정리 — Phase 6 F8

지운 증빙(`removed_at`)의 `evidence/` 객체, 그리고 완료 통보 트랜잭션이 거부된 뒤 남은 `evidence/` 객체의 정리는 이 페이즈가
하지 않는다 — `Phase 6 F8`이 보존 표식 해제를 포함해 맡는다. 재료는 `files` · `upload_intents` 표다.
완료 통보 없이 남은 `incoming/` 객체는 수명 주기가 7일 뒤 지운다.
