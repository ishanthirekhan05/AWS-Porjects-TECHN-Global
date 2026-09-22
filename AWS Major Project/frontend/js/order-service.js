/**
 * ShopEase - Order Management & Cancellation Service
 * Enterprise AWS-ready architecture: Interfaces seamlessly with:
 * Frontend -> API Gateway -> AWS Lambda (ShopEaseOrderFunction) -> Amazon DynamoDB (Table: ShopEaseOrder)
 * 
 * Provides centralized state management, status-dependent cancellation eligibility,
 * order ownership authorization guards, audit trail tracking, and live DynamoDB sync.
 */

(function () {
  'use strict';

  const ORDERS_STORAGE_KEY = 'shopease_orders_data';
  const API_ENDPOINT_STORAGE_KEY = 'shopease_orders_api_endpoint';
  const DYNAMODB_TABLE_NAME = 'ShopEaseOrder';
  const LAMBDA_FUNCTION_NAME = 'ShopEaseOrderFunction';
  const activeOrderCreations = new Map();
  const PENDING_ORDER_KEY = 'shopease_pending_order_creation';

  // Base AWS API Gateway Endpoint configuration
  const API_GATEWAY_BASE_URL = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com';
  const DEFAULT_ORDERS_API = `${API_GATEWAY_BASE_URL}/orders`;

  // Attach to window object for global frontend availability
  if (typeof window !== 'undefined') {
    window.SHOPEASE_API_URL = window.SHOPEASE_API_URL || API_GATEWAY_BASE_URL;
    window.SHOPEASE_ORDERS_API = window.SHOPEASE_ORDERS_API || DEFAULT_ORDERS_API;
  }

  // --- API Endpoint Accessors ---
  function getApiEndpoint() {
    if (window.SHOPEASE_ORDERS_API && typeof window.SHOPEASE_ORDERS_API === 'string' && window.SHOPEASE_ORDERS_API.trim()) {
      return window.SHOPEASE_ORDERS_API.trim();
    }
    if (window.SHOPEASE_API_URL && typeof window.SHOPEASE_API_URL === 'string' && window.SHOPEASE_API_URL.trim()) {
      const base = window.SHOPEASE_API_URL.trim().replace(/\/+$/, '');
      return base.endsWith('/orders') ? base : `${base}/orders`;
    }
    try {
      const stored = localStorage.getItem(API_ENDPOINT_STORAGE_KEY);
      if (stored && typeof stored === 'string' && stored.trim()) {
        return stored.trim();
      }
    } catch (e) {}
    return DEFAULT_ORDERS_API;
  }

  function setApiEndpoint(url) {
    try {
      if (url && typeof url === 'string' && url.trim()) {
        localStorage.setItem(API_ENDPOINT_STORAGE_KEY, url.trim());
      } else {
        localStorage.removeItem(API_ENDPOINT_STORAGE_KEY);
      }
    } catch (e) {}
  }

  // --- Helper to normalize DynamoDB records into frontend models ---
  function normalizeDynamoDBOrder(raw, fallbackUserId) {
    if (!raw) return null;
    const rawId = String(raw.orderId || raw.id || raw.rawId || '').replace('#', '');
    if (!rawId) return null;

    const orderId = raw.orderId ? (String(raw.orderId).startsWith('#') ? raw.orderId : '#' + rawId) : ('#' + rawId);
    const userId = raw.userId || raw.customerId || fallbackUserId || '';
    const totalAmount = Number(raw.totalAmount !== undefined ? raw.totalAmount : (raw.total !== undefined ? raw.total : 0));

    // Safe neutral SVG product placeholder — never show random/unrelated hardware
    const SAFE_PRODUCT_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v2'></path><path d='M3 14v2a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16v-2'></path><polyline points='3.27 6.96 12 12.01 20.73 6.96'></polyline><line x1='12' y1='22.08' x2='12' y2='12'></line></svg>";

    const rawItems = Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : [
      {
        productId: 'P001',
        name: raw.productName || 'ShopEase Verified Product',
        price: totalAmount,
        quantity: 1,
        image: SAFE_PRODUCT_PLACEHOLDER
      }
    ];

    const catalog = (window.ShopEaseData && (window.ShopEaseData.PRODUCTS || window.ShopEaseData.products)) || [];
    const items = rawItems.map(item => {
      const rawId = String(item.productId || item.id || item.sku || '').trim();
      let productMatch = null;

      // 1. Direct ID lookup via API helper
      if (window.ShopEaseData && typeof window.ShopEaseData.getProductById === 'function' && rawId) {
        productMatch = window.ShopEaseData.getProductById(rawId);
      }

      // 2. Lookup in catalog array by normalized ID
      if (!productMatch && Array.isArray(catalog) && catalog.length > 0 && rawId) {
        const lowerId = rawId.toLowerCase();
        const cleanId = lowerId.replace(/^prod-/, '');
        productMatch = catalog.find(p => {
          if (!p || !p.id) return false;
          const pid = p.id.toLowerCase();
          const pClean = pid.replace(/^prod-/, '');
          return pid === lowerId || pClean === cleanId || pid === cleanId || pClean === lowerId;
        });
      }

      // 3. Lookup in catalog array by product name
      if (!productMatch && Array.isArray(catalog) && catalog.length > 0 && item.name) {
        const lowerName = item.name.toLowerCase().trim();
        productMatch = catalog.find(p => p && p.name && (p.name.toLowerCase().trim() === lowerName));
        if (!productMatch) {
          productMatch = catalog.find(p => {
            if (!p || !p.name) return false;
            const pn = p.name.toLowerCase();
            return pn.includes(lowerName) || lowerName.includes(pn);
          });
        }
      }

      const effectiveId = (productMatch && productMatch.id) || rawId || 'item-' + Math.random().toString(36).substring(2, 7);
      const effectiveName = (productMatch && productMatch.name) || item.name || 'ShopEase Verified Product';

      let resolvedImage = (window.ShopEaseData && typeof window.ShopEaseData.resolveItemImage === 'function')
        ? window.ShopEaseData.resolveItemImage({ ...item, productId: effectiveId, name: effectiveName })
        : ((productMatch && productMatch.image) ? productMatch.image : (item.image || SAFE_PRODUCT_PLACEHOLDER));

      return {
        id: effectiveId,
        productId: effectiveId,
        name: effectiveName,
        brand: (productMatch && productMatch.brand) || item.brand || 'Authentic Brand',
        category: (productMatch && (productMatch.category || productMatch.categoryId)) || item.category || 'Electronics',
        price: Number(item.price !== undefined ? item.price : (productMatch ? productMatch.price : totalAmount)),
        quantity: Number(item.quantity || 1),
        image: resolvedImage
      };
    });

    // Normalize order status and class
    const status = raw.status || 'Confirmed';
    let statusClass = 'confirmed';
    const sLower = status.toLowerCase();
    if (sLower.includes('cancel')) {
      statusClass = 'cancelled';
    } else if (sLower.includes('deliver')) {
      statusClass = 'delivered';
    } else if (sLower.includes('transit') || sLower.includes('ship') || sLower.includes('out for')) {
      statusClass = 'transit';
    } else if (sLower.includes('placed') || sLower.includes('process') || sLower.includes('pack')) {
      statusClass = 'placed';
    }

    // Normalize shipping address
    const addrRaw = raw.shippingAddress || {};
    const shippingAddress = (typeof addrRaw === 'object' && addrRaw) ? {
      name: addrRaw.name || raw.customerName || (raw.customer && raw.customer.name) || 'Customer',
      address: addrRaw.address || addrRaw.line1 || '',
      line1: addrRaw.line1 || addrRaw.address || '',
      line2: addrRaw.line2 || '',
      city: addrRaw.city || '',
      state: addrRaw.state || '',
      pincode: addrRaw.pincode || addrRaw.pin || '',
      pin: addrRaw.pin || addrRaw.pincode || '',
      phone: addrRaw.phone || (raw.customer && raw.customer.phone) || ''
    } : {
      name: 'Customer',
      address: String(addrRaw || ''),
      line1: String(addrRaw || ''),
      line2: '',
      city: '',
      state: '',
      pin: '',
      pincode: '',
      phone: ''
    };

    // Format human-readable date from createdAt
    let formattedDate = 'Recently';
    const createdRaw = raw.createdAt || raw.orderDate || raw.date;
    if (createdRaw) {
      try {
        const d = new Date(createdRaw);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
        } else {
          formattedDate = String(createdRaw);
        }
      } catch (e) {
        formattedDate = String(createdRaw);
      }
    }

    // Hash tracking number
    let hash = 0;
    for (let i = 0; i < rawId.length; i++) {
      hash = ((hash << 5) - hash) + rawId.charCodeAt(i);
      hash |= 0;
    }
    const trackingNum = raw.trackingNumber || raw.trackingId || ('BD' + Math.abs(hash).toString().padStart(8, '0').slice(0, 8) + 'IN');

    return {
      orderId,
      rawId,
      userId,
      customerId: userId,
      items,
      totalAmount,
      total: totalAmount,
      subtotal: Number(raw.subtotal !== undefined ? raw.subtotal : totalAmount),
      shippingFee: Number(raw.shippingFee || 0),
      discount: Number(raw.discount || 0),
      couponCode: raw.couponCode || null,
      shippingAddress,
      customer: {
        name: shippingAddress.name,
        email: (raw.customer && raw.customer.email) || raw.customerEmail || raw.email || '',
        phone: shippingAddress.phone,
        address: shippingAddress.address,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pin: shippingAddress.pincode,
        pincode: shippingAddress.pincode
      },
      customerName: shippingAddress.name,
      customerEmail: (raw.customer && raw.customer.email) || raw.customerEmail || raw.email || '',
      status,
      statusClass,
      statusLabel: raw.statusLabel || status,
      paymentStatus: raw.paymentStatus || 'Paid',
      paymentMethod: raw.paymentMethod || 'Credit Card',
      paymentType: raw.paymentType || (raw.paymentMethod && raw.paymentMethod.toLowerCase().includes('cash') ? 'COD' : 'PREPAID'),
      paymentId: raw.paymentId || null,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
      date: formattedDate,
      orderDate: formattedDate,
      carrier: raw.carrier || 'BlueDart Air Express',
      trackingNumber: trackingNum,
      trackingId: trackingNum,
      estimatedDelivery: raw.estimatedDelivery || 'Within 48 Hours',
      cancelledAt: raw.cancelledAt || null,
      cancellationReason: raw.cancellationReason || null,
      cancellationNotes: raw.cancellationNotes || null,
      refundStatus: raw.refundStatus || null,
      refundAmount: raw.refundAmount !== undefined ? raw.refundAmount : null,
      returnStatus: raw.returnStatus || null,
      returnRequestedAt: raw.returnRequestedAt || null,
      returnReason: raw.returnReason || null,
      returnType: raw.returnType || null,
      returnNotes: raw.returnNotes || null,
      rmaCode: raw.rmaCode || null,
      warrantyClaim: raw.warrantyClaim || null,
      itemCount: items.length
    };
  }

  // --- Strict Identity Comparison & Deduplication Engine ---
  function isSameOrder(a, b) {
    if (!a || !b) return false;
    const cleanA = String(a.rawId || a.orderId || '').replace('#', '').trim().toLowerCase();
    const cleanB = String(b.rawId || b.orderId || '').replace('#', '').trim().toLowerCase();
    if (cleanA && cleanB && cleanA === cleanB) return true;

    // Idempotency key match
    const idempA = String(a.idempotencyKey || '').trim();
    const idempB = String(b.idempotencyKey || '').trim();
    if (idempA && idempB && idempA === idempB) return true;

    // Payment ID match
    const payA = String(a.paymentId || '').trim();
    const payB = String(b.paymentId || '').trim();
    if (payA && payB && payA === payB) return true;

    // Fingerprint match: same user, same total amount > 0, same items count, placed within 10 minutes
    const userA = String(a.userId || a.customerId || '').trim();
    const userB = String(b.userId || b.customerId || '').trim();
    const totalA = Number(a.totalAmount !== undefined ? a.totalAmount : (a.total !== undefined ? a.total : 0));
    const totalB = Number(b.totalAmount !== undefined ? b.totalAmount : (b.total !== undefined ? b.total : 0));
    if (userA && userB && userA === userB && totalA === totalB && totalA > 0) {
      const timeA = new Date(a.createdAt || a.orderDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.orderDate || 0).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && Math.abs(timeA - timeB) < 10 * 60 * 1000) {
        const itemsA = Array.isArray(a.items) ? a.items : [];
        const itemsB = Array.isArray(b.items) ? b.items : [];
        if (itemsA.length === itemsB.length) return true;
      }
    }
    return false;
  }

  function deduplicateOrderList(orderList) {
    if (!Array.isArray(orderList)) return [];
    const unique = [];
    orderList.forEach(order => {
      if (!order) return;
      const existingIdx = unique.findIndex(u => isSameOrder(u, order));
      if (existingIdx === -1) {
        unique.push(order);
      } else {
        // Merge state so any local cancellation or payment info is preserved
        const existing = unique[existingIdx];
        if (order.status === 'Cancelled' && existing.status !== 'Cancelled') {
          unique[existingIdx] = { ...existing, ...order };
        } else if (order.trackingNumber && !existing.trackingNumber) {
          unique[existingIdx] = { ...existing, ...order };
        }
      }
    });
    return unique;
  }

  // Helper to load all stored orders from localStorage
  function loadOrdersFromStorage() {
    let orders = [];
    try {
      const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          orders = deduplicateOrderList(parsed);
        }
      }
    } catch (e) {
      console.warn('[ShopEaseOrderService] Error reading orders from storage:', e);
    }

    // Check if an order was placed during checkout and needs to be imported
    try {
      const lastOrderRaw = localStorage.getItem('shopease_last_order');
      if (lastOrderRaw) {
        const lastOrder = JSON.parse(lastOrderRaw);
        if (lastOrder && (lastOrder.orderId || lastOrder.rawId)) {
          const exists = orders.some(o => isSameOrder(o, lastOrder));
          if (!exists) {
            orders.unshift(lastOrder);
            orders = deduplicateOrderList(orders);
            saveOrdersToStorage(orders);
          }
        }
      }
    } catch (e) {}

    return orders;
  }

  // Helper to persist orders to localStorage
  function saveOrdersToStorage(orders) {
    try {
      const uniqueOrders = deduplicateOrderList(orders);
      const newRaw = JSON.stringify(uniqueOrders);
      const oldRaw = localStorage.getItem(ORDERS_STORAGE_KEY);
      localStorage.setItem(ORDERS_STORAGE_KEY, newRaw);
      if (newRaw !== oldRaw) {
        window.dispatchEvent(new CustomEvent('shopease:order-updated', { detail: { orders: uniqueOrders } }));
      }
    } catch (e) {
      console.error('[ShopEaseOrderService] Error saving orders to storage:', e);
    }
  }

  // Get current customer email/id from active session
  function getCurrentUser() {
    if (window.ShopEaseAuthService && typeof window.ShopEaseAuthService.getCurrentUser === 'function') {
      const authUser = window.ShopEaseAuthService.getCurrentUser();
      if (authUser) {
        return {
          email: authUser.email || '',
          name: authUser.name || 'Customer',
          id: authUser.id || '',
          customerId: authUser.id || '',
          isGuest: false
        };
      }
    }
    try {
      const sessRaw = localStorage.getItem('shopease_session');
      if (sessRaw) {
        const sess = JSON.parse(sessRaw);
        if (sess && sess.userId) {
          return {
            email: sess.email || '',
            name: sess.name || 'Customer',
            id: sess.userId,
            customerId: sess.userId,
            isGuest: false
          };
        }
      }
      const auth = localStorage.getItem('shopease_auth_user');
      if (auth) {
        const parsed = JSON.parse(auth);
        if (parsed && (parsed.email || parsed.name) && !parsed.isGuest) {
          return {
            email: parsed.email || '',
            name: parsed.name || 'Customer',
            id: parsed.id || parsed.sub || '',
            customerId: parsed.id || parsed.sub || '',
            isGuest: false
          };
        }
      }
    } catch (e) {}

    // Clean unauthenticated Guest state - ZERO fabricated fake personal data
    return {
      email: '',
      name: 'Guest User',
      id: '',
      customerId: '',
      isGuest: true
    };
  }

  // --- Order Cancellation Eligibility Engine ---
  function isCancellationEligible(statusOrOrder) {
    if (!statusOrOrder) return { eligible: false, reason: 'Invalid order status' };
    const status = typeof statusOrOrder === 'object' ? (statusOrOrder.status || '') : String(statusOrOrder || '');
    if (!status) return { eligible: false, reason: 'Invalid order status' };
    const normalized = status.trim().toLowerCase();

    if (normalized === 'placed' || normalized === 'order placed') {
      return { eligible: true, code: 'PLACED' };
    }
    if (normalized === 'confirmed' || normalized === 'order confirmed') {
      return { eligible: true, code: 'CONFIRMED' };
    }
    if (normalized === 'packed' || normalized === 'processing') {
      return { eligible: true, code: 'PACKED' };
    }
    if (normalized.includes('transit') || normalized === 'shipped') {
      return {
        eligible: false,
        code: 'IN_TRANSIT',
        reason: 'This order has already been dispatched with our express carrier and is currently in transit. Dispatched shipments cannot be cancelled. You may return or replace the product once delivered.'
      };
    }
    if (normalized.includes('out for delivery')) {
      return {
        eligible: false,
        code: 'OUT_FOR_DELIVERY',
        reason: 'This shipment is out for delivery today and cannot be cancelled. Please accept delivery and initiate a return if you no longer require the product.'
      };
    }
    if (normalized === 'delivered') {
      return {
        eligible: false,
        code: 'DELIVERED',
        reason: 'This order has already been delivered. Cancellation is not possible, but you are eligible to request a Return or Replacement under our 30-Day Hassle-Free Policy.'
      };
    }
    if (normalized === 'cancelled') {
      return {
        eligible: false,
        code: 'ALREADY_CANCELLED',
        reason: 'This order is already cancelled.'
      };
    }

    return { eligible: false, code: 'UNKNOWN', reason: 'Order status does not permit cancellation.' };
  }

  function isReturnEligible(order) {
    if (!order) return { eligible: false, reason: 'Order not found' };
    if (order.status === 'Cancelled' || order.statusClass === 'cancelled') {
      return {
        eligible: false,
        reason: `Order ${order.orderId} was cancelled${order.cancelledAt ? ' on ' + order.cancelledAt : ''} and is not eligible for return or replacement. Returns are only available for fulfilled and delivered orders.`
      };
    }
    if (order.status !== 'Delivered') {
      return {
        eligible: false,
        reason: `This order is currently '${order.statusLabel || order.status}'. Only delivered orders can be returned or replaced within our 30-day window.`
      };
    }
    return {
      eligible: true,
      returnWindow: '30 Days',
      message: 'Product is covered under the ShopEase 30-Day Hassle-Free Replacement & Return Guarantee.'
    };
  }

  function isWarrantyEligible(order) {
    if (!order) return { eligible: false, reason: 'Order not found' };
    if (order.status === 'Cancelled' || order.statusClass === 'cancelled') {
      return {
        eligible: false,
        reason: `Warranty Inactive: Order ${order.orderId} was cancelled. Official manufacturer warranty coverage and serial registration are only active on completed purchases.`
      };
    }

    let coverageTerm = '12 Months Comprehensive Brand Warranty';
    let serviceType = 'Doorstep / Authorized Walk-In';
    let brand = 'Brand';

    if (order.items && order.items.length > 0) {
      const item = order.items[0];
      brand = item.brand || 'Official';
      const prodId = item.productId || item.id || '';
      let prod = null;
      if (window.ShopEaseData && Array.isArray(window.ShopEaseData.products)) {
        prod = window.ShopEaseData.products.find(p => p.id === prodId || p.id === 'prod-' + prodId || p.name === item.name);
      }
      const cat = (item.category || (prod && prod.category) || '').toLowerCase();
      if (cat.includes('laptop')) {
        coverageTerm = '24 Months Comprehensive Manufacturer Warranty';
        serviceType = 'On-Site & Doorstep Technician Support';
      } else if (cat.includes('phone') || cat.includes('mobile')) {
        coverageTerm = '12 Months Official Brand Warranty';
        serviceType = 'Authorized Service Center & Express Pick/Drop';
      } else if (cat.includes('audio') || cat.includes('headphone')) {
        coverageTerm = '12 Months Replacement Warranty';
        serviceType = 'Doorstep Replacement Guarantee';
      } else if (cat.includes('footwear')) {
        coverageTerm = '6 Months Manufacturing Defect Guarantee';
        serviceType = 'Direct Brand Exchange';
      } else if (cat.includes('watch') || cat.includes('wearable')) {
        coverageTerm = '12 Months Manufacturer Warranty';
        serviceType = 'Authorized Walk-in / Doorstep';
      } else {
        coverageTerm = '12 Months Comprehensive Brand Warranty';
        serviceType = 'Doorstep / Authorized Service Center';
      }
    }

    return {
      eligible: true,
      coverageTerm,
      serviceType,
      brand,
      warrantyInfo: `${coverageTerm} (${serviceType})`
    };
  }

  // Security Ownership Guard: Ensures the customer is authorized to view/cancel this order
  function validateOrderOwnership(order, user) {
    if (!order) return false;
    const currentUser = user || getCurrentUser();
    
    // Check authenticated user match by ID
    const currentId = currentUser.id || currentUser.customerId;
    if (!currentUser.isGuest && currentId) {
      if (order.customerId === currentId || order.userId === currentId) {
        return true;
      }
    }

    // Check email match (case-insensitive)
    if (order.customer && order.customer.email && currentUser.email) {
      if (order.customer.email.toLowerCase() === currentUser.email.toLowerCase()) {
        return true;
      }
    }

    return false;
  }

  // Public: Get Order by ID
  function getOrderById(orderId) {
    if (!orderId) return null;
    const cleanId = String(orderId).replace('#', '');
    const orders = loadOrdersFromStorage();
    const found = orders.find(o => 
      o.rawId === cleanId || 
      o.orderId === orderId || 
      o.orderId === '#' + cleanId || 
      o.orderId === cleanId ||
      o.rawId === orderId
    );
    return found ? normalizeDynamoDBOrder(found, found.userId) : null;
  }

  // Public: Get Orders for Current User (Synchronous read from cache/storage)
  function getUserOrders(userEmail) {
    const orders = loadOrdersFromStorage();
    const currentUser = getCurrentUser();
    
    // If guest / unauthenticated: return strictly 0 orders
    if (currentUser.isGuest) {
      if (userEmail) {
        const email = userEmail.toLowerCase().trim();
        return orders
          .filter(o => o.customer && o.customer.email && o.customer.email.toLowerCase().trim() === email)
          .map(o => normalizeDynamoDBOrder(o, ''))
          .filter(Boolean);
      }
      return [];
    }

    // Authenticated user: return ONLY orders owned by this user
    const currentEmail = (userEmail || currentUser.email || '').toLowerCase().trim();
    const currentId = currentUser.id || currentUser.customerId;
    return orders
      .filter(o => {
        const matchesId = currentId && (o.customerId === currentId || o.userId === currentId);
        const matchesEmail = currentEmail && o.customer && o.customer.email && o.customer.email.toLowerCase().trim() === currentEmail;
        return matchesId || matchesEmail;
      })
      .map(o => normalizeDynamoDBOrder(o, currentId))
      .filter(Boolean);
  }

  // Public: Asynchronously fetch orders from AWS DynamoDB / API for the logged-in user
  async function fetchUserOrders(userId) {
    const currentUser = getCurrentUser();
    const actualUserId = userId || (currentUser && !currentUser.isGuest ? currentUser.id : null);

    if (!actualUserId) {
      return {
        success: false,
        unauthenticated: true,
        error: 'Please sign in to view your orders.',
        orders: []
      };
    }

    const apiEndpoint = getApiEndpoint();
    let fetchedFromApi = false;
    let apiOrders = [];

    if (apiEndpoint) {
      try {
        let fetchUrl = apiEndpoint;
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'userId=' + encodeURIComponent(actualUserId);

        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const json = await response.json();
          let rawList = [];
          if (json.orders && Array.isArray(json.orders)) {
            rawList = json.orders;
          } else if (json.items && Array.isArray(json.items)) {
            rawList = json.items;
          } else if (Array.isArray(json)) {
            rawList = json;
          } else if (json.order) {
            rawList = [json.order];
          }

          apiOrders = rawList
            .filter(item => item && (item.userId === actualUserId || item.customerId === actualUserId))
            .map(item => normalizeDynamoDBOrder(item, actualUserId))
            .filter(Boolean);

          fetchedFromApi = true;
        }
      } catch (netErr) {
        console.warn('[ShopEaseOrderService] AWS API request failed, falling back to cached DynamoDB orders:', netErr);
      }
    }

    const storedOrders = loadOrdersFromStorage();
    let userOrders = [];

    if (fetchedFromApi) {
      // Reconcile API orders with local state to prevent customer mutations from being wiped out
      const reconciledApiOrders = apiOrders.map(apiOrd => {
        const storedMatch = storedOrders.find(s => isSameOrder(s, apiOrd));
        if (!storedMatch) return apiOrd;

        const resOrd = { ...apiOrd };

        // If order was cancelled locally or in backend, preserve complete cancellation telemetry
        if (storedMatch.status === 'Cancelled' || storedMatch.statusClass === 'cancelled' || apiOrd.status === 'Cancelled') {
          resOrd.status = 'Cancelled';
          resOrd.statusClass = 'cancelled';
          resOrd.statusLabel = 'Cancelled';
          resOrd.cancelledAt = storedMatch.cancelledAt || apiOrd.cancelledAt || new Date().toISOString();
          resOrd.cancellationReason = storedMatch.cancellationReason || apiOrd.cancellationReason || 'Customer requested cancellation';
          resOrd.cancellationNotes = storedMatch.cancellationNotes || apiOrd.cancellationNotes || '';
          resOrd.refundStatus = storedMatch.refundStatus || apiOrd.refundStatus || 'Refund Processing';
          resOrd.refundAmount = storedMatch.refundAmount !== undefined ? storedMatch.refundAmount : apiOrd.refundAmount;
        }

        // If return was initiated, preserve return telemetry
        if (storedMatch.returnStatus || apiOrd.returnStatus) {
          resOrd.returnStatus = storedMatch.returnStatus || apiOrd.returnStatus;
          resOrd.returnType = storedMatch.returnType || apiOrd.returnType;
          resOrd.returnReason = storedMatch.returnReason || apiOrd.returnReason;
          resOrd.returnNotes = storedMatch.returnNotes || apiOrd.returnNotes;
          resOrd.returnRequestedAt = storedMatch.returnRequestedAt || apiOrd.returnRequestedAt;
          resOrd.rmaCode = storedMatch.rmaCode || apiOrd.rmaCode;
        }

        // If warranty claim was submitted, preserve warranty telemetry
        if (storedMatch.warrantyClaim || apiOrd.warrantyClaim) {
          resOrd.warrantyClaim = storedMatch.warrantyClaim || apiOrd.warrantyClaim;
        }

        return resOrd;
      });

      const localUserOrders = storedOrders
        .filter(o => o && (o.userId === actualUserId || o.customerId === actualUserId))
        .map(o => normalizeDynamoDBOrder(o, actualUserId))
        .filter(Boolean);
      const merged = [...reconciledApiOrders];
      localUserOrders.forEach(localOrder => {
        if (!merged.some(apiOrder => isSameOrder(apiOrder, localOrder))) {
          merged.push(localOrder);
        }
      });
      const uniqueOrders = deduplicateOrderList(merged);
      saveOrdersToStorage(uniqueOrders);
      userOrders = uniqueOrders;
    } else {
      userOrders = deduplicateOrderList(
        storedOrders
          .filter(o => o && (o.userId === actualUserId || o.customerId === actualUserId))
          .map(o => normalizeDynamoDBOrder(o, actualUserId))
          .filter(Boolean)
      );
    }

    return {
      success: true,
      orders: userOrders,
      userId: actualUserId,
      fromCache: !fetchedFromApi
    };
  }

  // Public: Asynchronously fetch a single order from AWS DynamoDB / API Gateway by orderId
  async function fetchOrderById(orderId) {
    if (!orderId) return null;
    const cleanId = String(orderId).replace('#', '').trim();
    const apiEndpoint = getApiEndpoint();
    let fetchedOrder = null;

    if (apiEndpoint) {
      try {
        let fetchUrl = apiEndpoint;
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'orderId=' + encodeURIComponent(cleanId);

        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const json = await response.json();
          const raw = json.order || (json.items && json.items[0]) || (json.orders && json.orders[0]) || (Array.isArray(json) ? json[0] : null);
          if (raw) {
            fetchedOrder = normalizeDynamoDBOrder(raw, raw.userId);
          }
        }
      } catch (err) {
        console.warn('[ShopEaseOrderService] fetchOrderById API request failed:', err);
      }
    }

    if (fetchedOrder) {
      const orders = loadOrdersFromStorage();
      const idx = orders.findIndex(o => o && (
        o.rawId === cleanId || 
        o.orderId === orderId || 
        o.orderId === cleanId || 
        o.orderId === ('#' + cleanId) || 
        o.rawId === orderId
      ));
      if (idx >= 0) {
        orders[idx] = { ...orders[idx], ...fetchedOrder };
      } else {
        orders.unshift(fetchedOrder);
      }
      saveOrdersToStorage(orders);

      try {
        const lastRaw = localStorage.getItem('shopease_last_order');
        if (lastRaw) {
          const lastOrder = JSON.parse(lastRaw);
          if (lastOrder && (lastOrder.rawId === cleanId || lastOrder.orderId === orderId || lastOrder.orderId === ('#' + cleanId))) {
            localStorage.setItem('shopease_last_order', JSON.stringify(fetchedOrder));
          }
        }
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('shopease:order-updated', { detail: { order: fetchedOrder, orders } }));
      return fetchedOrder;
    }

    return getOrderById(orderId);
  }

  // Public: Check if current user has any active orders
  function hasOrders() {
    const orders = getUserOrders();
    return Array.isArray(orders) && orders.length > 0;
  }

  // Public: Create New Order (called by Checkout)
  function createOrder(orderData) {
    if (!orderData) return null;
    const cleanId = orderData.orderId
      ? (orderData.orderId.startsWith('#') ? orderData.orderId.slice(1) : orderData.orderId)
      : ('ORD-' + Math.random().toString(36).substring(2, 10).toUpperCase());
    const idempotencyKey = String(orderData.idempotencyKey || orderData.paymentId || cleanId).trim();
    if (activeOrderCreations.has(idempotencyKey)) return activeOrderCreations.get(idempotencyKey).order;

    const currentUser = getCurrentUser();
    const now = new Date();
    const isoDate = now.toISOString();
    const dateOptions = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };

    const rawItems = Array.isArray(orderData.items) ? [...orderData.items] : [];
    const normalizedItems = rawItems.map(it => ({
      productId: it.id || it.productId || 'P001',
      name: it.name || it.title || 'Product',
      price: Number(it.price || 0),
      quantity: Number(it.quantity || 1),
      image: it.image || '',
      brand: it.brand || 'ShopEase'
    }));

    const totalAmount = Number(orderData.total || 0);

    const effectiveUserId = (!currentUser.isGuest && currentUser.id)
      ? currentUser.id
      : (orderData.userId || orderData.customerId || (currentUser && currentUser.email) || 'test-user-123');

    const candidateOrder = {
      orderId: '#' + cleanId,
      rawId: cleanId,
      idempotencyKey,
      paymentId: orderData.paymentId,
      userId: effectiveUserId,
      customerId: effectiveUserId,
      totalAmount: totalAmount,
      total: totalAmount,
      items: normalizedItems,
      createdAt: isoDate
    };

    const orders = loadOrdersFromStorage();
    const existingOrder = orders.find(order => isSameOrder(order, candidateOrder));
    if (existingOrder) return existingOrder;

    const newOrder = {
      orderId: '#' + cleanId,
      rawId: cleanId,
      userId: effectiveUserId,
      customerId: effectiveUserId,
      orderDate: orderData.orderDate || now.toLocaleString('en-IN', dateOptions),
      date: orderData.orderDate || now.toLocaleString('en-IN', dateOptions),
      status: orderData.status || 'Confirmed',
      statusClass: orderData.statusClass || 'confirmed',
      statusLabel: orderData.statusLabel || orderData.status || 'Confirmed',
      customer: orderData.customer || {
        name: currentUser.name || 'Customer',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        address: '',
        city: '',
        pin: ''
      },
      shippingAddress: orderData.shippingAddress || {
        name: (orderData.customer && orderData.customer.name) || currentUser.name || 'Customer',
        address: (orderData.customer && orderData.customer.address) || '',
        line1: (orderData.customer && orderData.customer.address) || '',
        city: (orderData.customer && orderData.customer.city) || '',
        state: (orderData.customer && orderData.customer.state) || '',
        pincode: (orderData.customer && orderData.customer.pin) || '',
        pin: (orderData.customer && orderData.customer.pin) || '',
        phone: (orderData.customer && orderData.customer.phone) || ''
      },
      paymentMethod: orderData.paymentMethod || 'Credit Card',
      paymentType: orderData.paymentType || (orderData.paymentMethod && orderData.paymentMethod.toLowerCase().includes('cash') ? 'COD' : 'PREPAID'),
      paymentStatus: orderData.paymentStatus || 'Paid',
      idempotencyKey,
      paymentId: orderData.paymentId || null,
      carrier: orderData.carrier || 'BlueDart Air Express',
      trackingNumber: orderData.trackingNumber || ('BD' + Math.floor(100000000 + Math.random() * 900000000) + 'IN'),
      trackingId: orderData.trackingNumber || ('BD' + Math.floor(100000000 + Math.random() * 900000000) + 'IN'),
      estimatedDelivery: orderData.estimatedDelivery || 'Within 48 Hours',
      items: normalizedItems,
      totalAmount: totalAmount,
      total: totalAmount,
      subtotal: orderData.subtotal !== undefined ? orderData.subtotal : totalAmount,
      discount: orderData.discount || 0,
      couponCode: orderData.couponCode || null,
      shippingFee: orderData.shippingFee || 0,
      itemCount: normalizedItems.length,
      createdAt: isoDate,
      updatedAt: isoDate,
      cancelledAt: null,
      cancellationReason: null,
      cancellationNotes: null,
      refundStatus: null,
      refundAmount: null
    };

    const updated = [newOrder, ...orders.filter(o => o.rawId !== cleanId)];
    saveOrdersToStorage(updated);
    try {
      localStorage.setItem('shopease_last_order', JSON.stringify(newOrder));
    } catch (e) {}

    // Transmit order to AWS Lambda backend via API Gateway (POST /orders)
    const apiEndpoint = getApiEndpoint();
    if (apiEndpoint && newOrder.userId) {
      const payload = {
        userId: newOrder.userId,
        items: newOrder.items.map(it => ({
          productId: it.productId || it.id || 'P001',
          name: it.name || 'Product',
          price: Number(it.price || 0),
          quantity: Number(it.quantity || 1)
        })),
        totalAmount: Number(newOrder.totalAmount || newOrder.total || 0),
        shippingAddress: {
          name: (newOrder.shippingAddress && newOrder.shippingAddress.name) || (newOrder.customer && newOrder.customer.name) || 'Customer',
          address: (newOrder.shippingAddress && (newOrder.shippingAddress.address || newOrder.shippingAddress.line1)) || (newOrder.customer && newOrder.customer.address) || 'Test Address',
          city: (newOrder.shippingAddress && newOrder.shippingAddress.city) || (newOrder.customer && newOrder.customer.city) || 'Aurangabad',
          state: (newOrder.shippingAddress && newOrder.shippingAddress.state) || (newOrder.customer && newOrder.customer.state) || 'Maharashtra',
          pincode: (newOrder.shippingAddress && (newOrder.shippingAddress.pincode || newOrder.shippingAddress.pin)) || (newOrder.customer && newOrder.customer.pin) || '431001'
        },
        paymentStatus: newOrder.paymentStatus || 'Paid',
        orderId: newOrder.rawId,
        paymentMethod: newOrder.paymentMethod,
        paymentType: newOrder.paymentType,
        paymentId: newOrder.paymentId,
        idempotencyKey: newOrder.idempotencyKey
      };

      try {
        const creationPromise = fetch(apiEndpoint, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        }).then(async (response) => {
          if (response.ok) {
            const data = await response.json();
            if (data && data.order && data.order.orderId) {
              const backendOrder = data.order;
              const allOrders = loadOrdersFromStorage();
              const idx = allOrders.findIndex(o => o.rawId === cleanId || o.orderId === newOrder.orderId);
              if (idx !== -1) {
                const realId = String(backendOrder.orderId).replace('#', '');
                allOrders[idx].orderId = '#' + realId;
                allOrders[idx].rawId = realId;
                if (backendOrder.createdAt) allOrders[idx].createdAt = backendOrder.createdAt;
                if (backendOrder.status) allOrders[idx].status = backendOrder.status;
                saveOrdersToStorage(allOrders);
                try {
                  localStorage.setItem('shopease_last_order', JSON.stringify(allOrders[idx]));
                } catch (e) {}
                try {
                  const pending = JSON.parse(localStorage.getItem(PENDING_ORDER_KEY) || 'null');
                  if (pending && String(pending.orderId || '').replace('#', '') === cleanId) {
                    localStorage.removeItem(PENDING_ORDER_KEY);
                  }
                } catch (e) {}
              }
            }
          } else {
            console.warn('[ShopEaseOrderService] API Gateway POST /orders returned status:', response.status);
          }
        }).catch(err => {
          console.warn('[ShopEaseOrderService] Could not transmit order to AWS endpoint:', err);
        });
        activeOrderCreations.set(idempotencyKey, { order: newOrder, promise: creationPromise });
        creationPromise.finally(() => activeOrderCreations.delete(idempotencyKey));
      } catch (err) {
        console.warn('[ShopEaseOrderService] Error initiating order POST fetch:', err);
      }
    }

    return newOrder;
  }

  function waitForOrderCreation(orderId) {
    const cleanId = String(orderId || '').replace('#', '');
    const active = Array.from(activeOrderCreations.values()).find(entry =>
      entry.order && (entry.order.rawId === cleanId || entry.order.orderId === '#' + cleanId)
    );
    return active && active.promise ? active.promise : Promise.resolve(true);
  }

  // Public: Cancel Order
  async function cancelOrder(orderId, reason, additionalNotes = '') {
    const cleanId = String(orderId || '').replace('#', '').trim();
    let order = getOrderById(orderId) || getOrderById(cleanId);
    if (!order && typeof fetchOrderById === 'function') {
      order = await fetchOrderById(cleanId);
    }
    if (!order) {
      return { success: false, error: 'Order not found.' };
    }

    // Security check: Order ownership
    const currentUser = getCurrentUser();
    if (!validateOrderOwnership(order, currentUser)) {
      console.warn(`[Security Alert] Unauthorized cancellation attempt on order ${orderId} by user ${currentUser.email}`);
      return {
        success: false,
        unauthorized: true,
        error: 'Access Denied: You do not have authorization to cancel this order.'
      };
    }

    // Eligibility check
    const check = isCancellationEligible(order.status);
    if (!check.eligible) {
      if (check.code === 'ALREADY_CANCELLED') {
        return { success: true, order, backendSynced: true, message: 'Order is already cancelled.' };
      }
      return { success: false, error: check.reason };
    }

    const isCOD = order.paymentType === 'COD' || (order.paymentMethod && order.paymentMethod.toLowerCase().includes('cash on delivery'));
    const refundStatus = isCOD
      ? 'Not Applicable (Cash on Delivery)'
      : 'Refund Processing';

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const timestampStr = `${formattedDate}, ${formattedTime}`;

    // Dispatch real cancellation to AWS API Gateway / Lambda backend
    const apiEndpoint = getApiEndpoint();
    let backendSuccess = false;
    if (apiEndpoint) {
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            action: 'cancelOrder',
            orderId: cleanId,
            userId: order.userId || (currentUser && currentUser.id) || 'test-user-123',
            status: 'Cancelled',
            cancellationReason: reason || 'Customer requested cancellation',
            cancellationNotes: additionalNotes,
            updatedAt: now.toISOString()
          })
        });

        const respData = await response.json().catch(() => ({}));
        if (response.ok && respData.success) {
          backendSuccess = true;
        } else if (respData.error && respData.error.toLowerCase().includes('already cancelled')) {
          backendSuccess = true;
        } else if (!response.ok && respData.error) {
          return {
            success: false,
            error: respData.error || respData.message || 'Cancellation rejected by backend server.'
          };
        }
      } catch (netErr) {
        console.warn('[ShopEaseOrderService] Cancellation push to AWS network notice:', netErr);
      }
    }

    // Mutate order state
    order.status = 'Cancelled';
    order.statusClass = 'cancelled';
    order.statusLabel = 'Cancelled';
    order.cancelledAt = timestampStr;
    order.cancellationReason = reason || 'Customer requested cancellation';
    order.cancellationNotes = additionalNotes;
    order.refundStatus = refundStatus;
    order.refundAmount = isCOD ? 0 : order.total;
    order.updatedAt = now.toISOString();

    // Update in stored list
    const orders = loadOrdersFromStorage();
    let updated = false;
    const updatedOrders = orders.map(o => {
      if (!o) return o;
      const matches = o.rawId === cleanId || o.orderId === order.orderId || o.orderId === ('#' + cleanId) || o.rawId === orderId || o.orderId === cleanId;
      if (matches) {
        updated = true;
        return { ...o, ...order };
      }
      return o;
    });
    if (!updated) {
      updatedOrders.unshift(order);
    }
    saveOrdersToStorage(updatedOrders);

    try {
      localStorage.setItem('shopease_last_order', JSON.stringify(order));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:order-updated', { detail: { order, orders: updatedOrders } }));

    return {
      success: true,
      order,
      backendSynced: backendSuccess,
      message: `Order ${order.orderId} has been successfully cancelled.`
    };
  }

  // Public: Request Return or Replacement for Delivered Order
  async function requestReturn(orderId, reason, returnType = 'RETURN_REFUND', additionalNotes = '') {
    const order = getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found.' };

    const currentUser = getCurrentUser();
    if (!validateOrderOwnership(order, currentUser)) {
      return { success: false, unauthorized: true, error: 'Access Denied: You do not own this order.' };
    }

    const check = isReturnEligible(order);
    if (!check.eligible) {
      return { success: false, error: check.reason };
    }

    if (order.returnStatus) {
      return {
        success: false,
        error: `A return request has already been initiated for Order ${order.orderId} (${order.returnStatus}, RMA: ${order.rmaCode || '--'}).`
      };
    }

    const cleanId = order.rawId || String(orderId).replace('#', '');
    const now = new Date();
    const timestampStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    let rmaCode = `RMA-${cleanId.replace(/[^A-Za-z0-9]/g, '')}-${Math.floor(10000 + Math.random() * 90000)}`;

    const apiEndpoint = getApiEndpoint();
    let backendSuccess = false;
    if (apiEndpoint) {
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            action: 'requestReturn',
            orderId: cleanId,
            userId: order.userId || (currentUser && currentUser.id) || 'test-user-123',
            returnType: returnType,
            returnReason: reason,
            returnNotes: additionalNotes,
            email: (order.customer && order.customer.email) || currentUser.email || 'customer@shopease.com'
          })
        });

        const respData = await response.json().catch(() => ({}));
        if (response.ok && respData.success) {
          backendSuccess = true;
          if (respData.rmaCode) rmaCode = respData.rmaCode;
        } else if (!response.ok && respData.error) {
          return {
            success: false,
            error: respData.error || respData.message || 'Return request rejected by backend.'
          };
        }
      } catch (netErr) {
        console.warn('[ShopEaseOrderService] Return push to AWS network notice:', netErr);
      }
    }

    const statusLabel = returnType === 'REPLACE' ? 'Replacement Requested' : 'Return & Refund Requested';
    order.returnStatus = statusLabel;
    order.returnRequestedAt = timestampStr;
    order.returnReason = reason;
    order.returnType = returnType;
    order.returnNotes = additionalNotes;
    order.rmaCode = rmaCode;
    order.updatedAt = now.toISOString();

    const orders = loadOrdersFromStorage();
    const updatedOrders = orders.map(o => (o.rawId === order.rawId ? order : o));
    saveOrdersToStorage(updatedOrders);

    try {
      const lastRaw = localStorage.getItem('shopease_last_order');
      if (lastRaw) {
        const lastOrder = JSON.parse(lastRaw);
        if (lastOrder && (lastOrder.rawId === order.rawId || lastOrder.orderId === order.orderId)) {
          localStorage.setItem('shopease_last_order', JSON.stringify(order));
        }
      }
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:order-updated', { detail: { order, orders: updatedOrders } }));

    return {
      success: true,
      order,
      rmaCode,
      backendSynced: backendSuccess,
      message: `Your ${returnType === 'REPLACE' ? 'replacement' : 'return'} request for Order ${order.orderId} has been initiated (RMA: ${rmaCode}).`
    };
  }

  // Public: Submit Warranty Claim for Product/Order
  async function submitWarrantyClaim(orderId, productName, brand, additionalNotes = '') {
    const order = getOrderById(orderId);
    if (!order) return { success: false, error: 'Order not found.' };

    const check = isWarrantyEligible(order);
    if (!check.eligible) {
      return { success: false, error: check.reason };
    }

    if (order.warrantyClaim && order.warrantyClaim.claimId) {
      return {
        success: false,
        error: `A warranty claim is already registered for this order (Claim Reference: ${order.warrantyClaim.claimId}).`
      };
    }

    const cleanId = order.rawId || String(orderId).replace('#', '');
    const currentUser = getCurrentUser();
    const now = new Date();
    const nowIso = now.toISOString();
    let claimId = `WAR-CLAIM-${Math.floor(100000 + Math.random() * 900000)}`;

    const apiEndpoint = getApiEndpoint();
    let backendSuccess = false;
    if (apiEndpoint) {
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            action: 'warrantyClaim',
            orderId: cleanId,
            userId: order.userId || (currentUser && currentUser.id) || 'test-user-123',
            productName: productName || (order.items && order.items[0] && order.items[0].name) || 'Certified Hardware',
            brand: brand || (order.items && order.items[0] && order.items[0].brand) || 'Official',
            notes: additionalNotes,
            email: (order.customer && order.customer.email) || currentUser.email || 'customer@shopease.com'
          })
        });

        const respData = await response.json().catch(() => ({}));
        if (response.ok && respData.success) {
          backendSuccess = true;
          if (respData.claimId) claimId = respData.claimId;
        } else if (!response.ok && respData.error) {
          return {
            success: false,
            error: respData.error || respData.message || 'Warranty claim rejected by backend.'
          };
        }
      } catch (netErr) {
        console.warn('[ShopEaseOrderService] Warranty claim push to AWS network notice:', netErr);
      }
    }

    const claimRecord = {
      claimId,
      status: 'Claim Registered',
      productName: productName || (order.items && order.items[0] && order.items[0].name) || 'Certified Hardware',
      brand: brand || (order.items && order.items[0] && order.items[0].brand) || 'Official',
      orderId: cleanId,
      createdAt: nowIso
    };

    order.warrantyClaim = claimRecord;
    order.updatedAt = nowIso;

    const orders = loadOrdersFromStorage();
    const updatedOrders = orders.map(o => (o.rawId === order.rawId ? order : o));
    saveOrdersToStorage(updatedOrders);

    try {
      const lastRaw = localStorage.getItem('shopease_last_order');
      if (lastRaw) {
        const lastOrder = JSON.parse(lastRaw);
        if (lastOrder && (lastOrder.rawId === order.rawId || lastOrder.orderId === order.orderId)) {
          localStorage.setItem('shopease_last_order', JSON.stringify(order));
        }
      }
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:order-updated', { detail: { order, orders: updatedOrders } }));

    return {
      success: true,
      order,
      claimId,
      claim: claimRecord,
      backendSynced: backendSuccess,
      message: `Warranty claim registered successfully: Reference ${claimId}.`
    };
  }

  // --- Real-Time Admin Analytics Aggregation Engine ---
  function calculateAnalytics(ordersList) {
    const rawList = Array.isArray(ordersList) ? ordersList : loadOrdersFromStorage();
    const orders = rawList.map(o => normalizeDynamoDBOrder(o, o.userId)).filter(Boolean);

    const totalOrders = orders.length;
    let totalRevenue = 0;
    let pendingOrders = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;

    const paymentSummary = {
      paid: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      cod: { count: 0, amount: 0 },
      refunded: { count: 0, amount: 0 }
    };

    // Date grouping for Trend Analysis
    const trendMap = {};

    orders.forEach(order => {
      const amount = Number(order.totalAmount !== undefined ? order.totalAmount : (order.total || 0));
      const status = (order.status || '').toLowerCase();
      const payStatus = (order.paymentStatus || '').toLowerCase();
      const payType = (order.paymentType || '').toLowerCase();

      if (status.includes('cancel')) {
        cancelledOrders++;
      } else {
        totalRevenue += amount;
      }

      if (status.includes('deliver') || status.includes('complete')) {
        deliveredOrders++;
      } else if (!status.includes('cancel')) {
        pendingOrders++;
      }

      // Payment Summary calculation
      if (status.includes('cancel') && (order.refundStatus || payStatus.includes('refund'))) {
        paymentSummary.refunded.count++;
        paymentSummary.refunded.amount += amount;
      } else if (payStatus.includes('paid')) {
        paymentSummary.paid.count++;
        paymentSummary.paid.amount += amount;
      } else if (payType.includes('cod') || (order.paymentMethod && order.paymentMethod.toLowerCase().includes('cash'))) {
        paymentSummary.cod.count++;
        paymentSummary.cod.amount += amount;
      } else {
        paymentSummary.pending.count++;
        paymentSummary.pending.amount += amount;
      }

      // Trend mapping by date
      let dateKey = 'Recent';
      if (order.createdAt) {
        try {
          const d = new Date(order.createdAt);
          if (!isNaN(d.getTime())) {
            dateKey = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          }
        } catch (e) {}
      } else if (order.orderDate) {
        dateKey = String(order.orderDate).split(',')[0].trim();
      }

      if (!trendMap[dateKey]) {
        trendMap[dateKey] = { date: dateKey, orders: 0, revenue: 0 };
      }
      trendMap[dateKey].orders++;
      if (!status.includes('cancel')) {
        trendMap[dateKey].revenue += amount;
      }
    });

    const trend = Object.values(trendMap);

    // Recent orders sorted descending by timestamp
    const recentOrders = [...orders].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return {
      totalOrders,
      totalRevenue,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      paymentSummary,
      recentOrders,
      trend,
      source: DYNAMODB_TABLE_NAME,
      lastUpdated: new Date().toISOString()
    };
  }

  // Public: Fetch Admin Analytics using real API Gateway / DynamoDB data
  async function fetchAdminAnalytics() {
    const apiEndpoint = getApiEndpoint();
    let apiSuccess = false;
    let errorMsg = null;

    if (apiEndpoint) {
      try {
        const res = await fetch(apiEndpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const json = await res.json();
          let list = [];
          if (json.orders && Array.isArray(json.orders)) list = json.orders;
          else if (json.items && Array.isArray(json.items)) list = json.items;
          else if (Array.isArray(json)) list = json;
          else if (json.order) list = [json.order];
          if (list.length > 0) {
            const normalized = list.map(o => normalizeDynamoDBOrder(o, o.userId)).filter(Boolean);
            saveOrdersToStorage(normalized);
          }
          apiSuccess = true;
        }
      } catch (err) {
        errorMsg = err.message || 'Network error connecting to API Gateway';
      }
    }

    const analytics = calculateAnalytics();
    return {
      success: true,
      analytics,
      apiConnected: apiSuccess,
      error: errorMsg,
      endpoint: apiEndpoint,
      dynamoTable: DYNAMODB_TABLE_NAME
    };
  }

  // Initialize store on first load
  loadOrdersFromStorage();

  // Export to global window object
  window.ShopEaseOrderService = {
    API_GATEWAY_URL: API_GATEWAY_BASE_URL,
    ORDERS_API_ENDPOINT: DEFAULT_ORDERS_API,
    getOrders: loadOrdersFromStorage,
    getOrderById,
    fetchOrderById,
    getUserOrders,
    fetchUserOrders,
    hasOrders,
    createOrder,
    waitForOrderCreation,
    saveNewOrder: createOrder,
    isCancellationEligible,
    isOrderEligibleForCancellation: isCancellationEligible,
    isReturnEligible,
    isWarrantyEligible,
    validateOrderOwnership,
    cancelOrder,
    requestReturn,
    submitWarrantyClaim,
    getCurrentUser,
    getApiEndpoint,
    setApiEndpoint,
    normalizeDynamoDBOrder,
    calculateAnalytics,
    fetchAdminAnalytics,
    DYNAMODB_TABLE_NAME,
    LAMBDA_FUNCTION_NAME
  };

})();
