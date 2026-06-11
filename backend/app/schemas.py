from pydantic import BaseModel
from typing import Optional, List


# ─── User Schemas ─────────────────────────────────────────────

class UserBase(BaseModel):
    id: int
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Staff"


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    name: str
    email: str
    role: str


# ─── Product Schemas ──────────────────────────────────────────

class ProductBase(BaseModel):
    id: int
    name: str
    category: str
    price: float
    quantity: int
    reorder_level: int
    created_at: str

    class Config:
        from_attributes = True


class ProductCreate(BaseModel):
    name: str
    category: str
    price: float
    quantity: int
    reorder_level: int = 10


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    reorder_level: Optional[int] = None


# ─── Sale Schemas ─────────────────────────────────────────────

class SaleBase(BaseModel):
    id: int
    product_id: int
    quantity_sold: int
    sale_date: str
    total_price: float
    recorded_by: Optional[str] = None

    class Config:
        from_attributes = True


class SaleCreate(BaseModel):
    product_id: int
    quantity_sold: int


class SaleWithProduct(SaleBase):
    product_name: Optional[str] = None
    product_category: Optional[str] = None


# ─── Inventory Schemas ────────────────────────────────────────

class InventoryBase(BaseModel):
    id: int
    product_id: int
    stock_level: int
    last_updated: str

    class Config:
        from_attributes = True


class InventoryAlert(BaseModel):
    product_id: int
    product_name: str
    category: str
    stock_level: int
    reorder_level: int
    deficit: int


# ─── Dashboard Schemas ────────────────────────────────────────

class DashboardStats(BaseModel):
    total_products: int
    total_sales: int
    total_revenue: float
    low_stock_count: int
    total_stock_value: float
    categories_count: int


class CategorySales(BaseModel):
    category: str
    total_sold: int
    total_revenue: float


class MonthlySales(BaseModel):
    month: str
    total_sold: int
    total_revenue: float


# ─── AI Prediction Schemas ────────────────────────────────────

class DemandForecastItem(BaseModel):
    month: str
    predicted_demand: float
    type: str  # "Historical" or "AI Forecasted"


class CategoryForecast(BaseModel):
    category: str
    forecasts: List[DemandForecastItem]


class ReorderSuggestion(BaseModel):
    product_id: int
    product_name: str
    category: str
    current_stock: int
    predicted_demand_next_month: float
    suggested_reorder_qty: int
    urgency: str  # "Critical", "High", "Medium", "Low"


# --- Purchase Order Schemas -----------------------------------------

class PurchaseOrderBase(BaseModel):
    id: int
    product_id: int
    quantity: int
    total_cost: float
    status: str
    payment_method: str
    ordered_by: str
    order_date: str
    approved_by: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class PurchaseOrderCreate(BaseModel):
    product_id: int
    quantity: int
    payment_method: str = "UPI"
    notes: Optional[str] = None


class PurchaseOrderUpdate(BaseModel):
    status: str  # "Approved" or "Rejected"


class PurchaseOrderWithProduct(PurchaseOrderBase):
    product_name: Optional[str] = None
    product_category: Optional[str] = None
    product_price: Optional[float] = None

