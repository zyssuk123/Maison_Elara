const ADMIN_API_BASE = "/api";

let adminSession = null;
let authToken = "";
let products = [];
let orders = [];
let admins = [];
let settings = {};
let productSearchTerm = "";
let orderSearchTerm = "";

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`
  };
}

async function adminRequest(path, options = {}) {
  const response = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function ensureAdminSession() {
  try {
    adminSession = JSON.parse(sessionStorage.getItem("maison_admin") || localStorage.getItem("maison_user") || "null");
  } catch (error) {
    adminSession = null;
  }
  authToken = sessionStorage.getItem("maison_admin_token") || localStorage.getItem("maison_auth_token") || "";
  if (!adminSession || !adminSession.loggedIn || adminSession.role !== "admin" || !authToken) {
    window.location.href = "login.html";
    return false;
  }
  document.getElementById("admin-name").textContent = adminSession.name;
  document.getElementById("greeting-name").textContent = adminSession.name;
  return true;
}

async function logout() {
  try {
    await adminRequest("/logout", {
      method: "POST",
      headers: getAuthHeaders()
    });
  } catch (error) {
    // ignore
  }
  sessionStorage.removeItem("maison_admin");
  sessionStorage.removeItem("maison_admin_token");
  localStorage.removeItem("maison_user");
  localStorage.removeItem("maison_auth_token");
  window.location.href = "login.html";
}

async function loadAdminData() {
  const [loadedProducts, loadedOrders, loadedAdmins, loadedSettings] = await Promise.all([
    adminRequest("/products", { headers: getAuthHeaders() }),
    adminRequest("/orders", { headers: getAuthHeaders() }),
    adminRequest("/admins", { headers: getAuthHeaders() }),
    adminRequest("/settings")
  ]);

  products = loadedProducts;
  orders = loadedOrders;
  admins = loadedAdmins;
  settings = loadedSettings;
}

function showPage(page, element) {
  document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");
  if (element) {
    element.classList.add("active");
  }

  if (page === "dashboard") renderDashboard();
  if (page === "analytics") renderAnalytics();
  if (page === "products") renderProductsTable(productSearchTerm);
  if (page === "orders") renderOrdersTable(orderSearchTerm);
  if (page === "settings") renderSettings();
}

function renderDashboard() {
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const pending = orders.filter(order => order.status === "pending").length;

  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">$${revenue.toLocaleString()}</div><div class="stat-trend up">All time</div></div>
    <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-value">${orders.length}</div><div class="stat-trend">${pending} pending</div></div>
    <div class="stat-card"><div class="stat-label">Products</div><div class="stat-value">${products.filter(product => product.active).length}</div><div class="stat-trend">${products.length} total</div></div>
    <div class="stat-card"><div class="stat-label">Avg. Order Value</div><div class="stat-value">$${orders.length ? Math.round(revenue / orders.length).toLocaleString() : 0}</div><div class="stat-trend">Per transaction</div></div>
  `;

  const recentOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  document.getElementById("recent-orders-list").innerHTML = recentOrders.length ? `
    <table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>${recentOrders.map(order => `
      <tr>
        <td style="font-size:12px">${order.id}</td>
        <td>${order.customer}</td>
        <td style="font-family:'Cormorant Garamond',serif;font-size:18px">$${order.total.toLocaleString()}</td>
        <td><span class="badge badge-${order.status}">${order.status}</span></td>
      </tr>`).join("")}
    </tbody></table>
  ` : "<p style=\"color:var(--muted);font-size:14px;text-align:center;padding:2rem\">No orders yet</p>";

  const categoryTotals = {};
  orders.forEach(order => order.items.forEach(item => {
    const product = products.find(entry => entry.id === item.id);
    const category = product ? product.category : "Other";
    categoryTotals[category] = (categoryTotals[category] || 0) + (item.price * item.qty);
  }));
  renderBarChart("category-chart", categoryTotals, "No sales data yet");
}

function renderAnalytics() {
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const delivered = orders.filter(order => order.status === "delivered").length;

  document.getElementById("analytics-stats").innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">$${revenue.toLocaleString()}</div><div class="stat-trend up">Lifetime</div></div>
    <div class="stat-card"><div class="stat-label">Conversion Rate</div><div class="stat-value">${orders.length ? Math.round((delivered / orders.length) * 100) : 0}%</div><div class="stat-trend">Orders delivered</div></div>
    <div class="stat-card"><div class="stat-label">Items Sold</div><div class="stat-value">${orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.qty, 0), 0)}</div><div class="stat-trend">Total units</div></div>
    <div class="stat-card"><div class="stat-label">Paid Orders</div><div class="stat-value">${orders.filter(order => order.paymentStatus === "paid").length}</div><div class="stat-trend">Online payments captured</div></div>
  `;

  const topProducts = {};
  orders.forEach(order => order.items.forEach(item => {
    if (!topProducts[item.id]) {
      topProducts[item.id] = { name: item.name, revenue: 0 };
    }
    topProducts[item.id].revenue += item.price * item.qty;
  }));
  const topProductEntries = Object.values(topProducts).sort((a, b) => b.revenue - a.revenue).slice(0, 5).reduce((result, item) => {
    result[item.name] = item.revenue;
    return result;
  }, {});
  renderBarChart("top-products-chart", topProductEntries, "No sales data yet");

  const revenueByCategory = {};
  orders.forEach(order => order.items.forEach(item => {
    const product = products.find(entry => entry.id === item.id);
    const category = product ? product.category : "Other";
    revenueByCategory[category] = (revenueByCategory[category] || 0) + item.price * item.qty;
  }));
  renderBarChart("revenue-chart", revenueByCategory, "No sales data yet");
}

function renderBarChart(targetId, dataMap, emptyMessage) {
  const entries = Object.entries(dataMap).sort((a, b) => b[1] - a[1]);
  const target = document.getElementById(targetId);
  if (!entries.length) {
    target.innerHTML = `<p style="color:var(--muted);font-size:14px;text-align:center;padding:2rem">${emptyMessage}</p>`;
    return;
  }
  const maxValue = Math.max(...entries.map(([, value]) => value), 1);
  target.innerHTML = `
    <div class="chart-bar-wrap">${entries.map(([label, value]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label" title="${label}">${label}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.round((value / maxValue) * 100)}%"></div></div>
        <div class="chart-bar-val">$${value.toLocaleString()}</div>
      </div>`).join("")}
    </div>
  `;
}

function renderProductsTable(search = "") {
  productSearchTerm = search;
  let filteredProducts = [...products];
  if (search) {
    const lowered = search.toLowerCase();
    filteredProducts = filteredProducts.filter(product => product.name.toLowerCase().includes(lowered) || product.category.toLowerCase().includes(lowered));
  }

  document.getElementById("product-count").textContent = `${filteredProducts.length} product${filteredProducts.length !== 1 ? "s" : ""}`;
  const tbody = document.getElementById("products-table-body");
  if (!filteredProducts.length) {
    tbody.innerHTML = "<tr><td colspan=\"5\" style=\"text-align:center;padding:3rem;color:var(--muted)\">No products found</td></tr>";
    return;
  }

  tbody.innerHTML = filteredProducts.map(product => `
    <tr>
      <td style="display:flex;align-items:center;gap:12px">
        <img class="product-thumb" src="${product.image}" alt="${product.name}" onerror="this.style.background='#E8D5B0'">
        <span style="font-family:'Cormorant Garamond',serif;font-size:17px">${product.name}</span>
      </td>
      <td>${product.category}</td>
      <td style="font-family:'Cormorant Garamond',serif;font-size:18px">
        ${product.originalPrice ? `<span style="text-decoration:line-through;color:var(--muted);font-size:13px">$${product.originalPrice}</span> ` : ""}$${product.price}
      </td>
      <td><span class="badge ${product.active ? "badge-new" : "badge-cancelled"}">${product.active ? "Active" : "Draft"}</span></td>
      <td>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="editProduct(${product.id})">Edit</button>
          <button class="btn btn-outline btn-sm" onclick="toggleProduct(${product.id})">${product.active ? "Hide" : "Show"}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${product.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function editProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  showPage("add-product", null);
  document.getElementById("product-form-title").textContent = "Edit Product";
  document.getElementById("edit-product-id").value = product.id;
  document.getElementById("f-name").value = product.name;
  document.getElementById("f-category").value = product.category;
  document.getElementById("f-price").value = product.price;
  document.getElementById("f-original-price").value = product.originalPrice || "";
  document.getElementById("f-image").value = product.image;
  document.getElementById("f-desc").value = product.desc;
  document.getElementById("f-features").value = product.features.join("\n");
  document.getElementById("f-badge").value = product.badge || "";
  document.getElementById("f-active").value = String(product.active);
}

async function saveProduct() {
  const editId = document.getElementById("edit-product-id").value;
  const payload = {
    name: document.getElementById("f-name").value.trim(),
    category: document.getElementById("f-category").value,
    price: Number(document.getElementById("f-price").value),
    originalPrice: document.getElementById("f-original-price").value ? Number(document.getElementById("f-original-price").value) : null,
    image: document.getElementById("f-image").value.trim(),
    desc: document.getElementById("f-desc").value.trim(),
    features: document.getElementById("f-features").value.split("\n").map(item => item.trim()).filter(Boolean),
    badge: document.getElementById("f-badge").value || null,
    active: document.getElementById("f-active").value === "true",
    colors: ["#1A1612", "#C9A96E", "#B8A99A"]
  };

  if (!payload.name || !payload.category || !payload.price || !payload.image || !payload.desc) {
    showToast("Please fill all required fields");
    return;
  }

  try {
    if (editId) {
      await adminRequest(`/products/${editId}`, { method: "PUT", headers: getAuthHeaders(), body: JSON.stringify(payload) });
      showToast("Product updated successfully");
    } else {
      await adminRequest("/products", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
      showToast("Product added successfully");
    }
    await loadAdminData();
    clearProductForm();
    showPage("products", null);
  } catch (error) {
    showToast(error.message);
  }
}

function clearProductForm() {
  document.getElementById("edit-product-id").value = "";
  document.getElementById("product-form-title").textContent = "Add Product";
  ["f-name", "f-category", "f-price", "f-original-price", "f-image", "f-desc", "f-features", "f-badge"].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });
  document.getElementById("f-active").value = "true";
}

async function toggleProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;

  try {
    await adminRequest(`/products/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...product, active: !product.active })
    });
    await loadAdminData();
    renderProductsTable(productSearchTerm);
    showToast(`Product ${product.active ? "hidden" : "activated"}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteProduct(id) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  try {
    await adminRequest(`/products/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAdminData();
    renderProductsTable(productSearchTerm);
    showToast("Product deleted");
  } catch (error) {
    showToast(error.message);
  }
}

function renderOrdersTable(search = "") {
  orderSearchTerm = search;
  const statusFilter = document.getElementById("order-filter")?.value || "";
  let filteredOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (statusFilter) filteredOrders = filteredOrders.filter(order => order.status === statusFilter);
  if (search) {
    const lowered = search.toLowerCase();
    filteredOrders = filteredOrders.filter(order => order.id.toLowerCase().includes(lowered) || (order.customer || "").toLowerCase().includes(lowered));
  }

  const tbody = document.getElementById("orders-table-body");
  if (!filteredOrders.length) {
    tbody.innerHTML = "<tr><td colspan=\"6\" style=\"text-align:center;padding:3rem;color:var(--muted)\">No orders found</td></tr>";
    return;
  }

  tbody.innerHTML = filteredOrders.map(order => `
    <tr>
      <td style="font-size:12px;font-family:monospace">${order.id}</td>
      <td style="font-size:13px">${new Date(order.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
      <td>${order.items.length} item${order.items.length !== 1 ? "s" : ""}</td>
      <td style="font-family:'Cormorant Garamond',serif;font-size:20px">$${order.total.toLocaleString()}</td>
      <td>
        <select class="form-select" style="padding:5px 10px;font-size:11px;width:auto" onchange="updateOrderStatus('${order.id}',this.value)">
          <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="shipped" ${order.status === "shipped" ? "selected" : ""}>Shipped</option>
          <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>Delivered</option>
          <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
      </td>
      <td><button class="btn btn-outline btn-sm" onclick="viewOrder('${order.id}')">View Details</button></td>
    </tr>
  `).join("");
}

async function updateOrderStatus(id, status) {
  try {
    await adminRequest(`/orders/${id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    await loadAdminData();
    renderOrdersTable(orderSearchTerm);
    renderDashboard();
    renderAnalytics();
    showToast(`Order ${id} updated to ${status}`);
  } catch (error) {
    showToast(error.message);
  }
}

function viewOrder(id) {
  const order = orders.find(item => item.id === id);
  if (!order) return;

  document.getElementById("order-modal-title").textContent = order.id;
  document.getElementById("order-modal-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
      <div><p class="form-label">Date</p><p>${new Date(order.date).toLocaleString()}</p></div>
      <div><p class="form-label">Status</p><span class="badge badge-${order.status}">${order.status}</span></div>
      <div><p class="form-label">Customer</p><p>${order.customer}</p></div>
      <div><p class="form-label">Payment</p><p>${order.paymentMethod === "online_card" ? "Online payment" : "Pay on delivery"} - ${order.paymentStatus}</p></div>
      <div><p class="form-label">Phone</p><p>${order.customerInfo?.phone || "-"}</p></div>
      <div><p class="form-label">Address</p><p>${order.customerInfo?.address || "-"}</p></div>
      <div><p class="form-label">City</p><p>${order.customerInfo?.city || "-"}</p></div>
      <div><p class="form-label">Total</p><p style="font-family:'Cormorant Garamond',serif;font-size:24px">$${order.total.toLocaleString()}</p></div>
    </div>
    <p class="form-label" style="margin-bottom:12px">Items Ordered</p>
    ${order.items.map(item => `
      <div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <img style="width:50px;height:62px;object-fit:cover;background:var(--ivory)" src="${item.image}" onerror="this.style.background='#E8D5B0'">
        <div style="flex:1">
          <p style="font-family:'Cormorant Garamond',serif;font-size:17px">${item.name}</p>
          <p style="font-size:13px;color:var(--muted)">${item.category}</p>
        </div>
        <p>x${item.qty}</p>
        <p style="font-family:'Cormorant Garamond',serif;font-size:18px">$${(item.price * item.qty).toLocaleString()}</p>
      </div>`).join("")}
  `;
  document.getElementById("order-modal").classList.add("open");
}

function closeOrderModal(event) {
  if (event && event.target !== document.getElementById("order-modal")) return;
  document.getElementById("order-modal").classList.remove("open");
}

function renderSettings() {
  document.getElementById("store-name").value = settings.storeName || "Maison Elara";
  document.getElementById("store-currency").value = settings.currency || "USD ($)";
  document.getElementById("store-email").value = settings.contactEmail || "";
  document.getElementById("admin-accounts-list").innerHTML = admins.map(admin => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <p style="font-size:14px">${admin.name}</p>
        <p style="font-size:12px;color:var(--muted)">${admin.username}</p>
      </div>
      ${admins.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="removeAdmin('${admin.username}')">Remove</button>` : "<span style=\"font-size:11px;color:var(--muted)\">Owner</span>"}
    </div>`).join("");
}

async function saveStoreSettings() {
  const payload = {
    storeName: document.getElementById("store-name").value.trim(),
    currency: document.getElementById("store-currency").value,
    contactEmail: document.getElementById("store-email").value.trim()
  };

  try {
    settings = await adminRequest("/settings", { method: "PUT", headers: getAuthHeaders(), body: JSON.stringify(payload) });
    renderSettings();
    showToast("Store settings saved");
  } catch (error) {
    showToast(error.message);
  }
}

async function addAdmin() {
  const payload = {
    username: document.getElementById("new-admin-user").value.trim(),
    password: document.getElementById("new-admin-pass").value,
    name: document.getElementById("new-admin-name").value.trim()
  };

  if (!payload.username || !payload.password || !payload.name) {
    showToast("Please fill all admin fields");
    return;
  }

  try {
    await adminRequest("/admins", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
    document.getElementById("new-admin-user").value = "";
    document.getElementById("new-admin-pass").value = "";
    document.getElementById("new-admin-name").value = "";
    await loadAdminData();
    renderSettings();
    showToast("Admin account created");
  } catch (error) {
    showToast(error.message);
  }
}

async function removeAdmin(username) {
  try {
    await adminRequest(`/admins/${encodeURIComponent(username)}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAdminData();
    renderSettings();
    showToast("Admin removed");
  } catch (error) {
    showToast(error.message);
  }
}

function showToast(message) {
  const toast = document.getElementById("admin-toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

async function initAdmin() {
  if (!ensureAdminSession()) return;
  try {
    await loadAdminData();
    renderDashboard();
  } catch (error) {
    showToast(error.message);
  }
}

window.logout = logout;
window.showPage = showPage;
window.renderProductsTable = renderProductsTable;
window.renderOrdersTable = renderOrdersTable;
window.editProduct = editProduct;
window.saveProduct = saveProduct;
window.clearProductForm = clearProductForm;
window.toggleProduct = toggleProduct;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;
window.viewOrder = viewOrder;
window.closeOrderModal = closeOrderModal;
window.addAdmin = addAdmin;
window.removeAdmin = removeAdmin;
window.saveStoreSettings = saveStoreSettings;

initAdmin();
