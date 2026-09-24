# Phase 4 보완 플랜 CEO 리뷰 (2026-09-23)

- 대상: `.planning/phases/04-project-quote-ledger/04-06`~`04-26-PLAN.md` (21개 미실행 플랜; 04-01·02·05 실행 완료, 04-04 진행 중, 04-03 보류)
- 근거 결정: `04-CONTEXT.md` 「2026-09-23 추가 결정」 D-75~D-95
- 브랜치: `claude/gsd-progress-e1nzgu` · 리뷰 시작 커밋: `b510b8a`
- 모드: **HOLD SCOPE** (D1, 사용자 선택) — 범위 확장 없음. 승인된 결정의 정합성·실패 경로·테스트·권한만 검증
- 분석: Opus 분석 에이전트 3개(A 상태·정산 / B 견적·매출·리저브 / C 목록·문서·코드표)가 실제 코드와 대조. 원문은 이 문서 끝 부록 A·B·C

## 시스템 감사 요약

- `origin/main`의 마이그레이션은 0008까지. 스테이징은 main push로만 자동 배포(`.github/workflows/deploy.yml`) → Phase 4 스키마(0009~)는 어느 환경에도 배포되지 않았다. 0012 상태 재매핑·0014 계약 칸 삭제의 롤백 위험은 배포 전이라 데이터 손실 없음(A-28, B-09 확인).
- TODOS.md: Phase 4와 겹치는 이연 항목 없음.
- 선행 버그(이미 실행된 코드): 보관 줄이 목록 합계에 포함(A-04), 저장할 때마다 줄 순서 재설정(A-03), 목록 합계 `::int` 캐스트가 21억 원 초과 시 오류(C-01), 합계가 문자열로 와서 콤마 없이 표시(C-01), 쉼표 입력이 0으로 저장(C-02).

## 결정 원장

| ID · 담당 | 계약·근거 | 현재 | 제안 | 상태 | 승인·범위 |
|---|---|---|---|---|---|
| D1 · 리뷰 | 리뷰 모드 | — | HOLD SCOPE | approved | 사용자 D1 답: 「범위 유지」 |
| D2 · gstack | 자동 WIP 커밋 | explicit | 유지 | approved | 사용자 D2 답: 「끄기, 현재대로」 |
| D3 · gstack | 교훈 범위 | unset | 이 프로젝트만 | approved | 사용자 D3 답 |
| FC · 전 플랜 | 부록 A·B·C의 FACT-CORRECTION 전부(결정·코드와 어긋난 플랜 오류, 치명 13건 포함) | 플랜 그대로 | 부록의 정해진 수정안 적용 | approved | 사용자 D4 답: 「일괄 적용」 — 부록 A·B·C의 FACT-CORRECTION 전부 |
| B-05 · 04-07 | 리저브 음수 잔액 차단(결정: DB 제약) | 앱 검사, 잠금 없음 | A 클라이언트별 행 잠금 + 서버 검사 / B DB 트리거 | approved | 사용자 D5 답: 「행 잠금 + 서버 검사」 |
| B-06 · 04-07 | 리저브 새 줄의 클라이언트 지정 | 방법 없음(8열) | A 9번째 클라이언트 열(첫 저장 후 잠금) / B 줄 추가 시 선택 / C 페이지 필터 | approved | 사용자 D6 답: 「클라이언트 열 추가」(첫 저장 후 잠금) |
| B-07 · 04-14 | 고객 승인 뒤 수량·단가 편집 | 편집 가능 | A 승인 차수 견적 칸 잠금 / B 수정 시 승인 자동 해제 / C 그대로 | approved | 사용자 D7 답: 「승인 차수 견적 칸 잠금」(실행가는 편집 가능, 바꾸려면 새 차수) |
| B-08 · 04-14 | 미수주의 고객 승인 게이트 | 차단 | 미수주도 면제 | approved | 사용자 D8 답: 「미수주도 면제」 |
| B-09 · 04-16 | `projects.contract_*` 삭제(ARCHITECTURE §5 "DROP 금지") | 0014 DROP | 지금 삭제 + RAISE 가드 + 예외 기록 | approved | 사용자 D9 답: 「지금 삭제 + 가드」 — 0014 DROP + 값 있으면 RAISE, ARCHITECTURE §5 예외를 DECISIONS에 기록. 전제: PR #38(Phase 4)을 한 번에 배포 |
| A-26 · 04-12 | 정산 중 줄 추가·삭제·이동·새 차수 잠금(D-78 해석) | 잠금 | 잠금 확정 | approved | 사용자 D10 답: 「줄 추가는 허용」 — 정산에서 PM은 실행가 수정 + 새 줄 추가 가능, 삭제·순서 이동·새 차수는 서버 거부(D-78 개정). 새 줄의 견적 칸 처리는 D12에서 확인 |
| A-27 · 04-20 | 「팀장 이상」 범위 | 전사 | 전사 유지 / 자기 팀만 | approved | 사용자 D11 답: 「자기 팀만」 — 팀장은 자기 팀 프로젝트만, 본부장·대표는 전사. 팀 단위 권한 범위 신설 필요 |
| A-26a · 04-12 | 정산 중 PM이 추가한 새 줄의 견적 칸 | 미정 | 실행가만 입력, 견적 칸 0 잠금(서버 검사) | approved | 사용자 D12 답: 「실행가만 입력」 |
| A-24 · 04-06 | 진행에서 수동으로 나가는 전환 | 없음 | 없음 유지 / 진행→미수주 추가 | approved | 사용자 D13 답: 「없음 유지」 |
| A-25 · 04-22 | 기간 수정 권한(S13 기본값, PM은 진행 중 종료일 단축 불가) | 기본값 | 기본값 확정 | approved | 사용자 D14 답: 「기본값 확정」 — 팀장 권한은 D11에 따라 자기 팀 한정 |
| C-03 · 04-19 | 프로젝트 간 복사·붙여넣기 시 계산 열 | 오류 칸 | 계산 열 무시 + 건너뛴 수 안내 | approved | 사용자 D15 답: 「계산 열 무시 + 안내」(통화 다르면 경고) |
| C-12 · 04-08 | REQUIREMENTS·ROADMAP 문구 갱신(`.planning/` 직접 편집, 도구 없음) | 계획 Task 3 | edd0d73 선례대로 승인 / 갱신 생략 | approved | 사용자 D16 답: 「이 세 곳만 승인」 — PROJ-04·PROJ-03·ROADMAP Phase 4 기준 4 문구만, gsd_run query commit으로 커밋 |
| C-10 · 04-17 | 상단 2px 로딩 바(`--accent` 사용처 5곳 제한과 충돌) | 미계획 | 이번엔 만들지 않고 충돌 기록 | approved | 사용자 D17 답: 「만들지 않고 기록」 — DECISIONS.md에 §1-3 충돌 기록, 로딩 막대는 디자인 잔여 퀵 태스크로 |
| C-21 · 04-17 | 시스템 관리자 목록·합계에 보관 프로젝트 포함 | 포함 | 항상 제외 | approved | 사용자 D18 답: 「항상 제외」 |
| LOW · 여러 플랜 | 저위험 기본값 묶음(B-10·B-11·B-26·C-09·C-11·C-16·A7·A8·S1·S3·S4 조정 줄 복사·리저브 Phase 4 유지) | 플랜 가정 | 권장안 일괄 | approved | 사용자 D19 답: 「전부 권장대로」(11항목) |
| OV-1 · 04-12·04-14·04-16 | 승인 차수 합계 불변(D7 약속: 계약 금액 = 승인값) | 수량·단가 칸만 잠금 | 승인 차수에서 견적 합계를 바꾸는 모든 조작(삽입·취소·보관·복원) 서버 거부 | approved | D7 답의 약속("계약 금액은 항상 승인값과 같다")을 완성하는 사실 정정 — Codex 1번 |
| OV-2 · 04-12·04-07 | 보관함 복원이 도메인 검사 우회 | A-19·B-04 정정(승인됨) | 복원도 완료/정산 잠금·줄 상한·승인 합계·리저브 잔액 검사를 같은 트랜잭션에서 통과 | approved | D4(FC) 범위 — Codex 2번은 승인 합계 검사 추가 |
| OV-3 · 04-12·04-14·04-26 | 동시 저장 경합(줄 상한·승인 대 저장·새 차수 대 저장) | FOR SHARE 잠금(A-06 수정안) | 프로젝트 행 배타 잠금(FOR UPDATE)으로 프로젝트 변경을 직렬화 + 두 연결로 경합을 강제하는 결정적 테스트 | approved | D4(FC)의 "경합 금지" 행동은 그대로, FOR SHARE는 상한을 못 지키므로 기제 정정 — Codex 3번 |
| OV-4 · 04-20·04-22 | 팀장 자기 팀 한정(D11) 표현 방식 | 불리언 권한 | 계급에 「업무 범위: 자기 팀/전사」 칸(시드: 팀장=자기 팀, 본부장·대표·시스템 관리자=전사), 오늘 기준 발령 이력으로 소속 팀 판정, 상태 전환·기간 수정·버튼 표시가 한 규칙 사용. scopeFor(보기 범위)는 건드리지 않음 | approved | 사용자 D20 답: 「계급에 업무 범위 칸」 — Codex 4번 |
| OV-5 · 04-11·04-17 | 읽을 때 자동 정산(쓰기) | D19-8 승인(읽을 때 판정) | 승인 유지. 보완: 자동 정산 UPDATE는 짧은 별도 트랜잭션 + 잠긴 행 건너뜀(SKIP LOCKED), 실패해도 목록 표시·로그(C-09), 저장·전환 경로도 같은 판정으로 게이트. 테스트: 열린 편집 화면이 자정 넘김, 정산 대 종료일 연장 경합, 이력 기록 실패 | approved | D19 답 유지(재개하지 않음: 10~30명 규모에서 쓰기 증폭 무시 가능, 실패 격리로 목록 영향 제거). 테스트 추가는 승인 행동의 증명 — Codex 5번 |
| OV-6 · 04-06·04-16 | 마이그레이션 테스트가 시드만 검증 | 재시드 후 5상태 확인 | 0010 상태의 옛 데이터(settled 포함)에 남은 마이그레이션 적용 → 재시드 전 검사(settled→completed, 기존 행 보존, 거부 입력). 릴리스 제약 「Phase 4는 PR #38 한 번에 배포」를 DECISIONS에 기록 | approved | D9 답의 전제를 검증하는 사실 정정 — Codex 6번 |
| OV-7 · 실행 순서 | 04-04 엑셀 확인 뒤 21개 전부 대기, 최종 표 변경 후 확인 없음 | 전부 04-04 뒤 | 견적 표와 무관한 플랜은 04-04 확인과 분리해 먼저 실행, 04-19 뒤 실제 엑셀 붙여넣기 최종 확인(checkpoint:human-verify) 추가 | approved | 사용자 D21 답: 「분리 + 마지막에 재확인」 — Codex 7번 |

Approval readiness: PASS — 확인한 행과 근거: D1·D2·D3(모드·설정 답), FC(D4), B-05(D5), B-06(D6), B-07(D7), B-08(D8), B-09(D9), A-26(D10), A-27(D11), A-26a(D12), A-24(D13), A-25(D14), C-03(D15), C-12(D16), C-10(D17), C-21(D18), LOW(D19), OV-4(D20), OV-7(D21), OV-1·OV-2·OV-3·OV-5·OV-6(각 승인 답의 약속·범위 안의 사실 정정, 근거는 행에 명시). 미승인 변경 없음.

## 0G·0I (HOLD SCOPE 점검)

- 0G 복잡도: 계획 검사 2차에서 모든 플랜이 파일 15개 안팎·작업 3개 이하로 나뉘었다. 더 줄일 수 있는 부분은 부록 A-31(상태 모듈 통합), C-07(단축키 표시 범위) 두 건이며 둘 다 사실 정정으로 반영한다. 승인된 불변식·수용 기준은 약화하지 않았다.
- 0I 시간축(구현자가 부딪힐 것): 1시간차 — 0012 재매핑 전 옛 데이터 상태와 action_log 트랜잭션 결합(A-01). 2~3시간차 — 정산 편집 매트릭스(D10·D12)와 승인 합계 불변식(OV-1)의 경계. 4~5시간차 — 읽을 때 자동 정산이 저장·전환 잠금과 만나는 지점(OV-3·OV-5). 6시간 이후 — KST 자정·동시성의 결정적 테스트, 04-19 뒤 실제 엑셀 확인. 상세는 부록 A·B·C의 0I 절.

# CEO Review — Phase 4 통합본 (A: 상태 라이프사이클 · B: 견적/수익/리저브 · C: 목록/문서/코드표)

## 섹션별 결과

각 발견은 첫 번째로 적힌 §번호를 대표 섹션으로 두어 한 번만 센다. §태그가 없는 발견(주로 B의 §12 없는 항목들과 C의 AC 항목들)은 본문 내용으로 판단해 배정했다.

| Section | 발견 수 | 치명(CRITICAL) | 대표 ID들 |
|---|---|---|---|
| 0G 복잡도 | 2 | 0 | A-31, C-07 |
| 0I 시간축 | 1 | 0 | C-20 |
| 1 구조 | 9 | 3 | A-06, B-01, C-01 |
| 2 오류·복구 | 14 | 6 | A-01, A-02, A-04, B-04, C-02, C-13 |
| 3 보안 | 25 | 2 | A-03, A-05, B-13, B-17, C-08 |
| 4 데이터 흐름·상호작용 | 34 | 3 | B-02, B-03, B-05, A-07, A-08 |
| 5 코드 품질 | 3 | 0 | A-10, A-32, A-33 |
| 6 테스트 | 5 | 0 | A-17, A-18, C-17, C-25 |
| 7 성능 | 1 | 0 | C-23 |
| 8 관측성 | 5 | 0 | A-16, A-29, B-16, B-26 |
| 9 배포 | 12 | 0 | A-28, B-09, B-22, C-12, C-26 |
| 10 장기 궤적 | 2 | 0 | A-23, B-08 |
| 11 디자인·UX | 9 | 1 | B-06, A-09, A-12, C-10 |
| **합계** | **122** | **15** | |

**전체 합계(치명도별): CRITICAL 15 / WARNING 45 / NOTE 62 (총 122).**
**전체 합계(분류별): FACT-CORRECTION 80 / DECISION 19 / ALREADY-COVERED 23 (총 122).**

세 파일 각자가 밝힌 합계와 대조하면:
- A(45건: CRITICAL 6·WARNING 19·NOTE 20, FACT 35·DECISION 4·ALREADY-COVERED 6)는 정확히 일치.
- B(37건: CRITICAL 6·WARNING 18·NOTE 13, FACT 25·DECISION 8·ALREADY-COVERED "4, plus the verified list in §12")도 산술적으로는 일치한다(25+8+4=37). 다만 B 스스로 ALREADY-COVERED를 "4개 + §12의 확인된 목록"이라고 적어, §12의 12개 항목(고유 ID 없음)은 37건 집계에 포함되지 않았다 — 즉 B의 ALREADY-COVERED "4"는 §12까지 세면 과소평가된 라벨이다. 총합 자체는 어긋나지 않는다.
- C(40건: CRITICAL 3·WARNING 8·NOTE 29, FACT 20·DECISION 7·ALREADY-COVERED 13)도 표에 실린 세부 항목을 더하면 정확히 일치한다(C 파일은 자체 총합을 명시하지 않았으므로 대조 대상이 없다).
- 3파일 합계 45+37+40=122는 위 섹션 표의 합계와도 일치한다.

## 이미 있는 것

- 0009 마이그레이션의 RAISE 가드 패턴을 0012가 그대로 따름 (`db/migrations/0009_project_quote_ledger_spine.sql` 91-124행 원칙, 0012는 미수정)
- `status_change` 로그가 항상 남도록 설계돼 있음 (`domain/action-log/record.ts:65-72`)
- `projectResponsibles` 재사용 — 04-22/04-12가 그대로 가져다 씀 (`domain/projects/responsibles.ts`)
- `isEndDatePassed` 단일 홈, KST 오늘 계산이 앱에서 주입되어 순수 함수로 유지됨 (`lib/kst-date`)
- auto-settle의 멱등·동시성 안전성: `UPDATE … WHERE status='in_progress' AND end_date<$today` 조건부 갱신이 동시 요청에도 안전함(READ COMMITTED EvalPlanQual)
- PM이 서버 액션을 직접 호출해도 서버가 거부함 (T-04-34, 화면 숨김은 부차적)
- `domain/quotes/edit-scope.ts`가 화면 표시와 게이트 양쪽의 단일 결정 지점
- `copyQuoteLines`가 04-15의 프로젝트 복사에 그대로 재사용됨
- `computeVat`, `toKrw`, `applyTaxRule`이 단일 함수로 재사용됨 (`domain/money`)
- 조정줄이 실행가 합계에 포함되는 불변식이 이미 유지됨 (04-13 invariant)
- `REVENUE_DTO_SPEC`의 paid-amount 역산 필드(잔액·입금총액·발행총액)가 이미 paid-gated
- 0010은 재작성되지 않고, 넘버링 가드가 스크립트화되어 있음; `.squawk.toml`이 세 마이그레이션 모두에서 변경 없이 유지됨
- `projectFilterConditions` 하나로 목록/합계 쿼리가 같은 행 가시성 필터를 공유 (`domain/permissions/scope-for.ts:11`)
- `normalizeSort(viewer)`가 정렬 사이드채널을 이미 차단
- `code-item-form.tsx`의 설명 편집이 admin-only + forbidden + archived 가드로 이미 테스트됨 (T-04-54)
- `tokens.css` diff=0을 보장하는 테스트, SYSTEM.md 토큰 전량 존재 테스트가 이미 있음
- eslint 경계 규칙(`ui→{ui,lib}`, `domain→{domain,repositories,lib}`, `repositories→{repositories,db,domain}`, `app→{app,domain,lib,ui}`)이 실제로 지켜지고 있음 (`eslint.config.mjs`)

## 12개월 이상 대비 위치

Phase 4는 프로젝트에 5단계 상태·자동 정산, 견적 줄 종류(조정/견적 외), 차수와 고객 승인, 파생 계약금·매출, 리저브 원장을 갖춰 "프로젝트·견적·지출결의 해소·손익·인센티브가 하나의 돈 모델"이라는 12개월 이상 목표의 뼈대를 대부분 세운다. 그러나 세 분석이 공통으로 찾아낸 결함들 — 상태 변경과 감사 로그가 원자적이지 않음(A-01), 견적 줄·차수 저장에 락이 없어 오래된 탭이나 위조 요청이 승인된 차수를 조용히 덮어씀(B-01), 고객 승인 후에도 파생 계약금이 조용히 드리프트함(B-07), 돈 합계가 21억 원을 넘으면 죽거나 JS 문자열로 새어나옴(B-18/C-01), 리저브 잔액 체크에 DB 락이 없음(B-05) — 은 정확히 Phase 5 결재, Phase 7 스케줄러, Phase 9 손익, Phase 10 인센티브가 그대로 얹힐 원장 기반 원시 규약(원자적 쓰기, 단일 숫자 타입, 잠긴 차수 소속)이다. 이 기반이 흔들린 채로 다음 페이즈들이 얹히면 조용한 데이터 손상을 물려받거나, 더 급한 상황에서 같은 수정을 다시 해야 한다. 다행히 검토 대상 계획들은 이미 `edit-scope.ts` 단일 결정 지점, 재사용 가능한 `copyQuoteLines`/`computeVat`, DTO 기반 필드 게이팅 같은 수렴 지점을 실제로 마련해 두었으므로, 위 결함들은 지금은 "축 하나" 수준의 비용으로 고칠 수 있고 나중에 아키텍처를 다시 짜야 하는 문제는 아니다.

## 오류·복구 레지스트리

METHOD/CODEPATH | 무엇이 잘못될 수 있나 | 예외/오류 종류 | 복구? | 복구 방법 | 사용자가 보는 것 | 관련 ID
---|---|---|---|---|---|---
[A] `applyAutoSettlement` UPDATE | DB 오류·락 타임아웃 | DB 예외 | N (throws) | read 경로는 log.error 후 저장된 상태 렌더 | GET: 에러 페이지 | A-15
[A] `applyAutoSettlement` 커밋 후 로그 삽입 | `appendActionLog` 실패(커넥션 끊김 등) | DB/네트워크 예외 | N — UPDATE는 이미 커밋 | tx에 optional `tx` 추가, UPDATE+log를 하나의 `withTransaction`으로 | 에러 페이지 한 번, 이후 로그 영구 소실 | A-01
[A] `applyAutoSettlement({})` 다중 행 | k번째 행 로그만 실패 | 위와 동일 | N | 위와 동일 | k+1..N행은 정산됐지만 로그 없음 | A-01
[A] `changeProjectStatus` UPDATE 성공, 로그 실패 | 상태는 바뀌었는데 로그 없음 | DB 예외 | N | A-01 원자화 | 일반 오류 → 재시도 시 "먼저 바꿨습니다" | A-01
[A] `changeProjectStatus` 0행(동시 변경) | 동시 상태변경 충돌 | 낙관적 락 충돌 | Y(`UserFacingError`) | 서브클래스화 필요 | "다른 사람이 먼저 상태를 바꿨습니다" | (A §2 표)
[A] `changeProjectStatus` 오래된 페이지 (`from` 서버 재조회) | 클라이언트가 낡은 상태를 보고 제출 | 로직 오류 | 부분적 | `from`을 액션 스키마에 추가해 `expected`로 사용 | 다른 합법 쌍으로 조용히 성공 가능 | A-11
[A] 게이트 `project.start-date-required` | 시작일 없음 | GateBlockedError | Y | `statusDestinations`가 서버 판단 사유 반환 | 막힘 문자열, 제출 전 비활성은 서버 판정 필요 | A-09
[A] `listProjectStatusCatalog`(non-admin) | `admin.code-tables` 스코프만 허용 | 권한 스코프 오류 | N | `references.ts` 패턴으로 전환 | 선택기·필터 라벨 빈 값 | A-10
[A] period save — PM이 진행에서 종료일 비움 | resolved end=start(과거) → 자동정산 | 순서 오류 | N | `resolvePeriodSave` 출력에 검증/미리보기 적용 | "종료일이 비어 시작일로 저장됨"만 보이고 정산은 조용히 발생 | A-02
[A] period save — 버전 충돌 | 자동정산/전환이 버전을 올림 | 낙관적 락 충돌 | Y(if UserFacing) | 충돌 메시지/클래스 명시 | 메시지 불명 | A-22
[A] period save — 잘못된 달력 날짜 | PG `date` cast 오류 | 22008 | N (generic) | `period.ts`에서 달력 라운드트립 검증 | "처리 중 오류" | A-22
[A] period save — tx 내 상태 되돌림 후 매출 저장 실패 | tx 롤백, 상태 로그는 이미 풀에 커밋 | 트랜잭션/풀 불일치 | N | A-01 원자화 | 아무것도 안 보임; 유령 되돌림 로그 | A-01
[A] ledger pre-judgment가 열린 tx 안에서 실행 | 풀 UPDATE가 같은 tx의 자기 락을 기다림 | 락 대기(PG는 사이클 미검출) | N | `withTransaction` 전에 호출하거나 tx로 전달 | 요청 행/타임아웃 | A-13
[A] `saveQuoteLines` changed-field diff | 숫자/nullable 정규화 불일치 | 로직 오류 | Y(reject) | 정규화된 쓰기 페이로드로 비교 | 잘못된 "정산 · 실행가만 고칠 수 있음" | A-21
[A] `saveQuoteLines` sortOrder | 클라이언트가 안 보내고 서버가 배치 내 index로 씀 | 로직 오류 | N | 기존 행은 sortOrder 유지, 명시값만 재정렬로 취급 | 조용한 재정렬(정산 구조변경 우회) 또는 거짓 거부 | A-03
[A] archive lines — list/sums 필터 누락 | `archived_at IS NULL` 없음 | 쿼리 누락 | N | 목록/합계 쿼리에 `isNull` 추가 | 목록·합계에 보관된 줄 포함 | A-04
[A] line save 중 동시 완료/auto-settle | 게이트~커밋 사이 상태 변경(TOCTOU) | 락 없음 | N | tx 내 `FOR SHARE` 락 | 성공했지만 완료 프로젝트의 줄이 바뀜 | A-06
[A] `quote.line-cap` — 관리자가 캡 낮춘 뒤 | 편집·보관까지 전부 거부 | 로직 오류 | Y(reject) | `newLines>0` 조건 추가 | "상한을 넘어 전부 거부"인데 삭제도 실패 | A-20
[A] archive restore of `quote_line` | 게이트/캡 우회 | 로직 누락 | N | `beforeRestore` 훅 | 완료·정산 총액에 줄 재등장 | A-19
[A] seed on deploy | 관리자 권한 회수를 매 배포마다 덮어씀 | 시드 upsert 로직 | N | `onConflictDoNothing`으로 전환 | 조용한 재부여 | A-05
[A] `recordAction(document_update)` — 풀 삽입, tx는 나중에 롤백 | 트랜잭션 롤백에도 로그 남음 | 트랜잭션/풀 불일치 | N | A-01 원자화(공통) | 유령 로그 | A-01(접힘)
[B] save 조정줄 (PM) | PM이 조정줄 편집·보관·삽입 시도 | GateBlockedError | Y | 게이트가 이미 거부 | "조정 줄 · 경영관리만 고칠 수 있음" | (B §2 표)
[B] save 조정줄 (경영관리, 완료) | 배치 레벨 게이트가 잘못된 이유로 막음 | 로직 오류 | Y(수정 후) | entry-level 체크를 per-line으로 전환 | "완료 · 견적 줄이 잠김"(오답) | B-36
[B] save to 비-current revision | 오래된 탭·위조 요청이 과거/승인된 차수에 씀 | IDOR/락 없음 | N | `FOR UPDATE` 락 + current revision 재확인 | 성공 토스트; 편집이 사라짐 | B-01
[B] save with 다른 프로젝트의 line id | 위조 요청 | IDOR | N | B-01과 동일 락 | 성공 | B-01
[B] createRevision 순차 중복(더블클릭) | 2차 호출이 n+2 차수를 만듦 | 중복 생성 | N | `fromRevisionId`/`expectedSeq` 추가 | 토스트 "{n+2}차" | B-02
[B] createRevision 진짜 동시 | unique(project,seq) 위반 | 23505 | Y(계획대로) | 계획대로 처리 | "다른 사람이 먼저 새 차수를 만들었습니다" | (B §2 표)
[B] createRevision with 편집 중인 내용 | 미저장 입력이 옛 storage key 아래 고아가 됨 | UX 손실 | N | dirty>0이면 모달 버튼 비활성+사유 | 아무것도 안 보임 | B-03
[B] approve future date | 검증 | ValidationError | Y | 계획대로 | 1차 옆 사유, 모달 유지 | (B §2 표)
[B] approve non-current revision | 오래된 탭 | 검증 | Y | 계획대로 | "현재 차수만…" | (B §2 표)
[B] derived contract SUM | bigint가 string으로 옴 | 타입 오류 | N (수정 전) | SQL에서 캐스트 + 숫자 헬퍼 | 잘못된 합계 또는 테스트 실패 | B-18
[B] drop `contract_*` (0014) | 구 리비전이 드롭된 컬럼을 읽음 | 배포 창 불일치 | Y(단일 배포면) | 한 배포로 묶기 + 가드 | 증분 배포 창에서만 500 | B-09
[B] reserve save concurrent | write skew(락 없음) | 동시성 오류 | N | 클라이언트 행에 `FOR UPDATE` | 아무것도 안 보임; 이후 무관한 편집이 거부됨 | B-05
[B] reserve restore | 음수 잔액 | 로직 누락(복원 훅 없음) | N | `restoreReserve`에 잔액체크 | 아무것도 안 보임 | B-04
[B] reserve FX touched | 최근 환율 미갱신 | 로직 누락 | N | `domain/revenue saveEntries` 패턴 미러링 | 다음 기본 환율이 낡음 | B-12
[B] reserve invalid date/amount | PG 오류 | 22008/22003 계열 | 부분적 | zod 검증(fxRate>0, amount>0, iso date) | 일반 오류, 셀 오류 아님 | B-17
[B] project copy out of scope | 위조된 `copyFrom` | 권한 오류 | Y | 계획대로 | 빈 폼, 서버가 id 거부 | (B §2 표)
[C] `repo.aggregateProjects` `::int` | Σ > 2³¹ | 22003 integer out of range | N | `::bigint` 캐스트 + `mapWith(Number)` | 에러 페이지(전체 장애) | C-01
[C] `repo.listProjectsPage` bigint sums | string이 number로 타입됨 | 타입 버그 | N | C-01과 동일 | 콤마 없음·잘못된 산술 | C-01
[C] `page.tsx` teamId / year=0000 | 잘못된 URL 파라미터가 SQL로 직행 | 22P02/22008 | N | uuid shape/연도 clamp, SQL 전에 기본 뷰로 폴백 | 에러 페이지 | C-08
[C] `loadProjectList` → `applyAutoSettlement` | 락/로그 실패(A-01과 동일 계열) | 미상 | N(unspecified) | fail-open + `log.error` | 에러 페이지 | C-09
[C] `clampPage` | NaN, <1, >max | 입력 이상값 | Y | 계획대로 | 첫/마지막 페이지 | (C 표)
[C] `parseListPeriod` | 형식오류/역순/02-30 | 검증 오류 | Y | 계획대로 | 인라인 오류, 필터 무시 | (C 표)
[C] `lib/format-number` | NaN/∞/-0 | 포맷터 미정의 입력 | N | non-finite → "—" | "NaN"/"∞"/"-0.0%" | C-15
[C] `formatNumberInput` (KRW paste "1,234.00") | 소수점 제거되어 ×100 | 파싱 로직 오류 | N | 전체 문자열 파싱, 소수부 비0이면 거부 | 조용한 값 오류 | C-02
[C] cell/revenue commit `Number(x)||0` | 콤마 텍스트 → 0 | 파싱 로직 오류 | N | `stripNumberInput` + `isFinite` 체크, `||0` 제거 | 조용히 0 저장 | C-02
[C] `updateCodeItemDescription` 40자·forbidden·archived | 서버 거부 | ValidationError/Forbidden | Y | 계획대로 | revert + `--danger` 라인 | (C 표)
[C] `CodeItemDescriptionInput` clear | blur 가드가 빈 문자열을 저장 안 함 | 로직 오류(라벨 에디터 복붙) | N | blur 조건에 빈 문자열 포함 | 조용함(새로고침하면 되돌아옴) | C-13
[C] Ctrl+Enter repeat/IME | 이중 제출 | 중복 생성 | N | `e.repeat`/`isComposing`/`isExecuting` 가드 | 프로젝트 두 개 생성 | C-06
[C] paste computed columns | 오류 셀이 지워지지 않음 | 로직 오류(컬럼 매핑) | N | 전체 컬럼 복사 + 계산열은 "무시" 표시 | 저장 막힘, 못 지움 | C-03
[C] `parseTsv` trailing CRLF | 유령 행 생성 | 파싱 버그 | N | trailing linebreak 제거 | 추가 오류 행 / 상한 거부 | C-05
[C] `navigator.clipboard.writeText` | 권한 거부 | 브라우저 권한/보안 컨텍스트 오류 | Y(새 문자열) | native `copy` 이벤트로 전환 | "복사하지 못함 · 다시 Ctrl+C" | C-19

세 그룹 사이에 코드패스가 겹치는 완전 중복 행은 없었다(A=상태 라이프사이클, B=견적/차수/리저브, C=목록/UI가 서로 다른 표면을 다룸). 단 A의 auto-settle 계열과 C의 `loadProjectList → applyAutoSettlement` 행은 같은 근본 결함(A-01)이 다른 호출 지점에서 나타난 것이므로 표에서 관련 ID로 연결해 두었다.

## 실패 모드 레지스트리

RESCUED=N, TEST=N, USER SEES=Silent(또는 사실상 동일한 "조용히 틀림")인 행은 **CRITICAL GAP**로 표시했다. 이는 개별 finding의 severity 라벨(WARNING/DECISION 등)과 별개로, 이 레지스트리 자체의 기계적 판정 기준이다 — 그래서 B-05/B-07/B-21처럼 finding 표에서는 WARNING·DECISION으로 분류된 항목도 여기서는 CRITICAL GAP 행으로 나타난다.

CODEPATH | 실패 모드 | 복구? | 테스트? | 사용자에게 보임? | 로그? | 관련 ID
---|---|---|---|---|---|---
[A] auto-settle: UPDATE 후 행별 로그 | 커밋 후 로그 실패 | N | N | Silent(첫 회는 에러) | N(상태 로그 영구 누락) → **CRITICAL GAP** | A-01
[A] changeProjectStatus: UPDATE 후 로그 | 로그 실패 | N | N | 일반 오류(보임) | 서버 로그만 | A-01
[A] 04-22 revert: tx 내 상태 UPDATE + 풀 로그 | tx 롤백 후에도 로그 존재 | N | N | Silent | 유령 status_change 행 → **CRITICAL GAP** | A-01
[A] 04-22 validate on raw end | PM이 종료일 비움, 시작일<오늘 | N | N | Silent(잘못된 힌트) | system log만 → **CRITICAL GAP** | A-02
[A] 04-12 reorder detect/sortOrder write | 배치 index로 덮어씀 | N | N | Silent reorder | document_update(순서 detail 없음) → **CRITICAL GAP** | A-03
[A] 04-12 archive | 보관된 줄이 목록 합계에 남음 | N | N | Silent wrong totals | archive id만 detail에 존재 → **CRITICAL GAP** | A-04
[A] seed upsert | 관리자 권한 회수가 재부여됨 | N | N | Silent | N(시드는 로그 없음) → **CRITICAL GAP** | A-05
[A] line save vs 동시 완료 | TOCTOU | N | N | Silent(성공) | document_update Y → **CRITICAL GAP**(룰상, 발생확률 낮음) | A-06
[A] list ∥ aggregate | UPDATE 전에 집계 실행 | N | N | 일시적 불일치 합계(다음 로드에 자연 복구) | N → WARNING | A-07
[A] catalog for non-admin | 빈 목록 | N | E2E(간접) | 라벨 누락(보임) | N → WARNING | A-10
[A] cap lowered below count | 락아웃 | Y | N | 사유 표시(보임) | N → WARNING | A-20
[A] restore archived line | 락/캡 우회 | N | N | 줄 재등장(보임) | restore log Y → WARNING | A-19
[A] auto-settle on GET fails | 에러 페이지 | N | N | 에러 페이지(보임) | Next error log → WARNING | A-15
[A] E2E global setting cap=3 | 병렬 스펙 간섭 | — | — | flaky CI | — → WARNING | A-17
[A] E2E literal/boundary dates | 시한폭탄/자정 flake | — | — | flaky CI | — → WARNING | A-18
[B] saveQuoteLines → old revision | 오래된 탭이 새 차수 이후에도 저장 | N | N | Silent(성공) | N(document_update만) → **CRITICAL GAP** | B-01
[B] saveQuoteLines foreign line id | 위조 페이로드가 완료/정산 락 우회 | N | N | Silent | N → **CRITICAL GAP** | B-01
[B] createRevision 순차 중복 | 더블클릭/오래된 탭 | N | N(Promise.all 테스트가 racy) | Silent-ish(토스트가 엉뚱한 차수 표시) | Y(document_create) → **CRITICAL GAP** | B-02
[B] createRevision with 편집 중인 내용 | 입력 유실(UX-04 위반) | N | N | Silent | N → **CRITICAL GAP** | B-03
[B] reserve restore of 출금 | 과거 날짜가 음수가 됨 | N | N | Silent | Y(restore) → **CRITICAL GAP** | B-04
[B] reserve concurrent saves | write skew로 음수 잔액 | N | N | Silent | Y(update) → **CRITICAL GAP**(기계적 판정; finding 표에서는 B-05 DECISION) | B-05
[B] approved revision edited | 파생 계약금 드리프트 | N | N | Silent(라벨은 여전히 "승인됨") | Y(줄 변경만) → **CRITICAL GAP**(기계적 판정; finding 표에서는 B-07 DECISION) | B-07
[B] restore of archived adjustment after new revision | 줄이 안 보이고 안 세어짐 | N | N | Silent | Y(restore) → **CRITICAL GAP**(기계적 판정; finding 표에서는 B-21 WARNING) | B-21
[B] PM adjustment edit | 거부됨 | Y | Y | 오류 셀(보임) | N(B-26) | (B §2a 표)
[B] paid-amount leak to PM | 키 존재 여부 | Y | Y(key-set) | 안 보임(정상) | n/a | (B §2a 표)
[B] copy drags revenue/adjustments | 이중 계산 | Y | Y | n/a | Y | (B §2a 표)
[B] derived contract with prior approval | 폴백 | Y | Y | "—" + 대기(보임) | n/a | (B §2a 표)
[C] aggregateProjects money `::int` | 21억 초과 시 integer out of range | N | N | 에러 페이지(전체 장애, 보임) | stderr만 | C-01
[C] list row bigint→string | 타입 오류, 콤마 없음, concat 위험 | N | N | Silent | N → **CRITICAL GAP** | C-01
[C] formatNumberInput KRW decimal paste | ×100 값 변경 | N | N | Silent | N → **CRITICAL GAP** | C-02
[C] numeric commit `\|\|0`(수량·단가·매출) | 콤마 텍스트 → 0 | N | 부분적(실행가만) | Silent | N → **CRITICAL GAP** | C-02
[C] CodeItemDescriptionInput clear | 저장 안 됨 | N | N(UI) | Silent | N → **CRITICAL GAP** | C-13
[C] Copy→paste computed columns | 오류 셀이 고착 | N | N(E2E 실패 예상) | 저장 막힘(보임) | N | C-03
[C] Paste order vs display order | 엉뚱한 행에 값이 채워짐 | N | N | dirty marker(다른 페이지면 안 보일 수 있음) | N | C-04
[C] Excel trailing CRLF | 유령 행 | N | N | 오류 셀/캡 거부(보임) | N | C-05
[C] Ctrl+Enter double submit | 프로젝트 중복 생성 | N | N | 행 두 개(보임) | action_log ×2 | C-06
[C] teamId/year hostile params | PG 오류 | N | N | 에러 페이지(보임) | stderr | C-08
[C] auto-settle in list GET | 쓰기 실패 | N | N | 에러 페이지(보임) | stderr | C-09
[C] payment rows in 매출 | 입금액 누출(필터 회귀 시) | 코드로 방어됨 | N | 누출되면 Silent | N | C-14
[C] formatter NaN/∞ | 쓰레기 텍스트 | N | N | "NaN"/"∞"(보임) | N | C-15
[C] E2E year at New Year UTC | flaky test | — | — | CI red | — | C-17
[C] clampPage | 범위 밖 | Y | Y | 마지막 페이지 | N(정상) | (C 표)
[C] parseListPeriod | 무효 입력 | Y | Y | 인라인 오류 | N(정상) | (C 표)

**CRITICAL GAP 행 수: 19 / 전체 행 수: 43** (A 15행 중 7 CRITICAL, B 12행 중 8 CRITICAL, C 16행 중 4 CRITICAL).

## 다이어그램 목록

| # | 유형 | 파일 | 헤딩 |
|---|---|---|---|
| 1 | architecture(컴포넌트/의존성) | 부록 A (ceo-review-A.md) | ### 1.1 Component / dependency diagram (after 04-26) |
| 2 | state machine | 부록 A | ### 1.2 State machine (5 states) |
| 3 | data flow | 부록 A | ### 4.1 Auto-settle (read-time) with shadow paths |
| 4 | data flow | 부록 A | ### 4.2 Period save (04-22) with shadow paths |
| 5 | deploy sequence | 부록 A | ## 9. Deployment (deploy.sh 다이어그램) |
| 6 | rollback | 부록 A | ## 9. Deployment — Rollback flowchart |
| 7 | architecture | 부록 B (ceo-review-B.md) | ## 1. Architecture |
| 8 | data flow | 부록 B | ## 1a. Data flow with shadow paths |
| 9 | state machine | 부록 B | ## 1b. State: revision and approval |
| 10 | error flow | 부록 B | ## 1c. Error flow |
| 11 | deploy sequence | 부록 B | ## 9. Deployment |
| 12 | rollback | 부록 B | ## 9. Deployment — Rollback flowchart |
| 13 | architecture | 부록 C (ceo-review-C.md) | ## 1. Architecture |
| 14 | data flow | 부록 C | ## 2. Data flow, including shadow paths (list + totals) — 목록/합계 흐름 |
| 15 | data flow | 부록 C | ## 2. Data flow — Quote-table paging data flow |
| 16 | error flow | 부록 C | ## 3. Error flow |
| 17 | deploy sequence | 부록 C | ## 4. Deploy sequence |
| 18 | rollback | 부록 C | ## 5. Rollback flowchart |
| 19 | user flow | 부록 C | ## 6. User flow — list and paging |

총 19개(부록 A 6개, 부록 B 6개, 부록 C 7개).

## 낡은 다이어그램 점검

세 분석 파일 자체는 실제 코드베이스 안의 기존 ASCII 다이어그램(주석이나 docs)이 Phase 4로 인해 낡는지는 다루지 않았다. 그래서 `.planning/phases/04-project-quote-ledger/04-{06..26}-PLAN.md`의 `files_modified` 21개 계획 전체를 수집해, 거기 나열된 파일들에서 박스-드로잉 문자(`─│┌└├`)나 `-->`/`+--` 패턴을 grep했다.

결과: 소스 코드(`domain/`, `repositories/`, `app/`, `ui/`) 안에는 다이어그램이 전혀 없었다. 매치는 `docs/design/SYSTEM.md`(04-08의 `files_modified`에 포함됨)와 `domain/settings/keys.ts`(04-14/04-26이 수정) 두 파일뿐이었다.

- **`domain/settings/keys.ts` 10행, 56행** — `── … ──` 형태지만 실제 다이어그램이 아니라 주석 구분선(섹션 헤더 장식)이다. 점검 대상에서 제외.
- **`docs/design/SYSTEM.md` §6-0 공통 셸** (274-290행, TopBar 데스크톱/모바일 와이어프레임, ⌘K 및 "이동 Tab · 범위 복사 ⌘C/⌘V · 취소 Esc · 저장 ⌘S" 힌트 줄 포함) — **계획 이후에도 정확한가? no.** C-07이 바로 이 힌트 줄을 근거로 지적한다: TopBar의 ⌘K는 죽은 표시로 남고(F-03), 등록 폼의 Esc는 핸들러가 없으며, Tab·Ctrl+C는 04-19(17웨이브 뒤)까지 연결되지 않는다.
- **`docs/design/SYSTEM.md` §6-2 상세 화면(프로젝트 상세 = 견적 원장)** (357-374행) — **계획 이후에도 정확한가? no.** 같은 힌트 줄 문제(C-07)를 그대로 갖고 있고, 04-06/09/11/12/13/14/19/21/22/23/24/26이 추가하는 상태 바꾸기 버튼, 기간 칸, 차수 섹션, 조정 줄 그룹, 상한 경고, 페이지네이션, 고객 승인 표시 중 어느 것도 이 와이어프레임에는 그려져 있지 않다.
- **`docs/design/SYSTEM.md` §6-1 목록 화면(원장 패턴)** (320-354행) — **계획 이후에도 정확한가? no.** 이 절의 본문(353행)은 "페이지네이션 대신 「더 보기 50건」 3차 버튼"이라고 명시하는데, 04-17 계획은 실제로 URL 기반 번호 페이지네이션(`ui/pagination/Pagination.tsx`, `page-window.ts`, `?page=N`, C-27의 "1,…,3,4,5,…,12" 페이지 창)을 만든다 — 세 분석 어디에도 지적되지 않은, 이번 grep에서 새로 발견한 불일치다.
- 참고: `docs/ARCHITECTURE.md`는 이번 phase 계획들의 `files_modified`에는 없지만(작업 지침 예시로 언급됐기에 가볍게 확인), domain/money·domain/rules/gate.ts 경로를 가리키는 계층 다이어그램이 있다 — 세 분석이 검증한 실제 파일 위치와 일치해 **정확함(yes)**으로 보이나, 이 phase가 그 파일을 건드리지 않으므로 별도 확인은 하지 않았다.

**낡음 점검 요약: 다이어그램/와이어프레임 3개(§6-0, §6-1, §6-2, 모두 `docs/design/SYSTEM.md`)를 확인했고, 3개 모두 "no"(계획 이후 부정확) — §6-0/§6-2는 C-07의 키보드 힌트 문제, §6-1은 이번 grep으로 새로 찾은 "더 보기 버튼 vs 실제 번호 페이지네이션" 불일치.**

## 범위 밖 (NOT in scope)

이연(TODOS.md에 기록):
- 목록 상단 2px 로딩 막대 — 사용자 D17 「만들지 않고 기록」. SYSTEM.md §1-3 `--accent` 사용처 제한과 충돌, 디자인 잔여 퀵 태스크로.
- 자동 정산 예약 작업(Cloud Scheduler) — 사용자 D19-8. Phase 7 Scheduler 기반에서 같은 판정 함수를 호출.

범위 밖으로 정해진 것(TODO 아님):
- 진행→미수주 수동 전환 — 사용자 D13 「없음 유지」.
- 리저브 잔액의 외화 기준 관리 — 사용자 D19-1(원화 기준 유지, 우회 방법 문서화).
- D-92 손익·인센티브의 연도 기준 — Phase 9·10에서 재결정(04-17은 연도 합계를 저장하지 않는다는 제약만 따른다).
- 04-03 데이터 이관 — 사용자 보류(다음 세션).

## 구현 작업

이 리뷰의 승인 결과를 GSD 계획 파일(04-06~04-26)에 반영하는 작업이다. 반영은 gsd-planner 수정 모드로 하고 plan-checker로 다시 검증한다(CLAUDE.md: 리뷰 결과는 GSD 계획 파일에 반영). 각 항목의 상세 근거·수정안은 부록 A·B·C의 해당 ID.

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — 상태 전환 — 상태 변경과 action_log를 한 트랜잭션으로(appendActionLog·recordAction에 선택적 tx)
  - Surfaced by: 섹션 2 — A-01
  - Files: 04-06·04-11·04-20·04-22 PLAN
  - Verify: 이력 쓰기 실패를 주입한 통합 테스트에서 상태가 롤백되는지
- [ ] **T2 (P1, human: ~4h / CC: ~20min)** — 견적 줄 저장 — 프로젝트 행 배타 잠금(FOR UPDATE), 현재 차수·줄 소속·projectId/revisionId 일치 검사, 두 연결 경합 테스트(동시 삽입·승인 대 저장·새 차수 대 저장)
  - Surfaced by: 섹션 4 — A-06, A-14, B-01, OV-3
  - Files: 04-12·04-14·04-26 PLAN
  - Verify: 두 연결 결정적 경합 테스트에서 301번째 줄·잠긴 줄 수정이 거부되는지
- [ ] **T3 (P1, human: ~2h / CC: ~10min)** — 새 차수 — 사용자가 본 차수 id를 싣고 불일치 거부, 대기 중 버튼 비활성, 저장 안 한 편집이 있으면 차단
  - Surfaced by: 섹션 4 — B-02, B-03
  - Files: 04-14·04-24 PLAN
  - Verify: 중복 제출·오래된 탭 시나리오 통합 테스트, 편집 중 모달 차단 E2E
- [ ] **T4 (P1, human: ~2h / CC: ~10min)** — 승인 차수 — 수량·단가·견적가 칸 잠금 + 승인 합계를 바꾸는 모든 조작(삽입·취소·보관·복원) 서버 거부, 실행가는 편집 가능
  - Surfaced by: 섹션 1 — B-07(D7), OV-1
  - Files: 04-12·04-14·04-16·04-24 PLAN
  - Verify: 승인 차수에 대한 각 조작의 거부 통합 테스트, 계약 금액 = 승인 합계 불변식 테스트
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** — 보관함 복원 — 견적 줄·리저브 복원이 도메인 검사(잠금·상한·승인 합계·잔액)를 한 트랜잭션에서 통과
  - Surfaced by: 섹션 3 — A-19, B-04, OV-2
  - Files: 04-12·04-07 PLAN
  - Verify: 완료 프로젝트 줄·음수 잔액을 만드는 출금 복원이 거부되는지
- [ ] **T6 (P1, human: ~2h / CC: ~10min)** — 목록 합계 — 돈 합계 bigint 캐스트 후 number로 변환, 보관 줄·보관 프로젝트 제외(모든 사용자)
  - Surfaced by: 섹션 2·7 — C-01, A-04, C-21(D18)
  - Files: 04-17·04-18 PLAN
  - Verify: 합계 2^31 초과 통합 테스트, 보관 줄·프로젝트 제외 테스트
- [ ] **T7 (P1, human: ~2h / CC: ~10min)** — 숫자 입력 — 쉼표 문자열 전체 파싱, 잘라내지 말고 거부, `|| 0` 제거
  - Surfaced by: 섹션 2·4 — C-02
  - Files: 04-09 PLAN
  - Verify: `1,234.00`·`1,234`·`abc` 입력 단위·E2E 테스트
- [ ] **T8 (P1, human: ~1h / CC: ~5min)** — 권한 시드 — 시스템 관리자 외 계급은 없을 때만 넣기(관리자 회수 유지)
  - Surfaced by: 섹션 9 — A-05
  - Files: 04-20 PLAN
  - Verify: 회수 후 시드 재실행 통합 테스트
- [ ] **T9 (P1, human: ~2h / CC: ~10min)** — 기간 저장 — PM 규칙을 resolvePeriodSave 결과로 판정(종료일 비움→과거 시작일 경로 차단), D14 기본값, 기간 변경 이력 기록
  - Surfaced by: 섹션 3 — A-02, A-16, D14
  - Files: 04-22 PLAN
  - Verify: PM이 종료일을 비워 정산을 일으키는 시나리오 거부 테스트
- [ ] **T10 (P1, human: ~2h / CC: ~10min)** — 정산 편집 — 정산에서 PM은 실행가 수정 + 새 줄 추가(견적 칸 0 잠금), 삭제·순서 이동·새 차수 거부, sortOrder 미전송 시 보존
  - Surfaced by: 섹션 1·5 — A-03, A-26(D10), A-26a(D12)
  - Files: 04-12·04-23 PLAN
  - Verify: 정산 상태 허용·거부 매트릭스 통합 테스트
- [ ] **T11 (P1, human: ~4h / CC: ~20min)** — 팀 범위 권한 — 계급에 「업무 범위: 자기 팀/전사」 칸(마이그레이션), 오늘 기준 발령 이력으로 소속 팀 판정, 상태 전환·기간 수정·버튼 표시가 한 규칙 사용
  - Surfaced by: 섹션 3 — A-27(D11), OV-4(D20)
  - Files: 04-20·04-21·04-22 PLAN (+ 계급 설정 화면)
  - Verify: 다른 팀 팀장의 전환·기간 수정 거부, 본부장 허용 통합 테스트
- [ ] **T12 (P1, human: ~3h / CC: ~15min)** — 리저브 — 9번째 클라이언트 열(첫 저장 후 잠금), 클라이언트별 행 잠금 + 잔액 검사, 날짜 단위 잔액 검사
  - Surfaced by: 섹션 1·4 — B-05(D5), B-06(D6), B-11(D19-2)
  - Files: 04-07 PLAN
  - Verify: 동시 출금 경합 테스트, 같은 날 입·출금 순서 테스트
- [ ] **T13 (P2, human: ~30min / CC: ~5min)** — 고객 승인 게이트 — 미수주 면제
  - Surfaced by: 섹션 1 — B-08(D8)
  - Files: 04-14 PLAN
  - Verify: 미수주 프로젝트 게이트 통과 테스트
- [ ] **T14 (P2, human: ~2h / CC: ~10min)** — 마이그레이션 — 0014 DROP에 RAISE 가드, ARCHITECTURE §5 예외·「Phase 4 한 번에 배포」 제약을 DECISIONS에 기록, 0010 상태 옛 데이터 업그레이드 테스트(재시드 전 검사)
  - Surfaced by: 섹션 9 — B-09(D9), OV-6
  - Files: 04-06·04-16 PLAN
  - Verify: settled→completed·기존 행 보존·가드 거부 업그레이드 테스트
- [ ] **T15 (P2, human: ~2h / CC: ~10min)** — 붙여넣기 — 계산 열 무시 + 건너뛴 수 안내, 통화 다르면 경고, 04-19 뒤 실제 엑셀 최종 확인(checkpoint:human-verify)
  - Surfaced by: 섹션 4 — C-03(D15), OV-7(D21)
  - Files: 04-19 PLAN
  - Verify: 프로젝트 간 복사·붙여넣기 E2E, 사람 확인
- [ ] **T16 (P2, human: ~1h / CC: ~5min)** — 실행 순서 — 견적 표와 무관한 플랜의 04-04 의존 제거, 웨이브 재배치
  - Surfaced by: 섹션 10 — OV-7(D21)
  - Files: 04-06~04-26 PLAN frontmatter, ROADMAP Phase 4 Plans 블록
  - Verify: plan-checker 의존·웨이브 검증
- [ ] **T17 (P2, human: ~1h / CC: ~5min)** — 문서 — REQUIREMENTS·ROADMAP 세 곳 문구(D16), DECISIONS에 로딩 막대 충돌(D17), SYSTEM.md `↵`·남은 `⌘` 정리, 화면에 표시된 단축키가 실제로 동작, SYSTEM.md §6-0·§6-1·§6-2 ASCII 도식 갱신(§6-1 「더 보기」→번호 페이지)
  - Surfaced by: 섹션 11 — C-07, C-12(D16), C-10(D17)
  - Files: 04-08 PLAN
  - Verify: `⌘`·`↵` grep 0건, 표시 단축키 E2E
- [ ] **T18 (P2, human: ~6h / CC: ~30min)** — 나머지 — 부록 A·B·C의 WARNING·NOTE 사실 정정 전부(D4 「일괄 적용」)와 D19 저위험 기본값 11항목
  - Surfaced by: 섹션 1~11 — 부록 A·B·C
  - Files: 해당 PLAN
  - Verify: 반영 후 plan-checker PASS

## 완료 요약

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | Phase 4 스키마 미배포(main=0008), 선행 버그 5건 |
  | Step 0               | HOLD SCOPE, 확장 없음, 결정 21건 전부 답변   |
  | Section 1  (Arch)    | 9 issues found                              |
  | Section 2  (Errors)  | 14 error paths flagged, 6 CRITICAL           |
  | Section 3  (Security)| 25 issues found, 2 CRITICAL                  |
  | Section 4  (Data/UX) | 34 edge cases, 3 CRITICAL                    |
  | Section 5  (Quality) | 3 issues found                              |
  | Section 6  (Tests)   | 부록에 도식, 5 gaps                           |
  | Section 7  (Perf)    | 1 issue found                               |
  | Section 8  (Observ)  | 5 gaps found                                |
  | Section 9  (Deploy)  | 12 risks flagged                            |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | 9 issues, 1 CRITICAL                         |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                            |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| written (부록 A·B·C 병합)                     |
  | Failure modes        | 43 total, 19 CRITICAL GAPS (전부 승인된 수정안 있음, 플랜 반영 대기) |
  | TODOS.md updates     | 2 items (승인된 이연)                          |
  | Scope proposals      | 0 (HOLD SCOPE)                              |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex, completed (7 findings, 7 resolved)   |
  | Lake Score           | 8/9 recommendations chose complete option (D10만 6/10 선택) |
  | Diagrams produced    | 19 (architecture, data flow, state, error, deploy, rollback, user flow) |
  | Stale diagrams found | 3 (SYSTEM.md §6-0·§6-1·§6-2 → T17)          |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

역행 가능성 4/5: 0014 DROP만 되돌리기 어렵지만 미배포 상태라 데이터 손실이 없고, 나머지는 마이그레이션 추가로 되돌릴 수 있다. 부채 2건: 읽을 때 자동 정산(Phase 7에서 예약 작업으로), 로딩 막대 미구현.

### Unresolved Decisions

없음. 21건 모두 사용자 답변 또는 그 답의 범위 안의 사실 정정으로 처리했다.

---

# 부록 A — 상태·정산 플랜 분석 (04-06·04-20·04-21·04-11·04-22·04-12·04-26)

# CEO Review (HOLD SCOPE) — Group A: project status lifecycle

Plans: 04-06 · 04-20 · 04-21 · 04-11 · 04-22 · 04-12 · 04-26 (waves 6→12)
Scope lock: D-75~D-95 (04-CONTEXT.md 「2026-09-23 추가 결정」) + superseded markers.
Method: read all 7 plans in full; verified claims against the real code at HEAD `b510b8a`
(domain/rules/*, domain/viewer.ts, domain/action-log/record.ts, repositories/{projects,action-log,quote-lines,permissions,code-tables,archive}.ts,
domain/{projects,quotes,seed,code-tables,archive,permissions}/*, app/(app)/projects/**, db/schema, db/migrations 0009, scripts/deploy.sh,
playwright.config.ts, vitest.config.ts, eslint.config.mjs) and the relevant 04-UI-SPEC / 04-RESEARCH ranges.
No repo file was edited.

Severity legend: CRITICAL GAP / WARNING / NOTE. Class: (a) FACT-CORRECTION (plan contradicts a locked decision or real code, or leaves a gap whose remedy is determined) · (b) DECISION (user must choose) · (c) ALREADY-COVERED.

---

## 0. Summary counts

| | CRITICAL | WARNING | NOTE | total |
|---|---|---|---|---|
| (a) FACT-CORRECTION | 6 | 16 | 13 | 35 |
| (b) DECISION | 0 | 3 | 1 | 4 |
| (c) ALREADY-COVERED | 0 | 0 | 6 | 6 |
| total | 6 | 19 | 20 | 45 |

CRITICAL GAPs: A-01 · A-02 · A-03 · A-04 · A-05 · A-06. DECISIONs: A-24 · A-25 · A-26 · A-27.

---

## 0G. Complexity check

| Plan | files | new modules/"services" | verdict |
|---|---|---|---|
| 04-06 | 12 | 1 data module (`status-transitions.ts`) | OK — migration + gate swap must be atomic in one plan (Pitfall 5); cannot shrink. |
| 04-20 | 11 | 1 (`domain/projects/status.ts`) | OK. Two new menu keys justified (04-02 `projects.revenue` precedent). |
| 04-21 | 13 | 2 (`status-change.tsx`, `status-display.ts`) | Churn: builds `statusControl: ReactNode` that 04-22 T3 immediately replaces with `statusChangeProps` (A-31). Decide the prop shape once in 04-21. |
| 04-11 | 14 | 3 (`lib/kst-date`, `auto-transition`, `responsibles`) | `AUTO_TRANSITIONS` one-row table is borderline over-abstraction but serves ROADMAP 기준 4; accept. |
| 04-22 | 13 | 2 (`period.ts`, `period-field.tsx`) | OK; pure-function split is what makes hint==server (개정 ⑨). |
| 04-12 | 14 | 1 (`edit-scope.ts`) | OK, but the plan builds reorder detection on a field the client never sends (A-03). |
| 04-26 | 9 | 0 (setting key + gate + count fn) | OK. |

All seven exceed 8 files, but every file traces to D-75~D-86; no plan adds a >2-service surface. Fewer moving parts: (1) a single `loadProjectForGate(viewer,id,{now,tx})` helper (pre-judge + locked read) would replace four hand-placed `applyAutoSettlement` calls and fix A-06/A-13/A-14 together (A-33); (2) 04-21/04-22 prop churn (A-31).
Stated invariants that the plans do NOT actually keep as written: "status_change 로그 한 줄 / 같은 트랜잭션" (A-01), "PM은 종료일로 진행→정산을 일으킬 수 없다" (A-02), "서버도 순서 변경을 거부" (A-03), "삭제 = 보관" totals (A-04), "기본값" permissions (A-05), "완료 잠금" under concurrency (A-06).

## 0I. Temporal interrogation (implementer's day)

- Hour 1 (foundations): 04-06 migration is straightforward (0009 guard pattern is real, lines 91-124). 04-20 finds `appendActionLog` has no `tx` parameter (repositories/action-log.ts:20-36) — the "UPDATE → recordAction" sequence it's told to write is two autocommits (A-01). 04-12 finds `CellEditability` lives in `ui/table/types.ts` and domain may not import `ui` (eslint.config.mjs:46) (A-32).
- Hours 2-3 (ambiguities): Where exactly does 04-22's pre-judgment run — before `withTransaction` or inside it (A-13)? How does the modal disable 1차 *before* submit while showing "the gate string verbatim" (A-09)? What does "sortOrder가 바뀐 기존 줄" mean when the client never sends sortOrder (A-03)? How to compare DB numeric strings to client numbers for "바뀐 칸" (A-21)? Which viewer/scope reads the `project_status` code table for 팀장 (A-10)? What message/class for period version conflict (A-22 note)?
- Hours 4-5 (integration surprises): 팀장 has no 「일괄 저장」 button (quote-table.tsx:843 requires `editable||canWriteContract||canWriteEntries`) so 04-22's E2E fails; 완료 PM still gets the button via `canWriteContract` so 04-12's E2E fails (A-12). 04-11 lands and 04-21's E2E (literal past dates like the UI-SPEC example `2026-09-18`) flips 진행→정산 — 04-11 must edit a spec not in its files_modified (A-18). 04-26's E2E flips a global setting while other spec files run in parallel (A-17). Archived lines keep appearing in the table and in list totals (A-04).
- Hour 6+ (what they'll wish was planned): atomic status+log with an optional outer tx (A-01, also Phase 5's approval hand-off A-23); a period-edit audit row (A-16); a clamp for `effectiveOn` (A-08); the restore path for archived lines respecting the lock/cap (A-19); a rollback note for 0012 (A-28).

---

## 1. Architecture

### 1.1 Component / dependency diagram (after 04-26)

```
 app/(app)/projects/page.tsx ───────────► domain/projects/index.ts ──► listProjects ──┐ (pre-judge)
   (Promise.all: listProjects ∥ aggregateProjects)  ▲ aggregateProjects (NO pre-judge, A-07)
                                                    │
 app/(app)/projects/[id]/page.tsx ─► findProject ───┤──► domain/projects/auto-transition.ts ──► repositories/projects.settleOverdueProjects
   │  statusDestinations / listProjectStatusCatalog │        applyAutoSettlement(opts,{now})         (UPDATE…WHERE status='in_progress'
   │  lastStatusChangeOn ─► repositories/action-log.findLatestActionFor      │                          AND end_date < $todayKst RETURNING)
   │  projectResponsibles ─► org/teamAtDate + permissions                    └──► domain/action-log/record.recordAction(SYSTEM_VIEWER)
   │  periodEditRights / previewPeriodChange (pure)                                   └──► repositories/action-log.appendActionLog (db, NO tx)  ◄── A-01
   │  lineCellEditability / structuralEditability / quoteTableEmptyState (pure)
   ▼
 quote-table.tsx (client QuoteLedger) ── status-change.tsx ── changeProjectStatusAction ─► domain/projects/status.changeProjectStatus
   │   period-field.tsx (imports domain/projects/period.ts — pure)                         ├─ applyAutoSettlement (pre-judge)
   │                                                                                       ├─ gate(project.transition) / gate(project.start-date-required)
   │                                                                                       ├─ repositories/projects.updateProjectStatusIfCurrent
   │                                                                                       └─ recordAction(status_change)   (separate autocommit, A-01)
   └── saveProjectLedgerAction ─► domain/projects/ledger.saveProjectLedger
                                   ├─ applyAutoSettlement (pre-judge, 04-22)      ◄── keyed by input.projectId (A-14), placement ambiguous (A-13)
                                   └─ withTransaction(tx):
                                        saveQuoteLines(tx) ─ reads project via POOL, unlocked (A-06)
                                          ├─ gate(project.line-edit, per changed field / insert / archive / reorder)  ─► domain/quotes/edit-scope.ts
                                          ├─ gate(quote.line-cap) ─► repositories/quote-lines.countActiveLinesByRevision
                                          ├─ repositories/quote-lines.update/insert/archiveQuoteLines
                                          └─ recordAction(document_update)  (pool, inside open tx — phantom on rollback)
                                        saveRevenue(tx) ─ updateProjectContract (row lock on projects)
                                        period: gate(project.period-edit) → updateProjectPeriodIfVersion(tx)
                                                → [정산→진행] updateProjectStatusIfCurrent(tx) + recordAction(status_change, human)  (pool!, A-01)
                                   └─ after commit: applyAutoSettlement (진행 + past end → 정산, system)

 Shared data (no cycles): domain/projects/status-transitions.ts (PROJECT_STATUSES, ALLOWED_TRANSITIONS, AUTO_TRANSITIONS)
   ◄── domain/rules/register.ts (project.line-edit, project.transition, project.start-date-required, project.period-edit, quote.line-cap)
   ◄── domain/projects/status.ts, auto-transition.ts, period.ts
 Settings: domain/settings/keys.QUOTE_LINE_MAX_PER_REVISION (no cache — registry.ts:68-90)
 Permissions: menus projects.status / projects.complete; seed upserts on every deploy (A-05)
```

Coupling hot spots: `quote-table.tsx` (1,007 lines) is modified by 04-21, 04-11, 04-22, 04-12, 04-26 in five consecutive waves. `domain/rules/register.ts` gains 4 rules across 4 plans. `saveQuoteLines` is modified by 04-06, 04-12, 04-26. Single points of failure: `applyAutoSettlement` on every list/detail GET (A-15); `appendActionLog` (no tx) for the always-on audit type (A-01); the `project_status` code table (admin can deactivate values, A-10).

### 1.2 State machine (5 states) — who, how, what prevents invalid transitions (server-side)

```
                 projects.status(W) + start_date (gate start-date-required); end:=coalesce(end,start)
     ┌────────────────────────────────────────────────────────────────────────────┐
     │                                                                            ▼
 ┌────────┐  projects.status(W)   ┌──────┐            SYSTEM (read-time, end_date < todayKST)    ┌────────┐
 │ 수주중 │──────────────────────►│미수주│            actor=null, detail.trigger=end_date_passed  │  정산  │
 │bidding │                       │ lost │────┐     ┌──────────────────────────────────────────►│settling│
 └────────┘                       └──────┘    │     │                                            └────────┘
   │  ▲ (no auto on overdue; D-81 "종료일 지남")│     │                                              │    │
   │  │                                         │ projects.status(W)+start_date                     │    │ projects.complete(W)
   │  └─ (none)                                 ▼     │                                              │    │ (대표·sysadmin; Phase 5 = approval)
   │                                         ┌──────────────┐   period save by lead: new end ≥ today │    ▼
   └────────────────────────────────────────►│     진행      │◄─────────────────────────────────────┘ ┌────────┐
                                             │ in_progress  │  (D-80, human actor, trigger=end_date_  │  완료  │
                                             └──────────────┘   extended; via 기간 칸 — NOT 상태 바꾸기)│completed│
                                               no human exits (⚠S7 default, A-24)                      └────────┘
                                                                                                        terminal (D-47)
INVALID (all rejected by gate project.transition "이 상태로 바꿀 수 없습니다 · 새로 고쳐 주세요"):
  진행→수주중 · 진행→미수주 · 진행→정산(human) · 정산→미수주 · 정산→진행(via 상태 바꾸기) · 완료→* · X→X · 수주중→정산/완료
Prevented by: zod enum(PROJECT_STATUSES) → ALLOWED_TRANSITIONS pair lookup → menu check (can) → conditional UPDATE WHERE status=expected.
Gaps: expected = server-read status, not client-observed (A-11); human 정산→진행 uses the period gate (projects.status) — PM blank-end path can reach 진행→정산 (A-02).
Lock semantics per state (04-06/04-12): 수주중/진행/미수주 = full edit · 정산 = 실행가 only, no structure · 완료 = nothing (경영관리 조정 줄 04-13).
```

### 1.3 Security boundaries per new mutation

| Mutation | Caller (server check) | Can change | Row scope |
|---|---|---|---|
| `changeProjectStatusAction` (04-20) | `projects.status` W (4 human pairs) / `projects.complete` W (정산→완료) | status (+ end_date fill) | `scopeFor` = all/none only (scope-for.ts:11) → any team's lead (A-27) |
| auto-settle (04-11) | any GET of list/detail + transition + save; actor SYSTEM | status 진행→정산 of ALL overdue rows (list) | n/a (deterministic) |
| period save (04-22) | assigned PM (수주중/진행/미수주, end ≥ today in 진행) or `projects.status` W | start/end, 정산→진행 | same; projectId from client not tied to revisionId (A-14) |
| quote line save/archive (04-12/26) | `projects` W; per-cell & structural gate; cap | 실행가 only in 정산; archive = `archived_at` | revision-bound archive (good); read of project unlocked (A-06) |
| seed (04-20) | deploy job | re-grants role defaults every deploy (A-05) | — |

### 1.4 Rollback posture
Migration 0012 is forward-only (no down). Cloud Run rollback (`scripts/rollback.sh`) moves traffic only; DB stays migrated. Code-level rollback is safe only if the previous revision predates Phase 4 projects code (A-28). Gate/permission/UI changes are reversible by redeploy; menu keys `projects.status`/`projects.complete` are costly to rename (permission rows reference them).

---

## 2. Error & Rescue map (registry)

| Codepath | What can go wrong | Rescued? | User sees | Gap? |
|---|---|---|---|---|
| `applyAutoSettlement` UPDATE | DB error / lock | N — throws | GET: error page (A-15) | WARNING A-15 |
| `applyAutoSettlement` log after UPDATE commit | `appendActionLog` fails (conn drop, pool timeout) | N — throws after UPDATE committed; next call finds 0 rows | error page once, then silent; **log permanently missing** | **CRITICAL A-01** |
| `applyAutoSettlement({})` multi-row | log #k fails | N | rows k+1..N settled with no log | **CRITICAL A-01** |
| `changeProjectStatus` UPDATE ok, log fails | status changed, no log | N | generic "처리 중 오류" → retry → "먼저 바꿨습니다" | A-01 |
| `changeProjectStatus` 0 rows | concurrent change | Y (UserFacing) | "다른 사람이 먼저 상태를 바꿨습니다" | must be `UserFacingError` subclass or user sees generic msg |
| `changeProjectStatus` stale page | server re-reads `from` | partial | may silently succeed on a different pair (A-11) | WARNING |
| gate `project.start-date-required` | no start date | Y | 막힘 string, modal open — but pre-submit disabled state needs server verdict (A-09) | WARNING |
| `listProjectStatusCatalog` | non-admin viewer → `[]` (code-tables scope) | N | empty labels/descriptions in picker & filter | WARNING A-10 |
| period save — PM blank end in 진행 | resolved end = past start → auto-settle | N | hint says only "종료일이 비어 시작일로 저장됨"; project becomes 정산 | **CRITICAL A-02** |
| period save — version conflict | auto-settle/transition bumped version | Y if UserFacing | message unspecified (A-22 note) | NOTE |
| period save — invalid calendar date | PG `date` cast error | N (generic) | "처리 중 오류" | WARNING A-22 |
| period save — status revert inside tx, later revenue fails | tx rollback; status_change log already on pool | N | nothing; **phantom revert log** | A-01 |
| ledger pre-judgment inside open tx | pool UPDATE waits on tx's own row lock → hang (no PG deadlock detection) | N | request hangs / timeout | WARNING A-13 |
| `saveQuoteLines` changed-field diff | numeric/nullable normalization mismatch | Y (reject) | false "정산 · 실행가만 고칠 수 있음" | WARNING A-21 |
| `saveQuoteLines` sortOrder | client omits; server writes `index` | N | **silent reorder** (정산 structural bypass) or false reject | **CRITICAL A-03** |
| archive lines | list/sums not filtered | N | archived lines in list totals | **CRITICAL A-04** |
| status read in line save | concurrent 완료/auto-settle between gate & commit | N | success; line changed in 완료 | **CRITICAL A-06** (rubric; low likelihood) |
| `quote.line-cap` after admin lowers cap | every save (even edits/archives) rejected | Y (reject) | "상한을 넘어 전부 거부 · 줄을 지워 주세요" yet deleting fails | WARNING A-20 |
| archive restore of quote_line | bypasses gate/cap | N | line reappears in 완료/정산 totals | WARNING A-19 |
| seed on deploy | overwrites admin permission revocations | N | silent re-grant | **CRITICAL A-05** |
| `recordAction` document_update inside ledger tx | pool insert, tx later rolls back | N | phantom log (pre-existing pattern) | NOTE (folded in A-01) |

Catch-alls: `handleServerError` converts every non-`UserFacingError` into the generic message and logs it (lib/actions/handle-server-error.ts) — fine as a backstop, but new domain errors (`"다른 사람이 먼저 …"`, period conflict, `SaveRejectedError` period field errors) must subclass `UserFacingError` or the specified copy never reaches the user.

## 2b. Failure Modes registry

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---|---|---|---|
| auto-settle: UPDATE then per-row log | log insert fails after UPDATE commit | N | N | error once, then Silent | N (status_change row missing forever) → **CRITICAL** |
| changeProjectStatus: UPDATE then log | log fails | N | N | generic error while status changed | server log only |
| 04-22 revert: status UPDATE in tx + log on pool | tx rolls back after log insert | N | N | Silent | phantom status_change row → **CRITICAL (A-01)** |
| 04-22 validate on raw end | PM blanks end, start < today | N | N | Silent (wrong hint) | only system log → **CRITICAL** |
| 04-12 reorder detect / sortOrder write | sortOrder overwritten by batch index | N | N | Silent reorder | document_update (no order detail) → **CRITICAL** |
| 04-12 archive | archived rows counted in list sums | N | N | Silent wrong totals | archive id in detail |→ **CRITICAL** |
| seed upsert | admin revocation re-granted | N | N | Silent | N (seed not logged) → **CRITICAL** |
| line save vs concurrent 완료 | TOCTOU | N | N | Silent (success) | document_update Y → **CRITICAL by rubric** (low likelihood) |
| list ∥ aggregate | aggregate before UPDATE | N | N | transient inconsistent totals | N → WARNING (self-heals next read) |
| catalog for non-admin | empty list | N | E2E (indirect) | missing labels | N → WARNING |
| cap lowered below count | lockout | Y | N | reason shown | N → WARNING |
| restore archived line | bypass lock/cap | N | N | line reappears | restore log Y → WARNING |
| auto-settle on GET fails | error page | N | N | error page | Next error log → WARNING |
| E2E global setting cap=3 | cross-file interference | — | — | flaky CI | — → WARNING |
| E2E literal/boundary dates | time bomb / midnight flake | — | — | flaky CI | — → WARNING |

---

## 3. Security & threat model

- Role gates match the locked decisions: 수주중/미수주 transitions = `projects.status` (팀장·본부 책임자·대표 seeded; 경영관리 by admin) ✓ D-46; 정산→완료 = `projects.complete` (대표 + sysadmin via all-menu loop) ✓ D-79; 정산→진행 only via period save with `projects.status` ✓ D-80; 정산 PM = 실행가 only ✓ D-78; system actor for 진행→정산 ✓ D-76.
- Server re-judges everything (zod enum, gate, `can`) — screen hiding is secondary ✓.
- IDOR: `scopeFor` is all/none (domain/permissions/scope-for.ts:11), so any holder of `projects.status` acts on any team's project (A-27 DECISION). `saveProjectLedger` trusts `projectId` and `revisionId` independently (A-14). Archive ids are revision-bound in the repo ✓ (04-12 T-04-59).
- Forged payloads: 04-12's "compare against DB current values, not baseline" is right, but reorder detection is unimplementable as written (A-03) and diffing needs normalization (A-21).
- Audit trail: `status_change` is always-on (record.ts:65-72 ✓), but not atomic with the state change (A-01); period edits unlogged (A-16); `findLatestActionFor` must not drop pruned rows (A-30). SYSTEM_VIEWER writes `actorRoleId='role-sysadmin'` — role-based log filters can confuse system with sysadmin (fold into A-39 note).
- Input validation: dates need real-calendar validation (A-22); `lineStatus` is a free string (pre-existing, A-37) while 04-12 gives `cancelled` money semantics; `projectId` not uuid-validated (pre-existing → PG cast error → generic message).
- Privilege persistence: seed overwrites admin changes each deploy (A-05).

## 4. Data flow & interaction edge cases

### 4.1 Auto-settle (read-time) with shadow paths
```
INPUT  GET /projects or /projects/[id]  (or action: changeProjectStatus / saveProjectLedger)
  │
  ▼ now() (real clock in prod/E2E; deps.now in unit/integration)
VALIDATION  kstToday(now) → 'YYYY-MM-DD'  ── nil path: none (pure)
  │
  ▼
TRANSFORM/PERSIST  UPDATE projects SET status='settling',version+1 WHERE status='in_progress' AND end_date IS NOT NULL
                     AND end_date < $todayKst AND archived_at IS NULL [AND id=ANY($ids)] RETURNING id,end_date
  ├─ empty path: 0 rows → no log (idempotent) ✓
  ├─ concurrent path: 2nd UPDATE blocks, re-evaluates, 0 rows ✓ (READ COMMITTED EvalPlanQual)
  ├─ error path: throws → GET error page (A-15)
  ▼
LOG   for each row: recordAction(SYSTEM_VIEWER, status_change, {from,to,trigger,effectiveOn=end+1})
  ├─ error path: UPDATE already committed → log lost forever (A-01 CRITICAL)
  ├─ semantic path: effectiveOn < previous transition date (entered 진행 after end date) (A-08)
  ▼
OUTPUT  list rows / DTO with status='settling'; subtitle `정산 {effectiveOn}`
  └─ shadow: parallel aggregateProjects read before UPDATE → totals disagree with rows on this render (A-07)
```

### 4.2 Period save (04-22) with shadow paths
```
INPUT  {projectId, period:{start,end,version}, quoteLines?, revenue?}
  ├─ nil: period absent → only pre-judge + existing save
  ├─ invalid date '2026-02-30' → must be rejected in period.ts (A-22)
  ▼ pre-judge applyAutoSettlement([projectId])   (must be BEFORE withTransaction — A-13; keyed on projectId — A-14)
VALIDATION  rights = periodEditRights(status, isAssignedPm, can(projects.status))
            errors = validatePeriodChange(raw start/end)   ◄── must run on resolvePeriodSave() output (A-02)
  ├─ none rights → "기간을 고칠 권한이 없습니다"
  ├─ errors → SaveRejectedError(field errors) → whole batch rejected, U-6 line
  ▼ withTransaction
PERSIST  updateProjectPeriodIfVersion(version) ── conflict → UserFacing conflict (copy unspecified)
         [정산 & end ≥ today] updateProjectStatusIfCurrent(settling→in_progress) + recordAction(human)  ── on pool (A-01)
         saveQuoteLines(tx) / saveRevenue(tx)
  ▼ commit
POST     applyAutoSettlement([projectId])  ── 진행 + end<today → 정산 (system log) ── not linked to the human who shortened (A-16)
OUTPUT   {quoteLines, revenue} (+ page revalidate → tag/subtitle)
```

### 4.3 Async ordering scenarios (required)

1. Two requests at KST 00:00 (list + detail): both UPDATE; one wins; one log — ✓ (given A-01 atomicity).
2. Human transition vs auto-settle: 진행 has no human exits; 정산→완료 vs auto-settle cannot conflict (different `from`). 수주중→진행 with a past end date: human log (today) then system log with `effectiveOn = end+1` (earlier) → subtitle shows a date before the project even entered 진행 (A-08).
3. PM saving 실행가 while the row flips to 정산: 04-22 pre-judgment flips it first → gate evaluates 정산 → 실행가 accepted, other cells rejected with `정산 · 실행가만 고칠 수 있음` (not silent). Client `cellEditability` is stale until reload — the rejection copy should nudge reload (A-34 note). ms-window where pre-judge runs at 23:59:59.999 and commit lands after midnight, or 대표 completes concurrently: line written into 정산/완료 (A-06).
4. Quote save vs 대표 정산→완료: status read via pool, unlocked (lines.ts:365-375) → TOCTOU (A-06).
5. 팀장 revert (정산→진행) vs 대표 complete: version/status-conditional updates serialize correctly ✓ (one gets conflict).
6. Double-click on 1차: second request → "이 상태로 바꿀 수 없습니다" (misleading but harmless) unless the button is disabled while executing (A-34 note).
7. Stale page submit: A closes 수주중→미수주; B (stale 수주중 view) clicks 진행 → server reads 미수주, pair 미수주→진행 is legal → B silently revives A's decision (A-11).
8. Navigate away with dirty period field: joins the ledger dirty count; whatever unsaved-changes guard QuoteLedger has applies (not verified — no guard found by grep; NOTE only).
9. Admin lowers the cap under current count: every save rejected (A-20). Two PMs add lines concurrently: cap exceeded by one batch (A-36 note).

## 5. Code quality

- DRY: pre-judge-then-read is repeated at 4 call sites now, more later (04-14 new revision, 04-15 copy) → `loadProjectForGate` (A-33). `listProjectStatusCatalog` must reuse the references.ts pattern, not the admin-gated `listCodeItems` (A-10). `projectResponsibles` reused by 04-22/04-12 ✓. `isEndDatePassed` single home ✓.
- Naming: `project.line-edit`, `project.transition`, `project.start-date-required`, `project.period-edit`, `quote.line-cap` consistent ✓. `trigger` values `end_date_passed`/`end_date_extended` ✓; human 04-20 transitions have no `trigger` (A-39 note: add `trigger:"manual"` for uniform queries).
- Over/under-engineering: `AUTO_TRANSITIONS` (one row) is acceptable ceremony. Under-engineered: atomicity (A-01), locking (A-06).
- Branching >5: `quoteTableEmptyState` (5 priorities × roles) and `lineCellEditability` are table-driven per plan ✓; `validatePeriodChange` has 4 rules — keep it ordered and resolved-value based (A-02).
- Boundaries: domain may not import `ui` (A-32).

## 6. Tests

| Behavior | Unit | Integration | E2E | Missing / risk |
|---|---|---|---|---|
| 0012 remap + guards | — | (f) catalog = seed | — | guard untested by design (SQL presence check) ✓ acceptable |
| line-edit completed/lost | rules-gate | (g) | 04-21 (d) | ✓ |
| 4 human transitions × roles | decision table | (a)-(e),(h) | 04-21 (a)-(c),(e) | stale-submit (A-11); log-failure atomicity (A-01) |
| destinations/catalog | decision table | — | picker rows | catalog with non-admin viewer (A-10); blocked reason (A-09) |
| auto-settle boundary/idempotent/system actor | kst-date + stubs | (a)-(e),(f),(h) | first case | log failure (A-01); aggregate race (A-07); effectiveOn clamp (A-08) |
| overdue indicator | isEndDatePassed table | — | two variants + "=today" | "=today" E2E flakes at KST midnight (A-18) |
| period rights/validation/preview/resolve | 4 tables | (a)-(g) | several | blank-end PM bypass (A-02); invalid calendar date (A-22); period audit row (A-16); mismatched projectId (A-14) |
| 정산 cell scope, structure, archive, cancel | edit-scope tables | several | quote-edit-scope | sortOrder preservation (A-03); archived excluded from list/sums (A-04); restore bypass (A-19); normalization (A-21) |
| cap | — | 4 behaviors + bypass | disabled + paste | lowered-cap lockout (A-20); global-setting E2E interference (A-17); restore after failure (try/finally) |

Time injection: unit/integration inject `deps.now` ✓; E2E cannot (real server clock) → all E2E fixtures must be relative to `kstToday(new Date())` with ≥1-day margins; equality boundaries stay in unit/integration (A-18). Current date is 2026-09-23, so the UI-SPEC example `2026-09-18` is already past.
Hostile QA would write: blank end + past start as PM in 진행; edit 3rd line's 실행가 only in 정산 and reload order; archive a line and compare list 실행가 total; lower cap to 1 then try to delete; restore an archived line into a 완료 project; open two tabs, close as 미수주 in one, click 진행 in the other; revoke 팀장 `projects.status` then redeploy; send projectId of project A with revisionId of project B at 00:00:01.

## 7. Performance

- Every list GET runs one UPDATE (0 rows normally) — uses `projects_status_idx`; row locks only when rows match; ~125 projects/yr → negligible (T-04-81 accept ✓). A partial index `(end_date) WHERE status='in_progress'` is unnecessary at this scale (NOTE, not proposed).
- `findLatestActionFor` uses `action_log_type_occurred_idx` (action_type, occurred_at) with a backward scan filtered by entity_id; status_change volume ~hundreds/yr → fine.
- Detail page adds ~5 small queries (catalog, destinations/can×2, responsibles, last change) — fine; keep them in `Promise.all`.
- 04-12: per-line gate calls are in-memory; `linkedDocumentsByLine` single query ✓; no N+1. 04-26 count query per save ✓.
- Write amplification: read-time UPDATEs are bounded by overdue rows (each flips once). The 04-22 post-commit call is one extra UPDATE per save ✓.
- Potential N+1 outside group: if 04-18 calls `projectResponsibles` per list row. Flag for group owning 04-18.

## 8. Observability

- Auto-transition: action_log row per flip with `trigger` and `effectiveOn` ✓ — but loss on failure (A-01); no app log/metric (A-39).
- Denied transitions: intentionally not in action_log (T-04-38) ✓; add one structured `log.info({event:"project.transition.denied", from,to,reason})` so "why couldn't the CEO complete X" is answerable (A-39).
- Reconstruct 3 weeks later "why is X in 정산 since 9/16?": needs the end-date edit history → not logged (A-16). "Who made X 정산?" → system log exists but the human cause (lead shortened end date) is not linked (A-16).
- Timezone: all timestamps are `timestamp without time zone` (e.g., db/schema/action-log.ts:27); Drizzle reads them as UTC; correctness depends on DB session TimeZone=UTC → make it an assertion, not a SUMMARY note (A-29).

## 9. Deployment

```
deploy.sh main (scripts/deploy.sh:653-677)
 build_and_push_image → deploy_jobs → db-bootstrap → migrate(0011..0015 incl. 0012) → seed(upserts permissions!) → deploy_service(100% traffic) → smoke ─┬─ ok → done
                                                                                                                                           └─ fail → rollback.sh (traffic only; DB stays)
```
- 0012 safety: guards RAISE on unknown values (no silent delete) ✓; remap is UPDATE (+version) ✓; `SET LOCAL lock_timeout/statement_timeout` pair ✓ (convention verified in 0000-0002). Short row locks only.
- Backward compat while the old revision serves (between migrate and deploy_service, or after a traffic rollback): old gate `project.completed-lock` checks `status === "settled"` (register.ts:58) → with 'completed' rows nothing is locked; old labels show raw values. Harmless iff Phase 4 ships as one deploy and the previous revision has no project screens. Whether 04-01/02/05 were deployed to staging is UNKNOWN — shipper must check the serving APP_GIT_SHA (A-28).
- Seed runs every deploy and overwrites role permission rows (A-05).

Rollback flowchart:
```
Problem after deploy?
 ├─ smoke failed → rollback.sh auto → previous revision
 │     └─ previous revision contains 04-01..05 code? ── no → OK (Phase 3 has no projects UI)
 │                                                   └─ yes → completed rows unlocked in old gate; forward-fix preferred
 └─ found later → prefer forward-fix (new revision). If code rollback is unavoidable:
        manual reverse (lossy): UPDATE projects SET status='settled' WHERE status IN ('settling','completed');
        restore code_items row 'settled' / delete settling, completed; re-sort lost=3 — document in 04-06 SUMMARY (A-28)
```

## 10. Long-term

| Item | Debt | Reversibility (1=one-way … 5=trivial) |
|---|---|---|
| 5 status values + strings `settling`/`completed` | Phase 5/9/10 depend | 2 |
| menu keys `projects.status`/`projects.complete` | permission rows reference | 3 |
| read-time auto-settle | Phase 7 scheduler calls `applyAutoSettlement({})` — clean IF atomic (A-01) | 4 |
| period rules / rights defaults | pure functions | 4 |
| edit-scope table | pure | 4 |
| cap setting | setting key | 5 |
| seed-overwrite semantics | silently undoes admin policy | 3 (A-05) |

Phase 7 hand-off: the scheduler job is a thin caller ✓ (no viewer param, SYSTEM_VIEWER inside). Phase 5 hand-off: approval must be able to call `changeProjectStatus` inside its approval transaction without modifying the function → needs an optional outer `tx` now (A-23, folded into A-01's remedy).

## 11. Design / UX

| Surface | FEATURE | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL | Notes |
|---|---|---|---|---|---|---|---|
| 상태 바꾸기 (04-21) | ✓ | `…` on 1차 ✓; "other buttons disabled" and "300ms 2px bar" (UI-SPEC S7) not in plan text | no destinations → no button ✓ | gate string, modal stays, no toast ✓ | toast `상태 바꾸기 · X` ✓ | #destinations 0/1/2 ✓ | pre-submit disabled 1차 needs server verdict (A-09); double-submit (A-34) |
| 기간 칸 (04-22) | ✓ | n/a (server-rendered) ✓ | `기간 미정` ✓ | Form.Error + U-6 ✓ | 600ms tint, no toast ✓ | preview hint ✓ but wrong for blank-end (A-02) | focus return after close unspecified (A-34) |
| 종료일 지남 (04-11) | text not tag ✓, words not color-only ✓ | — | hidden when not overdue ✓ | — | — | PM variant with lead name ✓ | list variant is 04-18 (outside group) |
| 정산 표 (04-12) | ✓ aria-readonly ✓ | — | 5 EMPTY variants ✓ | cell reasons ✓ | `저장됨` ✓ | lock line ✓ | save-button condition (A-12) |
| 상한 (04-26) | ✓ disabled + reason | — | — | total-row reason ✓ | — | paste all-or-nothing ✓ | — |

Keyboard: Esc/Enter/Ctrl+S per S13 ✓; Ctrl labels per D-94 ✓; native dialog focus trap (RowSheet precedent) ✓. SYSTEM.md alignment: color map matches UI-SPEC 287-300 and `StatusTag` kinds (ui/status-tag/StatusTag.tsx:6) ✓; dates without commas (D-95) ✓; no new tokens ✓.

---

## Findings

### CRITICAL GAPs

**A-01 · §2/§3/§8/§10 · 04-11 T1④ · 04-20 T1③ · 04-22 T1③(d) · CRITICAL GAP · (a) FACT-CORRECTION**
Evidence: `appendActionLog` always uses the pool `db` and has no `tx` parameter (repositories/action-log.ts:20-36); `recordAction` has no tx either (domain/action-log/record.ts:118-145). Plans sequence "conditional UPDATE → recordAction" as two autocommits (04-20 ③, 04-11 ④) and 04-22 claims the revert log is in "같은 트랜잭션" — impossible with current code. Consequences: (i) auto-settle: UPDATE commits, log insert fails → the WHERE clause guarantees the row is never re-selected, so the status_change row is lost forever (D-50 always-on, D-76 "로그 한 줄" violated silently; `lastStatusChangeOn` falls back to created_at); (ii) human transition: status changed, user sees generic error, retry says "먼저 바꿨습니다"; (iii) 04-22: revert log written on the pool while the ledger tx is still open → phantom log if the tx later rolls back.
Remedy: add optional `tx?: DbOrTx` to `appendActionLog` and pass-through in `recordAction` (deps or param); run UPDATE+log in one `withTransaction` in `applyAutoSettlement` and `changeProjectStatus`; 04-22 passes the ledger tx. Add `repositories/action-log.ts`, `domain/action-log/record.ts` to 04-20 files_modified (first plan that needs it). Rescue: log failure rolls back the status change → state unchanged, write paths surface generic error, read paths per A-15. Verification: integration tests with `deps.recordAction` throwing → DB reread shows status unchanged (auto + human); 04-22 batch where revenue save throws after a revert → no status_change row and status still 정산. Visibility: server `log.error` via handleServerError; action_log remains truthful.

**A-02 · §2/§3/§4 · 04-22 T2① (validatePeriodChange/previewPeriodChange) · CRITICAL GAP · (a) FACT-CORRECTION**
Evidence: rule "진행 + 권리 pm + 새 종료 < 오늘 → 거부" is evaluated on the raw input; with end blank, `resolvePeriodSave` sets end = start (D-82). A PM in 진행 with a past start date blanks the end date → saved end < today → post-commit auto-settle → 정산, which the PM cannot undo. This is exactly prohibition 2 ("PM이 종료일 한 칸으로 … 진행 → 정산을 일으켜서는 안 된다") and ⚠S13 default 2. Preview returns only `종료일이 비어 시작일로 저장됨`, never `저장하면 정산이 됨` → silent. Integration (b) only tests "어제로 앞당기면".
Remedy: validate and preview on `resolvePeriodSave(...)` output (resolved start/end); when both "blank→start" and "→정산" apply, the preview shows `저장하면 정산이 됨` (the consequential fact). Verification: unit decision rows (진행·pm·start<today·end blank → `종료일은 오늘부터 …`), integration (b2) DB unchanged, E2E optional. Visibility: Form.Error on the end field + U-6.

**A-03 · §3/§4 · 04-12 T2② ("sortOrder가 바뀐 기존 줄을 reorder로") · CRITICAL GAP · (a) FACT-CORRECTION**
Evidence: the client never sends `sortOrder` (quote-table.tsx:502-519; `moveLine` marks only the moved line dirty, 439-451); the server writes `sortOrder: input.sortOrder ?? index` where `index` is the position within the *dirty* batch (domain/quotes/lines.ts:489) and the UPDATE writes it (repositories/quote-lines.ts:111). So today every save of an existing line resets its order (pre-existing 04-04 bug), and in 정산 a legitimate 실행가-only save either silently reorders the line (structural change the lock was meant to block) or, if the diff uses `?? index`, is falsely rejected as reorder.
Remedy: server keeps the current `sortOrder` for existing rows when `input.sortOrder` is undefined; client sends explicit `sortOrder` (full-list position) only for new/moved rows; reorder = `input.sortOrder !== undefined && input.sortOrder !== current.sortOrder`. Verification: integration — 정산, change 실행가 of line 3/3 → saved, DB sortOrder unchanged; 진행 regression — edit line 3, reload, order unchanged; crafted sortOrder in 정산 → rejected. Visibility: gate reason in total row.

**A-04 · §2/§4 · 04-12 T2③ (archive) · CRITICAL GAP · (a) FACT-CORRECTION**
Evidence: `listQuoteLinesByRevision` has no `archived_at IS NULL` (repositories/quote-lines.ts:11-18); list/aggregate sums `lineSumsSubquery` sum all lines (repositories/projects.ts:27-38); `findQuoteLinesByIds` returns archived rows (updates to archived lines succeed). 04-12 does not list repositories/projects.ts. Its E2E ("새로 고쳐도 없다") will force fixing the detail list, but list/aggregate money totals (견적·실행가·수익금, D-87/D-88) keep counting archived lines — silent wrong totals.
Remedy: add `isNull(quoteLines.archivedAt)` to the list query, `lineSumsSubquery`, and reject updates to archived ids; add repositories/projects.ts to 04-12 files_modified. Verification: integration — archive a line → `aggregateProjects` and `listProjects` 실행가 exclude it; restore → included. Visibility: totals correct; archive log detail keeps ids.

**A-05 · §3/§9 · 04-20 T1① (seed) · CRITICAL GAP · (a) FACT-CORRECTION**
Evidence: `deploy.sh` runs `run_seed` on every deploy (scripts/deploy.sh:666-669); `upsertPermission` uses `onConflictDoUpdate … set allowed` (repositories/permissions.ts:48-51); the admin permission screen writes the same rows (domain/permissions/matrix.ts:89-113). 04-20 adds 팀장/본부 책임자/대표 grants of `projects`, `projects.status`, `projects.complete` through this path → an admin revocation (e.g., 본부 책임자 status rights) is silently re-granted at the next deploy. D-46 calls these 「기본값」 (defaults, admin-overridable). Pre-existing mechanism (04-01 role-pm grant) now extended to privileged menus.
Remedy: seed non-sysadmin role defaults with insert-if-absent (`onConflictDoNothing`) — new repo fn `insertPermissionIfAbsent`; keep upsert only for the sysadmin all-menu loop. Verification: integration — set team-lead `projects.status`=false via `setPermissionCell`, rerun `seedMasterData`, assert still false; fresh DB still gets the defaults. Visibility: permission_change log remains the only writer of changes.

**A-06 · §1/§4 · 04-12 T1③ · 04-22 T1③(a) · CRITICAL GAP (by rubric; low likelihood) · (a) FACT-CORRECTION**
Evidence: `saveQuoteLines` reads the project on the pool without lock and outside the ledger tx (domain/quotes/lines.ts:365-375, repositories/projects.ts:211-215). A concurrent 정산→완료 (04-20) or a midnight auto-settle can commit between the gate and the line writes → line edits land in a 완료 (or 정산) project; D-47 lock broken; the save reports success.
Remedy: inside the ledger tx, `SELECT … FROM projects WHERE id=$1 FOR SHARE` (new repo fn taking tx) and evaluate all project gates on that row; status UPDATEs then serialize behind the save. Combine with A-33 helper. Verification: integration with a deps hook between gate and write that runs `changeProjectStatus` to 완료 on another connection → assert completion waits or save is rejected (never both). Visibility: gate reason `완료 · 견적 줄이 잠김`.

### WARNINGs

**A-07 · §4 · 04-11 T2② · WARNING · (a)** — List page runs `listProjects` and `aggregateProjects` in parallel (app/(app)/projects/page.tsx:83-87); only `listProjects` pre-judges → totals and rows can disagree on the first render after midnight (self-heals next load). Remedy: call `applyAutoSettlement({})` once before the parallel reads (or inside `aggregateProjects` too). Test: integration — aggregate with status filter after an overdue fixture equals list count when aggregate is called first. Visibility: consistent totals.

**A-08 · §4/§11 · 04-11 T1④⑤, 04-22 T2 (c) · WARNING · (a)** — `effectiveOn = end+1` can precede the project's previous transition (수주중→진행 on 9/23 with end 9/10 → subtitle `정산 2026-09-11`), contradicting D-50 「마지막 변경일」. Remedy: `effectiveOn = max(addDays(end,1), kstDateOf(previous status_change occurredAt))` computed at settle time. Test: integration — that scenario shows `정산 2026-09-23`. Visibility: subtitle.

**A-09 · §11/§2 · 04-20 T2② (statusDestinations) · 04-21 T3①(a) · WARNING · (a)** — UI-SPEC S7 requires the 1차 disabled *before* submit with the gate string verbatim; `statusDestinations` returns only destinations, so the client would have to invent the reason (violates "화면이 이유를 따로 만들지 않는다"). Remedy: return `{ to, blockedReason: string|null }` computed by running `project.start-date-required` server-side. Test: unit table + E2E (a). Visibility: disabled 1차 + reason.

**A-10 · §5/§2 · 04-20 T2② (listProjectStatusCatalog) · 04-21 T2④ · WARNING · (a)** — read_first points to `domain/code-tables/index.ts listCodeItems`, which gates on `admin.code-tables` view (scopeFor) and returns `[]` for 팀장/대표/PM (repositories/code-tables.ts:17). Also admins can deactivate/archive `project_status` values (domain/code-tables/index.ts:103-121) → active-only lookup loses labels. Remedy: follow `domain/projects/references.ts` pattern (gate `projects` view, repo call with scope all, `includeInactive: true` for label lookup; picker/filter restricted to `PROJECT_STATUSES`). Test: integration with team-lead viewer returns 5 entries; deactivate `settling` → 정산 project still labeled 「정산」.

**A-11 · §4 · 04-20 T1③⑤ · WARNING · (a)** — Action input is `{projectId,to}`; `expected` is the server-read status, so a stale page can silently perform a different legal pair (e.g., revive a project a colleague just closed). The truth "동시에 전환하면 … 먼저 바꿨습니다" only holds for simultaneous requests. Remedy: add `from` (client-observed) to the action schema and use it as `expected`. Test: integration sequential stale case → "다른 사람이 먼저 상태를 바꿨습니다". Visibility: modal error.

**A-12 · §11 · 04-22 T1④ · 04-12 T1④/T3 · WARNING · (a)** — Save button renders only when `editable || canWriteContract || canWriteEntries` (quote-table.tsx:843): 팀장 (no `projects` W) cannot save period edits; 완료 PM still sees 1차 via `canWriteContract` (and contract is editable in 완료 until 04-16). Remedy: server computes `canSave = anyEditableCell || periodRights≠none || canWriteEntries || (contract editable && status≠완료)`; lock contract in 완료 in 04-12. Test: existing E2Es plus explicit acceptance lines.

**A-13 · §2/§4 · 04-22 T1③(a) · WARNING · (a)** — Pre-judgment placement is ambiguous. If called inside the `withTransaction` callback after the tx locked the project row (e.g., `updateProjectContract`, repositories/projects.ts:275-291), the pool UPDATE waits on the tx's own lock → request hangs (PG sees no cycle). Remedy: state "before `withTransaction`" (or pass `tx`); with A-06 run pre-judge + `FOR SHARE` read inside tx using tx. Test: integration (g) with contract + period in one batch completes.

**A-14 · §3 · 04-22 T1③ · WARNING · (a)** — `saveProjectLedger(viewer, projectId, {quoteLines:{revisionId}})` never checks that the revision belongs to `projectId` (domain/projects/ledger.ts:77-88); pre-judgment and period rights use `projectId`, line gates use the revision's project. Remedy: assert `revision.projectId === projectId` first (UserFacing reject). Test: crafted mismatch → reject, no writes.

**A-15 · §2 · 04-11 T1⑤, T2② · WARNING · (a)** — A DB error in the read-time pre-judgment turns list/detail GETs into error pages. Remedy (after A-01): read paths catch → `log.error({event:"project.auto_settle_failed"})` → render stored state; write paths keep failing closed (they pre-judge again). Test: unit with `deps.settle` throwing → `findProject` returns and logger called.

**A-16 · §8 · 04-22 T1③ · WARNING · (a)** — Period edits are not logged; when a lead shortens 진행's end date the only record is a SYSTEM status_change → "who caused 정산?" is unanswerable (the inverse of prohibition 1's rationale). Remedy: `recordAction(document_update, entity project, detail {startDate:{from,to}, endDate:{from,to}})` in the ledger tx, and add `{endDate:{from,to}}` to `end_date_extended` detail. Test: integration (a),(c) assert rows.

**A-17 · §6 · 04-26 T1⑤/T2① · WARNING · (a)** — E2E sets the global cap to 3; Playwright runs spec files in parallel (playwright.config.ts:50 `fullyParallel:false`, no `workers:1`), so quote-table/other specs can hit cap 3 → flaky; a mid-test failure leaves the persistent test DB at 3. Remedy: E2E uses a 300-line SQL fixture at the default cap (or a dedicated serial Playwright project); integration keeps setting mutation with try/finally. 

**A-18 · §6 · 04-21 T1④/T3(e) · 04-11 T3③ · WARNING · (a)** — Fixtures with literal or boundary dates become time bombs once 04-11 adds read-time settling (UI-SPEC example `2026-09-18` is already past); "종료일 = 오늘" E2E flakes at KST midnight (E2E can't inject `now`). Remedy: all 진행 fixtures use `end = kstToday(new Date()) + 7`; equality boundaries only in unit/integration; add test/e2e/project-lifecycle.spec.ts to 04-11 files_modified if adjustments are needed.

**A-19 · §3 · 04-12 T2③ · WARNING · (a)** — Registering `quote_line` in `ARCHIVABLE_TABLES` exposes it to the generic restore (domain/archive/index.ts:70-86), which has no per-entity hook → restoring into 정산/완료 bypasses D-78/D-47 and the D-86 cap. Remedy: optional `assertRestorable(viewer,id)` on `ArchivableEntry`; quote_line runs `project.line-edit` insert + `quote.line-cap`. Test: integration restore into 완료 → rejected.

**A-20 · §2 · 04-26 T1③ · WARNING · (a)** — Gate rejects whenever `countAfter > cap`, so after an admin lowers the cap below the current count every save (even pure edits and partial deletions) fails, while the copy says "줄을 지워 주세요". D-86 restricts *adding*. Remedy: reject only when `newLines > 0 && countAfter > cap` (or `countAfter > max(cap, countBefore)`). Test: cap 3 with 5 lines — edit passes, archive 1 passes, add 1 rejected.

**A-21 · §4 · 04-12 T1③ · WARNING · (a)** — Changed-field diff compares DB numeric strings/nulls to client numbers/undefined (lines.ts:479-505 normalizes with `toFixed`, fx strings) → false "changed" → spurious 정산 rejections. Remedy: build the normalized write payload first and diff payload columns vs DB columns with the same normalizers. Test: 정산 save with only 실행가 changed where fx `1350` vs `"1350.0000"`, qty `2` vs `"2.00"`, note null vs undefined → passes.

**A-22 · §3 · 04-22 T1③ (schema) · T2① · WARNING · (a)** — `YYYY-MM-DD` regex accepts `2026-02-30`; PG `date` cast fails → generic error. Also the period version-conflict copy/class is unspecified. Remedy: calendar round-trip check in `period.ts` (field error `날짜 형식이 아닙니다 …`); conflict = `UserFacingError` "다른 사람이 먼저 기간을 바꿨습니다 · 새로 고쳐 주세요". Test: unit rows.

### DECISIONs (user must choose)

**A-24 · §1 · 04-20 probe_fallback / UI-SPEC ⚠S7 · WARNING · (b) DECISION** — 진행 has no human exit. A contract that breaks after 수주 cannot become 미수주 (its costs stay project costs, Phase 10). Options: (A) keep default — 0 effort; broken deals end as 정산→완료 with no revenue; (B) add `진행→미수주` (`projects.status`) — 1 data row + tests + existing Destructive copy (~1h). Recommendation: A for Phase 4 (HOLD SCOPE), revisit with real data — but confirm explicitly.

**A-25 · §3 · 04-22 probe_fallback / ⚠S13 · NOTE · (b) DECISION** — Period edit rights defaults (수주중·진행·미수주 = assigned PM + `projects.status`; 정산 = `projects.status` only; 완료 = none; PM in 진행 cannot shorten below today). Options: (A) accept; (B) PM may shorten too (reopens the PM→정산 path the prohibition forbids). Recommendation: A (consistent with D-46/D-78); the A-02 fix applies either way.

**A-26 · §1 · 04-12 probe_fallback / D-78 「Claude 해석(계획 검토 때 확인)」 · WARNING · (b) DECISION** — D-78 itself requires confirmation at plan review: 정산 locks add/delete/move/duplicate/new revision. Options: (A) accept lock (as planned; late-found costs go through 경영관리 조정 줄 D-83 or 팀장 extends end date → 진행); (B) allow delete→`취소` only; (C) allow PM to add lines in 정산 (structure changes after the event). Recommendation: A.

**A-27 · §3 · 04-20 T1① / D-46 「각 기획팀의 팀장까지만」 · WARNING · (b) DECISION** — `projects.status` is global: `scopeFor` returns all/none (domain/permissions/scope-for.ts:11), so team B's 팀장 can transition, revert or re-date team A's projects. Options: (A) global (as planned, 0 effort, fully logged); (B) team-bound for 팀장 via `teamAtDate(project.teamId)` in `project.transition`/`periodEditRights` with 본부 책임자·대표 exempt — needs a rank notion the code lacks (moderate effort, more tests). Recommendation: A for 10-30 people, confirm the reading of D-46.

### NOTEs (FACT-CORRECTION unless stated)

- **A-23 · §10 · 04-20 reversibility · NOTE** — Phase 5 must call `changeProjectStatus` inside its approval tx "without modifying the function"; needs an optional outer `tx` now (delivered by A-01's remedy).
- **A-28 · §9 · 04-06 · NOTE** — 0012 is forward-only; traffic rollback leaves migrated data under older code (old gate `status==="settled"`, register.ts:58). Safe iff Phase 4 ships as one deploy. UNKNOWN whether 04-01/02/05 reached staging — shipper verifies serving APP_GIT_SHA. Put the lossy reverse SQL in 04-06 SUMMARY.
- **A-29 · §8 · 04-11 T1⑥ · NOTE** — Replace "record `SHOW timezone` in SUMMARY" with an integration assertion `current_setting('TimeZone') = 'UTC'` (all timestamps are `timestamp without time zone`; Drizzle reads them as UTC).
- **A-30 · §3 · 04-21 T2③ · NOTE** — `findLatestActionFor` must include pruned rows (prune can mark status_change rows, repositories/action-log.ts:85-101) or the subtitle silently reverts to created date.
- **A-31 · §0G · 04-21 T1③ / 04-22 T3① · NOTE** — Decide `statusChangeProps` (component rendered inside QuoteLedger) in 04-21; avoid the ReactNode→props refactor one wave later.
- **A-32 · §5 · 04-12 T1① · NOTE** — domain may not import `ui` (eslint.config.mjs:46); declare the `"edit"|"readonly"|"locked"` union in domain (structurally compatible with ui/table/types.ts:8).
- **A-33 · §5 · 04-11/04-22/04-12 · NOTE** — Single `loadProjectForGate(viewer,id,{now,tx})` (pre-judge + locked read) instead of 4+ hand-placed pre-judgments; covers future 04-14/04-15 write paths.
- **A-34 · §11 · 04-21 T1② · 04-22 T1④ · NOTE** — Disable 1차 while executing (double-submit); on a gate rejection caused by a state change, suggest reload; return focus to 「기간 바꾸기」/「상태 바꾸기」 when the field/modal closes.
- **A-35 · §6 · 04-21 T2① · NOTE** — Old-literal scan should match quoted string literals (`['"\`]settled['"\`]`) to avoid future false positives (`settledAt`, comments already handled).
- **A-36 · §4 · 04-26 T1③ · NOTE** — Concurrent saves can exceed the cap by one batch (no revision lock). Accept as soft limit, or `FOR UPDATE` on the revision row.
- **A-37 · §3 · 04-12 T2④ · NOTE** — `lineStatus: z.string()` accepts any text (actions.ts:78) and `projectId` is not uuid-validated (pre-existing); 04-12 gives `cancelled` money semantics → validate against the code table/enum.
- **A-38 · §9 · 04-06 T1① · NOTE** — Remapped demo rows get no status_change history → 완료 subtitle shows creation date. Acceptable (demo only).
- **A-39 · §8 · 04-11/04-20 · NOTE** — Add structured app logs: `project.auto_settle` (count>0), `project.transition.denied` (from,to,reason); add `trigger:"manual"` to human status_change detail; note SYSTEM_VIEWER logs `actorRoleId='role-sysadmin'`.

### ALREADY-COVERED

- **A-40 · §9 · 04-06 · NOTE · (c)** — Interim raw labels between 04-06 and 04-21: covered by 04-21's literal scan. Minor inaccuracy: 04-06 says only the list keeps the old label, but `app/(app)/projects/[id]/page.tsx:18-23` also has `settled` (the scan catches it).
- **A-41 · §4 · 04-11 · NOTE · (c)** — KST boundary computed in app and passed as a parameter (Pitfall 7) — covered by 04-11 truths and tests.
- **A-42 · §4 · 04-11 · NOTE · (c)** — Idempotency via `WHERE status='in_progress'` and concurrent EvalPlanQual — covered (integration (b)); atomicity is A-01.
- **A-43 · §3 · 04-20 · NOTE · (c)** — 경영관리 is not a seed role; admin assigns `projects.status` — surfaced in 04-20 probe_fallback.
- **A-44 · §3 · 04-20/04-21 · NOTE · (c)** — PM calling the action directly is rejected server-side (T-04-34, integration (d)); hiding the button is secondary.
- **A-45 · §9 · 04-06 · NOTE · (c)** — 0009 untouched (diff check), guards RAISE instead of delete, numbering check — covered by 04-06 verify commands.


---

# 부록 B — 견적·매출·리저브 플랜 분석 (04-13·04-23·04-14·04-24·04-15·04-16·04-07)

# CEO review (HOLD SCOPE): analyst B findings

Scope: plans 04-13, 04-23, 04-14, 04-24, 04-15, 04-16 and 04-07 in `.planning/phases/04-project-quote-ledger/`. They cover quote line kinds, revisions and customer approval, project copy, revenue and the derived contract amount, and the reserve ledger.
Method: I read the plans against D-41..D-95 in 04-CONTEXT and checked their claims against the real code. I ran `squawk 2.65.0` on candidate migration SQL in the scratchpad. I edited no repo files.

---

## 0. Summary counts

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 6 | B-01, B-02, B-03, B-04 (fact) · B-05, B-06 (decision) |
| WARNING | 18 | B-07, B-08, B-09, B-26 (decision) · B-12..B-25 (fact) |
| NOTE | 13 | B-10, B-11 (decision) · B-27..B-37 |

| Class | Count |
|---|---|
| (a) FACT-CORRECTION | 25: B-01..B-04, B-12..B-25, B-27, B-28, B-30, B-31, B-32, B-34, B-36 |
| (b) DECISION | 8: B-05..B-11, B-26 |
| (c) ALREADY-COVERED | 4: B-29, B-33, B-35, B-37, plus the verified list in §12 |

---

## 0G. Complexity check

| Plan | Files | New modules/services | Verdict |
|---|---|---|---|
| 04-13 | 14 (6 tests) | none (adds an axis to edit-scope) | OK. The `line_kind` promote is simpler than the RESEARCH `is_adjustment` + magic-subcategory split. |
| 04-23 | 6 | none | OK |
| 04-14 | 13 (4 tests) | `domain/quotes/revisions.ts` | OK. The lineage resolver is speculative until Phase 5, but D-55 is locked (B-33). |
| 04-24 | 7 | 2 components | OK |
| 04-15 | 10 | none (branch in `createProject`, reuses `copyQuoteLines`) | OK. Good reuse. |
| 04-16 | 17 | none, plus a destructive migration | The fewest-moving-parts option is to delete the code paths and defer the DROP. See B-09. |
| 04-07 | 19 | reserves domain, repo, route | This is a full feature slice, so the size is justified. |

Invariants the plans state and whether they hold:
- The adjustment-in-totals invariant (04-13) holds.
- "No fallback to a prior approved revision" (04-14, 04-16) holds. It is broken indirectly by stale saves into old revisions (B-01) and by post-approval drift (B-07).
- Copy excludes money records (04-15) holds.
- Paid amounts have no reverse-derivation path (04-16) holds against the code: `balanceKrw`, `paidGrossTotalKrw` and `issuedTotalKrw` are all paid-gated today.
- "Negative balance never allowed at any date" (04-07) does not hold. See B-04, B-05 and B-11.

## 0I. Temporal interrogation (implementer)

- **Hour 1**
  - 04-13: drizzle generates a separate `ADD CONSTRAINT … CHECK`. Squawk rejects it, and it also rejects the plan's fallback, NOT VALID plus VALIDATE in the same file (B-22).
  - 04-16: squawk `ban-drop-column` fires and "해결 in SQL" is undefined. The only fix is `-- squawk-ignore ban-drop-column` (B-09).
  - 04-07: there is no way to pick the client for the first reserve row (B-06).
- **Hours 2-3**
  - 04-13: the batch-level `project.line-edit` call left at the `saveQuoteLines` entry (it replaces `completed-lock`, lines.ts:372) blocks the adjustment line on 완료 (B-36).
  - 04-14: the unique violation arrives wrapped in `DrizzleQueryError` and must be unwrapped via `cause.code === '23505'`. The approval date must be stored in a timestamp without time zone (B-25).
  - 04-07: which permission gates writes? (B-14). `domain/archive.archive()` requires `admin.archive` write (B-04).
- **Hours 4-5**
  - SUM(int) comes back as a string from node-pg. This breaks the 04-13 invariant `toBe` checks and the 04-16 VAT sum (B-18).
  - An adjustment-only user has an empty vendor select (B-23).
  - Pagination against fixed bottom groups (B-24).
  - 04-07 runs in parallel with 04-18, which edits `ui/table` (B-34).
- **Hour 6+ (what they'll wish was planned)**
  - Per-project write serialization and revision-membership checks (B-01).
  - An idempotent "new revision" (B-02).
  - Dirty-state guard on new revision (B-03).
  - Lock plus restore hook on reserves (B-04, B-05).

---

## 1. Architecture

```
                         app/(app)/projects/actions.ts  (authedActionClient, zod)
   saveProjectLedgerAction   createRevisionAction   setCustomerApprovalAction   createProjectAction(+copyFrom,+preEstimate)
          │                          │                          │                         │
          ▼                          ▼                          ▼                         ▼
 domain/projects/ledger.ts   domain/quotes/revisions.ts ──────────────────┐   domain/projects/index.ts
   │  (projectId ⟂ revisionId — NOT cross-checked, B-01)                   │     createProject ──┐
   ├─► domain/quotes/lines.ts saveQuoteLines                               │                     │ copyQuoteLines(withLineage:false)
   │       ├─ can(projects|projects.adjustment write)  [04-13]             │                     ▼
   │       ├─ gate project.line-edit(lineKind, canAdjust, change) ◄─ domain/quotes/edit-scope.ts (pure)
   │       ├─ gate quote.line-cap [04-26]                                   │
   │       └─ repositories/quote-lines (update WHERE id+version only, B-01)│
   └─► domain/revenue saveRevenue (projects.revenue write)                 │
                                                                           ▼
 domain/revenue listRevenue ── derived contract ◄── current revision + approval + SUM(quote_amount_krw) [04-16]
       └─ REVENUE_DTO_SPEC: contract→project.value (B-19), issued→issued_amount, paid/balance/totals→paid_amount

 app/(app)/pnl/page.tsx (requireSession only!, B-13) ──link──► app/(app)/pnl/reserves/page.tsx (can pnl view → else 404)
                                                                   └─ actions.ts ─► domain/reserves (runningBalance pure)
                                                                         ├─ repositories/reserve-entries (no lock, B-05)
                                                                         └─ domain/archive restore() — no hook (B-04)
```

Coupling:
- `edit-scope.ts` is the single decision point for the screen and the gate. That is good.
- `listRevenue` now depends on the revisions module (04-16 → 04-14). That is acceptable.
- Reserves depend on `ui/table`, and 04-18 is changing `ui/table` in the same wave (B-34).

Security boundaries per new mutation:

| Mutation | Who can call | What they change | Server check today and planned | Gap |
|---|---|---|---|---|
| save adjustment/out_of_quote lines | `projects` or `projects.adjustment` write | lines of `revisionId` | per-line gate by kind, status and canAdjust | line ∈ revision and revision == current are not checked (B-01) |
| createRevision | `projects` write | new revision, copied lines, moved adjustments | status gate, copyable>0, unique(project, seq) | stale or double submit (B-02); no lock against saves (B-01) |
| set/clear approval | assigned PM (`pm_user_id`) | `customer_approved_at/by` | current revision only, not 완료, linked-docs check, no future date | does not require write (B-30); edits after approval (B-07) |
| project copy | `projects` write, source in scope | new project, 1st revision, lines | scopeFor (menu-level all/none), archived source rejected | status/version reset unspecified (B-32) |
| reserves save/archive/restore | unspecified (B-14) | `reserve_entries` | app running-balance check | no lock (B-05); restore bypass (B-04); input validation (B-17) |

Rollback posture:
- Migrations 0013 and 0015 only expand.
- 0014 drops columns. It is safe only because 0009/0010 never reached main or staging (verified: `origin/main` stops at 0008) and Phase 3 code never reads `projects`. See the §9 deploy diagram.

## 1a. Data flow with shadow paths

```
PM/경영관리 Ctrl+S ──► saveProjectLedgerAction{projectId, quoteLines{revisionId, rows, archivedLineIds}, revenue}
   │ nil: quoteLines undefined → revenue only           │ empty: rows=[] → no-op + log (ok)
   ▼
 saveQuoteLines
   ├─ revisionId not current ──────────── (NO CHECK) ─► writes into old/approved revision  ✗ B-01 (silent)
   ├─ row.id belongs to other project ─── (NO CHECK) ─► updates foreign line, gate used wrong status ✗ B-01
   ├─ PM edits adjustment row ─────────── gate reject ─► SaveRejectedError "조정 줄 · 경영관리만…" ✓ (not logged, B-26)
   ├─ kind change / negative on quote ─── reject ✓
   ├─ cap exceeded (incl. adjustments) ── GateBlockedError ✓
   ├─ version conflict ────────────────── SaveRejectedError per cell ✓
   └─ happy ─► tx UPSERT/archive ─► recordAction(document_update,{lineIds}) ─► DTO(lineKind,cellEditability)

「복사해 새 차수」 ─► createRevisionAction{projectId}
   ├─ dirty edits in browser ─────────── (NO GUARD) ─► edits orphaned under old storage key ✗ B-03 (silent)
   ├─ stale tab / double click ───────── (NO GUARD) ─► extra irreversible revision from unseen source ✗ B-02
   ├─ truly concurrent ────────────────── unique(project,seq) ─► "다른 사람이 먼저…" ✓
   ├─ 정산/완료 / 0 copyable ──────────── gate reject ✓
   └─ happy ─► tx insert seq+1, copy(lineage), move non-archived adjustments (archived left behind, B-21)

listRevenue (derived contract)
   ├─ current unapproved ─► {amountKrw:null, pendingLabel} ✓ (no fallback)
   ├─ approved ─► SUM(quote_amount_krw) [bigint→string, B-18] → computeVat(asOf=now, B-27)
   └─ approved then prices edited ─► contract silently drifts ✗ B-07

saveReserves
   ├─ intermediate-date negative ─► reject whole batch ✓ (unit+integration)
   ├─ two concurrent saves same client ─► both pass, negative committed ✗ B-05 (silent)
   ├─ 보관함 restore of 출금 ─► generic restore, no check ✗ B-04 (silent)
   ├─ KRW with fxRate≠1 / USD fxRate≤0 / negative amount ─► accepted ✗ B-17
   └─ fx touched ─► recent rate NOT remembered ✗ B-12
```

## 1b. State: revision and approval (as planned, with the gaps marked)

```
              createProject (1차, unapproved)                createRevisionFromCurrent
   ┌────────────────────────────────────────┐        ┌───────────────────────────────┐
   ▼                                        │        ▼                               │
[n차 CURRENT, UNAPPROVED] ──approve(PM, date≤today, status≠완료)──► [n차 CURRENT, APPROVED]
   ▲   │                                              │   │  edits to 수량·단가 still allowed ✗ B-07
   │   │ new revision (수주중/진행/미수주 only)       │   │ unapprove (no linked docs, status≠완료)
   │   ▼                                              │   ▼
   │ [n차 HISTORICAL] ◄──────── new revision ─────────┘ [n차 CURRENT, UNAPPROVED]
   │   │  read-only view (?revision=n)
   │   └─ but saveQuoteLines still writes here if revisionId is posted ✗ B-01
   └─ contract = SUM only when CURRENT+APPROVED; else "—" + "{n}차 고객 승인 전"
Adjustment lines: always live in CURRENT (moved on new revision; archived ones are not moved ✗ B-21)
```

## 1c. Error flow

```
domain throws ─┬─ UserFacingError subclasses (Forbidden, GateBlocked, SaveRejected) ─► handleServerError returns message
               │     └─ NOT logged anywhere (lib/actions/handle-server-error.ts) ─► denied writes invisible to ops (B-26)
               ├─ ZodError ─► Korean message
               └─ other (PG 23505 unwrapped? 22003 int overflow, 22008 bad date) ─► log.error + generic
                     "처리 중 오류가 발생했습니다" (B-17, B-18: user sees generic, not a cell error)
```

---

## 2. Error and Rescue registry

| Codepath | What can go wrong | Rescued? | User sees |
|---|---|---|---|
| save adjustment line (PM) | PM edits, archives or inserts an adjustment | Y (gate) | cell error "조정 줄 · 경영관리만 고칠 수 있음" |
| save adjustment line (경영관리, 완료) | batch-level gate blocks status | Y after the fix (B-36) | would be "완료 · 견적 줄이 잠김" (wrong) |
| save to non-current revision | stale tab or forged request | **N** | success toast; edits vanish (B-01) |
| save with foreign line id | forged request | **N** | success (B-01) |
| createRevision stale/double | 2nd call creates n+2 | **N** | toast "{n+2}차" (B-02) |
| createRevision concurrent | 23505 | Y (plan) | "다른 사람이 먼저 새 차수를 만들었습니다" |
| createRevision with dirty edits | edits orphaned | **N** | nothing (B-03) |
| approve future date | validation | Y | reason next to 1차, modal stays open |
| approve non-current revision | stale | Y | "현재 차수만…" |
| derived contract SUM | bigint as string | N until fixed | wrong total or test failure (B-18) |
| drop contract_* (0014) | old revision reads the dropped columns | Y (single deploy, B-09) | 500 in the window only for incremental deploys |
| reserve save concurrent | write skew | **N** | nothing; later edits rejected (B-05) |
| reserve restore | negative balance | **N** | nothing (B-04) |
| reserve FX touched | recent rate not updated | N | stale default rate next time (B-12) |
| reserve invalid date/amount | PG error | partially | generic error, no cell error (B-17) |
| project copy out of scope | forged `copyFrom` | Y | plain form, server rejects the id |

## 2a. Failure Modes registry

A row is a CRITICAL GAP when RESCUED=N, TEST=N and USER SEES=Silent. The column TEST? means "planned test covers it".

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---|---|---|---|
| saveQuoteLines → old revision | stale tab after new revision | N | N | Silent (success) | N (only document_update) |
| saveQuoteLines foreign line id | forged payload bypasses 완료/정산 lock | N | N | Silent | N |
| createRevision sequential duplicate | double click or stale tab | N | N (Promise.all test is racy) | Silent-ish (toast shows unexpected n) | Y (document_create) |
| createRevision with dirty edits | UX-04 input loss | N | N | Silent | N |
| reserve restore of 출금 | negative balance at a past date | N | N | Silent | Y (restore) |
| reserve concurrent saves | negative balance | N | N | Silent | Y (update) |
| approved revision edited | contract drifts | N | N | Silent (label still says approved) | Y (lines only) |
| restore of archived adjustment after new revision | line invisible and uncounted | N | N | Silent | Y (restore) |
| PM adjustment edit | denied | Y | Y | Error cell | N (B-26) |
| paid-amount leak to PM | key present | Y | Y (d key-set) | nothing (correct) | n/a |
| copy drags revenue or adjustments | double count | Y | Y | n/a | Y |
| derived contract with prior approval | fallback | Y | Y | "—" + pending | n/a |

The first five rows are CRITICAL GAPs: B-01, B-01, B-02, B-03, B-04. The concurrent-reserve row is decision B-05. The approved-edit row is decision B-07. The restored-adjustment row is B-21 (WARNING, since it only happens through an admin restore).

---

## Findings

### B-01: CRITICAL GAP · (a) FACT-CORRECTION
**Section:** 1/3/4. **Plan:** 04-14 T1/T2 (primary). It also affects the 04-13 T1 gate context and 04-12.

**Evidence:**
- `repositories/quote-lines.ts` `updateQuoteLineIfVersionMatches` filters `WHERE id AND version` only.
- `findQuoteLinesByIds` has no revision filter.
- `domain/quotes/lines.ts:366-375` gates on the posted revision's project status, never checks the revision is current, and never checks each line belongs to it.
- `domain/projects/ledger.ts` passes `projectId` and `revisionId` independently.
- No plan has `FOR UPDATE` (grep). 04-12 applied the membership check only to archive ids (T-04-59).

**Failure:**
- 04-14 introduces historical revisions. A stale tab still on 1차 saves after 2차 is created. The versions still match, so the write lands in the historical, possibly approved, 1차. The user gets success and their edits disappear from view.
- A forged payload with another project's line ids bypasses the D-47 and D-78 locks, because the per-line gate uses the posted revision's status.
- A save and a createRevision interleaving under READ COMMITTED produces a lost update.

**Remedy:**
- Add a repository `lockProjectForWrite(viewer, projectId, tx)` doing `SELECT … FOR UPDATE`. Call it first inside the tx of `saveQuoteLines`, `createRevisionFromCurrent` and `setCustomerApproval`.
- Inside the tx, re-read the latest revision. If `revisionId ≠ current`, reject with "다른 사람이 새 차수를 만들었습니다 · 새로 고쳐 주세요".
- Constrain the find and update by `revision_id = revisionId`. Zero rows returned means the batch is rejected.
- `saveProjectLedger` rejects a `projectId`/`revisionId` mismatch.

**Tests (integration, DB re-read):**
- Save to a non-current revision is rejected.
- A line id from another revision or project is rejected.
- A mismatched project is rejected.
- A save blocked behind createRevision rejects after the lock is released.

**Visibility:** the reason appears on the total row. Log it per B-26.

### B-02: CRITICAL GAP · (a)
**Section:** 4/11. **Plan:** 04-14 T1 and 04-24 T1.

**Evidence:** `createRevisionAction` takes `{projectId}` only. `(project_id, seq)` uniqueness catches only truly simultaneous inserts. A sequential second call copies the new current revision into n+2. Next.js serializes a client's server actions, so a double click is sequential. D-53 says revisions cannot be reverted. The planned `Promise.all` concurrency test is timing-dependent: if the calls serialize, both succeed and the test flakes.

**Remedy:**
- Add `fromRevisionId` (or `expectedSeq`) to the action.
- The server rejects a mismatch with the concurrency message, under the B-01 lock.
- The modal's primary button is disabled while the action is pending.

**Tests:**
- Integration: a stale second call is rejected and the revision count is unchanged. This is deterministic and replaces the racy assertion.
- E2E: a double click creates exactly one revision.

### B-03: CRITICAL GAP · (a)
**Section:** 4/11. **Plan:** 04-24 T1 and 04-14.

**Evidence:**
- `quote-table.tsx:360` `useDirtyStorage(projectId, revisionId, 0)`.
- 04-24 T1 ② says the key change "keeps old edits from mixing, confirm only".
- The copy uses DB state.
- The new revision key is empty, and the old key is never offered again.

This silently loses typed input, which violates UX-04 and D-68.

**Remedy:** when dirty > 0, render the modal's primary button disabled with the reason `저장 안 한 편집 {N}칸 · 먼저 저장해 주세요`, following the §7-1 disabled-with-reason pattern. Add that line to Copywriting in 04-24 T3.

**Test (E2E):** edit a cell and open the modal: the primary button is disabled and the reason shows. Save, and the button is enabled.

### B-04: CRITICAL GAP · (a)
**Section:** 2/3/4. **Plan:** 04-07 T1 and T3.

**Evidence:**
- `domain/archive/index.ts` `restore()` has no per-entity check. `ArchivableEntry` only has `isProtected`, and only for archive.
- `archive()` requires `admin.archive` write (`assertCanWrite`) and takes no tx.
- The plan routes reserve deletion "through domain/archive", so restore will be exposed in 보관함.

**Failure:**
- Restoring an archived 출금 can make a past date negative. Nothing reports it, and later unrelated edits for that client are then rejected.
- 경영관리 without `admin.archive` cannot delete at all.

**Remedy:**
- Add `archiveReserve` and `restoreReserve` in `domain/reserves`: same tx, per-client lock (B-05), balance check, `recordAction`.
- The reserve `ARCHIVABLE_TABLES` entry delegates restore to that check through an optional `beforeRestore` hook.
- Deletion is authorized by the reserve write permission (B-14).

**Test (integration):** restoring a 출금 that would go negative is rejected and the DB is unchanged. A `pnl`-write user without `admin.archive` can archive.

### B-05: DECISION (CRITICAL-level)
**Section:** 4/9. **Plan:** 04-07 T1.

**Evidence:** `docs/inputs/phase-04-project-quote.md` §6 records the locked answer "잔액 음수: 금지 (DB 제약)". The plan does an app-level read-compute-write with no lock, so two concurrent saves for one client can both pass under READ COMMITTED.

**Options:**
- **(A) Recommended.** App check plus `SELECT … FROM vendors WHERE id=$client FOR UPDATE` in the same tx for save, archive and restore. Phase 9 RSV-02 reuses it. Effort S. It keeps `domain/money` as the single arithmetic point. The user accepts that "DB 제약" is realized as a serialized server check.
- **(B)** A deferred constraint trigger in 0015 that locks the client row and recomputes the running balance in SQL. This is literally a DB constraint and also covers restore and future paths. Effort M. It puts money arithmetic in SQL.
- **(C)** As planned. Rejected: write skew.

**Test:** two connections for the same client. The second blocks, then gets rejected.

### B-06: DECISION (CRITICAL-level, blocks the tracer)
**Section:** 11. **Plan:** 04-07 T2; UI-SPEC S9.

**Evidence:** the columns are 날짜·구분·금액·잔액·프로젝트·증빙 종류·세금계산서 번호·메모. There is no 클라이언트 column, the client appears only as the group header, and the 0-row EMPTY 「리저브 줄 추가」 has no client. `client_id` is NOT NULL.

**Options:**
- **(A) Recommended.** A 9th column 클라이언트 (vendor Select, P3 on phone), locked after first save. Locking also removes the "move an entry across clients" balance edge. Effort S.
- **(B)** 「리저브 줄 추가」 first asks for the client, plus a per-group add button. Effort M, and it is a new pattern.
- **(C)** Page-level client filter. This changes S9 grouping.

Update S9 and Copywriting accordingly.

### B-07: DECISION (WARNING, high)
**Section:** 4/10. **Plan:** 04-14, 04-16, and the edit scope in 04-12.

**Evidence:** `lineCellEditability` depends on status, class and linked documents only. The approval state does not lock 수량 or 단가. The 04-16 contract carries the label "{n}차 고객 승인 합계" but equals the live SUM. That contradicts D-84 "네고로 금액이 바뀌면 새 차수로 반영" and the specifics line "고치려면 항상 새 차수".

**Options:**
- **(A) Recommended.** An approved current revision locks the 견적가 inputs (수량, 단가, 소분류, and add/archive of `quote` lines) with the reason `{n}차 고객 승인됨 · 고치려면 새 차수`. 실행가, 항목, 거래처 and 비고 stay editable, as do 견적 외 비용 and adjustment lines. Effort S-M: one axis in edit-scope plus the gate, under the B-01 lock.
- **(B)** Allow edits but auto-clear approval when 견적가 changes (blocked if linked documents exist).
- **(C)** Status quo.

### B-08: DECISION (WARNING)
**Section:** 10. **Plan:** 04-14 T2.

**Evidence:** `quote.customer-approval` rejects 미수주 + 미승인. Under D-45, 미수주 is not locked and late PT invoices are expected; under D-41, 미수주 costs become team 미수주 비용. A lost bid almost never has an approved revision, so the gate as written blocks those invoices.

**Options:**
- **(A) Recommended.** Exempt both 수주중 and 미수주.
- **(B)** Literal D-43: exempt only 수주중.
- **(C)** Exempt 미수주 only if the project never reached 진행.

There is no Phase 4 caller, but the unit test fixes the behavior for Phase 5.

### B-09: DECISION (WARNING)
**Section:** 9/10. **Plan:** 04-16 T2.

**Facts:**
- ARCHITECTURE.md §5 says "확장 전용(컬럼 추가만, DROP 없음)이 원칙".
- Squawk `ban-drop-column` fires (verified). With `-- squawk-ignore ban-drop-column` plus the lock/statement timeouts it reports 0 issues (verified).
- `origin/main` only has migrations up to 0008. That means 0009/0010 and the `contract_*` columns never reached staging or prod.
- Shipping Phase 4 as one deploy therefore makes 0010's ADD and 0014's DROP a net no-op on shared databases. No data is lost, and the rollback target (Phase 3 code) never reads `projects`.

**Options:**
- **(A) Recommended.** DROP now, plus:
  - the precondition "Phase 4 ships as one deploy; 04-02 code never serves alone",
  - a migration guard that RAISEs if any `source<>'demo' AND contract_amount_krw<>0` (0009 precedent),
  - a recorded ARCH §5 exception.
- **(B)** Remove the code now and DROP in a later expand/contract release.
- **(C)** Keep the columns.

**Who must verify:** the user, on whether any intermediate Phase 4 PR will deploy.

### B-10: DECISION (NOTE)
**Plan:** 04-07. A USD reserve balance is tracked in KRW. Deposit USD 1,000 @1,300 and withdraw USD 1,000 @1,400, and the KRW balance is -100,000. The withdrawal is rejected even though the USD balance is 0.

**Options:**
- **(A) Recommended.** Keep KRW and document the workaround (enter the withdrawal at the deposit rate). USD reserves are rare (OV-8).
- **(B)** Per-currency balances for foreign-currency reserves.

### B-11: DECISION (NOTE)
**Plan:** 04-07. The per-entry check in `sort_key` order rejects a same-day 출금 entered before its 입금, even when the end-of-day balance is ≥ 0. D-60 says "어느 날짜든".

**Options:**
- **(A) Recommended.** Check at the end of each date, and order 입금 before 출금 within a date.
- **(B)** Strict per-entry check.

### B-12: WARNING · (a)
**Plan:** 04-07 T1/T2. D-71 is locked: "환율을 적은 모든 저장(…리저브…)에서 자동 갱신". The plan has no `fxRateTouched`, `rememberFxRate` or `recentFxRate` default.

**Remedy:** mirror `domain/revenue` `saveEntries`.

**Test (integration):** touched → setting updated; untouched → unchanged.

### B-13: WARNING · (a)
**Plan:** 04-07 `probe_fallback`/T2. The claim "손익 권한이 없으면 /pnl에 닿지 못하고 링크도 보지 못한다" is false:
- `app/(app)/pnl/page.tsx:11` only calls `requireSession()`.
- `ui/shell/role-menu.ts` always shows all five top menus ("역할과 상관없이 항상 다섯 전부").

A PM sees a link that 404s.

**Remedy:** render the link only when `can(pnl, view) && visible(reserve item)`.

**Test (E2E):** as PM on /pnl, the link is absent.

### B-14: WARNING · (a)
**Plan:** 04-07. The reserve write permission is never named, and `menus.ts` must stay unchanged.

**Remedy:** `can(viewer, "pnl", "write")` in save, archive and restore.

**Test (integration):** with view-only permission, a save is Forbidden and the DB is unchanged.

### B-15: WARNING · (a)
**Plan:** 04-07. `can` and `visible` are independent (D-35). A role with `pnl` view but the reserve item hidden renders rows, groups and counts with fields masked. The plan's prohibition names exactly this as a failure ("건수만 보여주자" 같은 부분 노출).

**Remedy:** the page requires both, else `notFound`. `listReserves` returns [] with no count.

**Test:** key-set and 404 for such a role.

### B-16: WARNING · (a)
**Plan:** 04-07. Direct edits are allowed only because they are logged (D-60), but the log detail is unspecified. `document_update` is admin-disablable (`record.ts:65-72`).

**Remedy:** detail = `{entryId, clientId, changed: {amount|date|direction: [before, after]}}`. Ask the user whether reserve logging should be always-on.

**Test:** assert the detail content.

### B-17: WARNING · (a)
**Plan:** 04-15 T2 and 04-07. **Section:** input validation.

**Evidence:** `domain/money` `moneyToColumns` computes `amountKrw = round(amount*fxRate)` whatever the currency, so a forged KRW row with fxRate 1350 inflates the balance. Also unchecked:
- USD fxRate ≤ 0,
- reserve amount sign (a negative 출금 is a disguised 입금),
- `z.string()` dates: an invalid date raises a PG error and the user sees a generic message.

**Remedy (new inputs only):**
- KRW ⇒ fxRate = 1 (force it on the server); USD ⇒ fxRate > 0.
- Reserve amount > 0.
- `z.iso.date()` for dates.
- int4 range check on `amountKrw`.

**Tests:** each rejection surfaces as a user-facing message.

### B-18: WARNING · (a)
**Plan:** 04-16 T1 and 04-13 T2.

**Evidence:** SUM(integer) returns a Postgres bigint, and node-pg returns bigint as a string: `db/client.ts` has no int8 parser, and `repositories/projects.ts` `listProjectsPage` returns an uncast `coalesce(sum)`.
- 04-16's "리포지토리 SUM 한 번" feeds `computeVat`, where `payable = supply + vat` can string-concatenate.
- 04-13's invariant `toBe(number)` fails.

**Remedy:** cast in SQL and parse through one numeric helper.

**Cross-group (owner 04-17):** `aggregateProjects` casts to `::int`, which throws 22003 once a filtered total exceeds ₩2,147,483,647. That is plausible for a year's 125 projects.

### B-19: WARNING · (a)
**Plan:** 04-16 T1. The derived `contract` stays gated by `project.value` in `REVENUE_DTO_SPEC`, but its value is a quote total. A role with `quote.amount` hidden could read it.

**Remedy:** gate it by `quote.amount`.

**Test:** leak-scan key-set.

### B-20: WARNING · (a)
**Plan:** 04-14 T3. `listRevisionSummaries` returns 견적 합계 with no DtoSpec or `registerDto`, bypassing the D-38 leak scan.

**Remedy:** a spec with 합계 → `quote.amount`, plus `registerDto` and a key-set test.

### B-21: WARNING · (a)
**Plan:** 04-14 T1. `moveAdjustmentLines` moves only non-archived lines. A later restore brings an adjustment line back into the old revision, where it is invisible (04-24 "조정 그룹 없음") and uncounted in the list.

**Remedy:** move all adjustment lines.

**Test:** archive → new revision → restore → the line shows in the current table and the list total.

### B-22: WARNING · (a)
**Plan:** 04-13 T1 ①.

**Evidence (squawk runs):**
- The plan's fallback, NOT VALID plus VALIDATE in the same file, still fails: `constraint-missing-not-valid: … in the same transaction will block all reads`.
- drizzle's separate `ADD CONSTRAINT` also fails.
- An inline `ADD COLUMN "line_kind" text DEFAULT 'quote' NOT NULL CONSTRAINT … CHECK (…)` passes (0 issues), and so does NOT VALID alone.

**Remedy:** hand-edit the SQL to the inline form; the end state matches the snapshot. T-04-67's "lock time reduced" claim does not hold inside one transaction.

### B-23: WARNING · (a)
**Plan:** 04-23 T1. `[id]/page.tsx:52` loads vendor and subcategory references only when `canWrite`. An adjustment-only 경영관리 gets an empty 거래처 select on an editable cell.

**Remedy:** load when `canWrite || canAdjust`.

**Test (E2E):** picks a vendor.

### B-24: WARNING · (a)
**Plan:** 04-23. UI-SPEC §7-3 (자) says a new row "appears on the page it was created". A fixed bottom 조정 group, or the 견적 외 비용 group, on a table longer than 30 rows has no defined placement.

**Remedy:** the button navigates to the page holding the group's end and focuses the new row.

**Test (E2E):** a table with 31+ lines.

### B-25: WARNING · (a)
**Plan:** 04-14 T2. `customer_approved_at` is a `timestamp` without time zone (schema line 17). "KST 00:00" is stored as 15:00 on the previous day, so raw `::date` is off by one.

**Remedy:** one helper in `lib/kst-date` for the round trip.

**Test (unit):** KST midnight round-trips.

### B-26: DECISION (WARNING)
**Section:** 8. **Evidence:** `handle-server-error.ts` returns UserFacingError messages without logging, so forged adjustment edits, cross-revision attempts and reserve rejections are invisible to operations.

**Options:**
- **(A) Recommended.** `log.warn("write.denied", {viewer, rule, entity ids})`, with no amounts, in the new mutations.
- **(B)** Accept the gap.

### B-27: NOTE · (a)
**Plan:** 04-16. Contract VAT uses `new Date()` as its date (`listRevenue`), so the displayed VAT shifts when the rate setting changes.

**Remedy:** use the approval date as `asOf`.

### B-28: NOTE · (a)
**Plan:** 04-16 T3. `issuedTotalKrw` is gated by `paid_amount` although it is not derived from payments. After D-85 the PM has no server-computed issued total.

**Remedy:** re-gate it to `issued_amount`, keeping balance and paid on `paid_amount`.

### B-29: NOTE · (c)
**Plan:** 04-16 T3; covered by T-04-87. The seed upserts visibility only for sysadmin and role-pm (`seed/index.ts:165-179`) and runs on every deploy (`deploy.sh` `run_seed`). As a result 팀장 and 본부 책임자 still default-deny 발행액, and any admin customization of role-pm is overwritten on every deploy.

**Who must verify:** the admin, for the 팀장 rows.

### B-30: NOTE · (a)
**Plan:** 04-14/04-24. The approval check is `viewer.id = pm_user_id` only.

**Remedy:** also require `projects` write, and pick an action type (`document_update` plus kind) that Phase 5 approval filters won't misread.

### B-31: NOTE · (a)
**Plan:** 04-23. The PM's Delete key on an adjustment row is unspecified, and the batch would be rejected.

**Remedy:** make it a no-op with the error-cell reason.

**Test (E2E).**

### B-32: NOTE · (a)
**Plan:** 04-14/04-15 `copyQuoteLines`. Specify:
- one INSERT…SELECT,
- `version` reset to 1,
- project copy resets `line_status` to not_started (or excludes cancelled lines).

The cap (04-26) is not rechecked on copy. If an admin lowers the cap below a revision's line count, every later save on that revision fails 04-26's count rule.

### B-33: NOTE · (c)
**Plan:** 04-14. `resolveLinkedDocumentsByLineage` and the "dropped-line docs" list have no data source until Phase 5. D-55 is locked, so keep them pure and small.

### B-34: NOTE · (a)
**Plan:** 04-07.
- The objective says "04-18과 같은 웨이브(14)" but frontmatter says wave 20. The text is stale.
- It runs in parallel with 04-18, which changes `ui/table/Table.tsx` and `types.ts` while 04-07 builds on `ui/table`.

**Remedy:** depend on 04-18, or assert that 04-18's props are additive.

### B-35: NOTE · (c)
**Plan:** 04-24 T3 and 04-07 T2 edit `.planning/*` from executor tasks. CLAUDE.md forbids manual `.planning` edits, but there is precedent: 04-02/04-04 commits `ab59d69` and `2c25a6c`. Flagged for user awareness.

### B-36: NOTE · (a)
**Plan:** 04-13. The entry-level `project.line-edit` call that 04-06 puts where `completed-lock` was (lines.ts:372) must become per-line, or 완료 adjustment saves fail. The tracer test will catch it.

### B-37: NOTE · (c)
**Plan:** 04-15. A blank pre-estimate is stored as 0 KRW, conflating "none" with 0. The plan already records this judgement in its SUMMARY.

---

## 3. Security and threat model summary

- **Adjustment lines are 경영관리-only in every state.** This holds per line (04-13 T2 tests). It depends on B-01: line membership plus current revision.
- **발행액 is visible to the PM and 입금액 is hidden.** The current DTO has no reverse-derivation path: balance, paid gross and issued total are all paid-gated. Copy excludes revenue (04-15), and the list 수익금 requires both items (04-17 T-04-88). One leak remains: `contract` is gated by `project.value` (B-19).
- **IDOR:** the revision id is checked in approval, and the copy source is checked. Line and revision ids in the ledger save are not checked (B-01).
- **Forged requests:** the kind change, negative values on quote lines and PM adjustment edits are rejected. KRW fxRate is not (B-17).
- **Audit trail:** approval, revision creation and saves are logged, but denied writes are not (B-26) and the reserve edit diff is not (B-16).

## 4. Money rules

- **실행가 includes adjustments.** The 04-13 invariant covers this, and 04-17 adds the archived-line exclusion to the list SUMS.
- **수익금 rule** (before invoice 견적−실행가, after invoice 발행−실행가): 04-17/18 own it (outside this group). This group only guarantees the adjustments reach 실행가.
- **Rounding:** `toKrw` and `applyTaxRule` are single functions and the plans reuse them. Remaining issues are the SUM typing (B-18) and the VAT date (B-27).

Async ordering:
- concurrent saves on one revision: `version` handles existing lines, but the insert cap has a race (fixed by the B-01 lock);
- approve while editing: B-07 and B-01;
- copy while the source changes: separate reads under READ COMMITTED, low impact (NOTE);
- double click or stale submit: B-02.

## 5. Code quality

DRY is good in several places:
- `copyQuoteLines` is reused (04-15);
- `computeVat` is reused;
- `edit-scope` is the single decision point;
- `line_kind` replaces magic subcategory strings.

Branch counts: `lineCellEditability` now spans status (5) × canWrite × canAdjust × kind (3) × linked docs (× approval under B-07). Keep it table-driven, with the decision-table tests as the plan specifies.

## 6. Tests: behavior map and missing hostile cases

Covered:
- adjustment rules (unit + integration),
- the adjustment-in-totals invariant,
- revision copy, lineage and adjustment move,
- the empty-revision, 정산 and 완료 rejects,
- approval authority, future-date and stale-revision rejects,
- no fallback to a prior approval,
- copy exclusions,
- the paid-amount key-set,
- the derived contract,
- intermediate-date negative balance,
- the PM 404 on reserves.

Missing (hostile QA would write these):
- a save to an old revision;
- a foreign line id;
- `projectId`/`revisionId` mismatch;
- a sequential duplicate createRevision;
- createRevision with dirty edits;
- a reserve restore that goes negative;
- concurrent reserve saves;
- a `pnl` view without the reserve item;
- KRW with fxRate ≠ 1;
- editing 단가 after approval (if B-07 A is chosen);
- an adjustment line restored after a revision move;
- an adjustment-only role picking a vendor.

Flaky: the 04-14 `Promise.all` concurrency test (fixed by B-02).

## 7. Performance

- 300-line tables are fine: per-line gates run in memory, and there is one linked-documents call.
- `listRevisionSummaries` should be one GROUP BY, not per-revision queries.
- `copyQuoteLines` should be INSERT…SELECT.
- Reserves read the whole ledger each page, which is fine at this scale. The `(client_id, entry_date, sort_key)` index is present.
- No new list N+1.

## 8. Observability

- Denied writes are not logged (B-26).
- Reserve edit diffs are missing (B-16).
- Money recalculations are derived, so there is nothing to log. The derived contract can be reconstructed only if approved revisions are immutable (B-07).
- The 0014 deploy note: T-04-86.

## 9. Deployment

```
merge Phase 4 (single PR) ─► CI (quality → integration-e2e) ─► deploy.sh
   image ─► db-bootstrap Job ─► migrate Job: 0009 0010 0011 0012 0013 0014 0015 in ONE tx
         (0010 ADD contract_* then 0014 DROP contract_* → net no-op on staging/prod; guard B-09)
   ─► seed Job (new INFO_ITEMS incl. issued_amount=true for role-pm, reserve item=false; MENUS incl. projects.adjustment)
   ─► service deploy 100% ─► smoke
Old revision serving during migrate→deploy = Phase 3 code: never reads projects/quote_* → no window errors.
Hazard only if Phase 4 ships incrementally (04-02 code live before 04-16): old revision `select()` enumerates contract_* → 500s.
```

Rollback flowchart:

```
smoke fails / bug after deploy
   │
   ├─ rollback.sh → previous revision = Phase 3 code?
   │      └─ yes → safe: schema is expand-compatible for Phase 3 (no projects code); 0014 irrelevant
   │      └─ no (an intermediate Phase 4 revision with 04-02 code) → project pages 500 (contract_* dropped)
   │              └─ roll forward, or apply a reverse migration re-adding 4 nullable columns (prepare it — B-09 A)
   └─ data fix needed (e.g. negative reserve from B-04/B-05) → no tooling; manual SQL forbidden in prod (CLAUDE.md) → prevent, don't repair
```

## 10. Long-term: reversibility and later phases

| Item | Reversibility (1 = irreversible, 5 = trivially reversible) | Notes |
|---|---|---|
| `line_kind` | 3/5 | Phase 6 (EXP-16) and Phase 9 read it |
| `contract_*` drop | 4/5 before any shared-DB deploy, 2/5 after | |
| adjustments live in the current revision | 3/5 | Phase 9 P&L works because the adjustments sit in the current revision |
| revisions irreversible (D-53) | 1/5 | Hence B-02 and B-03 matter |
| reserve balance check location | 3/5 | Phase 9 RSV-02 adds writes and must share the lock and check (B-05) |
| customer-approval gate semantics | 4/5 | B-08 before Phase 5 wires the caller |

## 11. Design and UX interaction state coverage

| Surface | FEATURE | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|---|---|---|---|---|---|---|
| adjustment lines | ✓ | ✓ (primary button) | ✓ (경영관리 variant) | ✓ (PM error cell, cap) | ✓ (저장됨) | ✓ (PM read-only); pagination placement ✗ (B-24) |
| new revision modal | ✓ | ✗ pending not specified (B-02) | n/a | ✓ (reason next to primary, modal stays open) | ✓ toast | dirty edits ✗ (B-03) |
| approval modals | ✓ | ✗ pending not specified | n/a | ✓ | ✓ (subtitle) | ✓ (완료 shows date, no buttons) |
| revision section | ✓ | ✓ (page) | structurally none | absorbed into the page error (backstop) | n/a | ✓ (U-2) |
| project copy | ✓ | form pending (existing) | 0-line source "· 0줄" | out-of-scope → plain form | ✓ | ✓ (source line) |
| revenue section | ✓ | ✓ | ✓ (per table) | ✓ | ✓ | ✓ (PM without paid table) |
| reserve ledger | ✓ | ✓ | ✓ (two variants) | ✓ (load error, balance cell) | not stated (NOTE: 저장됨 on total row) | ✓ (em dash); client selection ✗ (B-06); link visibility ✗ (B-13) |

- **Keyboard:** Esc closes, Ctrl+S saves, and a Form.Field date sits in the approval modal. PM Delete on an adjustment row is unspecified (B-31).
- **SYSTEM.md:** no new colors or icons; stylelint enforces this.

## 12. Verified as covered (no action)

- PM forged adjustment edit, insert or archive is rejected (04-13 T2).
- Line kind is immutable (T-04-64).
- Negative values are allowed only on 견적 외 비용 and 조정 lines.
- The cap counts adjustment lines.
- Adjustment rows are shown to the PM in the same table (04-23 E2E).
- No fallback to a prior approved revision (04-14 T2 integration, 04-16 T1).
- Paid-amount reverse-derivation fields are paid-gated in the current code (`REVENUE_DTO_SPEC`).
- Copy excludes revenue, adjustments, lineage, period and pre-estimate (04-15 integration).
- 04-17 adds `archived_at IS NULL` to the list line sums.
- 04-17 T-04-88 requires both items for 수익금.
- The zod object strips the old `revenue.contract` field.
- 0010 is not rewritten; the numbering guard is scripted.
- `.squawk.toml` stays untouched in all three migrations. B-22 and B-09 give the passing SQL forms.


---

# 부록 C — 목록·문서·코드표 플랜 분석 (04-08·04-09·04-10·04-25·04-17·04-18·04-19)

# CEO review — Group C (docs/design system · formatting · code tables · project list · quote pagination)

Mode: HOLD SCOPE (D-75~D-95 locked). Plans: 04-08, 04-09, 04-10, 04-25, 04-17, 04-18, 04-19.
Read-only analysis, 2026-09-23. Code evidence is from HEAD `b510b8a`. A local Postgres 16 dev DB was probed read-only (no writes).

## Counts

| Severity | FACT-CORRECTION | DECISION | ALREADY-COVERED |
|---|---|---|---|
| CRITICAL GAP | 3 (C-01, C-02, C-13) | 0 | — |
| WARNING | 6 (C-04, C-05, C-06, C-07, C-08, C-14) | 2 (C-03, C-09) | — |
| NOTE | 11 (C-15, C-17, C-18, C-19, C-20, C-22, C-23, C-24, C-25, C-26, C-27) | 5 (C-10, C-11, C-12, C-16, C-21) | 13 (AC-01..AC-13) |

---

## Verified facts the findings rely on (probes run)

- `sum(integer)` in Postgres returns `bigint`. node-postgres returns `bigint` as a **JS string**: probe returned `{ s: '3000000000', n: '2', t: 'bigint' }` with `typeof s === "string"` and `typeof n === "string"`.
- `coalesce(sum(...),0)::int` over 3,000,000,000 fails with **`ERROR 22003 integer out of range`** (probe).
- `"12400000".toLocaleString("ko-KR")` returns `"12400000"` with no commas. `Intl.NumberFormat("ko-KR").format("12400000")` returns `"12,400,000"`. Intl formats `NaN` as `"NaN"`, `Infinity` as `"∞"` and `-0.04` (1 decimal) as `"-0.0"`.
- `'0000-01-01'::date` fails with `22008 date/time field value out of range`, and `'abc'::uuid` fails with `22P02`.
- `gsd-tools requirements` has only three subcommands (mark-complete, ready-ids, revert-phase). No subcommand edits requirement or roadmap text.
- The `app/` and `ui/` trees have no Tab handler, no `toTsv(` call and no `clipboard.writeText`. `project-form.tsx:108` shows `취소 Esc`, but the projects list/form has no Escape handler.
- SYSTEM.md already names the progress-bar colour: `2px --accent` appears at lines 262 (§5 reduced-motion), 809 (§7-7 LOADING) and 858 (§7-10). This conflicts with §1-3, which limits `--accent` to 5 places and does not list the progress bar.

---

## 1. Architecture

```
Browser (Windows · Chrome/Edge · Korean IME)
  │  GET /projects?year&from&to&status&teamId&q&sort&dir&page
  │  (native <form method=get> + plain <a> ⇒ full-document navigation, loading.tsx streams)
  ▼
app/(app)/projects/page.tsx (RSC) ── param parse/validate ──► domain/projects.loadProjectList(viewer, q, {now})
                                                               1 applyAutoSettlement()      ← WRITE (04-11) [C-09]
                                                               2 kstYear(now) · resolveListRange · parseListPeriod
                                                                 (domain/projects/list-view.ts → lib/kst-date, lib/format-number)
                                                               3 repo.aggregateProjects ─┐ projectFilterConditions(scope,filter)
                                                                 (bucket CASE GROUP BY)  │  (single row-filter; T-04-28)
                                                               4 clampPage(page,pageCount)│
                                                               5 repo.listProjectsPage ──┘ ORDER BY nullgrp, month, key, id OFFSET/LIMIT 50
                                                               6 project(viewer,row,SPEC)   strips keys by info item
                                                               7 totals DTO (hand-gated visible(); not in DTO registry) [C-14]
  ▼
list-totals.tsx(<dl>) · projects-table.tsx(client) → ui/table/Table(sort hdr, collapseBelow)
                                                   → ui/pagination/Pagination{href} → page-window.ts → lib/format-number

Quote detail: quote-table.tsx(client, all ≤300 lines in memory)
   → ui/table/Table{pagination:30} → paging.ts(splitPages/pinned/crossPageTarget)
                                   → use-grid-keyboard.ts(Ctrl-only, Tab, Ctrl+A/C)
                                   → parse-tsv.ts(parseTsv/toTsv) · use-clipboard-paste.ts(applyPaste positional)
                                   → Pagination{onPageChange, errorCounts}
   cell editors → ui/input/use-comma-input.ts → lib/format-number(formatNumberInput/stripNumberInput)

Admin: code-item-form.tsx → actions.ts(authedActionClient, zod) → domain/code-tables.updateCodeItemDescription(can admin.code-tables write,
       archived guard, 40-char, action log) → repositories/code-tables → code_items.description (migration 0011)
Pickers: ui/select/Select{option.description → hint} ◄ CodeItemDto.description ; domain/projects/references.ts
```

Boundary rules (eslint.config.mjs, verified): `ui→{ui,lib}`, `domain→{domain,repositories,lib}`, `repositories→{repositories,db,domain}` (**no lib**), `app→{app,domain,lib,ui}`. The plans respect all of these: `lib/format-number` is imported from ui, app and domain, and the repository imports nothing from lib.

Security boundaries:
- **Row visibility.** `Scope` is binary (`rows: "all"|"none"`, plus `includeArchived`, see scope-for.ts:11). List and totals share one filter function, so the totals cover exactly the viewer's rows by construction (AC-01).
- **Field visibility.**
  - Rows: `project()` strips hidden keys.
  - Totals: the aggregate is hand-gated with `visible()`.
  - 입금액 never enters either query **if** the issued-sum subquery filters `kind='issue'`; that filter has no test yet (C-14).
- **Sort side channel.** `normalizeSort(viewer)` covers it (AC-05).

Rollback posture:
- 04-17, 04-18 and 04-19 are code-only (no migration, D-92 honoured).
- 0011 is additive and nullable. Old code ignores the column.
- URL params degrade gracefully: old `count=` is ignored, and new `page=` is ignored by old code.

## 2. Data flow, including shadow paths (list + totals)

```
query ─► validate ─► R=range ─► auto-settle ─► aggregate(GROUP BY bucket) ─► totals+pageCount ─► clamp ─► list OFFSET ─► DTO ─► render
 │ nil year → kstYear(now) (injected)            │ R empty → EMPTY "filtered", no SQL
 │ year="0000" → range '0000-01-01' → PG 22008 → error.tsx          [C-08, new regression in 04-17]
 │ teamId="abc" → PG 22P02 → error.tsx                             [C-08, pre-existing, T-04-90 omits]
 │ string[] params (?page=1&page=2) → typed as string              [C-08]
 │ from/to malformed/reversed → periodErrors shown, period ignored  (AC)
 │ auto-settle throws (lock/log) → whole list error.tsx             [C-09]
 │ Σ money > 2,147,483,647 → PG 22003 → error.tsx                   [C-01 CRITICAL]
 │ bigint sums arrive as strings → no commas / string concat risk  [C-01]
 │ 0 rows → emptyKind (extra unfiltered count only then)            (AC)
 │ page>pageCount → last page; NaN/<1 → 1                           (AC-06)
 │ concurrent status change between aggregate & list → count≠rows momentarily (NOTE, C-09 remark)
```

Quote-table paging data flow:

```
lines[] (array order: server sortOrder + appended new lines)
   │  Table.groupRows() regroups non-contiguously  → flatRows (display order)      [C-04 order divergence]
   ▼
splitPages(displayIds, pinned) → current page rows → render (footer = full totals from quote-table)
   paste: onPasteAtCell(row) → quote-table uses lines.indexOf(row) → fills ARRAY order        [C-04]
          parseTsv(Excel "…\r\n") → phantom trailing row                                     [C-05]
          TSV cols = copyText of ALL columns → computed cols → uncleared error cells          [C-03]
   save:  all dirty lines (all pages) → server all-or-nothing (AC-09)
   commit numeric: Number(text) || 0  → comma/dot text becomes 0 silently                   [C-02]
```

## 3. Error flow

```
DB/driver error in RSC ──► throw ──► app/(app)/projects/error.tsx
      (Next server log: unstructured stderr + digest; no lib/log event)   (client console.error)
      user sees: 「프로젝트 목록을 불러오지 못했습니다」 + 다시 시도 (retry = correct Next 16 prop)
Server Action (code description) ──► authedActionClient ──► UserFacingError/Forbidden ──► onError → revert field + --danger line
Client numeric commit ──► Number(x)||0 ──► (no error) silent 0                            [C-02]
Clipboard write (04-19) ──► navigator.clipboard.writeText reject ──► "복사하지 못함 · 다시 Ctrl+C" (new unconfirmed string) [C-19]
```

## 4. Deploy sequence

```
04-08  docs: DECISIONS.md(11 entries) ─► SYSTEM.md ①–⑪ ─► code (Ctrl-only, form Ctrl+Enter, 대기 muted) ─► REQUIREMENTS/ROADMAP text [C-12]
04-09 ∥ 04-10 (wave 5)   04-09: lib/format-number + use-comma-input   04-10: migration 0011 (nullable col + UPDATE … WHERE description IS NULL)
04-25 ∥ 04-06 (wave 6)   (no file overlap verified)                    04-06: 0012 status five values (after 0011)
… 04-17 → 04-18 → 04-19 (waves 19–21)  ── ship together [C-26]
Phase end: /review → /qa → /cso → /ship ; Cloud Run: migrate job (0011, 0012) before new revision takes traffic
```

## 5. Rollback flowchart

```
Problem after deploy?
 ├─ list/totals wrong or 500 ──► revert 04-17+04-18(+04-19) code as a pair (no schema) ──► old list (count=) works; page= ignored
 ├─ code description UI broken ──► revert 04-10/04-25 code; keep 0011 (nullable, harmless); do NOT down-migrate
 ├─ comma input corrupts values ──► revert 04-09 Task 3 only (display module can stay); audit rows edited since deploy
 │                                   (action_log document_update entries) for 0 / ×100 values          [C-02]
 └─ Ctrl-only breaks a Mac user ──► by design (D-94); no rollback
```

## 6. User flow — list and paging

```
/projects (no params) ─► year=KST this year, R=Jan1–Dec31
   ├─ totals line above table: 합계 (2026 귀속 · N건) · 매출 · 견적 · 실행가 · 수익금 · 수익률 │ 2027 귀속 k건 제외 · 기간 미정 m건 제외
   ├─ groups by 종료월; spanning rows show 2행 `2027 귀속`; undetermined group last
   ├─ >50 rows → Pagination <a href=?…&page=N>; page 2 top repeats month header
   ├─ header click (04-18) → sort within month groups, page reset; hidden-column sort key → default sort
   ├─ filter change (native GET) → page reset, sort DROPPED [C-24]
   ├─ period from/to blur → server validates → inline error, filter ignored
   └─ 0 rows → none / default-view (전체 연도 보기) / filtered (필터 지우기)
Quote detail (>30 lines) → Pagination buttons (no URL) → ↓/↑/Tab cross pages → Ctrl+A/Ctrl+C all pages → paste crosses pages
   → save rejected → jump to first error page, 오류 N on other page numbers
```

---

## Findings

### C-01 — CRITICAL GAP · FACT-CORRECTION · §1/§2/§7/§10 · 04-17 Task 1 ①(c)(e), Task 2 ③; 04-18 Task 1
**Problem.** The totals query overflows `int4`, and money sums reach JS as strings.

**Evidence.**
- `repositories/projects.ts:197-200` casts every money sum with `::int`. Probe: sums above 2,147,483,647 fail with `22003 integer out of range`. With real data, a year of projects exceeds 21억, and the Phase-8 migration of 125 projects will certainly produce such a total in the 전체 연도 view. The result is that the list page renders error.tsx for everyone.
- `lineSumsSubquery` (:31-33) and the list columns (:153-155) are `sum(int)`, which is `bigint`, which node-postgres returns as a **string** (probe). Row amounts are therefore strings at runtime even though they are typed `number`. `formatKrw(value:number)=value.toLocaleString()` returns them unchanged, so current list rows render without commas.
- 04-17 adds `issuedSumsSubquery`, basis/profit expressions, bucket sums and "pageCount = 모든 구간 합" in domain JS. Any sum or count left as `bigint` becomes a string. Then `a + b` concatenates, which would give a wrong pageCount or wrong totals.
- The plans' fixtures use amounts ≤ 12,000,000, so neither failure is exercised.

**Remedy.**
- Rescue (fix): cast money aggregates `::bigint` and map at the repository boundary (`sql<number>\`…\`.mapWith(Number)`). Cast counts `::int`. Add one sentence to 04-17 ① as an invariant: "repository returns JS numbers for every aggregate".
- Verification: an integration test with two projects whose totals are about 1.5×10⁹ each asserts the exact total and `typeof === "number"` for every totals and row field. A unit assertion on `pageCount` covers a multi-bucket case.
- Failure visibility today: full-page error (visible but total outage) plus silent wrong typing.

### C-02 — CRITICAL GAP · FACT-CORRECTION · §2/§4 · 04-09 Task 3 ①②③ (behavior table, T-04-51)
**Problem.** Comma inputs can silently change the stored value.

**Evidence.**
- (a) The behavior table defines only keystroke-level rejection of `.` in KRW fields. It does not define paste or autofill of a whole string. The natural implementation (strip disallowed characters) turns an Excel-copied `1,234.00` into `123,400`, a silent 100× change. Over-precision foreign pastes are truncated (`4400.005 → 4,400.00`), which also changes the value.
- (b) Every numeric commit path the plan converts falls back silently: `quote-table.tsx:246` (unit price `amountRef.current.value`, which will contain commas), `:629` (quantity), `:690` (execution), and `revenue-section.tsx:108/167/232/245` (`Number(event.target.value) || 0`). If any of them reads display text instead of `rawValue`, `Number("1,200,000")` is NaN, then 0, and 0 is sent to the server as a valid number.
- T-04-51 ("쉼표가 남은 값은 서버에서 NaN이 되어 거부") is therefore false for grid and revenue cells.
- E2E covers only 실행가 and the settings FX field.

**Remedy.**
- Rescue: `formatNumberInput` parses the whole candidate string. In a KRW field, a fractional part of all zeros is dropped (`1,234.00 → 1,234`); any other fraction rejects the change (previous text is kept and the §7-2 line `원화는 소수점 없이 적어 주세요` appears). Foreign, FX and quantity pastes that exceed the precision limit are rejected the same way, not truncated.
- Every commit path uses `stripNumberInput` plus a `Number.isFinite` check and raises a cell or field error. Remove every `|| 0` on these paths.
- Verification:
  - Unit rows: `1,234.00`, `1234.56`, `₩1,234`, `4400.005`, and Backspace just after a comma.
  - E2E: quantity 1,200; USD unit price 4,400; revenue issued 12,400,000. Each is saved, reloaded and asserted.
- Failure visibility today: silent.

### C-03 — WARNING · DECISION · §4 · 04-19 Task 2 ③④ (copyText "각 열"), D-70/PROJ-05
**Problem.** Cross-project copy then paste (Ctrl+A → Ctrl+C → Ctrl+V) is broken. This is the only import path for PROJ-05.

**Evidence.**
- `applyPaste` maps TSV columns by position over all 11 columns, including `sort`, `quoteAmount`, `profit` and `status`, which have `isEditable: () => false` (`quote-table.tsx:728-745`). On existing rows these become error cells.
- Errors are cleared only when that column is committed (`clearCellError` via `commitCell`), and computed columns have no editor. The error cells can never be cleared, so save stays blocked.
- The 04-19 E2E flow is "첫 줄 만들기 → paste". Focus is then (0,0), the 번호 column, so row 1 gets 4 uncleared errors. If the user instead pastes at 소분류, every column shifts and every row errors.
- Foreign-currency lines copy the KRW first line, and paste forces `unitPriceCurrency:"KRW"` (`:792`). Currency and FX are dropped silently.

**Options.**

| Option | What it means | Effort / risk |
|---|---|---|
| **(A) recommended** | Copy all displayed columns (matches Excel layout). Paste treats computed columns (번호·견적가·차익·상태) as consumed and ignored, and counts them in the paste summary (`계산 열 N칸 무시`). Locked cells stay errors. Foreign lines add `외화 N줄 원화로 들어감`. | S / low |
| (B) | Copy writable columns only. Paste snaps to the first writable column. | S; Excel sheets with a 금액 column misalign |
| (C) | Keep current behaviour and document the limitation. | Breaks D-70 |

Verification: the 04-19 E2E round trip with a mixed-group, 45-line table including one USD line asserts 0 error cells and equal totals.

### C-04 — WARNING · FACT-CORRECTION · §4 · 04-19 Task 1 ③, Task 3 ①④
**Problem.** Display order and `lines` array order diverge.

**Evidence.**
- `Table.groupRows` regroups non-contiguous rows (`Table.tsx:61-71`).
- `addLine` appends at the array end (`quote-table.tsx:407-412`).
- Paste fills `lines[indexOf(row)+k]` in array order (`:750-760`).
- 번호 = `lines.indexOf(row)+1` (`:559`).
- `moveLine` (Alt+↑↓) swaps with array neighbours (`:439-452`).

Consequences after a user adds a line to a non-last group:
- Paste fills rows other than the next displayed rows. With pages, those rows may now be invisible on other pages.
- 번호 is not contiguous. 04-19's "첫 행 번호 31" holds only for single-group data.
- Alt+↑ can jump into another group.

§7-3 (자) "줄 순서대로" is ambiguous on which order is meant.

**Remedy.**
- Define "줄 순서 = 표시 순서". Either keep `lines` normalised into display order (insert a new or duplicated line at the end of its group), or have Table pass the display index. The 번호 column uses the global display index.
- Verification: E2E with two groups, add a line to group A, paste 3 rows at A's last original row, and assert the filled rows are the next three displayed rows. Assert that the page-2 numbers are contiguous.
- Failure visibility: values land in unintended rows (dirty marker visible only on that page).

### C-05 — WARNING · FACT-CORRECTION · §4 · 04-19 Task 3 ① (+04-26 cap)
**Problem.** Excel's trailing newline creates a phantom row.

**Evidence.** `parseTsv` returns a trailing `[""]` row for `"a\tb\r\n"` (`parse-tsv.ts:62-64`), and there is no test (`parse-tsv.test.ts`). Windows Excel appends CRLF to copied ranges. The effects are:
- a phantom new line with an error cell (select or number column);
- a paste summary that reads `46줄` instead of 45;
- a paste of exactly the remaining allowance under the 300 cap being rejected entirely (D-86).

**Remedy.**
- Strip one trailing line break before parsing, and keep `parseTsv("") → [[""]]`.
- Verification: unit `parseTsv("a\tb\r\n") → [["a","b"]]`, plus a cap-boundary paste test.
- Unknown: the real clipboard format needs to be confirmed in /qa on Windows Excel.

### C-06 — WARNING · FACT-CORRECTION · §2/§3 · 04-08 Task 1 ③ (T-04-48)
**Problem.** Ctrl+Enter can register the same project twice.

**Evidence.** `requestSubmit()` ignores the disabled-button guard, and `handleSubmit` has no `isExecuting` guard (`project-form.tsx:43-54`). Key auto-repeat (holding Ctrl+Enter), a quick double press, or possibly a double keydown from the Korean IME therefore produces two `createProjectAction` calls. Each allocates a document number.

**Remedy.**
- In the keydown handler, return early when `e.repeat || e.nativeEvent.isComposing || isExecuting`. Also guard `handleSubmit`.
- Verification: E2E presses `Control+Enter` twice quickly, then searches the unique name and expects exactly 1 row.
- Unknown: exact Windows IME keydown behaviour; verify in /qa on Edge/Chrome with the Microsoft Korean IME.

### C-07 — WARNING · FACT-CORRECTION · §0G/§11 · 04-08 truths 1–5, success_criteria "적힌 단축키가 전부 실제로 동작"
**Problem.** 04-08 claims every displayed shortcut works, but four do not.

**Evidence.**
- (1) `취소 Esc` on the registration form has no handler (`project-form.tsx:108`).
- (2) The hint line advertises `이동 Tab` and `범위 복사 Ctrl+C`. Neither is wired (grep finds no Tab or copy handler) until 04-19, which is 17 waves later.
- (3) TopBar `Ctrl+K` stays a dead display (F-03).
- (4) The new §7-9 rule bans `↵`, but `SYSTEM.md:407` `이 줄로 ↵` is not in the 25-line list, and the scan test checks U+2318 only.

**Remedy.**
- Narrow the truth to the combos 04-08 wires (Ctrl+S, Ctrl+Enter, Ctrl+D, form Ctrl+Enter).
- Wire Esc to `cancelHref`, or drop the `Esc` label.
- Record that Ctrl+C and Tab land in 04-19 (or hide them from the hint line until then).
- Extend the scan to `↵ ⌥ ⇧` and fix line 407.
- Verification: the extended scan test, plus an E2E pressing Esc on the form.

### C-08 — WARNING · FACT-CORRECTION · §3 · 04-17 T-04-90, Task 1 ③, Task 3 ②
**Problem.** Unvalidated URL params crash the list.

**Evidence.**
- `teamId` is passed straight to a uuid comparison (`page.tsx:69`, `projects.ts:90`), so `?teamId=abc` gives PG 22P02 and a 500. This is pre-existing, and T-04-90 claims all params are validated.
- After 04-17, `?year=0000` passes `/^\d{4}$/` and becomes range `'0000-01-01'`, giving PG 22008 and a 500. This is a **new regression**; the current `extract(year)=0` is harmless.
- `parseListPeriod` accepts year 0000 through JS `Date`.
- Repeated params arrive as `string[]`, but the page types them as `string`.

**Remedy.**
- Rescue: an invalid param falls back to the default view and never reaches SQL.
  - `teamId`: uuid shape and membership in the team list.
  - Year: clamped to 2000–2100 (period years too).
  - Arrays: take the first value.
- Verification: a table-driven unit/integration test of hostile params asserts a 200 response with the default view.
- Failure visibility today: error page, plus unstructured log noise.

### C-09 — WARNING · DECISION · §2/§8 · 04-17 Task 1 ③ (applyAutoSettlement before every list read), T-04-92
**Problem.** No rescue is defined for the write that now runs on every list read.

**Evidence.**
- The list GET now depends on a write: `UPDATE … RETURNING` followed by a `recordAction` for each row.
- 04-11 does not swallow log failures.
- If the write fails (lock_timeout, log insert error), the list becomes error.tsx.
- T-04-92 also overclaims: aggregate and list remain two statements with no shared snapshot.

**Options.**

| Option | What it means | Effort / risk |
|---|---|---|
| **(A) recommended** | Fail-open. Catch, `log.error("project_auto_settlement_failed", {…})`, continue reading. A row may show 진행 until the next load. | S |
| (B) | Fail-closed (today's implicit behaviour). Any settle failure takes the list down. | 0 / availability risk |
| (C) | Drop the list call site and rely on detail/save plus the Phase-7 scheduler. | Stale status on the list |

Verification for (A): an integration test with a stubbed `settle` that throws; the list still renders and one ERROR log line is emitted.

### C-10 — NOTE · DECISION · §11 · 04-17 `<probe_fallback>` "상단 2px 진행 바 … 색 토큰이 정해져 있지 않다"
**Problem.** The planner's statement is factually wrong.

**Evidence.** SYSTEM.md specifies `2px --accent` (lines 262, 809, 858). The real issue is a pre-existing internal conflict with §1-3 ("--accent 다섯 곳뿐", and the bar is not among the five). The bar is also app-wide: §7-1 button pending >300ms uses it, and it has never been built anywhere. For the list specifically:
- Filter, sort and page changes are full-document GETs (native form, plain `<a>`), so `loading.tsx` streams.
- LOADING is covered without the bar, apart from the browser's own indicator.

**Options.**

| Option | What it means | Effort / risk |
|---|---|---|
| **(A) recommended** | Defer app-wide. Correct the 04-17 wording. Record the §1-3 vs §7-7/§5 conflict and "progress bar unbuilt system-wide" in DECISIONS.md or OPEN-ITEMS. | S |
| (B) | Amend §1-3 to add the progress bar as accent use ⑥ (DECISIONS first) and build it in the shell. | Touches shell (D-23); scope expansion |
| (C) | Change §7-7/§5 to a neutral token (`--line-strong`). | System change |

No new colour is needed in any option.

### C-11 — NOTE · DECISION (already surfaced) · 04-17 `<probe_fallback>` ⚠ S1; 04-08 Task 3 ③ records it in OPEN-ITEMS
**Problem.** The 기간 미정 visibility rule (수주중 always; others only when `created_at` KST is in R) deviates from the literal D-90 ("맨 아래 그룹에 보이고").

**Recommendation.** Accept the plan's default; it is reversible in one line. The KST boundary test is already in the 04-17 acceptance.

### C-12 — NOTE · DECISION (process) · 04-08 Task 3
**Problem.** Task 3 hand-edits `.planning/REQUIREMENTS.md`, `ROADMAP.md`, `04-OPEN-ITEMS.md` and the o2b quick-task doc, then commits with `gsd-tools query commit`. This conflicts with CLAUDE.md "금지: `.planning/` 수동 편집" and CONTEXT "gsd_run으로 고친다(수동 편집 금지)".

**Evidence.** No gsd-tools subcommand edits requirement or roadmap text (verified). Precedent: `edd0d73` did exactly this.

**Options.**

| Option | What it means |
|---|---|
| **(A) recommended** | The user explicitly approves this documented exception (CLAUDE.md "먼저 말하고 승인"). |
| (B) | Route through `/gsd-phase` edit tooling where it applies. |
| (C) | Defer the text fixes. |

### C-13 — CRITICAL GAP · FACT-CORRECTION · §2/§11 · 04-10 Task 1 ⑥ ("CodeItemLabelInput 구조 그대로")
**Problem.** Copying the label editor's guard makes a description impossible to clear from the UI.

**Evidence.**
- The label input saves on blur only if `value.trim() && value !== label` (`code-item-form.tsx:101-103`).
- Copied for descriptions, clearing a description never saves. The field shows empty, the DB keeps the text, and a reload brings it back. This is silent. The "빈 문자열 → null" behaviour is tested only at domain level.
- Also, the evidence-type tax-rule row `colSpan={…5:4}` (`page.tsx:171`) must become 6/5 with the new column.

**Remedy.**
- Blur saves when `value.trim() !== (description ?? "")`, including the empty case.
- Verification: E2E clears a description, blurs, reloads and expects `—`.
- Update the colSpan and assert it in `code-tables.spec`.
- Low blast radius, but by the registry rule RESCUED=N / TEST=N / Silent.

### C-14 — WARNING · FACT-CORRECTION · §1/§3/§6 · 04-17 Task 1 ①(b) + behavior; 04-18 Task 1 behavior; D-85, D-38
**Problem.** The 입금액 exclusion and totals gating are under-tested.

**Evidence.**
- The only guard keeping hidden 입금액 out of 매출 and 수익금 is `kind = 'issue'` in `issuedSumsSubquery`, and no fixture includes a payment row.
- The totals DTO is hand-gated and not in the DTO registry. Only `ProjectListItemDto` is registered (`domain/projects/index.ts`), so the leak scan cannot see totals.
- The totals key-set tests cover two classes (quote-only, issued-only) but not "neither".

**Remedy.**
- Add a payment row to both integration fixtures and assert 매출 is unchanged.
- Add the neither-visible key-set case.
- Register `ProjectListTotals` or document the exemption against D-38.

### C-15 — NOTE · FACT-CORRECTION · §2/§5 · 04-09 Task 1 behavior
**Problem.** Non-finite values are undefined in the formatter.

**Evidence.** Intl renders `NaN`, `∞` and `-0.0%` (verified), and the behavior table has no rows for these inputs.

**Remedy.** Non-finite input returns `—` (plus a dev assertion); `-0` renders as `0`. Add unit rows.

### C-16 — NOTE · DECISION · 04-17/04-18 profit-rate definition
**Problem.** With a net issued basis ≤ 0 (for example a cancelling 수정세금계산서), the rate sign inverts: −1.5M / −1M = 150%. D-87 only defines basis 0 → `—`.

**Options.** Recommend basis ≤ 0 → `—` (keep literal D-87 otherwise). The alternative is to keep the literal rule. Effort XS.

### C-17 — NOTE · FACT-CORRECTION · §6 · 04-17 Task 1 ⑤ / Task 3 ⑤ E2E
**Problem.** The domain clock is injected, but E2E fixtures and assertions compute "올해" in the test process (UTC on CI) while the server uses KST. The tests fail between 15:00 and 24:00 UTC on Dec 31.

**Remedy.** Import `kstYear` from `lib/kst-date` in the spec.

Pointer outside this group: `createProject` uses `new Date().getFullYear()` for the number year (`domain/projects/index.ts:255`), so projects registered 00:00–09:00 KST on Jan 1 get the previous year's number. Owner: 04-11.

### C-18 — NOTE · FACT-CORRECTION · §4 · 04-19 Task 2 (crossPageTarget + re-split on keyboard page change)
**Problem.** A pinned new row can sit at display position 31 on page 1. Pressing ↓ from it re-splits, and "page 2 first row" is then the same row, so focus appears not to move.

**Remedy.** Compute the target by row id (the next id in global display order), then use `pageOfRow`. Add a unit case.

### C-19 — NOTE · FACT-CORRECTION (simplification) · 04-19 Task 2 ③
**Problem.** `navigator.clipboard.writeText` needs permission and a secure context, and it creates a new, unconfirmed copy string.

**Remedy.** Handle the native `copy` event on the grid instead (`clipboardData.setData`, then preventDefault). This removes the failure path and the new string. E2E can capture the copy event instead of reading the clipboard (Playwright permissions).

Verify that Chromium fires `copy` with a collapsed selection.

### C-20 — NOTE · FACT-CORRECTION · §0I · 04-09 Task 3 ③
**Problems.**
- "숨은 값 대신 폼 제출 때 rawValue" is ambiguous. Specify that the visible input has no `name`, and that a hidden input carries `name` with `rawValue` (FormData paths) or the value goes through `execute({value: rawValue})`.
- Caret behaviour on Backspace next to a comma is unspecified.
- The claim "원화 서식 결과는 기존과 같아야" is untrue for list rows: today they render without commas because of C-01. The change is harmless.

### C-21 — NOTE · DECISION (verify intent) · §1
**Problem.** `projectFilterConditions` includes archived projects when `scope.includeArchived` is true (the archive-menu viewer, i.e. 시스템 관리자). The 연간 합계 for those viewers therefore includes archived projects, while PMs' totals do not. This is pre-existing.

**Recommendation.** Always exclude archived projects from the main list and totals (a one-line change), unless intended otherwise.

### C-22 — NOTE (outside group; user or money-schema owner to verify)
**Problem.** Every `*_amount_krw` is `integer` (`money-columns.ts buildAmountKrw`), so any single value above 2,147,483,647 KRW fails to insert. This covers a line, an invoice and the pre-estimate. The S15 "13자리 원화" backstop can therefore never occur in real data.

**Action.** Confirm with the user the realistic maximum for a single invoice or pre-estimate.

### C-23 — NOTE · §7 performance
**Observations.**
- 04-17 makes the request sequential: settle UPDATE → aggregate → clamp → list → count only when 0 rows. That is 3–4 round trips, previously a 2-query `Promise.all`.
- `lineSumsSubquery` aggregates all quote_lines of all revisions, twice per request.
- At this scale (about 150 projects a year and thousands of lines), p99 stays well under 500 ms. `projects_end_date_idx` exists; a `start_date` index is not needed.
- OFFSET is fine at this scale.
- The 300-line table renders only 30 rows per page, cheaper than today.

**Action.** Optional: record the p99 in the DOM audit.

### C-24 — NOTE · FACT-CORRECTION or DECISION-lite · 04-17 Task 3 ③
**Problem.** The filter form carries only status, teamId, year and q (plus from/to), so any filter change drops the sort. The spec is silent. A hostile QA tester would report "my sort vanished".

**Remedy.** Add hidden `sort` and `dir` inputs to the filter form (the page still resets).

### C-25 — NOTE · FACT-CORRECTION · 04-10 Task 2 verify
**Problem.** The seed/migration diff command passes vacuously if zero `description: "…"` matches are found.

**Remedy.** Require at least 13 matches.

### C-26 — NOTE · §9/§10
**Problem.** Between 04-17 and 04-18 (waves 19→20), the totals use D-87 수익금 while the rows still show the old line-차익.

**Remedy.** Ship 04-17, 04-18 and 04-19 in one deploy, and roll back as a pair.

### C-27 — NOTE · 04-17 Task 2 behavior
**Problem.** `pageWindow(4,12)` gives `[1,…,3,4,5,…,12]`, which hides a single page (2) behind `…`.

**Remedy.** Show the page when the gap is 1. Add rows (4,12) and (9,12).

### ALREADY-COVERED
- AC-01: list and totals share one `projectFilterConditions` (04-17 key_links, acceptance).
- AC-02: a spanning project is counted once, in its end year; the sum of both years equals the all-years total (04-17 prohibition + test).
- AC-03: D-92, no stored year totals (04-17 acceptance: no `db/migrations` files).
- AC-04: row-level reverse-derivation block, where profit fields require both items (04-18 T-04-93 + key-set tests).
- AC-05: hidden-column sort falls back to the default (04-18 T-04-94 + test).
- AC-06: out-of-range page shows the last page, and page concatenation equals the whole (04-17 Task 2 integration). Sort stability comes from the `projects.id` tiebreak (`projects.ts:168`).
- AC-07: `columnStep` is computed only from received amounts (04-18 T-04-96 + behavior row).
- AC-08: the KST boundary for `created_at` (04-17 acceptance).
- AC-09: saving from any page sends dirty lines from all pages (04-19 acceptance); totals come from all lines (04-19 prohibition).
- AC-10: code description is admin-only, with the forbidden and archived guards tested (04-10 T-04-54).
- AC-11: tokens. `tokens.css` diff = 0 (04-08 verify), and the existing test asserts every SYSTEM.md token exists. All tokens the revisions use were checked (`--fs-lg --fs-sm --fs-xs --line-strong --touch-min --cell-pad-x --s-2 --s-3 --surface`).
- AC-12: the D-94 VALIDATION-row conflict is surfaced (04-08 probe_fallback).
- AC-13: migration numbering, lock timeouts, and squawk (04-10 verify).

---

## 0G. Complexity / minimum change
- The plans generally stay minimal: one formatter, one hook, one pagination component, one list-view module.
- **Simplifications available:**
  - Use the copy event instead of `navigator.clipboard` (C-19).
  - Drop the new copy-failure string.
  - Compute `pageCount` from the aggregate rather than adding a separate count (already planned).
- **Stated invariants not held:** 04-08 "전부 동작" (C-07); T-04-51 server rejects commas (C-02); T-04-92 "같은 상태" (C-09 remark); the planner's statement that the progress-bar colour is not specified (C-10).

## 0I. Temporal interrogation (implementer view)
- **Hour 1:** `lib/format-number` and `page-window` are pure and easy. **Surprise:** list rows are already strings (C-01), and `formatKrw` "works" only because Intl accepts strings.
- **Hours 2–3 (ambiguities):** TextField hidden-value wiring (C-20); what "줄 순서" means (C-04); which columns get `copyText` (C-03); label-guard copy (C-13); year/teamId validation (C-08).
- **Hours 4–5 (integration surprises):**
  - The 04-19 copy-to-paste E2E fails on the 번호/computed columns (C-03).
  - The overflow shows up the first time someone tests a realistic amount (C-01).
  - Clipboard permissions in Playwright (C-19).
  - The phantom Excel row (C-05).
- **Hour 6+ (wish list):** a structured log for list failures (C-09); a KST-aware E2E clock (C-17); pinned-row keyboard semantics (C-18).

## 8. Observability
- A list render error reaches only Next's default stderr log (digest), plus a client `console.error` in error.tsx. There is no `lib/log` event with a code; recommend `log.error("project_list_failed",{pgCode})` in `loadProjectList` (NOTE, folded into C-09).
- Page clamping and period parse errors need no logs: they are user-visible and harmless.
- The auto-settlement failure is the one path that needs a structured log (C-09).

## 11. Design/UX states (summary)

| Surface | FEATURE | LOADING | EMPTY | ERROR | SUCCESS | PARTIAL |
|---|---|---|---|---|---|---|
| List table | 04-17/18 | loading.tsx skeleton (full-document GET) — bar deferred (C-10) | 3 branches ✔ | error.tsx ✔ (but C-01/C-08 trigger it) | n/a | column/key gating ✔ |
| Totals line | ✔ | label only ✔ | hidden ✔ | hidden with page ✔ | — | received keys only ✔ (C-14 test gap) |
| Pagination (list) | ✔ | as list | none ≤50 ✔ | out-of-range → last ✔ | — | — |
| Period filter | ✔ | — | — | inline server error ✔ | — | error + filter ignored ✔ |
| Code description editor | ✔ | none (label precedent) | `—` ✔ | revert + line ✔ | none shown (precedent) | clear-to-null broken (C-13) |
| Quote pages | ✔ | none (client) ✔ | ≤30 no bar ✔ | 오류 N + jump ✔ | tint | cross-page paste summary ✔ (C-03/04/05) |

- Keyboard behaviour and the Windows Ctrl scan are covered by 04-08, apart from C-07.
- The SYSTEM.md ①–⑪ revisions keep DECISIONS first and add no new colours. The only correctness nit is `↵` at line 407 (C-07).

---

## Error & Rescue registry

| Codepath | What can go wrong | Rescued? | User sees |
|---|---|---|---|
| repo.aggregateProjects `::int` | Σ > 2^31 → 22003 | N | error.tsx (outage) — C-01 |
| repo.listProjectsPage bigint sums | string typed as number | N | no commas / wrong arithmetic — C-01 |
| page.tsx teamId / year=0000 | PG 22P02 / 22008 | N | error.tsx — C-08 |
| loadProjectList → applyAutoSettlement | lock / log failure | N (unspecified) | error.tsx — C-09 |
| clampPage | NaN, <1, >max | Y | first / last page |
| parseListPeriod | bad format / reversed / 02-30 | Y | inline error, filter ignored |
| lib/format-number | NaN / ∞ / -0 | N | "NaN" / "∞" / "-0.0%" — C-15 |
| formatNumberInput (KRW paste "1,234.00") | dot stripped → ×100 | N | silent wrong value — C-02 |
| cell / revenue commit `Number(x)||0` | comma text → 0 | N | silent 0 saved — C-02 |
| updateCodeItemDescription >40 / forbidden / archived | server reject | Y | revert + `--danger` line |
| CodeItemDescriptionInput clear | not saved | N | silent (reload restores) — C-13 |
| Ctrl+Enter repeat / IME | double submit | N | two projects — C-06 |
| paste computed columns | uncleared error cells | N | save blocked, cannot clear — C-03 |
| parseTsv trailing CRLF | phantom row | N | extra error row / cap reject — C-05 |
| Ctrl+C writeText | permission reject | Y (new string) | 복사하지 못함 — C-19 |

## Failure Modes registry

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---|---|---|---|
| aggregateProjects money `::int` | integer out of range at 21억 | N | N | error page (full outage) | stderr only |
| list row bigint→string | wrong type, no commas, concat risk | N | N | **Silent** | N |
| formatNumberInput KRW decimal paste | ×100 value change | N | N | **Silent** | N |
| numeric commit `||0` (qty, unit price, revenue) | comma text → 0 | N | partial (실행가 only) | **Silent** | N |
| CodeItemDescriptionInput clear | never saves | N | N (UI) | **Silent** | N |
| Copy→paste computed columns | stuck error cells | N | N (E2E would fail) | blocked save | N |
| Paste order vs display order | wrong rows filled | N | N | dirty marker (maybe off-page) | N |
| Excel trailing CRLF | phantom row | N | N | error cell / cap rejection | N |
| Ctrl+Enter double submit | duplicate project | N | N | two rows | action_log ×2 |
| teamId / year hostile params | PG error | N | N | error page | stderr |
| auto-settle in list GET | write failure | N | N | error page | stderr |
| payment rows in 매출 | 입금액 leak (if filter regresses) | by code | N | leak (silent) | N |
| formatter NaN / ∞ | garbage text | N | N | "NaN" / "∞" | N |
| E2E year at New Year UTC | flaky test | — | — | CI red | — |
| clampPage | out of range | Y | Y | last page | N (fine) |
| parseListPeriod | invalid | Y | Y | inline error | N (fine) |

Rows with RESCUED=N, TEST=N and USER SEES=Silent are **CRITICAL GAPs**: C-01 (bigint string), C-02 (×100 paste, `||0`) and C-13 (description clear). The payment-row leak row is guarded by code (the `kind` filter), so it is kept at WARNING (C-14).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN | mode: HOLD_SCOPE, 19 critical gaps (모두 승인된 수정안 T1~T18, PLAN 반영 대기); 122 findings, 21 decisions answered |
| Outside Review | `codex exec` (plan-review, /plan-ceo-review) | Independent 2nd opinion | 1 | issues_found | 7 findings; 7 resolved (OV-1~OV-7: 5 사실 정정, 2 사용자 결정 D20·D21); 0 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | 아직 실행 안 함 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 해당 없음(SYSTEM.md 있음, CLAUDE.md §4만 적용) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 해당 없음 |

- **OUTSIDE COVERAGE:** codex · plan-review · completed · 7 findings (P1 6, P2 1), 전부 원장 OV-1~OV-7로 처리.
- **CROSS-MODEL:** 네이티브 분석(Opus 에이전트 3개)과 Codex가 겹친 지적 — 보관함 복원 우회(A-19·B-04 ↔ OV-2), 동시 저장 경합(A-06·B-01 ↔ OV-3), 팀 범위 권한(A-27 ↔ OV-4), 읽을 때 자동 정산의 쓰기(C-09 ↔ OV-5). Codex만 잡은 것 — 승인 합계를 바꾸는 취소·보관 경로(OV-1), FOR SHARE로는 줄 상한이 안 지켜짐(OV-3), 재시드 뒤 검사하는 마이그레이션 테스트(OV-6), 최종 엑셀 확인 부재(OV-7). 모델 식별: Codex 쪽은 CLI 기본 모델, 네이티브 쪽은 이 세션의 Opus 에이전트.
- **VERDICT:** CEO 리뷰 완료(결정 미해결 0) — 치명 갭 19건은 승인된 수정안으로 PLAN에 반영해야 해소된다. eng review required.

NO UNRESOLVED DECISIONS
