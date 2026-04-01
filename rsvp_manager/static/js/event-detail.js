document.addEventListener("DOMContentLoaded", function () {

    // ── Gender label helper ─────────────────────────────────────────────────
    function genderTagText(gender) {
        if (gender === "Male") return " (M)";
        if (gender === "Female") return " (F)";
        return "";
    }

    // ── Last Edited timestamp helper ────────────────────────────────────────
    function touchLastEdited() {
        var el = document.getElementById("last-edited-value");
        if (!el) return;
        var now = new Date();
        var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        var d = String(now.getDate()).padStart(2, "0");
        var h = String(now.getHours()).padStart(2, "0");
        var m = String(now.getMinutes()).padStart(2, "0");
        el.textContent = d + " " + months[now.getMonth()] + " " + now.getFullYear() + " at " + h + ":" + m;
    }

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
            var t = counts.total;

            // RSVP Status breakdown
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
        }

        // Update guest list heading count
        var glHeading = document.getElementById("guest-list-heading");
        if (glHeading) {
            var visibleRows = 0;
            rows.forEach(function (r) { if (r.style.display !== "none") visibleRows++; });
            glHeading.textContent = visibleRows < rows.length
                ? "Guest List (" + visibleRows + "/" + rows.length + ")"
                : "Guest List (" + rows.length + ")";
        }
        touchLastEdited();
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

        var genderClass = data.gender === "Male" ? "gender-m" : data.gender === "Female" ? "gender-f" : "";
        var genderLabel = data.gender === "Male" ? "M" : data.gender === "Female" ? "F" : "";
        tr.innerHTML =
            '<td class="center col-multiselect" style="display:' + multiShow + '"><input type="checkbox" class="row-select"></td>' +
            '<td class="guest-name-cell">' + (genderLabel ? '<span class="gender-tag ' + genderClass + '">' + genderLabel + '</span> ' : '') + window.escapeHtml(displayName) + '</td>' +
            '<td class="center"><input type="checkbox" class="sent-checkbox" data-inv-id="' + data.invitation_id + '"' + (isSent ? ' checked' : '') + '></td>' +
            '<td>' + window.buildStatusHtml(data.invitation_id, data.status) + '</td>' +
            '<td class="col-expand-mobile"><input type="text" class="inv-notes-input" data-inv-id="' + data.invitation_id + '" value="' + window.escapeHtml(data.notes || "") + '" placeholder="Invite note..." autocomplete="off"></td>' +
            '<td class="col-expand">' + window.escapeHtml(data.guest_notes || "") + '</td>' +
            '<td class="col-expand">' + window.buildTagBadges(data.guest_tags || []) + '</td>' +
            '<td><div class="kebab-wrapper">' +
            '<button type="button" class="kebab-btn" aria-label="Actions">&#x2026;</button>' +
            '<div class="kebab-menu">' +
            '<button type="button" class="inv-guest-detail-btn" data-guest-id="' + data.guest_id + '">Guest detail</button>' +
            '<button type="button" class="kebab-danger remove-btn" data-inv-id="' + data.invitation_id + '">Remove</button>' +
            '</div></div></td>';

        attachCheckboxListener(tr.querySelector(".sent-checkbox"));
        var statusSel = tr.querySelector(".status-select");
        if (statusSel) attachStatusListener(statusSel);
        attachInvNotesListener(tr.querySelector(".inv-notes-input"));
        attachRemoveListener(tr.querySelector(".remove-btn"));
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
                    window.trackEvent("invitation-sent");
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
                var statusMap = { "Attending": "accepted", "Declined": "declined", "Pending": "maybe" };
                window.trackEvent("rsvp-received", { status: statusMap[select.value] || select.value.toLowerCase() });
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
                    row.remove();
                    window.refreshSummary();
                    updateBatchCount();
                }
            })
            .catch(window.handleFetchError);
        });
    }

    // ── (Old invitation detail removed — merged into Guest Detail) ──────────

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

    // ── Populate "Added by" filter dropdown (only for shared events) ────────
    var addedByFilter = document.getElementById("gl-added-by-filter");
    if (addedByFilter) {
        var names = new Set();
        document.querySelectorAll("#invitations-table tbody tr").forEach(function (row) {
            var name = row.getAttribute("data-added-by-name");
            if (name) names.add(name);
        });
        if (names.size > 1) {
            names.forEach(function (name) {
                var opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                addedByFilter.appendChild(opt);
            });
        } else {
            addedByFilter.style.display = "none";
        }
    }

    // ── Clear guest list filters ─────────────────────────────────────────
    var glClearBtn = document.getElementById("gl-clear-filters");
    if (glClearBtn) {
        glClearBtn.addEventListener("click", function () {
            var glSearch = document.querySelector('.search-input[data-table="invitations-table"]');
            if (glSearch) glSearch.value = "";
            document.querySelectorAll('.filter-select[data-table="invitations-table"]').forEach(function (sel) {
                sel.selectedIndex = 0;
            });
            var glSort = document.getElementById("gl-sort");
            if (glSort) glSort.selectedIndex = 0;
            if (glTagFilterToggle) glTagFilterToggle.textContent = "All Tags";
            glSelectedTagIds = [];
            if (glTagFilterDropdown) {
                glTagFilterDropdown.querySelectorAll("input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
            }
            if (invTable) window.filterTable(invTable);
        });
    }

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
        // Update guest list heading count after filtering
        if (table === invTable) {
            var glHeading = document.getElementById("guest-list-heading");
            if (glHeading) {
                var allRows = table.querySelectorAll("tbody tr:not(.add-guest-row)");
                var visibleCount = 0;
                allRows.forEach(function (r) { if (r.style.display !== "none") visibleCount++; });
                glHeading.textContent = visibleCount < allRows.length
                    ? "Guest List (" + visibleCount + "/" + allRows.length + ")"
                    : "Guest List (" + allRows.length + ")";
            }
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
        var q = window.normalizeText(query);
        if (!q) { gdTagsSuggestions.style.display = "none"; return; }

        var currentNames = currentGuestTags.map(function (t) { return window.normalizeText(t.name); });
        var matches = allUserTags.filter(function (t) {
            return window.normalizeText(t.name).indexOf(q) !== -1 && currentNames.indexOf(window.normalizeText(t.name)) === -1;
        });

        var exactMatch = allUserTags.some(function (t) { return window.normalizeText(t.name) === q; })
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
        var invId = row ? row.getAttribute("data-inv-id") : null;
        document.getElementById("gd-inv-id").value = invId || "";

        window.fetchWithCsrf("/api/v1/friends/" + guestId)
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var g = resp.data;
                document.getElementById("gd-guest-id").value = g.id;
                document.getElementById("gd-first").value = g.first_name;
                document.getElementById("gd-last").value = g.last_name;
                document.getElementById("gd-gender").value = g.gender;
                document.getElementById("gd-notes").value = g.notes;

                var currentUserId = parseInt(document.body.dataset.userId || "0");
                var isOtherUsersGuest = g.id && currentUserId && (g.user_id || 0) !== currentUserId;
                var isReadOnly = g.is_me || isOtherUsersGuest;
                var isViewer = document.getElementById("invitations-table") &&
                               document.getElementById("invitations-table").getAttribute("data-role") === "viewer";

                // Guest name/gender: read-only for is_me, other users' guests
                document.getElementById("gd-first").readOnly = isReadOnly;
                document.getElementById("gd-last").readOnly = isReadOnly;
                document.getElementById("gd-gender").disabled = isReadOnly;

                // Labels
                var gdIsMeLabel = document.getElementById("gd-is-me-label");
                var gdOtherUserLabel = document.getElementById("gd-other-user-label");
                if (gdIsMeLabel) gdIsMeLabel.style.display = g.is_me ? "" : "none";
                if (gdOtherUserLabel) {
                    gdOtherUserLabel.style.display = isOtherUsersGuest ? "" : "none";
                    if (isOtherUsersGuest && g.owner_name) {
                        var shareIconSvg = '<svg class="share-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
                        gdOtherUserLabel.innerHTML = shareIconSvg + "Guest added by " + window.escapeHtml(g.owner_name) + " (Co-Host) — view only";
                    }
                }

                // Owner-only section: notes, tags, invitation summary
                var ownerSection = document.getElementById("gd-owner-section");
                if (ownerSection) ownerSection.style.display = isOtherUsersGuest ? "none" : "";

                // Save/Add buttons
                var gdSaveBtn = document.querySelector("#guest-detail-form button[type='submit']");
                var gdAddToFriendsBtn = document.getElementById("gd-add-to-friends");
                if (gdSaveBtn) gdSaveBtn.style.display = isViewer ? "none" : "";
                if (gdAddToFriendsBtn) {
                    gdAddToFriendsBtn.dataset.firstName = g.first_name;
                    gdAddToFriendsBtn.dataset.lastName = g.last_name || "";
                    gdAddToFriendsBtn.dataset.gender = g.gender;
                    if (isOtherUsersGuest) {
                        if (g.name_match_in_my_friends) {
                            gdAddToFriendsBtn.style.display = "";
                            gdAddToFriendsBtn.textContent = "Already in your friends";
                            gdAddToFriendsBtn.disabled = true;
                        } else {
                            gdAddToFriendsBtn.style.display = "";
                            gdAddToFriendsBtn.textContent = "+ Add to My Friends";
                            gdAddToFriendsBtn.disabled = false;
                        }
                    } else {
                        gdAddToFriendsBtn.style.display = "none";
                    }
                }

                // Tags
                currentGuestTags = (g.tags || []).slice();
                renderGuestTags();
                if (gdTagsInput) gdTagsInput.value = "";

                // Invitation fields from the row
                if (row && invId) {
                    var invSection = document.getElementById("gd-inv-section");
                    if (invSection) invSection.style.display = "";

                    // Added by
                    var addedByEl = document.getElementById("gd-added-by");
                    var addedByName = row.getAttribute("data-added-by-name") || "";
                    if (addedByEl) {
                        if (isOtherUsersGuest && addedByName) {
                            var shareIconSvg2 = '<svg class="share-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
                            addedByEl.innerHTML = shareIconSvg2 + "Guest added by " + window.escapeHtml(addedByName) + " (Co-Host) — can edit";
                            addedByEl.style.display = "";
                        } else {
                            addedByEl.style.display = "none";
                        }
                    }

                    var sentCheckbox = row.querySelector(".sent-checkbox");
                    var isSent = sentCheckbox && sentCheckbox.checked;
                    document.getElementById("gd-sent-toggle").checked = isSent;
                    document.getElementById("gd-sent-toggle").disabled = isViewer;
                    var currentUserName = document.body.dataset.userName || "";
                    function byLabel(name) { return name ? " by " + (name === currentUserName ? "You" : name) : ""; }
                    var invitedDate = row.getAttribute("data-date-invited") || "";
                    var sentByName = row.getAttribute("data-sent-by") || "";
                    document.getElementById("gd-date-invited").textContent = invitedDate ? (invitedDate + byLabel(sentByName)) : "—";

                    var statusSelect = document.getElementById("gd-status");
                    var statusText = getRowStatus(row);
                    if (isSent && statusText !== "Not Sent") {
                        statusSelect.value = statusText;
                        statusSelect.disabled = isViewer;
                    } else {
                        statusSelect.value = "Pending";
                        statusSelect.disabled = true;
                    }
                    window.colorStatusSelect(statusSelect);
                    var respondedDate = row.getAttribute("data-date-responded") || "";
                    var statusByName = row.getAttribute("data-status-changed-by") || "";
                    document.getElementById("gd-date-responded").textContent = respondedDate ? (respondedDate + byLabel(statusByName)) : "—";

                    var notesInput = row.querySelector(".inv-notes-input");
                    document.getElementById("gd-inv-notes").value = notesInput ? notesInput.value : "";
                    document.getElementById("gd-inv-notes").readOnly = isViewer;
                } else {
                    var invSection = document.getElementById("gd-inv-section");
                    if (invSection) invSection.style.display = "none";
                }

                // Invitation summary (owner only)
                var html = "";
                if (!isOtherUsersGuest) {
                    var s = g.invitation_summary;
                    html += '<div class="guest-detail-section-title">Invitation Summary</div>' +
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
                }
                gdMeta.innerHTML = html;
                gdOverlay.style.display = "flex";
            })
            .catch(function () {
                window.showToast("Guest details not available");
            });
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

        // Add co-host's guest to my friends
        var addToFriendsBtn = document.getElementById("gd-add-to-friends");
        if (addToFriendsBtn) {
            addToFriendsBtn.addEventListener("click", function () {
                var data = {
                    guests: [{
                        first_name: addToFriendsBtn.dataset.firstName,
                        last_name: addToFriendsBtn.dataset.lastName,
                        gender: addToFriendsBtn.dataset.gender,
                    }]
                };
                window.fetchWithCsrf("/api/v1/friends/bulk", {
                    method: "POST",
                    body: JSON.stringify(data),
                }).then(function (r) { return r.json(); })
                .then(function (resp) {
                    if (resp.data && resp.data.length > 0) {
                        addToFriendsBtn.textContent = "Added!";
                        addToFriendsBtn.disabled = true;
                        setTimeout(function () {
                            addToFriendsBtn.textContent = "+ Add to My Friends";
                            addToFriendsBtn.disabled = false;
                        }, 2000);
                    }
                });
            });
        }

        gdForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var guestId = document.getElementById("gd-guest-id").value;
            var invId = document.getElementById("gd-inv-id").value;
            var firstName = document.getElementById("gd-first").value.trim();
            var lastName = document.getElementById("gd-last").value.trim();
            var gender = document.getElementById("gd-gender").value;
            var notes = document.getElementById("gd-notes").value.trim();
            var isMe = document.getElementById("gd-is-me").checked;
            if (!firstName) return;

            var currentUserId = parseInt(document.body.dataset.userId || "0");
            var guestOwnerId = gdActiveRow ? parseInt(gdActiveRow.getAttribute("data-guest-owner-id") || "0") : 0;
            var isMyGuest = guestOwnerId === currentUserId || guestOwnerId === 0;

            var promises = [];

            // Save guest fields (only if it's my guest)
            if (isMyGuest) {
                var tagNames = currentGuestTags.map(function (t) { return t.name; });
                promises.push(
                    window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                        method: "PUT",
                        body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe, tag_names: tagNames })
                    }).then(function (res) { return res.json(); }).then(function (resp) {
                        if (gdActiveRow && resp.data) {
                            var displayName = lastName ? firstName + " " + lastName : firstName;
                            var nameCell = gdActiveRow.cells[1];
                            var genderTag = nameCell.querySelector(".gender-tag");
                            if (genderTag) genderTag.textContent = gender === "Male" ? "M" : gender === "Female" ? "F" : "";
                            // Find the text node after the gender tag and update it
                            var textNode = null;
                            for (var i = 0; i < nameCell.childNodes.length; i++) {
                                if (nameCell.childNodes[i].nodeType === 3 && nameCell.childNodes[i].textContent.trim()) {
                                    textNode = nameCell.childNodes[i];
                                    break;
                                }
                            }
                            if (textNode) {
                                textNode.textContent = " " + displayName;
                            }
                            gdActiveRow.setAttribute("data-gender", gender);
                            if (gdActiveRow.cells[5]) gdActiveRow.cells[5].textContent = notes;
                            if (gdActiveRow.cells[6] && resp.data.tags) {
                                gdActiveRow.cells[6].innerHTML = window.buildTagBadges(resp.data.tags);
                                gdActiveRow.setAttribute("data-tags", resp.data.tags.map(function (t) { return t.id; }).join(","));
                            }
                        }
                    })
                );
            }

            // Save invitation fields (always, if invId exists and user is not viewer)
            if (invId) {
                var invNotes = document.getElementById("gd-inv-notes").value.trim();
                var sentToggle = document.getElementById("gd-sent-toggle");
                var statusSelect = document.getElementById("gd-status");
                var sentCheckbox = gdActiveRow ? gdActiveRow.querySelector(".sent-checkbox") : null;
                var wasSent = sentCheckbox ? sentCheckbox.checked : false;
                var nowSent = sentToggle ? sentToggle.checked : wasSent;

                var invPayload = { notes: invNotes };

                // Handle sent toggle change
                if (nowSent !== wasSent) {
                    invPayload.toggle_send = true;
                }

                // Handle status change (only if sent)
                if (nowSent && statusSelect && !statusSelect.disabled) {
                    invPayload.status = statusSelect.value;
                }

                promises.push(
                    window.fetchWithCsrf("/api/v1/invitations/" + invId, {
                        method: "PUT",
                        body: JSON.stringify(invPayload)
                    }).then(function (res) { return res.json(); }).then(function (resp) {
                        if (gdActiveRow && resp.data) {
                            var d = resp.data;
                            // Update sent checkbox
                            if (sentCheckbox) sentCheckbox.checked = (d.status !== "Not Sent");
                            // Update status select
                            var tableStatus = gdActiveRow.querySelector(".status-select");
                            if (d.status === "Not Sent") {
                                if (tableStatus) tableStatus.closest("td").innerHTML = '<span class="status-not-sent">Not Sent</span>';
                            } else if (tableStatus) {
                                tableStatus.value = d.status;
                                window.colorStatusSelect(tableStatus);
                            }
                            // Update data attributes
                            gdActiveRow.setAttribute("data-sent", d.status !== "Not Sent" ? "true" : "false");
                            gdActiveRow.setAttribute("data-date-invited", d.date_invited || "");
                            gdActiveRow.setAttribute("data-date-invited-iso", d.date_invited_iso || "");
                            gdActiveRow.setAttribute("data-sent-by", d.sent_by_name || "");
                            gdActiveRow.setAttribute("data-date-responded", d.date_responded || "");
                            gdActiveRow.setAttribute("data-date-responded-iso", d.date_responded_iso || "");
                            gdActiveRow.setAttribute("data-status-changed-by", d.status_changed_by_name || "");
                            // Update notes
                            var tableInput = gdActiveRow.querySelector(".inv-notes-input");
                            if (tableInput) tableInput.value = d.notes || "";
                        }
                    })
                );
            }

            Promise.all(promises).then(function () {
                window.refreshSummary();
                window.fetchWithCsrf("/api/v1/tags")
                    .then(function (res) { return res.json(); })
                    .then(function (resp) { allUserTags = resp.data || []; })
                    .catch(function () {});
                gdOverlay.style.display = "none";
            }).catch(window.handleFetchError);
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
                            row.remove();
                        }
                    });
                }
                return Promise.resolve();
            });

            var actionLabel = action;
            var rowCount = rows.length;
            Promise.all(promises).then(function () {
                window.refreshSummary();
                batchActionSelect.value = "";
                rows.forEach(function (row) {
                    var cb = row.querySelector(".row-select");
                    if (cb) cb.checked = false;
                });
                updateBatchCount();
                var labels = { send: "marked as sent", unsend: "marked as unsent", attending: "marked as attending", pending: "marked as pending", declined: "marked as declined", remove: "removed" };
                window.trackEvent("batch-action-used", { action: actionLabel, count: rowCount, page: "event-detail" });
                window.showToast(rowCount + " guest" + (rowCount > 1 ? "s" : "") + " " + (labels[actionLabel] || actionLabel));
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
    document.querySelectorAll(".row-select").forEach(attachRowSelectListener);

    // ── Event notes auto-save ────────────────────────────────────────────────

    var eventNotesArea = document.getElementById("event-notes");
    if (eventNotesArea) {
        // Auto-resize to fit content
        function autoResizeNotes() {
            eventNotesArea.style.height = "auto";
            eventNotesArea.style.height = eventNotesArea.scrollHeight + "px";
        }
        autoResizeNotes();

        var saveIndicator = document.getElementById("notes-save-indicator");
        var notesTimer;
        eventNotesArea.addEventListener("input", function () {
            autoResizeNotes();
            clearTimeout(notesTimer);
            notesTimer = setTimeout(function () {
                var evId = eventNotesArea.getAttribute("data-event-id");
                window.fetchWithCsrf("/api/v1/events/" + evId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ notes: eventNotesArea.value })
                })
                .then(function () {
                    touchLastEdited();
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
        var glExpandIcon = '<svg class="kebab-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
        var glCollapseIcon = '<svg class="kebab-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
        if (invTable) {
            invTable.classList.add("table-collapsed");
        }
        toggleGlExpandBtn.innerHTML = glExpandIcon + "Expand Columns";
        toggleGlExpandBtn.addEventListener("click", function () {
            if (!invTable) return;
            var isCollapsed = invTable.classList.toggle("table-collapsed");
            toggleGlExpandBtn.innerHTML = isCollapsed ? glExpandIcon + "Expand Columns" : glCollapseIcon + "Collapse Columns";
            var menu = toggleGlExpandBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // ── Leave Event (co-host/viewer) ─────────────────────────────────────
    var leaveBtn = document.getElementById("leave-event-btn");
    if (leaveBtn) {
        leaveBtn.addEventListener("click", function () {
            if (!confirm("Leave this event? You will lose access.")) return;
            var menu = leaveBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            var invTable = document.getElementById("invitations-table");
            var eventId = invTable ? invTable.getAttribute("data-event-id") : null;
            // Remove self as cohost
            window.fetchWithCsrf("/api/v1/events/" + eventId + "/cohosts/" + document.body.dataset.userId, {
                method: "DELETE"
            }).then(function () { window.location.href = "/"; });
        });
    }

    // ── Export to Text ─────────────────────────────────────────────────
    var exportTextBtn = document.getElementById("export-text-btn");
    var exportTextOverlay = document.getElementById("export-text-overlay");
    var exportTextClose = document.getElementById("export-text-close");
    var exportTextContent = document.getElementById("export-text-content");
    var exportTextCopy = document.getElementById("export-text-copy");

    if (exportTextBtn && exportTextOverlay) {
        exportTextBtn.addEventListener("click", function () {
            var menu = exportTextBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            var eventId = document.getElementById("invitations-table").getAttribute("data-event-id");
            fetch("/export/event/" + eventId + "/text")
                .then(function (r) { return r.text(); })
                .then(function (text) {
                    exportTextContent.value = text;
                    exportTextOverlay.style.display = "flex";
                    exportTextContent.select();
                    window.trackEvent("export-downloaded", { format: "text" });
                });
        });
        exportTextClose.addEventListener("click", function () { exportTextOverlay.style.display = "none"; });
        exportTextOverlay.addEventListener("click", function (e) {
            if (e.target === exportTextOverlay) exportTextOverlay.style.display = "none";
        });
        exportTextCopy.addEventListener("click", function () {
            exportTextContent.select();
            navigator.clipboard.writeText(exportTextContent.value).then(function () {
                exportTextCopy.textContent = "Copied!";
                setTimeout(function () { exportTextCopy.textContent = "Copy to Clipboard"; }, 2000);
            });
        });
    }

    // ── Friends Picker ────────────────────────────────────────────────
    var selectFromDbBtn = document.getElementById("select-from-db-btn");
    var friendsOverlay = document.getElementById("friends-overlay");
    var friendsClose = document.getElementById("friends-close");
    var friendsList = document.getElementById("friends-list");
    var friendsSearchInput = document.getElementById("friends-search-input");
    var friendsAddBtn = document.getElementById("friends-add-btn");
    var friendsFilterBtn = document.getElementById("friends-filter-btn");
    var friendsFilters = document.getElementById("friends-filters");
    var friendsGenderFilter = document.getElementById("friends-gender-filter");
    var friendsSort = document.getElementById("friends-sort");
    var friendsTagFilterToggle = document.getElementById("friends-tag-filter-toggle");
    var friendsTagFilterDropdown = document.getElementById("friends-tag-filter-dropdown");
    var friendsSelectedTagIds = [];
    var friendsArchiveFilter = document.getElementById("friends-archive-filter");

    if (selectFromDbBtn && friendsOverlay) {
        var invTable = document.getElementById("invitations-table");
        var eventId = invTable ? invTable.getAttribute("data-event-id") : null;

        function buildFriendsTagFilter() {
            if (!friendsTagFilterDropdown || !allUserTags) return;
            friendsTagFilterDropdown.innerHTML = "";
            allUserTags.forEach(function (tag) {
                var option = document.createElement("label");
                option.className = "tag-filter-option";
                option.innerHTML =
                    '<input type="checkbox" value="' + tag.id + '">' +
                    '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
                option.querySelector("input").addEventListener("change", function () {
                    friendsSelectedTagIds = [];
                    friendsTagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                        friendsSelectedTagIds.push(parseInt(cb.value));
                    });
                    friendsTagFilterToggle.textContent = friendsSelectedTagIds.length > 0
                        ? friendsSelectedTagIds.length + " Tag" + (friendsSelectedTagIds.length > 1 ? "s" : "") + ""
                        : "All Tags";
                    applyFriendsFilters();
                });
                friendsTagFilterDropdown.appendChild(option);
            });
        }

        if (friendsTagFilterToggle && friendsTagFilterDropdown) {
            friendsTagFilterToggle.addEventListener("click", function (e) {
                e.stopPropagation();
                var showing = friendsTagFilterDropdown.style.display !== "none";
                friendsTagFilterDropdown.style.display = showing ? "none" : "block";
            });
            document.addEventListener("click", function (e) {
                if (!friendsTagFilterDropdown.contains(e.target) && e.target !== friendsTagFilterToggle) {
                    friendsTagFilterDropdown.style.display = "none";
                }
            });
        }

        function applyFriendsFilters() {
            var q = friendsSearchInput ? window.normalizeText(friendsSearchInput.value) : "";
            var genderVal = friendsGenderFilter ? friendsGenderFilter.value : "";
            var archiveVal = friendsArchiveFilter ? friendsArchiveFilter.value : "active";
            var sortVal = friendsSort ? friendsSort.value : "first-asc";
            var items = Array.from(friendsList.querySelectorAll(".friends-item"));

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
            items.forEach(function (item) { friendsList.appendChild(item); });

            items.forEach(function (item) {
                var name = window.normalizeText(item.querySelector(".friends-item-name").textContent);
                var gender = item.getAttribute("data-gender") || "";
                var isArchived = item.getAttribute("data-is-archived") === "true";
                var matchSearch = !q || name.indexOf(q) !== -1;
                var matchGender = !genderVal || gender === genderVal;
                var matchArchive = archiveVal === "all" || !isArchived;
                var matchTags = true;
                if (friendsSelectedTagIds.length > 0) {
                    var itemTags = (item.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                    matchTags = friendsSelectedTagIds.some(function (id) { return itemTags.indexOf(id) !== -1; });
                }
                item.style.display = (matchSearch && matchGender && matchArchive && matchTags) ? "" : "none";
            });
        }

        var friendsSelectAll = document.getElementById("friends-select-all");
        if (friendsSelectAll) {
            friendsSelectAll.addEventListener("change", function () {
                var checked = friendsSelectAll.checked;
                friendsList.querySelectorAll(".friends-item:not(.disabled)").forEach(function (item) {
                    if (item.style.display === "none") return;
                    var cb = item.querySelector("input[type=checkbox]");
                    if (cb && !cb.disabled) cb.checked = checked;
                });
            });
        }

        if (friendsFilterBtn && friendsFilters) {
            friendsFilterBtn.addEventListener("click", function () {
                var hidden = friendsFilters.style.display === "none";
                friendsFilters.style.display = hidden ? "flex" : "none";
                friendsFilterBtn.classList.toggle("active", hidden);
            });
        }
        if (friendsGenderFilter) friendsGenderFilter.addEventListener("change", applyFriendsFilters);
        if (friendsArchiveFilter) friendsArchiveFilter.addEventListener("change", applyFriendsFilters);
        if (friendsSort) friendsSort.addEventListener("change", applyFriendsFilters);

        var friendsClearBtn = document.getElementById("friends-clear-filters");
        if (friendsClearBtn) {
            friendsClearBtn.addEventListener("click", function () {
                if (friendsSearchInput) friendsSearchInput.value = "";
                if (friendsGenderFilter) friendsGenderFilter.selectedIndex = 0;
                if (friendsArchiveFilter) friendsArchiveFilter.selectedIndex = 0;
                if (friendsSort) friendsSort.selectedIndex = 0;
                if (friendsTagFilterToggle) friendsTagFilterToggle.textContent = "All Tags";
                friendsSelectedTagIds = [];
                if (friendsTagFilterDropdown) {
                    friendsTagFilterDropdown.querySelectorAll("input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
                }
                applyFriendsFilters();
            });
        }

        selectFromDbBtn.addEventListener("click", function () {
            var addGuestOverlay = document.getElementById("add-guest-overlay");
            if (addGuestOverlay) addGuestOverlay.style.display = "none";
            if (!eventId) return;
            window.fetchWithCsrf("/api/v1/events/" + eventId + "/available-guests")
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    friendsList.innerHTML = "";
                    resp.data.forEach(function (g) {
                        var name = g.last_name ? g.first_name + " " + g.last_name : g.first_name;
                        var div = document.createElement("div");
                        div.className = "friends-item" + (g.already_invited ? " disabled" : "") + (g.name_match_in_event ? " name-match" : "") + (g.is_archived ? " archived-item" : "");
                        div.setAttribute("data-first", g.first_name.toLowerCase());
                        div.setAttribute("data-last", (g.last_name || "").toLowerCase());
                        div.setAttribute("data-gender", g.gender);
                        div.setAttribute("data-is-archived", g.is_archived ? "true" : "false");
                        var tagIds = (g.tags || []).map(function (t) { return t.id; });
                        div.setAttribute("data-tags", tagIds.join(","));
                        var tagsHtml = "";
                        if (g.tags && g.tags.length > 0) {
                            tagsHtml = '<span class="friends-item-tags">';
                            g.tags.forEach(function (t) {
                                tagsHtml += '<span class="tag-badge tag-badge-sm" style="background:' + t.color + '">' + window.escapeHtml(t.name) + '</span>';
                            });
                            tagsHtml += '</span>';
                        }
                        var genderLabel = g.gender === "Male" ? "(M)" : g.gender === "Female" ? "(F)" : "";
                        var matchWarning = g.name_match_in_event ? '<span class="name-match-warning">Similar name already in event</span>' : '';
                        div.innerHTML =
                            '<input type="checkbox" data-guest-id="' + g.id + '"' +
                            (g.already_invited ? ' checked disabled' : '') + '>' +
                            '<div class="friends-item-info">' +
                            '<div class="friends-item-name">' + window.escapeHtml(name) + ' <span class="gender-inline">' + genderLabel + '</span>' + matchWarning + '</div>' +
                            (tagsHtml ? '<div class="friends-item-meta">' + tagsHtml + '</div>' : '') +
                            '</div>';
                        if (!g.already_invited) {
                            div.addEventListener("click", function (e) {
                                if (e.target.tagName !== "INPUT") {
                                    var cb = div.querySelector("input");
                                    cb.checked = !cb.checked;
                                }
                            });
                        }
                        friendsList.appendChild(div);
                    });
                    if (friendsGenderFilter) friendsGenderFilter.value = "";
                    if (friendsArchiveFilter) friendsArchiveFilter.value = "active";
                    if (friendsSort) friendsSort.value = "first-asc";
                    friendsSelectedTagIds = [];
                    if (friendsTagFilterToggle) friendsTagFilterToggle.textContent = "All Tags";
                    buildFriendsTagFilter();
                    if (friendsFilters) { friendsFilters.style.display = "none"; }
                    if (friendsFilterBtn) friendsFilterBtn.classList.remove("active");
                    if (friendsSelectAll) friendsSelectAll.checked = false;
                    friendsOverlay.style.display = "flex";
                    friendsSearchInput.value = "";
                    applyFriendsFilters();
                    friendsSearchInput.focus();
                })
                .catch(window.handleFetchError);
        });

        friendsClose.addEventListener("click", function () { friendsOverlay.style.display = "none"; });
        friendsOverlay.addEventListener("click", function (e) {
            if (e.target === friendsOverlay) friendsOverlay.style.display = "none";
        });

        friendsSearchInput.addEventListener("input", applyFriendsFilters);
        friendsSearchInput.addEventListener("search", applyFriendsFilters);

        friendsAddBtn.addEventListener("click", function () {
            var ids = [];
            friendsList.querySelectorAll("input[type=checkbox]:checked:not(:disabled)").forEach(function (cb) {
                ids.push(parseInt(cb.getAttribute("data-guest-id")));
            });
            if (ids.length === 0) { friendsOverlay.style.display = "none"; return; }

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
                friendsOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Add from Other Events Modal ──────────────────────────────────────────
    var addFromEventsBtn = document.getElementById("add-from-events-btn");
    var eventGuestsOverlay = document.getElementById("event-guests-overlay");
    var eventGuestsClose = document.getElementById("event-guests-close");
    var eventSelector = document.getElementById("event-selector");
    var eventGuestsList = document.getElementById("event-guests-list");
    var eventGuestsSearchInput = document.getElementById("event-guests-search-input");
    var eventGuestsAddBtn = document.getElementById("event-guests-add-btn");
    var eventGuestsFilterBtn = document.getElementById("event-guests-filter-btn");
    var eventGuestsFilters = document.getElementById("event-guests-filters");
    var eventGuestsGenderFilter = document.getElementById("event-guests-gender-filter");
    var eventGuestsStatusFilter = document.getElementById("event-guests-status-filter");
    var eventGuestsSort = document.getElementById("event-guests-sort");
    var eventGuestsTagFilterToggle = document.getElementById("event-guests-tag-filter-toggle");
    var eventGuestsTagFilterDropdown = document.getElementById("event-guests-tag-filter-dropdown");
    var eventGuestsSelectedTagIds = [];
    var eventGuestsSearchSection = document.getElementById("event-guests-search-section");
    var eventGuestsSelectAllWrapper = document.getElementById("event-guests-select-all-wrapper");
    var eventGuestsSelectAll = document.getElementById("event-guests-select-all");

    if (addFromEventsBtn && eventGuestsOverlay) {
        var evtInvTable = document.getElementById("invitations-table");
        var evtEventId = evtInvTable ? evtInvTable.getAttribute("data-event-id") : null;

        function buildStatusBadge(status) {
            var cls = "event-guest-status ";
            if (status === "Attending") cls += "status-attending";
            else if (status === "Pending") cls += "status-pending";
            else if (status === "Declined") cls += "status-declined";
            else cls += "status-not-sent";
            return '<span class="' + cls + '">' + window.escapeHtml(status) + '</span>';
        }

        function buildEventGuestsTagFilter() {
            if (!eventGuestsTagFilterDropdown || !allUserTags) return;
            eventGuestsTagFilterDropdown.innerHTML = "";
            allUserTags.forEach(function (tag) {
                var option = document.createElement("label");
                option.className = "tag-filter-option";
                option.innerHTML =
                    '<input type="checkbox" value="' + tag.id + '">' +
                    '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
                option.querySelector("input").addEventListener("change", function () {
                    eventGuestsSelectedTagIds = [];
                    eventGuestsTagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                        eventGuestsSelectedTagIds.push(parseInt(cb.value));
                    });
                    eventGuestsTagFilterToggle.textContent = eventGuestsSelectedTagIds.length > 0
                        ? eventGuestsSelectedTagIds.length + " Tag" + (eventGuestsSelectedTagIds.length > 1 ? "s" : "")
                        : "All Tags";
                    applyEventGuestsFilters();
                });
                eventGuestsTagFilterDropdown.appendChild(option);
            });
        }

        if (eventGuestsTagFilterToggle && eventGuestsTagFilterDropdown) {
            eventGuestsTagFilterToggle.addEventListener("click", function (e) {
                e.stopPropagation();
                var showing = eventGuestsTagFilterDropdown.style.display !== "none";
                eventGuestsTagFilterDropdown.style.display = showing ? "none" : "block";
            });
            document.addEventListener("click", function (e) {
                if (!eventGuestsTagFilterDropdown.contains(e.target) && e.target !== eventGuestsTagFilterToggle) {
                    eventGuestsTagFilterDropdown.style.display = "none";
                }
            });
        }

        function applyEventGuestsFilters() {
            var q = eventGuestsSearchInput ? window.normalizeText(eventGuestsSearchInput.value) : "";
            var genderVal = eventGuestsGenderFilter ? eventGuestsGenderFilter.value : "";
            var statusVal = eventGuestsStatusFilter ? eventGuestsStatusFilter.value : "";
            var sortVal = eventGuestsSort ? eventGuestsSort.value : "first-asc";
            var items = Array.from(eventGuestsList.querySelectorAll(".friends-item"));

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
                } else if (key === "status") {
                    valA = (a.getAttribute("data-status") || "").toLowerCase();
                    valB = (b.getAttribute("data-status") || "").toLowerCase();
                }
                if (valA < valB) return dir === "asc" ? -1 : 1;
                if (valA > valB) return dir === "asc" ? 1 : -1;
                return 0;
            });
            items.forEach(function (item) { eventGuestsList.appendChild(item); });

            items.forEach(function (item) {
                var name = window.normalizeText(item.querySelector(".friends-item-name").textContent);
                var gender = item.getAttribute("data-gender") || "";
                var status = item.getAttribute("data-status") || "";
                var matchSearch = !q || name.indexOf(q) !== -1;
                var matchGender = !genderVal || gender === genderVal;
                var matchStatus = !statusVal || status === statusVal;
                var matchTags = true;
                if (eventGuestsSelectedTagIds.length > 0) {
                    var itemTags = (item.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                    matchTags = eventGuestsSelectedTagIds.some(function (id) { return itemTags.indexOf(id) !== -1; });
                }
                item.style.display = (matchSearch && matchGender && matchStatus && matchTags) ? "" : "none";
            });
        }

        if (eventGuestsSelectAll) {
            eventGuestsSelectAll.addEventListener("change", function () {
                var checked = eventGuestsSelectAll.checked;
                eventGuestsList.querySelectorAll(".friends-item:not(.disabled)").forEach(function (item) {
                    if (item.style.display === "none") return;
                    var cb = item.querySelector("input[type=checkbox]");
                    if (cb && !cb.disabled) cb.checked = checked;
                });
            });
        }

        if (eventGuestsFilterBtn && eventGuestsFilters) {
            eventGuestsFilterBtn.addEventListener("click", function () {
                var hidden = eventGuestsFilters.style.display === "none";
                eventGuestsFilters.style.display = hidden ? "flex" : "none";
                eventGuestsFilterBtn.classList.toggle("active", hidden);
            });
        }
        if (eventGuestsGenderFilter) eventGuestsGenderFilter.addEventListener("change", applyEventGuestsFilters);
        if (eventGuestsStatusFilter) eventGuestsStatusFilter.addEventListener("change", applyEventGuestsFilters);
        if (eventGuestsSort) eventGuestsSort.addEventListener("change", applyEventGuestsFilters);
        if (eventGuestsSearchInput) {
            eventGuestsSearchInput.addEventListener("input", applyEventGuestsFilters);
            eventGuestsSearchInput.addEventListener("search", applyEventGuestsFilters);
        }

        var eventGuestsClearBtn = document.getElementById("event-guests-clear-filters");
        if (eventGuestsClearBtn) {
            eventGuestsClearBtn.addEventListener("click", function () {
                if (eventGuestsSearchInput) eventGuestsSearchInput.value = "";
                if (eventGuestsGenderFilter) eventGuestsGenderFilter.selectedIndex = 0;
                if (eventGuestsStatusFilter) eventGuestsStatusFilter.selectedIndex = 0;
                if (eventGuestsSort) eventGuestsSort.selectedIndex = 0;
                if (eventGuestsTagFilterToggle) eventGuestsTagFilterToggle.textContent = "All Tags";
                eventGuestsSelectedTagIds = [];
                if (eventGuestsTagFilterDropdown) {
                    eventGuestsTagFilterDropdown.querySelectorAll("input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
                }
                applyEventGuestsFilters();
            });
        }

        function renderEventGuests(guests) {
            eventGuestsList.innerHTML = "";
            guests.forEach(function (g) {
                var name = g.last_name ? g.first_name + " " + g.last_name : g.first_name;
                var genderLabel = g.gender === "Male" ? "(M)" : g.gender === "Female" ? "(F)" : "";
                var div = document.createElement("div");
                div.className = "friends-item" + (g.already_invited ? " disabled" : "");
                div.setAttribute("data-first", g.first_name.toLowerCase());
                div.setAttribute("data-last", (g.last_name || "").toLowerCase());
                div.setAttribute("data-gender", g.gender);
                div.setAttribute("data-status", g.status);
                var tagIds = (g.tags || []).map(function (t) { return t.id; });
                div.setAttribute("data-tags", tagIds.join(","));
                var tagsHtml = "";
                if (g.tags && g.tags.length > 0) {
                    tagsHtml = '<span class="friends-item-tags">';
                    g.tags.forEach(function (t) {
                        tagsHtml += '<span class="tag-badge tag-badge-sm" style="background:' + t.color + '">' + window.escapeHtml(t.name) + '</span>';
                    });
                    tagsHtml += '</span>';
                }
                div.innerHTML =
                    '<input type="checkbox" data-guest-id="' + g.id + '"' +
                    (g.already_invited ? ' checked disabled' : '') + '>' +
                    '<div class="friends-item-info">' +
                    '<div class="friends-item-name">' + window.escapeHtml(name) + ' <span class="gender-inline">' + genderLabel + '</span></div>' +
                    '<div class="friends-item-meta">' + buildStatusBadge(g.status) + tagsHtml + '</div>' +
                    '</div>';
                if (!g.already_invited) {
                    div.addEventListener("click", function (e) {
                        if (e.target.tagName !== "INPUT") {
                            var cb = div.querySelector("input");
                            cb.checked = !cb.checked;
                        }
                    });
                }
                eventGuestsList.appendChild(div);
            });
        }

        eventSelector.addEventListener("change", function () {
            var sourceEventId = eventSelector.value;
            if (!sourceEventId) {
                eventGuestsList.innerHTML = "";
                eventGuestsSearchSection.style.display = "none";
                eventGuestsSelectAllWrapper.style.display = "none";
                eventGuestsAddBtn.disabled = true;
                return;
            }
            window.fetchWithCsrf("/api/v1/events/" + evtEventId + "/other-events-guests?source_event_id=" + sourceEventId)
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    renderEventGuests(resp.data.guests);
                    if (eventGuestsGenderFilter) eventGuestsGenderFilter.value = "";
                    if (eventGuestsStatusFilter) eventGuestsStatusFilter.value = "";
                    if (eventGuestsSort) eventGuestsSort.value = "first-asc";
                    eventGuestsSelectedTagIds = [];
                    if (eventGuestsTagFilterToggle) eventGuestsTagFilterToggle.textContent = "All Tags";
                    buildEventGuestsTagFilter();
                    if (eventGuestsFilters) eventGuestsFilters.style.display = "none";
                    if (eventGuestsFilterBtn) eventGuestsFilterBtn.classList.remove("active");
                    if (eventGuestsSelectAll) eventGuestsSelectAll.checked = false;
                    if (eventGuestsSearchInput) eventGuestsSearchInput.value = "";
                    eventGuestsSearchSection.style.display = "block";
                    eventGuestsSelectAllWrapper.style.display = "flex";
                    eventGuestsAddBtn.disabled = false;
                    applyEventGuestsFilters();
                })
                .catch(window.handleFetchError);
        });

        addFromEventsBtn.addEventListener("click", function () {
            var addGuestOverlay = document.getElementById("add-guest-overlay");
            if (addGuestOverlay) addGuestOverlay.style.display = "none";
            if (!evtEventId) return;
            window.fetchWithCsrf("/api/v1/events/" + evtEventId + "/other-events-guests")
                .then(function (r) { return r.json(); })
                .then(function (resp) {
                    eventSelector.innerHTML = '<option value="">Select an event...</option>';
                    resp.data.events.forEach(function (evt) {
                        var option = document.createElement("option");
                        option.value = evt.id;
                        option.textContent = evt.name + " (" + evt.date + ")";
                        eventSelector.appendChild(option);
                    });
                    eventGuestsList.innerHTML = "";
                    eventGuestsSearchSection.style.display = "none";
                    eventGuestsSelectAllWrapper.style.display = "none";
                    eventGuestsAddBtn.disabled = true;
                    eventGuestsOverlay.style.display = "flex";
                    eventSelector.focus();
                })
                .catch(window.handleFetchError);
        });

        eventGuestsClose.addEventListener("click", function () { eventGuestsOverlay.style.display = "none"; });
        eventGuestsOverlay.addEventListener("click", function (e) {
            if (e.target === eventGuestsOverlay) eventGuestsOverlay.style.display = "none";
        });

        eventGuestsAddBtn.addEventListener("click", function () {
            var ids = [];
            eventGuestsList.querySelectorAll("input[type=checkbox]:checked:not(:disabled)").forEach(function (cb) {
                ids.push(parseInt(cb.getAttribute("data-guest-id")));
            });
            if (ids.length === 0) { eventGuestsOverlay.style.display = "none"; return; }

            window.fetchWithCsrf("/api/v1/events/" + evtEventId + "/invitations/bulk", {
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
                eventGuestsOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

    // ── Delete Event confirmation modal ─────────────────────────────────────
    var openDeleteBtn = document.getElementById("open-delete-event-btn");
    var deleteOverlay = document.getElementById("delete-event-overlay");
    var deleteClose = document.getElementById("delete-event-close");
    var deleteCancel = document.getElementById("delete-event-cancel");
    if (openDeleteBtn && deleteOverlay) {
        openDeleteBtn.addEventListener("click", function () {
            var menu = openDeleteBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            deleteOverlay.style.display = "flex";
        });
        deleteClose.addEventListener("click", function () { deleteOverlay.style.display = "none"; });
        deleteCancel.addEventListener("click", function () { deleteOverlay.style.display = "none"; });
        deleteOverlay.addEventListener("click", function (e) {
            if (e.target === deleteOverlay) deleteOverlay.style.display = "none";
        });
    }

});
