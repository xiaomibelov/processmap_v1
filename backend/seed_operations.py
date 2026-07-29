import psycopg, os, json

url = os.environ.get("DATABASE_URL")
conn = psycopg.connect(url)
cur = conn.cursor()

# L10N (миграция 009): русские названия операций для UI технолога.
# Код операции — технический идентификатор, не переводится.
NAME_RU = {
    "get_from_storage": "Выдать из хранилища",
    "move": "Перенести",
    "open_container": "Вскрыть контейнер",
    "close_container": "Закрыть контейнер",
    "open_equipment": "Открыть оборудование",
    "close_equipment": "Закрыть оборудование",
    "start_equipment": "Запустить оборудование",
    "set_equipment": "Настроить оборудование",
    "transfer": "Перетарить",
    "measure_temperature": "Измерить температуру",
    "check": "Проверить",
    "publish_event": "Опубликовать событие",
    "wait": "Выждать",
}

operations = [
    {
        "code": "get_from_storage",
        "name": "Get from Storage",
        "parameter_schema": {
            "container_type": {"type": "string", "required": True},
            "quantity": {"type": "number", "required": True, "min": 1}
        },
        "allowed_outputs": [
            {"name": "container_retrieved", "type": "success"},
            {"name": "container_not_found", "type": "error"},
            {"name": "insufficient_quantity", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["storage_available", "container_exists"],
            "postconditions": ["container_in_transit"],
            "checks": ["quantity_valid", "container_type_match"]
        },
        "resource_requirements": {
            "equipment": ["storage_unit"],
            "containers": ["source_container"],
            "time_estimate_sec": 30
        },
        "category": "storage"
    },
    {
        "code": "move",
        "name": "Move",
        "parameter_schema": {
            "from_location": {"type": "string", "required": True},
            "to_location": {"type": "string", "required": True},
            "container_id": {"type": "string", "required": True}
        },
        "allowed_outputs": [
            {"name": "move_completed", "type": "success"},
            {"name": "move_failed", "type": "error"},
            {"name": "path_blocked", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["container_available", "path_clear"],
            "postconditions": ["container_at_destination"],
            "checks": ["path_validation", "collision_avoidance"]
        },
        "resource_requirements": {
            "equipment": ["transport_system"],
            "containers": ["moving_container"],
            "time_estimate_sec": 60
        },
        "category": "transport"
    },
    {
        "code": "open_container",
        "name": "Open Container",
        "parameter_schema": {
            "container_id": {"type": "string", "required": True},
            "open_method": {"type": "string", "required": False, "default": "auto"}
        },
        "allowed_outputs": [
            {"name": "container_opened", "type": "success"},
            {"name": "open_failed", "type": "error"},
            {"name": "container_damaged", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["container_closed", "equipment_ready"],
            "postconditions": ["container_open"],
            "checks": ["container_integrity", "safety_check"]
        },
        "resource_requirements": {
            "equipment": ["container_opener"],
            "containers": ["target_container"],
            "time_estimate_sec": 15
        },
        "category": "container"
    },
    {
        "code": "close_container",
        "name": "Close Container",
        "parameter_schema": {
            "container_id": {"type": "string", "required": True},
            "seal_type": {"type": "string", "required": False, "default": "standard"}
        },
        "allowed_outputs": [
            {"name": "container_closed", "type": "success"},
            {"name": "close_failed", "type": "error"},
            {"name": "seal_incomplete", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["container_open", "equipment_ready"],
            "postconditions": ["container_closed"],
            "checks": ["seal_integrity", "safety_check"]
        },
        "resource_requirements": {
            "equipment": ["container_closing_station"],
            "containers": ["target_container"],
            "time_estimate_sec": 20
        },
        "category": "container"
    },
    {
        "code": "open_equipment",
        "name": "Open Equipment",
        "parameter_schema": {
            "equipment_id": {"type": "string", "required": True},
            "equipment_type": {"type": "string", "required": True}
        },
        "allowed_outputs": [
            {"name": "equipment_opened", "type": "success"},
            {"name": "open_failed", "type": "error"},
            {"name": "equipment_busy", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["equipment_closed", "safety_check_passed"],
            "postconditions": ["equipment_open"],
            "checks": ["safety_validation", "equipment_status"]
        },
        "resource_requirements": {
            "equipment": ["target_equipment"],
            "containers": [],
            "time_estimate_sec": 10
        },
        "category": "equipment"
    },
    {
        "code": "close_equipment",
        "name": "Close Equipment",
        "parameter_schema": {
            "equipment_id": {"type": "string", "required": True},
            "equipment_type": {"type": "string", "required": True}
        },
        "allowed_outputs": [
            {"name": "equipment_closed", "type": "success"},
            {"name": "close_failed", "type": "error"},
            {"name": "equipment_malfunction", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["equipment_open", "safety_check_passed"],
            "postconditions": ["equipment_closed"],
            "checks": ["safety_validation", "equipment_status"]
        },
        "resource_requirements": {
            "equipment": ["target_equipment"],
            "containers": [],
            "time_estimate_sec": 10
        },
        "category": "equipment"
    },
    {
        "code": "set_equipment",
        "name": "Set Equipment",
        "parameter_schema": {
            "equipment_id": {"type": "string", "required": True},
            "parameter_name": {"type": "string", "required": True},
            "parameter_value": {"type": "string", "required": True}
        },
        "allowed_outputs": [
            {"name": "parameter_set", "type": "success"},
            {"name": "set_failed", "type": "error"},
            {"name": "invalid_parameter", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["equipment_available", "parameter_valid"],
            "postconditions": ["parameter_updated"],
            "checks": ["parameter_validation", "equipment_compatibility"]
        },
        "resource_requirements": {
            "equipment": ["target_equipment"],
            "containers": [],
            "time_estimate_sec": 5
        },
        "category": "equipment"
    },
    {
        "code": "start_equipment",
        "name": "Start Equipment",
        "parameter_schema": {
            "equipment_id": {"type": "string", "required": True},
            "start_mode": {"type": "string", "required": False, "default": "auto"}
        },
        "allowed_outputs": [
            {"name": "equipment_started", "type": "success"},
            {"name": "start_failed", "type": "error"},
            {"name": "equipment_error", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["equipment_ready", "safety_check_passed"],
            "postconditions": ["equipment_running"],
            "checks": ["safety_validation", "equipment_status"]
        },
        "resource_requirements": {
            "equipment": ["target_equipment"],
            "containers": [],
            "time_estimate_sec": 15
        },
        "category": "equipment"
    },
    {
        "code": "wait",
        "name": "Wait",
        "parameter_schema": {
            "duration_sec": {"type": "number", "required": True, "min": 1},
            "wait_condition": {"type": "string", "required": False}
        },
        "allowed_outputs": [
            {"name": "wait_completed", "type": "success"},
            {"name": "wait_interrupted", "type": "error"},
            {"name": "condition_timeout", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["process_active"],
            "postconditions": ["time_elapsed"],
            "checks": ["condition_monitoring", "timeout_validation"]
        },
        "resource_requirements": {
            "equipment": [],
            "containers": [],
            "time_estimate_sec": "variable"
        },
        "category": "control"
    },
    {
        "code": "transfer",
        "name": "Transfer",
        "parameter_schema": {
            "source_container": {"type": "string", "required": True},
            "target_container": {"type": "string", "required": True},
            "transfer_method": {"type": "string", "required": False, "default": "auto"}
        },
        "allowed_outputs": [
            {"name": "transfer_completed", "type": "success"},
            {"name": "transfer_failed", "type": "error"},
            {"name": "container_incompatible", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["containers_ready", "transfer_path_clear"],
            "postconditions": ["content_transferred"],
            "checks": ["container_compatibility", "transfer_validation"]
        },
        "resource_requirements": {
            "equipment": ["transfer_station"],
            "containers": ["source_container", "target_container"],
            "time_estimate_sec": 45
        },
        "category": "transfer"
    },
    {
        "code": "check",
        "name": "Check",
        "parameter_schema": {
            "check_type": {"type": "string", "required": True},
            "target_id": {"type": "string", "required": True},
            "parameters": {"type": "object", "required": False}
        },
        "allowed_outputs": [
            {"name": "check_passed", "type": "success"},
            {"name": "check_failed", "type": "error"},
            {"name": "check_error", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["check_target_available"],
            "postconditions": ["check_result_recorded"],
            "checks": ["validation_rules", "measurement_accuracy"]
        },
        "resource_requirements": {
            "equipment": ["measurement_device"],
            "containers": ["target_container"],
            "time_estimate_sec": 20
        },
        "category": "quality"
    },
    {
        "code": "measure_temperature",
        "name": "Measure Temperature",
        "parameter_schema": {
            "container_id": {"type": "string", "required": True},
            "measurement_point": {"type": "string", "required": False, "default": "center"}
        },
        "allowed_outputs": [
            {"name": "temperature_measured", "type": "success"},
            {"name": "measurement_failed", "type": "error"},
            {"name": "sensor_error", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["sensor_available", "container_accessible"],
            "postconditions": ["temperature_recorded"],
            "checks": ["sensor_calibration", "measurement_accuracy"]
        },
        "resource_requirements": {
            "equipment": ["temperature_sensor"],
            "containers": ["target_container"],
            "time_estimate_sec": 10
        },
        "category": "measurement"
    },
    {
        "code": "publish_event",
        "name": "Publish Event",
        "parameter_schema": {
            "event_type": {"type": "string", "required": True},
            "event_data": {"type": "object", "required": False},
            "priority": {"type": "string", "required": False, "default": "normal"}
        },
        "allowed_outputs": [
            {"name": "event_published", "type": "success"},
            {"name": "publish_failed", "type": "error"},
            {"name": "event_queue_full", "type": "error"}
        ],
        "execution_contract": {
            "preconditions": ["event_system_available"],
            "postconditions": ["event_recorded"],
            "checks": ["event_validation", "queue_status"]
        },
        "resource_requirements": {
            "equipment": [],
            "containers": [],
            "time_estimate_sec": 2
        },
        "category": "communication"
    }
]

# v0.3 §9: канонические parameter_schema (refs как *_ref — нужны dropdown'ам E4.3).
# Переопределяют устаревшие схемы выше; единственный источник правды — эта таблица.
V03_PARAMETER_SCHEMA = {
    "get_from_storage": {"item_type": ("string", False), "item_ref": ("string", False), "target_ref": ("string", True)},
    "move": {"object_ref": ("string", True), "target_ref": ("string", True)},
    "hold": {"object_ref": ("string", True), "purpose": ("string", False)},
    "open_equipment": {"equipment_ref": ("string", False), "equipment_type": ("string", False)},
    "close_equipment": {"equipment_ref": ("string", False), "equipment_type": ("string", False)},
    "set_equipment": {"equipment_ref": ("string", True), "duration_sec": ("number", False), "power_level": ("string", False)},
    "start_equipment": {"equipment_ref": ("string", True)},
    "wait": {"duration_sec": ("number", False), "event_code": ("string", False)},
    "open_container": {"container_ref": ("string", True)},
    "close_container": {"container_ref": ("string", True), "target_ref": ("string", False)},
    "transfer": {"source_container_ref": ("string", True), "target_container_ref": ("string", True), "content_ref": ("string", False)},
    "measure_temperature": {"object_ref": ("string", False), "container_ref": ("string", False), "target_temp_c": ("number", False)},
    "check": {"check_code": ("string", True), "object_ref": ("string", True), "expected_value": ("string", True)},
    "publish_event": {"event_code": ("string", True), "payload": ("object", False)},
}

for op in operations:
    schema = V03_PARAMETER_SCHEMA.get(op["code"])
    if schema:
        op["parameter_schema"] = {
            key: {"type": typ, "required": req} for key, (typ, req) in schema.items()
        }

# Полная перезапись каталога (идемпотентно): старые строки с устаревшими схемами заменяются
for op in operations:
    cur.execute("DELETE FROM operation_catalog WHERE code = %s", (op["code"],))

# Insert operations into operation_catalog
for op in operations:
    cur.execute("""
        INSERT INTO operation_catalog (id, code, name, name_ru, parameter_schema, allowed_outputs, execution_contract, resource_requirements, category)
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (code) DO NOTHING
    """, (
        op["code"],
        op["name"],
        NAME_RU.get(op["code"], op["name"]),
        json.dumps(op["parameter_schema"]),
        json.dumps(op["allowed_outputs"]),
        json.dumps(op["execution_contract"]),
        json.dumps(op["resource_requirements"]),
        op["category"]
    ))

conn.commit()
print(f"Seeded {len(operations)} operations into operation_catalog")
conn.close()
