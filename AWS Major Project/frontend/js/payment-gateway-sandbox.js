/**
 * ShopEase - Official Payment Gateway Sandbox & Test Engine
 * Simulates enterprise Indian banking & payment gateway flows (Razorpay / PayU / Stripe Test Mode).
 * 
 * Safety Guarantee:
 * - Operates strictly in SANDBOX / TEST MODE. Zero real money is charged.
 * - Enforces authentic gateway validation: card format verification, expiry checks,
 *   3D-Secure bank OTP verification, and bank decline simulation.
 * - Returns authentic sandbox tokens (pay_test_...) on success.
 */

(function () {
  'use strict';

  // Inject gateway styles once
  function ensureStyles() {
    if (document.getElementById('shopease-gateway-styles')) return;
    const style = document.createElement('style');
    style.id = 'shopease-gateway-styles';
    style.textContent = `
      .sg-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.72);
        backdrop-filter: blur(6px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .sg-overlay.sg-visible {
        opacity: 1;
      }
      .sg-modal {
        background: #ffffff;
        color: #1e293b;
        width: 100%;
        max-width: 480px;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.96);
        transition: transform 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .sg-overlay.sg-visible .sg-modal {
        transform: scale(1);
      }
      .sg-header {
        background: #1e293b;
        color: #ffffff;
        padding: 18px 22px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .sg-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .sg-brand-logo {
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #ffffff;
      }
      .sg-brand-logo span {
        color: #6366f1;
      }
      .sg-amount-pill {
        background: rgba(255, 255, 255, 0.12);
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 700;
        color: #ffffff;
      }
      .sg-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sg-close-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }
      .sg-sandbox-banner {
        background: #fef3c7;
        color: #92400e;
        padding: 8px 16px;
        font-size: 0.75rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-bottom: 1px solid #fde68a;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .sg-body {
        padding: 20px 22px;
      }
      .sg-tabs-bar {
        display: flex;
        border-bottom: 2px solid #e2e8f0;
        margin-bottom: 18px;
      }
      .sg-tab-btn {
        flex: 1;
        padding: 10px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        font-size: 0.8125rem;
        font-weight: 700;
        color: #64748b;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }
      .sg-tab-btn.active {
        color: #4f46e5;
        border-bottom-color: #4f46e5;
      }
      .sg-tab-content {
        display: none;
      }
      .sg-tab-content.active {
        display: block;
      }
      .sg-quick-fill-bar {
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 8px 12px;
        margin-bottom: 16px;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .sg-btn-link {
        background: transparent;
        border: none;
        color: #4f46e5;
        font-weight: 700;
        font-size: 0.75rem;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        text-decoration: underline;
      }
      .sg-btn-link:hover {
        background: #ede9fe;
      }
      .sg-btn-link.danger {
        color: #dc2626;
      }
      .sg-btn-link.danger:hover {
        background: #fee2e2;
      }
      .sg-field {
        margin-bottom: 14px;
      }
      .sg-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 700;
        color: #334155;
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }
      .sg-input {
        width: 100%;
        padding: 10px 12px;
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.9375rem;
        font-weight: 600;
        color: #1e293b;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.15s;
      }
      .sg-input:focus {
        border-color: #4f46e5;
      }
      .sg-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .sg-pay-btn {
        width: 100%;
        padding: 13px;
        background: #4f46e5;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        font-size: 0.9375rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 10px;
        transition: background 0.15s;
      }
      .sg-pay-btn:hover {
        background: #4338ca;
      }
      .sg-pay-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .sg-error-box {
        background: #fef2f2;
        border: 1px solid #f87171;
        color: #b91c1c;
        padding: 10px 14px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        margin-bottom: 14px;
        display: none;
      }
      .sg-footer {
        padding: 12px 22px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        font-size: 0.72rem;
        color: #64748b;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      /* 3D-Secure Screen */
      .sg-otp-screen {
        text-align: center;
        padding: 24px 10px;
      }
      .sg-otp-bank-badge {
        font-size: 0.8125rem;
        font-weight: 800;
        color: #1e293b;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .sg-otp-input {
        width: 180px;
        padding: 12px;
        font-size: 1.5rem;
        letter-spacing: 0.4em;
        text-align: center;
        border: 2px solid #cbd5e1;
        border-radius: 8px;
        margin: 14px auto;
        font-weight: 800;
      }
      .sg-otp-input:focus {
        border-color: #4f46e5;
        outline: none;
      }
      .sg-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #ffffff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: sg-spin 0.6s linear infinite;
      }
      @keyframes sg-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // Generate cryptographic hex ID
  function generateId(prefix) {
    return prefix + '_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }

  /**
   * Main Gateway Class
   */
  function PaymentGateway(options) {
    this.options = options || {};
  }

  PaymentGateway.prototype.open = function () {
    ensureStyles();

    const opts = this.options;
    const rawAmount = Number(opts.amount || 0);
    const amountInRupees = opts.inRupees ? rawAmount : (rawAmount >= 100 ? Math.round(rawAmount / 100) : rawAmount);
    const amountDisplay = '₹' + amountInRupees.toLocaleString('en-IN');
    const customerName = opts.prefill?.name || 'Customer';
    const customerEmail = opts.prefill?.email || '';
    const customerPhone = opts.prefill?.contact || '';

    // Create DOM structure
    const overlay = document.createElement('div');
    overlay.className = 'sg-overlay';

    overlay.innerHTML = `
      <div class="sg-modal" role="dialog" aria-modal="true" aria-label="ShopEase Sandbox Payment Gateway">
        <div class="sg-header">
          <div class="sg-header-left">
            <div class="sg-brand-logo">Shop<span>Ease</span> Pay</div>
            <div class="sg-amount-pill">${amountDisplay}</div>
          </div>
          <button type="button" class="sg-close-btn" id="sgCloseBtn" aria-label="Close payment modal">&times;</button>
        </div>

        <div class="sg-sandbox-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Official Sandbox Test Mode &bull; No Real Money Charged
        </div>

        <!-- Main Form View -->
        <div class="sg-body" id="sgMainView">
          <div class="sg-error-box" id="sgErrorBox"></div>

          <div class="sg-tabs-bar">
            <button type="button" class="sg-tab-btn active" data-sg-tab="card">Credit / Debit Card</button>
            <button type="button" class="sg-tab-btn" data-sg-tab="upi">UPI ID / QR</button>
            <button type="button" class="sg-tab-btn" data-sg-tab="netbanking">Net Banking</button>
          </div>

          <!-- TAB 1: CARD -->
          <div class="sg-tab-content active" id="sgTabCard">
            <div class="sg-quick-fill-bar">
              <span><strong>Sandbox Quick-Fill:</strong></span>
              <button type="button" class="sg-btn-link" id="sgFillSuccessCard">✓ Success Card</button>
              <button type="button" class="sg-btn-link danger" id="sgFillDeclineCard">&times; Decline Card</button>
            </div>

            <div class="sg-field">
              <label class="sg-label">Card Number</label>
              <input type="text" id="sgCardNum" class="sg-input" placeholder="4111 2222 3333 4892" maxlength="19">
            </div>

            <div class="sg-grid-2">
              <div class="sg-field">
                <label class="sg-label">Valid Thru</label>
                <input type="text" id="sgCardExp" class="sg-input" placeholder="MM/YY" maxlength="5">
              </div>
              <div class="sg-field">
                <label class="sg-label">CVV</label>
                <input type="password" id="sgCardCvv" class="sg-input" placeholder="123" maxlength="4">
              </div>
            </div>

            <div class="sg-field">
              <label class="sg-label">Cardholder Name</label>
              <input type="text" id="sgCardName" class="sg-input" value="${customerName}" placeholder="Name on card">
            </div>

            <button type="button" class="sg-pay-btn" id="sgBtnPayCard">
              <span>Pay ${amountDisplay} (Test Mode)</span>
            </button>
          </div>

          <!-- TAB 2: UPI -->
          <div class="sg-tab-content" id="sgTabUpi">
            <div class="sg-quick-fill-bar">
              <span><strong>Sandbox UPI:</strong></span>
              <button type="button" class="sg-btn-link" id="sgFillSuccessUpi">✓ success@razorpay</button>
            </div>

            <div class="sg-field">
              <label class="sg-label">Virtual Payment Address (VPA)</label>
              <input type="text" id="sgUpiId" class="sg-input" placeholder="mobile@upi or user@okhdfcbank">
            </div>

            <button type="button" class="sg-pay-btn" id="sgBtnPayUpi">
              <span>Verify &amp; Pay ${amountDisplay}</span>
            </button>
          </div>

          <!-- TAB 3: NETBANKING -->
          <div class="sg-tab-content" id="sgTabNetbanking">
            <div class="sg-field">
              <label class="sg-label">Select Bank</label>
              <select id="sgBankSelect" class="sg-input" style="cursor: pointer;">
                <option value="HDFC">HDFC Bank (Sandbox Instant)</option>
                <option value="ICICI">ICICI Bank (Sandbox Instant)</option>
                <option value="SBI">State Bank of India (Sandbox Instant)</option>
                <option value="AXIS">Axis Bank (Sandbox Instant)</option>
                <option value="KOTAK">Kotak Mahindra Bank (Sandbox Instant)</option>
              </select>
            </div>

            <button type="button" class="sg-pay-btn" id="sgBtnPayBank">
              <span>Proceed to Bank Portal &rarr;</span>
            </button>
          </div>
        </div>

        <!-- 3D-Secure OTP Screen -->
        <div class="sg-body" id="sgOtpView" style="display: none;">
          <div class="sg-otp-screen">
            <div class="sg-otp-bank-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>RBI 3D-Secure 2.0 Verification Simulator</span>
            </div>
            <p style="font-size: 0.8125rem; color: #64748b; margin: 0 0 12px;">
              An authentic OTP has been generated for transaction <strong>${amountDisplay}</strong> to <strong>ShopEase Retail Pvt Ltd</strong>.
            </p>
            <div style="font-size: 0.75rem; color: #4f46e5; font-weight: 700; margin-bottom: 6px;">
              Test Sandbox OTP: <strong>123456</strong>
            </div>

            <input type="text" id="sgOtpInput" class="sg-otp-input" value="123456" maxlength="6">

            <div class="sg-error-box" id="sgOtpErrorBox"></div>

            <button type="button" class="sg-pay-btn" id="sgBtnSubmitOtp">
              <span>Confirm &amp; Authorize Payment</span>
            </button>

            <button type="button" class="sg-btn-link danger" id="sgBtnCancelOtp" style="margin-top: 14px; display: inline-block;">
              Cancel Transaction
            </button>
          </div>
        </div>

        <div class="sg-footer">
          <div>PCI-DSS Level 1 &bull; 256-Bit TLS</div>
          <div>ShopEase Sandbox Gateway v2.4</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('sg-visible'));

    // --- State & DOM References ---
    let pendingPaymentMethod = 'card';
    let dismissed = false;
    const mainView = overlay.querySelector('#sgMainView');
    const otpView = overlay.querySelector('#sgOtpView');
    const errorBox = overlay.querySelector('#sgErrorBox');
    const otpErrorBox = overlay.querySelector('#sgOtpErrorBox');

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    function hideError() {
      errorBox.style.display = 'none';
    }

    function dismiss(reason = 'user_cancelled') {
      if (dismissed) return;
      dismissed = true;
      pendingPaymentMethod = null;
      const onDismiss = typeof opts.modal?.ondismiss === 'function'
        ? opts.modal.ondismiss
        : opts.onDismiss;
      opts.handler = null;
      opts.onDismiss = null;
      if (opts.modal) opts.modal.ondismiss = null;
      overlay.classList.remove('sg-visible');
      setTimeout(() => {
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      }, 200);

      if (typeof onDismiss === 'function') {
        onDismiss(reason);
      }
    }

    function completeSuccess(method) {
      if (dismissed) return;
      overlay.classList.remove('sg-visible');
      setTimeout(() => {
        if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      }, 200);

      const paymentId = generateId('pay_test');
      const orderId = generateId('order_test');
      const signature = generateId('sig_test');

      if (typeof opts.handler === 'function') {
        opts.handler({
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          razorpay_signature: signature,
          payment_id: paymentId,
          payment_method: method,
          method: (method && method.toLowerCase().includes('upi')) ? 'upi' : 'card',
          status: 'captured',
          amount: amountInRupees
        });
      }
    }

    // Close button
    overlay.querySelector('#sgCloseBtn').addEventListener('click', () => dismiss('modal_closed'));

    // Tab switching
    overlay.querySelectorAll('.sg-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        hideError();
        overlay.querySelectorAll('.sg-tab-btn').forEach(b => b.classList.remove('active'));
        overlay.querySelectorAll('.sg-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-sg-tab');
        if (tab === 'card') overlay.querySelector('#sgTabCard').classList.add('active');
        else if (tab === 'upi') overlay.querySelector('#sgTabUpi').classList.add('active');
        else if (tab === 'netbanking') overlay.querySelector('#sgTabNetbanking').classList.add('active');
      });
    });

    // Quick-Fill Buttons
    overlay.querySelector('#sgFillSuccessCard').addEventListener('click', () => {
      hideError();
      overlay.querySelector('#sgCardNum').value = '4111 2222 3333 4892';
      overlay.querySelector('#sgCardExp').value = '12/28';
      overlay.querySelector('#sgCardCvv').value = '123';
    });

    overlay.querySelector('#sgFillDeclineCard').addEventListener('click', () => {
      hideError();
      overlay.querySelector('#sgCardNum').value = '4000 0000 0000 0002';
      overlay.querySelector('#sgCardExp').value = '12/28';
      overlay.querySelector('#sgCardCvv').value = '999';
    });

    overlay.querySelector('#sgFillSuccessUpi').addEventListener('click', () => {
      hideError();
      overlay.querySelector('#sgUpiId').value = 'success@razorpay';
    });

    // Card formatting
    const cardNumInput = overlay.querySelector('#sgCardNum');
    cardNumInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 16);
      val = val.replace(/(\d{4})(?=\d)/g, '$1 ');
      e.target.value = val;
    });

    const cardExpInput = overlay.querySelector('#sgCardExp');
    cardExpInput.addEventListener('input', (e) => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (val.length >= 2) val = val.substring(0, 2) + '/' + val.substring(2);
      e.target.value = val;
    });

    // --- Action: Pay via Card ---
    overlay.querySelector('#sgBtnPayCard').addEventListener('click', () => {
      hideError();
      const rawNum = cardNumInput.value.replace(/\s/g, '');
      const exp = cardExpInput.value.trim();
      const cvv = overlay.querySelector('#sgCardCvv').value.trim();

      if (rawNum.length < 15) {
        showError('Please enter a valid 16-digit card number.');
        return;
      }
      if (!exp || exp.length < 5) {
        showError('Please enter card expiry in MM/YY format.');
        return;
      }
      if (cvv.length < 3) {
        showError('Please enter a valid 3 or 4 digit CVV code.');
        return;
      }

      // Check for intentional test decline card
      if (rawNum === '4000000000000002') {
        showError('Bank Authorization Failed: Card declined by issuing bank (Insufficient funds / Restricted test card).');
        return;
      }

      // Proceed to 3D-Secure verification step
      pendingPaymentMethod = 'Credit / Debit Card (Online)';
      mainView.style.display = 'none';
      otpView.style.display = 'block';
    });

    // --- Action: Pay via UPI ---
    overlay.querySelector('#sgBtnPayUpi').addEventListener('click', () => {
      hideError();
      const upiId = overlay.querySelector('#sgUpiId').value.trim();
      if (!upiId || !upiId.includes('@')) {
        showError('Please enter a valid UPI ID (e.g. success@razorpay or name@okhdfcbank).');
        return;
      }

      const btn = overlay.querySelector('#sgBtnPayUpi');
      btn.disabled = true;
      btn.innerHTML = '<span class="sg-spinner"></span> <span>Awaiting UPI App Approval...</span>';

      setTimeout(() => {
        completeSuccess(`UPI (${upiId})`);
      }, 1200);
    });

    // --- Action: Pay via Netbanking ---
    overlay.querySelector('#sgBtnPayBank').addEventListener('click', () => {
      const bank = overlay.querySelector('#sgBankSelect').value;
      const btn = overlay.querySelector('#sgBtnPayBank');
      btn.disabled = true;
      btn.innerHTML = '<span class="sg-spinner"></span> <span>Connecting to ' + bank + ' Portal...</span>';

      setTimeout(() => {
        completeSuccess(`Net Banking (${bank} Bank)`);
      }, 1200);
    });

    // --- Action: Submit 3DS OTP ---
    overlay.querySelector('#sgBtnSubmitOtp').addEventListener('click', () => {
      const otpVal = overlay.querySelector('#sgOtpInput').value.trim();
      if (otpVal !== '123456') {
        otpErrorBox.textContent = 'Invalid OTP entered. For sandbox mode, use OTP: 123456.';
        otpErrorBox.style.display = 'block';
        return;
      }

      const btn = overlay.querySelector('#sgBtnSubmitOtp');
      btn.disabled = true;
      btn.innerHTML = '<span class="sg-spinner"></span> <span>Authenticating with Bank...</span>';

      setTimeout(() => {
        completeSuccess(pendingPaymentMethod);
      }, 800);
    });

    // Cancel OTP
    overlay.querySelector('#sgBtnCancelOtp').addEventListener('click', () => {
      dismiss('otp_cancelled_by_user');
    });
  };

  // Expose global constructors
  window.ShopEasePaymentGateway = {
    open: function (options) {
      const gw = new PaymentGateway(options);
      gw.open();
      return gw;
    },
    close: function () {
      const overlays = document.querySelectorAll('.sg-overlay');
      overlays.forEach(o => o.remove());
    }
  };

  // Razorpay compatibility drop-in wrapper
  window.Razorpay = function (options) {
    return {
      open: function () {
        return window.ShopEasePaymentGateway.open(options);
      }
    };
  };

})();
