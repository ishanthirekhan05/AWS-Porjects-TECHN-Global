const filterForm = document.querySelector("#opportunity-filters");
const searchInput = document.querySelector("#search-input");
const categoryFilter = document.querySelector("#category-filter");
const locationFilter = document.querySelector("#location-filter");
const typeFilter = document.querySelector("#type-filter");
const loadingState = document.querySelector("#loading-state");
const errorState = document.querySelector("#error-state");
const errorMessage = document.querySelector("#error-message");
const emptyState = document.querySelector("#empty-state");
const opportunityResults = document.querySelector("#opportunity-results");
const jobsList = document.querySelector("#jobs-list");
const internshipsList = document.querySelector("#internships-list");
const jobsCount = document.querySelector("#jobs-count");
const internshipsCount = document.querySelector("#internships-count");

let opportunities = [];

function createOption(value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
}

function populateFilter(select, values) {
    values
        .sort((firstValue, secondValue) => firstValue.localeCompare(secondValue))
        .forEach((value) => select.appendChild(createOption(value)));
}

function populateFilters(data) {
    populateFilter(categoryFilter, [...new Set(data.map((item) => item.category))]);
    populateFilter(locationFilter, [...new Set(data.map((item) => item.location))]);
    populateFilter(typeFilter, [...new Set(data.map((item) => item.type))]);
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

function createOpportunityCard(opportunity) {
    const card = document.createElement("article");
    card.className = "opportunity-card";

    const skillMarkup = opportunity.skills
        .map((skill) => `<span class="skill-tag">${escapeHtml(skill)}</span>`)
        .join("");

    card.innerHTML = `
        <div class="opportunity-card__topline">
            <span class="opportunity-card__category">${escapeHtml(opportunity.category)}</span>
            <span class="opportunity-card__type">${escapeHtml(opportunity.type)}</span>
        </div>
        <h3>${escapeHtml(opportunity.title)}</h3>
        <p class="opportunity-card__company">${escapeHtml(opportunity.company)}</p>
        <p class="opportunity-card__location">${escapeHtml(opportunity.location)}</p>
        <p class="opportunity-card__description">${escapeHtml(opportunity.description)}</p>
        <div class="skill-list" aria-label="Skills: ${escapeHtml(opportunity.skills.join(", "))}">${skillMarkup}</div>
        <button class="button button--secondary" type="button" data-opportunity-id="${escapeHtml(opportunity.id)}">View opportunity</button>
    `;

    return card;
}

function getFilteredOpportunities() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedCategory = categoryFilter.value;
    const selectedLocation = locationFilter.value;
    const selectedType = typeFilter.value;

    return opportunities.filter((opportunity) => {
        const searchableText = [
            opportunity.title,
            opportunity.company,
            opportunity.location,
            opportunity.category,
            opportunity.type,
            opportunity.description,
            ...opportunity.skills
        ].join(" ").toLowerCase();

        return (!searchTerm || searchableText.includes(searchTerm))
            && (selectedCategory === "all" || opportunity.category === selectedCategory)
            && (selectedLocation === "all" || opportunity.location === selectedLocation)
            && (selectedType === "all" || opportunity.type === selectedType);
    });
}

function renderOpportunities(data) {
    const jobs = data.filter((opportunity) => opportunity.kind === "job");
    const internships = data.filter((opportunity) => opportunity.kind === "internship");

    jobsList.replaceChildren(...jobs.map(createOpportunityCard));
    internshipsList.replaceChildren(...internships.map(createOpportunityCard));
    jobsCount.textContent = `${jobs.length} ${jobs.length === 1 ? "result" : "results"}`;
    internshipsCount.textContent = `${internships.length} ${internships.length === 1 ? "result" : "results"}`;
    opportunityResults.hidden = data.length === 0;
    emptyState.hidden = data.length !== 0;
}

function setLoading(isLoading) {
    loadingState.hidden = !isLoading;
}

function showError(error) {
    errorMessage.textContent = error.message || "Please try again later.";
    errorState.hidden = false;
    opportunityResults.hidden = true;
    emptyState.hidden = true;
}

async function loadOpportunities() {
    setLoading(true);
    errorState.hidden = true;

    try {
        opportunities = await getOpportunities();
        populateFilters(opportunities);
        renderOpportunities(opportunities);
    } catch (error) {
        showError(error);
    } finally {
        setLoading(false);
    }
}

if (filterForm) {
    filterForm.addEventListener("input", () => renderOpportunities(getFilteredOpportunities()));
    filterForm.addEventListener("change", () => renderOpportunities(getFilteredOpportunities()));
    loadOpportunities();
}