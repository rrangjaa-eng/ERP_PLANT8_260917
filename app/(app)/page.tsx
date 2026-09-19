import { redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";

export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/account" : "/login");
}
