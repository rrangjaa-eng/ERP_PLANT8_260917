import { Fragment, type ReactNode } from "react";
import styles from "./KvList.module.css";

// SYSTEM.md §6-8 B① · §7-8 「시트 상세 = 라벨·값 목록(dl)」과 같은 골격. 실물:
// docs/design/system/sheet-modal.html:102-106 .kv 블록. dt/dd가 dl의 직계라
// axe definition-list 규칙에 그대로 맞는다.
export type KvItem = {
  label: string;
  value: ReactNode;
};

export type KvListProps = {
  items: KvItem[];
};

export function KvList({ items }: KvListProps) {
  return (
    <dl className={styles.kv}>
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
