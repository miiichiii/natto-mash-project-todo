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

const COLLECTION = "nattoMashTasks";

const columns = [
  { id: "now", label: "Focus", title: "直近" },
  { id: "rna", label: "Molecular", title: "RNA-seq" },
  { id: "mouse", label: "In vivo", title: "マウス/血清" },
  { id: "validation", label: "Validation", title: "FACS/Cytokine" },
  { id: "analysis", label: "Figures", title: "解析/図" },
  { id: "done", label: "Archive", title: "完了" },
];

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
  view: "checking",
  live: false,
  creating: false,
  updatingOwner: false,
  editingOwnerTaskId: null,
  savingIds: new Set(),
  unsubscribe: null,
};

const elements = {
  board: document.getElementById("board"),
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

onAuthStateChanged(auth, (user) => {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }

  state.user = user;
  state.allowed = Boolean(user);
  state.canWrite = false;
  state.live = false;
  state.editingOwnerTaskId = null;
  updateAuthUI();

  if (!user) {
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
  const tasksQuery = query(collection(db, COLLECTION), orderBy("order"));
  state.unsubscribe = onSnapshot(tasksQuery, async (snapshot) => {
    state.live = true;
    state.view = "live";
    state.allowed = true;
    state.canWrite = true;
    state.tasks = snapshot.docs.map((taskDoc) => normalizeTask({ id: taskDoc.id, ...taskDoc.data() }));
    setStatus("Firestore synced / 編集可");
    updateAuthUI();
    render();
  }, (error) => {
    state.live = false;
    state.tasks = [];
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
    await updateDoc(doc(db, COLLECTION, task.id), {
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

function render() {
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
    await updateDoc(doc(db, COLLECTION, state.editingOwnerTaskId), {
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
    await addDoc(collection(db, COLLECTION), task);
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
    elements.authState.textContent = "ログイン中";
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
