(function () {
  "use strict";

  const TOKEN_KEY = "nexusgate_access_token";
  const statusMap = Object.freeze({
    draft: ["草稿", "muted"],
    running: ["仿真执行中", "running"],
    cancelled: ["取消执行", "danger"],
    pending_report: ["待生成报告", "warning"],
    report_generated: ["报告已生成", "success"],
    evaluating: ["评价中", "info"],
    completed: ["已完成", "success"],
    archived: ["已归档", "muted"]
  });

  function apiBaseUrl() {
    return String(window.NEXUS_CONFIG?.MHDEES_API_BASE_URL ?? "")
      .trim()
      .replace(/\/+$/, "");
  }

  function ensureLogin() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      window.location.replace("./index.html");
      return false;
    }
    return true;
  }

  function redirectToLogin() {
    localStorage.removeItem(TOKEN_KEY);
    window.location.replace("./index.html");
  }

  async function request(path, options = {}) {
    const baseUrl = apiBaseUrl();
    if (!baseUrl) {
      throw new Error("请先在 config.js 中配置 MHDEES_API_BASE_URL。");
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      redirectToLogin();
      throw new Error("登录状态已失效");
    }

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    };
    const requestOptions = {
      method: options.method ?? "GET",
      headers
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, requestOptions);
    } catch (error) {
      throw new Error("无法连接 MHD-EES API，请检查服务地址和网络。", {
        cause: error
      });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      redirectToLogin();
      throw new Error("登录状态已失效");
    }
    if (!response.ok) {
      throw new Error(payload?.message || `请求失败（HTTP ${response.status}）`);
    }
    if (payload && payload.code !== 0) {
      throw new Error(payload.message || "接口返回异常");
    }
    return payload?.data;
  }

  function statusInfo(value) {
    const [label, tone] = statusMap[value] || [value || "未知状态", "muted"];
    return { label, tone };
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function formatNumber(value, maximumFractionDigits = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits
    }).format(number);
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setStatusBadge(node, status) {
    const info = statusInfo(status);
    node.className = `status-badge status-${info.tone}`;
    node.textContent = info.label;
  }

  function fillSelect(select, items, placeholder) {
    const current = select.value;
    select.replaceChildren();
    if (placeholder) {
      const option = element("option", "", placeholder);
      option.value = "";
      select.append(option);
    }
    for (const item of items) {
      const option = element("option", "", item.name);
      option.value = String(item.id);
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === current)) {
      select.value = current;
    }
  }

  function toast(message, tone = "success") {
    let node = document.getElementById("mhdees-toast");
    if (!node) {
      node = element("div", "app-toast");
      node.id = "mhdees-toast";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.append(node);
    }
    node.className = `app-toast is-visible toast-${tone}`;
    node.textContent = message;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      node.classList.remove("is-visible");
    }, 3600);
  }

  function setBusy(button, busy, busyText = "处理中…") {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function showMessage(node, message, tone = "danger") {
    if (!node) return;
    node.textContent = message || "";
    node.className = `inline-message message-${tone}`;
    node.hidden = !message;
  }

  window.MHDEES = Object.freeze({
    TOKEN_KEY,
    request,
    ensureLogin,
    redirectToLogin,
    statusInfo,
    formatDateTime,
    formatNumber,
    element,
    setStatusBadge,
    fillSelect,
    toast,
    setBusy,
    showMessage
  });
})();
