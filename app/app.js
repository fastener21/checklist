(function () {
  const data = window.CHECKLIST_DATA || { title: "", items: [] };
  const items = data.items;
  const storageKey = "brussels-checklist-state-v1";

  const els = {
    list: document.querySelector("#list"),
    empty: document.querySelector("#emptyState"),
    progressLabel: document.querySelector("#progressLabel"),
    progressPercent: document.querySelector("#progressPercent"),
    progressBar: document.querySelector("#progressBar"),
    requiredCount: document.querySelector("#requiredCount"),
    purchaseCount: document.querySelector("#purchaseCount"),
    airCount: document.querySelector("#airCount"),
    seaCount: document.querySelector("#seaCount"),
    carryCount: document.querySelector("#carryCount"),
    search: document.querySelector("#searchInput"),
    category: document.querySelector("#categoryFilter"),
    pendingOnly: document.querySelector("#pendingOnly"),
    purchaseOnly: document.querySelector("#purchaseOnly"),
    routeButtons: Array.from(document.querySelectorAll("[data-route]")),
    importanceButtons: Array.from(document.querySelectorAll("[data-importance]")),
    activeFilters: document.querySelector("#activeFilters"),
    copyShare: document.querySelector("#copyShare"),
    exportState: document.querySelector("#exportState"),
    importState: document.querySelector("#importState"),
    checkVisible: document.querySelector("#checkVisible"),
    uncheckVisible: document.querySelector("#uncheckVisible"),
    resetAll: document.querySelector("#resetAll"),
    toast: document.querySelector("#toast")
  };

  const state = {
    checked: new Set(),
    required: new Set(),
    purchase: new Set(),
    query: "",
    category: "all",
    route: "all",
    importance: "all",
    pendingOnly: false
  };

  let visibleItems = [];
  let toastTimer = 0;

  init();

  function init() {
    hydrateCategories();
    loadLocalState();
    loadHashState();
    bindEvents();
    render();
    registerServiceWorker();
  }

  function bindEvents() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim().toLowerCase();
      render();
    });

    els.category.addEventListener("change", () => {
      state.category = els.category.value;
      render();
    });

    els.pendingOnly.addEventListener("change", () => {
      state.pendingOnly = els.pendingOnly.checked;
      render();
    });

    els.purchaseOnly.addEventListener("change", () => {
      state.purchaseOnly = els.purchaseOnly.checked;
      render();
    });

    els.routeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.route = button.dataset.route;
        els.routeButtons.forEach((entry) => entry.classList.toggle("is-active", entry === button));
        render();
      });
    });

    els.importanceButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.importance = button.dataset.importance;
        els.importanceButtons.forEach((entry) => entry.classList.toggle("is-active", entry === button));
        render();
      });
    });

    els.list.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-item-check]");
      if (!checkbox) return;
      setChecked(checkbox.value, checkbox.checked);
      render();
    });

    els.list.addEventListener("click", (event) => {
      const flagButton = event.target.closest("[data-flag]");
      if (!flagButton) return;
      toggleFlag(flagButton.dataset.flag, flagButton.dataset.id);
      render();
    });

    els.copyShare.addEventListener("click", copyShareLink);
    els.exportState.addEventListener("click", exportState);
    els.importState.addEventListener("change", importState);

    els.checkVisible.addEventListener("click", () => {
      visibleItems.forEach((item) => state.checked.add(item.id));
      saveLocalState();
      render();
      showToast("表示中のアイテムを準備済みにしました。");
    });

    els.uncheckVisible.addEventListener("click", () => {
      visibleItems.forEach((item) => state.checked.delete(item.id));
      saveLocalState();
      render();
      showToast("表示中のアイテムを未準備に戻しました。");
    });

    els.resetAll.addEventListener("click", () => {
      if (!window.confirm("すべてのチェックを外しますか？")) return;
      state.checked.clear();
      state.required.clear();
      state.purchase.clear();
      saveLocalState();
      render();
      showToast("チェック状態と印をリセットしました。");
    });
  }

  function hydrateCategories() {
    const categories = unique(items.map((item) => item.major)).sort((a, b) => a.localeCompare(b, "ja"));
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      els.category.append(option);
    });
  }

  function render() {
    visibleItems = getVisibleItems();
    renderSummary();
    renderFilters();
    renderList();
  }

  function getVisibleItems() {
    return items.filter((item) => {
      const text = `${item.major} ${item.middle} ${item.item} ${item.note} ${item.status}`.toLowerCase();
      const matchesQuery = !state.query || text.includes(state.query);
      const matchesCategory = state.category === "all" || item.major === state.category;
      const matchesRoute = state.route === "all" || item.routes[state.route];
      const matchesImportance =
        state.importance === "all" ||
        (state.importance === "required" && state.required.has(item.id)) ||
        (state.importance === "optional" && !state.required.has(item.id));
      const matchesPending = !state.pendingOnly || !state.checked.has(item.id);
      const matchesPurchase = !state.purchaseOnly || state.purchase.has(item.id);
      return matchesQuery && matchesCategory && matchesRoute && matchesImportance && matchesPending && matchesPurchase;
    });
  }

  function renderSummary() {
    const total = items.length;
    const done = state.checked.size;
    const percent = total ? Math.round((done / total) * 100) : 0;
    els.progressLabel.textContent = `${done} / ${total}`;
    els.progressPercent.textContent = `${percent}%`;
    els.progressBar.style.width = `${percent}%`;

    els.requiredCount.textContent = `${state.required.size}`;
    els.purchaseCount.textContent = `${state.purchase.size}`;
    els.airCount.textContent = countRoute("air");
    els.seaCount.textContent = countRoute("sea");
    els.carryCount.textContent = countRoute("carry");
  }

  function renderFilters() {
    const chips = [];
    if (state.query) chips.push(`検索: ${state.query}`);
    if (state.category !== "all") chips.push(state.category);
    if (state.route !== "all") chips.push(routeLabel(state.route));
    if (state.importance !== "all") chips.push(state.importance === "required" ? "必須" : "任意");
    if (state.pendingOnly) chips.push("未準備のみ");
    if (state.purchaseOnly) chips.push("購入必要のみ");

    els.activeFilters.replaceChildren(
      ...chips.map((label) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = label;
        return chip;
      })
    );
  }

  function renderList() {
    els.empty.hidden = visibleItems.length !== 0;
    if (!visibleItems.length) {
      els.list.replaceChildren();
      return;
    }

    const groups = groupBy(visibleItems, (item) => item.major);
    const fragments = Object.entries(groups).map(([category, groupItems]) => {
      const done = groupItems.filter((item) => state.checked.has(item.id)).length;
      const section = document.createElement("article");
      section.className = "category";
      section.innerHTML = `
        <div class="category-header">
          <h2></h2>
          <span></span>
        </div>
        <div class="item-list"></div>
      `;
      section.querySelector("h2").textContent = category;
      section.querySelector("span").textContent = `${done} / ${groupItems.length}`;
      const list = section.querySelector(".item-list");
      list.replaceChildren(...groupItems.map(renderItem));
      return section;
    });
    els.list.replaceChildren(...fragments);
  }

  function renderItem(item) {
    const done = state.checked.has(item.id);
    const required = state.required.has(item.id);
    const purchase = state.purchase.has(item.id);
    const row = document.createElement("div");
    row.className = `item-row${done ? " is-done" : ""}`;
    row.innerHTML = `
      <label class="check-wrap">
        <input class="item-check" type="checkbox" data-item-check value="">
      </label>
      <div class="item-main">
        <div class="item-title">
          <strong></strong>
          <span class="subcat"></span>
        </div>
      </div>
      <div class="routes"></div>
      <div class="flags" aria-label="必須と購入必要の設定">
        <button class="flag flag-required" type="button" data-flag="required" data-id="">必須</button>
        <button class="flag flag-purchase" type="button" data-flag="purchase" data-id="">購入</button>
      </div>
    `;

    const checkbox = row.querySelector("input");
    checkbox.value = item.id;
    checkbox.checked = done;
    row.querySelectorAll("[data-id]").forEach((button) => {
      button.dataset.id = item.id;
    });
    row.querySelector(".flag-required").classList.toggle("is-on", required);
    row.querySelector(".flag-required").setAttribute("aria-pressed", String(required));
    row.querySelector(".flag-purchase").classList.toggle("is-on", purchase);
    row.querySelector(".flag-purchase").setAttribute("aria-pressed", String(purchase));
    row.querySelector("strong").textContent = item.item;
    row.querySelector(".subcat").textContent = item.middle;

    const title = row.querySelector(".item-title");
    if (required) {
      const tag = document.createElement("span");
      tag.className = "priority-tag required";
      tag.textContent = "必須";
      title.append(tag);
    }
    if (purchase) {
      const tag = document.createElement("span");
      tag.className = "priority-tag purchase";
      tag.textContent = "購入必要";
      title.append(tag);
    }
    if (item.status) {
      const status = document.createElement("span");
      status.className = "status";
      status.textContent = item.status;
      title.append(status);
    }

    if (item.note) {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = item.note;
      row.querySelector(".item-main").append(note);
    }

    const routes = row.querySelector(".routes");
    ["air", "sea", "carry"].forEach((route) => {
      if (!item.routes[route]) return;
      const tag = document.createElement("span");
      tag.className = `route ${route}`;
      tag.textContent = routeLabel(route);
      routes.append(tag);
    });

    return row;
  }

  function setChecked(id, checked) {
    if (checked) {
      state.checked.add(id);
    } else {
      state.checked.delete(id);
    }
    saveLocalState();
  }

  function toggleFlag(flag, id) {
    const target = flag === "required" ? state.required : state.purchase;
    if (target.has(id)) {
      target.delete(id);
    } else {
      target.add(id);
    }
    saveLocalState();
  }

  function loadLocalState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      state.checked = new Set(Array.isArray(saved.checked) ? saved.checked : []);
      state.required = new Set(Array.isArray(saved.required) ? saved.required : []);
      state.purchase = new Set(Array.isArray(saved.purchase) ? saved.purchase : []);
    } catch {
      state.checked = new Set();
      state.required = new Set();
      state.purchase = new Set();
    }
  }

  function saveLocalState() {
    const payload = {
      checked: Array.from(state.checked),
      required: Array.from(state.required),
      purchase: Array.from(state.purchase),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function loadHashState() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const encoded = params.get("state");
    if (!encoded) return;
    try {
      const payload = JSON.parse(decodeBase64Url(encoded));
      if (!Array.isArray(payload.checked)) return;
      state.checked = new Set(payload.checked.filter((id) => items.some((item) => item.id === id)));
      state.required = new Set((payload.required || []).filter((id) => items.some((item) => item.id === id)));
      state.purchase = new Set((payload.purchase || []).filter((id) => items.some((item) => item.id === id)));
      saveLocalState();
      showToast("共有リンクのチェック状態を読み込みました。");
    } catch {
      showToast("共有リンクを読み込めませんでした。");
    }
  }

  async function copyShareLink() {
    const payload = {
      checked: Array.from(state.checked),
      required: Array.from(state.required),
      purchase: Array.from(state.purchase),
      updatedAt: new Date().toISOString()
    };
    const encoded = encodeBase64Url(JSON.stringify(payload));
    const url = `${window.location.href.replace(/#.*$/, "")}#state=${encoded}`;
    window.history.replaceState(null, "", `#state=${encoded}`);

    try {
      await navigator.clipboard.writeText(url);
      showToast("共有リンクをコピーしました。");
    } catch {
      showToast("共有リンクをアドレスバーに作成しました。");
    }
  }

  function exportState() {
    const payload = {
      app: "brussels-checklist",
      checked: Array.from(state.checked),
      required: Array.from(state.required),
      purchase: Array.from(state.purchase),
      updatedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "brussels-checklist-progress.json";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("チェック状態を書き出しました。");
  }

  function importState(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(payload.checked)) throw new Error("invalid payload");
        state.checked = new Set(payload.checked.filter((id) => items.some((item) => item.id === id)));
        state.required = new Set((payload.required || []).filter((id) => items.some((item) => item.id === id)));
        state.purchase = new Set((payload.purchase || []).filter((id) => items.some((item) => item.id === id)));
        saveLocalState();
        render();
        showToast("チェック状態を読み込みました。");
      } catch {
        showToast("読み込みに失敗しました。");
      } finally {
        event.target.value = "";
      }
    });
    reader.readAsText(file);
  }

  function countRoute(route) {
    const total = items.filter((item) => item.routes[route]).length;
    const done = items.filter((item) => item.routes[route] && state.checked.has(item.id)).length;
    return `${done}/${total}`;
  }

  function routeLabel(route) {
    return {
      air: "航空便",
      sea: "船便",
      carry: "手荷物"
    }[route] || "すべて";
  }

  function groupBy(list, keyFn) {
    return list.reduce((acc, item) => {
      const key = keyFn(item);
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
  }

  function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeBase64Url(text) {
    const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 2200);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
})();
