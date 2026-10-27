# 07.1 플랜 체커 요약 (PR #299 head cf2e8a2, 2026-10-27 KST)

판정: ISSUES FOUND — 막는 1 · 경고 4 · 260907 근거 오류 6(+약한 근거 4) · 참고 3
스킬: plant8:gsd-plan-phase 07.1 --skip-research (기존 플랜 유지, §10 체커만) · 체커 plant8:gsd-plan-checker(Opus) · 260907 대조 Sonnet(옛 저장소 60f86da 실측)

## 통과
- 결정 반영 게이트 28/28(decision-gate-raw.txt), 명령 경로·실패 방향 프로브 89건 0/0
- 260907 대조 절 19/19 존재, 위험 경로 07·08·10만·각자 사용자 머지 PR, risk 태그 위치, #298 의존 15·17·18·19 선언, 마이그레이션 규칙(07.1-07:87)

## 막는 문제
- B-1 07.1-01(:19,:336)과 07.1-07(:18,:188) 둘 다 웨이브 1·depends_on 없음, 같은 test/integration/evidence-records.test.ts 수정. 07은 사용자 머지 PR이라 충돌. → 07을 01 뒤로 하거나 07 사례를 evidence-row-scope.test.ts에만.

## 경고
- W-1 화면 플랜 게이트 줄에 scripts/codex-design-review.sh·--out 미기재(05·09·11·14·16·17·19; CLAUDE.md:126) → 07.1-01:472 줄 복사
- W-2 ROADMAP.md:1205-1209 「0 plans / TBD」 그대로 → GSD로 플랜 목록·웨이브 반영
- W-3 07.1-15 wave 4인데 depends_on [] → 이유 적거나 웨이브 조정
- W-4 07.1-05 26파일·주제 5개 → 나누거나 크기 사유

## 260907 근거 오류 (260907-crosscheck.md, 본체가 grep으로 3건 재확인)
- 07.1-12:97 「CANCEL_FLAG|취소 줄 0건」 거짓 — server/src/card-uses.ts:1156 등 5건(0원 이하 증빙 막고 「취소 줄은 경영관리」)
- 07.1-12:100 「private_to_owner db/schema 0건」 거짓 — 010_tables.sql:773, 060_seed_kinds.sql:271
- 07.1-05:114 「hometax 파서 0」 거짓 — app/src/domain/receiptImport.ts:53-54,78-79, sales.ts:2397
- 07.1-13:87 write_audit(020_functions.sql:5000)는 UPDATE 때 바뀐 칸만 저장(:5061-5064), 「행 전체 old/new」 아님
- 07.1-18:104 index.css:1660-1665는 낡은 주석 — 실제 .checkbox :1665-1705(appearance:none), 44px 영역 :5685-5702
- 07.1-14:94 근거 없음+틀림 — 옛 사람 화면은 직책+팀(Org.tsx:3081), 본부는 직책에서 트리거로(020_functions.sql:3467). 07.1-07:96·14:93도 이 점 빠짐
- 약한 근거: 03:101·16:94(withholding.ts 면제 로직은 :102-110), 11:95(:1229-1230), 05:110(검색 범위가 receipts.ts만)

## 참고
- 14는 07(사용자 머지) 뒤라 그 머지 전엔 시작 못 함
- 03·05가 domain/settings/keys.ts·registry.test.ts 공유, 16·19가 expense-form.tsx 공유 — 웨이브 순서로만 갈림, 서로 depends_on 없음

## 하지 못한 것
- Codex 적대적 검토: codex 로그인은 살아 있음(login status OK) but 훅 R3(.claude/hooks/plant8-rule-guard.sh:64-74)와 CLAUDE.md:83·126이 디자인 검토 밖 codex 실행을 막음. 우회 안 함. 07.1은 화면 포함이라 /plan-design-review 게이트(별도 세션, codex-design-review.sh --plan)에서 Codex가 돌아야 함.

## 파일
plan-checker-report.md · 260907-crosscheck.md · decision-gate-raw.txt

# 2회차 (PR #299 head 4775cae, 2026-10-27 KST)
판정: 체커 막는 0 · 경고 0 · 참고 2(plan-checker-report-r2.md — 파일 머리줄 「PASSED」는 참고만 있다는 뜻). 1회차 지적 12건 모두 해결(B-1: 07→01 의존·웨이브 2, 같은 웨이브 파일 겹침 0). 결정 반영 28/28.
260907 재확인(260907-crosscheck-r2.md): 1회차 6건+약한 근거 5건 모두 해결. 새 오류 1건 — 07.1-12-PLAN.md:97 `server/src/purchases.ts:459` 인용은 구매 요청 「취소」 상태 합계를 0으로 누르는 코드(본체가 :452-465 직접 확인)이지 카드 명세 취소 줄이 아님 → 빼거나 고쳐 쓰기. 계획 스레드에 넘김.
Codex 적대적 검토: 이 세션에서 못 돌림(1회차와 같은 사유) — 디자인·Codex 검토 스레드 몫.

# 마무리 (head 3caefb0)
07.1-12-PLAN.md:97 purchases.ts:459 인용 제거 확인(diff 1줄, 다른 파일 변경 없음). 플랜 체커 종료 — 막는 0·경고 0. Codex 적대적 검토는 디자인·Codex 검토 스레드 몫으로 남음.
