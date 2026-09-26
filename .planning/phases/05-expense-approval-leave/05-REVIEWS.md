---
phase: 5
round: 1
sources:
  - ceo-review.md (`/plan-ceo-review 5`, abc7244, Opus 독립 교차 검토 — Codex 대체, 한도 해제 뒤 Codex 재확인 필요)
reviewers: [plan-ceo-review, opus-outside-voice]
---

# Phase 5 — Reviews (Round 1)

> `/gsd-plan-phase 5 --reviews` 입력. 정본은 `ceo-review.md`이고 이 파일은 그 지적을 반영용 목록으로 옮긴 것이다(내용 추가 없음).
> eng · design 게이트 결과는 다음 라운드에서 덧붙인다.

## Consensus Summary

### HIGH (P1 — 실행 전 필수)
- **F1** `05-11-PLAN.md:150-156` — 정산 최종 승인 훅이 결재자 viewer로 `changeProjectStatus`를 불러 `projects.complete` 메뉴 검사(`domain/projects/status-transitions.ts:20`, `domain/projects/status.ts:291-293`)에 걸리면 매번 전체 롤백, 탈출구 없음. 수리: `trigger: "approval"`이면 메뉴 검사 대신 "이 결재 인스턴스의 최종 승인 단계 담당" 판정, 거짓이면 `approveBlockedReason`으로 미리 표시. 통합 사례 1(마지막 단계를 경영관리로 바꾼 설정에서 `projects.complete` 없는 결재자도 승인 → 완료 성공 / 인스턴스 밖 사람은 거부). 보조안: 정산 결재선 설정 저장 때 마지막 단계 계급 검증
- **F2** `05-04-PLAN.md:55` vs `:173` — `removeEvidence` 로그 종류 `evidence_remove`가 "증빙 추가 · 삭제는 `document_update`" 규칙과 모순. 수리: `recordActionInTx(document_update, detail { change: "evidence_remove", fileId })`

### MEDIUM (P2 — 같은 반영 라운드)
- **F3** `05-14-PLAN.md:154-159` — 같은 문서 · 같은 version 두 번 제출 사례 없음. 두 번째는 "이미 제출됨 → 문서로 이동" 결과, 번호 하나. 통합 사례 1
- **F4** `05-01-PLAN.md:36-37` — 05-01 Task 1 ⓪ 뒤 "04.1 실제 시그니처와 E1~E7 전제 대조 — 다르면 멈추고 `--reviews`로 05-01 · 05-03 · 05-11 재점검". read_first의 Phase 4 줄 범위는 "함수 이름 Grep 후 범위 Read"로
- **F5** `05-12`(웨이브 5), `05-13-PLAN.md:183` — GCS V4 서명 실측이 웨이브 13. 05-12 끝에 DB 없는 스파이크 checkpoint(staging 버킷 서명 PUT/GET 1회, 사람 확인). 05-13 확인은 유지
- **F6** `05-07-PLAN.md:183`, `05-09-PLAN.md:130` — 번호 있는 문서는 같은 프로젝트(팀 문서는 같은 종류) 안에서만 줄 바꾸기. prohibition + 통합 사례 1
- **F7** 05-04 · 05-11 · 05-12 — 구조화 로그(`log.warn`, id와 사유 코드만, 개인 정보 · 금액 없음) 1~2줄씩: 정산 훅 롤백, 업로드 완료 메타데이터 불일치, 서명 실패, 로컬 드라이버 운영 차단
- **F8** `05-VALIDATION.md:5-6` 초안 — 실행 전 `/gsd-validate-phase 5`로 Per-Task 맵 채우기, 04.1 연차 회귀(E1 · E7 뒤) 명시 항목
- **F9** `05-04-PLAN.md:173`, `05-12-PLAN.md:152` — 05-12 부트스트랩에 버킷 수명 주기 규칙(미완료 업로드 접두어 7일 삭제). Phase 6 F8 유지

### LOW (P3)
1. `.planning/ROADMAP.md:602` 기준 7 문구가 D-101과 어긋남 — 정렬
2. `05-01-PLAN.md:98` Phase Goal 절이 연차 포함 옛 Goal — 현 ROADMAP Goal로
3. `05-CONTEXT.md:9 · 58` 요구사항 목록에 04.1로 옮긴 EXP-03 · 04 · 05, ADMN-04, LEAV-01 잔존
4. `REQUIREMENTS.md:251` ADMN-04 세율 부분을 어느 플랜도 싣지 않음 — 05-06 frontmatter `requirements`에 ADMN-04(세율 부분)
5. UI 확정 #3(행 승인 즉시)이 정산 결재 승인(되돌릴 수 없음)에도 적용 — 사용자 결정 유지, CLAUDE.md §7 의식적 예외로 05-11 SUMMARY · 검증 기록에 남기도록
6. `05-05-PLAN.md:43` HEIC 변환 실패 시 원본 업로드 — 서버 허용 형식에서 HEIC 처리 명시
7. 결재 차례 알림 Phase 7 — 조치 없음(기록만)

## User Decisions (코디네이터 경유)

- **U1** `05-09-PLAN.md:40` 승인 뒤 증빙 삭제 — 결정 댓글 없음 → 추천안 A(승인 뒤 추가만, 결재 중 삭제는 version 증가로 막는 현행 유지) 반영, **사용자 결정 대기** 표시
- **U2** `05-09-PLAN.md:40 · 130` 반려 · 회수 문서 종결 경로 — 결정 댓글 없음 → 추천안 B(Phase 6 TODO), **사용자 결정 대기** 표시

## Divergent Views

- 모드: 교차 검토자는 SELECTIVE, 리뷰는 HOLD SCOPE(범위 고정은 사용자 결정). 선택 항목은 전부 F-항목으로 흡수됨
