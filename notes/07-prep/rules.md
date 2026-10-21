# 07 계획용 규칙 발췌 (main 9122c31 기준, 줄 번호 재확인) — 읽기 전용 조사

## A. CLAUDE.md
- 코딩 전 생각: 가정 명시·모호하면 해석 병기·불명확하면 멈추고 질문 — CLAUDE.md:28-35
- 단순함: 요청 이상 기능·추상화·설정 가능성·불가능한 상황의 에러 처리 금지 — CLAUDE.md:37-45
- 외과적 변경: 주변 개선·리팩터 금지, 내 변경으로 생긴 고아만 제거, 모든 줄은 요청에 추적 — CLAUDE.md:47-59
- 목표 지향: 단계마다 「검증: 확인 항목」을 붙인 짧은 계획 — CLAUDE.md:61-74
- 플랜은 크게(`granularity: coarse`), 플랜 하나 = 세션·게이트·CI 한 바퀴 — CLAUDE.md:80
- 계획 게이트: `/plan-eng-review` 1회(UI 포함 시 `/plan-design-review` 1회), 반영 뒤 재검토 최대 1회, `/plan-ceo-review`는 마일스톤 수준만 — CLAUDE.md:81
- UI 포함 시 DESIGN.md 읽기, SYSTEM.md 있으면 §4만 적용; 리뷰 결과는 GSD 계획 파일에 반영; Codex는 디자인 검토에서만 — CLAUDE.md:82-83
- 세션은 독립 검토 경계(계획 완료 뒤·게이트 리뷰 종료 뒤)에서만 끊음; 끊을 때 커밋·푸시 → `/gsd-pause-work` → plant8 환경 새 세션 `/gsd-progress` — CLAUDE.md:87
- 실행자 Sonnet, `risk:` 태그(돈·권한·DB 잠금·마이그레이션) 플랜만 Opus 실행자 + Opus 독립 검토 1명, 화면 플랜은 독립 DOM 감사 — CLAUDE.md:88
- Superpowers 스킬 호출 명시(systematic-debugging·verification-before-completion·test-driven-development), 서브에이전트 프롬프트에도 — CLAUDE.md:89
- Post-build는 PR당 한 번: 문서만=게이트 없음(CLAUDE.md:94) · 코드=`/review`(:95) · 화면=`/review`+`/design-review`→`/qa`(:96) · 돈·결재=`/review`+`/cso`(:97) · 인증·권한은 사용자 머지, 외부 입력은 판단해 `/cso`(:98)
- 해당 게이트 건너뛰기·즉석 대체 금지, 무관한 게이트 덧붙이기 금지 — CLAUDE.md:100
- 위험 경로 PR(db/migrations·db/schema·domain/auth·domain/permissions·lib/crypto*·배포 스크립트·.github/workflows·infra·.claude·CLAUDE.md)은 사용자가 머지; 별도 PR로 분리 — CLAUDE.md:105
- 한 번에 PR 하나, 배포 초록 뒤 다음; 스테이징 빨간불이면 무인 머지 중단 — CLAUDE.md:104
- 절차 생략이 맞다고 보이면 먼저 말하고 승인; 사소 변경 예외는 한 파일 안 변경만 — CLAUDE.md:108-109
- TDD, 실행 확인 없이 완료 금지 — CLAUDE.md:113 / 로컬 dev 통과는 완료 아님, 완료 판정 `CI=true` — CLAUDE.md:114
- 테스트는 단계별: 작업 중 lint·typecheck+관련 단위·통합+건드린 화면 E2E, 전체는 ready PR의 CI 한 번 — CLAUDE.md:115
- 버그: 재현→원인→수정→회귀 테스트, 추측 수정 금지 — CLAUDE.md:116
- 한 커밋 한 의도, 제목 영어 접두어(docs/feat/fix/chore), 본문 한국어 — CLAUDE.md:117
- 새 의존성 이유 한 줄+승인 후, 시크릿·`any` 금지, 요청 없는 리팩터·주석·파일 이동 금지 — CLAUDE.md:118-120
- UI 완료=`/design-review`→`/qa`; 화면 검증 순서 싼 게이트→독립 DOM 감사(CI=true, 스크린샷 육안 금지)→수정→CI 한 번 — CLAUDE.md:124-125
- Codex 디자인 검토는 `/design-review`·`/plan-design-review`만(`scripts/codex-design-review.sh`, 계획은 `--plan`), 자격 없으면 「Codex 디자인 검토 건너뜀: 사유」 한 줄 — CLAUDE.md:126
- §7 사용성: UI-SPEC·플랜·리뷰는 「문구 없이 이해되는가·불필요한 결정이 남았는가」 점검, 사용자가 정한 결정은 변경 금지 — CLAUDE.md:129-130
- 모델: 점검·계획·판단·검토 Opus, 구현·테스트 실행 Sonnet 위임, 서브에이전트 `model` 명시, Fable은 페이즈 최종 검토·되돌리기 어려운 결정만 — CLAUDE.md:134
- 조사·긴 로그는 서브에이전트 위임, 500줄 이상 파일은 range Read, 출력 요약, 토큰 절약 — CLAUDE.md:133,135-137
- 세션 자율: 지시는 PR 댓글 「[지시]」, 푸시 전 origin/main 머지 커밋 반영(force 금지), 마이그레이션 번호 충돌 시 내 것 삭제 후 `pnpm db:generate` — CLAUDE.md:150-152
- 동시 레인: 만들기 1 + 계획 1(다음 페이즈 `.planning/`만) + 검증 1, 파일 겹침 없음; 계획 레인은 미확정 부분을 의존성으로 표시 — CLAUDE.md:153-155

## B. docs/DESIGN.md
- 실물 보기: 시안·비교는 실제 앱에 입힌 화면으로만(목업 HTML·이미지 생성 금지), 폭 PC 1280·폰 390, 축 값 명시, 시작 전 design-gate — DESIGN.md:61-66
- §4 통일: 템플릿에서 시작 / 새 색·서체·radius·그림자 금지 / 기존 컴포넌트 먼저(새 컴포넌트는 두 곳 이상) / 같은 행동=같은 단어 / 완료 전 §6+`/design-review` / 이탈은 DECISIONS.md 기록 후 SYSTEM.md 수정 — DESIGN.md:89-94
- §6 품질 바닥: 360–1440·키보드·focus-visible·대비 4.5:1/3:1·reduced-motion·실제 데이터(긴 이름·큰 금액·빈 값)·`word-break: keep-all` — DESIGN.md:105-107
- 단계 연결: 통일=design-gate 점검표(`docs/design/checks/`)→독립 DOM 감사→`/design-review`→`/qa` — DESIGN.md:115

## C. docs/design/SYSTEM.md
- 폼 화면 §6-3: 한 열 `--form-max` 720·라벨 96, 연차 신청도 이 템플릿 — SYSTEM.md:452-456; 막힘은 이유+다음 한 수 같은 줄 — :473
- 공휴일 화면은 새 템플릿 아님(§6-1 목록+§7-15 폼 조립) — SYSTEM.md:315; 공휴일 1차 버튼=확정 전 「확정」/확정 뒤 「추가」(동시 1차 금지) — :406
- 서버 계산 값은 입력 바로 아래 한 줄(`--text-aux --text-muted`, 숫자만 700) — SYSTEM.md:484
- 버튼 위계 §7-1: 1차 화면당 1개·2차·3차(행 안), 비활성은 이유 글자+`aria-disabled`, 위험 행동은 확인 모달(붉은 버튼 없음), 진행 중 `…` — SYSTEM.md:757-775
- 입력·오류 §7-2: 필수 `*` 없음(제출 버튼이 이유를 말함)·placeholder는 형식 예만·네이티브 select — SYSTEM.md:781-784; 서버 검증 오류=입력 아래 한 줄 「원인 · 다음 행동」, 입력값 유지 — :785
- 설정 필드: 라벨+선택 힌트 한 문장·40자 상한, 비이력형은 즉시 저장(blur/change), 별도 저장 버튼 없음, 이력형은 「새 이력 추가」가 저장 — SYSTEM.md:801-803,815-820
- 표 §7-3 폰 칸 접기: `<700px` P1만 열(최대 3열: 항목+금액+상태/행동), P2는 행 아래 접힌 줄, 가로 스크롤·카드 전환 금지 — SYSTEM.md:851-853
- 폰 셀 편집 없음(행 탭→하단 시트), 코드표·계급은 폰 읽기 전용 — SYSTEM.md:858; 공휴일처럼 첫·끝 열이 숨는 표는 보이는 첫·끝 칸에 `--s-4` 여백 — :859
- 알림함 §7-12: 안 읽은 행 왼쪽 선, 「내 차례」(할 일)와 구분(알림=과거형, 다음 한 수 버튼 없음), 건수 배지는 안 읽은 알림 수만, EMPTY `알림이 없습니다`, 열면 전부 읽음(「모두 읽음」 없음) — SYSTEM.md:1090-1103
- 공휴일 확정 요청 안내(B1) — SYSTEM.md:1078; 사건 알림은 행동과 같은 트랜잭션·같은 중복 키(조건 종류·대상·대상 id·받는 사람·회차), 이메일은 다음 영업일 tick 묶음 — :1104
- 확인 창 §7-17: 네이티브 dialog, 2차 라벨 자동 파생(`닫기 Esc`/`취소 Esc`), 서버 거부는 막힘 자리에 붙고 안 닫힘(토스트 없음), 성공 시 바로 닫힘 — SYSTEM.md:1256-1275; 되돌릴 수 있는 목록 행 삭제는 확인 없이 `되돌리기` — :772,1045
- PickDialog §7-17-1 — SYSTEM.md:1278; 카피 §8: 버튼=실제 동작, 결과도 같은 단어, 오류=원인·다음 행동·명사형·`-습니다` 금지 — :1326-1328
- 검증 §11: 폭 360–1440·키보드·focus-visible·대비 — SYSTEM.md:1364-1372 (DOM 감사 폭 1280·1024·375(+700) 상세는 같은 절)

## D. .claude/rules/frontend.md (화면 파일을 만지면 자동 첨부)
- SYSTEM.md 없으면 화면 금지; 목차에서 절만 Grep+범위 Read(151KB) — frontend.md:11
- 화면 파일 수정 전 `design-gate` 스킬 호출, 훅이 강제 — frontend.md:12
- 새 색·서체·radius 금지, 이탈은 DECISIONS.md 기록 뒤 SYSTEM.md 수정, 화면 하나만 예외 금지 — frontend.md:13-14
- UI 완료=`/design-review`→`/qa`, DOM 감사 별도 에이전트 CI=true, 반복 지적(44px 터치·320px 넘침·포커스 링)은 E2E로 — frontend.md:15-17
- 사용성: 안내 문구 최소(오류·되돌릴 수 없음·잠김에만, 명사형) — :21 / 결정 최소(기본값·계산은 시스템·불가 선택지 숨김·확인 창 대신 되돌리기) — :22 / 주 버튼 하나·단계·엑셀식 키보드·상태는 색·배지 — :23 / 플랜·리뷰 점검 문구 — :24

## E. .claude/hooks (계획 단계 제약)
- plant8-skill-gate.sh agent: gsd-* 에이전트는 대응 /gsd-* 스킬 호출 뒤에만; 페이즈 실행 gsd-executor는 계획 게이트 기록(`/plan-eng-review`, UI면 `/plan-design-review`; 소수점 페이즈는 CEO 생략) 없으면 차단 — skill-gate.sh:85,125-143
- skill-gate bash: 모든 커밋은 verification-before-completion 뒤, 코드 커밋은 TDD도; 페이즈 완료(gsd-tools phase complete)는 `/gsd-verify-work`·`/review`(화면은 `/qa`·`/design-review`) 뒤 — skill-gate.sh:15-20,147-150
- skill-gate edit: 코드 작성은 test-driven-development 뒤, 테스트·빌드 실패 뒤 수정은 systematic-debugging 뒤 — skill-gate.sh:21-22
- skill-gate merge: PR 헤드 CI 전부 초록+변경 종류별 게이트 기록, 위험 경로 PR은 세션 머지 차단; 게이트 로그 `.claude/gates/phase-NN.log` 커밋 — skill-gate.sh:24-34
- plant8-session-boundary.sh: 계획 완료(`/gsd-plan-phase` 후)·게이트 리뷰 종료 뒤 다른 단위(게이트 리뷰·계획·실행) 새로 시작 차단(exit 2), 인계 안 하면 stop 막음 — session-boundary.sh:12-22
- plant8-rule-guard.sh: Codex(디자인 검토 스킬 기록 있을 때만)·pnpm 외 패키지 매니저·git push --force·세션 머지·훅/CLAUDE.md 쓰기·draft·커밋 제목 접두어·프로덕션 DB — rule-guard.sh:714-718 및 :1-20
- plant8-pre-push-gate.sh: git push 전 lint·typecheck 강제(약 45초) — pre-push-gate.sh:1-6
- plant8-protect-claude-md.sh: CLAUDE.md 수정 차단 — protect-claude-md.sh:1-3
- plant8-procedure-checklist.sh: 매 턴 훅이 못 막는 규칙만 4줄 리마인드 — procedure-checklist.sh:1-4
- design-gate(화면 파일 수정 전 스킬, 훅 강제)는 frontend.md:12 / DESIGN.md:115 참고

## F. .planning/config.json (계획 관련)
- granularity=coarse, mode=interactive, model_profile=adaptive, parallelization=true
- workflow: research·plan_check·verifier·nyquist_validation·ui_phase·ui_safety_gate·pattern_mapper·post_planning_gaps·security_enforcement(ASVS 1, high에서 차단)=true; code_review=false; plan_bounce=false; auto_advance=false; human_verify_mode=end-of-phase; node_repair_budget=2
- plan_review.source_grounding=true(권위=grep): 계획의 코드 주장은 grep으로 근거 확인
- model_overrides: plan-checker·code-reviewer·verifier·integration-checker·ui-checker·ui-auditor = opus
- git.branching_strategy=none, phase_branch_template=`gsd/phase-{phase}-{slug}`; commit_docs=true; ship.pr_body_sections 3개(사용자 스토리·위험/의존·성공 기준) 활성
