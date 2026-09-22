import urllib.request
import urllib.error
import json
import time

BASE_URL = 'https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com'

def run_live_tests():
    uid = f"usr_live_{int(time.time())}"
    test_email = f"user_{int(time.time())}@shopease.com"
    pid = "P01"

    test_cases = [
        # --- ORDERS (Working - Must Not Break) ---
        ('GET', '/orders', None, [200]),
        ('POST', '/orders', {
            'userId': uid,
            'items': [{'id': pid, 'name': 'Verified Test Item', 'price': 999, 'quantity': 1}],
            'totalAmount': 999
        }, [200, 201]),

        # --- USERS ---
        ('POST', '/users/signup', {
            'name': 'API Route Verifier',
            'email': test_email,
            'id': uid
        }, [200, 201]),
        ('POST', '/users/login', {
            'email': test_email
        }, [200]),
        ('GET', f'/users?userId={uid}', None, [200]),
        ('PUT', '/users', {
            'userId': uid,
            'phone': '9876543210',
            'gender': 'Other'
        }, [200]),

        # --- CART ---
        ('POST', '/cart', {
            'userId': uid,
            'productId': pid,
            'quantity': 2,
            'price': 499,
            'name': 'Cart Probe Item'
        }, [200]),
        ('GET', f'/cart?userId={uid}', None, [200]),
        ('DELETE', '/cart', {
            'userId': uid,
            'productId': pid
        }, [200, 204]),

        # --- REVIEWS ---
        ('POST', '/reviews', {
            'productId': pid,
            'userId': uid,
            'name': 'API Tester',
            'rating': 5,
            'title': 'Great Quality',
            'comment': 'Item matches live description perfectly.'
        }, [200, 201]),
        ('GET', '/reviews', None, [200]),
        ('GET', f'/reviews?productId={pid}', None, [200]),

        # --- TICKETS / SUPPORT ---
        ('POST', '/tickets', {
            'userId': uid,
            'email': test_email,
            'subject': 'Live Route Validation',
            'message': 'Testing automated support pipeline'
        }, [200, 201]),
        ('GET', '/tickets', None, [200]),
        ('GET', f'/tickets?userId={uid}', None, [200]),

        # --- WISHLIST ---
        ('POST', '/wishlist', {
            'userId': uid,
            'productId': pid,
            'product': {'id': pid, 'name': 'Wishlist Probe Item', 'price': 999}
        }, [200, 201]),
        ('GET', f'/wishlist?userId={uid}', None, [200]),
        ('DELETE', '/wishlist', {
            'userId': uid,
            'productId': pid
        }, [200, 204])
    ]

    print(f"\n{'METHOD':7} {'ROUTE / PATH':38} {'STATUS':8} {'EXPECTED':10} {'RESULT'}")
    print("=" * 75)

    results = []
    for method, path, body, expected in test_cases:
        url = BASE_URL + path
        data_bytes = json.dumps(body).encode('utf-8') if body else None
        req = urllib.request.Request(url, data=data_bytes, method=method)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Accept', 'application/json')

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                raw = resp.read().decode('utf-8', errors='replace')
                passed = status in expected
                tag = "PASS" if passed else "FAIL"
                print(f"{method:7} {path:38} {status:<8} {str(expected):<10} {tag}")
                results.append((method, path, status, expected, passed, raw))
        except urllib.error.HTTPError as e:
            status = e.code
            raw = e.read().decode('utf-8', errors='replace')
            passed = status in expected
            tag = "PASS" if passed else "FAIL"
            print(f"{method:7} {path:38} {status:<8} {str(expected):<10} {tag} -> {raw[:60]}")
            results.append((method, path, status, expected, passed, raw))
        except Exception as ex:
            print(f"{method:7} {path:38} ERR      {str(expected):<10} FAIL -> {ex}")
            results.append((method, path, 0, expected, False, str(ex)))

    total = len(results)
    passed_count = sum(1 for r in results if r[4])
    failed_count = total - passed_count
    print("=" * 75)
    print(f"TOTAL: {total} | PASSED: {passed_count} | FAILED: {failed_count}\n")
    return failed_count == 0

if __name__ == '__main__':
    run_live_tests()
