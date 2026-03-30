// ── Seating Plan Module ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    var app = document.getElementById("seating-app");
    if (!app) return;

    var eventId = app.dataset.eventId;
    var role = app.dataset.role;
    var canEdit = (role === "owner" || role === "cohost");

    var state = { tables: [], unseated: [] };
    var selectedGuest = null; // for click-to-assign

    // ── API helpers ─────────────────────────────────────────────────────────
    var BASE = "/api/v1/events/" + eventId + "/seating";

    function api(method, path, body) {
        var opts = { method: method };
        if (body) opts.body = JSON.stringify(body);
        return window.fetchWithCsrf(BASE + (path || ""), opts)
            .then(function (r) {
                if (r.status === 204) return null;
                return r.json().then(function (d) {
                    if (d.status === "error") throw new Error(d.message);
                    return d.data;
                });
            });
    }

    // ── Load seating plan ───────────────────────────────────────────────────
    function load() {
        api("GET", "").then(function (data) {
            state = data;
            render();
        }).catch(window.handleFetchError);
    }

    // ── Render everything ───────────────────────────────────────────────────
    function render() {
        renderUnseated();
        renderTables();
    }

    function renderUnseated() {
        var list = document.getElementById("unseated-list");
        var count = document.getElementById("unseated-count");
        count.textContent = state.unseated.length;
        list.innerHTML = "";
        if (state.unseated.length === 0) {
            list.innerHTML = '<span class="seating-none">All attending guests are seated.</span>';
            return;
        }
        state.unseated.forEach(function (g) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "seating-chip seating-chip-" + g.gender.toLowerCase();
            chip.textContent = g.first_name + (g.last_name ? " " + g.last_name.charAt(0) + "." : "");
            chip.title = g.full_name;
            chip.dataset.invitationId = g.invitation_id;
            if (canEdit) {
                chip.addEventListener("click", function () {
                    toggleSelectGuest(g, chip);
                });
            }
            list.appendChild(chip);
        });
    }

    function toggleSelectGuest(guest, chip) {
        if (selectedGuest && selectedGuest.invitation_id === guest.invitation_id) {
            selectedGuest = null;
            document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
                c.classList.remove("seating-chip-selected");
            });
            document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
                s.classList.remove("seating-seat-highlight");
            });
        } else {
            selectedGuest = guest;
            document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
                c.classList.remove("seating-chip-selected");
            });
            chip.classList.add("seating-chip-selected");
            // Highlight empty seats
            document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
                s.classList.add("seating-seat-highlight");
            });
        }
    }

    function clearSelection() {
        selectedGuest = null;
        document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
            c.classList.remove("seating-chip-selected");
        });
        document.querySelectorAll(".seating-seat-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-highlight");
        });
    }

    // ── Render tables ───────────────────────────────────────────────────────
    function renderTables() {
        var container = document.getElementById("seating-tables");
        var empty = document.getElementById("seating-empty");
        container.innerHTML = "";
        if (state.tables.length === 0) {
            container.appendChild(empty);
            empty.style.display = "";
            return;
        }
        empty.style.display = "none";
        state.tables.forEach(function (table) {
            container.appendChild(createTableCard(table));
        });
    }

    function createTableCard(table) {
        var card = document.createElement("div");
        card.className = "seating-table-card";
        card.dataset.tableId = table.id;

        // Header
        var header = document.createElement("div");
        header.className = "seating-table-header";
        var title = document.createElement("span");
        title.className = "seating-table-title";
        var seatCount = Object.keys(table.seats).length;
        title.textContent = (table.label || "Table " + table.table_number) +
            " (" + seatCount + "/" + table.capacity + ")";
        header.appendChild(title);

        if (canEdit) {
            var actions = document.createElement("span");
            actions.className = "seating-table-actions";
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "seating-action-btn";
            editBtn.title = "Edit table";
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            editBtn.addEventListener("click", function () { openEditTable(table); });
            var clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "seating-action-btn";
            clearBtn.title = "Clear seats";
            clearBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
            clearBtn.addEventListener("click", function () { clearTable(table.id); });
            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "seating-action-btn seating-action-danger";
            delBtn.title = "Delete table";
            delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            delBtn.addEventListener("click", function () { deleteTable(table.id); });
            actions.appendChild(editBtn);
            actions.appendChild(clearBtn);
            actions.appendChild(delBtn);
            header.appendChild(actions);
        }

        card.appendChild(header);

        // SVG visual
        var svgWrap = document.createElement("div");
        svgWrap.className = "seating-svg-wrap";
        svgWrap.innerHTML = buildTableSVG(table);
        card.appendChild(svgWrap);

        return card;
    }

    // ── SVG Table Rendering ─────────────────────────────────────────────────
    function buildTableSVG(table) {
        if (table.shape === "round") return buildRoundSVG(table);
        if (table.shape === "long") return buildLongSVG(table);
        return buildRectSVG(table);
    }

    function seatEl(table, pos, cx, cy) {
        var seat = table.seats[String(pos)];
        var group = "";
        if (seat) {
            var color = seat.gender === "Male" ? "#d6e9f8" : "#f8d6e9";
            var stroke = seat.gender === "Male" ? "#5b9bd5" : "#d5679b";
            var label = seat.first_name.length > 8 ? seat.first_name.substring(0, 7) + "." : seat.first_name;
            group += '<g class="seating-seat seating-seat-filled" data-assignment-id="' + seat.assignment_id + '" data-table-id="' + table.id + '" style="cursor:' + (canEdit ? "pointer" : "default") + '">';
            group += '<circle cx="' + cx + '" cy="' + cy + '" r="22" fill="' + color + '" stroke="' + stroke + '" stroke-width="2"/>';
            group += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#333" font-family="DM Sans, sans-serif">' + escapeXml(label) + '</text>';
            group += '</g>';
        } else {
            group += '<g class="seating-seat seating-seat-empty" data-table-id="' + table.id + '" data-seat-pos="' + pos + '" style="cursor:' + (canEdit ? "pointer" : "default") + '">';
            group += '<circle cx="' + cx + '" cy="' + cy + '" r="22" fill="#f5f5f5" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4 3"/>';
            group += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#bbb" font-family="DM Sans, sans-serif">' + pos + '</text>';
            group += '</g>';
        }
        return group;
    }

    function buildRoundSVG(table) {
        var n = table.capacity;
        var centerX = 140, centerY = 140;
        var tableR = Math.max(40, 18 * n / Math.PI);
        var seatR = tableR + 32;
        var svgSize = (seatR + 30) * 2;
        centerX = svgSize / 2;
        centerY = svgSize / 2;

        var svg = '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '" class="seating-svg">';
        // Table circle
        svg += '<circle cx="' + centerX + '" cy="' + centerY + '" r="' + tableR + '" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';
        // Seats
        for (var i = 0; i < n; i++) {
            var angle = (2 * Math.PI * i / n) - Math.PI / 2;
            var cx = centerX + seatR * Math.cos(angle);
            var cy = centerY + seatR * Math.sin(angle);
            svg += seatEl(table, i + 1, Math.round(cx), Math.round(cy));
        }
        svg += '</svg>';
        return svg;
    }

    function buildRectSVG(table) {
        var n = table.capacity;
        // Seats: top side, bottom side, optionally left end and right end
        var hasEnds = n >= 6;
        var sideSeats = hasEnds ? Math.floor((n - 2) / 2) : Math.floor(n / 2);
        var endSeats = hasEnds ? 2 : 0;
        // Adjust if odd total
        var topCount = sideSeats;
        var botCount = n - topCount - endSeats;
        if (botCount < 0) { botCount = 0; endSeats = n - topCount; }

        var seatSpacing = 54;
        var maxSide = Math.max(topCount, botCount);
        var tableW = maxSide * seatSpacing + 20;
        var tableH = 60;
        var pad = 50;
        var svgW = tableW + pad * 2 + (hasEnds ? 80 : 0);
        var svgH = tableH + pad * 2 + 60;
        var offX = hasEnds ? 40 : 0;
        var tableX = pad + offX;
        var tableY = pad + 30;

        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg">';
        // Table rect
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="8" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';

        var pos = 1;
        // Top seats
        var topStartX = tableX + (tableW - topCount * seatSpacing) / 2 + seatSpacing / 2;
        for (var i = 0; i < topCount; i++) {
            svg += seatEl(table, pos++, Math.round(topStartX + i * seatSpacing), tableY - 28);
        }
        // Right end
        if (hasEnds) {
            svg += seatEl(table, pos++, Math.round(tableX + tableW + 34), Math.round(tableY + tableH / 2));
        }
        // Bottom seats (right to left to make clockwise)
        var botStartX = tableX + (tableW - botCount * seatSpacing) / 2 + seatSpacing / 2;
        for (var i = botCount - 1; i >= 0; i--) {
            svg += seatEl(table, pos++, Math.round(botStartX + i * seatSpacing), Math.round(tableY + tableH + 28));
        }
        // Left end
        if (hasEnds) {
            svg += seatEl(table, pos++, Math.round(tableX - 34), Math.round(tableY + tableH / 2));
        }

        svg += '</svg>';
        return svg;
    }

    function buildLongSVG(table) {
        var n = table.capacity;
        var topCount = Math.ceil(n / 2);
        var botCount = n - topCount;

        var seatSpacing = 54;
        var maxSide = Math.max(topCount, botCount);
        var tableW = maxSide * seatSpacing + 20;
        var tableH = 40;
        var pad = 50;
        var svgW = tableW + pad * 2;
        var svgH = tableH + pad * 2 + 60;
        var tableX = pad;
        var tableY = pad + 30;

        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg">';
        // Table rect (narrower for banquet style)
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="6" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';

        var pos = 1;
        // Top row
        var topStartX = tableX + (tableW - topCount * seatSpacing) / 2 + seatSpacing / 2;
        for (var i = 0; i < topCount; i++) {
            svg += seatEl(table, pos++, Math.round(topStartX + i * seatSpacing), tableY - 28);
        }
        // Bottom row (right to left for clockwise)
        var botStartX = tableX + (tableW - botCount * seatSpacing) / 2 + seatSpacing / 2;
        for (var i = botCount - 1; i >= 0; i--) {
            svg += seatEl(table, pos++, Math.round(botStartX + i * seatSpacing), Math.round(tableY + tableH + 28));
        }

        svg += '</svg>';
        return svg;
    }

    function escapeXml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ── Click handlers on SVG seats ─────────────────────────────────────────
    document.addEventListener("click", function (e) {
        if (!canEdit) return;
        var seatGroup = e.target.closest(".seating-seat");
        if (!seatGroup) return;

        if (seatGroup.classList.contains("seating-seat-filled")) {
            // Click on filled seat — show unseat option
            var aId = seatGroup.dataset.assignmentId;
            if (confirm("Remove this guest from their seat?")) {
                api("DELETE", "/assign/" + aId).then(function () {
                    clearSelection();
                    load();
                }).catch(window.handleFetchError);
            }
            return;
        }

        // Click on empty seat
        var tableId = parseInt(seatGroup.dataset.tableId);
        var seatPos = parseInt(seatGroup.dataset.seatPos);

        if (selectedGuest) {
            // Assign selected guest
            api("POST", "/assign", {
                invitation_id: selectedGuest.invitation_id,
                table_id: tableId,
                seat_position: seatPos
            }).then(function () {
                clearSelection();
                load();
            }).catch(function (err) {
                window.showToast(err.message || "Failed to assign seat");
            });
        } else {
            // Open picker modal
            openPicker(tableId, seatPos);
        }
    });

    // ── Seat picker modal ───────────────────────────────────────────────────
    function openPicker(tableId, seatPos) {
        document.getElementById("picker-table-id").value = tableId;
        document.getElementById("picker-seat-pos").value = seatPos;
        document.getElementById("picker-search").value = "";
        renderPickerList("");
        document.getElementById("seating-picker-overlay").style.display = "";
        document.getElementById("picker-search").focus();
    }

    function renderPickerList(query) {
        var list = document.getElementById("picker-guest-list");
        list.innerHTML = "";
        var q = window.normalizeText(query);
        state.unseated.forEach(function (g) {
            if (q && window.normalizeText(g.full_name).indexOf(q) === -1) return;
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "seating-picker-item seating-chip-" + g.gender.toLowerCase();
            btn.textContent = g.full_name;
            btn.addEventListener("click", function () {
                var tableId = parseInt(document.getElementById("picker-table-id").value);
                var seatPos = parseInt(document.getElementById("picker-seat-pos").value);
                document.getElementById("seating-picker-overlay").style.display = "none";
                api("POST", "/assign", {
                    invitation_id: g.invitation_id,
                    table_id: tableId,
                    seat_position: seatPos
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to assign seat");
                });
            });
            list.appendChild(btn);
        });
        if (list.children.length === 0) {
            list.innerHTML = '<p class="seating-none">No unseated guests found.</p>';
        }
    }

    var pickerSearch = document.getElementById("picker-search");
    if (pickerSearch) {
        pickerSearch.addEventListener("input", function () {
            renderPickerList(this.value);
        });
    }

    var pickerClose = document.getElementById("seating-picker-close");
    if (pickerClose) {
        pickerClose.addEventListener("click", function () {
            document.getElementById("seating-picker-overlay").style.display = "none";
        });
    }

    // ── Add / Edit table modal ──────────────────────────────────────────────
    var addTableBtn = document.getElementById("seating-add-table-btn");
    if (addTableBtn) {
        addTableBtn.addEventListener("click", function () {
            document.getElementById("seating-table-modal-title").textContent = "Add Table";
            document.getElementById("seating-table-id").value = "";
            document.getElementById("seating-table-label").value = "";
            document.getElementById("seating-table-shape").value = "rectangular";
            document.getElementById("seating-table-capacity").value = "12";
            document.getElementById("seating-table-overlay").style.display = "";
        });
    }

    function openEditTable(table) {
        document.getElementById("seating-table-modal-title").textContent = "Edit Table";
        document.getElementById("seating-table-id").value = table.id;
        document.getElementById("seating-table-label").value = table.label || "";
        document.getElementById("seating-table-shape").value = table.shape;
        document.getElementById("seating-table-capacity").value = String(table.capacity);
        document.getElementById("seating-table-overlay").style.display = "";
    }

    var tableClose = document.getElementById("seating-table-close");
    if (tableClose) {
        tableClose.addEventListener("click", function () {
            document.getElementById("seating-table-overlay").style.display = "none";
        });
    }

    var tableSave = document.getElementById("seating-table-save");
    if (tableSave) {
        tableSave.addEventListener("click", function () {
            var id = document.getElementById("seating-table-id").value;
            var data = {
                label: document.getElementById("seating-table-label").value,
                shape: document.getElementById("seating-table-shape").value,
                capacity: parseInt(document.getElementById("seating-table-capacity").value),
            };
            var promise;
            if (id) {
                promise = api("PUT", "/tables/" + id, data);
            } else {
                promise = api("POST", "/tables", data);
            }
            promise.then(function () {
                document.getElementById("seating-table-overlay").style.display = "none";
                load();
            }).catch(function (err) {
                window.showToast(err.message || "Failed to save table");
            });
        });
    }

    // ── Auto-assign ─────────────────────────────────────────────────────────
    var autoBtn = document.getElementById("seating-auto-btn");
    var autoMenu = document.getElementById("seating-auto-menu");
    if (autoBtn && autoMenu) {
        autoBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            autoMenu.style.display = autoMenu.style.display === "none" ? "" : "none";
        });
        autoMenu.querySelectorAll("button").forEach(function (btn) {
            btn.addEventListener("click", function () {
                autoMenu.style.display = "none";
                var mode = btn.dataset.mode;
                if (!confirm("Auto-assign unseated guests (" + mode + ")? Existing assignments will be kept.")) return;
                api("POST", "/auto-assign", { mode: mode }).then(function (data) {
                    state = data;
                    render();
                    window.showToast("Guests auto-assigned (" + mode + ")");
                }).catch(function (err) {
                    window.showToast(err.message || "Auto-assign failed");
                });
            });
        });
        // Close dropdown when clicking elsewhere
        document.addEventListener("click", function () {
            autoMenu.style.display = "none";
        });
    }

    // ── Clear all ───────────────────────────────────────────────────────────
    var clearAllBtn = document.getElementById("seating-clear-all-btn");
    if (clearAllBtn) {
        clearAllBtn.addEventListener("click", function () {
            if (!confirm("Clear all seat assignments? Tables will be kept.")) return;
            api("DELETE", "").then(function () {
                load();
                window.showToast("All seats cleared");
            }).catch(window.handleFetchError);
        });
    }

    // ── Clear single table ──────────────────────────────────────────────────
    function clearTable(tableId) {
        if (!confirm("Clear all seats on this table?")) return;
        api("POST", "/tables/" + tableId + "/clear").then(function () {
            load();
        }).catch(window.handleFetchError);
    }

    function deleteTable(tableId) {
        if (!confirm("Delete this table and unseat all its guests?")) return;
        api("DELETE", "/tables/" + tableId).then(function () {
            load();
        }).catch(window.handleFetchError);
    }

    // ── Initial load ────────────────────────────────────────────────────────
    // Load when section is first expanded
    var section = document.getElementById("seating-section");
    var loaded = false;
    if (section) {
        var header = section.querySelector(".collapsible-header");
        if (header) {
            header.addEventListener("click", function () {
                if (!loaded) {
                    loaded = true;
                    load();
                }
            });
        }
        // If section is not collapsed on load, load immediately
        if (!section.classList.contains("collapsed")) {
            loaded = true;
            load();
        }
    }

});
