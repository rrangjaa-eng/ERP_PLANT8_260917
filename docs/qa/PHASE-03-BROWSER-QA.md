# Phase 3 브라우저 QA 체크리스트 — 권한·설정·마스터

`/gsd-plan-phase 3`이 만든 계획 7건에서 뽑은, **브라우저에서만 판정 가능한** 항목 모음.
`/qa`(실제 브라우저 QA)와 `/design-review`(SYSTEM.md 일관성)의 입력으로 쓴다.

> 이 페이즈는 웨이브 7개가 완전히 직렬이다. 화면도 웨이브마다 하나씩 늘어나므로
> **웨이브 종료 시점마다 해당 절만** 돌리고, 페이즈 끝에서 전체를 한 번 더 돈다
> (`workflow.human_verify_mode=end-of-phase`).

## 0. 어디에 접속해서 보는가

### 이 GSD 세션에서는 볼 수 없다

계획을 만든 세션은 임시 원격 컨테이너에서 돌고, 거기서 `pnpm dev`를 띄워도 컨테이너
내부 localhost에만 붙어 외부로 열린 포트가 없다. 세션이 끝나면 컨테이너도 회수된다.
**브라우저 확인은 아래 두 경로 중 하나로 한다.**

### 경로 A — 내 PC (기본)

```bash
git fetch origin claude/gsd-plan-phase-3-rzuho1
git checkout claude/gsd-plan-phase-3-rzuho1
pnpm install

pnpm db:dev        # Docker 있으면 컨테이너, 없으면 apt Postgres → 127.0.0.1:5432 (erp · erp_test)
pnpm db:migrate    # 03-01~03-07이 추가하는 마이그레이션 0003~0007
pnpm db:seed       # 계급 5종·메뉴·정보 항목 레지스트리 시드 — 03-01이 만든다(웨이브 1 이후에만 존재)
pnpm dev           # http://localhost:3000
```

`.env.local`은 `dev-db.sh`가 자동 생성하므로 `.env.example`를 직접 복사할 필요는 없다
(`docs/OPERATIONS.md` §3). 로컬은 Cloud SQL Auth Proxy가 아니다 — Cloud SQL은 프라이빗
IP뿐이라 PC에서 직접 붙을 수 없다(D-01).

**로그인 계정 만들기**

```bash
pnpm account:create --email you@example.com --name 홍길동 --admin
pnpm account:reset  --email you@example.com    # 임시 비밀번호 재발급
pnpm account:unlock --email you@example.com    # 5회 실패 잠금 해제
```

> ⚠️ **웨이브 2부터 `--admin`이 없다.** 03-02가 관리자 불리언을 제거하고 `--role`로 바꾼다
> (D-36). 웨이브 2 이후에는 `--role` 형태를 쓰고, 계급 5종 계정은 `--role`로 만든다.
> 웨이브 5 이후에는 `/admin/people` 화면에서 직접 발급할 수 있다.

### 경로 B — staging (Cloud Run, 서울)

주소를 얻는 방법이 넷이고, **위에서부터 쉽다.** `gcloud` 설치 없이 되는 것이 위 둘이다.

**① GitHub Actions 배포 요약 페이지 (브라우저만, 설치 0)** ← 권장

저장소 → **Actions** → 왼쪽 **deploy** 워크플로 → 최근 성공한 run → 요약(Summary) 페이지.
맨 위에 `deploy.yml`이 찍어 둔 줄이 있다:

```
staging: <실제 주소> (sha <커밋 SHA>)
```

이 줄은 `deploy.sh`가 마지막에 출력하는 `SERVICE_URL=`을 그대로 옮긴 것이라 **정본**이다
(`deploy.yml`이 `$GITHUB_STEP_SUMMARY`에 기록). 지금 서빙 중인 SHA까지 같이 보이므로
"내가 보는 화면이 어느 커밋인지"도 여기서 확인된다.

**② Cloud Run 콘솔 (브라우저만)**

`console.cloud.google.com/run` → 리전 서울(asia-northeast3) → 서비스 `plant8-staging`
→ 상세 화면 상단의 URL. 콘솔이 보여주는 값이 곧 `status.url`이다.

**③ GCP Cloud Shell (브라우저, gcloud 이미 설치·인증됨)**

콘솔 우상단 터미널 아이콘으로 Cloud Shell을 연다. 최초 부트스트랩
(`scripts/bootstrap-gcp.sh`, `docs/OPERATIONS.md` §8)을 돌린 곳이라 이미 권한이 있다.

```bash
gcloud run services describe plant8-staging \
  --region asia-northeast3 --format='value(status.url)'
```

**④ 내 PC의 gcloud**

`gcloud` 설치 + `gcloud auth login` 후 ③과 같은 명령. 이 프로젝트는 WIF를 쓰고 키 파일이
없으므로(`docs/OPERATIONS.md` §8) 내 구글 계정에 권한이 있어야 한다. 셋업 비용이 가장 크다.

**이미 기록된 값**: Phase 1 스테이징 실측 주소가
`.planning/phases/01-deploy-skeleton-login/01-07-DEPLOY-LOG.md`에 있다. 서비스를 지우고
다시 만들지 않았다면 주소는 그대로다. D-03("실제 식별자를 적지 않는다")에 따라 이 문서에는
옮겨 적지 않는다.

> ⚠️ **다른 주소로 열면 안 된다.** 프로젝트 번호로 만든 "결정적" 형식
> (`https://plant8-<env>-<프로젝트 번호>.asia-northeast3.run.app`)은 이 프로젝트의 실제
> 주소가 아니라 404다. 태그 리비전 URL로 열면 화면은 떠도 **로그인 POST가 better-auth의
> Origin 검사에 걸려 403**이 난다 — 배포가 `BETTER_AUTH_URL`을 `status.url`로 고정하기
> 때문이다. 북마크는 항상 `status.url`로 (`docs/OPERATIONS.md` §1).

**staging에 Phase 3가 올라가는 시점**: `main` 병합 시 자동 배포된다(`deploy.yml` push
트리거). 즉 이 브랜치를 머지하기 전에는 staging에 Phase 3 화면이 없다. 머지 전에 보려면
경로 A(내 PC)를 쓴다.

운영 환경 계정은 로컬 CLI가 아니라 GitHub Actions `account.yml`(Cloud Run Job
`plant8-{env}-account`)로 만든다. 임시 비밀번호는 워크플로 로그에 한 번 남으므로 받는 즉시
변경한다. 출력이 바로 안 보여도 `reset`을 다시 돌리지 말고 기다린다 — 재실행하면 전 세션이
만료되고 새 임시 비밀번호가 또 발급된다(D-13, `docs/OPERATIONS.md` §7).

### 지금 볼 수 있는 것과 없는 것

이 문서의 화면 11개는 **아직 존재하지 않는다.** 계획만 끝난 상태이고
`/gsd-execute-phase 3` 실행 후에 생긴다. 지금 접속해서 볼 수 있는 것은 Phase 1·2 결과뿐이다
— 로그인·로그아웃, 비밀번호 변경, 앱 셸(상단 바·모바일 셸), 시스템 상태 화면.

웨이브가 완전히 직렬이라 화면은 웨이브마다 늘어난다. **웨이브 종료 시점에 그 웨이브 절만**
돌리고, 페이즈 끝에서 전체를 한 번 더 돈다 (`workflow.human_verify_mode=end-of-phase`).

### 계급 5종 계정

권한표·노출표는 **계급별로 화면이 달라지는 것**이 핵심이므로, 다섯 계정을 만들어 두고
같은 화면을 계급을 바꿔가며 본다.

| 계급 | 이 페이즈에서 기대되는 것 |
|---|---|
| 대표 | 전 메뉴 + 행동 로그 열람 |
| 본부 책임자 | 본부 범위 |
| 팀장 | 팀 범위 |
| 기획 PM | 기본값 = 인트라넷 수준, 새 기능 정보는 **기본 숨김** |
| 시스템 관리자 | 관리 메뉴 + 보관함 복원 |

## 1. 화면 목록 (웨이브별)

| 웨이브 | 화면 | 경로 |
|---|---|---|
| 1 | 코드표 | `/admin/code-tables` |
| 1·2 | 시스템 상태 (Phase 2 화면 수정) | `/admin/system-status` |
| 3 | 권한표 격자 | `/admin/permissions` |
| 3 | 정보 노출표 격자 | `/admin/visibility` |
| 4 | 설정 (자동 생성) | `/admin/settings` |
| 5 | 사람 | `/admin/people` |
| 5 | 조직(본부·팀) | `/admin/people/org` |
| 5 | 계급 | `/admin/people/roles` |
| 5·6 | 법인카드 | `/admin/corp-cards` |
| 6 | 거래처 | `/admin/vendors` |
| 7 | 행동 로그 | `/admin/action-log` |
| 7 | 보관함 | `/admin/archive` |

## 2. 실 데이터가 있어야 판정되는 항목 (최우선)

UI-SPEC이 **계획 단계에서 닫지 못했다고 명시한** 항목. 자동 테스트로 대체되지 않는다.

- [ ] **권한표·노출표 격자 populated** (UI-SPEC `backstop`) — 메뉴가 늘어 열이 수십 개가 됐을 때
      **2단 sticky 머리글 + 가로 스크롤**이 실제로 버티는지. 03-01이 `MENUS`에 이 페이즈 메뉴를
      전부 등록하므로 시드 직후 실제 열 개수로 본다. 머리글이 스크롤에 떨어지거나, 첫 열(계급)이
      가로 스크롤에 묻히면 실패.
- [ ] **설정 항목 설명 문구 long-text** (UI-SPEC `unresolved` 1건) — 03-04가 "라벨 + 한 문장 힌트,
      긴 설명 없음"으로 가정했다. 실제 키 목록을 화면에서 보고 그 가정이 버티는지 판정한다.
      버티지 않으면 `docs/design/DECISIONS.md`에 기록하고 SYSTEM.md를 고친다.

## 3. 화면별 확인 항목

### 코드표 `/admin/code-tables` (웨이브 1·3·5·6·7)
- [ ] 항목 추가·수정·비활성화가 화면에서 된다 (MAST-04)
- [ ] 비활성화한 항목이 다른 화면 선택 목록에서 사라지고, 기존 참조는 깨지지 않는다
- [ ] 증빙 종류에 세금 규칙 필드(없음 / 부가세 가산율 / 원천징수율+면제 기준 / 회사 대납)와
      절사 단위(1원/10원)·절사 방식(절사/반올림/올림)·최소 징수액·적용 기준일 종류가 보인다 (웨이브 6)

### 권한표 `/admin/permissions` · 정보 노출표 `/admin/visibility` (웨이브 3)
- [ ] 체크박스를 바꾸면 **즉시** 메뉴·동작·응답 필드가 바뀐다 (ADMN-01·02)
- [ ] §7-13 「저장 시점과 피드백」 — 열 일괄 토글 후 일부 실패 시 **실패한 셀만 원위치 + 오류 표시,
      성공한 셀은 유지** (PARTIAL)
- [ ] EMPTY 상태가 **나타나지 않는다** — 계급 5종·메뉴 시드가 항상 있으므로 §7-13이 "해당 없음"으로 명시
- [ ] 기획 PM으로 로그인해 새 기능 정보가 **기본 숨김**인지 확인

### 설정 `/admin/settings` (웨이브 4)
- [ ] registry에 등록한 키가 화면에 **자동으로** 나타난다 (ADMN-05)
- [ ] §7-14 상태 태그 「적용 중」/「예정」으로 현재값과 미래 예정값이 함께 보인다 (이력형 키)
- [ ] 적용 시작일을 미래로 준 키가 「예정」으로만 보이고 현재 동작을 바꾸지 않는다
- [ ] JSON 내보내기 → 빈 환경에 가져오기 → **같은 동작** (ADMN-06)
- [ ] EMPTY 없음 (Phase 1 로그인 잠금 키가 이미 있어 키 0개가 성립하지 않는다)
- [ ] PARTIAL을 **그리지 않는다** — "등록됐으나 읽지 않는 키"는 화면 상태가 아니라 테스트 실패

### 사람·조직·계급 `/admin/people`, `/people/org`, `/people/roles` (웨이브 5)
- [ ] 사람 + 계급 + 팀 선택으로 입사자 추가, **같은 화면에서** 계정·초기 비밀번호 발급 (MAST-02)
- [ ] 초기 비밀번호는 발급 직후 한 번만 보이고 **재열람되지 않는다** (금지 항목)
- [ ] 팀이 본부에 속하는 관계가 화면에 드러난다 (팀 ⊂ 본부)
- [ ] 발령일 이력이 append-only로 쌓이고 과거 행이 사라지지 않는다. 1건과 N건이 같은 행 템플릿
- [ ] 계급 추가·이름 변경이 화면에서 된다 (ADMN-08)

### 법인카드 `/admin/corp-cards` (웨이브 5·6)
- [ ] 개인 지급 카드는 소지자(직원), 팀 전용 카드는 소속 팀을 지정한다 (MAST-03)

### 거래처 `/admin/vendors` (웨이브 6)
- [ ] 등록·수정되고, 미사용은 **삭제가 아니라 숨김** (MAST-01)
- [ ] 입력 시 자동완성이 동작하고, **자동완성 결과도 노출표를 따른다** (ADMN-03 우회 경로 없음)
- [ ] 계좌번호가 기본 **뒤 4자리만** 보인다. 고정 자릿수라 overflow 없음
- [ ] 마스킹 해제가 권한이 있는 계급에서만 되고, 해제할 때마다 행동 로그에 남는다
- [ ] 거래처 기본 증빙 종류가 설정돼 있다 (Phase 5·6에서 자동 채움의 근거)

### 행동 로그 `/admin/action-log` (웨이브 7)
- [ ] 대표·경영관리·관리자만 열람 (열람 권한은 노출표로 통제)
- [ ] 사람·기간·행동 종류·문서로 걸러진다 (ADMN-10)
- [ ] 단순 조회·화면 이동은 **남지 않는다** (OPS-05)
- [ ] Excel 내보내기와 마스킹 해제는 설정으로 **끌 수 없다** (스위치가 아예 없거나 비활성)
- [ ] 내보내기 실패는 §7-7 ERROR가 아니라 **§7-6 토스트**로 알린다. 부분 파일을 내려주지 않는다
- [ ] 로그 정리가 **물리 삭제가 아니라 표시**이고, 정리 자체가 로그에 남는다
- [ ] 정리 UI가 "삭제"로 읽히는 문구를 쓰지 않는다 (금지 항목)

### 보관함 `/admin/archive` (웨이브 7)
- [ ] 무엇을 삭제해도 보관함으로 가고, **관리자만** 보고 복원한다 (ADMN-12)
- [ ] 삭제·복원이 행동 로그에 남는다
- [ ] 비었을 때 §7-7 EMPTY + **다음 한 수 없음** (비어 있는 것이 정상 — §7-12 알림함과 같은 논리)

## 4. 전 화면 공통 (§7-7 다섯 상태)

화면마다 새로 정하는 것이 아니라 §7-7을 구현하는 것이다. 위 절의 예외를 뺀 나머지 화면에서:

- [ ] EMPTY — 다음 한 수가 보인다
- [ ] LOADING
- [ ] ERROR — 재시도 경로가 있다
- [ ] PARTIAL
- [ ] POPULATED
- [ ] 긴 한국어 문자열에서 §2-3 `word-break: keep-all` + `overflow-wrap: anywhere`가 먹는다

## 5. 반응형·접근성

- [ ] 모바일 폭에서 셸과 페이지 크롬이 버틴다 (`mobile-shell`·`mobile-page-chrome` E2E의 육안 확인)
- [ ] 격자 화면을 키보드만으로 이동·토글할 수 있다 (`keyboard-nav`)
- [ ] axe 위반 0건 (`a11y` E2E가 자동으로 잡지만, 격자·이력 목록은 육안으로도 본다)
- [ ] 새 색·서체·radius가 없다 — 토큰은 `docs/design/tokens.css`에서만 (stylelint가 잡지만 육안 확인)

## 6. 배포 전 수동 확인 (브라우저 아님)

- [ ] **GCP Secret Manager의 staging·prod 두 환경에 암호화 키가 등록돼 있고 base64 32바이트인지**
      확인한다 (03-06 Task 3 `<human-check>`). `lib/env.ts`가 이 키를 선택 문자열로 두어 값이 없어도
      앱이 뜨므로, 확인하지 않으면 "거래처 계좌번호 저장 시 500"으로 **배포 후에** 처음 드러난다.

## 7. 브라우저로 확인하지 않는 것

자동화가 이미 덮으므로 QA 시간을 쓰지 않는다.

- 누수 스캔 — 액션 레지스트리 × 계급, DTO × 계급, Excel 함수 × 계급이 CI(통합 계층)에서 자동 생성·검사된다 (ADMN-03)
- 판정 함수 단위 동작 — `test/unit/permissions/*.test.ts`
- 마이그레이션 안전성 — `pnpm lint:sql`(squawk) + lock/statement timeout
- 키 회전 v1·v2 혼재 복호화 — 단위 테스트
- 계층 경계(`domain → db` 금지, 행 객체 유출) — eslint `boundaries` + `no-row-type-escape`
