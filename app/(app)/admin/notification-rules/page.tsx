import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listRuleRoles, listRuleRows, NOTIFICATION_RULES_MENU, NOTIFICATION_RULE_INFO_ITEM } from "@/domain/notify/rule-admin";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { RulePanel, RulesTable, SavedToast } from "./rules-client";

// D-18과 같은 결: 캐시 없음. 규칙 이름 · 순서는 등록부(CONDITION_KINDS)가 정한다 — 이 화면에 종류를 적지 않는다(N1).
export const dynamic = "force-dynamic";

export default async function NotificationRulesPage({ searchParams }: { searchParams: Promise<{ editId?: string; saved?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { viewer } = session;
  if (!(await can(viewer, NOTIFICATION_RULES_MENU, "view")) || !(await visible(viewer, NOTIFICATION_RULE_INFO_ITEM))) notFound();

  const { editId, saved } = await searchParams;
  const [rows, canWrite] = await Promise.all([listRuleRows(viewer), can(viewer, NOTIFICATION_RULES_MENU, "write")]);
  // 등록부에 없는 editId · saved는 조용히 무시한다 — 없는 대상을 오류로 다루지 않는다.
  const editing = canWrite && editId ? (rows.find((row) => row.kind === editId) ?? null) : null;
  const savedRow = saved ? (rows.find((row) => row.kind === saved) ?? null) : null;
  const roles = editing ? await listRuleRoles(viewer) : [];

  return (
    <ListScreen title="알림 규칙" panel={editing ? <RulePanel key={editing.kind} row={editing} roles={roles} /> : null}>
      <RulesTable rows={rows} canWrite={canWrite} />
      {savedRow ? <SavedToast label={savedRow.label} /> : null}
    </ListScreen>
  );
}
