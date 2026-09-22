import json
import sys
from unittest.mock import patch

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, 'backend')
import lambda_function


class FakeOrdersTable:
    def __init__(self):
        self.items = {}
        self.meta = type('Meta', (), {'client': self})()

    def get_item(self, Key, ConsistentRead=False):
        return {'Item': self.items.get(Key['orderId'])} if Key['orderId'] in self.items else {}

    def transact_write_items(self, TransactItems):
        pending = []
        for operation in TransactItems:
            item = operation['Put']['Item']
            key = item['orderId']
            if key in self.items:
                raise ClientError(
                    {'Error': {'Code': 'TransactionCanceledException', 'Message': 'conditional failure'}},
                    'TransactWriteItems',
                )
            pending.append((key, item))
        for key, item in pending:
            self.items[key] = item


class FakeDynamoDB:
    def __init__(self, table):
        self.table = table

    def Table(self, name):
        assert name == 'ShopEaseOrder'
        return self.table


def invoke(key):
    return lambda_function.lambda_handler({
        'rawPath': '/orders',
        'requestContext': {'http': {'method': 'POST'}, 'requestId': 'local-test'},
        'body': json.dumps({
            'userId': 'idempotency-test-user',
            'orderId': 'SE-IDEMPOTENCY-1',
            'idempotencyKey': key,
            'items': [{'productId': 'P001', 'name': 'Test Item', 'price': 10, 'quantity': 1}],
            'totalAmount': 10,
            'shippingAddress': {'name': 'Test User', 'address': 'Test Address'},
            'paymentStatus': 'Paid',
        }),
    }, None)


def test_same_idempotency_key_creates_one_order_and_replays():
    table = FakeOrdersTable()
    with patch.object(lambda_function, 'dynamodb', FakeDynamoDB(table)):
        first = invoke('checkout-test-key')
        replay = invoke('checkout-test-key')

    first_body = json.loads(first['body'])
    replay_body = json.loads(replay['body'])
    canonical_orders = [
        item for item in table.items.values()
        if item.get('recordType') != 'OrderIdempotencyKey'
    ]

    assert first['statusCode'] == 201
    assert replay['statusCode'] == 200
    assert replay_body['idempotent'] is True
    assert replay_body['order']['orderId'] == first_body['order']['orderId']
    assert len(canonical_orders) == 1
    assert len(table.items) == 2


if __name__ == '__main__':
    test_same_idempotency_key_creates_one_order_and_replays()
    print('PASS: same idempotencyKey created one order and returned the canonical order on replay')
