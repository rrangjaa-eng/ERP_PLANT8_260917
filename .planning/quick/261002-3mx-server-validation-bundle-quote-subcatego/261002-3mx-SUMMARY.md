---
status: complete
quick_id: 261002-3mx
date: 2026-10-02
---

# 261002-3mx 서버 검증 묶음 — 요약

출처: quick 261001-hfi 회고 후속 1·1+·2 (/mnt/project-files/notes/quick-261001-hfi-retro.md).

## 한 것
1. 견적 소분류 서버 검증 (`domain/quotes/lines.ts`) — 견적 줄(kind quote)의 소분류는 고를 수 있는 quote_subcategory 코드(활성 · 보관 아님)이거나 저장된 값 그대로(기존 줄 · 재전송한 새 줄). 아니면 소분류 칸 셀 오류 「고를 수 없는 소분류 · 새로 고침」로 배치 전체 거부. 목록은 `prepareQuoteLineSave`(트랜잭션 전)에서 한 번 읽는다 — 합성 저장(`saveProjectLedger`)도 같은 판정. 복제한 새 줄은 새 입력(화면도 고를 수 없는 소분류를 기본값으로 바꿔 복제) — 계획의 「원본 값 허용」은 화면과 맞춰 뺐다.
2. 코드표 허용 목록 (`domain/code-tables/index.ts` `CODE_TABLES`) — `createCodeItem`이 목록 밖 tableKey를 「없는 코드표 · 새로 고침」으로 거부. 코드표 화면(`app/(app)/admin/code-tables/page.tsx`)이 같은 목록을 import(화면 게이트 생략은 사용자 승인, 2026-10-02 결정 카드).
3. 설정 예정값 취소 자정 경합 (`repositories/settings.ts`) — 삭제 조건에 `effective_from > (statement_timestamp() at time zone 'Asia/Seoul')::date`. 경합으로 막히면 「이미 적용된 이력 행은 취소할 수 없음」(`domain/settings/registry.ts`).

## 커밋
1366429 · 0bb0726 · 3f5ce27 · 16c6841(/review 반영) · 26d00a1(화면 import) · 3d61fc5(레드팀: 자정 경합 시 「이미 적용됨」 문구)

## 확인
- RED→GREEN: 자정 경합(통합 1) · 코드표 허용 목록(통합 2) · 소분류(통합 6 + 재전송 1)
- 관련 통합 25파일 383건 통과 · 단위 전체 175파일 2424건 통과 · typecheck · eslint(바뀐 파일) · lint:sql
- E2E: 픽스처("sub-a" → stage_construction) 4개 스펙은 로컬에서 돌리지 않았다 — CI가 돈다

## 실행 메모
- gsd-executor 위임은 훅(phase 04.3 Pre-build 게이트)이 막아 메인 세션이 직접 실행했다(261001-hfi와 같은 경로).
- /review: 테스트·유지보수·단순화·보안·성능 전문가 + 적대 검토(Claude). Codex는 codex_reviews disabled. 반영하지 않은 것: 다른 사람이 소분류를 바꾼 동시 저장에서 버전 충돌과 함께 소분류 칸 오류가 하나 더 붙는 것(저장은 어차피 충돌로 거부 · 클라이언트 baseline으로 면제하면 우회 통로가 된다).
- 레드팀 후속(이 PR 밖, 기존 동작): 프로젝트 복사(`copyQuoteLines`)는 꺼진 소분류를 그대로 새 프로젝트로 옮긴다 · 붙여넣기 선택지는 활성 소분류만이라 꺼진 소분류 줄에 같은 값을 붙이면 화면 오류.
