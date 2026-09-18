# Project Research Summary

**Project:** PLANT8 ERP — 프로젝트·지출·손익 관리 시스템
**Domain:** 사내 소규모 ERP (config-driven internal business system) — BTL 광고대행사, 10→30명, 비개발자 1인 + Claude Code 운영
**Researched:** 2026-09-17
**Confidence:** MEDIUM-HIGH

## Executive Summary

이 시스템은 "제품을 파는" SaaS가 아니라 PLANT8 한 회사만 쓰는 사내 도구이며, 이미 세 번(`plant8-erp-rebuild`, `260807`, `260907`) 같은 회사가 같은 문제를 재구현하려다 범위 과다로 실패했다(STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md 공통 근거: `docs/research/repo-audit-260917.md`). 네 리서치가 이구동성으로 도출한 결론은 하나다 — 이 규모(10~30명, 표 10~20개면 충분)에서 정답은 레이어가 적은 단일 모놀리스(Next.js 풀스택 + Postgres, ARCHITECTURE.md/STACK.md)이고, 실패 원인은 기술이 아니라 "코드 수정 없는 운영"을 향한 설정·권한·워크플로 유연성이 통제 없이 계속 커진 것(PITFALLS.md Pitfall 1·2·12)이었다.

권장 접근은 인트라넷 4기능(프로젝트·견적 줄·지출결의+결재·법인카드) 대체를 최우선 마일스톤으로 고정하고, 그 위에 손익·목표·확인증·알림을 순서대로 얇게 얹는 것이다(FEATURES.md MVP 정의, ARCHITECTURE.md Suggested Build Order). 스택은 Next.js 16 + TypeScript + Drizzle ORM + Postgres, 호스팅은 비용 최소화를 위해 Cloud Run + Neon Postgres를 1순위로, Cloud SQL을 대안으로 제시한다(STACK.md). 아키텍처는 권한(계급×메뉴×동작 + 계급×정보항목 + 팀 스코프)을 repository 레이어에서 강제하고, 결재는 워크플로 엔진 없이 표 3개 + 상태기계 함수로, 커스텀 필드는 JSONB + `field_definitions`로, 손익은 SQL 뷰가 아니라 TypeScript 서비스 함수가 결과와 근거(trace)를 함께 반환하는 방식으로 계산한다.

가장 큰 위험은 기술적 실패가 아니라 (1) 또다시 범위가 과다해지는 것, (2) 설정 화면은 있는데 서버가 실제로 읽지 않는 것, (3) 손익 계산이 설정 변경으로 과거 확정 숫자를 소급해서 바꿔 기획본부의 신뢰를 무너뜨리는 것이다(PITFALLS.md Pitfall 1·2·5·6). 완화책은 각 페이즈를 "인트라넷 대비 이게 없으면 못 쓰는가"로 검증하고, 설정 키마다 "서버가 읽는지" 테스트로 강제하고, 손익·결재선을 정산/발행 시점에 스냅샷으로 고정해 진행 중 값과 확정 값을 명확히 분리하는 것이다.

## Key Findings

### Recommended Stack

핵심은 "Hono API 서버 + React SPA"라는 이중 코드베이스를 다시 만들지 않는 것이다 — 세 번의 실패가 전부 이 구조였다(STACK.md). 대신 Next.js 16(App Router) 단일 앱이 화면과 서버 로직(Server Actions)을 한 TypeScript 코드베이스로 합친다. 호스팅은 사용자가 정한 우선순위(비용 > 유지보수 쉬움 > 단순함 > 이식성)를 그대로 적용하면 Cloud Run + Neon Postgres(월 $0~3, 앱·DB 모두 완전 스케일-투-제로)가 1순위이고, Cloud Run + Cloud SQL(월 $10~30, DB는 상시 과금되어 진짜 0원은 불가)이 2순위다.

**Core technologies:**
- Next.js 16.2.x (App Router) + React 19.2: 프런트·백을 한 앱으로 통합, Cloud Run에 얇은 컨테이너 하나만 배포 — STACK.md
- TypeScript 6.0.x (strict): 검토자 없는 1인 유지보수 환경이라 최신 메이저(7.0/tsgo)보다 생태계가 검증된 버전 우선 — STACK.md
- PostgreSQL 16.x/17.x + Drizzle ORM: 손익 드릴다운·승인 이력·코드표 조인이 관계형 쿼리 중심이라 문서형 DB보다 적합, 스키마가 TS 코드라 생성 SQL을 그대로 추적 가능 — STACK.md, ARCHITECTURE.md
- better-auth: 이메일+비밀번호 기본, Google OAuth는 환경변수 스위치로 추가 — "회사 GCP에서 Google 로그인 추가, 전환은 환경 변수" 요건과 정확히 일치 — STACK.md
- @google-cloud/storage + @react-pdf/renderer: 증빙·확인증 파일 저장과 정산서/확인증 PDF 생성. Puppeteer(Chromium 번들) 대신 순수 JS 렌더러를 써서 Cloud Run 콜드스타트 전략과 충돌하지 않음 — STACK.md

**호스팅 결정 사항(리뷰 게이트 필요):** STACK.md는 Neon(Singapore 리전, Seoul 없음)을 비용·유지보수 기준 1순위로 권장하지만, ARCHITECTURE.md는 서술 전반에서 Cloud SQL을 기본 가정으로 쓴다. PROJECT.md는 "개인정보(주민등록번호·계좌번호) `/cso` 보안 감사 필수"라고만 명시하고 데이터 거주지(data residency) 요건은 명시하지 않았다 — 이 리서치는 **Neon을 비용 우선 권장안으로, Cloud SQL을 "회사 데이터가 반드시 국내에 있어야 한다"는 요건이 확인될 경우의 대안**으로 제시한다. 데이터 거주지 여부는 이 문서가 답할 수 없는 열린 질문이며 로드맵 첫 페이즈(배포 스켈레톤) 전에 사용자 확인이 필요하다.

### Expected Features

이 시스템의 진짜 차별점은 두 가지뿐이다: 원가 3단 우선순위(증빙>승인액>견적)로 드릴다운 가능한 프로젝트별 손익, 그리고 코드 수정 없이 결재선·권한·정보 노출을 바꾸는 관리 화면(FEATURES.md). 나머지 기능은 "인트라넷 사용자가 이미 매일 쓰던 것"이거나 "만들지 말아야 할 것"이다.

**Must have (table stakes, v1 — 인트라넷 대체 최소 요건):**
- 프로젝트 등록·목록·상세, 견적 줄 원장(서버 계산 차익), 지출결의+4단 결재(빈 자리 건너뜀, 설정 가능), 법인카드 사용 등록+견적 줄 매칭 — 인트라넷 실사용 데이터(125건/1,379행/464건/433건) 전부 이전 대상
- 마스터 코드표(거래처·클라이언트·직원·법인카드·분류) + 자동완성, 데이터 이전(멱등·행수 검증), 관리 화면 최소셋(사람·계급·팀, 권한표, 결재 단계 설정, 코드표 관리), 로그인(이메일+비밀번호)

**Should have (v1.x — v1이 실제로 매일 쓰이기 시작한 뒤):**
- 증빙 첨부 + 필수 규칙 on/off, 프로젝트 손익(3단 우선순위+드릴다운+계산식 노출), 정보 노출표, 마감·기한 알림(인앱+이메일), 연차 신청·승인(다른 기능과 결합도 낮아 병렬 개발 가능)

**Later within scope (v2 성격이지만 PROJECT.md Active 요구사항 — Out of Scope 아님):**
- 팀 손익(수주 실패 비용+관리비) + 연간 목표·인센티브 — 프로젝트 손익이 먼저 검증돼야 신뢰 가능(FEATURES.md dependency)
- 기타소득 확인증 현장 수집(PII, 별도 인증 경로) — 보안 감사 완료 후
- 관리자 정의 커스텀 필드(4종 고정 타입) — "이 칸이 없어서 못 쓴다"는 요청이 실제로 나온 뒤, 선제적으로 만들지 않는다
- 설정 JSON export/import, Google 로그인(회사 GCP 전환 이벤트에 종속)

**Out of Scope (PROJECT.md 확정 + FEATURES.md Anti-Feature 근거):**
- 홈택스 API 연동, 별도 구매요청 모듈, 매출·수금 전체 대장, 리저브 관리, 대결(위임 결재), 조건부 결재 분기, 영수증 OCR, 카카오톡/슬랙 알림, 별도 감사 로그 화면, 네이티브 앱, 리포트 빌더, 다단계 근태 연동 연차 자동계산 — 전부 260807/260907에서 실제로 시도했다가 뒤집히거나 미완으로 남은 항목

### Architecture Approach

레이어를 최소화한 단일 Cloud Run 서비스 — API 서버 하나, DB 하나, 백그라운드 실행기 없음(큐 대신 Cloud Scheduler가 같은 서버의 HTTP 엔드포인트를 두드림). SQL은 `repositories/` 한 곳에만 존재하고 모든 조회 함수가 `viewer` 컨텍스트를 필수 인자로 받아 팀 스코프를 강제한다(ARCHITECTURE.md).

**Major components:**
1. `authz/` — 계급×메뉴×동작(can), 계급×정보항목(visible, 응답 직렬화 시점에 필드 삭제), 팀 스코프(scopeFor, repository WHERE 강제) 세 축을 단일 진입점으로 관리
2. `settings/` — 설정 키의 원본은 코드의 typed registry, 값은 DB. 등록된 모든 키가 서버 코드에서 실제로 읽히는지 테스트로 강제(Pitfall 2 직접 대응)
3. `domain/pnl` — 손익 계산을 SQL 뷰가 아닌 TypeScript 서비스 함수로 수행해 계산식을 그대로 화면에 노출하고, 계산과 동시에 드릴다운 trace(어느 견적 줄/지출결의/증빙에서 왔는지)를 생성
4. `domain/approvals` — 워크플로 엔진 없이 표 3개(routes/steps/instances) + `nextStep()` 순수 함수로 N단계 결재를 표현, expenses·leave가 공유
5. `domain/custom-fields` — `field_definitions` 표 + 각 엔티티의 JSONB `custom_fields` 컬럼, EAV 대비 조인 폭발 없음

### Critical Pitfalls

1. **네 번째 과잉설계** — 페이즈마다 "인트라넷보다 못한가"로 검증하고, 인트라넷 전체 규모(15,650줄, 표 10개)를 넘기면 멈춘다. "완료"의 정의를 실사용자 로그인·데이터 입력으로 못박는다.
2. **설정 지옥(서버가 안 읽는 설정)** — 설정 키마다 "값을 바꾸면 동작이 바뀐다"는 통합 테스트를 의무화. 260807은 설정 65개 중 서버가 읽는 게 6개뿐이라 폐기됐다.
3. **권한×정보노출 누수** — 화면(UI)만 막고 API/엑셀 내보내기/자동완성은 안 막는 사고가 가장 흔하다. 필드 단위 가시성은 API 응답 직렬화 레이어 한 곳에서만 강제.
4. **결재선 편집이 진행 중 문서를 깨뜨림 / 계산식 변경이 과거 손익을 소급 변경** — 두 문제 모두 "현재 설정을 실시간 참조"하는 구현에서 나온다. 결재선은 문서 생성 시점에 스냅샷, 손익·목표·인센티브는 정산(마감) 시점에 스냅샷으로 확정하고 그 이후 설정 변경은 재계산하지 않는다.
5. **AI 에이전트 특유의 유지보수 드리프트** — `any` 사용, 모킹 과다 테스트, 컨벤션 표류가 검토자 없는 1인 환경에서 조용히 쌓인다. 린트로 `any` 금지를 CI에서 강제하고 핵심 흐름(로그인→지출결의→결재→손익)은 통합 테스트로 실제 동작을 검증.

## Implications for Roadmap

세 리서치(FEATURES 의존성 체인, ARCHITECTURE 권장 빌드 순서, PITFALLS 페이즈 매핑)가 사실상 같은 순서를 가리킨다. 아래는 그 세 순서를 병합한 로드맵 출발점이다. **v1 = 인트라넷 대체(페이즈 1~5), v1.x = 신뢰 구축 기능(페이즈 6~7), v2 성격이지만 이번 마일스톤 범위(페이즈 8~11)** 세 구간으로 나눈다(PROJECT.md는 이 전부를 Active 요구사항으로 두고 있으므로 "미룬다"는 뜻이 아니라 "이 순서로 짓는다"는 뜻).

### Phase 1: 배포 스켈레톤 + 스코프 고정 (v1)
**Rationale:** 260907/260807이 "운영 DB 없음", "완성 뒤 이전"으로 실패했다 — 배포가 된다는 것을 가장 먼저, 기능 없이 증명한다(ARCHITECTURE.md Suggested Build Order #1, Pitfall 1·11).
**Delivers:** Cloud Run + DB(Neon 또는 Cloud SQL, 데이터 거주지 확인 후 확정) + Secret Manager + `scripts/deploy.sh` 단일 배포 스크립트, "이번에 안 만드는 것" 스코프 문서.
**Uses:** STACK.md Part A 호스팅 결정.
**Avoids:** Pitfall 1(과잉설계), Pitfall 11(Cloud SQL 상시과금 착각).

### Phase 2: 인증·인가 핵심 + 설정 레지스트리 골격 (v1)
**Rationale:** 이후 모든 화면·API가 이 위에 얹히므로 가장 먼저 만들어야 "권한 체크를 나중에 끼워 넣는" 실수가 구조적으로 불가능해진다(ARCHITECTURE.md #2~4).
**Delivers:** `people/positions/teams` 마스터, 세션+로그인(이메일+비밀번호, Google은 인터페이스만 준비), `can()/visible()/scopeFor()`, 설정 키 2~3개로 registry→DB→관리 화면 자동생성→읽힘 검증 파이프라인.
**Implements:** ARCHITECTURE.md 패턴 1(authz), 패턴 3(settings registry), 패턴 8(auth).
**Avoids:** Pitfall 2(설정 지옥), Pitfall 3(권한 누수).

### Phase 3: 핵심 마스터 + 인트라넷 CRUD 3종 (v1)
**Rationale:** 인트라넷 4기능의 데이터 뼈대. 커스텀 필드 스키마(JSONB `custom_fields` 컬럼)는 이 표를 만드는 시점에 함께 넣는다 — 나중에 얹으면 초기 컬럼 설계와 충돌한다(ARCHITECTURE.md #5, 지시된 결정 사항).
**Delivers:** 프로젝트 등록·목록·상세, 견적 줄 원장(서버 계산 차익), 거래처·클라이언트·직원 마스터 + 자동완성. `field_definitions` 표는 만들되 관리 화면(입력 UI)은 이 페이즈에서 만들지 않는다.
**Addresses:** FEATURES.md Table Stakes(프로젝트/견적 줄/마스터).
**Avoids:** Pitfall 1, 13(커스텀 필드 조기 과설계 — 스키마만 두고 UI는 늦춘다).

### Phase 4: 데이터 이전 (v1)
**Rationale:** Phase 3의 스키마가 안정된 뒤에만 작성 가능. "완성 뒤 이전"이 세 번의 실패 공통 원인이므로 인트라넷 4기능 대체가 끝나는 즉시 리허설·전환한다(ARCHITECTURE.md #6, Anti-Pattern 4).
**Delivers:** `extract→transform→load→verify` 멱등 스크립트, 표별 행수 검증 + 인코딩(EUC-KR/UTF-8)·타임존(KST/UTC)·고아 행 샘플 대조, 평문 비밀번호 미이관 + 신규 발급, 인트라넷 쓰기 라우트 강제 차단.
**Avoids:** Pitfall 8(인코딩·타임존·고아행), Pitfall 9(평문 비밀번호·병행 규율 붕괴).

### Phase 5: 지출결의 + 결재 + 법인카드 (v1)
**Rationale:** Phase 2(authz)·설정(결재 단계)이 있어야 만들 수 있다. "돈이 나가려면 결재를 거친다"는 회사의 유일한 강제 규율이며, `approvals` 모듈은 여기서 범용으로 만들어 이후 연차가 재사용한다(ARCHITECTURE.md #7~8).
**Delivers:** 표 3개(routes/steps/instances) 기반 4단 결재(빈 자리 건너뜀), 결재선은 **문서 생성 시점 스냅샷**으로 고정, 법인카드 사용 등록 + 견적 줄 1:1 매칭(상호배타 제약으로 이중 계산 차단).
**Addresses:** FEATURES.md Table Stakes(지출결의+결재, 법인카드).
**Avoids:** Pitfall 4(결재선 편집이 진행 문서 파괴), Pitfall 7(법인카드/지출결의 이중 계산).

### Phase 6: 증빙 첨부 + 마감 규칙 (v1.x)
**Rationale:** Phase 5가 있어야 "무엇에 첨부하는지"가 존재. v1이 안정적으로 쓰이기 시작한 뒤 지급 규율을 강화하는 트리거(FEATURES.md).
**Delivers:** GCS 서명 URL 업로드, 지출결의·법인카드 건 연결, 증빙 필수 규칙 on/off(설정).
**Implements:** ARCHITECTURE.md 패턴 7(files/evidence).
**Avoids:** UX Pitfall("증빙을 나중에 하도록 허용" — 인트라넷의 `attach_file` 전부 NULL 재현 방지).

### Phase 7: 프로젝트 손익 (v1.x, 핵심 가치)
**Rationale:** 견적 줄(Phase 3)·지출결의 승인액(Phase 5)·증빙(Phase 6) 세 소스가 모두 실데이터로 쌓인 뒤에만 3단 우선순위 계산이 의미를 갖는다(FEATURES.md dependency notes). 이 프로젝트의 존재 이유인 "같은 숫자를 납득한다"가 여기서 결정된다.
**Delivers:** `domain/pnl` 서비스 함수(결과+trace 동시 반환) — 진행 중 프로젝트는 라이브 계산(예상값 포함), **프로젝트가 정산/완료 처리되는 시점에 손익을 불변 스냅샷으로 확정**하고 이후 설정(매출 기준·연도 귀속·계산식) 변경은 확정된 스냅샷을 재계산하지 않는다. 드릴다운·계산식 노출 화면은 **경영관리·대표에게만** 노출(정보 노출표로 통제); 기획본부는 결과 숫자만 보되 자신이 입력한 값과 어긋나지 않음(같은 용어·단위·즉시 반영)으로 납득시킨다.
**Implements:** ARCHITECTURE.md 패턴 4(computed-in-TypeScript + trace).
**Avoids:** Pitfall 5(소급 변경), Pitfall 6(기획본부 신뢰 붕괴).
**Research flag:** 이 페이즈는 계획 단계에서 "정산(마감) 시점 정의"와 "매출 기준·연도 귀속 확정 절차(기획본부·경영관리 합의)"를 별도로 다뤄야 한다 — PROJECT.md에 절차가 없다.

### Phase 8: 연차 신청·승인 (v1.x, 병렬 가능)
**Rationale:** Phase 2(authz)·Phase 5(approvals 모듈)만 있으면 독립적으로 만들 수 있어 손익/목표와 병렬 진행 가능(FEATURES.md, ARCHITECTURE.md #12).
**Delivers:** 연차 신청·승인·잔여 일수, `approvals` 모듈 재사용.
**Addresses:** FEATURES.md Table Stakes(연차).

### Phase 9: 마감·기한 알림 (v1.x)
**Rationale:** Phase 5(결재 대기)·Phase 6(증빙 미첨부)·지급일 데이터가 이미 존재해야 알림 규칙이 평가할 대상이 생긴다 — 가장 마지막에 두는 이유는 이전 단계들의 산출물에 의존하기 때문(ARCHITECTURE.md #13).
**Delivers:** Cloud Scheduler → `/internal/notify-tick`, 인앱함+이메일, `notification_dedupe_log`로 중복 방지.
**Implements:** ARCHITECTURE.md 패턴 6(no queue).

### Phase 10: 팀 손익 + 연간 목표·인센티브 (이번 마일스톤 범위, 늦은 순서)
**Rationale:** Phase 7(프로젝트 손익)이 검증돼야 팀 단위 합산 숫자를 신뢰할 수 있다(FEATURES.md dependency). PROJECT.md Active 요구사항이므로 배제가 아니라 순서상 후순위.
**Delivers:** 팀 손익 = 프로젝트 손익 합 − 수주 실패 비용 − 팀 직접 관리비, 연간 목표(팀장까지 열람) + 인센티브 계산(대표·경영관리만 열람, 정보 노출표로 통제).
**Addresses:** FEATURES.md Differentiator(팀 손익, 목표·인센티브).

### Phase 11: 기타소득 확인증 (PII, 이번 마일스톤 범위, 보안 감사 후)
**Rationale:** Phase 6(files/evidence)의 암호화 인프라를 재사용하되, 일반 인증 체계와는 완전히 분리된 트랙(외부 토큰 링크)이라 마지막에 둔다. `/cso` 보안 감사 완료가 선행 조건(PROJECT.md).
**Delivers:** 토큰 기반 1회성 외부 제출 링크, 주민등록번호 앱단 암호화(AES-256-GCM, Cloud KMS), 접근 로그, 보존기간 파기 절차.
**Avoids:** Pitfall 10(개인정보보호법 위반).
**Research flag:** 개인정보보호법 제24조의2 적용 범위·보존기간은 법령 원문만 확인됐고 실무 적용은 `/cso`에서 재확인 필요(FEATURES.md Sources, Gap으로 명시됨).

### Phase 12: 관리자 정의 커스텀 필드 UI + 관리 화면 마감 (이번 마일스톤 범위, 늦은 순서)
**Rationale:** 스키마(JSONB 컬럼 + `field_definitions`)는 Phase 3에서 이미 결정했지만, 관리자가 실제로 필드를 추가하는 UI 구현은 "이 칸이 없어서 못 쓴다"는 요청이 실제로 나온 뒤로 늦춘다(FEATURES.md — 선제적으로 만들지 않는다). 동시에 권한표·정보노출표·코드표·결재선 설정 화면을 프리셋 기반 UX로 통합 마감한다.
**Delivers:** 필드 정의 관리 화면(텍스트/숫자/날짜/선택 4종), 필드당 서버단 타입 검증, 권한 화면의 "역할별 프리셋 + 예외만 조정" 구조.
**Avoids:** Pitfall 12(관리 화면이 복잡해 오너가 코드로 회귀), Pitfall 13(커스텀 필드 과설계).

### Phase Ordering Rationale

- **의존성이 순서를 결정한다:** 손익(Phase 7)은 견적·지출결의·증빙 세 소스가 먼저 안정화돼야 하고, 팀 손익(Phase 10)은 프로젝트 손익이 검증돼야 한다 — FEATURES.md dependency chain과 ARCHITECTURE.md build order가 독립적으로 도출한 같은 순서.
- **인증·설정이 항상 2번:** 권한 체크·설정 배선을 나중에 끼워 넣으면 260807/260907처럼 "정한 것을 지키는 장치가 없어"지는 실패가 재현된다. 처음부터 강제해야 이후 모든 페이즈가 그 위에 안전하게 얹힌다.
- **v1은 신규 가치가 아니라 인트라넷 패리티:** Phase 1~5가 끝나야 인트라넷을 끌 수 있다. 손익·목표·확인증 같은 이번 프로젝트의 "진짜 이유"는 그 위에 얹지만, 순서상 뒤에 둬 v1 출시가 밀리지 않게 한다(PITFALLS.md Pitfall 1의 직접적 해법).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1(배포):** 호스팅 데이터 거주지(Neon/Singapore vs Cloud SQL/Seoul) 확정 — 사용자 확인 필요, `/gsd-plan-phase --research-phase`보다는 사용자 의사결정 게이트.
- **Phase 7(프로젝트 손익):** 정산(마감) 시점의 정의, 매출 기준·연도 귀속 확정을 위한 기획본부·경영관리 합의 절차 — PROJECT.md·ARCHITECTURE.md 모두 "설정으로 둔다"까지만 정하고 절차는 비어 있음.
- **Phase 11(기타소득 확인증):** 개인정보보호법 적용 범위, 보존기간, `/cso` 감사 결과에 따른 스키마 조정.

Phases with standard patterns (skip research-phase):
- **Phase 2(인증·인가·설정 레지스트리):** ARCHITECTURE.md가 코드 수준 예시까지 제공한 표준 패턴.
- **Phase 4(데이터 이전):** PITFALLS.md가 체크리스트 수준으로 이미 함정을 정리함(인코딩·타임존·고아행).
- **Phase 5(결재 상태기계):** 표 3개 + 순수 함수 패턴, ARCHITECTURE.md에 스키마·코드 예시 존재.
- **Phase 12(커스텀 필드 스키마):** JSONB + field_definitions는 이미 비교·근거까지 확정됨(ARCHITECTURE.md 패턴 5).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | 호스팅 가격은 공식 페이지·2026년 최신 자료 교차 확인. 일부 npm 패키지 버전은 조사 시점 스냅샷이라 설치 시 재확인 필요(STACK.md 자체가 명시) |
| Features | MEDIUM-HIGH | 인트라넷·실패 사례 감사는 1차 자료(HIGH). 경쟁 제품(경리나라·플렉스 등) 비교는 WebSearch 기반 단일/소수 벤더 자료(MEDIUM) |
| Architecture | HIGH | 표준 패턴 조합이고, 세 번 실패한 전임 프로젝트의 반례가 구체적 수치(설정 65개 중 6개만 읽힘 등)로 명확함 |
| Pitfalls | MEDIUM-HIGH | 도메인 실패 패턴은 저장소 감사 기반 HIGH. GCP 비용·개인정보법·인코딩 항목은 공식 문서·법령 기반이나 이 프로젝트 실제 덤프로 재검증 필요(MEDIUM) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **호스팅 데이터 거주지:** Neon은 Seoul 리전이 없다(가장 가까운 곳 Singapore). 회사 데이터가 국내에 있어야 한다는 요건이 있는지 PROJECT.md는 명시하지 않았다 — Phase 1 착수 전 사용자 확인 필요.
- **손익 정산(마감) 시점의 정의:** "진행 중=라이브 계산, 정산 시=스냅샷"이라는 원칙은 이 문서가 세웠지만, "정산"이 프로젝트의 어느 상태 전이를 뜻하는지는 아직 데이터 모델에 없다 — Phase 7 계획 단계에서 확정.
- **기타소득 확인증의 법적 세부사항:** 주민등록번호 수집·암호화·보존기간의 구체적 근거는 `/cso` 보안 감사에서 재확인 필요(FEATURES.md가 이미 Gap으로 명시).
- **exceljs 유지보수 상태:** 3년째 릴리스 없음 — 버전 고정 후 6개월마다 재점검(STACK.md).
- **TypeScript 7.0(tsgo) 전환 시점:** 지금은 6.0.x로 시작, 6개월 뒤 생태계(drizzle-kit, ESLint 플러그인) 호환 상황 재확인(STACK.md).
- **결재/손익 순서 충돌 여지:** ARCHITECTURE.md는 관리 화면 마감을 마지막(15번)에 두지만, PITFALLS.md는 관리 화면 복잡도(Pitfall 12)를 admin-config라는 이름의 별도 단계로 초반부터 반복 점검하라고 한다 — 이 문서는 "골격은 Phase 2, 마감은 Phase 12"로 절충했으나 로드맵 작성 시 두 단계 사이 관리 화면 완성도를 어떻게 점진적으로 검증할지는 페이즈 계획에서 구체화 필요.

## Sources

### Primary (HIGH confidence)
- `/home/user/ERP_PLANT8_260917/.planning/PROJECT.md` — 프로젝트 1차 소스, 요구사항·제약·정보 노출 원칙·기획본부 기준(2026-09-17 업데이트본)
- `docs/research/repo-audit-260917.md` — 인트라넷 실사용 데이터(행 수·기능·결함) 및 3회 재구현 실패 원인, 직접 리포 감사
- `docs/research/erp260907-money-flow.md` — 손익/구매요청/결재 관련 용어 및 뒤집힌 결정 이력(참고용, 코드 재사용 아님)
- Google Cloud 공식 문서(Cloud Run/Cloud SQL pricing, cost-optimized services, connection 관리) — STACK.md, ARCHITECTURE.md, PITFALLS.md
- Neon Pricing, Row Level Security/JSONB vs EAV 비교 자료 — STACK.md, ARCHITECTURE.md

### Secondary (MEDIUM confidence)
- npm registry(next, drizzle-orm, better-auth, exceljs 등 패키지 페이지), Node.js release schedule — STACK.md
- 경리나라/플렉스/ERPNext·Odoo 기능 비교 자료(단일/소수 벤더 자료) — FEATURES.md
- 개인정보보호법 제24조의2(국가법령정보센터), CaseNote 조문 해설 — PITFALLS.md, 실무 적용은 `/cso`에서 재확인 필요
- EUC-KR/UTF-8 인코딩 이관 일반 사례(CodeIgniter 포럼 등) — PITFALLS.md, 이 프로젝트 실제 덤프로 재검증 필요

### Tertiary (LOW confidence)
- 국세청 기타소득/원천징수 안내 페이지 — 특정 질의(주민등록번호 수집의 명확한 법적 근거)에 대한 답을 찾지 못함, FEATURES.md가 Gap으로 명시

---
*Research completed: 2026-09-17*
*Ready for roadmap: yes*
