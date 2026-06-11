/**
 * Smart AI-Based Inventory Management System — Client Application
 * Single Page Application with hash-based routing, JWT auth, and Chart.js visuals.
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION & STATE
// ═══════════════════════════════════════════════════════════════

// API Base URL — Update RENDER_BACKEND_URL after deploying backend to Render
const RENDER_BACKEND_URL = "https://YOUR_RENDER_SERVICE_NAME.onrender.com";
const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const API_BASE = isLocal
    ? window.location.origin + "/api"
    : RENDER_BACKEND_URL + "/api";
const APP_STATE = {
    token: localStorage.getItem("inv_token") || null,
    user: JSON.parse(localStorage.getItem("inv_user") || "null"),
    products: [],
    charts: {},
};

// Category color palette for charts
const CATEGORY_COLORS = {
    "Electronics": { bg: "rgba(59, 130, 246, 0.7)", border: "#3b82f6" },
    "Clothing": { bg: "rgba(139, 92, 246, 0.7)", border: "#8b5cf6" },
    "Food": { bg: "rgba(16, 185, 129, 0.7)", border: "#10b981" },
    "Furniture": { bg: "rgba(245, 158, 11, 0.7)", border: "#f59e0b" },
    "Stationery": { bg: "rgba(6, 182, 212, 0.7)", border: "#06b6d4" },
};

function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || { bg: "rgba(148, 163, 184, 0.7)", border: "#94a3b8" };
}

// ═══════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════

async function apiFetch(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (APP_STATE.token) {
        headers["Authorization"] = `Bearer ${APP_STATE.token}`;
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (res.status === 401) {
            logout();
            return null;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Request failed" }));
            throw new Error(err.detail || "Request failed");
        }
        // Handle blob responses (excel)
        if (res.headers.get("content-type")?.includes("spreadsheet")) {
            return await res.blob();
        }
        return await res.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

const loginPage = document.getElementById("login-page");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        const data = await apiFetch("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
        if (data) {
            APP_STATE.token = data.access_token;
            APP_STATE.user = { name: data.name, email: data.email, role: data.role };
            localStorage.setItem("inv_token", data.access_token);
            localStorage.setItem("inv_user", JSON.stringify(APP_STATE.user));
            showApp();
        }
    } catch (err) {
        loginError.textContent = err.message;
    }
});

function logout() {
    APP_STATE.token = null;
    APP_STATE.user = null;
    localStorage.removeItem("inv_token");
    localStorage.removeItem("inv_user");
    loginPage.classList.remove("hidden");
    appShell.classList.add("hidden");
    loginForm.reset();
    loginError.textContent = "";
}

document.getElementById("logout-btn").addEventListener("click", logout);

function showApp() {
    loginPage.classList.add("hidden");
    appShell.classList.remove("hidden");

    // Update user info in sidebar
    const user = APP_STATE.user;
    document.getElementById("user-name").textContent = user.name;
    document.getElementById("user-role").textContent = user.role;
    document.getElementById("user-avatar").textContent = user.name.charAt(0).toUpperCase();

    const isAdmin = user.role === "Admin";
    const isStaff = user.role === "Staff";
    const isUser = user.role === "User";

    // Show admin-only elements
    document.getElementById("add-product-btn").classList.toggle("hidden", !isAdmin);
    document.getElementById("products-actions-header").classList.toggle("hidden", !isAdmin);
    document.getElementById("export-btn").classList.toggle("hidden", !isAdmin);

    // Role-based nav visibility
    // Admin & Staff: see everything
    // User: Dashboard, Products (browse), Purchase Stock, My Orders
    const adminStaffOnly = ["nav-sales", "nav-inventory", "nav-predictions", "nav-alerts"];
    adminStaffOnly.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", isUser);
    });

    // Admin can approve/reject orders
    document.getElementById("orders-actions-header").classList.toggle("hidden", !isAdmin);

    // Hide stock columns from User role
    ["th-quantity", "th-reorder", "th-status"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", isUser);
    });

    // Navigate to current hash or default
    const defaultPage = isUser ? "purchase" : "dashboard";
    navigateTo(window.location.hash.slice(1) || defaultPage);
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION / ROUTING
// ═══════════════════════════════════════════════════════════════

const PAGE_TITLES = {
    dashboard: "Dashboard",
    products: "Product Management",
    sales: "Sales Management",
    inventory: "Inventory Tracking",
    predictions: "AI Predictions",
    purchase: "Purchase Stock",
    orders: "My Orders",
    alerts: "Stock Alerts",
};

function navigateTo(page) {
    if (!PAGE_TITLES[page]) page = "dashboard";

    // Update nav active state
    document.querySelectorAll(".nav-item").forEach((el) => {
        el.classList.toggle("active", el.dataset.page === page);
    });

    // Show page
    document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) pageEl.classList.add("active");

    // Update title
    document.getElementById("page-title").textContent = PAGE_TITLES[page];

    // Load page data
    loadPageData(page);

    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", (e) => {
        e.preventDefault();
        const page = el.dataset.page;
        window.location.hash = page;
        navigateTo(page);
    });
});

window.addEventListener("hashchange", () => {
    navigateTo(window.location.hash.slice(1) || "dashboard");
});

// Mobile menu
document.getElementById("menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});
document.getElementById("sidebar-close").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
});

// ═══════════════════════════════════════════════════════════════
// PAGE DATA LOADERS
// ═══════════════════════════════════════════════════════════════

async function loadPageData(page) {
    try {
        switch (page) {
            case "dashboard": await loadDashboard(); break;
            case "products": await loadProducts(); break;
            case "sales": await loadSales(); break;
            case "inventory": await loadInventory(); break;
            case "predictions": await loadPredictions(); break;
            case "purchase": await loadPurchase(); break;
            case "orders": await loadOrders(); break;
            case "alerts": await loadAlerts(); break;
        }
    } catch (err) {
        console.error(`Error loading ${page}:`, err);
    }
}

// ─── Dashboard ─────────────────────────────────────────────────

async function loadDashboard() {
    const isUser = APP_STATE.user?.role === "User";

    // Toggle dashboard views
    document.getElementById("admin-dashboard").classList.toggle("hidden", isUser);
    document.getElementById("user-dashboard").classList.toggle("hidden", !isUser);

    if (isUser) {
        await loadUserDashboard();
    } else {
        await loadAdminDashboard();
    }
}

async function loadUserDashboard() {
    // Set welcome name
    document.getElementById("welcome-user-name").textContent = APP_STATE.user?.name || "User";

    // Fetch user's orders
    const orders = await apiFetch("/purchases");
    if (!orders) return;

    const total = orders.length;
    const pending = orders.filter((o) => o.status === "Pending").length;
    const approved = orders.filter((o) => o.status === "Approved").length;
    const totalSpent = orders.reduce((sum, o) => sum + o.total_cost, 0);

    // Animate stats
    animateCounter("ustat-total", total);
    animateCounter("ustat-pending", pending);
    animateCounter("ustat-approved", approved);

    // Animate total spent with Rs prefix
    const spentEl = document.getElementById("ustat-spent");
    if (spentEl) {
        let current = 0;
        const step = Math.max(1, Math.ceil(totalSpent / 40));
        const timer = setInterval(() => {
            current += step;
            if (current >= totalSpent) { current = totalSpent; clearInterval(timer); }
            spentEl.textContent = "Rs" + current.toLocaleString("en-IN");
        }, 30);
    }

    // Render recent orders (last 5)
    const recent = orders.slice(0, 5);
    const tbody = document.getElementById("user-recent-tbody");

    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No orders yet. Start by purchasing stock!</td></tr>';
        return;
    }

    tbody.innerHTML = recent.map((o) => {
        const statusClass = o.status.toLowerCase();
        const payBadgeClass = getPaymentBadgeClass(o.payment_method);
        return `<tr>
            <td>#${o.id}</td>
            <td style="font-weight:600;">${escapeHtml(o.product_name)}</td>
            <td>${o.quantity}</td>
            <td>Rs${o.total_cost.toLocaleString("en-IN")}</td>
            <td><span class="payment-method-badge ${payBadgeClass}">${escapeHtml(o.payment_method)}</span></td>
            <td><span class="status-badge ${statusClass}"><span class="status-dot"></span>${o.status}</span></td>
            <td>${formatDate(o.order_date)}</td>
        </tr>`;
    }).join("");
}

async function loadAdminDashboard() {
    const [stats, monthlySales, categorySales] = await Promise.all([
        apiFetch("/dashboard/stats"),
        apiFetch("/sales/history"),
        apiFetch("/dashboard/category-sales"),
    ]);

    if (!stats) return;

    // Animated counters
    animateCounter("stat-products", stats.total_products);
    animateCounter("stat-sales", stats.total_sales);
    animateCounter("stat-lowstock", stats.low_stock_count);
    animateRevenueCounter("stat-revenue", stats.total_revenue);

    // Update alert badge
    const badge = document.getElementById("alert-badge");
    if (stats.low_stock_count > 0) {
        badge.classList.remove("hidden");
        badge.textContent = stats.low_stock_count;
    } else {
        badge.classList.add("hidden");
    }

    // Monthly Sales Trend Chart
    if (monthlySales && monthlySales.length > 0) {
        renderChart("chart-sales-trend", "line", {
            labels: monthlySales.map((m) => m.month),
            datasets: [
                {
                    label: "Units Sold",
                    data: monthlySales.map((m) => m.total_sold),
                    borderColor: "#3b82f6",
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#3b82f6",
                    pointBorderWidth: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
                {
                    label: "Revenue (₹)",
                    data: monthlySales.map((m) => m.total_revenue),
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.05)",
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: "#10b981",
                    pointBorderWidth: 0,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: "y1",
                },
            ],
        }, {
            plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter", size: 11 } } } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 } } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 } }, title: { display: true, text: "Units", color: "#64748b", font: { family: "Inter", size: 10 } } },
                y1: { position: "right", grid: { display: false }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 } }, title: { display: true, text: "Revenue (₹)", color: "#64748b", font: { family: "Inter", size: 10 } } },
            },
        });
    }

    // Category Doughnut
    if (categorySales && categorySales.length > 0) {
        const cats = categorySales;
        renderChart("chart-category", "doughnut", {
            labels: cats.map((c) => c.category),
            datasets: [{
                data: cats.map((c) => c.total_revenue),
                backgroundColor: cats.map((c) => getCategoryColor(c.category).bg),
                borderColor: cats.map((c) => getCategoryColor(c.category).border),
                borderWidth: 2,
                hoverOffset: 8,
            }],
        }, {
            plugins: {
                legend: { position: "bottom", labels: { color: "#94a3b8", padding: 14, font: { family: "Inter", size: 11 } } },
            },
            cutout: "65%",
        });
    }

    // Stock Value Bar Chart
    const products = await apiFetch("/products");
    if (products && products.length > 0) {
        const sorted = [...products].sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity)).slice(0, 10);
        renderChart("chart-stock-value", "bar", {
            labels: sorted.map((p) => p.name.length > 20 ? p.name.substring(0, 20) + "…" : p.name),
            datasets: [{
                label: "Stock Value (₹)",
                data: sorted.map((p) => p.price * p.quantity),
                backgroundColor: sorted.map((p) => getCategoryColor(p.category).bg),
                borderColor: sorted.map((p) => getCategoryColor(p.category).border),
                borderWidth: 1,
                borderRadius: 6,
            }],
        }, {
            indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 }, callback: (v) => "₹" + v.toLocaleString() } },
                y: { grid: { display: false }, ticks: { color: "#94a3b8", font: { family: "Inter", size: 11 } } },
            },
        });
    }
}

// Animated number counter
function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current;
    }, 30);
}

function animateRevenueCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = "₹" + current.toLocaleString("en-IN");
    }, 30);
}

// ─── Products ──────────────────────────────────────────────────

async function loadProducts() {
    const products = await apiFetch("/products");
    if (!products) return;
    APP_STATE.products = products;

    // Populate category filter
    const categories = [...new Set(products.map((p) => p.category))];
    const catFilter = document.getElementById("category-filter");
    catFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach((c) => {
        catFilter.innerHTML += `<option value="${c}">${c}</option>`;
    });

    renderProductsTable(products);
}

function renderProductsTable(products) {
    const tbody = document.getElementById("products-tbody");
    const isAdmin = APP_STATE.user?.role === "Admin";
    const isUser = APP_STATE.user?.role === "User";

    if (products.length === 0) {
        const cols = isUser ? 4 : (isAdmin ? 8 : 7);
        tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:40px;color:var(--text-muted);">No products found.</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map((p) => {
        let statusClass, statusText;
        if (p.quantity === 0) { statusClass = "out-of-stock"; statusText = "Out of Stock"; }
        else if (p.quantity <= p.reorder_level) { statusClass = "low-stock"; statusText = "Low Stock"; }
        else { statusClass = "in-stock"; statusText = "In Stock"; }

        return `<tr>
            <td>#${p.id}</td>
            <td style="font-weight:600;">${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category)}</td>
            <td>Rs${p.price.toLocaleString("en-IN")}</td>
            ${!isUser ? `<td>${p.quantity}</td>
            <td>${p.reorder_level}</td>
            <td><span class="status-badge ${statusClass}"><span class="status-dot"></span>${statusText}</span></td>` : ""}
            ${isAdmin ? `<td class="cell-actions">
                <button class="btn-icon edit" onclick="openEditProduct(${p.id})" title="Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon danger" onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>` : ""}
        </tr>`;
    }).join("");
}

// Search & filter
let searchTimeout;
document.getElementById("product-search").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => filterProducts(), 300);
});
document.getElementById("category-filter").addEventListener("change", filterProducts);

function filterProducts() {
    const query = document.getElementById("product-search").value.toLowerCase();
    const category = document.getElementById("category-filter").value;
    let filtered = APP_STATE.products;
    if (query) {
        filtered = filtered.filter((p) =>
            p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query)
        );
    }
    if (category) {
        filtered = filtered.filter((p) => p.category === category);
    }
    renderProductsTable(filtered);
}

// ─── Product CRUD Modal ────────────────────────────────────────

const productModal = document.getElementById("product-modal");
const productForm = document.getElementById("product-form");

document.getElementById("add-product-btn").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "Add New Product";
    document.getElementById("edit-product-id").value = "";
    productForm.reset();
    document.getElementById("prod-reorder").value = "10";
    productModal.classList.remove("hidden");
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
productModal.addEventListener("click", (e) => { if (e.target === productModal) closeModal(); });

function closeModal() { productModal.classList.add("hidden"); }

window.openEditProduct = function (id) {
    const product = APP_STATE.products.find((p) => p.id === id);
    if (!product) return;
    document.getElementById("modal-title").textContent = "Edit Product";
    document.getElementById("edit-product-id").value = id;
    document.getElementById("prod-name").value = product.name;
    document.getElementById("prod-category").value = product.category;
    document.getElementById("prod-price").value = product.price;
    document.getElementById("prod-quantity").value = product.quantity;
    document.getElementById("prod-reorder").value = product.reorder_level;
    productModal.classList.remove("hidden");
};

productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("edit-product-id").value;
    const payload = {
        name: document.getElementById("prod-name").value.trim(),
        category: document.getElementById("prod-category").value.trim(),
        price: parseFloat(document.getElementById("prod-price").value),
        quantity: parseInt(document.getElementById("prod-quantity").value),
        reorder_level: parseInt(document.getElementById("prod-reorder").value),
    };

    try {
        if (editId) {
            await apiFetch(`/products/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
            showToast("Product updated successfully", "success");
        } else {
            await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
            showToast("Product added successfully", "success");
        }
        closeModal();
        await loadProducts();
    } catch (err) {
        showToast(err.message, "error");
    }
});

window.deleteProduct = async function (id, name) {
    if (!confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    try {
        await apiFetch(`/products/${id}`, { method: "DELETE" });
        showToast(`"${name}" deleted`, "success");
        await loadProducts();
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ─── Sales ─────────────────────────────────────────────────────

async function loadSales() {
    const [sales, products] = await Promise.all([
        apiFetch("/sales"),
        apiFetch("/products"),
    ]);
    if (!products) return;

    // Populate product select
    const select = document.getElementById("sale-product");
    select.innerHTML = '<option value="">Select product...</option>';
    products.forEach((p) => {
        select.innerHTML += `<option value="${p.id}" data-price="${p.price}" data-qty="${p.quantity}">${p.name} (Stock: ${p.quantity})</option>`;
    });

    // Render sales table
    const tbody = document.getElementById("sales-tbody");
    if (!sales || sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No sales recorded yet.</td></tr>';
    } else {
        tbody.innerHTML = sales.map((s) => `<tr>
            <td>#${s.id}</td>
            <td style="font-weight:600;">${escapeHtml(s.product_name)}</td>
            <td>${escapeHtml(s.product_category)}</td>
            <td>${s.quantity_sold}</td>
            <td>₹${s.total_price.toLocaleString("en-IN")}</td>
            <td>${formatDate(s.sale_date)}</td>
            <td>${escapeHtml(s.recorded_by || "—")}</td>
        </tr>`).join("");
    }
}

// Real-time price calculation
document.getElementById("sale-product").addEventListener("change", updateSaleTotal);
document.getElementById("sale-qty").addEventListener("input", updateSaleTotal);

function updateSaleTotal() {
    const select = document.getElementById("sale-product");
    const qty = parseInt(document.getElementById("sale-qty").value) || 0;
    const option = select.options[select.selectedIndex];
    const price = parseFloat(option?.dataset?.price || 0);
    document.getElementById("sale-total").textContent = "₹" + (price * qty).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

document.getElementById("sale-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const productId = parseInt(document.getElementById("sale-product").value);
    const qty = parseInt(document.getElementById("sale-qty").value);

    if (!productId || !qty) {
        showToast("Please select a product and quantity", "warning");
        return;
    }

    try {
        await apiFetch("/sales", {
            method: "POST",
            body: JSON.stringify({ product_id: productId, quantity_sold: qty }),
        });
        showToast("Sale recorded successfully!", "success");
        document.getElementById("sale-form").reset();
        document.getElementById("sale-total").textContent = "₹0.00";
        await loadSales();
    } catch (err) {
        showToast(err.message, "error");
    }
});

// ─── Inventory ─────────────────────────────────────────────────

async function loadInventory() {
    const [inventory, products] = await Promise.all([
        apiFetch("/inventory"),
        apiFetch("/products"),
    ]);
    if (!products || !inventory) return;

    const grid = document.getElementById("inventory-grid");

    const cards = products.map((p) => {
        const inv = inventory.find((i) => i.product_id === p.id);
        const stock = inv ? inv.stock_level : p.quantity;
        const maxStock = Math.max(p.quantity, p.reorder_level * 3, stock);
        const pct = Math.min(100, (stock / maxStock) * 100);

        let barClass, statusText;
        if (stock === 0) { barClass = "critical"; statusText = "Out of Stock"; }
        else if (stock <= p.reorder_level) { barClass = "warning"; statusText = "Low Stock"; }
        else { barClass = "healthy"; statusText = "Healthy"; }

        const catColor = getCategoryColor(p.category);

        return `<div class="inventory-card">
            <div class="inventory-card-header">
                <div>
                    <div class="inventory-product-name">${escapeHtml(p.name)}</div>
                    <div class="inventory-category">${escapeHtml(p.category)}</div>
                </div>
                <span class="status-badge ${barClass === 'healthy' ? 'in-stock' : barClass === 'warning' ? 'low-stock' : 'out-of-stock'}">
                    <span class="status-dot"></span>${statusText}
                </span>
            </div>
            <div class="inventory-bar-container">
                <div class="inventory-bar-bg">
                    <div class="inventory-bar ${barClass}" style="width: ${pct}%;"></div>
                </div>
            </div>
            <div class="inventory-details">
                <span>Stock: <span class="stock-value">${stock}</span> units</span>
                <span>Reorder at: ${p.reorder_level}</span>
            </div>
        </div>`;
    });

    grid.innerHTML = cards.join("");
}

// ─── AI Predictions ────────────────────────────────────────────

async function loadPredictions() {
    const [forecasts, reorder] = await Promise.all([
        apiFetch("/ai/demand-forecast"),
        apiFetch("/ai/reorder-suggestions"),
    ]);

    // Forecast charts
    const chartsContainer = document.getElementById("forecast-charts");
    chartsContainer.innerHTML = "";

    if (forecasts && forecasts.length > 0) {
        forecasts.forEach((catForecast, idx) => {
            const cardId = `forecast-chart-${idx}`;
            const catColor = getCategoryColor(catForecast.category);
            const card = document.createElement("div");
            card.className = "forecast-card";
            card.innerHTML = `
                <h4><span class="forecast-cat-dot" style="background:${catColor.border}"></span>${escapeHtml(catForecast.category)} — Demand Forecast</h4>
                <canvas id="${cardId}" height="200"></canvas>
            `;
            chartsContainer.appendChild(card);

            const historical = catForecast.forecasts.filter((f) => f.type === "Historical");
            const predicted = catForecast.forecasts.filter((f) => f.type === "AI Forecasted");

            // Build combined labels
            const allLabels = catForecast.forecasts.map((f) => f.month);
            const histData = allLabels.map((l) => {
                const item = historical.find((h) => h.month === l);
                return item ? item.predicted_demand : null;
            });
            const predData = allLabels.map((l) => {
                const item = predicted.find((p) => p.month === l);
                return item ? item.predicted_demand : null;
            });

            // Connect prediction line to last historical point
            if (historical.length > 0 && predicted.length > 0) {
                const lastHistIdx = allLabels.indexOf(historical[historical.length - 1].month);
                if (lastHistIdx >= 0) {
                    predData[lastHistIdx] = historical[historical.length - 1].predicted_demand;
                }
            }

            setTimeout(() => {
                const canvas = document.getElementById(cardId);
                if (!canvas) return;
                new Chart(canvas, {
                    type: "line",
                    data: {
                        labels: allLabels,
                        datasets: [
                            {
                                label: "Historical",
                                data: histData,
                                borderColor: catColor.border,
                                backgroundColor: catColor.bg.replace("0.7", "0.1"),
                                fill: true,
                                tension: 0.4,
                                pointRadius: 4,
                                pointBackgroundColor: catColor.border,
                                spanGaps: false,
                            },
                            {
                                label: "AI Forecast",
                                data: predData,
                                borderColor: "#f59e0b",
                                backgroundColor: "rgba(245, 158, 11, 0.08)",
                                borderDash: [6, 3],
                                fill: true,
                                tension: 0.4,
                                pointRadius: 5,
                                pointBackgroundColor: "#f59e0b",
                                pointBorderColor: "#fff",
                                pointBorderWidth: 2,
                                spanGaps: false,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { labels: { color: "#94a3b8", font: { family: "Inter", size: 11 } } },
                        },
                        scales: {
                            x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 } } },
                            y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#64748b", font: { family: "Inter", size: 10 } }, title: { display: true, text: "Units", color: "#64748b" } },
                        },
                    },
                });
            }, 50);
        });
    } else {
        chartsContainer.innerHTML = '<div class="empty-state"><p>Not enough sales data to generate forecasts. Record more sales to unlock AI predictions.</p></div>';
    }

    // Reorder suggestions
    const reorderGrid = document.getElementById("reorder-grid");
    if (reorder && reorder.length > 0) {
        reorderGrid.innerHTML = reorder.map((r) => `
            <div class="reorder-card">
                <div class="reorder-card-header">
                    <div>
                        <div class="reorder-product">${escapeHtml(r.product_name)}</div>
                        <div class="reorder-category">${escapeHtml(r.category)}</div>
                    </div>
                    <span class="urgency-badge ${r.urgency.toLowerCase()}">${r.urgency}</span>
                </div>
                <div class="reorder-stats">
                    <div class="reorder-stat">
                        <span class="reorder-stat-value">${r.current_stock}</span>
                        <span class="reorder-stat-label">Current Stock</span>
                    </div>
                    <div class="reorder-stat">
                        <span class="reorder-stat-value">${r.predicted_demand_next_month}</span>
                        <span class="reorder-stat-label">Predicted Demand</span>
                    </div>
                    <div class="reorder-stat" style="grid-column: span 2;">
                        <span class="reorder-stat-value" style="color: var(--blue); font-size: 1.3rem;">${r.suggested_reorder_qty}</span>
                        <span class="reorder-stat-label">Suggested Reorder Qty</span>
                    </div>
                </div>
            </div>
        `).join("");
    } else {
        reorderGrid.innerHTML = '<div class="empty-state"><p>No reorder suggestions available.</p></div>';
    }
}

// ─── Alerts ────────────────────────────────────────────────────

async function loadAlerts() {
    const alerts = await apiFetch("/inventory/alerts");
    const container = document.getElementById("alerts-list");

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p>All stock levels are healthy. No alerts at this time.</p>
        </div>`;
        return;
    }

    container.innerHTML = alerts.map((a) => {
        const isCritical = a.stock_level === 0;
        return `<div class="alert-card ${isCritical ? 'critical' : 'warning'}" style="animation-delay: ${alerts.indexOf(a) * 0.1}s;">
            <div class="alert-icon">${isCritical ? '🚨' : '⚠️'}</div>
            <div class="alert-content">
                <div class="alert-title">${escapeHtml(a.product_name)}</div>
                <div class="alert-desc">${escapeHtml(a.category)} — ${isCritical ? 'OUT OF STOCK! Immediate reorder required.' : `Stock below reorder level (${a.reorder_level}). Deficit: ${a.deficit} units.`}</div>
            </div>
            <div class="alert-stock">
                <span class="alert-stock-value" style="color: ${isCritical ? 'var(--rose)' : 'var(--amber)'}">${a.stock_level}</span>
                <span class="alert-stock-label">In Stock</span>
            </div>
        </div>`;
    }).join("");
}

// --- Purchase Stock ------------------------------------------------

// Payment modal state
const PAYMENT_STATE = { productId: null, productName: '', quantity: 0, unitPrice: 0 };

async function loadPurchase() {
    const products = await apiFetch("/products");
    if (!products) return;

    const catalog = document.getElementById("purchase-catalog");
    catalog.innerHTML = products.map((p) => {
        return `<div class="purchase-card">
            <div class="purchase-card-header">
                <div>
                    <div class="purchase-card-name">${escapeHtml(p.name)}</div>
                    <div class="purchase-card-cat">${escapeHtml(p.category)}</div>
                </div>
                <div class="purchase-card-price">Rs${p.price.toLocaleString("en-IN")}</div>
            </div>
            <div class="purchase-card-actions">
                <input type="number" class="purchase-qty-input" id="pqty-${p.id}" min="1" value="10" placeholder="Qty">
                <button class="btn-buy" onclick="openPaymentModal(${p.id}, '${escapeHtml(p.name)}', ${p.price})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                    Buy Stock
                </button>
            </div>
        </div>`;
    }).join("");
}

// --- Payment Modal Logic -------------------------------------------

const paymentModal = document.getElementById("payment-modal");

window.openPaymentModal = function (productId, productName, unitPrice) {
    const qtyInput = document.getElementById(`pqty-${productId}`);
    const qty = parseInt(qtyInput?.value) || 0;
    if (qty <= 0) {
        showToast("Enter a valid quantity", "warning");
        return;
    }

    // Store state
    PAYMENT_STATE.productId = productId;
    PAYMENT_STATE.productName = productName;
    PAYMENT_STATE.quantity = qty;
    PAYMENT_STATE.unitPrice = unitPrice;

    // Populate summary
    document.getElementById("pay-product-name").textContent = productName;
    document.getElementById("pay-unit-price").textContent = "Rs" + unitPrice.toLocaleString("en-IN");
    document.getElementById("pay-qty").textContent = qty;
    document.getElementById("pay-total").textContent = "Rs" + (unitPrice * qty).toLocaleString("en-IN", { minimumFractionDigits: 2 });

    // Reset payment selection to UPI
    document.querySelectorAll(".payment-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.dataset.method === "UPI");
    });
    document.querySelector('input[name="payment_method"][value="UPI"]').checked = true;

    // Show modal
    paymentModal.classList.remove("hidden");
};

// Payment option selection
document.querySelectorAll(".payment-option").forEach((opt) => {
    opt.addEventListener("click", () => {
        document.querySelectorAll(".payment-option").forEach((o) => o.classList.remove("selected"));
        opt.classList.add("selected");
        opt.querySelector("input[type=radio]").checked = true;
    });
});

// Close payment modal
function closePaymentModal() { paymentModal.classList.add("hidden"); }
document.getElementById("payment-modal-close").addEventListener("click", closePaymentModal);
document.getElementById("payment-cancel").addEventListener("click", closePaymentModal);
paymentModal.addEventListener("click", (e) => { if (e.target === paymentModal) closePaymentModal(); });

// Confirm payment
document.getElementById("payment-confirm").addEventListener("click", async () => {
    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value || "UPI";

    try {
        await apiFetch("/purchases", {
            method: "POST",
            body: JSON.stringify({
                product_id: PAYMENT_STATE.productId,
                quantity: PAYMENT_STATE.quantity,
                payment_method: selectedMethod,
                notes: `Stock purchase for ${PAYMENT_STATE.productName}`
            }),
        });
        closePaymentModal();
        showToast(`Order placed! ${PAYMENT_STATE.quantity}x ${PAYMENT_STATE.productName} via ${selectedMethod}`, "success");

        // Reset qty input
        const qtyInput = document.getElementById(`pqty-${PAYMENT_STATE.productId}`);
        if (qtyInput) qtyInput.value = "10";
    } catch (err) {
        showToast(err.message, "error");
    }
});

// --- My Orders / Purchase Orders -----------------------------------

function getPaymentBadgeClass(method) {
    const map = { "UPI": "upi", "Credit Card": "credit-card", "Debit Card": "debit-card", "Net Banking": "net-banking", "Cash": "cash" };
    return map[method] || "";
}

async function loadOrders() {
    const orders = await apiFetch("/purchases");
    const tbody = document.getElementById("orders-tbody");
    const isAdmin = APP_STATE.user?.role === "Admin";

    // Update pending orders badge
    if (orders) {
        const pending = orders.filter((o) => o.status === "Pending").length;
        const badge = document.getElementById("orders-badge");
        if (pending > 0) {
            badge.classList.remove("hidden");
            badge.textContent = pending;
        } else {
            badge.classList.add("hidden");
        }
    }

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 10 : 9}" style="text-align:center;padding:40px;color:var(--text-muted);">No purchase orders found.</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map((o) => {
        const statusClass = o.status.toLowerCase();
        const payBadgeClass = getPaymentBadgeClass(o.payment_method);
        return `<tr>
            <td>#${o.id}</td>
            <td style="font-weight:600;">${escapeHtml(o.product_name)}</td>
            <td>${escapeHtml(o.product_category)}</td>
            <td>${o.quantity}</td>
            <td>Rs${o.total_cost.toLocaleString("en-IN")}</td>
            <td><span class="payment-method-badge ${payBadgeClass}">${escapeHtml(o.payment_method)}</span></td>
            <td><span class="status-badge ${statusClass}"><span class="status-dot"></span>${o.status}</span></td>
            <td>${escapeHtml(o.ordered_by)}</td>
            <td>${formatDate(o.order_date)}</td>
            ${isAdmin ? `<td class="cell-actions">
                ${o.status === "Pending" ? `
                    <button class="btn-approve" onclick="updateOrder(${o.id}, 'Approved')">Approve</button>
                    <button class="btn-reject" onclick="updateOrder(${o.id}, 'Rejected')">Reject</button>
                ` : `<span style="font-size:0.75rem;color:var(--text-muted)">${o.approved_by ? 'by ' + escapeHtml(o.approved_by) : '—'}</span>`}
            </td>` : ""}
        </tr>`;
    }).join("");
}

window.updateOrder = async function (orderId, newStatus) {
    const action = newStatus === "Approved" ? "approve" : "reject";
    if (!confirm(`Are you sure you want to ${action} order #${orderId}?`)) return;

    try {
        await apiFetch(`/purchases/${orderId}`, {
            method: "PUT",
            body: JSON.stringify({ status: newStatus }),
        });
        showToast(`Order #${orderId} ${newStatus.toLowerCase()}!`, newStatus === "Approved" ? "success" : "warning");
        await loadOrders();
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ═══════════════════════════════════════════════════════════════
// CHART HELPER (with destroy/re-create)
// ═══════════════════════════════════════════════════════════════

function renderChart(canvasId, type, data, options = {}) {
    // Destroy existing chart instance
    if (APP_STATE.charts[canvasId]) {
        APP_STATE.charts[canvasId].destroy();
    }

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                labels: { color: "#94a3b8", font: { family: "Inter", size: 11 } },
            },
        },
    };

    APP_STATE.charts[canvasId] = new Chart(canvas, {
        type,
        data,
        options: { ...defaultOptions, ...options },
    });
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════════════════════

document.getElementById("export-btn").addEventListener("click", async () => {
    try {
        showToast("Generating Excel report...", "info");
        const res = await fetch(`${API_BASE}/reports/excel`, {
            headers: { Authorization: `Bearer ${APP_STATE.token}` },
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "inventory_report.xlsx";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Report downloaded!", "success");
    } catch (err) {
        showToast(err.message, "error");
    }
});

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return dateStr;
    }
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

(function init() {
    if (APP_STATE.token && APP_STATE.user) {
        showApp();
    } else {
        loginPage.classList.remove("hidden");
        appShell.classList.add("hidden");
    }
})();
