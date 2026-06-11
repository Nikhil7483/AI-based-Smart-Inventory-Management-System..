from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    """System user — Admin, Staff, or User role."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Staff")  # Admin, Staff, or User


class Product(Base):
    """Product catalog entry."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=10)
    created_at = Column(String, nullable=False)

    # Relationships
    inventory = relationship("Inventory", back_populates="product", uselist=False, cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="product")
    purchase_orders = relationship("PurchaseOrder", back_populates="product")


class Sale(Base):
    """Individual sale transaction."""
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity_sold = Column(Integer, nullable=False)
    sale_date = Column(String, nullable=False)
    total_price = Column(Float, nullable=False)
    recorded_by = Column(String, nullable=True)  # username who recorded it

    # Relationships
    product = relationship("Product", back_populates="sales")


class Inventory(Base):
    """Real-time inventory tracking per product."""
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), unique=True, nullable=False)
    stock_level = Column(Integer, nullable=False, default=0)
    last_updated = Column(String, nullable=False)

    # Relationships
    product = relationship("Product", back_populates="inventory")


class PurchaseOrder(Base):
    """Stock purchase/procurement order placed by a User."""
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Integer, nullable=False)
    total_cost = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="Pending")  # Pending, Approved, Rejected
    payment_method = Column(String, nullable=False, default="UPI")  # UPI, Credit Card, Debit Card, Net Banking, Cash
    ordered_by = Column(String, nullable=False)  # email of the user
    order_date = Column(String, nullable=False)
    approved_by = Column(String, nullable=True)  # email of admin who approved/rejected
    notes = Column(String, nullable=True)

    # Relationships
    product = relationship("Product", back_populates="purchase_orders")

