document.addEventListener("DOMContentLoaded", function () {

    // ── New Event modal ──────────────────────────────────────────────────────
    var newEventBtn = document.getElementById("open-new-event-btn");
    var newEventOverlay = document.getElementById("new-event-overlay");
    var newEventClose = document.getElementById("new-event-close");
    if (newEventBtn && newEventOverlay) {
        newEventBtn.addEventListener("click", function () {
            newEventOverlay.style.display = "flex";
            var nameInput = document.getElementById("ne-name");
            if (nameInput) nameInput.focus();
        });
        newEventClose.addEventListener("click", function () {
            newEventOverlay.style.display = "none";
        });
        newEventOverlay.addEventListener("click", function (e) {
            if (e.target === newEventOverlay) newEventOverlay.style.display = "none";
        });
    }

    // ── Edit Event modal ─────────────────────────────────────────────────────
    var editEventBtn = document.getElementById("open-edit-event-btn");
    var editEventOverlay = document.getElementById("edit-event-overlay");
    var editEventClose = document.getElementById("edit-event-close");
    if (editEventBtn && editEventOverlay) {
        editEventBtn.addEventListener("click", function () {
            var menu = editEventBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            editEventOverlay.style.display = "flex";
        });
        editEventClose.addEventListener("click", function () {
            editEventOverlay.style.display = "none";
        });
        editEventOverlay.addEventListener("click", function (e) {
            if (e.target === editEventOverlay) editEventOverlay.style.display = "none";
        });
    }

    // ── Event card search, filter & sort ─────────────────────────────────────
    var grid = document.getElementById("event-grid");
    if (!grid) return;

    var searchInput = document.getElementById("event-search");
    var typeFilter = document.getElementById("event-type-filter");
    var locationFilter = document.getElementById("event-location-filter");
    var sortSelect = document.getElementById("event-sort");
    var noResults = document.getElementById("no-results");
    var pastSection = document.getElementById("past-events-section");
    var pastGrid = document.getElementById("past-event-grid");
    var pastToggle = document.getElementById("past-events-toggle");
    var pastCount = document.getElementById("past-events-count");

    function sortCards(cards) {
        if (!sortSelect) return;
        var sortVal = sortSelect.value;
        var parts = sortVal.split("-");
        var key = parts[0], dir = parts[1];

        cards.sort(function (a, b) {
            var valA, valB;
            if (key === "date") {
                valA = a.getAttribute("data-date");
                valB = b.getAttribute("data-date");
            } else if (key === "created") {
                valA = a.getAttribute("data-created") || "9999";
                valB = b.getAttribute("data-created") || "9999";
            } else if (key === "name") {
                valA = a.getAttribute("data-name");
                valB = b.getAttribute("data-name");
            } else if (key === "guests") {
                valA = parseInt(a.getAttribute("data-guests")) || 0;
                valB = parseInt(b.getAttribute("data-guests")) || 0;
                return dir === "asc" ? valA - valB : valB - valA;
            }
            if (valA < valB) return dir === "asc" ? -1 : 1;
            if (valA > valB) return dir === "asc" ? 1 : -1;
            return 0;
        });
    }

    function applyCardControls() {
        var query = searchInput ? searchInput.value.toLowerCase() : "";
        var typeVal = typeFilter ? typeFilter.value : "";
        var allCards = Array.from(document.querySelectorAll(".event-row-card"));
        var futureCards = [];
        var pastCards = [];

        allCards.forEach(function (card) {
            var name = card.getAttribute("data-name");
            var location = card.getAttribute("data-location");
            var type = card.getAttribute("data-type");
            var isPast = card.getAttribute("data-past") === "true";
            var locVal = locationFilter ? locationFilter.value : "";
            var matchSearch = !query || name.indexOf(query) !== -1 || location.indexOf(query) !== -1;
            var matchType = !typeVal || type === typeVal;
            var matchLocation = !locVal || location === locVal.toLowerCase();
            var show = matchSearch && matchType && matchLocation;
            card.style.display = show ? "" : "none";
            if (show) {
                if (isPast) pastCards.push(card);
                else futureCards.push(card);
            }
        });

        sortCards(futureCards);
        sortCards(pastCards);

        futureCards.forEach(function (c) { grid.appendChild(c); });

        if (pastSection) {
            if (pastCards.length > 0) {
                pastSection.style.display = "block";
                pastCount.textContent = pastCards.length;
                pastCards.forEach(function (c) { pastGrid.appendChild(c); });
            } else {
                pastSection.style.display = "none";
            }
        }

        var totalVisible = futureCards.length + pastCards.length;
        if (noResults) noResults.style.display = totalVisible === 0 ? "block" : "none";
    }

    if (pastToggle) {
        pastToggle.addEventListener("click", function () {
            var isOpen = pastToggle.classList.toggle("open");
            pastGrid.style.display = isOpen ? "flex" : "none";
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", applyCardControls);
        searchInput.addEventListener("search", applyCardControls);
    }
    if (typeFilter) typeFilter.addEventListener("change", applyCardControls);
    if (locationFilter) locationFilter.addEventListener("change", applyCardControls);
    if (sortSelect) sortSelect.addEventListener("change", applyCardControls);

    // Initial separation of past events
    applyCardControls();

    // ── Infinite scroll ──────────────────────────────────────────────────

    var currentPage = parseInt(grid.getAttribute("data-page")) || 1;
    var totalPages = parseInt(grid.getAttribute("data-pages")) || 1;
    var scrollLoader = document.getElementById("scroll-loader");
    var isLoading = false;

    function loadMoreEvents() {
        if (isLoading || currentPage >= totalPages) return;
        isLoading = true;
        currentPage++;
        scrollLoader.style.display = "flex";

        window.fetchWithCsrf("/?page=" + currentPage + "&partial=1")
            .then(function (res) { return res.text(); })
            .then(function (html) {
                if (!html.trim()) {
                    totalPages = currentPage - 1;
                    scrollLoader.style.display = "none";
                    isLoading = false;
                    return;
                }
                var temp = document.createElement("div");
                temp.innerHTML = html;
                var newCards = Array.from(temp.querySelectorAll(".event-row-card"));
                newCards.forEach(function (card) {
                    grid.appendChild(card);
                });
                // Re-run sort/filter to place new cards correctly
                applyCardControls();
                scrollLoader.style.display = "none";
                isLoading = false;
            })
            .catch(function (err) {
                window.handleFetchError(err);
                scrollLoader.style.display = "none";
                isLoading = false;
            });
    }

    if (totalPages > 1) {
        window.addEventListener("scroll", function () {
            if (isLoading || currentPage >= totalPages) return;
            var scrollBottom = window.innerHeight + window.scrollY;
            var docHeight = document.documentElement.scrollHeight;
            if (scrollBottom >= docHeight - 200) {
                loadMoreEvents();
            }
        });
    }

});
