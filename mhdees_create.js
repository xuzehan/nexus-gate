(function () {
  "use strict";

  if (!window.MHDEES.ensureLogin()) return;

  const presets = Object.freeze({
    "108": { total: 108, planes: 12, perPlane: 9, altitude: 1150 },
    "98": { total: 98, planes: 11, perPlane: 9, altitude: 1150 },
    "60": { total: 60, planes: 10, perPlane: 6, altitude: 1150 },
    "35": { total: 35, planes: 5, perPlane: 7, altitude: 550 },
    "24": { total: 24, planes: 24, perPlane: 1, altitude: 550 }
  });
  const editId = Number(new URLSearchParams(window.location.search).get("id"));
  const isEditing = Number.isInteger(editId) && editId > 0;
  let templateTimer = 0;

  const elements = {
    form: document.getElementById("requirement-form"),
    message: document.getElementById("form-message"),
    pageTitle: document.getElementById("page-title"),
    name: document.getElementById("requirement-name"),
    business: document.getElementById("business-direction"),
    verification: document.getElementById("verification-type"),
    templateHint: document.getElementById("template-hint"),
    templateList: document.getElementById("template-list"),
    constellationName: document.getElementById("constellation-name"),
    satelliteTotal: document.getElementById("satellite-total"),
    orbitPlanes: document.getElementById("orbit-plane-count"),
    perPlane: document.getElementById("satellites-per-plane"),
    altitude: document.getElementById("orbit-altitude"),
    inclination: document.getElementById("orbit-inclination"),
    constellationConfig: document.getElementById("constellation-config"),
    interRate: document.getElementById("inter-satellite-rate"),
    qvRate: document.getElementById("qv-feed-rate"),
    remark: document.getElementById("constellation-remark"),
    speed: document.getElementById("speed-multiplier"),
    duration: document.getElementById("simulation-duration"),
    start: document.getElementById("simulation-start"),
    end: document.getElementById("simulation-end"),
    save: document.getElementById("save-requirement")
  };

  function toLocalInputValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function setMinimumStart() {
    const min = new Date(Date.now() + 5 * 60 * 1000);
    min.setSeconds(0, 0);
    elements.start.min = toLocalInputValue(min);
  }

  function applyConstellation() {
    const preset = presets[elements.constellationName.value];
    if (!preset) return;
    elements.satelliteTotal.value = String(preset.total);
    elements.orbitPlanes.value = String(preset.planes);
    elements.perPlane.value = String(preset.perPlane);
    elements.altitude.value = String(preset.altitude);
    updatePreview();
  }

  function calculateEnd() {
    if (!elements.start.value) {
      elements.end.value = "";
      return;
    }
    const start = new Date(elements.start.value);
    const durationMinutes = Number(elements.duration.value);
    const speed = Number(elements.speed.value);
    if (Number.isNaN(start.getTime()) || !durationMinutes || !speed) return;
    const end = new Date(start.getTime() + (durationMinutes * 60 * 1000) / speed);
    elements.end.value = MHDEES.formatDateTime(end.toISOString());
    updatePreview();
  }

  function selectedText(select) {
    return select.selectedOptions[0]?.textContent ?? "—";
  }

  function updatePreview() {
    const preview = {
      name: elements.name.value.trim() || "未填写",
      business: selectedText(elements.business),
      verification: selectedText(elements.verification),
      constellation: `${elements.constellationName.value} 星座 / ${elements.satelliteTotal.value || "—"} 卫星`,
      rates: `${MHDEES.formatNumber(elements.interRate.value || 0)} / ${MHDEES.formatNumber(elements.qvRate.value || 0)} Gbps`,
      window:
        elements.start.value && elements.end.value
          ? `${MHDEES.formatDateTime(elements.start.value)} → ${elements.end.value}`
          : "待配置"
    };
    for (const [key, value] of Object.entries(preview)) {
      const node = document.querySelector(`[data-preview="${key}"]`);
      if (node) node.textContent = value;
    }
  }

  function policyValues() {
    return [...document.querySelectorAll("tr[data-policy]")].map((row) => {
      const value = (field) => row.querySelector(`[data-field="${field}"]`).value;
      return {
        policy_type: row.dataset.policy,
        start_value: Number(value("start")),
        end_value: Number(value("end")),
        step_value: Number(value("step")),
        _row: row
      };
    });
  }

  function buildPayload() {
    const policies = policyValues();
    for (const policy of policies) {
      if (
        !Number.isFinite(policy.start_value) ||
        !Number.isFinite(policy.end_value) ||
        !Number.isFinite(policy.step_value)
      ) {
        throw new Error("算法策略区间和步长必须填写数字。");
      }
      if (policy.end_value < policy.start_value) {
        throw new Error("算法策略的结束区间不能小于开始区间。");
      }
      if (policy.step_value <= 0) {
        throw new Error("算法策略步长必须大于 0。");
      }
      delete policy._row;
    }
    if (!elements.start.value) {
      throw new Error("请选择仿真开始时间。");
    }
    const start = new Date(elements.start.value);
    if (start.getTime() <= Date.now()) {
      throw new Error("仿真开始时间必须晚于当前时间。");
    }
    return {
      requirement_name: elements.name.value.trim(),
      business_direction_id: Number(elements.business.value),
      verification_type_id: Number(elements.verification.value),
      constellation: {
        constellation_name: elements.constellationName.value,
        satellite_total: Number(elements.satelliteTotal.value),
        orbit_plane_count: Number(elements.orbitPlanes.value),
        satellites_per_plane: Number(elements.perPlane.value),
        orbit_altitude_km: Number(elements.altitude.value),
        orbit_inclination_deg: Number(elements.inclination.value),
        constellation_config: elements.constellationConfig.value,
        inter_satellite_rate_gbps: Number(elements.interRate.value),
        qv_feed_rate_gbps: Number(elements.qvRate.value),
        remark: elements.remark.value.trim() || null
      },
      algorithm_policies: policies,
      simulation: {
        speed_multiplier: Number(elements.speed.value),
        simulation_start_at: start.toISOString(),
        simulation_duration_minutes: Number(elements.duration.value)
      }
    };
  }

  function populateForm(requirement) {
    elements.name.value = requirement.requirement_name || "";
    elements.business.value = String(requirement.business_direction_id || "");
    elements.verification.value = String(requirement.verification_type_id || "");
    const constellation = requirement.constellation;
    if (constellation) {
      elements.constellationName.value = constellation.constellation_name;
      elements.satelliteTotal.value = String(constellation.satellite_total);
      elements.orbitPlanes.value = String(constellation.orbit_plane_count);
      elements.perPlane.value = String(constellation.satellites_per_plane);
      elements.altitude.value = String(constellation.orbit_altitude_km);
      elements.inclination.value = String(constellation.orbit_inclination_deg);
      elements.constellationConfig.value = constellation.constellation_config;
      elements.interRate.value = String(constellation.inter_satellite_rate_gbps);
      elements.qvRate.value = String(constellation.qv_feed_rate_gbps);
      elements.remark.value = constellation.remark || "";
    }
    for (const policy of requirement.algorithm_policies || []) {
      const row = document.querySelector(`tr[data-policy="${policy.policy_type}"]`);
      if (!row) continue;
      row.querySelector('[data-field="start"]').value = String(policy.start_value);
      row.querySelector('[data-field="end"]').value = String(policy.end_value);
      row.querySelector('[data-field="step"]').value = String(policy.step_value);
    }
    if (requirement.simulation) {
      elements.speed.value = String(requirement.simulation.speed_multiplier);
      elements.duration.value = String(
        requirement.simulation.simulation_duration_minutes
      );
      elements.start.value = toLocalInputValue(
        new Date(String(requirement.simulation.simulation_start_at).replace(" ", "T"))
      );
    }
    calculateEnd();
    updatePreview();
  }

  async function applyTemplate(id) {
    try {
      const requirement = await MHDEES.request(
        `/api/mhdees/requirements/${id}`
      );
      populateForm(requirement);
      elements.name.value = `${requirement.requirement_name}（引用）`;
      MHDEES.showMessage(
        elements.message,
        `已引用模板 ${requirement.requirement_no}，请复核并调整参数。`,
        "success"
      );
      updatePreview();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
    }
  }

  function renderTemplates(items) {
    elements.templateList.replaceChildren();
    if (!items.length) {
      elements.templateHint.textContent =
        "未找到匹配的已归档需求，可以继续填写当前需求。";
      return;
    }
    elements.templateHint.textContent = `找到 ${items.length} 条已归档需求，可引用参数或查看详情。`;
    for (const item of items) {
      const row = MHDEES.element("div", "template-row");
      const copy = MHDEES.element("div");
      copy.append(
        MHDEES.element("strong", "", item.requirement_name),
        MHDEES.element(
          "span",
          "",
          `${item.requirement_no} · ${MHDEES.formatDateTime(item.created_at)}`
        )
      );
      const actions = MHDEES.element("div", "template-actions");
      const use = MHDEES.element("button", "button button-primary button-small", "引用模板");
      use.type = "button";
      use.addEventListener("click", () => applyTemplate(item.id));
      const view = MHDEES.element("a", "button button-quiet button-small", "查看详情");
      view.href = `./mhdees_detail.html?id=${item.id}&from=create`;
      actions.append(use, view);
      row.append(copy, actions);
      elements.templateList.append(row);
    }
  }

  async function searchTemplates() {
    const keyword = elements.name.value.trim();
    const businessId = elements.business.value;
    const verificationId = elements.verification.value;
    if (!keyword || !businessId || !verificationId) {
      elements.templateList.replaceChildren();
      elements.templateHint.textContent =
        "填写名称并选择方向、类型后，将搜索已归档需求。";
      return;
    }
    const params = new URLSearchParams({
      keyword,
      business_direction_id: businessId,
      verification_type_id: verificationId
    });
    elements.templateHint.textContent = "正在搜索历史模板…";
    try {
      const items = await MHDEES.request(
        `/api/mhdees/requirements/templates?${params}`
      );
      renderTemplates(items);
    } catch (error) {
      elements.templateHint.textContent = error.message;
    }
  }

  function debounceTemplateSearch() {
    window.clearTimeout(templateTimer);
    templateTimer = window.setTimeout(searchTemplates, 350);
  }

  async function loadDictionaries() {
    const [directions, types] = await Promise.all([
      MHDEES.request("/api/mhdees/dictionaries/business-directions"),
      MHDEES.request("/api/mhdees/dictionaries/verification-types")
    ]);
    MHDEES.fillSelect(elements.business, directions);
    MHDEES.fillSelect(elements.verification, types);
    const carrier = directions.find((item) => item.code === "carrier_network");
    if (carrier && !isEditing) elements.business.value = String(carrier.id);
    if (types[0] && !isEditing) elements.verification.value = String(types[0].id);
    updatePreview();
  }

  async function loadForEdit() {
    elements.pageTitle.textContent = "编辑验证需求";
    elements.save.textContent = "保存修改";
    const requirement = await MHDEES.request(
      `/api/mhdees/requirements/${editId}`
    );
    if (requirement.status !== "draft") {
      elements.save.disabled = true;
      MHDEES.showMessage(elements.message, "仅草稿状态的需求可以编辑。");
    }
    populateForm(requirement);
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    MHDEES.showMessage(elements.message, "");
    if (!elements.form.reportValidity()) {
      MHDEES.showMessage(elements.message, "请补全所有必填字段。");
      return;
    }
    let payload;
    try {
      payload = buildPayload();
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
      return;
    }
    MHDEES.setBusy(elements.save, true, isEditing ? "保存中…" : "创建中…");
    try {
      const path = isEditing
        ? `/api/mhdees/requirements/${editId}`
        : "/api/mhdees/requirements";
      const requirement = await MHDEES.request(path, {
        method: isEditing ? "PUT" : "POST",
        body: payload
      });
      MHDEES.toast(isEditing ? "需求草稿已更新" : "需求草稿已创建");
      window.location.href = `./mhdees_detail.html?id=${requirement.id}`;
    } catch (error) {
      MHDEES.showMessage(elements.message, error.message);
      MHDEES.setBusy(elements.save, false);
    }
  });

  elements.constellationName.addEventListener("change", applyConstellation);
  elements.speed.addEventListener("change", calculateEnd);
  elements.duration.addEventListener("change", calculateEnd);
  elements.start.addEventListener("input", calculateEnd);
  elements.name.addEventListener("input", debounceTemplateSearch);
  elements.business.addEventListener("change", debounceTemplateSearch);
  elements.verification.addEventListener("change", debounceTemplateSearch);
  elements.form.addEventListener("input", (event) => {
    if (event.target.matches("input, select, textarea")) updatePreview();
  });

  setMinimumStart();
  applyConstellation();
  calculateEnd();
  updatePreview();
  loadDictionaries()
    .then(() => (isEditing ? loadForEdit() : searchTemplates()))
    .catch((error) => MHDEES.showMessage(elements.message, error.message));
})();
