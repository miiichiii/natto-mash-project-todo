import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const firebaseConfig = {
  projectId: "project-manage-56fd1",
  appId: "1:289767207211:web:9ba76c1faf08610865156e",
  storageBucket: "project-manage-56fd1.firebasestorage.app",
  apiKey: "AIzaSyCVsV_P4_2Fe6j5fU-t7A4Sb74Jb2PDOeo",
  authDomain: "project-manage-56fd1.firebaseapp.com",
  messagingSenderId: "289767207211",
  measurementId: "G-6029DPTZT2",
};

const COLLECTIONS = {
  tasks: "nattoMashTasks",
  funds: "nattoMashBudgetFunds",
  allocations: "nattoMashBudgetAllocations",
  lineItems: "nattoMashBudgetLineItems",
  weeklyItems: "nattoMashWeeklyPlanItems",
  mouseRows: "nattoMashMouseCohortRows",
  auditLogs: "nattoMashBudgetAuditLog",
};

const privateSources = [
  { key: "funds", name: COLLECTIONS.funds, orderBy: "order" },
  { key: "allocations", name: COLLECTIONS.allocations, orderBy: "order" },
  { key: "lineItems", name: COLLECTIONS.lineItems, orderBy: "order" },
  { key: "weeklyItems", name: COLLECTIONS.weeklyItems, orderBy: "order" },
  { key: "mouseRows", name: COLLECTIONS.mouseRows, orderBy: "order" },
  { key: "auditLogs", name: COLLECTIONS.auditLogs, orderBy: "createdAt" },
];

const typeToCollectionKey = {
  fund: "funds",
  allocation: "allocations",
  lineItem: "lineItems",
  weeklyItem: "weeklyItems",
  mouseRow: "mouseRows",
};

const columns = [
  { id: "now", label: "Focus", title: "直近" },
  { id: "rna", label: "Molecular", title: "RNA-seq" },
  { id: "mouse", label: "In vivo", title: "マウス/血清" },
  { id: "validation", label: "Validation", title: "FACS/Cytokine" },
  { id: "analysis", label: "Figures", title: "解析/図" },
  { id: "done", label: "Archive", title: "完了" },
];

const lineItemStatusOptions = [
  { value: "plannedDraft", label: "予定案" },
  { value: "plannedApproved", label: "承認済み予定" },
  { value: "quoted", label: "見積済み" },
  { value: "ordered", label: "発注済み" },
  { value: "delivered", label: "納品済み" },
  { value: "invoiced", label: "請求済み" },
  { value: "paid", label: "支払済み" },
  { value: "blocked", label: "保留/詰まり" },
  { value: "cancelled", label: "中止" },
];

const weeklyStatusOptions = [
  { value: "todo", label: "未着手" },
  { value: "doing", label: "進行中" },
  { value: "blocked", label: "詰まり" },
  { value: "decision", label: "判断待ち" },
  { value: "done", label: "完了" },
];

const confidenceOptions = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const orderedStatuses = new Set(["ordered", "delivered", "invoiced"]);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const state = {
  user: null,
  allowed: false,
  canWrite: false,
  tasks: [],
  staticTasks: [],
  staticLastUpdated: "",
  staticError: null,
  activeView: "board",
  view: "checking",
  live: false,
  creating: false,
  updatingOwner: false,
  editingOwnerTaskId: null,
  savingIds: new Set(),
  unsubscribeTasks: null,
  privateUnsubscribes: [],
  privateLoaded: Object.fromEntries(privateSources.map((source) => [source.key, false])),
  privateReady: false,
  privateDenied: false,
  privateError: null,
  funds: [],
  allocations: [],
  lineItems: [],
  weeklyItems: [],
  mouseRows: [],
  auditLogs: [],
  privateDialogType: null,
  privateDialogDocId: null,
  savingPrivate: false,
};

const elements = {
  board: document.getElementById("board"),
  boardPanel: document.getElementById("boardPanel"),
  budgetPanel: document.getElementById("budgetPanel"),
  weekPanel: document.getElementById("weekPanel"),
  viewTabs: document.getElementById("viewTabs"),
  taskOverview: document.getElementById("taskOverview"),
  budgetTab: document.querySelector("[data-view='budget']"),
  weekTab: document.querySelector("[data-view='week']"),
  budgetSummary: document.getElementById("budgetSummary"),
  allocationTable: document.getElementById("allocationTable"),
  lineItemTable: document.getElementById("lineItemTable"),
  auditLogList: document.getElementById("auditLogList"),
  weeklyPlanList: document.getElementById("weeklyPlanList"),
  mouseCohortTable: document.getElementById("mouseCohortTable"),
  addFundButton: document.getElementById("addFundButton"),
  addAllocationButton: document.getElementById("addAllocationButton"),
  addLineItemButton: document.getElementById("addLineItemButton"),
  addWeeklyItemButton: document.getElementById("addWeeklyItemButton"),
  addMouseRowButton: document.getElementById("addMouseRowButton"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  authState: document.getElementById("authState"),
  authEmail: document.getElementById("authEmail"),
  syncStatus: document.getElementById("syncStatus"),
  totalCount: document.getElementById("totalCount"),
  doneCount: document.getElementById("doneCount"),
  soonCount: document.getElementById("soonCount"),
  columnTemplate: document.getElementById("columnTemplate"),
  taskTemplate: document.getElementById("taskTemplate"),
  taskDialog: document.getElementById("taskDialog"),
  taskForm: document.getElementById("taskForm"),
  taskDialogTitle: document.getElementById("taskDialogTitle"),
  taskColumn: document.getElementById("taskColumn"),
  taskTitle: document.getElementById("taskTitle"),
  taskDetail: document.getElementById("taskDetail"),
  taskDue: document.getElementById("taskDue"),
  taskOwner: document.getElementById("taskOwner"),
  taskTag: document.getElementById("taskTag"),
  taskTone: document.getElementById("taskTone"),
  taskFormStatus: document.getElementById("taskFormStatus"),
  cancelTaskButton: document.getElementById("cancelTaskButton"),
  cancelTaskIconButton: document.getElementById("cancelTaskIconButton"),
  saveTaskButton: document.getElementById("saveTaskButton"),
  ownerDialog: document.getElementById("ownerDialog"),
  ownerForm: document.getElementById("ownerForm"),
  ownerDialogTitle: document.getElementById("ownerDialogTitle"),
  ownerName: document.getElementById("ownerName"),
  ownerFormStatus: document.getElementById("ownerFormStatus"),
  useGoogleNameButton: document.getElementById("useGoogleNameButton"),
  cancelOwnerButton: document.getElementById("cancelOwnerButton"),
  cancelOwnerIconButton: document.getElementById("cancelOwnerIconButton"),
  saveOwnerButton: document.getElementById("saveOwnerButton"),
  privateDialog: document.getElementById("privateDialog"),
  privateForm: document.getElementById("privateForm"),
  privateDialogTitle: document.getElementById("privateDialogTitle"),
  privateFields: document.getElementById("privateFields"),
  privateFormStatus: document.getElementById("privateFormStatus"),
  cancelPrivateButton: document.getElementById("cancelPrivateButton"),
  cancelPrivateIconButton: document.getElementById("cancelPrivateIconButton"),
  savePrivateButton: document.getElementById("savePrivateButton"),
};

columns.forEach((column) => {
  const option = document.createElement("option");
  option.value = column.id;
  option.textContent = column.title;
  elements.taskColumn.append(option);
});

loadStaticTasks();

setPersistence(auth, browserLocalPersistence).catch((error) => {
  setStatus(`Auth persistence error: ${error.code}`);
});

elements.loginButton.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user") {
      setStatus("ログインが中断されました。");
      return;
    }
    if (["auth/popup-blocked", "auth/cancelled-popup-request"].includes(error.code)) {
      setStatus("ポップアップを許可して、もう一度ログインしてください。");
      return;
    }
    if (error.code === "auth/unauthorized-domain") {
      setStatus("このドメインがFirebase Authで未許可です。");
      return;
    }
    if (error.code === "auth/web-storage-unsupported") {
      setStatus("ブラウザのストレージが無効です。設定を確認してください。");
      return;
    }
    setStatus(`Login error: ${error.code}`);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

elements.viewTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  activateView(button.dataset.view);
});

elements.addFundButton.addEventListener("click", () => openPrivateDialog("fund"));
elements.addAllocationButton.addEventListener("click", () => openPrivateDialog("allocation"));
elements.addLineItemButton.addEventListener("click", () => openPrivateDialog("lineItem"));
elements.addWeeklyItemButton.addEventListener("click", () => openPrivateDialog("weeklyItem"));
elements.addMouseRowButton.addEventListener("click", () => openPrivateDialog("mouseRow"));

elements.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTaskFromForm();
});

elements.cancelTaskButton.addEventListener("click", closeTaskDialog);
elements.cancelTaskIconButton.addEventListener("click", closeTaskDialog);

elements.taskDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeTaskDialog();
});

elements.ownerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveTaskOwner();
});

elements.useGoogleNameButton.addEventListener("click", () => {
  elements.ownerName.value = defaultOwner();
  elements.ownerName.focus();
});

elements.cancelOwnerButton.addEventListener("click", closeOwnerDialog);
elements.cancelOwnerIconButton.addEventListener("click", closeOwnerDialog);

elements.ownerDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOwnerDialog();
});

elements.privateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await savePrivateDialog();
});

elements.cancelPrivateButton.addEventListener("click", closePrivateDialog);
elements.cancelPrivateIconButton.addEventListener("click", closePrivateDialog);

elements.privateDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePrivateDialog();
});

onAuthStateChanged(auth, (user) => {
  if (state.unsubscribeTasks) {
    state.unsubscribeTasks();
    state.unsubscribeTasks = null;
  }
  unsubscribePrivateData();

  state.user = user;
  state.allowed = Boolean(user);
  state.canWrite = false;
  state.live = false;
  state.editingOwnerTaskId = null;
  resetPrivateState();
  updateAuthUI();

  if (!user) {
    activateView("board", { silent: true });
    showStaticTasks();
    return;
  }

  state.tasks = [];
  state.view = "loading";
  setStatus("Firestore loading");
  render();
  subscribeTasks();
});

async function loadStaticTasks() {
  try {
    const response = await fetch(`./tasks.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    state.staticTasks = Array.isArray(payload.tasks) ? payload.tasks.map(normalizeTask) : [];
    state.staticLastUpdated = payload.lastUpdated || "";
    state.staticError = null;
  } catch (error) {
    state.staticTasks = [];
    state.staticLastUpdated = "";
    state.staticError = error;
  }

  if (!state.user && state.view !== "live" && state.view !== "loading") {
    showStaticTasks();
  }
}

function showStaticTasks() {
  state.live = false;
  state.allowed = Boolean(state.user);
  state.canWrite = false;

  if (state.staticError) {
    state.tasks = [];
    state.view = "static-error";
    setStatus(`GitHub tasks load error: ${state.staticError.message}`);
  } else if (!state.staticTasks.length) {
    state.tasks = [];
    state.view = "static-loading";
    setStatus("GitHub tasks loading");
  } else {
    state.tasks = state.staticTasks;
    state.view = "static";
    setStatus(state.staticLastUpdated ? `GitHub synced ${state.staticLastUpdated} / ログインで編集` : "GitHub synced / ログインで編集");
  }

  updateAuthUI();
  render();
}

function subscribeTasks() {
  const tasksQuery = query(collection(db, COLLECTIONS.tasks), orderBy("order"));
  state.unsubscribeTasks = onSnapshot(tasksQuery, async (snapshot) => {
    state.live = true;
    state.view = "live";
    state.allowed = true;
    state.canWrite = true;
    state.tasks = snapshot.docs.map((taskDoc) => normalizeTask({ id: taskDoc.id, ...taskDoc.data() }));
    setStatus("Firestore synced / 編集可");
    updateAuthUI();

    if (!state.privateUnsubscribes.length && !state.privateReady && !state.privateDenied) {
      subscribePrivateData();
    }

    render();
  }, (error) => {
    state.live = false;
    state.tasks = [];
    unsubscribePrivateData();
    resetPrivateState();
    activateView("board", { silent: true });

    if (error.code === "permission-denied") {
      state.allowed = false;
      state.canWrite = false;
      state.view = state.staticTasks.length ? "static" : "unauthorized";
      state.tasks = state.staticTasks;
      setStatus("編集権限がありません。GitHub tasksを表示中。");
      updateAuthUI();
    } else {
      state.view = state.staticTasks.length ? "static" : "error";
      state.tasks = state.staticTasks;
      setStatus(state.staticTasks.length ? `Firestore error: ${error.code} / GitHub tasksを表示中` : `Firestore error: ${error.code}`);
    }
    render();
  });
}

function subscribePrivateData() {
  unsubscribePrivateData();
  state.privateLoaded = Object.fromEntries(privateSources.map((source) => [source.key, false]));
  state.privateReady = false;
  state.privateDenied = false;
  state.privateError = null;

  privateSources.forEach((source) => {
    const sourceQuery = query(collection(db, source.name), orderBy(source.orderBy));
    const unsubscribe = onSnapshot(sourceQuery, (snapshot) => {
      state[source.key] = snapshot.docs.map((entry) => normalizePrivateDoc(source.key, { id: entry.id, ...entry.data() }));
      state.privateLoaded[source.key] = true;
      state.privateReady = privateSources.every((candidate) => state.privateLoaded[candidate.key]);
      if (state.privateReady) {
        setStatus("Firestore synced / 内部台帳も編集可");
      }
      render();
    }, (error) => {
      handlePrivateError(error);
    });
    state.privateUnsubscribes.push(unsubscribe);
  });
}

function handlePrivateError(error) {
  unsubscribePrivateData();
  clearPrivateCollections();
  state.privateReady = false;
  state.privateDenied = error.code === "permission-denied";
  state.privateError = error;
  activateView("board", { silent: true });
  setStatus(state.privateDenied ? "内部台帳のFirestore権限がありません。" : `内部台帳 error: ${error.code}`);
  render();
}

function unsubscribePrivateData() {
  state.privateUnsubscribes.forEach((unsubscribe) => unsubscribe());
  state.privateUnsubscribes = [];
}

function resetPrivateState() {
  state.privateLoaded = Object.fromEntries(privateSources.map((source) => [source.key, false]));
  state.privateReady = false;
  state.privateDenied = false;
  state.privateError = null;
  clearPrivateCollections();
}

function clearPrivateCollections() {
  state.funds = [];
  state.allocations = [];
  state.lineItems = [];
  state.weeklyItems = [];
  state.mouseRows = [];
  state.auditLogs = [];
}

async function toggleTask(task, done, checkbox) {
  if (!state.user) {
    checkbox.checked = !done;
    setStatus("ログインすると編集できます。");
    return;
  }

  if (!state.allowed || !state.live) {
    checkbox.checked = !done;
    setStatus("保存できないアカウントです。");
    return;
  }
  if (!state.canWrite) {
    checkbox.checked = !done;
    setStatus("書き込み権限が確認できません。");
    return;
  }

  state.savingIds.add(task.id);
  render();

  try {
    await updateDoc(doc(db, COLLECTIONS.tasks, task.id), {
      done,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email,
      completedAt: done ? serverTimestamp() : null,
      needsObsidianSync: true,
    });
    setStatus(done ? "Marked done" : "Reopened");
  } catch (error) {
    setStatus(`Save error: ${error.code}`);
    if (error.code === "permission-denied") {
      state.canWrite = false;
      updateAuthUI();
    }
  } finally {
    state.savingIds.delete(task.id);
    render();
  }
}

function activateView(view, options = {}) {
  if (view !== "board" && !canAccessPrivate()) {
    state.activeView = "board";
    if (!options.silent) {
      setStatus(state.user ? "内部台帳の読み込みまたは権限確認が必要です。" : "ログインすると内部台帳を表示できます。");
    }
  } else {
    state.activeView = view;
  }
  render();
}

function render() {
  renderNavigation();
  renderBoard();
  if (canAccessPrivate()) {
    renderBudget();
    renderWeek();
  }
}

function renderNavigation() {
  const privateVisible = canAccessPrivate();
  if (!privateVisible && state.activeView !== "board") {
    state.activeView = "board";
  }

  elements.budgetTab.classList.toggle("hidden", !privateVisible);
  elements.weekTab.classList.toggle("hidden", !privateVisible);

  elements.viewTabs.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.activeView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  elements.taskOverview.hidden = state.activeView !== "board";
  elements.boardPanel.hidden = state.activeView !== "board";
  elements.budgetPanel.hidden = state.activeView !== "budget";
  elements.weekPanel.hidden = state.activeView !== "week";
}

function renderBoard() {
  if (!["live", "static"].includes(state.view)) {
    elements.totalCount.textContent = "0";
    elements.doneCount.textContent = "0";
    elements.soonCount.textContent = "0";
    elements.board.classList.add("is-locked");
    elements.board.replaceChildren(renderAccessGate());
    return;
  }

  elements.board.classList.remove("is-locked");
  const tasks = state.tasks.map(normalizeTask).sort(taskSorter);
  const doneCount = tasks.filter((task) => task.done).length;
  const soonCount = tasks.filter((task) => !task.done && dueClass(task.due) === "soon").length;
  const editable = state.view === "live" && state.canWrite;

  elements.totalCount.textContent = String(tasks.length);
  elements.doneCount.textContent = String(doneCount);
  elements.soonCount.textContent = String(soonCount);
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
    addButton.hidden = !editable;

    if (editable) {
      addButton.setAttribute("aria-label", `${column.title}にタスクを追加`);
      addButton.addEventListener("click", () => openTaskDialog(column.id));
    }

    if (!columnTasks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No cards";
      list.append(empty);
    } else {
      columnTasks.forEach((task) => {
        list.append(renderTask(task, editable));
      });
    }

    elements.board.append(section);
  });
}

function renderBudget() {
  elements.budgetSummary.replaceChildren();
  elements.allocationTable.replaceChildren();
  elements.lineItemTable.replaceChildren();
  elements.auditLogList.replaceChildren();

  if (!state.funds.length) {
    elements.budgetSummary.append(renderEmptyState("Firestoreに資金枠がありません。ログイン後にAdd fundから内部台帳を作成してください。"));
  } else {
    elements.budgetSummary.append(renderGrandTotalCard());
    state.funds.sort(sortByOrder).forEach((fund) => {
      elements.budgetSummary.append(renderFundCard(fund));
    });
  }

  renderAllocationTable();
  renderLineItemTable();
  renderAuditLog();
}

function renderGrandTotalCard() {
  const totals = calculateGrandTotals();
  const card = document.createElement("article");
  card.className = "budget-card is-total";

  const head = document.createElement("div");
  head.className = "budget-card-head";
  const titleWrap = document.createElement("div");
  const label = document.createElement("p");
  label.className = "column-label";
  label.textContent = "All funds";
  const title = document.createElement("h3");
  title.textContent = "Total budget";
  titleWrap.append(label, title);
  head.append(titleWrap);

  const grid = document.createElement("div");
  grid.className = "budget-metric-grid";
  [
    ["総額", formatYen(totals.total)],
    ["支払済み", formatYen(totals.paid)],
    ["発注済み", formatYen(totals.ordered)],
    ["見積済み", formatYen(totals.quoted)],
    ["使用可能", formatYen(totals.availableCash)],
    ["予測残", formatYen(totals.forecastRemaining)],
  ].forEach(([name, value]) => {
    const metric = document.createElement("div");
    metric.className = "budget-metric";
    const metricLabel = document.createElement("span");
    metricLabel.textContent = name;
    const metricValue = document.createElement("strong");
    metricValue.textContent = value;
    metric.append(metricLabel, metricValue);
    grid.append(metric);
  });

  card.append(head, grid);
  return card;
}

function renderFundCard(fund) {
  const totals = calculateFundTotals(fund.id);
  const card = document.createElement("article");
  card.className = "budget-card";

  const head = document.createElement("div");
  head.className = "budget-card-head";

  const titleWrap = document.createElement("div");
  const label = document.createElement("p");
  label.className = "column-label";
  label.textContent = fund.fiscalYear || "Fund";
  const title = document.createElement("h3");
  title.textContent = fund.name;
  titleWrap.append(label, title);

  const edit = smallButton("編集", () => openPrivateDialog("fund", fund));
  head.append(titleWrap, edit);

  const grid = document.createElement("div");
  grid.className = "budget-metric-grid";
  [
    ["総額", formatYen(fund.totalYen)],
    ["支払済み", formatYen(totals.paid)],
    ["発注済み", formatYen(totals.ordered)],
    ["見積済み", formatYen(totals.quoted)],
    ["使用可能", formatYen(totals.availableCash)],
    ["予測残", formatYen(totals.forecastRemaining)],
  ].forEach(([name, value]) => {
    const metric = document.createElement("div");
    metric.className = "budget-metric";
    const metricLabel = document.createElement("span");
    metricLabel.textContent = name;
    const metricValue = document.createElement("strong");
    metricValue.textContent = value;
    metric.append(metricLabel, metricValue);
    grid.append(metric);
  });

  card.append(head, grid);
  return card;
}

function renderAllocationTable() {
  const columnsForTable = ["配分枠", "資金枠", "区分", "枠金額", "使用予定", "残/超過", "担当", ""];
  const rows = state.allocations.sort(sortByOrder).map((allocation) => {
    const used = sumAmounts(state.lineItems.filter((item) => item.allocationId === allocation.id && item.status !== "cancelled"));
    const remaining = toNumber(allocation.amountYen) - used;
    return [
      textCell(allocation.title),
      textCell(fundName(allocation.fundId)),
      textCell(allocation.category || "-"),
      textCell(formatYen(allocation.amountYen)),
      textCell(formatYen(used)),
      warningCell(formatYen(remaining), remaining < 0),
      textCell(allocation.owner || "-"),
      actionCell("編集", () => openPrivateDialog("allocation", allocation)),
    ];
  });
  elements.allocationTable.append(renderDataTable(columnsForTable, rows, "配分枠は未登録です。"));
}

function renderLineItemTable() {
  const columnsForTable = ["状態", "支出line item", "資金/配分", "金額", "期限", "次判断", "担当", ""];
  const rows = state.lineItems.sort(sortByOrder).map((item) => [
    statusSelectCell(item.status, lineItemStatusOptions, (nextStatus) => updateLineItemStatus(item, nextStatus)),
    textCell(item.title),
    textCell(`${fundName(item.fundId)} / ${allocationName(item.allocationId)}`),
    textCell(formatYen(lineItemAmount(item))),
    textCell(renderDeadlineText(item)),
    textCell(item.nextDecision || item.blockedReason || "-"),
    textCell(item.owner || "-"),
    actionCell("編集", () => openPrivateDialog("lineItem", item)),
  ]);
  elements.lineItemTable.append(renderDataTable(columnsForTable, rows, "支出line itemは未登録です。"));
}

function renderAuditLog() {
  const logs = [...state.auditLogs].sort((a, b) => compareTimestampDesc(a.createdAt, b.createdAt)).slice(0, 8);
  if (!logs.length) {
    elements.auditLogList.append(renderEmptyState("audit logはまだありません。"));
    return;
  }

  logs.forEach((log) => {
    const item = document.createElement("li");
    item.className = "audit-item";

    const title = document.createElement("strong");
    title.textContent = `${auditActionLabel(log.action)} / ${log.collectionKey || log.collectionName || "-"}`;

    const meta = document.createElement("span");
    meta.textContent = `${formatTimestamp(log.createdAt)} / ${log.createdBy || "-"}`;

    item.append(title, meta);
    elements.auditLogList.append(item);
  });
}

function renderWeek() {
  elements.weeklyPlanList.replaceChildren();
  elements.mouseCohortTable.replaceChildren();

  if (!state.weeklyItems.length) {
    elements.weeklyPlanList.append(renderEmptyState("Next Week actionは未登録です。Add actionから、期限・成功条件・詰まった時の次行動まで入れてください。"));
  } else {
    state.weeklyItems.sort(sortWeeklyItems).forEach((item) => {
      elements.weeklyPlanList.append(renderWeeklyCard(item));
    });
  }

  renderMouseCohortTable();
}

function renderWeeklyCard(item) {
  const card = document.createElement("article");
  card.className = "weekly-card";

  const head = document.createElement("div");
  head.className = "weekly-card-head";

  const titleWrap = document.createElement("div");
  const label = document.createElement("p");
  label.className = "column-label";
  label.textContent = `${item.weekStart || "week"} / ${item.dueDate ? formatDue(item.dueDate) : "No due"}`;
  const title = document.createElement("h3");
  title.textContent = item.title;
  titleWrap.append(label, title);

  const status = renderStatusSelect(item.status, weeklyStatusOptions, (nextStatus) => updateWeeklyStatus(item, nextStatus));
  head.append(titleWrap, status);

  const detail = document.createElement("p");
  detail.className = "private-detail";
  detail.textContent = item.detail || "";

  const meta = document.createElement("dl");
  meta.className = "weekly-meta";
  appendDefinition(meta, "担当", item.owner || "-");
  appendDefinition(meta, "成功条件", item.successCondition || "-");
  appendDefinition(meta, "詰まった時", item.fallbackAction || "-");
  appendDefinition(meta, "予算line item", lineItemTitle(item.lineItemId));
  appendDefinition(meta, "次判断", item.nextDecision || "-");

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(smallButton("編集", () => openPrivateDialog("weeklyItem", item)));

  card.append(head, detail, meta, actions);
  return card;
}

function renderMouseCohortTable() {
  const columnsForTable = ["Strain/genotype", "出生時期", "予定群", "食餌/開始", "Endpoint", "Readout/検体", "予算line item", ""];
  const rows = state.mouseRows.sort(sortByOrder).map((row) => [
    textCell(row.strainGenotype),
    textCell(row.birthWindow || "-"),
    textCell(row.plannedGroup || "-"),
    textCell([row.diet, row.startDate].filter(Boolean).join(" / ") || "-"),
    textCell(row.endpoint || "-"),
    textCell([row.readouts, row.samples].filter(Boolean).join(" / ") || "-"),
    textCell(lineItemTitle(row.lineItemId)),
    actionCell("編集", () => openPrivateDialog("mouseRow", row)),
  ]);
  elements.mouseCohortTable.append(renderDataTable(columnsForTable, rows, "マウス群分け表は未登録です。Add mouse rowから、個体IDではなく群レベルで入力してください。"));
}

function renderAccessGate() {
  const gate = document.createElement("section");
  gate.className = "access-gate";

  const title = document.createElement("h2");
  const body = document.createElement("p");

  if (state.view === "checking") {
    title.textContent = "認証状態を確認中";
    body.textContent = "しばらくお待ちください。";
  } else if (state.view === "loading") {
    title.textContent = "タスクを読み込み中";
    body.textContent = "Firestoreから最新のタスクを取得しています。";
  } else if (state.view === "static-loading") {
    title.textContent = "タスクを読み込み中";
    body.textContent = "GitHubのtasks.jsonからタスクを取得しています。";
  } else if (state.view === "unauthorized") {
    title.textContent = "閲覧権限がありません";
    body.textContent = "許可されたGoogleアカウントでログインしてください。";
  } else if (state.view === "static-error") {
    title.textContent = "タスクを読み込めません";
    body.textContent = "GitHub Pagesのtasks.jsonを確認してください。";
  } else {
    title.textContent = "タスクを読み込めません";
    body.textContent = "ログイン状態またはFirestore権限を確認してください。";
  }

  gate.append(title, body);

  if (!state.user) {
    const login = document.createElement("button");
    login.type = "button";
    login.className = "button primary";
    login.textContent = "Googleでログイン";
    login.addEventListener("click", () => elements.loginButton.click());
    gate.append(login);
  }

  return gate;
}

function openTaskDialog(columnId) {
  if (!state.allowed || !state.live || !state.canWrite) {
    setStatus("保存できないアカウントです。");
    return;
  }

  const column = columns.find((candidate) => candidate.id === columnId) || columns[0];
  elements.taskForm.reset();
  elements.taskColumn.value = column.id;
  elements.taskOwner.value = defaultOwner();
  elements.taskTone.value = defaultTone(column.id);
  elements.taskTag.value = defaultTag(column.id);
  elements.taskFormStatus.textContent = "";
  elements.taskDialogTitle.textContent = `${column.title}に追加`;
  elements.saveTaskButton.disabled = false;
  elements.taskDialog.showModal();
  elements.taskTitle.focus();
}

function closeTaskDialog() {
  if (state.creating) return;
  elements.taskDialog.close();
}

function openOwnerDialog(task) {
  if (!state.allowed || !state.live || !state.canWrite) {
    setStatus("保存できないアカウントです。");
    return;
  }

  state.editingOwnerTaskId = task.id;
  elements.ownerForm.reset();
  elements.ownerName.value = task.owner || defaultOwner();
  elements.ownerFormStatus.textContent = "";
  elements.ownerDialogTitle.textContent = "担当を変更";
  elements.saveOwnerButton.disabled = false;
  elements.ownerDialog.showModal();
  elements.ownerName.focus();
  elements.ownerName.select();
}

function closeOwnerDialog() {
  if (state.updatingOwner) return;
  state.editingOwnerTaskId = null;
  elements.ownerDialog.close();
}

function openPrivateDialog(type, record = null) {
  if (!canAccessPrivate()) {
    setStatus("内部台帳の読み込みまたは権限確認が必要です。");
    return;
  }

  const config = privateFormConfig(type);
  state.privateDialogType = type;
  state.privateDialogDocId = record?.id || null;
  elements.privateForm.reset();
  elements.privateFields.replaceChildren();
  elements.privateFormStatus.textContent = "";
  elements.privateDialogTitle.textContent = `${record ? "編集" : "追加"}: ${config.title}`;
  elements.savePrivateButton.textContent = record ? "保存" : "追加";
  elements.savePrivateButton.disabled = false;

  config.fields.forEach((field) => {
    elements.privateFields.append(renderPrivateField(field, record));
  });

  elements.privateDialog.showModal();
  const firstInput = elements.privateFields.querySelector("input, select, textarea");
  firstInput?.focus();
}

function closePrivateDialog() {
  if (state.savingPrivate) return;
  state.privateDialogType = null;
  state.privateDialogDocId = null;
  elements.privateDialog.close();
}

async function saveTaskOwner() {
  if (!state.user || !state.allowed || !state.live || !state.canWrite || state.updatingOwner || !state.editingOwnerTaskId) {
    elements.ownerFormStatus.textContent = "保存できない状態です。";
    return;
  }

  const owner = elements.ownerName.value.trim() || defaultOwner();
  state.updatingOwner = true;
  elements.saveOwnerButton.disabled = true;
  elements.ownerFormStatus.textContent = "保存中";

  try {
    await updateDoc(doc(db, COLLECTIONS.tasks, state.editingOwnerTaskId), {
      owner,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email,
      ownerUpdatedAt: serverTimestamp(),
      ownerUpdatedBy: state.user.email,
      needsObsidianSync: true,
    });
    setStatus("Owner updated");
    state.editingOwnerTaskId = null;
    elements.ownerDialog.close();
  } catch (error) {
    elements.ownerFormStatus.textContent = `Save error: ${error.code}`;
    if (error.code === "permission-denied") {
      state.canWrite = false;
      updateAuthUI();
      render();
    }
  } finally {
    state.updatingOwner = false;
    elements.saveOwnerButton.disabled = false;
  }
}

async function createTaskFromForm() {
  if (!state.user || !state.allowed || !state.live || !state.canWrite || state.creating) {
    elements.taskFormStatus.textContent = "保存できない状態です。";
    return;
  }

  const title = elements.taskTitle.value.trim();
  if (!title) {
    elements.taskFormStatus.textContent = "タイトルを入力してください。";
    elements.taskTitle.focus();
    return;
  }

  const column = elements.taskColumn.value;
  const done = column === "done";
  const task = {
    title,
    detail: elements.taskDetail.value.trim(),
    due: elements.taskDue.value,
    column,
    owner: elements.taskOwner.value.trim() || defaultOwner(),
    tag: elements.taskTag.value.trim() || "Task",
    tone: elements.taskTone.value,
    order: nextOrder(column),
    done,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: state.user.email,
    updatedBy: state.user.email,
    completedAt: done ? serverTimestamp() : null,
    needsObsidianSync: true,
  };

  state.creating = true;
  elements.saveTaskButton.disabled = true;
  elements.taskFormStatus.textContent = "保存中";

  try {
    await addDoc(collection(db, COLLECTIONS.tasks), task);
    setStatus("Task added");
    elements.taskDialog.close();
  } catch (error) {
    elements.taskFormStatus.textContent = `Save error: ${error.code}`;
    if (error.code === "permission-denied") {
      state.canWrite = false;
      updateAuthUI();
      render();
    }
  } finally {
    state.creating = false;
    elements.saveTaskButton.disabled = false;
  }
}

async function savePrivateDialog() {
  if (!state.user || !canAccessPrivate() || state.savingPrivate || !state.privateDialogType) {
    elements.privateFormStatus.textContent = "保存できない状態です。";
    return;
  }

  const config = privateFormConfig(state.privateDialogType);
  const payload = buildPrivatePayload(config);
  if (!payload) return;
  if (!validatePrivatePayload(state.privateDialogType, payload)) return;

  const collectionKey = typeToCollectionKey[state.privateDialogType];
  const collectionName = COLLECTIONS[collectionKey];
  const isEdit = Boolean(state.privateDialogDocId);
  const nowFields = {
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email,
    visibility: "private",
    schemaVersion: 1,
  };

  state.savingPrivate = true;
  elements.savePrivateButton.disabled = true;
  elements.privateFormStatus.textContent = "保存中";

  try {
    const batch = writeBatch(db);
    if (isEdit) {
      const recordRef = doc(db, collectionName, state.privateDialogDocId);
      batch.update(recordRef, {
        ...payload,
        ...nowFields,
      });
      appendAuditToBatch(batch, "update", collectionKey, state.privateDialogDocId, payload);
      await batch.commit();
      setStatus("Internal record updated");
    } else {
      const recordRef = doc(collection(db, collectionName));
      batch.set(recordRef, {
        ...payload,
        ...nowFields,
        order: nextPrivateOrder(collectionKey),
        createdAt: serverTimestamp(),
        createdBy: state.user.email,
      });
      appendAuditToBatch(batch, "create", collectionKey, recordRef.id, payload);
      await batch.commit();
      setStatus("Internal record added");
    }
    closePrivateDialog();
  } catch (error) {
    elements.privateFormStatus.textContent = `Save error: ${error.code}`;
    if (error.code === "permission-denied") {
      handlePrivateError(error);
    }
  } finally {
    state.savingPrivate = false;
    elements.savePrivateButton.disabled = false;
  }
}

async function updateLineItemStatus(item, nextStatus) {
  if (!canAccessPrivate() || item.status === nextStatus) return;
  const previousStatus = item.status;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTIONS.lineItems, item.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email,
    });
    appendAuditToBatch(batch, "status", "lineItems", item.id, {
      status: { from: previousStatus, to: nextStatus },
    });
    await batch.commit();
    setStatus("Line item status updated");
  } catch (error) {
    setStatus(`Status save error: ${error.code}`);
    if (error.code === "permission-denied") {
      handlePrivateError(error);
    }
  }
}

async function updateWeeklyStatus(item, nextStatus) {
  if (!canAccessPrivate() || item.status === nextStatus) return;
  const previousStatus = item.status;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, COLLECTIONS.weeklyItems, item.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.email,
    });
    appendAuditToBatch(batch, "status", "weeklyItems", item.id, {
      status: { from: previousStatus, to: nextStatus },
    });
    await batch.commit();
    setStatus("Weekly action status updated");
  } catch (error) {
    setStatus(`Status save error: ${error.code}`);
    if (error.code === "permission-denied") {
      handlePrivateError(error);
    }
  }
}

function appendAuditToBatch(batch, action, collectionKey, docId, changes) {
  const auditRef = doc(collection(db, COLLECTIONS.auditLogs));
  batch.set(auditRef, {
    action,
    collectionKey,
    docId,
    changes: sanitizeForFirestore(changes),
    createdAt: serverTimestamp(),
    createdBy: state.user?.email || "",
    visibility: "private",
    schemaVersion: 1,
  });
}

function renderTask(task, editable) {
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
  checkbox.disabled = !editable || state.savingIds.has(task.id);
  checkbox.setAttribute("aria-label", editable ? `${task.title}を${task.done ? "未完了" : "完了"}にする` : `${task.title}は${task.done ? "完了" : "未完了"}`);

  tag.textContent = task.tag;
  due.textContent = task.due ? formatDue(task.due) : "No due";
  if (task.due) {
    due.dateTime = task.due;
  }
  title.textContent = task.title;
  detail.textContent = task.detail;
  owner.textContent = task.owner;
  owner.disabled = !editable;
  owner.setAttribute("aria-label", editable ? `${task.title}の担当を変更` : `${task.title}の担当: ${task.owner}`);
  statePill.textContent = task.done ? "Done" : statusLabel(statusClass);

  if (editable) {
    checkbox.addEventListener("change", () => {
      toggleTask(task, checkbox.checked, checkbox);
    });
    owner.addEventListener("click", () => {
      openOwnerDialog(task);
    });
  }

  return card;
}

function renderPrivateField(field, record) {
  const label = document.createElement("label");
  label.className = field.kind === "checkbox" ? "checkbox-field" : "";
  if (field.kind === "textarea") {
    label.classList.add("wide-field");
  }
  const span = document.createElement("span");
  span.textContent = field.label;

  let control;
  if (field.kind === "textarea") {
    control = document.createElement("textarea");
    control.rows = field.rows || 3;
  } else if (field.kind === "select") {
    control = document.createElement("select");
    field.options().forEach((optionConfig) => {
      const option = document.createElement("option");
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      control.append(option);
    });
  } else {
    control = document.createElement("input");
    control.type = field.kind || "text";
  }

  control.id = `private-${field.name}`;
  control.name = field.name;
  control.required = Boolean(field.required);
  if (field.maxLength) control.maxLength = field.maxLength;

  if (field.kind === "checkbox") {
    control.checked = record ? Boolean(record[field.name]) : Boolean(field.defaultValue);
  } else {
    const value = record?.[field.name] ?? field.defaultValue ?? "";
    control.value = value;
  }

  label.append(span, control);
  return label;
}

function renderDataTable(headings, rows, emptyText) {
  if (!rows.length) {
    return renderEmptyState(emptyText);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "data-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headings.forEach((heading) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = heading;
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      if (cell instanceof Node) {
        td.append(cell);
      } else {
        td.textContent = String(cell);
      }
      tr.append(td);
    });
    tbody.append(tr);
  });

  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  return empty;
}

function renderStatusSelect(value, options, onChange) {
  const select = document.createElement("select");
  select.className = "status-select";
  options.forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = optionConfig.value;
    option.textContent = optionConfig.label;
    select.append(option);
  });
  select.value = value || options[0]?.value || "";
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function statusSelectCell(value, options, onChange) {
  return renderStatusSelect(value, options, onChange);
}

function textCell(value) {
  const span = document.createElement("span");
  span.textContent = value || "-";
  return span;
}

function warningCell(value, isWarning) {
  const span = textCell(value);
  span.classList.toggle("warning-text", Boolean(isWarning));
  return span;
}

function actionCell(label, handler) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  wrap.append(smallButton(label, handler));
  return wrap;
}

function smallButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button ghost small-button";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function appendDefinition(list, term, description) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = description;
  list.append(dt, dd);
}

function privateFormConfig(type) {
  const configs = {
    fund: {
      title: "資金枠",
      fields: [
        { name: "name", label: "資金枠名", required: true, maxLength: 120 },
        { name: "totalYen", label: "総額（税込想定）", kind: "number", required: true },
        { name: "fiscalYear", label: "年度", maxLength: 40 },
        { name: "owner", label: "担当", maxLength: 80, defaultValue: defaultOwner() },
        { name: "notes", label: "メモ", kind: "textarea", maxLength: 1000 },
      ],
    },
    allocation: {
      title: "配分枠",
      fields: [
        { name: "fundId", label: "資金枠", kind: "select", required: true, options: fundOptions },
        { name: "title", label: "配分枠名", required: true, maxLength: 140 },
        { name: "category", label: "区分", maxLength: 80 },
        { name: "amountYen", label: "枠金額", kind: "number" },
        { name: "owner", label: "担当", maxLength: 80, defaultValue: defaultOwner() },
        { name: "notes", label: "メモ", kind: "textarea", maxLength: 1000 },
      ],
    },
    lineItem: {
      title: "支出line item",
      fields: [
        { name: "fundId", label: "資金枠", kind: "select", required: true, options: fundOptions },
        { name: "allocationId", label: "配分枠", kind: "select", options: allocationOptions },
        { name: "title", label: "支出名", required: true, maxLength: 160 },
        { name: "status", label: "状態", kind: "select", required: true, options: () => lineItemStatusOptions, defaultValue: "plannedDraft" },
        { name: "amountYenTaxIncluded", label: "金額（税込・正本）", kind: "number", required: true },
        { name: "amountYenTaxExcluded", label: "金額（税抜・参考）", kind: "number" },
        { name: "quoteDate", label: "見積日", kind: "date" },
        { name: "orderDeadline", label: "最遅発注日", kind: "date" },
        { name: "orderedAt", label: "発注日", kind: "date" },
        { name: "expectedDeliveryDate", label: "納品予定日", kind: "date" },
        { name: "paidAt", label: "支払日", kind: "date" },
        { name: "owner", label: "担当", maxLength: 80, defaultValue: defaultOwner() },
        { name: "confidence", label: "見積信頼度", kind: "select", options: () => confidenceOptions, defaultValue: "medium" },
        { name: "blockedReason", label: "詰まり", kind: "textarea", maxLength: 800 },
        { name: "nextDecision", label: "次判断", kind: "textarea", maxLength: 800 },
        { name: "notes", label: "メモ", kind: "textarea", maxLength: 1000 },
      ],
    },
    weeklyItem: {
      title: "Next Week action",
      fields: [
        { name: "weekStart", label: "週開始日", kind: "date", required: true },
        { name: "title", label: "Action", required: true, maxLength: 160 },
        { name: "detail", label: "詳細", kind: "textarea", maxLength: 1000 },
        { name: "dueDate", label: "期限", kind: "date" },
        { name: "owner", label: "担当", maxLength: 80, defaultValue: defaultOwner() },
        { name: "status", label: "状態", kind: "select", required: true, options: () => weeklyStatusOptions, defaultValue: "todo" },
        { name: "lineItemId", label: "予算line item", kind: "select", options: lineItemOptions },
        { name: "successCondition", label: "成功条件", kind: "textarea", maxLength: 800 },
        { name: "fallbackAction", label: "詰まった時の次行動", kind: "textarea", maxLength: 800 },
        { name: "nextDecision", label: "金曜判断", kind: "textarea", maxLength: 800 },
      ],
    },
    mouseRow: {
      title: "マウス群分け行",
      fields: [
        { name: "strainGenotype", label: "Strain/genotype", required: true, maxLength: 120 },
        { name: "birthWindow", label: "出生時期", maxLength: 80 },
        { name: "plannedGroup", label: "予定群", maxLength: 120 },
        { name: "diet", label: "食餌", maxLength: 120 },
        { name: "startDate", label: "開始日", kind: "date" },
        { name: "endpoint", label: "Endpoint", maxLength: 120 },
        { name: "readouts", label: "Readout", kind: "textarea", maxLength: 1000 },
        { name: "samples", label: "必要検体", kind: "textarea", maxLength: 1000 },
        { name: "lineItemId", label: "予算line item", kind: "select", options: lineItemOptions },
        { name: "owner", label: "担当", maxLength: 80, defaultValue: defaultOwner() },
        { name: "privateFlag", label: "公開不可フラグ", kind: "checkbox", defaultValue: true },
        { name: "notes", label: "メモ", kind: "textarea", maxLength: 1000 },
      ],
    },
  };

  return configs[type];
}

function buildPrivatePayload(config) {
  const payload = {};
  const formData = new FormData(elements.privateForm);

  for (const field of config.fields) {
    const control = elements.privateForm.elements[field.name];
    let value;

    if (field.kind === "checkbox") {
      value = Boolean(control?.checked);
    } else {
      value = String(formData.get(field.name) ?? "").trim();
    }

    if (field.required && (value === "" || value === null || value === undefined)) {
      elements.privateFormStatus.textContent = `${field.label}を入力してください。`;
      control?.focus();
      return null;
    }

    if (field.kind === "number") {
      payload[field.name] = value === "" ? null : Number(value);
      if (payload[field.name] !== null && !Number.isFinite(payload[field.name])) {
        elements.privateFormStatus.textContent = `${field.label}は数値で入力してください。`;
        control?.focus();
        return null;
      }
      if (payload[field.name] !== null && payload[field.name] < 0) {
        elements.privateFormStatus.textContent = `${field.label}は0以上で入力してください。`;
        control?.focus();
        return null;
      }
    } else {
      payload[field.name] = value;
    }
  }

  return payload;
}

function validatePrivatePayload(type, payload) {
  if (type === "lineItem") {
    if (!Number.isFinite(payload.amountYenTaxIncluded) || payload.amountYenTaxIncluded < 0) {
      elements.privateFormStatus.textContent = "支出line itemは税込金額を0以上で入力してください。";
      elements.privateForm.elements.amountYenTaxIncluded?.focus();
      return false;
    }

    if (payload.allocationId) {
      const allocation = state.allocations.find((candidate) => candidate.id === payload.allocationId);
      if (allocation && allocation.fundId !== payload.fundId) {
        elements.privateFormStatus.textContent = "配分枠と資金枠が一致していません。";
        elements.privateForm.elements.allocationId?.focus();
        return false;
      }
    }
  }

  if (type === "allocation" && payload.fundId && payload.amountYen !== null) {
    const fundTotal = toNumber(state.funds.find((fund) => fund.id === payload.fundId)?.totalYen);
    if (fundTotal && payload.amountYen > fundTotal) {
      elements.privateFormStatus.textContent = "配分枠が資金枠の総額を超えています。";
      elements.privateForm.elements.amountYen?.focus();
      return false;
    }
  }

  return true;
}

function fundOptions() {
  const options = state.funds.sort(sortByOrder).map((fund) => ({ value: fund.id, label: fund.name }));
  return options.length ? options : [{ value: "", label: "資金枠を先に追加" }];
}

function allocationOptions() {
  return [
    { value: "", label: "未指定" },
    ...state.allocations.sort(sortByOrder).map((allocation) => ({ value: allocation.id, label: allocation.title })),
  ];
}

function lineItemOptions() {
  return [
    { value: "", label: "未指定" },
    ...state.lineItems.sort(sortByOrder).map((item) => ({ value: item.id, label: item.title })),
  ];
}

function canAccessPrivate() {
  return Boolean(state.user && state.allowed && state.live && state.canWrite && state.privateReady && !state.privateDenied);
}

function calculateFundTotals(fundId) {
  const items = state.lineItems.filter((item) => item.fundId === fundId);
  const paid = sumAmounts(items.filter((item) => item.status === "paid"));
  const ordered = sumAmounts(items.filter((item) => orderedStatuses.has(item.status)));
  const quoted = sumAmounts(items.filter((item) => item.status === "quoted"));
  const quotedHighConfidence = sumAmounts(items.filter((item) => item.status === "quoted" && item.confidence === "high"));
  const plannedApproved = sumAmounts(items.filter((item) => item.status === "plannedApproved"));
  const total = toNumber(state.funds.find((fund) => fund.id === fundId)?.totalYen);

  return {
    paid,
    ordered,
    quoted,
    quotedHighConfidence,
    plannedApproved,
    availableCash: total - paid - ordered,
    forecastRemaining: total - paid - ordered - quotedHighConfidence - plannedApproved,
  };
}

function calculateGrandTotals() {
  const fundTotals = state.funds.map((fund) => calculateFundTotals(fund.id));
  return {
    total: state.funds.reduce((sum, fund) => sum + toNumber(fund.totalYen), 0),
    paid: fundTotals.reduce((sum, totals) => sum + totals.paid, 0),
    ordered: fundTotals.reduce((sum, totals) => sum + totals.ordered, 0),
    quoted: fundTotals.reduce((sum, totals) => sum + totals.quoted, 0),
    availableCash: fundTotals.reduce((sum, totals) => sum + totals.availableCash, 0),
    forecastRemaining: fundTotals.reduce((sum, totals) => sum + totals.forecastRemaining, 0),
  };
}

function sumAmounts(items) {
  return items.reduce((sum, item) => sum + lineItemAmount(item), 0);
}

function lineItemAmount(item) {
  return toNumber(item.amountYenTaxIncluded);
}

function renderDeadlineText(item) {
  const values = [
    item.orderDeadline ? `発注 ${formatDue(item.orderDeadline)}` : "",
    item.expectedDeliveryDate ? `納品 ${formatDue(item.expectedDeliveryDate)}` : "",
    item.paidAt ? `支払 ${formatDue(item.paidAt)}` : "",
  ].filter(Boolean);
  return values.join(" / ") || "-";
}

function nextOrder(columnId) {
  const columnOrders = state.tasks
    .filter((task) => (task.done ? "done" : task.column) === columnId)
    .map((task) => task.order)
    .filter(Number.isFinite);

  if (!columnOrders.length) {
    return (columns.findIndex((column) => column.id === columnId) + 1) * 100;
  }

  return Math.max(...columnOrders) + 10;
}

function nextPrivateOrder(collectionKey) {
  const orders = state[collectionKey]
    .map((entry) => entry.order)
    .filter(Number.isFinite);
  return orders.length ? Math.max(...orders) + 10 : 100;
}

function defaultOwner() {
  if (!state.user?.email) return "Unassigned";
  if (state.user.displayName) return state.user.displayName;
  return state.user.email.split("@")[0];
}

function defaultTag(columnId) {
  if (columnId === "rna") return "RNA-seq";
  if (columnId === "mouse") return "Mouse";
  if (columnId === "validation") return "FACS";
  if (columnId === "analysis") return "Analysis";
  if (columnId === "done") return "Archive";
  return "Task";
}

function defaultTone(columnId) {
  if (columnId === "mouse") return "red";
  if (columnId === "rna" || columnId === "analysis") return "blue";
  if (columnId === "validation") return "green";
  if (columnId === "done") return "gold";
  return "pink";
}

function updateAuthUI() {
  const user = state.user;
  elements.loginButton.classList.toggle("hidden", Boolean(user));
  elements.logoutButton.classList.toggle("hidden", !user);

  if (!user) {
    elements.authState.textContent = "未ログイン";
    elements.authEmail.textContent = state.view === "static" ? "GitHub tasks / ログインで編集" : "";
  } else if (state.allowed && state.live && state.canWrite) {
    elements.authState.textContent = state.privateReady ? "ログイン中" : "内部台帳確認中";
    elements.authEmail.textContent = `${defaultOwner()} / ${user.email}`;
  } else if (state.allowed) {
    elements.authState.textContent = "読み取り中";
    elements.authEmail.textContent = `${defaultOwner()} / ${user.email}`;
  } else {
    elements.authState.textContent = "未許可";
    elements.authEmail.textContent = user.email;
  }
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

function normalizePrivateDoc(key, entry) {
  if (key === "funds") {
    return {
      ...entry,
      name: entry.name || "Untitled fund",
      totalYen: toNumber(entry.totalYen),
      order: toNumber(entry.order, 999),
    };
  }

  if (key === "allocations") {
    return {
      ...entry,
      title: entry.title || "Untitled allocation",
      amountYen: toNumber(entry.amountYen),
      order: toNumber(entry.order, 999),
    };
  }

  if (key === "lineItems") {
    return {
      ...entry,
      title: entry.title || "Untitled line item",
      status: entry.status || "plannedDraft",
      amountYenTaxIncluded: nullableNumber(entry.amountYenTaxIncluded),
      amountYenTaxExcluded: nullableNumber(entry.amountYenTaxExcluded),
      confidence: entry.confidence || "medium",
      order: toNumber(entry.order, 999),
    };
  }

  if (key === "weeklyItems") {
    return {
      ...entry,
      title: entry.title || "Untitled action",
      status: entry.status || "todo",
      order: toNumber(entry.order, 999),
    };
  }

  if (key === "mouseRows") {
    return {
      ...entry,
      strainGenotype: entry.strainGenotype || "Untitled cohort",
      privateFlag: entry.privateFlag !== false,
      order: toNumber(entry.order, 999),
    };
  }

  return {
    ...entry,
    order: toNumber(entry.order, 999),
  };
}

function taskSorter(a, b) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  if (a.column !== b.column) {
    return columns.findIndex((column) => column.id === a.column) - columns.findIndex((column) => column.id === b.column);
  }
  return a.order - b.order;
}

function sortByOrder(a, b) {
  return toNumber(a.order, 999) - toNumber(b.order, 999);
}

function sortWeeklyItems(a, b) {
  if ((a.weekStart || "") !== (b.weekStart || "")) return (a.weekStart || "").localeCompare(b.weekStart || "");
  if ((a.dueDate || "") !== (b.dueDate || "")) return (a.dueDate || "").localeCompare(b.dueDate || "");
  return sortByOrder(a, b);
}

function fundName(fundId) {
  return state.funds.find((fund) => fund.id === fundId)?.name || "未指定";
}

function allocationName(allocationId) {
  if (!allocationId) return "未指定";
  return state.allocations.find((allocation) => allocation.id === allocationId)?.title || "未指定";
}

function lineItemTitle(lineItemId) {
  if (!lineItemId) return "未指定";
  return state.lineItems.find((item) => item.id === lineItemId)?.title || "未指定";
}

function formatDue(value) {
  const date = parseDate(value);
  if (!date) return "No due";
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
}

function formatTimestamp(value) {
  if (!value) return "-";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function auditActionLabel(action) {
  if (action === "create") return "追加";
  if (action === "update") return "更新";
  if (action === "status") return "状態変更";
  return action || "変更";
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareTimestampDesc(a, b) {
  return timestampMillis(b) - timestampMillis(a);
}

function timestampMillis(value) {
  if (!value) return 0;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function sanitizeForFirestore(value) {
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeForFirestore(entry)]));
  }
  if (value === undefined) return null;
  return value;
}
