# Smart AI-Based Inventory Management System

An intelligent inventory management platform powered by **Machine Learning** for demand forecasting and automated reorder suggestions. Built with FastAPI, SQLite, scikit-learn, and a premium dark-mode SPA frontend.

---

## 🏗️ Technical Stack

- **Backend**: **FastAPI** (ASGI), **SQLAlchemy** ORM, **SQLite** database
- **Frontend**: **HTML/CSS/JavaScript** SPA with **Chart.js** visualizations
- **AI Module**: **scikit-learn** LinearRegression for demand prediction
- **Auth**: JWT tokens with role-based access control (Admin / Staff)

---

## 📂 Project Structure

```
jaya/
├── backend/
│   ├── app/
│   │   ├── database.py     # SQLAlchemy engine & session
│   │   ├── models.py       # ORM models (User, Product, Sale, Inventory)
│   │   ├── schemas.py      # Pydantic request/response schemas
│   │   ├── auth.py         # JWT auth & role-based access
│   │   └── main.py         # FastAPI routes (all endpoints)
│   ├── ml/
│   │   └── ml_core.py      # AI demand forecasting module
│   ├── data/               # SQLite DB & ML models (auto-generated)
│   ├── seed.py             # Database seeder with demo data
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── index.html          # SPA shell
│   ├── styles.css          # Premium dark-mode design
│   └── app.js              # Client-side application logic
└── README.md
```

---

## 🚀 Getting Started

### Step 1: Install Python Dependencies
```bash
pip install -r backend/requirements.txt
```

### Step 2: Seed the Database
```bash
python backend/seed.py
```

### Step 3: Start the Server
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000** in your browser.

---

## 👤 Test Login Credentials

| Role  | Email                  | Password   |
|-------|------------------------|------------|
| Admin | `admin@inventory.com`  | `admin123` |
| Staff | `staff@inventory.com`  | `staff123` |

---

## 🤖 AI Module

The AI module uses **Linear Regression** with lag features to:
- Analyze historical monthly sales patterns
- Predict future demand per product category (3 months ahead)
- Suggest optimal reorder quantities with urgency levels (Critical → Low)

Models are trained automatically on first startup using synthetic data with trend, seasonality, and noise.

---

## 📋 Features

- ✅ Secure JWT authentication with role-based access
- ✅ Full product CRUD (Admin) with search & category filtering
- ✅ Sales recording with automatic inventory deduction
- ✅ Real-time inventory tracking with color-coded status bars
- ✅ AI-powered demand forecasting per category
- ✅ Smart reorder suggestions with urgency indicators
- ✅ Low-stock alert system with notifications
- ✅ Interactive dashboard with Chart.js visualizations
- ✅ Excel report export
- ✅ Premium dark-mode responsive UI
