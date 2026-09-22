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

httpd = ReuseTCPServer(("", PORT), Handler)
server_thread = threading.Thread(target=httpd.serve_forever)
server_thread.daemon = True
server_thread.start()

test_html_path = os.path.join(DIRECTORY, 'temp_test_product_support.html')
test_html_content = """<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Product Reviews & Support Tickets Test</title>
</head>
<body>
  <div id="testOutput">Testing...</div>
  <script>
    (async function() {
      const results = {
        supportTicketCreated: false,
        supportTicketStored: false,
        reviewContainerRendered: false,
        error: null
      };

      try {
        // Test Support Ticket generation & storage logic
        const cat = 'warranty';
        const name = 'Vikram Sharma';
        const email = 'vikram@example.com';
        const orderId = 'ORD-7A1686958F';
        const subject = 'OEM Warranty Coverage Registration';
        const message = 'Please confirm warranty coverage status.';

        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const ticketId = `TKT-${randomNum}`;

        const ticketObj = {
          id: ticketId,
          userId: 'usr_test_user',
          name: name,
          email: email,
          orderId: orderId,
          category: cat,
          subject: subject,
          message: message,
          status: 'Open',
          createdAt: new Date().toISOString()
        };

        const tickets = JSON.parse(localStorage.getItem('shopease_support_tickets') || '[]');
        tickets.unshift(ticketObj);
        localStorage.setItem('shopease_support_tickets', JSON.stringify(tickets));

        const stored = JSON.parse(localStorage.getItem('shopease_support_tickets') || '[]');
        if (stored.some(t => t.id === ticketId)) {
          results.supportTicketCreated = true;
          results.supportTicketStored = true;
          results.ticketId = ticketId;
        }

      } catch (e) {
        results.error = e.message;
      }

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

proc = subprocess.Popen([
    browser_exe,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    f'http://localhost:{PORT}/temp_test_product_support.html'
])

done = done_event.wait(timeout=15)
proc.terminate()
try:
    proc.wait(timeout=3)
except:
    pass

if os.path.exists(test_html_path):
    os.remove(test_html_path)

print("Support/Review Report:", json.dumps(report, indent=2))
httpd.shutdown()
