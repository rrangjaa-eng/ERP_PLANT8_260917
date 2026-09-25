# 2차 수정 A (01·02·13) — 한도로 멈춘 자리 (2026-09-24 23:0x KST)

## 끝남
- codex A5: RESEARCH.md:59 번호 예약 문장 → 예약 없음 규칙
- codex A4: 01:184, 01:189 택배 부제 --fs-md, 번호 없는 대체 문장 없음
- 누적 잠금: 01 ①-b 규칙·#locked-hard 장면(8장면)·검사 줄, 01 ⑫ RowSheet 3차 = 「잠금 풀기」 확인 시트
- 누적 잠금 스키마: 02:268 cumulative_failed_attempts int not null default 0, hard_locked_at timestamp null (설정 키 없음, version 안 올림)
- checker-B W1: 02 verify_idem_key_hash 삭제, verify_idem_outcome 맵 모양 고정 (VerifyIdemEntry / VerifyIdemOutcomeMap)
- checker-B B1: 02:305, 02:461 서명 PNG 상한 184,320 (06의 SIGNATURE_MAX_PNG_BYTES)

## 안 함 (재개 때 할 일)
- codex A1: handle-server-error.test.ts:79-88 `toContain("Failed query")` 케이스를 새 계약으로 바꾸기(RED 먼저), 02:400 「기존 케이스는 그대로」 지우기
- codex A2: playwright cert-setup dependencies ["desktop","mobile-375"], certs → cert-setup. admin-nav.spec.ts:112-124는 09의 withCertMenusGated 뒤라 그대로 둬도 됨. 빠른 로컬: --no-deps --workers=1 --project=cert-setup --project=certs
- codex A3: 02:253/:76/T-04.3-16(:462) Vitest 직접 액션 호출 → domain 함수 통합 테스트(플래그 끔 → notFound, DB 무변화) + E2E Next-Action 재전송
- checker-A W1: 02 Task 1을 기반 태스크(스키마·마이그레이션·C1·C2·C4·journal 테스트) + 트레이서로 나눠 3태스크 (옮길 문단은 scratchpad blocks.json에 뽑아 둠 — 컨테이너가 바뀌면 다시 뽑는다)
- checker-A I3: 02:264 명령 수 문구
- checker-A I2: 13:135 backstop을 grep으로 모으기
- UI-SPEC :14(①-b)와 :785(개정 절 1항)에 「누적 틀림 한도 설정 · 기본 20」 흔적 → 고정 20으로 맞추기

# 2차 수정 B (03~06)
- 끝남: 03 전부 (누적 잠금 판정 VERIFY_HARD_LOCK_THRESHOLD=20·hardLocked, 공격 테스트, E3 알림 묶음, T-04.3-03 갱신·결정 대기 삭제, T-04.3-110 괴롭힘 위험 accept, 복호화 실패 재전송 → expiredProof, ok 재전송 전 submitted_at 확인, isDefiniteResult 8종, Task 2 테스트 먼저, 02 맵 모양 사용)
- 안 함: 04 (PM 권한을 테스트 안에서 upsertPermission, ⑤(f) 경로 하나, Task 2 테스트 먼저, Task 1 둘로 나누기) · 05 (배포자 storage 권한 bootstrap-gcp.sh + user_setup + 배포 테스트 [Codex BLOCKER], fakebin/gcloud storage buckets 분기) · 06 (DbOrTx delete, 잉크 측정 한 가지로, E5 kind 이름 saved 등 · 06 isDefiniteResult에 hardLocked·expiredProof 유지)
- 참고: 02는 hard_locked_at을 timestamp null(저장소 관례)로 적었다 — 03의 timestamptz 표기와 맞출 것

# 2차 수정 C1 (07·11)
- 끝남: 07 전부 (C3 project(), C4 can(), C5 mask_reveal tx 기록 · appendCertActionLogTx가 always-on 핵심 종류 모두 받음, I2 게이트 먼저, 19파일 수용 줄) · 11 C3 project()
- 반쯤: 11 I2 (Task 2 ① 순서 바꾸기, 수용 검사, T-04.3-53, Task 3 로그아웃 404) · 11 C8 (RED 단위 테스트 test/unit/print-cert-error.test.ts, error.tsx 만드는 단계, verify·수용 줄) — frontmatter에는 이미 파일이 있음
- 안 함: 11 T-04.3-123, verification·success_criteria 줄

# 2차 수정 C2 (08·09·10·12)
- 끝남: 10 Task 1 (unlockWinner {rowId, lockStamp}, 같은 표시일 때만 네 칸 지움, version 안 바꿈, cert_unlock 같은 tx 기록, 재전송은 기존 로그로 판별), closeEvent status_change 같은 tx(C6), verify_idem_key_hash 제거, 21파일 수용 줄
- 반쯤: 10 Task 2 UI(확인 dialog 공유, 잠김/잠금 풀기 필요, 행 행동, 문구, 포커스·RowSheet), Task 3 E2E(결과 불명 재전송, 게이트 끔 직접 POST, 폰 시트), 위협 모델 125~129, artifacts·verification·success_criteria
- 안 함: 12 (파기 때 verify_idem_outcome·verify_proof_hash·verified_until·cumulative_failed_attempts·hard_locked_at 지우기 + 테스트) · 08 (C1 v2 감싼 키를 서비스에 먼저, C7 Task 2 테스트 먼저, W2 openssl 대신 원래 키 SHA-256, W1 줄) · 09 (C7 Task 2 테스트 먼저, A2 PM 시드와 admin-nav)
- **파동 충돌:** 10과 12가 둘 다 wave 5에서 domain/action-log/record.ts 수정 → 12를 wave 6(depends_on 10), 13을 wave 7로 옮기거나 cert_unlock 추가를 한 플랜으로 모은다

# 화면 설계
- 39508ba에서 2차 손질. Codex 6차(바뀐 곳만) 결과는 round3/codex-ui-r6.md (있으면)
- 남은 흔적: :14(①-b), :570, :612, :785에 「누적 틀림 한도 설정 · 기본 20」/「먼저 닿는 쪽」 → 고정 20·짧은 잠김까지만으로 맞추기. :195·:612 1행 disabledReason 표기 → :376처럼 세 줄 모두 알림 묶음

# 재개 순서
1. 위 남은 항목을 계획자 넷(A·B·C1·C2)에게 다시 나눠 마무리 (각자 바로 쓰기)
2. 화면 설계 남은 흔적 손질 → Codex 바뀐 곳 확인
3. 3회차 재검사: 체커 + Codex 동시, 지난 지적 해결 + 바뀐 곳만 (근거 없는 지적은 참고로)
4. 최종본 전체 Codex → /plan-eng-review (Codex 포함) → 커밋·푸시 → 인계 (D-01)

# Codex 6차 화면 검토 (바뀐 곳만, codex-ui-r6.md): 큰 지적 2, 작은 지적 2 — 재개 때 화면 설계 손질에 함께 넣기
1. 과거 해제의 재전송 성공이 현재 잠김을 화면에서 지운다 (재전송 성공 응답에 현재 행 상태를 싣기)
2. I3 행동 셀 Tab 규칙이 기존 편집 표의 단일 탭 정지 계약과 어긋남
3. (작은) 「항상 짧은 잠김 경계」 설명 vs 5·3분이 설정값인 점
4. (작은) 알림 묶음 방식이 Button 개발 경고 조건(disabledReason 없는 비활성)과 충돌
