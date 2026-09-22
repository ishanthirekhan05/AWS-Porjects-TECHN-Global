"""
ShopEase Automated AWS Backend Deployment & Route Synchronizer
Can deploy Lambda code and API Gateway routes automatically using boto3/AWS CLI.
"""

import sys
import os
import zipfile
import io
import json

try:
    import boto3
except ImportError:
    print("boto3 not installed. Please run: pip install boto3")
    sys.exit(1)

REGION = 'us-east-1'
FUNCTION_NAME = 'ShopEaseOrderFunction'
API_ID = 'nxdrpc6yk3'  # Identified from https://nxdrpc6yk3.execute-api.us-east-1.amazonaws.com

def package_lambda():
    print("[1/4] Packaging backend/lambda_function.py into zip buffer...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_file = os.path.join(script_dir, 'lambda_function.py')
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(source_file, arcname='lambda_function.py')
    zip_buffer.seek(0)
    print(f"      Zip package created ({zip_buffer.getbuffer().nbytes} bytes).")
    return zip_buffer.read()

def deploy(aws_access_key=None, aws_secret_key=None, session_token=None):
    session_kwargs = {'region_name': REGION}
    if aws_access_key and aws_secret_key:
        session_kwargs['aws_access_key_id'] = aws_access_key
        session_kwargs['aws_secret_access_key'] = aws_secret_key
        if session_token:
            session_kwargs['aws_session_token'] = session_token

    session = boto3.Session(**session_kwargs)
    lambda_client = session.client('lambda')
    apigw_client = session.client('apigatewayv2')
    sts_client = session.client('sts')
    cors_configuration = {
        'AllowOrigins': ['http://shopease-frontend-2026-ishant.s3-website-us-east-1.amazonaws.com'],
        'AllowMethods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        'AllowHeaders': ['Content-Type', 'Authorization', 'X-Requested-With'],
        'MaxAge': 300
    }

    try:
        ident = sts_client.get_caller_identity()
        print(f"[+] Connected to AWS Account: {ident['Account']}, ARN: {ident['Arn']}")
    except Exception as e:
        print(f"[-] AWS Authentication error: {e}")
        print("    Please set AWS credentials via environment variables or run 'aws configure'.")
        return False

    # 1. Update Lambda code
    zip_bytes = package_lambda()
    print(f"[2/4] Updating Lambda function code: {FUNCTION_NAME}...")
    try:
        res = lambda_client.update_function_code(
            FunctionName=FUNCTION_NAME,
            ZipFile=zip_bytes
        )
        print(f"      Lambda code updated successfully. State: {res.get('LastUpdateStatus', 'Successful')}")
    except Exception as e:
        print(f"[-] Failed to update Lambda function: {e}")
        return False

    # 2. Add API Gateway routes
    print(f"[3/4] Configuring API Gateway routes on API: {API_ID}...")
    try:
        # Get integrations to link routes to Lambda
        integrations = apigw_client.get_integrations(ApiId=API_ID)
        integration_items = integrations.get('Items', [])
        if not integration_items:
            print("[-] No integrations found on API Gateway.")
            return False
        
        integration_id = integration_items[0]['IntegrationId']
        print(f"      Using Integration ID: {integration_id}")

        # Desired routes
        routes_to_add = [
            'POST /orders',
            'GET /orders',
            'POST /users',
            'POST /users/signup',
            'POST /users/login',
            'POST /users/password-reset/request',
            'POST /users/password-reset/confirm',
            'GET /users',
            'PUT /users',
            'GET /cart',
            'POST /cart',
            'DELETE /cart',
            'GET /wishlist',
            'POST /wishlist',
            'DELETE /wishlist',
            'GET /reviews',
            'POST /reviews',
            'GET /tickets',
            'POST /tickets',
            'GET /support',
            'POST /support',
            'ANY /{proxy+}'
        ]

        existing_routes = apigw_client.get_routes(ApiId=API_ID).get('Items', [])
        existing_route_keys = [r.get('RouteKey') for r in existing_routes]

        for rk in routes_to_add:
            if rk in existing_route_keys:
                print(f"      Route already exists: {rk}")
            else:
                try:
                    apigw_client.create_route(
                        ApiId=API_ID,
                        RouteKey=rk,
                        Target=f"integrations/{integration_id}"
                    )
                    print(f"      [+] Created route: {rk}")
                except Exception as ex:
                    print(f"      [!] Route creation skipped/failed for {rk}: {ex}")

    except Exception as e:
        print(f"[-] Error configuring API Gateway routes: {e}")

    print("[4/5] Configuring API Gateway CORS...")
    try:
        apigw_client.update_api(
            ApiId=API_ID,
            CorsConfiguration=cors_configuration
        )
        print("      API Gateway CORS configuration updated.")
    except Exception as e:
        print(f"[-] Failed to configure API Gateway CORS: {e}")
        return False

    print("[5/5] Redeploying the API Gateway default stage...")
    try:
        stages = apigw_client.get_stages(ApiId=API_ID).get('Items', [])
        for stage in stages:
            stage_name = stage.get('StageName')
            if stage_name and not stage.get('AutoDeploy', False):
                apigw_client.create_deployment(ApiId=API_ID, StageName=stage_name)
                print(f"      Stage redeployed: {stage_name}")
            elif stage_name:
                print(f"      Stage uses auto-deploy: {stage_name}")
    except Exception as e:
        print(f"[-] Failed to redeploy API Gateway stage: {e}")
        return False

    print("[+] AWS Backend Deployment, CORS, and Route Sync Complete!")
    return True

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Deploy ShopEase Lambda code and sync routes.")
    parser.add_argument('--key', help='AWS Access Key ID')
    parser.add_argument('--secret', help='AWS Secret Access Key')
    parser.add_argument('--token', help='AWS Session Token (optional)')
    args = parser.parse_args()

    key = args.key or os.environ.get('AWS_ACCESS_KEY_ID')
    secret = args.secret or os.environ.get('AWS_SECRET_ACCESS_KEY')
    token = args.token or os.environ.get('AWS_SESSION_TOKEN')

    deploy(aws_access_key=key, aws_secret_key=secret, session_token=token)
