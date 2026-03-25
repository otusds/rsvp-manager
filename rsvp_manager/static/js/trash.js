document.addEventListener("DOMContentLoaded", function () {
    var trashItems = document.querySelectorAll(".trash-item");
    if (!trashItems.length) return;

    trashItems.forEach(function (item) {
        var type = item.dataset.type;
        var id = item.dataset.id;

        item.querySelector(".trash-restore-btn").addEventListener("click", function () {
            window.fetchWithCsrf("/api/v1/trash/" + type + "/" + id + "/restore", {
                method: "POST",
            }).then(function (r) {
                if (r.ok) {
                    item.remove();
                    checkEmpty();
                } else {
                    r.json().then(function (d) { alert(d.message || "Error"); });
                }
            });
        });

        item.querySelector(".trash-purge-btn").addEventListener("click", function () {
            var name = item.querySelector(".trash-item-name").textContent.trim();
            if (!confirm("Permanently delete \"" + name + "\"? This cannot be undone.")) return;
            window.fetchWithCsrf("/api/v1/trash/" + type + "/" + id, {
                method: "DELETE",
            }).then(function (r) {
                if (r.ok || r.status === 204) {
                    item.remove();
                    checkEmpty();
                }
            });
        });
    });

    function checkEmpty() {
        // Remove empty sections
        document.querySelectorAll(".trash-section").forEach(function (section) {
            if (section.querySelectorAll(".trash-item").length === 0) {
                section.remove();
            }
        });
        // Reload if all gone
        if (document.querySelectorAll(".trash-item").length === 0) {
            location.reload();
        }
    }
});
