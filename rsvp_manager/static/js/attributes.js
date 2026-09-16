// Event attributes: manage the definitions for one event.
//
// An attribute is a question asked about each guest of this event ("Hunting"),
// with a fixed list of answers ("Hunter", "Follower"). Guests are assigned an
// answer from the guest list; this file only deals with defining them.
document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("attributes-overlay");
    if (!overlay) return;

    var table = document.getElementById("invitations-table");
    var eventId = table ? table.getAttribute("data-event-id") : null;
    if (!eventId) return;

    var list = document.getElementById("attributes-list");
    var nameInput = document.getElementById("attr-new-name");
    var optionsInput = document.getElementById("attr-new-options");

    function api(path, options) {
        return window.fetchWithCsrf("/api/v1/events/" + eventId + path, options)
            .then(function (res) {
                if (res.status === 204) return null;
                return res.json().then(function (body) {
                    if (!res.ok) throw new Error((body && body.message) || "Request failed");
                    return body;
                });
            });
    }

    function lines(text) {
        return (text || "").split("\n").map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length; });
    }

    function render(attributes) {
        list.innerHTML = "";
        if (!attributes.length) {
            var empty = document.createElement("p");
            empty.className = "attr-empty";
            empty.textContent = "No attributes yet.";
            list.appendChild(empty);
            return;
        }
        attributes.forEach(function (attr) {
            var card = document.createElement("div");
            card.className = "attr-card";
            card.setAttribute("data-attr-id", attr.id);

            var head = document.createElement("div");
            head.className = "attr-card-head";

            var name = document.createElement("input");
            name.type = "text";
            name.className = "attr-name-input";
            name.value = attr.name;
            name.maxLength = 60;
            name.setAttribute("aria-label", "Attribute name");
            head.appendChild(name);

            var del = document.createElement("button");
            del.type = "button";
            del.className = "btn btn-small btn-danger attr-delete";
            del.textContent = "Remove";
            head.appendChild(del);
            card.appendChild(head);

            var opts = document.createElement("div");
            opts.className = "attr-options";
            attr.options.forEach(function (o) {
                var chip = document.createElement("input");
                chip.type = "text";
                chip.className = "attr-option-input";
                chip.value = o.label;
                chip.maxLength = 60;
                chip.setAttribute("data-option-id", o.id);
                chip.setAttribute("aria-label", "Answer");
                opts.appendChild(chip);
            });
            var add = document.createElement("input");
            add.type = "text";
            add.className = "attr-option-input attr-option-new";
            add.placeholder = "+ answer";
            add.maxLength = 60;
            add.setAttribute("aria-label", "New answer");
            opts.appendChild(add);
            card.appendChild(opts);

            list.appendChild(card);
        });
    }

    function load() {
        return api("/attributes").then(function (body) {
            render(body.data);
            return body.data;
        }).catch(window.handleFetchError);
    }

    // Renaming the attribute, and renaming an existing answer, both save on blur.
    // Renaming an answer keeps the guests already set to it.
    list.addEventListener("change", function (e) {
        var card = e.target.closest(".attr-card");
        if (!card) return;
        var attrId = card.getAttribute("data-attr-id");

        if (e.target.classList.contains("attr-name-input")) {
            var newName = e.target.value.trim();
            if (!newName) { load(); return; }
            api("/attributes/" + attrId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName })
            }).then(function () { window.showToast("Attribute renamed"); })
              .catch(function (err) { window.showToast(err.message); load(); });
            return;
        }

        if (e.target.classList.contains("attr-option-new")) {
            var label = e.target.value.trim();
            if (!label) return;
            var existing = [].slice.call(card.querySelectorAll(".attr-option-input:not(.attr-option-new)"))
                .map(function (i) { return i.value.trim(); }).filter(Boolean);
            existing.push(label);
            api("/attributes/" + attrId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ options: existing })
            }).then(function () { load(); window.showToast("Answer added"); })
              .catch(function (err) { window.showToast(err.message); load(); });
            return;
        }

        if (e.target.classList.contains("attr-option-input")) {
            var optionId = e.target.getAttribute("data-option-id");
            var newLabel = e.target.value.trim();
            if (!newLabel) { load(); return; }
            api("/attributes/" + attrId + "/options/" + optionId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newLabel })
            }).then(function () { window.showToast("Answer renamed"); })
              .catch(function (err) { window.showToast(err.message); load(); });
        }
    });

    list.addEventListener("click", function (e) {
        var del = e.target.closest(".attr-delete");
        if (!del) return;
        var card = del.closest(".attr-card");
        var attrId = card.getAttribute("data-attr-id");
        var name = card.querySelector(".attr-name-input").value;
        if (!confirm("Remove \"" + name + "\"? Every guest's answer for it will be lost.")) return;
        api("/attributes/" + attrId, { method: "DELETE" })
            .then(function () { load(); window.showToast("Attribute removed"); })
            .catch(function (err) { window.showToast(err.message); });
    });

    var addBtn = document.getElementById("attr-add-btn");
    if (addBtn) {
        addBtn.addEventListener("click", function () {
            var name = nameInput.value.trim();
            var options = lines(optionsInput.value);
            if (!name) { window.showToast("Give the attribute a name"); return; }
            if (!options.length) { window.showToast("Add at least one answer"); return; }
            api("/attributes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name, options: options })
            }).then(function () {
                nameInput.value = "";
                optionsInput.value = "";
                load();
                window.showToast("Attribute added");
            }).catch(function (err) { window.showToast(err.message); });
        });
    }

    var openBtn = document.getElementById("open-attributes-btn");
    if (openBtn) {
        openBtn.addEventListener("click", function () {
            var menu = openBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
            overlay.style.display = "flex";
            load();
        });
    }

    function close() {
        overlay.style.display = "none";
        // The guest list shows a column per attribute, so pick up any changes.
        if (window.reloadAttributeColumns) window.reloadAttributeColumns();
    }

    var closeBtn = document.getElementById("attributes-close");
    if (closeBtn) closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && overlay.style.display === "flex") close();
    });
});

// ── Assigning answers on the guest list ─────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
    var table = document.getElementById("invitations-table");
    if (!table) return;
    var eventId = table.getAttribute("data-event-id");

    // One guest's answer, saved as soon as the select changes.
    table.addEventListener("change", function (e) {
        var select = e.target.closest(".attr-select");
        if (!select) return;
        var invId = select.getAttribute("data-inv-id");
        var attrId = select.getAttribute("data-attr-id");
        var optionId = select.value ? parseInt(select.value, 10) : null;

        window.fetchWithCsrf("/api/v1/invitations/" + invId + "/attributes/" + attrId, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ option_id: optionId })
        })
        .then(function (res) { return res.json(); })
        .then(function (resp) {
            if (resp.status !== "success") throw new Error(resp.message || "Could not save");
            var row = select.closest("tr");
            if (row) row.setAttribute("data-attr-" + attrId, optionId ? String(optionId) : "none");
            if (window.refreshAttributeSummary) window.refreshAttributeSummary();
        })
        .catch(window.handleFetchError);
    });

    // Bulk assign, routed from the existing batch bar. Values look like
    // "attr:<attributeId>:<optionId>", with an empty option meaning "clear".
    window.applyAttributeBatchAction = function (action, rows) {
        var parts = action.split(":");
        if (parts[0] !== "attr") return null;
        var attrId = parts[1];
        var optionId = parts[2] ? parseInt(parts[2], 10) : null;
        var invIds = rows.map(function (r) { return parseInt(r.getAttribute("data-inv-id"), 10); });

        return window.fetchWithCsrf(
            "/api/v1/events/" + eventId + "/attributes/" + attrId + "/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ invitation_ids: invIds, option_id: optionId })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var changed = (resp.data && resp.data.changed_ids) || [];
                // Reflect it in the rows without a reload.
                rows.forEach(function (row) {
                    var select = row.querySelector('.attr-select[data-attr-id="' + attrId + '"]');
                    if (select) select.value = optionId ? String(optionId) : "";
                    row.setAttribute("data-attr-" + attrId, optionId ? String(optionId) : "none");
                });
                if (window.refreshAttributeSummary) window.refreshAttributeSummary();
                window.showToast(changed.length + " guest" + (changed.length === 1 ? "" : "s") + " updated");
            })
            .catch(window.handleFetchError);
    };
});

// ── Summary: tap a row to filter the guest list ─────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
    var table = document.getElementById("invitations-table");
    if (!table) return;
    var eventId = table.getAttribute("data-event-id");

    document.querySelectorAll(".attr-summary-row").forEach(function (row) {
        row.addEventListener("click", function () {
            var attrId = row.getAttribute("data-attr-id");
            var optionId = row.getAttribute("data-option-id");
            var select = document.getElementById("gl-attr-filter-" + attrId);
            if (!select) return;

            // Tapping the row already showing is a toggle back to everyone.
            var next = (select.value === optionId) ? "" : optionId;
            select.value = next;
            select.dispatchEvent(new Event("change", { bubbles: true }));

            document.querySelectorAll('.attr-summary-row[data-attr-id="' + attrId + '"]')
                .forEach(function (r) { r.classList.remove("attr-summary-row-active"); });
            if (next) row.classList.add("attr-summary-row-active");

            var filters = document.getElementById("gl-filters");
            if (filters && next && filters.style.display === "none") filters.style.display = "";
            var list = document.getElementById("invitations-table");
            if (list && next) list.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });

    // Counts change as answers are set, so pull fresh numbers rather than
    // leaving a stale summary on screen.
    window.refreshAttributeSummary = function () {
        return window.fetchWithCsrf("/api/v1/events/" + eventId + "/attributes/summary")
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                (resp.data || []).forEach(function (summary) {
                    var t = document.querySelector(
                        '.attr-summary-table[data-attr-id="' + summary.attribute.id + '"]');
                    if (!t) return;
                    summary.rows.forEach(function (row) {
                        var key = row.option_id === null ? "none" : String(row.option_id);
                        var tr = t.querySelector('.attr-summary-row[data-option-id="' + key + '"]');
                        if (!tr) return;
                        var cells = tr.querySelectorAll("td");
                        cells[1].textContent = row.attending;
                        cells[2].textContent = row.pending;
                        cells[3].textContent = row.declined;
                        cells[4].textContent = row.invited;
                    });
                    var total = t.querySelector(".total-row");
                    if (total) {
                        var tc = total.querySelectorAll("td");
                        tc[1].innerHTML = "<strong>" + summary.totals.attending + "</strong>";
                        tc[2].innerHTML = "<strong>" + summary.totals.pending + "</strong>";
                        tc[3].innerHTML = "<strong>" + summary.totals.declined + "</strong>";
                        tc[4].innerHTML = "<strong>" + summary.totals.invited + "</strong>";
                    }
                });
            })
            .catch(function () { /* a stale summary is not worth a visible error */ });
    };
});
