import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { NOTIFICATION_RULES_MENU, NOTIFICATION_RULE_INFO_ITEM } from "@/domain/notify/rule-admin";

// 권한 없는 계급은 404다. 로딩 뼈대(loading.tsx)가 있으면 page.tsx의 notFound()는 뼈대를 먼저 흘려보낸 뒤라 상태 코드가 200이 되므로,
// 뼈대 바깥인 이 레이아웃이 같은 판정을 먼저 한다. 판정의 정본은 도메인이고 page.tsx가 다시 본다(레이아웃은 같은 경로 안 이동에서 다시 돌지 않는다).
export default async function NotificationRulesLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { viewer } = session;
  if (!(await can(viewer, NOTIFICATION_RULES_MENU, "view")) || !(await visible(viewer, NOTIFICATION_RULE_INFO_ITEM))) notFound();
  return children;
}
