const contactForm = document.querySelector("#contact-form");

function setFieldError(fieldId, message, errorId = `${fieldId}-error`) {
    const field = document.querySelector(`#${fieldId}`);
    const error = document.querySelector(`#${errorId}`);

    field.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
}

if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const name = formData.get("name").trim();
        const email = formData.get("email").trim();
        const message = formData.get("message").trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let isValid = true;

        setFieldError("name", "");
        setFieldError("email", "");
        setFieldError("message-input", "", "message-error");

        if (!name) {
            setFieldError("name", "Please enter your name.");
            isValid = false;
        }

        if (!email) {
            setFieldError("email", "Please enter your email address.");
            isValid = false;
        } else if (!emailPattern.test(email)) {
            setFieldError("email", "Please enter a valid email address.");
            isValid = false;
        }

        if (!message) {
            setFieldError("message-input", "Please enter a message.", "message-error");
            isValid = false;
        }

        const formStatus = document.querySelector("#form-status");

        if (isValid) {
            formStatus.textContent = "Your message is valid for this local demo. It was not sent to a backend.";
            contactForm.reset();
        } else {
            formStatus.textContent = "Please correct the highlighted fields.";
        }
    });
}