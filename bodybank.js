let sleeves = [];

const sleeveContainer = document.getElementById("sleeves");
const statusText = document.getElementById("status");
const searchBox = document.getElementById("search");
const typeFilter = document.getElementById("typeFilter");
const availabilityFilter = document.getElementById("availabilityFilter");
const randomButton = document.getElementById("randomButton");


async function loadBodybank() {
    try {
        const response = await fetch("sleeves.xml");

        if (!response.ok) {
            throw new Error("Unable to contact Bodybank database.");
        }

        const xmlText = await response.text();

        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "application/xml");

        const parseError = xml.querySelector("parsererror");

        if (parseError) {
            throw new Error("Bodybank database corruption detected.");
        }

        sleeves = [...xml.querySelectorAll("sleeve")].map(sleeve => ({
            id: getValue(sleeve, "id"),
            name: getValue(sleeve, "name"),
            type: getValue(sleeve, "type"),
            gender: getValue(sleeve, "gender"),
            age: getValue(sleeve, "age"),
            description: getValue(sleeve, "description"),
            purpose: getValue(sleeve, "purpose"),
            availability: getValue(sleeve, "availability"),
            price: getValue(sleeve, "price"),
            tags: [...sleeve.querySelectorAll("tag")]
                .map(tag => tag.textContent)
        }));

        populateTypeFilter();
        renderSleeves(sleeves);

        statusText.textContent =
            `${sleeves.length} morphological assets indexed.`;

    } catch (error) {
        console.error(error);

        statusText.innerHTML =
            `<div class="error">
                DATABASE ERROR: ${error.message}
            </div>`;
    }
}


function getValue(parent, elementName) {
    const element = parent.querySelector(elementName);
    return element ? element.textContent.trim() : "";
}


function populateTypeFilter() {
    const types = [...new Set(sleeves.map(sleeve => sleeve.type))]
        .sort();

    types.forEach(type => {
        const option = document.createElement("option");

        option.value = type;
        option.textContent = type.toUpperCase();

        typeFilter.appendChild(option);
    });
}


function renderSleeves(list) {

    sleeveContainer.innerHTML = "";

    if (list.length === 0) {
        sleeveContainer.innerHTML =
            `<div class="error">NO MATCHING ASSETS FOUND.</div>`;
        return;
    }

    list.forEach(sleeve => {

        const card = document.createElement("div");
        card.className = "sleeve";

        const tags = sleeve.tags
            .map(tag => `<span class="tag">${escapeHTML(tag)}</span>`)
            .join("");

        const availabilityClass =
            sleeve.availability.toLowerCase();

        card.innerHTML = `
            <div class="sleeve-header">
                <div>
                    <div class="sleeve-name">
                        ${escapeHTML(sleeve.name)}
                    </div>

                    <div class="id">
                        ASSET ${escapeHTML(sleeve.id)}
                    </div>
                </div>
            </div>

            <div>
                ${tags}
            </div>

            <div class="details">
                <div>
                    <span class="label">TYPE:</span>
                    ${escapeHTML(sleeve.type)}
                </div>

                <div>
                    <span class="label">GENDER:</span>
                    ${escapeHTML(sleeve.gender)}
                </div>

                <div>
                    <span class="label">APPARENT AGE:</span>
                    ${escapeHTML(sleeve.age)}
                </div>

                <div>
                    <span class="label">PURPOSE:</span>
                    ${escapeHTML(sleeve.purpose)}
                </div>

                <p>
                    ${escapeHTML(sleeve.description)}
                </p>
            </div>

            <div class="availability">
                <span class="${availabilityClass}">
                    ${escapeHTML(sleeve.availability).toUpperCase()}
                </span>

                &nbsp; // &nbsp;

                ${escapeHTML(sleeve.price)}
            </div>
        `;

        sleeveContainer.appendChild(card);
    });
}


function filterSleeves() {

    const search = searchBox.value.toLowerCase();
    const selectedType = typeFilter.value;
    const selectedAvailability = availabilityFilter.value;

    const filtered = sleeves.filter(sleeve => {

        const searchableText = [
            sleeve.id,
            sleeve.name,
            sleeve.type,
            sleeve.gender,
            sleeve.age,
            sleeve.description,
            sleeve.purpose,
            sleeve.tags.join(" ")
        ].join(" ").toLowerCase();

        const matchesSearch =
            searchableText.includes(search);

        const matchesType =
            selectedType === "all" ||
            sleeve.type === selectedType;

        const matchesAvailability =
            selectedAvailability === "all" ||
            sleeve.availability.toLowerCase() === selectedAvailability;

        return (
            matchesSearch &&
            matchesType &&
            matchesAvailability
        );
    });

    statusText.textContent =
        `${filtered.length} assets match current query.`;

    renderSleeves(filtered);
}


function randomSleeve() {

    if (sleeves.length === 0) {
        return;
    }

    const sleeve =
        sleeves[Math.floor(Math.random() * sleeves.length)];

    searchBox.value = sleeve.name;

    typeFilter.value = "all";
    availabilityFilter.value = "all";

    renderSleeves([sleeve]);

    statusText.textContent =
        "RANDOM ASSET SELECTED.";
}


function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


searchBox.addEventListener("input", filterSleeves);
typeFilter.addEventListener("change", filterSleeves);
availabilityFilter.addEventListener("change", filterSleeves);
randomButton.addEventListener("click", randomSleeve);


loadBodybank();
