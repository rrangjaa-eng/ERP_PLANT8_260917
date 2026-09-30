# Phase 04.3 엔지니어링 리뷰 (plan-eng-review) — 새 흐름 개정 플랜 — 2026-09-30

- 대상: `.planning/phases/04.3-qr-certificate-intake/` 개정 플랜 **04.3-10 · 12 · 13 · 14 · 15 · 16 · 17**(아직 실행 전) · `04.3-CONTEXT.md` 「결정 변경」 · `04.3-UI-SPEC.md` 「개정 (2026-09-30 새 흐름)」 · `04.3-VALIDATION.md` · 01~04 · 06 · 07 · 09 · 11의 「대체 예고」
- 근거 결정: PR #88 5909578685(새 흐름 — 명단 폐지 · 공유 링크 직접 제출 · 행사 뒤 대조) · 5905714131(가액 비노출) · 5909515432 · 5912026481
- 브랜치 `claude/trusting-brahmagupta-k08auz` · 검토 기준 `af0d8e74`(이후 `c727dad8`는 게이트 로그 한 줄뿐 — 플랜 변화 없음) · PR #88
- 검토자 구성: A = 범위 · 아키텍처 · 성능 · B = 코드 품질 · 테스트 · Outside Voice(OV) = Opus 독립 검토(주 검토 결과를 보지 않음). **Codex는 CLAUDE.md §2·§4·§8이 금지하므로 Opus가 교차 검토를 대신한다.** 세 검토자는 읽기 전용이었다.
- 판정 · 통합: 오케스트레이터(Opus). 심각도가 판정에 걸린 주장은 플랜 본문 · 코드로 다시 확인했다(T-1 · OV3 · OV4 · A1 · OV5 · OV11).
- **반영한 사용자 결정: PR #88 댓글 5915996637(2026-10-01 「[지시]」)** — 요청 5914677049 · 5915778398의 모든 항목을 추천안 (a)로 정했다: U3 U4 U5 · G0 G3 G4 G5 G8 G9 G10 · N1–N13 · N14 a(웨이브 6 전 새 흐름 위협으로 설계 `/cso`) · N15 a(마감 = max(당첨일 00:00 KST, QR 생성 시각) + 설정 시간) · N16 a(행 삭제, DECISIONS에 보관함 예외로 기록). B1–B4는 그대로. 04.3-13 `risk: [migration]` 확정. 이 결정을 다시 올리기만 한 지적은 「사용자 결정 (a)로 닫힘 — 5915996637」으로 처리하고, (a) 설명에 없던 **새 사실**만 사용자 결정 요청으로 남겼다.
- 결정 방식: 사용자 부재 — 기술 수정은 추천안을 자동 채택(Decision ledger `approved-auto`), 제품 결정 6건은 PR #88에 「[사용자 결정 요청]」으로 올린다.

## 요약

| 검토자 | P1 | P2 | P3 | 합계 |
|---|---|---|---|---|
| A (범위 · 아키텍처 · 성능) | 0 | 5 | 9 | 14 |
| B (코드 품질 · 테스트) | 1 | 12 | 12 | 25 |
| Outside (OV) | 4 | 6 | 2 | 12 |
| 원 합계 | 5 | 23 | 23 | 51 |
| 병합 · 판정 후 | **3** | **18** | **19** | **40** (+ 채택 안 함 1) |

- 병합(11건 감소): A1 = C-1 = T-9 · A2 = C-4 = OV7 · A3 = OV8 · F1 = T-6 · S1 = T-8 · C-3 = T-5 · T-3 = T-18 · F2 = OV6 · A7 = T-11. 분리 1건: OV5 → E8(제품) + E40(설정 힌트). 채택 안 함 1건: OV11.
- 등급 조정: OV2 P1 → **P2**(대조 화면에서 같은 이름 두 줄이 보이고 「택배 발송은 대조 뒤」 운영 한 줄로 손실을 막을 수 있음) · OV3 P1 → **P2**(원래 걱정이던 N13이 (a)로 닫혀, 남은 위험은 이번 리뷰의 스키마 영향 질문뿐) · F1 P3 → **P2**(T-6과 병합, 사라지는 회귀 보호) · OV6 TECH → **설계 `/cso` 입력**(N14 a가 웨이브 6 전 `/cso`를 정했다).
- 분류: TECH 33(자동 반영 32 · 설계 `/cso`로 넘김 1) · 사용자 결정 (a)로 닫힘 1(E23) · **PRODUCT 6(E1 · E5 · E6 · E7 · E8 · E9)**.
- P1 3건: **E1**(가짜 제출을 지울 길이 없음 — PRODUCT) · **E2**(PR 브랜치 스테이징 스모크가 스테이징 마이그레이션 원장을 망가뜨림) · **E3**(04.3-15 Task 1 verify가 구조상 통과 불가).
- critical gap(테스트도 처리도 없이 조용히 실패) 3건: E1(가짜 제출의 제3자 주민번호가 약 6년 보관) · E5(5만원 이하 경품 여러 개 → 과세 대상인데 확인증 없음) · E22(신청 알림 받을 사람 0명 → 요청이 조용히 멈춤).
- 뼈대 평가(A · OV 일치): 경품 쓰기 · QR 생성 · 닫기 · 취소 · 제출이 모두 행사 행 `FOR UPDATE` 하나로 직렬화되고(잠금 순서 행사 → 경품/제출로 일관, 교착 없음), 상태는 칸에서 파생되며 CHECK 둘이 조합을 막는다. 멱등 키 셋(`create_request_id` · `qr_request_id` · `(event_id, idempotency_key_hash)`), 가액 누수는 정적 경계 · 통합 스윕 · E2E(양성 · 차등) 세 겹이다. 빈틈은 뼈대가 아니라 가장자리(권한 조합 · 행 삭제 갈래 · 테스트 순서 · 운영 절차)에 있다.

판정: **계획 수정 반영 뒤 실행.** 순서(사용자 지시): Task 0 결정 확정 → plan-checker → 설계 `/cso`(새 흐름 위협) → 웨이브 6. 웨이브 6(12 · 15)은 E1 · E5 · E6 · E7의 답(스키마 영향)을 받은 뒤 시작한다.

## Step 0 — Scope Challenge

- 최소 집합(5909578685): 신청 → 알림 → 경품 목록(경품별 가액) → QR 생성 · 경품 고르기 제출과 5만원 이하 제외 · 파기 대상 표시 · 링크 닫기 → 대조. 계획은 여기에 공용 부품 셋(SidePanel · ConfirmDialog 실패 줄 · Table 행동 셀 + RowSheet action)과 신청 취소(N4) · I4 수량 정정(N3) · 같은 연락처 표시(N6)를 더한다 — 모두 사용자가 (a)로 정했다(5915996637).
- 복잡도(A): 새 파일 약 34 · 지우는 파일 약 19 · 새 domain 함수 8 · 새 공용 부품 1 · 공용 부품 확장 2. 제일 큰 단위는 04.3-15 Task 1(약 75파일). `cert_winners`를 지우면 빌드가 한꺼번에 깨지므로 「빌드가 서는 최소 단위」 논리는 맞다 — 스키마 + 재생성 커밋(③ 끝)을 먼저 따로 두는 현재 순서를 지킨다. 단, 그 태스크의 verify가 통과할 수 없는 모양이다(E3).
- 되풀이 결함 유형(A, `git log`): 마이그레이션 번호 충돌(0017→0018→0019→0021) · 권한 게이트와 경합(`7c718925`). E11(권한 조합) · E13(행 삭제 경합)이 같은 계열이다.
- TODOS.md 교차: 막는 항목 없음. 알림 이메일은 Workspace SMTP에 기댄다(SMTP 없으면 `markPendingEmailSkipped`가 `skipped_no_smtp`, 알림함은 그대로).

**E20 [P2] (9/10) TECH (A S1 · B T-8) `04.3-VALIDATION.md:55-58,67,90,98,37` — 검증 지도가 옛 명단 흐름 그대로다**
- 인용: `:55 CERT-01 | 수령자 QR 진입 → 이름 선택 → 뒤 4자리 확인 → …` · `:56 verify-last4.test.ts` · `:67 제출하지 않은 명단 파기` · `:98 비활동 세션 만료 120분` · `:37 After every plan wave: Run pnpm test`. 04.3-15:330이 `verify-last4` · `cert-verify` · `mobile-cert-verify`를 지우는데 어느 새 플랜도 VALIDATION을 고치지 않는다(13은 Manual 표만 대조, RB-6 동기화도 깨짐).
- 결과: `/gsd-verify-work` · `/gsd-validate-phase`가 지워진 파일을 돌리거나 새 요구(경품 목록 · 가액 비노출 · 신청 → 생성 · 대조 · 속도 제한)를 매핑하지 못한다.
- 처분: 계획 게이트 뒤 `/gsd-validate-phase 04.3`(또는 plan-phase 수정 모드)로 다시 만든다(`.planning/` 수동 편집 금지). 입력 = 이 리뷰의 「Step 3」 커버리지 도표 + B의 Test Plan. Manual 표는 04.3-13 human-check 다섯을 정본으로. `:37`은 CLAUDE.md §5(전체 E2E는 CI 한 번)로. 옛 줄은 「대체됨(5909578685)」.

**E25 [P3] (9/10) TECH (A S2) `04.3-02:189` · `04.3-03:123,126` · `04.3-04:144,145` — 「대체 예고」의 태스크 · 플랜 참조가 틀렸다.** `verify-lock.ts` 이동은 15 Task 1 ④, 명단 파일 삭제 · regression-1 재작성은 Task 1 ⑧, I2 · I3 · `createEvent` 삭제는 Task 1 ⑦, 속도 제한 서버는 15(16은 화면만). 「Task 3」 → 「Task 1 ④/⑦/⑧」, regression-1 · 속도 제한 주인 → 04.3-15.

**E26 [P3] (8/10) TECH (A S3) `04.3-15:319` ↔ `04.3-16:141` — `throttled`가 확정 판정인지 두 플랜이 반대다.** 15는 `isDefiniteResult`에 넣고 16은 「결과 불명과 같은 처리 — 키를 끝내지 않는다」. 서버 저장 결과는 같지만 웨이브 7이 되돌리는 헛수고 + `flow-rules.test.ts`가 반대 단언을 굳힌다. 15 ⑥ 목록에서 빼고 「결과 불명 쪽 — 16이 문장을 붙인다」.

## Step 1 — Architecture

```
 기획본부(certs.events 쓰기)                     경영관리(certs.qr 쓰기 + certs.events 보기 — E11)
 I′2 옆 패널 「QR 생성 신청」                        알림함(04.2) ◀─ notification_log(pending → 다음 영업일 tick 메일)
   │ requestQr(name, wonOn, requestId)               │
   ▼ tx{ insertEvent(token NULL, 문의 전화 사본)       ▼
        + insertEventNotifications(cert_qr_request)   I′3 경품 편집 표(cert_prizes: name · unit_value_krw · delivery · version)
   ▼                                                 │ savePrizes / generateQr(requestId)
 cert_events [신청됨: token_hash NULL]                ▼ tx{ lockEventRow FOR UPDATE ──┐ (null이면? — E13)
   │ cancelRequest: 경품 0 · token NULL → 행 삭제(N16 a)   applyPrizeChanges(version)          │ 같은 잠금
   │                                                  token · 마감 = max(당첨일 00:00, now) + h(N15 a)
   ▼                                                  + cert_qr_created 알림 }                    │
 cert_events [접수 중] ── QR(/c/{token}, 생성 즉시 열림 — E8) ──▶ 수령자 폰                    │
                     loadIntake: certPrizeListed(v×1 > 50,000) → {id,name,delivery}(E5)       │
                     submitCertificate: (b)재생 → (c)닫힘 → (d)prizeGone → (e)termsChanged      │
                       → (f)throttled(IP 15분 30 — E10) → (g)칸 → (h)서명 업로드                 │
                       → (i) tx{ lockEventRow ─────────────────────────────────────────────────┘
                              재확인 · 문서 번호 · insert(prize_id, quantity 1, submit_ip_hash(E21)) }
   ▼ 행사 뒤
 I′3 제출 섹션(경품별 · 가린 연락처 · 같은 연락처 N건 · 파기 대상 = 계산) — 가짜 판정 뒤 동작 없음(E1)
 closeEvent → cert_events [닫힘] ── 다시 열 수 없음(E9) ──▶ purge-certs Job(04.3-12): 보존 기한만 봄
```

**E11 [P2] (8/10) TECH (A A1 · B C-1 · B T-9) `04.3-10:244,246` · `domain/certs/events.ts:300-305` — 알림을 받는 사람(`certs.qr` 쓰기)과 화면을 여는 사람(`certs.events` 보기 필수)이 다르다**
- 인용(코드, 확인함): `if (!(await defaultCan(viewer, CERT_EVENTS_MENU, "view"))) return null;` 뒤에야 `certs.submissions` 보기 → 전부. 10:246 「범위 전부 = `certs.submissions` 보기 또는 `certs.qr` 쓰기」, 13:224 PR 체크리스트는 경영관리 계급에 `certs.qr`만 켜라고 한다. 관리 메뉴 항목도 `certs.events` 키 하나(`ui/shell/role-menu.ts:124`).
- 결과: 운영자가 `certs.qr` 쓰기만 켜면 알림은 오고 목록 · 상세 · `generateQr`는 404. 모든 경영관리 E2E가 모든 메뉴를 가진 시스템 관리자(박서연)로 돌아 테스트에 드러나지 않는다.
- 처분(자동 — A 추천 ①): 받는 사람 = `certs.qr` 쓰기 **그리고** `certs.events` 보기. `scopeOf`에 「`certs.qr` 쓰기면 전부」 분기를 `certs.events` 보기 게이트 **다음** 줄에. 게이트 의미를 넓히는 B의 안(「보기 또는 `certs.qr`」 + 메뉴 두 키)은 채택하지 않는다. 통합: 「`certs.qr`만 · `certs.events` 보기 없음 → 알림 0 · 화면 404」 · 「비시스템관리자 경영관리 고정물(`certs.events` 보기 + `certs.qr` 쓰기 + `cert_event.value`) → 목록 · 상세 · `generateQr` ok」 · 「PM → 가액 키 없음」. E2E: `createFixtureUser`로 그 계정을 만들어 10 Task 1 tracer의 경영관리 절반을 돈다. 13 PR 체크리스트에 경영관리 계급 네 키(`certs.events` 보기 · `certs.qr` 쓰기 · `certs.submissions` 보기 · 정보 항목 `cert_submission.value`/`cert.rrn_unmasked`) 한 줄.

**E12 [P2] (6/10) TECH (A A4 + B 부록 A-2) `04.3-10:250` · `domain/permissions/info-items.ts:68` · `test/integration/leak-scan.test.ts:128-131` — 가액 노출을 정보 항목이 아니라 domain 안 `if (certs.qr 쓰기)` 한 줄로 거른다**
- `cert_event.value`는 기획 PM 기본값 참이라 등록부 기준으로 가액 필드가 「PM에게 보여도 되는 값」이 된다. DTO를 다른 액션 · 내보내기로 재사용하면 스캔이 막지 못한다. 돈 노출 선례는 정보 항목(`reserve.amount` staffDefault false). 반대로 `certs.qr` 쓰기이지만 `cert_event.value`가 꺼진 계급은 화면에 편집 표가 없는데 서버는 `generateQr`를 허용한다(B A-2).
- 처분(자동): 10이 이미 고치는 `info-items.ts`(위험 경로 PR)에 `cert_prize.value`(staffDefault false, 시스템 관리자 시드는 `cert_submission.value`와 같은 insert-if-absent). `unitValueKrw` · `quantityCounts` · `purgeTarget`를 이 항목에 등록. `certs.qr` 쓰기는 편집 · 생성 게이트로만. 화면 `canManagePrizes`와 서버 판정을 같은 두 조건으로.

**E13 [P2] (7/10) TECH (B C-2) `04.3-10:249` · `04.3-17:235` — 행사 행이 동시에 지워졌을 때(`lockEventRow` → null) 갈래가 없다**
- 04.3-17이 처음으로 행사 행을 **지우는** 쓰기(`cancelRequest`, N16 a)를 더한다. 잠금을 기다린 `generateQr` · `savePrizes`는 `null`을 받고, `savePrizes`가 그대로 `cert_prizes`를 넣으면 외래 키 위반 → 500. `closeEvent` ↔ 제출 경합 테스트도 없다(15 Task 2의 닫힘 준비는 잠금을 거치지 않는 `closeCertEventForTest`). OV의 「경합 문제없음」은 잠금 순서만 봤고 삭제는 보지 않았다.
- 처분(자동): 「`lockEventRow`가 null이면 `notFound`」를 15 Task 1 ④(함수를 옮기는 곳) 규약으로, 10 · 17 함수 순서에 한 줄. 17 통합 둘: ① `cancelRequest` × `savePrizes`(새 줄) → (`cancelled` + `notFound`) 또는 (`hasPrizes` + `saved`), 500 없음 ② `closeEvent` × `submitCertificate` → `closed` + (`saved`이고 제출 시각 < 닫힌 시각 또는 `closed`).

**E21 [P2] (6/10) TECH (OV9) `04.3-15:292` · `04.3-12:41` — 15분 셈에만 쓰는 `submit_ip_hash`를 보존 기한(약 6년)까지 둔다.** 목적이 끝난 가명 정보의 장기 보관(보호법 제21조①). 처분(자동): 17 `closeEvent` 트랜잭션에서 그 행사 제출의 `submit_ip_hash`를 NULL로. 마감으로 닫힌 행사는 04.3-12 파기 Job이 「닫힌 지 1일 넘은 행사」 조건으로 비운다. 테스트: 17 닫기 통합에 IP 칸 NULL 단언 · 12 통합에 마감 행사 IP 비움 한 케이스.

**E27 [P3] (5/10) TECH (A A6) `04.3-10:249`** — `generateQr`가 `cert.link.expire_hours`를 잠금 안에서 읽으면 풀(`DB_POOL_MAX` 5)의 둘째 연결을 잡는다. `requestQr`처럼 「설정 · 신청자 · 받는 사람은 트랜잭션 전에 읽는다」를 명시(`intake.ts:624-625` 규약).

**E28 [P3] (5/10) TECH (A A8) `04.3-10:247` — 문의 전화 사본을 신청 때 찍는다.** 새 흐름은 신청과 공개가 며칠 떨어진다. `generateQr`의 `setQrGenerated`가 사본을 지금 설정값으로 다시 찍는다(NOT NULL이니 신청 때 사본은 유지). 비었으면 `blocked{reason:"contactMissing"}` — 04.3-04 문장 재사용 여부는 UI-SPEC 확인.

**E22 [P3] (6/10) TECH (A A7 · B T-11 · OV12의 기술 부분) `04.3-10:357` T-04.3-427 accept — 받을 사람 0명인 신청이 조용히 성공한다.** 처분(자동, 동작 · 문장 변경 없음): `requestQr`가 받는 사람 0이면 `log.warn("cert.qr_request_no_recipient", {eventId})`. `cert-qr-request.test.ts`에 ① 신청자가 `certs.qr`도 가지면 그 사람 행 0 ② 생성자 = 신청자면 `cert_qr_created` 0 ③ 받는 사람 0명 → `ok` · 알림 0 · 경고 1 ④ 다음 영업일 `now`로 이메일 단계를 돌리면 묶음에 들고 `email_status`가 바뀐다. 13 스모크 ⓪-c 앞에 「경영관리 계급 `certs.qr` 켜기 전 신청 금지」. OV12의 「0명이면 막기」는 새 문장이 필요해 채택하지 않는다(경고 + 체크리스트로 충분).

**E23 [P3] (5/10) 사용자 결정 (a)로 닫힘 — 5915996637 (OV12 즉시 메일 · A의 N12 입력)** — 사건 알림 메일은 04.2 규칙(받는 사람당 하루 한 통 · 다음 영업일 tick)이라 금요일 저녁 신청 → 월요일 메일. N12 (a)로 닫혔고 즉시 메일은 04.2 계약 · 위험 경로라 범위 밖. PR 댓글에 알림 한 줄로만 남긴다.

**E24 [P3] (6/10) TECH-auto (A A5) `04.3-17:235` — 신청 취소 · 다른 경영관리의 QR 생성 뒤에도 `cert_qr_request` 메일이 다음 영업일에 나간다.** 해가 작고 추천안이 동작 변경 없음이라 자동 채택: DECISIONS에 「알림함은 이력 — 지금 상태는 목록 그룹」 한 줄(17). 메일 취소(`email_status` 새 값)는 04.2 계약 변경이라 하지 않는다.

### 제품 결정(사용자 답 필요 — PR #88 「[사용자 결정 요청]」)

**E1 [P1] (8/10) PRODUCT (OV1 — N13 · N10 (a)는 유지, 새 사실) `04.3-17:148` · `UI-SPEC:396,471` · `04.3-12:42`**
- 새 흐름에서 대리 · 허위 제출을 막는 통제는 행사 뒤 대조 **하나**다(15:443 T-04.3-402). 그런데 대조로 가짜를 찾아도 지울 수도, 제외 표시를 할 수도 없다(I4 정정은 값을 고치는 기능). 허위 제출자가 적은 주민번호가 실존하는 제3자의 번호면 파기 기한(제출 연도 + 1 + 5년, 3월 1일)까지 남고, Phase 11이 제출 전부로 지급명세서를 만들면 경품을 받지 않은 사람이 기타소득자로 신고된다(보호법 제21조 · 제24조의2). N13 (a) 설명(「I4 정정 + 운영 절차」)에는 이 사실이 없었다. 가액 기준 파기 시점(N10 a)은 설계 `/cso`에 이미 넘겨져 있어 여기서 다시 묻지 않는다.
- 선택지: (a) N13 (a) 그대로 — 가짜 제출의 주민번호가 보존 기한까지 남는 것을 받아들임 · (b) **추천** 제출 줄 3차 「대조 제외」 — 누르면 같은 트랜잭션에서 `excluded_at/by` · 04.3-12 칸 비우기 함수 재사용(주민번호 · 주소 · 연락처 즉시 비움, 서명 객체 삭제 대기) · 끌 수 없는 `cert_purge` 로그 · Phase 11 지급 대상 제외 · (c) 설계 `/cso`(N14 a)에 맡기고 그 판단을 따름.
- 웨이브 6 전 필요: **예**((b)는 제출 행 칸 둘 — 이 페이즈 마이그레이션은 15에서 한 번 굳는다).

**E5 [P2] (7/10) PRODUCT (A A2 · B C-4 · OV7 — N3 (a)는 유지, 새 사실) `04.3-15:106,305` · `UI-SPEC:338` · `CONTEXT:149-150`**
- 5909578685의 두 문장 「5만원 이하 경품은 확인증을 받지 않는다」와 「판정은 가액 × 수량」이 한 경우에 다른 답을 낸다. 30,000원 상품권 2장(60,000원)은 과세 대상인데 목록 판정이 1개 가액으로 걸러 수령자 목록에 없고, N3 (a)라 수량도 적지 않는다 → 원천징수에 필요한 번호를 받을 길이 없다(테스트도 오류도 없는 조용한 누락). 반대로 목록에 오른 경품은 1개 가액이 5만원을 넘으므로 수량이 판정을 바꾸는 일이 없다 — I4 `수량` 정정과 `certRrnPurgeTarget`의 수량 인자는 세무 판정에 영향이 없다. N3 (a) 설명에는 이 두 사실이 없었다.
- 선택지: (a) **추천** N3 (a) 유지 + 운영 규칙 — 한 사람에게 여러 개 주는 경품은 경영관리가 **묶음 한 줄**(예: `상품권 3만원권 × 2`, 1개 가액 60,000)로 넣는다. 코드 · 스키마 변경 없음, DECISIONS · 세무 확인 항목 한 줄 · (b) 경품 줄에 「1인 최대 수량」 칸 + 수령자가 수량을 적음(N3 b 쪽) · (c) 경품 줄 = 1인 지급분으로 정의하고 수량 칸 · I4 수량 정정을 없앰(N3 c 쪽, 코드가 준다).
- 웨이브 6 전 필요: (a)면 아니오 · (b) · (c)면 **예**(스키마).

**E6 [P2] (7/10, OV P1에서 조정) PRODUCT (OV2 — 새 항목) `04.3-17:59-60` · `UI-SPEC:395-396` · `04.3-15:291`**
- 현장 추첨은 이름을 공개로 부른다. 들은 사람이 그 이름 · 자기 연락처 · 자기 주소로 **택배 경품**을 먼저 제출하면 이름 대조를 통과하고, 진짜 당첨자가 나중에 내도 연락처가 달라 `같은 연락처` 표시가 서지 않는다. 「그룹별 건수」 비교도 경품 줄에 당첨 수가 없어 시스템 밖 메모에 기댄다. 대조 화면에 같은 이름 두 줄이 제출 시각 순으로 보이므로 사람이 잡을 수는 있어 P2로 낮췄다.
- 선택지: (a) **추천** `cert_prizes.winner_count`(정수 1 이상) + 그룹 머리글 `{경품명} · 제출 {N} / 당첨 {M}`(N > M이면 경고색) + 같은 이름(정규형) `같은 이름 {N}건` + 운영 한 줄 「택배 발송은 대조 뒤」 · (b) 운영 한 줄 + 같은 이름 표시만(스키마 없음) · (c) 지금대로.
- 웨이브 6 전 필요: (a)면 **예**(스키마 칸 · UI-SPEC 문장 두 개) · (b) · (c)면 아니오.

**E7 [P2] (6/10) PRODUCT (A A3 · OV8 — 새 항목, 13:222 `/cso` 열린 질문과 겹침) `04.3-10:71,292,356` · `04.3-15:291`**
- 가액은 원천징수 과세표준이고 모든 상태에서 언제든 고친다. 그런데 로그 `document_update`는 줄 수만(가액 숫자 없음, 끌 수 있음), 제출 행에 제출 때 가액도 없다. 주민번호를 받은 근거(그때 가액 > 5만원) · 파기 대상이 된 근거(가액을 내림) · 누가 무엇에서 무엇으로 바꿨는지를 나중에 재구성할 수 없다. 행동 로그는 내부 관리자만 보므로 수령자 비노출 규칙(5905714131)이 막는 대상이 아니다.
- 선택지: (a) **추천** 끌 수 없는 새 로그 종류 `cert_prize_value`(detail `{prizeId, from, to}`, 같은 트랜잭션, 바뀐 줄마다) — `action_type`이 `text`라 마이그레이션 없음 · (b) 제출 행에 `unit_value_krw_at_submit` 칸(서버가 잠근 뒤 읽은 값, I4에 싣지 않음) · (c) (a) + (b) · (d) 지금대로(`/cso`로 넘김). 「지급명세서 제출 뒤 가액 잠금」은 Phase 11 몫.
- 웨이브 6 전 필요: (a) · (d)면 아니오(10 · 웨이브 7) · (b) · (c)면 **예**.

**E8 [P2] (7/10) PRODUCT (OV5 · A의 N9 입력 — N9 · N15 (a)는 유지, 새 사실) `04.3-10:66` · `UI-SPEC:467` · `domain/settings/keys.ts:344-346`**
- 마감은 N9 a · N15 a로 정해졌다(max(당첨일 00:00 KST, QR 생성 시각) + 설정 시간, 기본 72). 새 사실은 **열림 시작**이다: 링크는 QR을 만든 순간(행사 며칠 전)부터 열린다. 준비 중인 직원이 「QR 되나」 찍어 끝까지 내면 실제 제출 행이 생기고 E1 때문에 지울 수 없다. 현장 사진 · 메신저로 퍼진 QR은 행사 전 며칠 + 당첨일 뒤 72시간 동안 열려 있다(확인 단계가 없는 소지자 링크). 72는 「이름 + 뒤 4자리」 명단 설계 때의 값이다.
- 선택지: (a) N9 · N15 (a) 그대로 + 운영 한 줄 「QR 시험 스캔은 경품 고르기 화면까지만」 · (b) **추천** 열림 시작 = 당첨일 00:00 KST, 그 전에는 E6-c 모양 `아직 열리지 않았습니다`(새 문장 — UI-SPEC 한 줄, 15 `loadIntake` 갈래 하나, 스키마 없음) · (c) (b) + 설정 기본값 72 → 24.
- 웨이브 6 전 필요: 스키마는 아님. (b) · (c)면 15 `loadIntake`가 갈래를 가지므로 **웨이브 6 전 권장**(늦으면 16에서 더함).

**E9 [P2] (6/10) PRODUCT (OV10 — 새 항목) `UI-SPEC:391,397` · 17 prohibitions 「닫힌 링크를 다시 여는 함수를 두어서는 안 된다」**
- 닫은 뒤 과세 대상이 생기는 두 경우 — 예정 가액 4만원 경품을 사 보니 6만원(결정 기록 「경품을 산 뒤 실제 가액으로 고친다」가 바로 이 경우) · 택배 당첨자가 창 안에 못 냄 — 에 주민번호를 받을 경로가 없고, 화면도 제출 셀 `0`만 보일 뿐 경고가 없다. 원천징수가 조용히 빈다.
- 선택지: (a) 닫힌 행사 「추가 링크」(새 토큰, 그 경품만, 짧은 기한) · (b) 경영관리 I4 대리 입력(같은 v3 안내를 전화로 고지) · (c) **추천** 이번 범위는 운영 절차(종이 확인증) + 경품 표에 `가액 > 50,000 · 제출 0` 경고색 표시(17, 문장 한 줄은 UI-SPEC). (a) · (b)는 뒤 페이즈로.
- 웨이브 6 전 필요: (c)면 아니오(17 · 웨이브 8) · (a)면 모양에 따라 스키마라 **예**.

## Step 2 — Code Quality

**E14 [P2] (8/10) TECH (B C-3 · B T-5) `04.3-16:131` · `04.3-14:334,359,370` — E′4 폼 채우기 · 서명 도우미가 스펙마다 복사되고, 04.3-14의 체크 라벨 변경이 그 사본들을 고치지 못한다**
- 기존 사본 둘: `test/e2e/mobile-cert-submit.spec.ts:20-68`(`fillFields` 67행 `name: "개인정보 수집·이용에 동의합니다"`) · `mobile-cert-intake.spec.ts:13 signAt`. 새로 복사될 곳 넷(15 tracer · `mobile-cert-prize-leak` · 16 `mobile-cert-branches` · 13 `mobile-cert-dom-audit`). 14 Task 3 `<files>`에는 `mobile-cert-submit` · `cert-review`뿐이고 verify에 **가액 누수 스펙이 없다** — 보안 회귀 스펙이 CI까지 붉은 채 모를 수 있다.
- 처분(자동): 새 `test/e2e/helpers/cert-form.ts`(`import type { Page }`만 — 규약 C4, `helpers/cert.ts`에는 넣지 않음). 계약 `drawSignature(page)` · `fillIntakeForm(page, {name?, rrnFront?, rrnBack?, phone, address?})`(수집 안내 체크 포함) · `submitButton(page)`. 15 Task 1 ①에서 만들고 15 Task 3이 `mobile-cert-submit`을 옮긴다. 14는 라벨을 도우미 한 곳에서 바꾸고 verify에 `mobile-cert-prize-leak.spec.ts`를 더한다. 순절감 추정 150~240줄(테스트 코드).

**E30 [P3] (8/10) TECH (B C-5) `04.3-17:65,236` · `UI-SPEC:405`** — I4 `수량` 범위가 「1 이상」과 「1~99」로 갈린다. 상한 99를 UI-SPEC 개정 절 · must_haves와 맞추고 통합에 `quantity: 100` 거부 한 케이스(E5가 (c)면 항목째 사라짐).

**E31 [P3] (6/10) TECH (B C-6) `04.3-13:230`** — `<automated>pnpm db:reset:test && CI=true pnpm test && pnpm lint:sql`(확인함)은 로컬 전체 E2E로 CLAUDE.md §5 · §6과 부딪힌다. 로컬 = 단위 · 통합 · `lint:sql` + cert 스펙 묶음(`--project=cert-setup --project=certs`), 전체 E2E = PR ready 뒤 CI 녹색 확인(체크 결과를 SUMMARY에).

**E32 [P3] (5/10) TECH (B C-7) `04.3-15:320`** — 15만 스테이징에 오르면 목록에 오른 경품 0인 열린 행사가 빈 E′2를 그린다(E6-d는 16 몫). 15 SUMMARY 넘김에 「04.3-16 전에는 배포하지 않는다(같은 PR)」 한 줄(E6-d 문장을 15에 미리 두는 안은 중복이라 택하지 않음).

**E40 [P3] (8/10) TECH (OV5의 기술 부분) `domain/settings/keys.ts:344`** — 힌트 「행사 링크를 만든 뒤 이 시간이 지나면 링크가 닫힙니다」(확인함)가 N15 a 규칙과 어긋난다. `keys.ts`를 이미 `<files>`에 가진 15 Task 3이 「당첨일 00:00과 QR 생성 가운데 늦은 때부터 이 시간 뒤 닫힙니다」 꼴로 고친다(문장은 UI-SPEC 확인, E8 답이 (c)면 기본값도).

## Step 3 — Tests

프레임워크(B 확인): `vitest.config.ts`(unit · integration, `globalSetup`이 `erp_test` 마이그레이션, `fileParallelism: false`) · `playwright.config.ts`(`*cert*.spec.ts` → `certs` 프로젝트, workers 1, CI일 때만 프로덕션 빌드) · `tsconfig.json` `include: ["**/*.ts", …]` — **`pnpm typecheck`는 test/ 전체를 본다**(E3의 근거). 새 스펙 이름은 모두 `*cert*`에 걸리고 verify 명령은 모두 `CI=true … --project=cert-setup --project=certs` 꼴이다.

커버리지(B, 계획 기준):

```
COVERAGE: 49/66 경로 테스트됨(74%) | 코드 경로 38/54 (70%) | 사용자 흐름 11/12 (92%)
QUALITY:  ★★★ 27 · ★★ 21 · ★ 1 | GAPS 17 (E2E 필요 1 · 회귀 4)

GAP → 처분
  submitBudgetExceeded 30/31 순수 경계                      → E35
  몰림: 풀 고갈 없음 · 다른 행사 loadIntake 5초(옛 AX-P2)      → E18 (회귀)
  closeEvent ↔ submit · lockEventRow null · savePrizes ↔ cancel → E13
  제출 notFound 갈래 · 액션 serverError 문구 누수 스윕          → E16
  속도 제한 E2E가 꾸민 응답을 스캔                            → E16
  받는 사람: 신청자 제외 · 0명 · 생성자 = 신청자 · 메일 묶음    → E22
  document_create 로그 단언(04.3-04 케이스 삭제 뒤 대체 없음)   → E34 (회귀)
  certs.qr 쓰기만 가진 계급 · 실제 경영관리 계급 E2E           → E11
  기존 편집 표(견적 · 붙여넣기 · 키보드) 불변                  → E19 (회귀)
  I4 수량 상한 · 인쇄물 수량                                  → E30 · E36
  기한 지난 행사 닫기 → alreadyClosed                         → E38
  수집 안내 라벨에 기대는 다른 스펙                           → E14 (회귀)
  기획 PM I′3 가액 스캔의 차등 대조군                         → E17
```

REGRESSION RULE(B): 04.3-04 행사 만들기 · 02/03/06 이름 고르기 · 07/11 I4 · 인쇄 조인 · 07 비활동 · 06 동의 문장 · Phase 4 공용 표 · 09 정보 항목 — 대부분 이식이 명시됐다. 대체 없이 사라지는 보호는 AX-P2(E18) · `document_create`(E34), 기존 스위트를 부르지 않는 곳은 공용 표(E19) · 라벨(E14).

**E3 [P1] (9/10) TECH (B T-1) `04.3-15:343,350,256,363,401` — Task 1의 verify · 수용 기준이 구조상 통과할 수 없다**
- 확인함: Task 1 `<files>`(L256)에 `test/integration/cert-intake.test.ts` · `cert-submit.test.ts` · `cert-events.test.ts` · `test/e2e/cert-events.spec.ts` · `mobile-cert-submit.spec.ts` · `test/unit/certs/public-route-boundary.test.ts`가 없다(Task 2 L363 · Task 3 L401 몫). 그런데 `cert-intake.test.ts:8-9` `import { loadIntake, selectWinner, submitCertificate, verifyLast4 } …` / `import { createEvent } …`, `public-route-boundary.test.ts:69` `Array(4).fill(…)`. Task 1 verify 넷째 줄(L343)은 `pnpm typecheck`로 시작하고 수용 기준(L350)은 `grep -rnE "cert_winners|…|winnerId" … test`가 빈 출력이어야 한다.
- 결과: Opus 실행자 · 마이그레이션 플랜의 첫 게이트가 붉고, 실행자는 멈추거나 자기 태스크 밖 파일을 즉석으로 고쳐야 한다(§4 「즉석 방법으로 대체」 금지). 웨이브 6 전체가 선다.
- 처분(자동 — B 추천 ①): 여섯 파일을 Task 1 `<files>`에 넣고 ⑧에 「컴파일되는 최소 이식 — 지울 케이스는 지우고, 남길 케이스는 새 도우미 · 새 입력 봉투로만 바꿈. 행동 단언 추가는 Task 2 · 3」과 `Array(4)` → `Array(1)`. Task 2 · 3은 「행동 케이스 더하기」로 남긴다.

**E15 [P2] (8/10) TECH (B T-2) `04.3-15:314,381`** — (d) `prizeGone` · (e) `termsChanged` · (f) `throttled`를 Task 1에서 구현하고 테스트는 Task 2에 쓴다 → 실패를 본 적 없는 「RED」(CLAUDE.md §5 · `test-driven-development`). Task 1 ① RED에 셋 각 기본 한 케이스를 넣는다. Task 2 경합 케이스는 「잠근 뒤 재확인 줄을 빼면 실패하는지」 한 번 확인(변이 확인) 단계를 적는다.

**E16 [P2] (8/10) TECH (B T-3 · T-18) `04.3-16:41,169,170` · `04.3-15:279` — 속도 제한 · 닫힘 · 안내 바뀜 응답의 누수 검사가 실제 서버 응답을 보지 않는다**
- 16:169 「요청 가로채기로 `throttled` 응답을 한 번 돌려주면 … 그 응답 본문 누수 0건」 — 테스트가 만든 본문을 스캔하니 늘 녹색. 닫힘(:170)은 스캔 자체가 없다. 통합 스윕은 domain 결과의 `JSON.stringify`라 액션 응답(RSC 인코딩 · 래퍼 오류 문구)과 다르고, 제출 `notFound` · `serverError` 문구가 목록에 없다. 15:279 「가로채기로 서버 칸 오류를 한 번 되돌린 제출」도 같은 모호함.
- 처분(자동): 16 — `page.setExtraHTTPHeaders({"x-forwarded-for": "203.0.113.50"})`(`lib/client-ip.ts`는 마지막 항목을 믿음)로 IP를 정하고 도우미로 같은 행사 · 같은 IP 제출 30건을 미리 넣은 뒤 화면 제출 → 실제 `throttled`를 스캔, 같은 키 재전송은 30건 중 일부 `submitted_at`을 16분 전으로 옮겨 확인. 닫힘 · 안내 바뀜에도 같은 수집 · 스캔 · 차등 대조군. 15 Task 2 — 통합 스윕에 `submitCertificate` `notFound`와 DB 오류 주입 시 `handleServerError` 문자열 두 갈래. 15:279 → 「`route.continue({ postData })`로 이름 칸을 201자로 바꿔 서버가 **실제로** `invalid`를 돌려준 응답」.

**E17 [P2] (7/10) TECH (B T-4) `04.3-10:288`** — 기획 PM I′3 가액 스캔의 양성은 합성 문자열 자체 시험뿐이라, 같은 수집기가 실제 RSC 인코딩 안의 가액을 잡는지 증명하지 못한다. 같은 테스트에서 같은 I′3를 경영관리로 열어 같은 수집 · 같은 패턴 → 1건 이상(현장 차등 대조군)을 먼저 단언하고 PM → 0건.

**E18 [P2] (7/10) TECH (B T-6 · A F1) `04.3-15:314,330` — REGRESSION: `cert-verify.test.ts`를 지우며 풀 고갈 없음(AX-P2) 회귀를 옮기지 않았다**
- 인용: `test/integration/cert-verify.test.ts:715` `describe("잠금 전 빠른 거부 · 풀 고갈 없음(AX-P2)"` · `:755` `DB_POOL_MAX×3 동안 다른 행사의 loadIntake가 5초 안에 ok`. 새 흐름도 「잠금 전 한 번 셈」을 설계로 가졌지만 증명하는 테스트가 없다. 추첨 직후 몰림은 같은 행사 행 잠금 + 전역 문서 번호 카운터 잠금에 줄을 서고, 대기마다 풀 연결 하나(인스턴스당 5)를 쥔다.
- 처분(자동): 15 Task 2 `cert-prize-intake.test.ts`에 새 모양 한 케이스 — 행사 A 행을 별도 연결로 `FOR UPDATE`, 같은 IP 가명으로 30건 선입력 뒤 `DB_POOL_MAX × 3`건 동시 제출 → 모두 `throttled`(잠금 대기 없이) · 그동안 행사 B `loadIntake` 5초 안 ok · 서명 객체 0. 옛 `holdEventRow` 도우미를 옮긴다. 잠금 대기 5초 초과가 결과 불명(같은 키 재시도로 `saved`)인지도 한 줄.

**E19 [P2] (8/10) TECH (B T-7) `04.3-17:196,201` — REGRESSION: 공용 `ui/table` · `ConfirmDialog`를 고치면서 기존 회귀 스위트를 verify가 부르지 않는다.** Task 1 verify 첫 줄을 `pnpm vitest run --project unit test/unit/ui test/unit/certs/format.test.ts`로 넓히고 `CI=true pnpm playwright test --no-deps --project=desktop test/e2e/quote-table.spec.ts test/e2e/excel-paste-final.spec.ts test/e2e/quote-edit-scope.spec.ts`를 더한다. Task 2(`ConfirmDialog`)는 `confirm-dialog.test.ts` 전체 + 그것을 쓰는 기존 화면 E2E 하나.

P3(모두 TECH, 자동 반영):
- **E33** (B T-10, 6/10) `04.3-12:185` — 통합 verify가 개발 DB `pnpm db:migrate`를 돈다. 재생성 뒤 옛 `cert_intake`가 적용된 로컬 DB에서 멈출 수 있다 → `pnpm db:reset:test && pnpm vitest run --project integration …`.
- **E34** (B T-12, 6/10) `04.3-10:247` — REGRESSION: `document_create` 로그 단언이 04.3-04 케이스 삭제와 함께 사라진다 → `cert-qr-request.test.ts`에 1줄(entity `cert_event` · detail에 개인정보 · 가액 없음) · 재전송 시 그대로 1줄.
- **E35** (B T-13, 6/10) `04.3-15:273,306` — `submit-limit.test.ts`에 `submitBudgetExceeded(29)`=false · `(30)`=true(= 31번째 거절) 고정.
- **E36** (B T-14, 6/10) `04.3-17:230` — `cert-print.test.ts`(통합)에 정정 뒤 인쇄 DTO `quantity` 3 한 케이스.
- **E37** (B T-15, 6/10) `04.3-16:192,203` — Task 3이 `intake-flow.tsx` · CSS를 고친 뒤 verify에 `mobile-cert-intake` · `regression-1` · `regression-2` · `mobile-cert-submit`을 더한다.
- **E38** (B T-16, 5/10) `04.3-17:226,187` — 통합 닫기에 「마감 지난 행사 → `alreadyClosed`」 · `cert_view` 측정 조건문을 빼고 판정 하나(「스크롤 끝 + 링크 hover 1초 뒤 `/certs/submissions/` RSC 요청 0건」, 04.3-14 L226과 같은 절차).
- **E39** (B T-17, 5/10) `04.3-16:51` — 확정 판정 뒤 새 멱등 키: 16 Task 1 · 2 E2E에서 두 요청 본문의 `idempotencyKey`가 다름을 단언.

## Step 4 — Performance

- 쿼리: 알림 받는 사람 조회는 작은 표 조인 한 번. I′3 `listPrizeSummaries`는 경품 × 수량 GROUP BY 한 쿼리여야 한다(경품마다 셈이면 N+1 — 부록 F-a).
- 잠금: E18(몰림 · 풀) · E27(잠금 안 설정 읽기)이 성능 쪽 지적이다.

**E29 [P3] (5/10) TECH (A F3) `04.3-15:314` · `04.3-10:244`** — `countRecentSubmissionsByIp`를 제출마다 두 번 부르는데 받칠 인덱스를 적지 않았다. 지금은 새 UNIQUE `(event_id, idempotency_key_hash)`가 `event_id` 접두 역할을 해 행사당 수백 건이면 충분. 15 ② 주석에 「행사당 1,000건을 넘으면 `(event_id, submit_ip_hash, submitted_at)` 인덱스」 한 줄 — 지금 더하지 않는다(추측성 금지).

**E10 [P2] (7/10) 설계 `/cso` 입력 (A F2 · OV6) `04.3-15:306` · `04.3-13:295,302` — 제출 속도 제한: 행사 단위 한도가 사라지고 IP 한도(15분 30)만 남았다**
- 옛 행사 한도 `max(40, ceil(명단×0.5))/15분`이 명단과 함께 사라졌다. IP당 30/15분 = 시간당 120, 비행기 모드 토글로 새 CGNAT IPv4 · 새 /64를 받으면 우회된다. 반대로 행사장 공유 와이파이 · CGNAT에서는 정상 당첨자 31번째가 최대 15분 막힌다. 수치 근거는 「공유 와이파이 고려」 주석뿐이고 이미 13 Task 3 ② `/cso` 열린 질문(D-16 대체)이다.
- 처분: 사용자에게 따로 묻지 않는다 — N14 a(웨이브 6 전 새 흐름 위협 설계 `/cso`)의 입력으로 넘긴다: ① 잠근 행사 행 안에서 행사 단위 상한을 한 번 더 셈(E6 (a)면 `sum(winner_count) × 2`와 최소값 중 큰 값, 아니면 설정 기본값), 닿으면 `throttled` + 경영관리 알림함 한 줄 ② IP 한도는 행사장 NAT를 생각해 느슨하게. `/qa` 시나리오에 「한 IP에서 31번째 정상 당첨자」와 E′4 문장 · 대기 시간을 더한다. `/cso`가 행사 한도를 택하면 15 Task 1 ④ · Task 2에 반영한다(스키마 아님).

## 실패 모드 표

| # | 새 경로 | 현실적 실패 | 계획이 막는가 | 테스트 | 사용자가 보는 것 |
|---|---|---|---|---|---|
| 1 | `requestQr` 결과 불명 재시도 | 행사 · 알림 둘 | 예 — `create_request_id` UNIQUE, 알림 같은 tx | 통합 | 행사 하나 |
| 2 | 신청 알림 받는 사람 0명 | 아무도 QR을 안 만듦 | **아니오(accept)** | **없음** | **조용함 — critical**(E22) |
| 3 | `certs.qr`만 켜고 `certs.events` 보기 없음 | 알림은 오는데 404 | 아니오 | 없음 | 404(혼란) — E11 |
| 4 | `generateQr` 이중 누름 | QR 둘 | 예 — `qr_request_id` + 잠금 | 통합 | 하나 |
| 5 | 가액 변경 ↔ 제출 | 옛 가액으로 판정 | 예 — 잠근 뒤 재판정 | 통합 경합 | `prizeGone` → 새 목록 |
| 6 | 신청 취소 ↔ QR 생성 · 저장 | 지워진 행에 insert → 500 | **아니오** | 없음 | 500 — E13 |
| 7 | 닫기 ↔ 제출 | 닫힌 뒤 저장 | 예 — 잠근 뒤 닫힘 재확인 | 준비가 잠금 우회 — E13 | E6-b |
| 8 | 수령자 응답에 가액 | 정책 위반 | 예 — 세 칸 투영 · 정적 경계 · 스윕 · E2E | 통합 · E2E(갈래 일부 공허 — E16) | 없음 |
| 9 | PM 응답에 가액 | 정책 위반 | 예 — DTO 키 없음 | E2E(차등 없음 — E17) · 등록부 모름(E12) | 없음 |
| 10 | 5만원 이하 경품 × 수량 2+ | 과세 대상인데 확인증 없음 | **아니오** | **없음** | **조용함 — critical**(E5) |
| 11 | 대조로 찾은 가짜 제출 | 제3자 주민번호 약 6년 · 지급명세서 | **아니오** | 없음 | **조용함 — critical**(E1) |
| 12 | 현장 이름 사칭 · 택배 경품 | 경품 손실 | 부분 — 사람 대조 | 없음 | 같은 이름 두 줄(E6) |
| 13 | 행사 전 직원 시험 스캔 · 퍼진 QR | 실제 제출 행 · 긴 창 | 아니오 | 없음 | E8 |
| 14 | 닫은 뒤 가액 인상 · 늦은 택배 당첨자 | 원천징수 누락 | 아니오 | 없음 | 제출 셀 `0`만(E9) |
| 15 | 가액을 내렸다 올림 | 파기 · 수집 근거 소실 | 표시는 계산이라 맞음, 이력 없음 | 단위 | 조용함(E7) |
| 16 | 행사장 공유 IP 31번째 | 정상 당첨자 대기 | 부분 — 같은 키 재시도 | E2E 가로채기(E16) | `제출이 잠시 멈췄습니다`(E10) |
| 17 | 추첨 직후 몰림 | 풀 대기 · 5s 잠금 초과 | 부분 — 결과 불명 → 같은 키 | **없음(AX-P2 소실)** | 결과 불명 문장(E18) |
| 18 | PR 브랜치 스테이징 스모크 뒤 재생성 · main 이동 | 스테이징 migrate 실패 또는 조용한 건너뜀 | **아니오** | 없음 | 스테이징 빨간불 · 무인 머지 정지(E2) |
| 19 | 웨이브 7–9 머지 때 main 새 마이그레이션 | 번호 충돌 | 예 — 13 Task 1 `MERGE_HEAD` 절차 · node 체인 | verify | 없음 |
| 20 | 취소된 신청의 알림 메일 | 오해 | 아니오 | 없음 | 옛 메일(E24, 해는 작음) |

critical gap 3건: #2(E22) · #10(E5) · #11(E1). #18은 스테이징에서 드러나거나(i) 조용히 건너뛴다(ii) — (ii)는 프로덕션에는 영향이 없어 critical에서 뺐다.

**E2 [P1] (8/10) TECH (OV4) `04.3-13:235,267` · T-04.3-191 · `04.3-15:335` — PR 브랜치를 스테이징에 올리는 스모크가 스테이징 마이그레이션 원장을 망가뜨린다**
- 확인함: drizzle migrator(`drizzle-orm@0.45.2/pg-core/dialect.js`)는 `order by created_at desc limit 1`의 마지막 행 하나와 비교해 `Number(lastDbMigration.created_at) < migration.folderMillis`인 것만 적용한다 — 해시를 보지 않는다. `scripts/deploy.sh:605` `run_migrate`가 스테이징 배포마다 돈다. 13:267 「스테이징을 main 머리로 되돌린다」는 코드만 되돌리고 DB는 그대로다.
- 결과: (i) 스모크 뒤 main이 움직여 재생성하면 `when`이 커져 머지 뒤 스테이징 배포가 `CREATE TABLE cert_events`를 다시 실행하다 실패 → 무인 머지 전체 정지(§4 머지 조건). (ii) 그 사이 main에 들어온 다른 마이그레이션의 `when`이 스모크 시각보다 작으면 스테이징에서 조용히 건너뛰어 스키마가 어긋난 채 초록불.
- 처분(자동 — OV 추천): 스모크를 **머지 뒤**(main push = 스테이징 자동 배포)로 옮긴다. `cert.enabled` 기본 꺼짐과 프로덕션 환경 게이트가 이미 있어 머지 전 스모크가 필요하지 않다. `bootstrap-gcp.sh`를 머지 전에 PR 브랜치에서 돌리는 순서는 그대로. 13 human-check ⓪ · T-04.3-191 · PR 체크리스트를 고친다. 머지 전 스모크가 사용자 요구라면(E3-07 기록 확인) 대안: 「최종 재생성 뒤 · 머지 직전 · main에 새 마이그레이션 없음」 조건 + 재생성이 생기면 소유자가 스테이징에서 cert 표 셋과 `drizzle.__drizzle_migrations` 마지막 행을 지우는 런북.

**E4 [P2] (8/10, OV P1에서 조정) TECH (OV3) `04.3-15:170,201` · `04.3-17:132` — 스키마를 바꾸는 답이 웨이브 6 게이트 밖에 있었다**
- 확인함: 15 Task 0이 읽는 ID는 N1 · N3 · N5 · N6 · N8 · N14 · N16 · G5 · G0. 17:132 「N13 (b)는 … 스키마 변경 — 그 답이면 멈추고 계획 수정」, 15:124 두 번째 마이그레이션 금지. N13은 (a)로 닫혀 원래 걱정은 해소됐다(5915996637). 남은 위험: 이번 리뷰의 E1 · E5 · E6 · E7(· E9 (a))이 스키마 답이다.
- 처분(자동): 15 Task 0과 `decision_precheck`에 이 다섯을 더하고 「스키마에 걸리는 답은 모두 웨이브 6 전에 읽는다」 규칙 한 줄. 답을 기다리지 않으려고 NULL 칸을 미리 두는 안(OV)은 추측성 코드라 택하지 않는다(CLAUDE.md §3.2).

## NOT in scope

- 사용자가 (a)로 정한 결정의 재론(U3–U5 · G* · N1–N16, 5915996637). E1 · E5 · E8은 결정을 바꾸자는 것이 아니라 (a) 설명에 없던 사실을 알리는 것이다.
- Phase 11 지출결의 연결 · 세금 계산(D-1104 · D-1105) · 「지급명세서 제출 뒤 가액 잠금」.
- 알림 행 링크 칸(N12 c) · 사건 알림 즉시 메일 · 알림 메일 취소 — 04.2 계약 · 위험 경로.
- 가액 기준 파기 시점(N10 a — 설계 `/cso` · 세무 확인 뒤) · 파기 Job 자동 실행(Phase 7로 이관 확정).
- 제출 속도 제한 수치 · 행사 한도(E10) — 설계 `/cso`(N14 a).
- ROADMAP 04.3 목표 문장 · REQUIREMENTS CERT-01 문구를 누가 · 언제 고칠지 — 5915996637에서 미정으로 남음. E20(VALIDATION 재작성)이 같은 문구에 기대므로 함께 정한다.
- UI-SPEC 문구 변경(E6 · E8 · E9 · E28 · E40의 문장) — 제품 답 뒤 `/plan-design-review` 몫.

## 이미 있는 것(재사용)

- **재사용:** `lockEventRow`(`repositories/cert-winners.ts:67-75` → 15가 `cert-events.ts`로 옮김) · `withTransaction`(`lib/db-transaction.ts:46` `lock_timeout 5s`) · `recordAction(…, {tx})`와 핵심 로그 종류(`record.ts:12-39`, `action_type`이 `text`라 새 종류에 마이그레이션 불필요) · `notification_log` 중복 키 · `claimNextEmailBundle` · `can()` · `scopeOf` · 공개 제출의 재생 → 업로드 → 잠근 뒤 재판정 → 서명 키 복구 순서(`domain/certs/intake.ts:600-767`) · 문서 번호 배정 · `publicActionClient` · 공개 오류 허용 목록(`lib/actions/handle-server-error.ts`) · `ui/table` 편집 표 · `ConfirmDialog` · `RowSheet` · 누수 검사 패턴(04.3-05 16진 경계) · 04.3-12 칸 비우기 함수(E1 (b)) · `createFixtureUser`(E11) · 옛 `holdEventRow`(E18) · `lib/client-ip.ts` XFF 마지막 항목(E16) · 13 Task 1 node 체인 검사.
- **재구축(정당):** 공개 domain 두 함수(명단 → 경품) · 스키마 재생성(이 페이즈 마이그레이션 하나 규약) · `verify-lock.ts` → `submit-limit.ts`(IP 가명만).
- **새로(정당성 확인):** `ui/side-panel`(N2 a로 확정) · `insertEventNotifications`(tick 밖 첫 알림 경로 — Phase 7이 둘째 호출자가 되면 `domain/notify`로) · `listActiveUserIdsAllowed`(E11 조건 반영) · `test/e2e/helpers/cert-form.ts`(E14).

## Outside Voice (Opus 대체)

Codex는 CLAUDE.md가 금지하므로 Opus 1명이 주 검토를 보지 않고 새 흐름 플랜 일곱과 UI-SPEC 개정 절을 코드와 대조했다. 새 누수 경로는 찾지 못했다(투영 설계 + 양성 · 차등 대조군 충분). 목록에 오르고 빠지는 것 자체가 「5만원 초과 여부」를 드러내는 것은 결정 기록이 요구한 동작이다.

| # | 주장(outside 등급) | 판정 | 근거 |
|---|---|---|---|
| OV1 | 가짜 제출 처리 경로 없음(P1) | **P1 유지** → E1(PRODUCT, N13 새 사실). N10 부분은 (a)로 닫힘 | 17:148 · 12:42 |
| OV2 | 이름 대조는 사칭을 못 잡음 · 당첨 수 없음(P1) | **P2로 조정** → E6(PRODUCT) | 대조 화면에 같은 이름 두 줄이 보임 · 운영 한 줄로 손실 차단 가능 |
| OV3 | 스키마 결정이 웨이브 6 게이트 밖(P1) | **P2로 조정** → E4(TECH) | 15:170 확인 · N13 (a)로 닫힘 |
| OV4 | 스테이징 스모크가 원장을 망가뜨림(P1) | **P1 유지** → E2(TECH) | `dialect.js` `created_at < folderMillis` 확인 · `deploy.sh:605` |
| OV5 | 제출 창이 너무 넓음(P2) | P2 유지 → E8(PRODUCT, N9 · N15 새 사실) + E40(설정 힌트 TECH) | `keys.ts:344` 확인 |
| OV6 | 행사 한도 소실(P2) | P2 유지, 설계 `/cso` 입력 → E10(F2와 병합) | 13:295 |
| OV7 | 수량 모델(P2) | P2 유지 → E5(A2 · C-4와 병합) | 15:305 |
| OV8 | 가액 이력 없음(P2) | P2 유지 → E7(A3와 병합, PRODUCT) | A는 칸, OV는 로그를 추천 — 갈려서 사용자 결정 |
| OV9 | `submit_ip_hash` 6년 보관(P2) | P2 유지 → E21(TECH) | 12:41 |
| OV10 | 닫은 뒤 과세 대상 경로 없음(P2) | P2 유지 → E9(PRODUCT) | UI-SPEC:397 |
| OV11 | `qr_request_id` · `alreadyGenerated` · `expense_line_id` 줄이기(P3) | **채택 안 함** | `expense_line_id`는 D-1104 연결 어댑터(15:291 「경품 줄 단위로 잇는다」) · `qr_request_id`는 `create_request_id`와 같은 선례의 멱등 키이고 「다른 사람이 이미 만듦」 결과를 가른다 |
| OV12 | 알림 늦음 · 0명(P3) | 기술 부분 → E22, 메일 시점 → E23(N12 (a)로 닫힘) | 10:357 |

## 다음 반영

순서(사용자 지시 5915996637): **① 각 플랜 Task 0에 (a) 답 확정 기록 → ② plan-checker → ③ 설계 `/cso`(N14 a — 새 흐름 위협, 입력: E1 · E8 · E10 · E21 · 아래 목록) → ④ 웨이브 6.** 이 리뷰의 기술 수정은 ① 전에 `/gsd-plan-phase 04.3` 수정 모드로 넣는다. 잠긴 결정과 UI-SPEC 승인 계약은 건드리지 않는다.

- **공통(모든 새 플랜 Task 0):** 읽을 답을 「5915996637 — 전부 (a)」로 확정 문장으로 바꾼다(N14 a · N15 a · N16 a(DECISIONS 보관함 예외 기록) · B1–B4 그대로 · 13 `risk: [migration]` 확정). 이 리뷰의 PRODUCT 답(E1 · E5 · E6 · E7 · E8 · E9)을 해당 플랜 Task 0에 추가.
- **04.3-15(웨이브 6, `risk: migration`):**
  - Task 0 · `decision_precheck`: E1 · E5 · E6 · E7 · E9(a) 추가 + 「스키마 답은 웨이브 6 전」 한 줄(E4)
  - Task 1 `<files>`: `cert-intake.test.ts` · `cert-submit.test.ts` · `cert-events.test.ts` · `cert-events.spec.ts` · `mobile-cert-submit.spec.ts` · `public-route-boundary.test.ts` 추가, ⑧에 컴파일 최소 이식 + `Array(4)` → `Array(1)`(E3)
  - Task 1 ①: (d)(e)(f) RED 각 한 케이스(E15) · `test/e2e/helpers/cert-form.ts` 신설(E14)
  - Task 1 ④: 「`lockEventRow` null → `notFound`」 규약(E13) · ② 주석에 IP 셈 인덱스 조건(E29)
  - Task 1 ⑥: `throttled`를 확정 목록에서 뺌(E26) · SUMMARY 「16 전 배포 안 함」(E32)
  - Task 2: AX-P2 새 모양 케이스(E18) · 통합 스윕에 `notFound` · `serverError` 문구, 15:279 문장 바로잡기(E16) · 경합 변이 확인(E15) · `submitBudgetExceeded` 29/30(E35)
  - Task 3: `mobile-cert-submit`을 도우미로 이식(E14) · `keys.ts` `cert.link.expire_hours` 힌트를 N15 a 규칙으로(E40)
  - 답에 따라: E1 (b) → `cert_submissions.excluded_at/by` · E5 (b)/(c) → 수량 모델 · E6 (a) → `cert_prizes.winner_count` · E7 (b)/(c) → 제출 때 가액 칸 · E8 (b)/(c) → `loadIntake` 「아직 열리지 않음」 갈래
- **04.3-12(웨이브 6):** verify를 `pnpm db:reset:test`로(E33) · 파기 Job이 「닫힌 지 1일 넘은 행사」의 `submit_ip_hash` 비움 + 통합 한 케이스(E21) · E1 (b)면 칸 비우기 함수를 17이 재사용할 수 있게 export 확인
- **04.3-10(웨이브 7):**
  - E11: 받는 사람 = `certs.qr` 쓰기 ∧ `certs.events` 보기 · `scopeOf` 분기 · 통합 셋 · 비시스템관리자 경영관리 고정물 E2E
  - E12: 정보 항목 `cert_prize.value`(staffDefault false) · 등록부 · 화면/서버 판정 일치
  - E13(`generateQr` · `savePrizes` null 갈래) · E17(PM I′3 차등 대조군) · E22(경고 로그 + 네 케이스) · E27(설정 tx 전) · E28(문의 전화 사본 재찍기) · E34(`document_create` 단언)
  - E7 (a)면 `savePrizes`에 끌 수 없는 `cert_prize_value` 로그(`ALWAYS_ON_ACTION_TYPES`)
- **04.3-14(웨이브 7):** 수집 안내 라벨을 도우미 한 곳에서 바꾸고 verify에 `mobile-cert-prize-leak.spec.ts` 추가(E14)
- **04.3-16(웨이브 7):** 속도 제한 실제 유발(XFF + 30건 선입력) · 닫힘 · 안내 바뀜 스캔 + 차등(E16) · Task 3 verify에 폼 스펙 넷(E37) · 새 멱등 키 단언(E39) · E8 (b)/(c)면 「아직 열리지 않았습니다」 화면
- **04.3-17(웨이브 8):** 경합 통합 둘(E13) · verify에 `test/unit/ui` 전체 + desktop 견적 E2E 셋 · `ConfirmDialog` 스위트(E19) · `closeEvent`에서 `submit_ip_hash` NULL(E21) · 수량 상한 정리(E30) · 인쇄 DTO 수량(E36) · 닫기 `alreadyClosed` · `cert_view` 판정 하나(E38) · DECISIONS 「알림함은 이력」(E24) · 답에 따라 E1 (b) 「대조 제외」 3차 · E6 (a) 그룹 머리글 · E9 (c) 경고색
- **04.3-13(웨이브 8):** 스테이징 스모크를 머지 뒤로(human-check ⓪ · T-04.3-191 · PR 체크리스트 — E2) · Task 3 ① verify 로컬 범위(E31) · PR 체크리스트에 경영관리 네 키(E11) · 스모크 ⓪-c 앞 「`certs.qr` 켜기 전 신청 금지」(E22) · 설계 `/cso` 입력 목록에 E1 · E8 · E10 · E21 · `/qa`에 31번째 정상 당첨자(E10) · `risk: [migration]` 확정 기록
- **04.3-02 · 03 · 04 「대체 예고」:** 태스크 참조 바로잡기(E25)
- **04.3-VALIDATION.md:** `/gsd-validate-phase 04.3`로 새 흐름 Requirement → Test Map · Wave 0 · Manual 표(13 human-check 다섯) 재작성, `:37` CLAUDE.md §5로(E20). CERT-01 요구 문장은 ROADMAP · REQUIREMENTS 문구 결정(미정)과 함께.

## Decision ledger

| ID | Finding | 등급 | 처분 | State | 반영 |
|---|---|---|---|---|---|
| U3–U5 · G0 G3 G4 G5 G8 G9 G10 · N1–N16 | 앞선 사용자 결정(요청 5914677049 · 5915778398) | — | 전부 (a) — 재질문 안 함 | approved-user (5915996637) | 각 Task 0 |
| E1 | 가짜 제출을 지울 길 없음(OV1) | P1 | (b) 추천 · 사용자 답 대기 | pending-user | 15 · 17 · 12 |
| E5 | 5만원 이하 × 여러 개 · 수량 모델(A2 · C-4 · OV7) | P2 | (a) 추천 · 사용자 답 대기 | pending-user | 15 · 17 |
| E6 | 사칭 · 당첨 수(OV2) | P2 | (a) 추천 · 사용자 답 대기 | pending-user | 15 · 17 |
| E7 | 가액 이력(A3 · OV8) | P2 | (a) 추천 · 사용자 답 대기 | pending-user | 10 (· 15) |
| E8 | 링크 열림 시작(OV5 · A N9 입력) | P2 | (b) 추천 · 사용자 답 대기 | pending-user | 15 · 16 · 10 |
| E9 | 닫은 뒤 과세 대상(OV10) | P2 | (c) 추천 · 사용자 답 대기 | pending-user | 17 |
| E23 | 신청 알림 메일 시점(OV12 · A N12 입력) | P3 | N12 (a)로 닫힘, PR 댓글에 알림 한 줄 | approved-user (5915996637) | — |
| E10 | 제출 속도 제한 · 행사 한도(F2 · OV6) | P2 | 설계 `/cso`(N14 a) 입력 | routed-cso | 13 · 15 |
| E2 | 스테이징 스모크 원장(OV4) | P1 | 머지 뒤로 이동 | approved-auto | 13 |
| E3 | 15 Task 1 verify 불가(T-1) | P1 | files 추가 · 최소 이식 | approved-auto | 15 |
| E4 | 스키마 답 게이트(OV3) | P2 | Task 0 · precheck에 추가, NULL 칸 선반영 안 함 | approved-auto | 15 |
| E11 | `certs.qr` 전용 계급 404(A1 · C-1 · T-9) | P2 | A ① — 받는 사람 조건 · `scopeOf` 분기 · 고정물 E2E(게이트 확장 안은 거절) | approved-auto | 10 · 13 |
| E12 | 가액 정보 항목(A4 · B A-2) | P2 | `cert_prize.value` 신설 | approved-auto | 10 |
| E13 | `lockEventRow` null · 닫기/취소 경합(C-2) | P2 | 규약 + 통합 둘 | approved-auto | 15 · 10 · 17 |
| E14 | 폼 도우미 · 라벨 스펙(C-3 · T-5) | P2 | `cert-form.ts` + 14 verify | approved-auto | 15 · 14 · 16 · 13 |
| E15 | TDD 순서(T-2) | P2 | RED 이동 + 변이 확인 | approved-auto | 15 |
| E16 | 공허한 누수 스캔(T-3 · T-18) | P2 | 실제 유발 · 스윕 갈래 추가 | approved-auto | 16 · 15 |
| E17 | PM I′3 차등 대조군(T-4) | P2 | 현장 차등 | approved-auto | 10 |
| E18 | AX-P2 회귀(T-6 · F1) | P2 | 새 모양 케이스 | approved-auto | 15 |
| E19 | 공용 표 회귀 스위트(T-7) | P2 | verify 확장 | approved-auto | 17 |
| E20 | VALIDATION 낡음(S1 · T-8) | P2 | `/gsd-validate-phase`로 재작성 | approved-auto | VALIDATION |
| E21 | `submit_ip_hash` 보관(OV9) | P2 | 닫을 때 · Job에서 비움 | approved-auto | 17 · 12 |
| E22 | 받는 사람 0명(A7 · T-11 · OV12 일부) | P3 | 경고 로그 + 케이스 넷 + 체크리스트(막기는 안 함) | approved-auto | 10 · 13 |
| E24 | 취소 뒤 옛 메일(A5) | P3 | DECISIONS 한 줄(동작 변경 없음) | approved-auto | 17 |
| E25 · E26 · E27 · E28 · E29 | 대체 예고 · `throttled` · 설정 읽기 · 문의 전화 · 인덱스 주석 | P3 | 지시대로 | approved-auto | 02 · 03 · 04 · 15 · 16 · 10 |
| E30 · E31 · E32 · E40 | 수량 상한 · 로컬 E2E 범위 · 빈 E′2 · 설정 힌트 | P3 | 지시대로(E32는 SUMMARY 한 줄 안) | approved-auto | 17 · 13 · 15 |
| E33–E39 | db:reset · `document_create` · 경계 단위 · 인쇄 수량 · 16 verify · 17 작은 틈 · 새 멱등 키 | P3 | 지시대로 | approved-auto | 12 · 10 · 15 · 17 · 16 |
| R1 | OV11 칸 · 갈래 줄이기 | P3 | 채택 안 함(D-1104 어댑터 · 멱등 선례) | rejected | — |

Approval readiness: PASS — 자동 채택 근거 = 사용자 부재 시 기술 추천안 자동 결정(오케스트레이터 지시) · 사용자 결정 5915996637. 확인한 ID: E2–E4 · E10–E22 · E24–E40 · R1. 사용자 대기 6건(E1 · E5 · E6 · E7 · E8 · E9) — 플랜은 추천안으로 쓰되 Task 0에서 답을 읽고, 스키마에 걸리는 E1 · E5 · E6 · E7은 답 없이 웨이브 6을 시작하지 않는다.

## Completion summary

- Step 0: Scope Challenge — coarse 배치 유지(15 Task 1 최대 단위, 커밋 순서 유지). 범위 지적 E20 · E25 · E26
- Architecture Review: 13건(P1 1 · P2 9 · P3 3 — 제품 E1 · E5–E9 포함) — E1 · E5–E9 · E11–E13 · E21 · E22 · E27 · E28 (E23 · E24 포함 시 15)
- Code Quality Review: 5건(P2 1 · P3 4) — E14 · E30 · E31 · E32 · E40
- Test Review: 도표 작성(경로 49/66 · 74%, GAP 17) · 지적 14건(P1 1 · P2 6 · P3 7) — E3 · E15–E20 · E33–E39
- Performance Review: 2건(P2 1 · P3 1) — E10 · E29
- 실패 모드 · 운영: E2 · E4
- NOT in scope · What already exists: 작성
- TODOS.md: 새 항목 없음(`.planning/`은 다음 계획 세션이 반영)
- Failure modes: critical gap 3(E1 · E5 · E22)
- Outside voice: Opus 대체, in-host(Codex 금지 — CLAUDE.md). P1 4건 중 2건 유지(OV1 · OV4), 2건 P2로 조정(OV2 · OV3)
- Parallelization: 변경 없음 — 웨이브 6(12 · 15) → 7(10 · 14 · 16) → 8(13 · 17)
- Unresolved decisions: 6(E1 · E5 · E6 · E7 · E8 · E9)
- 합계: 원 51건 → 병합 · 판정 뒤 40건(P1 3 · P2 18 · P3 19) + 채택 안 함 1

## Read-back

- 저장 경로: `docs/designs/plant8-erp-phase04.3-eng-review-260930-newflow.md`(저장소에서 이 파일만 새로 만들었다 — `.planning/`은 건드리지 않음)
- 저장 뒤 파일 전체를 다시 읽어 확인한 것: 병합 ID E1–E40 · R1이 본문과 Decision ledger에 모두 있다 · 사용자 결정 5915996637 반영 문장 · 「다음 반영」의 플랜별 목록과 순서 ①~④ · `## GSTACK REVIEW REPORT`가 마지막 절이고 마지막 줄이 `**UNRESOLVED DECISIONS:**`의 마지막 항목이다.

## Suppressed findings 부록 (검토자 부록, 확신 ≤ 4)

- (A, 4/10) `listPrizeSummaries`가 파기된 제출도 셀지 미정 — 17은 「파기된 제출은 섹션에 없다」. 보존 기한 뒤 일이라 영향 작음.
- (A, 4/10) `domain/seed/index.ts` 시스템 관리자 루프가 배포마다 `certs.qr`를 다시 켠다 → 소유자가 꺼도 시스템 관리자가 모든 신청 알림을 받음. 개인정보 메뉴가 아니라 관례상 문제없을 수 있음.
- (A, 4/10) `certRrnPurgeTarget`의 원화 × 수량 비교를 `domain/money` 밖에 둔다(`quoteAmount` 선례). E5 답에 따라 인자 자체가 바뀔 수 있음.
- (A, 4/10) 새 경품 줄의 `sort_order` 배정 규칙(끝 + 1 · 붙여넣기 순서) 없음 — 수령자 목록 순서의 정본이라 한 줄 필요.
- (A, 3/10) `insertEventNotifications`를 domain이 리포지토리에서 바로 부름 — 둘째 사건 알림이 생기면 `domain/notify`로.
- (A, 4/10) `listPrizeSummaries`는 GROUP BY 한 쿼리로(N+1 방지).
- (A, 3/10) `cancelRequest` 신청자 판정이 `created_by`만 보고 `certs.events` 쓰기를 다시 보지 않음.
- (B, 4/10) `cert_winner.value`를 등록부에서 지우면 이미 시드된 DB의 노출표 행이 고아로 남을 수 있음(인용 불가).
- (B, 3/10) 신청 취소 뒤 옛 패널의 같은 요청 키 재전송이 새 행사를 만듦(결과 불명 창 안의 드문 경우).
- (B, 4/10) 누수 패턴이 RSC 숫자 인코딩 변형(`$n` · 지수 표기)을 덮는지 미확인 — E17의 현장 차등 대조군이 판정한다.
- (B A-2, 4/10)은 E12에 흡수했다.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Outside Review | Opus in-host(Codex 금지 — CLAUDE.md) | Independent 2nd opinion | 1 | issues_found | 12건 → 유지 10 · 등급 조정 2(OV2 · OV3) · 채택 안 함 1(OV11) · 병합 3 |
| Eng Review | `/plan-eng-review` | 새 흐름 개정 플랜 10 · 12–17 계획 게이트 | 1 | issues_open(user decisions pending) | 40 issues (P1 3 · P2 18 · P3 19), 3 critical gaps, 사용자 결정 6 |

**OUTSIDE COVERAGE:** Opus outside voice 1명이 주 검토와 독립으로 완료했다. P1 4건 중 OV1(→ E1, PRODUCT) · OV4(→ E2, TECH)는 유지, OV2 · OV3은 P2로 조정했다. Codex는 CLAUDE.md가 금지하므로 실행하지 않았고 재확인 항목도 두지 않는다.

**VERDICT:** ISSUES OPEN — eng review required. 기술 수정(TECH 33)을 계획에 반영하고, 사용자 결정 6건 가운데 스키마에 걸리는 E1 · E5 · E6 · E7의 답을 받은 뒤 Task 0 → plan-checker → 설계 `/cso` → 웨이브 6.

**UNRESOLVED DECISIONS:**
- E1: 대조에서 가짜로 판정된 제출을 처리할 길 — N13 (a) 유지 · (b) 「대조 제외 = 즉시 비움」(추천) · (c) 설계 `/cso`에 맡김. 웨이브 6 전 필요(스키마)
- E5: 5만원 이하 경품 여러 개(합 > 5만원) · 수량 모델 — (a) N3 (a) 유지 + 묶음 한 줄 운영 규칙(추천) · (b) 1인 최대 수량 칸 · (c) 수량 칸 폐지. (b) · (c)면 웨이브 6 전
- E6: 현장 사칭 · 당첨 수 — (a) `winner_count` + 같은 이름 표시 + 「택배 발송은 대조 뒤」(추천) · (b) 운영 한 줄 + 같은 이름 표시만 · (c) 지금대로. (a)면 웨이브 6 전
- E7: 가액 변경 이력 — (a) 끌 수 없는 `cert_prize_value` 로그(추천) · (b) 제출 때 가액 칸 · (c) 둘 다 · (d) 지금대로. (b) · (c)면 웨이브 6 전
- E8: 링크 열림 시작 — (a) N9 · N15 (a) 그대로 + 운영 한 줄 · (b) 당첨일 00:00 KST부터 열림(추천) · (c) (b) + 기본 24시간. 웨이브 6 전 권장
- E9: 닫은 뒤 과세 대상이 생긴 경우 — (a) 추가 링크 · (b) I4 대리 입력 · (c) 운영 절차 + 경고색 표시(추천)
