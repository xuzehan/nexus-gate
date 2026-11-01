(function () {
  "use strict";

  if (!window.MHDEES.ensureLogin()) return;

  const params = new URLSearchParams(window.location.search);
  const requirementId = Number(params.get("id"));
  let pollTimer = 0;
  if (!Number.isInteger(requirementId) || requirementId <= 0) {
    window.location.replace("./mhdees.html");
    return;
  }

  const policyLabels = Object.freeze({
    capacity: "承载能力",
    delay: "传输延迟",
    jitter: "抖动",
    hops: "跳数"
  });
  const runStatusMap = Object.freeze({
    running: "执行中",
    succeeded: "执行成功",
    failed: "执行失败",
    stopped: "已停止"
  });

  const elements = {
    title: document.getElementById("detail-title"),
    number: document.getElementById("detail-no"),
    status: document.getElementById("detail-status"),
    tags: document.getElementById("detail-tags"),
    back: document.getElementById("back-link"),
    message: document.getElementById("detail-message"),
    name: document.getElementById("info-name"),
    business: document.getElementById("info-business"),
    verification: document.getElementById("info-verification"),
    owner: document.getElementById("info-owner"),
    created: document.getElementById("info-created"),
    updated: document.getElementById("info-updated"),
    constellationName: document.getElementById("constellation-name"),
    constellationScale: document.getElementById("constellation-scale"),
    altitude: document.getElementById("orbit-altitude"),
    inclination: document.getElementById("orbit-inclination"),
    constellationConfig: document.getElementById("constellation-config"),
    linkRates: document.getElementById("link-rates"),
    remark: document.getElementById("constellation-remark"),
    policyBody: document.getElementById("policy-body"),
    speed: document.getElementById("sim-speed"),
    duration: document.getElementById("sim-duration"),
    start: document.getElementById("sim-start"),
    end: document.getElementById("sim-end"),
    runs: document.getElementById("run-list"),
    history: document.getElementById("history-list"),
    actions: document.getElementById("detail-actions")
  };

  function setText(node, value) {
    node.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
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

  function renderTags(requirement) {
    elements.tags.replaceChildren(
      MHDEES.element("span", "", requirement.business_direction_name),
      MHDEES.element("span", "", requirement.verification_type_name),
      MHDEES.element("span", "", `提出人 ${requirement.created_by_username}`)
    );
  }

  function renderPolicies(policies) {
    elements.policyBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const policy of [...policies].sort((a, b) => a.sort_order - b.sort_order)) {
      const row = MHDEES.element("tr");
      row.append(
        MHDEES.element("td", "", policyLabels[policy.policy_type] || policy.policy_type),
        MHDEES.element("td", "mono-cell", MHDEES.formatNumber(policy.start_value)),
        MHDEES.element("td", "mono-cell", MHDEES.formatNumber(policy.end_value)),
        MHDEES.element("td", "mono-cell", MHDEES.formatNumber(policy.step_value)),
        MHDEES.element("td", "", policy.unit_display)
      );
      fragment.append(row);
    }
    elements.policyBody.append(fragment);
  }

  function renderRuns(runs) {
    elements.runs.replaceChildren();
    if (!runs.length) {
      elements.runs.append(MHDEES.element("p", "run-error", "尚未提交仿真。"));
      return;
    }
    for (const run of runs) {
      const card = MHDEES.element("article", "run-card");
      const meta = MHDEES.element("div", "run-meta");
      meta.append(
        MHDEES.element("span", "", runStatusMap[run.run_status] || run.run_status),
        MHDEES.element(
          "span",
          "",
          `${MHDEES.formatDateTime(run.started_at)} · ${Number(run.progress).toFixed(2)}%`
        )
      );
      const track = MHDEES.element("div", "progress-track");
      const fill = MHDEES.element("div", "progress-fill");
      fill.style.width = `${Math.max(0, Math.min(100, Number(run.progress)))}%`;
      track.append(fill);
      card.append(meta, track);
      if (run.failure_reason) {
        card.append(MHDEES.element("p", "run-error", run.failure_reason));
      }
      elements.runs.append(card);
    }
  }

  function renderHistory(history) {
    elements.history.replaceChildren();
    if (!history.length) {
      elements.history.append(MHDEES.element("li", "run-error", "暂无状态记录。"));
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of history) {
      const entry = MHDEES.element("li", "history-item");
      const dot = MHDEES.element("span", "history-dot");
      const body = MHDEES.element("div", "history-body");
      const status = MHDEES.statusInfo(item.to_status).label;
      body.append(MHDEES.element("strong", "", status));
      const details = [
        item.reason,
        item.operator_username ? `操作人 ${item.operator_username}` : null,
        MHDEES.formatDateTime(item.created_at)
      ]
        .filter(Boolean)
        .join(" · ");
      body.append(MHDEES.element("p", "", details));
      entry.append(dot, body);
      fragment.append(entry);
    }
    elements.history.append(fragment);
  }

  function renderActions(status) {
    elements.actions.replaceChildren();
    elements.actions.append(
      actionLink("查看工作台", "./mhdees.html", "quiet")
    );
    if (status === "draft") {
      elements.actions.append(
        actionLink("编辑需求", `./mhdees_create.html?id=${requirementId}`),
        actionButton("提交仿真", "submit", "primary"),
        actionButton("删除", "delete", "danger-quiet")
      );
    } else if (status === "running") {
      elements.actions.append(actionButton("停止仿真", "stop", "danger"));
    } else if (status === "cancelled") {
      elements.actions.append(
        actionButton("重新提交仿真", "submit", "primary"),
        actionButton("删除", "delete", "danger-quiet")
      );
    } else if (status === "report_generated" || status === "evaluating") {
      elements.actions.append(
        actionLink("查看报告与评价", `./mhdees_report.html?id=${requirementId}`, "primary")
      );
    } else if (status === "completed") {
      elements.actions.append(
        actionLink("查看报告", `./mhdees_report.html?id=${requirementId}`, "primary"),
        actionButton("归档需求", "archive")
      );
    } else if (status === "archived") {
      elements.actions.append(
        actionLink("查看报告", `./mhdees_report.html?id=${requirementId}`, "primary")
      );
    }
  }

  function render(requirement) {
    setText(elements.title, requirement.requirement_name);
    document.title = `${requirement.requirement_name} | MHD-EES`;
    setText(elements.number, requirement.requirement_no);
    MHDEES.setStatusBadge(elements.status, requirement.status);
    renderTags(requirement);

    setText(elements.name, requirement.requirement_name);
    setText(elements.business, requirement.business_direction_name);
    setText(elements.verification, requirement.verification_type_name);
    setText(elements.owner, requirement.created_by_username);
    setText(elements.created, MHDEES.formatDateTime(requirement.created_at));
    setText(elements.updated, MHDEES.formatDateTime(requirement.updated_at));

    const constellation = requirement.constellation || {};
    setText(elements.constellationName, constellation.constellation_name);
    setText(
      elements.constellationScale,
      constellation.satellite_total
        ? `${constellation.satellite_total} 星 / ${constellation.orbit_plane_count} 面 / 每面 ${constellation.satellites_per_plane} 星`
        : null
    );
    setText(
      elements.altitude,
      constellation.orbit_altitude_km
        ? `${constellation.orbit_altitude_km} km`
        : null
    );
    setText(
      elements.inclination,
      constellation.orbit_inclination_deg !== undefined
        ? `${MHDEES.formatNumber(constellation.orbit_inclination_deg, 2)}°`
        : null
    );
    setText(elements.constellationConfig, constellation.constellation_config);
    setText(
      elements.linkRates,
      constellation.inter_satellite_rate_gbps
        ? `星间 ${MHDEES.formatNumber(constellation.inter_satellite_rate_gbps)} / Q/V ${MHDEES.formatNumber(constellation.qv_feed_rate_gbps)} Gbps`
        : null
    );
    setText(elements.remark, constellation.remark);
    renderPolicies(requirement.algorithm_policies || []);

    const simulation = requirement.simulation || {};
    setText(elements.speed, simulation.speed_multiplier ? `${simulation.speed_multiplier}×` : null);
    setText(
      elements.duration,
      simulation.simulation_duration_minutes
        ? `${simulation.simulation_duration_minutes} 分钟`
        : null
    );
    setText(elements.start, MHDEES.formatDateTime(simulation.simulation_start_at));
    setText(elements.end, MHDEES.formatDateTime(simulation.simulation_end_at));
    renderRuns(requirement.runs || []);
    renderHistory(requirement.status_history || []);
    renderActions(requirement.status);

    window.clearTimeout(pollTimer);
    if (requirement.status === "running" || requirement.status === "pending_report") {
      pollTimer = window.setTimeout(loadDetail, 7000);
    }
  }

  async function loadDetail() {
    try {
      const requirement = await MHDEES.request(
        `/api/mhdees/requirements/${requirementId}`
      );
      MHDEES.showMessage(elements.message, "");
      render(requirement);
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
      elements.title.textContent = "需求读取失败";
    }
  }

  async function runAction(action) {
    if (action === "delete") {
      if (!window.confirm("删除后相关运行、报告和评价将一并清理，是否继续？")) return;
      try {
        await MHDEES.request(`/api/mhdees/requirements/${requirementId}`, {
          method: "DELETE"
        });
        window.location.replace("./mhdees.html");
      } catch (error) {
        MHDEES.showMessage(elements.message, error.message);
      }
      return;
    }
    const endpoints = {
      submit: ["submit-simulation", "仿真已提交"],
      stop: ["stop-simulation", "仿真已停止"],
      archive: ["archive", "需求已归档"]
    };
    const target = endpoints[action];
    if (!target) return;
    if (action === "archive" && !window.confirm("归档后需求只读并可作为模板，是否继续？")) {
      return;
    }
    try {
      await MHDEES.request(
        `/api/mhdees/requirements/${requirementId}/${target[0]}`,
        { method: "POST" }
      );
      MHDEES.toast(target[1]);
      await loadDetail();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
    }
  }

  elements.actions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) runAction(button.dataset.action);
  });

  if (params.get("from") === "create") {
    elements.back.textContent = "返回新建需求";
    elements.back.href = "./mhdees_create.html";
  }
  loadDetail();
})();
