import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { env } from "@/lib/env";
import { isDevToolsEnabled } from "@/lib/dev-tools";
import { Button, type ButtonVariant } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import styles from "./components.module.css";

// 04.6-06 — 컴포넌트 모음 뼈대(개발·스테이징 전용). 나머지 구역은 04.6-13이 채운다. 메뉴 레지스트리에 없다.
export const dynamic = "force-dynamic";

const TIERS: ReadonlyArray<{ variant: ButtonVariant; label: string }> = [
  { variant: "primary", label: "1차" },
  { variant: "secondary", label: "2차" },
  { variant: "tertiary", label: "3차" },
];

export default async function ComponentsPage() {
  await requireSession();
  if (!isDevToolsEnabled(env.APP_ENV)) notFound();

  return (
    <DetailScreen
      title="컴포넌트 모음"
      actions={{
        secondary: <Button variant="secondary">표본 2차</Button>,
        primary: <Button variant="primary">표본 1차</Button>,
      }}
    >
      {TIERS.map(({ variant, label }) => (
        <DetailScreen.Section key={variant} title={`${label} 버튼`}>
          <div className={styles.samples}>
            <Button variant={variant}>{`${label} 기본`}</Button>
            <Button variant={variant} disabled disabledReason="권한 없음 · 담당에게 요청">
              {`${label} 비활성`}
            </Button>
            <Button variant={variant} pending>
              {`${label} 진행 중`}
            </Button>
          </div>
        </DetailScreen.Section>
      ))}
    </DetailScreen>
  );
}
