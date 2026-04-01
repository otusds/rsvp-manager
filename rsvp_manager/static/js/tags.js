document.addEventListener("DOMContentLoaded", function () {
    var tagsTable = document.getElementById("tags-table");
    if (!tagsTable && !document.getElementById("add-tag-btn-empty")) return;

    // ── Inline rename ────────────────────────────────────────────────────────
    document.querySelectorAll(".tag-name-input").forEach(function (input) {
        var original = input.value;
        input.addEventListener("focus", function () { original = input.value; });
        input.addEventListener("blur", function () {
            var newName = input.value.trim();
            if (!newName || newName === original) { input.value = original; return; }
            window.fetchWithCsrf("/api/v1/tags/" + input.dataset.tagId, {
                method: "PUT",
                body: JSON.stringify({ name: newName }),
            }).then(function (r) {
                if (!r.ok) return r.json().then(function (d) { alert(d.message || "Error"); input.value = original; });
                original = newName;
                return r.json();
            }).catch(function () { input.value = original; });
        });
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        });
    });

    // ── Color picker ─────────────────────────────────────────────────────────
    var colorPicker = document.getElementById("tag-color-picker");
    var activeColorDot = null;

    document.querySelectorAll(".tag-color-dot").forEach(function (dot) {
        dot.addEventListener("click", function (e) {
            e.stopPropagation();
            if (activeColorDot === dot && colorPicker.style.display !== "none") {
                colorPicker.style.display = "none";
                activeColorDot = null;
                return;
            }
            activeColorDot = dot;
            var rect = dot.getBoundingClientRect();
            colorPicker.style.display = "flex";
            colorPicker.style.position = "fixed";
            colorPicker.style.top = rect.bottom + 6 + "px";
            colorPicker.style.left = rect.left + "px";
            var pickerH = colorPicker.offsetHeight;
            if (rect.bottom + 6 + pickerH > window.innerHeight) {
                colorPicker.style.top = rect.top - pickerH - 6 + "px";
            }
        });
    });

    if (colorPicker) {
        colorPicker.querySelectorAll(".tag-color-option").forEach(function (opt) {
            opt.addEventListener("click", function (e) {
                e.stopPropagation();
                if (!activeColorDot) return;
                var color = opt.dataset.color;
                var tagId = activeColorDot.dataset.tagId;
                activeColorDot.style.background = color;
                colorPicker.style.display = "none";
                window.fetchWithCsrf("/api/v1/tags/" + tagId, {
                    method: "PUT",
                    body: JSON.stringify({ color: color }),
                });
                activeColorDot = null;
            });
        });

        document.addEventListener("click", function () {
            colorPicker.style.display = "none";
            activeColorDot = null;
        });
    }

    // ── Delete tag ───────────────────────────────────────────────────────────
    document.querySelectorAll(".tag-delete-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var name = btn.dataset.tagName;
            var count = parseInt(btn.dataset.guestCount, 10);
            var msg = "Delete tag '" + name + "'?";
            if (count > 0) msg += " It will be removed from " + count + " friend" + (count > 1 ? "s" : "") + ".";
            if (!confirm(msg)) return;
            var row = btn.closest("tr");
            window.fetchWithCsrf("/api/v1/tags/" + btn.dataset.tagId, {
                method: "DELETE",
            }).then(function (r) {
                if (r.ok || r.status === 204) {
                    row.remove();
                    var remaining = tagsTable ? tagsTable.querySelectorAll("tbody tr").length : 0;
                    var countLabel = document.querySelector(".tag-count-label");
                    if (countLabel) countLabel.textContent = "(" + remaining + ")";
                    if (remaining === 0) location.reload();
                }
            });
            var menu = btn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    });

    // ── Merge tag ────────────────────────────────────────────────────────────
    var mergeOverlay = document.getElementById("merge-tag-overlay");
    var mergeClose = document.getElementById("merge-tag-close");
    var mergeHint = document.getElementById("merge-tag-hint");
    var mergeList = document.getElementById("merge-tag-list");
    var mergeSourceId = null;

    function closeMerge() { mergeOverlay.style.display = "none"; mergeSourceId = null; }
    if (mergeClose) mergeClose.addEventListener("click", closeMerge);
    if (mergeOverlay) mergeOverlay.addEventListener("click", function (e) {
        if (e.target === mergeOverlay) closeMerge();
    });

    document.querySelectorAll(".tag-merge-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            mergeSourceId = btn.dataset.tagId;
            var sourceName = btn.dataset.tagName;
            mergeHint.textContent = "Merge \"" + sourceName + "\" into:";
            mergeList.innerHTML = "";

            // Build list of other tags
            if (tagsTable) {
                tagsTable.querySelectorAll("tbody tr").forEach(function (row) {
                    var tagId = row.dataset.tagId;
                    if (tagId === mergeSourceId) return;
                    var name = row.querySelector(".tag-name-input").value;
                    var color = row.querySelector(".tag-color-dot").style.background;
                    var item = document.createElement("button");
                    item.type = "button";
                    item.className = "merge-tag-item";
                    item.innerHTML = '<span class="tag-color-dot-sm" style="background:' + color + '"></span>' + window.escapeHtml(name);
                    item.addEventListener("click", function () {
                        if (!confirm("Merge \"" + sourceName + "\" into \"" + name + "\"? All friends will be moved and \"" + sourceName + "\" will be deleted.")) return;
                        window.fetchWithCsrf("/api/v1/tags/" + mergeSourceId + "/merge", {
                            method: "POST",
                            body: JSON.stringify({ target_id: parseInt(tagId) }),
                        }).then(function (r) {
                            if (r.ok) location.reload();
                            else r.json().then(function (d) { alert(d.message || "Error"); });
                        });
                    });
                    mergeList.appendChild(item);
                });
            }

            mergeOverlay.style.display = "flex";
            var menu = btn.closest(".kebab-menu");
            if (menu) menu.classList.remove("open");
        });
    });

    // ── Add Tag modal ────────────────────────────────────────────────────────
    var overlay = document.getElementById("add-tag-overlay");
    var addBtn = document.getElementById("add-tag-btn");
    var addBtnEmpty = document.getElementById("add-tag-btn-empty");
    var closeBtn = document.getElementById("add-tag-close");
    var form = document.getElementById("add-tag-form");
    var nameInput = document.getElementById("new-tag-name");
    var colorPickerInline = document.getElementById("new-tag-color-picker");

    function openAddTag() {
        overlay.style.display = "flex";
        if (nameInput) { nameInput.value = ""; nameInput.focus(); }
    }
    function closeAddTag() {
        overlay.style.display = "none";
    }

    if (addBtn) addBtn.addEventListener("click", openAddTag);
    if (addBtnEmpty) addBtnEmpty.addEventListener("click", openAddTag);
    if (closeBtn) closeBtn.addEventListener("click", closeAddTag);
    if (overlay) overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeAddTag();
    });

    if (colorPickerInline) {
        colorPickerInline.querySelectorAll(".tag-color-option").forEach(function (opt) {
            opt.addEventListener("click", function (e) {
                e.preventDefault();
                colorPickerInline.querySelectorAll(".tag-color-option").forEach(function (o) { o.classList.remove("selected"); });
                opt.classList.add("selected");
            });
        });
    }

    if (form) {
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            var tagName = nameInput.value.trim();
            if (!tagName) return;
            var selectedColor = colorPickerInline ? colorPickerInline.querySelector(".tag-color-option.selected") : null;
            var color = selectedColor ? selectedColor.dataset.color : null;
            var body = { name: tagName };
            if (color) body.color = color;
            window.fetchWithCsrf("/api/v1/tags", {
                method: "POST",
                body: JSON.stringify(body),
            }).then(function (r) {
                if (r.ok) {
                    window.trackEvent("tag-created");
                    location.reload();
                } else {
                    r.json().then(function (d) { alert(d.message || "Error creating tag"); });
                }
            });
        });
    }
});
