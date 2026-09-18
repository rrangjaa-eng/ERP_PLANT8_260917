import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Viewer } from "@/domain/viewer";

export async function pingDatabase(viewer: Viewer): Promise<void> {
  void viewer;
  await db.execute(sql`select 1`);
}
