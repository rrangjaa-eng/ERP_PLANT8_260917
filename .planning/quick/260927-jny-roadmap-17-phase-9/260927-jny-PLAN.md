---
phase: quick-260927-jny
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/ROADMAP.md
autonomous: true
requirements: [QUICK-260927-jny]

estimate:
  tokens: 15000
  raw_tokens: 15000
  tasks: 1
  confidence: low

must_haves:
  truths:
    - "ROADMAP.md 17행(엔지니어링 리뷰 요약)의 Phase 9 문장이 'Phase 6 뒤 전환과 무관하게 착수, 테스트 데이터로 검증'을 말해, 개요 37행·Phase 9 Depends on 737행·순서 메모 841행(커밋 5ee66f1)과 같은 결정을 가리킨다"
    - "ROADMAP.md 어디에도 옛 착수 조건 표현 '전환 후 N주(설정, 기본 2주) 실입력'이 남지 않는다"
    - "17행의 나머지 문장(구조 변화 (1)·(2), (3)의 첫 문장, OV-4·OV-8 문장 등)과 ROADMAP.md의 다른 줄은 기준 커밋 f950acc 대비 한 글자도 바뀌지 않는다 — 기준 커밋 대비 diff는 1줄 삭제·1줄 추가뿐이다"
    - "변경은 ROADMAP.md 한 파일만 담은 커밋 1개로 남고, 제목은 'docs: align ROADMAP eng-review summary with Phase 9 test-data decision', 본문은 한국어, 끝에 Co-Authored-By·Claude-Session 두 줄이 있다"
  artifacts:
    - path: ".planning/ROADMAP.md"
      provides: "17행 엔지니어링 리뷰 요약의 Phase 9 문장이 2026-09-27 사용자 결정(테스트 데이터 검증, 전환과 무관한 착수)과 일치하는 로드맵"
      contains: "Phase 9(프로젝트 손익)는 Phase 6 뒤 전환과 무관하게 착수하고 테스트 데이터로 검증한다"
  key_links:
    - from: ".planning/ROADMAP.md 17행 (엔지니어링 리뷰 요약 (3))"
      to: ".planning/ROADMAP.md 737행 (Phase 9 **Depends on**)"
      via: "두 줄이 같은 괄호 출처 '2026-09-27 사용자 결정, Eng OV-1의 '전환 후 N주 실입력' 착수 조건 대체'를 쓴다"
      pattern: "Eng OV-1의 '전환 후 N주 실입력' 착수 조건 대체"
---

<objective>
ROADMAP.md 17행(엔지니어링 리뷰 반영 요약)에 남은 옛 Phase 9 착수 조건 문장 하나를, 커밋 5ee66f1이 개요(37행)·Depends on(737행)·순서 메모(841행)에 이미 반영한 2026-09-27 사용자 결정(Phase 6 뒤 전환과 무관하게 착수, 테스트 데이터로 검증, 전환 뒤 실데이터 대조는 착수를 막지 않는 사후 확인)에 맞춰 교체한다. 사용자가 2026-09-27에 이 수정을 승인했다.

Purpose: 로드맵 안에서 Phase 9 착수 조건이 한 줄만 옛 결정을 말하는 모순을 없애, 이후 계획·검토가 17행을 근거로 "전환 후 N주 대기"를 되살리지 않게 한다.
Output: 17행의 그 문장 하나만 바뀐 .planning/ROADMAP.md와 커밋 1개.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# 문구 기준: 같은 결정을 37·737·756·841행에 반영한 커밋 (실행 전에 확인)
# git show 5ee66f1 -- .planning/ROADMAP.md
# ROADMAP.md는 900줄 가까운 파일이다 — 전체 Read 금지, 17행만 본다 (sed -n 17p .planning/ROADMAP.md)
</context>

<!-- planner-discipline-allow: 전환 후 N주(설정, 기본 2주) 실입력 -->

<tasks>

<task type="auto">
  <name>Task 1: ROADMAP.md 17행의 Phase 9 착수 조건 문장 하나를 테스트 데이터 결정 문장으로 교체하고 커밋</name>
  <files>.planning/ROADMAP.md</files>
  <read_first>
    - sed -n 17p /home/user/ERP_PLANT8_260917/.planning/ROADMAP.md (17행만. 파일 전체를 읽지 않는다)
    - git -C /home/user/ERP_PLANT8_260917 show 5ee66f1 -- .planning/ROADMAP.md (737행 Depends on 문구가 새 문장의 괄호 출처 표현 기준)
  </read_first>
  <action>
    1. 사전 확인: 작업 트리가 깨끗하고(git status --short 에 .planning/ROADMAP.md 변경 없음), ROADMAP.md에서 교체 대상 문장이 정확히 1번만 나온다(grep -cF 로 1). 1이 아니면 멈추고 보고한다 — 다른 곳을 추측해 고치지 않는다.

    2. Edit 도구로 .planning/ROADMAP.md 에서 아래 문장 하나만 교체한다. Write 도구·sed -i·전체 파일 재작성 금지(ROADMAP.md 는 한 줄이 매우 긴 파일이라 전체 쓰기는 다른 페이즈 항목을 망가뜨릴 수 있다). old_string 은 교체 대상 문장 그대로(끝의 마침표 포함, 앞뒤 공백 제외)이고 new_string 은 새 문장 그대로다. 둘 다 17행 안에서 유일하므로 replace_all 은 쓰지 않는다.
       - 교체 대상(old_string): Phase 9(프로젝트 손익) 착수 조건은 전환 후 N주(설정, 기본 2주) 실입력이다.
       - 새 문장(new_string): Phase 9(프로젝트 손익)는 Phase 6 뒤 전환과 무관하게 착수하고 테스트 데이터로 검증한다(2026-09-27 사용자 결정, Eng OV-1의 '전환 후 N주 실입력' 착수 조건 대체).
       새 문장의 괄호 출처는 737행(Depends on)의 표현과 글자 그대로 같게 맞춘 것이고, 본문은 37행("Phase 6 뒤 착수(전환과 무관), 테스트 데이터로 검증")·841행("Phase 6 뒤 전환과 무관하게 착수하고 테스트 데이터로 검증한다")과 같은 뜻이다. 조사 '는'은 괄호 앞 낱말 'Phase 9'에 붙는다(841행은 '손익(Phase 9)은'이라 '은'). 문구를 바꾸지 말고 이 문장 그대로 넣는다.

    3. 건드리지 않는 것: 17행의 다른 문장 — 바로 앞 "(3) 전환 전 새 시스템 입력은 source='demo'뿐이고 …" 문장, 바로 뒤 OV-4·OV-8 문장, 구조 변화 (1)·(2) 등 — 과 ROADMAP.md의 다른 모든 줄(37·737·756·841행은 5ee66f1에서 이미 맞춰져 있다). STATE.md 와 다른 .planning 파일도 이 태스크에서 수정하지 않는다(퀵 태스크 상태 기록은 오케스트레이터 몫). 포맷·공백·줄바꿈 정리도 하지 않는다.

    4. verify 의 automated 명령을 실행해 VERIFY_OK 를 확인한다. 실패하면 systematic-debugging 스킬 절차로 원인(대상 문장 불일치·공백 차이·다른 줄 변경)을 확인하고 git diff f950acc -- .planning/ROADMAP.md 로 차이를 본 뒤 고친다. 추측 수정 금지.

    5. .planning/ROADMAP.md 한 파일만 스테이징해 커밋한다(git add .planning/ROADMAP.md 뒤 git commit, --no-verify 금지, 다른 파일을 스테이징하지 않는다). 커밋 메시지는 여러 줄이므로 스크래치패드의 임시 파일에 적어 git commit -F 로 넘기거나 -m 을 여러 번 쓴다(heredoc 파일 생성 금지). 메시지 구성:
       - 제목: docs: align ROADMAP eng-review summary with Phase 9 test-data decision
       - 빈 줄 뒤 한국어 본문 2~3줄: 17행 엔지니어링 리뷰 요약에 남아 있던 Phase 9 착수 조건 문장("전환 후 N주 실입력")을 5ee66f1의 2026-09-27 사용자 결정(Phase 6 뒤 전환과 무관하게 착수, 테스트 데이터로 검증)에 맞춰 교체했다는 것, 17행의 다른 문장과 다른 줄은 그대로라는 것, 사용자 승인(2026-09-27)으로 수정했다는 것. 본문에 옛 문장 전체를 인용하지 않는다.
       - 빈 줄 뒤 마지막 두 줄(글자 그대로):
         Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
         Claude-Session: https://claude.ai/code/session_01TtB9M9amNLe2RgtdKXf53X
       푸시하지 않는다(푸시·PR 은 이 태스크 범위 밖).

    6. 커밋 뒤 verify 명령을 한 번 더 실행해 VERIFY_OK 가 유지되는지(기준 커밋 f950acc 대비 비교라 커밋 뒤에도 성립), git show --stat HEAD 가 .planning/ROADMAP.md 1 file, 1 insertion(+), 1 deletion(-) 인지 확인한다. "완료"를 말하기 전에 verification-before-completion 스킬 절차를 따른다.
  </action>
  <verify>
    <automated>cd /home/user/ERP_PLANT8_260917 && BASE=f950acccddf45f60ee5f1743c827fa58e981ed0f && OLDS='Phase 9(프로젝트 손익) 착수 조건은 전환 후 N주(설정, 기본 2주) 실입력이다.' && NEWS="Phase 9(프로젝트 손익)는 Phase 6 뒤 전환과 무관하게 착수하고 테스트 데이터로 검증한다(2026-09-27 사용자 결정, Eng OV-1의 '전환 후 N주 실입력' 착수 조건 대체)." && BASEF=$(git show "$BASE":.planning/ROADMAP.md) && OLD17=$(printf '%s\n' "$BASEF" | sed -n 17p) && NEW17=$(sed -n 17p .planning/ROADMAP.md) && [ -n "$OLD17" ] && [ "${OLD17/"$OLDS"/"$NEWS"}" = "$NEW17" ] && NS=$(git diff --numstat "$BASE" -- .planning/ROADMAP.md) && [ "$(printf '%s' "$NS" | cut -f1,2 | tr '\t' ' ')" = "1 1" ] && ! grep -q '전환 후 N주(설정, 기본 2주) 실입력' .planning/ROADMAP.md && [ "$(grep -cF "$NEWS" .planning/ROADMAP.md)" = 1 ] && echo VERIFY_OK</automated>
  </verify>
  <acceptance_criteria>
    - 커밋 전 git diff --stat .planning/ROADMAP.md 가 1 file changed, 1 insertion(+), 1 deletion(-) (17행 한 줄만 바뀜)
    - grep -c '전환 후 N주(설정, 기본 2주) 실입력' .planning/ROADMAP.md 가 0
    - 기준 커밋 f950acc 의 17행에서 교체 대상 문장만 새 문장으로 바꾼 문자열이 현재 17행과 정확히 같다(= 17행의 나머지 문장은 그대로) — verify 의 첫 비교
    - grep -cF 로 센 새 문장 개수가 1
    - git show --stat HEAD 가 .planning/ROADMAP.md 한 파일만 포함하고, git log -1 --format=%s 가 docs: align ROADMAP eng-review summary with Phase 9 test-data decision, 본문 끝 두 줄이 Co-Authored-By·Claude-Session 줄
  </acceptance_criteria>
  <done>ROADMAP.md 17행의 Phase 9 문장만 테스트 데이터 결정 문장으로 바뀌어 37·737·841행과 같은 결정을 말하고, 옛 표현은 파일에 0건, 기준 커밋 대비 diff는 1줄 삭제·1줄 추가, 변경이 지정 메시지의 커밋 1개로 남았으며 verify 명령이 커밋 전후 모두 VERIFY_OK 를 출력한다.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 없음 | 계획 문서 한 줄 수정. 코드·입력·인증·외부 서비스 경계를 지나지 않는다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-q260927jny-01 | Tampering | .planning/ROADMAP.md (다른 페이즈 항목) | medium | mitigate | Edit 도구로 문장 하나만 교체(Write·sed -i 금지), 사전 grep -cF 로 대상 1건 확인, verify 가 기준 커밋 f950acc 대비 numstat "1 1"과 17행 전후 문자열 동일성을 검사 |
| T-q260927jny-02 | Information Disclosure | 커밋 메시지 | low | accept | 문서 문구만 다루며 시크릿·개인정보가 없다. 커밋에 ROADMAP.md 한 파일만 스테이징 |
</threat_model>

<verification>
- Task 1 의 automated 명령이 VERIFY_OK 를 출력한다(커밋 전·후 각 1회)
- git log -1 --stat 이 .planning/ROADMAP.md 1 file, 1 insertion(+), 1 deletion(-)
- sed -n 17p .planning/ROADMAP.md 에 새 문장이 있고, 같은 줄의 "(3) 전환 전 새 시스템 입력은 source='demo'뿐이고" 문장과 "OV-4(쓰기 시점 파생 컬럼)는 기각하고" 문장이 그대로 있다
</verification>

<success_criteria>
- 로드맵의 Phase 9 착수 조건이 17행·37행·737행·841행 네 곳에서 모두 "Phase 6 뒤, 전환과 무관, 테스트 데이터로 검증"으로 일치한다
- '전환 후 N주(설정, 기본 2주) 실입력' 표현 0건
- 17행의 다른 문장과 다른 줄은 무변경, 커밋 1개(지정 제목·한국어 본문·두 줄 트레일러)
</success_criteria>

<output>
Create `.planning/quick/260927-jny-roadmap-17-phase-9/260927-jny-SUMMARY.md` when done
</output>
