/**
 * ShopEase Main Application UI Controller
 * Manages responsive navigation, search overlay, toast messages,
 * catalog rendering, category filtering, and profile dropdown menu.
 */

(function () {
  'use strict';

  const API_GATEWAY_BASE_URL = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com';
  if (typeof window !== 'undefined') {
    window.SHOPEASE_API_URL = window.SHOPEASE_API_URL || API_GATEWAY_BASE_URL;
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      dismissToast(toast);
    });

    container.appendChild(toast);

    // Auto dismiss after 3.5s
    setTimeout(() => {
      dismissToast(toast);
    }, 3500);
  }

  function dismissToast(toast) {
    if (!toast || toast.__dismissing) return;
    toast.__dismissing = true;
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 250);
  }

  // --- Profile Dropdown Menu Controller ---
  function initProfileDropdown() {
    const profileToggle = document.getElementById('profileToggleBtn') || document.getElementById('profileMenuBtn');
    const profileDropdown = document.getElementById('profileDropdown');

    if (!profileToggle || !profileDropdown) return;

    function openDropdown() {
      profileDropdown.classList.add('open');
      profileToggle.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      profileDropdown.classList.remove('open');
      profileToggle.setAttribute('aria-expanded', 'false');
    }

    profileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = profileDropdown.classList.contains('open');
      if (isOpen) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    // Close immediately when clicking any navigation link or non-theme action inside dropdown
    profileDropdown.querySelectorAll('a, button:not([data-theme-toggle])').forEach((el) => {
      el.addEventListener('click', () => {
        closeDropdown();
      });
    });

    // Close when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (!profileDropdown.contains(e.target) && !profileToggle.contains(e.target)) {
        closeDropdown();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && profileDropdown.classList.contains('open')) {
        closeDropdown();
      }
    });

    // Guarantee dropdown is closed on browser Back/Forward navigation
    window.addEventListener('pageshow', () => {
      closeDropdown();
    });
    window.addEventListener('popstate', () => {
      closeDropdown();
    });
  }

  // --- Mobile Navigation ---
  function initMobileNav() {
    const mobileMenuBtn = document.getElementById('mobileMenuToggle') || document.querySelector('[data-open-mobile-menu]');
    const mobileMenu = document.getElementById('mobileMenu') || document.getElementById('mobileMenuDrawer');
    const backdrop = document.getElementById('mobileMenuBackdrop') || document.querySelector('.mobile-menu-backdrop');
    const closeBtn = document.getElementById('closeMobileMenu') || document.querySelector('[data-close-mobile-menu]');

    if (!mobileMenuBtn || !mobileMenu) return;

    function openMenu() {
      mobileMenu.classList.add('open');
      if (backdrop) backdrop.classList.add('open');
      mobileMenuBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    }

    function closeMenu() {
      mobileMenu.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    }

    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('open');
      if (isOpen) closeMenu();
      else openMenu();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    document.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        closeMenu();
      }
    });
  }

  // --- Live Search Modal ---
  function initSearchModal() {
    const searchModal = document.getElementById('searchModal');
    const searchInput = document.getElementById('searchModalInput');
    const searchResults = document.getElementById('searchResults');
    const searchBackdrop = document.getElementById('searchBackdrop');
    const closeBtn = document.getElementById('closeSearchModal');

    if (!searchModal || !searchInput) return;

    function openSearch() {
      searchModal.classList.add('open');
      if (searchBackdrop) searchBackdrop.classList.add('open');
      document.body.classList.add('search-open');
      searchInput.value = '';
      renderSearchResults('');
      setTimeout(() => searchInput.focus(), 50);

      if (window.ShopEaseEvents) {
        window.ShopEaseEvents.track('search_modal_opened');
      }
    }

    function closeSearch() {
      searchModal.classList.remove('open');
      if (searchBackdrop) searchBackdrop.classList.remove('open');
      document.body.classList.remove('search-open');
    }

    // Triggers
    document.querySelectorAll('[data-open-search]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSearch();
      });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeSearch);
    if (searchBackdrop) searchBackdrop.addEventListener('click', closeSearch);

    // Keyboard shortcut: '/' or Ctrl/Cmd+K
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchModal.classList.contains('open')) {
        closeSearch();
      } else if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      }
    });

    // Real-time query filtering
    let searchDebounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value.trim();
      searchDebounceTimer = setTimeout(() => {
        renderSearchResults(query);
        if (query.length > 2 && window.ShopEaseEvents) {
          window.ShopEaseEvents.track('search_executed', { query });
        }
      }, 150);
    });

    function renderSearchResults(query) {
      if (!searchResults) return;

      if (!query) {
        searchResults.innerHTML = `
          <div class="search-empty-state">
            <p class="search-hint">Popular searches & direct filters:</p>
            <div class="search-tags">
              <span class="search-tag" data-search-term="MacBook">MacBook Air</span>
              <span class="search-tag" data-search-term="iPhone">iPhone 16</span>
              <span class="search-tag" data-search-term="Sony">Sony WH-1000XM5</span>
              <span class="search-tag" data-search-term="Air Force">Nike Air Force 1</span>
              <span class="search-tag" data-search-term="Galaxy">Galaxy S25</span>
              <span class="search-tag" data-search-term="Apple Watch">Apple Watch</span>
            </div>
          </div>
        `;
        searchResults.querySelectorAll('.search-tag').forEach((tag) => {
          tag.addEventListener('click', () => {
            const term = tag.getAttribute('data-search-term');
            searchInput.value = term;
            renderSearchResults(term);
          });
        });
        return;
      }

      const results = window.ShopEaseData ? window.ShopEaseData.searchProducts(query) : [];

      if (results.length === 0) {
        searchResults.innerHTML = `
          <div class="search-no-results">
            <p>No products found matching "<strong>${escapeHtml(query)}</strong>"</p>
            <span class="search-subhint">Try checking the spelling or use broader keywords.</span>
          </div>
        `;
        return;
      }

      const formatINR = window.ShopEaseData.formatINR;

      searchResults.innerHTML = `
        <div class="search-results-list">
          <div class="search-count-header">${results.length} product${results.length === 1 ? '' : 's'} found</div>
          ${results
            .map(
              (p) => `
            <div class="search-item">
              <img src="${p.image}" alt="${p.name}" class="search-item-thumb" onerror="this.src='${window.ShopEaseData.getFallbackImage(p.category)}'">
              <div class="search-item-info">
                <span class="search-item-cat">${p.category}</span>
                <a href="product.html?id=${p.id}" class="search-item-title">${p.name}</a>
                <div class="search-item-price">${formatINR(p.price)}</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline" data-add-to-cart data-product-id="${p.id}">
                Add
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Featured Products Rendering (index.html) ---
  function renderFeaturedProducts(categoryFilter = 'all') {
    const grid = document.getElementById('featuredProductsGrid');
    if (!grid || !window.ShopEaseData) return;

    let products = window.ShopEaseData.getFeaturedProducts();
    if (categoryFilter !== 'all') {
      products = products.filter((p) => p.categoryId === categoryFilter);
      if (products.length === 0) {
        products = window.ShopEaseData.getProductsByCategory(categoryFilter);
      }
    }
    products = products.slice(0, 8);

    const formatINR = window.ShopEaseData.formatINR;
    const isWishlisted = (id) => (window.ShopEaseCart ? window.ShopEaseCart.isInWishlist(id) : false);

    grid.innerHTML = products
      .map((p) => {
        const wishActive = isWishlisted(p.id) ? 'active' : '';
        const fallbackImg = window.ShopEaseData.getFallbackImage(p.name, p.category);
        const primaryImg = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : (p.image || fallbackImg);
        const discountPercent = p.originalPrice
          ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
          : 0;

        return `
        <article class="product-card-compact" data-product-id="${p.id}">
          <button type="button" class="card-wishlist-btn ${wishActive}" data-wishlist-btn data-product-id="${p.id}" aria-label="Save to wishlist" title="Save to Wishlist">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>

          ${discountPercent > 0 ? `<span class="card-badge badge-sale">${discountPercent}% OFF</span>` : (p.badge ? `<span class="card-badge">${escapeHtml(p.badge)}</span>` : '')}
          
          <a href="product.html?id=${p.id}" class="card-img-wrap" tabindex="-1">
            <img src="${primaryImg}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='${fallbackImg}'">
          </a>

          <div class="card-body">
            <div class="card-brand">${escapeHtml(p.brand || p.category)}</div>
            <h3 class="card-name">
              <a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a>
            </h3>
            
            <div class="card-rating-row">
              <span class="card-rating-star">★</span>
              <span style="font-weight: 700; color: var(--text-primary);">${p.rating}</span>
              <span style="color: var(--text-muted); font-size: 0.75rem;">(${p.reviewsCount})</span>
            </div>

            <div class="card-price-row">
              <span class="card-price">${formatINR(p.price)}</span>
              ${p.originalPrice ? `<span class="card-orig-price">${formatINR(p.originalPrice)}</span>` : ''}
            </div>

            <button type="button" class="card-btn-add" data-add-to-cart data-product-id="${p.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add to Cart</span>
            </button>
          </div>
        </article>
      `;
      })
      .join('');
  }

  function initCategoryFilters() {
    const filterButtons = document.querySelectorAll('[data-product-filter]');
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-product-filter');
        renderFeaturedProducts(filter);

        if (window.ShopEaseEvents) {
          window.ShopEaseEvents.track('filter_category_selected', { category: filter });
        }
      });
    });
  }

  // --- Newsletter Form Validation ---
  function initNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address.', 'error');
        return;
      }

      showToast('Thank you! You are subscribed to product updates & exclusive offers.', 'success');
      form.reset();

      if (window.ShopEaseEvents) {
        window.ShopEaseEvents.track('newsletter_subscribed', { emailDomain: email.split('@')[1] });
      }
    });
  }

  // --- Header Sticky Elevation on Scroll ---
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    window.addEventListener(
      'scroll',
      () => {
        if (window.scrollY > 20) {
          header.classList.add('header-scrolled');
        } else {
          header.classList.remove('header-scrolled');
        }
      },
      { passive: true }
    );
  }

  // --- Global Navigation Scroll Restoration Controller ---
  function initScrollManagement() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    const resetToTop = () => {
      if (!window.location.hash || window.location.hash === '#') {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch (_) {
          window.scrollTo(0, 0);
        }
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    };

    // Immediate check on DOM ready
    resetToTop();

    // Re-verify when full assets (images, stylesheets) complete loading
    window.addEventListener('load', () => {
      if ((!window.location.hash || window.location.hash === '#') && window.scrollY > 0) {
        resetToTop();
      }
    });

    // Clean scroll state when navigating via internal links
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || link.target === '_blank') {
          return;
        }

        try {
          const targetUrl = new URL(link.href, window.location.href);
          if (targetUrl.origin === window.location.origin && targetUrl.pathname !== window.location.pathname) {
            if ('scrollRestoration' in history) {
              history.scrollRestoration = 'manual';
            }
          }
        } catch (_) {}
      },
      { passive: true }
    );
  }

  // --- Header Wishlist Navigation Active State Controller ---
  function syncWishlistNavActiveState() {
    const isProductsPage =
      window.location.pathname.endsWith('products.html') ||
      window.location.pathname.endsWith('/products') ||
      window.location.pathname.endsWith('/products/');
    const urlParams = new URLSearchParams(window.location.search);
    const isWishlistRoute = isProductsPage && urlParams.get('view') === 'wishlist';

    // Header Wishlist Icon buttons
    const wishlistLinks = document.querySelectorAll(
      'header a[href*="view=wishlist"], .header-actions a[href*="view=wishlist"], a.header-wishlist-btn'
    );
    // Navigation Menu "Products" link
    const productsNavLinks = document.querySelectorAll(
      '.nav-menu a[href="products.html"], .nav-menu a[href="./products.html"]'
    );
    // Mobile Drawer Wishlist link
    const mobileWishlistLinks = document.querySelectorAll(
      '.mobile-nav-link[href*="view=wishlist"], .mobile-menu-drawer a[href*="view=wishlist"]'
    );

    wishlistLinks.forEach((link) => {
      if (isWishlistRoute) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
        link.setAttribute('title', 'Wishlist (Active)');
        link.setAttribute('aria-label', 'View saved wishlist (current page)');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
        link.setAttribute('title', 'Wishlist');
        link.setAttribute('aria-label', 'View saved wishlist');
      }
    });

    mobileWishlistLinks.forEach((link) => {
      if (isWishlistRoute) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });

    if (isProductsPage) {
      productsNavLinks.forEach((link) => {
        if (isWishlistRoute) {
          link.classList.remove('active');
          link.removeAttribute('aria-current');
        } else {
          link.classList.add('active');
          link.setAttribute('aria-current', 'page');
        }
      });
    }
  }

  function initWishlistNavActiveState() {
    syncWishlistNavActiveState();
    window.addEventListener('popstate', syncWishlistNavActiveState);
    window.addEventListener('pageshow', syncWishlistNavActiveState);
    window.addEventListener('shopease:wishlist-route-changed', syncWishlistNavActiveState);
  }

  // --- Header Cart Navigation Active State Controller ---
  function syncCartNavActiveState() {
    const isCartPage =
      window.location.pathname.endsWith('cart.html') ||
      window.location.pathname.endsWith('/cart') ||
      window.location.pathname.endsWith('/cart/');

    // Header Cart Icon buttons
    const cartLinks = document.querySelectorAll(
      'header a[href*="cart.html"], .header-actions a[href*="cart.html"], a.header-cart-btn, button.header-cart-btn, .header-actions [data-open-cart]'
    );
    // Mobile Drawer Cart links
    const mobileCartLinks = document.querySelectorAll(
      '.mobile-nav-link[href*="cart.html"], .mobile-menu-drawer a[href*="cart.html"], .mobile-menu a[href*="cart.html"]'
    );

    cartLinks.forEach((el) => {
      if (isCartPage) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
        el.setAttribute('title', 'Shopping Cart (Active)');
        el.setAttribute('aria-label', 'View shopping cart (current page)');
      } else {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
        el.setAttribute('title', 'Shopping Cart');
        el.setAttribute('aria-label', 'View shopping cart');
      }
    });

    mobileCartLinks.forEach((link) => {
      if (isCartPage) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  function initCartNavActiveState() {
    syncCartNavActiveState();
    window.addEventListener('popstate', syncCartNavActiveState);
    window.addEventListener('pageshow', syncCartNavActiveState);
  }

  // --- Global Order-Dependent Navigation & Visibility Controller ---
  function hasActiveOrders() {
    if (window.ShopEaseOrderService && typeof window.ShopEaseOrderService.hasOrders === 'function') {
      return window.ShopEaseOrderService.hasOrders();
    }
    try {
      const raw = localStorage.getItem('shopease_orders_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      }
      const last = localStorage.getItem('shopease_last_order');
      if (last) {
        const parsed = JSON.parse(last);
        if (parsed && (parsed.orderId || parsed.rawId)) return true;
      }
    } catch (e) {}
    return false;
  }

  function syncOrderDependentNavigation() {
    const hasOrders = hasActiveOrders();
    document.documentElement.setAttribute('data-has-orders', hasOrders ? 'true' : 'false');
    if (document.body) {
      document.body.setAttribute('data-has-orders', hasOrders ? 'true' : 'false');
    }

    // 1. Ensure all navigation elements are always visible regardless of whether there are orders
    document.querySelectorAll('[data-order-dependent], .order-dependent-item, .order-dependent-nav, .order-dependent-dot').forEach(el => {
      el.style.display = '';
    });

    // 2. Top Announcement Banner
    document.querySelectorAll('.top-banner-links a, .top-banner a').forEach(link => {
      link.style.display = '';
      const dot = link.nextElementSibling;
      if (dot && dot.tagName === 'SPAN') dot.style.display = '';
    });

    // 3. Profile Dropdown Menu: keep My Orders available without adding a separate tracker route
    document.querySelectorAll('.profile-dropdown').forEach(dropdown => {
      const navList = dropdown.querySelector('.profile-nav-links');
      if (!navList) return;

      // Ensure all list items are visible
      navList.querySelectorAll('li').forEach(li => { li.style.display = ''; });

      // Check / inject My Orders
      let myOrdersLi = Array.from(navList.querySelectorAll('li')).find(li => {
        const a = li.querySelector('a');
        return a && (a.getAttribute('href') === 'account.html#orders' || (a.textContent || '').toLowerCase().includes('my orders'));
      });

      const myAccountLi = Array.from(navList.querySelectorAll('li')).find(li => {
        const a = li.querySelector('a');
        return a && a.getAttribute('href') === 'account.html';
      });

      if (!myOrdersLi) {
        myOrdersLi = document.createElement('li');
        myOrdersLi.className = 'profile-nav-item';
        myOrdersLi.setAttribute('role', 'none');
        myOrdersLi.innerHTML = `
          <a href="account.html#orders" role="menuitem">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            <span>My Orders</span>
          </a>
        `;
        if (myAccountLi && myAccountLi.nextElementSibling) {
          navList.insertBefore(myOrdersLi, myAccountLi.nextElementSibling);
        } else if (myAccountLi) {
          navList.appendChild(myOrdersLi);
        } else {
          navList.insertBefore(myOrdersLi, navList.firstChild);
        }
      }

      navList.querySelectorAll('a[href*="order-tracking.html"]').forEach(link => {
        const trackingItem = link.closest('li');
        if (trackingItem) trackingItem.remove();
      });
    });

    // 4. Footer Customer Care Column: keep My Orders available when the footer has a care list
    document.querySelectorAll('.site-footer, footer').forEach(footer => {
      let careCol = Array.from(footer.querySelectorAll('.footer-col')).find(col => {
        const heading = col.querySelector('.footer-heading');
        return heading && heading.textContent.trim().toLowerCase().includes('customer care');
      }) || footer.querySelector('#support');

      if (careCol) {
        const list = careCol.querySelector('.footer-links-list, ul');
        if (list) {
          list.querySelectorAll('li').forEach(li => { li.style.display = ''; });

          // Ensure My Orders is present
          let myOrdersFooter = list.querySelector('a[href*="account.html#orders"], a[href="account.html#orders"]');
          if (!myOrdersFooter) {
            const li = document.createElement('li');
            li.innerHTML = '<a href="account.html#orders" class="footer-link">My Orders</a>';
            list.insertBefore(li, list.firstChild);
          }

        }
      }
    });

    // 5. Mobile Navigation Drawer: keep My Orders available without a separate tracker option
    document.querySelectorAll('.mobile-nav-list, .mobile-menu ul').forEach(menu => {
      menu.querySelectorAll('li').forEach(li => { li.style.display = ''; });

      let myOrdersMobile = menu.querySelector('a[href*="account.html#orders"]');
      if (!myOrdersMobile) {
        const allProductsLi = Array.from(menu.querySelectorAll('li')).find(li => {
          const a = li.querySelector('a');
          return a && a.getAttribute('href') === 'products.html';
        });
        const li = document.createElement('li');
        li.innerHTML = '<a href="account.html#orders" class="mobile-nav-link">My Orders</a>';
        if (allProductsLi && allProductsLi.nextElementSibling) {
          menu.insertBefore(li, allProductsLi.nextElementSibling);
        } else {
          menu.appendChild(li);
        }
      }

      menu.querySelectorAll('a[href*="order-tracking.html"]').forEach(link => {
        const trackingItem = link.closest('li');
        if (trackingItem) trackingItem.remove();
      });
    });

    // 6. Footer Legal Links & Quick Actions
    document.querySelectorAll('.footer-legal-links a, #quick-actions a').forEach(link => {
      link.style.display = '';
    });

    // Order access stays inside My Orders; remove the retired standalone route from shared navigation.
    document.querySelectorAll('.top-banner a[href*="order-tracking.html"], .profile-dropdown a[href*="order-tracking.html"], .mobile-menu a[href*="order-tracking.html"], .site-footer a[href*="order-tracking.html"], .footer-legal-links a[href*="order-tracking.html"]').forEach(link => {
      const item = link.closest('li');
      if (item) item.remove();
      else link.remove();
    });
  }

  // --- Header Profile Dynamic Authentication Sync ---
  function syncHeaderAuthUI() {
    const isAuth = window.ShopEaseAuthService ? window.ShopEaseAuthService.isAuthenticated() : false;
    const user = window.ShopEaseAuthService ? window.ShopEaseAuthService.getCurrentUser() : null;

    const headerAvatar = document.querySelector('.profile-header-avatar');
    const headerName = document.querySelector('.profile-header-name');
    const headerBadge = document.querySelector('.profile-header-badge');
    const profileDropdown = document.getElementById('profileDropdown');

    if (headerBadge) {
      if (isAuth && user) {
        headerBadge.textContent = 'Verified Account';
        headerBadge.style.display = 'inline-block';
        headerBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
        headerBadge.style.color = '#059669';
        headerBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      } else {
        headerBadge.textContent = 'Guest Visitor';
        headerBadge.style.display = 'inline-block';
        headerBadge.style.backgroundColor = 'rgba(100, 116, 139, 0.12)';
        headerBadge.style.color = 'var(--text-muted, #64748b)';
        headerBadge.style.border = '1px solid rgba(100, 116, 139, 0.2)';
      }
    }

    if (isAuth && user) {
      const initials = (user.name || 'U').trim().split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      if (headerAvatar) headerAvatar.textContent = initials;
      if (headerName) headerName.textContent = user.name || 'Customer Account';
    } else {
      if (headerAvatar) headerAvatar.textContent = 'G';
      if (headerName) headerName.textContent = 'Welcome Guest';
    }

    // Dynamic Auth Link in Profile Dropdown (Sign In / Register vs Sign Out)
    if (profileDropdown) {
      const authLink = profileDropdown.querySelector('a[href*="login.html"], #headerSignOutLink');
      if (authLink) {
        const linkText = authLink.querySelector('span');
        if (isAuth && user) {
          if (linkText) linkText.textContent = 'Sign Out';
          authLink.href = '#signout';
          authLink.setAttribute('id', 'headerSignOutLink');
          authLink.onclick = (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to sign out?')) {
              if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.logout === 'function') {
                window.ShopEaseAuthService.logout();
              }
              showToast('Signed out successfully.');
              setTimeout(() => {
                window.location.reload();
              }, 400);
            }
          };
        } else {
          if (linkText) linkText.textContent = 'Sign In / Register';
          authLink.href = 'login.html';
          authLink.removeAttribute('id');
          authLink.onclick = null;
        }
      }
    }
  }

  function syncAccountDropdownActiveState() {
    if (!/\/account\.html$/i.test(window.location.pathname)) return;
    const accountLink = document.querySelector('.profile-dropdown a[href="account.html"]');
    const ordersLink = document.querySelector('.profile-dropdown a[href="account.html#orders"]');
    if (!accountLink || !ordersLink) return;
    [accountLink, ordersLink].forEach(link => {
      link.classList.remove('active');
      link.style.color = '';
      link.style.fontWeight = '';
    });
    const activeLink = window.location.hash.toLowerCase() === '#orders' ? ordersLink : accountLink;
    activeLink.classList.add('active');
    activeLink.style.color = 'var(--accent)';
    activeLink.style.fontWeight = '700';
  }

  // Immediate execution on script parse
  syncOrderDependentNavigation();
  syncHeaderAuthUI();

  // Expose global App
  window.ShopEaseApp = {
    showToast,
    renderFeaturedProducts,
    syncWishlistNavActiveState,
    syncCartNavActiveState,
    syncOrderDependentNavigation,
    syncHeaderAuthUI,
    hasActiveOrders
  };

  // Run initializations on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initScrollManagement();
    initHeaderScroll();
    initMobileNav();
    initProfileDropdown();
    initSearchModal();
    initCategoryFilters();
    initNewsletterForm();
    initWishlistNavActiveState();
    initCartNavActiveState();
    renderFeaturedProducts('all');
    syncOrderDependentNavigation();
    syncHeaderAuthUI();
    syncAccountDropdownActiveState();

    window.addEventListener('shopease:auth-changed', () => {
      syncHeaderAuthUI();
      syncAccountDropdownActiveState();
      syncOrderDependentNavigation();
    });
    window.addEventListener('shopease:order-updated', syncOrderDependentNavigation);
    window.addEventListener('storage', () => {
      syncHeaderAuthUI();
      syncOrderDependentNavigation();
    });
    window.addEventListener('pageshow', () => {
      syncHeaderAuthUI();
      syncOrderDependentNavigation();
      syncAccountDropdownActiveState();
    });
  });
})();
