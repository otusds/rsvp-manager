// The offline page loads no other bundle, and CSP forbids inline handlers,
// so its single button is bound here.
document.addEventListener("DOMContentLoaded", function () {
    var retry = document.getElementById("offline-retry");
    if (retry) retry.addEventListener("click", function () { location.reload(); });
});
