import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import {
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

const COLLECTION = "nattoMashTasks";
const allowedEmails = new Set(["hamamicchi@gmail.com", "xxelement8.xii@gmail.com"]);

const columns = [
  { id: "now", label: "Focus", title: "直近" },
  { id: "rna", label: "Molecular", title: "RNA-seq" },
  { id: "mouse", label: "In vivo", title: "マウス/血清" },
  { id: "validation", label: "Validation", title: "FACS/Cytokine" },
  { id: "analysis", label: "Figures", title: "解析/図" },
  { id: "done", label: "Archive", title: "完了" },
];

const defaultTasks = [
  {
    id: "rna-sample-table-20260605",
    title: "macrophage RNA-seq提出用サンプル表を完成させる",
    detail: "source sample ID、tube label、ISOGEN量を埋めて発注相談へ進める。",
    due: "2026-06-05",
    column: "now",
    owner: "Hamada",
    tag: "RNA-seq",
    tone: "green",
    order: 10,
  },
  {
    id: "rna-order-conditions-20260607",
    title: "macrophage RNA-seqの発注条件を固める",
    detail: "見積、必要量、送付条件、納期、ISOGEN受入可否を記録する。",
    due: "2026-06-07",
    column: "rna",
    owner: "Hamada",
    tag: "Order",
    tone: "blue",
    order: 20,
  },
  {
    id: "liposearch-samples-20260612",
    title: "LipoSEARCH採用サンプルと除外理由を決める",
    detail: "血清量、freeze-thaw、溶血、チューブ不良を整理して決定する。",
    due: "2026-06-12",
    column: "mouse",
    owner: "Hamada",
    tag: "LipoSEARCH",
    tone: "red",
    order: 30,
  },
  {
    id: "pathology-fibrosis-20260614",
    title: "第2コホート肝臓病理画像と線維化first pass",
    detail: "代表画像と線維化面積またはスコアの初版を作る。",
    due: "2026-06-14",
    column: "mouse",
    owner: "Student",
    tag: "Pathology",
    tone: "pink",
    order: 40,
  },
  {
    id: "sample-master-v1-20260614",
    title: "sample master table v1を作る",
    detail: "主要サンプル、病理、血清、16S、十二指腸を横断的に追える状態にする。",
    due: "2026-06-14",
    column: "analysis",
    owner: "Student",
    tag: "Master",
    tone: "gold",
    order: 50,
  },
  {
    id: "serum-cytokine-decision-20260617",
    title: "血清サイトカイン測定の実施可否を判断する",
    detail: "血清残量と優先順位を確認し、測定候補を固定する。",
    due: "2026-06-17",
    column: "mouse",
    owner: "Hamada",
    tag: "Serum",
    tone: "blue",
    order: 60,
  },
  {
    id: "macrophage-facs-cytokine-20260618",
    title: "macrophage FACS/上清サイトカイン条件を固定する",
    detail: "パネル、上清測定、追加購入候補を決める。",
    due: "2026-06-18",
    column: "validation",
    owner: "Hamada",
    tag: "FACS",
    tone: "green",
    order: 70,
  },
  {
    id: "firebase-mvp-20260620",
    title: "Firebase Todo app MVPを仕上げる",
    detail: "Google login、Todo一覧、checkbox保存、期限表示を確認する。",
    due: "2026-06-20",
    column: "analysis",
    owner: "Hamada",
    tag: "App",
    tone: "pink",
    order: 80,
  },
  {
    id: "tyr140ga-splicing-20260620",
    title: "Tyr140G>A splicing解析の見積と陽性対照を判断する",
    detail: "見積取得とB6 Albino Tyr291G>T陽性対照の追加可否を決める。",
    due: "2026-06-20",
    column: "rna",
    owner: "Hamada",
    tag: "Splicing",
    tone: "blue",
    order: 90,
  },
  {
    id: "duodenum-qpcr-plan",
    title: "十二指腸qPCR候補遺伝子リストを作る",
    detail: "バリア、脂質吸収、胆汁酸/コレステロール代謝、炎症応答を候補にする。",
    due: "",
    column: "rna",
    owner: "Student",
    tag: "Duodenum",
    tone: "green",
    order: 100,
  },
  {
    id: "figure-plan-v1",
    title: "Figure構成案を作る",
    detail: "model、血清生化学、病理、LipoSEARCH、16S、macrophage RNA-seqを整理する。",
    due: "",
    column: "analysis",
    owner: "Hamada",
    tag: "Figure",
    tone: "gold",
    order: 110,
  },
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const state = {
  user: null,
  allowed: false,
  tasks: defaultTasks,
  live: false,
  savingIds: new Set(),
  unsubscribe: null,
  seeded: false,
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
};

setPersistence(auth, browserLocalPersistence).catch((error) => {
  setStatus(`Auth persistence error: ${error.code}`);
});

elements.loginButton.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error.code)) {
      setStatus(error.code === "auth/popup-closed-by-user" ? "ログインが中断されました。" : "Redirect login");
      if (error.code !== "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, provider);
      }
      return;
    }
    setStatus(`Login error: ${error.code}`);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }

  state.user = user;
  state.allowed = Boolean(user?.email && allowedEmails.has(user.email.toLowerCase()));
  state.live = false;
  updateAuthUI();

  if (!user) {
    state.tasks = defaultTasks;
    setStatus("Preview");
    render();
    return;
  }

  if (!state.allowed) {
    state.tasks = defaultTasks;
    setStatus("許可されていないアカウントです。");
    render();
    return;
  }

  setStatus("Firestore loading");
  subscribeTasks();
});

function subscribeTasks() {
  const tasksQuery = query(collection(db, COLLECTION), orderBy("order"));
  state.unsubscribe = onSnapshot(tasksQuery, async (snapshot) => {
    if (snapshot.empty && !state.seeded) {
      state.seeded = true;
      await seedDefaultTasks();
      return;
    }

    state.live = true;
    state.tasks = snapshot.docs.map((taskDoc) => normalizeTask({ id: taskDoc.id, ...taskDoc.data() }));
    setStatus("Firestore synced");
    render();
  }, (error) => {
    state.live = false;
    state.tasks = defaultTasks;
    setStatus(`Firestore error: ${error.code}`);
    render();
  });
}

async function seedDefaultTasks() {
  const batch = writeBatch(db);
  defaultTasks.forEach((task) => {
    const ref = doc(db, COLLECTION, task.id);
    batch.set(ref, {
      ...task,
      done: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

async function toggleTask(task, done, checkbox) {
  if (!state.user) {
    checkbox.checked = !done;
    setStatus("Googleログイン待ち");
    return;
  }

  if (!state.allowed || !state.live) {
    checkbox.checked = !done;
    setStatus("保存できないアカウントです。");
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
    });
    setStatus(done ? "Marked done" : "Reopened");
  } catch (error) {
    setStatus(`Save error: ${error.code}`);
  } finally {
    state.savingIds.delete(task.id);
    render();
  }
}

function render() {
  const tasks = state.tasks.map(normalizeTask);
  const doneCount = tasks.filter((task) => task.done).length;
  const soonCount = tasks.filter((task) => !task.done && dueClass(task.due) === "soon").length;

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
    const list = columnNode.querySelector(".task-list");
    const columnTasks = tasks.filter((task) => task.done ? column.id === "done" : task.column === column.id);

    label.textContent = column.label;
    title.textContent = column.title;
    count.textContent = String(columnTasks.length);

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
  checkbox.disabled = state.savingIds.has(task.id);
  checkbox.setAttribute("aria-label", `${task.title}を${task.done ? "未完了" : "完了"}にする`);
  tag.textContent = task.tag;
  due.textContent = task.due ? formatDue(task.due) : "No due";
  if (task.due) {
    due.dateTime = task.due;
  }
  title.textContent = task.title;
  detail.textContent = task.detail;
  owner.textContent = task.owner;
  statePill.textContent = task.done ? "Done" : statusLabel(statusClass);

  checkbox.addEventListener("change", () => {
    toggleTask(task, checkbox.checked, checkbox);
  });

  return card;
}

function normalizeTask(task) {
  return {
    id: task.id,
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

function updateAuthUI() {
  const user = state.user;
  elements.authEmail.textContent = user?.email || "";
  elements.loginButton.classList.toggle("hidden", Boolean(user));
  elements.logoutButton.classList.toggle("hidden", !user);

  if (!user) {
    elements.authState.textContent = "未ログイン";
  } else if (state.allowed) {
    elements.authState.textContent = "ログイン中";
  } else {
    elements.authState.textContent = "未許可";
  }
}

function setStatus(text) {
  elements.syncStatus.textContent = text;
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

render();
