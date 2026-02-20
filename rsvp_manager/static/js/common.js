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
