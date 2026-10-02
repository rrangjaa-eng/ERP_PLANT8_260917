# Phase 04.3 엔지니어링 리뷰 (plan-eng-review) — 2026-09-30

- 대상: `.planning/phases/04.3-qr-certificate-intake/` 새 플랜 **04.3-14**(개인정보 규정 반영, `risk: permissions`) · **04.3-15**(경품 가액, `risk: migration`) · **04.3-13 Task 1 개정**(마이그레이션 재생성 절차)
- 브랜치 `claude/trusting-brahmagupta-k08auz` · 플랜 커밋 `0bedc94` (merge-base origin/main `d6b3e40`) · PR #88
- 검토자 구성: A = Opus(15 + 13 Task 1) · B = Opus(14) · Outside Voice = Opus(14·15·13 diff 적대적 검토). **Codex는 CLAUDE.md §2·§4·§8이 금지하므로 Opus가 교차 검토를 대신한다.** 이번에는 「한도가 풀리면 Codex로 재확인」 항목을 두지 않는다.
- 판정·통합: 오케스트레이터(Opus). 세 검토자는 읽기 전용이었고 저장소 파일을 고치지 않았다.
- 결정 방식: **기술 수정은 자동 반영(사용자 부재). 사용자 수준 선택은 PR #88에 「[사용자 결정 요청]」 U1~U5로 올렸다.** 앞서 물은 D-A1 · D-A2 · D-B1 · D-B2(댓글 5907031518)는 다시 묻지 않았다. 플랜은 각 U의 추천안(a)으로 쓰고 Task 0 목록에 추가한다.
- 웨이브 5(10·11)는 이 리뷰의 영향이 없다. 영향은 웨이브 6(12·15)·7(14)·8(13)에 한정된다.

## 요약

| 검토자 | 대상 | P1 | P2 | P3 | 합계 |
|---|---|---|---|---|---|
| A (E4-A) | 15 + 13 Task 1 | 2 (A1 · A13) | 4 (A2 · A3 · A7 · A14) | 13 | 19 |
| B (E4-B) | 14 | 0 | 5 (B1 · B2 · B3 · B10 · B11) | 8 | 13 |
| Outside (OV) | 14 · 15 · 13 diff | 2 (OV1 · OV2) | 8 (OV3~OV10) | 8 (OV11~OV18) | 18 |
| 원 합계 | | 4 | 17 | 29 | 50 |
| 중복 제거 후 | | 4 | 13 | 28 | **45** |

중복 병합(5건): A1 ← A2 · OV6 (마이그레이션 재생성) / A3 = OV2 (수량) / A6 = OV1 (가액 미입력) / B1 = OV5 (인쇄 조회 기록). 병합 시 더 높은 등급을 택했다(A3 P2 + OV2 P1 → P1, A6 P3 + OV1 P1 → P1).

- P1 4건: **E4-A1**(13 Task 1, 진행 중인 머지에서 BASE 계산) · **E4-A13**(E2E 누수 검사가 빈 수집으로도 통과) · **OV1**(가액 미입력 행사가 주민번호를 영구 수집, U1) · **OV2**(당첨자별 수량을 판정이 모름, U2)
- 사용자 결정 5건: U1(OV1 + A6) · U2(OV2 + A3) · U3(B1 + OV5) · U4(OV4) · U5(B3)
- critical gap 후보 2건(테스트도 에러 처리도 없이 조용히 실패): E4-A13(누수 테스트가 아무것도 안 봐도 녹색) · OV1(실패가 눈에 띄지 않고 되돌릴 수 없음). 둘 다 계획 수정으로 닫힌다(OV1은 U1 답 뒤).
- Outside P1 2건 판정: OV1 **P1 유지**(사용자 결정) · OV2 **P1 유지**(사용자 결정).
- 설계 뼈대 평가(A): 판정 순수 함수 하나 · 수령자에게는 참/거짓만 · 제출 때 잠근 행사 행으로 재판정 · 가액 저장은 같은 행 잠금 아래 — 지금 코드와 잘 맞는다. 잠금 순서는 이미 「행사 행 → 자리 행」(`repositories/cert-winners.ts:60-66`)이고 공개 오류 경로는 허용 목록 방식(`lib/actions/handle-server-error.ts:33-47`)이라 가액이 오류 문구로 샐 틈이 구조적으로 없다.

판정: **계획 수정 반영 뒤 실행.** 14·15는 사용자 결정 U1~U5와 D-* 답 뒤, 웨이브 5(10·11)는 영향 없음.

## Step 0 — Scope Challenge

**A 범위 점검(15):** files_modified 31개 · 새 모듈 1(`prize-value.ts`) + 새 컴포넌트 1 + 새 테스트 파일 4로 8파일 기준을 넘는다. 세 태스크가 한 경로(tracer → 굳히기 → 관리 화면)이고 나누면 같은 마이그레이션·헬퍼를 두 웨이브가 건드린다. CLAUDE.md §4 coarse와 맞아 **지금 배치 유지**. 줄일 것은 E4-A8 · A9 수준. 새 인프라·동시성 방식 없음.
**B 범위 점검(14):** 파일 약 30개, 새 클래스·서비스 0(저장소 함수 1 · 순수 함수 1). 묶음은 사용자 결정 「①③④⑤는 플랜 하나」(decisions.md:11)로 고정. **축소 제안 없음(No issues found).**

**OV1 [P1] (confidence 8/10) `domain/certs/events.ts:404` · `:42-58` — 가액을 비운 채 행사가 열리고, 첫 제출이 들어오면 「null = 주민번호 받음」으로 굳는다**
- 인용: `if (head.status === "open") { const link = linkOf(decrypt(row.tokenEncrypted)); … }` — 열린 행사는 링크와 QR이 바로 생긴다. 만들기 입력 `createEventInputSchema` = name · wonOn · winners뿐(가액 칸 없음). 15는 가액을 I3 섹션에서만 넣고 `certRrnRequired(null) = true`, 제출 1건이면 잠근다(D-B2 a).
- 결과: QR부터 돌리고 가액을 늦게 넣거나 잊으면 5만원 이하 행사도 첫 제출로 주민번호 수집이 잠긴다. 사용자 결정 ② 「5만원 이하면 자동으로 숨긴다」와 보호법 제24조의2(불가피할 때만)에 어긋나는데 눈에 띄지 않는다. 테스트는 가액을 `db`로 미리 넣어 이 경로를 보지 않는다.
- A6(P3, 6/10, 15:59·64)이 같은 경로를 낮게 봤다. 합쳐 P1.
- 선택지 → **U1**: (a, 추천) I2 만들기에서 가액 필수 입력(15가 10 뒤라 가능) · (b) 가액 입력 전 QR·링크 숨김 · (c) 지금대로(SUMMARY 열린 질문).

**OV2 [P1] (7/10) `domain/certs/intake.ts:403` · `db/schema/cert-winners.ts:31,54` — 행사 하나에 가액 하나로는 당첨자별 수량을 반영하지 못한다**
- 인용: `prizeLine: \`${winner.prizeName} ${winner.quantity}개\`` · `quantity: integer("quantity").notNull()` + `cert_winners_quantity_check >= 1`. 개당 30,000원에 수량 2개 당첨자는 60,000원인데 판정은 「받지 않음」 → 원천징수에 필요한 번호를 못 받는다(되돌릴 수 없는 쪽 오류). 15 세무 확인 4(15:436)는 경품이 섞이는 경우만 다루고 수량은 다루지 않는다.
- A3(P2, 7/10, 15:59·436)과 동일. 선택지 → **U2**: (a, 추천) 칸을 「경품 1개 가액」으로 받고 서버가 자리별 `가액 × quantity`로 판정(verify는 잠근 자리 행의 `quantity`를 이미 가짐 — `intake.ts:360,403`) · (b) 「1인당 총액(수량 포함)」 한 값 + 라벨만 변경(코드 변화 없음, 세무 확인 4에 수량 줄).

**OV8 [P2] (7/10) — 과한 구현: 15 Task 2 ③이 v2 동의 문장을 고치지만 한 웨이브 뒤 14가 전부 다시 쓴다**
- 15 Task 2 ③(`consent-block.tsx` v2 요약·전문에서 주민번호 구절 삭제 + E2E 「`main` 안 `주민등록번호` 0개」)과 14 Task 3 ③·④(같은 파일을 v3 순수 함수로 교체, 같은 E2E 재수정). 둘 사이 배포 없음(같은 PR).
- 처분: 15 Task 2 ③ 삭제, 15 E2E는 주민번호 칸·막힘 이유 목록만. 15 `files_modified`에서 `consent-block.tsx` 제거.

**OV12 [P3] (5/10) — 공개 함수 다섯 × 모든 결과 갈래 누수 스윕은 과하다**
- `loadIntake`·`selectWinner`·`recheckWinnerLock` 결과 타입에는 가액 자리가 없다(`intake.ts:112-114,139-148,178-183`). 제안은 스윕을 verify·submit 갈래로 좁혀 약 20케이스를 줄이는 것. **채택 안 함** — 누수 보장은 사용자 보충 요구이고, E4-A13이 E2E를 강화하는 방향이라 통합 스윕은 줄이지 않는다.

**OV13 [P3] (5/10) — Task 0(사용자 답 읽기)이 웨이브 머지·DB 준비 뒤 실행자 안에 있다.** 서브에이전트에 GitHub MCP가 넘어가는지 미확인. 답이 없으면 웨이브가 닫히지 않는다. 처분: Task 0은 유지하고 오케스트레이터가 웨이브 6·7 시작 전에 결정 답을 먼저 확인한다는 한 줄.

## Step 1 — Architecture

### 15 · 13 Task 1 (검토자 A)

흐름(A):

```
[관리자 I3 (접수 중 + certs.events 쓰기 + 범위 + cert_winner.value 보임 — 04.3-10 editable)]
   │ setCertEventPrizeValueAction {eventId, prizeValueKrw|null}
   ▼
setEventPrizeValue ── tx ─► lockEventRow(FOR UPDATE)  ◄──────────────┐ 같은 행 잠금
   │                         ├ 닫힘? → closed                          │
   │                         ├ 제출 수 ≥ 1? → locked (D-B2 a)          │
   │                         ├ UPDATE prize_value_krw, updated_at      │
   │                         └ recordAction(document_update, fields만) │
   ▼                                                                   │
cert_events.prize_value_krw (bigint NULL, CHECK >= 0)                   │
   │  (서버 메모리 안에서만 — findEventByTokenHash/lockEventRow 전체 select)
   ▼                                                                   │
[수령자 /c/[token]]                                                     │
 E2 loadIntake ──► {open, eventName, rows, ...}   (가액 없음)           │
 E3 verifyLast4 ─ tx ─► lockEventRow ─► certRrnRequired(value) ─────────┤
      └► ok {…, rrnRequired: bool, proof}  ── 멱등 맵 r에도 bool만 저장   │
 E4 intake-flow: rrnRequired=false → RrnFields·막힘 이유·동의 문장 숨김  │
 제출 submitCertificateAction {…, rrnRequired, rrnFront6:"", rrnBack7:""}│
      ▼                                                                │
 submitCertificate                                                     │
   (b) 같은 키 재생 → saved                                             │
   (c) 잠금 전: envelope.rrnRequired ≠ certRrnRequired(event) → expiredProof
   (d) checkFields(판정): 받지 않음 + RRN 실림 → invalid[rrn]           │
   (e) 서명 업로드                                                       │
   (f) tx: lockEventRow ─► 다시 판정 ≠ → expiredProof ──────────────────┘
          insertSubmission(rrn_encrypted/masked = null | 암호문)
   ▼
[I4] rrnMasked null(파기 전) → 「받지 않음 · 경품 가액 5만원 이하」 · 전체 보기/RRN 정정 없음
[인쇄] RRN 칸 「—」
```

신뢰 경계: ① 수령자 → 공개 액션(`rrnRequired`는 주장일 뿐, 서버가 잠근 행으로 대조) ② 서버 → 수령자 응답(명시 필드만 조립, 행사 행을 펼치는 곳 없음) ③ 직원 → 가액 저장(04.3-10 editable 재사용).

**E4-A1 [P1] (8/10) `04.3-13-PLAN.md:115,119,131` — 충돌이 남은 머지 중에 `BASE=$(git merge-base HEAD origin/main)`을 계산하게 되어 있다**
- 인용: `:115` 「`db/migrations/` 아래의 충돌은 어느 쪽으로도 손으로 풀지 않는다 — ②가 디렉터리째 main 것으로 되돌린다」 · `:119` 「(b) 복원 — 기준은 … `BASE=$(git merge-base HEAD origin/main)`」 → 「`git ls-tree -r --name-only "$BASE"`에 **없는** 파일만 … 지운다」 · `:131` 「⑤ 커밋 둘: 머지 커밋 …, `chore(04.3): regenerate …`」
- 설명: main이 마이그레이션을 하나라도 더하면 `_journal.json`과 `meta/0021_snapshot.json`(add/add)이 반드시 충돌한다. 머지가 커밋되기 전 HEAD는 머지 전 머리라 `merge-base`가 옛 기준(d6b3e40)을 돌려주고, (b)가 main의 새 마이그레이션을 「BASE에 없는 파일」로 지운다. ⑤는 머지 커밋을 먼저 만들라 하지만 충돌이 풀리지 않으면 만들 수 없다. 13 verify node 스크립트는 사후에야 잡는다.
- 수정(기술, 자동 반영): ①에 「충돌이 `db/migrations/` 안에만 남으면 `git checkout MERGE_HEAD -- db/migrations` 후 `git ls-tree -r --name-only MERGE_HEAD -- db/migrations`에 없는 파일(이 브랜치 `*_cert_intake.sql`·스냅샷)을 지우고 머지 커밋」 · ② 첫 줄에 `git rev-parse -q --verify MERGE_HEAD`가 **실패**해야 한다는 가드 + `test "$BASE" = "$(git rev-parse origin/main)"`.

**E4-A2 [P2] (7/10) `04.3-15-PLAN.md:48,190,217`** — 15도 웨이브 첫 머지의 마이그레이션 충돌 해결 규칙이 없다(「머지가 끝났다」만). **OV6 [P2] (6/10)** — 14·12도 재생성 절차가 없다(14 precondition `pnpm db:reset:test` 성공에서 멈추고 실행자가 즉석 절차를 만들게 됨 — CLAUDE.md §4 「즉석 방법」 금지). 한 곳(13 Task 1)에 쓰고 15·12·14는 가리킨다. 기술 수정.

**E4-A3 → OV2 → U2**, **E4-A6 → OV1 → U1** (Step 0 참조).

**E4-A4 [P3] (7/10) `15:63,330` · `10:292`** — 10의 `editable`은 「접수 중 + 쓰기 권한 + `cert_winner.value` 보임」인데 15는 「접수 중 + 쓰기 + 범위」로 옮겨 적었다. 더 좁은 쪽(안전)이라 막을 이유는 없으나 테스트가 차이를 모르면 기대와 어긋난다. `cert_winner.value`만 끈 계급 → forbidden·DTO 키 없음 한 줄 문서화·테스트.
**E4-A5 [P3] (6/10) `15:385` · `record.ts:38`** — 가액 변경 로그가 끌 수 있는 `document_update`다. 15가 `record.ts`를 건드리면 같은 웨이브 12와 겹치므로 계획의 선택(받아들임)은 합리적. SUMMARY 「후속」에 「14(웨이브 7)가 끌 수 없는 종류로 옮길지 본다」 한 줄.
**OV14 [P3] (5/10) — 닫힌 행사의 가액을 아무도 못 본다.** 15 DTO 키는 editable일 때만 실린다. 5만원 초과 행사의 원천징수·지급명세서 때 확인할 곳이 없다. 처분: I3에서 닫힌 뒤에도 읽기 전용으로 보이게(권한 `cert_event.value` 가시성 그대로, 기술 수정).
**OV16 [P3] (6/10) `14 Task 0 ②`** — D-A1 (b)는 `lib/auth.ts:25` `session.updateAge`를 `60 * 5`로 바꾼다(지금 `60 * 60 * 24`). 인증 설정 변경이므로 (b)면 위험 경로 표시·`/cso` 입력·사용자 직접 머지에 넣는다.
**OV17 [P3] (4/10)** — 주민번호 없는 N 변형의 보관 근거가 법인 비용 증빙 보존(국세기본법 제85조의3①, 법인세법 제116조 — 미확인, 법무/세무)일 수 있고, 그러면 기산이 법인세 신고기한 쪽이라 12의 「다음 해 3월 1일」과 한 달 어긋날 수 있다. 13 세무 확인 목록으로.
**OV9 [P2] (6/10)** — 추첨 경품 10만원 이하는 지급명세서 제출 면제(소득세법 시행규칙 제97조, decisions.md 법령 대조)인데 15는 「5만원 초과 = 받음(R 변형)」이고 14 R 전문 7(14:390)은 세무서 제출을 「법령상 의무」로 고지한다. 사실과 다른 고지는 제22조③ 입증책임 위험. 13 사람 확인·세무 확인 목록에 명시(세무 답이 「면제」면 세 번째 변형 필요).

### 14 (검토자 B)

흐름 — I4 요청 한 번(D-A1 (a) 기준):

```
브라우저 ──GET /certs/submissions/{id} (RSC)──▶ page.tsx loadReview [React cache — 요청당 1회]
  │                                            ├─ assertCertFeatureEnabled ── 꺼짐 → 404
  │                                            ├─ requireSession / getSessionId ── 없음 → /login
  │                                            ├─ touchPrivacySession(viewer, sid, now=앱 시계)
  │                                            │    ├─ 대표 / 메뉴 보기 없음 → notAllowed → 404 (RB-5)
  │                                            │    ├─ idle = getSettingValue(10~30) (옛 값 31~120 → ZodError → 500, T-310 수용)
  │                                            │    ├─ 기준 = lastSeenAt ?? loginAt(sessions.created_at)
  │                                            │    ├─ now − 기준 > idle → DELETE sessions(cascade) → expired → /login
  │                                            │    └─ upsert lastSeen(FOR KEY SHARE) ── 0행 → expired
  │                                            └─ getSubmissionForReview(viewer, id, { ip: clientIp(headers) })
  │                                                 ├─ 투영 빔 → notFound (cert_view 0줄)
  │                                                 └─ recordAction(cert_view {ip, submissionId}) ── 던지면 500(fail-closed)
  ├─ 「전체 보기」 → revealCertRrnAction: touch → revealRrn(tx: 잠금 → mask_reveal → 복호화)
  ├─ 「저장」   → correctCertSubmissionAction: … → correctSubmission(tx: UPDATE → cert_correct)
  └─ 클라이언트: 평문 열림 → 무입력 3분(고정) → hideRrn · visibilitychange hidden → 즉시
```

**E4-B1 [P2] (8/10) `14:424` · `11:105` — 인쇄 라우트가 조회 접속기록을 우회한다 → U3**
- 인용: 14:424 「인쇄 라우트 열람 기록(`cert_view`는 I4만 — 결정 ⑤ 범위) — 04.3-13 `/cso` 열린 질문 「인쇄 열람 로그」 그대로」 · 11:105 「이름·연락처·주소는 I4와 같은 권한 뒤에서 보이며 인쇄 자체의 행동 로그는 두지 않는다 — I4 열람도 로그가 없는 것과 같은 층위.」
- 11의 「로그 없음」 근거(I4도 로그 없음)를 14가 뒤집는다. `/print/certs/{id}` 직접 열기로 T-04.3-302(Repudiation)가 기록 없이 뚫린다. **OV5 [P2] (7/10)**가 같은 지적 + I3 당첨자 명단(전체 전화번호, `events.ts` winners 투영)·명단 편집 로그(끌 수 있는 `document_update`, IP 없음 — 10:182)를 더했고, 제8조② 월 1회 점검(기한 2026-10-30)을 행동 로그 화면의 `cert_view`·IP 필터로 할 수 있는지는 미확인이라 했다.
- 선택지 → **U3**: (a, 추천) `getCertificatePrint`도 `cert_view {ip, submissionId, via:"print"}`, 기록 실패면 인쇄 안 열림(fail-closed) · (b) `/cso`로 넘김. 당첨자 목록·당첨자 수정 로그는 어느 쪽이든 `/cso` 항목.

**E4-B2 [P2] (7/10) `page.tsx:26-28` · `link.md:298,302` — I4 렌더는 GET 부작용 둘(조회 기록·세션 삭제)을 가진다. 「제출 내용」 링크는 미리 가져오기를 무조건 끈다**
- 인용: `const touched = await touchPrivacySession(viewer, sessionId); if (touched.kind === "notAllowed") notFound(); if (touched.kind === "expired") redirect("/login");` · link.md:298 「Prefetching happens when a <Link /> component enters the user's viewport … Prefetching is only enabled in production.」
- 지금은 이 경로에 `loading.tsx`가 없어 미리 가져오기가 page를 렌더하지 않을 가능성이 높다. 누가 `loading.tsx`나 `prefetch`를 바꾸면 I3에서 링크가 보이기만 해도 `cert_view`가 줄 수만큼 생기고 첫 접근 판정이 ERP 세션 전체를 지운다. 14 Task 1 ⑤는 E2E가 빨개질 때만 조건부로 고친다.
- 수정(기술): 10이 만든 「제출 내용」 링크(PC 행동 셀 · 폰 `RowSheet` 두 자리)에 **무조건** `prefetch={false}`(주석 한 줄). 수용 기준에 `grep -n 'prefetch={false}'` 1줄 이상. E2E(B11)는 회귀 고정용.

**E4-B3 [P2] (7/10) `login-form.tsx:38` · `login/page.tsx:14` — 첫 접근 판정으로 끊기면 이유 없이 `/login`, 재로그인 뒤 `/account`에 떨어진다 → U5**
- 인용: `router.push("/account");` · `const passwordChanged = params.reason === "password-changed";`(이유 줄은 비밀번호 변경 하나뿐). D-A1 (a)에서는 30분 넘게 다른 화면만 쓰다 I3 「제출 내용」을 처음 누를 때마다 세션이 끊겨 이 플랜 뒤 가장 흔한 경로가 된다.
- 선택지 → **U5**: (a, 추천) 로그인 화면 이유 한 줄 「개인정보 화면 · 다시 로그인」 + `next=` 되돌아가기(같은 출처, `/certs/submissions/`·`/print/certs/` 접두어 허용 목록만, 열린 리디렉션 금지 — `login-form.tsx` 변경 · `/cso` 입력) · (b) 이유 줄만(`redirect("/login?reason=privacy-session")` + `role="status"` 한 줄, `login/page.tsx` 한 파일) · (c) 지금대로. 로그인 화면 파일이 `domain/auth`면 위험 경로임을 명시.

**OV4 [P2] (7/10) `rrn-field.tsx:173-194` · `page.tsx:79` — 14가 클라이언트 idle 타이머를 없애면 개인정보가 떠 있는 I4가 30분 넘게 화면에 남는다 → U4**
- I4 클라이언트가 서버의 비활동 분을 받는 곳은 `useRrnAutoHide(onChange, idleMinutes)` 하나였다. 14 Task 2 ④는 3분 고정으로 바꾸고 prop 사슬을 지운다(수용 기준 `grep -rn "idleMinutes" app/(app)/certs/submissions/[id]` 빈 출력). 서버 판정은 다음 요청 때만 돈다. 이름·연락처·주소·서명·가린 번호가 화면에 그대로 남는다(안전성 확보조치 기준 제6조④ 취지 — 법 해석은 미확인).
- 선택지 → **U4**: (a, 추천) I4·인쇄 화면이 idle 한도 동안 무입력이면 클라이언트가 `/login`으로 보낸다(서버 판정은 그대로, 평문 3분 가림은 따로, E2E `page.clock` 1케이스, 수용 기준의 빈 출력 grep 제거) · (b) 서버 판정만(다음 요청 때 끊김).

**E4-B4 [P3] (7/10) `review-form.tsx:215-218,302`** — `router.refresh()`는 page RSC를 다시 렌더해 `cert_view`가 한 줄 더 생기고(옳음), 브라우저 뒤로 가기는 클라이언트 캐시라 기록이 없다. truth 「열 때마다」 와 어긋나 보인다. must_haves:57에 「조회 한 번 = I4 page RSC가 서버에서 렌더된 한 번(`router.refresh` 포함 +1, 클라이언트 캐시 복원 0)」.
**E4-B5 [P3] (6/10) `repositories/privacy-session-activity.ts:27`** — ``sql<Date>`${at.toISOString()}::timestamptz` ``는 DB 세션 `TimeZone`에 기대는 캐스트다(컬럼은 시간대 없는 `timestamp`, 선례 `notifications.ts:210` `::timestamp`). DB가 UTC가 아니면 처음 쓴 활동 행만 +9시간이 되어 비활동 판정이 9시간 무력화된다. Cloud SQL은 플래그가 없어 UTC(`deploy.sh:220`)라 잠재 결함. `::timestamp`로, 통합 ⒜ 단언을 `lastSeenAt.getTime() === now.getTime()`으로.
**OV3 [P2] (8/10) `review.ts:368` · `review-form.tsx:101` · `page.tsx:69`** — 주민번호 없는 확인증을 정정하면 `rrnMasked: patch.rrnMasked ?? row.rrnMasked ?? ""`가 ""를 돌려 I4가 「받지 않음」에서 빈 칸으로 바뀐다(page도 `?? ""`). 15 Task 2 ⑤에 `CorrectSubmissionResult.saved.rrnMasked: string | null` · page가 null을 그대로 넘김 · E2E 「받지 않은 확인증에서 이름 정정 뒤에도 `받지 않음 · …` 줄·전체 보기 없음」.

확인했고 문제없음(B): 시계 출처(better-auth `createdAt: new Date()`, now·lastSeenAt도 앱 시계) · better-auth 갱신은 `updated_at`·`expires_at`만 고쳐 `created_at`은 로그인 시각 유지 · `cookieCache` 없음(`lib/auth.ts:40`) · IP는 Cloud Run이 마지막 항목을 붙임(T-04.3-306 수용) · v2 → v3 삭제 안전(`origin/main`에 `0021_cert_intake.sql` 이력 없음).

## Step 2 — Code Quality

**E4-A7 [P2] (8/10) `15:213,220` · `db/migrations/0021_cert_intake.sql`** — 재생성 diff 기준 「세 곳뿐」이 CHECK 위치에 따라 틀린다. 지금 SQL 끝은 `CONSTRAINT "cert_events_closed_reason_check" CHECK (…)` 뒤 쉼표 없이 `);`. 새 CHECK를 배열 끝에 두면 앞 제약 줄에 쉼표가 붙어 diff가 네 곳이 된다. 수정: CHECK를 `db/schema/cert-events.ts:31-37` 배열에서 `cert_events_closed_reason_check` **앞**에 두고, 칸은 `updatedAt` 뒤(제약 앞)에 둔다고 명시.
**E4-A8 [P3] (8/10) `15:331` · `events.ts:206,249,319`** — `prizeValueLocked`는 이미 있는 `submittedCount`와 같은 정보(파기 뒤에도 남음 — `count(submitted_at)`). DTO 새 키 제거, 화면은 `submittedCount > 0`. 저장 액션 안의 셈(잠근 tx)은 정본으로 유지.
**E4-A9 [P3] (8/10) `repositories/cert-events.ts:82-119`** — `listEventSummaries`는 명시 컬럼 select라 가액 읽는 자리가 빠졌다. `CertEventSummaryRow`·select에 `prizeValueKrw` 추가, `toListDto`(`events.ts:305-323`)는 명시 필드라 목록 DTO에 안 실림, 상세는 editable일 때만 `detail.prizeValueKrw`.
**E4-A10 [P3] (6/10) `15:335,423-425`** — `parsePrizeValueInput`이 `{ ok:false }`면 `.value`가 없어 판정 줄·저장 상태가 미정, 서버 `invalid`·`forbidden`·`notFound` 결과 문장도 없다. 카피 계약에 한 줄(`금액 상한 초과 · 999,999,999,999원 이하`(`domain/money/index.ts:122`) · `저장 실패 · 다시 시도`).
**E4-A11 [P3] (9/10) `15:200`** — 잘못된 참조. 실제 위치는 `.continue-here.md:44`(커밋 `da6a724`).
**E4-A12 [P3] (6/10, 선택) `15:395` · `db/schema/cert-submissions.ts:23-24`** — 「두 RRN 칸은 함께 null이거나 함께 있다」를 테스트로만 지킨다. 어차피 재생성하므로 `cert_submissions_rrn_pair_check` CHECK 한 줄이 싸다(E4-A7 배치 규칙). 과하면 생략.
**E4-B6 [P3] (9/10) `review.ts:100`** — `GetSubmissionForReviewDeps = { signatureStore }`에 로그 주입 자리가 없어 플랜 문장대로면 타입 오류. `appendActionLog: RecordActionDeps["appendActionLog"]` 추가(`RevealRrnDeps` 꼴).
**E4-B7 [P3] (6/10) `cert-review.spec.ts:120`** — RSC props 검사 도우미 식별 prop을 `submissionId`로만 두면 `RrnField`(`rrn-field.tsx:40`)와 겹친다. ReviewForm에만 있는 `signatureDataUrl`(과 `submissionId`).
**E4-B8 [P3] (8/10) `14:288`** — 「조문 열하나」라 쓰고 목록은 12개. 「열둘」로, 배열을 테스트에 두고 각각 `toContain`(개수 단언 없음).
**E4-B9 [P3] (6/10) `14:262`** — 위험 경로 diff 검사 `git diff --name-only <base>..HEAD -- domain/auth domain/permissions`가 웨이브 중 `origin/main` 머지로 들어온 남의 변경에 거짓 빨강. `git log --first-parent --no-merges --format=%H <base>..HEAD -- …` 기준으로.
**OV7 [P2] (9/10) `13:39,215`** — 13이 Codex(GPT) 디자인 검토를 must_haves truth와 Post-build에 지시한다(「`codex` 스킬 Codex(GPT) 디자인 검토 … 계획을 다시 검토할 때도 Codex 검토를 넣는다」). CLAUDE.md §2·§4·§8 금지. 이번 diff에서 새로 생긴 문장은 아니나 must_haves로 남아 있다. 지운다(12의 「Codex 대신 Opus, 한도 풀리면 Codex 재확인」 12:410도 같은 이유). 충돌 확인은 사용자에게 한 줄.
**OV11 [P3] (8/10) `review.ts:213-221`** — `recordRrnReopen`이 `!row || row.purgedAt`만 보고 `rrnMasked`·`rrnEncrypted`는 안 본다. 주민번호 없는 확인증에 직접 POST하면 가짜 `mask_reveal`이 남는다. `!row.rrnMasked`면 기록 안 함(denied) + 통합 케이스(로그 0줄).
**OV18 [P3] (9/10) `12:99`** — 「04.3-13은 웨이브 7」이 낡았다(13은 웨이브 8). GSD 개정으로만 고친다.

## Step 3 — Tests

**E4-A13 [P1] (7/10) `15:231,276,325` — E2E 누수 검사가 아무것도 모으지 못해도 통과한다**
- 인용: `:231` 「E2E는 `page.on("response")`로 같은 출처의 텍스트 응답(문서 · `text/x-component` RSC · 서버 액션 POST 응답 · JSON)을 모두 모으고 마지막에 `document.documentElement.outerHTML`도 더해 검사한다」
- 문제: (1) `await response.text()`가 비동기라 검사 시점에 안 끝난 본문이 빠질 수 있고 (2) 리다이렉트·탐색으로 버려진 본문은 `text()`가 던지는데 흔히 `catch`로 삼키며 (3) 모인 것을 확인하지 않아 수집 0건이어도 「패턴 0건」으로 통과한다. 사용자 보충의 핵심 테스트다. 저장소에 본문 누수 E2E 선례가 없다(`fonts.spec.ts:39` 바이트 합계 · `leave-list.spec.ts:631` 개수뿐).
- 수정(기술): 본문 읽기 약속을 배열에 모아 검사 직전 `Promise.all`, 대상 content-type(`text/html`·`text/x-component`·`application/json`)인데 못 읽으면 **실패** · **양성 대조군**: 말뭉치에 문서 ≥1, `next-action` POST ≥3(select·verify·submit), 문자열 `"rrnRequired":false`(49,731 행사)/`"rrnRequired":true`(73,519 행사) 포함 · **차등 대조군**: 가액 null 행사로 같은 스캔 0건 · 통합 누수 검사(`:271`)에도 verify ok JSON의 `"rrnRequired":false` 양성 단언. (OV12의 통합 스윕 축소는 채택 안 함.)

**E4-A14 [P2] (7/10) `15:230` · `test/unit/certs/public-route-boundary.test.ts:4-8`** — 「`app/c/` 어디에도 가액 이름이 들어오지 않는다」가 주장뿐이다. 기존 정적 경계 테스트에 `app/c/**`의 `prize-value` import·`prizeValue`·`prize_value`·`가액` 0건, `domain/certs/intake.ts` 반환 리터럴에 `prizeValue` 없음 단언(`certRrnRequired`는 허용).
**E4-A15 [P3] (8/10) `15:244` · `intake.ts:254-261,290`** — Task 1 verify가 `cert-verify.test.ts`·`verify-last4.test.ts`를 안 돌린다(`storedOkSchema`·`replayEntry`를 바꾸는데). 목록에 추가 + 옛 모양(키 `rrnRequired` 없음) 멱등 항목 재생 → expiredProof 한 줄.
**E4-A16 [P3] (8/10) `15:240`** — 적용된 DB에서 CHECK를 확인하지 않는다(`information_schema.columns`만). `pg_constraint`에서 `cert_events_prize_value_krw_check` 1행 조건 추가(15·13 둘 다, A12를 받으면 그 이름도).
**E4-A17 [P3] (5/10) `15:231`** — 경계 패턴 `49731`/`49,731`이 `/_next/static/chunks/<숫자>-<해시>.js` 같은 빌드 산출물에 우연히 걸리면 CI가 결정적으로 빨갛다(확인 필요). 차등 대조군으로 판별하고 말뭉치에서 `/_next/static/[^"' )]+`를 지운 뒤 검사.
**E4-A19 [P3] (7/10) `15:220,249` · `test/unit/db/migration-journal.test.ts:26-58`** — 15의 번호·`prevId` 체인 확인이 SUMMARY 수기다(journal 단위 테스트는 idx·tag·when·파일 존재만). 13 Task 1 verify 넷째 node 명령(okFiles·okJ·okChain·okBody)을 그대로 재사용.
**E4-B10 [P2] (9/10) `test/integration/cert-review.test.ts:415-491` — REGRESSION RULE: 뒤집히는 기존 케이스와 새 경계가 플랜에 없다**
- 새 규칙에서 빨개지는 것: `:415` 「활동 행 없음 + 로그인 119분 전 → ok」(→ expired) · `:424` 「(E3-10) 로그인 3시간 뒤 첫 방문 → ok」(→ expired, E3-10 폐기) · `:447` 「마지막 활동 119분 전(설정 120) → ok · 121분 → 만료」 · `:463` 「정확히 120분 전 → ok(R-L6)」 · `:69` `expect(result.idleMinutes).toBe(120)` · E2E `cert-review.spec.ts:281`·`:434 page.clock.fastForward("02:00:05")`.
- 수정(기술): 「의도된 차이」로 **고쳐 쓴다**(지우지 않는다: 29분 → ok · 3시간 뒤 → expired+세션 삭제 · 29/31분 · 정확히 30분 → ok, `:69`는 삭제) + 첫 접근 경계 ⒢(로그인 정확히 30분 전·활동 없음 → ok, 30분 + 1ms → expired, `>` 비교).
**E4-B11 [P2] (8/10) `14:188`** — 「링크 위에 머무는 동안 0줄」 E2E가 미리 가져오기가 실제로 일어나는 때(링크가 화면에 들어올 때)를 재지 않는다. 기준 개수는 **I3로 가기 전**에 재고, I3 열기 · `networkidle` · 표를 끝까지 스크롤 · 링크 hover 1초 → 여전히 0줄 → 누르면 1줄. `CI=true`(프로덕션 빌드)에서만 뜻이 있다.
**E4-B12 [P3] (7/10) `cert-review.spec.ts:77-82`** — `sessionIdsOf(account)`가 그 계정의 **모든** 세션을 돌려줘 공유 `admin`을 쓰면 앞 테스트 세션까지 3시간 전으로 돌린다. 「긴 실행」은 새 픽스처 계정(`createFixtureUser`) · A 로그인 직후 A의 id 확보 · B 로그인 · 끝에 A 세션 없음/B 있음 단언. 「31분 첫 접근 → 로그인 화면」에 그 확인증 `cert_view` 0줄 단언.
**E4-B13 [P3] (6/10) `review.ts:156-157`** — `Object.keys(submission).length === 0 → notFound` 갈래(메뉴 보기 있음 + 정보 항목 꺼짐)가 14:187의 0줄 목록에 없다. 추가.
**OV10 [P2] (5/10) `intake.ts:283-296`** — 「확인 → 같은 키 재전송 → 그사이 가액 변경 → 재생이 옛 판정 → 제출 `expiredProof` → 새 키 확인은 새 판정」 경로가 통합 테스트에 없다(클라이언트는 확정 결과면 새 키 — `intake-flow.tsx:390-392`). 15 Task 2 경합 케이스에 한 줄.
**OV15 [P3] (5/10)** — 재생성 뒤 개발 DB `erp`는 새 `when`으로 0021 재적용을 시도해 `/qa`(로컬 dev)에서 깨질 수 있다(동작 세부 미확인). 13 Post-build 앞에 `pnpm db:dev` 재적용 한 줄.

E2E 안정성(A): 새 스펙은 `certs` 프로젝트·워커 1·`serial`·이름이 겹치지 않는 행사라 기존 규약 C4와 같고, I4·인쇄 테스트마다 새 로그인(15:280)은 14의 30분 한도를 미리 고려해 좋다. TDD 순서(Task 1 ① RED → 스키마 → 마이그레이션 → 구현)는 맞다.

## Step 4 — Performance

- 확인·제출: 쿼리 수 변화 없음. 가액은 이미 가져오는 행사 행 전체(`repositories/cert-winners.ts:73` `for("update")`, `repositories/cert-events.ts:33`)에 실린다. 판정은 비교 한 번. 상세 I3는 A8·A9대로면 추가 쿼리 0.
- 14의 I4 한 번: `cert_view` INSERT +1(설정 조회를 건너뛰는 끌 수 없는 종류 — `record.ts:155`), `idleMinutes` 설정 조회 −1(`review.ts:164`), `findPrivacyLastSeen` → `findPrivacySessionClock`은 PK 조인 한 번으로 왕복 수 동일. 순증 0 왕복 · 쓰기 +1. 30명 규모의 `action_log` 증가는 무시 가능. 14: **No issues found.**
- **E4-A18 [P3] (6/10) `15:231`** — E2E가 모든 응답 본문을 읽으면 JS·CSS·폰트까지 수 MB를 메모리에 올린다. content-type으로 먼저 거른다(E4-A13에 포함).
- 참고(발견 아님, B): `requireSession`과 `getSessionId`가 `auth.api.getSession`을 두 번 부르는 것은 04.3-07부터의 것(`lib/viewer.ts:67-70`), 범위 밖.

## 테스트 커버리지 다이어그램

14(B):

```
CODE PATHS                                              USER FLOWS
[+] domain/certs/review.ts getSubmissionForReview       [+] I4 열기
  ├── [★★★ 계획] ok → cert_view{ip,submissionId}          ├── [★★ 계획] 처음 1줄 · 새로 고침 2줄 · IP — cert-review.spec
  ├── [★★ 계획] 게이트·대표·권한·uuid·없음·파기 → 0줄      ├── [GAP→B11] I3 로드 · 스크롤 시 미리 가져오기 0줄 [→E2E]
  ├── [GAP→B13] 투영 빔 → 0줄                            └── [GAP→B12] 첫 접근 막힘 → cert_view 0줄
  └── [★★ 계획] 로그 던짐 → 던짐 · 데이터 없음(fail-closed)
[+] domain/certs/privacy-session.ts touchPrivacySession  [+] 개인정보 세션
  ├── [★★ 계획] ⒜~⒡                                      ├── [★★ 계획] 로그인 31분 뒤 첫 접근 → /login [→E2E]
  ├── [GAP→B10] 첫 접근 경계 30분 / 30분+1ms               ├── [★★ 계획] 긴 실행(세션 단위) [→E2E]
  ├── [GAP→B10] 뒤집히는 기존 4케이스 의도 표기             └── [★★ 계획] 활동 31분 전 → /login
  └── [★★★ 있음] 세션 삭제 경합 → expired(R-L3)
[+] revealRrn / recordRrnReopen / correctSubmission      [+] 평문 3분 가림
  └── [★★ 계획] detail {ip, submissionId}(+fields) · 평문 없음 ├── [★★★ 계획] 2:55 남음 · 3:05 가림 · 입력으로 재시작 (page.clock)
[+] domain/certs/consent.ts 안내 함수(순수)               [+] E4 수집 안내
  └── [★★★ 계획] 네 변형 전문 고정 · 금지어 · 조문(B8 개수)   └── [★★ 계획] 라벨 · 막힘 이유 · 전문 문의 줄 · 5만원 이하 0글자
[+] settings cert.privacy.idle_minutes
  └── [★★★ 계획] 기본 30 · 10/30 받음 · 9/31/120 거부 · 힌트

COVERAGE(계획 반영 뒤): 경로 17 중 13 계획됨 · GAP 4(B10×2 · B11 · B12/B13)
```

15(A, 요약):

```
[+] 판정/스키마                       [+] 수령자 E3~E4                     [+] 관리 I3
  ├ certRrnRequired(null/≤50000/>)    ├ verify ok rrnRequired bool          ├ editable 판정(10) · forbidden
  ├ CHECK >= 0 (pg_constraint A16)    ├ 제출 재판정 (c)(f) expiredProof      ├ 제출 ≥1 → locked (같은 행 잠금)
  └ 재생성 diff(A7) · 체인(A19)       ├ [GAP→OV10] 같은 키 재생 · 가액 변경  ├ [GAP→A10] 잘못된 입력·서버 결과 문구
                                      ├ [GAP→A13] E2E 누수 스캔 양성 대조     └ [GAP→OV14] 닫힌 행사 읽기 전용
                                      ├ [GAP→A14] app/c/** 정적 경계
                                      └ [GAP→OV3/OV11] 받지 않음 정정 · 재개 기록
```

## 실패 모드 표

| # | 새 경로 / 통합 | 현실적 실패 | 계획이 막는가 | 테스트 | 사용자가 보는 것 |
|---|---|---|---|---|---|
| 1 | 확인과 제출 사이 가액 변경 | 옛 판정 화면으로 제출 | 예 — (c)·(f) 재판정 → expiredProof | 통합 경합 둘 | E3로 돌아가 4자리 다시(「확인 시간 지남」 문구가 약간 어긋남) |
| 2 | 확인 멱등 재생 | 저장된 옛 `rrnRequired` 재생 | 제출에서 걸러짐 | 없음 → OV10 | 위와 같음 |
| 3 | 꾸민 `rrnRequired:false`(받는 행사) | RRN 없이 저장 | 예 — 불일치 → expiredProof | 통합 | 없음 |
| 4 | 가액 저장 vs 첫 제출 동시 | 잠김 판정 어긋남 | 예 — 같은 행 FOR UPDATE | 통합 번갈아 열기 | `제출 있음 · 저장 안 됨` |
| 5 | 수령자 응답에 가액 | 개인정보 정책 위반 | 구조상 막힘 + 테스트 | 통합 JSON · E2E — **A13: 빈 검사로 통과 가능** | 없음 |
| 6 | main이 새 마이그레이션을 가진 채 머지 | BASE를 옛 기준으로 계산 → main 마이그레이션 삭제 | **아니오(A1·A2·OV6)** | 13 verify(사후) | 없음(늦게 발견) |
| 7 | 재생성 뒤 개발 DB `erp` | 새 `when`으로 0021 재적용 시도 | SUMMARY 한 줄 → OV15 | — | 개발자 로컬 |
| 8 | QR 배포 전 가액 미입력 | null = RRN 받음 → 첫 제출 뒤 잠김 | **아니오(OV1)** | 없음 | 없음(조용한 영구 수집) → U1 |
| 9 | 수량 2개 이상 당첨자 | 합계 > 5만원인데 RRN 숨김 | **아니오(OV2)** | — | 세무 신고 불가 가능 → U2 |
| 10 | `cert_view` 쓰기 | `action_log` INSERT 실패 | 던짐 → I4 안 열림(fail-closed) | 통합(주입) | 오류 화면 — 데이터 없음 |
| 11 | I3 링크 미리 가져오기 | 나중에 `loading.tsx`/`prefetch` 변경 → 조회 기록 · **세션 삭제** | 조건부 | E2E 측정창 오류 | B2·B11 — 무조건 끄기 + 측정 고침 |
| 12 | 활동 시각 캐스트 | DB `TimeZone` ≠ UTC | 없음 | 없음 | B5 — 비활동 판정 9시간 무력화 |
| 13 | 인쇄 직접 열기 | 조회 기록 없이 개인정보 열람 | 열린 항목으로 넘김 | 없음 | B1·OV5 → U3 |
| 14 | 첫 접근 막힘 | 로그인 30분 뒤 첫 I4 | 세션 삭제 → `/login` | 통합 · E2E | B3 — 이유 없음 · `/account` 착지 → U5 |
| 15 | I4 화면 방치 | 30분 넘게 개인정보 화면 유지 | 서버 판정은 다음 요청 때만 | 없음 | OV4 → U4 |
| 16 | 긴 CI 실행 | 공유 `admin` 세션까지 되돌림 | 테스트마다 새 로그인 | E2E 「긴 실행」 | B12로 단언 보강 |

critical gap(테스트도 에러 처리도 없이 조용히 실패): **2건 후보** — #5 E2E 누수 검사의 빈 수집 통과(E4-A13), #8 가액 미입력 영구 수집(OV1). #6은 사후 verify가 잡으므로 critical에서 뺐다.

## Decision ledger

| ID | Finding | 등급 | 처분 | State | 반영 |
|---|---|---|---|---|---|
| D-A1 · D-A2 · D-B1 · D-B2 | 앞서 사용자에게 물은 결정(PR #88 댓글 5907031518) | — | 재질문 안 함. D-B2 (a) = 가액 미입력 = 주민번호 수집 + 첫 제출 뒤 잠금 | pending-user | 14·15 Task 0 |
| U1 | OV1 + E4-A6 가액 미입력 행사 | P1 | 플랜은 (a) 추천안으로 작성 | pending-user | 15 |
| U2 | OV2 + E4-A3 당첨자별 수량 | P1 | 플랜은 (a) 추천안 | pending-user | 15 |
| U3 | E4-B1 + OV5 인쇄 조회 기록 | P2 | 플랜은 (a) 추천안. 당첨자 목록(전화 전체)·수정 로그는 `/cso` | pending-user | 14 |
| U4 | OV4 I4 클라이언트 idle | P2 | 플랜은 (a) 추천안 | pending-user | 14 |
| U5 | E4-B3 재로그인 착지·이유 줄 | P2 | 플랜은 (a) 추천안(`login` 파일이 위험 경로면 명시) | pending-user | 14 |
| OV9 · OV17 | 세무 확인(5만~10만원 면제 구간 안내 문구 · N 변형 보존 근거·기산) | P2·P3 | 13 사람 확인·세무 확인 목록에 추가 | approved-auto | 13 |
| OV14 | 닫힌 행사의 가액 | P3 | I3에서 닫힌 뒤에도 읽기 전용(권한 `cert_event.value` 그대로) | approved-auto | 15 |
| E4-A1 · A2 · OV6 | 마이그레이션 재생성 머지 경계 | P1 | `MERGE_HEAD` 절차 + 가드 | approved-auto | 13 Task 1 · 15 전제 · 12·14 한 줄 |
| E4-A13 | E2E 누수 스캔 빈 통과 | P1 | 본문 읽기·양성/차등 대조 | approved-auto | 15 (통합 누수에도 양성 단언) |
| E4-A7 | CHECK 위치 | P2 | closed_reason_check 앞에 배치 | approved-auto | 15 |
| E4-A14 | `app/c/**` 정적 경계 | P2 | 경계 테스트 단언 추가 | approved-auto | 15 |
| E4-A8 · A9 · A4 · A15 · A16 · A19 · A11 | `submittedCount` 재사용 · select 위치 · editable 문서화 · verify 목록 · `pg_constraint` · node 체인 · 참조 | P3 | 지시대로 반영 | approved-auto | 15 (13 일부) |
| E4-A5 · A10 · A12 · A17 · A18 | 문구·선택 P3 | P3 | 리뷰어 추천대로 문구 반영(A12는 선택) | approved-auto | 15 |
| E4-B2 · B11 · B4 | 링크 prefetch · 측정 시점 · 「조회 한 번」 정의 | P2·P3 | 지시대로 반영 | approved-auto | 14 |
| E4-B10 | 뒤집히는 기존 케이스 + 첫 접근 경계 | P2 | 고쳐 쓴다 명시 + ⒢ 경계 | approved-auto | 14 |
| E4-B5 · B6 · B7 · B8 · B9 · B12 · B13 | 캐스트 · deps 타입 · RSC 식별 prop · 조문 12 · 위험 경로 diff 기준 · 긴 실행 · 투영 빔 | P3 | 지시대로 반영 | approved-auto | 14 |
| OV3 | 정정 뒤 null → "" | P2 | null 유지 · 「받지 않음」 표시 | approved-auto | 15 Task 2 ⑤ |
| OV7 | 13의 Codex 문장 | P2 | 제거(CLAUDE.md 금지) | approved-auto | 13 (39·215행 근처) |
| OV8 | 15 Task 2 ③ v2 문장 수정 | P2 | 삭제 | approved-auto | 15 |
| OV10 · OV11 | 재생 경로 테스트 · 주민번호 없는 재개 기록 | P2·P3 | 지시대로 반영 | approved-auto | 15 |
| OV12 | 통합 스윕 축소 | P3 | **채택 안 함**(A13과 같은 방향 유지) | rejected | — |
| OV13 · OV15 · OV16 · OV18 | 결정 답 사전 확인 · 개발 DB 재설정 · (b)면 위험 경로 · 12의 웨이브 문장 | P3 | 한 줄씩 반영 | approved-auto | 13 · 14 · 12 |

Approval readiness: PASS — 기술 수정 전부 자동 반영 가능. 사용자 대기: D-A1 · D-A2 · D-B1 · D-B2 · U1~U5(9건). 플랜은 추천안으로 쓰되 14·15 Task 0 답이 다르면 해당 태스크를 고친다.

## 다음 반영

`/gsd-plan-phase 04.3` 수정 모드에서 플랜별로 적용한다. 잠긴 결정과 UI-SPEC 승인 계약은 건드리지 않는다.

- **13 Task 1 · 전제**: A1(MERGE_HEAD 절차 + 가드 + `BASE = origin/main` 확인), A16(`pg_constraint`), A19 기준 node 체인, OV7(Codex 문장 제거), OV9 · OV17 세무 확인 목록, OV15(`/qa` 전 개발 DB 재설정), 결정 답 사전 확인(OV13 한 줄)
- **12 · 14 · 15**: 웨이브 시작 머지에서 마이그레이션 번호가 겹치면 13 Task 1 절차를 따른다는 한 줄(A2 · OV6). 12의 「13은 웨이브 7」 → 8(OV18)
- **15**: A13 · A14 · A7 · A8 · A9 · A4 · A10 · A11 · A15 · A16 · A19 · OV3 · OV8(Task 2 ③ 삭제) · OV10 · OV11 · OV14. U1(가액 필수 입력) · U2(1개 가액 × 수량)는 추천안(a)으로 쓰고 Task 0에 추가
- **14**: B2(무조건 `prefetch={false}`) · B4 · B5 · B6 · B7 · B8(12) · B9 · B10 · B11 · B12 · B13. U3(인쇄 `cert_view`, fail-closed) · U4(클라이언트 idle → `/login`) · U5(이유 줄 + `next=`)는 추천안으로 쓰고 Task 0에 추가. OV16(D-A1 (b)면 `lib/auth.ts` 위험 경로)
- **SUMMARY 후속 한 줄**: A5(14가 가액 변경 로그를 끌 수 없는 종류로 옮길지), 테스트 대기 없음

## 사용자 확인 필요

PR #88에 「[사용자 결정 요청]」으로 올렸다(댓글 5907395611). 기본값은 모두 (a) 추천안이며 플랜은 그 값으로 쓴다.

1. **U1 가액 미입력 행사(15)** — (a) I2 행사 만들기에서 가액 필수 입력 · (b) 가액 입력 전 QR·링크 숨김 · (c) 지금대로. QR을 먼저 뿌리면 5만원 이하 행사도 주민번호를 영구히 받는다.
2. **U2 당첨자별 수량(15)** — (a) 가액을 「경품 1개 가액」으로 받고 서버가 `가액 × 수량`으로 판정 · (b) 「1인당 총액(수량 포함)」 한 값 + 라벨만 변경.
3. **U3 인쇄 라우트 조회 기록(14)** — (a) `getCertificatePrint`도 `cert_view {ip, submissionId, via:"print"}`, 실패면 인쇄 안 열림 · (b) `/cso`로 넘김.
4. **U4 I4 idle 클라이언트 타이머(14)** — (a) 화면이 idle 한도 무입력이면 클라이언트가 로그인으로 보냄 · (b) 서버 판정만.
5. **U5 끊긴 뒤 착지(14)** — (a) 이유 한 줄 + `next=` 되돌아가기 · (b) 이유 줄만 · (c) 지금대로.
6. **세무 확인(13 사람 확인 목록)** — 5만~10만원 추첨 경품은 지급명세서 면제라 v3 안내 「관할 세무서 제출 — 법령상 의무」가 사실과 다를 수 있음(OV9) · 주민번호 없는 변형의 보관 근거가 법인 비용 증빙 보존일 수 있고 기산일에 영향(OV17).

알림(자동 적용): 13의 Codex 문장 제거(OV7) · 마이그레이션 충돌은 머지 안에서 `MERGE_HEAD`로 푼 뒤 재생성(A1).

## NOT in scope

- 잠긴 결정 재론(decisions.md ①~⑥ · D-1101~1108 · 누적 잠금 20회 · 10의 31파일 슬라이스) · D-A1 · D-A2 · D-B1 · D-B2 재질문
- 판정을 설정 키로 만들기(15:224가 명시로 뺌 — A 동의) · 가액 값의 낙관적 동시성(한 칸, 로그가 남음) · 세무 확인 4항목의 동작화(15:431-436)
- 당첨자 목록(전화 전체) 조회 로그 · 당첨자 수정 로그를 끌 수 없는 종류로 올리기 · 제8조② 월 1회 점검 화면 요건(`/cso` 몫)
- 가액 변경 로그를 끌 수 없는 종류로 올리기(14 웨이브 7의 후속, A5) · 「감사 뒤 수정」의 실행자·오케스트레이터 역할 분담(P3 이하)
- 안전성 확보조치 기준 제6조④ 해석 · 세무 판단(법무/세무 확인 항목)
- UI-SPEC 문구 변경(`/plan-design-review` 몫) · 프로덕션 플래그 켜기(Phase 11)

## 이미 있는 것(재사용)

- `lockEventRow`(`repositories/cert-winners.ts:67-75`, `for("update")`) · `findEventByTokenHash`(`repositories/cert-events.ts:33`) — 새 칸이 추가 쿼리 없이 verify·submit에 실린다
- `submittedCount`(`domain/certs/events.ts:206,249,319`, 집계 `repositories/cert-events.ts:112`)
- `KRW_COLUMN_MAX` · `withinKrwColumn`(`domain/money/index.ts:79,97`, 클라이언트 안전) · `ui/input/use-comma-input.ts`
- 공개 오류 허용 목록(`lib/actions/handle-server-error.ts:33-47`) · 공개 경로 정적 경계 테스트(`test/unit/certs/public-route-boundary.test.ts:4-8`) · 액션 레지스트리 모양(`app/(app)/certs/events/actions.registry.ts:6-11`)
- `ALWAYS_ON_ACTION_TYPES`(`record.ts:76`, 설정 조회 건너뜀 `:155`) — `action_type`은 `text`뿐이라 새 종류에 마이그레이션 불필요
- `clientIp(headers)`(`lib/client-ip.ts:11`) · `cache(loadReview)`(`page.tsx:20`) · `privacy-session-activity.ts:21-35` FOR KEY SHARE 경합 처리
- `RevealRrnDeps`(`review.ts:168-171`) — `GetSubmissionForReviewDeps` 모양 선례 · `notifications.ts:210` `::timestamp` 선례
- 13 Task 1 verify의 node 체인 검사(okFiles·okJ·okChain·okBody) · `erp_migcheck` 분리 · 개발 DB 불가침

## Outside Voice (Opus 대체)

Codex는 CLAUDE.md가 금지하므로 Opus 1명이 14·15·13(d114de3 이후 diff)·decisions.md를 저장소 코드와 대조하며 적대적으로 검토했다. 전제: 04.3-10·11·12 SUMMARY가 아직 없어 인쇄 라우트와 I3 편집 판정은 계획 문서로만 대조했다. 「미확인」은 코드·문서로 확인하지 못한 주장이다. 새 누수 경로는 못 찾았다(투영 설계 + E2E 전체 응답 스캔으로 충분). 첫 접근 판정은 `sessions.created_at` 기준으로 우회 경로를 못 찾았다.

| # | 주장(outside 등급) | 판정 | 근거 |
|---|---|---|---|
| OV1 | 가액 비운 채 열림 → 주민번호 영구 수집(P1) | **P1 유지** → U1 (A6과 병합) | `events.ts:404` 링크·QR 즉시 생성, 만들기 입력에 가액 없음 |
| OV2 | 수량 곱 누락(P1) | **P1 유지** → U2 (A3과 병합) | `intake.ts:403` · `cert-winners.ts:31,54` |
| OV3 | 정정 뒤 null → ""(P2) | P2 유지, 기술 수정 | `review.ts:368` · `page.tsx:69` |
| OV4 | 클라이언트 idle 타이머 삭제(P2) | P2 유지 → U4 | `rrn-field.tsx:173-194` |
| OV5 | 접속기록 범위(P2) | P2 유지 → U3 (B1과 병합) | 04.3-11 T-04.3-55 accept |
| OV6 | 웨이브 6·7 재생성 절차 부재(P2) | P2 유지, 기술 수정 (A1·A2와 병합) | 14 files_modified에 `db/migrations` 없음 |
| OV7 | 13의 Codex 지시(P2) | P2 유지, 기술 수정 | `13:39,215` · CLAUDE.md §2·§4·§8 |
| OV8 | v2 문장 이중 수정(P2) | P2 유지, 기술 수정 | 15 Task 2 ③ vs 14 Task 3 ③·④ |
| OV9 | 세무서 제출 고지가 사실과 다를 수 있음(P2) | P2 유지, 세무 확인 | 소득세법 시행규칙 제97조 |
| OV10 | 재생 경로 테스트 없음(P2) | P2 유지, 기술 수정 | `intake.ts:283-296` |
| OV11~OV18 | P3 8건 | 각 유지 (OV12만 채택 안 함) | Decision ledger 참조 |

## Suppressed findings 부록 (검토자 부록, 확신 ≤4)

- (4/10) `rrn-field.tsx:181` — 평문 자동 가림 타이머는 연 때가 아니라 컴포넌트 마운트에서 돈다. 「전체 보기」 pointerdown/keydown이 타이머를 다시 거므로 실제로는 연 순간부터 3분이다. 문제 아님으로 판단. (B)
- (4/10) `rrn-state.ts:33-35` — 고친 채 가린 평문(dirty)은 `hideRrn`이 입력값을 메모리에 남긴다. 04.3-07 R-L1의 의도된 설계이며 결정 ③ 「가린다」와 충돌하지 않는다고 판단. (B)
- (4/10) OV17 — N 변형 보존 근거·기산은 법무/세무 미확인이라 본문에서 세무 확인 항목으로만 올렸다. (Outside)

## Completion summary

- Step 0: Scope Challenge — 15는 31파일이지만 coarse 배치 유지, 14 축소 제안 없음. 범위 이슈 OV1 · OV2(P1, 사용자 결정) · OV8 · OV12(미채택) · OV13
- Architecture Review: 13 issues found (P1 2 — A1 · OV1/OV2는 Step 0, P2 6, P3 5) — 14: B1~B5 · OV3 · OV4, 15/13: A1~A6 · OV6 · OV9 · OV14 · OV16 · OV17 (중복 병합 후)
- Code Quality Review: 14 issues found (P2 3 · P3 11) — A7~A12 · B6~B9 · OV7 · OV11 · OV18
- Test Review: diagram produced (14: 경로 17 중 13 계획됨, GAP 4 · 15: GAP 6), 지적 13건(P1 1 · P2 4 · P3 8) — A13~A17 · A19 · B10~B13 · OV10 · OV15
- Performance Review: 1 issue found (P3 1 — A18), 14는 No issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: `.planning/`는 다음 세션 플래너가 반영 — A5(가액 로그 종류) · 세무 확인(OV9 · OV17) · 당첨자 목록·수정 로그 `/cso`
- Failure modes: 2 critical gap 후보 (E4-A13 · OV1)
- Outside voice: Opus 대체, in-host (Codex 금지 — CLAUDE.md)
- Parallelization: 변경 없음(웨이브 5(10·11)는 영향 없음, 6(12·15) → 7(14) → 8(13) 순서 유지 — `record.ts`는 12·14, 수령자 화면은 15·14가 겹쳐 순서가 맞다)
- Unresolved decisions: 9 (D-A1 · D-A2 · D-B1 · D-B2 · U1~U5)
- 합계: 원 50건 → 중복 제거 45건 (P1 4 · P2 13 · P3 28)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | /plan-eng-review | 새 플랜 14·15 계획 게이트 | 1 | issues_open(user decisions pending) | 45 issues (P1 4 · P2 13 · P3 28), 2 critical gaps, 사용자 결정 9 |

**VERDICT:** 계획 수정 반영 뒤 실행 — 14·15는 사용자 결정 U1~U5·D-* 답 뒤, 웨이브 5(10·11)는 영향 없음.

**OUTSIDE COVERAGE / CROSS-MODEL:** Opus outside voice 1명이 독립 교차 검토를 했다(in-host). P1 2건(OV1 · OV2)은 모두 유지되어 사용자 결정(U1 · U2)으로 넘겼고, 중복 5건을 A·B와 병합했다. Codex는 CLAUDE.md가 금지하므로 실행하지 않았고 재확인 항목도 두지 않는다.

**UNRESOLVED DECISIONS:**
- D-A1: 앞서 물은 사용자 결정(PR #88 댓글 5907031518) — 답 대기, 14 Task 0. (b)를 고르면 `lib/auth.ts` 변경이 위험 경로(OV16)
- D-A2: 앞서 물은 사용자 결정(PR #88 댓글 5907031518) — 답 대기, 14 Task 0. 세무 확인(OV17)이 판단 자료
- D-B1: 앞서 물은 사용자 결정(PR #88 댓글 5907031518) — 답 대기, 15 Task 0. 현재 계획은 (a) I3 안 「경품 가액」 섹션(CHECKLIST §1 옆 패널 이탈은 DECISIONS 기록) · (b) 옆 패널
- D-B2: 앞서 물은 사용자 결정(PR #88 댓글 5907031518) — 답 대기, 15 Task 0. 현재 계획은 (a) 첫 제출 뒤 가액 잠금
- U1(PR #88 댓글 5907395611, U2~U5 같음): 가액 미입력 행사 — (a) I2 행사 만들기에서 가액 필수 입력(추천) · (b) 가액 입력 전 QR·링크 숨김 · (c) 지금대로 (15)
- U2: 당첨자별 수량 — (a) 「경품 1개 가액」 × 수량 서버 판정(추천) · (b) 「1인당 총액(수량 포함)」 한 값 + 라벨 변경 (15)
- U3: 인쇄 라우트 조회 기록 — (a) `cert_view {via:"print"}` + 실패면 인쇄 안 열림(추천) · (b) `/cso`로 넘김 (14)
- U4: I4 클라이언트 idle — (a) 무입력 idle 한도면 클라이언트가 로그인으로 이동(추천) · (b) 서버 판정만 (14)
- U5: 첫 접근 판정으로 끊긴 뒤 착지 — (a) 이유 한 줄 + `next=` 되돌아가기(추천) · (b) 이유 줄만 · (c) 지금대로 (14)
