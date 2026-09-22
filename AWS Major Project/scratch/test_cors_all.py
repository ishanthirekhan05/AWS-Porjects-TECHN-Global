import urllib.request
import urllib.error

base = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com'
paths = ['/orders', '/users', '/cart', '/wishlist', '/reviews', '/tickets']

print("=" * 70)
print("TESTING CORS (OPTIONS) ACROSS ALL ENDPOINTS")
print("=" * 70)

for p in paths:
    req = urllib.request.Request(base + p, method='OPTIONS')
    req.add_header('Origin', 'http://localhost:8080')
    req.add_header('Access-Control-Request-Method', 'POST')
    try:
        with urllib.request.urlopen(req) as resp:
            headers = dict(resp.headers)
            origin = headers.get('access-control-allow-origin', 'MISSING')
            methods = headers.get('access-control-allow-methods', 'MISSING')
            print(f"[PASS] OPTIONS {p:12} -> {resp.status} | Origin: {origin} | Methods: {methods}")
    except urllib.error.HTTPError as e:
        print(f"[FAIL] OPTIONS {p:12} -> HTTP {e.code}")
    except Exception as e:
        print(f"[ERR ] OPTIONS {p:12} -> {e}")
