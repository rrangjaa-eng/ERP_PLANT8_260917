---
phase: quick-260923-odg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .claude/hooks/plant8-session-boundary.sh
  - .claude/hooks/plant8-skill-gate.sh
  - .claude/settings.json
  - .claude/hooks/tests/plant8-session-boundary.test.sh
  - .claude/hooks/tests/plant8-skill-gate.test.sh
autonomous: true
requirements: [QUICK-260923-odg]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "D-01: after the main agent starts /plan-ceo-review, /plan-eng-review or /plan-design-review in session S (via the Skill tool OR a typed slash command), starting another unit in S is blocked with exit 2 and a Korean message: Skill gsd-plan-phase, gsd-execute-phase, gsd-quick, gsd-quick-batch, gsd-autonomous, a different gate review; Agent gsd-executor, gsd-planner"
    - "D-01: once a commit touching docs/designs/*review* lands at or after the gate review start, post-tool announces the session boundary once and the stop hook blocks the stop once with the handoff text"
    - "D-02: every git commit / gsd-tools commit (any files) is blocked unless the committing agent invoked verification-before-completion; code-path commits additionally still need test-driven-development"
    - "D-03: a new .planning/quick/*/*-SUMMARY.md created after session start is a session boundary (post-tool announce, pre-tool gsd-executor block, stop reminder)"
    - "D-04: in one session only the first main-agent gsd-executor dispatch that passes all other skill-gate `agent` checks is allowed; every later one is blocked, including a second call issued in parallel in the same message and checkpoint continuations. A dispatch denied by an earlier skill-gate check does not use up the one allowed dispatch"
    - "settings.json wires PreToolUse matcher Skill to plant8-session-boundary.sh pre-tool"
  artifacts:
    - path: .claude/hooks/plant8-session-boundary.sh
      provides: "gate-review boundary (pre-tool block, post-tool announce, stop reminder), quick SUMMARY boundary"
    - path: .claude/hooks/plant8-skill-gate.sh
      provides: "verification-before-completion required for every commit; TDD also for code commits; one gsd-executor per session (agent event)"
    - path: .claude/settings.json
      provides: "PreToolUse Skill -> plant8-session-boundary.sh pre-tool"
    - path: .claude/hooks/tests/plant8-session-boundary.test.sh
      provides: "payload-driven regression tests for D-01, D-03 + wiring check"
    - path: .claude/hooks/tests/plant8-skill-gate.test.sh
      provides: "payload-driven regression tests for D-02, D-04"
  key_links:
    - from: ".claude/hooks/plant8-skill-gate.sh record()"
      to: ".claude/hooks/plant8-session-boundary.sh gate-review detection"
      via: "line format in .claude/gates/phase-NN.log: '<skill> <YYYY-MM-DDTHH:MMZ> session=<id>[ extra]'"
      pattern: "session=\\$session"
    - from: ".claude/settings.json PreToolUse matcher Skill"
      to: "plant8-session-boundary.sh pre-tool"
      via: "hook command wiring"
      pattern: "plant8-session-boundary.sh pre-tool"
---

<objective>
Harden two plant8 hooks per user decisions of 2026-09-23. Decision IDs used below:

- D-01 (①): the end of a gate review (/plan-ceo-review, /plan-eng-review, /plan-design-review) is a session boundary. Change goes in `.claude/hooks/plant8-session-boundary.sh` plus a new PreToolUse `Skill` wiring in `.claude/settings.json`.
- D-02 (②): every commit, documents included, needs `verification-before-completion` from the committing agent. Code paths still also need `test-driven-development`. Change goes in `.claude/hooks/plant8-skill-gate.sh`, `bash` event.
- D-03 (③, scope addition): a new `.planning/quick/*/*-SUMMARY.md` is a session boundary, so a finished /gsd-quick ends the session. This quick task's own SUMMARY will trigger it, which is intended.
- D-04 (④, scope addition, placement decided by the coordinator): one gsd-executor per session. The check lives in `.claude/hooks/plant8-skill-gate.sh`, `agent` event. The flag is set atomically only after all the event's other checks pass, so a dispatch that skill-gate denies does not use up the one allowed dispatch. Any later main-agent dispatch is denied there, including parallel wave dispatch in one message and checkpoint continuations (one unit per session is intended).

Design choice for D-01 (chosen as the simplest robust option):
- **Start signal = the gate log line.** When a gate review starts, the existing skill-gate `record()` writes a line to `.claude/gates/phase-NN.log`: `<skill> <UTC minute> session=<id>`. It does this for both Skill-tool calls and typed slash commands. The session-boundary hook greps all `phase-*.log` files for this session's gate-review lines. That covers both invocation paths without a new flag or a new UserPromptSubmit wiring.
- **Block from the start of the review.** Starting another unit is wrong both during a review and after it, so blocking does not have to wait for an end signal.
- **Announce and remind only at the end.** The end is observed when a commit touching `docs/designs/*review*` lands at or after the start minute. Every Phase 4 gate review committed its report there (for example commits 1dbe84b and 14ef895).
- **Why not announce at the start?** PostToolUse(Skill) fires when the skill loads, not when the review finishes. A reminder at the first Stop could land at a mid-review pause. Both reminders are once-only, so they would be used up before the real end.

Purpose: stop reviews, quick tasks and parallel executors from rolling into the next unit inside the same session. Also make doc commits go through verification.
Output: two edited hooks, one new settings.json entry, two committed regression test scripts under `.claude/hooks/tests/`.
</objective>

<execution_context>
@.claude/gsd-core/workflows/execute-plan.md
@.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/hooks/plant8-session-boundary.sh
@.claude/hooks/plant8-skill-gate.sh
@.claude/settings.json

Facts the executor relies on (verified while planning):
- **How session-boundary.sh runs today.**
  - `post-tool` is wired as PostToolUse with no matcher, so it already receives Skill, Bash and Agent payloads.
  - `pre-tool` is wired only under PreToolUse matcher `Agent`.
  - Both return early for subagents (`agent_id` non-empty).
  - The `stop` hook only runs for the main agent.
- **skill-gate.sh already records gate reviews.** `record()` appends `<name> $(date -u +%Y-%m-%dT%H:%MZ) session=<session>` to `$CLAUDE_PROJECT_DIR/.claude/gates/phase-<NN>.log` for gate skills, including the three plan reviews. `<NN>` comes from `current_phase:` in `.planning/STATE.md`. `record-skill` is PostToolUse(Skill); `record-prompt` is UserPromptSubmit.
- **Historical log lines can have trailing text after the session id.** Example: `session=19c05121 (hook 도입 전 …)`. Anchor the session match as `session=<id>` followed by a space or end of line.
- **The minute-format date check works here.** `TZ=UTC git log -1 --date=format-local:%Y-%m-%dT%H:%MZ --format=%cd -- 'docs/designs/*review*'` returns the same minute format as the gate log, so the two strings compare lexicographically.
- **skill-gate `is_code_path` does not match `.sh` or `.claude/`.** Hook and test edits are therefore not code paths for the hook. CLAUDE.md still requires invoking `test-driven-development` and `verification-before-completion` (Skill tool) before implementing and before committing.

HARD RULES for every task:
- **Test scripts are files, never inline Bash strings.**
  - Tests live as files under `.claude/hooks/tests/` and feed JSON payloads to the hooks on stdin.
  - Every test exports an isolated `TMPDIR` (from `mktemp -d`) and sets `CLAUDE_PROJECT_DIR` to a throwaway git repo inside it.
  - Never type literal commit commands, `state.planned-phase` calls or similar test strings in a Bash tool call. The live hooks would match them. Run tests only with `bash .claude/hooks/tests/<file>.sh`.
- **Never let a test write to the real repo.** Set payload `cwd` to the temp project so skill-gate's staged-file lookup reads the temp repo. Each test file also checks that the real `.claude/gates/*.log` is byte-identical before and after the run.
- **RED first.** Write or extend the test and run it. Confirm the new cases fail for the right reason, then implement and re-run to green.
- **Keep changes surgical.** Keep the existing style (bash, `set -euo pipefail`, jq payload parsing, Korean messages, header comment describing events). Touch no other hook.
- **Do not edit `.planning/`** except this quick task's own SUMMARY.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): gate review started -> next unit blocked at PreToolUse (Skill + Agent), Skill wiring</name>
  <files>.claude/hooks/tests/plant8-session-boundary.test.sh, .claude/hooks/plant8-session-boundary.sh, .claude/settings.json</files>
  <behavior>
    Each case uses fresh session ids and, where noted, a fresh temp project. Unless noted, payloads are main-agent payloads (no agent_id).

    Control (no gate review):
    - Skill gsd-execute-phase -> exit 0.

    D-01, gate review started via the Skill tool:
    - After skill-gate `record-skill` with skill plan-ceo-review for session S, pre-tool in S blocks each of these with exit 2, and stderr contains "게이트 리뷰":
      - Skill gsd-execute-phase, gsd-plan-phase, gsd-quick, gsd-quick-batch, gsd-autonomous
      - Skill "gstack:plan-eng-review" (normalized to plan-eng-review)
      - Agent gsd-planner
      - Agent gsd-executor
    - In S, these still pass with exit 0:
      - Skill plan-ceo-review (re-invoking the same review)
      - Skill gsd-pause-work
      - Skill verification-before-completion
    - Subagent payloads pass: Skill gsd-quick with agent_id set -> exit 0.

    D-01, gate review started via a typed slash command:
    - After skill-gate `record-prompt` with prompt "/plan-eng-review" for session S2, pre-tool in S2 on Skill gsd-execute-phase -> exit 2.

    D-01, no leak between sessions:
    - Session S3 has no gate line. Skill gsd-execute-phase -> exit 0, even though the log has S and S2 lines.

    Existing behavior still holds:
    - Session S4 with no boundary: Agent gsd-executor -> exit 0 twice in a row. session-boundary does not count dispatches; D-04 lives in skill-gate (Task 3).

    Wiring:
    - jq over the real repo `.claude/settings.json` (read-only) finds a PreToolUse entry with matcher "Skill" whose hook command contains `plant8-session-boundary.sh pre-tool`.

    Isolation:
    - The real repo `.claude/gates/*.log` checksum is unchanged by the test run.
  </behavior>
  <action>
    **Step 1. RED: create the test script** `.claude/hooks/tests/plant8-session-boundary.test.sh`.
    - Plain bash, `set -uo pipefail`, no `-e`, so failures accumulate.
    - Resolve HOOKS as the parent of the script directory and REPO as three levels up.
    - Export `TMPDIR=$(mktemp -d)` and add a cleanup trap.
    - Record a checksum of the real `$REPO/.claude/gates/*.log`.
    - `new_project` function: create a fresh dir under TMPDIR and export `CLAUDE_PROJECT_DIR` to it. Inside it:
      - `.planning/STATE.md` containing the line `current_phase: 4`
      - dirs `.planning/phases/04-test/`, `.planning/quick/`, `.claude/gates/`, `docs/designs/`
      - `git init -q`, a local user.name/user.email, and one `--allow-empty` initial commit
    - `hook` helper: `hook <script> <event> <json>` pipes the json to `bash "$HOOKS/<script>" <event>` and captures stdout, stderr and the exit code into globals.
    - jq -nc payload builders:
      - skill payload: session_id, tool_name Skill, tool_input.skill, optional agent_id
      - agent payload: tool_name Agent, tool_input.subagent_type, optional agent_id
      - prompt payload: session_id, prompt
      - plain tool payload: tool_name Read
    - Assertion helpers `expect_rc` and `expect_contains` count failures. The script prints `PASS=<n> FAIL=<m>` and exits 1 if any case failed.
    - Implement every case in `<behavior>`:
      - Start gate reviews through the real skill-gate: `plant8-skill-gate.sh record-skill` and `record-prompt` with the temp `CLAUDE_PROJECT_DIR`. This exercises the real log-format coupling.
    - Make the file executable. Run it and confirm the D-01 and wiring cases fail (RED).

    **Step 2. Change `.claude/hooks/plant8-session-boundary.sh`.**
    - **(a) Header comment.**
      - Add the user decision line (2026-09-23): the end of a gate review is a session boundary.
      - Add to the "플랜 종료로 보는 것" list: a gate review started in this session whose report was committed.
      - Update the pre-tool description: during or after a gate review, block starting another unit.
    - **(b) Variables and helpers.**
      - Add `gate_reviews` = `plan-ceo-review|plan-eng-review|plan-design-review`.
      - Add a `normalize` function identical to the one in plant8-skill-gate.sh: strip a leading slash, strip a `plugin:` prefix, cut at whitespace.
    - **(c) Helper `gate_reviews_started`.**
      - Greps `"$project"/.claude/gates/phase-*.log` for lines that start with one of `gate_reviews`, then one timestamp token, then `session=<this session>` followed by a space or end of line.
      - Prints the unique skill names, one per line.
      - Must not fail under `set -euo pipefail` when there are no logs or no match.
    - **(d) Rewrite the pre-tool branch in this order.**
      1. Keep the subagent early exit.
      2. Read `tool_input.subagent_type` and the normalized `tool_input.skill`.
      3. Per D-01: if `gate_reviews_started` is non-empty, treat these as a new unit: subagent gsd-executor or gsd-planner; skill gsd-plan-phase, gsd-execute-phase, gsd-quick, gsd-quick-batch or gsd-autonomous; or a skill in `gate_reviews` that is not already among the started names (compare with a fixed-string whole-line grep). For a new unit, print this to stderr and exit 2: `차단됨: 이 세션에서 게이트 리뷰(/<started names>)를 시작했다 — 게이트 리뷰 종료가 세션 경계다. <unit>은(는) 새 세션에서 시작한다 — 리뷰 보고서 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress).`
      4. Keep the existing gsd-executor-only SUMMARY / plan-phase check and its message unchanged.
    - Leave the rest of the file unchanged. D-04 is not implemented here; it goes in skill-gate (Task 3).

    **Step 3. Wire it in `.claude/settings.json`.**
    - Add a new PreToolUse entry directly after the existing `"matcher": "Agent"` entry: matcher `Skill`, one command hook `bash "$CLAUDE_PROJECT_DIR"/.claude/hooks/plant8-session-boundary.sh pre-tool` with timeout 10.
    - Use a separate entry and do not widen the Agent matcher. That keeps skill-gate's `agent` event from receiving Skill payloads.
    - Keep the 2-space JSON formatting. Validate with `jq empty`.
    - New hook wiring takes effect in new sessions.

    **Step 4. GREEN.** Re-run the test until `FAIL=0`. Before committing, invoke `verification-before-completion`. Commit with a `chore:` subject in English and a Korean body.
  </action>
  <verify>
    <automated>bash .claude/hooks/tests/plant8-session-boundary.test.sh && bash -n .claude/hooks/plant8-session-boundary.sh && jq empty .claude/settings.json</automated>
  </verify>
  <done>The test script exits 0 with FAIL=0. It covers D-01 block cases for both invocation paths, the no-leak case, the unchanged repeated gsd-executor case, and the Skill wiring. The real gate logs are unchanged. The first test run was observed failing before the implementation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gate review done -> post-tool announce + stop reminder; quick SUMMARY is a session boundary</name>
  <files>.claude/hooks/tests/plant8-session-boundary.test.sh, .claude/hooks/plant8-session-boundary.sh</files>
  <behavior>
    D-01, review not yet done (fresh project, session G):
    - session-start, then record-skill plan-ceo-review.
    - post-tool on a Read payload -> empty stdout.
    - stop -> exit 0 with empty stdout.

    D-01, review done (same project, session G):
    - Commit `docs/designs/x-ceo-review-test.md` in the temp repo.
    - post-tool -> stdout JSON. Its `.hookSpecificOutput.additionalContext` contains "게이트 리뷰 종료" and "/plan-ceo-review".
    - A second post-tool -> empty (announced once).
    - stop -> stdout JSON with decision "block". The reason contains "게이트 리뷰 종료".
    - A second stop -> empty.

    D-01, older report commits don't count:
    - Fresh project. The report commit is back-dated with GIT_COMMITTER_DATE=2000-01-01T00:00:00Z. Then the gate review is recorded.
    - post-tool -> empty. stop -> empty.

    D-03, new quick SUMMARY:
    - Fresh project, session-start for session Q, then create `.planning/quick/260101-abc-x/260101-abc-SUMMARY.md`.
    - post-tool -> additionalContext contains "260101-abc".
    - pre-tool Agent gsd-executor -> exit 2 (existing message: "이미 플랜이 끝났다").
    - stop -> block once.

    D-03, quick SUMMARY that existed before session start:
    - It is in the baseline, so post-tool -> empty.

    D-03, missing quick dir:
    - With `.planning/quick` removed, session-start exits 0 and writes a baseline file.

    Existing behavior still holds:
    - A new `.planning/phases/04-test/04-01-SUMMARY.md` still announces "04-01".
  </behavior>
  <action>
    **Step 1. RED: extend the Task 1 test file.**
    - Add every case in `<behavior>`, each in a fresh `new_project` where noted.
    - Git commits happen inside the temp repo, as subprocesses of the test script.
    - Run the file and confirm the new D-01-done and D-03 cases fail.

    **Step 2. Implement in `.claude/hooks/plant8-session-boundary.sh`.**
    - **(a) Per D-03, `list_summaries`.**
      - Search both `$project/.planning/phases` and `$project/.planning/quick` for `*-SUMMARY.md`.
      - `find` exits non-zero if any start path is missing. Under `pipefail` that would abort session-start, so guard it: the find group gets `2>/dev/null || true` before `| sort`.
      - `new_summaries` stays as is. Quick basenames such as `260923-odg` come out naturally.
    - **(b) Per D-01, helper `gate_review_done`.**
      - Prints the started names, formatted as `/name` and space-separated, only when the review has ended. Otherwise it prints nothing.
      - Start = the earliest timestamp field among this session's gate-review lines. Reuse the same grep as `gate_reviews_started`: extract a shared line-grep helper, or have `gate_reviews_started` build on it, but avoid a second copy of the regex.
      - End = the latest commit touching `docs/designs/*review*`, formatted with `TZ=UTC git -C "$project" log -1 --date=format-local:%Y-%m-%dT%H:%MZ --format=%cd`.
      - Ended means the end value is non-empty and not lexicographically less than the start (same minute counts).
      - Must not fail under `set -e` when git or the log is missing.
    - **(c) post-tool.**
      - After the existing plan-phase `what` line, if `gate_review_done` is non-empty, append to `what`: `게이트 리뷰 종료(<names>) — 남은 정리(보고서·게이트 기록 커밋·푸시)만 끝내고, 다음 게이트 리뷰·계획·실행은 새 세션으로`.
      - The existing md5 dedupe and announcement stay unchanged.
    - **(d) stop.**
      - Treat a non-empty `gate_review_done` as a boundary, alongside `done_plans` and the plan-phase flag.
      - Prefix the reason with `게이트 리뷰 종료: <names> · ` when present. Keep the rest of the reason text and the trailing "이미 1~5를 모두 마쳤다면…" line exactly.
    - **(e) Header comment.** Add the D-03 bullet ("이 세션 시작 뒤 새 `.planning/quick/*/*-SUMMARY.md`가 생김(/gsd-quick 완료)") and the D-01 end signal ("게이트 리뷰 시작 뒤 docs/designs/*review* 보고서 커밋").

    **Step 3. GREEN.** Re-run until `FAIL=0`. Invoke `verification-before-completion`, then commit.

    Note: the current orchestrator session's baseline predates D-03. Once this lands, that session will list the existing quick SUMMARYs once, at its next boundary check. This is intended: the end of this quick task is a session end.
  </action>
  <verify>
    <automated>bash .claude/hooks/tests/plant8-session-boundary.test.sh && bash -n .claude/hooks/plant8-session-boundary.sh</automated>
  </verify>
  <done>The test file exits 0 with FAIL=0, and all Task 1 cases still pass. The gate-review end is announced once and reminded once at stop, and only after the report commit. A new quick SUMMARY behaves like a phase SUMMARY. A missing quick dir does not break session-start.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: every commit requires verification-before-completion (docs too, code also TDD); one gsd-executor per session in the agent event</name>
  <files>.claude/hooks/tests/plant8-skill-gate.test.sh, .claude/hooks/plant8-skill-gate.sh</files>
  <behavior>
    All cases use a temp git repo as `CLAUDE_PROJECT_DIR` and as payload `cwd`, and each case uses a fresh session id. PreToolUse Bash payloads go to the `bash` event.

    Doc commits:
    - Doc-only staged file `docs/note.md`, `git commit -m "docs: x"`, main agent, no skills -> exit 2. stderr contains "verification-before-completion" and does not demand test-driven-development.
    - Same, after `record-skill` verification-before-completion for the main agent -> exit 0.

    Code commits:
    - Staged `app/x.ts`, only verification recorded -> exit 2. stderr contains "test-driven-development".
    - Code commit after both test-driven-development and verification recorded -> exit 0.

    gsd-tools commits:
    - Payload with agent_id "sub1", command `node .claude/gsd-core/bin/gsd-tools.cjs commit "docs: x" --files .planning/x.md`, nothing staged.
    - The main agent recorded verification but sub1 did not -> exit 2 (the check is per agent).
    - After record-skill verification for agent sub1 -> exit 0.

    Non-commit commands:
    - `git status` -> exit 0.

    D-04 setup:
    - A dispatch passes every other `agent` check when the temp project's `.claude/gates/phase-04.log` has plan-ceo-review and plan-eng-review lines, the temp phases dir has no UI-SPEC, and `record-skill` gsd-execute-phase was recorded for the session.
    - Payloads go to the `agent` event: tool_name Agent, tool_input.subagent_type gsd-executor, main agent (no agent_id) unless noted.

    D-04, a denied dispatch does not use up the one allowed dispatch:
    - Fresh session E1 with gate lines but no gsd-execute-phase recorded: dispatch -> exit 2 with the existing "GSD 워크플로 안에서만" message.
    - Then record gsd-execute-phase for E1: dispatch -> exit 0.
    - Second dispatch in E1 -> exit 2. stderr contains "플랜 하나".
    - Fresh session E2 with gsd-execute-phase recorded but gate log missing plan-eng-review: dispatch -> exit 2 (Pre-build gate message). Add the plan-eng-review line: dispatch -> exit 0.

    D-04, scope of the check:
    - gsd-executor with agent_id set, in E1 -> exit 0 (the event already ignores subagents).
    - In E1 after the executor flag is set, Agent gsd-planner with gsd-plan-phase recorded -> exit 0. Only gsd-executor is counted.

    D-04, parallel dispatch in one message:
    - Fresh session E3 with all checks satisfied. Two `agent` calls are launched concurrently in background subshells, and each writes `$?` to a file.
    - Exactly one returns 0 and one returns 2.

    Isolation:
    - The real repo `.claude/gates/*.log` checksum is unchanged.
  </behavior>
  <action>
    **Step 1. RED: create `.claude/hooks/tests/plant8-skill-gate.test.sh`.**
    - Use the same self-contained harness style as the session-boundary test: isolated TMPDIR, temp repo, hook helper, `expect_rc`/`expect_contains`, and `PASS=/FAIL=` exit status. Duplicate the small helpers instead of sourcing a shared file.
    - Stage files in the temp repo with `git -C "$CLAUDE_PROJECT_DIR" add`, and reset staging between cases.
    - Implement the cases in `<behavior>`. Write the D-04 gate lines straight into the temp gate log in skill-gate's line format (`<skill> <UTC minute> session=<id>`).
    - Run it and confirm the doc-commit case (exit 2 expected, 0 observed) and the D-04 second-dispatch and parallel cases fail.

    **Step 2. Implement per D-02 in `.claude/hooks/plant8-skill-gate.sh`, `bash` event.**
    - Keep the commit-detection regex and the files computation unchanged.
    - When the files include a code path, keep the existing combined TDD + verification check and its exact message.
    - Otherwise, require `has_skill "$skills_file" "verification-before-completion"`, and deny with: `커밋 전에 superpowers 스킬을 이 에이전트에서 호출하라: 완료·커밋 전 verification-before-completion (Skill 도구). 문서·계획 커밋도 같다. 호출 뒤 커밋을 다시 시도하라.`
    - Update the header comment line for `bash`: commits only after the verification skill, plus TDD for code. Update the inline comment above the commit block to match.

    **Step 3. Implement per D-04 in the same file, `agent` event.**
    - Add `executor_flag="$state_dir/${session}.executor-dispatched"` next to the other state-file variables.
    - At the very end of the `agent` branch, after the existing `has_skill "$session_skills" "$need"` check, handle gsd-executor only: create `executor_flag` atomically with a subshell that runs `set -o noclobber` and redirects to the flag (O_EXCL). Two parallel hook processes then cannot both succeed.
    - If the flag already exists, call `deny` with: `이 세션에서 이미 gsd-executor를 띄웠다 — 세션 하나에 플랜 하나. 다음 플랜(같은 웨이브의 병렬 플랜, 체크포인트 이어가기 포함)은 새 세션에서 실행한다 — 커밋·푸시 → /gsd-pause-work → 새 세션(/gsd-progress).` The `deny` helper adds the `차단됨(스킬 관문):` prefix.
    - Setting the flag last means any earlier deny exits before it, so a denied dispatch never uses up the one allowed dispatch. The existing `[ "$agent" = "main" ] || exit 0` guard already keeps subagents out.
    - Add a header comment line for `agent`: gsd-executor once per session (the check comes last; a denied dispatch does not count).
    - Touch nothing else.
    - Note: plant8-session-boundary.sh pre-tool runs in parallel on the same Agent call. If it denies a dispatch that skill-gate allowed, the flag is still set. That happens only when the session is already at a boundary, where blocking later dispatches is correct.

    **Step 4. GREEN.** Re-run until `FAIL=0`, and re-run the session-boundary test too, because both hooks share the gate log.

    Consequence: from this commit on, every agent that commits, including this executor and the orchestrator's final docs commit, must invoke `verification-before-completion` in that same agent first. Invoke it, then commit.
  </action>
  <verify>
    <automated>bash .claude/hooks/tests/plant8-skill-gate.test.sh && bash .claude/hooks/tests/plant8-session-boundary.test.sh && bash -n .claude/hooks/plant8-skill-gate.sh</automated>
  </verify>
  <done>Both test files exit 0 with FAIL=0. Doc-only and gsd-tools commits without verification-before-completion from that agent are blocked with the Korean message. Code commits still need both skills. Non-commit commands pass. Only the first main-agent gsd-executor dispatch that passes every other `agent` check is allowed per session, including under parallel dispatch, and a denied dispatch does not use it up.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| tool payload -> hook shell | JSON from the harness carries model-controlled fields (`tool_input.skill`, `subagent_type`, `command`) that are parsed by bash |
| repo files -> hook decision | `.claude/gates/*.log` and git history are inputs the agent itself can modify |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-odg-01 | Tampering | session-boundary skill-name comparison | medium | mitigate | skill names are compared with fixed-string whole-line grep (`grep -Fqx`) and a `case` over literal names, never interpolated into a regex or eval; the session id comes from the harness |
| T-odg-02 | Elevation | gate-review bypass via typed slash command | medium | mitigate | detection reads the gate log that both `record-skill` and `record-prompt` write; the test covers the typed-prompt path |
| T-odg-03 | Elevation | skill-gate `agent` event: parallel gsd-executor dispatch racing the flag | medium | mitigate | the flag is created with O_EXCL (`noclobber`) as the last step of the event; a concurrent-dispatch test asserts exactly one exit 0 |
| T-odg-04 | Tampering | agent deletes TMPDIR state or edits the gate log to escape a block | low | accept | same trust model as the existing hooks; the gate log is committed, so tampering is visible in git history |
| T-odg-05 | Denial of service | false blocks from a hook bug stall work | medium | mitigate | payload-driven regression tests for every new branch; the subagent early exit keeps subagents unaffected |
| T-odg-06 | Information disclosure | tests writing into the real repo or real TMPDIR state | low | mitigate | tests use isolated TMPDIR and CLAUDE_PROJECT_DIR and assert the real gate log checksum is unchanged |
</threat_model>

<verification>
- `bash .claude/hooks/tests/plant8-session-boundary.test.sh` -> FAIL=0
- `bash .claude/hooks/tests/plant8-skill-gate.test.sh` -> FAIL=0
- `bash -n` on both hooks, and `jq empty .claude/settings.json`
- `git diff --stat` touches only the five files in files_modified (plus this task's SUMMARY)
</verification>

<success_criteria>
- D-01: gate review start blocks the next unit (Skill and Agent). The report commit triggers one announcement and one stop reminder.
- D-02: every commit needs verification-before-completion from the committing agent. Code commits also need TDD.
- D-03: a new quick SUMMARY is a session boundary.
- D-04: only one gsd-executor per session (skill-gate `agent` event), including under parallel dispatch. A dispatch denied by skill-gate's other checks does not count.
- All tests were written RED first, are committed, and are green.

Known behavior to report in the SUMMARY:
- D-04: checkpoint continuation executors for the same plan are also blocked and continue in a new session. This is intended: one unit per session.
- D-01: a review that ends without a `docs/designs/*review*` commit still gets the pre-tool blocks, but no announcement or stop reminder.
</success_criteria>

<output>
Create `.planning/quick/260923-odg-hook/260923-odg-SUMMARY.md` when done
</output>
