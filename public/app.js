// TechMart - Demo E-commerce Store JavaScript

// HTML sanitization helper to prevent XSS
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Global state
let products = [];
let currentFilters = {
  category: 'all',
  maxPrice: 200,
  search: '',
  sort: 'name'
};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  updateCartCount();
  updateAuthArea();
  setupEventListeners();
  updateWishlistCount();
});

// Load products from API
async function loadProducts() {
  try {
    const params = new URLSearchParams();
    if (currentFilters.category !== 'all') {
      params.append('category', currentFilters.category);
    }
    if (currentFilters.search) {
      params.append('search', currentFilters.search);
    }
    params.append('maxPrice', currentFilters.maxPrice);
    
    const response = await fetch(`/api/products?${params}`);
    products = await response.json();
    
    // Sort products
    sortProducts();
    
    renderProducts();
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// Sort products based on current filter
function sortProducts() {
  switch (currentFilters.sort) {
    case 'price-low':
      products.sort((a, b) => a.price - b.price);
      break;
    case 'price-high':
      products.sort((a, b) => b.price - a.price);
      break;
    case 'name':
    default:
      products.sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Render products to the grid
function renderProducts() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  
  if (products.length === 0) {
    grid.innerHTML = '<p class="no-products">No products found matching your criteria.</p>';
    return;
  }
  
  grid.innerHTML = products.map(product => `
    <div class="product-card" data-product-id="${product.id}">
      <div class="product-image">
        <img src="images/${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" onerror="this.src='images/placeholder.svg'">
      </div>
      <div class="product-info">
        <h3>${escapeHTML(product.name)}</h3>
        <p class="product-category">${escapeHTML(product.category)}</p>
        <p class="product-price">$${product.price.toFixed(2)}</p>
        <p class="product-stock ${product.stock < 5 ? 'low' : ''}">
          ${product.stock < 5 ? `Only ${product.stock} left!` : `${product.stock} in stock`}
        </p>
        <div class="product-actions">
          <button class="btn btn-primary btn-full add-to-cart-btn"
                  data-product-id="${product.id}"
                  ${product.stock === 0 ? 'disabled' : ''}>
            ${product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
          </button>
          <button class="btn btn-outline btn-full wishlist-btn"
                  data-product-id="${product.id}">
            🤍 Add to Wishlist
          </button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers for add to cart buttons
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const productId = parseInt(e.target.dataset.productId);
      addToCart(productId);
    });
  });

  // Add click handlers for wishlist buttons
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const productId = parseInt(e.target.dataset.productId);
      await addToWishlist(productId);
      updateWishlistCount();
    });
  });
}

// Add item to cart
async function addToCart(productId) {
  try {
    const response = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showToast(data.error, 'error');
      return;
    }
    
    showToast('Added to cart!');
    updateCartCount();
  } catch (error) {
    console.error('Error adding to cart:', error);
    showToast('Failed to add item', 'error');
  }
}

// Add to wishlist
async function addToWishlist(productId) {
  try {
    const response = await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Failed to add to wishlist', 'error');
      return;
    }
    showToast('Added to wishlist!');
  } catch (err) {
    console.error('Error adding to wishlist:', err);
    showToast('Network error', 'error');
  }
}

// Remove from wishlist
async function removeFromWishlist(productId) {
  try {
    const response = await fetch(`/api/wishlist/${productId}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Failed to remove', 'error');
      return;
    }
    showToast('Removed from wishlist');
    loadWishlist();
    updateWishlistCount();
  } catch (err) {
    console.error('Error removing wishlist item:', err);
  }
}

// Load wishlist page items
async function loadWishlist() {
  try {
    const response = await fetch('/api/wishlist');
    const data = await response.json();
    const grid = document.getElementById('wishlistGrid');
    if (!grid) return;
    grid.innerHTML = data.items.map(p => `
      <div class="product-card">
        <div class="product-image">
          <img src="images/${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" onerror="this.src='images/placeholder.svg'">
        </div>
        <div class="product-info">
          <h3>${escapeHTML(p.name)}</h3>
          <p class="product-price">$${p.price.toFixed(2)}</p>
          <button class="btn btn-primary" onclick="addToCart(${p.id})">Add to Cart</button>
          <button class="btn btn-outline" onclick="removeFromWishlist(${p.id})">Remove</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading wishlist:', err);
  }
}

// Update wishlist count in navbar (simple count)
async function updateWishlistCount() {
  try {
    const response = await fetch('/api/wishlist');
    const data = await response.json();
    const count = data.items.length || 0;
    document.querySelectorAll('#wishlistCount').forEach(el => el.textContent = count);
  } catch (err) {
    console.error('Error updating wishlist count:', err);
  }
}

// Update cart count in navbar
async function updateCartCount() {
  try {
    const response = await fetch('/api/cart');
    const data = await response.json();
    const count = data.items.reduce((sum, item) => sum + item.quantity, 0);
    
    document.querySelectorAll('#cartCount').forEach(el => {
      el.textContent = count;
    });
  } catch (error) {
    console.error('Error updating cart count:', error);
  }
}

// Update auth area based on login status
function updateAuthArea() {
  const authArea = document.getElementById('authArea');
  if (!authArea) return;
  
  const user = JSON.parse(localStorage.getItem('user'));
  
  if (user) {
    authArea.innerHTML = `
      <span class="user-name">Hi, ${escapeHTML(user.name)}</span>
      <button class="btn btn-outline" id="logoutBtn">Logout</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
  } else {
    authArea.innerHTML = `
      <a href="/login.html" class="btn btn-outline">Login</a>
      <a href="/register.html" class="btn btn-primary">Sign Up</a>
    `;
  }
}

// Logout function
async function logout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    localStorage.removeItem('user');
    showToast('Logged out successfully');
    updateAuthArea();
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Setup event listeners for filters
function setupEventListeners() {
  // Category filter
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      currentFilters.category = e.target.value;
      loadProducts();
    });
  }
  
  // Price range filter
  const priceRange = document.getElementById('priceRange');
  const priceValue = document.getElementById('priceValue');
  if (priceRange && priceValue) {
    priceRange.addEventListener('input', (e) => {
      currentFilters.maxPrice = parseInt(e.target.value);
      priceValue.textContent = e.target.value;
    });
    priceRange.addEventListener('change', () => {
      loadProducts();
    });
  }
  
  // Sort filter
  const sortBy = document.getElementById('sortBy');
  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      currentFilters.sort = e.target.value;
      sortProducts();
      renderProducts();
    });
  }
  
  // Search
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  if (searchInput && searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentFilters.search = searchInput.value;
      loadProducts();
    });
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentFilters.search = searchInput.value;
        loadProducts();
      }
    });
  }
}

// Make functions globally available
window.escapeHTML = escapeHTML;
window.showToast = showToast;
window.updateCartCount = updateCartCount;
window.updateAuthArea = updateAuthArea;
window.addToWishlist = addToWishlist;
window.removeFromWishlist = removeFromWishlist;
window.loadWishlist = loadWishlist;
window.updateWishlistCount = updateWishlistCount;
