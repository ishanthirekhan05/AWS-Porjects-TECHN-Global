from pathlib import Path


AUTH = Path('frontend/js/auth-service.js').read_text(encoding='utf-8')
ACCOUNT = Path('frontend/account.html').read_text(encoding='utf-8')
ADMIN = Path('frontend/admin.html').read_text(encoding='utf-8')
LAMBDA = Path('backend/lambda_function.py').read_text(encoding='utf-8')
LOGIN = Path('frontend/login.html').read_text(encoding='utf-8').lower()


def test_signup_defaults_to_customer_without_public_role_input():
    assert "role: 'customer'" in AUTH
    assert 'name="role"' not in LOGIN
    assert 'id="role"' not in LOGIN


def test_customer_navigation_hides_admin_link_and_admin_page_redirects():
    assert 'adminAnalyticsNavItem' in ACCOUNT
    assert "style.display = isAdmin ? 'list-item' : 'none'" in Path('frontend/js/account.js').read_text(encoding='utf-8')
    assert "window.location.replace('account.html')" in ADMIN
    assert "auth.isAdmin()" in ADMIN


def test_backend_designates_only_server_allowlisted_admins():
    assert 'SHOPEASE_ADMIN_USER_IDS' in LAMBDA
    assert 'SHOPEASE_ADMIN_EMAILS' in LAMBDA
    assert "'role': 'customer'" in LAMBDA
    assert "key != 'role'" in LAMBDA
    assert "'role': resolve_user_role(existing)" in LAMBDA


def test_remote_login_cannot_overwrite_normalized_role():
    remote_block = AUTH[AUTH.index('const normalizedUser = {'):AUTH.index('updateUserRecord(normalizedUser);')]
    assert remote_block.index('...remoteUser') < remote_block.index('role: normalizeRole(remoteUser)')


if __name__ == '__main__':
    test_signup_defaults_to_customer_without_public_role_input()
    test_customer_navigation_hides_admin_link_and_admin_page_redirects()
    test_backend_designates_only_server_allowlisted_admins()
    print('PASS: customer and admin role access checks')