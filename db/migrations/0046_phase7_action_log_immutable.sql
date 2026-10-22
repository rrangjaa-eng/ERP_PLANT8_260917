-- 07-13(07 PR-LOG · SCOPE R6 · 260907 대조 D7 「불변 트리거 = 예」) — 행동 로그 action_log를 DB 수준에서 지울 수도 고칠 수도 없게 한다.
-- 「물리 삭제 호출 0건」(03-01)은 코드 규약이라 psql · 새 코드 · 실수로 깨진다 — 감사 근거가 되려면 DB가 막아야 한다.
-- 함수 action_log_immutable() 하나 + 트리거 셋: DELETE(행) · TRUNCATE(문장 — TRUNCATE ... CASCADE로 끌려 들어와도 같다) 거부,
-- UPDATE(행)는 「정리 안 됨 → 정리됨」 한 방향만 허용한다. 거부는 RAISE EXCEPTION 기본 SQLSTATE P0001 · 메시지 고정 'action_log is append-only'.
-- 260907 audit_log_immutable()은 UPDATE를 통째로 막았다 — 우리는 OPS-05 「정리」(repositories/action-log.ts markActionLogRowsPruned)가
-- 있어 정리 표시(pruned_at · pruned_by)를 NULL → 값으로 한 번 찍는 UPDATE만 통과시킨다. 이미 정리된 행의 정리 취소 · 정리한 사람 바꾸기 ·
-- 다시 정리와 정리한 사람 없는 정리는 거부한다(누가 · 언제 정리했는지가 사후에 바뀌지 않는다). 정리 두 칸을 뺀 행 전체(to_jsonb) 비교라
-- 칸 목록을 적지 않는다 — 앞으로 action_log에 더해질 칸도 자동으로 잠긴다.
-- 끌 수 없는 행동 종류는 정리 표시도 거부한다(R4) — 목록은 domain/action-log/prune-scope.ts UNPRUNABLE_ACTION_TYPES와 같은 여섯이다.
-- 그 목록이 바뀌면 새 마이그레이션이 필요하다 — 가드는 test/integration/schema/action-log-immutable.test.ts(표류 가드)다.
-- INSERT는 막지도 늦추지도 않는다(행동 기록은 각 행동과 같은 트랜잭션 — INSERT 경로에 트리거를 두지 않는다).
-- 우회는 시험 setup의 replica 트랜잭션(test/integration/setup.ts truncateAll · test/support/action-log-backdate.ts)뿐 — 운영 코드에는 없다.
-- 트리거 생성은 action_log에 SHARE ROW EXCLUSIVE 잠금을 짧게 잡는다(데이터 훑기 없음) — 대기는 lock_timeout = 1s로 묶는다.
-- rollback-floor를 두지 않는다 — 옛 리비전은 action_log에 INSERT와 정리 UPDATE만 하고, 둘 다 트리거를 통과한다.
SET LOCAL lock_timeout = '1s';
--> statement-breakpoint
CREATE FUNCTION action_log_immutable() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.pruned_at IS NULL
    AND NEW.pruned_at IS NOT NULL
    AND NEW.pruned_by IS NOT NULL
    AND (to_jsonb(NEW) - 'pruned_at' - 'pruned_by') = (to_jsonb(OLD) - 'pruned_at' - 'pruned_by')
    AND NEW.action_type NOT IN ('action_log_prune', 'cert_view', 'mask_reveal', 'cert_correct', 'cert_prize_value', 'cert_purge')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'action_log is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER action_log_no_delete BEFORE DELETE ON action_log FOR EACH ROW EXECUTE FUNCTION action_log_immutable();
--> statement-breakpoint
CREATE TRIGGER action_log_no_truncate BEFORE TRUNCATE ON action_log FOR EACH STATEMENT EXECUTE FUNCTION action_log_immutable();
--> statement-breakpoint
CREATE TRIGGER action_log_update_guard BEFORE UPDATE ON action_log FOR EACH ROW EXECUTE FUNCTION action_log_immutable();
