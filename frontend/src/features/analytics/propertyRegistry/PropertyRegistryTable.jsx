import { formatPropertyType, formatDate, propertyHasRequired, getReferenceSourceBadge } from "./propertyRegistryUtils";

function RequiredAsterisk() {
  return <span className="propertyRegistryRequired" title="Обязательное">*</span>;
}

function UnusedBadge() {
  return <span className="propertyRegistryUnusedBadge">Не используется</span>;
}

function ModifiedBadge({ updatedAt }) {
  return <span className="propertyRegistryModifiedBadge" title={`Обновлено: ${formatDate(updatedAt)}`}>Изменено</span>;
}

function SystemLock() {
  return <span className="propertyRegistrySystemLock" title="Системное свойство">🔒</span>;
}

export default function PropertyRegistryTable({ properties, sort, onSort }) {
  const headers = [
    { key: "display_name", label: "Название" },
    { key: "id", label: "ID" },
    { key: "property_type", label: "Тип" },
    { key: "applicable_to", label: "Применимо к" },
    { key: "category", label: "Категория" },
    { key: "source", label: "Источник" },
    { key: "editable", label: "Редактируемо" },
    { key: "version", label: "Версия" },
    { key: "updated_at", label: "Обновлено" },
    { key: "usage_count", label: "Использований" },
  ];

  return (
    <table className="propertyRegistryTable">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h.key} onClick={() => onSort(h.key)} className={sort.key === h.key ? `sorted-${sort.dir}` : ""}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {properties.map((row) => {
          const isUnused = (row.usage_count || 0) === 0;
          const isSystem = row.source === "system";
          const refBadge = getReferenceSourceBadge(row.value_range);
          return (
            <tr key={row.id} className={[isUnused && "propertyRegistryRow--unused", isSystem && "propertyRegistryRow--system"].filter(Boolean).join(" ")}>
              <td>
                {row.display_name}
                {propertyHasRequired(row.validation_rules) && <RequiredAsterisk />}
                {row.version > 1 && <ModifiedBadge updatedAt={row.updated_at} />}
              </td>
              <td>{row.id}</td>
              <td>
                {formatPropertyType(row.property_type)}
                {refBadge && <div className="propertyRegistryRefBadge">{refBadge}</div>}
              </td>
              <td>{(row.applicable_to || []).join(", ")}</td>
              <td>{row.category}</td>
              <td>{row.source} {isSystem && <SystemLock />}</td>
              <td>{row.editable ? "Да" : "Нет"}</td>
              <td>{row.version}</td>
              <td>{formatDate(row.updated_at)}</td>
              <td>
                <span className="propertyRegistryUsageCount">{row.usage_count || 0}</span>
                {isUnused && <UnusedBadge />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
