const sampleEvents = [
    {
        id: "event-workshop-001",
        title: "Resume Workshop: From Draft to Direction",
        type: "Workshop",
        date: "2026-09-05",
        time: "10:00 AM - 12:00 PM",
        location: "Campus Seminar Hall",
        description: "Review resume structure, project descriptions, and practical ways to make your experience easier to understand."
    },
    {
        id: "event-fair-002",
        title: "Student Career Fair",
        type: "Career Fair",
        date: "2026-09-12",
        time: "9:30 AM - 3:00 PM",
        location: "University Main Auditorium",
        description: "Explore different technology roles, prepare questions, and learn how teams describe their work."
    },
    {
        id: "event-technical-003",
        title: "Building Your First Cloud Project",
        type: "Technical Session",
        date: "2026-09-19",
        time: "2:00 PM - 4:00 PM",
        location: "Online session",
        description: "Walk through the ideas behind a small static website deployment and practice explaining cloud choices."
    },
    {
        id: "event-mock-004",
        title: "Practice Mock Interviews",
        type: "Mock Interview",
        date: "2026-09-26",
        time: "11:00 AM - 1:00 PM",
        location: "Placement Cell Rooms",
        description: "Rehearse introductions, project explanations, and technical questions in a structured practice setting."
    },
    {
        id: "event-placement-005",
        title: "Placement Preparation Q&A",
        type: "Placement Session",
        date: "2026-10-03",
        time: "4:00 PM - 5:30 PM",
        location: "Online session",
        description: "Bring questions about preparation plans, interview habits, and choosing a focused learning routine."
    }
];

const eventsLoading = document.querySelector("#events-loading");
const eventsError = document.querySelector("#events-error");
const eventsErrorMessage = document.querySelector("#events-error-message");
const eventsEmpty = document.querySelector("#events-empty");
const eventCards = document.querySelector("#event-cards");

function isValidEvent(event) {
    return event
        && typeof event.id === "string"
        && typeof event.title === "string"
        && typeof event.type === "string"
        && typeof event.date === "string"
        && typeof event.time === "string"
        && typeof event.location === "string"
        && typeof event.description === "string";
}

function validateEvents(data) {
    if (!Array.isArray(data) || !data.every(isValidEvent)) {
        throw new Error("The sample event data format is not valid.");
    }

    return data;
}

async function getSampleEvents() {
    return validateEvents(sampleEvents);
}

function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[character]));
}

function formatEventDate(dateValue) {
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium"
    }).format(new Date(`${dateValue}T00:00:00`));
}

function createEventCard(event) {
    const card = document.createElement("article");
    card.className = "event-card";
    card.innerHTML = `
        <div class="event-card__topline">
            <span class="event-card__type">${escapeHtml(event.type)}</span>
            <time datetime="${escapeHtml(event.date)}">${escapeHtml(formatEventDate(event.date))}</time>
        </div>
        <h3>${escapeHtml(event.title)}</h3>
        <dl class="event-meta">
            <div><dt>Date</dt><dd>${escapeHtml(formatEventDate(event.date))}</dd></div>
            <div><dt>Time</dt><dd>${escapeHtml(event.time)}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(event.location)}</dd></div>
        </dl>
        <p class="event-card__description">${escapeHtml(event.description)}</p>
        <button class="button button--secondary event-action" type="button" data-event-title="${escapeHtml(event.title)}">View event details</button>
        <p class="event-action-message" aria-live="polite" hidden></p>
    `;

    const actionButton = card.querySelector(".event-action");
    const actionMessage = card.querySelector(".event-action-message");
    actionButton.addEventListener("click", () => {
        actionMessage.textContent = "Official details and registration will be added when they are provided by the college.";
        actionMessage.hidden = false;
    });

    return card;
}

function showEvents(data) {
    if (data.length === 0) {
        eventsEmpty.hidden = false;
        eventCards.hidden = true;
        return;
    }

    eventCards.replaceChildren(...data.map(createEventCard));
    eventCards.hidden = false;
    eventsEmpty.hidden = true;
}

async function loadEvents() {
    try {
        showEvents(await getSampleEvents());
    } catch (error) {
        eventsErrorMessage.textContent = error.message || "Please try again later.";
        eventsError.hidden = false;
        eventCards.hidden = true;
        eventsEmpty.hidden = true;
    } finally {
        eventsLoading.hidden = true;
    }
}

if (eventCards) {
    loadEvents();
}