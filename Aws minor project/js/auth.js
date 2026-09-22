const authTabs = document.querySelectorAll(".auth-tab");
const authPanels = document.querySelectorAll(".auth-form-panel");
const accountStorageKey = "careerBridgeAccount";
const sessionStorageKey = "careerBridgeSession";
const demoMessage = "This is a frontend-only demo. No server is connected.";

function setActiveTab(tabName) {
    const isSignup = tabName === "signup";

    authTabs.forEach((tab) => {
        const active = tab.id === `${tabName}-tab`;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
    });

    authPanels.forEach((panel) => {
        panel.hidden = panel.id !== `${tabName}-panel`;
    });

    const title = document.querySelector("#auth-title");
    title.textContent = isSignup ? "Create your next opportunity." : "Build your next opportunity.";
    history.replaceState(null, "", `#${tabName}`);
}

function showPassword(button) {
    const field = document.querySelector(`#${button.getAttribute("aria-controls")}`);
    const isVisible = field.type === "text";

    field.type = isVisible ? "password" : "text";
    button.setAttribute("aria-pressed", String(!isVisible));
    button.textContent = isVisible ? "Show" : "Hide";
}

function setAuthError(field, message) {
    const error = document.querySelector(`#${field.id}-error`);
    field.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
}

function validateAuthForm(form) {
    const formData = new FormData(form);
    const fields = [...form.querySelectorAll("input[required]")];
    const status = form.querySelector(".auth-status");
    let isValid = true;

    fields.forEach((field) => {
        const value = String(formData.get(field.name) || "").trim();
        let message = "";

        if (field.type === "checkbox") {
            message = field.checked ? "" : "Please accept the terms to continue the demo.";
        } else if (!value) {
            message = "This field is required.";
        } else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            message = "Enter a valid email address.";
        }

        setAuthError(field, message);
        isValid = isValid && !message;
    });

    const password = form.querySelector("input[name='password']");
    const confirmation = form.querySelector("input[name='confirmPassword']");

    if (confirmation && password.value !== confirmation.value) {
        setAuthError(confirmation, "Passwords do not match.");
        isValid = false;
    }

    status.textContent = isValid ? "" : "Please correct the highlighted fields.";

    if (!isValid) {
        const firstInvalidField = fields.find((field) => field.getAttribute("aria-invalid") === "true");
        firstInvalidField?.focus();
    }

    return isValid;
}

function getStoredAccount() {
    return JSON.parse(localStorage.getItem(accountStorageKey) || "null");
}

function saveSession(account, remember) {
    localStorage.removeItem(sessionStorageKey);
    sessionStorage.removeItem(sessionStorageKey);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(sessionStorageKey, JSON.stringify({ name: account.name, email: account.email }));
}

function handleSignup(form) {
    const account = {
        name: form.elements.fullName.value.trim(),
        email: form.elements.email.value.trim().toLowerCase(),
        password: form.elements.password.value
    };

    if (getStoredAccount()) {
        const message = "One demo account already exists. Log in with it or clear site data to create another.";
        form.querySelector(".auth-status").textContent = message;
        setActiveTab("login");
        document.querySelector("#login-email").value = account.email;
        document.querySelector("#login-panel .auth-status").textContent = message;
        return;
    }

    localStorage.setItem(accountStorageKey, JSON.stringify(account));
    saveSession(account, true);
    form.reset();
    form.querySelector(".auth-status").textContent = "Account created and signed in on this device.";
}

function handleLogin(form) {
    const account = getStoredAccount();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const status = form.querySelector(".auth-status");

    if (!account) {
        status.textContent = "No demo account exists yet. Create an account first.";
        setActiveTab("signup");
        document.querySelector("#signup-email").value = email;
        return;
    }

    if (email !== account.email || password !== account.password) {
        setAuthError(form.elements.password, "Email or password is incorrect.");
        status.textContent = "Please check your account details.";
        form.elements.password.focus();
        return;
    }

    saveSession(account, form.elements.remember.checked);
    status.textContent = "You are signed in on this device.";
}

authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.id.replace("-tab", "")));
    tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const nextTab = tab.id === "login-tab" ? "signup" : "login";
            setActiveTab(nextTab);
            document.querySelector(`#${nextTab}-tab`).focus();
        }
    });
});

document.querySelectorAll("[data-switch-tab]").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.getAttribute("data-switch-tab")));
});

document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => showPassword(button));
});

document.querySelectorAll("[data-demo-action]").forEach((button) => {
    button.addEventListener("click", () => {
        const form = button.closest(".auth-form");
        form.querySelector(".auth-status").textContent = demoMessage;
    });
});

document.querySelectorAll(".auth-form").forEach((form) => {
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validateAuthForm(form)) {
            return;
        }

        if (form.id === "signup-form") {
            handleSignup(form);
        } else {
            handleLogin(form);
        }
    });
});

if (authTabs.length) {
    setActiveTab(window.location.hash === "#signup" ? "signup" : "login");
}
