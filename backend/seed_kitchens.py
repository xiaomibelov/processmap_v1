"""E6.3 — seed реестра кухонь (идемпотентно).

3 кухни; «Кухня №3 (без датчиков)» НАМЕРЕННО без оборудования/ capability
измерения температуры — pre-check (E6.4) для шаблона с measure_temperature
даёт на ней verdict blocked (strict) / warning (warning-режим).

Запуск: DATABASE_URL=postgresql://fpc:fpc@localhost:5432/processmap \
    .venv/bin/python backend/seed_kitchens.py
"""
import json
import os

import psycopg

# capabilities_json — Asset Registry v1: {"capabilities": [...]}
FULL_EQUIPMENT = [
    ("storage_unit", {}),
    ("transport_system", {}),
    ("container_opener", {}),
    ("container_closing_station", {}),
    ("measurement_device", {"capabilities": ["temperature_measurement"]}),
    ("temperature_sensor", {"capabilities": ["temperature_measurement"]}),
    ("transfer_station", {}),
    ("target_equipment", {"capabilities": ["heating"]}),
]

KITCHENS = [
    {
        "name": "Кухня №1 (центральная)",
        "location": "Цех А, корпус 1",
        "status": "active",
        "equipment": FULL_EQUIPMENT,
    },
    {
        "name": "Кухня №2 (линия РТК)",
        "location": "Цех Б, корпус 2",
        "status": "active",
        # temperature_sensor как типа нет, но есть measurement_device
        # с capability temperature_measurement — покрытие через алиас.
        "equipment": [item for item in FULL_EQUIPMENT if item[0] != "temperature_sensor"],
    },
    {
        "name": "Кухня №3 (без датчиков)",
        "location": "Цех В, корпус 3",
        "status": "active",
        # НАМЕРЕННО: ни temperature_sensor, ни capability temperature_measurement.
        "equipment": [
            ("storage_unit", {}),
            ("transport_system", {}),
            ("container_opener", {}),
            ("container_closing_station", {}),
            ("transfer_station", {}),
            ("target_equipment", {"capabilities": ["heating"]}),
        ],
    },
]


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    conn = psycopg.connect(url)
    cur = conn.cursor()
    for kitchen in KITCHENS:
        cur.execute("DELETE FROM kitchen WHERE name = %s", (kitchen["name"],))
        cur.execute(
            "INSERT INTO kitchen (id, name, location, status) VALUES (gen_random_uuid(), %s, %s, %s) RETURNING id",
            (kitchen["name"], kitchen["location"], kitchen["status"]),
        )
        kitchen_id = cur.fetchone()[0]
        for equipment_type_id, capabilities in kitchen["equipment"]:
            cur.execute(
                "INSERT INTO kitchen_equipment (kitchen_id, equipment_type_id, capabilities_json) "
                "VALUES (%s, %s, %s)",
                (kitchen_id, equipment_type_id, json.dumps(capabilities, ensure_ascii=False)),
            )
    conn.commit()
    print(f"Seeded {len(KITCHENS)} kitchens into kitchen/kitchen_equipment")
    conn.close()


if __name__ == "__main__":
    main()
