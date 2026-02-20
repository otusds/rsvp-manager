document.addEventListener("DOMContentLoaded", function () {

    // ── Table search ─────────────────────────────────────────────────────────
    document.querySelectorAll(".search-input[data-table]").forEach(function (input) {
        var tableId = input.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        input.addEventListener("input", function () { window.filterTable(table); });
        input.addEventListener("search", function () { window.filterTable(table); });
    });

    // ── Table filter dropdowns ───────────────────────────────────────────────
    document.querySelectorAll(".filter-select[data-table]").forEach(function (select) {
        var tableId = select.getAttribute("data-table");
        var table = document.getElementById(tableId);
        if (!table) return;
        select.addEventListener("change", function () { window.filterTable(table); });
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
            if (sortKey === lastSortKey) {
                sortDir = sortDir === "asc" ? "desc" : "asc";
            } else {
                sortDir = "asc";
                lastSortKey = sortKey;
            }
            var dir = sortDir;
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

    // ── filterTable (shared) ─────────────────────────────────────────────────

    window.filterTable = function (table) {
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
    };

    // ── Table sort (header click) ────────────────────────────────────────────
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

});
