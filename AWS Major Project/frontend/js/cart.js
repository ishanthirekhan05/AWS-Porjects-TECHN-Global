/**
 * ShopEase Cart & Wishlist State Management
 * Handles localStorage persistence, quantity updates, INR subtotaling,
 * live badge updates, and the slide-out Quick Cart drawer.
 */

(function () {
  'use strict';

  const API_GATEWAY_BASE_URL = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com';

  function getApiBaseUrl() {
    return (window.SHOPEASE_API_URL || API_GATEWAY_BASE_URL).replace(/\/+$/, '');
  }

  function getActiveUserId() {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.getCurrentUser === 'function') {
      const user = window.ShopEaseAuthService.getCurrentUser();
      if (user && user.id) return user.id;
    }
    try {
      const raw = localStorage.getItem('shopease_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.userId) return parsed.userId;
      }
    } catch (e) {}
    return null;
  }

  function getCartStorageKey() {
    const uid = getActiveUserId();
    return uid ? `shopease_cart_${uid}` : 'shopease_cart_guest';
  }

  function getWishlistStorageKey() {
    const uid = getActiveUserId();
    return uid ? `shopease_wishlist_${uid}` : 'shopease_wishlist_guest';
  }

  function getSelectionStorageKey() {
    const uid = getActiveUserId();
    return uid ? `shopease_cart_selection_${uid}` : 'shopease_cart_selection_guest';
  }

  function getSelectedItemIds() {
    const cart = loadCart();
    try {
      const raw = localStorage.getItem(getSelectionStorageKey());
      const stored = raw ? JSON.parse(raw) : null;
      const selected = Array.isArray(stored)
        ? stored.filter(id => cart.some(item => item.id === id))
        : cart.map(item => item.id);
      localStorage.setItem(getSelectionStorageKey(), JSON.stringify(selected));
      return selected;
    } catch (e) {
      return cart.map(item => item.id);
    }
  }

  function setSelectedItemIds(ids) {
    const cart = loadCart();
    const selected = Array.from(new Set(ids || [])).filter(id => cart.some(item => item.id === id));
    try { localStorage.setItem(getSelectionStorageKey(), JSON.stringify(selected)); } catch (e) {}
    window.dispatchEvent(new CustomEvent('shopease:cart-selection-updated', { detail: { selectedItemIds: selected } }));
    return selected;
  }

  function getSelectedCartItems() {
    const selected = new Set(getSelectedItemIds());
    return loadCart().filter(item => selected.has(item.id));
  }

  // --- Local Storage Accessors ---
  function loadCart() {
    try {
      const key = getCartStorageKey();
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
      // If user is guest and old global key exists, migrate it
      if (!getActiveUserId()) {
        const legacy = localStorage.getItem('shopease_cart_items');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          localStorage.setItem(key, JSON.stringify(parsed));
          localStorage.removeItem('shopease_cart_items');
          return parsed;
        }
      }
      return [];
    } catch (e) {
      console.warn('Failed to load cart from storage:', e);
      return [];
    }
  }

  function saveCart(cart) {
    try {
      const key = getCartStorageKey();
      localStorage.setItem(key, JSON.stringify(cart));
      updateCartUI();
      window.dispatchEvent(new CustomEvent('shopease:cart-updated', { detail: { cart } }));

      // Synchronize with AWS DynamoDB (Table: ShopEaseCart)
      const uid = getActiveUserId();
      if (uid) {
        fetch(`${getApiBaseUrl()}/cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ userId: uid, items: cart })
        }).catch(err => {
          console.warn('[ShopEaseCart] AWS DynamoDB cart sync deferred:', err);
        });
      }
    } catch (e) {
      console.warn('Failed to save cart to storage:', e);
    }
  }

  function loadWishlist() {
    try {
      const key = getWishlistStorageKey();
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data);
      if (!getActiveUserId()) {
        const legacy = localStorage.getItem('shopease_wishlist_items');
        if (legacy) {
          const parsed = JSON.parse(legacy);
          localStorage.setItem(key, JSON.stringify(parsed));
          localStorage.removeItem('shopease_wishlist_items');
          return parsed;
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveWishlist(wishlist) {
    try {
      const key = getWishlistStorageKey();
      localStorage.setItem(key, JSON.stringify(wishlist));
      updateWishlistUI();
      window.dispatchEvent(new CustomEvent('shopease:wishlist-updated', { detail: { wishlist } }));

      // Synchronize with AWS DynamoDB (Table: ShopEaseWishlist)
      const uid = getActiveUserId();
      if (uid) {
        fetch(`${getApiBaseUrl()}/wishlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ userId: uid, items: wishlist })
        }).catch(err => {
          console.warn('[ShopEaseWishlist] AWS DynamoDB wishlist sync deferred:', err);
        });
      }
    } catch (e) {
      console.warn('Failed to save wishlist:', e);
    }
  }

  function migrateGuestCartToUser(userId) {
    if (!userId) return;
    try {
      const guestCartRaw = localStorage.getItem('shopease_cart_guest');
      const userCartKey = `shopease_cart_${userId}`;
      let userCart = [];
      const userCartRaw = localStorage.getItem(userCartKey);
      if (userCartRaw) userCart = JSON.parse(userCartRaw) || [];
      if (guestCartRaw) {
        const guestCart = JSON.parse(guestCartRaw) || [];
        if (Array.isArray(guestCart) && guestCart.length > 0) {
          guestCart.forEach(gItem => {
            const existing = userCart.find(uItem => uItem.id === gItem.id);
            if (existing) {
              existing.quantity += (gItem.quantity || 1);
            } else {
              userCart.push(gItem);
            }
          });
          localStorage.setItem(userCartKey, JSON.stringify(userCart));
          localStorage.removeItem('shopease_cart_guest');
        }
      }

      const guestWishRaw = localStorage.getItem('shopease_wishlist_guest');
      const userWishKey = `shopease_wishlist_${userId}`;
      let userWish = [];
      const userWishRaw = localStorage.getItem(userWishKey);
      if (userWishRaw) userWish = JSON.parse(userWishRaw) || [];
      if (guestWishRaw) {
        const guestWish = JSON.parse(guestWishRaw) || [];
        if (Array.isArray(guestWish) && guestWish.length > 0) {
          guestWish.forEach(id => {
            if (!userWish.includes(id)) userWish.push(id);
          });
          localStorage.setItem(userWishKey, JSON.stringify(userWish));
          localStorage.removeItem('shopease_wishlist_guest');
        }
      }

      updateCartUI();
      updateWishlistUI();
    } catch (e) {
      console.warn('Error migrating guest cart:', e);
    }
  }

  async function syncWithActiveSession() {
    updateCartUI();
    updateWishlistUI();
    if (typeof renderCartPage === 'function') {
      renderCartPage();
    }

    const uid = getActiveUserId();
    if (uid) {
      try {
        const cartPromise = fetch(`${getApiBaseUrl()}/cart?userId=${encodeURIComponent(uid)}`).then(r => r.ok ? r.json() : null);
        const wishPromise = fetch(`${getApiBaseUrl()}/wishlist?userId=${encodeURIComponent(uid)}`).then(r => r.ok ? r.json() : null);
        const [cartRes, wishRes] = await Promise.all([cartPromise, wishPromise]);

        if (cartRes && Array.isArray(cartRes.items) && cartRes.items.length > 0) {
          const key = getCartStorageKey();
          localStorage.setItem(key, JSON.stringify(cartRes.items));
          updateCartUI();
          if (typeof renderCartPage === 'function') renderCartPage();
        }
        if (wishRes && Array.isArray(wishRes.items) && wishRes.items.length > 0) {
          const key = getWishlistStorageKey();
          localStorage.setItem(key, JSON.stringify(wishRes.items));
          updateWishlistUI();
        }
      } catch (e) {
        console.warn('[ShopEaseCart] Remote state hydration error:', e);
      }
    }
  }

  // --- Cart Operations ---
  function addToCart(productIdOrObj, quantity = 1) {
    const productId = (typeof productIdOrObj === 'object' && productIdOrObj !== null) ? productIdOrObj.id : productIdOrObj;
    const product = window.ShopEaseData ? window.ShopEaseData.getProductById(productId) : null;
    if (!product) {
      console.error(`Product with ID ${productId} not found.`);
      return false;
    }

    const cart = loadCart();
    const existingIndex = cart.findIndex((item) => item.id === productId);

    const primaryImg = (Array.isArray(product.images) && product.images.length > 0)
      ? product.images[0]
      : (product.image || (window.ShopEaseData ? window.ShopEaseData.getFallbackImage(product.category) : ''));

    if (existingIndex > -1) {
      cart[existingIndex].quantity += quantity;
      cart[existingIndex].image = primaryImg;
      cart[existingIndex].price = product.price;
      cart[existingIndex].name = product.name;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        brand: product.brand || 'Authentic Brand',
        price: product.price,
        image: primaryImg,
        category: product.category,
        quantity: quantity,
      });
    }

    saveCart(cart);
    setSelectedItemIds([...getSelectedItemIds(), product.id]);

    // Trigger feedback
    animateCartBadge();
    if (window.ShopEaseApp && window.ShopEaseApp.showToast) {
      window.ShopEaseApp.showToast(`Added "${product.name}" to cart`, 'success');
    }

    // Telemetry event
    if (window.ShopEaseEvents) {
      window.ShopEaseEvents.track('add_to_cart', {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: quantity,
      });
    }

    return true;
  }

  function removeFromCart(productId) {
    let cart = loadCart();
    const removedItem = cart.find((i) => i.id === productId);
    cart = cart.filter((item) => item.id !== productId);
    saveCart(cart);
    setSelectedItemIds(getSelectedItemIds().filter(id => id !== productId));

    // Asynchronously synchronize item deletion with AWS DynamoDB (Table: ShopEaseCart)
    const uid = getActiveUserId();
    if (uid) {
      fetch(`${getApiBaseUrl()}/cart`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          productId: productId,
          cartId: removedItem ? (removedItem.cartId || '') : ''
        })
      }).catch(err => {
        console.warn('[ShopEaseCart] AWS DynamoDB delete deferred:', err);
      });
    }

    if (window.ShopEaseApp && window.ShopEaseApp.showToast && removedItem) {
      window.ShopEaseApp.showToast(`Removed "${removedItem.name}" from cart`, 'info');
    }

    if (window.ShopEaseEvents && removedItem) {
      window.ShopEaseEvents.track('remove_from_cart', {
        productId: removedItem.id,
        name: removedItem.name,
      });
    }
  }

  function updateQuantity(productId, newQty) {
    const cart = loadCart();
    const item = cart.find((i) => i.id === productId);
    if (!item) return;

    if (newQty <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = Math.min(newQty, 99);
      saveCart(cart);
    }
  }

  function removeItemsFromCart(productIds) {
    const ids = new Set(productIds || []);
    const cart = loadCart();
    saveCart(cart.filter(item => !ids.has(item.id)));
    setSelectedItemIds(getSelectedItemIds().filter(id => !ids.has(id)));

    const uid = getActiveUserId();
    if (uid) {
      ids.forEach(productId => {
        fetch(`${getApiBaseUrl()}/cart`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ userId: uid, productId })
        }).catch(err => console.warn('[ShopEaseCart] AWS DynamoDB delete deferred:', err));
      });
    }
  }

  function clearCart() {
    saveCart([]);
    try { localStorage.removeItem(getSelectionStorageKey()); } catch (e) {}
    removeCoupon();

    const uid = getActiveUserId();
    if (uid) {
      fetch(`${getApiBaseUrl()}/cart`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ userId: uid })
      }).catch(err => {
        console.warn('[ShopEaseCart] AWS DynamoDB cart clear deferred:', err);
      });
    }
  }

  function getCartCount() {
    const cart = loadCart();
    return cart.reduce((total, item) => total + item.quantity, 0);
  }

  function getCartSubtotal() {
    const cart = loadCart();
    return cart.reduce((total, item) => total + item.price * item.quantity, 0);
  }

  function getCartSubtotalForItems(items) {
    return (items || []).reduce((total, item) => total + item.price * item.quantity, 0);
  }

  // --- Coupon & Discount Operations ---
  function getCouponStorageKey() {
    const uid = getActiveUserId();
    return uid ? `shopease_coupon_${uid}` : 'shopease_coupon_guest';
  }

  function getAppliedCoupon() {
    try {
      const raw = localStorage.getItem(getCouponStorageKey());
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function applyCoupon(code) {
    if (!code) return { success: false, error: 'Please enter a coupon code.' };
    const clean = code.trim().toUpperCase();
    const subtotal = getCartSubtotal();
    if (subtotal <= 0) return { success: false, error: 'Your shopping bag is empty.' };

    let discountAmount = 0;
    let desc = '';

    if (clean === 'WELCOME10') {
      discountAmount = Math.round(subtotal * 0.10);
      desc = '10% Welcome Discount';
    } else if (clean === 'FESTIVE20') {
      discountAmount = Math.round(subtotal * 0.20);
      desc = '20% Mega Festive Savings';
    } else if (clean === 'FLAT500') {
      if (subtotal < 1999) {
        return { success: false, error: 'FLAT500 requires a minimum order value of ₹1,999.' };
      }
      discountAmount = 500;
      desc = '₹500 Instant Cart Discount';
    } else {
      return { success: false, error: 'Invalid coupon code. Try WELCOME10, FESTIVE20, or FLAT500.' };
    }

    const couponObj = {
      code: clean,
      description: desc,
      discountAmount: discountAmount
    };

    try {
      localStorage.setItem(getCouponStorageKey(), JSON.stringify(couponObj));
      window.dispatchEvent(new CustomEvent('shopease:cart-updated', { detail: { cart: loadCart(), coupon: couponObj } }));
    } catch (e) {}

    return {
      success: true,
      coupon: couponObj,
      message: `Coupon ${clean} applied! You saved ₹${discountAmount.toLocaleString('en-IN')}.`
    };
  }

  function removeCoupon() {
    try {
      localStorage.removeItem(getCouponStorageKey());
      window.dispatchEvent(new CustomEvent('shopease:cart-updated', { detail: { cart: loadCart(), coupon: null } }));
    } catch (e) {}
    return { success: true, message: 'Coupon removed.' };
  }

  function getCartDiscount() {
    const coupon = getAppliedCoupon();
    if (!coupon) return 0;
    const subtotal = getCartSubtotal();
    if (coupon.code === 'WELCOME10') return Math.round(subtotal * 0.10);
    if (coupon.code === 'FESTIVE20') return Math.round(subtotal * 0.20);
    if (coupon.code === 'FLAT500') return subtotal >= 1999 ? 500 : 0;
    return Number(coupon.discountAmount || 0);
  }

  function getCartDiscountForItems(items) {
    const coupon = getAppliedCoupon();
    const subtotal = getCartSubtotalForItems(items);
    if (!coupon || subtotal <= 0) return 0;
    if (coupon.code === 'WELCOME10') return Math.round(subtotal * 0.10);
    if (coupon.code === 'FESTIVE20') return Math.round(subtotal * 0.20);
    if (coupon.code === 'FLAT500') return subtotal >= 1999 ? 500 : 0;
    return Number(coupon.discountAmount || 0);
  }

  function getCartShipping() {
    const subtotal = getCartSubtotal();
    if (subtotal <= 0) return 0;
    return subtotal >= 999 ? 0 : 99;
  }

  function getCartShippingForItems(items) {
    const subtotal = getCartSubtotalForItems(items);
    if (subtotal <= 0) return 0;
    return subtotal >= 999 ? 0 : 99;
  }

  function getCartTotalForItems(items) {
    const subtotal = getCartSubtotalForItems(items);
    if (subtotal <= 0) return 0;
    return Math.max(0, subtotal - getCartDiscountForItems(items) + getCartShippingForItems(items));
  }

  function getCartTotal() {
    const subtotal = getCartSubtotal();
    if (subtotal <= 0) return 0;
    const discount = getCartDiscount();
    const shipping = getCartShipping();
    return Math.max(0, subtotal - discount + shipping);
  }

  // --- Wishlist Operations ---
  function toggleWishlist(productId) {
    const product = window.ShopEaseData ? window.ShopEaseData.getProductById(productId) : null;
    let wishlist = loadWishlist();
    const index = wishlist.indexOf(productId);
    let added = false;

    if (index > -1) {
      wishlist.splice(index, 1);
      added = false;
      if (window.ShopEaseApp && window.ShopEaseApp.showToast && product) {
        window.ShopEaseApp.showToast(`Removed "${product.name}" from wishlist`, 'info');
      }
    } else {
      wishlist.push(productId);
      added = true;
      if (window.ShopEaseApp && window.ShopEaseApp.showToast && product) {
        window.ShopEaseApp.showToast(`Saved "${product.name}" to wishlist`, 'success');
      }
    }

    saveWishlist(wishlist);

    if (window.ShopEaseEvents && product) {
      window.ShopEaseEvents.track(added ? 'wishlist_added' : 'wishlist_removed', {
        productId: product.id,
        name: product.name,
      });
    }

    return added;
  }

  function isInWishlist(productId) {
    return loadWishlist().includes(productId);
  }

  // --- UI Sync & Visual Animations ---
  function animateCartBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach((b) => {
      b.classList.remove('badge-pulse');
      void b.offsetWidth; // trigger reflow
      b.classList.add('badge-pulse');
    });
  }

  function updateCartUI() {
    const count = getCartCount();
    const subtotal = getCartSubtotal();
    const formatINR = window.ShopEaseData ? window.ShopEaseData.formatINR : (n) => '₹' + n;

    // Update header badges
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach((badge) => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
      badge.setAttribute('aria-label', `${count} items in shopping cart`);
    });

    // Update cart drawer contents if present
    const drawerItemsContainer = document.getElementById('cartDrawerItems');
    const drawerSubtotal = document.getElementById('cartDrawerSubtotal');
    const drawerEmptyMessage = document.getElementById('cartDrawerEmpty');
    const drawerFooter = document.getElementById('cartDrawerFooter');

    if (drawerSubtotal) {
      drawerSubtotal.textContent = formatINR(subtotal);
    }

    if (drawerItemsContainer) {
      const cart = loadCart();
      if (cart.length === 0) {
        drawerItemsContainer.innerHTML = '';
        if (drawerEmptyMessage) drawerEmptyMessage.style.display = 'block';
        if (drawerFooter) drawerFooter.style.display = 'none';
      } else {
        if (drawerEmptyMessage) drawerEmptyMessage.style.display = 'none';
        if (drawerFooter) drawerFooter.style.display = 'block';

        drawerItemsContainer.innerHTML = cart
          .map(
            (item) => `
            <div class="cart-drawer-item" data-id="${item.id}">
              <img src="${item.image}" alt="${item.name}" class="cart-drawer-thumb" onerror="this.src='${window.ShopEaseData ? window.ShopEaseData.getFallbackImage(item.category) : ''}'">
              <div class="cart-drawer-details">
                <div class="cart-drawer-title">${item.name}</div>
                <div class="cart-drawer-price">${formatINR(item.price)}</div>
                <div class="cart-drawer-controls">
                  <div class="qty-stepper">
                    <button type="button" class="btn-qty" data-action="decrease" data-id="${item.id}" aria-label="Decrease quantity">−</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button type="button" class="btn-qty" data-action="increase" data-id="${item.id}" aria-label="Increase quantity">+</button>
                  </div>
                  <button type="button" class="btn-remove-item" data-action="remove" data-id="${item.id}" aria-label="Remove item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          `
          )
          .join('');
      }
    }
  }

  function updateWishlistUI() {
    const wishlist = loadWishlist();
    const wishlistBadges = document.querySelectorAll('.wishlist-badge');
    wishlistBadges.forEach((badge) => {
      badge.textContent = wishlist.length;
      badge.style.display = wishlist.length > 0 ? 'inline-flex' : 'none';
    });

    // Update wishlist heart buttons across visible products
    document.querySelectorAll('[data-wishlist-btn]').forEach((btn) => {
      const prodId = btn.getAttribute('data-product-id');
      const active = wishlist.includes(prodId);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  // --- Cart Navigation Handling ---
  function openCartDrawer() {
    window.location.href = 'cart.html';
  }

  function closeCartDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const backdrop = document.getElementById('cartDrawerBackdrop');
    if (!drawer) return;

    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.classList.remove('drawer-open');
  }

  // Global Cart API
  window.ShopEaseCart = {
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCart: loadCart,
    getCartItems: loadCart,
    getSelectedItemIds,
    setSelectedItemIds,
    getSelectedCartItems,
    removeItemsFromCart,
    getCartCount,
    getCartSubtotal,
    getCartSubtotalForItems,
    toggleWishlist,
    isInWishlist,
    getWishlistItems: loadWishlist,
    loadWishlist,
    openCartDrawer,
    closeCartDrawer,
    updateCartUI,
    updateWishlistUI,
    migrateGuestCartToUser,
    syncWithActiveSession,
    applyCoupon,
    removeCoupon,
    getAppliedCoupon,
    getCartDiscount,
    getCartDiscountForItems,
    getCartShipping,
    getCartShippingForItems,
    getCartTotalForItems,
    getCartTotal,
  };

  // Re-sync cart on authentication changes
  window.addEventListener('shopease:auth-changed', () => {
    updateCartUI();
    updateWishlistUI();
    if (typeof renderCartPage === 'function') {
      renderCartPage();
    }
  });

  // Wire up document interactions
  document.addEventListener('DOMContentLoaded', () => {
    updateCartUI();
    updateWishlistUI();

    // Event delegation for cart actions & drawer controls
    document.addEventListener('click', (e) => {
      // Cart icon navigation: navigate to full cart page (cart.html) instead of opening drawer/popup
      const openBtn = e.target.closest('[data-open-cart], a[title="Shopping Cart"], button[title="Shopping Cart"], [aria-label="View shopping cart"]');
      if (openBtn) {
        if (openBtn.tagName === 'A' && openBtn.getAttribute('href') === 'cart.html') {
          return; // natural link navigation
        }
        e.preventDefault();
        window.location.href = 'cart.html';
        return;
      }

      // Cart drawer closer
      const closeBtn = e.target.closest('[data-close-cart]');
      if (closeBtn) {
        e.preventDefault();
        closeCartDrawer();
        return;
      }

      // Add to Cart buttons
      const addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        e.preventDefault();
        const prodId = addBtn.getAttribute('data-product-id');
        if (prodId) {
          addToCart(prodId, 1);
        }
        return;
      }

      // Wishlist toggle buttons
      const wishBtn = e.target.closest('[data-wishlist-btn]');
      if (wishBtn) {
        e.preventDefault();
        const prodId = wishBtn.getAttribute('data-product-id');
        if (prodId) {
          toggleWishlist(prodId);
        }
        return;
      }

      // Quantity adjustments in drawer
      const qtyBtn = e.target.closest('.btn-qty');
      if (qtyBtn) {
        const prodId = qtyBtn.getAttribute('data-id');
        const action = qtyBtn.getAttribute('data-action');
        const cart = loadCart();
        const item = cart.find((i) => i.id === prodId);
        if (item) {
          const newQty = action === 'increase' ? item.quantity + 1 : item.quantity - 1;
          updateQuantity(prodId, newQty);
        }
        return;
      }

      // Remove from cart button
      const removeBtn = e.target.closest('.btn-remove-item');
      if (removeBtn) {
        const prodId = removeBtn.getAttribute('data-id');
        if (prodId) {
          removeFromCart(prodId);
        }
        return;
      }
    });

    // Close drawer on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCartDrawer();
      }
    });
  });
})();
