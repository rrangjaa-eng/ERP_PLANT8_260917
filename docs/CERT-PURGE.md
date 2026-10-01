# CERT-PURGE — 확인증 파기 런북 (CERT-02)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·번호는 적지 않는다(D-03).
> OPERATIONS.md가 줄 예산이 없어 이 절을 별도 문서로 둔다(사용자 결정 2026-10-01 채팅 — 파기 런북 별도 문서).

명령은 셸에 `ENV=staging`(또는 `prod`) · `GCP_PROJECT_ID` · `GCP_REGION`을 넣고 쓴다.
Job 이름은 `plant8-$ENV-purge-certs`다(`deploy.sh`가 만들기만 하고 실행하지 않는다).

## 1. 무엇을 지우고 무엇을 남기나

- 지우는 것: 확인증의 이름 · 주민등록번호(암호문 · 가린 값) · 연락처 · 주소 · 서명 이미지 · 속도 제한용 IP 가명.
- 남기는 것: 행 · 확인증 번호 · 행사 · 경품 · 수량 · 제출 시각 · 연결 칸(세무 기록). 행은 물리 삭제하지 않는다.
- 기한: (제출 KST 연도 + 1 + 보존 연수)년 3월 1일 00:00 KST. 보존 연수는 제출 때 저장된 값이라 설정을 바꿔도 이미 낸 확인증은 그대로다.
- 파기 대상 표시(가액 × 수량 ≤ 50,000)는 이 기한을 바꾸지 않는다.
- 파기 대상 경품의 주민등록번호는 제출 연도 다음 해 3월 1일 뒤 첫 적용 실행이 그 칸만 먼저 비운다(CS-2 a).
- 마감으로 닫힌 지 1일 넘은 행사의 IP 가명과 24시간 넘게 남은 업로드 의도(저장되지 않은 서명 객체)도 같은 실행이 정리한다.
- 기능 플래그와 무관하게 돈다 — 꺼 둬도 보존 기간이 지난 개인정보는 지워진다.

## 2. 실행 주기와 순서

**사람 월 1회 + 35일 감시 런북 유지, Scheduler 자동화는 Phase 7 이관**(Phase 4 D19-8과 같다 — 이 저장소에 파기용 스케줄러는 없다).
매월 첫 영업일과 3월 1일 뒤 첫 영업일에 실행한다.

1. 미리 보기(기본값 — 아무것도 바꾸지 않는다):
   `gcloud run jobs execute plant8-$ENV-purge-certs --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --wait`
2. Job 로그의 `purge_certs.done`에서 개수를 본다(`mode: dry-run`). 미리 보기의 숫자는 「지울 개수」다.
3. 적용: `gcloud run jobs execute plant8-$ENV-purge-certs --region="$GCP_REGION" --project="$GCP_PROJECT_ID" --args=--apply --wait`
4. 결과: 행동 로그 `확인증 파기`(비운 개수만)와 Job 로그 `purge_certs.done`(`submissions` · `filesDeleted` ·
   `filesPending` · `orphansDeleted` · `ipCleared` · `rrnCleared`).
5. `filesPending`이 0이 아니면 파일 삭제가 실패한 것이다 — 다음 실행이 다시 지운다(파기된 확인증의 서명과
   24시간 넘은 업로드 의도의 고아 서명 `orphansDeleted` 둘 다). 계속 쌓이면 §4를 본다.

## 3. 실행 누락 감시 (35일)

마지막 `purge_certs.done`(또는 `gcloud run jobs executions list --job plant8-$ENV-purge-certs --region="$GCP_REGION" --limit 1`의
마지막 실행)이 35일보다 오래됐으면 한 달 실행을 빠뜨린 것이다 — 곧바로 미리 보기부터 돌린다.
알림은 없다(자동 감시와 Cloud Scheduler 자동 실행은 Phase 7 이관). 마감으로 닫힌 행사의 IP 가명은 최대 약 35일 남는다.

## 4. 첫 적용 전 확인 — bootstrap-gcp.sh

이 Job을 처음 `--apply`로 돌리기 전에 소유자가 `scripts/bootstrap-gcp.sh`(04.3-05 절)를 그 환경에 돌렸는지 확인한다
(머지 전 PR 브랜치에서 한 번 — OPERATIONS §8). 런타임 서비스 계정의 서명 버킷 객체 삭제 권한이 여기서 생긴다 —
없으면 `filesPending`만 쌓인다. 기록이 없으면 다시 돌린다.

## 5. 경영관리 직원 권한

권한표에서 `확인증 제출 내용` 보기·쓰기와 정보 항목 둘(주민등록번호 전체 · 확인증 제출 정보)을 켠다(시드 계급이 아니다).

## 6. 백업과 복원

- **백업 보관 7일이 지나야 완전 파기** — 파기는 라이브 DB의 칸을 비운다. Cloud SQL 자동 백업(하루 한 번 · 7개 보관,
  `deploy.sh` `ensure_sql_instance`)에는 비운 개인정보가 남는다(주민등록번호 암호문의 데이터 키도 남아 풀린다).
  PITR은 꺼져 있다(OPERATIONS §14). 백업을 줄이거나 끄지 않는다 — 잔여 위험으로 받아들인다.
- **백업 복원 뒤에는 곧바로 `purge-certs --apply`를 한 번 돌린다** — 파기 전 시점으로 복원하면 파기된 행이 되살아나고
  서명 객체는 이미 없는데 `signature_key`만 채워져 있다. 적용 실행 한 번이 기한이 지난 행을 다시 비우고, 없는 객체는
  이미 지워진 것으로 친다. 복원 절차 자체는 [`RESTORE.md`](RESTORE.md).
