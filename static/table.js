document.addEventListener("DOMContentLoaded", function () {

    // ── Table search ─────────────────────────────────────────────────────────
    document.querySelectorAll(".search-input[data-table]").forEach(function (input) {
        var tableId = input.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        input.addEventListener("input", function () { filterTable(table); });
        input.addEventListener("search", function () { filterTable(table); });
    });

    // ── Table filter dropdowns ───────────────────────────────────────────────
    document.querySelectorAll(".filter-select[data-table]").forEach(function (select) {
        var tableId = select.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        select.addEventListener("change", function () { filterTable(table); });
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
            // Toggle direction if same field sorted again
            if (sortKey === lastSortKey) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortDir = "asc";
                lastSortKey = sortKey;
            }
            var dir = sortDir;
            // Reset dropdown to placeholder so re-selecting same option fires change
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

            // Sync header arrows with dropdown sort
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

    function filterTable(table) {
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
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    function colorStatusSelect(select) {
        select.className = select.className.replace(/\bstatus-(attending|pending|declined)\b/g, "").trim();
        var val = select.value;
        if (val === "Attending") select.classList.add("status-attending");
        else if (val === "Pending") select.classList.add("status-pending");
        else if (val === "Declined") select.classList.add("status-declined");
    }

    // Color all status selects on load
    document.querySelectorAll(".status-select").forEach(colorStatusSelect);

    function buildStatusHtml(invId, status) {
        if (status === "Not Sent") {
            return '<span class="status-not-sent">Not Sent</span>';
        }
        return '<select class="inline-select status-select" data-inv-id="' + invId + '">' +
            '<option value="Attending"' + (status === "Attending" ? " selected" : "") + '>Attending</option>' +
            '<option value="Pending"' + (status === "Pending" ? " selected" : "") + '>Pending</option>' +
            '<option value="Declined"' + (status === "Declined" ? " selected" : "") + '>Declined</option>' +
            '</select>';
    }

    function buildInvitationRow(data) {
        var displayName = data.last_name ? data.first_name + " " + data.last_name : data.first_name;
        var isSent = data.status !== "Not Sent";
        var multiCol = document.querySelector(".col-multiselect");
        var multiShow = multiCol && multiCol.style.display !== "none" ? "" : "none";

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
            '<td class="guest-name-cell">' + escapeHtml(displayName) + ' <span class="gender-tag">' + escapeHtml(genderTag) + '</span></td>' +
            '<td class="center"><input type="checkbox" class="sent-checkbox" data-inv-id="' + data.invitation_id + '"' + (isSent ? ' checked' : '') + '></td>' +
            '<td>' + buildStatusHtml(data.invitation_id, data.status) + '</td>' +
            '<td class="col-hide-mobile"><input type="text" class="inv-notes-input" data-inv-id="' + data.invitation_id + '" value="' + escapeHtml(data.notes || "") + '" placeholder="Invite note..."></td>' +
            '<td><div class="kebab-wrapper">' +
            '<button type="button" class="kebab-btn" aria-label="Actions">&#x2026;</button>' +
            '<div class="kebab-menu">' +
            '<button type="button" class="edit-btn">Edit</button>' +
            '<button type="button" class="kebab-danger remove-btn" data-inv-id="' + data.invitation_id + '">Remove</button>' +
            '</div></div></td>';

        attachCheckboxListener(tr.querySelector(".sent-checkbox"));
        var statusSel = tr.querySelector(".status-select");
        if (statusSel) attachStatusListener(statusSel);
        attachInvNotesListener(tr.querySelector(".inv-notes-input"));
        attachRemoveListener(tr.querySelector(".remove-btn"));
        attachEditListener(tr.querySelector(".edit-btn"));
        attachKebabListener(tr.querySelector(".kebab-btn"));
        attachRowSelectListener(tr.querySelector(".row-select"));

        return tr;
    }

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
                statusCell.innerHTML = buildStatusHtml(invId, data.status);
                var newSel = statusCell.querySelector(".status-select");
                if (newSel) { attachStatusListener(newSel); colorStatusSelect(newSel); }
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

        // Read name (strip gender tag like "(M)" or "(F)")
        var fullName = row.cells[1].textContent.trim().replace(/\s*\([MF]\)\s*$/, "");
        var nameParts = fullName.split(" ");
        var firstName = nameParts[0] || "";
        var lastName = nameParts.slice(1).join(" ") || "";
        document.getElementById("detail-first-name").value = firstName;
        document.getElementById("detail-last-name").value = lastName;

        // Gender from data attribute
        document.getElementById("detail-gender").value = row.getAttribute("data-gender") || "";

        // Sent toggle
        var sentCheckbox = row.cells[2].querySelector(".sent-checkbox");
        var isSent = sentCheckbox && sentCheckbox.checked;
        document.getElementById("detail-sent-toggle").checked = isSent;

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
            fetch("/api/guest/" + guestId + "/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: newFirst, last_name: newLast })
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.ok && currentDetailRow) {
                    var nameCell = currentDetailRow.cells[1];
                    var genderTag = nameCell.querySelector(".gender-tag");
                    var tagHTML = genderTag ? " " + genderTag.outerHTML : "";
                    nameCell.innerHTML = escapeHtml(data.full_name) + tagHTML;
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
                    currentDetailRow.setAttribute("data-gender", newGender);
                    var genderTag = currentDetailRow.cells[1] && currentDetailRow.cells[1].querySelector(".gender-tag");
                    if (genderTag) genderTag.textContent = newGender === "Male" ? "(M)" : newGender === "Female" ? "(F)" : "";
                    refreshSummary();
                }
            });
        });

        // Sent toggle (syncs with table checkbox)
        document.getElementById("detail-sent-toggle").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var sentCheckbox = currentDetailRow.cells[2].querySelector(".sent-checkbox");
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

        // Status change (syncs with table dropdown)
        document.getElementById("detail-status").addEventListener("change", function () {
            if (!currentDetailRow) return;
            var invId = currentDetailRow.getAttribute("data-inv-id");
            var newStatus = this.value;
            var tableSelect = currentDetailRow.cells[3].querySelector(".status-select");
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
            var tableInput = currentDetailRow.cells[4] && currentDetailRow.cells[4].querySelector(".inv-notes-input");
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
            if (action === "remove" && !confirm("Remove " + rows.length + " guest(s) from this event?")) return;

            var promises = rows.map(function (row) {
                var invId = row.getAttribute("data-inv-id");
                var checkbox = row.cells[2].querySelector(".sent-checkbox");
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
                        var statusCell = row.cells[3];
                        statusCell.innerHTML = buildStatusHtml(invId, "Pending");
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
                        row.cells[3].innerHTML = buildStatusHtml(invId, "Not Sent");
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
                            var statusCell = row.cells[3];
                            statusCell.innerHTML = buildStatusHtml(invId, "Pending");
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
                        var sel = row.cells[3].querySelector(".status-select");
                        if (sel) { sel.value = newStatus; colorStatusSelect(sel); }
                        row.setAttribute("data-date-responded", data.date_responded || "");
                        row.setAttribute("data-date-responded-iso", data.date_responded_iso || "");
                    });
                } else if (action === "remove") {
                    return fetch("/invitation/" + invId + "/delete", {
                        method: "POST",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    }).then(function (res) { return res.json(); }).then(function (data) {
                        if (data.ok) {
                            if (currentDetailRow === row) closeDetail();
                            row.remove();
                        }
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

    // ── Add New Guest modal ──────────────────────────────────────────────────

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

    function openAddGuestModal() {
        addGuestTbody.innerHTML = "";
        addGuestTbody.appendChild(createBlankGuestRow());
        addGuestOverlay.style.display = "flex";
        addGuestTbody.querySelector(".ag-first-name").focus();
    }

    // Event page trigger (inside kebab menu)
    var addNewGuestBtn = document.getElementById("add-new-guest-btn");
    if (addNewGuestBtn && addGuestOverlay) {
        addNewGuestBtn.addEventListener("click", function () {
            var menu = addNewGuestBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            openAddGuestModal();
        });
    }

    // Guest DB page trigger (header button)
    var openAddGuestPageBtn = document.getElementById("open-add-guest-btn");
    if (openAddGuestPageBtn && addGuestOverlay) {
        openAddGuestPageBtn.addEventListener("click", openAddGuestModal);
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
                fetch("/api/event/" + eventId + "/bulk-create-and-invite", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guests: guests })
                })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var tbody = document.querySelector("#invitations-table tbody");
                    data.added.forEach(function (g) {
                        var tr = buildInvitationRow(g);
                        tbody.appendChild(tr);
                    });
                    refreshSummary();
                    addGuestOverlay.style.display = "none";
                });
            } else {
                // Guest DB page: create guests only, reload to get inline-edit rows
                fetch("/api/guests/bulk-create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guests: guests })
                })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.added.length > 0) location.reload();
                    else addGuestOverlay.style.display = "none";
                });
            }
        });
    }

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

    // ── Filter toggle buttons (home + guest list) ──────────────────────────
    function setupFilterToggle(btnId, panelId) {
        var btn = document.getElementById(btnId);
        var panel = document.getElementById(panelId);
        if (btn && panel) {
            btn.addEventListener("click", function () {
                var hidden = panel.style.display === "none";
                panel.style.display = hidden ? "" : "none";
                btn.classList.toggle("active", hidden);
            });
        }
    }
    setupFilterToggle("toggle-filters-btn", "event-filters");
    setupFilterToggle("gl-toggle-filters-btn", "gl-filters");

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

    // ── Guest list 3-dot menu ────────────────────────────────────────────────
    var glMenuBtn = document.querySelector(".gl-menu-btn");
    if (glMenuBtn) {
        attachKebabListener(glMenuBtn);
    }

    // ── Multi-select toggle ──────────────────────────────────────────────────
    var toggleMultiBtn = document.getElementById("toggle-multiselect-btn");
    if (toggleMultiBtn) {
        toggleMultiBtn.addEventListener("click", function () {
            var cols = document.querySelectorAll(".col-multiselect");
            var showing = cols.length > 0 && cols[0].style.display !== "none";
            cols.forEach(function (el) { el.style.display = showing ? "none" : ""; });
            // Close the kebab menu
            var menu = toggleMultiBtn.closest(".kebab-menu");
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

    if (selectFromDbBtn && guestDbOverlay) {
        var invTable = document.getElementById("invitations-table");
        var eventId = invTable ? invTable.getAttribute("data-event-id") : null;

        function applyGuestDbFilters() {
            var q = guestDbSearchInput ? guestDbSearchInput.value.toLowerCase() : "";
            var genderVal = guestDbGenderFilter ? guestDbGenderFilter.value : "";
            var sortVal = guestDbSort ? guestDbSort.value : "first-asc";
            var items = Array.from(guestDbList.querySelectorAll(".guest-db-item"));

            // Sort
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

            // Filter
            items.forEach(function (item) {
                var name = item.querySelector(".guest-db-item-name").textContent.toLowerCase();
                var gender = item.getAttribute("data-gender") || "";
                var matchSearch = !q || name.indexOf(q) !== -1;
                var matchGender = !genderVal || gender === genderVal;
                item.style.display = (matchSearch && matchGender) ? "" : "none";
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
        if (guestDbSort) guestDbSort.addEventListener("change", applyGuestDbFilters);

        selectFromDbBtn.addEventListener("click", function () {
            var menu = selectFromDbBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            if (!eventId) return;
            fetch("/api/event/" + eventId + "/available-guests")
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    guestDbList.innerHTML = "";
                    data.guests.forEach(function (g) {
                        var name = g.last_name ? g.first_name + " " + g.last_name : g.first_name;
                        var div = document.createElement("div");
                        div.className = "guest-db-item" + (g.already_invited ? " disabled" : "");
                        div.setAttribute("data-first", g.first_name.toLowerCase());
                        div.setAttribute("data-last", (g.last_name || "").toLowerCase());
                        div.setAttribute("data-gender", g.gender);
                        div.innerHTML =
                            '<input type="checkbox" data-guest-id="' + g.id + '"' +
                            (g.already_invited ? ' checked disabled' : '') + '>' +
                            '<div class="guest-db-item-info">' +
                            '<div class="guest-db-item-name">' + escapeHtml(name) + '</div>' +
                            '<div class="guest-db-item-gender">' + escapeHtml(g.gender) + '</div>' +
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
                    // Reset filters
                    if (guestDbGenderFilter) guestDbGenderFilter.value = "";
                    if (guestDbSort) guestDbSort.value = "first-asc";
                    if (guestDbFilters) { guestDbFilters.style.display = "none"; }
                    if (guestDbFilterBtn) guestDbFilterBtn.classList.remove("active");
                    if (guestDbSelectAll) guestDbSelectAll.checked = false;
                    guestDbOverlay.style.display = "flex";
                    guestDbSearchInput.value = "";
                    applyGuestDbFilters();
                    guestDbSearchInput.focus();
                });
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

            fetch("/api/event/" + eventId + "/bulk-add", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ guest_ids: ids })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var tbody = document.querySelector("#invitations-table tbody");
                data.added.forEach(function (g) {
                    var tr = buildInvitationRow(g);
                    tbody.appendChild(tr);
                });
                refreshSummary();
                guestDbOverlay.style.display = "none";
            });
        });
    }

    // ── Guest Database table search, filter & sort ──────────────────────────────
    var guestsTable = document.getElementById("guests-table");
    if (guestsTable) {
        var guestSearchInput = document.getElementById("guest-search");
        var guestGenderFilter = document.getElementById("guest-gender-filter");
        var guestSortSelect = document.getElementById("guest-sort");
        var guestNoResults = document.getElementById("no-results");

        function sortGuestRows() {
            var tbody = guestsTable.querySelector("tbody");
            var rows = Array.from(tbody.querySelectorAll("tr"));
            var sortVal = guestSortSelect ? guestSortSelect.value : "created-desc";
            var parts = sortVal.split("-");
            var key = parts[0], dir = parts[1];

            rows.sort(function (a, b) {
                // "Me" rows always on top
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

        // ── Inline editing ───────────────────────────────────────────────────
        function saveGuestName(input) {
            var row = input.closest("tr");
            var guestId = input.getAttribute("data-guest-id");
            var firstName = row.querySelector(".ge-first").value.trim();
            var lastName = row.querySelector(".ge-last").value.trim();
            if (!firstName) return;
            row.setAttribute("data-first", firstName.toLowerCase());
            row.setAttribute("data-last", lastName.toLowerCase());
            fetch("/api/guest/" + guestId + "/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName })
            });
        }

        guestsTable.querySelectorAll(".ge-first, .ge-last").forEach(function (input) {
            input.addEventListener("blur", function () { saveGuestName(input); });
        });

        var isMobile = window.matchMedia("(max-width: 600px)").matches;

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

        guestsTable.querySelectorAll(".ge-gender").forEach(function (select) {
            abbreviateGender(select);
            select.addEventListener("focus", function () { expandGender(select); });
            select.addEventListener("blur", function () { abbreviateGender(select); });
            select.addEventListener("change", function () {
                var guestId = select.getAttribute("data-guest-id");
                var row = select.closest("tr");
                row.setAttribute("data-gender", select.value);
                fetch("/api/guest/" + guestId + "/gender", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ gender: select.value })
                });
            });
        });

        guestsTable.querySelectorAll(".ge-notes").forEach(function (input) {
            var timer;
            input.addEventListener("input", function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                    var guestId = input.getAttribute("data-guest-id");
                    fetch("/api/guest/" + guestId + "/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ notes: input.value.trim() })
                    });
                }, 500);
            });
        });

        guestsTable.querySelectorAll(".ge-is-me-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var guestId = btn.getAttribute("data-guest-id");
                var row = btn.closest("tr");
                var wasMe = row.getAttribute("data-is-me") === "true";
                var newVal = !wasMe;
                fetch("/api/guest/" + guestId + "/is-me", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_me: newVal })
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    // Clear old "Me" badges
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
                        btn.textContent = "\u2713 This is me";
                    } else {
                        row.setAttribute("data-is-me", "false");
                        btn.textContent = "This is me";
                    }
                    btn.closest(".kebab-menu").classList.remove("open");
                });
            });
        });
    }

    // ── Position "me" badges right after first name text ──────────────────────
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

    // Position all existing badges on load
    document.querySelectorAll(".badge-me").forEach(function (badge) {
        var input = badge.parentNode.querySelector(".ge-first");
        if (input) positionMeBadge(input);
    });

    // Reposition badge when name changes
    document.querySelectorAll(".ge-first").forEach(function (input) {
        input.addEventListener("input", function () { positionMeBadge(input); });
        input.addEventListener("blur", function () { positionMeBadge(input); });
    });

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
            var matchSearch = !query || name.indexOf(query) !== -1 || location.indexOf(query) !== -1;
            var matchType = !typeVal || type === typeVal;
            var show = matchSearch && matchType;
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
                pastSection.style.display = "";
                pastCount.textContent = pastCards.length;
                pastCards.forEach(function (c) { pastGrid.appendChild(c); });
            } else {
                pastSection.style.display = "none";
            }
        }

        var totalVisible = futureCards.length + pastCards.length;
        if (noResults) noResults.style.display = totalVisible === 0 ? "" : "none";
    }

    if (pastToggle) {
        pastToggle.addEventListener("click", function () {
            var isOpen = pastToggle.classList.toggle("open");
            pastGrid.style.display = isOpen ? "" : "none";
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", applyCardControls);
        searchInput.addEventListener("search", applyCardControls);
    }
    if (typeFilter) typeFilter.addEventListener("change", applyCardControls);
    if (sortSelect) sortSelect.addEventListener("change", applyCardControls);

    // Initial separation of past events
    applyCardControls();
});
