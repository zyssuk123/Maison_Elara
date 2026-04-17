const API_BASE = "/api";
const CART_KEY = "maison_cart";
const USER_KEY = "maison_user";
const TOKEN_KEY = "maison_auth_token";

let products = [];
let currentProduct = null;

function scrollToSection(selector) {
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
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

function getCurrentUser() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function updateAccountUI() {
  const accountLink = document.getElementById("account-link");
  const adminLink = document.getElementById("admin-link");
  const user = getCurrentUser();

  if (!user) {
    accountLink.textContent = "Login";
    accountLink.href = "login.html";
    accountLink.onclick = null;
    adminLink.classList.add("hidden");
    return;
  }

  accountLink.textContent = "Sign Out";
  accountLink.href = "#";
  accountLink.onclick = event => {
    event.preventDefault();
    signOutCurrentUser();
  };
  adminLink.classList.toggle("hidden", (user.role || "customer") !== "admin");
}

async function signOutCurrentUser() {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    if (token) {
      await apiRequest("/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  } catch (error) {
    // Ignore logout errors and clear local state anyway.
  }

  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("maison_admin");
  sessionStorage.removeItem("maison_admin_token");
  updateAccountUI();
  showToast("Signed out successfully");
}

async function loadProducts() {
  products = await apiRequest("/products");
  filterProducts("All");
}

function getCart() {
  return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
}

function renderProducts(list) {
  const grid = document.getElementById("products-grid");
  if (!list.length) {
    grid.innerHTML = "<p style=\"color:var(--muted);grid-column:1/-1;text-align:center;padding:4rem 0;font-family:'Cormorant Garamond',serif;font-size:24px\">No bags found.</p>";
    return;
  }

  grid.innerHTML = list.map(product => `
    <div class="product-card" onclick="openProduct(${product.id})">
      <div class="product-img-wrap">
        <img src="${product.image}" alt="${product.name}" onerror="this.style.background='#E8D5B0';this.style.display='block'">
        ${product.badge ? `<span class="product-badge ${product.badge === "Sale" ? "sale" : ""}">${product.badge}</span>` : ""}
        <button class="product-wishlist" onclick="event.stopPropagation();wishlist(${product.id})" title="Wishlist">&#9825;</button>
        <button class="quick-add" onclick="event.stopPropagation();quickAdd(${product.id})">Quick Add to Cart</button>
      </div>
      <p class="product-category">${product.category}</p>
      <h3 class="product-name">${product.name}</h3>
      <p class="product-price">
        ${product.originalPrice ? `<span class="original">$${product.originalPrice}</span><span class="sale-price">$${product.price}</span>` : `$${product.price}`}
      </p>
    </div>
  `).join("");
}

function filterProducts(category, button) {
  if (button) {
    document.querySelectorAll(".filter-btn").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
  }

  const search = (document.getElementById("search-input")?.value || "").toLowerCase();
  let filtered = products.filter(product => product.active);
  if (category !== "All") filtered = filtered.filter(product => product.category === category);
  if (search) filtered = filtered.filter(product => product.name.toLowerCase().includes(search) || product.desc.toLowerCase().includes(search));
  renderProducts(filtered);
}

function openProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;

  currentProduct = product;
  document.getElementById("modal-img").src = product.image;
  document.getElementById("modal-img").alt = product.name;
  document.getElementById("modal-category").textContent = product.category;
  document.getElementById("modal-name").textContent = product.name;
  document.getElementById("modal-price").innerHTML = product.originalPrice
    ? `<span class="original">$${product.originalPrice}</span><span class="sale-price">$${product.price}</span>`
    : `$${product.price}`;
  document.getElementById("modal-desc").textContent = product.desc;
  document.getElementById("modal-colors").innerHTML = product.colors.map((color, index) =>
    `<div class="swatch ${index === 0 ? "active" : ""}" style="background:${color}" onclick="selectColor(this)" title="${color}"></div>`
  ).join("");
  document.getElementById("modal-features").innerHTML = product.features.map(feature => `<div class="modal-feature">${feature}</div>`).join("");
  document.getElementById("modal-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(event) {
  if (event && event.target !== document.getElementById("modal-overlay")) return;
  document.getElementById("modal-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function selectColor(element) {
  document.querySelectorAll(".swatch").forEach(item => item.classList.remove("active"));
  element.classList.add("active");
}

function addFromModal() {
  if (!currentProduct) return;
  addToCart(currentProduct);
  closeModal();
  openCart();
}

function quickAdd(id) {
  const product = products.find(item => item.id === id);
  if (product) addToCart(product);
}

function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) existing.qty += 1;
  else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      qty: 1
    });
  }
  setCart(cart);
  showToast(`"${product.name}" added to your bag`);
}

function updateCartUI() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById("cart-count").textContent = count;

  const itemsElement = document.getElementById("cart-items");
  const footerElement = document.getElementById("cart-footer");

  if (!cart.length) {
    itemsElement.innerHTML = "<div class=\"cart-empty\"><div class=\"cart-empty-icon\">Bag</div><p class=\"cart-empty-text\">Your bag is empty</p><p style=\"color:var(--muted);font-size:13px;margin-top:8px\">Explore the collection above</p></div>";
    footerElement.style.display = "none";
    return;
  }

  footerElement.style.display = "block";
  itemsElement.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}" onerror="this.style.background='#E8D5B0'">
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-price">${item.category} · $${item.price}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${item.id},-1)">-</button>
          <span class="qty-display">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeItem(${item.id})">&times;</button>
    </div>
  `).join("");

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.getElementById("cart-total").textContent = `$${total.toLocaleString()}`;
}

function changeQty(id, delta) {
  const cart = getCart();
  const item = cart.find(entry => entry.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeItem(id);
    return;
  }
  setCart(cart);
}

function removeItem(id) {
  setCart(getCart().filter(item => item.id !== id));
}

function openCart() {
  document.getElementById("cart-sidebar").classList.add("open");
  document.getElementById("cart-overlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  document.getElementById("cart-sidebar").classList.remove("open");
  document.getElementById("cart-overlay").classList.remove("open");
  document.body.style.overflow = "";
}

function openCheckoutModal() {
  const cart = getCart();
  if (!cart.length) return;

  const user = getCurrentUser();
  document.getElementById("checkout-name").value = user?.name || "";
  document.getElementById("checkout-email").value = user?.email || "";
  document.getElementById("checkout-phone").value = user?.phone || "";
  document.getElementById("checkout-city").value = "";
  document.getElementById("checkout-address").value = "";
  document.getElementById("checkout-note").value = "";
  document.getElementById("card-name").value = user?.name || "";
  document.getElementById("card-number").value = "";
  document.getElementById("card-expiry").value = "";
  document.getElementById("card-cvc").value = "";

  renderCheckoutSummary();
  togglePaymentFields();
  document.getElementById("checkout-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCheckoutModal(event) {
  if (event && event.target !== document.getElementById("checkout-modal")) return;
  document.getElementById("checkout-modal").classList.remove("open");
  document.body.style.overflow = "";
}

function renderCheckoutSummary() {
  const cart = getCart();
  document.getElementById("checkout-summary-items").innerHTML = cart.map(item => `
    <div class="summary-item">
      <span>${item.name} x${item.qty}</span>
      <strong>$${(item.price * item.qty).toLocaleString()}</strong>
    </div>
  `).join("");
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  document.getElementById("checkout-summary-total").textContent = `$${total.toLocaleString()}`;
}

function togglePaymentFields() {
  const selected = document.querySelector("input[name='payment-method']:checked")?.value || "online_card";
  document.querySelectorAll(".payment-option").forEach(option => {
    option.classList.toggle("active", option.dataset.paymentOption === selected);
  });
  document.getElementById("card-fields").classList.toggle("open", selected === "online_card");
}

async function submitCheckout() {
  const cart = getCart();
  if (!cart.length) return;

  const paymentMethod = document.querySelector("input[name='payment-method']:checked")?.value || "online_card";
  const customerInfo = {
    fullName: document.getElementById("checkout-name").value.trim(),
    email: document.getElementById("checkout-email").value.trim(),
    phone: document.getElementById("checkout-phone").value.trim(),
    city: document.getElementById("checkout-city").value.trim(),
    address: document.getElementById("checkout-address").value.trim(),
    note: document.getElementById("checkout-note").value.trim()
  };

  if (!customerInfo.fullName || !customerInfo.phone || !customerInfo.address || !customerInfo.city) {
    showToast("Please complete your delivery details");
    return;
  }

  if (paymentMethod === "online_card") {
    if (!document.getElementById("card-name").value.trim() || !document.getElementById("card-number").value.trim() || !document.getElementById("card-expiry").value.trim() || !document.getElementById("card-cvc").value.trim()) {
      showToast("Please complete the card details");
      return;
    }
  }

  try {
    await apiRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        customer: customerInfo.fullName,
        customerInfo,
        paymentMethod,
        items: cart
      })
    });
    setCart([]);
    closeCheckoutModal();
    closeCart();
    showToast(paymentMethod === "online_card" ? "Order paid and placed successfully" : "Order placed for cash on delivery");
  } catch (error) {
    showToast(error.message);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3500);
}

function wishlist() {
  showToast("Added to wishlist");
}

function toggleSearch() {
  const wrapper = document.getElementById("search-wrap");
  wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
  if (wrapper.style.display === "block") document.getElementById("search-input").focus();
}

async function initStore() {
  updateAccountUI();
  updateCartUI();
  try {
    await loadProducts();
  } catch (error) {
    showToast(error.message);
  }
}

window.scrollToSection = scrollToSection;
window.filterProducts = filterProducts;
window.openProduct = openProduct;
window.closeModal = closeModal;
window.selectColor = selectColor;
window.addFromModal = addFromModal;
window.quickAdd = quickAdd;
window.openCart = openCart;
window.closeCart = closeCart;
window.changeQty = changeQty;
window.removeItem = removeItem;
window.toggleSearch = toggleSearch;
window.wishlist = wishlist;
window.openCheckoutModal = openCheckoutModal;
window.closeCheckoutModal = closeCheckoutModal;
window.togglePaymentFields = togglePaymentFields;
window.submitCheckout = submitCheckout;

window.checkout = openCheckoutModal;

initStore();
