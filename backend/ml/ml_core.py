"""
AI Module — Demand Prediction & Reorder Optimization
Uses scikit-learn LinearRegression with lag features to forecast
future product demand from historical monthly sales data.
"""

import os
import joblib
import numpy as np
from sklearn.linear_model import LinearRegression

# Model storage directory
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

DEMAND_MODEL_PATH = os.path.join(MODELS_DIR, "demand_model.joblib")


def generate_training_data(n_months=36):
    """
    Generate synthetic monthly sales data with trend, seasonality, and noise.
    Simulates a realistic retail demand pattern for model training.
    """
    np.random.seed(42)
    base_demand = 80.0
    trend = 2.0  # units per month growth

    usages = []
    for i in range(n_months):
        # Seasonal cycle (peaks at month 6 and 12 — summer and holiday)
        seasonality = np.sin(i * (2 * np.pi / 12)) * 20.0
        holiday_bump = 15.0 if (i % 12) in [10, 11] else 0.0  # Nov-Dec bump
        noise = np.random.normal(0, 8.0)
        demand = base_demand + (trend * i) + seasonality + holiday_bump + noise
        usages.append(max(round(demand, 2), 5.0))  # floor at 5 units

    return usages


def train_and_save_model():
    """Train the demand forecasting model using synthetic lag features."""
    print("Training AI demand forecasting model...")

    data = generate_training_data()
    n = len(data)

    # Create lag features (lag-1, lag-2, lag-3)
    X, y = [], []
    for i in range(3, n):
        X.append([i, data[i - 1], data[i - 2], data[i - 3]])
        y.append(data[i])

    X = np.array(X)
    y = np.array(y)

    model = LinearRegression()
    model.fit(X, y)

    joblib.dump(model, DEMAND_MODEL_PATH)
    print(f"Demand model saved to {DEMAND_MODEL_PATH}")


# Auto-train on module import if model is missing
if not os.path.exists(DEMAND_MODEL_PATH):
    train_and_save_model()


def predict_demand(historical_monthly_sales: list, forecast_months: int = 3) -> list:
    """
    Predict future monthly demand based on historical sales data.

    Args:
        historical_monthly_sales: List of monthly sales quantities (oldest first).
        forecast_months: Number of future months to predict.

    Returns:
        List of predicted demand values.
    """
    try:
        model = joblib.load(DEMAND_MODEL_PATH)
        data = list(historical_monthly_sales)
        n_history = len(data)

        # Need at least 3 data points for lag features
        if n_history < 3:
            avg = sum(data) / len(data) if data else 10
            return [round(avg * (1.05 ** (i + 1)), 1) for i in range(forecast_months)]

        forecasts = []
        for i in range(forecast_months):
            month_idx = n_history + i
            lag_1 = data[-1]
            lag_2 = data[-2]
            lag_3 = data[-3]

            features = np.array([[month_idx, lag_1, lag_2, lag_3]])
            predicted = model.predict(features)[0]
            predicted = max(predicted, 0)  # no negative demand
            forecasts.append(round(float(predicted), 1))
            data.append(predicted)

        return forecasts

    except Exception as e:
        print(f"Demand prediction error: {e}")
        # Fallback: simple moving average with 5% growth
        if historical_monthly_sales:
            last_3 = historical_monthly_sales[-3:] if len(historical_monthly_sales) >= 3 else historical_monthly_sales
            avg = sum(last_3) / len(last_3)
            return [round(avg * (1.05 ** (i + 1)), 1) for i in range(forecast_months)]
        return [10.0] * forecast_months


def verify_models():
    """Verify that all ML models are present."""
    if not os.path.exists(DEMAND_MODEL_PATH):
        train_and_save_model()
    print("AI demand forecasting model verified successfully.")
