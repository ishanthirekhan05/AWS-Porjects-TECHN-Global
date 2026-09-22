"""
ShopEase Serverless Multi-Route Backend
AWS Lambda Handler for API Gateway (HTTP API / REST API)
Handles:
  - Orders          -> DynamoDB table: ShopEaseOrder
  - Users           -> DynamoDB table: ShopEaseUsers
  - Cart            -> DynamoDB table: ShopEaseCart
  - Wishlist        -> DynamoDB table: ShopEaseWishlist
  - Reviews         -> DynamoDB table: ShopEaseReviews
  - Support Tickets -> DynamoDB table: ShopEaseSupportTickets
"""

import json
import os
import uuid
import time
import hashlib
import secrets
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

# Initialize DynamoDB resource
REGION = os.environ.get('AWS_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb', region_name=REGION)

TABLE_ORDERS = os.environ.get('TABLE_ORDERS', 'ShopEaseOrder')
TABLE_USERS = os.environ.get('TABLE_USERS', 'ShopEaseUsers')
TABLE_CART = os.environ.get('TABLE_CART', 'ShopEaseCart')
TABLE_WISHLIST = os.environ.get('TABLE_WISHLIST', 'ShopEaseWishlist')
TABLE_REVIEWS = os.environ.get('TABLE_REVIEWS', 'ShopEaseReviews')
TABLE_TICKETS = os.environ.get('TABLE_TICKETS', 'ShopEaseSupportTickets')
RESET_TOKEN_TTL_SECONDS = 15 * 60
RESET_EMAIL_FROM = os.environ.get('SHOPEASE_RESET_EMAIL_FROM', '')
RESET_FRONTEND_URL = os.environ.get('SHOPEASE_RESET_FRONTEND_URL', 'http://localhost:8989/login.html')
ses = boto3.client('ses', region_name=REGION)

ADMIN_USER_IDS = {
    value.strip() for value in os.environ.get('SHOPEASE_ADMIN_USER_IDS', '').split(',') if value.strip()
}
ADMIN_EMAILS = {
    value.strip().lower() for value in os.environ.get('SHOPEASE_ADMIN_EMAILS', '').split(',') if value.strip()
}

def resolve_user_role(user):
    """Resolve admin access from a server-side allowlist, never request input."""
    if not user:
        return 'customer'
    user_id = str(user.get('userId') or user.get('id') or '').strip()
    email = str(user.get('email') or '').strip().lower()
    return 'admin' if user_id in ADMIN_USER_IDS or email in ADMIN_EMAILS else 'customer'

def hash_reset_token(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'http://shopease-frontend-2026-ishant.s3-website-us-east-1.amazonaws.com',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With'
}

class DecimalEncoder(json.JSONEncoder):
    """Encodes DynamoDB Decimal types to standard int/float for JSON serialization."""
    def default(self, o):
        if isinstance(o, Decimal):
            if o % 1 == 0:
                return int(o)
            return float(o)
        return super(DecimalEncoder, self).default(o)

def build_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def convert_floats_to_decimals(obj):
    """DynamoDB requires Decimal instead of float."""
    if isinstance(obj, list):
        return [convert_floats_to_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj

def lambda_handler(event, context):
    aws_request_id = getattr(context, 'aws_request_id', None) if context else None
    trace_id = aws_request_id or event.get('requestContext', {}).get('requestId') or 'unknown'
    # Handle CORS preflight requests
    http_method = event.get('requestContext', {}).get('http', {}).get('method') or event.get('httpMethod', 'GET')
    if http_method.upper() == 'OPTIONS':
        return {
            'statusCode': 204,
            'headers': CORS_HEADERS,
            'body': ''
        }

    # Extract raw path or routeKey
    raw_path = event.get('rawPath') or event.get('path') or ''
    # Normalize route path (strip trailing slash)
    path = raw_path.rstrip('/')
    if not path:
        path = '/'

    # Extract query parameters
    query_params = event.get('queryStringParameters') or {}

    # Extract and parse request body
    body = {}
    raw_body = event.get('body')
    if raw_body:
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

    method = http_method.upper()

    try:
        # =========================================================================
        # 1. ORDERS API -> ShopEaseOrder
        # =========================================================================
        # =========================================================================
        # 1. ORDERS API -> ShopEaseOrder
        # =========================================================================
        if path.startswith('/orders') or path in ['/returns', '/warranty']:
            table = dynamodb.Table(TABLE_ORDERS)

            # --- Cancellation Handler ---
            is_cancel_action = (
                (path == '/orders/cancel') or
                (body.get('action') in ['cancel', 'cancelOrder', 'cancel_order']) or
                (body.get('status') == 'Cancelled' and (body.get('orderId') or query_params.get('orderId')))
            )
            if is_cancel_action and method in ['POST', 'PUT', 'PATCH']:
                order_id = body.get('orderId') or query_params.get('orderId')
                if not order_id:
                    return build_response(400, {'success': False, 'message': 'orderId is required for cancellation'})

                clean_id = str(order_id).replace('#', '').strip()
                res = table.get_item(Key={'orderId': clean_id})
                item = res.get('Item')
                if not item:
                    res = table.get_item(Key={'orderId': f"#{clean_id}"})
                    item = res.get('Item')
                if not item:
                    scan_res = table.scan(FilterExpression=Attr('orderId').eq(clean_id) | Attr('orderId').eq(f"#{clean_id}"))
                    items_found = scan_res.get('Items', [])
                    if items_found:
                        item = items_found[0]

                if not item:
                    return build_response(404, {'success': False, 'message': f'Order {order_id} not found'})

                current_status = str(item.get('status', '')).strip().lower()
                if current_status == 'cancelled':
                    return build_response(200, {
                        'success': True,
                        'message': f'Order {order_id} is already cancelled.',
                        'idempotent': True,
                        'order': item
                    })

                if any(s in current_status for s in ['transit', 'shipped', 'out for delivery', 'delivered']):
                    return build_response(400, {
                        'success': False,
                        'error': f"Order {order_id} cannot be cancelled as it is already '{item.get('status')}'. You may initiate a return or replacement once delivered."
                    })

                user_id = body.get('userId')
                if user_id and str(user_id) not in ['guest', 'test-user-123']:
                    order_user = str(item.get('userId', ''))
                    if order_user and order_user != str(user_id):
                        return build_response(403, {'success': False, 'error': 'Access Denied: You do not own this order.'})

                now_iso = datetime.now(timezone.utc).isoformat()
                reason = body.get('cancellationReason') or body.get('reason') or 'Customer requested cancellation'
                notes = body.get('cancellationNotes') or body.get('notes') or ''

                payment_status = str(item.get('paymentStatus', 'Paid')).lower()
                is_cod = 'cash' in payment_status or 'cod' in payment_status
                refund_status = 'Not Applicable (COD)' if is_cod else 'Refund Processing'
                refund_amount = Decimal('0') if is_cod else (item.get('totalAmount') or item.get('total', 0))

                item['status'] = 'Cancelled'
                item['cancellationReason'] = reason
                item['cancellationNotes'] = notes
                item['cancelledAt'] = now_iso
                item['updatedAt'] = now_iso
                item['refundStatus'] = refund_status
                item['refundAmount'] = convert_floats_to_decimals(refund_amount)

                table.put_item(Item=convert_floats_to_decimals(item))
                return build_response(200, {
                    'success': True,
                    'message': f'Order {order_id} cancelled successfully',
                    'order': item
                })

            # --- Return / Replacement Handler ---
            is_return_action = (
                (path in ['/returns', '/orders/return']) or
                (body.get('action') in ['return', 'requestReturn', 'request_return'])
            )
            if is_return_action and method in ['POST', 'PUT']:
                order_id = body.get('orderId') or query_params.get('orderId')
                if not order_id:
                    return build_response(400, {'success': False, 'message': 'orderId is required for return request'})

                clean_id = str(order_id).replace('#', '').strip()
                res = table.get_item(Key={'orderId': clean_id})
                item = res.get('Item')
                if not item:
                    res = table.get_item(Key={'orderId': f"#{clean_id}"})
                    item = res.get('Item')
                if not item:
                    scan_res = table.scan(FilterExpression=Attr('orderId').eq(clean_id) | Attr('orderId').eq(f"#{clean_id}"))
                    items_found = scan_res.get('Items', [])
                    if items_found:
                        item = items_found[0]

                if not item:
                    return build_response(404, {'success': False, 'message': f'Order {order_id} not found'})

                current_status = str(item.get('status', '')).strip().lower()
                if current_status == 'cancelled':
                    return build_response(400, {'success': False, 'error': f'Order {order_id} was cancelled and is not eligible for return.'})

                if item.get('returnStatus'):
                    return build_response(400, {
                        'success': False,
                        'error': f"A return request has already been submitted for Order {order_id} (RMA: {item.get('rmaCode', '--')})."
                    })

                now_iso = datetime.now(timezone.utc).isoformat()
                return_type = body.get('returnType') or body.get('actionType') or 'RETURN_REFUND'
                return_reason = body.get('returnReason') or body.get('reason') or 'Customer return request'
                return_notes = body.get('returnNotes') or body.get('notes') or body.get('remarks') or ''
                rma_code = f"RMA-{clean_id.replace('-', '')[:8]}-{uuid.uuid4().hex[:6].upper()}"

                status_label = 'Replacement Requested' if return_type in ['REPLACE', 'replacement'] else 'Return & Refund Requested'

                item['returnStatus'] = status_label
                item['returnType'] = return_type
                item['returnReason'] = return_reason
                item['returnNotes'] = return_notes
                item['returnRequestedAt'] = now_iso
                item['rmaCode'] = rma_code
                item['updatedAt'] = now_iso

                table.put_item(Item=convert_floats_to_decimals(item))

                # Also record a support ticket in ShopEaseSupportTickets
                try:
                    ticket_table = dynamodb.Table(TABLE_TICKETS)
                    ticket_item = {
                        'ticketId': f"TKT-RET-{uuid.uuid4().hex[:6].upper()}",
                        'id': rma_code,
                        'userId': str(item.get('userId', 'customer')),
                        'email': body.get('email') or (item.get('customer') and item.get('customer').get('email')) or 'customer@shopease.com',
                        'orderId': clean_id,
                        'category': 'return',
                        'subject': f"Return / Replacement for Order #{clean_id}",
                        'message': f"Reason: {return_reason}. Notes: {return_notes}. Type: {return_type}. RMA: {rma_code}",
                        'status': 'Open',
                        'createdAt': now_iso,
                        'updatedAt': now_iso
                    }
                    ticket_table.put_item(Item=ticket_item)
                except Exception as ex:
                    print(f"Non-critical ticket logging notice: {ex}")

                return build_response(200, {
                    'success': True,
                    'message': f"Return request initiated successfully for Order {order_id}",
                    'rmaCode': rma_code,
                    'order': item
                })

            # --- Warranty Claim Handler ---
            is_warranty_action = (
                (path in ['/warranty', '/orders/warranty']) or
                (body.get('action') in ['warranty', 'warrantyClaim', 'claimWarranty'])
            )
            if is_warranty_action and method in ['POST', 'PUT']:
                order_id = body.get('orderId') or query_params.get('orderId') or body.get('serial')
                if not order_id:
                    return build_response(400, {'success': False, 'message': 'orderId or serial is required for warranty claim'})

                clean_id = str(order_id).replace('#', '').strip()
                res = table.get_item(Key={'orderId': clean_id})
                item = res.get('Item')
                if not item:
                    res = table.get_item(Key={'orderId': f"#{clean_id}"})
                    item = res.get('Item')
                if not item:
                    scan_res = table.scan(FilterExpression=Attr('orderId').eq(clean_id) | Attr('orderId').eq(f"#{clean_id}"))
                    items_found = scan_res.get('Items', [])
                    if items_found:
                        item = items_found[0]

                if not item:
                    return build_response(404, {'success': False, 'message': f'Order {order_id} not found'})

                current_status = str(item.get('status', '')).strip().lower()
                if current_status == 'cancelled':
                    return build_response(400, {'success': False, 'error': f'Warranty Inactive: Order #{clean_id} was cancelled.'})

                now_iso = datetime.now(timezone.utc).isoformat()
                claim_id = f"WAR-CLAIM-{uuid.uuid4().hex[:6].upper()}"
                prod_name = body.get('productName') or (item.get('items') and item['items'][0].get('name')) or 'Purchased Item'
                brand = body.get('brand') or (item.get('items') and item['items'][0].get('brand')) or 'Official'

                claim_record = {
                    'claimId': claim_id,
                    'status': 'Claim Registered',
                    'productName': prod_name,
                    'brand': brand,
                    'orderId': clean_id,
                    'createdAt': now_iso
                }
                item['warrantyClaim'] = claim_record
                item['updatedAt'] = now_iso
                table.put_item(Item=convert_floats_to_decimals(item))

                # Log ticket in ShopEaseSupportTickets
                try:
                    ticket_table = dynamodb.Table(TABLE_TICKETS)
                    ticket_item = {
                        'ticketId': claim_id,
                        'id': claim_id,
                        'userId': str(item.get('userId', 'customer')),
                        'email': body.get('email') or (item.get('customer') and item.get('customer').get('email')) or 'customer@shopease.com',
                        'orderId': clean_id,
                        'category': 'warranty',
                        'subject': f"Warranty Claim for {prod_name} (Order #{clean_id})",
                        'message': f"Claim ID: {claim_id}. Product: {prod_name}. Brand: {brand}.",
                        'status': 'Open',
                        'createdAt': now_iso,
                        'updatedAt': now_iso
                    }
                    ticket_table.put_item(Item=ticket_item)
                except Exception as ex:
                    print(f"Non-critical ticket logging notice: {ex}")

                return build_response(200, {
                    'success': True,
                    'message': 'Warranty claim registered successfully',
                    'claimId': claim_id,
                    'claim': claim_record,
                    'order': item
                })

            # --- Standard Order Creation ---
            if method == 'POST':
                user_id = body.get('userId')
                items = body.get('items')
                if not user_id or not items or not isinstance(items, list):
                    return build_response(400, {
                        'success': False,
                        'message': 'userId and items are required'
                    })

                requested_order_id = str(body.get('orderId') or '').replace('#', '').strip()
                idempotency_key = str(body.get('idempotencyKey') or '').strip()
                if not requested_order_id or not idempotency_key:
                    return build_response(400, {
                        'success': False,
                        'message': 'orderId and idempotencyKey are required for order creation'
                    })
                order_id = requested_order_id
                idempotency_marker_id = 'IDEMPOTENCY#' + hashlib.sha256(idempotency_key.encode('utf-8')).hexdigest()
                print(json.dumps({
                    'event': 'order_create_attempt',
                    'requestId': trace_id,
                    'orderId': order_id,
                    'idempotencyKey': idempotency_key,
                    'userId': str(user_id)
                }))
                now_iso = datetime.now(timezone.utc).isoformat()

                total_amount = body.get('totalAmount') or body.get('total', 0)
                shipping_address = body.get('shippingAddress') or {}
                payment_status = body.get('paymentStatus', 'Paid')
                payment_method = body.get('paymentMethod') or ''
                payment_type = body.get('paymentType') or ''

                order_item = {
                    'orderId': order_id,
                    'userId': str(user_id),
                    'items': convert_floats_to_decimals(items),
                    'totalAmount': convert_floats_to_decimals(total_amount),
                    'shippingAddress': shipping_address,
                    'status': 'Confirmed',
                    'paymentStatus': payment_status,
                    'paymentMethod': payment_method,
                    'paymentType': payment_type,
                    'paymentId': body.get('paymentId') or None,
                    'idempotencyKey': idempotency_key or order_id,
                    'createdAt': now_iso,
                    'updatedAt': now_iso
                }
                request_fingerprint = hashlib.sha256(json.dumps({
                    'userId': str(user_id),
                    'items': items,
                    'totalAmount': total_amount,
                    'shippingAddress': shipping_address,
                    'paymentStatus': payment_status,
                    'paymentMethod': payment_method,
                    'paymentType': payment_type,
                    'paymentId': body.get('paymentId')
                }, sort_keys=True, default=str).encode('utf-8')).hexdigest()
                idempotency_marker = {
                    'orderId': idempotency_marker_id,
                    'recordType': 'OrderIdempotencyKey',
                    'idempotencyKey': idempotency_key,
                    'canonicalOrderId': order_id,
                    'requestFingerprint': request_fingerprint,
                    'createdAt': now_iso
                }

                try:
                    table.meta.client.transact_write_items(TransactItems=[
                        {
                            'Put': {
                                'TableName': TABLE_ORDERS,
                                'Item': convert_floats_to_decimals(order_item),
                                'ConditionExpression': 'attribute_not_exists(orderId)'
                            }
                        },
                        {
                            'Put': {
                                'TableName': TABLE_ORDERS,
                                'Item': convert_floats_to_decimals(idempotency_marker),
                                'ConditionExpression': 'attribute_not_exists(orderId)'
                            }
                        }
                    ])
                    print(json.dumps({
                        'event': 'order_create_committed',
                        'requestId': trace_id,
                        'orderId': order_id,
                        'idempotencyKey': idempotency_key,
                        'dynamodbWrites': 2
                    }))
                except ClientError as error:
                    error_code = error.response.get('Error', {}).get('Code')
                    if error_code not in ['ConditionalCheckFailedException', 'TransactionCanceledException']:
                        raise
                    marker = table.get_item(Key={'orderId': idempotency_marker_id}, ConsistentRead=True).get('Item')
                    if marker and marker.get('canonicalOrderId'):
                        existing = table.get_item(Key={'orderId': marker['canonicalOrderId']}, ConsistentRead=True).get('Item')
                        if existing:
                            print(json.dumps({
                                'event': 'order_create_idempotent_replay',
                                'requestId': trace_id,
                                'orderId': marker['canonicalOrderId'],
                                'idempotencyKey': idempotency_key,
                                'dynamodbWrites': 0
                            }))
                            return build_response(200, {
                                'success': True,
                                'message': 'Order already exists; returning the canonical order.',
                                'idempotent': True,
                                'order': existing
                            })
                    existing = table.get_item(Key={'orderId': order_id}, ConsistentRead=True).get('Item')
                    if existing:
                        return build_response(409, {
                            'success': False,
                            'message': 'orderId is already assigned to a different order'
                        })
                    if error_code == 'TransactionCanceledException':
                        return build_response(409, {
                            'success': False,
                            'message': 'Order creation was already accepted with a different canonical orderId'
                        })
                    raise
                return build_response(201, {
                    'success': True,
                    'message': 'Order created successfully',
                    'order': order_item
                })

            elif method == 'GET':
                user_id = query_params.get('userId')
                order_id = query_params.get('orderId')

                if order_id:
                    clean_id = str(order_id).replace('#', '').strip()
                    res = table.get_item(Key={'orderId': clean_id})
                    item = res.get('Item')
                    if not item:
                        res = table.get_item(Key={'orderId': f"#{clean_id}"})
                        item = res.get('Item')
                    if not item:
                        scan_res = table.scan(FilterExpression=Attr('orderId').eq(clean_id) | Attr('orderId').eq(f"#{clean_id}"))
                        items_found = scan_res.get('Items', [])
                        if items_found:
                            item = items_found[0]

                    if not item:
                        return build_response(404, {'success': False, 'message': 'Order not found'})
                    return build_response(200, {'success': True, 'order': item})

                if user_id:
                    scan_res = table.scan(
                        FilterExpression=Attr('userId').eq(str(user_id))
                    )
                    orders = scan_res.get('Items', [])
                    return build_response(200, {'success': True, 'orders': orders})

                # If no param, return recent orders scan
                scan_res = table.scan(Limit=50)
                return build_response(200, {'success': True, 'orders': scan_res.get('Items', [])})

        # =========================================================================
        # 2. USERS API -> ShopEaseUsers
        # =========================================================================
        if path.startswith('/users'):
            table = dynamodb.Table(TABLE_USERS)

            # Signup
            if path in ['/users/signup', '/users'] and method == 'POST':
                email = (body.get('email') or '').strip().lower()
                name = (body.get('name') or '').strip()
                user_id = body.get('id') or body.get('userId') or f"usr_{int(time.time())}_{uuid.uuid4().hex[:6]}"

                if not email or not name:
                    return build_response(400, {'success': False, 'error': 'Name and email are required'})

                # Check if email already registered
                scan_res = table.scan(FilterExpression=Attr('email').eq(email))
                if scan_res.get('Items'):
                    return build_response(409, {'success': False, 'error': 'Account with this email already exists.'})

                now_iso = datetime.now(timezone.utc).isoformat()
                user_record = {
                    'userId': user_id,
                    'id': user_id,
                    'name': name,
                    'email': email,
                    'phone': body.get('phone', ''),
                    'dob': body.get('dob', ''),
                    'gender': body.get('gender', ''),
                    'role': 'customer',
                    'passwordHash': body.get('passwordHash', ''),
                    'salt': body.get('salt', ''),
                    'createdAt': now_iso,
                    'updatedAt': now_iso,
                    'addresses': convert_floats_to_decimals(body.get('addresses', []))
                }

                table.put_item(Item=user_record)
                return build_response(201, {'success': True, 'user': user_record})

            # Password reset request: always return the same response to avoid account enumeration.
            if path == '/users/password-reset/request' and method == 'POST':
                email = (body.get('email') or '').strip().lower()
                if not RESET_EMAIL_FROM:
                    return build_response(503, {'success': False, 'error': 'Password reset service is unavailable.'})
                scan_res = table.scan(FilterExpression=Attr('email').eq(email)) if email else {'Items': []}
                user = (scan_res.get('Items') or [None])[0]
                if user and RESET_EMAIL_FROM:
                    reset_token = secrets.token_urlsafe(32)
                    token_hash = hash_reset_token(reset_token)
                    expires_at = int(time.time()) + RESET_TOKEN_TTL_SECONDS
                    table.update_item(
                        Key={'userId': user.get('userId') or user.get('id')},
                        UpdateExpression='SET resetTokenHash = :token_hash, resetTokenExpiresAt = :expires_at',
                        ExpressionAttributeValues={':token_hash': token_hash, ':expires_at': expires_at}
                    )
                    reset_url = f"{RESET_FRONTEND_URL}?reset={reset_token}"
                    try:
                        ses.send_email(
                            Source=RESET_EMAIL_FROM,
                            Destination={'ToAddresses': [email]},
                            Message={
                                'Subject': {'Data': 'ShopEase password reset'},
                                'Body': {'Text': {'Data': f"Use this link within 15 minutes to reset your ShopEase password:\n\n{reset_url}\n\nThis link can be used once."}}
                            }
                        )
                    except ClientError:
                        return build_response(503, {'success': False, 'error': 'Password reset service is unavailable.'})
                return build_response(200, {'success': True, 'message': 'If an account exists for that email, a reset link has been sent.'})

            # Password reset confirmation: validate a hashed, expiring, single-use token server-side.
            if path == '/users/password-reset/confirm' and method == 'POST':
                reset_token = str(body.get('token') or '')
                new_password = str(body.get('password') or '')
                if len(reset_token) < 32 or len(new_password) < 6:
                    return build_response(400, {'success': False, 'error': 'Invalid or expired reset request.'})

                token_hash = hash_reset_token(reset_token)
                scan_res = table.scan(FilterExpression=Attr('resetTokenHash').eq(token_hash))
                user = (scan_res.get('Items') or [None])[0]
                now = int(time.time())
                if not user or int(user.get('resetTokenExpiresAt') or 0) <= now:
                    return build_response(400, {'success': False, 'error': 'Invalid or expired reset request.'})

                new_salt = secrets.token_hex(16)
                new_hash = hashlib.sha256(f'{new_salt}:{new_password}'.encode('utf-8')).hexdigest()
                try:
                    table.update_item(
                        Key={'userId': user.get('userId') or user.get('id')},
                        UpdateExpression='SET passwordHash = :password_hash, salt = :salt REMOVE resetTokenHash, resetTokenExpiresAt',
                        ConditionExpression='resetTokenHash = :token_hash AND resetTokenExpiresAt > :now',
                        ExpressionAttributeValues={':password_hash': new_hash, ':salt': new_salt, ':token_hash': token_hash, ':now': now}
                    )
                except ClientError:
                    return build_response(400, {'success': False, 'error': 'Invalid or expired reset request.'})
                return build_response(200, {'success': True, 'message': 'Password reset successfully.'})

            # Login verification
            if path == '/users/login' and method == 'POST':
                email = (body.get('email') or '').strip().lower()
                password = body.get('password') or ''
                if not email:
                    return build_response(400, {'success': False, 'error': 'Email is required'})

                scan_res = table.scan(FilterExpression=Attr('email').eq(email))
                items = scan_res.get('Items', [])
                if not items:
                    return build_response(404, {'success': False, 'error': 'User not found'})

                stored_user = items[0]
                stored_salt = str(stored_user.get('salt') or '')
                stored_hash = str(stored_user.get('passwordHash') or '')
                computed_hash = hashlib.sha256(f'{stored_salt}:{password}'.encode('utf-8')).hexdigest()
                if not password or not stored_salt or not stored_hash or computed_hash != stored_hash:
                    return build_response(401, {'success': False, 'error': 'Invalid email or password'})

                user = {**stored_user, 'role': resolve_user_role(stored_user)}
                return build_response(200, {'success': True, 'user': user})

            # Get User Profile
            if method == 'GET':
                user_id = query_params.get('userId') or query_params.get('id')
                if not user_id:
                    parts = path.split('/')
                    if len(parts) > 2 and parts[2] not in ['signup', 'login', 'update']:
                        user_id = parts[2]

                if not user_id:
                    email_param = query_params.get('email')
                    if email_param:
                        scan_res = table.scan(FilterExpression=Attr('email').eq(email_param.strip().lower()))
                        items = scan_res.get('Items', [])
                        if items:
                            user = {**items[0], 'role': resolve_user_role(items[0])}
                            return build_response(200, {'success': True, 'user': user})
                        return build_response(404, {'success': False, 'error': 'User not found'})

                    scan_res = table.scan(Limit=50)
                    users = [{**user, 'role': resolve_user_role(user)} for user in scan_res.get('Items', [])]
                    return build_response(200, {'success': True, 'users': users})

                res = table.get_item(Key={'userId': user_id})
                user = res.get('Item')
                if not user:
                    scan_res = table.scan(FilterExpression=Attr('userId').eq(user_id) | Attr('id').eq(user_id))
                    items = scan_res.get('Items', [])
                    if items:
                        user = items[0]

                if not user:
                    return build_response(404, {'success': False, 'error': 'User not found'})

                user = {**user, 'role': resolve_user_role(user)}
                return build_response(200, {'success': True, 'user': user})

            # Update Profile
            if method in ['PUT', 'POST'] and (path == '/users/update' or path == '/users'):
                user_id = body.get('userId') or body.get('id')
                if not user_id:
                    return build_response(400, {'success': False, 'error': 'userId is required'})

                now_iso = datetime.now(timezone.utc).isoformat()
                res = table.get_item(Key={'userId': user_id})
                existing = res.get('Item', {})

                safe_updates = {key: value for key, value in body.items() if key != 'role'}
                updated_user = {
                    **existing,
                    **safe_updates,
                    'userId': user_id,
                    'id': user_id,
                    'role': resolve_user_role(existing),
                    'updatedAt': now_iso
                }
                table.put_item(Item=convert_floats_to_decimals(updated_user))
                return build_response(200, {'success': True, 'user': updated_user})

        # =========================================================================
        # 3. CART API -> ShopEaseCart
        # =========================================================================
        if path == '/cart':
            table = dynamodb.Table(TABLE_CART)
            dynamodb_client = boto3.client('dynamodb', region_name=REGION)

            if method == 'GET':
                user_id = query_params.get('userId') or query_params.get('id')
                if not user_id:
                    return build_response(400, {'success': False, 'message': 'userId is required'})

                scan_res = table.scan(FilterExpression=Attr('userId').eq(str(user_id)))
                cart_items = scan_res.get('Items', [])
                return build_response(200, {
                    'success': True,
                    'cart': cart_items,
                    'items': cart_items
                })

            elif method == 'POST':
                user_id = body.get('userId')
                product_id = body.get('productId')
                items = body.get('items')

                if not user_id:
                    return build_response(400, {'success': False, 'message': 'userId is required'})

                now_iso = datetime.now(timezone.utc).isoformat()

                if product_id:
                    clean_uuid = uuid.uuid4().hex[:10].upper()
                    cart_id = body.get('cartId') or f"CART-{clean_uuid}"
                    quantity = body.get('quantity', 1)
                    product_obj = body.get('product', {})
                    if not isinstance(product_obj, dict):
                        product_obj = {}

                    record = {
                        'cartId': str(cart_id),
                        'userId': str(user_id),
                        'productId': str(product_id),
                        'product': convert_floats_to_decimals(product_obj),
                        'quantity': convert_floats_to_decimals(quantity),
                        'updatedAt': now_iso
                    }
                    if 'name' in body:
                        record['name'] = body['name']
                    if 'price' in body:
                        record['price'] = convert_floats_to_decimals(body['price'])

                    table.put_item(Item=record)
                    return build_response(200, {
                        'success': True,
                        'message': 'Cart updated successfully',
                        'item': record
                    })
                elif items is not None and isinstance(items, list):
                    for item in items:
                        p_id = item.get('id') or item.get('productId')
                        if p_id:
                            c_id = item.get('cartId') or f"CART-{uuid.uuid4().hex[:10].upper()}"
                            table.put_item(Item={
                                'cartId': c_id,
                                'userId': str(user_id),
                                'productId': str(p_id),
                                'product': convert_floats_to_decimals(item),
                                'quantity': convert_floats_to_decimals(item.get('quantity', 1)),
                                'name': item.get('name', ''),
                                'price': convert_floats_to_decimals(item.get('price', 0)),
                                'updatedAt': now_iso
                            })
                    return build_response(200, {
                        'success': True,
                        'userId': user_id,
                        'items': items
                    })
                else:
                    return build_response(400, {'success': False, 'message': 'userId and productId are required'})

            elif method == 'DELETE':
                user_id = body.get('userId') or query_params.get('userId')
                cart_id = body.get('cartId') or query_params.get('cartId')
                product_id = body.get('productId') or query_params.get('productId')

                if not user_id and not cart_id and not product_id:
                    return build_response(400, {'success': False, 'message': 'cartId, userId, or productId is required'})

                # Step 1: Inspect actual KeySchema using DescribeTable
                key_schema = []
                try:
                    desc = dynamodb_client.describe_table(TableName=TABLE_CART)
                    key_schema = desc.get('Table', {}).get('KeySchema', [])
                except Exception:
                    try:
                        key_schema = table.key_schema or []
                    except Exception:
                        key_schema = [{'AttributeName': 'userId', 'KeyType': 'HASH'}]

                hash_key_name = None
                range_key_name = None
                for k in key_schema:
                    if k.get('KeyType') == 'HASH':
                        hash_key_name = k.get('AttributeName')
                    elif k.get('KeyType') == 'RANGE':
                        range_key_name = k.get('AttributeName')

                def extract_key(item_dict):
                    k = {hash_key_name: item_dict[hash_key_name]}
                    if range_key_name and range_key_name in item_dict:
                        k[range_key_name] = item_dict[range_key_name]
                    return k

                # Locate the item(s) to delete matching the requested identifiers
                filter_cond = None
                if cart_id:
                    filter_cond = Attr('cartId').eq(str(cart_id))
                elif user_id and product_id:
                    filter_cond = Attr('userId').eq(str(user_id)) & Attr('productId').eq(str(product_id))
                elif user_id:
                    filter_cond = Attr('userId').eq(str(user_id))
                elif product_id:
                    filter_cond = Attr('productId').eq(str(product_id))

                items_to_delete = []
                if filter_cond is not None:
                    scan_res = table.scan(FilterExpression=filter_cond)
                    items_to_delete = scan_res.get('Items', [])

                deleted_keys = []
                if items_to_delete:
                    for item in items_to_delete:
                        item_key = extract_key(item)
                        table.delete_item(Key=item_key)
                        deleted_keys.append(item_key)
                elif cart_id and user_id and hash_key_name and range_key_name:
                    direct_key = {hash_key_name: str(user_id if hash_key_name == 'userId' else cart_id)}
                    direct_key[range_key_name] = str(cart_id if range_key_name == 'cartId' else (product_id or user_id))
                    table.delete_item(Key=direct_key)
                    deleted_keys.append(direct_key)

                return build_response(200, {
                    'success': True,
                    'message': 'Cart item(s) deleted successfully',
                    'deletedCount': len(deleted_keys),
                    'keySchema': key_schema,
                    'deletedKeys': deleted_keys
                })

        # =========================================================================
        # 4. WISHLIST API -> ShopEaseWishlist
        # =========================================================================
        if path == '/wishlist':
            table = dynamodb.Table(TABLE_WISHLIST)

            if method == 'GET':
                user_id = query_params.get('userId') or query_params.get('id')
                if not user_id:
                    return build_response(400, {'success': False, 'error': 'userId parameter is required'})

                # Scan by userId to support composite key (userId + productId) safely
                scan_res = table.scan(FilterExpression=Attr('userId').eq(str(user_id)))
                raw_items = scan_res.get('Items', [])
                wishlist_items = []
                for it in raw_items:
                    prod = it.get('product')
                    if prod and isinstance(prod, dict) and (prod.get('id') or prod.get('productId')):
                        wishlist_items.append(prod)
                    elif 'productId' in it:
                        wishlist_items.append(it['productId'])
                    elif 'items' in it and isinstance(it['items'], list):
                        wishlist_items.extend(it['items'])

                return build_response(200, {
                    'success': True,
                    'userId': user_id,
                    'items': wishlist_items,
                    'wishlist': raw_items,
                    'count': len(wishlist_items)
                })

            elif method == 'POST':
                user_id = body.get('userId')
                items = body.get('items')
                product_id = body.get('productId') or body.get('id')

                if not user_id:
                    return build_response(400, {'success': False, 'error': 'userId is required'})

                now_iso = datetime.now(timezone.utc).isoformat()

                if items is not None and isinstance(items, list):
                    saved_count = 0
                    for it in items:
                        p_id = it.get('productId') or it.get('id') if isinstance(it, dict) else str(it)
                        if p_id:
                            p_obj = it if isinstance(it, dict) else {'productId': str(p_id), 'id': str(p_id)}
                            rec = {
                                'userId': str(user_id),
                                'productId': str(p_id),
                                'product': convert_floats_to_decimals(p_obj),
                                'updatedAt': now_iso
                            }
                            table.put_item(Item=rec)
                            saved_count += 1
                    return build_response(200, {'success': True, 'userId': user_id, 'items': items, 'count': saved_count})

                if product_id:
                    p_obj = body.get('product') or {'productId': str(product_id), 'id': str(product_id)}
                    record = {
                        'userId': str(user_id),
                        'productId': str(product_id),
                        'product': convert_floats_to_decimals(p_obj),
                        'updatedAt': now_iso
                    }
                    table.put_item(Item=record)
                    return build_response(200, {'success': True, 'message': 'Product added to wishlist', 'item': record})

                return build_response(400, {'success': False, 'error': 'items array or productId required'})

            elif method == 'DELETE':
                user_id = body.get('userId') or query_params.get('userId')
                product_id = body.get('productId') or query_params.get('productId')
                if not user_id:
                    return build_response(400, {'success': False, 'message': 'userId is required'})

                if product_id:
                    table.delete_item(Key={'userId': str(user_id), 'productId': str(product_id)})
                    return build_response(200, {'success': True, 'message': 'Wishlist item deleted', 'productId': str(product_id)})
                else:
                    scan_res = table.scan(FilterExpression=Attr('userId').eq(str(user_id)))
                    del_count = 0
                    for it in scan_res.get('Items', []):
                        if 'productId' in it:
                            table.delete_item(Key={'userId': str(user_id), 'productId': it['productId']})
                            del_count += 1
                    return build_response(200, {'success': True, 'message': 'Wishlist cleared', 'deletedCount': del_count})

        # =========================================================================
        # 5. REVIEWS API -> ShopEaseReviews
        # =========================================================================
        if path == '/reviews':
            table = dynamodb.Table(TABLE_REVIEWS)

            if method == 'GET':
                product_id = query_params.get('productId')
                if product_id:
                    scan_res = table.scan(FilterExpression=Attr('productId').eq(str(product_id)))
                    reviews = scan_res.get('Items', [])
                else:
                    scan_res = table.scan(Limit=50)
                    reviews = scan_res.get('Items', [])
                return build_response(200, {'success': True, 'reviews': reviews})

            elif method == 'POST':
                product_id = body.get('productId')
                name = body.get('name') or body.get('userName') or 'Verified Buyer'
                rating = int(body.get('rating', 5))
                title = body.get('title', '')
                comment = body.get('comment') or body.get('body', '')

                if not product_id or not comment:
                    return build_response(400, {'success': False, 'error': 'productId and comment are required'})

                review_id = f"REV-{uuid.uuid4().hex[:10].upper()}"
                now_iso = datetime.now(timezone.utc).isoformat()
                review_item = {
                    'reviewId': review_id,
                    'productId': str(product_id),
                    'userId': str(body.get('userId', 'guest')),
                    'name': name,
                    'rating': rating,
                    'title': title,
                    'body': comment,
                    'comment': comment,
                    'createdAt': now_iso,
                    'verified': True
                }

                table.put_item(Item=convert_floats_to_decimals(review_item))
                return build_response(201, {'success': True, 'review': review_item})

        # =========================================================================
        # 6. SUPPORT TICKETS API -> ShopEaseSupportTickets
        # =========================================================================
        if path in ['/tickets', '/support']:
            table = dynamodb.Table(TABLE_TICKETS)

            if method == 'GET':
                user_id = query_params.get('userId')
                if user_id:
                    scan_res = table.scan(FilterExpression=Attr('userId').eq(str(user_id)))
                    tickets = scan_res.get('Items', [])
                else:
                    scan_res = table.scan(Limit=50)
                    tickets = scan_res.get('Items', [])
                return build_response(200, {'success': True, 'tickets': tickets})

            elif method == 'POST':
                user_id = body.get('userId', 'guest')
                name = body.get('name', '')
                email = body.get('email') or body.get('userEmail') or (f"{user_id}@shopease.com" if user_id != 'guest' else 'customer@shopease.com')
                order_id = body.get('orderId', '')
                category = body.get('category', 'general')
                subject = body.get('subject') or 'Customer Inquiry'
                message = body.get('message') or body.get('description') or body.get('comment') or ''

                if not message:
                    return build_response(400, {'success': False, 'error': 'Message is required'})

                ticket_id = body.get('id') or body.get('ticketId') or f"TKT-{uuid.uuid4().hex[:6].upper()}"
                now_iso = datetime.now(timezone.utc).isoformat()

                ticket_item = {
                    'ticketId': ticket_id,
                    'id': ticket_id,
                    'userId': str(user_id),
                    'name': name,
                    'email': email,
                    'orderId': order_id,
                    'category': category,
                    'subject': subject,
                    'message': message,
                    'status': 'Open',
                    'createdAt': now_iso,
                    'updatedAt': now_iso
                }

                table.put_item(Item=ticket_item)
                return build_response(201, {'success': True, 'ticket': ticket_item})

        # Route Not Found
        return build_response(404, {'message': f"Not Found: {method} {path}"})

    except Exception as e:
        print(f"Error handling {method} {path}: {str(e)}")
        return build_response(500, {
            'success': False,
            'error': 'Internal server error',
            'details': str(e)
        })
