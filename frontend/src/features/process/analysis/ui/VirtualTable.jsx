import React, { useRef } from "react";
import { FixedSizeList as List } from "react-window";
import styles from "./VirtualTable.module.css";

function VirtualTableRow({ index, style, data }) {
  const row = data.rows[index];
  return (
    <div style={style} className={styles.row} role="row" aria-rowindex={index + 2}>
      {data.renderRow(row, index)}
    </div>
  );
}

export const VirtualTable = React.memo(function VirtualTable({
  rows = [],
  rowHeight = 48,
  renderRow,
  headerHeight = 40,
  renderHeader,
  emptyState,
  height = 320,
  className = "",
  "data-testid": dataTestId,
}) {
  const listRef = useRef(null);

  if (!rows.length && emptyState) {
    return (
      <div
        className={`${styles.container} ${className}`}
        data-testid={dataTestId || "virtual-table-empty"}
      >
        {emptyState}
      </div>
    );
  }

  const itemData = { rows, renderRow };

  return (
    <div
      className={`${styles.container} ${className}`}
      data-testid={dataTestId || "virtual-table"}
      role="table"
    >
      {renderHeader ? (
        <div className={styles.header} role="rowgroup" style={{ height: headerHeight }}>
          {renderHeader()}
        </div>
      ) : null}
      <div className={styles.body} role="rowgroup">
        <List
          ref={listRef}
          height={height}
          itemCount={rows.length}
          itemSize={rowHeight}
          itemData={itemData}
          overscanCount={5}
          className={styles.list}
        >
          {VirtualTableRow}
        </List>
      </div>
    </div>
  );
});
