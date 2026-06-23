const SHEET_BASE_URL =
  "https://opensheet.elk.sh/1v2ZMLH5974XSK8r5C1zKb0xmSnKUB_trJWArnIhJWi0";

const ENDPOINTS = {
  analysts: `${SHEET_BASE_URL}/analistas`,
  unanswered: `${SHEET_BASE_URL}/respostas`,
  notices: `${SHEET_BASE_URL}/avisos`,
  metaStatus: "https://metastatus.com/data/outages/whatsapp-business-api.json",
  cloudflareStatus: "https://www.cloudflarestatus.com/api/v2/summary.json",
};

const REFRESH = {
  dashboardMs: 120000,
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
const notificationAudio = document.getElementById("notificationAudio");
const soundToggle = document.getElementById("soundToggle");
const unansweredNoticeCard = document.getElementById("unansweredNoticeCard");
const operationsNoticeCard = document.getElementById("operationsNoticeCard");
const unansweredNoticeText = document.getElementById("unansweredNoticeText");
const operationsNoticeText = document.getElementById("operationsNoticeText");
const notificationFeed = document.getElementById("notificationFeed");
const notificationHub = document.querySelector(".notification-hub");
const clearNotificationsBtn = document.getElementById("clearNotificationsBtn");
const notificationMinimizeBtn = document.getElementById("notificationMinimizeBtn");

const seenUnansweredKeys = new Set();
const seenNoticeKeys = new Set();
let initialNotificationSync = false;
let soundEnabled = true;
let hubMinimized = false;

function sanitizeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function setEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}

function clearHighlight(card) {
  if (!card) {
    return;
  }

  card.classList.remove("highlight");
  // Force reflow so rapid consecutive notifications replay the animation.
  void card.offsetWidth;
  card.classList.add("highlight");
}

function playNotificationSound() {
  if (!soundEnabled || !notificationAudio) {
    return;
  }

  notificationAudio.currentTime = 0;
  notificationAudio.play().catch(() => {
    // Autoplay may be blocked by the browser until user interaction.
  });
}

function setNotificationHubMinimized(value) {
  hubMinimized = Boolean(value);

  if (notificationHub) {
    notificationHub.classList.toggle("minimized", hubMinimized);
  }

  if (notificationMinimizeBtn) {
    notificationMinimizeBtn.textContent = hubMinimized ? "Expandir" : "Minimizar";
  }
}

function openNotificationHubForAlert() {
  if (hubMinimized) {
    setNotificationHubMinimized(false);
  }
}

function clearNotificationsFeed() {
  if (notificationFeed) {
    notificationFeed.innerHTML = `<div class="empty-state">Sem notificacoes recentes.</div>`;
  }

  unansweredNoticeCard?.classList.remove("highlight");
  operationsNoticeCard?.classList.remove("highlight");

  if (unansweredNoticeText) {
    unansweredNoticeText.textContent = "Sem novas entradas";
  }

  if (operationsNoticeText) {
    operationsNoticeText.textContent = "Sem novas entradas";
  }
}

function pushNotification(type, message) {
  if (!notificationFeed) {
    return;
  }

  const hasEmptyState = notificationFeed.querySelector(".empty-state");
  if (hasEmptyState) {
    notificationFeed.innerHTML = "";
  }

  const item = document.createElement("article");
  item.className = `notification-item ${type}`;

  const now = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  item.textContent = `[${now}] ${message}`;
  notificationFeed.prepend(item);

  const maxItems = 12;
  while (notificationFeed.children.length > maxItems) {
    notificationFeed.removeChild(notificationFeed.lastElementChild);
  }
}

function makeItemKey(item, primaryField, fallbackField) {
  const primary = sanitizeText(item?.[primaryField], "").trim();
  if (primary) {
    return `${primaryField}:${primary}`;
  }

  const fallback = sanitizeText(item?.[fallbackField], "").trim();
  return fallback ? `${fallbackField}:${fallback}` : "";
}

function updateNotificationSummary() {
  if (unansweredNoticeText) {
    unansweredNoticeText.textContent =
      seenUnansweredKeys.size > 0
        ? `${seenUnansweredKeys.size} item(ns) monitorado(s)`
        : "Sem novas entradas";
  }

  if (operationsNoticeText) {
    operationsNoticeText.textContent =
      seenNoticeKeys.size > 0
        ? `${seenNoticeKeys.size} item(ns) monitorado(s)`
        : "Sem novas entradas";
  }
}

function initSoundControl() {
  if (!soundToggle) {
    return;
  }

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute("aria-pressed", String(!soundEnabled));
    soundToggle.textContent = soundEnabled ? "Som ligado" : "Som desligado";

    if (hubMinimized) {
      setNotificationHubMinimized(false);
    }
  });
}

function initNotificationHubControls() {
  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener("click", clearNotificationsFeed);
  }

  if (notificationMinimizeBtn) {
    notificationMinimizeBtn.addEventListener("click", () => {
      setNotificationHubMinimized(!hubMinimized);
    });
  }
}

function detectNewUnanswered(unanswered = []) {
  if (!Array.isArray(unanswered)) {
    return;
  }

  let additions = 0;

  unanswered.forEach((client) => {
    const key = makeItemKey(client, "id_cliente", "nome_do_cliente");
    if (!key || seenUnansweredKeys.has(key)) {
      return;
    }

    seenUnansweredKeys.add(key);

    if (initialNotificationSync) {
      additions += 1;
      const name = sanitizeText(client.nome_do_cliente, "Cliente sem nome");
      pushNotification("unanswered", `Novo cliente sem resposta: ${name}`);
    }
  });

  if (additions > 0) {
    openNotificationHubForAlert();
    clearHighlight(unansweredNoticeCard);
    playNotificationSound();
  }
}

function detectNewNotices(notices = []) {
  if (!Array.isArray(notices)) {
    return;
  }

  let additions = 0;

  notices.forEach((notice) => {
    const key = makeItemKey(notice, "id", "aviso");
    if (!key || seenNoticeKeys.has(key)) {
      return;
    }

    seenNoticeKeys.add(key);

    if (initialNotificationSync) {
      additions += 1;
      const title = sanitizeText(notice.aviso ?? notice.titulo ?? notice.mensagem, "Novo aviso");
      pushNotification("notices", `Novo aviso operacional: ${title}`);
    }
  });

  if (additions > 0) {
    openNotificationHubForAlert();
    clearHighlight(operationsNoticeCard);
    playNotificationSound();
  }
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
  const metaStatus = fetchJson(ENDPOINTS.metaStatus)

  return metaStatus;
}

async function getCloudflareStatus() {
  const cloudflareStatus = fetchJson(ENDPOINTS.cloudflareStatus)

  return cloudflareStatus;
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
    const { name, response } = item;
    const { label, impact } = normalizeStatus(response?.indicator);

    if (name === "Meta Whatsapp") {
      response.length === 0 && statusList.append(
        buildStatusItem({
          name,
          detail: `Sem problemas`,
          impact: "ok",
        })
      );
      response.length > 0 && statusList.append(
        buildStatusItem({
          name,
          detail: `Instabilidade detectada: ${response.map(title => title).join(", ")}`,
          impact: "risk",
        })
      );
    }

    if (name === "Cloudflare") {
      const cloudflareIndicator = response?.status?.indicator;
      const { label, impact } = normalizeStatus(cloudflareIndicator);

      statusList.append(
        buildStatusItem({
          name,
          detail: label,
          impact,
        })
      );
    }
  });
}

async function refreshDashboardData() {
  try {
    const [analysts, unanswered, notices] = await Promise.all([
      fetchJson(ENDPOINTS.analysts),
      fetchUnansweredList(ENDPOINTS.unansweredCandidates),
      fetchJson(ENDPOINTS.notices),
    ]);

    detectNewUnanswered(unanswered);
    detectNewNotices(notices);
    updateNotificationSummary();
    if (!initialNotificationSync) {
      initialNotificationSync = true;
    }

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

    renderStatus([{name: "Meta Whatsapp", response: metaStatus}, {name: "Cloudflare", response: cloudflareStatus}]);
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
  initSoundControl();
  initNotificationHubControls();
  await Promise.all([refreshDashboardData(), refreshStatusData()]);


  setInterval(refreshDashboardData, REFRESH.dashboardMs);
  setInterval(refreshStatusData, REFRESH.statusMs);
}

bootstrap();
