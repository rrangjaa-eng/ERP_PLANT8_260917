# API Coverage — Google Cloud Storage JSON API (v1)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

이 페이즈가 GCS를 쓰는 이유는 하나다 — 수령자 서명 이미지(PNG)를 비공개 버킷에 두고, 경영관리 화면·인쇄물이 읽고, 파기가 지운다. 호출은 `@google-cloud/storage` 없이 기존 `google-auth-library`(`GoogleAuth`)로 JSON API REST를 부르는 어댑터 하나(`lib/gcp/gcs.ts`, 04.3-05)다. 개발·테스트는 로컬 가짜 드라이버가 받아 실제 GCS를 부르지 않는다. 버킷 자체(생성·공개 접근 방지·소프트 삭제 끄기)와 배포자의 그 버킷 한정 `roles/storage.admin`은 소유자가 PR 머지 전에 돌리는 `scripts/bootstrap-gcp.sh`가 `gcloud storage` CLI로 만든다(04.3-05 — 최소 권한). `scripts/deploy.sh`의 `ensure_cert_bucket`은 버킷을 만들지 않는다 — 있는지 확인하고 같은 설정으로 맞추고(`buckets update`) 런타임 서비스 계정에 그 버킷의 `roles/storage.objectUser`만 건다(없으면 부트스트랩을 먼저 돌리라고 멈춘다). 앱 런타임은 버킷을 관리하지 않는다.

| capability | decision | reason |
|---|---|---|
| objects.insert (simple upload, `uploadType=media`) | INTEGRATE | |
| objects.get (`alt=media` 본문 읽기) | INTEGRATE | |
| objects.delete | INTEGRATE | |
| objects.insert (multipart upload) | OPT-OUT | not needed — 서명 PNG는 메타데이터 없이 본문만 올리므로 simple upload 하나로 충분하다 |
| objects.insert (resumable upload) | OPT-OUT | not needed — 서명 PNG는 수십 KB이고 서버 액션 본문 한도(256KB) 안이라 재개형 업로드가 필요 없다 |
| objects.get (메타데이터만, `alt=json`) | OPT-OUT | not needed — 객체 키와 존재 여부는 DB(`cert_submissions.signature_key`)가 정본이다 |
| objects.list | OPT-OUT | not needed — DB가 모르는 객체가 생기지 않게 막으므로 버킷을 훑지 않는다: 업로드 **전에** 의도 행(`cert_signature_uploads`, 규약 C3 · 04.3-02)을 커밋하고 제출 트랜잭션이 그 행을 지운다. 업로드 직후 프로세스 종료 · 보상 삭제 실패로 남은 객체는 24시간 넘은 의도 행의 키로 파기 Job이 `objects.delete`한다(04.3-12). 파기는 확인증의 `signature_key`와 의도 행의 키만 지운다 |
| objects.patch / objects.update | OPT-OUT | not needed — 서명 이미지는 고칠 수 없다(D-1106). 메타데이터를 바꿀 일이 없다 |
| objects.copy / objects.rewrite | OPT-OUT | not needed — 객체를 옮기거나 복제하지 않는다. 키 형식이 바뀌어도 새로 올린다 |
| objects.compose | OPT-OUT | not needed — 조각 업로드를 쓰지 않는다 |
| objects.watchAll / channels.stop | OPT-OUT | not needed — 객체 변경 알림을 받지 않는다 |
| objects.restore / objects.bulkRestore | OPT-OUT | explicitly out of scope — 파기한 서명은 되살리지 않는다. 버킷의 soft delete 보존을 0으로 둔다(04.3-05) |
| objects.move | OPT-OUT | not needed — 객체를 옮기지 않는다 |
| buckets.insert / buckets.delete / buckets.patch / buckets.update | OPT-OUT | not needed at runtime — 버킷은 `scripts/bootstrap-gcp.sh`(소유자, PR 머지 전)가 `gcloud storage buckets create`로 만들고(있으면 `update`로 맞춤), `scripts/deploy.sh` `ensure_cert_bucket`은 확인 · 같은 설정 맞춤(`buckets update`)만 한다 — 만들지 않는다(04.3-05). 런타임 서비스 계정에 버킷 관리 권한을 주지 않는다 |
| buckets.get / buckets.list | OPT-OUT | not needed — 앱은 환경 변수로 받은 버킷 이름 하나만 쓴다 |
| buckets.getIamPolicy / buckets.setIamPolicy / buckets.testIamPermissions | OPT-OUT | not needed at runtime — 배포자의 그 버킷 한정 `roles/storage.admin`은 `scripts/bootstrap-gcp.sh`(소유자, PR 머지 전)가, 런타임 서비스 계정의 그 버킷 `roles/storage.objectUser`는 `scripts/deploy.sh` `ensure_cert_bucket`이 `gcloud`로 건다(04.3-05). 앱 런타임은 IAM을 부르지 않는다 |
| buckets.lockRetentionPolicy | OPT-OUT | explicitly out of scope — 보존 잠금은 파기(CERT-02)와 정면으로 부딪힌다 |
| bucketAccessControls.* / defaultObjectAccessControls.* / objectAccessControls.* (ACL) | OPT-OUT | not needed — 균일한 버킷 수준 액세스(UBLA)를 켜서 ACL을 쓰지 않는다 |
| notifications.* (Pub/Sub 알림) | OPT-OUT | not needed — 업로드·삭제를 다른 시스템에 알리지 않는다 |
| hmacKeys.* | OPT-OUT | not needed — HMAC 키 인증을 쓰지 않는다(런타임 서비스 계정 ADC만) |
| projects.serviceAccount.get | OPT-OUT | not needed — CMEK·Pub/Sub 연동이 없어 GCS 서비스 에이전트 계정을 조회할 일이 없다 |
| managedFolders.* | OPT-OUT | not needed — 접두어(`signatures/{eventId}/`)만 쓰고 폴더 단위 IAM이 필요 없다 |
| anywhereCaches.* | OPT-OUT | not needed — 캐시가 필요한 읽기 규모가 아니다(경영관리 화면·인쇄물만 읽는다) |
| folders.* (계층 네임스페이스) | OPT-OUT | not needed — 계층 네임스페이스 버킷을 만들지 않는다 |
| operations.* (장기 실행 작업) | OPT-OUT | not needed — bulkRestore·폴더 이름 바꾸기 같은 장기 작업을 쓰지 않는다 |
| signed URL (V4 서명 URL 발급) | OPT-OUT | not needed — 서명 이미지는 권한 확인을 거친 서버 렌더가 data URL로 내려준다. 브라우저가 버킷에 직접 닿는 경로를 만들지 않는다(서명 URL은 Phase 6 증빙 업로드 몫) |

# API Coverage — Cloud Key Management Service API (v1)

이 페이즈가 KMS를 쓰는 이유는 하나다 — `APP_DATA_KEY_v*`(주민등록번호를 암호화하는 데이터 키)를 Secret Manager에 평문이 아니라 KMS로 감싼 형태로 두고, 앱이 뜰 때 한 번 풀어 메모리에만 둔다(봉투 암호화, ROADMAP 04.3 기준 4, 04.3-08). 호출은 기존 `google-auth-library`로 REST를 부르는 어댑터 하나(`lib/gcp/kms.ts`)다. 키링·키 생성과 KMS IAM 바인딩(런타임 decrypter · 배포자 키 단위 역할)은 소유자가 PR 머지 전에 `scripts/bootstrap-gcp.sh`로 하고, 감싸기(encrypt)와 키 존재 확인은 배포자가 `scripts/deploy.sh`(`_ensure_wrapped_data_key`의 `gcloud kms encrypt` · `ensure_kms_key`의 `kms keys describe` 확인만)로 한다(04.3-08 · E3-12 교차 B-3).

| capability | decision | reason |
|---|---|---|
| projects.locations.keyRings.cryptoKeys.decrypt | INTEGRATE | |
| projects.locations.keyRings.cryptoKeys.encrypt | OPT-OUT | not needed at runtime — 데이터 키 감싸기는 감싼 시크릿이 없을 때(첫 배포 · `--add-data-key-v2`) `scripts/deploy.sh` `_ensure_wrapped_data_key`가 `gcloud kms encrypt`로 한다(배포자의 키 단위 `cryptoKeyEncrypterDecrypter`). 런타임 서비스 계정에는 복호화 역할만 준다 |
| projects.locations.keyRings.create / cryptoKeys.create | OPT-OUT | not needed at runtime — `scripts/bootstrap-gcp.sh`(소유자, PR 머지 전)가 `gcloud kms keyrings create` / `keys create`로 만든다. `scripts/deploy.sh` `ensure_kms_key`는 `kms keys describe`로 있는지 확인만 하고, 없으면 부트스트랩을 먼저 돌리라고 멈춘다(E3-12 교차 B-3) |
| cryptoKeys.get / cryptoKeys.list / keyRings.get / keyRings.list | OPT-OUT | not needed — 키 이름은 환경 변수 `APP_DATA_KEY_KMS_KEY` 하나로 받는다 |
| cryptoKeys.patch / cryptoKeys.updatePrimaryVersion | OPT-OUT | not needed at runtime — KMS 키에 자동 회전 주기를 두지 않는다. 데이터 키 회전(`deploy.sh --add-data-key-v2`) 전에만 프로젝트 소유자가 손으로 새 주 버전을 만든다(`gcloud kms keys versions create … --key=app-data-key --primary` — 런북 §9 회전 (1)의 앞 단계, 04.3-08 `user_setup`). 배포자 자동화 · 런타임은 버전을 만들거나 주 버전을 바꾸지 않는다(/review 260925로 정정 — 04.3-08에 맞춤). 데이터 키 회전은 `pnpm db:rotate-key`가 맡는다 — 04.3-08이 KMS 감싼 키 경로와 `rrn_encrypted` · `token_encrypted` 대상을 더한다 |
| cryptoKeyVersions.* (create / destroy / restore / get / list / import) | OPT-OUT | not needed — 키 버전 수명 주기는 앱 밖의 운영 작업이다 |
| cryptoKeys.getIamPolicy / setIamPolicy / testIamPermissions | OPT-OUT | not needed at runtime — 런타임 `roles/cloudkms.cryptoKeyDecrypter`와 배포자 키 단위 역할 둘(`cryptoKeyEncrypterDecrypter` · `cloudkms.viewer`)은 `scripts/bootstrap-gcp.sh`(소유자, PR 머지 전)가 `gcloud kms keys add-iam-policy-binding`으로 건다. `scripts/deploy.sh`는 KMS IAM을 부르지 않는다(`kms keys get-iam-policy` 포함 — 교차 B4) |
| cryptoKeys.rawEncrypt / rawDecrypt | OPT-OUT | not needed — 대칭 `ENCRYPT_DECRYPT` 키의 표준 encrypt/decrypt만 쓴다 |
| cryptoKeyVersions.asymmetricSign / asymmetricDecrypt / getPublicKey / macSign / macVerify | OPT-OUT | not needed — 비대칭 서명·MAC 키를 쓰지 않는다 |
| importJobs.* | OPT-OUT | not needed — 외부 키를 가져오지 않는다(KMS가 만든 키를 쓴다) |
| ekmConnections.* / ekmConfig | OPT-OUT | explicitly out of scope — 외부 키 관리자를 쓰지 않는다 |
| keyHandles.* / autokeyConfig | OPT-OUT | not needed — Autokey를 쓰지 않는다(키 하나를 `scripts/bootstrap-gcp.sh`가 이름으로 만든다) |
| locations.generateRandomBytes | OPT-OUT | not needed — 난수는 Node `crypto.randomBytes`가 만든다 |
| locations.get / locations.list | OPT-OUT | not needed — 리전은 서울(`asia-northeast3`) 하나로 고정이다 |
