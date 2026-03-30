// ── Seating Plan Module ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    var app = document.getElementById("seating-app");
    if (!app) return;

    var eventId = app.dataset.eventId;
    var role = app.dataset.role;
    var canEdit = (role === "owner" || role === "cohost");

    var state = { tables: [], unseated: [] };
    var selectedGuest = null; // for click-to-assign
    var movingAssignment = null; // for move-guest flow

    // Seat circle radius for main table views
    var SEAT_R = 30;
    var SEAT_FONT = 12;
    var SEAT_SPACING = 76;

    // ── API helpers ─────────────────────────────────────────────────────────
    var BASE = "/api/v1/events/" + eventId + "/seating";

    function api(method, path, body) {
        var opts = { method: method };
        if (body) opts.body = JSON.stringify(body);
        return window.fetchWithCsrf(BASE + (path || ""), opts)
            .then(function (r) {
                if (r.status === 204) return null;
                var ct = r.headers.get("content-type") || "";
                if (ct.indexOf("application/json") === -1) {
                    throw new Error("Server error (" + r.status + "). Please refresh and try again.");
                }
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
        cancelMove();
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
            document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
                s.classList.add("seating-seat-highlight");
            });
        }
    }

    function clearSelection() {
        selectedGuest = null;
        cancelMove();
        document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
            c.classList.remove("seating-chip-selected");
        });
        document.querySelectorAll(".seating-seat-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-highlight");
        });
    }

    // ── Move guest flow ─────────────────────────────────────────────────────
    function startMove(assignmentId, invitationId) {
        movingAssignment = { assignmentId: assignmentId, invitationId: invitationId };
        selectedGuest = null;
        document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
            c.classList.remove("seating-chip-selected");
        });
        // Highlight empty seats
        document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
            s.classList.add("seating-seat-highlight");
        });
        window.showToast("Click an empty seat to move this guest");
    }

    function cancelMove() {
        movingAssignment = null;
        document.querySelectorAll(".seating-seat-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-highlight");
        });
    }

    // ── Render tables ───────────────────────────────────────────────────────
    var emptyMsg = document.getElementById("seating-empty");

    function renderTables() {
        var container = document.getElementById("seating-tables");
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        if (state.tables.length === 0) {
            container.appendChild(emptyMsg);
            emptyMsg.style.display = "";
            return;
        }
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
            // Edit
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "seating-action-btn";
            editBtn.title = "Edit table";
            editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            editBtn.addEventListener("click", function () { openEditTable(table); });
            // Clear seats (eraser icon)
            var clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "seating-action-btn";
            clearBtn.title = "Clear all seats";
            clearBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l6 6c.6.6.6 1.5 0 2.1L14 19"/><path d="M6 11l4 4"/></svg>';
            clearBtn.addEventListener("click", function () { clearTable(table.id); });
            // Delete table (trash icon)
            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "seating-action-btn seating-action-danger";
            delBtn.title = "Delete table";
            delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
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
        svgWrap.innerHTML = buildTableSVG(table, SEAT_R, SEAT_FONT, SEAT_SPACING);
        card.appendChild(svgWrap);

        return card;
    }

    // ── SVG Table Rendering ─────────────────────────────────────────────────

    function buildTableSVG(table, seatR, fontSize, spacing) {
        if (table.shape === "round") return buildRoundSVG(table, seatR, fontSize, spacing);
        if (table.shape === "long") return buildLongSVG(table, seatR, fontSize, spacing);
        return buildRectSVG(table, seatR, fontSize, spacing);
    }

    function seatEl(table, pos, cx, cy, r, fontSize) {
        var seat = table ? table.seats[String(pos)] : null;
        var group = "";
        if (seat) {
            var color = seat.gender === "Male" ? "#d6e9f8" : "#f8d6e9";
            var stroke = seat.gender === "Male" ? "#5b9bd5" : "#d5679b";
            var name = seat.first_name;
            // Truncate to fit in circle: ~1 char per 5px of radius
            var maxChars = Math.floor(r * 2 / (fontSize * 0.6));
            var label = name.length > maxChars ? name.substring(0, maxChars - 1) + "." : name;
            group += '<g class="seating-seat seating-seat-filled" data-assignment-id="' + seat.assignment_id + '" data-invitation-id="' + seat.invitation_id + '" data-table-id="' + table.id + '" style="cursor:' + (canEdit ? "pointer" : "default") + '">';
            group += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="2"/>';
            group += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + fontSize + '" fill="#333" font-family="DM Sans, sans-serif">' + escapeXml(label) + '</text>';
            group += '</g>';
        } else {
            var cursor = (table && canEdit) ? "pointer" : "default";
            var tableId = table ? table.id : 0;
            group += '<g class="seating-seat seating-seat-empty" data-table-id="' + tableId + '" data-seat-pos="' + pos + '" style="cursor:' + cursor + '">';
            group += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#f5f5f5" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4 3"/>';
            group += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + Math.round(fontSize * 0.9) + '" fill="#bbb" font-family="DM Sans, sans-serif">' + pos + '</text>';
            group += '</g>';
        }
        return group;
    }

    function buildRoundSVG(table, seatR, fontSize, spacing) {
        var n = table.capacity;
        var tableR = Math.max(50, (spacing * n) / (2 * Math.PI));
        var orbitR = tableR + seatR + 10;
        var svgSize = (orbitR + seatR + 10) * 2;
        var cx0 = svgSize / 2, cy0 = svgSize / 2;

        var svg = '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '" class="seating-svg" style="min-width:' + Math.min(svgSize, 500) + 'px">';
        svg += '<circle cx="' + cx0 + '" cy="' + cy0 + '" r="' + tableR + '" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';
        for (var i = 0; i < n; i++) {
            var angle = (2 * Math.PI * i / n) - Math.PI / 2;
            var sx = cx0 + orbitR * Math.cos(angle);
            var sy = cy0 + orbitR * Math.sin(angle);
            svg += seatEl(table, i + 1, Math.round(sx), Math.round(sy), seatR, fontSize);
        }
        svg += '</svg>';
        return svg;
    }

    function buildRectSVG(table, seatR, fontSize, spacing) {
        var n = table.capacity;
        var hasEnds = n >= 6;
        var sideSeats = hasEnds ? Math.floor((n - 2) / 2) : Math.floor(n / 2);
        var endSeats = hasEnds ? 2 : 0;
        var topCount = sideSeats;
        var botCount = n - topCount - endSeats;
        if (botCount < 0) { botCount = 0; endSeats = n - topCount; }

        var maxSide = Math.max(topCount, botCount);
        var tableW = maxSide * spacing + 30;
        var tableH = 80;
        var pad = seatR + 20;
        var endPad = hasEnds ? (seatR * 2 + 20) : 0;
        var svgW = tableW + pad * 2 + endPad;
        var svgH = tableH + pad * 2 + seatR * 2 + 20;
        var offX = hasEnds ? (seatR + 10) : 0;
        var tableX = pad + offX;
        var tableY = pad + seatR + 10;

        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg" style="min-width:' + Math.min(svgW, 500) + 'px">';
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="8" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';

        var pos = 1;
        var topStartX = tableX + (tableW - topCount * spacing) / 2 + spacing / 2;
        for (var i = 0; i < topCount; i++) {
            svg += seatEl(table, pos++, Math.round(topStartX + i * spacing), Math.round(tableY - seatR - 8), seatR, fontSize);
        }
        if (hasEnds) {
            svg += seatEl(table, pos++, Math.round(tableX + tableW + seatR + 12), Math.round(tableY + tableH / 2), seatR, fontSize);
        }
        var botStartX = tableX + (tableW - botCount * spacing) / 2 + spacing / 2;
        for (var i = botCount - 1; i >= 0; i--) {
            svg += seatEl(table, pos++, Math.round(botStartX + i * spacing), Math.round(tableY + tableH + seatR + 8), seatR, fontSize);
        }
        if (hasEnds) {
            svg += seatEl(table, pos++, Math.round(tableX - seatR - 12), Math.round(tableY + tableH / 2), seatR, fontSize);
        }

        svg += '</svg>';
        return svg;
    }

    function buildLongSVG(table, seatR, fontSize, spacing) {
        var n = table.capacity;
        var topCount = Math.ceil(n / 2);
        var botCount = n - topCount;

        var maxSide = Math.max(topCount, botCount);
        var tableW = maxSide * spacing + 30;
        var tableH = 50;
        var pad = seatR + 20;
        var svgW = tableW + pad * 2;
        var svgH = tableH + pad * 2 + seatR * 2 + 20;
        var tableX = pad;
        var tableY = pad + seatR + 10;

        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg" style="min-width:' + Math.min(svgW, 500) + 'px">';
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="6" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';

        var pos = 1;
        var topStartX = tableX + (tableW - topCount * spacing) / 2 + spacing / 2;
        for (var i = 0; i < topCount; i++) {
            svg += seatEl(table, pos++, Math.round(topStartX + i * spacing), Math.round(tableY - seatR - 8), seatR, fontSize);
        }
        var botStartX = tableX + (tableW - botCount * spacing) / 2 + spacing / 2;
        for (var i = botCount - 1; i >= 0; i--) {
            svg += seatEl(table, pos++, Math.round(botStartX + i * spacing), Math.round(tableY + tableH + seatR + 8), seatR, fontSize);
        }

        svg += '</svg>';
        return svg;
    }

    // ── Mini preview SVG (for modal) ────────────────────────────────────────
    function buildPreviewSVG(shape, capacity) {
        var fakeTable = { capacity: capacity, seats: {}, shape: shape, id: 0 };
        return buildTableSVG(fakeTable, 16, 8, 40);
    }

    function escapeXml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ── Click handlers on SVG seats ─────────────────────────────────────────
    document.addEventListener("click", function (e) {
        if (!canEdit) return;
        var seatGroup = e.target.closest(".seating-seat");
        if (!seatGroup) return;
        // Ignore clicks inside the modal preview
        if (seatGroup.closest("#seating-table-overlay")) return;

        if (seatGroup.classList.contains("seating-seat-filled")) {
            // Click on filled seat — show move/remove popup
            var aId = seatGroup.dataset.assignmentId;
            var invId = seatGroup.dataset.invitationId;
            showSeatActionMenu(seatGroup, aId, invId);
            e.stopPropagation();
            return;
        }

        // Click on empty seat
        var tableId = parseInt(seatGroup.dataset.tableId);
        var seatPos = parseInt(seatGroup.dataset.seatPos);

        // Moving an existing guest to a new seat
        if (movingAssignment) {
            // Remove old, assign new
            api("DELETE", "/assign/" + movingAssignment.assignmentId).then(function () {
                return api("POST", "/assign", {
                    invitation_id: parseInt(movingAssignment.invitationId),
                    table_id: tableId,
                    seat_position: seatPos
                });
            }).then(function () {
                cancelMove();
                load();
            }).catch(function (err) {
                window.showToast(err.message || "Failed to move guest");
            });
            return;
        }

        if (selectedGuest) {
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
            openPicker(tableId, seatPos);
        }
    });

    // ── Seat action menu (move / remove) ────────────────────────────────────
    var seatActionMenu = null;

    function showSeatActionMenu(seatGroup, assignmentId, invitationId) {
        closeSeatActionMenu();
        var svg = seatGroup.closest("svg");
        var wrap = svg.parentElement;
        var circle = seatGroup.querySelector("circle");
        var cx = parseFloat(circle.getAttribute("cx"));
        var cy = parseFloat(circle.getAttribute("cy"));

        // Convert SVG coordinates to pixel coordinates
        var svgRect = svg.getBoundingClientRect();
        var vb = svg.viewBox.baseVal;
        var scaleX = svgRect.width / vb.width;
        var scaleY = svgRect.height / vb.height;
        var pixelX = (cx - vb.x) * scaleX;
        var pixelY = (cy - vb.y) * scaleY;

        var menu = document.createElement("div");
        menu.className = "seating-seat-menu";
        menu.style.left = Math.round(pixelX) + "px";
        menu.style.top = Math.round(pixelY - 10) + "px";

        var moveBtn = document.createElement("button");
        moveBtn.type = "button";
        moveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg> Move';
        moveBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            closeSeatActionMenu();
            startMove(assignmentId, invitationId);
        });

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "seating-seat-menu-danger";
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Remove';
        removeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            closeSeatActionMenu();
            api("DELETE", "/assign/" + assignmentId).then(function () {
                clearSelection();
                load();
            }).catch(window.handleFetchError);
        });

        menu.appendChild(moveBtn);
        menu.appendChild(removeBtn);
        wrap.style.position = "relative";
        wrap.appendChild(menu);
        seatActionMenu = menu;
    }

    function closeSeatActionMenu() {
        if (seatActionMenu && seatActionMenu.parentNode) {
            seatActionMenu.parentNode.removeChild(seatActionMenu);
        }
        seatActionMenu = null;
    }

    // Close seat action menu when clicking elsewhere
    document.addEventListener("click", function () {
        closeSeatActionMenu();
    });

    // ── Seat picker modal ───────────────────────────────────────────────────
    function openPicker(tableId, seatPos) {
        document.getElementById("picker-table-id").value = tableId;
        document.getElementById("picker-seat-pos").value = seatPos;
        document.getElementById("picker-search").value = "";
        renderPickerList("");
        document.getElementById("seating-picker-overlay").style.display = "flex";
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

    // ── Smart default capacity ──────────────────────────────────────────────
    function getDefaultCapacity() {
        var attending = state.unseated.length;
        state.tables.forEach(function (t) { attending += Object.keys(t.seats).length; });
        if (attending <= 0) return 12;
        var cap = attending % 2 === 0 ? attending : attending + 1;
        var options = [4,6,8,10,12,14,16,18,20,24,30];
        for (var i = 0; i < options.length; i++) {
            if (options[i] >= cap) return options[i];
        }
        return 30;
    }

    // ── Add / Edit table modal ──────────────────────────────────────────────
    var addTableBtn = document.getElementById("seating-add-table-btn");
    var shapeOptions = document.querySelectorAll(".seating-shape-option");
    var capacitySelect = document.getElementById("seating-table-capacity");
    var previewContainer = document.getElementById("seating-table-preview");

    function getSelectedShape() {
        var active = document.querySelector(".seating-shape-option.active");
        return active ? active.dataset.shape : "rectangular";
    }

    function setSelectedShape(shape) {
        shapeOptions.forEach(function (opt) {
            opt.classList.toggle("active", opt.dataset.shape === shape);
        });
    }

    function updatePreview() {
        if (!previewContainer) return;
        var shape = getSelectedShape();
        var capacity = parseInt(capacitySelect.value) || 12;
        previewContainer.innerHTML = buildPreviewSVG(shape, capacity);
    }

    shapeOptions.forEach(function (opt) {
        opt.addEventListener("click", function () {
            setSelectedShape(opt.dataset.shape);
            updatePreview();
        });
    });

    if (capacitySelect) {
        capacitySelect.addEventListener("change", function () { updatePreview(); });
    }

    if (addTableBtn) {
        addTableBtn.addEventListener("click", function () {
            document.getElementById("seating-table-modal-title").textContent = "Add Table";
            document.getElementById("seating-table-id").value = "";
            document.getElementById("seating-table-label").value = "";
            setSelectedShape("rectangular");
            capacitySelect.value = String(getDefaultCapacity());
            updatePreview();
            document.getElementById("seating-table-overlay").style.display = "flex";
        });
    }

    function openEditTable(table) {
        document.getElementById("seating-table-modal-title").textContent = "Edit Table";
        document.getElementById("seating-table-id").value = table.id;
        document.getElementById("seating-table-label").value = table.label || "";
        setSelectedShape(table.shape);
        capacitySelect.value = String(table.capacity);
        updatePreview();
        document.getElementById("seating-table-overlay").style.display = "flex";
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
                shape: getSelectedShape(),
                capacity: parseInt(capacitySelect.value),
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

    // ── Clear / delete single table ─────────────────────────────────────────
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
    var section = document.getElementById("seating-section");
    var loaded = false;
    if (section) {
        var sectionHeader = section.querySelector(".collapsible-header");
        if (sectionHeader) {
            sectionHeader.addEventListener("click", function () {
                if (!loaded) {
                    loaded = true;
                    load();
                }
            });
        }
        if (!section.classList.contains("collapsed")) {
            loaded = true;
            load();
        }
    }

});
