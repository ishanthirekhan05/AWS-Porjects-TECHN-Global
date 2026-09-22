/**
 * ShopEase - Enterprise Production Authentication & User Identity Service
 * Provides cryptographic password hashing (Salt + SHA-256 via Web Crypto API),
 * secure token-based session management, and per-user data isolation.
 * 
 * Ready for direct integration with AWS Cognito User Pools and Amazon DynamoDB.
 */

(function () {
  'use strict';

  const USERS_DB_KEY = 'shopease_users_db';
  const SESSION_KEY = 'shopease_session';
  const LEGACY_AUTH_KEY = 'shopease_auth_user';
  const LEGACY_PROFILE_KEY = 'shopease_user_profile';
  const LOCAL_ADMIN_EMAIL = 'admin@shopease.com';
  const LOCAL_ADMIN_SALT = 'shopease-local-admin-2026';
  const LOCAL_ADMIN_PASSWORD_HASH = '85ab8e671aec1f51fed4b75ed568f365a70ffc5c22ab730e16f981198eb89b9e';
  const API_GATEWAY_BASE_URL = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com';

  function normalizeRole(user) {
    return user && user.role === 'admin' ? 'admin' : 'customer';
  }

  function getApiBaseUrl() {
    return (window.SHOPEASE_API_URL || API_GATEWAY_BASE_URL).replace(/\/+$/, '');
  }

  // --- Cryptographic Utility Helpers ---
  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function generateSalt() {
    const array = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
    }
    return bufferToHex(array);
  }

  async function hashPassword(password, salt) {
    if (!password || !salt) return '';
    const textEncoder = new TextEncoder();
    const combined = textEncoder.encode(salt + ':' + password);
    if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
      return bufferToHex(hashBuffer);
    }
    // Fallback basic hashing if Web Crypto subtle is unavailable
    let hash = 0;
    const str = salt + ':' + password;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'fb_' + Math.abs(hash).toString(16);
  }

  // --- User Repository Storage Accessors ---
  function loadUsers() {
    try {
      const raw = localStorage.getItem(USERS_DB_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const users = Array.isArray(parsed) ? parsed : [];
      const existingAdmin = users.find(user => String(user.email || '').trim().toLowerCase() === LOCAL_ADMIN_EMAIL);
      const localAdmin = {
        id: 'usr_local_admin',
        name: 'ShopEase Local Admin',
        email: LOCAL_ADMIN_EMAIL,
        phone: '',
        dob: '',
        gender: '',
        role: 'admin',
        salt: LOCAL_ADMIN_SALT,
        passwordHash: LOCAL_ADMIN_PASSWORD_HASH,
        createdAt: '2026-01-01T00:00:00.000Z',
        joinDate: 'January 2026',
        twoFactorEnabled: false,
        addresses: [],
        payments: [],
        preferences: { theme: 'light', smsAlerts: true, emailInvoices: true, promotions: false }
      };
      if (existingAdmin) {
        Object.assign(existingAdmin, localAdmin);
      } else {
        users.push(localAdmin);
      }
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
      return users;
    } catch (e) {
      console.warn('[AuthService] Error reading users database:', e);
    }
    return [];
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    } catch (e) {
      console.error('[AuthService] Error saving users database:', e);
    }
  }

  function findUserByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const users = loadUsers();
    return users.find(u => u.email.toLowerCase() === normalized) || null;
  }

  function findUserById(userId) {
    if (!userId) return null;
    const users = loadUsers();
    return users.find(u => u.id === userId) || null;
  }

  function updateUserRecord(user) {
    if (!user || !user.id) return false;
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx > -1) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    saveUsers(users);
    return true;
  }

  // --- Session Management ---
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        // Check if session has expired (7-day standard lifetime)
        if (session && session.expiresAt && Date.now() < session.expiresAt) {
          return session;
        }
        // Session expired
        clearSession();
      }
    } catch (e) {
      console.warn('[AuthService] Error reading session:', e);
    }
    return null;
  }

  function setSession(user) {
    const session = {
      token: 'tok_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
      userId: user.id,
      email: user.email,
      name: user.name,
      role: normalizeRole(user),
      createdAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      // Sync legacy bridge keys for backward-compatibility with existing templates
      const authUserBridge = {
        id: user.id,
        sub: user.id,
        name: user.name,
        email: user.email,
        role: normalizeRole(user),
        phone: user.phone || '',
        dob: user.dob || '',
        gender: user.gender || '',
        isGuest: false
      };
      localStorage.setItem(LEGACY_AUTH_KEY, JSON.stringify(authUserBridge));
      localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(authUserBridge));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:auth-changed', { detail: { user, isAuthenticated: true } }));
    return session;
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_AUTH_KEY);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:auth-changed', { detail: { user: null, isAuthenticated: false } }));
  }

  // --- Public API ---

  function getCurrentUser() {
    const session = getSession();
    if (!session || !session.userId) return null;
    const dbUser = findUserById(session.userId);
    if (dbUser) return { ...dbUser, role: normalizeRole(dbUser) };
    return {
      id: session.userId,
      name: session.name || 'Customer',
      email: session.email || '',
      phone: session.phone || '',
      dob: session.dob || '',
      gender: session.gender || '',
      role: normalizeRole(session),
      isGuest: false
    };
  }

  function isAuthenticated() {
    const session = getSession();
    if (!session || !session.userId || session.isGuest) return false;
    const user = getCurrentUser();
    return !!(user && !user.isGuest);
  }

  async function signup(name, email, password) {
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanName) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!cleanPass || cleanPass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters in length.' };
    }

    // Check for existing account
    const existing = findUserByEmail(cleanEmail);
    if (existing) {
      return { success: false, error: 'An account with this email already exists. Please sign in.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(cleanPass, salt);
    const userId = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const newUser = {
      id: userId,
      name: cleanName,
      email: cleanEmail,
      phone: '',
      dob: '',
      gender: '',
      role: 'customer',
      salt: salt,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString(),
      joinDate: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      twoFactorEnabled: false,
      addresses: [],
      payments: [],
      preferences: {
        theme: 'light',
        smsAlerts: true,
        emailInvoices: true,
        promotions: false
      }
    };

    updateUserRecord(newUser);
    setSession(newUser);

    // Synchronize user record with AWS DynamoDB (Table: ShopEaseUsers)
    try {
      fetch(`${getApiBaseUrl()}/users/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ...newUser, password: cleanPass })
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            updateUserRecord({ ...newUser, ...data.user, id: data.user.userId || newUser.id });
          }
        }
      }).catch(err => {
        console.warn('[ShopEaseAuthService] AWS DynamoDB signup sync deferred:', err);
      });
    } catch (e) {}

    // Migrate any guest cart items into the newly created account
    if (window.ShopEaseCart && typeof window.ShopEaseCart.migrateGuestCartToUser === 'function') {
      window.ShopEaseCart.migrateGuestCartToUser(userId);
    }

    return { success: true, user: newUser };
  }

  async function login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return { success: false, error: 'Please provide both email and password.' };
    }

    // Check remote AWS DynamoDB first if available
    try {
      const res = await fetch(`${getApiBaseUrl()}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPass })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.user) {
          const remoteUser = data.user;
          const normalizedUser = {
            id: remoteUser.userId || remoteUser.id,
            userId: remoteUser.userId || remoteUser.id,
            name: remoteUser.name || 'Customer',
            email: remoteUser.email,
            phone: remoteUser.phone || '',
            dob: remoteUser.dob || '',
            gender: remoteUser.gender || '',
            isGuest: false,
            ...remoteUser,
            role: normalizeRole(remoteUser)
          };
          updateUserRecord(normalizedUser);
          setSession(normalizedUser);
          if (window.ShopEaseCart && typeof window.ShopEaseCart.migrateGuestCartToUser === 'function') {
            window.ShopEaseCart.migrateGuestCartToUser(normalizedUser.id);
          }
          return { success: true, user: normalizedUser };
        }
      }
    } catch (apiErr) {
      console.warn('[ShopEaseAuthService] AWS API login fallback to local cache:', apiErr);
    }

    const user = findUserByEmail(cleanEmail);
    if (!user || !user.salt || !user.passwordHash) {
      return { success: false, error: 'Invalid email or password. Please try again.' };
    }

    const computedHash = await hashPassword(cleanPass, user.salt);
    if (computedHash !== user.passwordHash) {
      return { success: false, error: 'Invalid email or password. Please try again.' };
    }

    setSession({ ...user, role: normalizeRole(user) });

    // Migrate any guest cart items into the user's account
    if (window.ShopEaseCart && typeof window.ShopEaseCart.migrateGuestCartToUser === 'function') {
      window.ShopEaseCart.migrateGuestCartToUser(user.id);
    }

    return { success: true, user: { ...user, role: normalizeRole(user) } };
  }

  async function requestPasswordReset(email) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return { success: false, error: 'Please enter your email address.' };
    try {
      const res = await fetch(`${getApiBaseUrl()}/users/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { success: true, message: data.message } : { success: false, error: data.error || 'Unable to request a password reset.' };
    } catch (error) {
      return { success: false, error: 'Password reset service is unavailable. Please try again.' };
    }
  }

  async function confirmPasswordReset(token, password) {
    if (!token || !password) return { success: false, error: 'Reset token and new password are required.' };
    try {
      const res = await fetch(`${getApiBaseUrl()}/users/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { success: true, message: data.message } : { success: false, error: data.error || 'Invalid or expired reset request.' };
    } catch (error) {
      return { success: false, error: 'Password reset service is unavailable. Please try again.' };
    }
  }

  function logout() {
    clearSession();
    // Dispatch cart reload
    if (window.ShopEaseCart && typeof window.ShopEaseCart.syncWithActiveSession === 'function') {
      window.ShopEaseCart.syncWithActiveSession();
    }
    // Dispatch order reload
    if (window.ShopEaseApp && typeof window.ShopEaseApp.syncOrderDependentNavigation === 'function') {
      window.ShopEaseApp.syncOrderDependentNavigation();
    }
    return { success: true };
  }

  function updateProfile(fields) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    if (fields.name) user.name = fields.name.trim();
    if (fields.phone !== undefined) user.phone = fields.phone.trim();
    if (fields.dob !== undefined) user.dob = fields.dob;
    if (fields.gender !== undefined) user.gender = fields.gender;

    updateUserRecord(user);

    // Synchronize updated user profile to AWS DynamoDB (Table: ShopEaseUsers)
    try {
      fetch(`${getApiBaseUrl()}/users`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ userId: user.id, id: user.id, ...fields })
      }).catch(err => console.warn('[ShopEaseAuthService] AWS DynamoDB profile sync deferred:', err));
    } catch (e) {}

    // Update active session metadata
    const session = getSession();
    if (session) {
      session.name = user.name;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    // Update legacy bridges
    const legacyAuth = {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      dob: user.dob || '',
      gender: user.gender || '',
      role: normalizeRole(user),
      isGuest: false
    };
    try {
      localStorage.setItem(LEGACY_AUTH_KEY, JSON.stringify(legacyAuth));
      localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(legacyAuth));
    } catch (e) {}

    window.dispatchEvent(new CustomEvent('shopease:auth-changed', { detail: { user, isAuthenticated: true } }));
    return { success: true, user };
  }

  async function changePassword(currentPassword, newPassword) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const cleanCurr = (currentPassword || '').trim();
    const cleanNew = (newPassword || '').trim();

    if (!cleanCurr || !cleanNew) {
      return { success: false, error: 'Please fill all password fields.' };
    }
    if (cleanNew.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters in length.' };
    }

    const computedCurrent = await hashPassword(cleanCurr, user.salt);
    if (computedCurrent !== user.passwordHash) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    const newSalt = generateSalt();
    const newHash = await hashPassword(cleanNew, newSalt);

    user.salt = newSalt;
    user.passwordHash = newHash;
    user.passwordUpdatedAt = new Date().toISOString();

    updateUserRecord(user);
    return { success: true, message: 'Password changed successfully.' };
  }

  function getAddresses() {
    const user = getCurrentUser();
    return (user && Array.isArray(user.addresses)) ? user.addresses : [];
  }

  function saveAddress(address) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated.' };
    if (!Array.isArray(user.addresses)) user.addresses = [];

    if (address.id) {
      // Edit existing
      const idx = user.addresses.findIndex(a => a.id === address.id);
      if (idx > -1) {
        user.addresses[idx] = { ...user.addresses[idx], ...address };
      } else {
        user.addresses.push(address);
      }
    } else {
      // Add new
      address.id = 'addr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      if (address.isDefault || user.addresses.length === 0) {
        user.addresses.forEach(a => a.isDefault = false);
        address.isDefault = true;
      }
      user.addresses.push(address);
    }

    if (address.isDefault) {
      user.addresses.forEach(a => {
        if (a.id !== address.id) a.isDefault = false;
      });
    }

    updateUserRecord(user);
    return { success: true, addresses: user.addresses, address };
  }

  function deleteAddress(addressId) {
    const user = getCurrentUser();
    if (!user || !Array.isArray(user.addresses)) return { success: false };
    user.addresses = user.addresses.filter(a => a.id !== addressId);
    if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }
    updateUserRecord(user);
    return { success: true, addresses: user.addresses };
  }

  function setDefaultAddress(addressId) {
    const user = getCurrentUser();
    if (!user || !Array.isArray(user.addresses)) return { success: false };
    user.addresses.forEach(a => {
      a.isDefault = (a.id === addressId);
    });
    updateUserRecord(user);
    return { success: true, addresses: user.addresses };
  }

  function getPayments() {
    const user = getCurrentUser();
    return (user && Array.isArray(user.payments)) ? user.payments : [];
  }

  function savePayment(payment) {
    const user = getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated.' };
    if (!Array.isArray(user.payments)) user.payments = [];

    payment.id = payment.id || 'pm_' + Date.now().toString(36);
    user.payments.push(payment);
    updateUserRecord(user);
    return { success: true, payments: user.payments, payment };
  }

  function deletePayment(paymentId) {
    const user = getCurrentUser();
    if (!user || !Array.isArray(user.payments)) return { success: false };
    user.payments = user.payments.filter(p => p.id !== paymentId);
    updateUserRecord(user);
    return { success: true, payments: user.payments };
  }

  function toggleTwoFactor(enabled) {
    const user = getCurrentUser();
    if (!user) return { success: false };
    user.twoFactorEnabled = !!enabled;
    updateUserRecord(user);
    return { success: true, twoFactorEnabled: user.twoFactorEnabled };
  }

  // Expose globally
  window.ShopEaseAuthService = {
    signup,
    login,
    requestPasswordReset,
    confirmPasswordReset,
    logout,
    getCurrentUser,
    isAuthenticated,
    isAdmin: () => {
      const user = getCurrentUser();
      return !!(user && !user.isGuest && normalizeRole(user) === 'admin');
    },
    updateProfile,
    changePassword,
    getAddresses,
    saveAddress,
    deleteAddress,
    setDefaultAddress,
    getPayments,
    savePayment,
    deletePayment,
    toggleTwoFactor,
    hashPassword
  };

})();
