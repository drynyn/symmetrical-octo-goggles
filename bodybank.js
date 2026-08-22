"use strict";


let morphs = [];
let habitats = [];

let generatedInventory = [];

let selectedSleeveIndex = null;


const loading =
    document.getElementById("loading");

const application =
    document.getElementById("application");

const typeFilters =
    document.getElementById("typeFilters");

const habitatFilters =
    document.getElementById("habitatFilters");

const sleeveCount =
    document.getElementById("sleeveCount");

const normalBias =
    document.getElementById("normalBias");

const generateButton =
    document.getElementById("generate");

const resetButton =
    document.getElementById("reset");

const sleeveList =
    document.getElementById("sleeveList");

const detailsPanel =
    document.getElementById("detailsPanel");

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
                ||
                node.getAttribute("id")

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
        node.querySelector(
            "availability"
        );

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
                        ?.querySelectorAll(
                            "habitat"
                        )
                    || []
                )]
                .map(h => ({

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
                getNumber(
                    stats,
                    "wt"
                ),

            dur:
                getNumber(
                    stats,
                    "dur"
                ),

            dr:
                getNumber(
                    stats,
                    "dr"
                )

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
            [
                ...node.querySelectorAll(
                    "movement rate"
                )
            ]
            .map(rate => ({

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


        /*
         * IMPORTANT:
         *
         * This is the list of POSSIBLE common
         * extras. We do not automatically give
         * the sleeve all of them.
         */

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

function getNumber(
    parent,
    selector
) {

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


function getList(
    parent,
    selector
) {

    return [
        ...parent.querySelectorAll(selector)
    ]
    .map(node =>
        node.textContent.trim()
    );

}


// ============================================================
// FILTERS
// ============================================================

function buildTypeFilters() {

    typeFilters.innerHTML = "";


    const types =
        [
            ...new Set(
                morphs.map(
                    morph => morph.type
                )
            )
        ]
        .sort();


    types.forEach(type => {

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
// SELECTED FILTERS
// ============================================================

function getSelectedTypes() {

    return [
        ...typeFilters.querySelectorAll(
            "input:checked"
        )
    ]
    .map(input =>
        input.value
    );

}


function getSelectedHabitats() {

    return [
        ...habitatFilters.querySelectorAll(
            ".habitat-checkbox:checked"
        )
    ]
    .map(input =>
        input.value
    );

}


// ============================================================
// AVAILABILITY
// ============================================================

function getEffectiveAvailability(
    morph,
    selectedHabitats
) {

    let value =
        morph.availability.base;

    let modified = false;


    /*
     * If multiple selected habitats have
     * explicit Availability values, use
     * the highest applicable value.
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
// COMMON EXTRAS
// ============================================================

function generateCommonExtras(
    possibleExtras
) {

    /*
     * Each Common Extra has an independent
     * 50% chance of being present.
     *
     * This means:
     *
     * 0 extras is possible.
     * 1 extra is possible.
     * Multiple extras are possible.
     * All extras are possible.
     */

    return possibleExtras.filter(
        () => Math.random() < 0.5
    );

}


// ============================================================
// WEIGHTED RANDOM SELECTION
// ============================================================

function weightedRandom(items) {

    const exponent =
        normalBias?.checked
            ? 2.5
            : 1;

    const total =
        items.reduce(
            (sum, item) =>
                sum + Math.pow(
                    item.weight,
                    exponent
                ),
            0
        );


    if (total <= 0) {
        return null;
    }


    let roll =
        Math.random() * total;


    for (const item of items) {

        roll -= Math.pow(
            item.weight,
            exponent
        );


        if (roll <= 0) {
            return item;
        }

    }


    return items[
        items.length - 1
    ];

}


// ============================================================
// GENERATE BODYBANK
// ============================================================

function generateBodybank() {

    let amount =
        Number(
            sleeveCount.value
        );


    if (
        !Number.isFinite(amount)
    ) {
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


    /*
     * Construct the weighted morph pool.
     */

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


    if (!pool.length) {

        sleeveList.innerHTML = "";

        detailsPanel.innerHTML = `
            <div class="empty-details">
                NO ELIGIBLE MORPHS
            </div>
        `;

        summary.innerHTML = "";

        return;
    }


    /*
     * Generate individual sleeves.
     *
     * The pool is NOT reduced after a draw.
     *
     * Therefore duplicates are possible.
     */

    generatedInventory = [];


    for (
        let i = 0;
        i < amount;
        i++
    ) {

        const selected =
            weightedRandom(pool);


        if (!selected) {
            continue;
        }


        const morph =
            selected.morph;


        /*
         * Generate the Common Extras for
         * THIS PARTICULAR SLEEVE.
         */

        const commonExtras =
            generateCommonExtras(
                morph.commonExtras
            );


        generatedInventory.push({

            ...morph,

            effectiveAvailability:
                selected.availability,

            habitatModified:
                selected.modified,

            generatedCommonExtras:
                commonExtras

        });

    }


    selectedSleeveIndex = null;


    renderSleeveList();

    renderEmptyDetails();

    renderSummary();


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
            ${generatedInventory.length}
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

        ${normalBias?.checked
            ? "AVAILABILITY = WEIGHT²·⁵"
            : "AVAILABILITY = WEIGHT"
        }

        //

        COMMON EXTRAS = RANDOMISED

    `;

}


// ============================================================
// SLEEVE LIST
// ============================================================

function renderSleeveList() {

    sleeveList.innerHTML = "";


    generatedInventory.forEach(
        (morph, index) => {

            const tile =
                document.createElement(
                    "div"
                );


            tile.className =
                "sleeve-tile";


            tile.dataset.index =
                index;


            const availabilityLabel =
                morph.habitatModified
                    ? "HABITAT AVAIL"
                    : "AVAIL";


            tile.innerHTML = `

                <div class="sleeve-number">

                    SLEEVE
                    ${String(index + 1)
                        .padStart(3, "0")}

                </div>


                <div class="sleeve-name">

                    ${escapeHtml(
                        morph.name
                    )}

                </div>


                <div class="sleeve-type">

                    ${escapeHtml(
                        morph.type
                    )}

                </div>


                <div class="sleeve-meta">

                    <span class="mp">

                        ${escapeHtml(
                            morph.cost
                                ? morph.cost + " MP"
                                : "— MP"
                        )}

                    </span>


                    <span class="${
                        morph.habitatModified
                            ? "habitat-avail"
                            : "avail"
                    }">

                        ${availabilityLabel}:
                        ${morph.effectiveAvailability}

                    </span>

                </div>

            `;


            tile.addEventListener(
                "click",
                () => {

                    selectSleeve(index);

                }
            );


            sleeveList.appendChild(tile);

        }
    );

}


// ============================================================
// SELECT SLEEVE
// ============================================================

function selectSleeve(index) {

    selectedSleeveIndex =
        index;


    document
        .querySelectorAll(
            ".sleeve-tile"
        )
        .forEach(tile => {

            tile.classList.toggle(
                "selected",

                Number(
                    tile.dataset.index
                ) === index
            );

        });


    renderDetails(
        generatedInventory[index],
        index
    );

}


// ============================================================
// EMPTY DETAILS
// ============================================================

function renderEmptyDetails() {

    detailsPanel.innerHTML = `

        <div class="empty-details">

            SELECT A SLEEVE
            <br><br>
            TO VIEW DETAILS

        </div>

    `;

}


// ============================================================
// DETAILS
// ============================================================

function renderDetails(
    morph,
    index
) {

    detailsPanel.innerHTML = `

        <div class="detail-header">

            <div class="detail-number">

                SLEEVE
                ${String(index + 1)
                    .padStart(3, "0")}

            </div>


            <div class="detail-name">

                ${escapeHtml(
                    morph.name
                )}

            </div>


            <div class="detail-type">

                ${escapeHtml(
                    morph.type
                )}

            </div>


            <div class="detail-badges">

                <div class="badge mp">

                    COST:
                    ${
                        morph.cost
                            ? escapeHtml(
                                morph.cost
                            ) + " MP"
                            : "—"
                    }

                </div>


                <div class="badge avail">

                    ${
                        morph.habitatModified
                            ? "HABITAT AVAILABILITY"
                            : "AVAILABILITY"
                    }:

                    ${morph.effectiveAvailability}

                </div>

            </div>

        </div>


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

        ${renderGeneratedExtras(
            morph
        )}

        ${
            morph.notes
                ? renderNotes(
                    morph.notes
                )
                : ""
        }

    `;

}


// ============================================================
// STATS
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

        <div class="detail-section">

            <div class="detail-section-title">
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

        </div>

    `;

}


// ============================================================
// APTITUDES
// ============================================================

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

        <div class="detail-section">

            <div class="detail-section-title">
                APTITUDES
            </div>


            <div class="aptitude-grid">

                <div class="stat">

                    <div class="stat-label">
                        INSIGHT
                    </div>

                    <div class="stat-value">
                        ${display(
                            a.insight
                        )}
                    </div>

                </div>


                <div class="stat">

                    <div class="stat-label">
                        MOXIE
                    </div>

                    <div class="stat-value">
                        ${display(
                            a.moxie
                        )}
                    </div>

                </div>


                <div class="stat">

                    <div class="stat-label">
                        VIGOR
                    </div>

                    <div class="stat-value">
                        ${display(
                            a.vigor
                        )}
                    </div>

                </div>


                <div class="stat">

                    <div class="stat-label">
                        FLEX
                    </div>

                    <div class="stat-value">
                        ${display(
                            a.flex
                        )}
                    </div>

                </div>

            </div>

        </div>

    `;

}


// ============================================================
// MOVEMENT
// ============================================================

function renderMovement(morph) {

    if (!morph.movement.length) {
        return "";
    }


    return `

        <div class="detail-section">

            <div class="detail-section-title">
                MOVEMENT
            </div>


            ${morph.movement
                .map(movement => `

                    <div class="movement-row">

                        ${escapeHtml(
                            movement.mode
                        )}

                        :

                        ${escapeHtml(
                            movement.normal
                        )}

                        /

                        ${escapeHtml(
                            movement.running
                        )}

                    </div>

                `)
                .join("")
            }

        </div>

    `;

}


// ============================================================
// GENERATED COMMON EXTRAS
// ============================================================

function renderGeneratedExtras(
    morph
) {

    return `

        <div class="detail-section">

            <div class="detail-section-title">

                COMMON EXTRAS
                // RANDOMISED

            </div>


            ${
                morph.generatedCommonExtras
                    .length

                    ? `

                        <ul class="data-list">

                            ${
                                morph.generatedCommonExtras
                                    .map(extra =>
                                        `<li>
                                            ${escapeHtml(
                                                extra
                                            )}
                                        </li>`
                                    )
                                    .join("")
                            }

                        </ul>

                      `

                    : `

                        <div class="none">
                            None
                        </div>

                      `
            }

        </div>

    `;

}


// ============================================================
// LIST SECTIONS
// ============================================================

function renderListSection(
    title,
    items
) {

    if (!items.length) {
        return "";
    }


    return `

        <div class="detail-section">

            <div class="detail-section-title">

                ${escapeHtml(title)}

            </div>


            <ul class="data-list">

                ${items
                    .map(item =>
                        `<li>
                            ${escapeHtml(item)}
                        </li>`
                    )
                    .join("")
                }

            </ul>

        </div>

    `;

}


// ============================================================
// NOTES
// ============================================================

function renderNotes(notes) {

    return `

        <div class="detail-section">

            <div class="detail-section-title">
                NOTES
            </div>

            <div>
                ${escapeHtml(notes)}
            </div>

        </div>

    `;

}


// ============================================================
// SUMMARY
// ============================================================

function renderSummary() {
/*
    const counts =
        new Map();


    generatedInventory.forEach(
        morph => {

            counts.set(
                morph.name,

                (
                    counts.get(
                        morph.name
                    ) || 0
                ) + 1
            );

        }
    );


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
                document.createElement(
                    "div"
                );


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
                            (count / maximum)
                            * 100
                        }%"
                    ></div>

                </div>

            `;


            summary.appendChild(row);

        }
    )*/

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


function escapeHtml(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

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
