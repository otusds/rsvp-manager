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
            if (row.classList.contains("add-guest-row")) return;
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
                } else {
                    valA = cellA.textContent.trim().toLowerCase();
                    valB = cellB.textContent.trim().toLowerCase();
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

    // ── Auto-refresh summary ─────────────────────────────────────────────────
    // Cols: 0=Select, 1=Guest, 2=Gender, 3=Sent(checkbox), 4=Status, 5=Notes, 6=Actions

    function getRowStatus(row) {
        var checkbox = row.cells[3] && row.cells[3].querySelector(".sent-checkbox");
        if (!checkbox || !checkbox.checked) return "Not Sent";
        var sel = row.cells[4] && row.cells[4].querySelector("select");
        if (sel) return sel.value;
        return "Not Sent";
    }

    function getRowGender(row) {
        return row.cells[2] ? row.cells[2].textContent.trim().toLowerCase() : "male";
    }

    function refreshSummary() {
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
            ["attending", "pending", "declined", "invited", "notsent"].forEach(function (stat) {
                var cell = row.querySelector("[data-stat='" + stat + "']");
                if (cell) cell.innerHTML = bold ? "<strong>" + d[stat] + "</strong>" : String(d[stat]);
            });
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function colorStatusSelect(select) {
        select.className = select.className.replace(/\bstatus-\w+\b/g, "").trim();
        var val = select.value;
        if (val === "Attending") select.classList.add("status-attending");
        else if (val === "Pending") select.classList.add("status-pending");
        else if (val === "Declined") select.classList.add("status-declined");
    }

    // Color all status selects on load
    document.querySelectorAll(".status-select").forEach(colorStatusSelect);

    // ── Kebab (3-dot) menu toggle ───────────────────────────────────────────

    function attachKebabListener(btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var menu = btn.nextElementSibling;
            // Close all other open menus
            document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
                if (m !== menu) m.classList.remove("open");
            });
            menu.classList.toggle("open");
        });
    }

    document.querySelectorAll(".kebab-btn").forEach(attachKebabListener);

    // Close kebab menus on click outside
    document.addEventListener("click", function () {
        document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
            m.classList.remove("open");
        });
    });

    // ── Sent checkbox (AJAX toggle) ─────────────────────────────────────────

    function attachCheckboxListener(checkbox) {
        checkbox.addEventListener("change", function () {
            var invId = checkbox.getAttribute("data-inv-id");
            var row = checkbox.closest("tr");
            fetch("/invitation/" + invId + "/send", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" }
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var statusCell = row.cells[4];
                if (data.status === "Not Sent") {
                    checkbox.checked = false;
                    row.setAttribute("data-sent", "false");
                    row.setAttribute("data-date-invited", "");
                    row.setAttribute("data-date-invited-iso", "");
                    row.setAttribute("data-date-responded", "");
                    row.setAttribute("data-date-responded-iso", "");
                    statusCell.innerHTML = '<span class="status-not-sent">Not Sent</span>';
                } else {
                    checkbox.checked = true;
                    row.setAttribute("data-sent", "true");
                    row.setAttribute("data-date-invited", data.date_invited);
                    row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                    statusCell.innerHTML =
                        '<select class="inline-select status-select" data-inv-id="' + invId + '">' +
                        '<option value="Pending" selected>Pending</option>' +
                        '<option value="Attending">Attending</option>' +
                        '<option value="Declined">Declined</option>' +
                        '</select>';
                    var newSel = statusCell.querySelector(".status-select");
                    attachStatusListener(newSel);
                    colorStatusSelect(newSel);
                }
                refreshSummary();
            });
        });
    }

    // ── Status select (AJAX) ────────────────────────────────────────────────

    function attachStatusListener(select) {
        colorStatusSelect(select);
        select.addEventListener("change", function () {
            colorStatusSelect(select);
            var invId = select.getAttribute("data-inv-id");
            var row = select.closest("tr");
            var formData = new FormData();
            formData.append("status", select.value);
            fetch("/invitation/" + invId + "/update", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: formData
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                row.setAttribute("data-date-responded", data.date_responded || "");
                row.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                refreshSummary();
            });
        });
    }

    // ── Invitation notes (AJAX, debounced) ──────────────────────────────────

    function attachInvNotesListener(input) {
        var timer;
        input.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                var invId = input.getAttribute("data-inv-id");
                fetch("/api/invitation/" + invId + "/field", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ field: "notes", value: input.value })
                });
            }, 400);
        });
    }

    // ── Remove button (AJAX) ─────────────────────────────────────────────────

    function attachRemoveListener(btn) {
        btn.addEventListener("click", function () {
            if (!confirm("Remove this guest from the event?")) return;
            var invId = btn.getAttribute("data-inv-id");
            fetch("/invitation/" + invId + "/delete", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" }
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.ok) {
                    var row = btn.closest("tr");
                    if (currentDetailRow === row) closeDetail();
                    row.remove();
                    refreshSummary();
                    updateBatchCount();
                }
            });
        });
    }

    // ── Detail / Edit card modal ──────────────────────────────────────────────

    var detailOverlay = document.getElementById("detail-overlay");
    var currentDetailRow = null;

    function openDetail(row) {
        if (!detailOverlay) return;
        currentDetailRow = row;

        // Read name
        var fullName = row.cells[1].textContent.trim();
        var nameParts = fullName.split(" ");
        var firstName = nameParts[0] || "";
        var lastName = nameParts.slice(1).join(" ") || "";
        document.getElementById("detail-first-name").value = firstName;
        document.getElementById("detail-last-name").value = lastName;

        // Gender from col 2
        document.getElementById("detail-gender").value = row.cells[2].textContent.trim();

        // Sent toggle
        var sentCheckbox = row.cells[3].querySelector(".sent-checkbox");
        var isSent = sentCheckbox && sentCheckbox.checked;
        document.getElementById("detail-sent-toggle").checked = isSent;

        // Channel
        document.getElementById("detail-channel").value = row.getAttribute("data-channel") || "";

        // Dates
        document.getElementById("detail-date-invited").textContent = row.getAttribute("data-date-invited") || "\u2014";
        document.getElementById("detail-date-responded").textContent = row.getAttribute("data-date-responded") || "\u2014";

        // Status
        var statusSelect = document.getElementById("detail-status");
        var statusText = getRowStatus(row);
        if (isSent && statusText !== "Not Sent") {
            statusSelect.value = statusText;
            statusSelect.disabled = false;
        } else {
            statusSelect.value = "Pending";
            statusSelect.disabled = true;
        }

        // Notes
        var notesInput = row.cells[5] && row.cells[5].querySelector(".inv-notes-input");
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
            fetch("/api/guest/" + guestId + "/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: newFirst, last_name: newLast })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.ok && currentDetailRow) {
                    currentDetailRow.cells[1].textContent = data.full_name;
                }
            });
        }
        document.getElementById("detail-first-name").addEventListener("blur", saveDetailName);
        document.getElementById("detail-last-name").addEventListener("blur", saveDetailName);

        // Gender change
        document.getElementById("detail-gender").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var guestId = currentDetailRow.getAttribute("data-guest-id");
            var newGender = this.value;
            fetch("/api/guest/" + guestId + "/gender", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gender: newGender })
            })
            .then(function (res) { return res.json(); })
            .then(function () {
                if (currentDetailRow) {
                    currentDetailRow.cells[2].textContent = newGender;
                    refreshSummary();
                }
            });
        });

        // Sent toggle (syncs with table checkbox)
        document.getElementById("detail-sent-toggle").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var sentCheckbox = currentDetailRow.cells[3].querySelector(".sent-checkbox");
            if (sentCheckbox) {
                sentCheckbox.checked = this.checked;
                sentCheckbox.dispatchEvent(new Event("change"));
            }
            // Update detail card status after a short delay to let the fetch complete
            var toggle = this;
            setTimeout(function () {
                var statusSelect = document.getElementById("detail-status");
                if (toggle.checked) {
                    statusSelect.value = "Pending";
                    statusSelect.disabled = false;
                    document.getElementById("detail-date-invited").textContent =
                        currentDetailRow.getAttribute("data-date-invited") || "\u2014";
                } else {
                    statusSelect.disabled = true;
                    document.getElementById("detail-date-invited").textContent = "\u2014";
                }
            }, 300);
        });

        // Channel change
        document.getElementById("detail-channel").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            currentDetailRow.setAttribute("data-channel", this.value);
            fetch("/api/invitation/" + invId + "/field", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ field: "channel", value: this.value })
            });
        });

        // Status change (syncs with table dropdown)
        document.getElementById("detail-status").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newStatus = this.value;
            var tableSelect = currentDetailRow.cells[4].querySelector(".status-select");
            if (tableSelect) { tableSelect.value = newStatus; colorStatusSelect(tableSelect); }
            var formData = new FormData();
            formData.append("status", newStatus);
            fetch("/invitation/" + invId + "/update", {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: formData
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (!currentDetailRow) return;
                currentDetailRow.setAttribute("data-date-responded", data.date_responded || "");
                currentDetailRow.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                document.getElementById("detail-date-responded").textContent = data.date_responded || "\u2014";
                refreshSummary();
            });
        });

        // Notes change (syncs with table input)
        document.getElementById("detail-notes").addEventListener("blur", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newNotes = this.value;
            var tableInput = currentDetailRow.cells[5] && currentDetailRow.cells[5].querySelector(".inv-notes-input");
            if (tableInput) tableInput.value = newNotes;
            fetch("/api/invitation/" + invId + "/field", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ field: "notes", value: newNotes })
            });
        });
    }

    // ── Attach edit button listeners ──────────────────────────────────────────

    function attachEditListener(btn) {
        btn.addEventListener("click", function () {
            openDetail(btn.closest("tr"));
        });
    }

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

            var promises = rows.map(function (row) {
                var invId = row.getAttribute("data-inv-id");
                var checkbox = row.cells[3].querySelector(".sent-checkbox");
                var isSent = checkbox && checkbox.checked;

                if (action === "send" && !isSent) {
                    return fetch("/invitation/" + invId + "/send", {
                        method: "POST",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    }).then(function (res) { return res.json(); }).then(function (data) {
                        checkbox.checked = true;
                        row.setAttribute("data-sent", "true");
                        row.setAttribute("data-date-invited", data.date_invited);
                        row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                        var statusCell = row.cells[4];
                        statusCell.innerHTML =
                            '<select class="inline-select status-select" data-inv-id="' + invId + '">' +
                            '<option value="Pending" selected>Pending</option>' +
                            '<option value="Attending">Attending</option>' +
                            '<option value="Declined">Declined</option>' +
                            '</select>';
                        attachStatusListener(statusCell.querySelector(".status-select"));
                    });
                } else if (action === "unsend" && isSent) {
                    return fetch("/invitation/" + invId + "/send", {
                        method: "POST",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    }).then(function (res) { return res.json(); }).then(function () {
                        checkbox.checked = false;
                        row.setAttribute("data-sent", "false");
                        row.setAttribute("data-date-invited", "");
                        row.setAttribute("data-date-invited-iso", "");
                        row.setAttribute("data-date-responded", "");
                        row.setAttribute("data-date-responded-iso", "");
                        row.cells[4].innerHTML = '<span class="status-not-sent">Not Sent</span>';
                    });
                } else if (action === "attending" || action === "pending" || action === "declined") {
                    var newStatus = action.charAt(0).toUpperCase() + action.slice(1);
                    // If not yet sent, send first then update status
                    var sendFirst = !isSent
                        ? fetch("/invitation/" + invId + "/send", {
                            method: "POST",
                            headers: { "X-Requested-With": "XMLHttpRequest" }
                          }).then(function (res) { return res.json(); }).then(function (data) {
                            checkbox.checked = true;
                            row.setAttribute("data-sent", "true");
                            row.setAttribute("data-date-invited", data.date_invited);
                            row.setAttribute("data-date-invited-iso", data.date_invited_iso);
                            var statusCell = row.cells[4];
                            statusCell.innerHTML =
                                '<select class="inline-select status-select" data-inv-id="' + invId + '">' +
                                '<option value="Pending">Pending</option>' +
                                '<option value="Attending">Attending</option>' +
                                '<option value="Declined">Declined</option>' +
                                '</select>';
                            attachStatusListener(statusCell.querySelector(".status-select"));
                          })
                        : Promise.resolve();
                    return sendFirst.then(function () {
                        var formData = new FormData();
                        formData.append("status", newStatus);
                        return fetch("/invitation/" + invId + "/update", {
                            method: "POST",
                            headers: { "X-Requested-With": "XMLHttpRequest" },
                            body: formData
                        });
                    }).then(function (res) { return res.json(); }).then(function (data) {
                        var sel = row.cells[4].querySelector(".status-select");
                        if (sel) { sel.value = newStatus; colorStatusSelect(sel); }
                        row.setAttribute("data-date-responded", data.date_responded || "");
                        row.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                    });
                }
                return Promise.resolve();
            });

            Promise.all(promises).then(function () {
                refreshSummary();
                batchActionSelect.value = "";
                rows.forEach(function (row) {
                    var cb = row.querySelector(".row-select");
                    if (cb) cb.checked = false;
                });
                updateBatchCount();
            });
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
                fetch("/api/event/" + evId + "/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes: eventNotesArea.value })
                })
                .then(function () {
                    if (saveIndicator) {
                        saveIndicator.style.opacity = "1";
                        setTimeout(function () { saveIndicator.style.opacity = "0"; }, 1500);
                    }
                });
            }, 500);
        });
    }

    // ── Inline guest addition with autocomplete ─────────────────────────────

    var addRow = document.querySelector(".add-guest-row");
    if (addRow) {
        var eventId = addRow.getAttribute("data-event-id");
        var firstNameInput = document.getElementById("add-first-name");
        var lastNameInput = document.getElementById("add-last-name");
        var addStatusSelect = document.getElementById("add-status");
        var addGenderSelect = document.getElementById("add-gender");
        var addBtn = document.getElementById("add-guest-btn");
        var dropdown = document.getElementById("autocomplete-dropdown");
        var selectedGuestId = null;

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
                        var name = g.last_name ? g.first_name + " " + g.last_name : g.first_name;
                        div.innerHTML = '<span class="guest-name">' + escapeHtml(name) + '</span>' +
                                       '<span class="guest-gender">' + escapeHtml(g.gender) + '</span>';
                        div.addEventListener("mousedown", function (e) {
                            e.preventDefault();
                            firstNameInput.value = g.first_name;
                            lastNameInput.value = g.last_name;
                            addGenderSelect.value = g.gender;
                            selectedGuestId = g.id;
                            dropdown.style.display = "none";
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

        firstNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Tab") { dropdown.style.display = "none"; }
            else if (e.key === "Enter") { e.preventDefault(); dropdown.style.display = "none"; addGuest(); }
        });
        lastNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Tab") { dropdown.style.display = "none"; }
            else if (e.key === "Enter") { e.preventDefault(); dropdown.style.display = "none"; addGuest(); }
        });
        addStatusSelect.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); addGuest(); }
        });

        function addGuest() {
            var firstName = firstNameInput.value.trim();
            var lastName = lastNameInput.value.trim();
            if (!firstName) { firstNameInput.focus(); return; }

            var statusVal = addStatusSelect.value;
            var sent = statusVal !== "Not Sent";
            var body = {
                first_name: firstName,
                last_name: lastName,
                gender: addGenderSelect.value,
                sent: sent,
                status: statusVal,
                channel: "",
                notes: ""
            };
            if (selectedGuestId) body.guest_id = selectedGuestId;

            fetch("/event/" + eventId + "/quick-add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) { alert(data.error); return; }
                var displayName = data.last_name ? data.first_name + " " + data.last_name : data.first_name;
                var isSent = data.status !== "Not Sent";
                var tbody = document.querySelector("#invitations-table tbody");
                var tr = document.createElement("tr");
                tr.setAttribute("data-inv-id", data.invitation_id);
                tr.setAttribute("data-guest-id", data.guest_id);
                tr.setAttribute("data-channel", data.channel || "");
                tr.setAttribute("data-sent", isSent ? "true" : "false");
                tr.setAttribute("data-date-invited", data.date_invited || "");
                tr.setAttribute("data-date-invited-iso", data.date_invited_iso || "");
                tr.setAttribute("data-date-responded", data.date_responded || "");
                tr.setAttribute("data-date-responded-iso", data.date_responded_iso || "");

                var statusHtml;
                if (isSent) {
                    statusHtml =
                        '<select class="inline-select status-select" data-inv-id="' + data.invitation_id + '">' +
                        '<option value="Pending"' + (data.status === "Pending" ? " selected" : "") + '>Pending</option>' +
                        '<option value="Attending"' + (data.status === "Attending" ? " selected" : "") + '>Attending</option>' +
                        '<option value="Declined"' + (data.status === "Declined" ? " selected" : "") + '>Declined</option>' +
                        '</select>';
                } else {
                    statusHtml = '<span class="status-not-sent">Not Sent</span>';
                }

                tr.innerHTML =
                    '<td class="center"><input type="checkbox" class="row-select"></td>' +
                    '<td class="guest-name-cell">' + escapeHtml(displayName) + '</td>' +
                    '<td class="col-hide-mobile">' + escapeHtml(data.gender) + '</td>' +
                    '<td class="center"><input type="checkbox" class="sent-checkbox" data-inv-id="' + data.invitation_id + '"' + (isSent ? ' checked' : '') + '></td>' +
                    '<td>' + statusHtml + '</td>' +
                    '<td class="col-hide-mobile"><input type="text" class="inv-notes-input" data-inv-id="' + data.invitation_id + '" value="" placeholder="Add note..."></td>' +
                    '<td><div class="kebab-wrapper">' +
                    '<button type="button" class="kebab-btn" aria-label="Actions">&#x2026;</button>' +
                    '<div class="kebab-menu">' +
                    '<button type="button" class="edit-btn">Edit</button>' +
                    '<button type="button" class="kebab-danger remove-btn" data-inv-id="' + data.invitation_id + '">Remove</button>' +
                    '</div></div></td>';

                tbody.insertBefore(tr, addRow);
                attachCheckboxListener(tr.querySelector(".sent-checkbox"));
                var statusSel = tr.querySelector(".status-select");
                if (statusSel) attachStatusListener(statusSel);
                attachInvNotesListener(tr.querySelector(".inv-notes-input"));
                attachRemoveListener(tr.querySelector(".remove-btn"));
                attachEditListener(tr.querySelector(".edit-btn"));
                attachKebabListener(tr.querySelector(".kebab-btn"));
                attachRowSelectListener(tr.querySelector(".row-select"));

                // Reset
                firstNameInput.value = "";
                lastNameInput.value = "";
                addGenderSelect.value = "Male";
                addStatusSelect.value = "Not Sent";
                selectedGuestId = null;
                firstNameInput.focus();
                refreshSummary();
            });
        }

        addBtn.addEventListener("click", addGuest);
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
        var cards = Array.from(grid.querySelectorAll(".event-row-card"));
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
