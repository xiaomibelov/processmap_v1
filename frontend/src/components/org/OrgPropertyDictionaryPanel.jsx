import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiDeleteOrgPropertyDictionaryDefinition,
  apiDeleteOrgPropertyDictionaryValue,
  apiGetOrgPropertyDictionaryBundle,
  apiListOrgPropertyDictionaryOperations,
  apiPatchOrgPropertyDictionaryValue,
  apiUpsertOrgPropertyDictionaryDefinition,
  apiUpsertOrgPropertyDictionaryOperation,
  apiUpsertOrgPropertyDictionaryValue,
} from "../../lib/api";

function toText(value) {
  return String(value || "").trim();
}

function toSortOrder(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function emptyOperationDraft(operationKey = "") {
  return {
    operationKey: toText(operationKey),
    operationLabel: "",
    sortOrder: 0,
    isActive: true,
  };
}

function emptyPropertyDraft() {
  return {
    propertyKey: "",
    propertyLabel: "",
    inputMode: "autocomplete",
    allowCustomValue: true,
    required: false,
    sortOrder: 0,
    isActive: true,
  };
}

function emptyValueDraft() {
  return { optionValue: "", sortOrder: 0 };
}

function normalizePropertyDraft(property = {}) {
  return {
    propertyKey: toText(property.propertyKey || property.property_key),
    propertyLabel: String(property.propertyLabel || property.property_label || property.propertyKey || property.property_key || ""),
    inputMode: toText(property.inputMode || property.input_mode) === "free_text" ? "free_text" : "autocomplete",
    allowCustomValue: property.allowCustomValue ?? property.allow_custom_value ?? true,
    required: property.required ?? false,
    sortOrder: toSortOrder(property.sortOrder ?? property.sort_order),
    isActive: property.isActive ?? property.is_active ?? true,
  };
}

function operationDisplayParts(operation = {}) {
  const key = toText(operation?.operation_key || operation?.operationKey);
  const label = String(operation?.operation_label || operation?.operationLabel || key || "").trim();
  return { key, label: label || key || "Без названия" };
}

function propertyDisplayParts(property = {}) {
  const key = toText(property?.propertyKey || property?.property_key);
  const label = String(property?.propertyLabel || property?.property_label || key || "").trim();
  return { key, label: label || key || "Без названия" };
}

export default function OrgPropertyDictionaryPanel({
  activeOrgId = "",
  initialOperationKey = "",
  onDictionaryChanged,
}) {
  const [operations, setOperations] = useState([]);
  const [selectedOperationKey, setSelectedOperationKey] = useState("");
  const [selectedPropertyKey, setSelectedPropertyKey] = useState("");
  const [bundle, setBundle] = useState(null);
  const [propertyDrafts, setPropertyDrafts] = useState({});
  const [newOperationDraft, setNewOperationDraft] = useState(() => emptyOperationDraft());
  const [newPropertyDraft, setNewPropertyDraft] = useState(() => emptyPropertyDraft());
  const [newValueDrafts, setNewValueDrafts] = useState({});
  const [activeStage, setActiveStage] = useState("operation");
  const [propertyEditorMode, setPropertyEditorMode] = useState("edit");
  const [busy, setBusy] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const oid = toText(activeOrgId);
  const properties = Array.isArray(bundle?.properties) ? bundle.properties : [];

  const loadOperations = useCallback(async (preferredOperationKey = "") => {
    const nextOrgId = toText(activeOrgId);
    if (!nextOrgId) {
      setOperations([]);
      setSelectedOperationKey("");
      setSelectedPropertyKey("");
      setBundle(null);
      return;
    }
    setBusy(true);
    setError("");
    const result = await apiListOrgPropertyDictionaryOperations(nextOrgId, { includeInactive: true });
    if (!result.ok) {
      setOperations([]);
      setError(toText(result.error || "Не удалось загрузить операции справочника."));
      setBusy(false);
      return;
    }
    const items = Array.isArray(result.items) ? result.items : [];
    setOperations(items);
    setSelectedOperationKey((prev) => {
      const preferred = toText(preferredOperationKey) || toText(initialOperationKey) || toText(prev);
      if (preferred) return preferred;
      return toText(items[0]?.operation_key || items[0]?.operationKey);
    });
    setBusy(false);
  }, [activeOrgId, initialOperationKey]);

  const loadBundle = useCallback(async (operationKeyRaw) => {
    const operationKey = toText(operationKeyRaw);
    const nextOrgId = toText(activeOrgId);
    if (!nextOrgId || !operationKey) {
      setBundle(null);
      setPropertyDrafts({});
      setSelectedPropertyKey("");
      return;
    }
    setBundleBusy(true);
    setError("");
    const result = await apiGetOrgPropertyDictionaryBundle(nextOrgId, operationKey, { includeInactive: true });
    if (!result.ok) {
      setBundle(null);
      setPropertyDrafts({});
      setSelectedPropertyKey("");
      setError(toText(result.error || "Не удалось загрузить свойства операции."));
      setBundleBusy(false);
      return;
    }
    const nextBundle = result.bundle || null;
    setBundle(nextBundle);
    const nextDrafts = {};
    (Array.isArray(nextBundle?.properties) ? nextBundle.properties : []).forEach((property) => {
      const propertyKey = toText(property?.propertyKey || property?.property_key);
      if (!propertyKey) return;
      nextDrafts[propertyKey] = normalizePropertyDraft(property);
    });
    setPropertyDrafts(nextDrafts);
    setBundleBusy(false);
  }, [activeOrgId]);

  useEffect(() => {
    void loadOperations(initialOperationKey);
  }, [initialOperationKey, loadOperations, oid]);

  useEffect(() => {
    const operation = operations.find((item) => toText(item?.operation_key || item?.operationKey) === toText(selectedOperationKey)) || null;
    if (!operation && !toText(selectedOperationKey)) {
      setNewOperationDraft(emptyOperationDraft());
      return;
    }
    setNewOperationDraft({
      operationKey: toText(operation?.operation_key || operation?.operationKey || selectedOperationKey),
      operationLabel: String(operation?.operation_label || operation?.operationLabel || selectedOperationKey || ""),
      sortOrder: toSortOrder(operation?.sort_order ?? operation?.sortOrder),
      isActive: operation?.is_active ?? operation?.isActive ?? true,
    });
  }, [operations, selectedOperationKey]);

  useEffect(() => {
    void loadBundle(selectedOperationKey);
  }, [selectedOperationKey, loadBundle]);

  useEffect(() => {
    const currentProperties = Array.isArray(bundle?.properties) ? bundle.properties : [];
    if (!currentProperties.length) {
      setSelectedPropertyKey("");
      return;
    }
    setSelectedPropertyKey((prev) => {
      const exists = currentProperties.some((item) => toText(item?.propertyKey || item?.property_key) === toText(prev));
      if (exists) return prev;
      return toText(currentProperties[0]?.propertyKey || currentProperties[0]?.property_key);
    });
  }, [bundle]);

  useEffect(() => {
    if (toText(selectedOperationKey)) return;
    if (activeStage !== "operation") setActiveStage("operation");
  }, [activeStage, selectedOperationKey]);

  useEffect(() => {
    if (toText(selectedPropertyKey)) return;
    if (activeStage === "value") setActiveStage("property");
  }, [activeStage, selectedPropertyKey]);

  useEffect(() => {
    if (!toText(selectedPropertyKey)) {
      setPropertyEditorMode("new");
      return;
    }
    setPropertyEditorMode("edit");
  }, [selectedPropertyKey]);

  const selectedOperation = useMemo(
    () => operations.find((item) => toText(item?.operation_key || item?.operationKey) === toText(selectedOperationKey)) || null,
    [operations, selectedOperationKey],
  );
  const selectedProperty = useMemo(
    () => properties.find((item) => toText(item?.propertyKey || item?.property_key) === toText(selectedPropertyKey)) || null,
    [properties, selectedPropertyKey],
  );
  const selectedPropertyDraft = useMemo(() => {
    const key = toText(selectedPropertyKey);
    if (!key) return null;
    return propertyDrafts[key] || normalizePropertyDraft(selectedProperty || {});
  }, [propertyDrafts, selectedProperty, selectedPropertyKey]);
  const selectedPropertyValues = Array.isArray(selectedProperty?.options) ? selectedProperty.options : [];
  const selectedValueDraft = newValueDrafts[toText(selectedPropertyKey)] || emptyValueDraft();
  const effectivePropertyEditorMode = propertyEditorMode === "new" ? "new" : "edit";

  const operationButtons = useMemo(
    () => operations.map((item) => {
      const parts = operationDisplayParts(item);
      return {
        key: parts.key,
        label: parts.label,
        isActive: item?.is_active ?? item?.isActive ?? true,
      };
    }),
    [operations],
  );

  async function refreshAfterMutation(operationKey) {
    const normalizedOperationKey = toText(operationKey || selectedOperationKey);
    await loadOperations(normalizedOperationKey);
    if (normalizedOperationKey) {
      await loadBundle(normalizedOperationKey);
    }
    onDictionaryChanged?.();
  }

  async function handleSaveOperation(event) {
    event.preventDefault();
    if (!oid) return;
    const payload = {
      operation_key: toText(newOperationDraft.operationKey),
      operation_label: toText(newOperationDraft.operationLabel),
      sort_order: toSortOrder(newOperationDraft.sortOrder),
      is_active: !!newOperationDraft.isActive,
    };
    if (!payload.operation_key) {
      setError("Укажите ключ операции.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiUpsertOrgPropertyDictionaryOperation(oid, payload);
    if (!result.ok) {
      setError(toText(result.error || "Не удалось сохранить операцию."));
      setBusy(false);
      return;
    }
    setSelectedOperationKey(payload.operation_key);
    setInfo(`Операция ${payload.operation_key} сохранена.`);
    setBusy(false);
    await refreshAfterMutation(payload.operation_key);
  }

  async function handleSaveProperty(event) {
    event.preventDefault();
    if (!oid || !toText(selectedOperationKey)) return;
    const payload = {
      property_key: toText(newPropertyDraft.propertyKey),
      property_label: toText(newPropertyDraft.propertyLabel),
      input_mode: toText(newPropertyDraft.inputMode) === "free_text" ? "free_text" : "autocomplete",
      allow_custom_value: !!newPropertyDraft.allowCustomValue,
      required: !!newPropertyDraft.required,
      sort_order: toSortOrder(newPropertyDraft.sortOrder),
      is_active: !!newPropertyDraft.isActive,
    };
    if (!payload.property_key) {
      setError("Укажите ключ свойства.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiUpsertOrgPropertyDictionaryDefinition(oid, selectedOperationKey, payload);
    if (!result.ok) {
      setError(toText(result.error || "Не удалось сохранить свойство операции."));
      setBusy(false);
      return;
    }
    setNewPropertyDraft(emptyPropertyDraft());
    setSelectedPropertyKey(payload.property_key);
    setInfo(`Свойство ${payload.property_key} сохранено.`);
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  async function handleSaveExistingProperty(propertyKey) {
    const normalizedPropertyKey = toText(propertyKey);
    const draft = propertyDrafts[normalizedPropertyKey];
    if (!oid || !toText(selectedOperationKey) || !draft) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiUpsertOrgPropertyDictionaryDefinition(oid, selectedOperationKey, {
      property_key: draft.propertyKey,
      property_label: draft.propertyLabel,
      input_mode: draft.inputMode,
      allow_custom_value: draft.allowCustomValue,
      required: draft.required,
      sort_order: draft.sortOrder,
      is_active: draft.isActive,
    });
    if (!result.ok) {
      setError(toText(result.error || "Не удалось обновить свойство операции."));
      setBusy(false);
      return;
    }
    setInfo(`Свойство ${draft.propertyKey} обновлено.`);
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  async function handleDeleteProperty(propertyKey) {
    const normalizedPropertyKey = toText(propertyKey);
    if (!oid || !toText(selectedOperationKey) || !normalizedPropertyKey) return;
    const ok = typeof window === "undefined" || window.confirm(`Удалить свойство ${normalizedPropertyKey}?`);
    if (!ok) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiDeleteOrgPropertyDictionaryDefinition(oid, selectedOperationKey, normalizedPropertyKey);
    if (!result.ok) {
      setError(toText(result.error || "Не удалось удалить свойство операции."));
      setBusy(false);
      return;
    }
    setInfo(`Свойство ${normalizedPropertyKey} удалено.`);
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  async function handleAddValue(propertyKey) {
    const normalizedPropertyKey = toText(propertyKey);
    const draft = newValueDrafts[normalizedPropertyKey] || emptyValueDraft();
    if (!oid || !toText(selectedOperationKey) || !normalizedPropertyKey || !toText(draft.optionValue)) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiUpsertOrgPropertyDictionaryValue(oid, selectedOperationKey, normalizedPropertyKey, {
      option_value: draft.optionValue,
      sort_order: draft.sortOrder,
    });
    if (!result.ok) {
      setError(toText(result.error || "Не удалось добавить значение."));
      setBusy(false);
      return;
    }
    setNewValueDrafts((prev) => ({
      ...prev,
      [normalizedPropertyKey]: emptyValueDraft(),
    }));
    setInfo(`Значение «${toText(draft.optionValue)}» добавлено.`);
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  async function handleSaveExistingValue(value) {
    const valueId = toText(value?.id);
    if (!oid || !valueId) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiPatchOrgPropertyDictionaryValue(oid, valueId, {
      option_value: value?.optionValue,
      sort_order: value?.sortOrder,
      is_active: value?.isActive,
    });
    if (!result.ok) {
      setError(toText(result.error || "Не удалось обновить значение."));
      setBusy(false);
      return;
    }
    setInfo(`Значение «${toText(value?.optionValue)}» обновлено.`);
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  async function handleDeleteValue(valueId) {
    const normalizedValueId = toText(valueId);
    if (!oid || !normalizedValueId) return;
    const ok = typeof window === "undefined" || window.confirm("Удалить значение из справочника?");
    if (!ok) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await apiDeleteOrgPropertyDictionaryValue(oid, normalizedValueId);
    if (!result.ok) {
      setError(toText(result.error || "Не удалось удалить значение."));
      setBusy(false);
      return;
    }
    setInfo("Значение удалено.");
    setBusy(false);
    await refreshAfterMutation(selectedOperationKey);
  }

  function updatePropertyDraft(propertyKey, patch = {}) {
    const normalizedPropertyKey = toText(propertyKey);
    if (!normalizedPropertyKey) return;
    setPropertyDrafts((prev) => {
      const current = prev[normalizedPropertyKey] || normalizePropertyDraft(selectedProperty || {});
      return {
        ...prev,
        [normalizedPropertyKey]: {
          ...current,
          ...patch,
          propertyKey: current.propertyKey,
        },
      };
    });
  }

  function mutateSelectedPropertyValue(valueId, patch = {}) {
    const normalizedPropertyKey = toText(selectedPropertyKey);
    const normalizedValueId = toText(valueId);
    if (!normalizedPropertyKey || !normalizedValueId) return;
    setBundle((prev) => ({
      ...(prev || {}),
      properties: (Array.isArray(prev?.properties) ? prev.properties : []).map((property) => {
        const propertyKey = toText(property?.propertyKey || property?.property_key);
        if (propertyKey !== normalizedPropertyKey) return property;
        return {
          ...property,
          options: (Array.isArray(property?.options) ? property.options : []).map((option) => (
            toText(option?.id) === normalizedValueId
              ? { ...option, ...patch }
              : option
          )),
        };
      }),
    }));
  }

  const selectedOperationParts = operationDisplayParts(selectedOperation || { operation_key: selectedOperationKey });
  const selectedPropertyParts = propertyDisplayParts(selectedProperty || { property_key: selectedPropertyKey });
  const canOpenPropertyStage = !!toText(selectedOperationKey);
  const canOpenValueStage = !!toText(selectedOperationKey) && !!toText(selectedPropertyKey);
  const stageButtons = [
    { key: "operation", label: "Операция", enabled: true },
    { key: "property", label: "Свойства операции", enabled: canOpenPropertyStage },
    { key: "value", label: "Допустимые значения", enabled: canOpenValueStage },
  ];

  return (
    <div className="orgDictionaryRoot">
      <div className="orgDictionaryWizardNav" role="tablist" aria-label="Шаги справочника">
        {stageButtons.map((stage, index) => (
          <button
            key={`org_dictionary_stage_${stage.key}`}
            type="button"
            role="tab"
            aria-selected={activeStage === stage.key ? "true" : "false"}
            disabled={!stage.enabled}
            className={`orgDictionaryWizardTab ${activeStage === stage.key ? "isActive" : ""}`}
            onClick={() => {
              if (!stage.enabled) return;
              setActiveStage(stage.key);
            }}
          >
            <span className="orgDictionaryWizardTabIndex">{index + 1}</span>
            <span className="orgDictionaryWizardTabLabel">{stage.label}</span>
          </button>
        ))}
      </div>

      <div className="orgDictionaryFocusBar">
        <div className="orgDictionaryFocusItem">
          <span className="orgDictionaryFocusLabel">Операция:</span>
          <span className="orgDictionaryFocusValue">{selectedOperationParts.label || "Не выбрана"}</span>
          {selectedOperationParts.key ? <span className="orgDictionaryFocusKey">({selectedOperationParts.key})</span> : null}
        </div>
        <div className="orgDictionaryFocusItem">
          <span className="orgDictionaryFocusLabel">Свойство:</span>
          <span className="orgDictionaryFocusValue">{selectedPropertyParts.label || "Не выбрано"}</span>
          {selectedPropertyParts.key ? <span className="orgDictionaryFocusKey">({selectedPropertyParts.key})</span> : null}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div> : null}
      {info ? <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{info}</div> : null}
      {(busy || bundleBusy) ? <div className="text-xs text-muted">Обновляю справочник...</div> : null}

      {activeStage === "operation" ? (
        <section className="orgDictionaryStage">
          <div className="orgDictionaryStageTitle">Операция</div>
          <div className="orgDictionaryStageBody orgDictionaryStageBody--split">
            <aside className="orgDictionaryRail">
              <div className="orgDictionarySubTitle">Операции</div>
              <div className="orgDictionaryRailList">
                {operationButtons.map((operation) => (
                  <button
                    key={`org_dict_operation_${operation.key}`}
                    type="button"
                    className={`orgDictionaryListButton ${operation.key === selectedOperationKey ? "isActive" : ""}`}
                    onClick={() => {
                      setSelectedOperationKey(operation.key);
                      setInfo("");
                      setError("");
                    }}
                  >
                    <span className="orgDictionaryListLabel">{operation.label}</span>
                    <span className="orgDictionaryListKey">{operation.key}</span>
                    {operation.isActive ? null : <span className="orgDictionaryListMeta">неактивно</span>}
                  </button>
                ))}
                {!operationButtons.length ? (
                  <div className="orgDictionaryEmptyState">Пока нет операций. Создайте первую операцию ниже.</div>
                ) : null}
              </div>
            </aside>

            <form className="orgDictionaryEditorCard" onSubmit={handleSaveOperation}>
              <div className="orgDictionarySubTitle">Операция</div>
              <input
                className="input"
                type="text"
                placeholder="Ключ операции (например, add_ingredient)"
                value={newOperationDraft.operationKey}
                onChange={(event) => setNewOperationDraft((prev) => ({ ...prev, operationKey: event.target.value }))}
              />
              <input
                className="input"
                type="text"
                placeholder="Название операции"
                value={newOperationDraft.operationLabel}
                onChange={(event) => setNewOperationDraft((prev) => ({ ...prev, operationLabel: event.target.value }))}
              />
              <div className="flex items-center gap-2">
                <input
                  className="input w-24"
                  type="number"
                  placeholder="Порядок"
                  value={newOperationDraft.sortOrder}
                  onChange={(event) => setNewOperationDraft((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
                <label className="inline-flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={!!newOperationDraft.isActive}
                    onChange={(event) => setNewOperationDraft((prev) => ({ ...prev, isActive: !!event.target.checked }))}
                  />
                  активно
                </label>
              </div>
              <button type="submit" className="primaryBtn h-8 px-3 text-xs" disabled={!oid || busy}>
                Сохранить операцию
              </button>
            </form>
          </div>
          <div className="orgDictionaryStageFooter">
            <button
              type="button"
              className="primaryBtn h-8 px-3 text-xs"
              disabled={!canOpenPropertyStage}
              onClick={() => {
                if (!canOpenPropertyStage) return;
                setActiveStage("property");
              }}
            >
              Далее: свойства операции
            </button>
          </div>
        </section>
      ) : null}

      {activeStage === "property" ? (
        <section className="orgDictionaryStage">
          <div className="orgDictionaryStageTitle">Свойства операции</div>
          {!toText(selectedOperationKey) ? (
            <div className="orgDictionaryEmptyState">Сначала выберите операцию.</div>
          ) : (
            <div className="orgDictionaryStageBody orgDictionaryStageBody--split">
              <aside className="orgDictionaryRail">
                <div className="orgDictionarySubTitle">Свойства операции</div>
                <div className="orgDictionaryRailHint">
                  {selectedOperationParts.label}
                  {selectedOperationParts.key ? <span> ({selectedOperationParts.key})</span> : null}
                </div>
                <div className="orgDictionaryRailList">
                  {properties.map((property) => {
                    const propertyKey = toText(property?.propertyKey || property?.property_key);
                    const parts = propertyDisplayParts(property);
                    return (
                      <button
                        key={`org_dict_property_btn_${propertyKey}`}
                        type="button"
                        className={`orgDictionaryListButton ${propertyKey === selectedPropertyKey ? "isActive" : ""}`}
                        onClick={() => {
                          setSelectedPropertyKey(propertyKey);
                        }}
                      >
                        <span className="orgDictionaryListLabel">{parts.label}</span>
                        <span className="orgDictionaryListKey">{parts.key}</span>
                      </button>
                    );
                  })}
                  {!properties.length ? (
                    <div className="orgDictionaryEmptyState">Для этой операции пока нет свойств.</div>
                  ) : null}
                </div>
              </aside>

              <div className="orgDictionaryEditorStack">
                <div className="orgDictionaryEditorModeSwitch">
                  <button
                    type="button"
                    className={`orgDictionaryModeButton ${effectivePropertyEditorMode === "edit" ? "isActive" : ""}`}
                    onClick={() => setPropertyEditorMode("edit")}
                    disabled={!selectedPropertyDraft}
                  >
                    Редактировать выбранное
                  </button>
                  <button
                    type="button"
                    className={`orgDictionaryModeButton ${effectivePropertyEditorMode === "new" ? "isActive" : ""}`}
                    onClick={() => setPropertyEditorMode("new")}
                  >
                    Новое свойство
                  </button>
                </div>

                {effectivePropertyEditorMode === "new" ? (
                  <form className="orgDictionaryEditorCard" onSubmit={handleSaveProperty}>
                    <div className="orgDictionarySubTitle">Новое свойство операции</div>
                    <input
                      className="input"
                      type="text"
                      placeholder="Ключ свойства (например, ingredient)"
                      value={newPropertyDraft.propertyKey}
                      onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, propertyKey: event.target.value }))}
                    />
                    <input
                      className="input"
                      type="text"
                      placeholder="Название свойства"
                      value={newPropertyDraft.propertyLabel}
                      onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, propertyLabel: event.target.value }))}
                    />
                    <div className="orgDictionaryCompactRow">
                      <select
                        className="select"
                        value={newPropertyDraft.inputMode}
                        onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, inputMode: event.target.value }))}
                      >
                        <option value="autocomplete">Автодополнение</option>
                        <option value="free_text">Свободный ввод</option>
                      </select>
                      <input
                        className="input orgDictionaryOrderInput"
                        type="number"
                        placeholder="Порядок"
                        value={newPropertyDraft.sortOrder}
                        onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, sortOrder: event.target.value }))}
                      />
                    </div>
                    <div className="orgDictionaryFlagsRow">
                      <label className="inline-flex items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={!!newPropertyDraft.allowCustomValue}
                          onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, allowCustomValue: !!event.target.checked }))}
                        />
                        можно своё значение
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={!!newPropertyDraft.required}
                          onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, required: !!event.target.checked }))}
                        />
                        обязательно
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={!!newPropertyDraft.isActive}
                          onChange={(event) => setNewPropertyDraft((prev) => ({ ...prev, isActive: !!event.target.checked }))}
                        />
                        активно
                      </label>
                    </div>
                    <button type="submit" className="primaryBtn h-10 px-3 text-xs" disabled={!oid || busy}>
                      Сохранить свойство
                    </button>
                  </form>
                ) : (
                  <div className="orgDictionaryEditorCard">
                    <div className="orgDictionarySubTitle">Свойство операции</div>
                    {!selectedPropertyDraft ? (
                      <div className="orgDictionaryEmptyState">Выберите свойство в списке слева.</div>
                    ) : (
                      <>
                        <input
                          className="input"
                          type="text"
                          value={selectedPropertyDraft.propertyKey}
                          readOnly
                          title="Ключ существующего свойства не изменяется"
                        />
                        <input
                          className="input"
                          type="text"
                          value={selectedPropertyDraft.propertyLabel}
                          onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { propertyLabel: event.target.value })}
                        />
                        <div className="orgDictionaryCompactRow">
                          <select
                            className="select"
                            value={selectedPropertyDraft.inputMode}
                            onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { inputMode: event.target.value })}
                          >
                            <option value="autocomplete">Автодополнение</option>
                            <option value="free_text">Свободный ввод</option>
                          </select>
                          <input
                            className="input orgDictionaryOrderInput"
                            type="number"
                            value={selectedPropertyDraft.sortOrder}
                            onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { sortOrder: event.target.value })}
                          />
                        </div>
                        <div className="orgDictionaryFlagsRow">
                          <label className="inline-flex items-center gap-2 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={!!selectedPropertyDraft.allowCustomValue}
                              onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { allowCustomValue: !!event.target.checked })}
                            />
                            можно своё значение
                          </label>
                          <label className="inline-flex items-center gap-2 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={!!selectedPropertyDraft.required}
                              onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { required: !!event.target.checked })}
                            />
                            обязательно
                          </label>
                          <label className="inline-flex items-center gap-2 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={!!selectedPropertyDraft.isActive}
                              onChange={(event) => updatePropertyDraft(selectedPropertyDraft.propertyKey, { isActive: !!event.target.checked })}
                            />
                            активно
                          </label>
                        </div>
                        <div className="orgDictionaryEditorActions">
                          <button
                            type="button"
                            className="secondaryBtn h-9 min-h-0 px-3 py-0 text-xs"
                            onClick={() => {
                              void handleSaveExistingProperty(selectedPropertyDraft.propertyKey);
                            }}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="secondaryBtn h-9 min-h-0 px-3 py-0 text-xs"
                            onClick={() => {
                              void handleDeleteProperty(selectedPropertyDraft.propertyKey);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="orgDictionaryStageFooter">
            <button
              type="button"
              className="secondaryBtn h-8 px-3 text-xs"
              onClick={() => setActiveStage("operation")}
            >
              Назад: операция
            </button>
            <button
              type="button"
              className="primaryBtn h-8 px-3 text-xs"
              disabled={!canOpenValueStage}
              onClick={() => {
                if (!canOpenValueStage) return;
                setActiveStage("value");
              }}
            >
              Далее: значения
            </button>
          </div>
        </section>
      ) : null}

      {activeStage === "value" ? (
        <section className="orgDictionaryStage">
          <div className="orgDictionaryStageTitle">Допустимые значения</div>
          {!toText(selectedOperationKey) ? (
            <div className="orgDictionaryEmptyState">Выберите операцию и свойство операции.</div>
          ) : !toText(selectedPropertyKey) ? (
            <div className="orgDictionaryEmptyState">Выберите свойство операции, чтобы редактировать его значения.</div>
          ) : (
            <div className="orgDictionaryStageBody orgDictionaryStageBody--value">
              <div className="orgDictionaryValueContext">
                <div className="text-xs text-muted">
                  Операция: <span className="font-medium">{selectedOperationParts.label}</span>
                  {selectedOperationParts.key ? <span className="text-muted"> ({selectedOperationParts.key})</span> : null}
                </div>
                <div className="text-xs text-muted">
                  Свойство: <span className="font-medium">{selectedPropertyParts.label}</span>
                  {selectedPropertyParts.key ? <span className="text-muted"> ({selectedPropertyParts.key})</span> : null}
                </div>
              </div>

              <div className="orgDictionaryValuesTableWrap">
                <div className="orgDictionaryValuesTableHead">
                  <div>Значение</div>
                  <div>Порядок</div>
                  <div>Активно</div>
                  <div>Действия</div>
                </div>
                <div className="orgDictionaryValuesTableBody">
                  {selectedPropertyValues.map((value) => (
                    <div key={`org_dict_value_${toText(selectedPropertyKey)}_${toText(value?.id)}`} className="orgDictionaryValuesTableRow">
                      <div className="orgDictionaryValuesCell orgDictionaryValuesCell--value">
                        <input
                          className="input"
                          type="text"
                          value={String(value?.optionValue || value?.option_value || "")}
                          onChange={(event) => mutateSelectedPropertyValue(value?.id, { optionValue: event.target.value })}
                        />
                      </div>
                      <div className="orgDictionaryValuesCell orgDictionaryValuesCell--order">
                        <input
                          className="input orgDictionaryOrderInput"
                          type="number"
                          value={toSortOrder(value?.sortOrder ?? value?.sort_order)}
                          onChange={(event) => mutateSelectedPropertyValue(value?.id, { sortOrder: event.target.value })}
                        />
                      </div>
                      <div className="orgDictionaryValuesCell orgDictionaryValuesCell--active">
                        <input
                          type="checkbox"
                          checked={value?.isActive ?? value?.is_active ?? true}
                          onChange={(event) => mutateSelectedPropertyValue(value?.id, { isActive: !!event.target.checked })}
                        />
                      </div>
                      <div className="orgDictionaryValuesCell orgDictionaryValuesCell--actions">
                        <button
                          type="button"
                          className="secondaryBtn h-8 min-h-0 px-2.5 py-0 text-xs"
                          onClick={() => {
                            void handleSaveExistingValue(value);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="secondaryBtn h-8 min-h-0 px-2.5 py-0 text-xs"
                          onClick={() => {
                            void handleDeleteValue(value?.id);
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                  {!selectedPropertyValues.length ? (
                    <div className="orgDictionaryEmptyState">Для этого свойства пока нет значений.</div>
                  ) : null}
                </div>
                <div className="orgDictionaryAddValueZone">
                  <div className="orgDictionarySubTitle">Добавить значение</div>
                  <div className="orgDictionaryValuesTableRow orgDictionaryValuesTableRow--add">
                    <div className="orgDictionaryValuesCell orgDictionaryValuesCell--value">
                      <input
                        className="input"
                        type="text"
                        placeholder="Новое значение"
                        value={selectedValueDraft.optionValue}
                        onChange={(event) => setNewValueDrafts((prev) => ({
                          ...prev,
                          [toText(selectedPropertyKey)]: {
                            ...selectedValueDraft,
                            optionValue: event.target.value,
                          },
                        }))}
                      />
                    </div>
                    <div className="orgDictionaryValuesCell orgDictionaryValuesCell--order">
                      <input
                        className="input orgDictionaryOrderInput"
                        type="number"
                        placeholder="0"
                        value={selectedValueDraft.sortOrder}
                        onChange={(event) => setNewValueDrafts((prev) => ({
                          ...prev,
                          [toText(selectedPropertyKey)]: {
                            ...selectedValueDraft,
                            sortOrder: event.target.value,
                          },
                        }))}
                      />
                    </div>
                    <div className="orgDictionaryValuesCell orgDictionaryValuesCell--active" />
                    <div className="orgDictionaryValuesCell orgDictionaryValuesCell--actions">
                      <button
                        type="button"
                        className="primaryBtn h-8 px-3 text-xs"
                        onClick={() => {
                          void handleAddValue(selectedPropertyKey);
                        }}
                        disabled={!toText(selectedValueDraft.optionValue)}
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="orgDictionaryStageFooter">
            <button
              type="button"
              className="secondaryBtn h-8 px-3 text-xs"
              onClick={() => setActiveStage("property")}
            >
              Назад: свойства операции
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
