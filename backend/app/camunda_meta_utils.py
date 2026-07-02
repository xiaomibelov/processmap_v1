from typing import Any, Dict


def deduplicate_camunda_extension_properties(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Preserve all Camunda extension property rows, including duplicate names.

    Previously this helper collapsed duplicate property names to a single value.
    The importer now stores every ``camunda:property`` row as an array entry so
    that multiple values for the same name (e.g. ``container_tara=дежа`` and
    ``container_tara=бункер``) are retained. This function is kept as a
    pass-through for backward compatibility with callers that expect normalized
    meta.
    """
    if not isinstance(meta, dict):
        return meta
    return meta
