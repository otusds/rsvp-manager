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
            '<td class="col-hide-mobile"><input type="text" class="inv-notes-input" data-inv-id="' + data.invitation_id + '" value="' + window.escapeHtml(data.notes || "") + '" placeholder="Invite note..."></td>' +
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

            window.fetchWithCsrf("/api/v1/guests/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe })
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
                    window.refreshSummary();
                }
                gdOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Attach all guest detail listeners ─────────────────────────────────
    document.querySelectorAll(".inv-guest-detail-btn").forEach(attachGuestDetailListener);

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
            window.fetchWithCsrf("/api/v1/events/" + eventId + "/available-guests")
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    guestDbList.innerHTML = "";
                    resp.data.forEach(function (g) {
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
                            '<div class="guest-db-item-name">' + window.escapeHtml(name) + '</div>' +
                            '<div class="guest-db-item-gender">' + window.escapeHtml(g.gender) + '</div>' +
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
                    if (guestDbSort) guestDbSort.value = "first-asc";
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
