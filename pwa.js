(function () {
  const installButton = document.querySelector("#installAppButton");
  let deferredInstall = null;
  let noticeTimer = null;

  if (!installButton) return;

  const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;

  function showUnsupportedNotice() {
    const notice = document.querySelector("#toast");
    if (!notice) return;
    notice.textContent = "التثبيت المباشر غير متاح في هذا المتصفح.";
    notice.classList.add("visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove("visible"), 2500);
  }

  if (isInstalled() || new URLSearchParams(location.search).has("themePreview")) {
    installButton.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstall = event;
    installButton.classList.add("is-installable");
    installButton.title = "تثبيت تطبيق FOLVA على جهازك";
  });

  installButton.addEventListener("click", async () => {
    if (isInstalled()) return;
    if (!deferredInstall) {
      showUnsupportedNotice();
      return;
    }

    const promptEvent = deferredInstall;
    deferredInstall = null;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") installButton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installButton.hidden = true;
  });

  if ("serviceWorker" in navigator && !new URLSearchParams(location.search).has("themePreview")) {
    navigator.serviceWorker.register("./service-worker.js").catch(error => {
      console.warn("FOLVA offline support is unavailable", error);
    });
  }
})();