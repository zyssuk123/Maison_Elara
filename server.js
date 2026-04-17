const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "store.json");

const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function readData() {
  const raw = fs.readFileSync(DATA_FILE, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7);
}

function getSession(req) {
  const token = getToken(req);
  if (!token) {
    return null;
  }
  return sessions.get(token) || null;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || session.role !== "admin") {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function sanitizeUser(user, role) {
  return {
    username: user.username,
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    role
  };
}

function sanitizeProductInput(body, currentProduct) {
  return {
    id: currentProduct ? currentProduct.id : body.id,
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    price: Number(body.price),
    originalPrice: body.originalPrice ? Number(body.originalPrice) : null,
    image: String(body.image || "").trim(),
    desc: String(body.desc || "").trim(),
    features: Array.isArray(body.features) ? body.features.filter(Boolean) : [],
    colors: Array.isArray(body.colors) && body.colors.length ? body.colors : ["#1A1612", "#C9A96E", "#B8A99A"],
    badge: body.badge || null,
    active: Boolean(body.active)
  };
}

function validateProduct(product) {
  return Boolean(
    product.name &&
    product.category &&
    Number.isFinite(product.price) &&
    product.price > 0 &&
    product.image &&
    product.desc
  );
}

function buildOrder(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const normalizedItems = items
    .filter(item => item && Number(item.qty) > 0)
    .map(item => ({
      id: Number(item.id),
      name: String(item.name || ""),
      price: Number(item.price),
      image: String(item.image || ""),
      category: String(item.category || ""),
      qty: Number(item.qty)
    }))
    .filter(item => item.id && item.name && Number.isFinite(item.price));

  const customerInfo = {
    fullName: String(body.customerInfo?.fullName || body.customer || "Guest").trim() || "Guest",
    email: String(body.customerInfo?.email || "").trim(),
    phone: String(body.customerInfo?.phone || "").trim(),
    address: String(body.customerInfo?.address || "").trim(),
    city: String(body.customerInfo?.city || "").trim(),
    note: String(body.customerInfo?.note || "").trim()
  };

  const paymentMethod = String(body.paymentMethod || "cash_on_delivery");
  const paymentStatus = paymentMethod === "online_card" ? "paid" : "unpaid";

  return {
    id: `ORD-${Date.now()}`,
    date: new Date().toISOString(),
    items: normalizedItems,
    total: normalizedItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    status: "pending",
    customer: customerInfo.fullName,
    customerInfo,
    paymentMethod,
    paymentStatus
  };
}

function serveStatic(req, res, pathname) {
  let requestedPath = pathname === "/" ? "/index.html" : pathname;
  requestedPath = requestedPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(ROOT, requestedPath));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    sendFile(res, filePath);
  });
}

async function handleApi(req, res, pathname) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = pathname.split("/").filter(Boolean);
  const data = readData();

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/settings") {
    sendJson(res, 200, data.settings);
    return;
  }

  if (req.method === "PUT" && pathname === "/api/settings") {
    if (!requireAdmin(req, res)) {
      return;
    }
    const body = await getBody(req);
    data.settings = {
      storeName: String(body.storeName || "").trim() || data.settings.storeName,
      currency: String(body.currency || "").trim() || data.settings.currency,
      contactEmail: String(body.contactEmail || "").trim() || data.settings.contactEmail
    };
    writeData(data);
    sendJson(res, 200, data.settings);
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await getBody(req);
    const admin = data.admins.find(
      item => item.username === body.username && item.password === body.password
    );
    const customer = data.customers?.find(
      item => item.username === body.username && item.password === body.password
    );

    const matchedUser = admin || customer;
    const role = admin ? "admin" : customer ? "customer" : null;

    if (!matchedUser || !role) {
      sendJson(res, 401, { error: "Invalid credentials" });
      return;
    }

    const token = crypto.randomUUID();
    sessions.set(token, sanitizeUser(matchedUser, role));
    sendJson(res, 200, {
      token,
      user: {
        ...sanitizeUser(matchedUser, role),
        loggedIn: true
      }
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = getToken(req);
    if (token) {
      sessions.delete(token);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/products") {
    const session = getSession(req);
    const products = session ? data.products : data.products.filter(product => product.active);
    sendJson(res, 200, products);
    return;
  }

  if (req.method === "POST" && pathname === "/api/products") {
    if (!requireAdmin(req, res)) {
      return;
    }
    const body = await getBody(req);
    const nextId = data.products.reduce((max, product) => Math.max(max, product.id), 0) + 1;
    const product = sanitizeProductInput({ ...body, id: nextId });
    if (!validateProduct(product)) {
      sendJson(res, 400, { error: "Invalid product payload" });
      return;
    }
    data.products.push(product);
    writeData(data);
    sendJson(res, 201, product);
    return;
  }

  if (segments[0] === "api" && segments[1] === "products" && segments[2]) {
    if (!requireAdmin(req, res)) {
      return;
    }
    const productId = Number(segments[2]);
    const productIndex = data.products.findIndex(product => product.id === productId);
    if (productIndex === -1) {
      sendJson(res, 404, { error: "Product not found" });
      return;
    }

    if (req.method === "PUT") {
      const body = await getBody(req);
      const product = sanitizeProductInput(body, data.products[productIndex]);
      if (!validateProduct(product)) {
        sendJson(res, 400, { error: "Invalid product payload" });
        return;
      }
      data.products[productIndex] = product;
      writeData(data);
      sendJson(res, 200, product);
      return;
    }

    if (req.method === "DELETE") {
      const [deletedProduct] = data.products.splice(productIndex, 1);
      writeData(data);
      sendJson(res, 200, deletedProduct);
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    if (!requireAdmin(req, res)) {
      return;
    }
    sendJson(res, 200, data.orders);
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const body = await getBody(req);
    const order = buildOrder(body);
    if (!order.items.length || !order.total) {
      sendJson(res, 400, { error: "Order must contain at least one item" });
      return;
    }
    if (!order.customerInfo.address || !order.customerInfo.phone) {
      sendJson(res, 400, { error: "Address and phone are required" });
      return;
    }
    data.orders.push(order);
    writeData(data);
    sendJson(res, 201, order);
    return;
  }

  if (segments[0] === "api" && segments[1] === "orders" && segments[2] && req.method === "PATCH") {
    if (!requireAdmin(req, res)) {
      return;
    }
    const body = await getBody(req);
    const order = data.orders.find(item => item.id === segments[2]);
    if (!order) {
      sendJson(res, 404, { error: "Order not found" });
      return;
    }
    order.status = String(body.status || order.status);
    writeData(data);
    sendJson(res, 200, order);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admins") {
    if (!requireAdmin(req, res)) {
      return;
    }
    sendJson(res, 200, data.admins.map(admin => sanitizeUser(admin, "admin")));
    return;
  }

  if (req.method === "POST" && pathname === "/api/admins") {
    if (!requireAdmin(req, res)) {
      return;
    }
    const body = await getBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const name = String(body.name || "").trim();
    if (!username || !password || !name) {
      sendJson(res, 400, { error: "All admin fields are required" });
      return;
    }
    if (data.admins.some(admin => admin.username === username)) {
      sendJson(res, 409, { error: "Username already exists" });
      return;
    }
    const admin = { username, password, name };
    data.admins.push(admin);
    writeData(data);
    sendJson(res, 201, sanitizeUser(admin, "admin"));
    return;
  }

  if (segments[0] === "api" && segments[1] === "admins" && segments[2] && req.method === "DELETE") {
    if (!requireAdmin(req, res)) {
      return;
    }
    const username = decodeURIComponent(segments[2]);
    if (data.admins.length === 1) {
      sendJson(res, 400, { error: "At least one admin account must remain" });
      return;
    }
    const adminIndex = data.admins.findIndex(admin => admin.username === username);
    if (adminIndex === -1) {
      sendJson(res, 404, { error: "Admin not found" });
      return;
    }
    const [deletedAdmin] = data.admins.splice(adminIndex, 1);
    writeData(data);
    sendJson(res, 200, sanitizeUser(deletedAdmin, "admin"));
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Maison Elara server running at http://${HOST}:${PORT}`);
});
