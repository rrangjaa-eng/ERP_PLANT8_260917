export type ItemDto = { id: string; label: string };

export function getItemDto(): ItemDto {
  return { id: "1", label: "x" };
}
