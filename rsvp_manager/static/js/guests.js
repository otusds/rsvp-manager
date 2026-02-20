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

        // Guest detail button
        var detailBtn = row.querySelector(".ge-detail-btn");
        if (detailBtn) {
            detailBtn.addEventListener("click", function () {
                detailBtn.closest(".kebab-menu").classList.remove("open");
                openGuestDetail(detailBtn.getAttribute("data-guest-id"), row);
            });
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

    // ── Guest Detail overlay ─────────────────────────────────────────────

    var gdOverlay = document.getElementById("guest-detail-overlay");
    var gdClose = document.getElementById("guest-detail-close");
    var gdForm = document.getElementById("guest-detail-form");
    var gdMeta = document.getElementById("gd-meta");
    var gdActiveRow = null;

    function formatDate(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function statusClass(status) {
        if (status === "Attending") return "status-tag-attending";
        if (status === "Pending") return "status-tag-pending";
        if (status === "Declined") return "status-tag-declined";
        return "";
    }

    function openGuestDetail(guestId, row) {
        gdActiveRow = row;
        window.fetchWithCsrf("/api/v1/guests/" + guestId)
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var g = resp.data;
                document.getElementById("gd-guest-id").value = g.id;
                document.getElementById("gd-first").value = g.first_name;
                document.getElementById("gd-last").value = g.last_name;
                document.getElementById("gd-gender").value = g.gender;
                document.getElementById("gd-notes").value = g.notes;
                document.getElementById("gd-is-me").checked = g.is_me;

                var s = g.invitation_summary;
                var html =
                    '<div class="guest-detail-section-title">Invitation Summary</div>' +
                    '<div class="guest-detail-summary">' +
                        '<div class="stat"><div class="stat-value">' + s.invited + '</div><div class="stat-label">Invited</div></div>' +
                        '<div class="stat"><div class="stat-value stat-color-attending">' + s.attending + '</div><div class="stat-label stat-color-attending">Attending</div></div>' +
                        '<div class="stat"><div class="stat-value stat-color-pending">' + s.pending + '</div><div class="stat-label stat-color-pending">Pending</div></div>' +
                        '<div class="stat"><div class="stat-value stat-color-declined">' + s.declined + '</div><div class="stat-label stat-color-declined">Declined</div></div>' +
                    '</div>';

                if (g.invitations && g.invitations.length > 0) {
                    html += '<div class="guest-detail-inv-list">';
                    g.invitations.forEach(function (inv) {
                        var eventLabel = window.escapeHtml(inv.event_name);
                        if (inv.event_date) eventLabel += ' (' + window.escapeHtml(inv.event_date) + ')';
                        html += '<div class="guest-detail-inv-item">' +
                            '<span class="guest-detail-inv-event">' + eventLabel + '</span>' +
                            '<span class="status-tag ' + statusClass(inv.status) + '">' + window.escapeHtml(inv.status) + '</span>' +
                            '</div>';
                    });
                    html += '</div>';
                }

                html += '<div class="guest-detail-dates">' +
                    'Created: ' + formatDate(g.date_created) + '<br>' +
                    'Last edited: ' + formatDate(g.date_edited) +
                    '</div>';

                gdMeta.innerHTML = html;
                gdOverlay.style.display = "flex";
                document.getElementById("gd-first").focus();
            })
            .catch(window.handleFetchError);
    }

    if (gdOverlay) {
        gdClose.addEventListener("click", function () {
            gdOverlay.style.display = "none";
        });
        gdOverlay.addEventListener("click", function (e) {
            if (e.target === gdOverlay) gdOverlay.style.display = "none";
        });

        gdForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var guestId = document.getElementById("gd-guest-id").value;
            var firstName = document.getElementById("gd-first").value.trim();
            var lastName = document.getElementById("gd-last").value.trim();
            var gender = document.getElementById("gd-gender").value;
            var notes = document.getElementById("gd-notes").value.trim();
            var isMe = document.getElementById("gd-is-me").checked;
            if (!firstName) return;

            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var data = resp.data;
                // Update the table row
                if (gdActiveRow) {
                    var firstInput = gdActiveRow.querySelector(".ge-first");
                    var lastInput = gdActiveRow.querySelector(".ge-last");
                    var genderSelect = gdActiveRow.querySelector(".ge-gender");
                    var notesInput = gdActiveRow.querySelector(".ge-notes");
                    if (firstInput) firstInput.value = firstName;
                    if (lastInput) lastInput.value = lastName;
                    if (genderSelect) genderSelect.value = gender;
                    if (notesInput) notesInput.value = notes;
                    gdActiveRow.setAttribute("data-first", firstName.toLowerCase());
                    gdActiveRow.setAttribute("data-last", lastName.toLowerCase());
                    gdActiveRow.setAttribute("data-gender", gender);
                    // Update is_me highlighting
                    guestsTable.querySelectorAll("tr[data-is-me='true']").forEach(function (r) {
                        r.setAttribute("data-is-me", "false");
                    });
                    if (data.is_me) {
                        gdActiveRow.setAttribute("data-is-me", "true");
                    } else {
                        gdActiveRow.setAttribute("data-is-me", "false");
                    }
                }
                gdOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

});
