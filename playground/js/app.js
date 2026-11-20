
/* =========================================================
   VIRTUAL SCIENCE LAB
   Dynamic Physics & Chemistry Experiment Catalogue
   ========================================================= */

(() => {
    "use strict";

    // Catalogue URLs relative to playground/index.html
    const CATALOGUE_URLS = {
        physics: "../catalog/physics.json",
        chemistry: "../catalog/chemistry.json"
    };

    const SUBJECT_CONFIG = {
        physics: {
            title: "Physics Playground",
            subtitle:
                "Explore motion, waves, light, electricity and the laws of the physical world.",
            eyebrow: "FORCE • LIGHT • ENERGY • WAVES",
            accent: "#5795ff"
        },

        chemistry: {
            title: "Chemistry Playground",
            subtitle:
                "Explore matter, atoms, reactions, solutions and the chemistry around you.",
            eyebrow: "ATOMS • BONDS • REACTIONS • MATTER",
            accent: "#31d6ae"
        }
    };

    const state = {
        subject: "physics",
        experiments: [],
        selectedClass: "all",
        selectedMode: "all",
        search: ""
    };

    const elements = {};

    /* -----------------------------------------------------
       HTML ELEMENTS
    ----------------------------------------------------- */

    function getElements() {
        elements.subjectEyebrow =
            document.getElementById("subjectEyebrow");

        elements.pageTitle =
            document.getElementById("pageTitle");

        elements.pageSubtitle =
            document.getElementById("pageSubtitle");

        elements.experimentCount =
            document.getElementById("experimentCount");

        elements.searchInput =
            document.getElementById("searchInput");

        elements.classFilters =
            document.getElementById("classFilters");

        elements.modeFilters =
            document.getElementById("modeFilters");

        elements.catalogueMessage =
            document.getElementById("catalogueMessage");

        elements.experimentGrid =
            document.getElementById("experimentGrid");

        const required = Object.entries(elements)
            .filter(([, element]) => !element)
            .map(([name]) => name);

        if (required.length > 0) {
            throw new Error(
                "Missing HTML elements: " + required.join(", ")
            );
        }
    }

    /* -----------------------------------------------------
       SUBJECT SELECTION
    ----------------------------------------------------- */

    function getSubjectFromUrl() {
        const params = new URLSearchParams(
            window.location.search
        );

        const subject = (
            params.get("subject") || "physics"
        ).toLowerCase();

        return Object.hasOwn(
            CATALOGUE_URLS,
            subject
        ) ? subject : "physics";
    }

    function applySubjectTheme() {
        const config = SUBJECT_CONFIG[state.subject];

        document.documentElement.style.setProperty(
            "--accent",
            config.accent
        );

        document.documentElement.dataset.subject =
            state.subject;

        elements.subjectEyebrow.textContent =
            config.eyebrow;

        elements.pageTitle.textContent =
            config.title;

        elements.pageSubtitle.textContent =
            config.subtitle;

        document.title =
            config.title + " | Virtual Science Lab";
    }

    /* -----------------------------------------------------
       SAFE TEXT
    ----------------------------------------------------- */

    function escapeHtml(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[character]
        );
    }

    function setMessage(message, type = "info") {
        elements.catalogueMessage.className =
            "catalogue-message " + type;

        elements.catalogueMessage.textContent =
            message;

        elements.catalogueMessage.hidden =
            !message;
    }

    /* -----------------------------------------------------
       FILTER BUTTONS
    ----------------------------------------------------- */

    function createFilterButton(
        label,
        value,
        selected,
        onClick
    ) {
        const button = document.createElement("button");

        button.type = "button";

        button.className =
            "filter-chip" +
            (selected ? " active" : "");

        button.textContent = label;

        button.setAttribute(
            "aria-pressed",
            selected ? "true" : "false"
        );

        button.addEventListener("click", () => {
            onClick(value);
        });

        return button;
    }

    function buildFilters() {
        elements.classFilters.replaceChildren();
        elements.modeFilters.replaceChildren();

        // All Classes + Class 5 to 12
        const classOptions = [
            { label: "All Classes", value: "all" }
        ];

        for (let number = 5; number <= 12; number++) {
            classOptions.push({
                label: "Class " + number,
                value: String(number)
            });
        }

        classOptions.forEach(option => {
            const button = createFilterButton(
                option.label,
                option.value,
                state.selectedClass === option.value,
                value => {
                    state.selectedClass = value;
                    buildFilters();
                    renderExperiments();
                }
            );

            elements.classFilters.appendChild(button);
        });

        // Simulation type filters
        const modeOptions = [
            { label: "All Types", value: "all" },
            { label: "2D", value: "2D" },
            { label: "3D", value: "3D" }
        ];

        modeOptions.forEach(option => {
            const button = createFilterButton(
                option.label,
                option.value,
                state.selectedMode === option.value,
                value => {
                    state.selectedMode = value;
                    buildFilters();
                    renderExperiments();
                }
            );

            elements.modeFilters.appendChild(button);
        });
    }

    /* -----------------------------------------------------
       FILTER EXPERIMENTS
    ----------------------------------------------------- */

    function getFilteredExperiments() {
        const query = state.search.trim().toLowerCase();

        return state.experiments
            .filter(experiment => {

                const matchesClass =
                    state.selectedClass === "all" ||
                    String(experiment.class) ===
                    state.selectedClass;

                const matchesMode =
                    state.selectedMode === "all" ||
                    String(experiment.simulationType || "")
                        .toUpperCase() ===
                    state.selectedMode;

                const searchableText = [
                    experiment.title,
                    experiment.chapter,
                    experiment.description,
                    experiment.id,
                    "class " + experiment.class
                ].join(" ").toLowerCase();

                const matchesSearch =
                    !query ||
                    searchableText.includes(query);

                return (
                    matchesClass &&
                    matchesMode &&
                    matchesSearch
                );
            })
            .sort((a, b) => {
                const classDifference =
                    Number(a.class || 0) -
                    Number(b.class || 0);

                if (classDifference !== 0) {
                    return classDifference;
                }

                const chapterDifference =
                    Number(a.chapterNumber || 0) -
                    Number(b.chapterNumber || 0);

                if (chapterDifference !== 0) {
                    return chapterDifference;
                }

                return String(a.title || "")
                    .localeCompare(String(b.title || ""));
            });
    }

    /* -----------------------------------------------------
       EXPERIMENT ICON
    ----------------------------------------------------- */

    function getExperimentIcon(experiment) {
        const text = (
            experiment.title + " " + experiment.chapter
        ).toLowerCase();

        if (/wave|sound|frequency|vibration/.test(text))
            return "〰";

        if (/light|mirror|lens|optics|prism/.test(text))
            return "◉";

        if (/electric|circuit|current|voltage|resistance|magnet/.test(text))
            return "ϟ";

        if (/motion|force|friction|projectile|gravity/.test(text))
            return "↗";

        if (/heat|temperature|thermo/.test(text))
            return "♨";

        if (/acid|base|ph|indicator/.test(text))
            return "◒";

        if (/atom|element|periodic|electron/.test(text))
            return "⚛";

        if (/solution|concentration|mixture/.test(text))
            return "◌";

        if (/reaction|chemical|redox/.test(text))
            return "✧";

        if (/gas|solid|liquid|matter/.test(text))
            return "◈";

        return state.subject === "physics" ? "✦" : "⚗";
    }

    /* -----------------------------------------------------
       EXPERIMENT CARD
    ----------------------------------------------------- */

    function createExperimentCard(experiment) {
        const card = document.createElement("article");

        card.className = "experiment-card";

        const title = escapeHtml(experiment.title);
        const description = escapeHtml(
            experiment.description ||
            "Explore this science topic through an interactive experiment."
        );

        const chapter = escapeHtml(
            experiment.chapter || "General Science"
        );

        const classNumber = escapeHtml(experiment.class);

        const chapterNumber = experiment.chapterNumber
            ? "Chapter " + escapeHtml(experiment.chapterNumber)
            : "";

        const simulationType = escapeHtml(
            String(experiment.simulationType || "2D").toUpperCase()
        );

        const icon = escapeHtml(
            getExperimentIcon(experiment)
        );

        card.innerHTML = `
            <div class="card-top">
                <span class="experiment-icon"
                      aria-hidden="true">${icon}</span>

                <span class="type-badge">
                    ${simulationType}
                </span>
            </div>

            <h3>${title}</h3>

            <p>${description}</p>

            <div class="card-meta">
                <span class="class-badge">
                    Class ${classNumber}
                </span>

                <span>${chapterNumber}</span>

                <span>${chapter}</span>
            </div>

            <div class="card-footer">
                <span class="card-note">
                    Interactive experiment
                </span>

                <button
                    class="card-action"
                    type="button"
                    disabled
                    aria-disabled="true">
                    In development
                </button>
            </div>
        `;

        return card;
    }

    /* -----------------------------------------------------
       DISPLAY EXPERIMENTS
    ----------------------------------------------------- */

    function renderExperiments() {
        const filtered = getFilteredExperiments();

        elements.experimentGrid.replaceChildren();

        elements.experimentCount.textContent =
            String(filtered.length);

        if (filtered.length === 0) {
            const empty = document.createElement("div");

            empty.className = "empty-state";

            empty.innerHTML = `
                <strong>No experiments found</strong>
                Try another search or choose a different filter.
            `;

            elements.experimentGrid.appendChild(empty);

            setMessage(
                "No matching experiments. Try another class or chapter."
            );

            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach(experiment => {
            fragment.appendChild(
                createExperimentCard(experiment)
            );
        });

        elements.experimentGrid.appendChild(fragment);

        setMessage(
            "Showing " +
            filtered.length +
            " of " +
            state.experiments.length +
            " " +
            state.subject +
            " experiments."
        );
    }

    /* -----------------------------------------------------
       LOAD ONLINE JSON
    ----------------------------------------------------- */

    async function loadCatalogue() {
        setMessage("Loading experiment catalogue...");

        elements.experimentGrid.replaceChildren();

        try {
            const response = await fetch(
                CATALOGUE_URLS[state.subject],
                {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    },
                    cache: "no-cache"
                }
            );

            if (!response.ok) {
                throw new Error(
                    "HTTP error: " + response.status
                );
            }

            const catalogue = await response.json();

            if (
                !catalogue ||
                !Array.isArray(catalogue.experiments)
            ) {
                throw new Error(
                    "Invalid catalogue format."
                );
            }

            state.experiments =
                catalogue.experiments.filter(item => {
                    return (
                        item &&
                        item.id &&
                        item.title &&
                        Number.isFinite(Number(item.class))
                    );
                });

            if (state.experiments.length === 0) {
                throw new Error(
                    "No valid experiments found."
                );
            }

            state.selectedClass = "all";
            state.selectedMode = "all";

            buildFilters();
            renderExperiments();

        } catch (error) {
            console.error(
                "Virtual Science Lab error:",
                error
            );

            setMessage(
                "The experiment catalogue could not be loaded.",
                "error-state"
            );

            const errorCard =
                document.createElement("div");

            errorCard.className = "error-state";

            errorCard.innerHTML = `
                <strong>Unable to load experiments</strong>
                <p>
                    Check your internet connection and try again.
                </p>
            `;

            const retryButton =
                document.createElement("button");

            retryButton.type = "button";
            retryButton.textContent = "Retry";

            retryButton.addEventListener(
                "click",
                loadCatalogue
            );

            errorCard.appendChild(retryButton);

            elements.experimentGrid.replaceChildren(
                errorCard
            );
        }
    }

    /* -----------------------------------------------------
       START APP
    ----------------------------------------------------- */

    function init() {
        try {
            getElements();

            state.subject = getSubjectFromUrl();

            applySubjectTheme();

            elements.searchInput.addEventListener(
                "input",
                event => {
                    state.search = event.target.value || "";
                    renderExperiments();
                }
            );

            loadCatalogue();

        } catch (error) {
            console.error(
                "Playground initialization failed:",
                error
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }

})();

