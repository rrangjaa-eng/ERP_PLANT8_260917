import type { ReactNode } from "react";
import type { PrintCompany } from "@/domain/print/company";
import { companyInfoLine, companyWordmark } from "./company-line";
import styles from "./print-frame.module.css";

// 07.4-01 D-7405 · D-7406: 머리 — A줄(워드마크 자리 + 출력 일시), B줄(회사 정보, 빈 항목은 이름째 빠지고 전부 비면 줄 자체가 없다).
// logo가 있으면 그 자리에 들어가고 B줄 맨 앞에 회사명이 붙는다(07.4는 logo를 넘기지 않는다).
// 07.2-10: printedAt이 null이면 출력 일시 요소를 그리지 않고, infoLabels가 false면 B줄이 라벨 없이 값만이다(고객 견적서 — 기본은 지금과 같다).
export function PrintHeader({ company, printedAt, logo, infoLabels = true }: { company: PrintCompany; printedAt: string | null; logo?: ReactNode; infoLabels?: boolean }) {
  const info = companyInfoLine(company, { labels: infoLabels });
  const name = company.name.trim();
  const line = logo && name !== "" ? [name, info].filter((part) => part !== null).join(" · ") : info;
  return (
    <header>
      <div className={styles.top}>
        {logo ?? <span className={styles.mark}>{companyWordmark(company.name)}</span>}
        {printedAt === null ? null : <span className={styles.printedAt}>출력 {printedAt}</span>}
      </div>
      {line ? <p className={styles.company}>{line}</p> : null}
    </header>
  );
}
