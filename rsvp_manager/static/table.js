document.addEventListener("DOMContentLoaded", function () {

    // ── CSRF helper ─────────────────────────────────────────────────────────
    var csrfToken = (document.querySelector('meta[name="csrf-token"]') || {}).getAttribute
        ? document.querySelector('meta[name="csrf-token"]').getAttribute("content") || ""
        : "";

    window.fetchWithCsrf = function (url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers["X-CSRFToken"] = csrfToken;
        return fetch(url, options);
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    window.handleFetchError = function (err) {
        console.error("Request failed:", err);
    };

    window.escapeHtml = function (str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    };

    // ── Kebab (3-dot) menu toggle ───────────────────────────────────────────

    window.attachKebabListener = function (btn) {
        if (btn.dataset.kebabBound) return;
        btn.dataset.kebabBound = "1";
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var menu = btn.nextElementSibling;
            document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
                if (m !== menu) m.classList.remove("open");
            });
            menu.classList.toggle("open");
        });
    };

    document.querySelectorAll(".kebab-btn").forEach(window.attachKebabListener);

    // Close kebab menus on click outside
    document.addEventListener("click", function () {
        document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
            m.classList.remove("open");
        });
    });

    // ── Collapsible sections ────────────────────────────────────────────────
    document.querySelectorAll(".collapsible-header").forEach(function (header) {
        header.addEventListener("click", function (e) {
            if (e.target.closest(".kebab-wrapper")) return;
            header.parentElement.classList.toggle("collapsed");
        });
    });

    // ── Confirm dialogs ─────────────────────────────────────────────────────
    document.querySelectorAll("form[data-confirm]").forEach(function (form) {
        form.addEventListener("submit", function (e) {
            if (!confirm(form.getAttribute("data-confirm"))) e.preventDefault();
        });
    });

    // ── Hamburger menu ──────────────────────────────────────────────────────
    var hamburgerBtn = document.getElementById("hamburger-btn");
    var hamburgerMenu = document.getElementById("hamburger-menu");
    var hamburgerOverlay = document.getElementById("hamburger-overlay");

    if (hamburgerBtn) {
        function toggleHamburger() {
            var isOpen = hamburgerMenu.classList.toggle("open");
            hamburgerBtn.classList.toggle("active", isOpen);
            hamburgerOverlay.classList.toggle("open", isOpen);
        }
        function closeHamburger() {
            hamburgerMenu.classList.remove("open");
            hamburgerBtn.classList.remove("active");
            hamburgerOverlay.classList.remove("open");
        }
        hamburgerBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleHamburger();
        });
        hamburgerOverlay.addEventListener("click", closeHamburger);
    }

    // ── Filter toggle buttons ───────────────────────────────────────────────
    function setupFilterToggle(btnId, panelId) {
        var btn = document.getElementById(btnId);
        var panel = document.getElementById(panelId);
        if (btn && panel) {
            btn.addEventListener("click", function () {
                var hidden = panel.style.display === "none";
                panel.style.display = hidden ? "flex" : "none";
                btn.classList.toggle("active", hidden);
            });
        }
    }
    setupFilterToggle("toggle-filters-btn", "event-filters");
    setupFilterToggle("gl-toggle-filters-btn", "gl-filters");

    // ── Add New Guest modal (shared between event detail + guest DB pages) ──

    var addGuestOverlay = document.getElementById("add-guest-overlay");
    var addGuestClose = document.getElementById("add-guest-close");
    var addGuestTbody = document.getElementById("add-guest-tbody");
    var addGuestSaveBtn = document.getElementById("add-guest-save-btn");

    function createBlankGuestRow() {
        var tr = document.createElement("tr");
        tr.innerHTML =
            '<td><input type="text" class="ag-first-name" placeholder="First name"></td>' +
            '<td><input type="text" class="ag-last-name" placeholder="Last name"></td>' +
            '<td><select class="ag-gender"><option value="Male">Male</option><option value="Female">Female</option></select></td>' +
            '<td><button type="button" class="add-guest-remove-btn">&times;</button></td>';

        tr.querySelector(".add-guest-remove-btn").addEventListener("click", function () {
            tr.remove();
            if (addGuestTbody.querySelectorAll("tr").length === 0) {
                addGuestTbody.appendChild(createBlankGuestRow());
            }
        });

        tr.querySelectorAll("input").forEach(function (input) {
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    var firstName = tr.querySelector(".ag-first-name").value.trim();
                    if (firstName) {
                        var newRow = createBlankGuestRow();
                        addGuestTbody.appendChild(newRow);
                        newRow.querySelector(".ag-first-name").focus();
                    }
                }
            });
        });

        return tr;
    }

    window.openAddGuestModal = function () {
        addGuestTbody.innerHTML = "";
        addGuestTbody.appendChild(createBlankGuestRow());
        addGuestOverlay.style.display = "flex";
        addGuestTbody.querySelector(".ag-first-name").focus();
    };

    // Event page trigger (inside kebab menu)
    var addNewGuestBtn = document.getElementById("add-new-guest-btn");
    if (addNewGuestBtn && addGuestOverlay) {
        addNewGuestBtn.addEventListener("click", function () {
            var menu = addNewGuestBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            window.openAddGuestModal();
        });
    }

    // Guest DB page trigger (header button)
    var openAddGuestPageBtn = document.getElementById("open-add-guest-btn");
    if (openAddGuestPageBtn && addGuestOverlay) {
        openAddGuestPageBtn.addEventListener("click", window.openAddGuestModal);
    }

    if (addGuestOverlay) {
        addGuestClose.addEventListener("click", function () {
            addGuestOverlay.style.display = "none";
        });
        addGuestOverlay.addEventListener("click", function (e) {
            if (e.target === addGuestOverlay) addGuestOverlay.style.display = "none";
        });

        addGuestSaveBtn.addEventListener("click", function () {
            var guests = [];
            addGuestTbody.querySelectorAll("tr").forEach(function (row) {
                var firstName = row.querySelector(".ag-first-name").value.trim();
                if (!firstName) return;
                guests.push({
                    first_name: firstName,
                    last_name: row.querySelector(".ag-last-name").value.trim(),
                    gender: row.querySelector(".ag-gender").value,
                    notes: ""
                });
            });

            if (guests.length === 0) {
                addGuestOverlay.style.display = "none";
                return;
            }

            var invTable = document.getElementById("invitations-table");
            var eventId = invTable ? invTable.getAttribute("data-event-id") : null;

            if (eventId) {
                // Event page: create guests and add as invitations
                window.fetchWithCsrf("/api/v1/events/" + eventId + "/invitations/bulk-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guests: guests })
                })
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    var tbody = document.querySelector("#invitations-table tbody");
                    resp.data.forEach(function (g) {
                        var tr = window.buildInvitationRow(g);
                        tbody.appendChild(tr);
                    });
                    window.refreshSummary();
                    addGuestOverlay.style.display = "none";
                })
                .catch(window.handleFetchError);
            } else {
                // Guest DB page: create guests only, reload to get inline-edit rows
                window.fetchWithCsrf("/api/v1/guests/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guests: guests })
                })
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    if (resp.data.length > 0) location.reload();
                    else addGuestOverlay.style.display = "none";
                })
                .catch(window.handleFetchError);
            }
        });
    }

});
document.addEventListener("DOMContentLoaded", function () {

    // ── Table search ─────────────────────────────────────────────────────────
    document.querySelectorAll(".search-input[data-table]").forEach(function (input) {
        var tableId = input.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        input.addEventListener("input", function () { window.filterTable(table); });
        input.addEventListener("search", function () { window.filterTable(table); });
    });

    // ── Table filter dropdowns ───────────────────────────────────────────────
    document.querySelectorAll(".filter-select[data-table]").forEach(function (select) {
        var tableId = select.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        select.addEventListener("change", function () { window.filterTable(table); });
    });

    // Sort-by dropdowns (toggles direction on re-select)
    document.querySelectorAll(".sort-select[data-table]").forEach(function (select) {
        var tableId = select.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        var lastSortKey = "";
        var sortDir = "asc";
        select.addEventListener("change", function () {
            if (!select.value) return;
            var parts = select.value.split(":");
            var colIndex = parseInt(parts[0]);
            var sortType = parts[1]; // text, last, gender, check
            var sortKey = select.value;
            if (sortKey === lastSortKey) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortDir = "asc";
                lastSortKey = sortKey;
            }
            var dir = sortDir;
            setTimeout(function () { select.selectedIndex = 0; }, 0);
            var tbody = table.querySelector("tbody");
            var rows = Array.from(tbody.querySelectorAll("tr:not(.add-guest-row)"));
            rows.sort(function (a, b) {
                var valA, valB;
                if (sortType === "gender") {
                    valA = (a.getAttribute("data-gender") || "").toLowerCase();
                    valB = (b.getAttribute("data-gender") || "").toLowerCase();
                } else if (sortType === "last") {
                    var nameA = (a.cells[colIndex] ? a.cells[colIndex].textContent.trim() : "").replace(/\s*\([MF]\)\s*$/, "");
                    var nameB = (b.cells[colIndex] ? b.cells[colIndex].textContent.trim() : "").replace(/\s*\([MF]\)\s*$/, "");
                    valA = nameA.split(" ").slice(1).join(" ").toLowerCase() || nameA.toLowerCase();
                    valB = nameB.split(" ").slice(1).join(" ").toLowerCase() || nameB.toLowerCase();
                } else if (sortType === "check") {
                    var cbA = a.cells[colIndex] && a.cells[colIndex].querySelector("input[type=checkbox]");
                    var cbB = b.cells[colIndex] && b.cells[colIndex].querySelector("input[type=checkbox]");
                    valA = cbA && cbA.checked ? "1" : "0";
                    valB = cbB && cbB.checked ? "1" : "0";
                } else {
                    var cellA = a.cells[colIndex], cellB = b.cells[colIndex];
                    var selA = cellA && cellA.querySelector("select");
                    var selB = cellB && cellB.querySelector("select");
                    valA = selA ? selA.value.toLowerCase() : (cellA ? cellA.textContent.trim().toLowerCase() : "");
                    valB = selB ? selB.value.toLowerCase() : (cellB ? cellB.textContent.trim().toLowerCase() : "");
                }
                if (valA < valB) return dir === "asc" ? -1 : 1;
                if (valA > valB) return dir === "asc" ? 1 : -1;
                return 0;
            });
            rows.forEach(function (row) { tbody.appendChild(row); });

            var thIndex = sortType === "gender" ? 1 : colIndex;
            var ths = table.querySelectorAll("th");
            ths.forEach(function (h) {
                h.classList.remove("sort-asc", "sort-desc");
                h.removeAttribute("data-dir");
            });
            if (ths[thIndex]) {
                ths[thIndex].classList.add(dir === "asc" ? "sort-asc" : "sort-desc");
                ths[thIndex].setAttribute("data-dir", dir);
            }
        });
    });

    // ── filterTable (shared) ─────────────────────────────────────────────────

    window.filterTable = function (table) {
        var tableId = table.id;
        var searchInput = document.querySelector('.search-input[data-table="' + tableId + '"]');
        var query = searchInput ? searchInput.value.toLowerCase() : "";
        var filters = [];
        document.querySelectorAll('.filter-select[data-table="' + tableId + '"]').forEach(function (sel) {
            var val = sel.value;
            if (!val) return;
            var attr = sel.getAttribute("data-attr");
            if (attr) {
                filters.push({ attr: attr, val: val });
            } else {
                filters.push({ col: parseInt(sel.getAttribute("data-col")), val: val });
            }
        });

        var rows = table.querySelectorAll("tbody tr");
        rows.forEach(function (row) {
            if (row.classList.contains("add-guest-row")) return;
            var text = row.textContent.toLowerCase();
            var matchesSearch = !query || text.indexOf(query) !== -1;
            var matchesFilters = true;
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                var cellText;
                if (f.attr) {
                    cellText = row.getAttribute(f.attr) || "";
                } else {
                    var cell = row.cells[f.col];
                    if (!cell) continue;
                    cellText = cell.textContent.trim();
                    var selectEl = cell.querySelector("select");
                    if (selectEl) cellText = selectEl.value;
                }
                if (cellText !== f.val) { matchesFilters = false; break; }
            }
            row.style.display = (matchesSearch && matchesFilters) ? "" : "none";
        });
    };

    // ── Table sort (header click) ────────────────────────────────────────────
    document.querySelectorAll("table.sortable th[data-sort]").forEach(function (th) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
            var table = th.closest("table");
            var tbody = table.querySelector("tbody");
            var rows = Array.from(tbody.querySelectorAll("tr:not(.add-guest-row)"));
            var colIndex = Array.from(th.parentNode.children).indexOf(th);
            var sortType = th.getAttribute("data-sort");
            var currentDir = th.getAttribute("data-dir");
            var dir = currentDir === "asc" ? "desc" : "asc";

            table.querySelectorAll("th[data-sort]").forEach(function (h) {
                h.removeAttribute("data-dir");
                h.classList.remove("sort-asc", "sort-desc");
            });
            th.setAttribute("data-dir", dir);
            th.classList.add(dir === "asc" ? "sort-asc" : "sort-desc");

            rows.sort(function (a, b) {
                var cellA = a.cells[colIndex], cellB = b.cells[colIndex];
                var valA, valB;
                if (sortType === "num") {
                    valA = parseFloat(cellA.textContent) || 0;
                    valB = parseFloat(cellB.textContent) || 0;
                    return dir === "asc" ? valA - valB : valB - valA;
                } else if (sortType === "check") {
                    var cbA = cellA.querySelector("input[type=checkbox]");
                    var cbB = cellB.querySelector("input[type=checkbox]");
                    valA = cbA && cbA.checked ? "1" : "0";
                    valB = cbB && cbB.checked ? "1" : "0";
                } else {
                    var selA = cellA.querySelector("select");
                    var selB = cellB.querySelector("select");
                    var inpA = cellA.querySelector("input");
                    var inpB = cellB.querySelector("input");
                    valA = selA ? selA.value.toLowerCase() : inpA ? inpA.value.toLowerCase() : cellA.textContent.trim().toLowerCase();
                    valB = selB ? selB.value.toLowerCase() : inpB ? inpB.value.toLowerCase() : cellB.textContent.trim().toLowerCase();
                }
                if (valA < valB) return dir === "asc" ? -1 : 1;
                if (valA > valB) return dir === "asc" ? 1 : -1;
                return 0;
            });

            var addRow = tbody.querySelector(".add-guest-row");
            rows.forEach(function (row) { tbody.appendChild(row); });
            if (addRow) tbody.appendChild(addRow);
        });
    });

    // ── Page 3-dot menu ─────────────────────────────────────────────────────
    var pageMenuBtn = document.getElementById("page-menu-btn");
    var pageMenu = document.getElementById("page-menu");

    if (pageMenuBtn && pageMenu) {
        pageMenuBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            pageMenu.classList.toggle("open");
        });
        document.addEventListener("click", function (e) {
            if (!pageMenu.contains(e.target) && e.target !== pageMenuBtn) {
                pageMenu.classList.remove("open");
            }
        });
        pageMenu.addEventListener("click", function (e) {
            if (e.target.tagName === "INPUT") e.stopPropagation();
        });
    }

});
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
document.addEventListener("DOMContentLoaded", function () {

    // ── Auto-refresh summary ─────────────────────────────────────────────────
    // Cols: 0=Select, 1=Guest, 2=Gender, 3=Sent(checkbox), 4=Status, 5=Notes, 6=Actions

    function getRowStatus(row) {
        var checkbox = row.cells[2] && row.cells[2].querySelector(".sent-checkbox");
        if (!checkbox || !checkbox.checked) return "Not Sent";
        var sel = row.cells[3] && row.cells[3].querySelector("select");
        if (sel) return sel.value;
        return "Not Sent";
    }

    function getRowGender(row) {
        return (row.getAttribute("data-gender") || "male").toLowerCase();
    }

    window.refreshSummary = function () {
        var summaryTable = document.getElementById("summary-table");
        if (!summaryTable) return;
        var rows = document.querySelectorAll("#invitations-table tbody tr:not(.add-guest-row)");
        var counts = {
            male: { attending: 0, pending: 0, declined: 0, notsent: 0 },
            female: { attending: 0, pending: 0, declined: 0, notsent: 0 }
        };
        rows.forEach(function (row) {
            var gender = getRowGender(row);
            var statusText = getRowStatus(row);
            var status;
            if (statusText === "Attending") status = "attending";
            else if (statusText === "Declined") status = "declined";
            else if (statusText === "Pending") status = "pending";
            else status = "notsent";
            if (counts[gender]) counts[gender][status]++;
        });
        counts.total = {
            attending: counts.male.attending + counts.female.attending,
            pending: counts.male.pending + counts.female.pending,
            declined: counts.male.declined + counts.female.declined,
            notsent: counts.male.notsent + counts.female.notsent
        };
        ["male", "female", "total"].forEach(function (g) {
            counts[g].invited = counts[g].attending + counts[g].pending + counts[g].declined;
        });
        summaryTable.querySelectorAll("tbody tr[data-gender]").forEach(function (row) {
            var g = row.getAttribute("data-gender");
            var d = counts[g];
            if (!d) return;
            var bold = g === "total";
            ["attending", "pending", "declined", "invited"].forEach(function (stat) {
                var cell = row.querySelector("[data-stat='" + stat + "']");
                if (cell) cell.innerHTML = bold ? "<strong>" + d[stat] + "</strong>" : String(d[stat]);
            });
        });

        // Update progress bars
        var summaryBars = document.getElementById("summary-bars");
        if (summaryBars) {
            var target = parseInt(summaryBars.getAttribute("data-target")) || 0;
            var t = counts.total;

            // Bar 1: Attending vs Target
            if (target > 0) {
                var pct = Math.min(100, (t.attending / target) * 100);
                var fill = document.getElementById("target-bar-fill");
                if (fill) {
                    fill.style.width = pct + "%";
                    fill.innerHTML = "<span>" + Math.round(pct) + "%</span>";
                    fill.classList.toggle("over-target", t.attending > target);
                }
                var val = document.getElementById("target-bar-value");
                if (val) {
                    val.classList.remove("at-target", "over-target");
                    var prefix = "";
                    if (t.attending > target) { val.classList.add("over-target"); prefix = "\u26a0 "; }
                    else if (t.attending === target) { val.classList.add("at-target"); prefix = "\u2713 "; }
                    val.textContent = prefix + t.attending + "/" + target;
                }
            }

            // Bar 2: RSVP Status breakdown
            var invited = t.invited;
            var attBar = document.getElementById("invited-bar-attending");
            var pendBar = document.getElementById("invited-bar-pending");
            var declBar = document.getElementById("invited-bar-declined");
            var attPct = invited > 0 ? Math.round(t.attending / invited * 100) : 0;
            var pendPct = invited > 0 ? Math.round(t.pending / invited * 100) : 0;
            var declPct = invited > 0 ? Math.round(t.declined / invited * 100) : 0;
            if (attBar) { attBar.style.width = attPct + "%"; attBar.innerHTML = "<span>" + attPct + "%</span>"; }
            if (pendBar) { pendBar.style.width = pendPct + "%"; pendBar.innerHTML = "<span>" + pendPct + "%</span>"; }
            if (declBar) { declBar.style.width = declPct + "%"; declBar.innerHTML = "<span>" + declPct + "%</span>"; }
            var invVal = document.getElementById("invited-bar-value");
            if (invVal) invVal.textContent = invited + " invited";
        }

        // Update guest list heading count
        var glHeading = document.getElementById("guest-list-heading");
        if (glHeading) glHeading.textContent = "Guest List (" + rows.length + ")";
    };

    // ── Status helpers ───────────────────────────────────────────────────────

    window.colorStatusSelect = function (select) {
        select.className = select.className.replace(/\bstatus-(attending|pending|declined)\b/g, "").trim();
        var val = select.value;
        if (val === "Attending") select.classList.add("status-attending");
        else if (val === "Pending") select.classList.add("status-pending");
        else if (val === "Declined") select.classList.add("status-declined");
    };

    // Color all status selects on load
    document.querySelectorAll(".status-select").forEach(window.colorStatusSelect);

    window.buildTagBadges = function (tags) {
        if (!tags || tags.length === 0) return "";
        return tags.map(function (t) {
            return '<span class="tag-badge" style="background:' + t.color + '">' + window.escapeHtml(t.name) + '</span>';
        }).join(" ");
    };

    window.buildStatusHtml = function (invId, status) {
        if (status === "Not Sent") {
            return '<span class="status-not-sent">Not Sent</span>';
        }
        return '<select class="inline-select status-select" data-inv-id="' + invId + '">' +
            '<option value="Attending"' + (status === "Attending" ? " selected" : "") + '>Attending</option>' +
            '<option value="Pending"' + (status === "Pending" ? " selected" : "") + '>Pending</option>' +
            '<option value="Declined"' + (status === "Declined" ? " selected" : "") + '>Declined</option>' +
            '</select>';
    };

    window.buildInvitationRow = function (data) {
        var displayName = data.last_name ? data.first_name + " " + data.last_name : data.first_name;
        var isSent = data.status !== "Not Sent";
        var multiCol = document.querySelector(".col-multiselect");
        var multiShow = multiCol && multiCol.style.display !== "none" ? "table-cell" : "none";

        var tr = document.createElement("tr");
        tr.setAttribute("data-inv-id", data.invitation_id);
        tr.setAttribute("data-guest-id", data.guest_id);
        tr.setAttribute("data-gender", data.gender || "");
        tr.setAttribute("data-sent", isSent ? "true" : "false");
        tr.setAttribute("data-date-invited", data.date_invited || "");
        tr.setAttribute("data-date-invited-iso", data.date_invited_iso || "");
        tr.setAttribute("data-date-responded", data.date_responded || "");
        tr.setAttribute("data-date-responded-iso", data.date_responded_iso || "");

        var genderTag = data.gender === "Male" ? " (M)" : data.gender === "Female" ? " (F)" : "";
        tr.innerHTML =
            '<td class="center col-multiselect" style="display:' + multiShow + '"><input type="checkbox" class="row-select"></td>' +
            '<td class="guest-name-cell">' + window.escapeHtml(displayName) + ' <span class="gender-tag">' + window.escapeHtml(genderTag) + '</span></td>' +
            '<td class="center"><input type="checkbox" class="sent-checkbox" data-inv-id="' + data.invitation_id + '"' + (isSent ? ' checked' : '') + '></td>' +
            '<td>' + window.buildStatusHtml(data.invitation_id, data.status) + '</td>' +
            '<td class="col-expand-mobile"><input type="text" class="inv-notes-input" data-inv-id="' + data.invitation_id + '" value="' + window.escapeHtml(data.notes || "") + '" placeholder="Invite note..."></td>' +
            '<td class="col-expand">' + window.escapeHtml(data.guest_notes || "") + '</td>' +
            '<td class="col-expand">' + window.buildTagBadges(data.guest_tags || []) + '</td>' +
            '<td><div class="kebab-wrapper">' +
            '<button type="button" class="kebab-btn" aria-label="Actions">&#x2026;</button>' +
            '<div class="kebab-menu">' +
            '<button type="button" class="inv-guest-detail-btn" data-guest-id="' + data.guest_id + '">Guest detail</button>' +
            '<button type="button" class="edit-btn">Invitation detail</button>' +
            '<button type="button" class="kebab-danger remove-btn" data-inv-id="' + data.invitation_id + '">Remove</button>' +
            '</div></div></td>';

        attachCheckboxListener(tr.querySelector(".sent-checkbox"));
        var statusSel = tr.querySelector(".status-select");
        if (statusSel) attachStatusListener(statusSel);
        attachInvNotesListener(tr.querySelector(".inv-notes-input"));
        attachRemoveListener(tr.querySelector(".remove-btn"));
        attachEditListener(tr.querySelector(".edit-btn"));
        attachGuestDetailListener(tr.querySelector(".inv-guest-detail-btn"));
        window.attachKebabListener(tr.querySelector(".kebab-btn"));
        attachRowSelectListener(tr.querySelector(".row-select"));

        return tr;
    };

    // ── Sent checkbox (AJAX toggle) ─────────────────────────────────────────

    function attachCheckboxListener(checkbox) {
        checkbox.addEventListener("change", function () {
            var invId = checkbox.getAttribute("data-inv-id");
            var row = checkbox.closest("tr");
            window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toggle_send: true })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var data = resp.data;
                var statusCell = row.cells[3];
                if (data.status === "Not Sent") {
                    checkbox.checked = false;
                    row.setAttribute("data-sent", "false");
                    row.setAttribute("data-date-invited", "");
                    row.setAttribute("data-date-invited-iso", "");
                    row.setAttribute("data-date-responded", "");
                    row.setAttribute("data-date-responded-iso", "");
                } else {
                    checkbox.checked = true;
                    row.setAttribute("data-sent", "true");
                    row.setAttribute("data-date-invited", data.date_invited);
                    row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                }
                statusCell.innerHTML = window.buildStatusHtml(invId, data.status);
                var newSel = statusCell.querySelector(".status-select");
                if (newSel) { attachStatusListener(newSel); window.colorStatusSelect(newSel); }
                window.refreshSummary();
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Status select (AJAX) ────────────────────────────────────────────────

    function attachStatusListener(select) {
        window.colorStatusSelect(select);
        select.addEventListener("change", function () {
            window.colorStatusSelect(select);
            var invId = select.getAttribute("data-inv-id");
            var row = select.closest("tr");
            window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: select.value })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var data = resp.data;
                row.setAttribute("data-date-responded", data.date_responded || "");
                row.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                window.refreshSummary();
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Invitation notes (AJAX, debounced) ──────────────────────────────────

    function attachInvNotesListener(input) {
        var timer;
        input.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                var invId = input.getAttribute("data-inv-id");
                window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes: input.value })
                }).catch(window.handleFetchError);
            }, 400);
        });
    }

    // ── Remove button (AJAX) ─────────────────────────────────────────────────

    function attachRemoveListener(btn) {
        btn.addEventListener("click", function () {
            if (!confirm("Remove this guest from the event?")) return;
            var invId = btn.getAttribute("data-inv-id");
            window.fetchWithCsrf("/api/v1/invitations/" + invId, { method: "DELETE" })
            .then(function (res) {
                if (res.ok) {
                    var row = btn.closest("tr");
                    if (currentDetailRow === row) closeDetail();
                    row.remove();
                    window.refreshSummary();
                    updateBatchCount();
                }
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Detail / Edit card modal ──────────────────────────────────────────────

    var detailOverlay = document.getElementById("detail-overlay");
    var currentDetailRow = null;

    function openDetail(row) {
        if (!detailOverlay) return;
        currentDetailRow = row;

        var fullName = row.cells[1].textContent.trim().replace(/\s*\([MF]\)\s*$/, "");
        var nameParts = fullName.split(" ");
        var firstName = nameParts[0] || "";
        var lastName = nameParts.slice(1).join(" ") || "";
        document.getElementById("detail-first-name").value = firstName;
        document.getElementById("detail-last-name").value = lastName;

        document.getElementById("detail-gender").value = row.getAttribute("data-gender") || "";

        var sentCheckbox = row.cells[2].querySelector(".sent-checkbox");
        var isSent = sentCheckbox && sentCheckbox.checked;
        document.getElementById("detail-sent-toggle").checked = isSent;

        var invitedDate = row.getAttribute("data-date-invited") || "";
        document.getElementById("detail-date-invited").textContent = invitedDate || "\u2014";

        var respondedDate = row.getAttribute("data-date-responded") || "";
        document.getElementById("detail-date-responded").textContent = respondedDate || "\u2014";

        var statusSelect = document.getElementById("detail-status");
        var statusText = getRowStatus(row);
        if (isSent && statusText !== "Not Sent") {
            statusSelect.value = statusText;
            statusSelect.disabled = false;
        } else {
            statusSelect.value = "Pending";
            statusSelect.disabled = true;
        }
        window.colorStatusSelect(statusSelect);

        var notesInput = row.cells[4] && row.cells[4].querySelector(".inv-notes-input");
        document.getElementById("detail-notes").value = notesInput ? notesInput.value : "";

        detailOverlay.style.display = "flex";
    }

    function closeDetail() {
        if (detailOverlay) detailOverlay.style.display = "none";
        currentDetailRow = null;
    }

    if (detailOverlay) {
        document.getElementById("detail-close").addEventListener("click", closeDetail);
        detailOverlay.addEventListener("click", function (e) {
            if (e.target === detailOverlay) closeDetail();
        });

        // Name change (save on blur)
        function saveDetailName() {
            if (!currentDetailRow) return;
            var guestId = currentDetailRow.getAttribute("data-guest-id");
            var newFirst = document.getElementById("detail-first-name").value.trim();
            var newLast = document.getElementById("detail-last-name").value.trim();
            if (!newFirst) return;
            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: newFirst, last_name: newLast })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                if (resp.status === "success" && currentDetailRow) {
                    var nameCell = currentDetailRow.cells[1];
                    var genderTag = nameCell.querySelector(".gender-tag");
                    var tagHTML = genderTag ? " " + genderTag.outerHTML : "";
                    nameCell.innerHTML = window.escapeHtml(resp.data.full_name) + tagHTML;
                }
            })
            .catch(window.handleFetchError);
        }
        document.getElementById("detail-first-name").addEventListener("blur", saveDetailName);
        document.getElementById("detail-last-name").addEventListener("blur", saveDetailName);

        // Gender change
        document.getElementById("detail-gender").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var guestId = currentDetailRow.getAttribute("data-guest-id");
            var newGender = this.value;
            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gender: newGender })
            })
            .then(function (res) { return res.json(); })
            .then(function () {
                if (currentDetailRow) {
                    currentDetailRow.setAttribute("data-gender", newGender);
                    var genderTag = currentDetailRow.cells[1] && currentDetailRow.cells[1].querySelector(".gender-tag");
                    if (genderTag) genderTag.textContent = newGender === "Male" ? "(M)" : newGender === "Female" ? "(F)" : "";
                    window.refreshSummary();
                }
            })
            .catch(window.handleFetchError);
        });

        // Sent toggle (syncs with table checkbox)
        document.getElementById("detail-sent-toggle").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var sentCheckbox = currentDetailRow.cells[2].querySelector(".sent-checkbox");
            if (sentCheckbox) {
                sentCheckbox.checked = this.checked;
                sentCheckbox.dispatchEvent(new Event("change"));
            }
            var toggle = this;
            setTimeout(function () {
                var statusSelect = document.getElementById("detail-status");
                if (toggle.checked) {
                    statusSelect.value = "Pending";
                    statusSelect.disabled = false;
                    var invDate = currentDetailRow.getAttribute("data-date-invited") || "";
                    document.getElementById("detail-date-invited").textContent = invDate || "\u2014";
                } else {
                    statusSelect.disabled = true;
                    document.getElementById("detail-date-invited").textContent = "\u2014";
                    document.getElementById("detail-date-responded").textContent = "\u2014";
                }
                window.colorStatusSelect(statusSelect);
            }, 300);
        });

        // Status change (syncs with table dropdown)
        document.getElementById("detail-status").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newStatus = this.value;
            window.colorStatusSelect(this);
            var tableSelect = currentDetailRow.cells[3].querySelector(".status-select");
            if (tableSelect) { tableSelect.value = newStatus; window.colorStatusSelect(tableSelect); }
            window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                if (!currentDetailRow) return;
                var data = resp.data;
                currentDetailRow.setAttribute("data-date-responded", data.date_responded || "");
                currentDetailRow.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                document.getElementById("detail-date-responded").textContent = data.date_responded || "\u2014";
                window.refreshSummary();
            })
            .catch(window.handleFetchError);
        });

        // Notes change (syncs with table input)
        document.getElementById("detail-notes").addEventListener("blur", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newNotes = this.value;
            var tableInput = currentDetailRow.cells[4] && currentDetailRow.cells[4].querySelector(".inv-notes-input");
            if (tableInput) tableInput.value = newNotes;
            window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: newNotes })
            }).catch(window.handleFetchError);
        });

        // Save button (form submit)
        document.getElementById("inv-detail-form").addEventListener("submit", function (e) {
            e.preventDefault();
            if (!currentDetailRow) return;

            var guestId = currentDetailRow.getAttribute("data-guest-id");
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newFirst = document.getElementById("detail-first-name").value.trim();
            var newLast = document.getElementById("detail-last-name").value.trim();
            var newGender = document.getElementById("detail-gender").value;
            var newNotes = document.getElementById("detail-notes").value.trim();
            if (!newFirst) return;

            // Save guest fields
            var guestSave = window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: newFirst, last_name: newLast, gender: newGender })
            }).then(function (res) { return res.json(); }).then(function (resp) {
                if (resp.status === "success" && currentDetailRow) {
                    var nameCell = currentDetailRow.cells[1];
                    var genderTag = nameCell.querySelector(".gender-tag");
                    var tagHTML = genderTag ? " " + genderTag.outerHTML : "";
                    nameCell.innerHTML = window.escapeHtml(resp.data.full_name) + tagHTML;
                    var gt = nameCell.querySelector(".gender-tag");
                    if (gt) gt.textContent = newGender === "Male" ? "(M)" : newGender === "Female" ? "(F)" : "";
                    currentDetailRow.setAttribute("data-gender", newGender);
                }
            });

            // Save invitation notes
            var invSave = window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notes: newNotes })
            }).then(function () {
                var tableInput = currentDetailRow.cells[4] && currentDetailRow.cells[4].querySelector(".inv-notes-input");
                if (tableInput) tableInput.value = newNotes;
            });

            Promise.all([guestSave, invSave]).then(function () {
                window.refreshSummary();
                closeDetail();
            }).catch(window.handleFetchError);
        });
    }

    // ── Attach edit button listeners ──────────────────────────────────────────

    function attachEditListener(btn) {
        btn.addEventListener("click", function () {
            openDetail(btn.closest("tr"));
        });
    }

    // ── Tags & Guest Detail (event detail page only) ───────────────────────
    // Guard: only run on event detail page to avoid conflicts with guests.js
    if (document.getElementById("invitations-table")) {

    var allUserTags = [];
    var currentGuestTags = [];

    // ── Guest list tag filter ──────────────────────────────────────────────
    var glTagFilterToggle = document.getElementById("gl-tag-filter-toggle");
    var glTagFilterDropdown = document.getElementById("gl-tag-filter-dropdown");
    var glSelectedTagIds = [];
    var invTable = document.getElementById("invitations-table");

    function buildGlTagFilter() {
        if (!glTagFilterDropdown) return;
        glTagFilterDropdown.innerHTML = "";
        allUserTags.forEach(function (tag) {
            var option = document.createElement("label");
            option.className = "tag-filter-option";
            option.innerHTML =
                '<input type="checkbox" value="' + tag.id + '">' +
                '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
            option.querySelector("input").addEventListener("change", function () {
                glSelectedTagIds = [];
                glTagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                    glSelectedTagIds.push(parseInt(cb.value));
                });
                glTagFilterToggle.textContent = glSelectedTagIds.length > 0
                    ? glSelectedTagIds.length + " Tag" + (glSelectedTagIds.length > 1 ? "s" : "") + ""
                    : "All Tags";
                if (invTable) window.filterTable(invTable);
            });
            glTagFilterDropdown.appendChild(option);
        });
    }

    if (glTagFilterToggle && glTagFilterDropdown) {
        glTagFilterToggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var showing = glTagFilterDropdown.style.display !== "none";
            glTagFilterDropdown.style.display = showing ? "none" : "block";
        });
        document.addEventListener("click", function (e) {
            if (!glTagFilterDropdown.contains(e.target) && e.target !== glTagFilterToggle) {
                glTagFilterDropdown.style.display = "none";
            }
        });
    }

    // Load all user tags
    window.fetchWithCsrf("/api/v1/tags")
        .then(function (res) { return res.json(); })
        .then(function (resp) {
            allUserTags = resp.data || [];
            buildGlTagFilter();
        })
        .catch(function () { /* ignore */ });

    // Extend filterTable to also apply tag filter on invitations table
    var origFilterTable = window.filterTable;
    window.filterTable = function (table) {
        origFilterTable(table);
        if (table === invTable && glSelectedTagIds.length > 0) {
            table.querySelectorAll("tbody tr").forEach(function (row) {
                if (row.style.display === "none") return;
                var rowTags = (row.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                var matchTags = glSelectedTagIds.some(function (id) { return rowTags.indexOf(id) !== -1; });
                if (!matchTags) row.style.display = "none";
            });
        }
    };

    // ── Tag autocomplete helpers ──────────────────────────────────────────

    var gdTagsDisplay = document.getElementById("gd-tags-display");
    var gdTagsInput = document.getElementById("gd-tags-input");
    var gdTagsSuggestions = document.getElementById("gd-tags-suggestions");

    function renderGuestTags() {
        if (!gdTagsDisplay) return;
        gdTagsDisplay.innerHTML = "";
        currentGuestTags.forEach(function (tag) {
            var badge = document.createElement("span");
            badge.className = "tag-badge";
            badge.style.background = tag.color;
            badge.innerHTML = window.escapeHtml(tag.name) +
                '<button type="button" class="tag-remove" data-tag-name="' + window.escapeHtml(tag.name) + '">&times;</button>';
            badge.querySelector(".tag-remove").addEventListener("click", function () {
                currentGuestTags = currentGuestTags.filter(function (t) { return t.name !== tag.name; });
                renderGuestTags();
            });
            gdTagsDisplay.appendChild(badge);
        });
    }

    function showTagSuggestions(query) {
        if (!gdTagsSuggestions) return;
        gdTagsSuggestions.innerHTML = "";
        var q = query.toLowerCase().trim();
        if (!q) { gdTagsSuggestions.style.display = "none"; return; }

        var currentNames = currentGuestTags.map(function (t) { return t.name.toLowerCase(); });
        var matches = allUserTags.filter(function (t) {
            return t.name.toLowerCase().indexOf(q) !== -1 && currentNames.indexOf(t.name.toLowerCase()) === -1;
        });

        var exactMatch = allUserTags.some(function (t) { return t.name.toLowerCase() === q; })
            || currentNames.indexOf(q) !== -1;

        matches.forEach(function (tag) {
            var div = document.createElement("div");
            div.className = "tag-suggestion";
            div.innerHTML = '<span class="tag-suggestion-color" style="background:' + tag.color + '"></span>' +
                window.escapeHtml(tag.name);
            div.addEventListener("click", function () {
                addTagToGuest(tag);
            });
            gdTagsSuggestions.appendChild(div);
        });

        if (!exactMatch && q) {
            var createDiv = document.createElement("div");
            createDiv.className = "tag-suggestion tag-suggestion-create";
            createDiv.textContent = '+ Create "' + query.trim() + '"';
            createDiv.addEventListener("click", function () {
                addNewTag(query.trim());
            });
            gdTagsSuggestions.appendChild(createDiv);
        }

        gdTagsSuggestions.style.display = gdTagsSuggestions.children.length > 0 ? "block" : "none";
    }

    function addTagToGuest(tag) {
        var exists = currentGuestTags.some(function (t) { return t.name.toLowerCase() === tag.name.toLowerCase(); });
        if (!exists) {
            currentGuestTags.push(tag);
            renderGuestTags();
        }
        if (gdTagsInput) gdTagsInput.value = "";
        if (gdTagsSuggestions) gdTagsSuggestions.style.display = "none";
    }

    function addNewTag(name) {
        var colors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8',
                      '#F7DC6F','#BB8FCE','#85C1E2','#F8B88B','#82E0AA'];
        var color = colors[(allUserTags.length + currentGuestTags.length) % colors.length];
        var newTag = { id: 0, name: name, color: color };
        currentGuestTags.push(newTag);
        renderGuestTags();
        if (gdTagsInput) gdTagsInput.value = "";
        if (gdTagsSuggestions) gdTagsSuggestions.style.display = "none";
    }

    if (gdTagsInput) {
        gdTagsInput.addEventListener("input", function () {
            showTagSuggestions(gdTagsInput.value);
        });
        gdTagsInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var val = gdTagsInput.value.trim();
                if (!val) return;
                var match = allUserTags.find(function (t) { return t.name.toLowerCase() === val.toLowerCase(); });
                if (match) {
                    addTagToGuest(match);
                } else {
                    addNewTag(val);
                }
            }
        });
    }

    document.addEventListener("click", function (e) {
        if (gdTagsSuggestions && !gdTagsSuggestions.contains(e.target) && e.target !== gdTagsInput) {
            gdTagsSuggestions.style.display = "none";
        }
    });

    // ── Guest Detail overlay (from invitation kebab) ───────────────────────

    var gdOverlay = document.getElementById("guest-detail-overlay");
    var gdClose = document.getElementById("guest-detail-close");
    var gdForm = document.getElementById("guest-detail-form");
    var gdMeta = document.getElementById("gd-meta");
    var gdActiveRow = null;

    function formatDate(iso) {
        if (!iso) return "\u2014";
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

                // Populate tags
                currentGuestTags = (g.tags || []).slice();
                renderGuestTags();
                if (gdTagsInput) gdTagsInput.value = "";

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

    function attachGuestDetailListener(btn) {
        if (!btn) return;
        btn.addEventListener("click", function () {
            var guestId = btn.getAttribute("data-guest-id");
            var row = btn.closest("tr");
            btn.closest(".kebab-menu").classList.remove("open");
            openGuestDetail(guestId, row);
        });
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

            var tagNames = currentGuestTags.map(function (t) { return t.name; });
            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe, tag_names: tagNames })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                if (gdActiveRow) {
                    var displayName = lastName ? firstName + " " + lastName : firstName;
                    var nameCell = gdActiveRow.cells[1];
                    var genderTag = nameCell.querySelector(".gender-tag");
                    var tagText = gender === "Male" ? "(M)" : gender === "Female" ? "(F)" : "";
                    if (genderTag) {
                        genderTag.textContent = tagText;
                    }
                    nameCell.childNodes[0].textContent = displayName + " ";
                    gdActiveRow.setAttribute("data-gender", gender);
                    // Update expanded guest notes and tags cells
                    if (gdActiveRow.cells[5]) gdActiveRow.cells[5].textContent = notes;
                    if (gdActiveRow.cells[6] && resp.data && resp.data.tags) {
                        gdActiveRow.cells[6].innerHTML = window.buildTagBadges(resp.data.tags);
                        var tagIds = resp.data.tags.map(function (t) { return t.id; });
                        gdActiveRow.setAttribute("data-tags", tagIds.join(","));
                    }
                    window.refreshSummary();
                }
                // Refresh allUserTags to include any new tags
                window.fetchWithCsrf("/api/v1/tags")
                    .then(function (res) { return res.json(); })
                    .then(function (resp) { allUserTags = resp.data || []; })
                    .catch(function () {});
                gdOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Attach all guest detail listeners ─────────────────────────────────
    document.querySelectorAll(".inv-guest-detail-btn").forEach(attachGuestDetailListener);

    } // end event-detail-only guard

    // ── Batch select ─────────────────────────────────────────────────────────

    var selectAllCheckbox = document.getElementById("select-all");
    var batchBar = document.getElementById("batch-bar");
    var batchCountEl = document.getElementById("batch-count");

    function getSelectedRows() {
        var rows = [];
        document.querySelectorAll("#invitations-table tbody tr:not(.add-guest-row) .row-select:checked").forEach(function (cb) {
            rows.push(cb.closest("tr"));
        });
        return rows;
    }

    function updateBatchCount() {
        if (!batchBar) return;
        var count = getSelectedRows().length;
        batchCountEl.textContent = count;
        batchBar.style.display = count > 0 ? "flex" : "none";
        if (selectAllCheckbox) {
            var total = document.querySelectorAll("#invitations-table tbody tr:not(.add-guest-row) .row-select").length;
            selectAllCheckbox.checked = count > 0 && count === total;
        }
    }

    function attachRowSelectListener(checkbox) {
        checkbox.addEventListener("change", updateBatchCount);
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", function () {
            var checked = selectAllCheckbox.checked;
            document.querySelectorAll("#invitations-table tbody tr:not(.add-guest-row) .row-select").forEach(function (cb) {
                cb.checked = checked;
            });
            updateBatchCount();
        });
    }

    // Batch apply
    var batchApplyBtn = document.getElementById("batch-apply");
    var batchActionSelect = document.getElementById("batch-action");
    var batchClearBtn = document.getElementById("batch-clear");

    if (batchApplyBtn) {
        batchApplyBtn.addEventListener("click", function () {
            var action = batchActionSelect.value;
            if (!action) return;
            var rows = getSelectedRows();
            if (rows.length === 0) return;
            if (action === "remove" && !confirm("Remove " + rows.length + " guest(s) from this event?")) return;

            var promises = rows.map(function (row) {
                var invId = row.getAttribute("data-inv-id");
                var checkbox = row.cells[2].querySelector(".sent-checkbox");
                var isSent = checkbox && checkbox.checked;

                if (action === "send" && !isSent) {
                    return window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ toggle_send: true })
                    }).then(function (res) { return res.json(); }).then(function (resp) {
                        var data = resp.data;
                        checkbox.checked = true;
                        row.setAttribute("data-sent", "true");
                        row.setAttribute("data-date-invited", data.date_invited);
                        row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                        var statusCell = row.cells[3];
                        statusCell.innerHTML = window.buildStatusHtml(invId, "Pending");
                        attachStatusListener(statusCell.querySelector(".status-select"));
                    });
                } else if (action === "unsend" && isSent) {
                    return window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ toggle_send: true })
                    }).then(function (res) { return res.json(); }).then(function () {
                        checkbox.checked = false;
                        row.setAttribute("data-sent", "false");
                        row.setAttribute("data-date-invited", "");
                        row.setAttribute("data-date-invited-iso", "");
                        row.setAttribute("data-date-responded", "");
                        row.setAttribute("data-date-responded-iso", "");
                        row.cells[3].innerHTML = window.buildStatusHtml(invId, "Not Sent");
                    });
                } else if (action === "attending" || action === "pending" || action === "declined") {
                    var newStatus = action.charAt(0).toUpperCase() + action.slice(1);
                    var sendFirst = !isSent
                        ? window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ toggle_send: true })
                          }).then(function (res) { return res.json(); }).then(function (resp) {
                            var data = resp.data;
                            checkbox.checked = true;
                            row.setAttribute("data-sent", "true");
                            row.setAttribute("data-date-invited", data.date_invited);
                            row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                            var statusCell = row.cells[3];
                            statusCell.innerHTML = window.buildStatusHtml(invId, "Pending");
                            attachStatusListener(statusCell.querySelector(".status-select"));
                          })
                        : Promise.resolve();
                    return sendFirst.then(function () {
                        return window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: newStatus })
                        });
                    }).then(function (res) { return res.json(); }).then(function (resp) {
                        var data = resp.data;
                        var sel = row.cells[3].querySelector(".status-select");
                        if (sel) { sel.value = newStatus; window.colorStatusSelect(sel); }
                        row.setAttribute("data-date-responded", data.date_responded || "");
                        row.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                    });
                } else if (action === "remove") {
                    return window.fetchWithCsrf("/api/v1/invitations/" + invId, { method: "DELETE" })
                    .then(function (res) {
                        if (res.ok) {
                            if (currentDetailRow === row) closeDetail();
                            row.remove();
                        }
                    });
                }
                return Promise.resolve();
            });

            Promise.all(promises).then(function () {
                window.refreshSummary();
                batchActionSelect.value = "";
                rows.forEach(function (row) {
                    var cb = row.querySelector(".row-select");
                    if (cb) cb.checked = false;
                });
                updateBatchCount();
            }).catch(window.handleFetchError);
        });
    }

    if (batchClearBtn) {
        batchClearBtn.addEventListener("click", function () {
            document.querySelectorAll("#invitations-table tbody .row-select:checked").forEach(function (cb) {
                cb.checked = false;
            });
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
            updateBatchCount();
        });
    }

    // ── Attach all listeners ─────────────────────────────────────────────────

    document.querySelectorAll(".sent-checkbox").forEach(attachCheckboxListener);
    document.querySelectorAll(".status-select").forEach(attachStatusListener);
    document.querySelectorAll(".inv-notes-input").forEach(attachInvNotesListener);
    document.querySelectorAll(".remove-btn").forEach(attachRemoveListener);
    document.querySelectorAll(".edit-btn").forEach(attachEditListener);
    document.querySelectorAll(".row-select").forEach(attachRowSelectListener);

    // ── Event notes auto-save ────────────────────────────────────────────────

    var eventNotesArea = document.getElementById("event-notes");
    if (eventNotesArea) {
        var saveIndicator = document.getElementById("notes-save-indicator");
        var notesTimer;
        eventNotesArea.addEventListener("input", function () {
            clearTimeout(notesTimer);
            notesTimer = setTimeout(function () {
                var evId = eventNotesArea.getAttribute("data-event-id");
                window.fetchWithCsrf("/api/v1/events/" + evId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes: eventNotesArea.value })
                })
                .then(function () {
                    if (saveIndicator) {
                        saveIndicator.style.opacity = "1";
                        setTimeout(function () { saveIndicator.style.opacity = "0"; }, 1500);
                    }
                })
                .catch(window.handleFetchError);
            }, 500);
        });
    }

    // ── New Invite dropdown ──────────────────────────────────────────────────

    var newInviteBtn = document.getElementById("new-invite-btn");
    var newInviteMenu = document.getElementById("new-invite-menu");

    if (newInviteBtn && newInviteMenu) {
        newInviteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
                if (m !== newInviteMenu) m.classList.remove("open");
            });
            newInviteMenu.classList.toggle("open");
        });
    }

    // ── Guest list 3-dot menu ────────────────────────────────────────────────
    var glMenuBtn = document.querySelector(".gl-menu-btn");
    if (glMenuBtn) {
        window.attachKebabListener(glMenuBtn);
    }

    // ── Multi-select toggle ──────────────────────────────────────────────────
    var toggleMultiBtn = document.getElementById("toggle-multiselect-btn");
    if (toggleMultiBtn) {
        toggleMultiBtn.addEventListener("click", function () {
            var cols = document.querySelectorAll(".col-multiselect");
            var showing = cols.length > 0 && cols[0].style.display !== "none";
            cols.forEach(function (el) { el.style.display = showing ? "none" : "table-cell"; });
            var menu = toggleMultiBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // ── Expand/collapse toggle ──────────────────────────────────────────────
    var toggleGlExpandBtn = document.getElementById("toggle-gl-expand-btn");
    if (toggleGlExpandBtn) {
        var invTable = document.getElementById("invitations-table");
        if (invTable) {
            invTable.classList.add("table-collapsed");
        }
        toggleGlExpandBtn.textContent = "Expand";
        toggleGlExpandBtn.addEventListener("click", function () {
            if (!invTable) return;
            var isCollapsed = invTable.classList.toggle("table-collapsed");
            toggleGlExpandBtn.textContent = isCollapsed ? "Expand" : "Collapse";
            var menu = toggleGlExpandBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // ── Guest Database Picker ────────────────────────────────────────────────
    var selectFromDbBtn = document.getElementById("select-from-db-btn");
    var guestDbOverlay = document.getElementById("guest-db-overlay");
    var guestDbClose = document.getElementById("guest-db-close");
    var guestDbList = document.getElementById("guest-db-list");
    var guestDbSearchInput = document.getElementById("guest-db-search-input");
    var guestDbAddBtn = document.getElementById("guest-db-add-btn");
    var guestDbFilterBtn = document.getElementById("guest-db-filter-btn");
    var guestDbFilters = document.getElementById("guest-db-filters");
    var guestDbGenderFilter = document.getElementById("guest-db-gender-filter");
    var guestDbSort = document.getElementById("guest-db-sort");
    var guestDbTagFilterToggle = document.getElementById("guest-db-tag-filter-toggle");
    var guestDbTagFilterDropdown = document.getElementById("guest-db-tag-filter-dropdown");
    var guestDbSelectedTagIds = [];
    var guestDbArchiveFilter = document.getElementById("guest-db-archive-filter");

    if (selectFromDbBtn && guestDbOverlay) {
        var invTable = document.getElementById("invitations-table");
        var eventId = invTable ? invTable.getAttribute("data-event-id") : null;

        function buildGuestDbTagFilter() {
            if (!guestDbTagFilterDropdown || !allUserTags) return;
            guestDbTagFilterDropdown.innerHTML = "";
            allUserTags.forEach(function (tag) {
                var option = document.createElement("label");
                option.className = "tag-filter-option";
                option.innerHTML =
                    '<input type="checkbox" value="' + tag.id + '">' +
                    '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
                option.querySelector("input").addEventListener("change", function () {
                    guestDbSelectedTagIds = [];
                    guestDbTagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                        guestDbSelectedTagIds.push(parseInt(cb.value));
                    });
                    guestDbTagFilterToggle.textContent = guestDbSelectedTagIds.length > 0
                        ? guestDbSelectedTagIds.length + " Tag" + (guestDbSelectedTagIds.length > 1 ? "s" : "") + ""
                        : "All Tags";
                    applyGuestDbFilters();
                });
                guestDbTagFilterDropdown.appendChild(option);
            });
        }

        if (guestDbTagFilterToggle && guestDbTagFilterDropdown) {
            guestDbTagFilterToggle.addEventListener("click", function (e) {
                e.stopPropagation();
                var showing = guestDbTagFilterDropdown.style.display !== "none";
                guestDbTagFilterDropdown.style.display = showing ? "none" : "block";
            });
            document.addEventListener("click", function (e) {
                if (!guestDbTagFilterDropdown.contains(e.target) && e.target !== guestDbTagFilterToggle) {
                    guestDbTagFilterDropdown.style.display = "none";
                }
            });
        }

        function applyGuestDbFilters() {
            var q = guestDbSearchInput ? guestDbSearchInput.value.toLowerCase() : "";
            var genderVal = guestDbGenderFilter ? guestDbGenderFilter.value : "";
            var archiveVal = guestDbArchiveFilter ? guestDbArchiveFilter.value : "active";
            var sortVal = guestDbSort ? guestDbSort.value : "first-asc";
            var items = Array.from(guestDbList.querySelectorAll(".guest-db-item"));

            var parts = sortVal.split("-");
            var key = parts[0], dir = parts[1];
            items.sort(function (a, b) {
                var valA, valB;
                if (key === "first") {
                    valA = (a.getAttribute("data-first") || "").toLowerCase();
                    valB = (b.getAttribute("data-first") || "").toLowerCase();
                } else if (key === "last") {
                    valA = (a.getAttribute("data-last") || "").toLowerCase();
                    valB = (b.getAttribute("data-last") || "").toLowerCase();
                } else if (key === "gender") {
                    valA = (a.getAttribute("data-gender") || "").toLowerCase();
                    valB = (b.getAttribute("data-gender") || "").toLowerCase();
                }
                if (valA < valB) return dir === "asc" ? -1 : 1;
                if (valA > valB) return dir === "asc" ? 1 : -1;
                return 0;
            });
            items.forEach(function (item) { guestDbList.appendChild(item); });

            items.forEach(function (item) {
                var name = item.querySelector(".guest-db-item-name").textContent.toLowerCase();
                var gender = item.getAttribute("data-gender") || "";
                var isArchived = item.getAttribute("data-is-archived") === "true";
                var matchSearch = !q || name.indexOf(q) !== -1;
                var matchGender = !genderVal || gender === genderVal;
                var matchArchive = archiveVal === "all" || !isArchived;
                var matchTags = true;
                if (guestDbSelectedTagIds.length > 0) {
                    var itemTags = (item.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                    matchTags = guestDbSelectedTagIds.some(function (id) { return itemTags.indexOf(id) !== -1; });
                }
                item.style.display = (matchSearch && matchGender && matchArchive && matchTags) ? "" : "none";
            });
        }

        var guestDbSelectAll = document.getElementById("guest-db-select-all");
        if (guestDbSelectAll) {
            guestDbSelectAll.addEventListener("change", function () {
                var checked = guestDbSelectAll.checked;
                guestDbList.querySelectorAll(".guest-db-item:not(.disabled)").forEach(function (item) {
                    if (item.style.display === "none") return;
                    var cb = item.querySelector("input[type=checkbox]");
                    if (cb && !cb.disabled) cb.checked = checked;
                });
            });
        }

        if (guestDbFilterBtn && guestDbFilters) {
            guestDbFilterBtn.addEventListener("click", function () {
                var hidden = guestDbFilters.style.display === "none";
                guestDbFilters.style.display = hidden ? "flex" : "none";
                guestDbFilterBtn.classList.toggle("active", hidden);
            });
        }
        if (guestDbGenderFilter) guestDbGenderFilter.addEventListener("change", applyGuestDbFilters);
        if (guestDbArchiveFilter) guestDbArchiveFilter.addEventListener("change", applyGuestDbFilters);
        if (guestDbSort) guestDbSort.addEventListener("change", applyGuestDbFilters);

        selectFromDbBtn.addEventListener("click", function () {
            var menu = selectFromDbBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            if (!eventId) return;
            window.fetchWithCsrf("/api/v1/events/" + eventId + "/available-guests")
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    guestDbList.innerHTML = "";
                    resp.data.forEach(function (g) {
                        var name = g.last_name ? g.first_name + " " + g.last_name : g.first_name;
                        var div = document.createElement("div");
                        div.className = "guest-db-item" + (g.already_invited ? " disabled" : "") + (g.is_archived ? " archived-item" : "");
                        div.setAttribute("data-first", g.first_name.toLowerCase());
                        div.setAttribute("data-last", (g.last_name || "").toLowerCase());
                        div.setAttribute("data-gender", g.gender);
                        div.setAttribute("data-is-archived", g.is_archived ? "true" : "false");
                        var tagIds = (g.tags || []).map(function (t) { return t.id; });
                        div.setAttribute("data-tags", tagIds.join(","));
                        var tagsHtml = "";
                        if (g.tags && g.tags.length > 0) {
                            tagsHtml = '<span class="guest-db-item-tags">';
                            g.tags.forEach(function (t) {
                                tagsHtml += '<span class="tag-badge tag-badge-sm" style="background:' + t.color + '">' + window.escapeHtml(t.name) + '</span>';
                            });
                            tagsHtml += '</span>';
                        }
                        div.innerHTML =
                            '<input type="checkbox" data-guest-id="' + g.id + '"' +
                            (g.already_invited ? ' checked disabled' : '') + '>' +
                            '<div class="guest-db-item-info">' +
                            '<div class="guest-db-item-name">' + window.escapeHtml(name) + '</div>' +
                            '<div class="guest-db-item-gender">' + window.escapeHtml(g.gender) + tagsHtml + '</div>' +
                            '</div>';
                        if (!g.already_invited) {
                            div.addEventListener("click", function (e) {
                                if (e.target.tagName !== "INPUT") {
                                    var cb = div.querySelector("input");
                                    cb.checked = !cb.checked;
                                }
                            });
                        }
                        guestDbList.appendChild(div);
                    });
                    if (guestDbGenderFilter) guestDbGenderFilter.value = "";
                    if (guestDbArchiveFilter) guestDbArchiveFilter.value = "active";
                    if (guestDbSort) guestDbSort.value = "first-asc";
                    guestDbSelectedTagIds = [];
                    if (guestDbTagFilterToggle) guestDbTagFilterToggle.textContent = "All Tags";
                    buildGuestDbTagFilter();
                    if (guestDbFilters) { guestDbFilters.style.display = "none"; }
                    if (guestDbFilterBtn) guestDbFilterBtn.classList.remove("active");
                    if (guestDbSelectAll) guestDbSelectAll.checked = false;
                    guestDbOverlay.style.display = "flex";
                    guestDbSearchInput.value = "";
                    applyGuestDbFilters();
                    guestDbSearchInput.focus();
                })
                .catch(window.handleFetchError);
        });

        guestDbClose.addEventListener("click", function () { guestDbOverlay.style.display = "none"; });
        guestDbOverlay.addEventListener("click", function (e) {
            if (e.target === guestDbOverlay) guestDbOverlay.style.display = "none";
        });

        guestDbSearchInput.addEventListener("input", applyGuestDbFilters);
        guestDbSearchInput.addEventListener("search", applyGuestDbFilters);

        guestDbAddBtn.addEventListener("click", function () {
            var ids = [];
            guestDbList.querySelectorAll("input[type=checkbox]:checked:not(:disabled)").forEach(function (cb) {
                ids.push(parseInt(cb.getAttribute("data-guest-id")));
            });
            if (ids.length === 0) { guestDbOverlay.style.display = "none"; return; }

            window.fetchWithCsrf("/api/v1/events/" + eventId + "/invitations/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guest_ids: ids })
            })
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                var tbody = document.querySelector("#invitations-table tbody");
                resp.data.forEach(function (g) {
                    var tr = window.buildInvitationRow(g);
                    tbody.appendChild(tr);
                });
                window.refreshSummary();
                guestDbOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

});
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

    // ── Tags state ──────────────────────────────────────────────────────────
    var allUserTags = [];
    var currentGuestTags = [];
    var tagFilterToggle = document.getElementById("tag-filter-toggle");
    var tagFilterDropdown = document.getElementById("tag-filter-dropdown");
    var selectedTagIds = [];

    // Load all user tags
    window.fetchWithCsrf("/api/v1/tags")
        .then(function (res) { return res.json(); })
        .then(function (resp) {
            allUserTags = resp.data || [];
            buildTagFilterDropdown();
        })
        .catch(function () { /* ignore */ });

    function buildTagFilterDropdown() {
        if (!tagFilterDropdown) return;
        tagFilterDropdown.innerHTML = "";
        allUserTags.forEach(function (tag) {
            var option = document.createElement("label");
            option.className = "tag-filter-option";
            option.innerHTML =
                '<input type="checkbox" value="' + tag.id + '">' +
                '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
            option.querySelector("input").addEventListener("change", function () {
                selectedTagIds = [];
                tagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                    selectedTagIds.push(parseInt(cb.value));
                });
                tagFilterToggle.textContent = selectedTagIds.length > 0
                    ? selectedTagIds.length + " Tag" + (selectedTagIds.length > 1 ? "s" : "") + ""
                    : "All Tags";
                applyGuestTableControls();
            });
            tagFilterDropdown.appendChild(option);
        });
    }

    if (tagFilterToggle && tagFilterDropdown) {
        tagFilterToggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var showing = tagFilterDropdown.style.display !== "none";
            tagFilterDropdown.style.display = showing ? "none" : "block";
        });
        document.addEventListener("click", function (e) {
            if (!tagFilterDropdown.contains(e.target) && e.target !== tagFilterToggle) {
                tagFilterDropdown.style.display = "none";
            }
        });
    }

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
            var matchTags = true;
            if (selectedTagIds.length > 0) {
                var rowTags = (row.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                matchTags = selectedTagIds.some(function (id) { return rowTags.indexOf(id) !== -1; });
            }
            var show = matchSearch && matchGender && matchTags;
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

    // ── Archive filter (server-side reload) ───────────────────────────────
    var showArchived = guestsTable.getAttribute("data-show-archived") === "1";
    var guestArchiveFilter = document.getElementById("guest-archive-filter");
    if (guestArchiveFilter) {
        guestArchiveFilter.addEventListener("change", function () {
            var wantArchived = guestArchiveFilter.value === "all";
            if (wantArchived !== showArchived) {
                var url = window.location.pathname;
                if (wantArchived) url += "?show_archived=1";
                window.location.href = url;
            }
        });
    }

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

        // Archive/Unarchive button
        var archiveBtn = row.querySelector(".ge-archive-btn");
        if (archiveBtn) {
            archiveBtn.addEventListener("click", function () {
                var guestId = archiveBtn.getAttribute("data-guest-id");
                var isArchived = row.getAttribute("data-is-archived") === "true";
                archiveBtn.closest(".kebab-menu").classList.remove("open");
                window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_archived: !isArchived })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    if (!isArchived) {
                        // Archiving: remove row if not showing archived
                        if (!showArchived) {
                            row.remove();
                        } else {
                            row.setAttribute("data-is-archived", "true");
                            row.classList.add("archived-row");
                            archiveBtn.textContent = "Unarchive";
                        }
                    } else {
                        // Unarchiving
                        row.setAttribute("data-is-archived", "false");
                        row.classList.remove("archived-row");
                        archiveBtn.textContent = "Archive";
                    }
                })
                .catch(window.handleFetchError);
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

        var scrollUrl = "/guests?page=" + currentPage + "&partial=1";
        if (showArchived) scrollUrl += "&show_archived=1";
        window.fetchWithCsrf(scrollUrl)
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
                var multiVisible = document.querySelector(".col-multiselect") &&
                    document.querySelector(".col-multiselect").style.display !== "none";
                newRows.forEach(function (row) {
                    tbody.appendChild(row);
                    initGuestRow(row);
                    var cb = row.querySelector(".row-select");
                    if (cb) {
                        attachRowSelectListener(cb);
                        if (multiVisible) cb.closest("td").style.display = "table-cell";
                    }
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

    // ── Multi-select & batch operations ──────────────────────────────────

    var guestSelectAll = document.getElementById("guest-select-all");
    var guestBatchBar = document.getElementById("guest-batch-bar");
    var guestBatchCount = document.getElementById("guest-batch-count");
    var guestBatchAction = document.getElementById("guest-batch-action");
    var guestBatchTagWrapper = document.getElementById("guest-batch-tag-wrapper");
    var guestBatchTagInput = document.getElementById("guest-batch-tag-input");
    var guestBatchTagSuggestions = document.getElementById("guest-batch-tag-suggestions");
    var guestBatchApply = document.getElementById("guest-batch-apply");
    var guestBatchClear = document.getElementById("guest-batch-clear");
    var batchSelectedTagName = "";

    function getSelectedGuestRows() {
        var rows = [];
        guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) {
            rows.push(cb.closest("tr"));
        });
        return rows;
    }

    function updateGuestBatchCount() {
        if (!guestBatchBar) return;
        var count = getSelectedGuestRows().length;
        guestBatchCount.textContent = count;
        guestBatchBar.style.display = count > 0 ? "flex" : "none";
        if (guestSelectAll) {
            var total = guestsTable.querySelectorAll("tbody tr .row-select").length;
            guestSelectAll.checked = count > 0 && count === total;
        }
    }

    function attachRowSelectListener(checkbox) {
        checkbox.addEventListener("change", updateGuestBatchCount);
    }

    // Attach to existing rows
    guestsTable.querySelectorAll("tbody tr .row-select").forEach(attachRowSelectListener);

    if (guestSelectAll) {
        guestSelectAll.addEventListener("change", function () {
            var checked = guestSelectAll.checked;
            guestsTable.querySelectorAll("tbody tr .row-select").forEach(function (cb) {
                cb.checked = checked;
            });
            updateGuestBatchCount();
        });
    }

    // Toggle multi-select from page menu
    var toggleGuestMultiBtn = document.getElementById("toggle-guest-multiselect-btn");
    if (toggleGuestMultiBtn) {
        toggleGuestMultiBtn.addEventListener("click", function () {
            var cols = document.querySelectorAll(".col-multiselect");
            var showing = cols.length > 0 && cols[0].style.display !== "none";
            cols.forEach(function (el) { el.style.display = showing ? "none" : "table-cell"; });
            if (showing) {
                // Deselect all when hiding
                guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) { cb.checked = false; });
                if (guestSelectAll) guestSelectAll.checked = false;
                updateGuestBatchCount();
            }
            var menu = toggleGuestMultiBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // ── Expand/collapse toggle ──────────────────────────────────────────────
    var toggleExpandBtn = document.getElementById("toggle-guest-expand-btn");
    if (toggleExpandBtn && guestsTable) {
        if (isMobile) {
            guestsTable.classList.add("table-collapsed");
            toggleExpandBtn.textContent = "Expand";
        } else {
            toggleExpandBtn.textContent = "Collapse";
        }
        toggleExpandBtn.addEventListener("click", function () {
            var isCollapsed = guestsTable.classList.toggle("table-collapsed");
            toggleExpandBtn.textContent = isCollapsed ? "Expand" : "Collapse";
            var menu = toggleExpandBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // Show/hide tag autocomplete based on action
    if (guestBatchAction) {
        guestBatchAction.addEventListener("change", function () {
            if (guestBatchTagWrapper) {
                var val = guestBatchAction.value;
                var showTag = val === "add-tag" || val === "remove-tag";
                guestBatchTagWrapper.style.display = showTag ? "" : "none";
                if (showTag && guestBatchTagInput) {
                    guestBatchTagInput.placeholder = val === "remove-tag" ? "Search tag to remove..." : "Search or create tag...";
                    guestBatchTagInput.focus();
                }
                if (!showTag) {
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                }
            }
        });
    }

    // Collect tag IDs present on selected rows (for remove-tag filtering)
    function getSelectedRowsTagIds() {
        var tagIdSet = {};
        getSelectedGuestRows().forEach(function (row) {
            var rowTags = (row.getAttribute("data-tags") || "").split(",").filter(Boolean);
            rowTags.forEach(function (id) { tagIdSet[id] = true; });
        });
        return tagIdSet;
    }

    // Batch tag autocomplete
    function showBatchTagSuggestions(query) {
        if (!guestBatchTagSuggestions) return;
        guestBatchTagSuggestions.innerHTML = "";
        var q = query.toLowerCase().trim();
        var isRemove = guestBatchAction && guestBatchAction.value === "remove-tag";

        // For remove-tag, show all relevant tags when input is empty
        if (!q && !isRemove) { guestBatchTagSuggestions.style.display = "none"; batchSelectedTagName = ""; return; }

        var pool = allUserTags;
        if (isRemove) {
            var selectedTagIds = getSelectedRowsTagIds();
            pool = allUserTags.filter(function (t) { return selectedTagIds[t.id]; });
        }

        var matches = pool.filter(function (t) {
            return !q || t.name.toLowerCase().indexOf(q) !== -1;
        });

        matches.forEach(function (tag) {
            var div = document.createElement("div");
            div.className = "tag-suggestion";
            div.innerHTML = '<span class="tag-suggestion-color" style="background:' + tag.color + '"></span>' +
                window.escapeHtml(tag.name);
            div.addEventListener("click", function () {
                batchSelectedTagName = tag.name;
                guestBatchTagInput.value = tag.name;
                guestBatchTagSuggestions.style.display = "none";
            });
            guestBatchTagSuggestions.appendChild(div);
        });

        if (!isRemove) {
            var exactMatch = allUserTags.some(function (t) { return t.name.toLowerCase() === q; });
            if (!exactMatch && q) {
                var createDiv = document.createElement("div");
                createDiv.className = "tag-suggestion tag-suggestion-create";
                createDiv.textContent = '+ Create "' + query.trim() + '"';
                createDiv.addEventListener("click", function () {
                    batchSelectedTagName = query.trim();
                    guestBatchTagInput.value = query.trim();
                    guestBatchTagSuggestions.style.display = "none";
                });
                guestBatchTagSuggestions.appendChild(createDiv);
            }
        }

        guestBatchTagSuggestions.style.display = guestBatchTagSuggestions.children.length > 0 ? "block" : "none";
    }

    if (guestBatchTagInput) {
        guestBatchTagInput.addEventListener("input", function () {
            batchSelectedTagName = "";
            showBatchTagSuggestions(guestBatchTagInput.value);
        });
        guestBatchTagInput.addEventListener("focus", function () {
            if (guestBatchAction && guestBatchAction.value === "remove-tag") {
                showBatchTagSuggestions(guestBatchTagInput.value);
            }
        });
        guestBatchTagInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var val = guestBatchTagInput.value.trim();
                if (!val) return;
                var match = allUserTags.find(function (t) { return t.name.toLowerCase() === val.toLowerCase(); });
                batchSelectedTagName = match ? match.name : val;
                guestBatchTagInput.value = batchSelectedTagName;
                guestBatchTagSuggestions.style.display = "none";
            }
        });
    }

    // Close batch tag suggestions on outside click
    document.addEventListener("click", function (e) {
        if (guestBatchTagSuggestions && !guestBatchTagSuggestions.contains(e.target) && e.target !== guestBatchTagInput) {
            guestBatchTagSuggestions.style.display = "none";
        }
    });

    // Apply batch action
    if (guestBatchApply) {
        guestBatchApply.addEventListener("click", function () {
            var action = guestBatchAction ? guestBatchAction.value : "";
            if (!action) return;
            var rows = getSelectedGuestRows();
            if (rows.length === 0) return;

            var ids = rows.map(function (row) { return parseInt(row.getAttribute("data-guest-id")); });

            if (action === "delete") {
                if (!confirm("Delete " + rows.length + " guest(s)? They will also be removed from all events.")) return;
                window.fetchWithCsrf("/api/v1/guests/bulk-delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    rows.forEach(function (row) { row.remove(); });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                })
                .catch(window.handleFetchError);
            } else if (action === "add-tag") {
                var tagName = batchSelectedTagName || (guestBatchTagInput ? guestBatchTagInput.value.trim() : "");
                if (!tagName) { if (guestBatchTagInput) guestBatchTagInput.focus(); return; }
                window.fetchWithCsrf("/api/v1/guests/bulk-tag", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids, tag_name: tagName })
                })
                .then(function (res) { return res.json(); })
                .then(function (resp) {
                    var updatedMap = {};
                    (resp.data || []).forEach(function (g) { updatedMap[g.id] = g.tags; });
                    rows.forEach(function (row) {
                        var gid = parseInt(row.getAttribute("data-guest-id"));
                        var tags = updatedMap[gid];
                        if (!tags) return;
                        var tagIds = tags.map(function (t) { return t.id; });
                        row.setAttribute("data-tags", tagIds.join(","));
                        var tagsCell = row.querySelector(".ge-tags-cell");
                        if (tagsCell) {
                            tagsCell.innerHTML = "";
                            tags.forEach(function (t) {
                                var badge = document.createElement("span");
                                badge.className = "tag-badge";
                                badge.style.background = t.color;
                                badge.textContent = t.name;
                                tagsCell.appendChild(badge);
                                tagsCell.appendChild(document.createTextNode(" "));
                            });
                        }
                        var cb = row.querySelector(".row-select");
                        if (cb) cb.checked = false;
                    });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                    // Refresh tags list
                    window.fetchWithCsrf("/api/v1/tags")
                        .then(function (res) { return res.json(); })
                        .then(function (resp) {
                            allUserTags = resp.data || [];
                            buildTagFilterDropdown();
                        })
                        .catch(function () {});
                })
                .catch(window.handleFetchError);
            } else if (action === "remove-tag") {
                var tagName = batchSelectedTagName || (guestBatchTagInput ? guestBatchTagInput.value.trim() : "");
                if (!tagName) { if (guestBatchTagInput) guestBatchTagInput.focus(); return; }
                window.fetchWithCsrf("/api/v1/guests/bulk-untag", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids, tag_name: tagName })
                })
                .then(function (res) { return res.json(); })
                .then(function (resp) {
                    var updatedMap = {};
                    (resp.data || []).forEach(function (g) { updatedMap[g.id] = g.tags; });
                    rows.forEach(function (row) {
                        var gid = parseInt(row.getAttribute("data-guest-id"));
                        var tags = updatedMap[gid];
                        if (!tags) return;
                        var tagIds = tags.map(function (t) { return t.id; });
                        row.setAttribute("data-tags", tagIds.join(","));
                        var tagsCell = row.querySelector(".ge-tags-cell");
                        if (tagsCell) {
                            tagsCell.innerHTML = "";
                            tags.forEach(function (t) {
                                var badge = document.createElement("span");
                                badge.className = "tag-badge";
                                badge.style.background = t.color;
                                badge.textContent = t.name;
                                tagsCell.appendChild(badge);
                                tagsCell.appendChild(document.createTextNode(" "));
                            });
                        }
                        var cb = row.querySelector(".row-select");
                        if (cb) cb.checked = false;
                    });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                })
                .catch(window.handleFetchError);
            } else if (action === "archive") {
                if (!confirm("Archive " + rows.length + " guest(s)? They will be hidden from the guest list but remain in existing events.")) return;
                window.fetchWithCsrf("/api/v1/guests/bulk-archive", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    if (!showArchived) {
                        rows.forEach(function (row) { row.remove(); });
                    } else {
                        rows.forEach(function (row) {
                            row.setAttribute("data-is-archived", "true");
                            row.classList.add("archived-row");
                            var archBtn = row.querySelector(".ge-archive-btn");
                            if (archBtn) archBtn.textContent = "Unarchive";
                            var cb = row.querySelector(".row-select");
                            if (cb) cb.checked = false;
                        });
                    }
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                })
                .catch(window.handleFetchError);
            }
        });
    }

    // Clear selection
    if (guestBatchClear) {
        guestBatchClear.addEventListener("click", function () {
            guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) { cb.checked = false; });
            if (guestSelectAll) guestSelectAll.checked = false;
            updateGuestBatchCount();
            if (guestBatchAction) guestBatchAction.value = "";
            batchSelectedTagName = "";
            if (guestBatchTagInput) guestBatchTagInput.value = "";
            if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
            if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
        });
    }

    // ── Tag autocomplete helpers ──────────────────────────────────────────

    var gdTagsDisplay = document.getElementById("gd-tags-display");
    var gdTagsInput = document.getElementById("gd-tags-input");
    var gdTagsSuggestions = document.getElementById("gd-tags-suggestions");

    function renderGuestTags() {
        if (!gdTagsDisplay) return;
        gdTagsDisplay.innerHTML = "";
        currentGuestTags.forEach(function (tag) {
            var badge = document.createElement("span");
            badge.className = "tag-badge";
            badge.style.background = tag.color;
            badge.innerHTML = window.escapeHtml(tag.name) +
                '<button type="button" class="tag-remove" data-tag-name="' + window.escapeHtml(tag.name) + '">&times;</button>';
            badge.querySelector(".tag-remove").addEventListener("click", function () {
                currentGuestTags = currentGuestTags.filter(function (t) { return t.name !== tag.name; });
                renderGuestTags();
            });
            gdTagsDisplay.appendChild(badge);
        });
    }

    function showTagSuggestions(query) {
        if (!gdTagsSuggestions) return;
        gdTagsSuggestions.innerHTML = "";
        var q = query.toLowerCase().trim();
        if (!q) { gdTagsSuggestions.style.display = "none"; return; }

        var currentNames = currentGuestTags.map(function (t) { return t.name.toLowerCase(); });
        var matches = allUserTags.filter(function (t) {
            return t.name.toLowerCase().indexOf(q) !== -1 && currentNames.indexOf(t.name.toLowerCase()) === -1;
        });

        var exactMatch = allUserTags.some(function (t) { return t.name.toLowerCase() === q; })
            || currentNames.indexOf(q) !== -1;

        matches.forEach(function (tag) {
            var div = document.createElement("div");
            div.className = "tag-suggestion";
            div.innerHTML = '<span class="tag-suggestion-color" style="background:' + tag.color + '"></span>' +
                window.escapeHtml(tag.name);
            div.addEventListener("click", function () {
                addTagToGuest(tag);
            });
            gdTagsSuggestions.appendChild(div);
        });

        if (!exactMatch && q) {
            var createDiv = document.createElement("div");
            createDiv.className = "tag-suggestion tag-suggestion-create";
            createDiv.textContent = '+ Create "' + query.trim() + '"';
            createDiv.addEventListener("click", function () {
                addNewTag(query.trim());
            });
            gdTagsSuggestions.appendChild(createDiv);
        }

        gdTagsSuggestions.style.display = gdTagsSuggestions.children.length > 0 ? "block" : "none";
    }

    function addTagToGuest(tag) {
        var exists = currentGuestTags.some(function (t) { return t.name.toLowerCase() === tag.name.toLowerCase(); });
        if (!exists) {
            currentGuestTags.push(tag);
            renderGuestTags();
        }
        if (gdTagsInput) { gdTagsInput.value = ""; }
        if (gdTagsSuggestions) gdTagsSuggestions.style.display = "none";
    }

    function addNewTag(name) {
        // Guess a color for the new tag
        var colors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8',
                      '#F7DC6F','#BB8FCE','#85C1E2','#F8B88B','#82E0AA'];
        var color = colors[(allUserTags.length + currentGuestTags.length) % colors.length];
        var newTag = { id: 0, name: name, color: color };
        currentGuestTags.push(newTag);
        renderGuestTags();
        if (gdTagsInput) gdTagsInput.value = "";
        if (gdTagsSuggestions) gdTagsSuggestions.style.display = "none";
    }

    if (gdTagsInput) {
        gdTagsInput.addEventListener("input", function () {
            showTagSuggestions(gdTagsInput.value);
        });
        gdTagsInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var val = gdTagsInput.value.trim();
                if (!val) return;
                // Check if there's an exact match in existing tags
                var match = allUserTags.find(function (t) { return t.name.toLowerCase() === val.toLowerCase(); });
                if (match) {
                    addTagToGuest(match);
                } else {
                    addNewTag(val);
                }
            }
        });
    }

    // Close suggestions on outside click
    document.addEventListener("click", function (e) {
        if (gdTagsSuggestions && !gdTagsSuggestions.contains(e.target) && e.target !== gdTagsInput) {
            gdTagsSuggestions.style.display = "none";
        }
    });

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

                // Populate tags
                currentGuestTags = (g.tags || []).slice();
                renderGuestTags();
                if (gdTagsInput) gdTagsInput.value = "";

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

            var tagNames = currentGuestTags.map(function (t) { return t.name; });
            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe, tag_names: tagNames })
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
                    // Update tags on row
                    var tagIds = (data.tags || []).map(function (t) { return t.id; });
                    gdActiveRow.setAttribute("data-tags", tagIds.join(","));
                    var tagsCell = gdActiveRow.querySelector(".ge-tags-cell");
                    if (tagsCell) {
                        tagsCell.innerHTML = "";
                        (data.tags || []).forEach(function (t) {
                            var badge = document.createElement("span");
                            badge.className = "tag-badge";
                            badge.style.background = t.color;
                            badge.textContent = t.name;
                            tagsCell.appendChild(badge);
                            tagsCell.appendChild(document.createTextNode(" "));
                        });
                    }
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
                // Refresh allUserTags to include any new tags
                window.fetchWithCsrf("/api/v1/tags")
                    .then(function (res) { return res.json(); })
                    .then(function (resp) {
                        allUserTags = resp.data || [];
                        buildTagFilterDropdown();
                    })
                    .catch(function () {});
                gdOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

});
