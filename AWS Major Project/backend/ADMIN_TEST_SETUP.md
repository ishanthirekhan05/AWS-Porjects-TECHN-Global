# ShopEase Admin Test Setup

Use an existing ShopEase customer account as the development admin. Do not add an admin field to signup and do not create a separate password.

## Configure the existing account

From the repository root, set the email only in the environment of the local process that loads `backend/lambda_function.py`:

```powershell
$env:SHOPEASE_ADMIN_EMAILS = 'your-existing-account@example.com'
```

For multiple test admins, use a comma-separated list:

```powershell
$env:SHOPEASE_ADMIN_EMAILS = 'your-existing-account@example.com,another-test@example.com'
```

The value is normalized to lowercase. An account is resolved as `admin` only when its email is in this server-side allowlist. All other users resolve as `customer`. Public request fields cannot change the role.

## Test the existing login

Start the backend process or Lambda test harness from the same PowerShell window so it inherits the variable. Then start the existing frontend server in another PowerShell window:

```powershell
python -m http.server 8989 --directory frontend
```

Open:

```text
http://localhost:8989/login.html
```

Log in with the existing account's normal email and password. The login response should contain `role: "admin"`; the session should contain the same role; and `Admin Analytics` should appear in My Account.

Open `http://localhost:8989/admin.html` directly to verify access. A customer or unauthenticated browser is redirected to `account.html`.

## Backend-only verification

Without exposing credentials, the role resolver can be checked from the same configured environment:

```powershell
$env:SHOPEASE_ADMIN_EMAILS = 'your-existing-account@example.com'
python -c "import sys; sys.path.insert(0, 'backend'); import lambda_function as l; print(l.resolve_user_role({'email': 'your-existing-account@example.com'})); print(l.resolve_user_role({'email': 'customer@example.com'}))"
```

Expected output:

```text
admin
customer
```

The current static frontend points its API calls at the configured ShopEase API Gateway endpoint. Therefore, browser login will use the admin role only after the backend process serving that endpoint has `SHOPEASE_ADMIN_EMAILS` configured. No AWS deployment or infrastructure change is performed by this setup guide.
