document.addEventListener("DOMContentLoaded", function () {

    // ── Friends table search, filter & sort ──────────────────────────────────
    var guestsTable = document.getElementById("guests-table");
    if (!guestsTable) return;

    var guestSearchInput = document.getElementById("guest-search");
    var guestGenderFilter = document.getElementById("guest-gender-filter");
    var guestSortSelect = document.getElementById("guest-sort");
    var guestNoResults = document.getElementById("no-results");
    var isMobile = window.matchMedia("(max-width: 600px)").matches;

    // ── Tags state ──────────────────────────────────────────────────────────
    var allUserTags = [];
    var currentGuestTags = [];
    var tagFilterToggle = document.getElementById("tag-filter-toggle");
    var tagFilterDropdown = document.getElementById("tag-filter-dropdown");
    var selectedTagIds = [];

    // Load all user tags
    window.fetchWithCsrf("/api/v1/tags")
        .then(function (res) { return res.json(); })
        .then(function (resp) {
            allUserTags = resp.data || [];
            buildTagFilterDropdown();
        })
        .catch(function () { /* ignore */ });

    function buildTagFilterDropdown() {
        if (!tagFilterDropdown) return;
        tagFilterDropdown.innerHTML = "";
        allUserTags.forEach(function (tag) {
            var option = document.createElement("label");
            option.className = "tag-filter-option";
            option.innerHTML =
                '<input type="checkbox" value="' + tag.id + '">' +
                '<span class="tag-badge" style="background:' + tag.color + '">' + window.escapeHtml(tag.name) + '</span>';
            option.querySelector("input").addEventListener("change", function () {
                selectedTagIds = [];
                tagFilterDropdown.querySelectorAll("input:checked").forEach(function (cb) {
                    selectedTagIds.push(parseInt(cb.value));
                });
                tagFilterToggle.textContent = selectedTagIds.length > 0
                    ? selectedTagIds.length + " Tag" + (selectedTagIds.length > 1 ? "s" : "") + ""
                    : "All Tags";
                applyGuestTableControls();
            });
            tagFilterDropdown.appendChild(option);
        });
    }

    if (tagFilterToggle && tagFilterDropdown) {
        tagFilterToggle.addEventListener("click", function (e) {
            e.stopPropagation();
            var showing = tagFilterDropdown.style.display !== "none";
            tagFilterDropdown.style.display = showing ? "none" : "block";
        });
        document.addEventListener("click", function (e) {
            if (!tagFilterDropdown.contains(e.target) && e.target !== tagFilterToggle) {
                tagFilterDropdown.style.display = "none";
            }
        });
    }

    function sortGuestRows() {
        var tbody = guestsTable.querySelector("tbody");
        var rows = Array.from(tbody.querySelectorAll("tr"));
        var sortVal = guestSortSelect ? guestSortSelect.value : "created-desc";
        var parts = sortVal.split("-");
        var key = parts[0], dir = parts[1];

        rows.sort(function (a, b) {
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
        var query = guestSearchInput ? window.normalizeText(guestSearchInput.value) : "";
        var genderVal = guestGenderFilter ? guestGenderFilter.value : "";
        var rows = guestsTable.querySelectorAll("tbody tr");
        var visibleCount = 0;
        rows.forEach(function (row) {
            var text = window.normalizeText(row.textContent);
            var gender = row.getAttribute("data-gender");
            var matchSearch = !query || text.indexOf(query) !== -1;
            var matchGender = !genderVal || gender === genderVal;
            var matchTags = true;
            if (selectedTagIds.length > 0) {
                var rowTags = (row.getAttribute("data-tags") || "").split(",").filter(Boolean).map(Number);
                matchTags = selectedTagIds.some(function (id) { return rowTags.indexOf(id) !== -1; });
            }
            var show = matchSearch && matchGender && matchTags;
            row.style.display = show ? "" : "none";
            if (show) visibleCount++;
        });
        if (guestNoResults) guestNoResults.style.display = visibleCount === 0 ? "" : "none";
        var guestCountEl = document.getElementById("guest-count");
        if (guestCountEl) {
            var dbTotal = parseInt(guestsTable.getAttribute("data-total")) || 0;
            var totalRows = guestsTable.querySelectorAll("tbody tr").length;
            var displayTotal = Math.max(dbTotal, totalRows);
            var isFiltering = query || genderVal || selectedTagIds.length > 0;
            if (isFiltering) {
                guestCountEl.textContent = "(" + visibleCount + "/" + displayTotal + ")";
            } else {
                guestCountEl.textContent = "(" + displayTotal + ")";
            }
        }
    }

    if (guestSearchInput) {
        guestSearchInput.addEventListener("input", applyGuestTableControls);
        guestSearchInput.addEventListener("search", applyGuestTableControls);
    }
    if (guestGenderFilter) guestGenderFilter.addEventListener("change", applyGuestTableControls);
    if (guestSortSelect) guestSortSelect.addEventListener("change", applyGuestTableControls);

    // ── Clear filters ─────────────────────────────────────────────────────
    var guestClearBtn = document.getElementById("guest-clear-filters");
    if (guestClearBtn) {
        guestClearBtn.addEventListener("click", function () {
            if (guestSearchInput) guestSearchInput.value = "";
            if (guestGenderFilter) guestGenderFilter.selectedIndex = 0;
            if (guestSortSelect) guestSortSelect.selectedIndex = 0;
            if (tagFilterToggle) tagFilterToggle.textContent = "All Tags";
            selectedTagIds = [];
            if (tagFilterDropdown) {
                tagFilterDropdown.querySelectorAll("input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
            }
            applyGuestTableControls();
        });
    }

    // Initial sort on page load
    applyGuestTableControls();

    // ── Archive filter (server-side reload) ───────────────────────────────
    var showArchived = guestsTable.getAttribute("data-show-archived") || "0";
    var guestArchiveFilter = document.getElementById("guest-archive-filter");
    if (guestArchiveFilter) {
        guestArchiveFilter.addEventListener("change", function () {
            var val = guestArchiveFilter.value;
            if (val !== showArchived) {
                var url = window.location.pathname;
                if (val !== "0") url += "?show_archived=" + val;
                window.location.href = url;
            }
        });
    }

    // ── Inline editing helpers ────────────────────────────────────────────

    function updateGenderTagColor(select) {
        select.classList.remove("gender-m", "gender-f");
        if (select.value === "Male") select.classList.add("gender-m");
        else if (select.value === "Female") select.classList.add("gender-f");
    }

    function abbreviateGender(select) {
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

    // ── Initialize listeners on a guest row ───────────────────────────────

    function initGuestRow(row) {
        // Kebab menu
        var kebabBtn = row.querySelector(".kebab-btn");
        if (kebabBtn) window.attachKebabListener(kebabBtn);

        // Name editing
        if (isMobile) {
            row.querySelectorAll(".ge-first, .ge-last").forEach(function (input) {
                input.setAttribute("readonly", "");
                input.setAttribute("tabindex", "-1");
            });
        } else {
            row.querySelectorAll(".ge-first, .ge-last").forEach(function (input) {
                input.addEventListener("blur", function () {
                    var guestId = input.getAttribute("data-guest-id");
                    var firstName = row.querySelector(".ge-first").value.trim();
                    var lastName = row.querySelector(".ge-last").value.trim();
                    if (!firstName) return;
                    row.setAttribute("data-first", firstName.toLowerCase());
                    row.setAttribute("data-last", lastName.toLowerCase());
                    window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ first_name: firstName, last_name: lastName })
                    }).catch(window.handleFetchError);
                });
            });
        }

        // Gender editing
        var genderSelect = row.querySelector(".ge-gender");
        if (genderSelect) {
            if (isMobile && guestsTable && guestsTable.classList.contains("table-collapsed")) {
                abbreviateGender(genderSelect);
            } else {
                expandGender(genderSelect);
            }
            updateGenderTagColor(genderSelect);
            if (isMobile) {
                genderSelect.setAttribute("disabled", "");
            } else {
                genderSelect.addEventListener("focus", function () { expandGender(genderSelect); });
                genderSelect.addEventListener("blur", function () {
                    if (isMobile && guestsTable && guestsTable.classList.contains("table-collapsed")) {
                        abbreviateGender(genderSelect);
                    }
                });
                genderSelect.addEventListener("change", function () {
                    updateGenderTagColor(genderSelect);
                    var guestId = genderSelect.getAttribute("data-guest-id");
                    row.setAttribute("data-gender", genderSelect.value);
                    window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ gender: genderSelect.value })
                    }).catch(window.handleFetchError);
                });
            }
        }

        // Notes editing
        var notesInput = row.querySelector(".ge-notes");
        if (notesInput) {
            if (isMobile) {
                notesInput.setAttribute("readonly", "");
                notesInput.setAttribute("tabindex", "-1");
            } else {
                var timer;
                notesInput.addEventListener("input", function () {
                    clearTimeout(timer);
                    timer = setTimeout(function () {
                        var guestId = notesInput.getAttribute("data-guest-id");
                        window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notes: notesInput.value.trim() })
                        }).catch(window.handleFetchError);
                    }, 500);
                });
            }
        }

        // Guest detail button
        var detailBtn = row.querySelector(".ge-detail-btn");
        if (detailBtn) {
            detailBtn.addEventListener("click", function () {
                detailBtn.closest(".kebab-menu").classList.remove("open");
                openGuestDetail(detailBtn.getAttribute("data-guest-id"), row);
            });
        }

        // Archive/Unarchive button
        var archiveBtn = row.querySelector(".ge-archive-btn");
        if (archiveBtn) {
            archiveBtn.addEventListener("click", function () {
                var guestId = archiveBtn.getAttribute("data-guest-id");
                var isArchived = row.getAttribute("data-is-archived") === "true";
                archiveBtn.closest(".kebab-menu").classList.remove("open");
                window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_archived: !isArchived })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    if (!isArchived) {
                        // Archiving: remove row if not showing archived
                        if (!showArchived) {
                            row.remove();
                        } else {
                            row.setAttribute("data-is-archived", "true");
                            row.classList.add("archived-row");
                            archiveBtn.textContent = "Unarchive";
                        }
                    } else {
                        // Unarchiving
                        row.setAttribute("data-is-archived", "false");
                        row.classList.remove("archived-row");
                        archiveBtn.textContent = "Archive";
                    }
                })
                .catch(window.handleFetchError);
            });
        }

    }

    // Set collapsed state before initializing rows so gender abbreviation works
    if (isMobile) guestsTable.classList.add("table-collapsed");

    // Initialize all existing rows
    guestsTable.querySelectorAll("tbody tr").forEach(initGuestRow);

    // ── Infinite scroll ──────────────────────────────────────────────────

    var currentPage = parseInt(guestsTable.getAttribute("data-page")) || 1;
    var totalPages = parseInt(guestsTable.getAttribute("data-pages")) || 1;
    var scrollLoader = document.getElementById("scroll-loader");
    var isLoading = false;

    function loadMoreGuests() {
        if (isLoading || currentPage >= totalPages) return;
        isLoading = true;
        currentPage++;
        scrollLoader.style.display = "flex";

        var scrollUrl = "/friends?page=" + currentPage + "&partial=1";
        if (showArchived !== "0") scrollUrl += "&show_archived=" + showArchived;
        window.fetchWithCsrf(scrollUrl)
            .then(function (res) { return res.text(); })
            .then(function (html) {
                if (!html.trim()) {
                    totalPages = currentPage - 1;
                    scrollLoader.style.display = "none";
                    isLoading = false;
                    return;
                }
                var tbody = guestsTable.querySelector("tbody");
                var temp = document.createElement("tbody");
                temp.innerHTML = html;
                var newRows = Array.from(temp.querySelectorAll("tr"));
                var multiVisible = document.querySelector(".col-multiselect") &&
                    document.querySelector(".col-multiselect").style.display !== "none";
                newRows.forEach(function (row) {
                    tbody.appendChild(row);
                    initGuestRow(row);
                    var cb = row.querySelector(".row-select");
                    if (cb) {
                        attachRowSelectListener(cb);
                        if (multiVisible) cb.closest("td").style.display = "table-cell";
                    }
                });
                scrollLoader.style.display = "none";
                isLoading = false;
            })
            .catch(function (err) {
                window.handleFetchError(err);
                scrollLoader.style.display = "none";
                isLoading = false;
            });
    }

    if (totalPages > 1) {
        window.addEventListener("scroll", function () {
            if (isLoading || currentPage >= totalPages) return;
            var scrollBottom = window.innerHeight + window.scrollY;
            var docHeight = document.documentElement.scrollHeight;
            if (scrollBottom >= docHeight - 200) {
                loadMoreGuests();
            }
        });
    }

    // ── Multi-select & batch operations ──────────────────────────────────

    var guestSelectAll = document.getElementById("guest-select-all");
    var guestBatchBar = document.getElementById("guest-batch-bar");
    var guestBatchCount = document.getElementById("guest-batch-count");
    var guestBatchAction = document.getElementById("guest-batch-action");
    var guestBatchTagWrapper = document.getElementById("guest-batch-tag-wrapper");
    var guestBatchTagInput = document.getElementById("guest-batch-tag-input");
    var guestBatchTagSuggestions = document.getElementById("guest-batch-tag-suggestions");
    var guestBatchApply = document.getElementById("guest-batch-apply");
    var guestBatchClear = document.getElementById("guest-batch-clear");
    var batchSelectedTagName = "";

    function getSelectedGuestRows() {
        var rows = [];
        guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) {
            rows.push(cb.closest("tr"));
        });
        return rows;
    }

    function updateGuestBatchCount() {
        if (!guestBatchBar) return;
        var count = getSelectedGuestRows().length;
        guestBatchCount.textContent = count;
        guestBatchBar.style.display = count > 0 ? "flex" : "none";
        if (guestSelectAll) {
            var total = guestsTable.querySelectorAll("tbody tr .row-select").length;
            guestSelectAll.checked = count > 0 && count === total;
        }
    }

    function attachRowSelectListener(checkbox) {
        checkbox.addEventListener("change", updateGuestBatchCount);
    }

    // Attach to existing rows
    guestsTable.querySelectorAll("tbody tr .row-select").forEach(attachRowSelectListener);

    if (guestSelectAll) {
        guestSelectAll.addEventListener("change", function () {
            var checked = guestSelectAll.checked;
            guestsTable.querySelectorAll("tbody tr .row-select").forEach(function (cb) {
                cb.checked = checked;
            });
            updateGuestBatchCount();
        });
    }

    // Toggle multi-select from page menu
    var toggleGuestMultiBtn = document.getElementById("toggle-guest-multiselect-btn");
    if (toggleGuestMultiBtn) {
        toggleGuestMultiBtn.addEventListener("click", function () {
            var cols = document.querySelectorAll(".col-multiselect");
            var showing = cols.length > 0 && cols[0].style.display !== "none";
            cols.forEach(function (el) { el.style.display = showing ? "none" : "table-cell"; });
            if (showing) {
                // Deselect all when hiding
                guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) { cb.checked = false; });
                if (guestSelectAll) guestSelectAll.checked = false;
                updateGuestBatchCount();
            }
            var menu = toggleGuestMultiBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // ── Expand/collapse toggle ──────────────────────────────────────────────
    var toggleExpandBtn = document.getElementById("toggle-guest-expand-btn");
    var feExpandIcon = '<svg class="kebab-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    var feCollapseIcon = '<svg class="kebab-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
    if (toggleExpandBtn && guestsTable) {
        toggleExpandBtn.innerHTML = isMobile ? feExpandIcon + "Expand Columns" : feCollapseIcon + "Collapse Columns";
        toggleExpandBtn.addEventListener("click", function () {
            var isCollapsed = guestsTable.classList.toggle("table-collapsed");
            toggleExpandBtn.innerHTML = isCollapsed ? feExpandIcon + "Expand Columns" : feCollapseIcon + "Collapse Columns";
            guestsTable.querySelectorAll(".ge-gender").forEach(function (sel) {
                if (isMobile && isCollapsed) abbreviateGender(sel); else expandGender(sel);
            });
            var menu = toggleExpandBtn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    }

    // Show/hide tag autocomplete based on action
    if (guestBatchAction) {
        guestBatchAction.addEventListener("change", function () {
            if (guestBatchTagWrapper) {
                var val = guestBatchAction.value;
                var showTag = val === "add-tag" || val === "remove-tag";
                guestBatchTagWrapper.style.display = showTag ? "" : "none";
                if (showTag && guestBatchTagInput) {
                    guestBatchTagInput.placeholder = val === "remove-tag" ? "Search tag to remove..." : "Search or create tag...";
                    guestBatchTagInput.focus();
                }
                if (!showTag) {
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                }
            }
        });
    }

    // Collect tag IDs present on selected rows (for remove-tag filtering)
    function getSelectedRowsTagIds() {
        var tagIdSet = {};
        getSelectedGuestRows().forEach(function (row) {
            var rowTags = (row.getAttribute("data-tags") || "").split(",").filter(Boolean);
            rowTags.forEach(function (id) { tagIdSet[id] = true; });
        });
        return tagIdSet;
    }

    // Batch tag autocomplete
    function showBatchTagSuggestions(query) {
        if (!guestBatchTagSuggestions) return;
        guestBatchTagSuggestions.innerHTML = "";
        var q = query.toLowerCase().trim();
        var isRemove = guestBatchAction && guestBatchAction.value === "remove-tag";

        // For remove-tag, show all relevant tags when input is empty
        if (!q && !isRemove) { guestBatchTagSuggestions.style.display = "none"; batchSelectedTagName = ""; return; }

        var pool = allUserTags;
        if (isRemove) {
            var selectedTagIds = getSelectedRowsTagIds();
            pool = allUserTags.filter(function (t) { return selectedTagIds[t.id]; });
        }

        var matches = pool.filter(function (t) {
            return !q || t.name.toLowerCase().indexOf(q) !== -1;
        });

        matches.forEach(function (tag) {
            var div = document.createElement("div");
            div.className = "tag-suggestion";
            div.innerHTML = '<span class="tag-suggestion-color" style="background:' + tag.color + '"></span>' +
                window.escapeHtml(tag.name);
            div.addEventListener("click", function () {
                batchSelectedTagName = tag.name;
                guestBatchTagInput.value = tag.name;
                guestBatchTagSuggestions.style.display = "none";
            });
            guestBatchTagSuggestions.appendChild(div);
        });

        if (!isRemove) {
            var exactMatch = allUserTags.some(function (t) { return t.name.toLowerCase() === q; });
            if (!exactMatch && q) {
                var createDiv = document.createElement("div");
                createDiv.className = "tag-suggestion tag-suggestion-create";
                createDiv.textContent = '+ Create "' + query.trim() + '"';
                createDiv.addEventListener("click", function () {
                    batchSelectedTagName = query.trim();
                    guestBatchTagInput.value = query.trim();
                    guestBatchTagSuggestions.style.display = "none";
                });
                guestBatchTagSuggestions.appendChild(createDiv);
            }
        }

        guestBatchTagSuggestions.style.display = guestBatchTagSuggestions.children.length > 0 ? "block" : "none";
    }

    if (guestBatchTagInput) {
        guestBatchTagInput.addEventListener("input", function () {
            batchSelectedTagName = "";
            showBatchTagSuggestions(guestBatchTagInput.value);
        });
        guestBatchTagInput.addEventListener("focus", function () {
            if (guestBatchAction && guestBatchAction.value === "remove-tag") {
                showBatchTagSuggestions(guestBatchTagInput.value);
            }
        });
        guestBatchTagInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                var val = guestBatchTagInput.value.trim();
                if (!val) return;
                var match = allUserTags.find(function (t) { return t.name.toLowerCase() === val.toLowerCase(); });
                batchSelectedTagName = match ? match.name : val;
                guestBatchTagInput.value = batchSelectedTagName;
                guestBatchTagSuggestions.style.display = "none";
            }
        });
    }

    // Close batch tag suggestions on outside click
    document.addEventListener("click", function (e) {
        if (guestBatchTagSuggestions && !guestBatchTagSuggestions.contains(e.target) && e.target !== guestBatchTagInput) {
            guestBatchTagSuggestions.style.display = "none";
        }
    });

    // Apply batch action
    if (guestBatchApply) {
        guestBatchApply.addEventListener("click", function () {
            var action = guestBatchAction ? guestBatchAction.value : "";
            if (!action) return;
            var rows = getSelectedGuestRows();
            if (rows.length === 0) return;

            var ids = rows.map(function (row) { return parseInt(row.getAttribute("data-guest-id")); });

            if (action === "delete") {
                if (!confirm("Delete " + rows.length + " guest(s)? They will also be removed from all events.")) return;
                window.fetchWithCsrf("/api/v1/friends/bulk-delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    rows.forEach(function (row) { row.remove(); });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                })
                .catch(window.handleFetchError);
            } else if (action === "add-tag") {
                var tagName = batchSelectedTagName || (guestBatchTagInput ? guestBatchTagInput.value.trim() : "");
                if (!tagName) { if (guestBatchTagInput) guestBatchTagInput.focus(); return; }
                window.fetchWithCsrf("/api/v1/friends/bulk-tag", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids, tag_name: tagName })
                })
                .then(function (res) { return res.json(); })
                .then(function (resp) {
                    var updatedMap = {};
                    (resp.data || []).forEach(function (g) { updatedMap[g.id] = g.tags; });
                    rows.forEach(function (row) {
                        var gid = parseInt(row.getAttribute("data-guest-id"));
                        var tags = updatedMap[gid];
                        if (!tags) return;
                        var tagIds = tags.map(function (t) { return t.id; });
                        row.setAttribute("data-tags", tagIds.join(","));
                        var tagsCell = row.querySelector(".ge-tags-cell");
                        if (tagsCell) {
                            tagsCell.innerHTML = "";
                            tags.forEach(function (t) {
                                var badge = document.createElement("span");
                                badge.className = "tag-badge";
                                badge.style.background = t.color;
                                badge.textContent = t.name;
                                tagsCell.appendChild(badge);
                                tagsCell.appendChild(document.createTextNode(" "));
                            });
                        }
                        var cb = row.querySelector(".row-select");
                        if (cb) cb.checked = false;
                    });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                    // Refresh tags list
                    window.fetchWithCsrf("/api/v1/tags")
                        .then(function (res) { return res.json(); })
                        .then(function (resp) {
                            allUserTags = resp.data || [];
                            buildTagFilterDropdown();
                        })
                        .catch(function () {});
                })
                .catch(window.handleFetchError);
            } else if (action === "remove-tag") {
                var tagName = batchSelectedTagName || (guestBatchTagInput ? guestBatchTagInput.value.trim() : "");
                if (!tagName) { if (guestBatchTagInput) guestBatchTagInput.focus(); return; }
                window.fetchWithCsrf("/api/v1/friends/bulk-untag", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids, tag_name: tagName })
                })
                .then(function (res) { return res.json(); })
                .then(function (resp) {
                    var updatedMap = {};
                    (resp.data || []).forEach(function (g) { updatedMap[g.id] = g.tags; });
                    rows.forEach(function (row) {
                        var gid = parseInt(row.getAttribute("data-guest-id"));
                        var tags = updatedMap[gid];
                        if (!tags) return;
                        var tagIds = tags.map(function (t) { return t.id; });
                        row.setAttribute("data-tags", tagIds.join(","));
                        var tagsCell = row.querySelector(".ge-tags-cell");
                        if (tagsCell) {
                            tagsCell.innerHTML = "";
                            tags.forEach(function (t) {
                                var badge = document.createElement("span");
                                badge.className = "tag-badge";
                                badge.style.background = t.color;
                                badge.textContent = t.name;
                                tagsCell.appendChild(badge);
                                tagsCell.appendChild(document.createTextNode(" "));
                            });
                        }
                        var cb = row.querySelector(".row-select");
                        if (cb) cb.checked = false;
                    });
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                    batchSelectedTagName = "";
                    if (guestBatchTagInput) guestBatchTagInput.value = "";
                    if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
                    if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
                })
                .catch(window.handleFetchError);
            } else if (action === "archive") {
                if (!confirm("Archive " + rows.length + " guest(s)? They will be hidden from the guest list but remain in existing events.")) return;
                window.fetchWithCsrf("/api/v1/friends/bulk-archive", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ guest_ids: ids })
                })
                .then(function (res) { return res.json(); })
                .then(function () {
                    if (!showArchived) {
                        rows.forEach(function (row) { row.remove(); });
                    } else {
                        rows.forEach(function (row) {
                            row.setAttribute("data-is-archived", "true");
                            row.classList.add("archived-row");
                            var archBtn = row.querySelector(".ge-archive-btn");
                            if (archBtn) archBtn.textContent = "Unarchive";
                            var cb = row.querySelector(".row-select");
                            if (cb) cb.checked = false;
                        });
                    }
                    updateGuestBatchCount();
                    if (guestBatchAction) guestBatchAction.value = "";
                })
                .catch(window.handleFetchError);
            }
        });
    }

    // Clear selection
    if (guestBatchClear) {
        guestBatchClear.addEventListener("click", function () {
            guestsTable.querySelectorAll("tbody tr .row-select:checked").forEach(function (cb) { cb.checked = false; });
            if (guestSelectAll) guestSelectAll.checked = false;
            updateGuestBatchCount();
            if (guestBatchAction) guestBatchAction.value = "";
            batchSelectedTagName = "";
            if (guestBatchTagInput) guestBatchTagInput.value = "";
            if (guestBatchTagWrapper) guestBatchTagWrapper.style.display = "none";
            if (guestBatchTagSuggestions) guestBatchTagSuggestions.style.display = "none";
        });
    }

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
        var q = query.toLowerCase().trim();
        if (!q) { gdTagsSuggestions.style.display = "none"; return; }

        var currentNames = currentGuestTags.map(function (t) { return t.name.toLowerCase(); });
        var matches = allUserTags.filter(function (t) {
            return t.name.toLowerCase().indexOf(q) !== -1 && currentNames.indexOf(t.name.toLowerCase()) === -1;
        });

        var exactMatch = allUserTags.some(function (t) { return t.name.toLowerCase() === q; })
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
        if (gdTagsInput) { gdTagsInput.value = ""; }
        if (gdTagsSuggestions) gdTagsSuggestions.style.display = "none";
    }

    function addNewTag(name) {
        // Guess a color for the new tag
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
                // Check if there's an exact match in existing tags
                var match = allUserTags.find(function (t) { return t.name.toLowerCase() === val.toLowerCase(); });
                if (match) {
                    addTagToGuest(match);
                } else {
                    addNewTag(val);
                }
            }
        });
    }

    // Close suggestions on outside click
    document.addEventListener("click", function (e) {
        if (gdTagsSuggestions && !gdTagsSuggestions.contains(e.target) && e.target !== gdTagsInput) {
            gdTagsSuggestions.style.display = "none";
        }
    });

    // ── Guest Detail overlay ─────────────────────────────────────────────

    var gdOverlay = document.getElementById("guest-detail-overlay");
    var gdClose = document.getElementById("guest-detail-close");
    var gdForm = document.getElementById("guest-detail-form");
    var gdMeta = document.getElementById("gd-meta");
    var gdActiveRow = null;

    function formatDate(iso) {
        if (!iso) return "—";
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
        window.fetchWithCsrf("/api/v1/friends/" + guestId)
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var g = resp.data;
                document.getElementById("gd-guest-id").value = g.id;
                document.getElementById("gd-first").value = g.first_name;
                document.getElementById("gd-last").value = g.last_name;
                document.getElementById("gd-gender").value = g.gender;
                document.getElementById("gd-notes").value = g.notes;
                // Handle is_me: make name fields read-only, show label
                var gdFirst = document.getElementById("gd-first");
                var gdLast = document.getElementById("gd-last");
                var gdGender = document.getElementById("gd-gender");
                var gdIsMeRow = document.getElementById("gd-is-me-row");
                var gdIsMeLabel = document.getElementById("gd-is-me-label");
                gdFirst.readOnly = g.is_me;
                gdLast.readOnly = g.is_me;
                gdGender.disabled = g.is_me;
                if (gdIsMeRow) gdIsMeRow.style.display = "none";
                if (gdIsMeLabel) gdIsMeLabel.style.display = g.is_me ? "" : "none";

                // Populate tags
                currentGuestTags = (g.tags || []).slice();
                renderGuestTags();
                if (gdTagsInput) gdTagsInput.value = "";

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

            var tagNames = currentGuestTags.map(function (t) { return t.name; });
            window.fetchWithCsrf("/api/v1/friends/" + guestId, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ first_name: firstName, last_name: lastName, gender: gender, notes: notes, is_me: isMe, tag_names: tagNames })
            })
            .then(function (res) { return res.json(); })
            .then(function (resp) {
                var data = resp.data;
                // Update the table row
                if (gdActiveRow) {
                    var firstInput = gdActiveRow.querySelector(".ge-first");
                    var lastInput = gdActiveRow.querySelector(".ge-last");
                    var genderSelect = gdActiveRow.querySelector(".ge-gender");
                    var notesInput = gdActiveRow.querySelector(".ge-notes");
                    if (firstInput) firstInput.value = firstName;
                    if (lastInput) lastInput.value = lastName;
                    if (genderSelect) { genderSelect.value = gender; abbreviateGender(genderSelect); updateGenderTagColor(genderSelect); }
                    if (notesInput) notesInput.value = notes;
                    gdActiveRow.setAttribute("data-first", firstName.toLowerCase());
                    gdActiveRow.setAttribute("data-last", lastName.toLowerCase());
                    gdActiveRow.setAttribute("data-gender", gender);
                    // Update tags on row
                    var tagIds = (data.tags || []).map(function (t) { return t.id; });
                    gdActiveRow.setAttribute("data-tags", tagIds.join(","));
                    var tagsCell = gdActiveRow.querySelector(".ge-tags-cell");
                    if (tagsCell) {
                        tagsCell.innerHTML = "";
                        (data.tags || []).forEach(function (t) {
                            var badge = document.createElement("span");
                            badge.className = "tag-badge";
                            badge.style.background = t.color;
                            badge.textContent = t.name;
                            tagsCell.appendChild(badge);
                            tagsCell.appendChild(document.createTextNode(" "));
                        });
                    }
                    // Update is_me highlighting
                    guestsTable.querySelectorAll("tr[data-is-me='true']").forEach(function (r) {
                        r.setAttribute("data-is-me", "false");
                    });
                    if (data.is_me) {
                        gdActiveRow.setAttribute("data-is-me", "true");
                    } else {
                        gdActiveRow.setAttribute("data-is-me", "false");
                    }
                }
                // Refresh allUserTags to include any new tags
                window.fetchWithCsrf("/api/v1/tags")
                    .then(function (res) { return res.json(); })
                    .then(function (resp) {
                        allUserTags = resp.data || [];
                        buildTagFilterDropdown();
                    })
                    .catch(function () {});
                gdOverlay.style.display = "none";
            })
            .catch(window.handleFetchError);
        });
    }

});
