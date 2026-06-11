"""
Database Seeder — Populates the inventory system with realistic demo data.
Run: python backend/seed.py
"""

import random
from datetime import datetime, timedelta
from app.database import engine, SessionLocal
from app import models
from app.auth import hash_password


def seed_db():
    # Drop and recreate all tables
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    print("Database tables created.")

    db = SessionLocal()
    try:
        # ─── 1. Seed Users ────────────────────────────────────
        users = [
            models.User(
                name="Admin User",
                email="admin@inventory.com",
                password_hash=hash_password("admin123", "admin@inventory.com"),
                role="Admin"
            ),
            models.User(
                name="Staff User",
                email="staff@inventory.com",
                password_hash=hash_password("staff123", "staff@inventory.com"),
                role="Staff"
            ),
            models.User(
                name="Buyer User",
                email="user@inventory.com",
                password_hash=hash_password("user123", "user@inventory.com"),
                role="User"
            ),
        ]
        db.add_all(users)
        db.commit()
        print("Users seeded: 3 users (Admin, Staff, User)")

        # ─── 2. Seed Products ─────────────────────────────────
        products_data = [
            # Electronics
            {"name": "Wireless Bluetooth Headphones", "category": "Electronics", "price": 2499.00, "quantity": 45, "reorder_level": 15},
            {"name": "USB-C Fast Charger 65W", "category": "Electronics", "price": 1299.00, "quantity": 80, "reorder_level": 20},
            {"name": "Portable Power Bank 20000mAh", "category": "Electronics", "price": 1899.00, "quantity": 8, "reorder_level": 15},
            # Clothing
            {"name": "Cotton Crew Neck T-Shirt", "category": "Clothing", "price": 599.00, "quantity": 120, "reorder_level": 30},
            {"name": "Slim Fit Denim Jeans", "category": "Clothing", "price": 1499.00, "quantity": 60, "reorder_level": 20},
            {"name": "Winter Fleece Jacket", "category": "Clothing", "price": 2999.00, "quantity": 5, "reorder_level": 10},
            # Food & Beverages
            {"name": "Organic Green Tea (100 bags)", "category": "Food", "price": 450.00, "quantity": 200, "reorder_level": 50},
            {"name": "Premium Basmati Rice 5kg", "category": "Food", "price": 680.00, "quantity": 150, "reorder_level": 40},
            {"name": "Dark Chocolate Bar 200g", "category": "Food", "price": 350.00, "quantity": 3, "reorder_level": 25},
            # Furniture
            {"name": "Ergonomic Office Chair", "category": "Furniture", "price": 12999.00, "quantity": 12, "reorder_level": 5},
            {"name": "Wooden Study Desk 120cm", "category": "Furniture", "price": 8499.00, "quantity": 8, "reorder_level": 3},
            {"name": "LED Desk Lamp Adjustable", "category": "Furniture", "price": 1799.00, "quantity": 35, "reorder_level": 10},
            # Stationery
            {"name": "A4 Notebook 200 Pages", "category": "Stationery", "price": 180.00, "quantity": 300, "reorder_level": 80},
            {"name": "Gel Pen Set (Pack of 10)", "category": "Stationery", "price": 250.00, "quantity": 180, "reorder_level": 50},
            {"name": "Whiteboard Marker Set", "category": "Stationery", "price": 320.00, "quantity": 2, "reorder_level": 20},
        ]

        product_objects = []
        for pd_item in products_data:
            p = models.Product(
                name=pd_item["name"],
                category=pd_item["category"],
                price=pd_item["price"],
                quantity=pd_item["quantity"],
                reorder_level=pd_item["reorder_level"],
                created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            product_objects.append(p)
        db.add_all(product_objects)
        db.commit()
        print(f"Products seeded: {len(product_objects)} items across 5 categories")

        # ─── 3. Seed Inventory (matches product quantities) ───
        for p in product_objects:
            inv = models.Inventory(
                product_id=p.id,
                stock_level=p.quantity,
                last_updated=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            db.add(inv)
        db.commit()
        print("Inventory entries created for all products.")

        # ─── 4. Seed Sales History (6 months, ~60 transactions) ──
        random.seed(42)
        base_date = datetime.now() - timedelta(days=180)
        sales_count = 0
        recorded_users = ["admin@inventory.com", "staff@inventory.com"]

        for month_offset in range(6):
            month_start = base_date + timedelta(days=month_offset * 30)
            # 8-12 sales per month
            num_sales = random.randint(8, 12)
            for _ in range(num_sales):
                product = random.choice(product_objects)
                qty = random.randint(1, min(8, max(1, product.quantity)))
                sale_day = month_start + timedelta(days=random.randint(0, 29))

                sale = models.Sale(
                    product_id=product.id,
                    quantity_sold=qty,
                    sale_date=sale_day.strftime("%Y-%m-%d %H:%M:%S"),
                    total_price=round(product.price * qty, 2),
                    recorded_by=random.choice(recorded_users)
                )
                db.add(sale)
                sales_count += 1

        db.commit()
        print(f"Sales history seeded: {sales_count} transactions across 6 months")

        # --- 5. Seed Purchase Orders -----------------------------------
        purchase_orders = [
            models.PurchaseOrder(
                product_id=product_objects[2].id,  # Power Bank (low stock)
                quantity=50,
                total_cost=round(product_objects[2].price * 50, 2),
                status="Approved",
                payment_method="Credit Card",
                ordered_by="user@inventory.com",
                order_date=(datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S"),
                approved_by="admin@inventory.com",
                notes="Urgent restock - running low"
            ),
            models.PurchaseOrder(
                product_id=product_objects[8].id,  # Dark Chocolate (low stock)
                quantity=100,
                total_cost=round(product_objects[8].price * 100, 2),
                status="Pending",
                payment_method="UPI",
                ordered_by="user@inventory.com",
                order_date=(datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S"),
                notes="Monthly restock for chocolate"
            ),
            models.PurchaseOrder(
                product_id=product_objects[5].id,  # Winter Jacket (low stock)
                quantity=30,
                total_cost=round(product_objects[5].price * 30, 2),
                status="Pending",
                payment_method="Net Banking",
                ordered_by="user@inventory.com",
                order_date=(datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),
                notes="Winter season approaching"
            ),
            models.PurchaseOrder(
                product_id=product_objects[14].id,  # Whiteboard Markers (low stock)
                quantity=80,
                total_cost=round(product_objects[14].price * 80, 2),
                status="Rejected",
                payment_method="Debit Card",
                ordered_by="staff@inventory.com",
                order_date=(datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S"),
                approved_by="admin@inventory.com",
                notes="Bulk order for office supply"
            ),
        ]
        db.add_all(purchase_orders)
        db.commit()
        print(f"Purchase orders seeded: {len(purchase_orders)} orders")

        print("\nDatabase seed completed successfully!")
        print("-" * 50)
        print("Login Credentials:")
        print("  Admin:  admin@inventory.com  /  admin123")
        print("  Staff:  staff@inventory.com  /  staff123")
        print("  User:   user@inventory.com   /  user123")
        print("-" * 50)

    except Exception as e:
        db.rollback()
        print(f"Database seed error: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_db()
