# Phase 5 — `/plan-ceo-review` 보고서

- 일시: 2026-09-26 (UTC) · 브랜치 `claude/vibrant-albattani-c4m0tj` @ 54c4771 · PR #89
- 대상: `05-01`~`05-15-PLAN.md`, `05-CONTEXT.md`, `05-UI-SPEC.md`(확정 결정 표), `05-RESEARCH.md`, `05-VALIDATION.md`, ROADMAP Phase 5
- 진행 방식: 사용자 부재 → 코디네이터 지시(PR #89)에 따라 **이전 결정과 추천 기본값으로 자동 결정**했고, 결정표를 아래에 남긴다. 사용자가 이미 정한 결정(D-96~D-101, UI 확정 #1~#5, 번호 형식, 회사 대납 0.22 역산, `expenses.team`, 인쇄 제외)은 다시 열지 않았다
- 교차 검토: **Codex 대신 Opus 독립 검토**(Codex는 사용자 지시로 2026-09-29까지 사용 금지). **한도가 풀리면 Codex 재확인 필요**
- 이 세션은 문서만 다룬다. 플랜은 고치지 않았다. 반영은 다음 세션에서 `/gsd-plan-phase 5 --reviews`로 한다(세션 경계 훅)

## 결론

| 항목 | 값 |
|---|---|
| 모드 | HOLD SCOPE (자동 결정 — 아래 결정표 A3) |
| 막는 문제(P1) | **2** — F1 정산 결재 권한 교착, F2 05-04 행동 로그 종류 모순 |
| 반영 권장(P2) | 7 — F3~F9 |
| 사용자 확인 필요 | 2 — U1(승인 뒤 증빙 삭제), U2(반려 문서 종결 경로) |
| 사소한 것(P3) | 7 |
| 반영 필요 여부 | **필요** — 실행(`/gsd-execute-phase 5`) 전에 P1 둘은 반드시, P2는 같은 반영 세션에서 |
| 외부 선행 조건 | 04.1 SUMMARY 0/7, Phase 4 SUMMARY 없는 플랜 9개(04-07·17·18·19·31·42·47·48·51). 계획 결함은 아니고 05-01 착수 게이트 P-1~P-3이 막는다 |

## 결정표 (자동 결정)

| ID | 질문 | 선택 | 근거 |
|---|---|---|---|
| A1 | 설계 문서(`/office-hours`)가 없다 — 먼저 돌릴까 | 건너뜀 | 05-CONTEXT · 05-RESEARCH · UI-SPEC(승인)이 문제 · 제약 · 접근의 정본이다 |
| A2 | 다른 프로젝트 학습 검색 켤까 | 끔(프로젝트 한정) | 보수적 기본값, 되돌리기 쉬움 |
| A3 | 리뷰 모드 | HOLD SCOPE | 절차의 기계적 추천은 REDUCTION(바뀌는 파일 >15)이지만, 범위는 ROADMAP 기준 1~7과 사용자 결정으로 고정됐고 축소는 사용자 몫이다. 부재 중이라 비파괴 선택. 교차 검토자는 SELECTIVE를 권했으나 그 "선택 항목"은 전부 기존 범위 안 수리라 HOLD에서 F-항목으로 받는다 |
| A4 | 교차 검토 제공자 | Opus 독립 검토 | Codex 사용 금지(~2026-09-29). Codex 재확인은 한도 해제 뒤 |
| A5 | F1~F9 고칠 방향 | 각 항목의 "추천" 안 | 모두 기존 요구사항 · 결정을 지키기 위한 수리이고 범위를 넓히지 않는다 |
| A6 | U1 · U2 | **결정하지 않음** | 사용자 승인 UI-SPEC 가정(#8)을 뒤집거나 새 동작을 더하는 일이라 자동 결정 대상이 아니다 |

## Step 0

**0A 전제.** 진짜 문제는 PHP 인트라넷에서 PM이 지출결의 · 증빙을 여러 화면으로 나눠 올리고 결재자가 PC 앞에서만 승인하는 것이다. 계획은 이 고통을 직접 푼다 — 05-05(웨이브 5)에서 견적 줄 → 폼 → 사진 → 제출 → 폰 승인 → 최종 승인이 E2E로 끝까지 이어진다. 아무것도 안 하면 Phase 6(지급 · 증빙 규칙) · Phase 9(손익)가 올라설 문서가 없다.

**0B 기존 코드 활용.** 새로 쓰는 계산이 없다: 세금 `domain/money.applyTaxRule()`, 번호 `repositories/document-counters.ts`, 규칙 `domain/rules/gate.ts`, 권한 `domain/permissions`, 설정 레지스트리, `teamAtDate()`, 행동 로그, 04.1 결재 엔진(선택 필드 E1~E7로 덧붙임만). 새로 짓는 것은 증빙 업로드 경로(`domain/evidence` · `lib/gcp/storage.ts`)뿐이고 이는 ROADMAP 비고가 이 페이즈에 맡긴 일이다.

**0C 12개월 그림.**
```
  지금                         이 계획                          12개월
  PHP 인트라넷, 종이·PC 결재 -> 견적 줄 1클릭 지출결의,        -> 지급(6)·알림(7)·손익(9)까지
  견적 원장(Phase 4)만 있음      폰 결재, 정산 결재=완료,          한 원장에서 닫히는 BTL ERP
                                 증빙 업로드 경로(6이 규칙 얹음)
```
방향이 맞다. 결재 차례 알림은 Phase 7이라 그 전에 Phase 5만 먼저 파일럿하면 체감 가치가 준다(P3-7).

**0D 대안.** 새 접근 결정은 필요 없었다.

**0G HOLD 점검.** 파일 >8 · 새 서비스 >2라 복잡도 경고 조건이다. 그러나 플랜 15개는 plan-checker 2회차에서 이미 쪼개졌고(05-14 · 05-15), 요구사항 8개에 빠짐도 과잉도 없다. 최소 변경 원칙으로 줄일 항목은 찾지 못했다 — 05-06~05-11은 모두 ROADMAP 기준(세금 · 팀 비용 · 목록 · 회수 · 내 차례 · 정산)의 직접 이행이다.

**0I 시간 순 질문.**
- 1시간째: 04.1이 실제로 머지된 모양(name_map)과 Phase 4 남은 9개 플랜 뒤의 줄 범위 → F4
- 2~3시간째: 정산 훅이 결재자 권한으로 전환 함수를 부를 때 → F1
- 4~5시간째: GCS V4 서명이 실제로 받아지는가 → F5(지금은 웨이브 13에서야 확인)
- 6시간째 이후: 운영에서 "승인이 안 된다" 추적 → F8

## 발견 (파일:줄)

### P1 — 실행 전 반드시

**F1. 정산 결재가 영구히 멈출 수 있다** — `05-11-PLAN.md:150-156`(③ 훅 · ④ `changeProjectStatus` 입력), 코드 `domain/projects/status-transitions.ts:20`(`settling → completed`는 `menu: "projects.complete"`), `domain/projects/status.ts:291-293`(`evaluateTransition`이 메뉴 · 팀 범위를 먼저 판정)
- 실패: 최종 승인 훅이 결재자를 viewer로 `changeProjectStatus`를 부르므로, 관리자가 정산 결재선 마지막 단계를 대표가 아닌 계급으로 바꾸거나(설정 17키가 허용) 그 계급에 `projects.complete`가 없으면 승인할 때마다 전체 롤백된다. 05-11 Task 3가 직접 완료 경로를 닫으므로 탈출구가 없다 — DB 직접 수정 말고는 완료할 수 없다
- 추천 수리(A5): `trigger: "approval"`일 때 메뉴 검사 대신 "이 결재 인스턴스의 최종 승인 단계 담당"임을 확인하는 판정으로 바꾸고, 그 판정이 거짓이면 `approveBlockedReason`으로 미리 보인다. 통합 사례 하나(마지막 단계를 경영관리로 바꾼 설정에서 승인 → 완료, `projects.complete` 없는 결재자도 성공 / 인스턴스 밖 사람은 거부)
- 보조안: 정산 결재선 설정 저장 때 마지막 단계 계급이 `projects.complete`를 갖는지 검증

**F2. 05-04 안에서 행동 로그 종류가 모순된다** — `05-04-PLAN.md:55`("증빙 추가 · 삭제는 `document_update`, 새 행동 종류를 만들지 않는다") vs `05-04-PLAN.md:173`(`removeEvidence` … 로그 `evidence_remove`)
- 실패: 실행자가 둘 중 하나를 어기고, 행동 로그 등록부 · 누수 스캔 검사가 흔들린다
- 추천 수리(A5): `:173`을 `recordActionInTx(document_update, detail { change: "evidence_remove", fileId })`로 맞춘다(:172 추가 쪽과 같은 모양)

### P2 — 같은 반영 세션에서

**F3. 같은 문서 두 번 제출 사례가 없다** — `05-14-PLAN.md:154-159`
- 동시 제출 6건은 서로 다른 문서, "두 창"은 저장만 다룬다. 폰 두 번 탭 · 응답 유실 뒤 재시도에서 사용자는 이미 제출된 문서에 `다른 곳에서 저장됨` 오류를 본다
- 추천: 같은 문서 · 같은 version 제출 두 번 → 번호 하나, 두 번째는 "이미 제출됨 → 문서로 이동" 결과. 통합 사례 1

**F4. 04.1 의존은 이름만 맞추고 의미 변화는 못 잡는다** — `05-01-PLAN.md:36-37`(착수 게이트 · name_map)
- 04.1 리뷰 · 병합에서 `approveDocument` 트랜잭션 구조, `resubmitDocument` 차수 규칙이 바뀌면 E2(트랜잭션 전 prepare / 안 훅) · E4 전제가 조용히 어긋난다. read_first의 Phase 4 줄 범위(예: 05-11 `status.ts 195–230행`)도 남은 9개 플랜 뒤 어긋난다
- 추천: 05-01 Task 1 ⓪ 뒤에 "04.1 실제 시그니처와 E1~E7 전제 대조 — 다르면 멈추고 `/gsd-plan-phase 5 --reviews`로 05-01 · 05-03 · 05-11 재점검" 한 단계. 줄 범위는 "함수 이름으로 Grep 후 범위 Read"로 바꾼다

**F5. 가장 큰 기술 불확실성(GCS V4 서명)을 맨 마지막에 확인한다** — `05-12`(웨이브 5), `05-13-PLAN.md:183`(웨이브 13 staging checkpoint), RESEARCH A8 · A9(공식 문서 확인 불가)
- 마지막에 서명이 거부되면 업로드 설계(SHA-256 바인딩 · 크기 헤더)와 05-05 · 05-09 E2E까지 되돌아간다
- 추천: 05-12 끝에 DB 없는 스파이크 checkpoint(스크립트로 staging 버킷에 서명 PUT/GET 한 번, 사람 확인). 05-13 전체 확인은 그대로

**F6. 번호 받은 문서가 다른 프로젝트 줄 · 팀 비용으로 옮겨갈 수 있다(추정)** — `05-07-PLAN.md:183`(`changeExpenseLine`), `05-09-PLAN.md:130`(편집 가능 상태를 반려 · 회수까지 넓힘)
- 금지 조항이 없다. 반려된 `26001-0003`이 다른 프로젝트로 가면 번호의 프로젝트 부분이 틀리고 원래 줄의 D-66 잠금이 풀린다
- 추천: 번호 있는 문서는 같은 프로젝트(팀 문서는 같은 종류) 안에서만 줄 바꾸기 — prohibition 한 줄 + 통합 사례 1

**F7. 관측성 — 구조화 로그가 한 줄도 계획되지 않았다** — 05-01~05-15 전체(04.1은 `approval.route_blocked` 등을 둔다)
- 정산 훅 롤백, 업로드 완료 통보 메타데이터 불일치, 서명 실패, 로컬 드라이버 운영 차단이 운영 로그에 남지 않는다
- 추천: 05-04 · 05-11 · 05-12에 id와 사유 코드만 담은 `log.warn` 1~2줄씩(개인 정보 · 금액 없음)

**F8. 05-VALIDATION이 초안이다** — `05-VALIDATION.md:5-6`(`nyquist_compliant: false`), Per-Task 맵 빈칸, Wave 0 목록에 `approvals-extensions` · 지출결의 결재 동시성 · 팀 비용 보임 · `next-turn` · 되돌리기 다시 제출 테스트 없음
- 추천: 실행 전 `/gsd-validate-phase 5`로 맵을 채우고, 04.1 연차 회귀(E1 · E7 뒤)를 명시 항목으로

**F9. 고아 객체 청소가 Phase 6 F8에만 있다** — `05-04-PLAN.md:173`, `05-12-PLAN.md:152`
- Phase 6가 늦으면 버킷에 미완료 업로드가 쌓인다
- 추천: 05-12 부트스트랩에 버킷 수명 주기 규칙 한 줄(미완료 업로드 접두어 7일 삭제). Phase 6 F8은 그대로

### 사용자 확인 필요 (자동 결정하지 않음)

**U1. 승인된 지출결의에서 기안자가 증빙을 지울 수 있다** — `05-09-PLAN.md:40`(근거: UI-SPEC UI Assumptions #8 — 확정 결정 #1~#5가 아닌 가정)
- 결재가 끝난 돈 문서의 증빙이 줄어 결재자가 본 근거와 달라진다(로그는 남음)
- 추천: 승인 뒤에는 추가만(삭제 금지), 결재 중 삭제는 지금처럼 version 증가로 막는다. 사용자 승인 UI-SPEC 가정을 바꾸는 일이라 사용자 결정 대기

**U2. 반려 · 회수된 지출결의를 끝낼 길이 없다** — `05-09-PLAN.md:40 · 130`, `05-RESEARCH.md:321`
- 번호 있는 반려 · 회수 문서가 줄 문을 닫고 회차 상한을 계속 차지한다. 비용이 실제로 취소되면 그 견적 줄은 계속 `반려`로 닫혀 있다
- 추천: 반려 · 회수 문서의 "종결(취소)" 동작을 두고 종결 문서는 상한 · 문 판정에서 뺀다 — 이번 범위가 아니면 Phase 6 TODO로 명시. 새 동작이라 사용자 결정 대기

### P3 — 사소한 것

1. `.planning/ROADMAP.md:602` 기준 7 「기본값은 이 페이즈 계획에서 경영관리 확인」이 D-101(「계획 전 경영관리 확인은 받지 않는다」)과 어긋남 — 문구 정렬
2. `05-01-PLAN.md:98` Phase Goal 절이 연차 포함 옛 Goal을 설명 — 현 ROADMAP Goal(연차는 04.1)로
3. `05-CONTEXT.md:9 · 58` 요구사항 목록에 04.1로 옮긴 EXP-03 · 04 · 05, ADMN-04, LEAV-01이 남음
4. `REQUIREMENTS.md:251` ADMN-04의 「세율 · 수식은 Phase 5」를 어떤 플랜도 `requirements`에 싣지 않음 — 05-06 frontmatter에 ADMN-04(세율 부분) 추가
5. UI 확정 #3(행 승인 즉시)이 되돌릴 수 없는 정산 결재 승인(완료 잠금)에도 적용됨 — 사용자 결정이라 유지, CLAUDE.md §7 「확인은 되돌릴 수 없는 일에만」과의 의식적 예외로 05-11 SUMMARY · 검증 기록에 남길 것
6. `05-05-PLAN.md:43` HEIC 변환 실패 시 원본 업로드 — 결재자 PC 브라우저에서 보기 불가 가능성, 서버 허용 형식에서 HEIC 처리 명시(추정)
7. 결재 차례 알림은 Phase 7 — Phase 5 단독 파일럿 시 체감 가치 저하. 순서(Phase 8 전환이 7 뒤)상 문제는 아님

## 섹션별 검토

### 1. 아키텍처
```
 app/(app)/projects/[id]  app/(app)/expenses  app/(app)/approvals  첫 화면(내 차례)
        │ 지출결의 올리기        │ 목록·폼·문서          │ 결재함·시트(ui/approval-sheet, E7)
        ▼                        ▼                       ▼
 domain/expenses ──세금──▶ domain/money.applyTaxRule   domain/approvals(04.1 + E1~E7)
   │  gate(rules) ◀──────┐                                ▲   │ onFinalApprovalInTx(E2)
   │ 번호 document_counters                               │   ▼
   ├─▶ domain/evidence ─▶ lib/gcp/storage(local | gcs-v4) │  domain/settlements ─▶ changeProjectStatus
   └─▶ repositories/* (viewer 필수) ─▶ Postgres ◀─────────┘            (F1: 권한 재검사)
```
- 결합: 결재 엔진은 종류 이름을 모르고 등록 필드로만 받는다(05-01 prohibition) — 좋다. 새 결합은 정산 종류 → 프로젝트 상태 전환 하나이고 F1이 그 틈이다
- 10배 부하: 30명 규모에서 병목은 DB 풀 5와 번호 행 잠금. 05-14가 풀 5에서 동시 제출 6건을 증명한다
- 단일 장애점: GCS(업로드 불가 → 제출 게이트 ⑧로 막힘, 사용자에게 보임). F5
- 롤백: 병합이 05-13 한 번뿐이라 중간 배포 · 부분 롤백 지점이 없다. 마이그레이션 4개(05-01 · 05-03 · 05-04 · 05-11)는 추가형이라 코드 롤백만으로 되돌릴 수 있다
- 발견: F1, F4

### 2. 오류 · 구조 지도
| 경로 | 무엇이 틀어지나 | 처리 | 사용자가 보는 것 |
|---|---|---|---|
| submitExpense | 동시 수정(version) | ExpenseConflictError | `HH:MM에 다른 곳에서 저장됨 · 새로 고침` |
| submitExpense | 같은 문서 두 번 | **미정(F3)** | 이미 제출됐는데 충돌 오류 ← 틈 |
| submitExpense | 회차 상한 초과 · 금액 ≤ 0 | gate 이유 | 비활성 + 이유 |
| approveDocument | 옛 version(증빙 변경) | ApprovalConflictError | `{기안자}이 HH:MM에 증빙을 더함 · 새로 고침` |
| approveDocument(정산) | 훅 실패 · 상태 불일치 | 전체 롤백 | `진행으로 바뀜 · 반려` |
| approveDocument(정산) | 결재자에 `projects.complete` 없음 | **롤백 반복(F1)** | 원인 불명 실패 ← 틈 |
| completeEvidenceUpload | 의도 만료 · 메타데이터 불일치 | storage.delete 후 거부 | `올리지 못함 · 다시 올리기` (로그 없음 — F7) |
| withdraw(되돌리기) | 첫 단계가 이미 처리 | 서버 거부 | `{이름}이 HH:MM에 승인함 · 문서에서 회수` |
| 서명 URL 발급(gcs) | IAM signBlob 거부 | 오류 전파 | 업로드 실패 한 줄 (로그 없음 — F7, 실측은 F5) |

GAP: F1 · F3 · F7

### 3. 보안
- 새 표면: 업로드 선언 · 완료 액션, 로컬 업로드 라우트(운영 차단), 서명 URL. 05-04가 크기 · 형식 · 해시 · 의도 위조 · 남의 의도를 거부하고 로컬 드라이버 운영 차단을 둔다 — 대응됨
- 권한: `expenses.team` + 계급 범위, 404 규칙(D-17), DTO 누수 스캔(05-11 포함) — 대응됨
- 감사 기록: 행동 로그가 같은 트랜잭션. 단 승인 뒤 증빙 삭제(U1)는 통제 약화
- 새 의존성 0 · 새 비밀 0(버킷 이름 env 둘은 비밀 아님)
- 발견: U1. 나머지는 `/cso`(Post-build)가 소유

### 4. 데이터 흐름 · 상호작용 가장자리
- 두 번 누르기: 생성은 idempotency key + 부분 UNIQUE(05-14) — 대응. 제출은 F3
- 경합 두 순서: 승인↔회수 · 승인↔반려(05-09), 진행 복귀↔정산 승인(05-11), 같은 줄 두 제출(05-14, `afterLock` 고정) — 대응
- 되돌리기: 늦은 되돌리기 거부 문구까지 — 대응
- 번호 문서 이동: F6 · 반려 문서 종결: U2
- 폰 사진: HEIC(P3-6)

### 5. 코드 품질
- 재사용 우선(세금 · 번호 · 규칙 · 권한) — 좋음. `sumKrw` · `diffKrw`는 06-02 계획 이름을 그대로 가져와 중복을 막는다
- 모순: F2. 과설계 흔적 없음

### 6. 테스트
- 트레이서(05-01 · 05-03 · 05-04 · 05-05)마다 끝에서 끝까지, 경계 사례는 05-14, E2E는 `CI=true`
- 틈: F3(같은 문서 두 번 제출), F1(권한 없는 최종 승인자), F6(번호 문서 줄 이동), F8(VALIDATION 맵)
- 금요일 새벽 2시 테스트: 05-05 E2E(견적 줄 → 폰 승인 → 최종 승인) + 05-11 정산 두 순서
- 불안정 위험: 시간 의존(`todayKst`) 사례는 주입으로 고정 — 계획에 있음

### 7. 성능
- 결재함 · 목록은 describeDocuments 일괄 조회(04.1 규약), 목록은 페이지 — 문제 없음
- 트랜잭션 안 전역 풀 읽기 금지(05-01 prohibition) — 풀 5 교착 예방. 발견 없음

### 8. 관측성
- 행동 로그는 충분하나 운영 로그가 없다 — F7
- 대시보드 · 알림: 30명 사내 도구라 새 대시보드는 불요

### 9. 배포 · 롤아웃
- 마이그레이션 번호: 브랜치 임시 → 05-13이 main 마지막 + 1로 재생성(04.1-07과 같은 규약) — 적절, 계획에 번호를 미리 적지 않음 확인
- 기존 표를 건드리는 문장에 `lock_timeout` · `statement_timeout` — 적절
- staging 실측: F5(앞당김)
- 기능 플래그 불요(사내 전환 전 단계)

### 10. 장기 궤적
- 되돌림 가능성 4/5 — 결재 엔진 확장은 선택 필드라 기본 동작 불변
- 부채: 고아 객체(F9), 운영 로그(F7), 반려 문서 종결(U2)
- 1년 뒤 새 엔지니어: 종류 등록 필드 모델은 이해하기 쉽다. 05-13이 ARCHITECTURE 절을 남긴다

### 11. 디자인 · UX (UI 범위 있음)
```
견적 줄 표 ─지출결의 올리기/Ctrl+E─▶ 폼(자동 채움) ─사진─▶ 제출 ─토스트(되돌리기)─▶ 문서 화면
                                        ▲ 반려·회수 폼 ◀──────────────────────────┘
결재자: 첫 화면 「내 차례」 ─탭─▶ 결재 시트 ─승인/반려─▶ 다음 단계 … 최종 승인
PM: 정산 상태 머리 줄 「정산 결재 올리기」 ─▶ 대표 승인 = 프로젝트 완료
```
- 상태 범위(로딩 · 빈 · 오류 · 성공 · 부분)는 UI-SPEC가 화면마다 정의했고 플랜이 받는다
- §7 점검: 확인 창 대신 되돌리기, 막힘 이유 한 줄, 주 버튼 하나 — 부합. 예외 P3-5
- `/plan-design-review` 필요(다음 게이트)

## 이미 있는 것
`applyTaxRule` · `document_counters` · `domain/rules/gate` · `domain/permissions` · 설정 레지스트리 · `teamAtDate` · 행동 로그 · 04.1 결재 엔진(계획) · Phase 4 `changeProjectStatus` · `ui/*` 컴포넌트 — 전부 재사용

## 범위 밖
- 매출 세금계산서 발행 요청(D-99, Phase 6) · 정산 마감 점검(D-100, Phase 6) · 인쇄(뒤 페이즈) · 연차 · 월차(04.1) · 알림(Phase 7) · 고아 객체 정리 쿼리(Phase 6 F8)

## 실패 모드 등록부
| 경로 | 실패 | 구조 | 테스트 | 사용자 | 로그 |
|---|---|---|---|---|---|
| 정산 최종 승인 | 결재자 권한 없음 | 롤백 | 없음 | 원인 불명 | 없음 ← **CRITICAL GAP (F1)** |
| 제출 | 같은 문서 두 번 | 충돌 오류 | 없음 | 틀린 오류 | 행동 로그 |
| 업로드 완료 | 메타데이터 불일치 | 거부 | 있음 | 다시 올리기 | 없음(F7) |
| gcs 서명 | IAM 거부 | 전파 | staging 수동(늦음) | 실패 한 줄 | 없음(F5 · F7) |
| 증빙 삭제(승인 뒤) | 근거 축소 | 허용 | — | — | 행동 로그(U1) |

CRITICAL GAP 1 (F1).

## 반영 작업 (다음 세션 — `/gsd-plan-phase 5 --reviews`)
- [ ] **T1 (P1, 사람 ~2h / CC ~15분)** 05-11 — 정산 훅 권한 판정을 "인스턴스 최종 승인 단계 담당"으로, `approveBlockedReason` 미리 표시, 통합 사례 1 (F1)
- [ ] **T2 (P1, ~10분 / ~2분)** 05-04:173 — `evidence_remove` → `document_update` detail (F2)
- [ ] **T3 (P2)** 05-14 — 같은 문서 두 번 제출 사례 + "이미 제출됨" 결과 (F3)
- [ ] **T4 (P2)** 05-01 Task 1 — 04.1 시그니처 대조 단계, 줄 범위 → 함수 이름 Grep (F4)
- [ ] **T5 (P2)** 05-12 — staging 서명 PUT/GET 스파이크 checkpoint (F5)
- [ ] **T6 (P2)** 05-07 · 05-09 — 번호 문서 줄 이동 금지 + 사례 (F6)
- [ ] **T7 (P2)** 05-04 · 05-11 · 05-12 — 구조화 로그 1~2줄씩 (F7)
- [ ] **T8 (P2)** 실행 전 `/gsd-validate-phase 5` (F8)
- [ ] **T9 (P2)** 05-12 — 버킷 수명 주기 규칙 (F9)
- [ ] **T10 (P3)** P3-1~4 문구 · frontmatter 정렬, P3-5 · 6 기록
- [ ] U1 · U2는 사용자 답을 받은 뒤

## 완료 요약
```
+====================================================================+
|            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
+====================================================================+
| Mode selected        | HOLD SCOPE (자동 결정)                       |
| System Audit         | 04.1 0/7, Phase 4 SUMMARY 없는 플랜 9개      |
| Step 0               | 전제 유효, 축소 항목 없음                     |
| Section 1  (Arch)    | 2 issues (F1, F4)                            |
| Section 2  (Errors)  | 9 paths mapped, 3 GAPS (F1, F3, F7)          |
| Section 3  (Security)| 1 issue (U1), 0 High                         |
| Section 4  (Data/UX) | 12 edge cases mapped, 3 unhandled (F3,F6,U2) |
| Section 5  (Quality) | 1 issue (F2)                                 |
| Section 6  (Tests)   | Diagram produced, 4 gaps                     |
| Section 7  (Perf)    | 0 issues                                     |
| Section 8  (Observ)  | 1 gap (F7)                                   |
| Section 9  (Deploy)  | 1 risk (F5)                                  |
| Section 10 (Future)  | Reversibility: 4/5, debt items: 3            |
| Section 11 (Design)  | 1 issue (P3-5)                               |
+--------------------------------------------------------------------+
| NOT in scope         | written (6 items)                            |
| What already exists  | written                                      |
| Dream state delta    | written                                      |
| Error/rescue registry| 9 rows, 1 CRITICAL GAP                       |
| Failure modes        | 5 total, 1 CRITICAL GAP                      |
| TODOS.md updates     | 0 (U2 결과에 따라)                            |
| Scope proposals      | 0 proposed, 0 accepted (HOLD)                |
| CEO plan             | skipped by mode                              |
| Outside voice        | Opus 독립 검토 completed (Codex 미사용)       |
| Lake Score           | N/A                                          |
| Diagrams produced    | 3 (architecture, 12-month, user flow)        |
| Stale diagrams found | 0                                            |
| Unresolved decisions | 2 (U1, U2)                                   |
+====================================================================+
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review 5` | Scope & strategy | 1 | ISSUES OPEN | mode: HOLD_SCOPE, 1 critical gap · P1 2 · P2 7 · P3 7 |
| Outside Review | Opus 독립 검토(서브에이전트, Codex 대체) | Independent 2nd opinion | 1 | completed (native) | 10 MAJOR + 8 MINOR 제시 → 본 보고서 F1~F9 · U1 · U2 · P3로 흡수(1건 미확인으로 제외) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | 다음 게이트 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 다음 게이트 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 해당 없음 |

- **OUTSIDE COVERAGE:** Codex — unavailable(사용자 지시로 2026-09-29까지 금지), no completed external review. Opus 독립 검토 — completed(native fallback). **한도 해제 뒤 Codex 재확인 필요**
- **VERDICT:** CEO 게이트 기록됨(ISSUES OPEN — P1 2건은 실행 전 반영). eng review required. design review required(UI 범위)

**UNRESOLVED DECISIONS:**
- U1 — 승인된 지출결의에서 증빙 삭제 허용 여부(05-09-PLAN.md:40, UI Assumptions #8). 추천: 승인 뒤 추가만
- U2 — 반려 · 회수 지출결의 종결(취소) 경로를 이번 범위에 둘지 Phase 6 TODO로 둘지(05-09-PLAN.md:40 · 130)
