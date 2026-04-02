import fs from "node:fs";
import path from "node:path";

const baseDir = process.argv[2] ?? "C:\\Users\\rafae\\Downloads\\RESULTADO DOS TESTES";
const outputPath = process.argv[3] ?? path.join(baseDir, "project-insights-dashboard.html");

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(baseDir, name), "utf8"));
}

const snapshotRows = readCsv("fact_snapshots.csv");
const disciplineRows = readCsv("fact_disciplines.csv");
const compensationRows = readCsv("fact_compensation.csv");
const taskRows = readCsv("fact_tasks.csv");
const manifest = JSON.parse(fs.readFileSync(path.join(baseDir, "manifest.json"), "utf8"));

const payload = {
  snapshot: snapshotRows[0] ?? null,
  disciplines: disciplineRows,
  compensation: compensationRows,
  tasks: taskRows,
  manifest,
};

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Project Insights Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f2f1ea;
      --surface: rgba(255,255,255,0.92);
      --surface-strong: #ffffff;
      --border: rgba(21, 53, 42, 0.12);
      --text: #15352a;
      --muted: #5a6f67;
      --accent: #0f7b72;
      --accent-soft: rgba(15,123,114,0.12);
      --danger: #b33c33;
      --danger-soft: rgba(179,60,51,0.14);
      --warning: #c48a2a;
      --warning-soft: rgba(196,138,42,0.16);
      --shadow: 0 24px 50px rgba(21, 53, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15,123,114,0.12), transparent 30%),
        radial-gradient(circle at top right, rgba(179,60,51,0.09), transparent 28%),
        linear-gradient(180deg, #f8f7f2 0%, #eef1eb 100%);
    }
    .shell {
      max-width: 1440px;
      margin: 0 auto;
      padding: 28px 24px 40px;
    }
    .hero {
      display: grid;
      gap: 18px;
      padding: 28px;
      border-radius: 28px;
      background:
        linear-gradient(145deg, rgba(255,255,255,0.95), rgba(248,250,246,0.92)),
        linear-gradient(120deg, rgba(15,123,114,0.06), rgba(179,60,51,0.05));
      border: 1px solid rgba(255,255,255,0.75);
      box-shadow: var(--shadow);
    }
    .eyebrow {
      margin: 0;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.78rem;
      font-weight: 700;
    }
    h1 {
      margin: 0;
      font-size: clamp(2.4rem, 4vw, 4.2rem);
      line-height: 0.96;
      letter-spacing: -0.05em;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 880px;
      line-height: 1.6;
    }
    .hero-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: 1.6fr 1fr;
      align-items: start;
    }
    .risk-banner {
      display: grid;
      gap: 10px;
      padding: 22px;
      border-radius: 22px;
      border: 1px solid rgba(179,60,51,0.16);
      background: linear-gradient(145deg, rgba(255,246,245,0.98), rgba(255,255,255,0.98));
    }
    .risk-pill {
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--danger-soft);
      color: var(--danger);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: end;
      margin-top: 8px;
    }
    .filter {
      display: grid;
      gap: 6px;
      min-width: 220px;
    }
    .filter label {
      font-size: 0.8rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .filter select, .filter input {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px;
      background: rgba(255,255,255,0.92);
      color: var(--text);
      font: inherit;
    }
    .grid {
      display: grid;
      gap: 20px;
      margin-top: 22px;
    }
    .metrics {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }
    .metric-card strong {
      display: block;
      margin-top: 10px;
      font-size: clamp(2rem, 3vw, 3rem);
      line-height: 0.95;
      letter-spacing: -0.05em;
    }
    .metric-label {
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-weight: 700;
    }
    .double-grid {
      display: grid;
      gap: 20px;
      grid-template-columns: 1.1fr 0.9fr;
    }
    .section-title {
      margin: 0 0 14px;
      font-size: 1.12rem;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    .subtle {
      color: var(--muted);
      font-size: 0.93rem;
      line-height: 1.5;
    }
    .bars {
      display: grid;
      gap: 12px;
    }
    .bar-row {
      display: grid;
      gap: 6px;
    }
    .bar-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      font-size: 0.92rem;
    }
    .bar-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
    .bar-track {
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: #e8ece6;
    }
    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #17837b, #54b6a5);
    }
    .bar-fill.warning {
      background: linear-gradient(90deg, #c98a28, #e1b160);
    }
    .bar-fill.danger {
      background: linear-gradient(90deg, #b33c33, #dd7068);
    }
    .task-list {
      display: grid;
      gap: 12px;
    }
    .task-card {
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(255,255,255,0.98);
      border: 1px solid rgba(21,53,42,0.08);
    }
    .task-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }
    .task-title {
      margin: 0;
      font-size: 1rem;
      line-height: 1.35;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 7px 10px;
      border-radius: 999px;
      background: #f4f7f3;
      border: 1px solid #e1e8de;
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
    }
    .chip.danger {
      background: var(--danger-soft);
      border-color: rgba(179,60,51,0.16);
      color: var(--danger);
    }
    .chip.warning {
      background: var(--warning-soft);
      border-color: rgba(196,138,42,0.18);
      color: #996617;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid rgba(21,53,42,0.08);
      vertical-align: top;
    }
    thead th {
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .table-wrap {
      overflow: auto;
    }
    .footer-note {
      margin-top: 22px;
      font-size: 0.84rem;
      color: var(--muted);
    }
    @media (max-width: 1100px) {
      .hero-grid, .double-grid, .metrics { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">Dashboard local de validacao</p>
          <h1 id="projectName">Project Insights</h1>
          <p id="projectSummary"></p>
        </div>
        <div class="risk-banner">
          <span class="risk-pill" id="riskStatus">Leitura do projeto</span>
          <h2 class="section-title" id="riskHeadline" style="margin:0"></h2>
          <p class="subtle" id="riskDescription"></p>
        </div>
      </div>

      <div class="filters">
        <div class="filter">
          <label for="disciplineFilter">Disciplina</label>
          <select id="disciplineFilter">
            <option value="ALL">Todas</option>
          </select>
        </div>
        <div class="filter">
          <label for="taskSearch">Buscar task</label>
          <input id="taskSearch" type="text" placeholder="Digite parte do nome da task" />
        </div>
        <div class="filter">
          <label for="delayedOnly">Filtro rapido</label>
          <select id="delayedOnly">
            <option value="ALL">Todas as tasks</option>
            <option value="DELAYED">Somente atrasadas</option>
            <option value="PRIORITY">Somente top prioritarias</option>
          </select>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="metrics">
        <article class="card metric-card">
          <span class="metric-label">Progresso ponderado</span>
          <strong id="metricProgress">-</strong>
        </article>
        <article class="card metric-card">
          <span class="metric-label">Gap de progresso</span>
          <strong id="metricGap">-</strong>
        </article>
        <article class="card metric-card">
          <span class="metric-label">Tasks com atraso</span>
          <strong id="metricDelayed">-</strong>
        </article>
        <article class="card metric-card">
          <span class="metric-label">Top 5 compensacao</span>
          <strong id="metricCompensation">-</strong>
        </article>
      </div>

      <div class="double-grid">
        <article class="card">
          <h2 class="section-title">Impacto por disciplina</h2>
          <p class="subtle">Leitura consolidada por snapshot. Use o filtro acima para focar em uma frente especifica.</p>
          <div class="bars" id="disciplineBars"></div>
        </article>

        <article class="card">
          <h2 class="section-title">Acoes de compensacao</h2>
          <p class="subtle">Tasks mais relevantes para leitura executiva imediata.</p>
          <div class="task-list" id="compensationList"></div>
        </article>
      </div>

      <article class="card">
        <h2 class="section-title">Tasks operacionais</h2>
        <p class="subtle">Tabela filtravel para inspecionar impacto, progresso, atraso e disciplina.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Disciplina</th>
                <th>Impacto</th>
                <th>Progresso</th>
                <th>Atraso</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="taskTableBody"></tbody>
          </table>
        </div>
      </article>
    </section>

    <p class="footer-note" id="footerNote"></p>
  </div>

  <script>
    const DATA = ${JSON.stringify(payload)};

    const snapshot = DATA.snapshot;
    const disciplines = DATA.disciplines.map((row) => ({
      ...row,
      impact: parseLocaleNumber(row.discipline_impact_percent),
      progress: parseLocaleNumber(row.discipline_progress_weighted_percent),
      remaining: parseLocaleNumber(row.remaining_normalized_value),
      totalTasks: parseLocaleNumber(row.total_tasks) ?? 0,
    }));
    const compensation = DATA.compensation.map((row) => ({
      ...row,
      impact: parseLocaleNumber(row.impact_percent),
      progress: parseLocaleNumber(row.progress_percent_used),
      delay: parseLocaleNumber(row.delay_days) ?? 0,
      remaining: parseLocaleNumber(row.remaining_normalized_value),
    }));
    const tasks = DATA.tasks.map((row) => ({
      ...row,
      impact: parseLocaleNumber(row.impact_percent),
      progress: parseLocaleNumber(row.progress_percent_used),
      delay: parseLocaleNumber(row.delay_days) ?? 0,
      priorityRank: parseLocaleNumber(row.priority_rank),
      isDelayed: String(row.is_delayed).toLowerCase() === "true",
    }));

    const currency = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const percent = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    const disciplineFilter = document.getElementById("disciplineFilter");
    const taskSearch = document.getElementById("taskSearch");
    const delayedOnly = document.getElementById("delayedOnly");

    const uniqueDisciplines = [...new Set(tasks.map((task) => task.discipline_name).filter(Boolean))].sort();
    uniqueDisciplines.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      disciplineFilter.appendChild(option);
    });

    disciplineFilter.addEventListener("change", render);
    taskSearch.addEventListener("input", render);
    delayedOnly.addEventListener("change", render);

    function parseLocaleNumber(value) {
      if (value === undefined || value === null || value === "") return null;
      const normalized = String(value).replace(/\\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function formatPercent(value) {
      return value === null || value === undefined ? "-" : percent.format(value) + "%";
    }

    function formatInteger(value) {
      return value === null || value === undefined ? "-" : currency.format(value);
    }

    function riskText(status) {
      const normalized = String(status || "").toUpperCase();
      if (normalized.includes("CRIT")) return "Projeto em risco";
      if (normalized.includes("ATEN")) return "Projeto sob pressao";
      return "Projeto sob controle";
    }

    function applyFilters(rows) {
      const disciplineValue = disciplineFilter.value;
      const searchValue = taskSearch.value.trim().toLowerCase();
      const delayedMode = delayedOnly.value;

      return rows.filter((row) => {
        if (disciplineValue !== "ALL" && row.discipline_name !== disciplineValue) return false;
        if (searchValue && !String(row.task_name).toLowerCase().includes(searchValue)) return false;
        if (delayedMode === "DELAYED" && !row.isDelayed) return false;
        if (delayedMode === "PRIORITY" && !(row.priorityRank && row.priorityRank > 0 && row.priorityRank <= 10)) return false;
        return true;
      });
    }

    function renderHeader() {
      document.getElementById("projectName").textContent = snapshot?.project_name || DATA.manifest.project_name || "Project Insights";
      document.getElementById("projectSummary").textContent =
        "Painel HTML local gerado a partir do pacote analitico CSV para validacao visual rapida.";
      document.getElementById("riskStatus").textContent = String(snapshot?.score_status || snapshot?.overall_status || "ATENCAO").toUpperCase();
      document.getElementById("riskHeadline").textContent = riskText(snapshot?.schedule_status || snapshot?.overall_status);
      document.getElementById("riskDescription").textContent =
        "Snapshot " + (snapshot?.captured_at || DATA.manifest.snapshot_id || "-") + " com leitura executiva pronta para teste.";
      document.getElementById("metricProgress").textContent = formatPercent(parseLocaleNumber(snapshot?.project_progress_weighted_percent));
      document.getElementById("metricGap").textContent = formatPercent(parseLocaleNumber(snapshot?.project_progress_gap_percent));
      document.getElementById("metricDelayed").textContent = formatInteger(tasks.filter((task) => task.isDelayed).length);
      document.getElementById("metricCompensation").textContent = formatPercent(parseLocaleNumber(snapshot?.project_top5_compensation_percent));
      document.getElementById("footerNote").textContent =
        "Manifest: escala percentual " + DATA.manifest.percent_scale +
        " | delimitador CSV " + DATA.manifest.csv_delimiter +
        " | separador decimal " + DATA.manifest.decimal_separator + ".";
    }

    function renderDisciplineBars(filteredTasks) {
      const container = document.getElementById("disciplineBars");
      container.innerHTML = "";

      const relevant = disciplines
        .filter((row) => row.discipline_name && row.discipline_name !== snapshot?.project_name)
        .filter((row) => {
          if (disciplineFilter.value === "ALL") return true;
          return row.discipline_name === disciplineFilter.value;
        })
        .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
        .slice(0, 8);

      const maxImpact = Math.max(1, ...relevant.map((row) => row.impact ?? 0));

      relevant.forEach((row) => {
        const el = document.createElement("div");
        el.className = "bar-row";
        const pct = ((row.impact ?? 0) / maxImpact) * 100;
        const barClass = (row.impact ?? 0) >= 5 ? "danger" : (row.impact ?? 0) >= 2 ? "warning" : "";
        el.innerHTML = \`
          <div class="bar-header">
            <span class="bar-label" title="\${row.discipline_name}">\${row.discipline_name}</span>
            <strong>\${formatPercent(row.impact)}</strong>
          </div>
          <div class="bar-track"><div class="bar-fill \${barClass}" style="width:\${pct}%"></div></div>
          <div class="subtle">Progresso \${formatPercent(row.progress)} | \${formatInteger(row.totalTasks)} tasks</div>
        \`;
        container.appendChild(el);
      });

      if (!relevant.length) {
        container.innerHTML = '<p class="subtle">Nenhuma disciplina encontrada para o filtro atual.</p>';
      }
    }

    function renderCompensationList() {
      const container = document.getElementById("compensationList");
      container.innerHTML = "";
      const filtered = compensation.filter((row) => {
        if (disciplineFilter.value !== "ALL" && row.discipline_name !== disciplineFilter.value) return false;
        return true;
      });

      filtered.forEach((row, index) => {
        const el = document.createElement("article");
        el.className = "task-card";
        el.innerHTML = \`
          <div class="task-top">
            <div>
              <p class="eyebrow" style="margin-bottom:6px">Acao #\${index + 1}</p>
              <h3 class="task-title">\${row.task_name}</h3>
            </div>
            <span class="chip \${row.delay > 0 ? "danger" : "warning"}">\${row.delay > 0 ? row.delay + " dias de atraso" : "sem atraso visivel"}</span>
          </div>
          <div class="chips">
            <span class="chip">\${row.discipline_name || row.discipline_type || "Sem disciplina"}</span>
            <span class="chip">Impacto \${formatPercent(row.impact)}</span>
            <span class="chip">Progresso \${formatPercent(row.progress)}</span>
          </div>
          <div class="subtle">Valor pendente relativo: \${formatInteger(row.remaining)}</div>
        \`;
        container.appendChild(el);
      });

      if (!filtered.length) {
        container.innerHTML = '<p class="subtle">Nenhuma task de compensacao encontrada para o filtro atual.</p>';
      }
    }

    function renderTaskTable() {
      const body = document.getElementById("taskTableBody");
      body.innerHTML = "";

      const filtered = applyFilters(tasks)
        .sort((a, b) => {
          const aPriority = a.priorityRank ?? 9999;
          const bPriority = b.priorityRank ?? 9999;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return (b.impact ?? 0) - (a.impact ?? 0);
        })
        .slice(0, 30);

      filtered.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = \`
          <td><strong>\${row.task_name}</strong><div class="subtle">Task \${row.task_id} | \${row.outline_number || "-"}</div></td>
          <td>\${row.discipline_name || row.discipline_type || "-"}</td>
          <td>\${formatPercent(row.impact)}</td>
          <td>\${formatPercent(row.progress)}</td>
          <td>\${row.delay ? row.delay + " dias" : "0 dias"}</td>
          <td>
            <div class="chips">
              <span class="chip \${row.isDelayed ? "danger" : "warning"}">\${row.isDelayed ? "Atrasada" : "Sem atraso"}</span>
              \${row.priorityRank ? \`<span class="chip">Prioridade \${row.priorityRank}</span>\` : ""}
            </div>
          </td>
        \`;
        body.appendChild(tr);
      });

      if (!filtered.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="6" class="subtle">Nenhuma task encontrada com os filtros atuais.</td>';
        body.appendChild(tr);
      }
    }

    function render() {
      const filteredTasks = applyFilters(tasks);
      renderDisciplineBars(filteredTasks);
      renderCompensationList();
      renderTaskTable();
    }

    renderHeader();
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html, "utf8");
console.log(outputPath);
