const columns = [
  { id: "now", label: "Focus", title: "直近" },
  { id: "rna", label: "Molecular", title: "RNA-seq" },
  { id: "mouse", label: "In vivo", title: "マウス/血清" },
  { id: "validation", label: "Validation", title: "FACS/Cytokine" },
  { id: "analysis", label: "Figures", title: "解析/図" },
  { id: "done", label: "Archive", title: "完了" },
];

const state = {
  tasks: [],
  loaded: false,
  error: null,
  lastUpdated: "",
};

const elements = {
  board: document.getElementById("board"),
  authState: document.getElementById("authState"),
  authEmail: document.getElementById("authEmail"),
  syncStatus: document.getElementById("syncStatus"),
  totalCount: document.getElementById("totalCount"),
  doneCount: document.getElementById("doneCount"),
  soonCount: document.getElementById("soonCount"),
  columnTemplate: document.getElementById("columnTemplate"),
  taskTemplate: document.getElementById("taskTemplate"),
  taskColumn: document.getElementById("taskColumn"),
};

columns.forEach((column) => {
  if (!elements.taskColumn) return;
  const option = document.createElement("option");
  option.value = column.id;
  option.textContent = column.title;
  elements.taskColumn.append(option);
});

loadTasks();

async function loadTasks() {
  try {
    setStatus("GitHub tasks loading");
    const response = await fetch(`./tasks.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    state.tasks = Array.isArray(payload.tasks) ? payload.tasks.map(normalizeTask) : [];
    state.lastUpdated = payload.lastUpdated || "";
    state.loaded = true;
    state.error = null;
    setStatus(state.lastUpdated ? `GitHub synced ${state.lastUpdated}` : "GitHub synced");
  } catch (error) {
    state.tasks = [];
    state.loaded = false;
    state.error = error;
    setStatus(`Load error: ${error.message}`);
  }

  updateHeader();
  render();
}

function render() {
  if (state.error) {
    elements.totalCount.textContent = "0";
    elements.doneCount.textContent = "0";
    elements.soonCount.textContent = "0";
    elements.board.classList.add("is-locked");
    elements.board.replaceChildren(renderMessage("タスクを読み込めません", "GitHub Pagesのtasks.jsonを確認してください。"));
    return;
  }

  const tasks = state.tasks.map(normalizeTask).sort(taskSorter);
  const doneCount = tasks.filter((task) => task.done).length;
  const soonCount = tasks.filter((task) => !task.done && dueClass(task.due) === "soon").length;

  elements.totalCount.textContent = String(tasks.length);
  elements.doneCount.textContent = String(doneCount);
  elements.soonCount.textContent = String(soonCount);
  elements.board.classList.remove("is-locked");
  elements.board.replaceChildren();

  columns.forEach((column) => {
    const columnNode = elements.columnTemplate.content.cloneNode(true);
    const section = columnNode.querySelector(".column");
    const label = columnNode.querySelector(".column-label");
    const title = columnNode.querySelector("h2");
    const count = columnNode.querySelector(".column-count");
    const addButton = columnNode.querySelector(".add-task-button");
    const list = columnNode.querySelector(".task-list");
    const columnTasks = tasks.filter((task) => task.done ? column.id === "done" : task.column === column.id);

    label.textContent = column.label;
    title.textContent = column.title;
    count.textContent = String(columnTasks.length);
    addButton.hidden = true;

    if (!columnTasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No cards";
      list.append(empty);
    } else {
      columnTasks.forEach((task) => {
        list.append(renderTask(task));
      });
    }

    elements.board.append(section);
  });
}

function renderMessage(titleText, bodyText) {
  const gate = document.createElement("section");
  gate.className = "access-gate";

  const title = document.createElement("h2");
  title.textContent = titleText;

  const body = document.createElement("p");
  body.textContent = bodyText;

  gate.append(title, body);
  return gate;
}

function renderTask(task) {
  const taskNode = elements.taskTemplate.content.cloneNode(true);
  const card = taskNode.querySelector(".task-card");
  const checkbox = taskNode.querySelector(".task-check");
  const tag = taskNode.querySelector(".tag");
  const due = taskNode.querySelector("time");
  const title = taskNode.querySelector("h3");
  const detail = taskNode.querySelector(".task-detail");
  const owner = taskNode.querySelector(".owner");
  const statePill = taskNode.querySelector(".state-pill");
  const statusClass = dueClass(task.due);

  card.dataset.tone = task.tone;
  card.classList.toggle("is-done", task.done);
  card.classList.toggle("is-overdue", statusClass === "overdue");
  card.classList.toggle("is-soon", statusClass === "soon");

  checkbox.checked = task.done;
  checkbox.disabled = true;
  checkbox.setAttribute("aria-label", `${task.title}は${task.done ? "完了" : "未完了"}`);

  tag.textContent = task.tag;
  due.textContent = task.due ? formatDue(task.due) : "No due";
  if (task.due) {
    due.dateTime = task.due;
  }
  title.textContent = task.title;
  detail.textContent = task.detail;
  owner.textContent = task.owner;
  owner.disabled = true;
  owner.setAttribute("aria-label", `${task.title}の担当: ${task.owner}`);
  statePill.textContent = task.done ? "Done" : statusLabel(statusClass);

  return card;
}

function updateHeader() {
  elements.authState.textContent = "GitHub表示";
  elements.authEmail.textContent = "Codex updates tasks.json";
}

function setStatus(text) {
  elements.syncStatus.textContent = text;
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "Untitled",
    detail: task.detail || "",
    due: task.due || "",
    column: task.column || "now",
    owner: task.owner || "Unassigned",
    tag: task.tag || "Task",
    tone: task.tone || "green",
    order: Number.isFinite(task.order) ? task.order : 999,
    done: Boolean(task.done),
  };
}

function taskSorter(a, b) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  if (a.column !== b.column) {
    return columns.findIndex((column) => column.id === a.column) - columns.findIndex((column) => column.id === b.column);
  }
  return a.order - b.order;
}

function formatDue(value) {
  const date = parseDate(value);
  if (!date) return "No due";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
}

function dueClass(value) {
  const date = parseDate(value);
  if (!date) return "open";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date - today) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "soon";
  return "open";
}

function statusLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "soon") return "Soon";
  return "Open";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
