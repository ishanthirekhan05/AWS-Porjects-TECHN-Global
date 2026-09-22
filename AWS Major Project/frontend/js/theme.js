/**
 * ShopEase Theme System
 * Supports Light, Dark, and System preference.
 * Persists user choice in localStorage and dynamically responds to OS scheme changes.
 * Integrated directly into the User Profile panel and mobile menu.
 */

(function () {
  'use strict';

  // --- Global Navigation & Scroll Restoration Controller ---
  // Ensure that navigating to any page opens at scroll position Y = 0
  if (typeof window !== 'undefined') {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Immediate instant reset if not navigating to a specific hash anchor
    if (!window.location.hash || window.location.hash === '#') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch (_) {
        window.scrollTo(0, 0);
      }
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }

    // Enforce top position on pageshow (e.g. bfcache, back/forward, or cold navigation)
    window.addEventListener('pageshow', () => {
      if (!window.location.hash || window.location.hash === '#') {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch (_) {
          window.scrollTo(0, 0);
        }
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      }
    });
  }

  const STORAGE_KEY = 'shopease_theme_preference';
  const root = document.documentElement;

  // Available modes: 'light' | 'dark' | 'system'
  let currentTheme = localStorage.getItem(STORAGE_KEY) || 'light';

  // System media query matcher
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getEffectiveTheme(preference) {
    if (preference === 'system') {
      return mediaQuery.matches ? 'dark' : 'light';
    }
    return preference === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(preference, smooth = true) {
    const effective = getEffectiveTheme(preference);

    if (smooth) {
      root.classList.add('theme-transition');
      window.clearTimeout(window.__themeTransitionTimer);
      window.__themeTransitionTimer = window.setTimeout(() => {
        root.classList.remove('theme-transition');
      }, 300);
    }

    root.setAttribute('data-theme', effective);
    root.setAttribute('data-theme-preference', preference);

    // Update active indicators across all theme switcher controls (profile dropdown, drawer)
    updateThemeControls(preference, effective);

    // Dispatch custom event for telemetry and subscriber components
    window.dispatchEvent(
      new CustomEvent('shopease:theme-changed', {
        detail: { preference, effective },
      })
    );
  }

  function updateThemeControls(preference, effective) {
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach((btn) => {
      const mode = btn.getAttribute('data-theme-mode');
      if (mode) {
        const isActive = mode === preference;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
        
        // Update checkmark indicator visibility if present
        const checkIcon = btn.querySelector('.theme-check-icon');
        if (checkIcon) {
          checkIcon.style.opacity = isActive ? '1' : '0';
          checkIcon.style.visibility = isActive ? 'visible' : 'hidden';
        }
      }
    });

    // Update current theme label badges
    const statusIndicators = document.querySelectorAll('.theme-current-label');
    const formattedLabel = preference === 'system' ? 'System (Auto)' : preference.charAt(0).toUpperCase() + preference.slice(1);
    statusIndicators.forEach((label) => {
      label.textContent = formattedLabel;
    });
  }

  function setTheme(preference) {
    if (!['light', 'dark', 'system'].includes(preference)) return;
    currentTheme = preference;
    localStorage.setItem(STORAGE_KEY, preference);
    applyTheme(preference, true);

    // Track theme change event
    if (window.ShopEaseEvents) {
      window.ShopEaseEvents.track('theme_changed', {
        preference,
        effective: getEffectiveTheme(preference),
      });
    }

    if (window.ShopEaseApp && window.ShopEaseApp.showToast) {
      const displayMode = preference === 'system' ? 'System Auto' : preference.charAt(0).toUpperCase() + preference.slice(1);
      window.ShopEaseApp.showToast(`Theme switched to ${displayMode}`, 'info');
    }
  }

  function cycleTheme() {
    const cycle = ['light', 'dark', 'system'];
    const nextIndex = (cycle.indexOf(currentTheme) + 1) % cycle.length;
    setTheme(cycle[nextIndex]);
  }

  // Respond immediately when OS dark mode preference changes
  mediaQuery.addEventListener('change', () => {
    if (currentTheme === 'system') {
      applyTheme('system', true);
    }
  });

  // Apply immediately upon script execution to avoid layout flash
  applyTheme(currentTheme, false);

  // Expose global interface
  window.ShopEaseTheme = {
    setTheme,
    cycleTheme,
    getCurrentPreference: () => currentTheme,
    getEffectiveTheme: () => getEffectiveTheme(currentTheme),
  };

  // Wire up theme toggles when DOM is parsed
  document.addEventListener('DOMContentLoaded', () => {
    updateThemeControls(currentTheme, getEffectiveTheme(currentTheme));

    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-theme-toggle]');
      if (!toggleBtn) return;

      e.preventDefault();
      const targetMode = toggleBtn.getAttribute('data-theme-mode');
      if (targetMode) {
        setTheme(targetMode);
      } else {
        cycleTheme();
      }
    });
  });
})();
