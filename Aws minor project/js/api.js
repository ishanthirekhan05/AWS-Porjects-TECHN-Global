const API_URL = "YOUR_PROVIDED_API_ENDPOINT";

const sampleOpportunities = [
    {
        id: "job-frontend-001",
        kind: "job",
        title: "Junior Frontend Developer",
        company: "BrightLayer Technologies",
        location: "Bengaluru",
        category: "Software Development",
        type: "Full-time",
        skills: ["HTML", "CSS", "JavaScript"],
        description: "Build accessible user interfaces and collaborate with a product engineering team."
    },
    {
        id: "job-cloud-002",
        kind: "job",
        title: "Cloud Support Associate",
        company: "Northstar Systems",
        location: "Hyderabad",
        category: "Cloud & AWS",
        type: "Full-time",
        skills: ["AWS", "Linux", "Networking"],
        description: "Help teams troubleshoot cloud environments and document reliable support solutions."
    },
    {
        id: "intern-data-003",
        kind: "internship",
        title: "Data Analyst Intern",
        company: "InsightWorks Labs",
        location: "Pune",
        category: "Data & Analytics",
        type: "Internship",
        skills: ["Python", "SQL", "Excel"],
        description: "Turn structured datasets into clear reports that support everyday business decisions."
    },
    {
        id: "intern-security-004",
        kind: "internship",
        title: "Cybersecurity Intern",
        company: "ShieldPoint Security",
        location: "Remote",
        category: "Cybersecurity",
        type: "Internship",
        skills: ["Security Basics", "Linux", "Networking"],
        description: "Learn security monitoring workflows and assist with practical risk documentation."
    }
];

function isValidOpportunity(opportunity) {
    return opportunity
        && typeof opportunity.id === "string"
        && ["job", "internship"].includes(opportunity.kind)
        && typeof opportunity.title === "string"
        && typeof opportunity.company === "string"
        && typeof opportunity.location === "string"
        && typeof opportunity.category === "string"
        && typeof opportunity.type === "string"
        && Array.isArray(opportunity.skills)
        && opportunity.skills.every((skill) => typeof skill === "string")
        && typeof opportunity.description === "string";
}

function validateOpportunityResponse(data) {
    if (!Array.isArray(data) || !data.every(isValidOpportunity)) {
        throw new Error("The opportunity data format is not valid.");
    }

    return data;
}

async function fetchFromProvidedApi() {
    const response = await fetch(API_URL);

    if (!response.ok) {
        throw new Error(`The opportunity service returned status ${response.status}.`);
    }

    return validateOpportunityResponse(await response.json());
}

async function getOpportunities() {
    // Use local sample data until the college provides the real endpoint.
    if (API_URL === "YOUR_PROVIDED_API_ENDPOINT") {
        return validateOpportunityResponse(sampleOpportunities);
    }

    return fetchFromProvidedApi();
}