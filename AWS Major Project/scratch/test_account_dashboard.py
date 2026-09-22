import os
import re
import sys
import hashlib

def test_account_dashboard():
    base_dir = r"d:\AWS2\frontend"
    account_html_path = os.path.join(base_dir, "account.html")
    account_js_path = os.path.join(base_dir, "js", "account.js")
    style_css_path = os.path.join(base_dir, "css", "style.css")
    app_js_path = os.path.join(base_dir, "js", "app.js")
    products_data_path = os.path.join(base_dir, "js", "products-data.js")

    print("=== Testing ShopEase My Account Dashboard Implementation ===")

    # 1. Check account.html exists
    assert os.path.exists(account_html_path), "account.html does not exist!"
    with open(account_html_path, "r", encoding="utf-8") as f:
        html = f.read()

    print("[PASS] account.html exists and is readable.")

    # 2. Check 10 required sections in account.html
    # Section 1: Profile Header / Account Summary
    assert 'class="account-header-card"' in html, "Missing account-header-card"
    assert 'id="headerAvatar"' in html, "Missing headerAvatar"
    assert 'id="headerName"' in html, "Missing headerName"
    assert 'id="headerEmail"' in html, "Missing headerEmail"
    assert 'id="headerPhone"' in html, "Missing headerPhone"
    assert 'id="headerStatusBadge"' in html, "Missing headerStatusBadge"
    assert 'id="btnOpenEditProfile"' in html, "Missing Edit Profile button"
    print("[PASS] Section 1: Profile Header / Account Summary verified.")

    # Section 2: Account Overview (4 summary cards)
    assert 'class="account-overview-grid"' in html, "Missing account-overview-grid"
    assert 'id="statTotalOrders"' in html, "Missing statTotalOrders"
    assert 'id="statActiveOrders"' in html, "Missing statActiveOrders"
    assert 'id="statWishlistItems"' in html, "Missing statWishlistItems"
    assert 'id="statBagItems"' in html, "Missing statBagItems"
    print("[PASS] Section 2: Account Overview (4 summary cards) verified.")

    # Section 3: Personal Information
    assert 'id="tab-profile"' in html, "Missing tab-profile panel"
    assert 'id="infoName"' in html, "Missing infoName"
    assert 'id="infoEmail"' in html, "Missing infoEmail"
    assert 'id="infoPhone"' in html, "Missing infoPhone"
    assert 'id="infoDob"' in html, "Missing infoDob"
    assert 'id="infoGender"' in html, "Missing infoGender"
    assert 'id="infoCognito"' in html, "Missing infoCognito"
    print("[PASS] Section 3: Personal Information verified.")

    # Section 4: My Addresses
    assert 'id="tab-addresses"' in html, "Missing tab-addresses panel"
    assert 'id="accountAddressesContainer"' in html, "Missing accountAddressesContainer"
    assert 'id="btnOpenAddAddress"' in html, "Missing Add New Address button"
    assert 'id="modalAddress"' in html, "Missing Address modal"
    print("[PASS] Section 4: My Addresses verified.")

    # Section 5: My Orders
    assert 'id="tab-orders"' in html, "Missing tab-orders panel"
    assert 'id="accountOrdersContainer"' in html, "Missing accountOrdersContainer"
    print("[PASS] Section 5: My Orders verified.")

    # Section 6: Wishlist
    assert 'id="tab-wishlist"' in html, "Missing tab-wishlist panel"
    assert 'id="accountWishlistContainer"' in html, "Missing accountWishlistContainer"
    print("[PASS] Section 6: Saved Wishlist verified.")

    # Section 7: Security & Login
    assert 'id="tab-security"' in html, "Missing tab-security panel"
    assert 'id="twoFaToggle"' in html, "Missing 2FA toggle"
    assert 'id="btnOpenChangePassword"' in html, "Missing Change Password button"
    assert 'id="modalPassword"' in html, "Missing Password modal"
    assert 'AWS Cloud Security' in html or 'Amazon Cognito' in html, "Missing Cognito Security row"
    assert 'id="btnSignOut"' in html, "Missing Sign Out button"
    print("[PASS] Section 7: Security & Login verified.")

    # Section 8: Payment Methods
    assert 'id="tab-payments"' in html, "Missing tab-payments panel"
    assert 'id="accountPaymentsContainer"' in html, "Missing accountPaymentsContainer"
    assert 'id="btnOpenAddPayment"' in html, "Missing Add Payment button"
    assert 'PCI-DSS' in html, "Missing PCI-DSS compliance note"
    print("[PASS] Section 8: Payment Methods verified.")

    # Section 9: Preferences
    assert 'id="tab-preferences"' in html, "Missing tab-preferences panel"
    assert 'class="account-theme-picker"' in html, "Missing theme picker in preferences"
    assert 'SMS &amp; WhatsApp Alerts' in html or 'SMS' in html, "Missing SMS alert preference"
    assert 'Email Invoices' in html, "Missing Email invoice preference"
    print("[PASS] Section 9: Preferences verified.")

    # Section 10: Professional Layout & Modals
    assert 'class="account-layout"' in html, "Missing account-layout"
    assert 'class="account-sidebar"' in html, "Missing account-sidebar"
    assert 'modalEditProfile' in html, "Missing modalEditProfile"
    assert 'modalAddress' in html, "Missing modalAddress"
    assert 'modalPayment' in html, "Missing modalPayment"
    assert 'modalPassword' in html, "Missing modalPassword"
    print("[PASS] Section 10: Professional Layout & Modals verified.")

    # 3. Check account.js exists and contents
    assert os.path.exists(account_js_path), "account.js does not exist!"
    with open(account_js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "window.ShopEaseAccount =" in js, "Missing ShopEaseAccount export"
    assert "DEFAULT_PROFILE" in js, "Missing DEFAULT_PROFILE"
    assert "DEFAULT_ADDRESSES" in js, "Missing DEFAULT_ADDRESSES"
    assert "DEFAULT_PAYMENTS" in js, "Missing DEFAULT_PAYMENTS"
    assert "DEFAULT_ORDERS" in js, "Missing DEFAULT_ORDERS"
    assert "SE84920193" in js, "Missing active order ID SE84920193"
    assert "renderProfileUI" in js, "Missing renderProfileUI"
    assert "renderOrdersUI" in js, "Missing renderOrdersUI"
    assert "renderAddressesUI" in js, "Missing renderAddressesUI"
    assert "renderPaymentsUI" in js, "Missing renderPaymentsUI"
    assert "renderWishlistUI" in js, "Missing renderWishlistUI"
    assert "setActiveTab" in js, "Missing setActiveTab"
    print("[PASS] account.js verified with full state logic and event handling.")

    # 4. Check CSS in style.css
    with open(style_css_path, "r", encoding="utf-8") as f:
        css = f.read()

    assert ".account-layout" in css, "Missing .account-layout in CSS"
    assert ".account-sidebar" in css, "Missing .account-sidebar in CSS"
    assert ".account-header-card" in css, "Missing .account-header-card in css"
    assert ".account-overview-grid" in css, "Missing .account-overview-grid in css"
    assert ".account-modal-overlay" in css, "Missing .account-modal-overlay in css"
    assert "@media (max-width: 1024px)" in css, "Missing tablet responsive query in css"
    assert "@media (max-width: 640px)" in css, "Missing mobile responsive query in css"
    print("[PASS] style.css verified with full account design system and responsive rules.")

    # 5. Check app.js dropdown closing logic
    with open(app_js_path, "r", encoding="utf-8") as f:
        app_js = f.read()

    assert "profileDropdown.querySelectorAll('a, button:not([data-theme-toggle])')" in app_js, "Missing item click dropdown closer"
    assert "window.addEventListener('pageshow'" in app_js, "Missing pageshow listener"
    assert "window.addEventListener('popstate'" in app_js, "Missing popstate listener"
    print("[PASS] app.js dropdown immediate item-closing and navigation cleanup verified.")

    # 6. Check dropdown link in all 8 HTML files
    pages = ["index.html", "products.html", "events.html", "about.html", "cart.html", "product.html", "order-details.html", "account.html"]
    for page in pages:
        p_path = os.path.join(base_dir, page)
        with open(p_path, "r", encoding="utf-8") as f:
            p_content = f.read()
        assert 'href="account.html"' in p_content, f"Missing href='account.html' in {page}"
        print(f"[PASS] Dropdown link verified in {page}")

    # 7. Check products-data.js integrity (Zero-Touch Catalog Check)
    with open(products_data_path, "r", encoding="utf-8") as f:
        data_content = f.read()
    
    # Count products (format: "id": "prod-...")
    prod_ids = re.findall(r'"id":\s*"([^"]+)"', data_content)
    assert len(prod_ids) == 90, f"Product catalog size changed! Expected 90, found {len(prod_ids)}"
    print(f"[PASS] products-data.js catalog size verified (exactly {len(prod_ids)} products).")

    print("\nALL ACCOUNT DASHBOARD VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_account_dashboard()
