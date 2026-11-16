---
phase: 08-cutover
plan: 05
status: in-progress
---

# 08-05 첫 운영 승격 — 증거 장부 (초안)

세션은 `gh` REST · git으로 읽고 대조만 한다. 운영 gcloud · 운영 DB 명령은 사용자 몫. 증거 없는 줄은 「미확인」이다.

## Task 1 — 선행 조건 (2026-11-16 읽기)

| 항목 | 확인 방법 | 결과 | 증거 |
|---|---|---|---|
| (가) 보안 스캐너 CI #109 | `gh api …/issues/109 --jq .state` · `git grep -l gitleaks origin/main -- .github/workflows` | 미충족 | 이슈 open · 스캐너 워크플로 없음 (ebc8a2f 기준) |
| (나) 스테이징 = 배포 대상 main | 마지막 성공 push deploy headSha → `git diff --name-only H origin/main` 배포 규칙 거름 | 통과 | deploy run 43789437168 success · H = ebc8a2f = origin/main · 거른 diff 빈 값 |
| (다) verify.yml policies · evidence-bucket 오늘 성공 | `gh api …/workflows/verify.yml/runs` | 미확인 | 마지막 성공 2026-10-02 · 2026-10-06 실패 · 오늘 실행 없음 → 사용자 실행 필요 |
| (라) docs/CUTOVER.md main · 08-01 시험 초록 | `git ls-tree origin/main docs/CUTOVER.md` · #395 PR CI | 통과 | CUTOVER.md blob 있음 · ci.yml은 main push에 돌지 않음 — #395 PR CI 초록으로 대신 봄 |
| (마) bootstrap-gcp 재실행 | 세션이 읽을 수 없음 | 미확인 | 사용자 증거 필요(Cloud Shell 출력 마지막 줄 · 날짜) |

## Task 2 — 진행 결정

| 항목 | 값 |
|---|---|
| 결정 | (빈 칸) |
| 시간 창 | (빈 칸) |
| 출처 | (빈 칸) |

## Task 3 — 승격 · 직후 확인

| 항목 | 결과 | 증거 |
|---|---|---|
| PITR 켬 | 미확인 | |
| 수동 백업 pre-promote-<날짜> SUCCESSFUL | 미확인 | |
| deploy.yml production 실행 | 미확인 | |
| /api/health ok · 새 sha | 미확인 | |
| notify-tick 수동 1회 · 로그 문구 | 미확인 | |
| 파기 Scheduler 있음 · dry-run | 미확인 | |
| 증빙 업로드 스모크(이미지 · PDF · 10MB 초과 거부) | 미확인 | |
| 절사 단위 두 값 1 또는 10 | 미확인 | |
| 공휴일 2026 · 2027 확정 | 미확인 | |
| 문서 번호 순번 시작값 | 미확인 | |
| 경보 정책 3개 | 미확인 | |
| 상태 화면 「마지막 백업」 | 미확인 | |
| 머지 동결 해제 | 미확인 | |
