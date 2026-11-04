# CERT-PURGE — 확인증 파기 런북 (CERT-02)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·번호는 적지 않는다(D-03).
> OPERATIONS.md가 줄 예산이 없어 이 절을 별도 문서로 둔다(사용자 결정 2026-10-01 채팅 — 파기 런북 별도 문서).

명령은 셸에 `ENV=staging`(또는 `prod`) · `GCP_PROJECT_ID` · `GCP_REGION`을 넣고 쓴다.
Job은 둘이다 — 사람용 `plant8-$ENV-purge-certs`(인자 없이 실행하면 미리 보기 · `deploy.sh`가 만들기만 한다)와
Scheduler가 부르는 `plant8-$ENV-purge-certs-auto`(모드는 `infra/purge-certs-auto.mode`).

## 1. 무엇을 지우고 무엇을 남기나

- 지우는 것: 확인증의 이름 · 주민등록번호(암호문 · 가린 값) · 연락처 · 주소 · 서명 이미지 · 속도 제한용 IP 가명.
- 남기는 것: 행 · 확인증 번호 · 행사 · 경품 · 수량 · 제출 시각 · 연결 칸(세무 기록). 행은 물리 삭제하지 않는다.
- 기한: (제출 KST 연도 + 1 + 보존 연수)년 4월 1일 00:00 KST(12월 결산 법인세 신고기한 다음 날). 보존 연수는 제출 때 저장된 값이라 설정을 바꿔도 이미 낸 확인증은 그대로다.
- 파기 대상 표시(가액 × 수량 ≤ 50,000)는 이 기한을 바꾸지 않는다.
- 파기 대상 경품의 주민등록번호는 제출 연도 다음 해 4월 1일 뒤 첫 적용 실행이 그 칸만 먼저 비운다(CS-2 a).
- 마감으로 닫힌 지 1일 넘은 행사의 IP 가명과 24시간 넘게 남은 업로드 의도(저장되지 않은 서명 객체)도 같은 실행이 정리한다.
- 기능 플래그와 무관하게 돈다 — 꺼 둬도 보존 기간이 지난 개인정보는 지워진다.

## 2. 실행 주기와 순서

**Scheduler 월 1회(매월 1일 03:00 KST) 자동 + 처음은 dry-run.** 배포가 Cloud Scheduler 잡 `plant8-$ENV-purge-certs-monthly`를 만들고,
그 잡이 전용 계정(`plant8-$ENV-purge-sched` · 키 없음 · 자동 Job 하나에만 `run.invoker`)으로 자동 Job을 실행한다.
모드가 `dry-run`인 동안은 아무것도 지우지 않고 개수만 남긴다.
**모드를 `apply`로 바꾸기 전까지는 사람이 월 1회 수동 `--apply` 실행(아래 3)을 계속 한다** — 보존 한도(약 35일)가 지켜져야 한다. 전환 뒤 수동 실행은 예외(백업 복원 뒤 · §6)나 즉시 확인이 필요할 때만 쓴다.
모드 파일은 스테이징 · 프로덕션에 똑같이 적용된다. 프로덕션은 승격된 커밋의 모드를 다음 승격 때 받는다(배포는 `--sha` 커밋의 파일을 읽는다).

1. 미리 보기(기본값 — 아무것도 바꾸지 않는다):
   `gcloud run jobs execute plant8-$ENV-purge-certs --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --wait`
2. Job 로그의 `purge_certs.done`에서 개수를 본다(`mode: dry-run`). 미리 보기의 숫자는 「지울 개수」다.
3. 적용: `gcloud run jobs execute plant8-$ENV-purge-certs --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --args=--apply --wait`
4. 결과: 행동 로그 `확인증 파기`(비운 개수만)와 Job 로그 `purge_certs.done`(`submissions` · `filesDeleted` ·
   `filesPending` · `orphansDeleted` · `ipCleared` · `rrnCleared`).
5. `filesPending`이 0이 아니면 파일 삭제가 실패한 것이다 — 다음 실행이 다시 지운다(파기된 확인증의 서명과
   24시간 넘은 업로드 의도의 고아 서명 `orphansDeleted` 둘 다). 계속 쌓이면 §4를 본다.

### 자동 실행 적용 전환

1. 자동 dry-run 1~2회의 Job 로그 `purge_certs.done`(`mode: dry-run`) 개수를 사용자에게 보고한다.
2. 사용자가 적용을 정하면 `infra/purge-certs-auto.mode`를 `apply`로 바꾸는 PR을 사용자가 머지한다(`infra/`는 위험 경로 · 알 수 없는 값이면 배포가 멈춘다).
3. 머지 배포가 스모크 통과 뒤 자동 Job 정의에 `--apply`를 넣는다(전환 전까지 사람의 월 1회 수동 `--apply`는 그대로 한다). 되돌리려면 `dry-run`으로 되돌리는 PR을 머지한다 — 배포가 빈 인자를 명시해 옛 `--apply`를 지운다.

### 첫 설정 · 건너뜀 복구

- 새 환경은 머지 전에 소유자가 bootstrap-gcp.sh를 한 번 돌린다(purge-sched 계정이 생긴다). purge-sched 코드가 있는 체크아웃 — 머지 전이면 이 PR 브랜치 — 에서 실행한다.
- 배포 로그에 `purge-sched SA 없음` 경고가 났으면 Scheduler 단계만 건너뛴 것이다 — bootstrap 뒤 재배포(또는 다음 main 푸시)해야 Scheduler가 생긴다. bootstrap 직후에는 IAM 전파로 몇 분 기다린 뒤 재배포한다.
- 확인(읽기 전용, 소유자 로컬 셸): `INPUT_CHECK=purge-scheduler PROJECT="$GCP_PROJECT_ID" REGION="$GCP_REGION" bash scripts/verify-gcp.sh`
  — 잡 `ENABLED` · 실행 기록 · 자동 Job 실행 목록. 처음엔 `gcloud scheduler jobs run plant8-$ENV-purge-certs-monthly --location="$GCP_REGION" --project="$GCP_PROJECT_ID"`로 한 번 돌려 본다.

## 3. 실행 누락 감시 (35일)

dry-run인 동안의 감시는 사람의 수동 `--apply` 실행 기록이다. `apply` 전환 뒤에는 자동 Job의 마지막 실행이 `SUCCEEDED`이고
그 Job 로그의 `purge_certs.done`이 `mode: apply`인지 본다 — Scheduler 성공은 실행이 시작됐다는 뜻일 뿐이다(`jobs:run`은 작업 ID만 돌려준다).
`verify-gcp.sh`의 `purge-scheduler` 검사(위, 실행 완료 · 실패 열 포함) 또는 `gcloud run jobs executions list --job plant8-$ENV-purge-certs-auto --region="$GCP_REGION" --limit 1`로 본다.
마지막 성공 실행이 35일보다 오래됐으면 한 달을 빠뜨린 것이다 — 곧바로 §2 미리 보기부터 돌린다.
알림은 없다. 마감으로 닫힌 행사의 IP 가명은 최대 약 35일 남는다.

## 4. 첫 적용 전 확인 — bootstrap-gcp.sh

이 Job을 처음 `--apply`로 돌리기 전에 소유자가 `scripts/bootstrap-gcp.sh`(04.3-05 절)를 그 환경에 돌렸는지 확인한다
(머지 전 PR 브랜치에서 한 번 — OPERATIONS §8). 런타임 서비스 계정의 서명 버킷 객체 삭제 권한이 여기서 생긴다 —
없으면 `filesPending`만 쌓인다. 기록이 없으면 다시 돌린다.

## 5. 경영관리 직원 권한 — 운영 시작 때 켠다

새 DB는 정보 항목 `cert_prize.value`(확인증 경품 가액) · `cert_submission.value`(확인증 제출 내용) · `cert.rrn_unmasked`
(주민등록번호 전체 보기)가 모든 계급에 꺼져 있다(사용자 결정 E3-13) — 켜기 전에는 아무도 QR 생성 · 경품 편집 · I4를 못 하고
「QR 생성 신청」 알림도 받는 사람이 없다. 운영 시작 때 관리자가 경영관리 직원 계급(시드 계급이 아니다 · 대표 계급은 켜도 막힌다)에
권한표 `certs.events`(확인증 행사) 보기 · `certs.qr`(QR 생성 · 경품 목록) 쓰기 · `certs.submissions`(확인증 제출 내용)
보기 · 쓰기를, 정보 노출표에서 위 세 항목을 켠다.

## 6. 백업과 복원

- **백업 보관 7일이 지나야 완전 파기** — 파기는 라이브 DB의 칸을 비운다. Cloud SQL 자동 백업(하루 한 번 · 7개 보관,
  `deploy.sh` `ensure_sql_instance`)에는 비운 개인정보가 남는다(주민등록번호 암호문의 데이터 키도 남아 풀린다).
  PITR은 꺼져 있다(OPERATIONS §14). 백업을 줄이거나 끄지 않는다 — 잔여 위험으로 받아들인다.
- **백업 복원 뒤에는 곧바로 `purge-certs --apply`를 한 번 돌린다** — 파기 전 시점으로 복원하면 파기된 행이 되살아나고
  서명 객체는 이미 없는데 `signature_key`만 채워져 있다. 적용 실행 한 번이 기한이 지난 행을 다시 비우고, 없는 객체는
  이미 지워진 것으로 친다. 복원 절차 자체는 [`RESTORE.md`](RESTORE.md).

## 7. 접속기록 월 1회 점검 (안전성 확보조치 기준 제8조②)

사용자 결정 2026-10-01(PR #88 5936195107) — 코드 변경 없이 사람이 행동 로그 화면에서 점검한다.

- 누가: 개인정보 보호책임자(또는 그가 지정한 사람). 행동 로그 메뉴 보기 권한이 있어야 한다.
- 언제: 매달 첫 영업일(§2 파기 실행과 같은 날). 첫 기한은 2026-10-30이다.
- 어디서: `/admin/action-log` — 기간을 지난달 1일~말일로 두고 종류 칸에서 `확인증 조회`(`cert_view`) ·
  `마스킹 해제`(`mask_reveal`) · `확인증 정정`(`cert_correct`)을 차례로 거른다.
- 무엇을 보나: 업무 시간 밖(밤 · 휴일)의 조회 · 한 사람이 평소보다 많이 본 날 · 업무상 이유가 없는 사람의 조회 ·
  인쇄로 연 조회(상세에 `via: "print"`) · 같은 확인증을 여러 사람이 본 경우. 상세의 IP가 사내 · 클라우드 밖이면 따로 본다.
- 이상이 있으면: 그 사람과 업무 이유를 확인하고, 이유가 없으면 권한표에서 그 계급의 `확인증 제출 내용` 권한을 끈 뒤
  개인정보 보호책임자가 처리를 정한다.
- 점검 기록: 거른 결과를 「Excel 내보내기」로 받아 회사 보관함에 둔다(내보내기 자체가 끌 수 없는 `Excel 내보내기`
  행으로 남는다). 파일 이름 앞에 점검일을 붙이고 끝 줄에 `YYYY-MM-DD 점검 · 점검자 · 종류별 건수 · 이상 없음/조치` 한 줄을 적는다.
- 세 종류는 행동 로그 「정리」로 정리할 수 없다(사용자 결정 5936870579) — 정리 표시가 점검 대상을 가리지 않는다.
