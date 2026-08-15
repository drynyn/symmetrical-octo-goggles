"use strict";

let morphs = [];
let habitats = [];

const loading = document.getElementById("loading");
const application = document.getElementById("application");

const typeFilters =
    document.getElementById("typeFilters");

const habitatFilters =
    document.getElementById("habitatFilters");

const sleeveCount =
    document.getElementById("sleeveCount");

const generateButton =
    document.getElementById("generate");

const resetButton =
    document.getElementById("reset");

const inventory =
    document.getElementById("inventory");

const summary =
    document.getElementById("summary");

const status =
    document.getElementById("status");


// ============================================================
// INITIALISE
// ============================================================

async function initialise() {

    try {

        const response =
            await fetch("morphs.xml");

        if (!response.ok) {
            throw new Error(
                "Could not load morphs.xml"
            );
        }

        const text =
            await response.text();

        const parser =
            new DOMParser();

        const xml =
            parser.parseFromString(
                text,
                "application/xml"
            );

        const parserError =
            xml.querySelector("parsererror");

        if (parserError) {
            throw new Error(
                "morphs.xml contains invalid XML"
            );
        }

        parseHabitats(xml);
        parseMorphs(xml);

        buildTypeFilters();
        buildHabitatFilters();

        loading.hidden = true;
        application.hidden = false;

        generateBodybank();

    } catch (error) {

        loading.innerHTML = `
            <div class="error">
                DATABASE ERROR
                <br><br>
                ${escapeHtml(error.message)}
            </div>
        `;

    }
}


// ============================================================
// PARSE HABITATS
// ============================================================

function parseHabitats(xml) {

    habitats =
        [...xml.querySelectorAll(
            "habitats > habitat"
        )]
        .map(node => ({
            id:
                node.getAttribute("id"),

            name:
                node.querySelector("name")
                    ?.textContent
                    .trim()
                || node.getAttribute("id")
        }));
}


// ============================================================
// PARSE MORPHS
// ============================================================

function parseMorphs(xml) {

    morphs =
        [...xml.querySelectorAll(
            "morphs > morph"
        )]
        .map(parseMorph);

}


// ============================================================
// PARSE ONE MORPH
// ============================================================

function parseMorph(node) {

    const availability =
        node.querySelector("availability");

    const stats =
        node.querySelector("stats");

    const aptitudes =
        node.querySelector("aptitudes");


    return {

        id:
            node.getAttribute("id"),

        name:
            node.getAttribute("name"),

        type:
            node.getAttribute("type"),

        cost:
            node.querySelector("cost")
                ?.textContent
                .trim()
            || null,

        availability: {

            base:
                Number(
                    availability
                        ?.getAttribute("base")
                    || 0
                ),

            habitats:
                [...(
                    availability
                        ?.querySelectorAll("habitat")
                    || []
                )].map(h => ({

                    id:
                        h.getAttribute("id"),

                    value:
                        Number(
                            h.getAttribute("value")
                        )

                }))

        },

        stats: {

            wt:
                getNumber(stats, "wt"),

            dur:
                getNumber(stats, "dur"),

            dr:
                getNumber(stats, "dr")

        },

        aptitudes: {

            insight:
                getNumber(
                    aptitudes,
                    "insight"
                ),

            moxie:
                getNumber(
                    aptitudes,
                    "moxie"
                ),

            vigor:
                getNumber(
                    aptitudes,
                    "vigor"
                ),

            flex:
                getNumber(
                    aptitudes,
                    "flex"
                )

        },

        movement:
            [...node.querySelectorAll(
                "movement rate"
            )].map(rate => ({

                mode:
                    rate.getAttribute("mode"),

                normal:
                    rate.getAttribute("normal"),

                running:
                    rate.getAttribute("running")

            })),

        ware:
            getList(
                node,
                "ware item"
            ),

        morphTraits:
            getList(
                node,
                "morphTraits item"
            ),

        commonExtras:
            getList(
                node,
                "commonExtras item"
            ),

        notes:
            node.querySelector("notes")
                ?.textContent
                .trim()
            || ""

    };
}


// ============================================================
// HELPERS
// ============================================================

function getNumber(parent, selector) {

    if (!parent) {
        return null;
    }

    const node =
        parent.querySelector(selector);

    if (!node) {
        return null;
    }

    return Number(
        node.textContent.trim()
    );
}


function getList(parent, selector) {

    return [
        ...parent.querySelectorAll(selector)
    ].map(node =>
        node.textContent.trim()
    );
}


// ============================================================
// TYPE FILTERS
// ============================================================

function buildTypeFilters() {

    typeFilters.innerHTML = "";

    const types =
        [...new Set(
            morphs.map(morph => morph.type)
        )].sort();


    types.forEach(type => {

        const id =
            "type-" + slugify(type);


        const label =
            document.createElement("label");


        label.innerHTML = `
            <input
                type="checkbox"
                value="${escapeHtml(type)}"
                checked
            >

            <span>
                ${escapeHtml(type)}
            </span>
        `;


        typeFilters.appendChild(label);
    });
}


// ============================================================
// HABITAT FILTERS
// ============================================================

function buildHabitatFilters() {

    habitatFilters.innerHTML = "";

    habitats.forEach(habitat => {

        const label =
            document.createElement("label");


        label.innerHTML = `
            <input
                type="checkbox"
                class="habitat-checkbox"
                value="${escapeHtml(habitat.id)}"
            >

            <span>
                ${escapeHtml(habitat.name)}
            </span>
        `;


        habitatFilters.appendChild(label);
    });
}


// ============================================================
// SELECTION
// ============================================================

function getSelectedTypes() {

    return [
        ...typeFilters.querySelectorAll(
            "input:checked"
        )
    ].map(input =>
        input.value
    );
}


function getSelectedHabitats() {

    return [
        ...habitatFilters.querySelectorAll(
            ".habitat-checkbox:checked"
        )
    ].map(input =>
        input.value
    );
}


// ============================================================
// EFFECTIVE AVAILABILITY
// ============================================================

function getEffectiveAvailability(
    morph,
    selectedHabitats
) {

    let value =
        morph.availability.base;

    let modified = false;


    /*
     * If several habitat conditions are selected,
     * use the highest explicit habitat value.
     *
     * This prevents stacking unrelated habitat values.
     */

    for (
        const habitat
        of morph.availability.habitats
    ) {

        if (
            selectedHabitats.includes(
                habitat.id
            )
        ) {

            value =
                Math.max(
                    value,
                    habitat.value
                );

            modified = true;
        }
    }


    return {
        value,
        modified
    };
}


// ============================================================
// WEIGHTED RANDOM
// ============================================================

function weightedRandom(items) {

    const total =
        items.reduce(
            (sum, item) =>
                sum + item.weight,
            0
        );


    if (total <= 0) {
        return null;
    }


    let roll =
        Math.random() * total;


    for (const item of items) {

        roll -= item.weight;

        if (roll <= 0) {
            return item;
        }
    }


    return items[
        items.length - 1
    ];
}


// ============================================================
// GENERATE
// ============================================================

function generateBodybank() {

    let amount =
        Number(sleeveCount.value);


    if (!Number.isFinite(amount)) {
        amount = 20;
    }


    amount =
        Math.max(
            1,
            Math.min(
                500,
                Math.floor(amount)
            )
        );


    sleeveCount.value =
        amount;


    const selectedTypes =
        getSelectedTypes();


    const selectedHabitats =
        getSelectedHabitats();


    const pool =
        morphs

            .filter(morph =>
                selectedTypes.includes(
                    morph.type
                )
            )

            .map(morph => {

                const result =
                    getEffectiveAvailability(
                        morph,
                        selectedHabitats
                    );


                return {

                    morph,

                    availability:
                        result.value,

                    modified:
                        result.modified,

                    weight:
                        Math.max(
                            0,
                            result.value
                        )

                };

            })

            .filter(item =>
                item.weight > 0
            );


    if (pool.length === 0) {

        inventory.innerHTML = `
            <div class="error">
                NO ELIGIBLE MORPHS.
                <br><br>
                Select at least one morph type.
            </div>
        `;

        summary.innerHTML = "";

        return;
    }


    /*
     * IMPORTANT:
     *
     * The selected morph remains in the pool.
     *
     * Therefore every draw is independent and
     * duplicate sleeves are possible.
     */

    const generated = [];


    for (
        let i = 0;
        i < amount;
        i++
    ) {

        const result =
            weightedRandom(pool);


        if (result) {

            generated.push({

                ...result.morph,

                effectiveAvailability:
                    result.availability,

                habitatModified:
                    result.modified

            });

        }
    }


    renderInventory(generated);
    renderSummary(generated);


    const habitatNames =
        selectedHabitats
            .map(id => {

                const habitat =
                    habitats.find(
                        h => h.id === id
                    );

                return habitat
                    ? habitat.name
                    : id;

            });


    status.innerHTML = `
        <strong>
            ${generated.length}
        </strong>
        physical sleeves generated

        //

        CONDITIONS:
        <strong>
            ${
                habitatNames.length
                    ? escapeHtml(
                        habitatNames.join(", ")
                    )
                    : "STANDARD"
            }
        </strong>

        //

        AVAILABILITY = WEIGHT
    `;
}


// ============================================================
// RENDER INVENTORY
// ============================================================

function renderInventory(generated) {

    inventory.innerHTML = "";


    generated.forEach(
        (morph, index) => {

            const card =
                document.createElement("div");


            card.className =
                "sleeve";


            card.innerHTML = `

                <div class="sleeve-number">
                    SLEEVE
                    ${String(index + 1)
                        .padStart(3, "0")}
                </div>

                <div class="sleeve-name">
                    ${escapeHtml(morph.name)}
                </div>

                <div class="sleeve-type">
                    ${escapeHtml(morph.type)}
                </div>

                <div class="availability">

                    <span>
                        ${
                            morph.habitatModified
                                ? "HABITAT AVAIL"
                                : "AVAIL"
                        }
                    </span>

                    <span class="${
                        morph.habitatModified
                            ? "habitat-avail"
                            : "avail"
                    }">
                        ${morph.effectiveAvailability}
                    </span>

                </div>

                <div class="details">

                    ${renderStats(morph)}

                    ${renderAptitudes(morph)}

                    ${renderMovement(morph)}

                    ${renderListSection(
                        "WARE",
                        morph.ware
                    )}

                    ${renderListSection(
                        "MORPH TRAITS",
                        morph.morphTraits
                    )}

                    ${renderListSection(
                        "COMMON EXTRAS",
                        morph.commonExtras
                    )}

                    ${
                        morph.notes
                            ? `
                                <div class="section">
                                    <div class="section-title">
                                        NOTES
                                    </div>
                                    ${escapeHtml(
                                        morph.notes
                                    )}
                                </div>
                              `
                            : ""
                    }

                </div>
            `;


            card.addEventListener(
                "click",
                () => {
                    card.classList.toggle(
                        "expanded"
                    );
                }
            );


            inventory.appendChild(card);
        }
    );
}


// ============================================================
// DETAILS
// ============================================================

function renderStats(morph) {

    if (
        morph.stats.wt === null &&
        morph.stats.dur === null &&
        morph.stats.dr === null
    ) {
        return "";
    }


    return `

        <div class="section-title">
            MORPH STATS
        </div>

        <div class="stat-grid">

            <div class="stat">
                <div class="stat-label">
                    WT
                </div>
                <div class="stat-value">
                    ${display(
                        morph.stats.wt
                    )}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    DUR
                </div>
                <div class="stat-value">
                    ${display(
                        morph.stats.dur
                    )}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    DR
                </div>
                <div class="stat-value">
                    ${display(
                        morph.stats.dr
                    )}
                </div>
            </div>

        </div>
    `;
}


function renderAptitudes(morph) {

    const a =
        morph.aptitudes;


    if (
        a.insight === null &&
        a.moxie === null &&
        a.vigor === null &&
        a.flex === null
    ) {
        return "";
    }


    return `

        <div class="section-title">
            APTITUDES
        </div>

        <div class="stat-grid">

            <div class="stat">
                <div class="stat-label">
                    INSIGHT
                </div>
                <div class="stat-value">
                    ${display(a.insight)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    MOXIE
                </div>
                <div class="stat-value">
                    ${display(a.moxie)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    VIGOR
                </div>
                <div class="stat-value">
                    ${display(a.vigor)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    FLEX
                </div>
                <div class="stat-value">
                    ${display(a.flex)}
                </div>
            </div>

        </div>
    `;
}


function renderMovement(morph) {

    if (!morph.movement.length) {
        return "";
    }


    const lines =
        morph.movement
            .map(movement => `
                <div>
                    ${escapeHtml(
                        movement.mode
                    )}
                    ${escapeHtml(
                        movement.normal
                    )}
                    /
                    ${escapeHtml(
                        movement.running
                    )}
                </div>
            `)
            .join("");


    return `

        <div class="section">
            <div class="section-title">
                MOVEMENT
            </div>

            ${lines}
        </div>
    `;
}


function renderListSection(
    title,
    items
) {

    if (!items.length) {
        return "";
    }


    return `

        <div class="section">

            <div class="section-title">
                ${escapeHtml(title)}
            </div>

            ${items
                .map(item =>
                    `<div>
                        ${escapeHtml(item)}
                    </div>`
                )
                .join("")
            }

        </div>
    `;
}


// ============================================================
// SUMMARY
// ============================================================

function renderSummary(generated) {

    const counts =
        new Map();


    generated.forEach(morph => {

        counts.set(
            morph.name,
            (counts.get(morph.name) || 0) + 1
        );

    });


    const entries =
        [...counts.entries()]
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );


    if (!entries.length) {

        summary.innerHTML = "";

        return;
    }


    const maximum =
        entries[0][1];


    summary.innerHTML = `
        <div class="panel-title">
            INVENTORY DISTRIBUTION
        </div>
    `;


    entries.forEach(
        ([name, count]) => {

            const row =
                document.createElement("div");


            row.className =
                "summary-row";


            row.innerHTML = `

                <div>
                    ${escapeHtml(name)}
                </div>

                <div class="summary-count">
                    ${count}
                </div>

                <div class="bar">

                    <div
                        class="bar-fill"
                        style="width: ${
                            (count / maximum) * 100
                        }%"
                    ></div>

                </div>
            `;


            summary.appendChild(row);
        }
    );
}


// ============================================================
// RESET
// ============================================================

function reset() {

    sleeveCount.value = 20;


    typeFilters
        .querySelectorAll("input")
        .forEach(input => {
            input.checked = true;
        });


    habitatFilters
        .querySelectorAll("input")
        .forEach(input => {
            input.checked = false;
        });


    generateBodybank();
}


// ============================================================
// UTILITY
// ============================================================

function display(value) {

    return value === null
        ? "—"
        : value;
}


function slugify(value) {

    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ============================================================
// EVENTS
// ============================================================

generateButton.addEventListener(
    "click",
    generateBodybank
);

resetButton.addEventListener(
    "click",
    reset
);


// ============================================================
// START
// ============================================================

initialise();
