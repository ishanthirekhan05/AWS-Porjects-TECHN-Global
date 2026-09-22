import urllib.request
import urllib.error
import json
import time

base_url = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com'
ts = int(time.time())
test_user = f"user_{ts}"
test_email = f"user_{ts}@shopease.com"
test_pass = "SecurePass123!"

def call_api(method, path, body=None):
    url = base_url + path
    req = urllib.request.Request(url, method=method)
    if body is not None:
        req.data = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode('utf-8', errors='replace')
            return resp.status, json.loads(data)
    except urllib.error.HTTPError as e:
        data = e.read().decode('utf-8', errors='replace')
        try:
            return e.code, json.loads(data)
        except:
            return e.code, data
    except Exception as ex:
        return 0, str(ex)

print("=" * 80)
print("TESTING LIVE AWS BACKEND SCHEMA & END-TO-END FLOW")
print("=" * 80)

# 1. Signup
status, res = call_api('POST', '/users/signup', {
    'name': 'Test Engineer',
    'email': test_email,
    'password': test_pass
})
print(f"[1] POST /users/signup -> Status {status}: {res}")
created_user_id = (res.get('user') or {}).get('userId', test_user) if isinstance(res, dict) else test_user

# 2. Login
status, res = call_api('POST', '/users/login', {
    'email': test_email,
    'password': test_pass
})
print(f"[2] POST /users/login -> Status {status}: {res}")

# 3. GET /users
status, res = call_api('GET', f'/users?userId={created_user_id}')
print(f"[3] GET /users -> Status {status}: {res}")

# 4. PUT /users
status, res = call_api('PUT', '/users', {
    'userId': created_user_id,
    'name': 'Updated Engineer Name',
    'phone': '+91 9876543210'
})
print(f"[4] PUT /users -> Status {status}: {res}")

# 5. POST /cart (userId and productId)
status, res = call_api('POST', '/cart', {
    'userId': created_user_id,
    'productId': 'prod-apple-macbook-air-m2',
    'quantity': 1,
    'price': 89990,
    'name': 'Apple MacBook Air M2'
})
print(f"[5] POST /cart -> Status {status}: {res}")
created_cart_id = (res.get('cart') or res.get('item') or {}).get('cartId', '') if isinstance(res, dict) else ''

# 6. GET /cart
status, res = call_api('GET', f'/cart?userId={created_user_id}')
print(f"[6] GET /cart -> Status {status}: {res}")

# 7. DELETE /cart (try with cartId if returned, or userId)
status, res = call_api('DELETE', f'/cart?cartId={created_cart_id}&userId={created_user_id}')
print(f"[7] DELETE /cart -> Status {status}: {res}")

# 8. POST /wishlist
status, res = call_api('POST', '/wishlist', {
    'userId': created_user_id,
    'productId': 'prod-apple-macbook-air-m2'
})
print(f"[8] POST /wishlist -> Status {status}: {res}")

# 9. GET /wishlist
status, res = call_api('GET', f'/wishlist?userId={created_user_id}')
print(f"[9] GET /wishlist -> Status {status}: {res}")

# 10. POST /reviews (productId and userId required)
status, res = call_api('POST', '/reviews', {
    'productId': 'prod-apple-macbook-air-m2',
    'userId': created_user_id,
    'userName': 'Verified Tester',
    'rating': 5,
    'title': 'Outstanding Laptop',
    'comment': 'Fast delivery and original Apple sealed box.'
})
print(f"[10] POST /reviews -> Status {status}: {res}")

# 11. GET /reviews
status, res = call_api('GET', '/reviews?productId=prod-apple-macbook-air-m2')
print(f"[11] GET /reviews -> Status {status}: {res}")

# 12. POST /tickets
status, res = call_api('POST', '/tickets', {
    'userId': created_user_id,
    'name': 'Verified Tester',
    'email': test_email,
    'category': 'warranty',
    'subject': 'Warranty Certificate Inquiry',
    'message': 'Please share the digital warranty card for my MacBook.'
})
print(f"[12] POST /tickets -> Status {status}: {res}")

# 13. GET /tickets
status, res = call_api('GET', f'/tickets?userId={created_user_id}')
print(f"[13] GET /tickets -> Status {status}: {res}")

# 14. POST /orders
status, res = call_api('POST', '/orders', {
    'userId': created_user_id,
    'orderId': 'SCHEMA-TEST-' + str(int(time.time())),
    'idempotencyKey': 'schema-test-' + str(int(time.time())),
    'items': [
        {
            'productId': 'prod-apple-macbook-air-m2',
            'name': 'Apple MacBook Air M2',
            'price': 89990,
            'quantity': 1
        }
    ],
    'totalAmount': 89990,
    'shippingAddress': {
        'name': 'Verified Tester',
        'address': 'Tech Park 4',
        'city': 'Bengaluru',
        'state': 'Karnataka',
        'pincode': '560001'
    },
    'paymentStatus': 'Paid'
})
print(f"[14] POST /orders -> Status {status}: {res}")

# 15. GET /orders
status, res = call_api('GET', f'/orders?userId={created_user_id}')
print(f"[15] GET /orders -> Status {status}: {res}")

# 16. OPTIONS /orders
status, res = call_api('OPTIONS', '/orders')
print(f"[16] OPTIONS /orders -> Status {status}")

print("=" * 80)
print("TEST RUN COMPLETED")
print("=" * 80)
