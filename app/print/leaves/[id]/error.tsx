"use client";

import { PrintError } from "@/app/print/_frame/PrintError";

export default function LeavePrintError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PrintError error={error} retry={retry} />;
}
