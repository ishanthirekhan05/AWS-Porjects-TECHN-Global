import requests
import json
import time

BASE_URL = "https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com"
ENDPOINT = f"{BASE_URL}/orders"

print("=" * 80)
print("SHOPEASE AWS BACKEND END-TO-END VERIFICATION (POSTMAN-EQUIVALENT TEST SUITE)")
print("=" * 80)
print(f"Target Base URL: {BASE_URL}")
print(f"Orders Endpoint: {ENDPOINT}")
print("=" * 80)

results = []

def run_test(name, method, url, headers=None, json_data=None, expected_status=None):
    print(f"\n[TEST] {name}")
    print(f"  Request: {method} {url}")
    if headers:
        print(f"  Headers: {json.dumps(headers)}")
    if json_data:
        print(f"  Body: {json.dumps(json_data)}")
    
    start_time = time.time()
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, json=json_data, timeout=10)
        elif method == "OPTIONS":
            resp = requests.options(url, headers=headers, timeout=10)
        elif method == "PUT":
            resp = requests.put(url, headers=headers, json=json_data, timeout=10)
        elif method == "DELETE":
            resp = requests.delete(url, headers=headers, timeout=10)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        duration = round((time.time() - start_time) * 1000, 2)
        print(f"  Response Status: {resp.status_code} ({resp.reason}) [{duration} ms]")
        print(f"  Response Headers:")
        for h in ['apigw-requestid', 'x-amzn-requestid', 'x-amz-apigw-id', 'content-type', 'access-control-allow-origin', 'access-control-allow-methods']:
            if h in resp.headers:
                print(f"    {h}: {resp.headers[h]}")
        
        try:
            body = resp.json()
            print(f"  Response Body (JSON):\n    {json.dumps(body, indent=4)}")
        except:
            body = resp.text
            print(f"  Response Body (Text): {body[:200]}")
        
        passed = (expected_status is None) or (resp.status_code == expected_status)
        status_label = "PASS" if passed else f"FAIL (Expected {expected_status}, got {resp.status_code})"
        print(f"  Result: {status_label}")
        
        results.append({
            "test": name,
            "method": method,
            "url": url,
            "status_code": resp.status_code,
            "duration_ms": duration,
            "apigw_request_id": resp.headers.get("apigw-requestid"),
            "amzn_request_id": resp.headers.get("x-amzn-requestid"),
            "passed": passed,
            "body": body
        })
        return resp
    except Exception as e:
        print(f"  ERROR: {e}")
        results.append({
            "test": name,
            "method": method,
            "url": url,
            "error": str(e),
            "passed": False
        })
        return None

# Test 1: OPTIONS CORS Preflight
run_test(
    name="Test 1: CORS Preflight (OPTIONS /orders)",
    method="OPTIONS",
    url=ENDPOINT,
    headers={
        "Origin": "http://localhost:8989",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
    },
    expected_status=204
)

# Test 2: Valid Order Creation (POST /orders)
valid_order_payload = {
    "userId": "test-user-123",
    "orderId": "POSTMAN-TEST-" + str(int(time.time())),
    "idempotencyKey": "postman-test-" + str(int(time.time())),
    "items": [
        {
            "productId": "P001",
            "name": "Wireless Noise-Canceling Headphones",
            "price": 2999,
            "quantity": 1
        }
    ],
    "totalAmount": 2999,
    "shippingAddress": {
        "name": "Test User",
        "address": "Flat 402, Green Valley",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001"
    },
    "paymentStatus": "Paid"
}

run_test(
    name="Test 2: Valid Order Placement (POST /orders -> Lambda -> DynamoDB)",
    method="POST",
    url=ENDPOINT,
    headers={"Content-Type": "application/json", "Accept": "application/json"},
    json_data=valid_order_payload,
    expected_status=201
)

# Test 3: Error Handling - Missing userId (POST /orders)
invalid_payload_missing_user = {
    "items": [{"productId": "P001", "name": "Item", "price": 500, "quantity": 1}],
    "totalAmount": 500
}

run_test(
    name="Test 3: Error Handling - Missing userId (POST /orders)",
    method="POST",
    url=ENDPOINT,
    headers={"Content-Type": "application/json"},
    json_data=invalid_payload_missing_user,
    expected_status=400
)

# Test 4: Error Handling - Missing items (POST /orders)
invalid_payload_missing_items = {
    "userId": "test-user-123",
    "totalAmount": 500
}

run_test(
    name="Test 4: Error Handling - Missing items (POST /orders)",
    method="POST",
    url=ENDPOINT,
    headers={"Content-Type": "application/json"},
    json_data=invalid_payload_missing_items,
    expected_status=400
)

# Test 5: Error Handling - Empty Request Body (POST /orders)
run_test(
    name="Test 5: Error Handling - Empty Body (POST /orders)",
    method="POST",
    url=ENDPOINT,
    headers={"Content-Type": "application/json"},
    json_data={},
    expected_status=400
)

# Test 6: Route Inspection - GET /orders
run_test(
    name="Test 6: Route Behavior - GET /orders (Unrouted in HTTP API Gateway)",
    method="GET",
    url=ENDPOINT,
    headers={"Accept": "application/json"},
    expected_status=404
)

# Test 7: Route Inspection - GET /orders with Query Parameter
run_test(
    name="Test 7: Route Behavior - GET /orders?userId=test-user-123",
    method="GET",
    url=f"{ENDPOINT}?userId=test-user-123",
    headers={"Accept": "application/json"},
    expected_status=404
)

# Test 8: Method Not Allowed / Unrouted - PUT /orders
run_test(
    name="Test 8: Method Routing - PUT /orders",
    method="PUT",
    url=ENDPOINT,
    headers={"Content-Type": "application/json"},
    json_data={"dummy": "data"},
    expected_status=404
)

# Test 9: Method Not Allowed / Unrouted - DELETE /orders
run_test(
    name="Test 9: Method Routing - DELETE /orders",
    method="DELETE",
    url=ENDPOINT,
    expected_status=404
)

# Summary of Test Execution
print("\n" + "=" * 80)
print("TEST EXECUTION SUMMARY")
print("=" * 80)
all_passed = True
for r in results:
    status = "PASSED" if r.get("passed") else "FAILED"
    if not r.get("passed"):
        all_passed = False
    print(f"[{status}] {r['test']} -> Status {r.get('status_code')} ({r.get('duration_ms', 'N/A')} ms)")

print("=" * 80)
print(f"Overall Result: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
print("=" * 80)
