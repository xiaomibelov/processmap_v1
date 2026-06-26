from typing import Any, Dict


def deduplicate_camunda_extension_properties(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Keep the last extension property row for each logical key (case-insensitive name).

    Duplicated Camunda extension property keys are normalised so that the most
    recent value wins. This prevents the UI from having to reconcile conflicting
    rows and matches the frontend "keep last" deduplication semantics.
    """
    if not isinstance(meta, dict):
        return meta
    by_element = meta.get("camunda_extensions_by_element_id")
    if not isinstance(by_element, dict):
        return meta
    for ext_state in by_element.values():
        if not isinstance(ext_state, dict):
            continue
        properties = ext_state.get("properties")
        if isinstance(properties, list):
            raw_list = properties
        elif isinstance(properties, dict):
            raw_list = properties.get("extensionProperties")
        else:
            continue
        if not isinstance(raw_list, list) or len(raw_list) < 2:
            continue
        kept_keys: set = set()
        deduped = []
        for item in reversed(raw_list):
            if not isinstance(item, dict):
                deduped.append(item)
                continue
            key = str(item.get("name") or "").strip().lower()
            if not key:
                deduped.append(item)
            elif key not in kept_keys:
                kept_keys.add(key)
                deduped.append(item)
        result = list(reversed(deduped))
        if isinstance(properties, dict):
            properties["extensionProperties"] = result
        else:
            ext_state["properties"] = result
    return meta
