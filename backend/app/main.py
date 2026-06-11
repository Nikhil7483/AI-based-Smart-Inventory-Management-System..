from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import io
import os
import sys
import pandas as pd

# Relative imports
from .database import get_db, engine
from . import models, schemas, auth

# Add backend directory to path so 'ml' package is importable
# Works both locally (python -m uvicorn backend.app.main:app) and
# on Render (uvicorn app.main:app with rootDir=backend)
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
from ml import ml_core


app = FastAPI(title="Smart AI Inventory Management API", version="1.0.0")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    """Create tables and verify ML models on startup."""
    models.Base.metadata.create_all(bind=engine)
    ml_core.verify_models()
    print("Smart AI Inventory Management System initialized.")


# ═══════════════════════════════════════════════════════════════
# 1. AUTHENTICATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.post("/api/auth/register", response_model=schemas.UserBase)
def register(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    """Register a new user account."""
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    hashed_pwd = auth.hash_password(user_data.password, user_data.email)
    new_user = models.User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_pwd,
        role=user_data.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.post("/api/auth/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token."""
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password.")

    hashed_pwd = auth.hash_password(login_data.password, login_data.email)
    if hashed_pwd != user.password_hash:
        raise HTTPException(status_code=400, detail="Incorrect email or password.")

    token = auth.create_access_token(data={"sub": user.email, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "name": user.name,
        "email": user.email,
        "role": user.role
    }


@app.get("/api/auth/me", response_model=schemas.UserBase)
def get_me(user: models.User = Depends(auth.get_current_user)):
    """Return the currently authenticated user."""
    return user


# ═══════════════════════════════════════════════════════════════
# 2. PRODUCT MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/products", response_model=list[schemas.ProductBase])
def get_products(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """List all products."""
    return db.query(models.Product).order_by(models.Product.id.asc()).all()


@app.get("/api/products/search", response_model=list[schemas.ProductBase])
def search_products(
    q: str = Query("", description="Search query for product name or category"),
    category: str = Query("", description="Filter by category"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Search and filter products by name or category."""
    query = db.query(models.Product)
    if q:
        query = query.filter(
            (models.Product.name.ilike(f"%{q}%")) |
            (models.Product.category.ilike(f"%{q}%"))
        )
    if category:
        query = query.filter(models.Product.category == category)
    return query.order_by(models.Product.id.asc()).all()


@app.post("/api/products", response_model=schemas.ProductBase)
def create_product(
    product_data: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.RoleChecker(["Admin"]))
):
    """Add a new product (Admin only)."""
    new_product = models.Product(
        name=product_data.name,
        category=product_data.category,
        price=product_data.price,
        quantity=product_data.quantity,
        reorder_level=product_data.reorder_level,
        created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    # Auto-create matching inventory entry
    new_inventory = models.Inventory(
        product_id=new_product.id,
        stock_level=new_product.quantity,
        last_updated=datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(new_inventory)
    db.commit()

    return new_product


@app.put("/api/products/{product_id}", response_model=schemas.ProductBase)
def update_product(
    product_id: int,
    product_data: schemas.ProductUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.RoleChecker(["Admin"]))
):
    """Update product details (Admin only)."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product_data.name is not None:
        product.name = product_data.name
    if product_data.category is not None:
        product.category = product_data.category
    if product_data.price is not None:
        product.price = product_data.price
    if product_data.quantity is not None:
        old_qty = product.quantity
        product.quantity = product_data.quantity
        # Sync inventory stock level
        inv = db.query(models.Inventory).filter(models.Inventory.product_id == product_id).first()
        if inv:
            inv.stock_level = product_data.quantity
            inv.last_updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if product_data.reorder_level is not None:
        product.reorder_level = product_data.reorder_level

    db.commit()
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.RoleChecker(["Admin"]))
):
    """Delete a product (Admin only). Cascades to inventory and sales."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    db.delete(product)
    db.commit()
    return {"detail": f"Product '{product.name}' deleted successfully."}


@app.get("/api/products/categories", response_model=list[str])
def get_categories(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Return a list of unique product categories."""
    rows = db.query(models.Product.category).distinct().all()
    return [r[0] for r in rows]


# ═══════════════════════════════════════════════════════════════
# 3. SALES MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.post("/api/sales", response_model=schemas.SaleBase)
def record_sale(
    sale_data: schemas.SaleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Record a new sale transaction. Auto-updates product quantity and inventory."""
    product = db.query(models.Product).filter(models.Product.id == sale_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if product.quantity < sale_data.quantity_sold:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {product.quantity}")

    total_price = product.price * sale_data.quantity_sold

    new_sale = models.Sale(
        product_id=sale_data.product_id,
        quantity_sold=sale_data.quantity_sold,
        sale_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        total_price=total_price,
        recorded_by=current_user.email
    )
    db.add(new_sale)

    # Auto-deduct from product quantity
    product.quantity -= sale_data.quantity_sold

    # Auto-update inventory
    inv = db.query(models.Inventory).filter(models.Inventory.product_id == sale_data.product_id).first()
    if inv:
        inv.stock_level = product.quantity
        inv.last_updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()
    db.refresh(new_sale)
    return new_sale


@app.get("/api/sales", response_model=list[schemas.SaleWithProduct])
def get_sales(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """List all sales with product names."""
    sales = db.query(models.Sale).order_by(models.Sale.id.desc()).all()
    result = []
    for s in sales:
        product = db.query(models.Product).filter(models.Product.id == s.product_id).first()
        result.append(schemas.SaleWithProduct(
            id=s.id,
            product_id=s.product_id,
            quantity_sold=s.quantity_sold,
            sale_date=s.sale_date,
            total_price=s.total_price,
            recorded_by=s.recorded_by,
            product_name=product.name if product else "Deleted Product",
            product_category=product.category if product else "N/A"
        ))
    return result


@app.get("/api/sales/history", response_model=list[schemas.MonthlySales])
def get_sales_history(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get monthly aggregated sales history for charts."""
    sales = db.query(models.Sale).order_by(models.Sale.sale_date.asc()).all()

    monthly = {}
    for s in sales:
        # Extract YYYY-MM from sale_date
        month_key = s.sale_date[:7]
        if month_key not in monthly:
            monthly[month_key] = {"total_sold": 0, "total_revenue": 0.0}
        monthly[month_key]["total_sold"] += s.quantity_sold
        monthly[month_key]["total_revenue"] += s.total_price

    return [
        schemas.MonthlySales(month=k, total_sold=v["total_sold"], total_revenue=round(v["total_revenue"], 2))
        for k, v in sorted(monthly.items())
    ]


# ═══════════════════════════════════════════════════════════════
# 4. INVENTORY TRACKING ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/inventory", response_model=list[schemas.InventoryBase])
def get_inventory(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """List all inventory records."""
    return db.query(models.Inventory).all()


@app.get("/api/inventory/alerts", response_model=list[schemas.InventoryAlert])
def get_inventory_alerts(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get products where stock_level <= reorder_level (low stock alerts)."""
    products = db.query(models.Product).all()
    alerts = []
    for p in products:
        inv = db.query(models.Inventory).filter(models.Inventory.product_id == p.id).first()
        stock = inv.stock_level if inv else p.quantity
        if stock <= p.reorder_level:
            alerts.append(schemas.InventoryAlert(
                product_id=p.id,
                product_name=p.name,
                category=p.category,
                stock_level=stock,
                reorder_level=p.reorder_level,
                deficit=p.reorder_level - stock
            ))
    return sorted(alerts, key=lambda x: x.deficit, reverse=True)


# ═══════════════════════════════════════════════════════════════
# 5. DASHBOARD & ANALYTICS ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get key dashboard statistics."""
    total_products = db.query(models.Product).count()
    total_sales = db.query(models.Sale).count()
    total_revenue = db.query(func.sum(models.Sale.total_price)).scalar() or 0.0

    # Count low-stock items
    products = db.query(models.Product).all()
    low_stock = 0
    total_stock_value = 0.0
    for p in products:
        inv = db.query(models.Inventory).filter(models.Inventory.product_id == p.id).first()
        stock = inv.stock_level if inv else p.quantity
        if stock <= p.reorder_level:
            low_stock += 1
        total_stock_value += p.price * stock

    categories = db.query(models.Product.category).distinct().count()

    return schemas.DashboardStats(
        total_products=total_products,
        total_sales=total_sales,
        total_revenue=round(total_revenue, 2),
        low_stock_count=low_stock,
        total_stock_value=round(total_stock_value, 2),
        categories_count=categories
    )


@app.get("/api/dashboard/category-sales", response_model=list[schemas.CategorySales])
def get_category_sales(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get sales aggregated by product category for charts."""
    sales = db.query(models.Sale).all()
    cat_map = {}
    for s in sales:
        product = db.query(models.Product).filter(models.Product.id == s.product_id).first()
        cat = product.category if product else "Unknown"
        if cat not in cat_map:
            cat_map[cat] = {"total_sold": 0, "total_revenue": 0.0}
        cat_map[cat]["total_sold"] += s.quantity_sold
        cat_map[cat]["total_revenue"] += s.total_price

    return [
        schemas.CategorySales(category=k, total_sold=v["total_sold"], total_revenue=round(v["total_revenue"], 2))
        for k, v in cat_map.items()
    ]


# ═══════════════════════════════════════════════════════════════
# 6. AI PREDICTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/ai/demand-forecast", response_model=list[schemas.CategoryForecast])
def get_demand_forecast(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """AI-powered demand forecast per product category."""
    sales = db.query(models.Sale).order_by(models.Sale.sale_date.asc()).all()

    # Build monthly totals per category
    cat_monthly = {}
    for s in sales:
        product = db.query(models.Product).filter(models.Product.id == s.product_id).first()
        cat = product.category if product else "Unknown"
        month_key = s.sale_date[:7]
        if cat not in cat_monthly:
            cat_monthly[cat] = {}
        if month_key not in cat_monthly[cat]:
            cat_monthly[cat][month_key] = 0
        cat_monthly[cat][month_key] += s.quantity_sold

    results = []
    for category, month_data in cat_monthly.items():
        sorted_months = sorted(month_data.items())
        historical_values = [v for _, v in sorted_months]
        month_labels = [m for m, _ in sorted_months]

        forecasts = []
        # Historical data points
        for m, v in sorted_months:
            forecasts.append(schemas.DemandForecastItem(month=m, predicted_demand=float(v), type="Historical"))

        # AI forecast next 3 months
        if len(historical_values) >= 3:
            predicted = ml_core.predict_demand(historical_values, forecast_months=3)
            # Generate future month labels
            last_month = month_labels[-1]
            last_dt = datetime.strptime(last_month, "%Y-%m")
            for i, pred_val in enumerate(predicted):
                year = last_dt.year + (last_dt.month + i) // 12
                month = (last_dt.month + i) % 12 + 1
                future_label = f"{year}-{month:02d}"
                forecasts.append(schemas.DemandForecastItem(
                    month=future_label, predicted_demand=round(pred_val, 1), type="AI Forecasted"
                ))

        results.append(schemas.CategoryForecast(category=category, forecasts=forecasts))

    return results


@app.get("/api/ai/reorder-suggestions", response_model=list[schemas.ReorderSuggestion])
def get_reorder_suggestions(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """AI-powered reorder quantity suggestions."""
    products = db.query(models.Product).all()
    suggestions = []

    for p in products:
        inv = db.query(models.Inventory).filter(models.Inventory.product_id == p.id).first()
        current_stock = inv.stock_level if inv else p.quantity

        # Get historical monthly sales for this product
        sales = db.query(models.Sale).filter(models.Sale.product_id == p.id).order_by(models.Sale.sale_date.asc()).all()
        monthly_sales = {}
        for s in sales:
            month_key = s.sale_date[:7]
            monthly_sales[month_key] = monthly_sales.get(month_key, 0) + s.quantity_sold

        sorted_values = [v for _, v in sorted(monthly_sales.items())]

        # Predict next month demand
        if len(sorted_values) >= 3:
            predicted = ml_core.predict_demand(sorted_values, forecast_months=1)
            next_demand = max(predicted[0], 0)
        elif sorted_values:
            next_demand = sum(sorted_values) / len(sorted_values)
        else:
            next_demand = p.reorder_level * 1.5

        # Calculate reorder quantity
        suggested_qty = max(0, int(next_demand * 1.3 - current_stock))

        # Determine urgency
        if current_stock == 0:
            urgency = "Critical"
        elif current_stock <= p.reorder_level * 0.5:
            urgency = "High"
        elif current_stock <= p.reorder_level:
            urgency = "Medium"
        else:
            urgency = "Low"

        suggestions.append(schemas.ReorderSuggestion(
            product_id=p.id,
            product_name=p.name,
            category=p.category,
            current_stock=current_stock,
            predicted_demand_next_month=round(next_demand, 1),
            suggested_reorder_qty=suggested_qty,
            urgency=urgency
        ))

    # Sort by urgency (Critical first)
    urgency_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    suggestions.sort(key=lambda x: urgency_order.get(x.urgency, 4))
    return suggestions


# ═══════════════════════════════════════════════════════════════
# 7. REPORTS ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/reports/excel")
def export_excel_report(db: Session = Depends(get_db), current_user: models.User = Depends(auth.RoleChecker(["Admin"]))):
    """Export inventory, products, and sales data as an Excel workbook."""
    products = db.query(models.Product).all()
    sales = db.query(models.Sale).all()
    inventory = db.query(models.Inventory).all()
    purchases = db.query(models.PurchaseOrder).all()

    df_products = pd.DataFrame([{
        "ID": p.id, "Name": p.name, "Category": p.category,
        "Price": p.price, "Quantity": p.quantity,
        "Reorder Level": p.reorder_level, "Created": p.created_at
    } for p in products])

    df_sales = pd.DataFrame([{
        "Sale ID": s.id, "Product ID": s.product_id,
        "Qty Sold": s.quantity_sold, "Total Price": s.total_price,
        "Date": s.sale_date, "Recorded By": s.recorded_by
    } for s in sales])

    df_inventory = pd.DataFrame([{
        "Product ID": i.product_id, "Stock Level": i.stock_level,
        "Last Updated": i.last_updated
    } for i in inventory])

    df_purchases = pd.DataFrame([{
        "Order ID": po.id, "Product ID": po.product_id,
        "Quantity": po.quantity, "Total Cost": po.total_cost,
        "Status": po.status, "Ordered By": po.ordered_by,
        "Date": po.order_date, "Approved By": po.approved_by or ""
    } for po in purchases])

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df_products.to_excel(writer, sheet_name="Products", index=False)
        df_sales.to_excel(writer, sheet_name="Sales History", index=False)
        df_inventory.to_excel(writer, sheet_name="Inventory", index=False)
        df_purchases.to_excel(writer, sheet_name="Purchase Orders", index=False)

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=inventory_report.xlsx"}
    )


# ═══════════════════════════════════════════════════════════════
# 8. PURCHASE ORDER ENDPOINTS (User buys stock)
# ═══════════════════════════════════════════════════════════════

@app.post("/api/purchases", response_model=schemas.PurchaseOrderBase)
def create_purchase_order(
    order_data: schemas.PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Place a new purchase order to buy stock."""
    product = db.query(models.Product).filter(models.Product.id == order_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if order_data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0.")

    total_cost = product.price * order_data.quantity

    new_order = models.PurchaseOrder(
        product_id=order_data.product_id,
        quantity=order_data.quantity,
        total_cost=total_cost,
        status="Pending",
        payment_method=order_data.payment_method,
        ordered_by=current_user.email,
        order_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        notes=order_data.notes
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    return new_order


@app.get("/api/purchases", response_model=list[schemas.PurchaseOrderWithProduct])
def get_purchase_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List purchase orders. Admin/Staff see all; User sees own orders only."""
    if current_user.role in ["Admin", "Staff"]:
        orders = db.query(models.PurchaseOrder).order_by(models.PurchaseOrder.id.desc()).all()
    else:
        orders = db.query(models.PurchaseOrder).filter(
            models.PurchaseOrder.ordered_by == current_user.email
        ).order_by(models.PurchaseOrder.id.desc()).all()

    result = []
    for o in orders:
        product = db.query(models.Product).filter(models.Product.id == o.product_id).first()
        result.append(schemas.PurchaseOrderWithProduct(
            id=o.id,
            product_id=o.product_id,
            quantity=o.quantity,
            total_cost=o.total_cost,
            status=o.status,
            payment_method=o.payment_method,
            ordered_by=o.ordered_by,
            order_date=o.order_date,
            approved_by=o.approved_by,
            notes=o.notes,
            product_name=product.name if product else "Deleted Product",
            product_category=product.category if product else "N/A",
            product_price=product.price if product else 0.0
        ))
    return result


@app.put("/api/purchases/{order_id}", response_model=schemas.PurchaseOrderBase)
def update_purchase_order(
    order_id: int,
    update_data: schemas.PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.RoleChecker(["Admin"]))
):
    """Approve or reject a purchase order (Admin only). Approval adds stock to inventory."""
    order = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase order not found.")
    if order.status != "Pending":
        raise HTTPException(status_code=400, detail=f"Order already {order.status}.")
    if update_data.status not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'Approved' or 'Rejected'.")

    order.status = update_data.status
    order.approved_by = current_user.email

    # If approved, add stock to product and inventory
    if update_data.status == "Approved":
        product = db.query(models.Product).filter(models.Product.id == order.product_id).first()
        if product:
            product.quantity += order.quantity
            inv = db.query(models.Inventory).filter(models.Inventory.product_id == order.product_id).first()
            if inv:
                inv.stock_level = product.quantity
                inv.last_updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    db.commit()
    db.refresh(order)
    return order


# ═══════════════════════════════════════════════════════════════
# 9. USER MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.get("/api/users", response_model=list[schemas.UserBase])
def get_users(db: Session = Depends(get_db), current_user: models.User = Depends(auth.RoleChecker(["Admin"]))):
    """List all users (Admin only)."""
    return db.query(models.User).all()


# Health check endpoint for Render
@app.get("/")
def health_check():
    return {"status": "ok", "service": "Smart AI Inventory Management API"}

