/**
 * ShopEase Event Tracking Foundation
 * Prepares user interaction telemetry for real-time analytics & AWS integration.
 * Buffers events client-side and dispatches DOM events for live subscriber components.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'shopease_session_events';
  const SESSION_ID_KEY = 'shopease_session_id';

  // Get or initialize persistent session ID for analytics tracking
  function getSessionId() {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  }

  // Load buffered events from sessionStorage
  function getStoredEvents() {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveStoredEvents(events) {
    try {
      // Keep up to latest 100 events to prevent overflowing storage
      const trimmed = events.slice(-100);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[ShopEase Analytics] Failed to persist event buffer:', e);
    }
  }

  /**
   * Track an event
   * @param {string} eventType - e.g. 'page_view', 'product_clicked', 'add_to_cart', 'search_executed'
   * @param {object} payload - arbitrary metadata associated with the event
   */
  function track(eventType, payload = {}) {
    const event = {
      eventId: 'evt_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      eventType,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      path: window.location.pathname,
      screenResolution: `${window.innerWidth}x${window.innerHeight}`,
      data: payload,
    };

    // Buffer locally
    const events = getStoredEvents();
    events.push(event);
    saveStoredEvents(events);

    // Development / Developer Console Visibility
    if (window.__SHOPEASE_DEBUG__) {
      console.log(
        `%c[ShopEase Telemetry] %c${eventType}`,
        'color: #2563eb; font-weight: bold;',
        'color: #0f172a; font-weight: 600;',
        event
      );
    }

    // Dispatch DOM event for any live UI listeners / dashboard widgets
    window.dispatchEvent(
      new CustomEvent('shopease:event', {
        detail: event,
      })
    );

    return event;
  }

  // Expose global telemetry API
  window.ShopEaseEvents = {
    track,
    getSessionId,
    getRecentEvents: () => getStoredEvents(),
    clearEvents: () => sessionStorage.removeItem(STORAGE_KEY),
  };

  // Track initial page view upon load
  document.addEventListener('DOMContentLoaded', () => {
    track('page_view', {
      title: document.title,
      referrer: document.referrer || 'direct',
      url: window.location.href,
    });
  });
})();
