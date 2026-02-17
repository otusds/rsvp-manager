document.addEventListener("DOMContentLoaded", function () {

    // ── Table search ─────────────────────────────────────────────────────────
    document.querySelectorAll(".search-input[data-table]").forEach(function (input) {
        var tableId = input.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        input.addEventListener("input", function () { filterTable(table); });
    });

    // ── Table filter dropdowns ───────────────────────────────────────────────
    document.querySelectorAll(".filter-select[data-table]").forEach(function (select) {
        var tableId = select.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        select.addEventListener("change", function () { filterTable(table); });
    });

    function filterTable(table) {
        var tableId = table.id;
        var searchInput = document.querySelector('.search-input[data-table="' + tableId + '"]');
        var query = searchInput ? searchInput.value.toLowerCase() : "";
        var filters = [];
        document.querySelectorAll('.filter-select[data-table="' + tableId + '"]').forEach(function (sel) {
            var col = parseInt(sel.getAttribute("data-col"));
            var val = sel.value;
            if (val) filters.push({ col: col, val: val });
        });

        var rows = table.querySelectorAll("tbody tr");
        rows.forEach(function (row) {
            var text = row.textContent.toLowerCase();
            var matchesSearch = !query || text.indexOf(query) !== -1;
            var matchesFilters = true;
            for (var i = 0; i < filters.length; i++) {
                var cell = row.cells[filters[i].col];
                if (!cell) continue;
                var cellText = cell.textContent.trim();
                var selectEl = cell.querySelector("select");
                if (selectEl) cellText = selectEl.value;
                if (cellText !== filters[i].val) { matchesFilters = false; break; }
            }
            row.style.display = (matchesSearch && matchesFilters) ? "" : "none";
        });
    }

    // ── Table sort ───────────────────────────────────────────────────────────
    document.querySelectorAll("table.sortable th[data-sort]").forEach(function (th) {
        th.style.cursor = "pointer";
        th.addEventListener("click", function () {
            var table = th.closest("table");
            var tbody = table.querySelector("tbody");
            var rows = Array.from(tbody.querySelectorAll("tr"));
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
                if (sortType === "date") {
                    valA = cellA.getAttribute("data-value") || cellA.textContent.trim();
                    valB = cellB.getAttribute("data-value") || cellB.textContent.trim();
                } else if (sortType === "num") {
                    valA = parseFloat(cellA.textContent) || 0;
                    valB = parseFloat(cellB.textContent) || 0;
                    return dir === "asc" ? valA - valB : valB - valA;
                } else {
                    var selA = cellA.querySelector("select"), selB = cellB.querySelector("select");
                    valA = selA ? selA.value : cellA.textContent.trim().toLowerCase();
                    valB = selB ? selB.value : cellB.textContent.trim().toLowerCase();
                }
                if (valA < valB) return dir === "asc" ? -1 : 1;
                if (valA > valB) return dir === "asc" ? 1 : -1;
                return 0;
            });
            rows.forEach(function (row) { tbody.appendChild(row); });
        });
    });

    // ── AJAX invitation updates (no page reload) ──────────────────────────────

    function attachCheckboxListener(checkbox) {
        checkbox.addEventListener("change", function () {
            var invId = checkbox.getAttribute("data-inv-id");
            fetch("/invitation/" + invId + "/send", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" }
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var row = checkbox.closest("tr");
                var statusCell = row.cells[4];
                var dateInvitedCell = row.cells[3];
                var dateRespondedCell = row.cells[5];
                if (data.status === "Not Sent") {
                    statusCell.innerHTML = '<span class="status-not-sent">Not Sent</span>';
                    dateInvitedCell.textContent = "\u2014";
                    dateInvitedCell.setAttribute("data-value", "");
                    dateRespondedCell.textContent = "\u2014";
                    dateRespondedCell.setAttribute("data-value", "");
                } else {
                    statusCell.innerHTML =
                        '<select class="status-select" data-inv-id="' + invId + '">' +
                        '<option value="Pending" selected>Pending</option>' +
                        '<option value="Attending">Attending</option>' +
                        '<option value="Declined">Declined</option></select>';
                    attachStatusListener(statusCell.querySelector(".status-select"));
                    dateInvitedCell.textContent = data.date_invited;
                    dateInvitedCell.setAttribute("data-value", data.date_invited_iso);
                }
            });
        });
    }

    function attachStatusListener(select) {
        select.addEventListener("change", function () {
            var invId = select.getAttribute("data-inv-id");
            var formData = new FormData();
            formData.append("status", select.value);
            fetch("/invitation/" + invId + "/update", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: formData
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var row = select.closest("tr");
                var dateRespondedCell = row.cells[5];
                if (data.date_responded) {
                    dateRespondedCell.textContent = data.date_responded;
                    dateRespondedCell.setAttribute("data-value", data.date_responded_iso);
                } else {
                    dateRespondedCell.textContent = "\u2014";
                    dateRespondedCell.setAttribute("data-value", "");
                }
            });
        });
    }

    document.querySelectorAll(".sent-checkbox").forEach(attachCheckboxListener);
    document.querySelectorAll(".status-select").forEach(attachStatusListener);

    // ── Inline guest addition with autocomplete ─────────────────────────────

    var addRow = document.querySelector(".add-guest-row");
    if (addRow) {
        var eventId = addRow.getAttribute("data-event-id");
        var firstNameInput = document.getElementById("add-first-name");
        var lastNameInput = document.getElementById("add-last-name");
        var genderSelect = document.getElementById("add-gender");
        var addBtn = document.getElementById("add-guest-btn");
        var dropdown = document.getElementById("autocomplete-dropdown");
        var selectedGuestId = null;

        function escapeHtml(str) {
            var div = document.createElement("div");
            div.textContent = str;
            return div.innerHTML;
        }

        function searchGuests() {
            var firstName = firstNameInput.value.trim();
            var lastName = lastNameInput.value.trim();
            var q = (firstName + " " + lastName).trim();
            if (!q) { dropdown.style.display = "none"; return; }
            fetch("/api/guests/search?q=" + encodeURIComponent(q) + "&event_id=" + eventId)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.guests.length === 0) {
                        dropdown.style.display = "none";
                        return;
                    }
                    dropdown.innerHTML = "";
                    data.guests.forEach(function (g) {
                        var div = document.createElement("div");
                        div.className = "autocomplete-item";
                        div.innerHTML = '<span class="guest-name">' + escapeHtml(g.first_name + " " + g.last_name) + '</span>' +
                                       '<span class="guest-gender">' + escapeHtml(g.gender) + '</span>';
                        div.addEventListener("mousedown", function (e) {
                            e.preventDefault();
                            firstNameInput.value = g.first_name;
                            lastNameInput.value = g.last_name;
                            genderSelect.value = g.gender;
                            selectedGuestId = g.id;
                            dropdown.style.display = "none";
                            addBtn.focus();
                        });
                        dropdown.appendChild(div);
                    });
                    dropdown.style.display = "block";
                });
        }

        var debounceTimer;
        function debouncedSearch() {
            clearTimeout(debounceTimer);
            selectedGuestId = null;
            debounceTimer = setTimeout(searchGuests, 200);
        }

        firstNameInput.addEventListener("input", debouncedSearch);
        lastNameInput.addEventListener("input", debouncedSearch);

        document.addEventListener("click", function (e) {
            if (!dropdown.contains(e.target) && e.target !== firstNameInput && e.target !== lastNameInput) {
                dropdown.style.display = "none";
            }
        });

        function addGuest() {
            var firstName = firstNameInput.value.trim();
            var lastName = lastNameInput.value.trim();
            if (!firstName || !lastName) { firstNameInput.focus(); return; }

            var body = { first_name: firstName, last_name: lastName, gender: genderSelect.value };
            if (selectedGuestId) body.guest_id = selectedGuestId;

            fetch("/event/" + eventId + "/quick-add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) { alert(data.error); return; }
                var tbody = document.querySelector("#invitations-table tbody");
                var tr = document.createElement("tr");
                tr.innerHTML =
                    '<td>' + escapeHtml(data.first_name + " " + data.last_name) + '</td>' +
                    '<td>' + escapeHtml(data.gender) + '</td>' +
                    '<td class="center"><input type="checkbox" class="sent-checkbox" data-inv-id="' + data.invitation_id + '"></td>' +
                    '<td data-value="">\u2014</td>' +
                    '<td><span class="status-not-sent">Not Sent</span></td>' +
                    '<td data-value="">\u2014</td>' +
                    '<td><form method="POST" action="/invitation/' + data.invitation_id + '/delete" class="inline"' +
                    ' onsubmit="return confirm(\'Remove this guest from the event?\');">' +
                    '<button type="submit" class="btn btn-small btn-danger">Remove</button></form></td>';
                tbody.insertBefore(tr, addRow);
                attachCheckboxListener(tr.querySelector(".sent-checkbox"));
                firstNameInput.value = "";
                lastNameInput.value = "";
                genderSelect.value = "Male";
                selectedGuestId = null;
                firstNameInput.focus();
            });
        }

        addBtn.addEventListener("click", addGuest);
        firstNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); addGuest(); }
        });
        lastNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); addGuest(); }
        });
    }

    // ── Event card search, filter & sort ─────────────────────────────────────
    var grid = document.getElementById("event-grid");
    if (!grid) return;

    var searchInput = document.getElementById("event-search");
    var typeFilter = document.getElementById("event-type-filter");
    var sortSelect = document.getElementById("event-sort");
    var noResults = document.getElementById("no-results");

    function applyCardControls() {
        var query = searchInput.value.toLowerCase();
        var typeVal = typeFilter.value;
        var cards = Array.from(grid.querySelectorAll(".event-card"));
        var visible = 0;

        cards.forEach(function (card) {
            var name = card.getAttribute("data-name");
            var location = card.getAttribute("data-location");
            var type = card.getAttribute("data-type");
            var matchSearch = !query || name.indexOf(query) !== -1 || location.indexOf(query) !== -1;
            var matchType = !typeVal || type === typeVal;
            var show = matchSearch && matchType;
            card.style.display = show ? "" : "none";
            if (show) visible++;
        });

        noResults.style.display = visible === 0 ? "" : "none";

        // Sort visible cards
        var sortVal = sortSelect.value;
        var parts = sortVal.split("-");
        var key = parts[0], dir = parts[1];

        cards.sort(function (a, b) {
            var valA, valB;
            if (key === "date") {
                valA = a.getAttribute("data-date");
                valB = b.getAttribute("data-date");
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

        cards.forEach(function (card) { grid.appendChild(card); });
    }

    searchInput.addEventListener("input", applyCardControls);
    typeFilter.addEventListener("change", applyCardControls);
    sortSelect.addEventListener("change", applyCardControls);
});
