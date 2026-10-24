(() => {
  "use strict";

  const TOKEN_STORAGE_KEY = "nexusgate_access_token";
  const REFRESH_INTERVAL_MS = 30000;

  const apiBaseUrl = String(window.NEXUS_CONFIG?.API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  const elements = {
    connectionState: document.querySelector("#connection-state"),
    connectionLabel: document.querySelector("#connection-label"),
    refreshButton: document.querySelector("#refresh-button"),
    logoutButton: document.querySelector("#logout-button"),
    lastUpdated: document.querySelector("#last-updated"),
    syncState: document.querySelector("#sync-state"),
    error: document.querySelector("#dashboard-error"),
    errorMessage: document.querySelector("#dashboard-error-message"),
    cpuCard: document.querySelector("#cpu-card"),
    cpuValue: document.querySelector("#cpu-value"),
    cpuCores: document.querySelector("#cpu-cores"),
    cpuTrack: document.querySelector("#cpu-track"),
    memoryCard: document.querySelector("#memory-card"),
    memoryValue: document.querySelector("#memory-value"),
    memoryTotal: document.querySelector("#memory-total"),
    memoryUsed: document.querySelector("#memory-used"),
    memoryAvailable: document.querySelector("#memory-available"),
    memoryTrack: document.querySelector("#memory-track"),
    diskCard: document.querySelector("#disk-card"),
    diskPath: document.querySelector("#disk-path"),
    diskValue: document.querySelector("#disk-value"),
    diskTotal: document.querySelector("#disk-total"),
    diskUsed: document.querySelector("#disk-used"),
    diskFree: document.querySelector("#disk-free"),
    diskTrack: document.querySelector("#disk-track"),
    rootDiskPath: document.querySelector("#root-disk-path"),
    rootDiskValue: document.querySelector("#root-disk-value"),
    rootDiskTotal: document.querySelector("#root-disk-total"),
    rootDiskUsed: document.querySelector("#root-disk-used"),
    rootDiskFree: document.querySelector("#root-disk-free"),
    rootDiskTrack: document.querySelector("#root-disk-track"),
    uptimeValue: document.querySelector("#uptime-value"),
    bootTime: document.querySelector("#boot-time"),
    servicesGrid: document.querySelector("#services-grid"),
    serviceSummary: document.querySelector("#service-summary"),
  };

  const numberFormatter = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 1,
  });
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  let refreshTimer;
  let isRefreshing = false;

  function redirectToLogin() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.location.replace("./index.html");
  }

  function setConnectionState(state, label) {
    elements.connectionState.classList.toggle("is-online", state === "online");
    elements.connectionState.classList.toggle(
      "is-offline",
      state === "offline",
    );
    elements.connectionLabel.textContent = label;
  }

  function setSyncState(isLoading) {
    elements.syncState.hidden = !isLoading;
    elements.refreshButton.disabled = isLoading;
    elements.servicesGrid.setAttribute("aria-busy", String(isLoading));
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    elements.error.hidden = false;
  }

  function clearError() {
    elements.error.hidden = true;
    elements.errorMessage.textContent = "";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? numberFormatter.format(value) : "--";
  }

  function formatBytes(value) {
    if (!Number.isFinite(value) || value < 0) {
      return "--";
    }

    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let amount = value;
    let unitIndex = 0;
    while (amount >= 1024 && unitIndex < units.length - 1) {
      amount /= 1024;
      unitIndex += 1;
    }

    return `${numberFormatter.format(amount)} ${units[unitIndex]}`;
  }

  function formatDuration(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
      return "--";
    }

    const seconds = Math.floor(totalSeconds);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}天 ${hours}小时`;
    }
    if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    }
    if (minutes > 0) {
      return `${minutes}分钟`;
    }
    return `${seconds}秒`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "--";
    }
    return dateFormatter.format(date);
  }

  function setProgress(track, percent) {
    const safePercent = Number.isFinite(percent)
      ? Math.min(100, Math.max(0, percent))
      : 0;
    track.querySelector(".metric-fill").style.width = `${safePercent}%`;
    track.setAttribute("aria-valuenow", String(Math.round(safePercent)));
  }

  function setCardThreshold(card, percent) {
    const safePercent = Number.isFinite(percent) ? percent : 0;
    card.classList.toggle("is-warning", safePercent >= 75 && safePercent < 90);
    card.classList.toggle("is-critical", safePercent >= 90);
  }

  function updateProgress(card, track, percent) {
    setProgress(track, percent);
    setCardThreshold(card, percent);
  }

  function renderStorageDisk(disk, path, elementsForDisk) {
    const isAvailable = Boolean(disk?.available);
    const percent = isAvailable && Number.isFinite(disk.percent)
      ? disk.percent
      : 0;

    elementsForDisk.path.textContent = disk?.path || path;
    elementsForDisk.value.textContent = isAvailable
      ? formatPercent(disk.percent)
      : "N/A";
    elementsForDisk.total.textContent = isAvailable
      ? formatBytes(disk.total_bytes)
      : disk?.detail || "不可用";
    elementsForDisk.used.textContent = formatBytes(disk?.used_bytes);
    elementsForDisk.free.textContent = formatBytes(disk?.free_bytes);
    setProgress(elementsForDisk.track, percent);

    return percent;
  }

  function renderMetrics(data) {
    document.title = "NexusGate | 运行总览";

    elements.cpuValue.textContent = formatPercent(data.cpu.percent);
    elements.cpuCores.textContent = `${data.cpu.logical_cores} 核心`;
    updateProgress(elements.cpuCard, elements.cpuTrack, data.cpu.percent);

    elements.memoryValue.textContent = formatPercent(data.memory.percent);
    elements.memoryTotal.textContent = formatBytes(data.memory.total_bytes);
    elements.memoryUsed.textContent = formatBytes(data.memory.used_bytes);
    elements.memoryAvailable.textContent = formatBytes(
      data.memory.available_bytes,
    );
    updateProgress(
      elements.memoryCard,
      elements.memoryTrack,
      data.memory.percent,
    );

    const disks = Array.isArray(data.disks) && data.disks.length > 0
      ? data.disks
      : [data.disk].filter(Boolean);
    const dataDisk = disks.find((disk) => disk.path === "/data")
      ?? disks[0];
    const rootDisk = disks.find((disk) => disk.path === "/");
    const dataDiskPercent = renderStorageDisk(
      dataDisk,
      "/data",
      {
        path: elements.diskPath,
        value: elements.diskValue,
        total: elements.diskTotal,
        used: elements.diskUsed,
        free: elements.diskFree,
        track: elements.diskTrack,
      },
    );
    const rootDiskPercent = renderStorageDisk(
      rootDisk,
      "/",
      {
        path: elements.rootDiskPath,
        value: elements.rootDiskValue,
        total: elements.rootDiskTotal,
        used: elements.rootDiskUsed,
        free: elements.rootDiskFree,
        track: elements.rootDiskTrack,
      },
    );
    setCardThreshold(
      elements.diskCard,
      Math.max(dataDiskPercent, rootDiskPercent),
    );

    elements.uptimeValue.textContent = formatDuration(
      data.system.uptime_seconds,
    );
    elements.bootTime.textContent = `启动于 ${formatDate(data.system.boot_time)}`;
    elements.lastUpdated.textContent = formatDate(data.generated_at);
  }

  function serviceStatusLabel(service) {
    if (!service.available) {
      return "探针不可用";
    }
    if (service.status === "not_found") {
      return "未找到";
    }
    if (service.running) {
      return "运行中";
    }
    return service.status || "未运行";
  }

  function createServiceCard(service) {
    const card = document.createElement("article");
    card.className = "service-card";
    if (service.running) {
      card.classList.add("is-online");
    } else if (service.available) {
      card.classList.add("is-offline");
    }

    const header = document.createElement("div");
    header.className = "service-card-header";

    const titleGroup = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "service-name";
    name.textContent = service.name;
    const kind = document.createElement("p");
    kind.className = "service-kind";
    kind.textContent = service.kind;
    titleGroup.append(name, kind);

    const badge = document.createElement("span");
    badge.className = "service-badge";
    badge.textContent = serviceStatusLabel(service);
    header.append(titleGroup, badge);

    const meta = document.createElement("div");
    meta.className = "service-meta";
    const duration = document.createElement("div");
    const durationLabel = document.createElement("span");
    durationLabel.textContent = "持续运行";
    const durationValue = document.createElement("strong");
    durationValue.textContent = service.running
      ? formatDuration(service.uptime_seconds)
      : "--";
    duration.append(durationLabel, durationValue);

    const startTime = document.createElement("div");
    const startLabel = document.createElement("span");
    startLabel.textContent = "启动时间";
    const startValue = document.createElement("strong");
    startValue.textContent = service.started_at
      ? formatDate(service.started_at)
      : "--";
    startTime.append(startLabel, startValue);
    meta.append(duration, startTime);
    card.append(header, meta);

    if (service.detail) {
      const detail = document.createElement("p");
      detail.className = "service-detail";
      detail.textContent = service.detail;
      card.append(detail);
    }

    return card;
  }

  function renderServices(services) {
    const cards = services.map(createServiceCard);
    elements.servicesGrid.replaceChildren(...cards);

    const runningCount = services.filter((service) => service.running).length;
    elements.serviceSummary.textContent =
      `${runningCount} / ${services.length} 项运行中`;
  }

  async function loadDashboard() {
    if (isRefreshing) {
      return;
    }

    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      redirectToLogin();
      return;
    }
    if (!apiBaseUrl || apiBaseUrl.includes("example.com")) {
      showError("请先在 config.js 中配置后端 API 地址。");
      setConnectionState("offline", "配置缺失");
      return;
    }

    isRefreshing = true;
    setSyncState(true);
    clearError();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${apiBaseUrl}/api/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(`Dashboard API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      renderMetrics(data);
      renderServices(data.services);
      setConnectionState("online", "已连接 G4");
    } catch (error) {
      console.error("Dashboard request failed:", error);
      setConnectionState("offline", "连接异常");
      showError(
        error instanceof DOMException && error.name === "AbortError"
          ? "请求超时，请稍后重试。"
          : "仪表盘数据加载失败，请稍后重试。",
      );
    } finally {
      window.clearTimeout(timeout);
      isRefreshing = false;
      setSyncState(false);
    }
  }

  function scheduleRefresh() {
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadDashboard();
      }
    }, REFRESH_INTERVAL_MS);
  }

  elements.refreshButton.addEventListener("click", loadDashboard);
  elements.logoutButton.addEventListener("click", redirectToLogin);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadDashboard();
    }
  });

  loadDashboard();
  scheduleRefresh();
})();
