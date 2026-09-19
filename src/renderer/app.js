/**
 * app.js — 渲染器
 *
 * 纯原生 JS：分类导航 / 搜索 / 收藏 / 启动 / 状态徽章。
 * 数据与动作全部走 window.toolbox（preload 暴露的最小面）。
 */

const api = window.toolbox;
const $ = (id) => document.getElementById(id);

const ui = {
  nav: $("nav"),
  grid: $("grid"),
  empty: $("empty"),
  search: $("search"),
  filters: $("filters"),
  stats: $("stats"),
  banner: $("banner"),
  viewbar: $("viewbar"),
  toast: $("toast"),
  cardTpl: $("card-tpl"),
};

let data = {
  tools: [],
  categories: [],
  state: { favorites: [], hidden: [], recent: [] },
  stats: {},
};
const icons = new Map();
const statuses = new Map();
let view = { kind: "all", value: null }; // kind: all|fav|recent|dead|pending|cat
let query = "";
let sourceFilter = "all"; // all | curated | startmenu | portable

// ── 工具函数 ──────────────────────────────────────────────
function toast(msg, isErr = false) {
  ui.toast.textContent = msg;
  ui.toast.classList.toggle("err", isErr);
  ui.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.add("hidden"), 2600);
}

function catMeta(id) {
  return (
    data.categories.find((c) => c.id === id) || {
      label: id,
      icon: "•",
      color: "#828282",
    }
  );
}

const KIND_LABEL = {
  cli: "命令行",
  gui: "图形程序",
  script: "脚本",
  web: "网页",
  folder: "目录",
  lnk: "快捷方式",
};

function visibleTools() {
  const hidden = new Set(data.state.hidden);
  return data.tools.filter((t) => !hidden.has(t.id));
}

function filteredTools() {
  const hidden = new Set(data.state.hidden);
  // 「已隐藏」视图反过来：只看被隐藏的，其余视图一律排除隐藏项
  let list =
    view.kind === "hidden"
      ? data.tools.filter((t) => hidden.has(t.id))
      : visibleTools();
  const favs = new Set(data.state.favorites);

  if (view.kind === "fav") list = list.filter((t) => favs.has(t.id));
  else if (view.kind === "cat")
    list = list.filter((t) => t.category === view.value);
  else if (view.kind === "dead") list = list.filter((t) => !t.exists);
  else if (view.kind === "pending")
    list = list.filter((t) => t.source === "portable");
  else if (view.kind === "recent") {
    const order = new Map(data.state.recent.map((r, i) => [r.id, i]));
    list = list
      .filter((t) => order.has(t.id))
      .sort((a, b) => order.get(a.id) - order.get(b.id));
  }

  if (sourceFilter !== "all")
    list = list.filter((t) => t.source === sourceFilter);

  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter((t) =>
      [t.name, t.desc, t.path, t.target, (t.tags || []).join(" "), t.version]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  return list;
}

// ── 侧栏 ─────────────────────────────────────────────────
function renderNav() {
  const all = visibleTools();
  const favs = new Set(data.state.favorites);
  const rows = [
    { kind: "all", label: "全部工具", icon: "▦", count: all.length },
    {
      kind: "fav",
      label: "收藏",
      icon: "★",
      count: all.filter((t) => favs.has(t.id)).length,
    },
    {
      kind: "recent",
      label: "最近使用",
      icon: "🕘",
      count: data.state.recent.length,
    },
    {
      kind: "dead",
      label: "失效入口",
      icon: "⚠",
      count: all.filter((t) => !t.exists).length,
    },
    {
      kind: "pending",
      label: "待确认收录",
      icon: "➕",
      count: all.filter((t) => t.source === "portable").length,
    },
    {
      kind: "hidden",
      label: "已隐藏",
      icon: "🚫",
      count: data.state.hidden.length,
    },
  ];

  ui.nav.innerHTML = "";
  for (const r of rows) {
    if (
      r.count === 0 &&
      (r.kind === "dead" || r.kind === "pending" || r.kind === "hidden")
    )
      continue;
    ui.nav.append(
      navButton(r.label, r.icon, r.count, view.kind === r.kind, () => {
        view = { kind: r.kind, value: null };
        render();
      }),
    );
  }

  const sep = document.createElement("div");
  sep.className = "nav-sep";
  sep.textContent = "分类";
  ui.nav.append(sep);

  for (const c of data.categories) {
    const count = all.filter((t) => t.category === c.id).length;
    if (!count) continue;
    const active = view.kind === "cat" && view.value === c.id;
    ui.nav.append(
      navButton(
        c.label,
        c.icon,
        count,
        active,
        () => {
          view = { kind: "cat", value: c.id };
          render();
        },
        c.color,
      ),
    );
  }
}

function navButton(label, icon, count, active, onClick, color) {
  const b = document.createElement("button");
  b.className = `nav-item${active ? " active" : ""}`;
  const i = document.createElement("span");
  i.className = "ico";
  i.textContent = icon;
  if (color) i.style.color = color;
  const t = document.createElement("span");
  t.textContent = label;
  const c = document.createElement("span");
  c.className = "count";
  c.textContent = String(count);
  b.append(i, t, c);
  b.onclick = onClick;
  return b;
}

function renderFilters() {
  const chips = [
    { v: "all", label: "全部来源" },
    { v: "curated", label: "便携工具" },
    { v: "startmenu", label: "开始菜单" },
    { v: "portable", label: "自动发现" },
  ];
  ui.filters.innerHTML = "";
  for (const c of chips) {
    const b = document.createElement("button");
    b.className = `chip${sourceFilter === c.v ? " active" : ""}`;
    b.textContent = c.label;
    b.onclick = () => {
      sourceFilter = c.v;
      render();
    };
    ui.filters.append(b);
  }
}

function renderStats() {
  const s = data.stats || {};
  const when = s.lastScan
    ? new Date(s.lastScan).toLocaleString("zh-CN", { hour12: false })
    : "未扫描";

  const line1 = document.createElement("div");
  line1.append(document.createTextNode("共 "));
  const strong = document.createElement("b");
  strong.textContent = String(s.total ?? 0);
  line1.append(
    strong,
    document.createTextNode(
      ` 个工具（便携 ${s.curated ?? 0} · 开始菜单 ${s.startmenu ?? 0}）`,
    ),
  );

  const line2 = document.createElement("div");
  line2.textContent = `失效入口 ${s.dead ?? 0}`;
  if (s.dead) line2.style.color = "#f2c94c";

  const line3 = document.createElement("div");
  line3.textContent = `上次扫描 ${when}`;

  ui.stats.replaceChildren(line1, line2, line3);
}

function renderBanner() {
  const uncovered = data.stats.uncoveredDirs || [];
  if (!uncovered.length) {
    ui.banner.classList.add("hidden");
    return;
  }
  ui.banner.classList.remove("hidden");
  ui.banner.textContent = `发现 ${uncovered.length} 个未登记目录：${uncovered.join("、")} —— 已列入「待确认收录」，确认后写进 data/curated-tools.json 即可转正。`;
}

// ── 卡片 ─────────────────────────────────────────────────
function renderGrid() {
  const list = filteredTools();
  ui.grid.innerHTML = "";
  ui.empty.classList.toggle("hidden", list.length > 0);
  const frag = document.createDocumentFragment();
  for (const t of list) frag.append(card(t));
  ui.grid.append(frag);
}

function card(t) {
  const node = ui.cardTpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = t.id;
  if (!t.exists) node.classList.add("dead");

  const meta = catMeta(t.category);
  const iconBox = node.querySelector(".icon");
  // 兜底：首字母头像（比通用空白图标/统一 emoji 更有辨识度）
  const showLetter = () => {
    iconBox.textContent = (t.name || "?").trim().charAt(0).toUpperCase();
    iconBox.style.background = `${meta.color}22`;
    iconBox.style.color = meta.color;
    iconBox.style.fontWeight = "700";
    iconBox.style.fontSize = "15px";
    iconBox.style.border = `1px solid ${meta.color}55`;
  };
  const cached = icons.get(t.id);
  if (cached) {
    const img = document.createElement("img");
    img.src = cached;
    img.alt = "";
    iconBox.append(img);
  } else {
    showLetter();
    void api.icon(t.id).then((url) => {
      if (!url) return;
      icons.set(t.id, url);
      const el = document.querySelector(
        `.card[data-id="${cssEscape(t.id)}"] .icon`,
      );
      if (!el) return;
      el.textContent = "";
      el.style.background = "#2a3140";
      el.style.border = "none";
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      el.append(img);
    });
  }

  // 卡片主标题（这一行曾在一次编辑中被误删，导致所有卡片名字为空）
  node.querySelector(".name").textContent = t.name;

  const metaEl = node.querySelector(".meta");
  metaEl.textContent = "";
  metaEl.append(document.createTextNode(KIND_LABEL[t.kind] || t.kind));
  if (t.version) {
    const ver = document.createElement("span");
    ver.className = "ver";
    ver.textContent = t.version;
    metaEl.append(document.createTextNode(" · "), ver);
  }

  node.querySelector(".desc").textContent = t.desc || t.target || t.path;
  node.querySelector(".desc").title = t.target || t.path;

  const tags = node.querySelector(".tags");
  const catTag = document.createElement("span");
  catTag.className = "tag cat";
  catTag.textContent = meta.label;
  tags.append(catTag);
  if (!t.exists) {
    const d = document.createElement("span");
    d.className = "tag dead";
    d.textContent = "路径失效";
    tags.append(d);
  }
  for (const tg of (t.tags || []).slice(0, 3)) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = tg;
    tags.append(el);
  }

  const star = node.querySelector(".star");
  const isFav = data.state.favorites.includes(t.id);
  star.textContent = isFav ? "★" : "☆";
  star.classList.toggle("on", isFav);
  star.onclick = async (e) => {
    e.stopPropagation();
    data.state = await api.favorite(t.id);
    render();
  };

  const launchBtn = node.querySelector(".act-launch");
  // 按钮文案随类型变：项目/目录类条目的主操作是“打开目录”而不是“启动”
  if (t.kind === "folder") launchBtn.textContent = "📂 打开目录";
  else if (t.kind === "cli") launchBtn.textContent = "▶ 开终端";
  else if (t.kind === "web") launchBtn.textContent = "▶ 打开";
  launchBtn.onclick = (e) => {
    e.stopPropagation();
    doLaunch(t);
  };
  node.querySelector(".act-dir").onclick = async (e) => {
    e.stopPropagation();
    const r = await api.openDir(t.id);
    if (!r.ok) toast(r.message, true);
  };
  node.querySelector(".act-copy").onclick = async (e) => {
    e.stopPropagation();
    const r = await api.copyCommand(t.id);
    toast(r.message, !r.ok);
  };

  // 隐藏（不删文件，可在「已隐藏」里恢复）—— 可逆操作，不弹确认框
  node.querySelector(".act-hide").onclick = async (e) => {
    e.stopPropagation();
    data = await api.hide(t.id, true);
    render();
    toast(`已隐藏「${t.name}」（左侧「已隐藏」可恢复）`);
  };

  // 已隐藏视图里的恢复按钮
  const unhideBtn = node.querySelector(".act-unhide");
  if (view.kind === "hidden") {
    unhideBtn.classList.remove("hidden");
    launchBtn.classList.remove("primary");
    unhideBtn.onclick = async (e) => {
      e.stopPropagation();
      data = await api.hide(t.id, false);
      render();
      toast(`已恢复「${t.name}」`);
    };
  } else {
    unhideBtn.classList.add("hidden");
  }

  // 只对「开始菜单里的失效快捷方式」提供删除（移到回收站，可还原）
  const trashBtn = node.querySelector(".act-trash");
  const canTrash = t.source === "startmenu" && t.kind === "lnk" && !t.exists;
  if (canTrash) {
    trashBtn.classList.remove("hidden");
    trashBtn.onclick = async (e) => {
      e.stopPropagation();
      if (
        !confirm(
          `把失效快捷方式「${t.name}」移到回收站？\n\n文件：${t.path}\n（可在回收站还原，不会动任何 exe）`,
        )
      )
        return;
      const r = await api.trashLnk(t.id);
      toast(r.message, !r.ok);
      data = await api.list();
      render();
    };
  } else {
    trashBtn.classList.add("hidden");
  }

  const dot = node.querySelector(".status-dot");
  const st = statuses.get(t.id);
  if (st) {
    dot.classList.add(st.state);
    dot.title = st.detail || "";
  } else {
    dot.classList.add("unknown");
  }

  // 双击卡片空白处 = 启动；右键 = 管理员启动
  node.ondblclick = () => doLaunch(t);
  node.oncontextmenu = (e) => {
    e.preventDefault();
    if (confirm(`以管理员身份启动「${t.name}」？`))
      doLaunch(t, { admin: true });
  };
  return node;
}

async function doLaunch(t, opts = {}) {
  const r = await api.launch(t.id, opts);
  toast(r.message, !r.ok);
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

// ── 总渲染 ───────────────────────────────────────────────
// ── 视图级操作条（批量隐藏 / 恢复 / 清理失效快捷方式）──
function renderViewbar() {
  ui.viewbar.innerHTML = "";
  const list = filteredTools();
  const btn = (label, fn, danger = false) => {
    const b = document.createElement("button");
    if (danger) b.className = "danger";
    b.textContent = label;
    b.onclick = fn;
    return b;
  };

  if (view.kind === "dead" && list.length) {
    ui.viewbar.append(
      btn(`全部隐藏（${list.length} 条失效入口）`, async () => {
        data = await api.hideMany(
          list.map((t) => t.id),
          true,
        );
        render();
        toast(`已隐藏 ${list.length} 条失效入口`);
      }),
      btn(
        `清空失效快捷方式（移入回收站）`,
        async () => {
          const lnks = list.filter(
            (t) => t.source === "startmenu" && t.kind === "lnk",
          );
          if (!lnks.length)
            return toast("这些失效项不是快捷方式，请用「全部隐藏」", true);
          if (
            !confirm(
              `把 ${lnks.length} 个失效快捷方式移到回收站？\n\n会逐个列出：\n` +
                lnks.map((t) => `· ${t.name}`).join("\n") +
                `\n\n（文件进回收站可还原，不动任何 exe；其余 ${list.length - lnks.length} 条非快捷方式项会被隐藏）`,
            )
          )
            return;
          let done = 0;
          for (const t of lnks) {
            const r = await api.trashLnk(t.id);
            if (r.ok) done++;
          }
          const rest = list.filter((t) => !lnks.includes(t));
          if (rest.length)
            data = await api.hideMany(
              rest.map((t) => t.id),
              true,
            );
          else data = await api.list();
          render();
          toast(`已清理 ${done} 个失效快捷方式`);
        },
        true,
      ),
    );
  } else if (view.kind === "hidden" && list.length) {
    ui.viewbar.append(
      btn(`全部恢复（${list.length} 条）`, async () => {
        data = await api.hideMany(
          list.map((t) => t.id),
          false,
        );
        render();
        toast(`已恢复 ${list.length} 条`);
      }),
    );
  }

  ui.viewbar.classList.toggle("hidden", ui.viewbar.childElementCount === 0);
}

function render() {
  renderNav();
  renderFilters();
  renderStats();
  renderBanner();
  renderViewbar();
  renderGrid();
}

// ── 事件 ─────────────────────────────────────────────────
ui.search.addEventListener("input", () => {
  query = ui.search.value;
  renderGrid();
});

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    ui.search.focus();
    ui.search.select();
  } else if (e.key === "Escape") {
    ui.search.value = "";
    query = "";
    renderGrid();
  } else if (e.key === "Enter" && document.activeElement === ui.search) {
    const first = filteredTools()[0];
    if (first) doLaunch(first);
  }
});

$("btn-rescan").onclick = async () => {
  toast("正在扫描 E:\\AI\\tools 与开始菜单…");
  const p = await api.rescan();
  data = p;
  icons.clear();
  render();
  toast("扫描完成");
};

$("btn-datadir").onclick = () => api.openDataDir();

api.onStatus((list) => {
  for (const s of list) statuses.set(s.id, s);
  for (const s of list) {
    const dot = document.querySelector(
      `.card[data-id="${cssEscape(s.id)}"] .status-dot`,
    );
    if (!dot) continue;
    dot.classList.remove("running", "stopped", "unknown");
    dot.classList.add(s.state);
    dot.title = s.detail || "";
  }
});

api.onRescan((e) => {
  if (e.stage === "done") toast(`扫描完成：${e.summary}`);
  else if (e.stage === "error") toast(`扫描失败：${e.summary}`, true);
});

// ── 启动 ─────────────────────────────────────────────────
(async function boot() {
  data = await api.list();
  render();
})();
