# RESTORE — 복원 리허설과 사고 복원 (OPS-03)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·번호·백업 id는
> 적지 않는다(D-03). 백업 설정·PITR 요약은 [`OPERATIONS.md`](OPERATIONS.md) §14.

명령은 셸에 `ENV=staging`(또는 `prod`) · `GCP_PROJECT_ID` · `GCP_REGION`을 넣고 쓴다.
원본 인스턴스는 `plant8-$ENV-db`, 서비스는 `plant8-$ENV`다.

## 1. 리허설 실행·결과 읽기

1. Actions → `restore-rehearsal.yml` → **main**에서 Run workflow. `env`는 기본 staging이다.
   production은 `confirm_production`에 `plant8-prod-db`를 그대로 적어야 돈다.
2. 도중에 다시 누르지 않는다 — 리허설은 한 번에 하나다(자기 동시성 그룹 `restore-rehearsal`).
3. 리허설과 배포는 서로 기다리지 않는다 — 배포는 리허설과 상관없이 돈다. 리허설 도중 배포가
   끼면 그 실행은 요약에 두 digest와 「배포가 겹쳐 실패로 남김 — 다시 돌리면 됩니다」가 찍히고
   실패로 끝난다(단계 검증, 정리·복원 실패가 먼저면 그 단계). 배포가 끝난 뒤 한 번 다시 돌린다.
4. 결과는 두 곳에서 본다.
   - 그 환경의 `/admin/system-status` 「복원 리허설」 행 — 그 환경 자기 DB에 남긴 기록만 보인다.
   - Actions 실행 요약 — 기록된 결과 · 단계 · 백업 id · 이미지 digest · 남은 임시 인스턴스.
5. 기록 전에 끝난 실패(인증 실패 · 상태 파일 없음 · 기록 실패)는 Actions에만 남는다 — 화면의
   이전 결과가 최신처럼 보이므로 Actions 실행 결과를 먼저 본다.
6. 요약의 「남은 임시 인스턴스 확인 불가」는 정리가 확인되지 않은 것이다 → 2절로 찾는다.
7. 요약의 「기록된 결과」는 화면 행과 같은 저장된 값이다. 「기록 뒤 확인: 배포가 겹쳐 실패로
   남김」이 따로 찍힌 실행은 화면이 성공이어도 한 번 다시 돌린다.

실패 단계는 정리 > 복원 > 검증 순으로 하나만 기록된다. 확인이 실패해도 임시 인스턴스는
지운다. 임시 인스턴스는 사설 IP만 쓰고 자동 백업을 끈 채 만들어진다.

## 2. 남은 임시 인스턴스 찾기·지우기

다음 리허설은 남은 임시 인스턴스가 있으면 시작하지 않는다(고아 점검). 사람이 지운다.

1. 찾기:
   ```bash
   gcloud sql instances list --filter="name~^plant8-$ENV-rehearsal-" --format='value(name)' --project=$GCP_PROJECT_ID
   ```
2. 이름마다 대조한다 — `plant8-$ENV-rehearsal-<숫자>-<숫자>` 모양이고 `plant8-$ENV-db`가
   **아니어야** 한다. 다르면 지우지 않고 멈춘다.
3. 끝나지 않은 작업이 빌 때까지 기다린다:
   ```bash
   gcloud sql operations list --instance=<이름> --filter="status!=DONE" --format='value(name)' --project=$GCP_PROJECT_ID
   gcloud sql operations wait <작업 id> --timeout=600 --project=$GCP_PROJECT_ID
   ```
4. 지운다: `gcloud sql instances delete <이름> --project=$GCP_PROJECT_ID`
5. 1의 목록을 다시 조회해 그 이름이 없는지 확인한다(목록 조회가 실패하면 「없음」이 아니다).

## 3. 실제 사고 때 복원 — 사람이 한다

세션(에이전트)은 하지 않는다. 공개 접근은 6의 확인이 통과할 때까지 닫혀 있다.

**1. 쓰기 중단**

- (a) 공개 접근 제거:
  ```bash
  gcloud run services remove-iam-policy-binding plant8-$ENV --region=$GCP_REGION \
    --member=allUsers --role=roles/run.invoker --project=$GCP_PROJECT_ID
  ```
- (b) 진행 중인 앱 요청 비우기 — 서비스 요청 제한 시간(기본 300초)만큼 기다린다:
  ```bash
  gcloud run services describe plant8-$ENV --region=$GCP_REGION --project=$GCP_PROJECT_ID \
    --format='value(spec.template.spec.timeoutSeconds)'
  gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="plant8-'$ENV'" AND httpRequest.status!=403' \
    --freshness=2m --limit=1 --project=$GCP_PROJECT_ID
  ```
  두 번째 명령이 빈 출력이어야 한다. 비지 않으면 더 기다린다.
- (c) 스케줄러 일시정지: `gcloud scheduler jobs list --location=$GCP_REGION --project=$GCP_PROJECT_ID`의 작업마다
  `gcloud scheduler jobs pause <작업> --location=$GCP_REGION --project=$GCP_PROJECT_ID`
- (d) 운영 워크플로(account · deploy · restore-rehearsal)를 돌리지 않는다.
- (e) 실행 중 Job이 끝나기를 기다린다 — `gcloud run jobs executions list --region=$GCP_REGION --project=$GCP_PROJECT_ID`에
  끝나지 않은 실행이 없어야 한다.

**2. 백업 선택** — 리허설과 같은 필터로 최신 성공 자동 백업(또는 사고 직전의 것)을 고른다:

```bash
gcloud sql backups list --instance=plant8-$ENV-db --filter="type=AUTOMATED AND status=SUCCESSFUL" \
  --sort-by=~startTime --limit=5 --project=$GCP_PROJECT_ID
```

**3. 복원 전 안전 백업** — PITR이 꺼져 있어, 4가 덮어쓸 지금 데이터는 이것 없이는 되돌릴 길이 없다:

```bash
gcloud sql backups create --instance=plant8-$ENV-db --description=pre-restore-<날짜> --project=$GCP_PROJECT_ID
gcloud sql backups list --instance=plant8-$ENV-db --filter="description=pre-restore-<날짜>" --project=$GCP_PROJECT_ID
```

두 번째 명령이 `SUCCESSFUL`이 될 때까지 기다리고 그 id를 적어 둔다. 실패하거나 끝나지 않으면
4로 가지 않는다. 엉뚱한 백업을 골랐으면 이 id를 4의 명령에 넣어 지금 상태로 되돌린다.

**4. 복원** — 현재 데이터를 덮어쓴다. 백업 시각 뒤 입력은 사라진다:

```bash
gcloud sql backups restore <2의 백업 id> --restore-instance=plant8-$ENV-db \
  --backup-instance=plant8-$ENV-db --project=$GCP_PROJECT_ID
```

**5. 스키마 맞추기(닫힌 채)** — 백업은 서빙 중인 이미지보다 오래된 스키마일 수 있다.

- 먼저 `plant8-$ENV-migrate`·`plant8-$ENV-seed` Job 이미지
  (`gcloud run jobs describe <Job> --region=$GCP_REGION --project=$GCP_PROJECT_ID --format='value(spec.template.spec.template.spec.containers[0].image)'`)가
  트래픽을 받는 리비전의 이미지와 같은지 본다. 다르면(롤백 뒤) `gcloud run jobs update <Job> --image=<서빙 리비전 이미지> --region=$GCP_REGION --project=$GCP_PROJECT_ID`으로 맞춘다.
- 그다음 `gcloud run jobs execute plant8-$ENV-migrate --region=$GCP_REGION --project=$GCP_PROJECT_ID --wait` →
  `gcloud run jobs execute plant8-$ENV-seed --region=$GCP_REGION --project=$GCP_PROJECT_ID --wait`.
- `deploy.yml`은 이 단계에 쓰지 않는다 — 서비스 배포 단계가 `--allow-unauthenticated`로 확인보다
  먼저 공개 접근을 연다(`deploy.sh` `main()`의 `deploy_service` → `smoke` 순서).

**6. 확인(닫힌 채, 인증된 요청)** — `roles/run.invoker`를 가진 운영자가 한다:

```bash
URL=$(gcloud run services describe plant8-$ENV --region=$GCP_REGION --project=$GCP_PROJECT_ID --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token)
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/api/health"      # "ok":true, sha = 서빙 SHA
read -rs PASSWORD   # 관리자 비밀번호 — 명령·기록에 남기지 않는다
printf '%s' "$PASSWORD" | jq -Rs '{email:"<관리자 이메일>",password:.}' | \
  curl -fsS -c cookies.txt -H "Authorization: Bearer $TOKEN" -H "Origin: $URL" \
  -H "Content-Type: application/json" -X POST "$URL/api/auth/sign-in/email" --data @-
curl -fsS -b cookies.txt -H "Authorization: Bearer $TOKEN" "$URL/admin/system-status" -o /dev/null -w '%{http_code}\n'
```

상태 화면이 200이고 「마지막 백업」이 보여야 한다. 최근 데이터 화면 몇 곳에서 백업 시각 직전
항목을 대조한다. 하나라도 어긋나면 열지 않고 원인을 찾는다. 끝나면 `cookies.txt`를 지운다.

**7. 다시 열기** — 6이 통과한 **뒤에만**:

```bash
gcloud run services add-iam-policy-binding plant8-$ENV --region=$GCP_REGION \
  --member=allUsers --role=roles/run.invoker --project=$GCP_PROJECT_ID
```

인증 없이 `curl -fsS "$URL/api/health"`가 `"ok":true`여야 한다.

**8. 재개** — 1(c)의 작업마다 `gcloud scheduler jobs resume <작업> --location=$GCP_REGION --project=$GCP_PROJECT_ID`.
사용자에게 공지한다: 백업 시각 이후 입력은 다시 넣어야 한다.

**9. 백업 설정 재확인** — 복원은 백업 설정을 기본값으로 되돌릴 수 있다:

```bash
gcloud sql instances describe plant8-$ENV-db --project=$GCP_PROJECT_ID --format='value(settings.backupConfiguration)'
gcloud sql instances patch plant8-$ENV-db --backup-start-time=18:00 --retained-backups-count=7 --project=$GCP_PROJECT_ID
```

두 번째는 첫 번째 결과가 `18:00` · 7개와 다를 때만 낸다.
