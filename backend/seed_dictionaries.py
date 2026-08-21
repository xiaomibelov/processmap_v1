import psycopg, os, json

url = os.environ.get("DATABASE_URL")
conn = psycopg.connect(url)
cur = conn.cursor()

# Create dictionary tables if they don't exist
cur.execute("""
    CREATE TABLE IF NOT EXISTS equipment_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
""")

cur.execute("""
    CREATE TABLE IF NOT EXISTS container_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
""")

cur.execute("""
    CREATE TABLE IF NOT EXISTS zone_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
""")

cur.execute("""
    CREATE TABLE IF NOT EXISTS sku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
    )
""")

# Seed equipment types
equipment_types = [
    {"code": "microwave", "name": "Microwave", "category": "heating", "description": "Microwave heating equipment"},
    {"code": "container_opener", "name": "Container Opener", "category": "container", "description": "Equipment for opening containers"},
    {"code": "container_dispenser", "name": "Container Dispenser", "category": "container", "description": "Equipment for dispensing containers"},
    {"code": "transfer_station", "name": "Transfer Station", "category": "transfer", "description": "Station for transferring contents between containers"},
    {"code": "container_closing_station", "name": "Container Closing Station", "category": "container", "description": "Station for closing containers"},
    {"code": "fridge_storage", "name": "Fridge Storage", "category": "storage", "description": "Refrigerated storage unit"},
    {"code": "food_container", "name": "Food Container", "category": "container", "description": "Container for food items"},
    {"code": "serving_container", "name": "Serving Container", "category": "container", "description": "Container for serving food"},
    {"code": "disposal_zone", "name": "Disposal Zone", "category": "zone", "description": "Zone for waste disposal"},
    {"code": "packaging_zone", "name": "Packaging Zone", "category": "zone", "description": "Zone for packaging items"}
]

# Seed container types
container_types = [
    {"code": "food_container", "name": "Food Container", "category": "storage", "description": "Container for food storage"},
    {"code": "serving_container", "name": "Serving Container", "category": "serving", "description": "Container for serving food"},
    {"code": "transport_container", "name": "Transport Container", "category": "transport", "description": "Container for transporting items"},
    {"code": "storage_container", "name": "Storage Container", "category": "storage", "description": "Container for general storage"}
]

# Seed zone types
zone_types = [
    {"code": "disposal_zone", "name": "Disposal Zone", "category": "waste", "description": "Zone for waste disposal"},
    {"code": "packaging_zone", "name": "Packaging Zone", "category": "packaging", "description": "Zone for packaging items"},
    {"code": "preparation_zone", "name": "Preparation Zone", "category": "preparation", "description": "Zone for food preparation"},
    {"code": "serving_zone", "name": "Serving Zone", "category": "serving", "description": "Zone for serving food"}
]

# Seed SKU
sku_items = [
    {"code": "soup_tomato", "name": "Tomato Soup", "description": "Classic tomato soup", "category": "soup"},
    {"code": "soup_chicken", "name": "Chicken Soup", "description": "Chicken noodle soup", "category": "soup"},
    {"code": "soup_vegetable", "name": "Vegetable Soup", "description": "Mixed vegetable soup", "category": "soup"}
]

# Insert equipment types
for item in equipment_types:
    cur.execute("""
        INSERT INTO equipment_types (code, name, category, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (code) DO NOTHING
    """, (item["code"], item["name"], item["category"], item["description"]))

# Insert container types
for item in container_types:
    cur.execute("""
        INSERT INTO container_types (code, name, category, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (code) DO NOTHING
    """, (item["code"], item["name"], item["category"], item["description"]))

# Insert zone types
for item in zone_types:
    cur.execute("""
        INSERT INTO zone_types (code, name, category, description)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (code) DO NOTHING
    """, (item["code"], item["name"], item["category"], item["description"]))

# Insert SKU
for item in sku_items:
    cur.execute("""
        INSERT INTO sku (code, name, description, category)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (code) DO NOTHING
    """, (item["code"], item["name"], item["description"], item["category"]))

conn.commit()
print("Dictionaries seeded successfully")
conn.close()
