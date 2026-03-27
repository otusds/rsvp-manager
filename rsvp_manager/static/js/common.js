// ── Service Worker registration ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js');
}

document.addEventListener("DOMContentLoaded", function () {

    // ── CSRF helper ─────────────────────────────────────────────────────────
    var csrfToken = (document.querySelector('meta[name="csrf-token"]') || {}).getAttribute
        ? document.querySelector('meta[name="csrf-token"]').getAttribute("content") || ""
        : "";

    window.fetchWithCsrf = function (url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers["X-CSRFToken"] = csrfToken;
        if (options.body && typeof options.body === "string" && !options.headers["Content-Type"]) {
            options.headers["Content-Type"] = "application/json";
        }
        return fetch(url, options);
    };

    // ── Single-line textareas (prevent newlines, strip on paste) ─────────────
    document.addEventListener("keydown", function (e) {
        if (e.target.tagName === "TEXTAREA" && e.target.rows === 1 && e.key === "Enter") {
            e.preventDefault();
        }
    });
    document.addEventListener("paste", function (e) {
        if (e.target.tagName === "TEXTAREA" && e.target.rows === 1) {
            e.preventDefault();
            var text = (e.clipboardData || window.clipboardData).getData("text").replace(/[\r\n]+/g, " ");
            document.execCommand("insertText", false, text);
        }
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    window.handleFetchError = function (err) {
        console.error("Request failed:", err);
    };

    window.normalizeText = function (str) {
        if (!str) return "";
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    };

    window.showToast = function (message, undoFn, duration) {
        var existing = document.querySelector(".toast");
        if (existing) existing.remove();
        var toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = '<span>' + message + '</span>';
        if (undoFn) {
            var btn = document.createElement("button");
            btn.className = "toast-btn";
            btn.textContent = "Undo";
            btn.addEventListener("click", function () { toast.remove(); undoFn(); });
            toast.appendChild(btn);
        }
        document.body.appendChild(toast);
        setTimeout(function () { if (toast.parentNode) toast.remove(); }, duration || 5000);
    };

    window.formatDate = function (isoStr) {
        if (!isoStr) return "—";
        var d = new Date(isoStr);
        if (isNaN(d)) return isoStr;
        var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
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
                if (m !== menu) { m.classList.remove("open"); m.style.position = ""; m.style.top = ""; m.style.left = ""; m.style.right = ""; }
            });
            var isInTable = btn.closest(".table-scroll");
            if (isInTable && !menu.classList.contains("open")) {
                var rect = btn.getBoundingClientRect();
                menu.style.position = "fixed";
                menu.style.right = (window.innerWidth - rect.right) + "px";
                menu.style.left = "auto";
                // Show briefly offscreen to measure height
                menu.style.visibility = "hidden";
                menu.classList.add("open");
                var menuH = menu.offsetHeight;
                menu.classList.remove("open");
                menu.style.visibility = "";
                // Open upward if it would overflow the viewport bottom
                if (rect.bottom + 4 + menuH > window.innerHeight) {
                    menu.style.top = (rect.top - menuH - 4) + "px";
                } else {
                    menu.style.top = rect.bottom + 4 + "px";
                }
            } else if (menu.classList.contains("open")) {
                menu.style.position = "";
                menu.style.top = "";
                menu.style.left = "";
                menu.style.right = "";
            }
            menu.classList.toggle("open");
        });
    };

    document.querySelectorAll(".kebab-btn").forEach(window.attachKebabListener);

    // Close kebab menus on click outside
    document.addEventListener("click", function () {
        document.querySelectorAll(".kebab-menu.open").forEach(function (m) {
            m.classList.remove("open");
            m.style.position = "";
            m.style.top = "";
            m.style.left = "";
            m.style.right = "";
        });
    });

    // ── Collapsible sections ────────────────────────────────────────────────
    document.querySelectorAll(".collapsible-header").forEach(function (header) {
        header.addEventListener("click", function (e) {
            if (e.target.closest(".kebab-wrapper")) return;
            header.parentElement.classList.toggle("collapsed");
        });
    });

    // ── Blocked actions for is_me profile guest ─────────────────────────────
    document.addEventListener("click", function (e) {
        var btn = e.target.closest(".is-me-blocked");
        if (btn) { alert(btn.dataset.msg); }
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
    var cachedGuestList = null;

    function fetchGuestListForAutocomplete() {
        if (cachedGuestList) return Promise.resolve(cachedGuestList);
        return window.fetchWithCsrf("/api/v1/friends?show_archived=0&page=1")
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                cachedGuestList = resp.data.items || [];
                // Fetch remaining pages if any
                if (resp.data.pages > 1) {
                    var promises = [];
                    for (var p = 2; p <= resp.data.pages; p++) {
                        promises.push(
                            window.fetchWithCsrf("/api/v1/friends?show_archived=0&page=" + p)
                                .then(function (r2) { return r2.json(); })
                        );
                    }
                    return Promise.all(promises).then(function (results) {
                        results.forEach(function (r) {
                            cachedGuestList = cachedGuestList.concat(r.data.items || []);
                        });
                        return cachedGuestList;
                    });
                }
                return cachedGuestList;
            });
    }

    function showAgSuggestions(input, suggestionsDiv, tr) {
        var q = window.normalizeText(input.value);
        suggestionsDiv.innerHTML = "";
        if (!q || !cachedGuestList) { suggestionsDiv.style.display = "none"; return; }

        var matches = cachedGuestList.filter(function (g) {
            var full = window.normalizeText(g.first_name + " " + (g.last_name || ""));
            return full.indexOf(q) !== -1;
        }).slice(0, 8);

        if (matches.length === 0) { suggestionsDiv.style.display = "none"; return; }

        matches.forEach(function (g, idx) {
            var div = document.createElement("div");
            div.className = "ag-suggestion";
            div.setAttribute("data-index", idx);
            div.innerHTML = '<span>' + window.escapeHtml(g.first_name + " " + (g.last_name || "")).trim() +
                '</span><span class="ag-suggestion-gender">' + window.escapeHtml(g.gender) + '</span>';
            div.addEventListener("mousedown", function (e) {
                e.preventDefault();
                selectGuestSuggestion(tr, g);
                suggestionsDiv.style.display = "none";
            });
            suggestionsDiv.appendChild(div);
        });
        var rect = input.getBoundingClientRect();
        suggestionsDiv.style.top = rect.bottom + "px";
        suggestionsDiv.style.left = rect.left + "px";
        suggestionsDiv.style.width = rect.width + "px";
        suggestionsDiv.style.display = "block";
    }

    function showAgTooltip(td) {
        var existing = td.querySelector(".ag-tooltip");
        if (existing) existing.remove();
        var tip = document.createElement("span");
        tip.className = "ag-tooltip";
        tip.textContent = "Already in your guest database";
        td.style.position = "relative";
        td.appendChild(tip);
        setTimeout(function () { if (tip.parentNode) tip.remove(); }, 2000);
    }

    function selectGuestSuggestion(tr, guest) {
        var firstInput = tr.querySelector(".ag-first-name");
        var lastInput = tr.querySelector(".ag-last-name");
        var genderSelect = tr.querySelector(".ag-gender");
        firstInput.value = guest.first_name;
        lastInput.value = guest.last_name || "";
        genderSelect.value = guest.gender;
        tr.setAttribute("data-guest-id", guest.id);
        lastInput.disabled = true;
        genderSelect.disabled = true;
        // Auto-advance to next row
        var newRow = createBlankGuestRow();
        addGuestTbody.appendChild(newRow);
        newRow.querySelector(".ag-first-name").focus();
    }

    function unlinkGuestRow(tr) {
        tr.removeAttribute("data-guest-id");
        var lastInput = tr.querySelector(".ag-last-name");
        var genderSelect = tr.querySelector(".ag-gender");
        lastInput.disabled = false;
        genderSelect.disabled = false;
    }

    function createBlankGuestRow() {
        var tr = document.createElement("tr");
        tr.innerHTML =
            '<td><div class="ag-first-name-wrapper"><textarea class="ag-first-name" placeholder="First name" rows="1"></textarea><div class="ag-suggestions" style="display:none"></div></div></td>' +
            '<td><textarea class="ag-last-name" placeholder="Last name" rows="1"></textarea></td>' +
            '<td><select class="ag-gender"><option value="Male">Male</option><option value="Female">Female</option></select></td>' +
            '<td><button type="button" class="add-guest-remove-btn">&times;</button></td>';

        var firstInput = tr.querySelector(".ag-first-name");
        var lastInput = tr.querySelector(".ag-last-name");
        var suggestionsDiv = tr.querySelector(".ag-suggestions");
        var activeIdx = -1;

        firstInput.addEventListener("input", function () {
            // If row was linked, unlink on manual edit
            if (tr.hasAttribute("data-guest-id")) unlinkGuestRow(tr);
            activeIdx = -1;
            showAgSuggestions(firstInput, suggestionsDiv, tr);
        });

        firstInput.addEventListener("blur", function () {
            // Small delay to allow mousedown on suggestion
            setTimeout(function () { suggestionsDiv.style.display = "none"; }, 150);
        });

        firstInput.addEventListener("keydown", function (e) {
            var items = suggestionsDiv.querySelectorAll(".ag-suggestion");
            if (suggestionsDiv.style.display === "block" && items.length > 0) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    activeIdx = Math.min(activeIdx + 1, items.length - 1);
                    items.forEach(function (it, i) { it.classList.toggle("active", i === activeIdx); });
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    activeIdx = Math.max(activeIdx - 1, 0);
                    items.forEach(function (it, i) { it.classList.toggle("active", i === activeIdx); });
                    return;
                }
                if (e.key === "Enter" && activeIdx >= 0) {
                    e.preventDefault();
                    items[activeIdx].dispatchEvent(new MouseEvent("mousedown"));
                    return;
                }
            }
            if (e.key === "Escape") {
                suggestionsDiv.style.display = "none";
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                var firstName = firstInput.value.trim();
                if (firstName) {
                    var newRow = createBlankGuestRow();
                    addGuestTbody.appendChild(newRow);
                    newRow.querySelector(".ag-first-name").focus();
                }
            }
        });

        tr.querySelector(".ag-last-name").addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var firstName = firstInput.value.trim();
                if (firstName) {
                    var newRow = createBlankGuestRow();
                    addGuestTbody.appendChild(newRow);
                    newRow.querySelector(".ag-first-name").focus();
                }
            }
        });

        tr.querySelector(".ag-gender").addEventListener("change", function () {
            var firstName = firstInput.value.trim();
            if (firstName && !tr.nextElementSibling) {
                var newRow = createBlankGuestRow();
                addGuestTbody.appendChild(newRow);
                newRow.querySelector(".ag-first-name").focus();
            }
        });

        // Show tooltip when clicking disabled fields (linked guest)
        var lastNameTd = tr.querySelector(".ag-last-name").parentElement;
        var genderTd = tr.querySelector(".ag-gender").parentElement;
        lastNameTd.addEventListener("click", function () {
            if (tr.hasAttribute("data-guest-id")) showAgTooltip(lastNameTd);
        });
        genderTd.addEventListener("click", function () {
            if (tr.hasAttribute("data-guest-id")) showAgTooltip(genderTd);
        });

        tr.querySelector(".add-guest-remove-btn").addEventListener("click", function () {
            tr.remove();
            if (addGuestTbody.querySelectorAll("tr").length === 0) {
                addGuestTbody.appendChild(createBlankGuestRow());
            }
        });

        return tr;
    }

    window.openAddGuestModal = function () {
        addGuestTbody.innerHTML = "";
        cachedGuestList = null;
        addGuestTbody.appendChild(createBlankGuestRow());
        addGuestOverlay.style.display = "flex";
        addGuestTbody.querySelector(".ag-first-name").focus();
        fetchGuestListForAutocomplete();
    };

    // Event page trigger (direct button)
    var newInviteBtn = document.getElementById("new-invite-btn");
    if (newInviteBtn && addGuestOverlay) {
        newInviteBtn.addEventListener("click", function () {
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
            var existingIds = [];
            var newGuests = [];
            addGuestTbody.querySelectorAll("tr").forEach(function (row) {
                var firstName = row.querySelector(".ag-first-name").value.trim();
                if (!firstName) return;
                var guestId = row.getAttribute("data-guest-id");
                if (guestId) {
                    existingIds.push(parseInt(guestId));
                } else {
                    newGuests.push({
                        first_name: firstName,
                        last_name: row.querySelector(".ag-last-name").value.trim(),
                        gender: row.querySelector(".ag-gender").value,
                        notes: ""
                    });
                }
            });

            if (existingIds.length === 0 && newGuests.length === 0) {
                addGuestOverlay.style.display = "none";
                return;
            }

            var invTable = document.getElementById("invitations-table");
            var eventId = invTable ? invTable.getAttribute("data-event-id") : null;

            if (eventId) {
                // Event page: add existing guests + create new guests as invitations
                var promises = [];
                if (existingIds.length > 0) {
                    promises.push(
                        window.fetchWithCsrf("/api/v1/events/" + eventId + "/invitations/bulk", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ guest_ids: existingIds })
                        }).then(function (r) { return r.json(); })
                    );
                }
                if (newGuests.length > 0) {
                    promises.push(
                        window.fetchWithCsrf("/api/v1/events/" + eventId + "/invitations/bulk-create", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ guests: newGuests })
                        }).then(function (r) { return r.json(); })
                    );
                }
                Promise.all(promises)
                    .then(function (results) {
                        var tbody = document.querySelector("#invitations-table tbody");
                        results.forEach(function (resp) {
                            resp.data.forEach(function (g) {
                                var tr = window.buildInvitationRow(g);
                                tbody.appendChild(tr);
                            });
                        });
                        window.refreshSummary();
                        addGuestOverlay.style.display = "none";
                    })
                    .catch(window.handleFetchError);
            } else {
                // Guest DB page: create new guests only (existing ones already in DB)
                if (newGuests.length === 0) {
                    addGuestOverlay.style.display = "none";
                    return;
                }
                window.fetchWithCsrf("/api/v1/friends/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guests: newGuests })
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
