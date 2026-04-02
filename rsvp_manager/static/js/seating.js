// ── Seating Plan Module ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

    var app = document.getElementById("seating-app");
    if (!app) return;

    var eventId = app.dataset.eventId;
    var role = app.dataset.role;
    var canEdit = (role === "owner" || role === "cohost");

    var state = { tables: [], unseated: [] };
    var movingGuest = null; // { assignmentId, invitationId } when in move mode
    var lastAction = null;  // for undo

    var SEAT_R = 30, SEAT_FONT = 12, SEAT_SPACING = 76;

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

    // ── State management ────────────────────────────────────────────────────
    function load() {
        api("GET", "").then(function (data) {
            state = data;
            render();
        }).catch(window.handleFetchError);
    }

    function saveStateForUndo() {
        lastAction = JSON.parse(JSON.stringify(state));
    }

    function render() {
        renderUnseated();
        renderTables();
        updateHeaderCount();
        attachSeatTouchHandlers();
    }

    function updateHeaderCount() {
        var el = document.getElementById("seating-header-count");
        if (!el) return;
        var seated = 0;
        state.tables.forEach(function (t) { seated += Object.keys(t.seats).length; });
        var total = seated + state.unseated.length;
        if (total > 0) {
            el.textContent = "— " + seated + "/" + total + " seated";
        } else {
            el.textContent = "";
        }
    }

    // ── Unseated guests ─────────────────────────────────────────────────────
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
                chip.addEventListener("click", function (e) {
                    e.stopPropagation();
                    onUnseatedChipClick(g, chip);
                });
                // Drag-and-drop support
                chip.draggable = true;
                chip.addEventListener("dragstart", function (e) {
                    onDragStart(e, { assignmentId: null, invitationId: g.invitation_id, name: chip.textContent, gender: g.gender });
                });
                chip.addEventListener("dragend", onDragEnd);
                // Touch drag support
                chip.addEventListener("touchstart", function (e) {
                    onTouchDragStart(e, chip, { assignmentId: null, invitationId: g.invitation_id, name: chip.textContent, gender: g.gender });
                }, { passive: false });
            }
            list.appendChild(chip);
        });
    }

    function onUnseatedChipClick(guest, chip) {
        // If we're in move mode, this is the target: unseat moving guest → we just cancel
        // Actually, clicking an unseated guest while in move mode = cancel move, select this one
        exitMoveMode();
        // Enter "assigning" mode: highlight empty seats in yellow
        if (movingGuest && movingGuest.invitationId == guest.invitation_id) {
            // Already selected, deselect
            exitMoveMode();
            return;
        }
        // Select this unseated guest for assignment
        movingGuest = { assignmentId: null, invitationId: guest.invitation_id };
        document.querySelectorAll(".seating-chip").forEach(function (c) {
            c.classList.remove("seating-chip-selected");
        });
        chip.classList.add("seating-chip-selected");
        highlightTargets();
    }

    // ── Move mode ───────────────────────────────────────────────────────────
    function enterMoveMode(assignmentId, invitationId) {
        movingGuest = { assignmentId: assignmentId, invitationId: invitationId };
        highlightTargets();
    }

    function highlightTargets() {
        document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
            s.classList.add("seating-seat-highlight");
        });
        // Highlight other filled seats for swap (not the one being moved)
        document.querySelectorAll(".seating-seat-filled").forEach(function (s) {
            if (movingGuest && seatAttr(s, "assignment-id") !== String(movingGuest.assignmentId)) {
                s.classList.add("seating-seat-swap-highlight");
            }
        });
    }

    function exitMoveMode() {
        movingGuest = null;
        removeActionCircles();
        document.querySelectorAll(".seating-chip-selected").forEach(function (c) {
            c.classList.remove("seating-chip-selected");
        });
        document.querySelectorAll(".seating-seat-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-highlight");
        });
        document.querySelectorAll(".seating-seat-swap-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-swap-highlight");
        });
    }

    // ── Action circles (X to unseat, lock toggle) ──────────────────────────
    var actionCirclesEl = null;

    function showActionCircles(seatGroup, assignmentId) {
        removeActionCircles();
        var svg = seatGroup.closest("svg");
        var wrap = svg.parentElement;
        var circle = seatGroup.querySelector("circle");
        var cx = parseFloat(circle.getAttribute("cx"));
        var cy = parseFloat(circle.getAttribute("cy"));

        // Convert SVG coords to pixel coords relative to the wrap container
        var wrapRect = wrap.getBoundingClientRect();
        var svgRect = svg.getBoundingClientRect();
        var vb = svg.viewBox.baseVal;
        var scaleX = svgRect.width / vb.width;
        var scaleY = svgRect.height / vb.height;
        // SVG position within wrap (accounts for centering via flexbox)
        var svgOffsetX = svgRect.left - wrapRect.left + wrap.scrollLeft;
        var svgOffsetY = svgRect.top - wrapRect.top + wrap.scrollTop;
        var pixelX = svgOffsetX + (cx - vb.x) * scaleX;
        var pixelY = svgOffsetY + (cy - vb.y) * scaleY;

        // Position circles overlapping the seat at top-left (X) and top-right (lock)
        var seatPixelR = SEAT_R * scaleX;
        var offset = seatPixelR * 0.65;

        // X button (unseat) — top-left of seat
        var xBtn = document.createElement("button");
        xBtn.type = "button";
        xBtn.className = "seating-action-circle seating-action-circle-x";
        xBtn.title = "Unseat";
        xBtn.style.position = "absolute";
        xBtn.style.left = Math.round(pixelX - offset - 10) + "px";
        xBtn.style.top = Math.round(pixelY - offset - 10) + "px";
        xBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        xBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            saveStateForUndo();
            exitMoveMode();
            api("DELETE", "/assign/" + assignmentId).then(function () {
                load();
                window.showToast("Guest unseated", function () { undoLastAction(); });
            }).catch(window.handleFetchError);
        });

        // Lock button
        var isLocked = false;
        // Find if this seat is locked
        for (var ti = 0; ti < state.tables.length; ti++) {
            var seats = state.tables[ti].seats;
            for (var p in seats) {
                if (String(seats[p].assignment_id) === assignmentId) {
                    isLocked = seats[p].is_locked;
                    break;
                }
            }
        }
        // Lock button — top-right of seat
        var lockBtn = document.createElement("button");
        lockBtn.type = "button";
        lockBtn.className = "seating-action-circle seating-action-circle-lock" + (isLocked ? " seating-action-circle-locked" : "");
        lockBtn.title = isLocked ? "Unlock" : "Lock";
        lockBtn.style.position = "absolute";
        lockBtn.style.left = Math.round(pixelX + offset - 10) + "px";
        lockBtn.style.top = Math.round(pixelY - offset - 10) + "px";
        lockBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        lockBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            api("POST", "/assign/" + assignmentId + "/lock").then(function () {
                exitMoveMode();
                load();
            }).catch(window.handleFetchError);
        });

        // Create a container for cleanup
        var container = document.createElement("div");
        container.className = "seating-action-circles";
        container.appendChild(xBtn);
        container.appendChild(lockBtn);
        wrap.appendChild(container);
        actionCirclesEl = container;
    }

    function removeActionCircles() {
        if (actionCirclesEl && actionCirclesEl.parentNode) {
            actionCirclesEl.parentNode.removeChild(actionCirclesEl);
        }
        actionCirclesEl = null;
    }

    // Escape key cancels move mode
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && movingGuest) {
            exitMoveMode();
        }
    });

    // Click on background cancels move mode
    document.addEventListener("click", function (e) {
        if (!movingGuest) return;
        // Don't cancel if clicking on a seat, chip, or action button
        if (e.target.closest(".seating-seat") || e.target.closest(".seating-chip") ||
            e.target.closest(".seating-action-circle") || e.target.closest(".seating-action-btn")) return;
        exitMoveMode();
    });

    // ── Render tables ───────────────────────────────────────────────────────
    var emptyMsg = document.getElementById("seating-empty");

    function renderTables() {
        var container = document.getElementById("seating-tables");
        while (container.firstChild) container.removeChild(container.firstChild);
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
            // Lock all
            var hasSeats = seatCount > 0;
            if (hasSeats) {
                var allLocked = Object.keys(table.seats).every(function (k) { return table.seats[k].is_locked; });
                var lockAllBtn = document.createElement("button");
                lockAllBtn.type = "button";
                lockAllBtn.className = "seating-action-btn" + (allLocked ? " seating-action-active" : "");
                lockAllBtn.title = allLocked ? "Unlock all seats" : "Lock all seats";
                lockAllBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
                lockAllBtn.addEventListener("click", function () {
                    api("POST", "/tables/" + table.id + "/lock", { lock: !allLocked }).then(function () { load(); });
                });
                actions.appendChild(lockAllBtn);
            }
            // Edit
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "seating-action-btn";
            editBtn.title = "Edit table";
            editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
            editBtn.addEventListener("click", function () { openEditTable(table); });
            // Clear
            var clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "seating-action-btn";
            clearBtn.title = "Clear seats";
            clearBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1l10-10c.6-.6 1.5-.6 2.1 0l6 6c.6.6.6 1.5 0 2.1L14 19"/><path d="M6 11l4 4"/></svg>';
            clearBtn.addEventListener("click", function () { clearTable(table.id); });
            // Delete
            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "seating-action-btn seating-action-danger";
            delBtn.title = "Delete table";
            delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
            delBtn.addEventListener("click", function () { deleteTable(table.id); });
            // Rotate
            if (table.shape !== "round") {
                var rotBtn = document.createElement("button");
                rotBtn.type = "button";
                rotBtn.className = "seating-action-btn";
                rotBtn.title = "Rotate table";
                rotBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
                rotBtn.addEventListener("click", function () {
                    api("POST", "/tables/" + table.id + "/rotate").then(function (data) {
                        // Update local state
                        table.rotation = data.rotation;
                        var wrap = card.querySelector(".seating-svg-wrap");
                        if (wrap) {
                            wrap.innerHTML = buildTableSVG(table, SEAT_R, SEAT_FONT, SEAT_SPACING);
                            applyRotation(wrap, table.id);
                        }
                    }).catch(window.handleFetchError);
                });
                actions.appendChild(rotBtn);
            }
            actions.appendChild(editBtn);
            actions.appendChild(clearBtn);
            actions.appendChild(delBtn);
            header.appendChild(actions);
        }

        card.appendChild(header);
        var svgWrap = document.createElement("div");
        svgWrap.className = "seating-svg-wrap";
        svgWrap.style.position = "relative";
        svgWrap.innerHTML = buildTableSVG(table, SEAT_R, SEAT_FONT, SEAT_SPACING);
        applyRotation(svgWrap, table.id);
        card.appendChild(svgWrap);
        return card;
    }

    // ── SVG Rendering ───────────────────────────────────────────────────────
    function getTableRotation(tableId) {
        for (var i = 0; i < state.tables.length; i++) {
            if (state.tables[i].id === tableId) return state.tables[i].rotation || 0;
        }
        return 0;
    }

    function buildTableSVG(table, seatR, fontSize, spacing) {
        if (table.shape === "round") return buildRoundSVG(table, seatR, fontSize, spacing);
        if (table.shape === "large_rect") return buildLargeRectSVG(table, seatR, fontSize, spacing);
        if (table.shape === "long") return buildLongSVG(table, seatR, fontSize, spacing);
        return buildRectSVG(table, seatR, fontSize, spacing);
    }

    function seatEl(table, pos, cx, cy, r, fontSize) {
        var seat = table ? table.seats[String(pos)] : null;
        var g = "";
        if (seat) {
            var color = seat.gender === "Male" ? "#d6e9f8" : "#f8d6e9";
            var stroke = seat.gender === "Male" ? "#5b9bd5" : "#d5679b";
            var maxChars = Math.floor(r * 2 / (fontSize * 0.6));
            var label = seat.first_name.length > maxChars ? seat.first_name.substring(0, maxChars - 1) + "." : seat.first_name;
            g += '<g class="seating-seat seating-seat-filled' + (seat.is_locked ? ' seating-seat-locked' : '') + '" data-assignment-id="' + seat.assignment_id + '" data-invitation-id="' + seat.invitation_id + '" data-table-id="' + (table.id || 0) + '" style="cursor:' + (canEdit ? "pointer" : "default") + '">';
            g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="2"/>';
            g += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + fontSize + '" fill="#333" font-family="DM Sans, sans-serif">' + escapeXml(label) + '</text>';
            // Lock icon
            if (seat.is_locked) {
                g += '<g transform="translate(' + (cx + r * 0.55) + ',' + (cy - r * 0.55) + ') scale(0.55)"><rect x="-6" y="-2" width="12" height="9" rx="1.5" fill="#888" stroke="none"/><path d="M-3.5-2 v-3 a3.5 3.5 0 0 1 7 0 v3" fill="none" stroke="#888" stroke-width="1.8" stroke-linecap="round"/></g>';
            }
            g += '</g>';
        } else {
            var cursor = (table && canEdit) ? "pointer" : "default";
            g += '<g class="seating-seat seating-seat-empty" data-table-id="' + (table ? table.id : 0) + '" data-seat-pos="' + pos + '" style="cursor:' + cursor + '">';
            g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#f5f5f5" stroke="#ccc" stroke-width="1.5" stroke-dasharray="4 3"/>';
            g += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + Math.round(fontSize * 0.9) + '" fill="#bbb" font-family="DM Sans, sans-serif">' + pos + '</text>';
            g += '</g>';
        }
        return g;
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
            svg += seatEl(table, i + 1, Math.round(cx0 + orbitR * Math.cos(angle)), Math.round(cy0 + orbitR * Math.sin(angle)), seatR, fontSize);
        }
        svg += '</svg>';
        return svg;
    }

    function buildRectSVG(table, seatR, fontSize, spacing) {
        var n = table.capacity, hasEnds = n >= 6;
        var sideSeats = hasEnds ? Math.floor((n - 2) / 2) : Math.floor(n / 2);
        var endSeats = hasEnds ? 2 : 0, topCount = sideSeats;
        var botCount = n - topCount - endSeats;
        if (botCount < 0) { botCount = 0; endSeats = n - topCount; }
        var maxSide = Math.max(topCount, botCount), tableW = maxSide * spacing + 30, tableH = 80;
        var pad = seatR + 20, endPad = hasEnds ? (seatR * 2 + 20) : 0;
        var svgW = tableW + pad * 2 + endPad, svgH = tableH + pad * 2 + seatR * 2 + 20;
        var offX = hasEnds ? (seatR + 10) : 0, tableX = pad + offX, tableY = pad + seatR + 10;
        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg" style="min-width:' + Math.min(svgW, 500) + 'px">';
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="8" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';
        var pos = 1, topStartX = tableX + (tableW - topCount * spacing) / 2 + spacing / 2;
        for (var i = 0; i < topCount; i++) svg += seatEl(table, pos++, Math.round(topStartX + i * spacing), Math.round(tableY - seatR - 8), seatR, fontSize);
        if (hasEnds) svg += seatEl(table, pos++, Math.round(tableX + tableW + seatR + 12), Math.round(tableY + tableH / 2), seatR, fontSize);
        var botStartX = tableX + (tableW - botCount * spacing) / 2 + spacing / 2;
        for (var i = botCount - 1; i >= 0; i--) svg += seatEl(table, pos++, Math.round(botStartX + i * spacing), Math.round(tableY + tableH + seatR + 8), seatR, fontSize);
        if (hasEnds) svg += seatEl(table, pos++, Math.round(tableX - seatR - 12), Math.round(tableY + tableH / 2), seatR, fontSize);
        svg += '</svg>';
        return svg;
    }

    function buildLongSVG(table, seatR, fontSize, spacing) {
        var n = table.capacity, topCount = Math.ceil(n / 2), botCount = n - topCount;
        var maxSide = Math.max(topCount, botCount), tableW = maxSide * spacing + 30, tableH = 50;
        var pad = seatR + 20, svgW = tableW + pad * 2, svgH = tableH + pad * 2 + seatR * 2 + 20;
        var tableX = pad, tableY = pad + seatR + 10;
        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg" style="min-width:' + Math.min(svgW, 500) + 'px">';
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="6" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';
        var pos = 1, topStartX = tableX + (tableW - topCount * spacing) / 2 + spacing / 2;
        for (var i = 0; i < topCount; i++) svg += seatEl(table, pos++, Math.round(topStartX + i * spacing), Math.round(tableY - seatR - 8), seatR, fontSize);
        var botStartX = tableX + (tableW - botCount * spacing) / 2 + spacing / 2;
        for (var i = botCount - 1; i >= 0; i--) svg += seatEl(table, pos++, Math.round(botStartX + i * spacing), Math.round(tableY + tableH + seatR + 8), seatR, fontSize);
        svg += '</svg>';
        return svg;
    }

    function buildLargeRectSVG(table, seatR, fontSize, spacing) {
        // Large rectangle: seats along top and bottom, 2x2 at each end
        var n = table.capacity;
        var endSeats = Math.min(4, n);
        var sideTotal = n - endSeats;
        var topCount = Math.ceil(sideTotal / 2);
        var botCount = sideTotal - topCount;

        var maxSide = Math.max(topCount, botCount, 1);
        var tableW = maxSide * spacing + 40, tableH = seatR * 2 + 30;
        var pad = seatR + 20;
        var endGap = seatR + 16; // horizontal gap from table edge to end seats
        var svgW = tableW + pad * 2 + (endGap + seatR) * 2 + 8;
        var svgH = tableH + pad * 2 + seatR * 2 + 20;
        var tableX = pad + endGap + seatR + 4;
        var tableY = pad + seatR + 10;

        var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" class="seating-svg" style="min-width:' + Math.min(svgW, 500) + 'px">';
        svg += '<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + tableH + '" rx="8" fill="#f9f6f0" stroke="#d4c5a9" stroke-width="2"/>';

        var pos = 1;
        // Top row seats
        var topStartX = tableX + (tableW - topCount * spacing) / 2 + spacing / 2;
        for (var i = 0; i < topCount; i++) {
            svg += seatEl(table, pos++, Math.round(topStartX + i * spacing), Math.round(tableY - seatR - 8), seatR, fontSize);
        }
        // Right end: 2 seats stacked vertically
        var endVSpacing = seatR * 2 + 8;
        var rightX = Math.round(tableX + tableW + endGap);
        var endCenterY = tableY + tableH / 2;
        if (endSeats >= 1) svg += seatEl(table, pos++, rightX, Math.round(endCenterY - endVSpacing / 2), seatR, fontSize);
        if (endSeats >= 2) svg += seatEl(table, pos++, rightX, Math.round(endCenterY + endVSpacing / 2), seatR, fontSize);
        // Bottom row seats (right to left)
        var botStartX = tableX + (tableW - botCount * spacing) / 2 + spacing / 2;
        for (var i = botCount - 1; i >= 0; i--) {
            svg += seatEl(table, pos++, Math.round(botStartX + i * spacing), Math.round(tableY + tableH + seatR + 8), seatR, fontSize);
        }
        // Left end: 2 seats stacked vertically
        var leftX = Math.round(tableX - endGap);
        if (endSeats >= 3) svg += seatEl(table, pos++, leftX, Math.round(endCenterY + endVSpacing / 2), seatR, fontSize);
        if (endSeats >= 4) svg += seatEl(table, pos++, leftX, Math.round(endCenterY - endVSpacing / 2), seatR, fontSize);

        svg += '</svg>';
        return svg;
    }

    function buildPreviewSVG(shape, capacity) {
        return buildTableSVG({ capacity: capacity, seats: {}, shape: shape, id: 0 }, 16, 8, 40);
    }

    function applyRotation(svgWrap, tableId) {
        var deg = getTableRotation(tableId);
        var svgEl = svgWrap.querySelector("svg");
        if (!svgEl) return;

        // Reset
        svgWrap.style.minHeight = "";

        if (!deg) return;

        var vb = svgEl.viewBox.baseVal;
        if (!vb) return;
        var origW = vb.width, origH = vb.height;

        // For 90/270: swap viewBox dimensions so the SVG container
        // adapts to the rotated aspect ratio naturally
        if (deg === 90 || deg === 270) {
            svgEl.setAttribute("viewBox", "0 0 " + origH + " " + origW);
            svgEl.style.removeProperty("min-width");
        }

        // Wrap all existing content in a rotated group
        var inner = svgEl.innerHTML;
        var cx = origW / 2, cy = origH / 2;
        // For 90/270 the pivot needs to be at the center of the ORIGINAL viewBox
        // then translate to center in the new viewBox
        var newCx = (deg === 90 || deg === 270) ? origH / 2 : origW / 2;
        var newCy = (deg === 90 || deg === 270) ? origW / 2 : origH / 2;
        svgEl.innerHTML = '<g transform="translate(' + newCx + ',' + newCy + ') rotate(' + deg + ') translate(' + (-cx) + ',' + (-cy) + ')">' + inner + '</g>';

        // Counter-rotate all text elements so names stay horizontal
        var texts = svgEl.querySelectorAll("text");
        for (var i = 0; i < texts.length; i++) {
            var t = texts[i];
            var tx = t.getAttribute("x");
            var ty = t.getAttribute("y");
            t.setAttribute("transform", "rotate(" + (-deg) + "," + tx + "," + ty + ")");
        }
        // Counter-rotate lock icons
        var lockIcons = svgEl.querySelectorAll(".seating-seat-locked > g:last-child");
        for (var i = 0; i < lockIcons.length; i++) {
            var g = lockIcons[i];
            var existingTransform = g.getAttribute("transform") || "";
            g.setAttribute("transform", existingTransform + " rotate(" + (-deg) + ")");
        }
    }

    function escapeXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    // Helper: read data attributes from SVG elements (dataset is unreliable on SVG in some mobile browsers)
    function seatAttr(el, name) { return el.getAttribute("data-" + name); }

    // ── Seat click handling ─────────────────────────────────────────────────
    document.addEventListener("click", function (e) {
        if (!canEdit) return;
        // Check if clicking action circles
        if (e.target.closest(".seating-action-circle")) return;
        var seat = e.target.closest(".seating-seat");
        if (!seat || seat.closest("#seating-table-overlay")) return;

        // ── Filled seat ─────────────────────────────────────────────────
        if (seat.classList.contains("seating-seat-filled")) {
            var aId = seatAttr(seat, "assignment-id");
            var invId = seatAttr(seat, "invitation-id");
            var tId = seatAttr(seat, "table-id");

            // In move mode with a SEATED guest: swap
            if (movingGuest && movingGuest.assignmentId && movingGuest.assignmentId !== aId) {
                saveStateForUndo();
                api("POST", "/swap", {
                    assignment_id_a: parseInt(movingGuest.assignmentId),
                    assignment_id_b: parseInt(aId)
                }).then(function () { exitMoveMode(); load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to swap");
                });
                e.stopPropagation();
                return;
            }

            // In move mode with an UNSEATED guest: replace the seated guest
            if (movingGuest && !movingGuest.assignmentId) {
                saveStateForUndo();
                // Find the seat position of the occupied seat
                var seatPos = null;
                // We need to find this seat's position from the state
                for (var ti = 0; ti < state.tables.length; ti++) {
                    var seats = state.tables[ti].seats;
                    for (var p in seats) {
                        if (String(seats[p].assignment_id) === aId) {
                            seatPos = parseInt(p);
                            tId = state.tables[ti].id;
                            break;
                        }
                    }
                    if (seatPos) break;
                }
                // Remove the seated guest, then assign the unseated one
                api("DELETE", "/assign/" + aId).then(function () {
                    return api("POST", "/assign", {
                        invitation_id: parseInt(movingGuest.invitationId),
                        table_id: tId,
                        seat_position: seatPos
                    });
                }).then(function () { exitMoveMode(); load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to replace");
                });
                e.stopPropagation();
                return;
            }

            // Clicking same guest again = exit move mode
            if (movingGuest && movingGuest.assignmentId === aId) {
                exitMoveMode();
                e.stopPropagation();
                return;
            }

            // Single click: enter move mode for this guest
            exitMoveMode();
            enterMoveMode(aId, invId);
            showActionCircles(seat, aId);
            e.stopPropagation();
            return;
        }

        // ── Empty seat ──────────────────────────────────────────────────
        var tableId = parseInt(seatAttr(seat, "table-id"));
        var seatPos = parseInt(seatAttr(seat, "seat-pos"));

        if (movingGuest) {
            saveStateForUndo();
            if (movingGuest.assignmentId) {
                // Move existing guest to empty seat
                api("DELETE", "/assign/" + movingGuest.assignmentId).then(function () {
                    return api("POST", "/assign", {
                        invitation_id: parseInt(movingGuest.invitationId),
                        table_id: tableId,
                        seat_position: seatPos
                    });
                }).then(function () { exitMoveMode(); load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to move");
                });
            } else {
                // Assign unseated guest
                api("POST", "/assign", {
                    invitation_id: parseInt(movingGuest.invitationId),
                    table_id: tableId,
                    seat_position: seatPos
                }).then(function () { exitMoveMode(); load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to assign");
                });
            }
            e.stopPropagation();
            return;
        }

        // No move mode: open picker
        openPicker(tableId, seatPos);
        e.stopPropagation();
    });

    // Double-click on filled seat: unseat
    document.addEventListener("dblclick", function (e) {
        if (!canEdit) return;
        var seat = e.target.closest(".seating-seat-filled");
        if (!seat || seat.closest("#seating-table-overlay")) return;
        var aId = seatAttr(seat, "assignment-id");
        exitMoveMode();
        saveStateForUndo();
        api("DELETE", "/assign/" + aId).then(function () {
            load();
            window.showToast("Guest unseated", function () { undoLastAction(); });
        }).catch(window.handleFetchError);
    });

    // ── Lock toggle (via small icon on seat hover or toolbar) ────────────
    // The lock icon is part of the SVG. We handle lock via right-click or a toolbar.
    // For simplicity, add lock toggle button on the move mode bar.
    // Actually, let's use a contextmenu (right-click) on seated guests:
    document.addEventListener("contextmenu", function (e) {
        if (!canEdit) return;
        var seat = e.target.closest(".seating-seat-filled");
        if (!seat || seat.closest("#seating-table-overlay")) return;
        e.preventDefault();
        var aId = seatAttr(seat, "assignment-id");
        api("POST", "/assign/" + aId + "/lock").then(function () { load(); }).catch(window.handleFetchError);
    });

    // ── Picker modal ────────────────────────────────────────────────────
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
                saveStateForUndo();
                api("POST", "/assign", {
                    invitation_id: g.invitation_id, table_id: tableId, seat_position: seatPos
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to assign");
                });
            });
            list.appendChild(btn);
        });
        if (list.children.length === 0) {
            list.innerHTML = '<p class="seating-none">No unseated guests found.</p>';
        }
    }

    var pickerSearch = document.getElementById("picker-search");
    if (pickerSearch) pickerSearch.addEventListener("input", function () { renderPickerList(this.value); });
    var pickerClose = document.getElementById("seating-picker-close");
    if (pickerClose) pickerClose.addEventListener("click", function () { document.getElementById("seating-picker-overlay").style.display = "none"; });

    // ── Undo ────────────────────────────────────────────────────────────
    function undoLastAction() {
        if (!lastAction) return;
        // Reload from server (undo is best-effort via reload, since we saved pre-action state)
        // For a proper undo we'd need server-side support, so we just reload
        load();
        lastAction = null;
    }

    // ── Smart default capacity ──────────────────────────────────────────
    function getDefaultCapacity() {
        var attending = state.unseated.length;
        state.tables.forEach(function (t) { attending += Object.keys(t.seats).length; });
        if (attending <= 0) return 12;
        var cap = attending % 2 === 0 ? attending : attending + 1;
        var options = [4,6,8,10,12,14,16,18,20,24,30];
        for (var i = 0; i < options.length; i++) { if (options[i] >= cap) return options[i]; }
        return 30;
    }

    // ── Add / Edit table modal ──────────────────────────────────────────
    var addTableBtn = document.getElementById("seating-add-table-btn");
    var shapeOptions = document.querySelectorAll(".seating-shape-option");
    var capacitySelect = document.getElementById("seating-table-capacity");
    var previewContainer = document.getElementById("seating-table-preview");

    function getSelectedShape() {
        var active = document.querySelector(".seating-shape-option.active");
        return active ? active.dataset.shape : "rectangular";
    }
    function setSelectedShape(shape) {
        shapeOptions.forEach(function (opt) { opt.classList.toggle("active", opt.dataset.shape === shape); });
    }
    function updatePreview() {
        if (previewContainer) previewContainer.innerHTML = buildPreviewSVG(getSelectedShape(), parseInt(capacitySelect.value) || 12);
    }
    shapeOptions.forEach(function (opt) { opt.addEventListener("click", function () { setSelectedShape(opt.dataset.shape); updatePreview(); }); });
    if (capacitySelect) capacitySelect.addEventListener("change", updatePreview);

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
    if (tableClose) tableClose.addEventListener("click", function () { document.getElementById("seating-table-overlay").style.display = "none"; });

    var tableSave = document.getElementById("seating-table-save");
    if (tableSave) {
        tableSave.addEventListener("click", function () {
            var id = document.getElementById("seating-table-id").value;
            var data = { label: document.getElementById("seating-table-label").value, shape: getSelectedShape(), capacity: parseInt(capacitySelect.value) };
            var isNew = !id;
            (id ? api("PUT", "/tables/" + id, data) : api("POST", "/tables", data))
                .then(function () { if (isNew) window.trackEvent("seating-table-created"); document.getElementById("seating-table-overlay").style.display = "none"; load(); })
                .catch(function (err) { window.showToast(err.message || "Failed to save table"); });
        });
    }

    // ── Auto-assign & Shuffle ───────────────────────────────────────────
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
                saveStateForUndo();
                api("POST", "/smart-assign", { mode: mode }).then(function (data) {
                    state = data;
                    render();
                    window.trackEvent("seating-auto-assigned", { mode: mode });
                    window.showToast("Seating updated (" + mode + ")", function () { undoLastAction(); });
                }).catch(function (err) { window.showToast(err.message || "Auto-assign failed"); });
            });
        });
        document.addEventListener("click", function () { autoMenu.style.display = "none"; });
    }

    // ── Clear all (with locked options) ─────────────────────────────────
    var clearAllBtn = document.getElementById("seating-clear-all-btn");
    var clearMenu = document.getElementById("seating-clear-menu");
    if (clearAllBtn && clearMenu) {
        clearAllBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            clearMenu.style.display = clearMenu.style.display === "none" ? "" : "none";
        });
        document.addEventListener("click", function () { clearMenu.style.display = "none"; });

        var clearUnlockedBtn = document.getElementById("clear-unlocked-btn");
        var clearEverythingBtn = document.getElementById("clear-everything-btn");
        if (clearUnlockedBtn) {
            clearUnlockedBtn.addEventListener("click", function () {
                clearMenu.style.display = "none";
                saveStateForUndo();
                api("POST", "/clear", { include_locked: false }).then(function () {
                    load(); window.showToast("Unlocked seats cleared", function () { undoLastAction(); });
                }).catch(window.handleFetchError);
            });
        }
        if (clearEverythingBtn) {
            clearEverythingBtn.addEventListener("click", function () {
                clearMenu.style.display = "none";
                if (!confirm("Clear ALL seats including locked ones?")) return;
                saveStateForUndo();
                api("POST", "/clear", { include_locked: true }).then(function () {
                    load(); window.showToast("All seats cleared", function () { undoLastAction(); });
                }).catch(window.handleFetchError);
            });
        }
    }

    // ── Clear / delete single table ─────────────────────────────────────
    function clearTable(tableId) {
        if (!confirm("Clear unlocked seats on this table?")) return;
        saveStateForUndo();
        api("POST", "/tables/" + tableId + "/clear", { include_locked: false }).then(function () { load(); }).catch(window.handleFetchError);
    }

    function deleteTable(tableId) {
        if (!confirm("Delete this table and unseat all its guests?")) return;
        api("DELETE", "/tables/" + tableId).then(function () { load(); }).catch(window.handleFetchError);
    }

    // ── Drag-and-drop ────────────────────────────────────────────────────

    var dragData = null;   // { assignmentId, invitationId, name, gender }
    var dragGhost = null;
    var touchDragActive = false;
    var touchStartTimer = null;
    var TOUCH_HOLD_MS = 200;

    function createDragGhost(name, gender) {
        var el = document.createElement("div");
        el.className = "seating-drag-ghost seating-chip-" + gender.toLowerCase();
        el.textContent = name;
        document.body.appendChild(el);
        return el;
    }

    function removeDragGhost() {
        if (dragGhost && dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
        dragGhost = null;
    }

    function addDropHighlights() {
        document.querySelectorAll(".seating-seat-empty").forEach(function (s) {
            s.classList.add("seating-seat-drop-target");
        });
        document.querySelectorAll(".seating-seat-filled").forEach(function (s) {
            if (!dragData || !dragData.assignmentId || seatAttr(s, "assignment-id") !== String(dragData.assignmentId)) {
                s.classList.add("seating-seat-swap-highlight");
            }
        });
    }

    function removeDropHighlights() {
        document.querySelectorAll(".seating-seat-drop-target").forEach(function (s) {
            s.classList.remove("seating-seat-drop-target");
        });
        document.querySelectorAll(".seating-seat-swap-highlight").forEach(function (s) {
            s.classList.remove("seating-seat-swap-highlight");
        });
    }

    function findSeatUnderPoint(x, y) {
        var els = document.elementsFromPoint(x, y);
        for (var i = 0; i < els.length; i++) {
            var seat = els[i].closest ? els[i].closest(".seating-seat") : null;
            if (seat && !seat.closest("#seating-table-overlay")) return seat;
        }
        return null;
    }

    function handleDrop(seat) {
        if (!seat || !dragData) return;
        // Capture dragData locally — callers null out the outer variable synchronously
        // after this function returns, but async callbacks below still need the values.
        var data = { assignmentId: dragData.assignmentId, invitationId: dragData.invitationId };
        exitMoveMode();
        saveStateForUndo();

        if (seat.classList.contains("seating-seat-empty")) {
            var tableId = parseInt(seatAttr(seat, "table-id"));
            var seatPos = parseInt(seatAttr(seat, "seat-pos"));
            if (data.assignmentId) {
                // Move filled seat to empty seat
                api("DELETE", "/assign/" + data.assignmentId).then(function () {
                    return api("POST", "/assign", {
                        invitation_id: parseInt(data.invitationId),
                        table_id: tableId,
                        seat_position: seatPos
                    });
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to move");
                });
            } else {
                // Assign unseated chip to empty seat
                api("POST", "/assign", {
                    invitation_id: parseInt(data.invitationId),
                    table_id: tableId,
                    seat_position: seatPos
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to assign");
                });
            }
        } else if (seat.classList.contains("seating-seat-filled")) {
            var targetAId = seatAttr(seat, "assignment-id");
            if (data.assignmentId && data.assignmentId !== targetAId) {
                // Swap two filled seats
                api("POST", "/swap", {
                    assignment_id_a: parseInt(data.assignmentId),
                    assignment_id_b: parseInt(targetAId)
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to swap");
                });
            } else if (!data.assignmentId) {
                // Drop unseated chip onto filled seat → replace
                var seatPos = null, tId = null;
                for (var ti = 0; ti < state.tables.length; ti++) {
                    var seats = state.tables[ti].seats;
                    for (var p in seats) {
                        if (String(seats[p].assignment_id) === targetAId) {
                            seatPos = parseInt(p);
                            tId = state.tables[ti].id;
                            break;
                        }
                    }
                    if (seatPos) break;
                }
                api("DELETE", "/assign/" + targetAId).then(function () {
                    return api("POST", "/assign", {
                        invitation_id: parseInt(data.invitationId),
                        table_id: tId,
                        seat_position: seatPos
                    });
                }).then(function () { load(); }).catch(function (err) {
                    window.showToast(err.message || "Failed to replace");
                });
            }
        }
    }

    // ── HTML5 Drag API (for unseated chips on desktop) ──────────────────

    function onDragStart(e, data) {
        dragData = data;
        e.dataTransfer.effectAllowed = "move";
        // Use a transparent 1x1 image so we show our own ghost
        var img = new Image();
        img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        e.dataTransfer.setDragImage(img, 0, 0);
        dragGhost = createDragGhost(data.name, data.gender);
        dragGhost.style.left = e.clientX + "px";
        dragGhost.style.top = e.clientY + "px";
        document.body.classList.add("seating-dragging");
        // Delay highlight so it doesn't flash on the source
        setTimeout(addDropHighlights, 0);
    }

    function onDragEnd() {
        removeDragGhost();
        removeDropHighlights();
        document.body.classList.remove("seating-dragging");
        dragData = null;
    }

    // Global drag events on the seating area for drop targets
    app.addEventListener("dragover", function (e) {
        if (!dragData) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragGhost) {
            dragGhost.style.left = e.clientX + "px";
            dragGhost.style.top = e.clientY + "px";
        }
    });

    app.addEventListener("drop", function (e) {
        if (!dragData) return;
        e.preventDefault();
        var seat = findSeatUnderPoint(e.clientX, e.clientY);
        handleDrop(seat);
        removeDragGhost();
        removeDropHighlights();
        document.body.classList.remove("seating-dragging");
        dragData = null;
    });

    // ── Mouse drag for filled SVG seats ─────────────────────────────────

    var mouseDragActive = false;

    app.addEventListener("mousedown", function (e) {
        if (!canEdit || e.button !== 0) return;
        var seat = e.target.closest(".seating-seat-filled");
        if (!seat || seat.closest("#seating-table-overlay")) return;
        // Don't interfere with action circle buttons
        if (e.target.closest(".seating-action-circle")) return;

        // Use getAttribute for SVG element compatibility
        var aId = seat.getAttribute("data-assignment-id");
        var invId = seat.getAttribute("data-invitation-id");

        // Find guest name from state
        var name = "", gender = "";
        for (var ti = 0; ti < state.tables.length; ti++) {
            var seats = state.tables[ti].seats;
            for (var p in seats) {
                if (String(seats[p].assignment_id) === aId) {
                    name = seats[p].first_name;
                    gender = seats[p].gender;
                    break;
                }
            }
            if (name) break;
        }

        var startX = e.clientX, startY = e.clientY;
        var threshold = 6;
        var started = false;

        function onMouseMove(ev) {
            var dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (!started && Math.abs(dx) + Math.abs(dy) < threshold) return;
            if (!started) {
                started = true;
                mouseDragActive = true;
                dragData = { assignmentId: aId, invitationId: invId, name: name, gender: gender };
                dragGhost = createDragGhost(name, gender);
                document.body.classList.add("seating-dragging");
                exitMoveMode();
                addDropHighlights();
            }
            dragGhost.style.left = ev.clientX + "px";
            dragGhost.style.top = ev.clientY + "px";
        }

        function onMouseUp(ev) {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            if (started) {
                var seat = findSeatUnderPoint(ev.clientX, ev.clientY);
                handleDrop(seat);
                removeDragGhost();
                removeDropHighlights();
                document.body.classList.remove("seating-dragging");
                dragData = null;
                // Prevent the click event from firing after drag
                setTimeout(function () { mouseDragActive = false; }, 0);
            }
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    // Prevent click handlers from firing after a mouse drag
    var origClickHandler = app.addEventListener;
    document.addEventListener("click", function (e) {
        if (mouseDragActive) {
            e.stopPropagation();
            mouseDragActive = false;
        }
    }, true);

    // ── Touch drag (mobile) ─────────────────────────────────────────────

    function onTouchDragStart(e, sourceEl, data) {
        var touch = e.touches[0];
        var startX = touch.clientX, startY = touch.clientY;
        var started = false;
        var threshold = 10;

        clearTimeout(touchStartTimer);
        touchStartTimer = setTimeout(function () {
            // Long press activates drag immediately at current position
            started = true;
            touchDragActive = true;
            dragData = data;
            exitMoveMode();
            dragGhost = createDragGhost(data.name, data.gender);
            dragGhost.style.left = startX + "px";
            dragGhost.style.top = startY + "px";
            document.body.classList.add("seating-dragging");
            addDropHighlights();
            // Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(30);
        }, TOUCH_HOLD_MS);

        function onTouchMove(ev) {
            var t = ev.touches[0];
            var dx = t.clientX - startX, dy = t.clientY - startY;
            if (!started && Math.abs(dx) + Math.abs(dy) > threshold) {
                // Moved before hold timer — cancel drag, allow scroll
                clearTimeout(touchStartTimer);
                cleanup();
                return;
            }
            if (started) {
                ev.preventDefault();
                dragGhost.style.left = t.clientX + "px";
                dragGhost.style.top = t.clientY + "px";
            }
        }

        function onTouchEnd(ev) {
            clearTimeout(touchStartTimer);
            if (started) {
                var t = ev.changedTouches[0];
                var seat = findSeatUnderPoint(t.clientX, t.clientY);
                handleDrop(seat);
                removeDragGhost();
                removeDropHighlights();
                document.body.classList.remove("seating-dragging");
                dragData = null;
                touchDragActive = false;
                ev.preventDefault();
            }
            cleanup();
        }

        function cleanup() {
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchEnd);
        }

        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
        document.addEventListener("touchcancel", onTouchEnd);
    }

    // Touch drag for filled seats — attach directly on each <g> element after render
    // (event delegation from app is unreliable for SVG elements on iOS/mobile WebKit)
    function attachSeatTouchHandlers() {
        if (!canEdit) return;
        var filledSeats = app.querySelectorAll(".seating-seat-filled");
        for (var i = 0; i < filledSeats.length; i++) {
            (function (seat) {
                // Skip if handler already attached
                if (seat._touchBound) return;
                seat._touchBound = true;
                seat.addEventListener("touchstart", function (e) {
                    if (e.target.closest && e.target.closest(".seating-action-circle")) return;
                    // Use getAttribute for SVG compatibility (dataset not reliable on SVG in all mobile browsers)
                    var aId = seat.getAttribute("data-assignment-id");
                    var invId = seat.getAttribute("data-invitation-id");
                    var name = "", gender = "";
                    for (var ti = 0; ti < state.tables.length; ti++) {
                        var seats = state.tables[ti].seats;
                        for (var p in seats) {
                            if (String(seats[p].assignment_id) === aId) {
                                name = seats[p].first_name;
                                gender = seats[p].gender;
                                break;
                            }
                        }
                        if (name) break;
                    }
                    onTouchDragStart(e, seat, { assignmentId: aId, invitationId: invId, name: name, gender: gender });
                }, { passive: false });
            })(filledSeats[i]);
        }
    }

    // ── Initial load ────────────────────────────────────────────────────
    var section = document.getElementById("seating-section");
    var loaded = false;
    if (section) {
        var sectionHeader = section.querySelector(".collapsible-header");
        if (sectionHeader) sectionHeader.addEventListener("click", function () { if (!loaded) { loaded = true; load(); } });
        if (!section.classList.contains("collapsed")) { loaded = true; load(); }
    }

});
