const menuToggle = document.querySelector(".menu-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");

if (menuToggle && primaryNavigation) {
    const desktopLayout = window.matchMedia("(min-width: 760px)");

    const updateNavigationState = () => {
        const isOpen = primaryNavigation.classList.contains("is-open");
        const isDesktop = desktopLayout.matches;

        menuToggle.setAttribute("aria-expanded", String(isDesktop || isOpen));
        primaryNavigation.setAttribute("aria-hidden", String(!isDesktop && !isOpen));
    };

    menuToggle.addEventListener("click", () => {
        primaryNavigation.classList.toggle("is-open");
        updateNavigationState();
    });

    desktopLayout.addEventListener("change", updateNavigationState);
    updateNavigationState();
}

function showMessage() {
    const message = document.querySelector("#message");

    if (message) {
        message.textContent = "Welcome to CareerBridge Pro.";
    }
}

if (document.body.classList.contains("home-document")) {
    const homeHero = document.querySelector(".home-hero");
    const heroEyebrow = document.querySelector(".home-hero .eyebrow");
    const heroHeading = document.querySelector(".home-hero h1");
    const heroIntro = document.querySelector(".home-hero .intro-section__text");
    const heroActions = document.querySelector(".home-hero__actions");
    const heroVisual = document.querySelector(".home-hero__visual");
    const panelTitle = document.querySelector(".career-visual__title");
    const revealTargets = document.querySelectorAll(".home-stats, .home-section, .home-final-cta");

    document.body.classList.add("motion-ready");

    requestAnimationFrame(() => {
        [heroEyebrow, heroHeading, heroIntro, heroActions, heroVisual, panelTitle].forEach((element) => {
            if (element) {
                element.classList.add("is-motion-visible");
            }
        });
    });

    revealTargets.forEach((element) => element.classList.add("reveal"));

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        revealTargets.forEach((element) => revealObserver.observe(element));
    } else {
        revealTargets.forEach((element) => element.classList.add("is-visible"));
    }
}