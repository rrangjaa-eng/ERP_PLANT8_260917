# Stack Research

**Domain:** 사내 소규모 ERP (프로젝트·지출·손익 관리) — BTL 광고대행사, 10→30명, 비개발자 1인 + Claude Code 운영
**Researched:** 2026-09-17
**Confidence:** MEDIUM-HIGH (호스팅 가격·리전은 공식 페이지/2026년 최신 기사로 교차 확인. 일부 패키지 버전은 npm 스냅샷 시점 기준이라 설치 시 재확인 필요)

---

## Part A. 호스팅 플랫폼

### 결론 먼저

**1순위 추천: Cloud Run (asia-northeast3, Seoul) + Neon Postgres (Free/Launch, Singapore)**
**2순위(런너업): Cloud Run (asia-northeast3) + Cloud SQL for PostgreSQL Enterprise, db-f1-micro/shared-core 단일 존**

사용자가 정한 우선순위(비용 > 유지보수 쉬움 > 단순함 > 이식성) 순서를 그대로 따르면, Cloud SQL의 "죽지 않는 최소 비용"이 나머지 세 기준을 전부 앞선다. Cloud SQL은 야간·주말에 아무도 안 써도 인스턴스가 계속 떠 있어야 과금이 멈추지 않는다(스케일-투-제로 불가) — 사용자가 이미 "Cloud SQL의 최소 비용 바닥이 우려된다"고 짚은 지점이 실제로 맞다. 반면 Neon은 컴퓨트뿐 아니라 DB 자체가 5분 유휴 후 완전히 멈추고, 2025년 12월부터 월 최소 과금이 없어졌다. Cloud Run은 이미 스케일-투-제로다. 즉 **Cloud Run + Neon 조합은 앱 전체가 진짜 0원에 가깝게 내려간다** — 사용자가 명시한 "밤·주말엔 0에 가깝게" 요구사항을 인프라 두 층 모두에서 만족하는 유일한 조합이다.

Seoul 리전이 없다는 게 Neon의 유일한 실질 약점이다(가장 가까운 곳이 Singapore, ap-southeast-1). 10~30명이 낮 시간에 CRUD 위주로 쓰는 사내 시스템에서 DB 왕복 지연 70~100ms 추가는 체감상 크지 않다(실시간 협업·초저지연이 필요한 서비스가 아님). 이 손해와 맞바꾸는 이득 — 월 비용이 사실상 0원, DB 유지보수(백업·PITR·버전 패치) 완전 위임, 그리고 뒤에서 설명하듯 "회사 GCP로 이식"이 오히려 더 쉬워지는 것 — 이 훨씬 크다고 판단한다.

이식성(우선순위 4번째, 즉 최하위)에서는 Cloud SQL 쪽이 형식적으로는 더 매끈해 보이지만(같은 GCP 프로젝트 안에서 `gcloud alpha projects move` + 결제 계정 연결 스크립트 하나로 끝), Neon 조합도 사실상 더 간단하다: DB가 애초에 GCP 계정에 속하지 않으므로 "이관할 DB가 없다" — Cloud Run 앱만 옮기고 같은 `DATABASE_URL` 환경 변수를 그대로 쓰면 된다. Neon 프로젝트 자체를 회사 소유 계정으로 옮기고 싶다면 Neon 콘솔에서 별도로 소유권을 이전하는 절차가 있으나(스크립트라기보다 콘솔 조작 1회), 이건 선택 사항이지 필수가 아니다. 이 프로젝트가 이미 "DB 접속은 환경 변수"를 원칙으로 세웠으므로(PROJECT.md 제약), 이 구조와 정확히 맞아떨어진다.

돈을 다루는 결재 시스템이므로 백업 신뢰성도 짚어야 한다. 두 조합 모두 관리형 자동 백업/PITR을 제공한다(Cloud SQL은 GCP 네이티브 일 단위 백업 + WAL 기반 PITR로 가장 검증된 방식, Neon은 브랜칭 기반 PITR을 무료 티어에도 일부 제공하되 보존 기간이 짧다). 이 차이가 걱정되면 실행 초기엔 Neon Launch 플랜(사용량 기반, 최소 과금 없음)으로 한 단계 올려 PITR 보존 기간을 늘리는 것으로 충분하며, 그래도 Cloud SQL 최소 사양보다 여전히 싸다.

### 비교표

| 옵션 | 월 예상 비용 (10~30명, 저트래픽) | 스케일-투-제로 | 콜드스타트 | 백업 | Seoul(asia-northeast3) | 개인→회사 GCP 1스크립트 이관 |
|---|---|---|---|---|---|---|
| **Cloud Run + Neon Postgres** (추천) | **$0~3** (Cloud Run 무료 티어 내 $0, Neon Free 0.5GB/100 CU-h 내 $0; 초과 시 Launch $0.106/CU-h + $0.35/GB, 최소 과금 없음) — 약 0~4,000원 | 앱·DB 모두 완전 스케일-투-제로 (Neon 5분 유휴 후 정지) | Cloud Run: 수백ms~1~2초(경량 컨테이너면 짧음). Neon: 정지 상태에서 첫 쿼리 시 300~500ms 재개 | Neon PITR(브랜칭 기반), 무료 티어는 보존 기간 짧음 — 필요 시 Launch로 승급 | Cloud Run 됨(asia-northeast3). **Neon은 Seoul 없음, 최근접 Singapore(ap-southeast-1)** | GCP 부분은 `gcloud alpha projects move` 한 스크립트로 충분. Neon은 DB 자체가 GCP 밖이라 **이관할 게 없음**(환경 변수 그대로 재사용). Neon 소유권만 옮기려면 콘솔에서 별도 1회 이전 |
| **Cloud Run + Cloud SQL(db-f1-micro/shared-core, HA 없음)** (런너업) | **$10~15** 컴퓨트(공유 코어 최저가 약 $7~10) + 스토리지·백업 소액. HA 켜면 **약 2배($20~30)** — 약 14,000~21,000원 | Cloud Run만 스케일-투-제로. **Cloud SQL은 유휴여도 인스턴스가 계속 과금됨(진짜 0원 불가)** | Cloud Run 동일. Cloud SQL은 상시 기동이라 콜드스타트 없음 | GCP 네이티브 자동 일 단위 백업 + PITR, 가장 검증된 방식 | 됨(asia-northeast3, Enterprise Plus는 C4 머신까지 지원) | 같은 GCP 프로젝트 통째로 `gcloud alpha projects move` + `gcloud billing projects link` — 가장 매끈함 |
| Firebase / Firestore | 소규모면 $0~소액이나 구조 문제로 비추천 | 완전 서버리스 | 낮음 | 자동(Firestore 백업 별도 설정) | Firestore 리전 asia-northeast3 지원 | GCP 프로젝트라 이관은 쉬움 |
| Fly.io | Postgres 자체 관리(Machines)면 소액이나 백업·장애조치 직접 처리 필요. Managed Postgres는 **$38부터**(Basic) | 앱 Machines는 정지 가능, Managed Postgres는 상시 | 보통 | 자체 관리 Postgres는 백업 직접 구성 필요 — 비개발자에게 부적합 | Seoul 리전 있음(nrt/icn 계열 확인 필요) | 계정 자체를 옮기는 개념이 약함(조직 초대 방식) |
| Railway | Hobby $5 구독 + 사용량(리소스 사용 시 vCPU $20/월, RAM $10GB/월 식 종량) → DB까지 얹으면 쉽게 $10~20+ | 유휴 시 컨테이너 슬립 가능(플랜별 상이) | 슬립 후 재기동 지연 있음 | 관리형이나 세밀한 PITR 통제는 제한적 | **Seoul 리전 없음**(가까운 곳 Singapore/Tokyo) | 팀/프로젝트 이전은 콘솔 기반, "1스크립트"에 못 미침 |
| Render | Free Postgres는 **30일 후 자동 삭제**(운영 불가) → 유료 Starter 웹 $7 + Basic Postgres 얹으면 약 **$13~20** | 무료 웹서비스는 15분 유휴 후 슬립(콜드스타트 큼), 유료는 상시 | 무료 티어 슬립 후 수십초 지연 | 무료 티어엔 자동 백업 없음. 유료부터 제공 | **Seoul 리전 없음** | 팀 이전은 콘솔 기반 |
| Vercel + 관리형 Postgres(Neon) | Hobby는 무료지만 **ToS상 비상업적 개인 프로젝트 전용** — 실제 회사 업무용이면 Pro **$20/시트/월**부터 | Vercel Functions 자체는 서버리스, DB는 Neon과 동일 | Vercel Functions 콜드스타트 짧음 | Neon과 동일 | Vercel 자체엔 리전 개념 없음(엣지), DB는 Neon과 동일하게 Seoul 없음 | GCP와 무관한 별도 계정 체계 — "회사 GCP로 이식" 요건과 안 맞음 |
| 단일 VPS (예: Hetzner CX22 €4.35 ≈ $4.7, 2vCPU/4GB) | 컴퓨트 자체는 **가장 쌈**($4~5) | 없음(상시 과금) | 없음(상시 기동) | **직접 구성해야 함**(cron+pg_dump 등) — 비개발자에게 가장 위험한 지점 | 대체로 EU/US 위주, Seoul 리전 자체가 없는 사업자가 많음 | 서버 이전은 이미지/백업 복사 작업 — 스크립트화는 가능하나 OS 패치·보안까지 전부 사용자 책임 |
| GCP e2-micro Always Free VPS | 무료지만 **us-west1/us-central1/us-east1에서만** 무료 | 없음 | 없음 | 직접 구성 | **Seoul 대상 아님**(무료 조건 자체가 미국 리전 한정) | GCP 프로젝트라 이관 자체는 쉬우나, 리전이 미국이라 한국 사용자에게 지연 발생 + 서버 운영 부담은 VPS와 동일 |

가격은 각 벤더 공식 가격 페이지·2026년 최신 비교 글 기준(조사 시점 2026-09-17, 위 표의 각 셀이 근거). KRW는 약 1,400원/$ 환산 개략치.

### 왜 나머지를 제외했나

- **Firebase/Firestore**: 비용·스케일링은 매력적이지만, 이 시스템의 핵심 요구(손익 숫자를 근거 줄까지 조인해서 내려가기, 계급×메뉴×동작 권한표, 설정 기반 결재 라우팅, 연도 귀속 집계)는 관계형 조인·트랜잭션·복잡한 집계 쿼리에 강하게 의존한다. Firestore의 문서 모델로 이걸 구현하면 비정규화·클라이언트 집계 코드가 늘어나 "비개발자가 유지할 수 있는 단순함"을 정면으로 해친다. 채택하지 않음.
- **Fly.io**: 무료 티어가 사라졌고(2026년 기준), Postgres를 직접 Machines로 운영하면 백업·장애조치를 사용자가 관리해야 해 "서버 패치 없음" 요구와 어긋난다. Managed Postgres는 안전하지만 $38부터 시작해 Cloud SQL보다도 비싸다.
- **Railway/Render**: 저비용처럼 보이지만 종량제 리소스 요금이 예측하기 어렵고(Railway), 무료 Postgres가 30일 뒤 삭제된다(Render) — 운영 데이터가 있는 ERP엔 치명적. 둘 다 Seoul 리전이 없다.
- **Vercel**: Next.js 배포 자체는 훌륭하지만 Hobby 플랜은 ToS상 비상업 용도로 한정되어 회사 업무 시스템에 그대로 쓰면 약관 위반 소지가 있고, 유료 전환 시 시트당 과금이라 Cloud Run 무료 티어보다 비용 우위가 없다. "회사 GCP로 이식"이라는 요건과도 계정 체계가 아예 다르다.
- **단일 VPS / GCP 무료 VPS**: raw 컴퓨트 자체는 가장 싸지만, OS 패치·Postgres 백업·TLS 인증서 갱신을 전부 사용자가 손으로 해야 한다. 이건 이 프로젝트가 가장 경계하는 실패 패턴("비개발자가 유지 못 하는 복잡함")을 인프라 레이어에서 재현하는 것이라 순위 2번(유지보수 쉬움) 기준에서 탈락한다.

---

## Part B. 애플리케이션 스택

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.x (App Router, Turbopack 기본) | 풀스택 웹 프레임워크 — 화면(App Router)과 서버 로직(Server Actions/Route Handlers)을 한 앱·한 배포물로 통합 | 세 번의 실패한 재구현이 전부 "Hono API 서버 + React SPA"를 별도 두 코드베이스로 유지하다 비대해졌다(285K~349K줄). Next.js는 프런트·백을 한 TypeScript 앱에 합쳐 "동기화해야 할 계약"을 하나 줄인다. Cloud Run에는 `output: 'standalone'` 빌드로 얇은 컨테이너 하나만 올리면 되어 인프라도 단순해진다 |
| React | 19.2 (Next.js 16.2.6 기본 포함) | UI 라이브러리 | Next.js 16 계열의 기본 의존성. 별도 선택 불필요 |
| TypeScript | 6.0.x (strict) | 정적 타입 | 2026-03 출시된 6.0은 "기존 JS 기반 컴파일러의 마지막 릴리스"로 안정적이다. 7.0(Go 네이티브 컴파일러, `tsgo`)은 같은 해 여름에 나온 지 얼마 안 됐고 drizzle-kit·ESLint 플러그인 등 생태계 도구 호환이 아직 다 검증되지 않았을 위험이 있다 — 이 프로젝트처럼 검토자 없이 혼자 유지하는 코드베이스는 최신 메이저보다 검증된 버전을 우선한다. 6개월 뒤 생태계가 7.x로 넘어갔는지 재확인 권장 |
| PostgreSQL | 16.x/17.x (Neon/Cloud SQL 관리형) | 관계형 DB | 손익 드릴다운, 승인 이력, 코드표 조인이 전부 관계형 쿼리라 문서형 DB보다 자연스럽다 |
| Drizzle ORM | drizzle-orm ^0.44 / ^0.45 (1.0은 아직 beta, 안정판 대기) + drizzle-kit | 타입 안전 스키마·쿼리·마이그레이션 | 스키마 자체가 TypeScript 코드라 별도 DSL이 없다(Prisma의 `.prisma` 파일과 대조). 생성되는 SQL이 실제 쿼리와 거의 1:1이라 세율·손익 계산 버그를 추적하기 쉽다. `drizzle-orm/postgres-js`(Cloud SQL 경로)와 `drizzle-orm/neon-http`(Neon 경로)를 환경 변수로 스위칭하면 Part A의 두 호스팅 안 모두 코드 변경 없이 지원된다 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-auth | ^1.7 | 인증(이메일+비밀번호, 소셜 로그인 플러그인) | 기본 요건인 "이메일+비밀번호, 관리자가 계정 발급"을 그대로 지원하고, Google OAuth/OIDC는 플러그인 설정 한 줄 + 환경 변수 토글로 추가된다 — "회사 GCP에서 Google 로그인 추가, 전환은 환경 변수" 요건과 정확히 맞다. Drizzle 어댑터 공식 지원 |
| zod | ^4.x (설치 시 `npm view zod version`으로 재확인) | 런타임 스키마 검증 | 설정 JSON(승인 단계, 세율, 알림 규칙), 관리자 정의 커스텀 필드의 JSON 스키마, Server Action 입력 검증에 전부 사용. `drizzle-zod`로 DB 스키마에서 zod 스키마를 자동 생성해 "타입과 검증 로직이 따로 논다"는 이중 유지보수를 없앤다 |
| @google-cloud/storage | ^8.1 | 증빙 첨부파일·확인증 서명 파일 저장(GCS) | 서명 URL로 외부 확인증 제출 링크(`/g/:token` 유형)를 만들 때 사용. 버킷은 asia-northeast3(Seoul)에 둬서 DB가 Singapore(Neon)에 있어도 파일 접근 지연은 최소화 |
| Brevo (API, `@getbrevo/brevo` 또는 REST) | 최신 | 알림 이메일 발송 | 무료 티어가 **일 300통, 카드 없이 영구 무료**라 Resend(월 3,000통/일 100통)보다 알림형 트래픽(결재 대기·마감 임박 등 다발성 알림)에 여유가 크다. 신용카드 없이 시작 가능해 개인 계정→회사 계정 이전 시 결제 정보 승계 문제도 없음 |
| Resend | 최신 | (대안) 알림 이메일 | 개발자 경험(React Email 템플릿)이 더 좋지만 무료 티어가 하루 100통으로 더 빡빡함. 발송량이 적게 유지될 확신이 있으면 대안으로 고려 |
| @react-pdf/renderer | 최신 3.x/4.x | 정산서·확인증·견적서 PDF 생성 | 순수 JS라 Puppeteer처럼 Chromium을 컨테이너에 번들할 필요가 없다 — Cloud Run 이미지 크기·콜드스타트에 유리하다(스케일-투-제로 아키텍처와 궁합이 좋음). 표 형태 재무 문서에 적합(flexbox 레이아웃) |
| pdf-lib | 최신 | 기존 PDF에 서명·도장 이미지 오버레이 | 기타소득 확인증처럼 정해진 위치에 서명 이미지를 얹어야 할 때만 보조로 사용(react-pdf가 절대 위치 지정에 약함) |
| exceljs | 4.4.0 (⚠ 3년째 릴리스 없음, 유지보수 정체) | Excel 내보내기(견적/손익/지출 목록) | 주간 다운로드 190만+로 사실상 업계 표준이고 서식·병합 셀·수식까지 지원해 한국 업무 관행(엑셀 산출물)에 맞다. SheetJS(xlsx)의 무료판은 미해결 고위험 취약점이 있고 유료 모델로 전환돼 "구독·라이선스 도구 금지" 제약과 충돌한다 — 대안으로 부적합. exceljs는 버전을 고정하고 6개월마다 유지보수 상태를 재점검할 것 |
| Vitest | ^4.1 | 단위/통합 테스트 | ESM 네이티브, Next.js/Vite 생태계와 궁합이 좋고 실행 속도가 빨라 TDD 루프(실패 테스트→최소 구현)에 적합 |
| Playwright | ^1.63 (`@playwright/test`) | E2E 테스트 | 결재선(팀장→본부→경영관리→대표) 같은 다단계 흐름을 실제 브라우저로 검증. Next.js 공식 권장 E2E 도구 |
| shadcn/ui + Radix + Tailwind | 최신 | UI 컴포넌트 | 컴포넌트 소스 코드를 그대로 프로젝트에 복사해오는 방식이라 Claude Code가 블랙박스 npm 패키지가 아니라 실제 코드를 읽고 고칠 수 있다. `docs/design/tokens.css` 토큰 체계와 결합하기 쉬움(CLAUDE.md의 "새 색·서체·radius 생성 금지" 규칙과 자연스럽게 맞음) |
| TanStack Table | 최신 v8 | 권한표(계급×메뉴×동작), 정보 노출표, 코드표 관리 그리드 | 체크박스 그리드·정렬·필터가 필요한 관리자 화면(권한·설정) 전부에 재사용 가능한 한 컴포넌트로 통일 |
| react-hook-form + @hookform/resolvers(zod) | 최신 | 폼 상태 관리 | zod 스키마 하나로 서버 검증과 클라이언트 폼 검증을 공유 |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js 24 (Active LTS) | 런타임 | 2025-10-28부터 Active LTS, EOL 2028-04-30. 22는 이제 Maintenance LTS(EOL 2027-04-30)라 신규 프로젝트는 24를 기준으로 시작해 지원 기간을 최대한 확보한다. Cloud Run 컨테이너는 `node:24-slim` 베이스 이미지 사용 |
| ESLint + typescript-eslint | 린트 | `any` 금지 규칙(`@typescript-eslint/no-explicit-any`)을 CLAUDE.md 규칙 그대로 강제 설정에 반영 |
| Docker (멀티스테이지) | Cloud Run 배포 이미지 | `next build`의 standalone 출력물만 최종 이미지에 복사해 이미지 크기 최소화 → 콜드스타트 단축 |

## Installation

```bash
# Core
npm install next@16.2 react@19.2 react-dom@19.2 drizzle-orm drizzle-kit typescript@6

# DB 드라이버 (환경 변수로 전환)
npm install postgres          # Cloud SQL 등 표준 Postgres 경로 (drizzle-orm/postgres-js)
npm install @neondatabase/serverless  # Neon 경로 (drizzle-orm/neon-http)

# 인증 · 검증 · 스토리지 · 이메일 · 문서
npm install better-auth zod drizzle-zod @google-cloud/storage
npm install @react-pdf/renderer pdf-lib exceljs

# UI
npm install @radix-ui/react-* tailwindcss @tanstack/react-table react-hook-form @hookform/resolvers

# Dev dependencies
npm install -D vitest @playwright/test eslint typescript-eslint
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Next.js (풀스택, 단일 앱) | Hono + React SPA(별도 두 앱) | 절대 이 조합으로 돌아가지 않는다 — 세 번의 실패한 재구현이 정확히 이 구조였다. API 계약과 프런트 타입을 손으로 맞추는 작업 자체가 비대화의 원인이었다 |
| Next.js | Remix (현재 React Router 7 "framework mode"로 흡수됨), SvelteKit, Nuxt | 팀·생태계 자료가 Next.js보다 훨씬 적어 Claude Code가 참고할 맥락도 적다. 이 프로젝트처럼 검토자 없이 AI에 크게 의존하는 구조에선 생태계 크기 자체가 유지보수 리스크를 낮추는 요인이다 |
| Drizzle ORM | Prisma | 스키마가 별도 DSL(`schema.prisma`)이라 실제 실행되는 SQL과 한 단계 거리가 생긴다. 팀 규모가 커지고 코드 생성 파이프라인을 갖출 여력이 있다면 Prisma의 생산성이 나을 수 있음 |
| Drizzle ORM | Kysely | 타입 안전성은 Drizzle과 동급 이상이지만 마이그레이션 도구가 기본 내장이 아니라 별도 조립이 필요하다 — 혼자 유지하는 프로젝트엔 결정할 것이 하나 더 느는 셈이라 제외 |
| better-auth | NextAuth.js(Auth.js) | Next.js 네이티브 통합은 좋지만, 유지팀이 공식적으로 Credentials(이메일+비밀번호) 프로바이더를 "프로덕션 비밀번호 인증용으로 설계되지 않았다"고 명시해왔다 — 직접 해싱·세션 로직을 더 많이 짜야 한다. Google 로그인만 붙일 계획이 명확하면 Auth.js도 무방 |
| Brevo | Resend | 발송량이 적고(하루 100통 미만) 개발자 경험(React Email)을 더 중시하면 Resend가 나음 |
| Cloud Run + Neon | Cloud Run + Cloud SQL | 모든 인프라를 한 GCP 계정/리전 안에 두고 싶거나, Seoul 리전 지연을 조금도 허용하지 않으려면 런너업 조합 선택 |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Hono + 별도 React SPA(Vite) 이중 코드베이스 | 260807·260907·plant8-erp-rebuild 세 번 모두 이 구조에서 API 계약·타입 동기화 비용이 누적되어 63만 줄까지 불어났다 | Next.js 단일 앱(App Router + Server Actions) |
| Firestore/Firebase | 손익 드릴다운·권한표·결재 라우팅에 필요한 관계형 조인·트랜잭션을 문서 모델로 흉내내면 코드가 더 복잡해진다 | Postgres(Neon 또는 Cloud SQL) |
| SheetJS(xlsx) 무료판 | 미해결 고위험 취약점 2건 + 유료 모델 전환 — "구독·라이선스 도구 금지" 제약과 충돌 | exceljs (버전 고정 + 주기적 점검) |
| Puppeteer로 PDF 생성 | 컨테이너에 Chromium을 번들해야 해 이미지가 커지고 콜드스타트가 늘어난다 — Cloud Run 스케일-투-제로 전략과 상충 | @react-pdf/renderer (+ pdf-lib 보조) |
| Lucia(라이브러리로서) | 메인테이너가 라이브러리 배포를 접고 "직접 구현하는 법을 문서로만 안내"하는 방향으로 전환했다 — 신규 프로젝트가 의존하기엔 미래가 불확실 | better-auth |
| Vercel Hobby 플랜에 회사 업무 시스템 배포 | ToS상 비상업적 개인 프로젝트 전용 조항 — 회사 ERP는 상업적 사용에 해당 | Cloud Run(무료 티어가 상업적 사용 제한 없음) |
| Gmail SMTP를 운영 알림 채널로 사용 | 개인 계정에 종속되어 "회사 GCP로 이관" 방향과 충돌하고, 소비자 Gmail의 발송 한도·스팸 처리 정책이 예고 없이 바뀔 수 있어 결재·마감 알림처럼 반드시 도착해야 하는 메일엔 부적합 | Brevo(또는 Resend) — 초기 개발·테스트 단계의 임시 발송에만 Gmail SMTP 허용 |
| TypeScript 7.0(tsgo, Go 네이티브 컴파일러)을 지금 바로 채택 | 출시된 지 몇 달 안 됐고 drizzle-kit·ESLint 플러그인 등 생태계 도구의 완전한 호환이 아직 안정화 중일 위험 | TypeScript 6.0.x, 6개월 뒤 생태계 상황 재확인 후 승급 |

## Stack Patterns by Variant

**호스팅으로 Cloud Run + Neon을 선택한 경우:**
- `drizzle-orm/neon-http` 드라이버 사용, `DATABASE_URL`은 Neon 연결 문자열
- GCS 버킷은 asia-northeast3에 둬서 DB 지연(Singapore)과 무관하게 파일 접근은 Seoul 지연 유지
- 스케일-투-제로 특성상 "첫 요청 300~500ms 지연"을 사용자에게 로딩 상태로 자연스럽게 보여주는 UI 처리 필요(스켈레톤 등)

**호스팅으로 Cloud Run + Cloud SQL을 선택한 경우:**
- `drizzle-orm/postgres-js` 드라이버 + Cloud SQL Auth Proxy(Cloud Run은 Unix 소켓 연결 방식 지원) 사용
- HA(고가용성)는 기본 끔 — 결재 시스템 특성상 몇 분의 다운타임은 감내 가능하다고 판단되면 비용을 2배로 늘리지 않는다. 실제 장애 빈도를 보고 나중에 켤지 결정

**두 경우 공통:**
- 세율(부가세 10%, 기타소득 원천징수 8.8%)은 코드 상수가 아니라 `settings`/`formulas` 테이블 값으로 저장 — PROJECT.md의 "세율·수식을 설정 화면에서 변경" 요건 직접 대응
- 모든 타임스탬프는 `timestamptz`(UTC)로 저장하고, 화면 표시 시점에만 Asia/Seoul로 변환. 네이티브 로컬 시각을 DB에 저장하지 않는다

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.2 | react@19.2, typescript@6 | Next.js 16.2.6부터 React 19.2·Turbopack 기본, `proxy.ts`로 미들웨어 파일명이 바뀌었으므로 이전 튜토리얼의 `middleware.ts` 명칭에 의존하지 말 것 |
| drizzle-orm | drizzle-kit(동일 마이너 버전 유지 권장) | 0.44/0.45 계열로 고정하고 1.0 stable 출시 후 마이그레이션 가이드를 보고 이전 |
| drizzle-orm/neon-http | @neondatabase/serverless | Neon 서버리스 드라이버는 HTTP 기반이라 커넥션 풀링을 신경 쓸 필요가 없음(전통적 pg pool과 다른 모델) |
| @react-pdf/renderer | Node 20+ | Cloud Run node:24-slim 이미지에서 문제없이 동작 |

## Sources

- Google Cloud — [Cloud SQL pricing](https://cloud.google.com/sql/pricing), [Cloud Run pricing](https://cloud.google.com/run/pricing), Bytebase Cloud SQL pricing breakdown, Security Boulevard "Google Cloud SQL Pricing 2026" — 확인일 2026-09-17
- Neon — [Pricing](https://neon.com/pricing), Neon 리전 목록(Koyeb 비교 글), Neon 2025-12 최소 과금 폐지 공지 반영 — 확인일 2026-09-17
- Supabase — [Pricing & Fees](https://supabase.com/pricing), free tier 1주 비활성 후 일시정지 정책 — 확인일 2026-09-17
- Fly.io — [Resource Pricing](https://fly.io/docs/about/pricing/), [Managed Postgres](https://fly.io/docs/mpg/) — 확인일 2026-09-17
- Railway — [Pricing Plans](https://docs.railway.com/pricing/plans) — 확인일 2026-09-17
- Render — Kuberns "Render Pricing Guide 2026" — 확인일 2026-09-17
- Vercel — [Hobby Plan](https://vercel.com/docs/plans/hobby), [Pricing](https://vercel.com/pricing) — 확인일 2026-09-17
- Hetzner — [Cloud pricing](https://www.hetzner.com/cloud/regular-performance/) — 확인일 2026-09-17
- npm registry — next, drizzle-orm, better-auth, exceljs, vitest, playwright, typescript, @google-cloud/storage 각 패키지 페이지 — 확인일 2026-09-17
- Node.js — [Release schedule](https://github.com/nodejs/release) — 확인일 2026-09-17
- 프로젝트 내부: `.planning/PROJECT.md`, `docs/research/repo-audit-260917.md`(세 번의 실패한 재구현이 왜 비대해졌는지의 근거) — 신뢰도 HIGH(1차 자료, 직접 리포 감사)

---
*Stack research for: PLANT8 ERP (사내 프로젝트·지출·손익 관리 시스템)*
*Researched: 2026-09-17*
