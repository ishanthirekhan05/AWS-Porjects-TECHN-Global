import subprocess
import urllib.request
import json
import time
import os
import shutil
import asyncio
import websockets
import sys

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TEMP_DIR = r"C:\Users\ISHANT\.gemini\antigravity\brain\a09c6620-c78c-4e2e-98c8-99b3a3fa4b11\scratch\chrome_real_test"
PORT = 9336

async def run_cdp_test():
    if os.path.exists(TEMP_DIR):
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
    os.makedirs(TEMP_DIR, exist_ok=True)

    cmd = [
        CHROME_PATH,
        "--headless=new",
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={TEMP_DIR}",
        "--remote-allow-origins=*",
        "--disable-extensions",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--allow-file-access-from-files",
        "about:blank"
    ]
    proc = subprocess.Popen(cmd)
    print(f"[Chrome] Started headless Chrome PID: {proc.pid}")
    await asyncio.sleep(2)

    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")
        targets = json.loads(req.read().decode())
        pages = [t for t in targets if t.get("type") == "page"]
        target = pages[0] if pages else targets[0]
        ws_url = target["webSocketDebuggerUrl"].replace("localhost", "127.0.0.1")
        print(f"[CDP] Connecting to page target '{target.get('title')}': {ws_url}")

        async with websockets.connect(ws_url, max_size=10_000_000) as ws:
            msg_id = 0
            pending_responses = {}
            console_logs = []
            network_requests = []
            nav_history = []

            async def dispatcher():
                try:
                    async for raw in ws:
                        data = json.loads(raw)
                        mid = data.get("id")
                        if mid is not None:
                            fut = pending_responses.pop(mid, None)
                            if fut and not fut.done():
                                fut.set_result(data.get("result", {}))
                        method = data.get("method", "")
                        params = data.get("params", {})
                        if method == "Console.messageAdded":
                            msg = params.get("message", {})
                            console_logs.append(f"[{msg.get('level')}] {msg.get('text')}")
                        elif method == "Runtime.consoleAPICalled":
                            args = [str(a.get('value', '')) for a in params.get('args', [])]
                            console_logs.append(f"[{params.get('type')}] {' '.join(args)}")
                        elif method == "Network.requestWillBeSent":
                            req_data = params.get("request", {})
                            network_requests.append(f"REQ: {req_data.get('method')} {req_data.get('url')}")
                        elif method == "Network.responseReceived":
                            resp_data = params.get("response", {})
                            network_requests.append(f"RESP: {resp_data.get('status')} {resp_data.get('url')}")
                        elif method == "Page.frameNavigated":
                            frame = params.get("frame", {})
                            if not frame.get("parentId"):
                                nav_history.append(f"NAV: {frame.get('url')}")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print("[Dispatcher Error]:", e)

            dispatch_task = asyncio.create_task(dispatcher())

            async def send_cmd(method, params=None):
                nonlocal msg_id
                msg_id += 1
                curr_id = msg_id
                loop = asyncio.get_running_loop()
                fut = loop.create_future()
                pending_responses[curr_id] = fut
                payload = {"id": curr_id, "method": method, "params": params or {}}
                await ws.send(json.dumps(payload))
                return await asyncio.wait_for(fut, timeout=15.0)

            # Enable CDP domains
            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")
            await send_cmd("Console.enable")
            await send_cmd("Network.enable")

            # TEST 1: Load target account.html
            target_folder = sys.argv[1] if len(sys.argv) > 1 else "frontend_backup_preprod"
            account_url = f"file:///d:/AWS2/{target_folder}/account.html"
            print(f"\n================ STEP 1: LOAD ACCOUNT PAGE ({target_folder}) ================")
            print(f"Navigating to: {account_url}")
            await send_cmd("Page.navigate", {"url": account_url})
            await asyncio.sleep(2)

            eval_url = await send_cmd("Runtime.evaluate", {"expression": "window.location.href"})
            curr_url = eval_url.get("result", {}).get("value")
            print(f"Current URL: {curr_url}")

            # Inspect Sign In / Register button
            btn_eval = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const btn = document.querySelector('#btnAuthCardSignIn') || document.querySelector('a[href*="login.html"]');
                    const authCard = document.getElementById('authRequiredCard');
                    return {
                        found: !!btn,
                        btnHref: btn ? btn.href : null,
                        btnText: btn ? btn.innerText.trim() : null,
                        cardDisplay: authCard ? authCard.style.display : null
                    };
                })()
                """,
                "returnByValue": True
            })
            btn_info = btn_eval.get("result", {}).get("value")
            print(f"Button info on account.html: {json.dumps(btn_info, indent=2)}")

            # STEP 2: Click the Sign In / Register button
            print(f"\n================ STEP 2: CLICK 'Sign In / Register' ================")
            click_eval = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const btn = document.querySelector('#btnAuthCardSignIn') || document.querySelector('a[href*="login.html"]');
                    if (btn) {
                        btn.click();
                        return { clicked: true };
                    }
                    return { clicked: false };
                })()
                """,
                "returnByValue": True
            })
            print(f"Click triggered: {click_eval.get('result', {}).get('value')}")

            # Wait 1.5s for initial navigation to login.html to complete
            await asyncio.sleep(1.5)

            # STEP 3: Observe login.html URL for 12 seconds continuously
            print(f"\n================ STEP 3: 12-SECOND STABILITY OBSERVATION ================")
            print("Monitoring login.html URL every second to ensure NO automatic redirect occurs...")
            url_poll_history = []
            for sec in range(1, 13):
                await asyncio.sleep(1.0)
                url_eval = await send_cmd("Runtime.evaluate", {"expression": "window.location.href"})
                poll_url = str(url_eval.get("result", {}).get("value") or "")
                url_poll_history.append((sec, poll_url))
                is_on_login = "login.html" in poll_url
                status = "OK (STAYED ON LOGIN)" if is_on_login else "REDIRECTED BACK!"
                print(f"  [T+{sec:02d}s] URL: {poll_url} -> {status}")

            all_on_login = all("login.html" in u[1] for u in url_poll_history)
            print(f"\n>>> RESULT FOR STEP 3: Stayed on login.html for entire 12s = {all_on_login} <<<")
            if not all_on_login:
                print("FATAL ERROR: Page auto-redirected during the 12-second observation period!")
                return False

            # STEP 4: Submit valid credentials to AWS API Gateway
            print(f"\n================ STEP 4: SUBMIT FORM WITH VALID CREDENTIALS ================")
            # Pre-register account so credentials exist in AWS DynamoDB
            test_email = f"cdp_live_{int(time.time())}@shopease.com"
            test_pass = "TestPassword123!"
            test_name = "Live CDP Verifier"

            print(f"Creating live test user: {test_email}")
            create_eval = await send_cmd("Runtime.evaluate", {
                "expression": f"""
                (async () => {{
                    const res = await window.ShopEaseAuthService.signup("{test_name}", "{test_email}", "{test_pass}");
                    return res;
                }})()
                """,
                "awaitPromise": True,
                "returnByValue": True
            })
            print(f"Signup result: {json.dumps(create_eval.get('result', {}).get('value'))}")

            # Switch mode to login and fill the input fields
            print(f"Filling login form fields and clicking Submit button...")
            fill_eval = await send_cmd("Runtime.evaluate", {
                "expression": f"""
                (() => {{
                    const emailInput = document.getElementById('inputEmail');
                    const passInput = document.getElementById('inputPassword');
                    const btnModeLogin = document.getElementById('btnModeLogin');
                    if (btnModeLogin) btnModeLogin.click();
                    emailInput.value = "{test_email}";
                    passInput.value = "{test_pass}";
                    const submitBtn = document.getElementById('btnSubmitAuth');
                    submitBtn.click();
                    return {{ submitted: true }};
                }})()
                """,
                "returnByValue": True
            })
            print(f"Form submission initiated: {fill_eval.get('result', {}).get('value')}")

            # Wait and observe transition to account.html
            print("\nObserving navigation after form submission...")
            redirect_to_account = False
            for s in range(1, 10):
                await asyncio.sleep(1.0)
                url_eval = await send_cmd("Runtime.evaluate", {"expression": "window.location.href"})
                poll_url = str(url_eval.get("result", {}).get("value") or "")
                print(f"  [Post-Submit T+{s:02d}s] URL: {poll_url}")
                if "account.html" in poll_url and "login.html" not in poll_url:
                    redirect_to_account = True
                    print(f"SUCCESS: Confirmed redirect to account.html at T+{s}s!")
                    break

            # STEP 5: Verify account page reflects authenticated user
            if redirect_to_account:
                print(f"\n================ STEP 5: VERIFY AUTHENTICATED STATE ON ACCOUNT PAGE ================")
                await asyncio.sleep(1.0)
                acct_eval = await send_cmd("Runtime.evaluate", {
                    "expression": """
                    (() => {
                        const isAuth = window.ShopEaseAuthService && window.ShopEaseAuthService.isAuthenticated();
                        const user = window.ShopEaseAuthService && window.ShopEaseAuthService.getCurrentUser();
                        const dash = document.getElementById('accountDashboardLayout');
                        const card = document.getElementById('authRequiredCard');
                        const nameEl = document.getElementById('overviewCustomerName');
                        return {
                            isAuthenticated: isAuth,
                            name: user ? user.name : null,
                            email: user ? user.email : null,
                            dashboardVisible: dash ? (dash.style.display !== 'none' && !dash.hidden) : false,
                            cardHidden: card ? (card.style.display === 'none' || card.hidden) : false,
                            renderedName: nameEl ? nameEl.innerText : null
                        };
                    })()
                    """,
                    "returnByValue": True
                })
                print(f"Account state: {json.dumps(acct_eval.get('result', {}).get('value'), indent=2)}")

            # STEP 6: Display Collected Telemetry
            print(f"\n================ BROWSER TELEMETRY & PROOF ================")
            print("\n--- Navigation Events ---")
            for nav in nav_history:
                print("  ", nav)

            print("\n--- Network Requests (AWS API Gateway Calls) ---")
            for req in network_requests:
                if "amazonaws.com" in req or "login" in req or "signup" in req or "account" in req:
                    print("  ", req)

            print("\n--- Browser Console Logs ---")
            for c in console_logs:
                print("  ", c)

            dispatch_task.cancel()
            return all_on_login and redirect_to_account

    finally:
        proc.terminate()
        proc.wait()
        try:
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        except:
            pass

if __name__ == "__main__":
    success = asyncio.run(run_cdp_test())
    print(f"\nOVERALL TEST STATUS: {'ALL CHECKS PASSED' if success else 'FAILED'}")
