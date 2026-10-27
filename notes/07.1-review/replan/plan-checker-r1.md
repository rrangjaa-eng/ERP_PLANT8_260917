# 07.1 재계획 plan-checker r1 (REVIEWS c9f8ec7 → 427c8e6)

## ISSUES FOUND
**Phase:** 07.1 carryover-followup · **Plans checked:** 19 · **Issues:** 0 blocker · 0 warning · 2 info
판정: Advisory only — 수정 필요 없음(실행 진행 가능).

### 확인한 것 (근거)
- 리뷰 반영: E-P1-01~13 13/13, E-P2-01~53 53/53이 PLAN.md 본문에 ID로 있음(grep). D-E1~E7 모두 반영(04:47-48 · 07/14:58 · 12:47,94 · 16:49,190 · 06:48 · 10:31 · 18:37,58 / 15:37). C-1 정정은 07:39-40 · Task 3(:197)에 truth·시험(`countEvidencePool` 작성자 모드)으로 반영. 19개 플랜 모두 Review Dispositions Ledger 있음. 6절 순서 영향 3줄: 09→01 dep(w2), 07 wave 1·dep 없음, 05 dep 01 유지.
- 웨이브·depends_on: 07 w1 · 09 w2 dep 01 · 02 w2 dep 06(people.spec.ts 겹침 해소, 02:7) · 14 w3 dep +09. 스크립트로 전 쌍 확인 — 같은 웨이브 files_modified 겹침 0, 웨이브 사이 겹침은 모두 depends_on(전이 포함)으로 품음, 앞 웨이브 의존 위반 0.
- 위험 경로: files_modified 중 위험 경로는 07(db/schema·db/migrations·domain/permissions) · 08(.claude/) · 10(domain/auth)뿐, 셋 다 merge_owner user. 세션 머지 플랜에 위험 경로 새로 들어온 것 0. 14는 risk db-lock + Opus 독립 검토 + /cso(14:36-37,113). 03·04·06·11·12·13·16 risk 태그·Opus·/cso 유지.
- 260907 인용: diff에서 지워진 260907 인용 5건 모두 현재 플랜에 그대로 남아 있음(삭제 0).
- 앞선 통과 보존: 디자인 최종 통과(final-check.md)의 U-1 option-a·F2 문구 `행 시트가 없는 표`는 15에 유지되고 D-E7로 `행 링크 표` 인수 기준만 더함. DECISIONS 머리줄 grep(`^## 20.. .*\(07\.1-15`)은 실제 DECISIONS 머리 꼴과 맞음.
- verify 경로·failing-direction 프로브: 101건 none(오케스트레이터 제공).

### Advisories (info)
1. [dependency_correctness / 3b] 같은 웨이브 결합은 선언돼야 한다
   - Plan: 07.1-01 · 07.1-07 (둘 다 w1, 상호 dep 없음)
   - Evidence: 07:63 key_link가 `repositories/evidence-records.ts` scopeWhere와 `countEvidencePool`을 쓰고 「07.1-01이 그 갈래에 방어 조각을 더한다」고 적음. 01은 같은 scopeWhere published 갈래와 풀 호출부(evidence-pool.ts:110·129)를 고침. 파일 겹침은 없고 07의 시험 대상은 본부(division) 갈래라 실패 가능성은 낮음.
   - Example fix: 07 Task 3 read_first에 「01 머지 여부와 무관(본부 갈래만 단언)」 한 줄, 또는 coupling_justified.
2. [scope_sanity] 플랜당 파일 수가 큼(18:31 · 05:27 · 14:22 · 03:21) — 이전 체커 통과 범위 그대로이고 coarse 설정(CLAUDE.md §4)이라 정보만.
