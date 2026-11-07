(() => {
  "use strict";

  const tabs = [...document.querySelectorAll("[data-pattern]")];

  function selectPattern(tab) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    }
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => selectPattern(tab));
    tab.addEventListener("keydown", (event) => {
      let destination;
      if (event.key === "ArrowRight") destination = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") destination = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") destination = tabs[0];
      if (event.key === "End") destination = tabs[tabs.length - 1];
      if (!destination) return;
      event.preventDefault();
      selectPattern(destination);
      destination.focus();
    });
  }

  for (const button of document.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      document.getElementById("action-feedback").textContent = `${button.dataset.example} · interacción de ejemplo completada.`;
    });
  }

  document.getElementById("example-agent-form").addEventListener("submit", (event) => {
    event.preventDefault();
    document.getElementById("form-feedback").textContent = "Configuración de ejemplo guardada en esta vista.";
  });

  const prospectRows = [...document.querySelectorAll("#example-prospects tr")];
  document.getElementById("example-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("es-AR");
    let visible = 0;
    for (const row of prospectRows) {
      row.hidden = !row.textContent.toLocaleLowerCase("es-AR").includes(query);
      if (!row.hidden) visible += 1;
    }
    document.getElementById("prospect-count").textContent = `${visible} prospectos ficticios`;
    document.getElementById("prospect-empty").hidden = visible > 0;
  });
})();
