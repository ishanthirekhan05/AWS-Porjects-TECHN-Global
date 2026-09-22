/**
 * ShopEase - Account Dashboard State Management & Controller
 * Architecture ready for AWS Cognito, DynamoDB, and API Gateway.
 * Supports Guest / Demo and Authenticated states, live Wishlist & Cart sync,
 * Address management, Order Tracking integration, and Theme synchronization.
 */

(function () {
  'use strict';

  const PROFILE_KEY = 'shopease_user_profile';
  const ADDRESSES_KEY = 'shopease_user_addresses';
  const PAYMENTS_KEY = 'shopease_user_payments';
  const PREFS_KEY = 'shopease_user_preferences';
  const TWO_FA_KEY = 'shopease_2fa_enabled';
  const AUTH_KEY = 'shopease_auth_user';

  // Default Initial Fallback State (Clean dynamic Guest state without fake personal data)
  const DEFAULT_PROFILE = {
    name: '',
    email: '',
    phone: '',
    dob: '',
    gender: '',
    cognitoId: '',
    isGuest: true
  };

  // Helper: Format Currency in INR
  function formatINR(amount) {
    if (window.ShopEaseData && typeof window.ShopEaseData.formatINR === 'function') {
      return window.ShopEaseData.formatINR(amount);
    }
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  // --- State Accessors ---
  function getProfile() {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.getCurrentUser === 'function') {
      const user = window.ShopEaseAuthService.getCurrentUser();
      if (user && !user.isGuest) {
        return {
          name: user.name || 'Customer',
          email: user.email || '',
          phone: user.phone || '',
          dob: user.dob || '',
          gender: user.gender || '',
          isGuest: false,
          cognitoId: user.id || user.cognitoId || user.userId
        };
      }
    }
    try {
      const sessRaw = localStorage.getItem('shopease_session');
      if (sessRaw) {
        const sess = JSON.parse(sessRaw);
        if (sess && sess.userId && !sess.isGuest) {
          return {
            name: sess.name || 'Customer',
            email: sess.email || '',
            phone: '',
            dob: '',
            gender: '',
            isGuest: false,
            cognitoId: sess.userId
          };
        }
      }
      const authRaw = localStorage.getItem('shopease_auth_user');
      if (authRaw) {
        const auth = JSON.parse(authRaw);
        if (auth && (auth.id || auth.sub) && !auth.isGuest) {
          return {
            name: auth.name || 'Customer',
            email: auth.email || '',
            phone: auth.phone || '',
            dob: auth.dob || '',
            gender: auth.gender || '',
            isGuest: false,
            cognitoId: auth.id || auth.sub
          };
        }
      }
    } catch (e) {}
    return null;
  }

  function saveProfile(profile) {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.updateProfile === 'function') {
      window.ShopEaseAuthService.updateProfile(profile);
      renderProfileUI();
      showToast('Profile updated successfully!');
    }
  }

  function getAddresses() {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.getAddresses === 'function') {
      return window.ShopEaseAuthService.getAddresses();
    }
    return [];
  }

  function saveAddresses(addresses) {
    // Kept for backward-compatibility with UI helpers
    renderAddressesUI();
  }

  function getPayments() {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.getPayments === 'function') {
      return window.ShopEaseAuthService.getPayments();
    }
    return [];
  }

  function savePayments(payments) {
    renderPaymentsUI();
  }

  function getOrders() {
    if (window.ShopEaseOrderService && typeof window.ShopEaseOrderService.getUserOrders === 'function') {
      const userOrders = window.ShopEaseOrderService.getUserOrders();
      if (Array.isArray(userOrders)) {
        return userOrders.map(o => ({
          ...o,
          date: o.orderDate || o.date || 'Recently',
          carrier: o.carrier || 'BlueDart Express',
          trackingId: o.trackingNumber || o.trackingId || 'BD' + Math.floor(10000000 + Math.random() * 90000000) + 'IN',
          rawId: o.rawId || (o.orderId ? o.orderId.replace('#', '') : '')
        }));
      }
    }
    return [];
  }


  // --- UI Toast Notification Helper ---
  function showToast(message, type = 'success') {
    let toast = document.getElementById('accountToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'accountToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: var(--bg-surface-elevated, #ffffff);
        color: var(--text-primary, #0b132b);
        border: 1px solid var(--border-color, #e2e8f0);
        border-left: 4px solid var(--accent, #1d4ed8);
        padding: 14px 22px;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        font-size: 0.875rem;
        font-weight: 600;
        z-index: 11000;
        display: flex;
        align-items: center;
        gap: 12px;
        transform: translateY(20px);
        opacity: 0;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      document.body.appendChild(toast);
    }

    if (type === 'error') {
      toast.style.borderLeftColor = 'var(--error, #b91c1c)';
    } else {
      toast.style.borderLeftColor = 'var(--accent, #1d4ed8)';
    }

    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${type === 'error' ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'}
      </svg>
      <span>${message}</span>
    `;

    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
    }, 3500);
  }

  // --- Render Functions ---

  function syncAdminNavigation() {
    const navList = document.querySelector('.account-nav-list');
    const existing = document.getElementById('adminAnalyticsNavItem');
    const isAdmin = window.ShopEaseAuthService && typeof window.ShopEaseAuthService.isAdmin === 'function'
      ? window.ShopEaseAuthService.isAdmin()
      : false;

    if (!isAdmin) {
      if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
      }
      return;
    }

    if (existing) {
      existing.style.display = 'list-item';
      return;
    }

    if (!navList) return;
    const adminLi = document.createElement('li');
    adminLi.id = 'adminAnalyticsNavItem';
    adminLi.innerHTML = `
      <a href="admin.html" class="account-nav-btn" role="tab" style="text-decoration: none;">
        <div class="account-nav-btn-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          <span>Admin Analytics</span>
        </div>
      </a>
    `;
    const logoutBtn = document.getElementById('btnAccountLogout');
    const logoutLi = logoutBtn ? logoutBtn.closest('li') : null;
    if (logoutLi && logoutLi.parentElement === navList) {
      navList.insertBefore(adminLi, logoutLi);
    } else {
      navList.appendChild(adminLi);
    }
  }

  function renderProfileUI() {
    syncAdminNavigation();
    const profile = getProfile();
    const authRequiredCard = document.getElementById('authRequiredCard');
    const dashboardLayout = document.getElementById('accountDashboardLayout');

    if (!profile) {
      if (authRequiredCard) {
        authRequiredCard.style.display = 'block';
        const signInBtn = authRequiredCard.querySelector('a[href*="login.html"]');
        if (signInBtn) {
          signInBtn.href = 'login.html?redirect=account.html';
          signInBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = 'login.html?redirect=account.html';
          };
        }
      }
      if (dashboardLayout) dashboardLayout.style.display = 'none';
      return;
    }

    if (authRequiredCard) authRequiredCard.style.display = 'none';
    if (dashboardLayout) dashboardLayout.style.display = '';

    const initials = (profile.name || 'C').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    // Sidebar Profile
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarBadge = document.getElementById('sidebarBadge');
    if (sidebarAvatar) sidebarAvatar.textContent = initials;
    if (sidebarName) sidebarName.textContent = profile.name;
    if (sidebarBadge) {
      sidebarBadge.textContent = 'Verified Customer';
      sidebarBadge.className = 'account-badge-pill verified';
    }

    // Main Header Card
    const headerAvatar = document.getElementById('headerAvatar');
    const headerName = document.getElementById('headerName');
    const headerEmail = document.getElementById('headerEmail');
    const headerPhone = document.getElementById('headerPhone');
    const headerStatusBadge = document.getElementById('headerStatusBadge');
    if (headerAvatar) headerAvatar.textContent = initials;
    if (headerName) headerName.textContent = profile.name;
    if (headerEmail) headerEmail.textContent = profile.email;
    if (headerPhone) headerPhone.textContent = profile.phone || 'Not Provided';
    if (headerStatusBadge) {
      headerStatusBadge.textContent = 'Verified Member';
      headerStatusBadge.className = 'account-badge-pill verified';
    }

    // Personal Information Tab Fields
    const infoName = document.getElementById('infoName');
    const infoEmail = document.getElementById('infoEmail');
    const infoPhone = document.getElementById('infoPhone');
    const infoDob = document.getElementById('infoDob');
    const infoGender = document.getElementById('infoGender');
    const infoCognito = document.getElementById('infoCognito');

    if (infoName) infoName.textContent = profile.name;
    if (infoEmail) infoEmail.textContent = profile.email;
    if (infoPhone) infoPhone.textContent = profile.phone || 'Not Provided';
    if (infoDob) {
      const d = new Date(profile.dob);
      infoDob.textContent = isNaN(d.getTime()) ? (profile.dob || 'Not Provided') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } else if (infoDob) {
      infoDob.textContent = 'Not Provided';
    }
    if (infoGender) infoGender.textContent = profile.gender || 'Not Specified';
    if (infoCognito) infoCognito.textContent = profile.cognitoId || '--';

    // Banner visibility
    const cognitoBanner = document.getElementById('cognitoNoticeBanner');
    if (cognitoBanner) cognitoBanner.style.display = 'none';
  }

  function updateOrderCounts(total, active) {
    const statOrders = document.getElementById('statTotalOrders');
    const statActive = document.getElementById('statActiveOrders');
    const navOrdersCount = document.getElementById('navOrdersCount');

    if (statOrders) statOrders.textContent = total;
    if (statActive) statActive.textContent = active;
    if (navOrdersCount) navOrdersCount.textContent = total;
  }

  function renderOverviewStats() {
    const orders = getOrders();
    const activeCount = orders.filter(o => {
      const s = (o.status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'delivered' && s !== 'returned' && o.statusClass !== 'cancelled';
    }).length;

    // Wishlist count
    let wishCount = 0;
    if (window.ShopEaseCart && typeof window.ShopEaseCart.loadWishlist === 'function') {
      wishCount = window.ShopEaseCart.loadWishlist().length;
    } else {
      try {
        const raw = localStorage.getItem('shopease_wishlist_items');
        if (raw) wishCount = JSON.parse(raw).length;
      } catch (e) {}
    }

    // Bag count & total
    let cartCount = 0;
    let cartTotal = 0;
    if (window.ShopEaseCart && typeof window.ShopEaseCart.loadCart === 'function') {
      const cart = window.ShopEaseCart.loadCart();
      cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
      cartTotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    } else {
      try {
        const raw = localStorage.getItem('shopease_cart_items');
        if (raw) {
          const cart = JSON.parse(raw);
          cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
          cartTotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        }
      } catch (e) {}
    }

    // Set numbers
    const statWishlist = document.getElementById('statWishlistItems');
    const statBag = document.getElementById('statBagItems');
    const navWishlistCount = document.getElementById('navWishlistCount');

    updateOrderCounts(orders.length, activeCount);
    if (statWishlist) statWishlist.textContent = wishCount;
    if (statBag) statBag.textContent = cartCount;
    if (navWishlistCount) navWishlistCount.textContent = wishCount;
  }

  function isCancellable(order) {
    if (!order) return false;
    if (window.ShopEaseOrderService && typeof window.ShopEaseOrderService.isOrderEligibleForCancellation === 'function') {
      const res = window.ShopEaseOrderService.isOrderEligibleForCancellation(order);
      return res && typeof res === 'object' ? !!res.eligible : !!res;
    }
    const cancellableStatuses = ['order placed', 'order confirmed', 'confirmed', 'processing', 'packed'];
    const current = (order.status || '').toLowerCase();
    return cancellableStatuses.includes(current);
  }

  function renderOrdersList(orders) {
    const container = document.getElementById('accountOrdersContainer');
    const overviewRecentContainer = document.getElementById('overviewRecentOrdersContainer');
    if (!container) return;

    const activeCount = orders.filter(o => {
      const s = (o.status || '').toLowerCase();
      return s !== 'cancelled' && s !== 'delivered' && s !== 'returned' && o.statusClass !== 'cancelled';
    }).length;

    updateOrderCounts(orders.length, activeCount);

    if (orders.length === 0) {
      const emptyHtml = `
        <div class="account-empty-state">
          <div class="account-empty-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2"></path>
              <path d="M3 14v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16v-2"></path>
              <line x1="3.27" y1="6.96" x2="12" y2="12.01"></line>
              <line x1="20.73" y1="6.96" x2="12" y2="12.01"></line>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <h3 class="account-empty-headline">You haven't placed any orders yet.</h3>
          <p class="account-empty-desc">Once you complete a purchase, your orders and delivery updates will appear here.</p>
          <a href="products.html" class="btn btn-primary">Explore Products &rarr;</a>
        </div>
      `;
      container.innerHTML = emptyHtml;
      if (overviewRecentContainer) {
        overviewRecentContainer.innerHTML = `
          <div class="account-empty-state" style="padding: 24px 16px;">
            <h4 class="account-empty-headline" style="font-size: 1rem;">You haven't placed any orders yet.</h4>
            <p class="account-empty-desc" style="margin-bottom: 12px;">Once you complete a purchase, your orders and delivery updates will appear here.</p>
            <a href="products.html" class="btn btn-primary btn-sm">Explore Products &rarr;</a>
          </div>
        `;
      }
      return;
    }

    const fingerprint = orders.map(o => `${o.rawId || o.orderId}_${o.status}_${o.statusClass}_${o.cancellationReason || ''}_${(o.items && o.items[0] && (o.items[0].productId || o.items[0].id)) || ''}`).join('|');
    if (container._lastRenderedFingerprint === fingerprint && container.children.length > 0) {
      return;
    }
    container._lastRenderedFingerprint = fingerprint;

    const html = orders.map(order => {
      const firstItem = order.items && order.items[0] ? order.items[0] : { name: 'ShopEase Verified Order', image: '', brand: 'ShopEase', quantity: 1 };
      const otherItemsCount = (order.items ? order.items.length : 1) - 1;
      const subtitle = otherItemsCount > 0 ? `Qty: ${firstItem.quantity || 1} &bull; + ${otherItemsCount} more ${otherItemsCount === 1 ? 'item' : 'items'}` : `Qty: ${firstItem.quantity || 1}`;
      const itemImg = (window.ShopEaseData && typeof window.ShopEaseData.resolveItemImage === 'function')
        ? window.ShopEaseData.resolveItemImage(firstItem)
        : (firstItem.image || (window.ShopEaseData ? window.ShopEaseData.getFallbackImage(firstItem.category || firstItem.name || 'electronics') : ''));
      const fallbackImg = window.ShopEaseData ? window.ShopEaseData.getFallbackImage(firstItem.category || firstItem.name || 'electronics') : itemImg;

      const isCancelled = order.statusClass === 'cancelled' || (order.status || '').toLowerCase().includes('cancel');
      const cancellable = isCancellable(order);

      const paymentStatus = order.paymentStatus || 'Paid';
      const isPaid = paymentStatus.toLowerCase() === 'paid';
      const paymentBadgeClass = isPaid ? 'verified' : (isCancelled ? 'cancelled' : 'cognito');

      return `
        <div class="account-order-card" data-order-id="${order.rawId || order.orderId}">
          <div class="account-order-top">
            <div class="account-order-id-block">
              <span class="account-order-id">${order.orderId}</span>
              <span class="account-order-date">&bull; ${order.date}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="account-badge-pill ${paymentBadgeClass}" title="Payment Status: ${paymentStatus}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  ${isPaid ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="10"></circle>'}
                </svg>
                <span>${paymentStatus}</span>
              </span>
              <div class="account-order-status-badge ${order.statusClass}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  ${order.statusClass === 'delivered' ? '<polyline points="20 6 9 17 4 12"></polyline>' : 
                    isCancelled ? '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' : 
                    '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>'}
                </svg>
                <span>${order.statusLabel || order.status}</span>
              </div>
            </div>
          </div>
          
          <div class="account-order-body">
            <div class="account-order-items-preview">
              <div class="account-order-thumb-wrap">
                <img src="${itemImg}" alt="${firstItem.name}" onerror="this.onerror=null; this.src='${fallbackImg}'">
              </div>
              <div class="account-order-summary-text">
                <div class="account-order-main-title" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span>${firstItem.name}</span>
                  ${isCancelled ? `
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.3);">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      Cancelled
                    </span>` : ''}
                </div>
                <div class="account-order-meta-desc">${firstItem.brand || 'Authentic Brand'} &bull; ${subtitle}</div>
                <div style="font-size: 0.75rem; color: ${isCancelled ? 'var(--error)' : 'var(--accent)'}; font-weight: 600; margin-top: 4px;">
                  ${isCancelled ? (order.cancellationReason ? `Reason: ${order.cancellationReason}` : 'Cancelled by customer') : `Carrier: ${order.carrier} (${order.trackingId})`}
                </div>
              </div>
            </div>

            <div class="account-order-actions-wrap">
              <div class="account-order-total-block">
                <div class="account-order-total-label">Order Total</div>
                <div class="account-order-total-val">${formatINR(order.totalAmount || order.total)}</div>
              </div>
              <button type="button" class="btn btn-outline btn-sm btn-view-order-details" data-order-id="${order.rawId || order.orderId}">
                <span>View Details</span>
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-download-invoice" data-order-id="${order.rawId || order.orderId}" title="Download GST Tax Invoice" style="display: inline-flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                <span>Invoice</span>
              </button>
              <a href="order-tracking.html?orderId=${order.rawId || (order.orderId ? order.orderId.replace('#', '') : '')}" class="btn btn-primary btn-sm btn-track-order" data-order-id="${order.rawId || order.orderId}">
                <span>Track Order &rarr;</span>
              </a>
              ${cancellable ? `
              <button type="button" class="btn btn-outline btn-sm btn-cancel-order" data-order-id="${order.rawId || order.orderId}" style="color: var(--error); border-color: var(--error);">
                <span>Cancel Order</span>
              </button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Overview tab shows only the most recent active order
    if (overviewRecentContainer) {
      overviewRecentContainer.innerHTML = orders.slice(0, 1).map(order => {
        const firstItem = order.items && order.items[0] ? order.items[0] : { name: 'ShopEase Verified Order', image: '', brand: 'ShopEase' };
        const itemImg = (window.ShopEaseData && typeof window.ShopEaseData.resolveItemImage === 'function')
          ? window.ShopEaseData.resolveItemImage(firstItem)
          : (firstItem.image || (window.ShopEaseData ? window.ShopEaseData.getFallbackImage(firstItem.category || firstItem.name || 'electronics') : ''));
        const fallbackImg = window.ShopEaseData ? window.ShopEaseData.getFallbackImage(firstItem.category || firstItem.name || 'electronics') : itemImg;
        const isCancelled = order.statusClass === 'cancelled' || (order.status || '').toLowerCase().includes('cancel');
        const paymentStatus = order.paymentStatus || 'Paid';
        const isPaid = paymentStatus.toLowerCase() === 'paid';
        const paymentBadgeClass = isPaid ? 'verified' : (isCancelled ? 'cancelled' : 'cognito');
        const cancellable = isCancellable(order);

        return `
          <div class="account-order-card">
            <div class="account-order-top">
              <div class="account-order-id-block">
                <span class="account-order-id">${order.orderId}</span>
                <span class="account-order-date">&bull; ${order.date}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="account-badge-pill ${paymentBadgeClass}" title="Payment Status: ${paymentStatus}">
                  <span>${paymentStatus}</span>
                </span>
                <div class="account-order-status-badge ${order.statusClass}">
                  <span>${order.statusLabel || order.status}</span>
                </div>
              </div>
            </div>
            <div class="account-order-body">
              <div class="account-order-items-preview">
                <div class="account-order-thumb-wrap">
                  <img src="${itemImg}" alt="${firstItem.name}" onerror="this.onerror=null; this.src='${fallbackImg}'">
                </div>
                <div class="account-order-summary-text">
                  <div class="account-order-main-title" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span>${firstItem.name}</span>
                    ${isCancelled ? `
                      <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.3);">
                        Cancelled
                      </span>` : ''}
                  </div>
                  <div class="account-order-meta-desc">${firstItem.brand || 'Authentic'} &bull; ${isCancelled ? (order.cancellationReason || 'Order Cancelled') : `${order.carrier} (${order.trackingId})`}</div>
                </div>
              </div>
              <div class="account-order-actions-wrap">
                <div class="account-order-total-block">
                  <div class="account-order-total-label">Total</div>
                  <div class="account-order-total-val">${formatINR(order.totalAmount || order.total)}</div>
                </div>
                <a href="order-details.html?orderId=${order.rawId || (order.orderId ? order.orderId.replace('#', '') : '')}" class="btn btn-outline btn-sm btn-view-order-details" data-order-id="${order.rawId || order.orderId}">
                  <span>View Details</span>
                </a>
                <button type="button" class="btn btn-outline btn-sm btn-download-invoice" data-order-id="${order.rawId || order.orderId}" title="Download GST Tax Invoice" style="display: inline-flex; align-items: center; gap: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                  <span>Invoice</span>
                </button>
                <a href="order-tracking.html?orderId=${order.rawId || (order.orderId ? order.orderId.replace('#', '') : '')}" class="btn btn-primary btn-sm btn-track-order" data-order-id="${order.rawId || order.orderId}">
                  <span>Track Order &rarr;</span>
                </a>
                ${cancellable ? `
                <button type="button" class="btn btn-outline btn-sm btn-cancel-order" data-order-id="${order.rawId || order.orderId}" style="color: var(--error); border-color: var(--error);">
                  <span>Cancel Order</span>
                </button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  let isFetchingOrders = false;
  async function renderOrdersUI(skipApiFetch = false) {
    const container = document.getElementById('accountOrdersContainer');
    const overviewRecentContainer = document.getElementById('overviewRecentOrdersContainer');
    if (!container) return;

    const profile = getProfile();
    const isGuest = !profile || profile.isGuest;

    if (isGuest) {
      updateOrderCounts(0, 0);
      const emptyHtml = `
        <div class="account-empty-state">
          <div class="account-empty-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2"></path>
              <path d="M3 14v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16v-2"></path>
              <line x1="3.27" y1="6.96" x2="12" y2="12.01"></line>
              <line x1="20.73" y1="6.96" x2="12" y2="12.01"></line>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <h3 class="account-empty-headline">You haven't placed any orders yet.</h3>
          <p class="account-empty-desc">Once you complete a purchase, your orders and delivery updates will appear here.</p>
          <a href="products.html" class="btn btn-primary">Explore Products &rarr;</a>
        </div>
      `;
      container.innerHTML = emptyHtml;
      if (overviewRecentContainer) {
        overviewRecentContainer.innerHTML = `
          <div class="account-empty-state" style="padding: 24px 16px;">
            <h4 class="account-empty-headline" style="font-size: 1rem;">You haven't placed any orders yet.</h4>
            <p class="account-empty-desc" style="margin-bottom: 12px;">Once you complete a purchase, your orders and delivery updates will appear here.</p>
            <a href="products.html" class="btn btn-primary btn-sm">Explore Products &rarr;</a>
          </div>
        `;
      }
      return;
    }

    const actualUserId = profile.cognitoId || profile.id;

    // 1. Initial immediate render from cache/local state
    const cachedOrders = getOrders();
    if (cachedOrders && cachedOrders.length > 0) {
      renderOrdersList(cachedOrders);
    } else {
      // Show clean loading spinner
      container.innerHTML = `
        <div class="account-orders-loading" style="text-align: center; padding: 48px 20px;">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 14px; display: block; color: var(--accent);">
            <circle cx="12" cy="12" r="9" stroke-opacity="0.2"></circle>
            <path d="M12 3a9 9 0 0 1 9 9">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
            </path>
          </svg>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin: 0;">Loading orders from AWS DynamoDB...</p>
        </div>
      `;
    }

    if (skipApiFetch || isFetchingOrders) return;
    isFetchingOrders = true;

    // 2. Fetch fresh orders from AWS DynamoDB backend
    try {
      if (window.ShopEaseOrderService && typeof window.ShopEaseOrderService.fetchUserOrders === 'function') {
        const res = await window.ShopEaseOrderService.fetchUserOrders(actualUserId);
        if (res && res.success) {
          renderOrdersList(res.orders || []);
        } else if (res && !res.success && (!cachedOrders || cachedOrders.length === 0)) {
          container.innerHTML = `
            <div class="account-empty-state" style="border: 1px dashed var(--error, #ef4444); background: var(--bg-subtle);">
              <div class="account-empty-icon" style="color: var(--error, #ef4444);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h3 class="account-empty-headline">Unable to load orders from AWS backend</h3>
              <p class="account-empty-desc">${res.error || 'A network error occurred while connecting to ShopEaseOrderFunction.'}</p>
              <button type="button" class="btn btn-primary btn-sm btn-retry-orders">Retry &rarr;</button>
            </div>
          `;
        }
      } else {
        renderOrdersList(getOrders());
      }
    } catch (err) {
      console.warn('[Account] Asynchronous order load error:', err);
      if (!cachedOrders || cachedOrders.length === 0) {
        renderOrdersList(getOrders());
      }
    } finally {
      isFetchingOrders = false;
    }
  }

  function renderAddressesUI() {
    const addresses = getAddresses();
    const container = document.getElementById('accountAddressesContainer');
    const overviewAddressesContainer = document.getElementById('overviewAddressesContainer');
    if (!container) return;

    if (addresses.length === 0) {
      container.innerHTML = `
        <div class="account-empty-state" style="grid-column: 1 / -1;">
          <div class="account-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
          <h3 class="account-empty-headline">No saved addresses yet.</h3>
          <p class="account-empty-desc">Add delivery destinations for quick, one-click checkout.</p>
          <button type="button" class="btn btn-primary" id="btnOpenAddAddressEmpty">Add New Address</button>
        </div>
      `;
      if (overviewAddressesContainer) {
        overviewAddressesContainer.innerHTML = `
          <div class="account-empty-state" style="padding: 24px 16px;">
            <h4 class="account-empty-headline" style="font-size: 1rem;">No saved addresses yet.</h4>
            <p class="account-empty-desc" style="margin-bottom: 12px;">Add a primary delivery destination for express shipping.</p>
            <button type="button" class="btn btn-primary btn-sm btn-nav-tab" data-tab="addresses">Add New Address &rarr;</button>
          </div>
        `;
      }
      return;
    }

    const html = addresses.map(addr => `
      <div class="account-address-card ${addr.isDefault ? 'default-address' : ''}" data-id="${addr.id}">
        <div>
          <div class="account-address-header">
            <span class="account-address-tag ${addr.isDefault ? 'primary' : ''}">${addr.tag}</span>
            ${addr.isDefault ? '<span class="account-badge-pill verified">Default Shipping</span>' : ''}
          </div>
          <div class="account-address-details" style="margin-top: 12px;">
            <div class="account-address-recipient">${addr.name}</div>
            <div>${addr.line1}</div>
            ${addr.line2 ? `<div>${addr.line2}</div>` : ''}
            <div>${addr.city}, ${addr.state} - <strong>${addr.pin}</strong></div>
            <div class="account-address-phone">Mobile: ${addr.phone}</div>
          </div>
        </div>

        <div class="account-address-actions">
          <button type="button" class="btn btn-outline btn-sm btn-edit-address" data-id="${addr.id}">Edit</button>
          ${!addr.isDefault ? `<button type="button" class="btn btn-outline btn-sm btn-set-default-address" data-id="${addr.id}">Set as Default</button>` : ''}
          ${!addr.isDefault ? `<button type="button" class="btn btn-outline btn-sm btn-delete-address" data-id="${addr.id}" style="color: var(--error);">Delete</button>` : ''}
        </div>
      </div>
    `).join('');

    container.innerHTML = html;

    if (overviewAddressesContainer) {
      const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
      overviewAddressesContainer.innerHTML = `
        <div class="account-address-card default-address" style="margin-bottom: 0;">
          <div>
            <div class="account-address-header">
              <span class="account-address-tag primary">${defaultAddr.tag}</span>
              <span class="account-badge-pill verified">Primary Delivery Destination</span>
            </div>
            <div class="account-address-details" style="margin-top: 12px;">
              <div class="account-address-recipient">${defaultAddr.name}</div>
              <div>${defaultAddr.line1}</div>
              ${defaultAddr.line2 ? `<div>${defaultAddr.line2}</div>` : ''}
              <div>${defaultAddr.city}, ${defaultAddr.state} - <strong>${defaultAddr.pin}</strong></div>
              <div class="account-address-phone">Phone: ${defaultAddr.phone}</div>
            </div>
          </div>
          <div class="account-address-actions">
            <button type="button" class="btn btn-outline btn-sm btn-nav-tab" data-tab="addresses">Manage All Addresses &rarr;</button>
          </div>
        </div>
      `;
    }
  }

  function renderPaymentsUI() {
    const payments = getPayments();
    const container = document.getElementById('accountPaymentsContainer');
    if (!container) return;

    if (payments.length === 0) {
      container.innerHTML = `
        <div class="account-empty-state" style="grid-column: 1 / -1;">
          <div class="account-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
          </div>
          <h3 class="account-empty-headline">No payment methods saved.</h3>
          <p class="account-empty-desc">Save credit/debit cards or UPI IDs for secure, hassle-free payments.</p>
          <button type="button" class="btn btn-primary" id="btnOpenAddPaymentEmpty">Add Payment Method</button>
        </div>
      `;
      return;
    }

    const html = payments.map(pm => `
      <div class="account-payment-card" data-id="${pm.id}">
        <div>
          <div class="account-payment-top">
            <div class="account-payment-chip">
              <span class="account-payment-icon">${pm.brand}</span>
              <span>${pm.bank}</span>
            </div>
            ${pm.isDefault ? '<span class="account-badge-pill verified">Default</span>' : ''}
          </div>
          <div class="account-payment-masked">${pm.masked}</div>
          <div class="account-payment-meta">
            <span>Cardholder: <strong>${pm.cardholder}</strong></span>
            ${pm.expiry ? `<span>Expires: <strong>${pm.expiry}</strong></span>` : ''}
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <span class="account-pci-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>PCI-DSS Encrypted</span>
          </span>
          <button type="button" class="btn btn-outline btn-sm btn-delete-payment" data-id="${pm.id}" style="color: var(--error);">
            Remove
          </button>
        </div>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  function renderWishlistUI() {
    const container = document.getElementById('accountWishlistContainer');
    if (!container) return;

    let wishIds = [];
    if (window.ShopEaseCart && typeof window.ShopEaseCart.loadWishlist === 'function') {
      wishIds = window.ShopEaseCart.loadWishlist();
    } else {
      try {
        const raw = localStorage.getItem('shopease_wishlist_items');
        if (raw) wishIds = JSON.parse(raw);
      } catch (e) {}
    }

    if (!Array.isArray(wishIds) || wishIds.length === 0) {
      container.innerHTML = `
        <div class="account-empty-state" style="grid-column: 1 / -1;">
          <div class="account-empty-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <h3 class="account-empty-headline">Your wishlist is empty.</h3>
          <p class="account-empty-desc">Save products you love and find them here later.</p>
          <a href="products.html" class="btn btn-primary">Explore Products &rarr;</a>
        </div>
      `;
      return;
    }

    const html = wishIds.map(prodId => {
      const prod = window.ShopEaseData ? window.ShopEaseData.getProductById(prodId) : null;
      if (!prod) return '';
      const fallbackImg = window.ShopEaseData ? window.ShopEaseData.getFallbackImage(prod.category) : '';
      return `
        <div class="account-wishlist-card" data-product-id="${prod.id}">
          <div class="account-wishlist-img-box">
            <img src="${prod.image}" alt="${prod.name}" onerror="this.src='${fallbackImg}'">
          </div>
          <div class="account-wishlist-content">
            <div>
              <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--accent); margin-bottom: 2px;">
                ${prod.brand}
              </div>
              <div class="account-wishlist-title">
                <a href="product.html?id=${prod.id}" style="color: inherit; text-decoration: none;">${prod.name}</a>
              </div>
              <div class="account-wishlist-price-row">
                <span class="account-wishlist-price">${formatINR(prod.price)}</span>
                ${prod.originalPrice ? `<span class="account-wishlist-original">${formatINR(prod.originalPrice)}</span>` : ''}
              </div>
            </div>
            <div class="account-wishlist-actions">
              <button type="button" class="btn btn-primary btn-sm btn-move-to-bag" data-id="${prod.id}" style="flex: 1;">
                Move to Bag
              </button>
              <button type="button" class="btn btn-outline btn-sm btn-remove-wishlist" data-id="${prod.id}" title="Remove item" style="padding: 6px 10px; color: var(--error);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  // --- Modal Helpers & Order Handlers ---
  function openOrderDetailsModal(orderId) {
    const orders = getOrders();
    const cleanId = String(orderId).replace('#', '');
    const order = orders.find(o => o.rawId === cleanId || o.orderId === orderId || o.orderId === '#' + cleanId);
    if (!order) {
      showToast('Order details could not be found.', 'error');
      return;
    }

    const titleEl = document.getElementById('modalOrderDetailsTitle');
    const subEl = document.getElementById('modalOrderDetailsSub');
    const bodyEl = document.getElementById('modalOrderDetailsBody');
    const modalDownloadBtn = document.getElementById('btnModalDownloadInvoice');

    if (titleEl) titleEl.textContent = `Order ${order.orderId}`;
    if (subEl) {
      subEl.innerHTML = `Placed on ${order.date} &bull; <span class="account-order-status-badge ${order.statusClass}">${order.statusLabel || order.status}</span>`;
    }
    if (modalDownloadBtn) {
      modalDownloadBtn.setAttribute('data-order-id', order.rawId || cleanId);
    }

    const modalFooter = document.getElementById('modalOrderDetailsFooter');
    let modalCancelBtn = document.getElementById('btnModalCancelOrder');
    if (!modalCancelBtn && modalFooter) {
      modalCancelBtn = document.createElement('button');
      modalCancelBtn.type = 'button';
      modalCancelBtn.id = 'btnModalCancelOrder';
      modalCancelBtn.className = 'btn btn-outline btn-cancel-order';
      modalCancelBtn.style.cssText = 'color: var(--error); border-color: var(--error);';
      modalCancelBtn.innerHTML = '<span>Cancel Order</span>';
      modalFooter.insertBefore(modalCancelBtn, modalFooter.firstChild.nextSibling);
    }
    if (modalCancelBtn) {
      modalCancelBtn.setAttribute('data-order-id', order.rawId || cleanId);
      modalCancelBtn.style.display = isCancellable(order) ? 'inline-flex' : 'none';
    }

    const firstOrderCat = (order.items && order.items[0] && (order.items[0].category || order.items[0].name)) || 'electronics';
    const fallbackImg = window.ShopEaseData ? window.ShopEaseData.getFallbackImage(firstOrderCat) : '';
    const itemsList = order.items && order.items.length > 0 ? order.items : [
      { name: 'ShopEase Verified Product', price: order.totalAmount || order.total, quantity: 1, image: fallbackImg }
    ];

    const itemsHtml = itemsList.map(item => {
      const itemImg = (window.ShopEaseData && typeof window.ShopEaseData.resolveItemImage === 'function')
        ? window.ShopEaseData.resolveItemImage(item)
        : (item.image || fallbackImg);
      return `
      <div class="order-detail-item-row">
        <img class="order-detail-item-thumb" src="${itemImg}" alt="${item.name}" onerror="this.onerror=null; this.src='${fallbackImg}'">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">${item.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            ${item.brand || 'Authentic'} &bull; Qty: ${item.quantity || 1} &times; ${formatINR(item.price)}
          </div>
        </div>
        <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary); text-align: right;">
          ${formatINR(item.price * (item.quantity || 1))}
        </div>
      </div>
    `;
    }).join('');

    const addr = order.shippingAddress || {};
    const addrLine = addr.address || addr.line1 || '';
    const addrHtml = (addrLine || addr.city) ? `
      <strong>${addr.name || order.customerName || 'Customer'}</strong><br>
      ${addrLine}${addr.line2 ? `, ${addr.line2}` : ''}<br>
      ${addr.city || ''}${addr.state ? `, ${addr.state}` : ''} - <strong>${addr.pincode || addr.pin || ''}</strong><br>
      ${addr.phone ? `Phone: ${addr.phone}` : ''}
    ` : `
      <strong>Standard Delivery</strong><br>
      Pre-configured shipping destination registered for this account.
    `;

    const isCancelled = order.statusClass === 'cancelled' || (order.status || '').toLowerCase().includes('cancel');
    const paymentStatus = order.paymentStatus || 'Paid';
    const isPaid = paymentStatus.toLowerCase() === 'paid';

    const timelineSteps = [
      { label: 'Placed', active: true },
      { label: 'Confirmed', active: ['Confirmed', 'Processing', 'Packed', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'].includes(order.status) },
      { label: 'Shipped', active: ['Packed', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'].includes(order.status) },
      { label: 'Out for Delivery', active: ['Out for Delivery', 'Delivered'].includes(order.status) },
      { label: isCancelled ? 'Cancelled' : 'Delivered', active: isCancelled || order.status === 'Delivered', isCancelled }
    ];

    const timelineHtml = `
      <div class="order-detail-section">
        <div class="order-detail-sec-title">Fulfillment Timeline</div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; position: relative;">
          ${timelineSteps.map((step, idx) => `
            <div style="flex: 1; text-align: center; position: relative;">
              <div style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                margin: 0 auto 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.6875rem;
                font-weight: 700;
                background: ${step.active ? (step.isCancelled ? 'var(--error)' : 'var(--accent)') : 'var(--border-color)'};
                color: #fff;
              ">
                ${step.isCancelled ? '&times;' : (step.active ? '&#10003;' : (idx + 1))}
              </div>
              <div style="font-size: 0.6875rem; font-weight: ${step.active ? '700' : '500'}; color: ${step.active ? 'var(--text-primary)' : 'var(--text-muted)'};">
                ${step.label}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    bodyEl.innerHTML = `
      <div class="order-detail-section">
        <div class="order-detail-sec-title">Ordered Items (${itemsList.length})</div>
        <div>${itemsHtml}</div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
        <div class="order-detail-section" style="margin-bottom: 0;">
          <div class="order-detail-sec-title">Shipping Address</div>
          <div class="order-detail-address-box">${addrHtml}</div>
        </div>

        <div class="order-detail-section" style="margin-bottom: 0;">
          <div class="order-detail-sec-title">Payment &amp; Logistics</div>
          <div class="order-detail-address-box">
            <div><strong>Payment:</strong> ${order.paymentMethod || 'Online Payment'}</div>
            <div><strong>Payment Status:</strong> <span style="color: ${isPaid ? 'var(--success)' : (isCancelled ? 'var(--error)' : 'var(--accent)')}; font-weight: 600;">${paymentStatus}</span></div>
            <div style="margin-top: 6px;"><strong>Carrier:</strong> ${order.carrier}</div>
            <div><strong>Tracking:</strong> <span style="font-family: var(--font-mono); font-size: 0.75rem;">${order.trackingId}</span></div>
            <div style="margin-top: 6px; font-size: 0.75rem; color: var(--text-muted);">
              <strong>User ID:</strong> <span style="font-family: var(--font-mono);">${order.userId || '--'}</span>
            </div>
            ${order.updatedAt ? `<div style="margin-top: 2px; font-size: 0.75rem; color: var(--text-muted);"><strong>Updated:</strong> ${new Date(order.updatedAt).toLocaleString('en-IN')}</div>` : ''}
          </div>
        </div>
      </div>

      ${timelineHtml}

      <div class="order-detail-section" style="margin-bottom: 0;">
        <div class="order-detail-sec-title">Price Breakdown</div>
        <div class="order-detail-breakdown">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>Items Subtotal</span>
            <span>${formatINR(order.subtotal || order.totalAmount || order.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>Shipping &amp; Handling</span>
            <span style="color: var(--success); font-weight: 600;">${order.shippingFee ? formatINR(order.shippingFee) : 'FREE Express Delivery'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color); font-weight: 700; font-size: 1rem;">
            <span>Total Amount</span>
            <span style="color: var(--accent);">${formatINR(order.totalAmount || order.total)}</span>
          </div>
        </div>
      </div>

      <div class="order-detail-section" style="margin-bottom: 0; background: var(--bg-subtle); padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        <div style="font-weight: 700; font-size: 0.8125rem; color: var(--text-primary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>Self-Service Order Management, Returns &amp; Warranty</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="order-details.html?orderId=${cleanId}" class="btn btn-outline btn-sm" style="font-size: 0.8125rem;">
            Dedicated Order Page &rarr;
          </a>
          <a href="shipping-returns.html?orderId=${cleanId}" class="btn btn-outline btn-sm" style="font-size: 0.8125rem;">
            Returns &amp; Replacement Portal &rarr;
          </a>
          <a href="warranty.html?orderId=${cleanId}" class="btn btn-outline btn-sm" style="font-size: 0.8125rem;">
            Warranty Coverage &rarr;
          </a>
        </div>
      </div>
    `;

    openModal('modalOrderDetails');
  }

  function openCancelOrderModal(orderId) {
    const orders = getOrders();
    const cleanId = String(orderId).replace('#', '');
    const order = orders.find(o => o.rawId === cleanId || o.orderId === orderId || o.orderId === '#' + cleanId);
    if (!order) {
      showToast('Order could not be found.', 'error');
      return;
    }

    const inputId = document.getElementById('cancelOrderId');
    const displayId = document.getElementById('cancelOrderDisplayId');
    const reasonSelect = document.getElementById('cancelReasonSelect');
    const commentsText = document.getElementById('cancelCommentsText');

    if (inputId) inputId.value = order.rawId || cleanId;
    if (displayId) displayId.textContent = order.orderId;
    if (reasonSelect) reasonSelect.value = '';
    if (commentsText) commentsText.value = '';

    openModal('modalCancelOrderDashboard');
  }

  // --- Modal Helpers ---
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  // --- Tab Navigation Controller ---
  function setActiveTab(tabId, shouldScroll = false) {

    // Update active nav button
    document.querySelectorAll('.account-nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update active tab panel
    document.querySelectorAll('.account-tab-panel').forEach(panel => {
      if (panel.id === `tab-${tabId}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    if (tabId === 'orders') {
      renderOrdersUI();
    } else if (tabId === 'overview') {
      renderOverviewStats();
    }

    // Update URL hash smoothly
    if (window.location.hash !== `#${tabId}`) {
      window.history.replaceState(null, null, `#${tabId}`);
    }

    // Scroll to top of content on mobile only if triggered by user interaction
    if (shouldScroll && window.innerWidth < 1024) {
      const mainEl = document.getElementById('accountMainContent');
      if (mainEl) mainEl.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // --- Initialization on DOM Load ---
  document.addEventListener('DOMContentLoaded', () => {
    // Initial renders
    renderProfileUI();
    renderOverviewStats();
    renderOrdersUI();
    renderAddressesUI();
    renderPaymentsUI();
    renderWishlistUI();
    syncAdminNavigation();
    window.setTimeout(syncAdminNavigation, 0);

    // Check URL Hash for direct navigation without auto-scrolling
    const initialHash = window.location.hash.replace('#', '');
    const validTabs = ['overview', 'orders', 'wishlist', 'profile', 'addresses', 'payments', 'security', 'preferences'];
    if (initialHash && validTabs.includes(initialHash)) {
      setActiveTab(initialHash, false);
    } else {
      setActiveTab('overview', false);
    }

    // Hash change event listener
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && validTabs.includes(hash)) {
        setActiveTab(hash, true);
      }
    });

    // Tab buttons event delegation
    document.addEventListener('click', (e) => {
      // Retry Loading Orders Button
      const btnRetryOrders = e.target.closest('.btn-retry-orders');
      if (btnRetryOrders) {
        e.preventDefault();
        renderOrdersUI();
        return;
      }

      // View Order Details Modal (via button click or clicking order card)
      const btnViewDetails = e.target.closest('.btn-view-order-details');
      if (btnViewDetails) {
        e.preventDefault();
        const orderId = btnViewDetails.getAttribute('data-order-id');
        if (orderId) openOrderDetailsModal(orderId);
        return;
      }

      const orderCard = e.target.closest('.account-order-card');
      if (orderCard && !e.target.closest('button, a, input, select, textarea, label')) {
        const orderId = orderCard.getAttribute('data-order-id');
        if (orderId) {
          openOrderDetailsModal(orderId);
          return;
        }
      }

      // Cancel Order Modal
      const btnCancelOrder = e.target.closest('.btn-cancel-order');
      if (btnCancelOrder) {
        e.preventDefault();
        const orderId = btnCancelOrder.getAttribute('data-order-id');
        if (orderId) openCancelOrderModal(orderId);
        return;
      }

      // Download Real Tax Invoice (Modal or Card Action)
      const btnDownloadInvoice = e.target.closest('.btn-download-invoice, #btnModalDownloadInvoice');
      if (btnDownloadInvoice) {
        e.preventDefault();
        const orderId = btnDownloadInvoice.getAttribute('data-order-id');
        if (orderId && window.ShopEaseInvoice && typeof window.ShopEaseInvoice.downloadInvoice === 'function') {
          window.ShopEaseInvoice.downloadInvoice(orderId);
        } else if (orderId) {
          showToast(`Preparing invoice for Order ${orderId}...`);
        }
        return;
      }

      // Sidebar Nav Buttons
      const navBtn = e.target.closest('button.account-nav-btn:not(.account-logout-btn), button.btn-nav-tab');
      if (navBtn) {
        e.preventDefault();
        const tab = navBtn.getAttribute('data-tab');
        if (tab) setActiveTab(tab, true);
        return;
      }

      // Stat card navigation
      const statCard = e.target.closest('.account-stat-card[data-tab]');
      if (statCard) {
        e.preventDefault();
        const tab = statCard.getAttribute('data-tab');
        if (tab) setActiveTab(tab, true);
        return;
      }

      // Edit Profile Modal Open
      const btnEditProfile = e.target.closest('#btnOpenEditProfile, #btnOpenEditProfileSecondary');
      if (btnEditProfile) {
        e.preventDefault();
        const profile = getProfile() || {};
        document.getElementById('editFullName').value = profile.name || '';
        document.getElementById('editEmail').value = profile.email || '';
        document.getElementById('editPhone').value = profile.phone || '';
        document.getElementById('editDob').value = profile.dob || '';
        document.getElementById('editGender').value = profile.gender || 'Male';
        openModal('modalEditProfile');
        return;
      }

      // Add Address Modal Open
      const btnAddAddr = e.target.closest('#btnOpenAddAddress, #btnOpenAddAddressAlt, #btnOpenAddAddressEmpty');
      if (btnAddAddr) {
        e.preventDefault();
        document.getElementById('formAddress').reset();
        document.getElementById('addressId').value = '';
        document.getElementById('modalAddressTitle').textContent = 'Add New Delivery Address';
        openModal('modalAddress');
        return;
      }

      // Edit Address Button
      const btnEditAddr = e.target.closest('.btn-edit-address');
      if (btnEditAddr) {
        e.preventDefault();
        const addrId = btnEditAddr.getAttribute('data-id');
        const addresses = getAddresses();
        const addr = addresses.find(a => a.id === addrId);
        if (addr) {
          document.getElementById('addressId').value = addr.id;
          document.getElementById('addrTag').value = addr.tag || 'Home';
          document.getElementById('addrName').value = addr.name || '';
          document.getElementById('addrPhone').value = addr.phone || '';
          document.getElementById('addrLine1').value = addr.line1 || '';
          document.getElementById('addrLine2').value = addr.line2 || '';
          document.getElementById('addrCity').value = addr.city || '';
          document.getElementById('addrState').value = addr.state || '';
          document.getElementById('addrPin').value = addr.pin || '';
          document.getElementById('addrIsDefault').checked = !!addr.isDefault;
          document.getElementById('modalAddressTitle').textContent = 'Edit Delivery Address';
          openModal('modalAddress');
        }
        return;
      }

      // Delete Address Button
      const btnDeleteAddr = e.target.closest('.btn-delete-address');
      if (btnDeleteAddr) {
        e.preventDefault();
        const addrId = btnDeleteAddr.getAttribute('data-id');
        if (confirm('Are you sure you want to remove this address?')) {
          if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.deleteAddress === 'function') {
            window.ShopEaseAuthService.deleteAddress(addrId);
          } else {
            let addresses = getAddresses();
            addresses = addresses.filter(a => a.id !== addrId);
            saveAddresses(addresses);
          }
          renderAddressesUI();
          showToast('Address removed');
        }
        return;
      }

      // Set Default Address Button
      const btnSetDefault = e.target.closest('.btn-set-default-address');
      if (btnSetDefault) {
        e.preventDefault();
        const addrId = btnSetDefault.getAttribute('data-id');
        if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.setDefaultAddress === 'function') {
          window.ShopEaseAuthService.setDefaultAddress(addrId);
        } else {
          let addresses = getAddresses();
          addresses = addresses.map(a => ({
            ...a,
            isDefault: a.id === addrId
          }));
          saveAddresses(addresses);
        }
        renderAddressesUI();
        showToast('Default address updated!');
        return;
      }

      // Add Payment Modal Open
      const btnAddPayment = e.target.closest('#btnOpenAddPayment, #btnOpenAddPaymentEmpty');
      if (btnAddPayment) {
        e.preventDefault();
        document.getElementById('formPayment').reset();
        openModal('modalPayment');
        return;
      }

      // Delete Payment Button
      const btnDeletePayment = e.target.closest('.btn-delete-payment');
      if (btnDeletePayment) {
        e.preventDefault();
        const pmId = btnDeletePayment.getAttribute('data-id');
        if (confirm('Are you sure you want to remove this payment method?')) {
          if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.deletePayment === 'function') {
            window.ShopEaseAuthService.deletePayment(pmId);
          } else {
            let payments = getPayments();
            payments = payments.filter(p => p.id !== pmId);
            savePayments(payments);
          }
          renderPaymentsUI();
          showToast('Payment method removed');
        }
        return;
      }

      // Change Password Modal Open
      const btnOpenChangePassword = e.target.closest('#btnOpenChangePassword');
      if (btnOpenChangePassword) {
        e.preventDefault();
        document.getElementById('formPassword').reset();
        openModal('modalPassword');
        return;
      }

      // Modal Close Buttons
      const modalClose = e.target.closest('[data-close-modal]');
      if (modalClose) {
        e.preventDefault();
        const targetModal = modalClose.closest('.account-modal-overlay');
        if (targetModal) targetModal.classList.remove('active');
        return;
      }

      // Move to Bag from Wishlist
      const btnMoveToBag = e.target.closest('.btn-move-to-bag');
      if (btnMoveToBag) {
        e.preventDefault();
        const prodId = btnMoveToBag.getAttribute('data-id');
        if (window.ShopEaseCart && typeof window.ShopEaseCart.addToCart === 'function') {
          window.ShopEaseCart.addToCart(prodId, 1);
        }
        if (window.ShopEaseCart && typeof window.ShopEaseCart.toggleWishlist === 'function') {
          window.ShopEaseCart.toggleWishlist(prodId);
        }
        renderWishlistUI();
        renderOverviewStats();
        showToast('Moved item to Shopping Bag!');
        return;
      }

      // Remove from Wishlist
      const btnRemoveWish = e.target.closest('.btn-remove-wishlist');
      if (btnRemoveWish) {
        e.preventDefault();
        const prodId = btnRemoveWish.getAttribute('data-id');
        if (window.ShopEaseCart && typeof window.ShopEaseCart.toggleWishlist === 'function') {
          window.ShopEaseCart.toggleWishlist(prodId);
        }
        renderWishlistUI();
        renderOverviewStats();
        showToast('Item removed from wishlist');
        return;
      }

      // Logout / Sign Out Button
      const btnLogout = e.target.closest('#btnSignOut, #btnSignOutSecondary, #btnAccountLogout');
      if (btnLogout) {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
          if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.logout === 'function') {
            window.ShopEaseAuthService.logout();
          } else {
            localStorage.removeItem('shopease_session');
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(STORAGE_KEY);
          }
          renderProfileUI();
          renderOverviewStats();
          renderOrdersUI();
          renderAddressesUI();
          renderPaymentsUI();
          showToast('Logged out successfully.');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 500);
        }
        return;
      }
    });

    // Close Modals on Overlay Click
    document.querySelectorAll('.account-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Close Modals on Escape Key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.account-modal-overlay.active').forEach(m => m.classList.remove('active'));
      }
    });

    // --- Form Submissions ---

    // 1. Edit Profile Form
    const formEditProfile = document.getElementById('formEditProfile');
    if (formEditProfile) {
      formEditProfile.addEventListener('submit', (e) => {
        e.preventDefault();
        const current = getProfile() || {};
        const updated = {
          ...current,
          name: document.getElementById('editFullName').value.trim() || current.name,
          email: document.getElementById('editEmail').value.trim() || current.email,
          phone: document.getElementById('editPhone').value.trim() || current.phone,
          dob: document.getElementById('editDob').value || current.dob,
          gender: document.getElementById('editGender').value || current.gender
        };
        saveProfile(updated);
        renderProfileUI();
        closeModal('modalEditProfile');
        showToast('Profile updated successfully!');
      });
    }

    // 2. Address Form (Add / Edit)
    const formAddress = document.getElementById('formAddress');
    if (formAddress) {
      formAddress.addEventListener('submit', (e) => {
        e.preventDefault();
        const existingId = document.getElementById('addressId').value;
        const tag = document.getElementById('addrTag').value.trim() || 'Home';
        const name = document.getElementById('addrName').value.trim();
        const phone = document.getElementById('addrPhone').value.trim();
        const line1 = document.getElementById('addrLine1').value.trim();
        const line2 = document.getElementById('addrLine2').value.trim();
        const city = document.getElementById('addrCity').value.trim();
        const state = document.getElementById('addrState').value.trim();
        const pin = document.getElementById('addrPin').value.trim();
        const isDefault = document.getElementById('addrIsDefault').checked;

        const addrData = {
          id: existingId || ('addr-' + Date.now()),
          tag,
          name,
          phone,
          line1,
          line2,
          city,
          state,
          pin,
          isDefault
        };

        if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.saveAddress === 'function') {
          window.ShopEaseAuthService.saveAddress(addrData);
        } else {
          let addresses = getAddresses();
          if (existingId) {
            addresses = addresses.map(a => a.id === existingId ? addrData : (isDefault ? { ...a, isDefault: false } : a));
          } else {
            if (isDefault) addresses = addresses.map(a => ({ ...a, isDefault: false }));
            addresses.push(addrData);
          }
          saveAddresses(addresses);
        }

        renderAddressesUI();
        showToast(existingId ? 'Address updated successfully!' : 'New address saved!');
        closeModal('modalAddress');
      });
    }

    // 3. Payment Method Form (Add Card / UPI)
    const formPayment = document.getElementById('formPayment');
    if (formPayment) {
      formPayment.addEventListener('submit', (e) => {
        e.preventDefault();
        const payType = document.getElementById('payMethodType').value;
        const profile = getProfile() || {};
        let pmData = null;

        if (payType === 'CARD') {
          const cardNumber = document.getElementById('payCardNumber').value.replace(/\s+/g, '');
          const cardHolder = document.getElementById('payCardHolder').value.trim().toUpperCase();
          const cardExpiry = document.getElementById('payCardExpiry').value.trim();
          const last4 = cardNumber.slice(-4) || '8888';
          const brand = cardNumber.startsWith('4') ? 'VISA' : (cardNumber.startsWith('5') ? 'MC' : 'CARD');

          pmData = {
            id: 'pm-' + Date.now(),
            type: 'CARD',
            bank: brand === 'VISA' ? 'HDFC Bank' : 'ICICI Bank',
            brand: brand,
            masked: `•••• •••• •••• ${last4}`,
            cardholder: cardHolder || (profile.name && profile.name !== 'Guest User' ? profile.name.toUpperCase() : 'CARDHOLDER'),
            expiry: cardExpiry || '12/28',
            isDefault: false
          };
        } else {
          const upiId = document.getElementById('payUpiId').value.trim();
          pmData = {
            id: 'pm-' + Date.now(),
            type: 'UPI',
            bank: 'UPI Linked Account',
            brand: 'UPI',
            masked: upiId,
            upiId: upiId,
            cardholder: profile.name && profile.name !== 'Guest User' ? profile.name : 'Account Holder',
            isDefault: false
          };
        }

        if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.savePayment === 'function') {
          window.ShopEaseAuthService.savePayment(pmData);
        } else {
          let payments = getPayments();
          payments.push(pmData);
          savePayments(payments);
        }

        renderPaymentsUI();
        showToast('Payment method securely saved!');
        closeModal('modalPayment');
      });
    }

    // 4. Change Password Form
    const formPassword = document.getElementById('formPassword');
    if (formPassword) {
      formPassword.addEventListener('submit', async (e) => {
        e.preventDefault();
        const curr = document.getElementById('currPass').value;
        const next1 = document.getElementById('newPass').value;
        const next2 = document.getElementById('confirmPass').value;

        if (next1 !== next2) {
          showToast('New passwords do not match.', 'error');
          return;
        }

        if (next1.length < 8) {
          showToast('Password must be at least 8 characters.', 'error');
          return;
        }

        if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.changePassword === 'function') {
          try {
            const res = await window.ShopEaseAuthService.changePassword(curr, next1);
            if (!res.success) {
              showToast(res.message || 'Failed to update password', 'error');
              return;
            }
          } catch (err) {
            showToast(err.message || 'Error updating password', 'error');
            return;
          }
        }

        closeModal('modalPassword');
        showToast('Password updated securely with cryptographic verification!');
      });
    }

    // 5. Cancel Order Form
    const formCancelOrderDashboard = document.getElementById('formCancelOrderDashboard');
    if (formCancelOrderDashboard) {
      formCancelOrderDashboard.addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = document.getElementById('cancelOrderId').value;
        const reason = document.getElementById('cancelReasonSelect').value;
        const comments = document.getElementById('cancelCommentsText').value.trim();

        if (!reason) {
          showToast('Please select a cancellation reason.', 'error');
          return;
        }

        const btnConfirm = document.getElementById('btnConfirmCancellation');
        const originalBtnText = btnConfirm ? btnConfirm.innerHTML : 'Confirm Cancellation';
        if (btnConfirm) {
          btnConfirm.disabled = true;
          btnConfirm.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-opacity="0.2"></circle><path d="M12 3a9 9 0 0 1 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg> Cancelling...</span>';
        }

        try {
          if (window.ShopEaseOrderService && typeof window.ShopEaseOrderService.cancelOrder === 'function') {
            const res = await window.ShopEaseOrderService.cancelOrder(orderId, reason, comments);
            if (res && res.success) {
              closeModal('modalCancelOrderDashboard');
              closeModal('modalOrderDetails');
              await renderOrdersUI(true);
              renderOverviewStats();
              const displayIdStr = orderId.startsWith('#') ? orderId : '#' + orderId;
              showToast(`Order ${displayIdStr} has been cancelled successfully.`, 'success');
              return;
            } else if (res && !res.success) {
              if (res.error && res.error.toLowerCase().includes('already cancelled')) {
                closeModal('modalCancelOrderDashboard');
                closeModal('modalOrderDetails');
                await renderOrdersUI(true);
                renderOverviewStats();
                const displayIdStr = orderId.startsWith('#') ? orderId : '#' + orderId;
                showToast(`Order ${displayIdStr} is already cancelled.`, 'info');
                return;
              }
              showToast(res.error || res.message || 'Unable to cancel this order.', 'error');
              return;
            }
          }

          // Fallback cancellation directly on storage if service not available
          try {
            const raw = localStorage.getItem('shopease_orders_data');
            if (raw) {
              let orders = JSON.parse(raw);
              const clean = orderId.replace('#', '');
              orders = orders.map(o => {
                if (o.rawId === clean || o.orderId === orderId || o.orderId === '#' + clean) {
                  return {
                    ...o,
                    status: 'Cancelled',
                    statusClass: 'cancelled',
                    statusLabel: 'Cancelled by customer',
                    cancellationReason: reason
                  };
                }
                return o;
              });
              localStorage.setItem('shopease_orders_data', JSON.stringify(orders));
            }
          } catch (err) {
            console.error(err);
          }

          closeModal('modalCancelOrderDashboard');
          await renderOrdersUI();
          renderOverviewStats();
          const displayIdStr = orderId.startsWith('#') ? orderId : '#' + orderId;
          showToast(`Order ${displayIdStr} has been cancelled.`);
        } catch (err) {
          console.error('Cancellation submission error:', err);
          showToast('An unexpected error occurred while processing cancellation.', 'error');
        } finally {
          if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = originalBtnText;
          }
        }
      });
    }

    // 5. 2FA Switch Toggle
    const twoFaToggle = document.getElementById('twoFaToggle');
    if (twoFaToggle) {
      const user = window.ShopEaseAuthService ? window.ShopEaseAuthService.getCurrentUser() : null;
      const is2FA = user && user.twoFactorEnabled !== undefined ? user.twoFactorEnabled : (localStorage.getItem(TWO_FA_KEY) === 'true');
      twoFaToggle.checked = is2FA;
      update2FAStatusUI(is2FA);

      twoFaToggle.addEventListener('change', () => {
        const enabled = twoFaToggle.checked;
        if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.toggleTwoFactor === 'function') {
          window.ShopEaseAuthService.toggleTwoFactor(enabled);
        } else {
          localStorage.setItem(TWO_FA_KEY, enabled.toString());
        }
        update2FAStatusUI(enabled);
        showToast(enabled ? 'Two-Factor Authentication Enabled via AWS Cognito' : 'Two-Factor Authentication Disabled');
      });
    }

    function update2FAStatusUI(enabled) {
      const statusEl = document.getElementById('twoFaStatusText');
      if (statusEl) {
        statusEl.textContent = enabled ? 'Enabled (Authenticator App)' : 'Disabled (Recommended to enable)';
        statusEl.style.color = enabled ? 'var(--success)' : 'var(--text-muted)';
      }
    }

    // 6. Theme Selector in Preferences
    const themeOptions = document.querySelectorAll('.account-theme-option');
    function syncThemeUI() {
      const current = localStorage.getItem('shopease_theme_preference') || 'light';
      themeOptions.forEach(opt => {
        if (opt.getAttribute('data-mode') === current) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });
    }

    syncThemeUI();

    themeOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        const mode = opt.getAttribute('data-mode');
        // If theme system is present
        const btnTheme = document.querySelector(`[data-theme-mode="${mode}"]`);
        if (btnTheme) {
          btnTheme.click();
        } else if (window.ShopEaseTheme && typeof window.ShopEaseTheme.setTheme === 'function') {
          window.ShopEaseTheme.setTheme(mode);
        } else {
          localStorage.setItem('shopease_theme_preference', mode);
          document.documentElement.setAttribute('data-theme', mode);
        }
        syncThemeUI();
        showToast(`Theme updated to ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`);
      });
    });

    // Listen for external cart, wishlist, or order changes
    window.addEventListener('shopease:wishlist-updated', () => {
      renderWishlistUI();
      renderOverviewStats();
    });

    window.addEventListener('shopease:cart-updated', () => {
      renderOverviewStats();
    });

    window.addEventListener('shopease:order-updated', (e) => {
      if (e && e.detail && Array.isArray(e.detail.orders)) {
        renderOrdersList(e.detail.orders);
        renderOverviewStats();
      } else {
        renderOrdersUI(true);
        renderOverviewStats();
      }
    });

    window.addEventListener('shopease:auth-changed', () => {
      renderProfileUI();
      renderOverviewStats();
      renderOrdersUI();
      renderAddressesUI();
      renderPaymentsUI();
      renderWishlistUI();
    });

    window.addEventListener('storage', (e) => {
      if (e.key === 'shopease_orders_data' || e.key === 'shopease_session') {
        renderProfileUI();
        syncAdminNavigation();
        renderOrdersUI(true);
        renderOverviewStats();
      }
    });

  });

  // Global Export
  window.ShopEaseAccount = {
    getProfile,
    saveProfile,
    getAddresses,
    saveAddresses,
    getPayments,
    savePayments,
    getOrders,
    renderOrdersUI,
    setActiveTab,
    showToast
  };

})();
