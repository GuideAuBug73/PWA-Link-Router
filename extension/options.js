(function () {
  "use strict";

  const { BROWSER_NAMES, DEFAULT_SETTINGS, withDefaults } = globalThis.PwaLinkRouterRules;
  const $ = (id) => document.getElementById(id);

  function setStatus(element, text, kind) {
    element.textContent = text;
    element.className = "status" + (kind ? " " + kind : "");
  }

  function save(changes) {
    chrome.storage.sync.set(changes, () => {
      const status = $("save-status");
      setStatus(status, "Enregistré", "ok");
      clearTimeout(save.timer);
      save.timer = setTimeout(() => setStatus(status, ""), 1500);
    });
  }

  function fillBrowsers(browsers, selected) {
    const select = $("browser");
    select.textContent = "";
    for (const browser of browsers) {
      const option = document.createElement("option");
      option.value = browser.id;
      const name = browser.id === "default" ? "Navigateur par défaut du système" : browser.name;
      option.textContent = browser.available === false ? `${name} (non installé)` : name;
      select.appendChild(option);
    }
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Commande personnalisée";
    select.appendChild(custom);
    select.value = selected;
  }

  function showCommandField() {
    $("command-field").hidden = $("browser").value !== "custom";
  }

  function load(settings, browsers) {
    $("enabled").checked = settings.enabled;
    $("onlyInPwa").checked = settings.onlyInPwa;
    $("safetyNet").checked = settings.safetyNet;
    $("command").value = settings.command;
    $("keepInEdge").value = settings.keepInEdge.join("\n");
    fillBrowsers(browsers, settings.browser);
    showCommandField();
  }

  function parseHosts(text) {
    return text
      .split(/[\s,]+/)
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  const staticBrowsers = Object.keys(BROWSER_NAMES)
    .filter((id) => id !== "custom")
    .map((id) => ({ id, name: BROWSER_NAMES[id] }));

  chrome.storage.sync.get(null, (stored) => {
    const settings = withDefaults(stored);
    load(settings, staticBrowsers);

    chrome.runtime.sendMessage({ type: "list" }, (response) => {
      if (response && response.ok) {
        setStatus($("host-status"), "Programme local installé et opérationnel.", "ok");
        fillBrowsers(response.browsers, $("browser").value);
        showCommandField();
      } else {
        setStatus(
          $("host-status"),
          "Le programme local ne répond pas. Lancez ./install.sh depuis le dossier du projet, puis rechargez cette page." +
            (response && response.error ? ` (${response.error})` : ""),
          "error"
        );
      }
    });
  });

  for (const id of ["enabled", "onlyInPwa", "safetyNet"]) {
    $(id).addEventListener("change", (event) => save({ [id]: event.target.checked }));
  }
  $("browser").addEventListener("change", (event) => {
    showCommandField();
    save({ browser: event.target.value });
  });
  $("command").addEventListener("change", (event) => save({ command: event.target.value.trim() }));
  $("keepInEdge").addEventListener("change", (event) => save({ keepInEdge: parseHosts(event.target.value) }));
  $("reset-keep").addEventListener("click", () => {
    $("keepInEdge").value = DEFAULT_SETTINGS.keepInEdge.join("\n");
    save({ keepInEdge: DEFAULT_SETTINGS.keepInEdge });
  });

  $("test").addEventListener("click", () => {
    const status = $("test-status");
    setStatus(status, "Ouverture…");
    chrome.runtime.sendMessage({ type: "open", url: "https://example.com/", test: true }, (response) => {
      if (response && response.ok) {
        setStatus(status, "Envoyé : example.com devrait s'ouvrir dans le navigateur choisi.", "ok");
      } else {
        setStatus(status, "Échec : " + ((response && response.error) || "pas de réponse"), "error");
      }
    });
  });
})();
