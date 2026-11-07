/* Boceto local del CRM, alimentado por fixtures ficticios. */
(() => {
  "use strict";

  const fixtures = window.CRM_MOCK_FIXTURES;
  const main = document.querySelector("main");
  const companySelect = document.querySelector("#company-select");
  const stateSelect = document.querySelector("#view-state");
  const stages = [
    ["new", "Nuevo"],
    ["contacted", "Contactado"],
    ["potential_client", "Cliente potencial"],
    ["follow_up", "En seguimiento"],
    ["won", "Compró"],
    ["lost", "No compró"],
    ["disqualified", "No calificado"],
  ];
  const stageLabels = Object.fromEntries(stages);
  const taskLabels = { callback: "Volver a llamar", human_review: "Revisión humana" };
  const statusLabels = {
    pending: "Pendiente",
    running: "En curso",
    completed: "Completada",
    failed: "Fallida",
    cancelled: "Cancelada",
  };
  const callLabels = { completed: "Finalizada", failed: "Fallida", unknown: "Estado desconocido" };
  const actorLabels = { human: "Humano", voicemail: "Buzón", unknown: "Desconocido" };
  const sourceLabels = { manual: "Manual", csv: "CSV", firecrawl: "Búsqueda web" };
  const outcomeLabels = {
    interested: "Con interés",
    not_interested: "Sin interés",
    callback_requested: "Pidió seguimiento",
    wants_to_buy: "Quiere comprar",
    not_assessed: "Sin evaluar",
  };
  const errorLabels = {
    PROVIDER_UNAVAILABLE: "Proveedor no disponible",
    PROVIDER_ERROR: "La llamada no pudo iniciarse",
    RATE_LIMITED: "Se alcanzó el límite de llamadas",
    CONFLICT: "Esta tarea cambió. Revisá su estado",
  };
  const pageLabels = { pipeline: "Pipeline", contacts: "Contacto", tasks: "Tareas" };
  let currentCompanyId = fixtures?.companies?.[0]?.id;
  let screenState = "ready";
  let search = "";
  let taskFilter = "open";
  let pipelineView = "board";

  function escape(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
  }

  function own(collection) {
    return (fixtures?.[collection] || []).filter((item) => item.company_id === currentCompanyId);
  }

  function contact(id) {
    return own("contacts").find((item) => item.id === id);
  }

  function sortNewest(items, field) {
    return [...items].sort((a, b) => String(b[field] || "").localeCompare(String(a[field] || "")));
  }

  function date(value, withTime = true) {
    if (!value) return "Fecha por definir";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Fecha no disponible";
    const options = {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "short",
    };
    if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit", hour12: false });
    return new Intl.DateTimeFormat("es-AR", options).format(parsed);
  }

  function contactUrl(id) {
    return `#/contacts/${encodeURIComponent(id)}`;
  }

  function isOpen(task) {
    return task.status === "pending" || task.status === "running";
  }

  function nextTask(contactId, dealId) {
    return own("tasks")
      .filter((task) => task.contact_id === contactId && isOpen(task))
      .filter((task) => dealId === undefined || task.deal_id === dealId)
      .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"))[0];
  }

  function initials(name) {
    return String(name || "?").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  }

  function badge(label, tone = "") {
    return `<span class="badge ${tone}">${escape(label)}</span>`;
  }

  function stageBadge(stage) {
    return `<span class="badge stage-badge" data-stage="${escape(stage)}">${escape(stageLabels[stage])}</span>`;
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    let contactId = null;
    try {
      contactId = parts[1] ? decodeURIComponent(parts[1]) : null;
    } catch {
      contactId = parts[1];
    }
    return {
      page: Object.hasOwn(pageLabels, parts[0]) ? parts[0] : "pipeline",
      contactId,
    };
  }

  function heading(title, description) {
    return `
      <div class="page-heading">
        <div>
          <h1>${escape(title)}</h1>
          <p class="page-description">${escape(description)}</p>
        </div>
        <div class="date-note">${escape(date(fixtures.now))}</div>
      </div>`;
  }

  function metric(label, value, hint, highlighted = false) {
    return `
      <div class="metric ${highlighted ? "metric-highlight" : ""}">
        <div class="metric-label">${escape(label)}</div>
        <div class="metric-number">${value}</div>
        <div class="metric-hint">${escape(hint)}</div>
      </div>`;
  }

  function statePanel(kind, page) {
    const emptyTitles = {
      pipeline: "Tu pipeline está listo para empezar",
      contacts: "Todavía no hay contactos",
      tasks: "No hay tareas todavía",
    };
    const labels = {
      loading: ["◌", "Cargando tu espacio", "Estamos preparando la información de tu empresa."],
      empty: ["◎", emptyTitles[page], "Los contactos importados y sus próximas acciones aparecerán acá."],
      error: ["!", "No pudimos cargar la información", "Volvé a intentar para recuperar esta vista."],
    };
    const [icon, title, description] = labels[kind];
    const action = kind === "loading"
      ? '<div class="skeleton" aria-hidden="true"></div><div class="skeleton short" aria-hidden="true"></div>'
      : `<button class="button button-primary" data-action="restore">${kind === "error" ? "Volver a intentar" : "Ver datos de ejemplo"}</button>`;
    return `
      <section class="state-panel" role="${kind === "error" ? "alert" : "status"}">
        <div class="state-icon" aria-hidden="true">${icon}</div>
        <h2>${title}</h2>
        <p>${description}</p>
        ${action}
      </section>`;
  }

  function renderPipeline() {
    const deals = own("deals");
    const tasks = own("tasks").filter(isOpen);
    const potential = deals.filter((deal) => deal.stage === "potential_client").length;
    const won = deals.filter((deal) => deal.stage === "won").length;
    main.innerHTML = `
      ${heading("Pipeline", "Seguí cada oportunidad y decidí la próxima acción.")}
      <div class="metrics">
        ${metric("Oportunidades", deals.length, "En esta empresa")}
        ${metric("Clientes potenciales", potential, "Con interés detectado", true)}
        ${metric("Próximas acciones", tasks.length, "Pendientes o en curso")}
        ${metric("Compraron", won, "Cierres confirmados")}
      </div>
      <div class="section-toolbar pipeline-toolbar">
        <div class="view-switch" role="group" aria-label="Vista del pipeline">
          <button class="view-button" data-pipeline-view="board" aria-pressed="${pipelineView === "board"}">Tablero</button>
          <button class="view-button" data-pipeline-view="list" aria-pressed="${pipelineView === "list"}">Lista</button>
        </div>
        <label class="search-wrap">
          <span class="field-label">Buscar oportunidad</span>
          <input type="search" id="pipeline-search" placeholder="Contacto o empresa…" value="${escape(search)}" />
        </label>
      </div>
      <div id="board-content"></div>`;
    renderPipelineContent();
    document.querySelector("#pipeline-search").addEventListener("input", (event) => {
      search = event.target.value;
      renderPipelineContent();
    });
  }

  function renderPipelineContent() {
    const needle = search.trim().toLocaleLowerCase("es-AR");
    const deals = own("deals").filter((deal) => {
      const person = contact(deal.contact_id);
      return person && `${person.name} ${person.organization} ${deal.title}`.toLocaleLowerCase("es-AR").includes(needle);
    });
    const content = pipelineView === "list" ? renderDealList(deals) : renderBoard(deals);
    const emptySearch = needle && !deals.length
      ? '<p class="quiet-note search-feedback" role="status">No hay oportunidades que coincidan con esta búsqueda.</p>'
      : "";
    document.querySelector("#board-content").innerHTML = content + emptySearch;
    for (const button of document.querySelectorAll("[data-pipeline-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.pipelineView === pipelineView));
    }
  }

  function renderBoard(deals) {
    return `
      <div class="board-scroll" tabindex="0" role="region" aria-label="Pipeline de siete etapas, desplazable horizontalmente">
        <div class="pipeline-board">
          ${stages.map(([code, label]) => {
            const stageDeals = deals.filter((deal) => deal.stage === code);
            return `
              <section class="pipeline-column" data-stage="${code}" aria-label="${label}">
                <h2 class="column-heading">
                  <span class="stage-dot" aria-hidden="true"></span>
                  <span>${label}</span>
                  <span class="column-count">${stageDeals.length}</span>
                </h2>
                ${stageDeals.length ? stageDeals.map(renderDealCard).join("") : '<div class="column-empty">Sin oportunidades</div>'}
              </section>`;
          }).join("")}
        </div>
      </div>`;
  }

  function renderDealCard(deal) {
    const person = contact(deal.contact_id);
    const task = nextTask(person.id, deal.id);
    let action = "";
    if (person.do_not_contact) {
      action = '<div class="card-dnc">No contactar</div>';
    } else if (task) {
      const label = task.status === "running" ? "En curso" : taskLabels[task.kind];
      action = `<div class="card-next"><span>${escape(label)}</span><time>${escape(date(task.due_at))}</time></div>`;
    }
    return `
      <a class="deal-card" href="${contactUrl(person.id)}" aria-label="Ver ${escape(person.name)}, ${escape(deal.title)}">
        <div class="card-head">
          <span class="card-avatar" aria-hidden="true">${escape(initials(person.organization || person.name))}</span>
          <span class="card-organization">${escape(person.organization || person.name)}</span>
        </div>
        <div class="card-title">${escape(deal.title)}</div>
        <div class="card-person card-name">${escape(person.name)}</div>
        <div class="card-meta">
          <span>${escape(sourceLabels[person.source?.kind] || "Manual")}</span>
          <time>${escape(date(deal.updated_at, false))}</time>
        </div>
        ${action}
      </a>`;
  }

  function renderDealList(deals) {
    return `
      <div class="panel pipeline-list table-scroll">
        <table class="deal-table">
          <thead><tr><th scope="col">Oportunidad</th><th scope="col">Contacto</th><th scope="col">Etapa</th><th scope="col">Próxima acción</th></tr></thead>
          <tbody>
            ${deals.map((deal) => {
              const person = contact(deal.contact_id);
              const task = nextTask(person.id, deal.id);
              let action = "Sin acción pendiente";
              if (person.do_not_contact) action = "No contactar";
              else if (task) action = `${task.status === "running" ? "En curso" : taskLabels[task.kind]} · ${date(task.due_at)}`;
              return `
                <tr>
                  <td><a href="${contactUrl(person.id)}">${escape(deal.title)}</a><span class="cell-secondary">${escape(person.organization)}</span></td>
                  <td>${escape(person.name)}</td>
                  <td>${stageBadge(deal.stage)}</td>
                  <td>${escape(action)}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderContact(contactId) {
    const people = own("contacts");
    const person = contactId ? contact(contactId) : people[0];
    if (!person) {
      main.innerHTML = `
        ${heading("Contacto", "Información e historial de cada relación comercial.")}
        <section class="state-panel" role="status">
          <div class="state-icon" aria-hidden="true">◎</div>
          <h2>${contactId ? "Contacto no disponible" : "Todavía no hay contactos"}</h2>
          <p>Elegí un contacto de la empresa seleccionada.</p>
          <a href="#/pipeline" class="button">Volver al pipeline</a>
        </section>`;
      return;
    }
    const deals = own("deals").filter((deal) => deal.contact_id === person.id);
    const results = sortNewest(own("call_results").filter((result) => result.contact_id === person.id), "occurred_at");
    const previews = sortNewest(own("call_previews").filter((call) => call.contact_id === person.id), "started_at");
    const activities = sortNewest(own("activities").filter((activity) => activity.contact_id === person.id), "occurred_at");
    const task = nextTask(person.id);
    const website = person.website && /^https?:\/\//i.test(person.website) ? person.website : null;
    main.innerHTML = `
      <div class="contact-context">
        <a class="back-link" href="#/pipeline">← Volver al pipeline</a>
        <div class="contact-chooser">
          <label for="contact-select">Contacto</label>
          <select id="contact-select">
            ${people.map((item) => `<option value="${escape(item.id)}" ${item.id === person.id ? "selected" : ""}>${escape(item.name)} · ${escape(item.organization)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="page-heading">
        <div class="contact-heading">
          <div class="contact-avatar" aria-hidden="true">${escape(initials(person.name))}</div>
          <div><h1>${escape(person.name)}</h1><div class="contact-subtitle">${escape(person.organization)}</div></div>
        </div>
        <div class="button-area">
          <button class="button button-primary" disabled title="La telefonía estará disponible al integrar Voz">Llamar al contacto</button>
          <div class="button-note">Telefonía pendiente de integración</div>
        </div>
      </div>
      ${person.do_not_contact ? '<div class="dnc-alert" role="status"><strong>No contactar.</strong> Esta persona pidió no recibir más llamadas.</div>' : ""}
      ${previews[0]?.status === "unknown" ? '<div class="unknown-alert" role="status"><strong>Último intento con estado desconocido.</strong> Hay que confirmar su estado antes de iniciar otra llamada.</div>' : ""}
      <div class="contact-grid">
        <div class="contact-main">
          ${renderLatestResult(results[0])}
          <section class="panel">
            <h2 class="panel-heading">Actividad <span class="panel-kicker">${activities.length} registros</span></h2>
            ${activities.length ? `<ol class="timeline">${activities.map((activity) => `
              <li><div class="timeline-text">${escape(activity.summary)}</div><time class="timeline-date">${escape(date(activity.occurred_at))}</time></li>`).join("")}</ol>` : '<p class="quiet-note no-margin">Sin actividad registrada todavía.</p>'}
          </section>
          <section class="panel">
            <h2 class="panel-heading">Historial de llamadas <span class="panel-kicker">${previews.length} intentos</span></h2>
            ${previews.length ? previews.map(renderCallRow).join("") : '<p class="quiet-note no-margin">Sin intentos de llamada.</p>'}
          </section>
        </div>
        <aside class="contact-aside" aria-label="Datos y próxima acción">
          <section class="panel next-action-panel">
            <h2 class="panel-heading">Próxima acción</h2>
            ${task ? `
              <div class="next-task-kind">${escape(taskLabels[task.kind])}</div>
              <div class="next-task-date">${escape(date(task.due_at))}</div>
              <p class="next-task-reason">${escape(task.reason)}</p>
              ${badge(statusLabels[task.status], task.status === "running" ? "badge-amber" : "")}
              <a class="button button-secondary" href="#/tasks">Ver tareas →</a>`
              : '<p class="quiet-note no-margin">No hay acciones pendientes para este contacto.</p>'}
          </section>
          <section class="panel details-panel">
            <h2 class="panel-heading">Datos del contacto</h2>
            <dl class="info-list">
              <dt>Oportunidades</dt>
              <dd>${deals.length ? deals.map((deal) => `<div class="deal-stage">${stageBadge(deal.stage)}<span class="cell-secondary">${escape(deal.title)}</span></div>`).join("") : "Sin oportunidad"}</dd>
              <dt>Teléfono de ejemplo</dt><dd>${escape(person.phone_e164)}</dd>
              <dt>Sitio web</dt><dd>${website ? `<a href="${escape(website)}" target="_blank" rel="noopener noreferrer">${escape(website.replace(/^https?:\/\//, ""))}</a>` : "Sin sitio web"}</dd>
              <dt>Fuente</dt><dd>${escape(sourceLabels[person.source?.kind] || "Manual")}</dd>
              <dt>Fecha de alta</dt><dd>${escape(date(person.created_at))}</dd>
            </dl>
          </section>
        </aside>
      </div>`;
    document.querySelector("#contact-select").addEventListener("change", (event) => {
      location.hash = contactUrl(event.target.value);
    });
  }

  function renderLatestResult(result) {
    if (!result) {
      return '<section class="panel"><h2 class="panel-heading">Último resultado</h2><p class="summary">Este contacto todavía no tiene una conversación registrada.</p></section>';
    }
    return `
      <section class="panel result-panel">
        <h2 class="panel-heading">Último resultado <time class="panel-kicker">${escape(date(result.occurred_at))}</time></h2>
        <p class="summary">${escape(result.summary)}</p>
        <dl class="classification">
          <div><dt>Atendió</dt><dd>${escape(actorLabels[result.answered_by])}</dd></div>
          <div><dt>Resultado</dt><dd>${escape(outcomeLabels[result.outcome])}</dd></div>
          <div><dt>Calificación</dt><dd>${result.score === null ? "Sin evaluar" : `<strong class="score-value">${escape(result.score)}</strong><span class="score-caption"> / 100</span>`}</dd></div>
        </dl>
      </section>`;
  }

  function renderCallRow(call) {
    const tone = { failed: "badge-red", unknown: "badge-amber", completed: "badge-green" }[call.status] || "";
    return `
      <div class="call-row">
        <div><time class="call-date">${escape(date(call.started_at))}</time><div class="call-summary">${escape(call.summary)}</div></div>
        ${badge(callLabels[call.status] || "Sin estado", tone)}
      </div>`;
  }

  function renderTasks() {
    const tasks = own("tasks");
    const pending = tasks.filter((task) => task.status === "pending").length;
    const reviews = tasks.filter((task) => task.kind === "human_review" && isOpen(task)).length;
    const callbacks = tasks.filter((task) => task.kind === "callback" && isOpen(task)).length;
    main.innerHTML = `
      ${heading("Tareas", "Organizá los seguimientos y las acciones que necesitan tu atención.")}
      <div class="metrics metrics-three">
        ${metric("Pendientes", pending, "Por ejecutar")}
        ${metric("Volver a llamar", callbacks, "Seguimientos abiertos", true)}
        ${metric("Revisión humana", reviews, "Requieren una persona")}
      </div>
      <div class="section-toolbar">
        <h2>Próximas acciones</h2>
        <div class="filter-control">
          <label for="task-filter">Mostrar</label>
          <select id="task-filter" class="task-filter">
            <option value="open">Abiertas</option>
            <option value="all">Todas</option>
            <option value="callback">Volver a llamar</option>
            <option value="human_review">Revisión humana</option>
          </select>
        </div>
      </div>
      <div class="panel task-list" id="tasks-content"></div>
      <p class="task-rule-note">Una tarea de llamada completada confirma el inicio del seguimiento. El cierre comercial se registra en la oportunidad.</p>`;
    const filter = document.querySelector("#task-filter");
    filter.value = taskFilter;
    filter.addEventListener("change", (event) => {
      taskFilter = event.target.value;
      renderTaskRows();
    });
    renderTaskRows();
  }

  function renderTaskRows() {
    const tasks = own("tasks")
      .filter((task) => contact(task.contact_id))
      .filter((task) => taskFilter === "all" || (taskFilter === "open" ? isOpen(task) : task.kind === taskFilter))
      .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
    if (!tasks.length) {
      document.querySelector("#tasks-content").innerHTML = '<div class="task-state-message" role="status">No hay tareas que coincidan con este filtro.</div>';
      return;
    }
    document.querySelector("#tasks-content").innerHTML = `
      <table class="task-table">
        <thead><tr><th scope="col">Contacto</th><th scope="col">Próxima acción</th><th scope="col">Fecha · Argentina</th><th scope="col">Estado</th></tr></thead>
        <tbody>${tasks.map(renderTaskRow).join("")}</tbody>
      </table>`;
  }

  function renderTaskRow(task) {
    const person = contact(task.contact_id);
    const overdue = task.status === "pending" && task.due_at && Date.parse(task.due_at) < Date.parse(fixtures.now);
    const tone = { failed: "badge-red", running: "badge-amber", completed: "badge-green" }[task.status] || "";
    const error = errorLabels[task.error_code] || "La tarea necesita revisión";
    return `
      <tr>
        <td><a href="${contactUrl(person.id)}">${escape(person.name)}</a><span class="cell-secondary">${escape(person.organization)}</span></td>
        <td data-label="Acción"><strong>${escape(taskLabels[task.kind])}</strong><div class="task-reason">${escape(task.reason)}</div></td>
        <td data-label="Fecha"><time>${escape(date(task.due_at))}</time>${overdue ? '<span class="cell-secondary row-date-overdue">Vencida</span>' : ""}</td>
        <td data-label="Estado">${badge(statusLabels[task.status] || task.status, tone)}${task.status === "failed" ? `<span class="cell-secondary">${escape(error)}</span>` : ""}</td>
      </tr>`;
  }

  function render() {
    const current = route();
    for (const nav of document.querySelectorAll("[data-nav]")) {
      if (nav.dataset.nav === current.page) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    }
    document.querySelector("#breadcrumb-current").textContent = pageLabels[current.page];
    document.title = `Tratunex · ${pageLabels[current.page]} · Boceto`;
    document.querySelector("#task-nav-count").textContent = own("tasks").filter(isOpen).length;
    if (!fixtures || fixtures.mode !== "mock" || !fixtures.companies?.length) {
      main.innerHTML = '<section class="state-panel" role="alert"><h1>No se cargaron los datos de ejemplo</h1><p>Revisá el archivo de datos ficticios y volvé a abrir el boceto.</p></section>';
      return;
    }
    if (screenState !== "ready") {
      main.innerHTML = heading(pageLabels[current.page], "") + statePanel(screenState, current.page);
      return;
    }
    if (current.page === "contacts") renderContact(current.contactId);
    else if (current.page === "tasks") renderTasks();
    else renderPipeline();
  }

  function describeCompany() {
    const company = fixtures?.companies?.find((item) => item.id === currentCompanyId);
    document.querySelector("#company-description").textContent = company?.industry || "Datos ficticios";
  }

  if (fixtures?.companies?.length) {
    companySelect.innerHTML = fixtures.companies.map((item) => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join("");
    companySelect.value = currentCompanyId;
  } else {
    companySelect.disabled = true;
  }
  describeCompany();
  companySelect.addEventListener("change", (event) => {
    currentCompanyId = event.target.value;
    search = "";
    describeCompany();
    if (route().page === "contacts") location.hash = "#/contacts";
    render();
  });
  stateSelect.addEventListener("change", (event) => {
    screenState = event.target.value;
    render();
  });
  main.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="restore"]')) {
      screenState = "ready";
      stateSelect.value = "ready";
      render();
    }
    const viewButton = event.target.closest("[data-pipeline-view]");
    if (viewButton) {
      pipelineView = viewButton.dataset.pipelineView;
      renderPipelineContent();
    }
  });
  window.addEventListener("hashchange", () => {
    render();
    main.focus({ preventScroll: true });
  });
  render();
})();
