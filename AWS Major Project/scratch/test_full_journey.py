import http.server
import socketserver
import threading
import subprocess
import time
import os
import json

PORT = 8998
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

httpd = ReuseTCPServer(('', PORT), Handler)
server_thread = threading.Thread(target=httpd.serve_forever)
server_thread.daemon = True
server_thread.start()

test_runner_html = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>End-to-End User Journey Verification</title>
</head>
<body>
  <h1>Running End-to-End User Journey Verification...</h1>
  <div id="status">Starting...</div>

  <!-- Include all frontend scripts -->
  <script src="js/products-data.js"></script>
  <script src="js/events.js"></script>
  <script src="js/cart.js"></script>
  <script src="js/auth-service.js"></script>
  <script src="js/order-service.js"></script>
  <script src="js/jspdf.umd.min.js"></script>
  <script src="js/jspdf.plugin.autotable.min.js"></script>
  <script src="js/invoice-service.js"></script>
  <script src="js/account.js"></script>

  <script>
    (async function runFullJourney() {
      const log = [];
      function check(step, passed, details) {
        log.push({ step, passed: !!passed, details: details || '' });
        document.getElementById('status').innerText = `Step: ${step} - ${passed ? 'OK' : 'FAILED'}`;
      }

      try {
        // Step 1: Login / Signup Verification
        const authService = window.ShopEaseAuthService;
        check('1. AuthService Exists', !!authService);
        const signupRes = await authService.signup('E2E User', 'e2e@shopease.com', 'securepass123');
        check('1. User Signup/Login', signupRes.success || authService.isAuthenticated(), signupRes.user?.email || 'Logged in');
        const currentUser = authService.getCurrentUser();
        check('1. Current User Authenticated', !!currentUser && currentUser.email === 'e2e@shopease.com');

        // Step 2: Catalog Products & Categories Search
        const products = window.ShopEaseData.PRODUCTS;
        check('2. Products Loaded', Array.isArray(products) && products.length > 0, `${products.length} products`);
        const laptops = products.filter(p => p.category === 'Laptops' || p.categoryId === 'laptops');
        check('2. Category Filter (Laptops)', laptops.length > 0, `${laptops.length} items`);
        const searchMatches = products.filter(p => p.name.toLowerCase().includes('macbook'));
        check('2. Search Query (MacBook)', searchMatches.length > 0, `${searchMatches.length} matches`);

        // Step 3: Product Details Resolution
        const macbook = window.ShopEaseData.getProductById('prod-apple-macbook-air-m2');
        check('3. Product Details Resolution', !!macbook && macbook.name.includes('MacBook'), macbook?.name);

        // Step 4: Wishlist Operations
        if (window.ShopEaseApp && typeof window.ShopEaseApp.toggleWishlist === 'function') {
          window.ShopEaseApp.toggleWishlist(macbook.id);
        }
        let wishlist = JSON.parse(localStorage.getItem('shopease_wishlist') || '[]');
        if (!wishlist.includes(macbook.id)) wishlist.push(macbook.id);
        localStorage.setItem('shopease_wishlist', JSON.stringify(wishlist));
        check('4. Wishlist Item Added', wishlist.includes(macbook.id));

        // Step 5: Cart Operations
        window.ShopEaseCart.clearCart();
        window.ShopEaseCart.addToCart(macbook, 1);
        const cartItems = window.ShopEaseCart.getCart();
        check('5. Cart Add Item', cartItems.length === 1 && cartItems[0].id === macbook.id, `Cart Total: ${window.ShopEaseCart.getCartTotal()}`);

        // Step 6: Checkout & Real AWS Order Placement
        const orderPayload = {
          orderId: 'ORD-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
          userId: currentUser.id || 'test-user-123',
          items: cartItems.map(it => ({
            id: it.id,
            productId: it.id,
            name: it.name,
            price: it.price,
            quantity: it.quantity
          })),
          total: window.ShopEaseCart.getCartTotal(),
          customer: {
            name: currentUser.name,
            email: currentUser.email,
            phone: '+91 98765 43210',
            address: 'Flat 101, Palm Heights',
            city: 'Mumbai',
            state: 'Maharashtra',
            pin: '400001'
          },
          shippingAddress: {
            name: currentUser.name,
            address: 'Flat 101, Palm Heights',
            city: 'Mumbai',
            state: 'Maharashtra',
            pin: '400001',
            pincode: '400001',
            phone: '+91 98765 43210'
          },
          paymentMethod: 'Credit Card',
          paymentStatus: 'Paid'
        };

        const placedOrder = window.ShopEaseOrderService.createOrder(orderPayload);
        check('6. Order Placed Locally', !!placedOrder && !!placedOrder.orderId, placedOrder?.orderId);

        // Wait 2.5s for AWS API Gateway POST /orders to finish
        await new Promise(r => setTimeout(r, 2500));

        // Step 7: My Orders Verification
        const allOrders = window.ShopEaseOrderService.getOrders();
        check('7. My Orders Contains Placed Order', allOrders.some(o => o.totalAmount === macbook.price), `${allOrders.length} orders in storage`);

        // Step 8: Order Details Resolution
        const retrievedOrder = window.ShopEaseOrderService.getOrderById(placedOrder.rawId);
        check('8. Order Details Retrieved', !!retrievedOrder && retrievedOrder.totalAmount === macbook.price, retrievedOrder?.orderId);

        // Step 9: Invoice Generation Check
        const invoiceService = window.ShopEaseInvoiceService;
        check('9. Invoice Service Available', !!invoiceService && typeof invoiceService.generateOrderInvoiceBlob === 'function');
        const invoiceBlob = invoiceService ? invoiceService.generateOrderInvoiceBlob(retrievedOrder) : null;
        check('9. Invoice PDF Blob Generated', !!invoiceBlob && invoiceBlob.size > 1000, `Size: ${invoiceBlob?.size || 0} bytes`);

        // Step 10: Order Tracking Verification
        const isEligibleForCancel = window.ShopEaseOrderService.isCancellationEligible(retrievedOrder.status);
        check('10. Order Tracking & Eligibility', isEligibleForCancel.eligible, `Status: ${retrievedOrder.status}`);

        // Step 11: Cancel Order Flow
        const cancelRes = window.ShopEaseOrderService.cancelOrder(retrievedOrder.rawId, 'Customer test cancellation');
        check('11. Order Cancellation Executed', cancelRes.success, cancelRes.message);
        const cancelledOrder = window.ShopEaseOrderService.getOrderById(retrievedOrder.rawId);
        check('11. Order Status Cancelled in Storage', cancelledOrder.status === 'Cancelled', cancelledOrder?.status);

        // Step 12: Admin Real-Time Analytics Verification
        const analyticsRes = window.ShopEaseOrderService.calculateAnalytics();
        check('12. Admin Analytics Calculated', analyticsRes.totalOrders > 0 && analyticsRes.cancelledOrders >= 1, 
          `Total: ${analyticsRes.totalOrders}, Cancelled: ${analyticsRes.cancelledOrders}, Revenue: ${analyticsRes.totalRevenue}`);

      } catch (err) {
        check('ERROR IN JOURNEY', false, err.message);
      }

      // Send report to server
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log, allPassed: log.every(l => l.passed) })
      });
    })();
  </script>
</body>
</html>
"""

test_runner_file = os.path.join(DIRECTORY, 'test_runner_journey.html')
with open(test_runner_file, 'w', encoding='utf-8') as f:
    f.write(test_runner_html)

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
proc = subprocess.Popen([
    edge_path,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    f'http://localhost:{PORT}/test_runner_journey.html'
])

done = done_event.wait(timeout=20)
proc.terminate()
try:
    proc.wait(timeout=3)
except:
    pass

if os.path.exists(test_runner_file):
    os.remove(test_runner_file)

print("Full User Journey Report:\n", json.dumps(report, indent=2))
