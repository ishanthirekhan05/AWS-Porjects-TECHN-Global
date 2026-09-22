const editProfileButton = document.querySelector("#edit-profile");
const logOutButton = document.querySelector("#log-out");
const profileStatus = document.querySelector("#profile-status");
const sessionStorageKey = "careerBridgeSession";
const storedSession = JSON.parse(localStorage.getItem(sessionStorageKey) || sessionStorage.getItem(sessionStorageKey) || "null");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector(".profile-email");

if (storedSession && profileName && profileEmail) {
    profileName.textContent = storedSession.name;
    profileEmail.textContent = storedSession.email;
}

if (editProfileButton && profileStatus) {
    editProfileButton.addEventListener("click", () => {
        profileStatus.textContent = "This is a static demo. Profile editing is not connected.";
    });
}

if (logOutButton && profileStatus) {
    logOutButton.addEventListener("click", () => {
        localStorage.removeItem(sessionStorageKey);
        sessionStorage.removeItem(sessionStorageKey);
        profileStatus.textContent = "You have been signed out on this device.";
    });
}
