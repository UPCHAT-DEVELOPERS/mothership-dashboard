const SHEET_BASE_URL =
  "https://opensheet.elk.sh/1v2ZMLH5974XSK8r5C1zKb0xmSnKUB_trJWArnIhJWi0";

const ENDPOINTS = {
  analysts: `${SHEET_BASE_URL}/analistas`,
  unanswered: `${SHEET_BASE_URL}/respostas`,
  notices: `${SHEET_BASE_URL}/avisos`,
  metaStatus: "https://metastatus.com/api/v2/status.json",
  cloudflareStatus: "https://www.cloudflarestatus.com/api/v2/status.json",
};

const REFRESH = {
  dashboardMs: 60000,
  statusMs: 120000,
};

const analystsList = document.getElementById("analystsList");
const unansweredList = document.getElementById("unansweredList");
const noticesList = document.getElementById("noticesList");
const statusList = document.getElementById("statusList");

const analystCount = document.getElementById("analystCount");
const unansweredCount = document.getElementById("unansweredCount");
const noticeCount = document.getElementById("noticeCount");
const lastUpdate = document.getElementById("lastUpdate");

function sanitizeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function setEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}

function buildRowItem({ title, meta, pill }) {
  const wrapper = document.createElement("article");
  wrapper.className = "row-item";

  const main = document.createElement("div");
  main.className = "row-main";

  const titleEl = document.createElement("strong");
  titleEl.className = "row-title";
  titleEl.textContent = title;

  const pillEl = document.createElement("span");
  pillEl.className = "value-pill";
  pillEl.textContent = pill;

  const metaEl = document.createElement("small");
  metaEl.className = "row-meta";
  metaEl.textContent = meta;

  main.append(titleEl, pillEl);
  wrapper.append(main, metaEl);

  return wrapper;
}

function buildStatusItem({ name, detail, impact }) {
  const item = document.createElement("article");
  item.className = `status-item ${impact}`;

  const nameEl = document.createElement("strong");
  nameEl.className = "status-name";
  nameEl.textContent = name;

  const detailEl = document.createElement("small");
  detailEl.className = "status-detail";
  detailEl.textContent = detail;

  item.append(nameEl, detailEl);
  return item;
}

function normalizeStatus(indicator) {
  const value = sanitizeText(indicator, "unknown").toLowerCase();

  if (["none", "operational", "ok"].includes(value)) {
    return { label: "Operacional", impact: "ok" };
  }

  if (["minor", "degraded_performance", "partial_outage"].includes(value)) {
    return { label: "Instavel", impact: "warn" };
  }

  if (["major", "major_outage", "critical", "maintenance"].includes(value)) {
    return { label: "Intermitente", impact: "risk" };
  }

  return { label: "Indisponivel", impact: "warn" };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: ${response.status}`);
  }

  return response.json();
}

async function fetchUnansweredList() {
  try {
    const data = await fetchJson(ENDPOINTS.unanswered);
    return Array.isArray(data) ? data : [];
  } catch (_error) {
    // Handle error if needed
  }
}

function renderAnalysts(data) {
  if (!Array.isArray(data) || data.length === 0) {
    analystCount.textContent = "0 analistas";
    setEmptyState(analystsList, "Nenhum analista encontrado.");
    return;
  }

  analystCount.textContent = `${data.length} analistas`;
  analystsList.innerHTML = "";

  data.forEach((analyst) => {
    const name = sanitizeText(analyst.analista, "Sem nome");
    const total = sanitizeText(analyst.num_de_clientes, "0");
    const id = sanitizeText(analyst.id_analista, "-");

    analystsList.append(
      buildRowItem({
        title: name,
        pill: `${total} clientes`,
      })
    );
  });
}

function renderUnanswered(data) {
  if (!Array.isArray(data) || data.length === 0) {
    unansweredCount.textContent = "0 clientes";
    setEmptyState(unansweredList, "Nao ha clientes sem resposta no momento.");
    return;
  }

  unansweredCount.textContent = `${data.length} clientes`;
  unansweredList.innerHTML = "";

  data.forEach((client) => {
    const clientName = sanitizeText(client.nome_do_cliente, "Cliente sem nome");
    const responsible = sanitizeText(client.responsavel, "-");
    const id = sanitizeText(client.id_cliente, "-");

    unansweredList.append(
      buildRowItem({
        title: clientName,
        meta: `Responsavel: ${responsible}`,
        pill: "Pendente",
      })
    );
  });
}

function renderNotices(data) {
  if (!Array.isArray(data) || data.length === 0) {
    noticeCount.textContent = "0 avisos";
    setEmptyState(noticesList, "Nenhum aviso operacional cadastrado.");
    return;
  }

  noticeCount.textContent = `${data.length} avisos`;
  noticesList.innerHTML = "";

  data.forEach((notice, index) => {
    const title = sanitizeText(
      notice.aviso ?? notice.titulo ?? notice.mensagem,
      `Aviso ${index + 1}`
    );

    const detail = sanitizeText(
      notice.detalhe ?? notice.descricao ?? notice.responsavel,
      "Comunicado operacional"
    );

    noticesList.append(
      buildRowItem({
        title,
        meta: detail,
        pill: "Ativo",
      })
    );
  });
}

async function getMetaWhatsappStatus() {
  const [metaStatus, metaComponents] = await Promise.all([
    fetchJson(ENDPOINTS.metaStatus),
    fetchJson(ENDPOINTS.metaComponents),
  ]);

  const metaGlobalIndicator = metaStatus?.status?.indicator;
  const globalNormalized = normalizeStatus(metaGlobalIndicator);

  const components = Array.isArray(metaComponents?.components)
    ? metaComponents.components
    : [];

  const whatsappComponent = components.find((component) => {
    const name = sanitizeText(component?.name, "").toLowerCase();
    return name.includes("whatsapp") && name.includes("business");
  });

  const whatsappNormalized = normalizeStatus(whatsappComponent?.status);

  return [
    {
      name: "Meta Global",
      detail: globalNormalized.label,
      impact: globalNormalized.impact,
    },
    {
      name: "WhatsApp Business API",
      detail: whatsappComponent
        ? `${sanitizeText(whatsappComponent.name)}: ${whatsappNormalized.label}`
        : "Componente nao encontrado no status publico",
      impact: whatsappComponent ? whatsappNormalized.impact : "warn",
    },
  ];
}

async function getCloudflareStatus() {
  const [globalStatusData, componentsData] = await Promise.all([
    fetchJson(ENDPOINTS.cloudflareStatus),
    fetchJson(ENDPOINTS.cloudflareComponents),
  ]);

  const globalNormalized = normalizeStatus(globalStatusData?.status?.indicator);
  const components = Array.isArray(componentsData?.components)
    ? componentsData.components
    : [];

  const brazilComponent = components.find((component) => {
    const name = sanitizeText(component?.name, "").toLowerCase();
    return (
      name.includes("brazil") ||
      name.includes("brasil") ||
      name.includes("sao paulo") ||
      name.includes("latin america")
    );
  });

  const brazilNormalized = normalizeStatus(brazilComponent?.status);

  return [
    {
      name: "Cloudflare Global",
      detail: globalNormalized.label,
      impact: globalNormalized.impact,
    },
    {
      name: "Cloudflare Brasil",
      detail: brazilComponent
        ? `${sanitizeText(brazilComponent.name)}: ${brazilNormalized.label}`
        : "Sem componente dedicado ao Brasil no status publico",
      impact: brazilComponent ? brazilNormalized.impact : "warn",
    },
  ];
}

function renderStatus(items) {
  statusList.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    statusList.append(
      buildStatusItem({
        name: "Status externo",
        detail: "Sem retorno das APIs de monitoramento",
        impact: "warn",
      })
    );
    return;
  }

  items.forEach((item) => {
    statusList.append(buildStatusItem(item));
  });
}

async function refreshDashboardData() {
  try {
    const [analysts, unanswered, notices] = await Promise.all([
      fetchJson(ENDPOINTS.analysts),
      fetchUnansweredList(ENDPOINTS.unansweredCandidates),
      fetchJson(ENDPOINTS.notices),
    ]);

    renderAnalysts(analysts);
    renderUnanswered(unanswered);
    renderNotices(notices);
  } catch (error) {
    console.error(error);
    setEmptyState(analystsList, "Erro ao carregar analistas.");
    setEmptyState(unansweredList, "Erro ao carregar clientes sem resposta.");
    setEmptyState(noticesList, "Erro ao carregar avisos.");
  }

  const timestamp = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  lastUpdate.textContent = `Atualizado em ${timestamp}`;
}

async function refreshStatusData() {
  try {
    const [metaStatus, cloudflareStatus] = await Promise.all([
      getMetaWhatsappStatus(),
      getCloudflareStatus(),
    ]);

    renderStatus([...metaStatus, ...cloudflareStatus]);
  } catch (error) {
    console.error(error);
    renderStatus([
      {
        name: "Monitoramento externo",
        detail: "Nao foi possivel consultar os provedores de status",
        impact: "risk",
      },
    ]);
  }
}

async function bootstrap() {
  await Promise.all([refreshDashboardData(), ]);

  setInterval(refreshDashboardData, REFRESH.dashboardMs);
//   setInterval(refreshDashboardData, REFRESH.dashboardMs, refreshStatusData);
//   setInterval(refreshStatusData, REFRESH.statusMs);
}

bootstrap();
