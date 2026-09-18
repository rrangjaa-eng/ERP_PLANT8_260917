# Phase 1: 배포 스켈레톤·로그인 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 1-배포 스켈레톤·로그인
**Areas discussed:** 개발·배포 동선, 세션·비밀번호 정책, 계정 발급·첫 관리자, URL·경보 수신

---

## 개발·배포 동선

| Option | Description | Selected |
|--------|-------------|----------|
| 클라우드 세션 위주 | claude.ai/code 기본, Postgres는 세션 안 apt | |
| 내 PC 위주 | 로컬 Claude Code + Docker Compose | |
| 둘 다 동등 | 환경에 따라 Postgres 자동 선택 | ✓ |

**User's choice:** 둘 다 동등

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions 자동 | main 병합 → CI → deploy.sh, WIF 인증 | ✓ |
| 내 PC에서 수동 | PC gcloud로 직접 실행 | |
| GitHub Actions 수동 버튼 | workflow_dispatch만 | |

**User's choice:** GitHub Actions 자동
**Notes:** WIF 최초 부트스트랩은 사람이 1회 실행해야 하는 예외를 CONTEXT.md D-02에 기록

| Option | Description | Selected |
|--------|-------------|----------|
| 로컬 부분 먼저, 배포는 마지막 플랜 | GCP 확보 전 로컬 플랜 실행, 배포 플랜은 뒤로 | ✓ |
| 계획만, 실행 보류 | GCP 확보까지 코드 작업 없음 | |

**User's choice:** 로컬 부분 먼저, 배포는 마지막 플랜

| Option | Description | Selected |
|--------|-------------|----------|
| 프로덕션 하나만 | 리비전 0% 스모크가 스테이징 역할 | |
| 프로덕션 + 스테이징 | 2세트 | ✓ |

**User's choice:** 프로덕션 + 스테이징

| Option | Description | Selected |
|--------|-------------|----------|
| 같은 GCP 프로젝트, 서비스·DB 이름 분리 | Cloud Run 2개 + Cloud SQL 2대 | ✓ |
| 별도 GCP 프로젝트 2개 | staging/prod 프로젝트 분리 | |

**User's choice:** 같은 GCP 프로젝트, 이름 분리

| Option | Description | Selected |
|--------|-------------|----------|
| main 병합 → 스테이징 자동, 프로덕션은 GitHub 승인 버튼 | 같은 SHA 이미지 재사용, Environment 승인 | ✓ |
| main 병합 → 순차 자동 | 사람 개입 없음 | |
| 깃 태그(v*)로 프로덕션 | 태그 푸시 시 배포 | |

**User's choice:** 스테이징 자동, 프로덕션 승인 버튼

| Option | Description | Selected |
|--------|-------------|----------|
| 둘 다 최소 사양, 합 월 $30 안팎 | db-f1-micro급 × 2 | ✓ |
| 프로덕션은 한 단계 위 | prod db-g1-small | |
| 스테이징 DB는 쓸 때만 켜기 | 평소 중지 | |

**User's choice:** 둘 다 최소 사양, 합 월 $30 안팎

| Option | Description | Selected |
|--------|-------------|----------|
| 스크립트 하나가 환경 감지 | Docker면 컨테이너, 없으면 apt Postgres | ✓ |
| 둘 다 네이티브 Postgres | Docker 없음 | |
| 테스트는 CI에서만 | 로컬은 단위만 | |

**User's choice:** 스크립트 하나가 환경 감지

---

## 세션·비밀번호 정책

| Option | Description | Selected |
|--------|-------------|----------|
| 30일, 쓸 때마다 연장 | sliding 30일 | ✓ |
| 7일, 쓸 때마다 연장 | sliding 7일 | |
| 매일 재로그인 | 당일 만료 | |

**User's choice:** 30일, 쓸 때마다 연장

| Option | Description | Selected |
|--------|-------------|----------|
| 즉시 변경 강제 | 초기 비밀번호로는 변경 화면만 | |
| 권장만 하고 강제 안 함 | 내 계정 화면 배너 | ✓ |

**User's choice:** 권장만 하고 강제 안 함

| Option | Description | Selected |
|--------|-------------|----------|
| 8자 이상, 조합 강제 없음 | 유출 목록만 차단 | ✓ |
| 10자 이상 + 숫자·문자 조합 | 일반 사내 정책 | |
| 길이·조합을 설정 키로 | 설정에서 변경 | |

**User's choice:** 8자 이상, 조합 강제 없음

| Option | Description | Selected |
|--------|-------------|----------|
| 동시 허용, 로그아웃은 현재 기기만 | 비밀번호 변경·재발급 시 전 세션 만료 | ✓ |
| 동시 허용 + 모든 기기 로그아웃 버튼 | 내 계정에 버튼 추가 | |
| 기기 하나만 | 새 로그인이 이전 세션 만료 | |

**User's choice:** 동시 허용, 로그아웃은 현재 기기만

---

## 계정 발급·첫 관리자

| Option | Description | Selected |
|--------|-------------|----------|
| migrate Job 다음 시드 단계가 환경 변수로 생성 | ADMIN_EMAIL로 자동 생성, 멱등 | |
| 별도 CLI를 내가 한 번 실행 | 수동 1회 | ✓ |

**User's choice:** 별도 CLI를 내가 한 번 실행
**Notes:** 직원 발급 CLI와 같은 명령에 `--admin` 플래그로 통합(CONTEXT.md D-11)

| Option | Description | Selected |
|--------|-------------|----------|
| CLI 하나: 이메일·이름 받고 임시 비밀번호 출력 | `--reset` 재발급, 운영은 Cloud Run Job | ✓ |
| 시드 파일(CSV) 한 번에 | 전원 일괄 | |
| 둘 다 | CLI + CSV | |

**User's choice:** CLI 하나

| Option | Description | Selected |
|--------|-------------|----------|
| 관리자 1 + 테스트 직원 1만 | 전원은 Phase 3 | ✓ |
| 전 직원 10명 미리 발급 | 로그인만 되는 상태로 공개 | |

**User's choice:** 관리자 1 + 테스트 직원 1만

| Option | Description | Selected |
|--------|-------------|----------|
| 관리자가 직접 전달, 시스템은 관여 안 함 | 유효 기한 없음 | ✓ |
| 임시 비밀번호 유효 기한 72시간 | 기한 지나면 재발급 | |

**User's choice:** 관리자가 직접 전달

---

## URL·경보 수신

| Option | Description | Selected |
|--------|-------------|----------|
| Cloud Run 기본 URL로 시작, 도메인은 나중에 | deploy.sh 인자 자리만 | ✓ |
| 회사 도메인을 Phase 1부터 | DNS 권한·도메인 매핑 필요 | |

**User's choice:** Cloud Run 기본 URL로 시작

| Option | Description | Selected |
|--------|-------------|----------|
| 내 이메일 하나, 환경 변수로 | ALERT_EMAIL, 배포 실패는 GitHub 알림 | ✓ |
| 프로덕션만 경보 | 스테이징 경보 없음 | |
| 이메일 여러 명 | 나 + 경영관리 | |

**User's choice:** 내 이메일 하나, 환경 변수로

| Option | Description | Selected |
|--------|-------------|----------|
| 관리자 계급만, 직원은 404 | Phase 1 계급은 관리자/직원 둘 | ✓ |
| 로그인한 누구나 | Phase 3 전까지 무방 | |

**User's choice:** 관리자 계급만, 직원은 404

| Option | Description | Selected |
|--------|-------------|----------|
| GCP API를 화면 로드 시 직접 조회 | Cloud SQL Admin API + pg_stat_activity | ✓ |
| 앱 표에 기록된 값만 | 백업은 "확인 불가" | |

**User's choice:** GCP API를 화면 로드 시 직접 조회

---

## Claude's Discretion

리포 디렉터리 배치, Node·pnpm 버전, Dockerfile, CI 워크플로 분리, WIF 이름·권한과 부트스트랩/deploy.sh 경계, 스모크 테스트 내용, JSON 로그 형식, better-auth 세부 설정, 잠금·실패 문구, 흔한 비밀번호 목록 크기, 임시 비밀번호 표시 구현, 계정 CLI 위치·Job 실행 절차, 상태 화면 배너 한도 값, 배포 버전 표기, 스테이징 초기 데이터.

## Deferred Ideas

회사 도메인 연결(Phase 2~3), 전 직원 발급·비활성화·잠금 해제 화면(Phase 3), 경보 수신자 확장, 모든 기기 로그아웃 버튼, 임시 비밀번호 유효 기한, 스테이징 DB 중지 스케줄, Google 로그인 활성화(v2).
