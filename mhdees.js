(function () {
  "use strict";

  if (!window.MHDEES.ensureLogin()) return;

  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
    pages: 1
  };

  const elements = {
    form: document.getElementById("filter-form"),
    keyword: document.getElementById("keyword-filter"),
    status: document.getElementById("status-filter"),
    business: document.getElementById("business-filter"),
    verification: document.getElementById("verification-filter"),
    body: document.getElementById("requirements-body"),
    message: document.getElementById("workspace-message"),
    count: document.getElementById("record-count"),
    pageSummary: document.getElementById("page-summary"),
    previous: document.getElementById("previous-page"),
    next: document.getElementById("next-page")
  };

  function buildQuery() {
    const params = new URLSearchParams({
      page: String(state.page),
      page_size: String(state.pageSize)
    });
    const values = {
      keyword: elements.keyword.value.trim(),
      status: elements.status.value,
      business_direction_id: elements.business.value,
      verification_type_id: elements.verification.value
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }

  function actionLink(label, href, tone = "secondary") {
    const link = MHDEES.element("a", `button button-${tone} button-small`, label);
    link.href = href;
    return link;
  }

  function actionButton(label, action, id, tone = "secondary") {
    const button = MHDEES.element("button", `button button-${tone} button-small`, label);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = String(id);
    return button;
  }

  function renderActions(item) {
    const cell = MHDEES.element("td", "operations-cell");
    const group = MHDEES.element("div", "row-actions");
    group.append(actionLink("查看", `./mhdees_detail.html?id=${item.id}`));

    if (item.status === "draft") {
      group.append(
        actionLink("编辑", `./mhdees_create.html?id=${item.id}`, "quiet"),
        actionButton("提交仿真", "submit", item.id, "primary"),
        actionButton("删除", "delete", item.id, "danger-quiet")
      );
    } else if (item.status === "running" || item.status === "cancelled") {
      group.append(actionButton("删除", "delete", item.id, "danger-quiet"));
    } else if (
      ["report_generated", "evaluating", "completed", "archived"].includes(
        item.status
      )
    ) {
      group.append(
        actionLink(
          "查看报告",
          `./mhdees_report.html?id=${item.id}`,
          "primary"
        )
      );
    }
    cell.append(group);
    return cell;
  }

  function appendCell(row, value, className = "") {
    const cell = MHDEES.element("td", className, value);
    row.append(cell);
    return cell;
  }

  function renderRows(items) {
    elements.body.replaceChildren();
    if (!items.length) {
      const row = MHDEES.element("tr");
      const cell = MHDEES.element("td", "table-empty");
      cell.colSpan = 8;
      const title = MHDEES.element("strong", "", "暂无匹配的验证需求");
      const description = MHDEES.element(
        "span",
        "",
        "调整筛选条件，或新建一条验证需求。"
      );
      cell.append(title, description);
      row.append(cell);
      elements.body.append(row);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = MHDEES.element("tr");
      const number = appendCell(row, item.requirement_no, "mono-cell");
      number.dataset.label = "需求编号";
      const nameLink = MHDEES.element(
        "a",
        "table-primary-link",
        item.requirement_name
      );
      nameLink.href = `./mhdees_detail.html?id=${item.id}`;
      const nameCell = MHDEES.element("td");
      nameCell.dataset.label = "需求名称";
      nameCell.append(nameLink);
      row.append(nameCell);
      appendCell(row, item.business_direction_name).dataset.label = "业务方向";
      appendCell(row, item.verification_type_name).dataset.label = "验证类型";
      appendCell(row, item.created_by_username).dataset.label = "提出人";
      appendCell(row, MHDEES.formatDateTime(item.created_at)).dataset.label =
        "创建日期";
      const statusCell = MHDEES.element("td");
      statusCell.dataset.label = "状态";
      const badge = MHDEES.element("span");
      MHDEES.setStatusBadge(badge, item.status);
      statusCell.append(badge);
      row.append(statusCell, renderActions(item));
      fragment.append(row);
    }
    elements.body.append(fragment);
  }

  async function loadRequirements() {
    MHDEES.showMessage(elements.message, "");
    elements.body.innerHTML =
      '<tr><td colspan="8" class="table-loading">正在读取验证需求…</td></tr>';
    try {
      const data = await MHDEES.request(
        `/api/mhdees/requirements?${buildQuery()}`
      );
      state.total = data.total;
      state.pages = data.pages;
      if (state.page > data.pages) {
        state.page = data.pages;
        return loadRequirements();
      }
      renderRows(data.items);
      elements.count.textContent = `${data.total} 条需求`;
      elements.pageSummary.textContent = `第 ${data.page} / ${data.pages} 页 · 共 ${data.total} 条`;
      elements.previous.disabled = data.page <= 1;
      elements.next.disabled = data.page >= data.pages;
    } catch (error) {
      elements.body.replaceChildren();
      elements.count.textContent = "读取失败";
      MHDEES.showMessage(elements.message, error.message);
    }
  }

  async function submitRequirement(id) {
    if (!window.confirm("提交后将进入仿真执行状态，是否继续？")) return;
    try {
      await MHDEES.request(
        `/api/mhdees/requirements/${id}/submit-simulation`,
        { method: "POST" }
      );
      MHDEES.toast("仿真任务已提交");
      await loadRequirements();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
    }
  }

  async function deleteRequirement(id) {
    if (!window.confirm("删除后需求及其仿真、报告、评价记录将一并清理，是否继续？")) {
      return;
    }
    try {
      await MHDEES.request(`/api/mhdees/requirements/${id}`, {
        method: "DELETE"
      });
      MHDEES.toast("需求已删除");
      await loadRequirements();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
    }
  }

  async function loadDictionaries() {
    const [directions, types] = await Promise.all([
      MHDEES.request("/api/mhdees/dictionaries/business-directions"),
      MHDEES.request("/api/mhdees/dictionaries/verification-types")
    ]);
    MHDEES.fillSelect(elements.business, directions, "全部业务方向");
    MHDEES.fillSelect(elements.verification, types, "全部验证类型");
  }

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.page = 1;
    loadRequirements();
  });
  elements.status.addEventListener("change", () => {
    state.page = 1;
    loadRequirements();
  });
  elements.business.addEventListener("change", () => {
    state.page = 1;
    loadRequirements();
  });
  elements.verification.addEventListener("change", () => {
    state.page = 1;
    loadRequirements();
  });
  elements.previous.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadRequirements();
    }
  });
  elements.next.addEventListener("click", () => {
    if (state.page < state.pages) {
      state.page += 1;
      loadRequirements();
    }
  });
  elements.body.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "submit") submitRequirement(id);
    if (button.dataset.action === "delete") deleteRequirement(id);
  });

  Promise.all([loadDictionaries(), loadRequirements()]).catch((error) => {
    MHDEES.showMessage(elements.message, error.message);
    elements.count.textContent = "读取失败";
  });
})();
