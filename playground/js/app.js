/* =========================================================
   VIRTUAL SCIENCE LAB
   Dynamic Physics & Chemistry Experiment Catalogue

   AUTOMATIC SIMULATION WORKFLOW:
   1. Add the experiment entry to the subject JSON catalogue.
   2. Create its folder and index.html.

   Physics:
   playground/simulations/physics/<experiment-id>/index.html

   Chemistry:
   playground/simulations/chemistry/<experiment-id>/index.html

   The launcher checks if index.html exists before enabling
   the Open Lab button.

   Existing simulationPath values in JSON are still supported.
   ========================================================= */

(() => {
    "use strict";

    const CATALOGUE_URLS = {
        physics: "../catalog/physics.json",
        chemistry: "../catalog/chemistry.json"
    };

    const SUBJECT_CONFIG = {
        physics: {
            title: "Physics Playground",
            subtitle: "Explore motion, waves, light, electricity and the laws of the physical world.",
            eyebrow: "FORCE • LIGHT • ENERGY • WAVES",
            accent: "#5795ff"
        },
        chemistry: {
            title: "Chemistry Playground",
            subtitle: "Explore matter, atoms, reactions, solutions and the chemistry around you.",
            eyebrow: "ATOMS • BONDS • REACTIONS • MATTER",
            accent: "#31d6ae"
        }
    };

    /*
       Compatibility paths for existing folders whose names
       are different from their experiment IDs.
    */
    const LEGACY_SIMULATION_PATHS = {
        "class-10-solenoid-electromagnet":
            "simulations/physics/solenoid-electromagnet/"
    };

    const state = {
        subject: "physics",
        experiments: [],
        selectedClass: "all",
        selectedMode: "all",
        search: "",
        routeObserver: null,
        routeChecks: new Map()
    };

    const elements = {};

    /* ---------------------------------------------------------
       HTML ELEMENTS
    --------------------------------------------------------- */

    function getElements() {
        elements.subjectEyebrow = document.getElementById("subjectEyebrow");
        elements.pageTitle = document.getElementById("pageTitle");
        elements.pageSubtitle = document.getElementById("pageSubtitle");
        elements.experimentCount = document.getElementById("experimentCount");
        elements.searchInput = document.getElementById("searchInput");
        elements.classFilters = document.getElementById("classFilters");
        elements.modeFilters = document.getElementById("modeFilters");
        elements.catalogueMessage = document.getElementById("catalogueMessage");
        elements.experimentGrid = document.getElementById("experimentGrid");

        const required = Object.entries(elements)
            .filter(([, element]) => !element)
            .map(([name]) => name);

        if (required.length) {
            throw new Error("Missing HTML elements: " + required.join(", "));
        }
    }

    /* ---------------------------------------------------------
       SUBJECT SELECTION + THEME
    --------------------------------------------------------- */

    function getSubjectFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const subject = (params.get("subject") || "physics").toLowerCase();

        return Object.prototype.hasOwnProperty.call(CATALOGUE_URLS, subject)
            ? subject
            : "physics";
    }

    function applySubjectTheme() {
        const config = SUBJECT_CONFIG[state.subject];

        document.documentElement.style.setProperty("--accent", config.accent);
        document.documentElement.dataset.subject = state.subject;

        elements.subjectEyebrow.textContent = config.eyebrow;
        elements.pageTitle.textContent = config.title;
        elements.pageSubtitle.textContent = config.subtitle;

        document.title = config.title + " | Virtual Science Lab";
    }

    /* ---------------------------------------------------------
       SAFE TEXT + MESSAGES
    --------------------------------------------------------- */

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function setMessage(message, type = "info") {
        elements.catalogueMessage.className = "catalogue-message " + type;
        elements.catalogueMessage.textContent = message;
        elements.catalogueMessage.hidden = !message;
    }

    /* ---------------------------------------------------------
       FILTER BUTTONS
    --------------------------------------------------------- */

    function createFilterButton(label, value, selected, onClick) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "filter-chip" + (selected ? " active" : "");
        button.textContent = label;
        button.setAttribute("aria-pressed", selected ? "true" : "false");

        button.addEventListener("click", () => onClick(value));

        return button;
    }

    function buildFilters() {
        elements.classFilters.replaceChildren();
        elements.modeFilters.replaceChildren();

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
            elements.classFilters.appendChild(
                createFilterButton(
                    option.label,
                    option.value,
                    state.selectedClass === option.value,
                    value => {
                        state.selectedClass = value;
                        buildFilters();
                        renderExperiments();
                    }
                )
            );
        });

        const modeOptions = [
            { label: "All Types", value: "all" },
            { label: "2D", value: "2D" },
            { label: "3D", value: "3D" }
        ];

        modeOptions.forEach(option => {
            elements.modeFilters.appendChild(
                createFilterButton(
                    option.label,
                    option.value,
                    state.selectedMode === option.value,
                    value => {
                        state.selectedMode = value;
                        buildFilters();
                        renderExperiments();
                    }
                )
            );
        });
    }

    /* ---------------------------------------------------------
       FILTER + SORT EXPERIMENTS
    --------------------------------------------------------- */

    function getFilteredExperiments() {
        const query = state.search.trim().toLowerCase();

        return state.experiments
            .filter(experiment => {
                const matchesClass =
                    state.selectedClass === "all" ||
                    String(experiment.class) === state.selectedClass;

                const matchesMode =
                    state.selectedMode === "all" ||
                    String(experiment.simulationType || "").toUpperCase() ===
                    state.selectedMode;

                const searchableText = [
                    experiment.title,
                    experiment.chapter,
                    experiment.description,
                    experiment.id,
                    "class " + experiment.class
                ].join(" ").toLowerCase();

                const matchesSearch =
                    !query || searchableText.includes(query);

                return matchesClass && matchesMode && matchesSearch;
            })
            .sort((a, b) => {
                const classDifference =
                    Number(a.class || 0) - Number(b.class || 0);

                if (classDifference !== 0) return classDifference;

                const chapterDifference =
                    Number(a.chapterNumber || 0) -
                    Number(b.chapterNumber || 0);

                if (chapterDifference !== 0) return chapterDifference;

                return String(a.title || "").localeCompare(
                    String(b.title || "")
                );
            });
    }

    /* ---------------------------------------------------------
       EXPERIMENT ICON
    --------------------------------------------------------- */

    function getExperimentIcon(experiment) {
        const text = (
            String(experiment.title || "") + " " +
            String(experiment.chapter || "")
        ).toLowerCase();

        if (/wave|sound|frequency|vibration/.test(text)) return "〰";
        if (/light|mirror|lens|optics|prism/.test(text)) return "◉";
        if (/electric|circuit|current|voltage|resistance|magnet/.test(text)) return "ϟ";
        if (/motion|force|friction|projectile|gravity/.test(text)) return "↗";
        if (/heat|temperature|thermo/.test(text)) return "♨";
        if (/acid|base|ph|indicator/.test(text)) return "◒";
        if (/atom|element|periodic|electron/.test(text)) return "⚛";
        if (/solution|concentration|mixture/.test(text)) return "◌";
        if (/reaction|chemical|redox/.test(text)) return "✧";
        if (/gas|solid|liquid|matter/.test(text)) return "◈";

        return state.subject === "physics" ? "✦" : "⚗";
    }

    /* ---------------------------------------------------------
       AUTOMATIC SIMULATION ROUTES

       Priority:
       1. simulationPath written in JSON.
       2. Legacy folder compatibility path.
       3. Automatic folder from subject + experiment ID.

       Automatic paths:
       simulations/physics/<experiment-id>/
       simulations/chemistry/<experiment-id>/
    --------------------------------------------------------- */

    function isSafeRelativePath(path) {
        return typeof path === "string" &&
            path.length > 0 &&
            !path.startsWith("/") &&
            !path.includes("..") &&
            !/[?#\\\s]/.test(path) &&
            /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(path);
    }

    function getSimulationUrl(experiment) {
        let path = "";

        /*
           Existing explicit JSON paths are supported.
        */
        if (
            typeof experiment.simulationPath === "string" &&
            experiment.simulationPath.trim()
        ) {
            path = experiment.simulationPath
                .trim()
                .replace(/^\.\/+/, "");
        }

        /*
           Old folder names are supported through aliases.
        */
        else if (LEGACY_SIMULATION_PATHS[experiment.id]) {
            path = LEGACY_SIMULATION_PATHS[experiment.id];
        }

        /*
           New experiments use automatic ID-based folders.
        */
        else {
            const id = String(experiment.id || "").trim();

            if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(id)) {
                return null;
            }

            path =
                "simulations/" +
                state.subject +
                "/" +
                id +
                "/";
        }

        if (!isSafeRelativePath(path)) {
            console.warn("Unsafe simulation path:", experiment.id);
            return null;
        }

        try {
            const playgroundBase = new URL("./", window.location.href);

            const target = new URL(
                path.endsWith("/") ? path : path + "/",
                playgroundBase
            );

            if (target.origin !== window.location.origin) {
                return null;
            }

            return target.href;
        } catch (error) {
            console.warn("Could not build simulation URL:", error);
            return null;
        }
    }

    /* ---------------------------------------------------------
       CHECK IF SIMULATION FILE EXISTS
    --------------------------------------------------------- */

    async function checkSimulationExists(simulationUrl) {
        if (state.routeChecks.has(simulationUrl)) {
            return state.routeChecks.get(simulationUrl);
        }

        const checkPromise = (async () => {
            try {
                const indexUrl =
                    new URL("index.html", simulationUrl).href;

                let response = await fetch(indexUrl, {
                    method: "HEAD",
                    cache: "no-store"
                });

                /*
                   Some hosts do not support HEAD requests.
                   Try GET in that case.
                */
                if (
                    response.status === 405 ||
                    response.status === 501
                ) {
                    response = await fetch(indexUrl, {
                        method: "GET",
                        cache: "no-store",
                        headers: { Range: "bytes=0-0" }
                    });
                }

                return response.ok;
            } catch (error) {
                console.warn(
                    "Simulation availability check failed:",
                    simulationUrl,
                    error
                );

                return false;
            }
        })();

        state.routeChecks.set(simulationUrl, checkPromise);

        return checkPromise;
    }

    /* ---------------------------------------------------------
       UPDATE CARD BUTTON
    --------------------------------------------------------- */

    function setCardRouteState(card, simulationUrl, exists) {
        if (!card.isConnected) return;

        const button = card.querySelector("[data-open-simulation]");

        if (!button) return;

        if (exists) {
            button.disabled = false;
            button.removeAttribute("aria-disabled");
            button.textContent = "Open Lab →";
            button.classList.add("ready");

            button.addEventListener(
                "click",
                () => {
                    window.location.assign(simulationUrl);
                },
                { once: true }
            );
        } else {
            button.disabled = true;
            button.setAttribute("aria-disabled", "true");
            button.textContent = "In development";
            button.classList.remove("ready");
        }
    }

    async function verifyCardRoute(card, simulationUrl) {
        const button = card.querySelector("[data-open-simulation]");

        if (!button) return;

        button.textContent = "Checking…";
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");

        const exists = await checkSimulationExists(simulationUrl);

        setCardRouteState(card, simulationUrl, exists);
    }

    /* ---------------------------------------------------------
       OBSERVE VISIBLE CARDS
    --------------------------------------------------------- */

    function createRouteObserver() {
        if (state.routeObserver) {
            state.routeObserver.disconnect();
        }

        if (!("IntersectionObserver" in window)) {
            state.routeObserver = null;
            return;
        }

        state.routeObserver = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;

                    const card = entry.target;

                    state.routeObserver.unobserve(card);

                    const url = card.dataset.routeUrl;

                    if (url) {
                        verifyCardRoute(card, url);
                    }
                });
            },
            {
                root: null,
                rootMargin: "300px 0px",
                threshold: 0.01
            }
        );
    }

    /* ---------------------------------------------------------
       EXPERIMENT CARD
    --------------------------------------------------------- */

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

        const icon = escapeHtml(getExperimentIcon(experiment));

        const simulationUrl = getSimulationUrl(experiment);

        card.innerHTML = `
            <div class="card-top">
                <span class="experiment-icon" aria-hidden="true">${icon}</span>
                <span class="type-badge">${simulationType}</span>
            </div>

            <h3>${title}</h3>

            <p>${description}</p>

            <div class="card-meta">
                <span class="class-badge">Class ${classNumber}</span>
                <span>${chapterNumber}</span>
                <span>${chapter}</span>
            </div>

            <div class="card-footer">
                <span class="card-note">Interactive experiment</span>

                <button
                    class="card-action"
                    type="button"
                    data-open-simulation
                    disabled
                    aria-disabled="true"
                >
                    ${simulationUrl ? "Checking…" : "In development"}
                </button>
            </div>
        `;

        if (simulationUrl) {
            card.dataset.routeUrl = simulationUrl;
        }

        return card;
    }

    /* ---------------------------------------------------------
       DISPLAY EXPERIMENTS
    --------------------------------------------------------- */

    function renderExperiments() {
        const filtered = getFilteredExperiments();

        if (state.routeObserver) {
            state.routeObserver.disconnect();
        }

        createRouteObserver();

        elements.experimentGrid.replaceChildren();

        elements.experimentCount.textContent =
            String(filtered.length);

        if (!filtered.length) {
            const empty = document.createElement("div");

            empty.className = "empty-state";

            const heading = document.createElement("strong");

            heading.textContent = "No experiments found";

            const message = document.createElement("p");

            message.textContent =
                "Try another search or choose a different filter.";

            empty.append(heading, message);

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

        /*
           Only check cards after they are attached to the page.
        */
        elements.experimentGrid
            .querySelectorAll(".experiment-card")
            .forEach(card => {
                const url = card.dataset.routeUrl;

                if (!url) return;

                if (state.routeObserver) {
                    state.routeObserver.observe(card);
                } else {
                    verifyCardRoute(card, url);
                }
            });

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

    /* ---------------------------------------------------------
       LOAD ONLINE JSON CATALOGUE
    --------------------------------------------------------- */

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
                throw new Error("Invalid catalogue format.");
            }

            state.experiments =
                catalogue.experiments.filter(item => (
                    item &&
                    item.id &&
                    item.title &&
                    Number.isFinite(Number(item.class))
                ));

            if (!state.experiments.length) {
                throw new Error("No valid experiments found.");
            }

            state.selectedClass = "all";
            state.selectedMode = "all";

            state.routeChecks.clear();

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

            const errorCard = document.createElement("div");

            errorCard.className = "error-state";

            const heading = document.createElement("strong");

            heading.textContent = "Unable to load experiments";

            const message = document.createElement("p");

            message.textContent =
                "Check your internet connection and try again.";

            const retryButton = document.createElement("button");

            retryButton.type = "button";
            retryButton.textContent = "Retry";

            retryButton.addEventListener(
                "click",
                loadCatalogue
            );

            errorCard.append(
                heading,
                message,
                retryButton
            );

            elements.experimentGrid.replaceChildren(errorCard);
        }
    }

    /* ---------------------------------------------------------
       START APP
    --------------------------------------------------------- */

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
