import React, { useState, useEffect } from "react";
import { useRole } from "../../../contexts/RoleContext";
import { apiRequest } from "../../../lib/apiCore";
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
        <h4>Контракт выполнения</h4>
        <div className="contract-section">
          <h5>Предусловия:</h5>
          <ul>
            {contract.preconditions?.map((condition, index) => (
              <li key={index}>{humanizeContractTerm(condition)}</li>
            ))}
          </ul>
        </div>
        <div className="contract-section">
          <h5>Постусловия:</h5>
          <ul>
            {contract.postconditions?.map((condition, index) => (
              <li key={index}>{humanizeContractTerm(condition)}</li>
            ))}
          </ul>
        </div>
        <div className="contract-section">
          <h5>Включённые проверки:</h5>
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
    return <div className="loading">Loading operations...</div>;
  }

  return (
    <div className="catalog">
      <h2>Operation Catalog</h2>
      <p>Browse available operations for process templates.</p>
      
      {isTechnologist && (
        <div className="read-only-notice">
          <p>You have read-only access to the operation catalog.</p>
        </div>
      )}

      <div className="catalog-content">
        <div className="operations-list">
          <h3>Available Operations</h3>
          <div className="operations-grid">
            {operations.map((operation) => (
              <div
                key={operation.code}
                className="operation-card"
                onClick={() => handleOperationClick(operation)}
              >
                <h4>{operation.name}</h4>
                <p className="operation-code">{operation.code}</p>
                <p className="operation-category">{operation.category}</p>
              </div>
            ))}
          </div>
        </div>

        {selectedOperation && (
          <div className="operation-details">
            <h3>Operation Details</h3>
            <div className="operation-info">
              <h4>{selectedOperation.name}</h4>
              <p><strong>Code:</strong> {selectedOperation.code}</p>
              <p><strong>Category:</strong> {selectedOperation.category}</p>
              
              <div className="parameter-schema">
                <h5>Parameters:</h5>
                <pre>{JSON.stringify(selectedOperation.parameter_schema, null, 2)}</pre>
              </div>
              
              <div className="allowed-outputs">
                <h5>Allowed Outputs:</h5>
                <ul>
                  {selectedOperation.allowed_outputs?.map((output, index) => (
                    <li key={index} className={output.type === "success" ? "output-success" : "output-error"}>
                      {output.name} ({output.type})
                    </li>
                  ))}
                </ul>
              </div>
              
              {renderExecutionContract(selectedOperation.execution_contract)}
              
              <div className="resource-requirements">
                <h5>Resource Requirements:</h5>
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
