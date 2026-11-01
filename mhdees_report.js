(function () {
  "use strict";

  if (!window.MHDEES.ensureLogin()) return;

  const requirementId = Number(new URLSearchParams(window.location.search).get("id"));
  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    window.location.replace("./mhdees.html");
    return;
  }

  let requirement = null;
  let report = null;

  const elements = {
    title: document.getElementById("report-title"),
    subtitle: document.getElementById("report-subtitle"),
    status: document.getElementById("report-status"),
    score: document.getElementById("overall-score"),
    grade: document.getElementById("report-grade"),
    detailBack: document.getElementById("detail-back"),
    message: document.getElementById("report-message"),
    indicators: document.getElementById("indicator-list"),
    series: document.getElementById("series-grid"),
    intelligent: document.getElementById("intelligent-comment"),
    summary: document.getElementById("report-summary"),
    lineage: document.getElementById("lineage-list"),
    form: document.getElementById("evaluation-form"),
    manual: document.getElementById("manual-comment"),
    evaluationMessage: document.getElementById("evaluation-message"),
    evaluationButton: document.getElementById("submit-evaluation"),
    evaluationList: document.getElementById("evaluation-list"),
    actions: document.getElementById("report-actions")
  };

  function renderIndicators(items) {
    elements.indicators.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = MHDEES.element("div", "indicator-row");
      const bar = MHDEES.element("div", "metric-bar");
      const fill = MHDEES.element("span");
      const score = Math.max(0, Math.min(100, Number(item.score)));
      fill.style.width = `${score}%`;
      bar.append(fill);
      row.append(
        MHDEES.element("span", "", item.name),
        bar,
        MHDEES.element("strong", "", `${item.score}${item.unit || ""}`)
      );
      fragment.append(row);
    }
    elements.indicators.append(fragment);
  }

  function renderSeries(items) {
    elements.series.replaceChildren();
    const values = items.map((item) => Number(item.throughput_gbps) || 0);
    const maximum = Math.max(...values, 1);
    for (const item of items) {
      const column = MHDEES.element("div", "series-column");
      const bar = MHDEES.element("span");
      const value = Number(item.throughput_gbps) || 0;
      bar.style.height = `${Math.max(6, (value / maximum) * 100)}%`;
      bar.title = `${item.label}: ${value} Gbps / ${item.latency_ms} ms`;
      column.append(bar, MHDEES.element("small", "", item.label));
      elements.series.append(column);
    }
  }

  function renderLineage(items) {
    elements.lineage.replaceChildren();
    for (const item of items || []) {
      elements.lineage.append(MHDEES.element("li", "", item));
    }
  }

  function renderEvaluations(items) {
    elements.evaluationList.replaceChildren();
    if (!items.length) {
      elements.evaluationList.append(
        MHDEES.element("p", "field-note", "尚无人工评价记录。")
      );
      return;
    }
    for (const item of items) {
      const card = MHDEES.element("article", "evaluation-card");
      const header = MHDEES.element("header");
      header.append(
        MHDEES.element("span", "", item.evaluator_username || "系统"),
        MHDEES.element("span", "", MHDEES.formatDateTime(item.created_at))
      );
      card.append(
        header,
        MHDEES.element("p", "", item.manual_comment || "未填写人工评价")
      );
      if (item.intelligent_comment) {
        const ai = MHDEES.element(
          "p",
          "field-note",
          `智能评论：${item.intelligent_comment}`
        );
        card.append(ai);
      }
      elements.evaluationList.append(card);
    }
  }

  function actionLink(label, href, tone = "secondary") {
    const link = MHDEES.element("a", `button button-${tone}`, label);
    link.href = href;
    return link;
  }

  function actionButton(label, action, tone = "secondary") {
    const button = MHDEES.element("button", `button button-${tone}`, label);
    button.type = "button";
    button.dataset.action = action;
    return button;
  }

  function renderActions() {
    elements.actions.replaceChildren(
      actionLink("查看需求详情", `./mhdees_detail.html?id=${requirementId}`, "quiet"),
      actionLink("返回工作台", "./mhdees.html")
    );
    if (requirement.status === "evaluating") {
      elements.actions.append(actionButton("确认评价完成", "complete", "primary"));
    }
    if (requirement.status === "completed") {
      elements.actions.append(actionButton("归档需求", "archive", "primary"));
    }
  }

  function updateEvaluationControls() {
    const canEvaluate = requirement.status === "report_generated";
    elements.form.hidden = !canEvaluate;
    elements.form.style.display = canEvaluate ? "grid" : "none";
    MHDEES.setBusy(elements.evaluationButton, false);
    elements.evaluationButton.disabled = !canEvaluate;
    if (!canEvaluate && requirement.status === "evaluating") {
      MHDEES.showMessage(
        elements.evaluationMessage,
        "评价已提交，确认后需求将进入已完成状态。",
        "info"
      );
    }
  }

  function renderReport() {
    const data = report.result_json || {};
    const result = data;
    elements.score.textContent = result.overall_score ?? "—";
    elements.grade.textContent = `评级 ${result.grade || "—"}`;
    elements.summary.textContent = result.summary || "暂无摘要。";
    elements.intelligent.textContent = result.intelligent_comment || "暂无智能评论。";
    renderIndicators(result.indicators || []);
    renderSeries(result.series || []);
    renderLineage(result.data_lineage || []);
  }

  function render() {
    MHDEES.setStatusBadge(elements.status, requirement.status);
    elements.title.textContent = `${requirement.requirement_name} · 仿真效能报告`;
    document.title = `${requirement.requirement_name} 报告 | MHD-EES`;
    elements.subtitle.textContent = `${requirement.requirement_no} · ${requirement.business_direction_name} / ${requirement.verification_type_name}`;
    elements.detailBack.href = `./mhdees_detail.html?id=${requirementId}`;
    renderReport();
    updateEvaluationControls();
    renderActions();
  }

  async function loadAll() {
    try {
      const [detailData, reportData, evaluations] = await Promise.all([
        MHDEES.request(`/api/mhdees/requirements/${requirementId}`),
        MHDEES.request(`/api/mhdees/requirements/${requirementId}/report`),
        MHDEES.request(`/api/mhdees/requirements/${requirementId}/evaluations`)
      ]);
      requirement = detailData;
      report = reportData;
      MHDEES.showMessage(elements.message, "");
      render();
      renderEvaluations(evaluations);
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
      elements.title.textContent = "报告尚不可用";
    }
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    MHDEES.showMessage(elements.evaluationMessage, "");
    if (!elements.form.reportValidity()) return;
    MHDEES.setBusy(elements.evaluationButton, true, "提交中…");
    try {
      const data = report.result_json || {};
      await MHDEES.request(
        `/api/mhdees/requirements/${requirementId}/evaluations`,
        {
          method: "POST",
          body: {
            intelligent_comment: data.intelligent_comment || null,
            manual_comment: elements.manual.value.trim(),
            evaluation_result_json: {
              overall_score: data.overall_score,
              grade: data.grade
            }
          }
        }
      );
      MHDEES.toast("评价已提交");
      await loadAll();
    } catch (error) {
      MHDEES.showMessage(elements.evaluationMessage, error.message);
      MHDEES.setBusy(elements.evaluationButton, false);
    }
  });

  elements.actions.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "archive" && !window.confirm("归档后需求只读并可作为模板，是否继续？")) {
      return;
    }
    const endpoint = action === "complete" ? "complete-evaluation" : action;
    const successText = action === "complete" ? "评价已确认完成" : "需求已归档";
    MHDEES.setBusy(button, true);
    try {
      await MHDEES.request(
        `/api/mhdees/requirements/${requirementId}/${endpoint}`,
        { method: "POST" }
      );
      MHDEES.toast(successText);
      await loadAll();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
      MHDEES.setBusy(button, false);
    }
  });

  loadAll();
})();
