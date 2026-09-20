export type ItemRow = { id: string; label: string };

export async function findItemRow(): Promise<ItemRow> {
  return { id: "1", label: "x" };
}
