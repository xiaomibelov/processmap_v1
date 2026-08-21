import React, { useState, useEffect } from "react";
import { useRole } from "../../../contexts/RoleContext";
import { apiRequest } from "../../../lib/apiCore";
import { t } from "../i18n";
import "./Catalog.css";

export function Catalog() {
  const { isTechnologist } = useRole();
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOperation, setSelectedOperation] = useState(null);

  useEffect(() => {
    fetchOperations();
  }, []);

  const fetchOperations = async () => {
    try {
      const r = await apiRequest("/api/operation-catalog");
      const data = r && r.ok ? r.data : null;
      setOperations(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching operations:", error);
      setLoading(false);
    }
  };

  const handleOperationClick = (operation) => {
    setSelectedOperation(operation);
  };

  // L10N: русское имя операции — из поля name_ru каталога (миграция 009),
  // фолбэк на EN name; код и категория — технические значения из API.
  const opName = (op) => String(op?.name_ru || op?.name || op?.code || "");
  const categoryLabel = (cat) => t(`category.${String(cat || "").trim()}`);

  // E2: человеко-читаемые русские формулировки для кодов execution_contract
  const CONTRACT_TERM_RU = {
    storage_available: "хранилище доступно",
    container_exists: "тара существует",
    quantity_valid: "количество корректно",
    container_type_match: "тип тары соответствует",
    container_in_transit: "тара в перемещении",
    containers_ready: "тара подготовлена",
    transfer_path_clear: "путь перетаривания свободен",
    container_compatibility: "совместимость тары",
    transfer_validation: "контроль перетаривания (без пролива)",
    transfer_completed: "перетаривание завершено",
    equipment_available: "оборудование доступно",
    equipment_ready: "оборудование готово",
    temperature_in_range: "температура в норме",
    measurement_valid: "измерение корректно",
  };

  const humanizeContractTerm = (term) =>
    CONTRACT_TERM_RU[term] || String(term).replaceAll("_", " ");

  const renderExecutionContract = (contract) => {
    if (!contract) return null;

    return (
      <div className="execution-contract">
        <h4>{t("catalog.contract")}</h4>
        <div className="contract-section">
          <h5>{t("catalog.preconditions")}</h5>
          <ul>
            {contract.preconditions?.map((condition, index) => (
              <li key={index}>{humanizeContractTerm(condition)}</li>
            ))}
          </ul>
        </div>
        <div className="contract-section">
          <h5>{t("catalog.postconditions")}</h5>
          <ul>
            {contract.postconditions?.map((condition, index) => (
              <li key={index}>{humanizeContractTerm(condition)}</li>
            ))}
          </ul>
        </div>
        <div className="contract-section">
          <h5>{t("catalog.checks")}</h5>
          <ul>
            {contract.checks?.map((check, index) => (
              <li key={index}>{humanizeContractTerm(check)}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">{t("catalog.loading")}</div>;
  }

  return (
    <div className="catalog">
      <h2>{t("catalog.title")}</h2>
      <p>{t("catalog.subtitle")}</p>

      {isTechnologist && (
        <div className="read-only-notice">
          <p>{t("catalog.readOnly")}</p>
        </div>
      )}

      <div className="catalog-content">
        <div className="operations-list">
          <h3>{t("catalog.available")}</h3>
          <div className="operations-grid">
            {operations.map((operation) => (
              <div
                key={operation.code}
                className="operation-card"
                data-testid={`catalog-op-${operation.code}`}
                onClick={() => handleOperationClick(operation)}
              >
                <h4>{opName(operation)}</h4>
                <p className="operation-code">{operation.code}</p>
                <p className="operation-category">{categoryLabel(operation.category)}</p>
              </div>
            ))}
          </div>
        </div>

        {selectedOperation && (
          <div className="operation-details" data-testid="catalog-details">
            <h3>{t("catalog.details")}</h3>
            <div className="operation-info">
              <h4>{opName(selectedOperation)}</h4>
              <p><strong>{t("catalog.code")}</strong> {selectedOperation.code}</p>
              <p><strong>{t("catalog.category")}</strong> {categoryLabel(selectedOperation.category)}</p>

              <div className="parameter-schema">
                <h5>{t("catalog.parameters")}</h5>
                <pre>{JSON.stringify(selectedOperation.parameter_schema, null, 2)}</pre>
              </div>

              <div className="allowed-outputs">
                <h5>{t("catalog.allowedOutputs")}</h5>
                <ul>
                  {selectedOperation.allowed_outputs?.map((output, index) => (
                    <li key={index} className={output.type === "success" ? "output-success" : "output-error"}>
                      {output.name} ({output.type === "success" ? t("catalog.outputSuccess") : t("catalog.outputError")})
                    </li>
                  ))}
                </ul>
              </div>

              {renderExecutionContract(selectedOperation.execution_contract)}

              <div className="resource-requirements">
                <h5>{t("catalog.resources")}</h5>
                <pre>{JSON.stringify(selectedOperation.resource_requirements, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Catalog;
