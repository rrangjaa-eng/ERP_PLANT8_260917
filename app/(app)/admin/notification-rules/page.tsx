import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listRuleRows, NOTIFICATION_RULES_MENU, NOTIFICATION_RULE_INFO_ITEM } from "@/domain/notify/rule-admin";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { RulesTable } from "./rules-client";

// D-18과 같은 결: 캐시 없음. 규칙 이름 · 순서는 등록부(CONDITION_KINDS)가 정한다 — 이 화면에 종류를 적지 않는다(N1).
export const dynamic = "force-dynamic";

export default async function NotificationRulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { viewer } = session;
  if (!(await can(viewer, NOTIFICATION_RULES_MENU, "view")) || !(await visible(viewer, NOTIFICATION_RULE_INFO_ITEM))) notFound();

  const [rows, canWrite] = await Promise.all([listRuleRows(viewer), can(viewer, NOTIFICATION_RULES_MENU, "write")]);

  return (
    <ListScreen title="알림 규칙">
      <RulesTable rows={rows} canWrite={canWrite} />
    </ListScreen>
  );
}
