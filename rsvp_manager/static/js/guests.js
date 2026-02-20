document.addEventListener("DOMContentLoaded", function () {

    // ── Back-link navigation for Guest Database ────────────────────────────
    var backLink = document.getElementById("back-link");
    var guestsTable = document.getElementById("guests-table");
    if (!guestsTable) {
        // Not on guest DB — store current page info for back navigation
        var h1 = document.querySelector("h1");
        if (h1) {
            sessionStorage.setItem("guestDbBackLabel", h1.textContent.trim());
            sessionStorage.setItem("guestDbBackUrl", window.location.pathname);
        }
    } else if (backLink) {
        // On guest DB — restore back link from stored info
        var label = sessionStorage.getItem("guestDbBackLabel");
        var url = sessionStorage.getItem("guestDbBackUrl");
        if (label && url) {
            backLink.textContent = "\u2190 " + label;
            backLink.href = url;
        }
    }

    // ── Guest Database table search, filter & sort ──────────────────────────
    if (!guestsTable) return;

    var guestSearchInput = document.getElementById("guest-search");
    var guestGenderFilter = document.getElementById("guest-gender-filter");
    var guestSortSelect = document.getElementById("guest-sort");
    var guestNoResults = document.getElementById("no-results");
    var isMobile = window.matchMedia("(max-width: 600px)").matches;

    function sortGuestRows() {
        var tbody = guestsTable.querySelector("tbody");
        var rows = Array.from(tbody.querySelectorAll("tr"));
        var sortVal = guestSortSelect ? guestSortSelect.value : "created-desc";
        var parts = sortVal.split("-");
        var key = parts[0], dir = parts[1];

        rows.sort(function (a, b) {
            var aMe = a.getAttribute("data-is-me") === "true" ? 1 : 0;
            var bMe = b.getAttribute("data-is-me") === "true" ? 1 : 0;
            if (aMe !== bMe) return bMe - aMe;

            var valA, valB;
            if (key === "created") {
                valA = a.getAttribute("data-created") || "";
                valB = b.getAttribute("data-created") || "";
            } else if (key === "first") {
                valA = a.getAttribute("data-first") || "";
                valB = b.getAttribute("data-first") || "";
            } else if (key === "last") {
                valA = a.getAttribute("data-last") || "";
                valB = b.getAttribute("data-last") || "";
            } else if (key === "gender") {
                valA = a.getAttribute("data-gender") || "";
                valB = b.getAttribute("data-gender") || "";
            }
            if (valA < valB) return dir === "asc" ? -1 : 1;
            if (valA > valB) return dir === "asc" ? 1 : -1;
            return 0;
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
    }

    function applyGuestTableControls() {
        sortGuestRows();
        var query = guestSearchInput ? guestSearchInput.value.toLowerCase() : "";
        var genderVal = guestGenderFilter ? guestGenderFilter.value : "";
        var rows = guestsTable.querySelectorAll("tbody tr");
        var visibleCount = 0;
        rows.forEach(function (row) {
            var text = row.textContent.toLowerCase();
            var gender = row.getAttribute("data-gender");
            var matchSearch = !query || text.indexOf(query) !== -1;
            var matchGender = !genderVal || gender === genderVal;
            var show = matchSearch && matchGender;
            row.style.display = show ? "" : "none";
            if (show) visibleCount++;
        });
        if (guestNoResults) guestNoResults.style.display = visibleCount === 0 ? "" : "none";
    }

    if (guestSearchInput) {
        guestSearchInput.addEventListener("input", applyGuestTableControls);
        guestSearchInput.addEventListener("search", applyGuestTableControls);
    }
    if (guestGenderFilter) guestGenderFilter.addEventListener("change", applyGuestTableControls);
    if (guestSortSelect) guestSortSelect.addEventListener("change", applyGuestTableControls);

    // ── Inline editing helpers ────────────────────────────────────────────

    function abbreviateGender(select) {
        if (!isMobile) return;
        Array.from(select.options).forEach(function (opt) {
            if (opt.value === "Male") opt.textContent = "M";
            else if (opt.value === "Female") opt.textContent = "F";
        });
    }
    function expandGender(select) {
        Array.from(select.options).forEach(function (opt) {
            if (opt.value === "Male") opt.textContent = "Male";
            else if (opt.value === "Female") opt.textContent = "Female";
        });
    }

    function positionMeBadge(input) {
        var badge = input.parentNode.querySelector(".badge-me");
        if (!badge) return;
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        var style = getComputedStyle(input);
        ctx.font = style.fontSize + " " + style.fontFamily;
        var textWidth = ctx.measureText(input.value).width;
        var paddingLeft = parseFloat(style.paddingLeft) || 0;
        badge.style.left = (paddingLeft + textWidth + 4) + "px";
    }

    // ── Initialize listeners on a guest row ───────────────────────────────

    function initGuestRow(row) {
        // Kebab menu
        var kebabBtn = row.querySelector(".kebab-btn");
        if (kebabBtn) window.attachKebabListener(kebabBtn);

        // Confirm dialogs
        row.querySelectorAll("form[data-confirm]").forEach(function (form) {
            form.addEventListener("submit", function (e) {
                if (!confirm(form.getAttribute("data-confirm"))) e.preventDefault();
            });
        });

        // Name editing
        row.querySelectorAll(".ge-first, .ge-last").forEach(function (input) {
            input.addEventListener("blur", function () {
                var guestId = input.getAttribute("data-guest-id");
                var firstName = row.querySelector(".ge-first").value.trim();
                var lastName = row.querySelector(".ge-last").value.trim();
                if (!firstName) return;
                row.setAttribute("data-first", firstName.toLowerCase());
                row.setAttribute("data-last", lastName.toLowerCase());
                window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ first_name: firstName, last_name: lastName })
                }).catch(window.handleFetchError);
            });
        });

        // Gender editing
        var genderSelect = row.querySelector(".ge-gender");
        if (genderSelect) {
            abbreviateGender(genderSelect);
            genderSelect.addEventListener("focus", function () { expandGender(genderSelect); });
            genderSelect.addEventListener("blur", function () { abbreviateGender(genderSelect); });
            genderSelect.addEventListener("change", function () {
                var guestId = genderSelect.getAttribute("data-guest-id");
                row.setAttribute("data-gender", genderSelect.value);
                window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ gender: genderSelect.value })
                }).catch(window.handleFetchError);
            });
        }

        // Notes editing
        var notesInput = row.querySelector(".ge-notes");
        if (notesInput) {
            var timer;
            notesInput.addEventListener("input", function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    var guestId = notesInput.getAttribute("data-guest-id");
                    window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ notes: notesInput.value.trim() })
                    }).catch(window.handleFetchError);
                }, 500);
            });
        }

        // "This is me" button
        var isMeBtn = row.querySelector(".ge-is-me-btn");
        if (isMeBtn) {
            isMeBtn.addEventListener("click", function () {
                var guestId = isMeBtn.getAttribute("data-guest-id");
                var wasMe = row.getAttribute("data-is-me") === "true";
                var newVal = !wasMe;
                window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_me: newVal })
                })
                .then(function (res) { return res.json(); })
                .then(function (resp) {
                    var data = resp.data;
                    guestsTable.querySelectorAll("tr[data-is-me='true']").forEach(function (r) {
                        r.setAttribute("data-is-me", "false");
                        var badge = r.querySelector(".badge-me");
                        if (badge) badge.remove();
                        var meBtn = r.querySelector(".ge-is-me-btn");
                        if (meBtn) meBtn.textContent = "This is me";
                    });
                    if (data.is_me) {
                        row.setAttribute("data-is-me", "true");
                        var firstInput = row.querySelector(".ge-first");
                        if (firstInput && !row.querySelector(".badge-me")) {
                            var badge = document.createElement("span");
                            badge.className = "badge-me";
                            badge.textContent = "me";
                            firstInput.parentNode.appendChild(badge);
                            positionMeBadge(firstInput);
                        }
                        isMeBtn.textContent = "\u2713 This is me";
                    } else {
                        row.setAttribute("data-is-me", "false");
                        isMeBtn.textContent = "This is me";
                    }
                    isMeBtn.closest(".kebab-menu").classList.remove("open");
                })
                .catch(window.handleFetchError);
            });
        }

        // Badge positioning
        var firstInput = row.querySelector(".ge-first");
        var badge = row.querySelector(".badge-me");
        if (firstInput && badge) positionMeBadge(firstInput);
        if (firstInput) {
            firstInput.addEventListener("input", function () { positionMeBadge(firstInput); });
            firstInput.addEventListener("blur", function () { positionMeBadge(firstInput); });
        }
    }

    // Initialize all existing rows
    guestsTable.querySelectorAll("tbody tr").forEach(initGuestRow);

    // ── Infinite scroll ──────────────────────────────────────────────────

    var currentPage = parseInt(guestsTable.getAttribute("data-page")) || 1;
    var totalPages = parseInt(guestsTable.getAttribute("data-pages")) || 1;
    var scrollLoader = document.getElementById("scroll-loader");
    var isLoading = false;

    function loadMoreGuests() {
        if (isLoading || currentPage >= totalPages) return;
        isLoading = true;
        currentPage++;
        scrollLoader.style.display = "flex";

        window.fetchWithCsrf("/guests?page=" + currentPage + "&partial=1")
            .then(function (res) { return res.text(); })
            .then(function (html) {
                if (!html.trim()) {
                    totalPages = currentPage - 1;
                    scrollLoader.style.display = "none";
                    isLoading = false;
                    return;
                }
                var tbody = guestsTable.querySelector("tbody");
                var temp = document.createElement("tbody");
                temp.innerHTML = html;
                var newRows = Array.from(temp.querySelectorAll("tr"));
                newRows.forEach(function (row) {
                    tbody.appendChild(row);
                    initGuestRow(row);
                });
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
                loadMoreGuests();
            }
        });
    }

});
