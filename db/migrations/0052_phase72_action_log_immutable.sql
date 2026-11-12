-- 07.2-19(PU2 · D-7216) — 불변 트리거 action_log_immutable()의 「끌 수 없는 종류」 목록에 document_reopen을 더한다.
-- 완료 되돌리기 사유는 결재선 끝 줄의 유일한 원천이고 프로젝트 행에 흔적 칸이 없다 — 정리(OPS-05)로도 지우지 않는다.
-- 목록은 domain/action-log/prune-scope.ts UNPRUNABLE_ACTION_TYPES와 같은 일곱이다. 가드는
-- test/integration/schema/action-log-immutable.test.ts(표류 가드 — 가장 나중의 *_phase*_action_log_immutable.sql을 읽는다)다.
-- 본문은 0046과 같고 NOT IN 목록만 하나 늘었다. CREATE OR REPLACE라 트리거 셋(action_log_no_delete · action_log_no_truncate ·
-- action_log_update_guard)은 그대로 이 함수를 부른다. 함수 교체는 action_log 데이터를 훑지 않는다 — 잠금 대기는 lock_timeout = 1s로 묶는다.
-- rollback-floor를 두지 않는다 — 옛 리비전은 document_reopen을 쓰지 않는다. 옛 리비전의 정리가 이미 쌓인 document_reopen 행까지 고르면
-- 트리거가 그 정리 문장을 통째로 거부한다(P0001 · 아무 행도 바뀌지 않음) — 데이터는 지켜지고 정리 실패로만 드러난다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION action_log_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.pruned_at IS NULL
    AND NEW.pruned_at IS NOT NULL
    AND NEW.pruned_by IS NOT NULL
    AND (to_jsonb(NEW) - 'pruned_at' - 'pruned_by') = (to_jsonb(OLD) - 'pruned_at' - 'pruned_by')
    AND NEW.action_type NOT IN ('action_log_prune', 'cert_view', 'mask_reveal', 'cert_correct', 'cert_prize_value', 'cert_purge', 'document_reopen')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'action_log is append-only';
END;
$$;
