import http.server
import socketserver
import threading
import subprocess
import time
import os
import json

PORT = 8997
DIRECTORY = r'd:\AWS2\frontend'

report = {}
done_event = threading.Event()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def do_POST(self):
        global report
        if self.path == '/api/report':
            len_ = int(self.headers['Content-Length'])
            data = self.rfile.read(len_)
            report = json.loads(data.decode('utf-8'))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            done_event.set()
    def log_message(self, format, *args):
        pass

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

httpd = ReuseTCPServer(("", PORT), Handler)
server_thread = threading.Thread(target=httpd.serve_forever)
server_thread.daemon = True
server_thread.start()

test_html_path = os.path.join(DIRECTORY, 'temp_test_all_features.html')
test_html_content = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>All Features Verification Test</title>
</head>
<body>
  <h1>Running All Features Verification</h1>
  <script src="js/products-data.js"></script>
  <script src="js/events.js"></script>
  <script src="js/cart.js"></script>
  <script src="js/auth-service.js"></script>
  <script src="js/order-service.js"></script>
  <script src="js/app.js"></script>
  <script>
    (async function() {
      const results = {
        authService: false,
        cartService: false,
        wishlistService: false,
        orderService: false,
        signupSuccess: false,
        loginSuccess: false,
        profileUpdateSuccess: false,
        cartAddSuccess: false,
        wishlistToggleSuccess: false,
        error: null
      };

      try {
        // 1. Verify global objects
        if (window.ShopEaseAuthService) results.authService = true;
        if (window.ShopEaseCart) results.cartService = true;
        if (window.ShopEaseOrderService) results.orderService = true;

        // 2. Test User Signup
        const testEmail = 'verify_' + Date.now() + '@shopease.com';
        const signupRes = await window.ShopEaseAuthService.signup('Verify User', testEmail, 'password123');
        if (signupRes && signupRes.success && signupRes.user) {
          results.signupSuccess = true;
          results.userId = signupRes.user.id;
        }

        // 3. Test Profile Update
        const updateRes = window.ShopEaseAuthService.updateProfile({ name: 'Verified Name', phone: '+91 9876543210' });
        if (updateRes && updateRes.success && updateRes.user.name === 'Verified Name') {
          results.profileUpdateSuccess = true;
        }

        // 4. Test Cart Operation
        const pId = 'prod-apple-macbook-air-m2';
        const addRes = window.ShopEaseCart.addToCart(pId, 1);
        const count = window.ShopEaseCart.getCartCount();
        if (addRes && count >= 1) {
          results.cartAddSuccess = true;
        }

        // 5. Test Wishlist Operation
        const isWished = window.ShopEaseCart.toggleWishlist(pId);
        if (isWished && window.ShopEaseCart.isInWishlist(pId)) {
          results.wishlistToggleSuccess = true;
        }

        // 6. Test User Login
        window.ShopEaseAuthService.logout();
        const loginRes = await window.ShopEaseAuthService.login(testEmail, 'password123');
        if (loginRes && loginRes.success && loginRes.user) {
          results.loginSuccess = true;
        }

      } catch (err) {
        results.error = err.message + ' ' + (err.stack || '');
      }

      // Send results to test runner
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results)
      });
    })();
  </script>
</body>
</html>
"""

with open(test_html_path, 'w', encoding='utf-8') as f:
    f.write(test_html_content)

edge_paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe"
]
browser_exe = None
for p in edge_paths:
    if os.path.exists(p):
        browser_exe = p
        break

print("Browser found:", browser_exe)
proc = subprocess.Popen([
    browser_exe,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    f'http://localhost:{PORT}/temp_test_all_features.html'
])

done = done_event.wait(timeout=15)
proc.terminate()
try:
    proc.wait(timeout=3)
except:
    pass

if os.path.exists(test_html_path):
    os.remove(test_html_path)

print("Test Report:", json.dumps(report, indent=2))
httpd.shutdown()
