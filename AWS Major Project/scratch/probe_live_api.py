import urllib.request
import urllib.error
import json

base_url = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com'
routes = [
    ('GET', '/orders'),
    ('POST', '/orders', {'userId': 'test-probe', 'items': [{'productId': 'P01', 'name': 'Item', 'price': 100, 'quantity': 1}], 'totalAmount': 100}),
    ('GET', '/users'),
    ('POST', '/users/signup', {'name': 'Test', 'email': 'test@test.com'}),
    ('POST', '/users/login', {'email': 'test@test.com'}),
    ('GET', '/cart?userId=test'),
    ('POST', '/cart', {'userId': 'test', 'items': []}),
    ('DELETE', '/cart?userId=test'),
    ('GET', '/wishlist?userId=test'),
    ('POST', '/wishlist', {'userId': 'test', 'items': []}),
    ('GET', '/reviews'),
    ('POST', '/reviews', {'productId': 'P01', 'comment': 'Good'}),
    ('GET', '/tickets'),
    ('POST', '/tickets', {'email': 'test@test.com', 'message': 'Hi'}),
    ('OPTIONS', '/orders')
]

print(f"PROBING LIVE API GATEWAY: {base_url}\n" + "="*70)
for item in routes:
    method = item[0]
    path = item[1]
    body = item[2] if len(item) > 2 else None
    url = base_url + path
    req = urllib.request.Request(url, method=method)
    if body is not None:
        req.data = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"{method:7} {path:22} -> {resp.status} : {resp.read().decode('utf-8', errors='replace')[:100]}")
    except urllib.error.HTTPError as e:
        print(f"{method:7} {path:22} -> HTTP {e.code} : {e.read().decode('utf-8', errors='replace')[:100]}")
    except Exception as ex:
        print(f"{method:7} {path:22} -> ERR : {ex}")
