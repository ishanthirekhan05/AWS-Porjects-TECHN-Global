import urllib.request
import urllib.error
import json

def test_delete(name, url, body=None):
    req = urllib.request.Request(url, method='DELETE')
    if body:
        req.data = json.dumps(body).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"{name} SUCCESS: {resp.status} - {resp.read().decode('utf-8')}")
    except urllib.error.HTTPError as e:
        print(f"{name} HTTP {e.code}: {e.read().decode('utf-8')}")
    except Exception as ex:
        print(f"{name} ERR: {ex}")

# 1. DELETE with cartId in query string
test_delete("Query cartId", "https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com/cart?cartId=CART-D08D66A1A1")

# 2. DELETE with cartId in query and userId
test_delete("Query cartId + userId", "https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com/cart?cartId=CART-D08D66A1A1&userId=USR-3D12A9E7D4")

# 3. DELETE with cartId in body
test_delete("Body cartId", "https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com/cart", {"cartId": "CART-D08D66A1A1"})

# 4. DELETE with cartId & userId in body
test_delete("Body cartId + userId", "https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com/cart", {"cartId": "CART-D08D66A1A1", "userId": "USR-3D12A9E7D4"})
