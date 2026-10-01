/* Taken randomizer - logica. Instellingen zijn hier bovenaan aanpasbaar. */
const SKIP_MS = 45000;
const COOLDOWN_DIV = 3;
const MAX_CYCLES = 3;
const WEIGHT_POWER = 1;
const MAX_LISTS = 9;
const MAX_NAME = 20;
const MAX_WORD = 10;
const CONFIRM_MS = 3000;
const WELCOME_MS = 300;
const BACKGROUNDS = ["images/achtergrond.svg"];
const KEY = "randomizer_data";

const $ = id => document.getElementById(id);
const rnd = n => Math.floor(Math.random() * n);
const K = s => "t:" + s;
const newList = name => ({ id: Date.now().toString(36) + rnd(1e6).toString(36), name, items: [], ages: {}, stats: {} });

document.documentElement.style.setProperty("--bg-image", 'url("' + BACKGROUNDS[rnd(BACKGROUNDS.length)] + '")');

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.lists) && d.lists.length) return d;
  } catch (e) {}
  return { lists: [newList("Taken")], last: null };
}
const S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

function stat(L, n, create) {
  const k = K(n);
  let s = L.stats[k];
  if (!s && create) s = L.stats[k] = { offered: 0, done: 0, skipped: 0, removed: 0 };
  return s;
}

function parse(text) {
  const seen = new Set(), out = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/^\s*([-*•·–]|\d+[.)])\s+/, "").trim();
    const k = line.toLowerCase();
    if (line && !seen.has(k)) { seen.add(k); out.push(line); }
  }
  return out;
}

function applyItems(L, names) {
  const old = L.items;
  old.filter(x => !names.includes(x)).forEach(x => {
    stat(L, x, true).removed++;
    delete L.ages[K(x)];
  });
  names.filter(x => !old.includes(x)).forEach(x => { L.ages[K(x)] = rnd(names.length + 1); });
  L.items = names;
  if (S.last && S.last.id === L.id && !names.includes(S.last.name)) S.last = null;
  save();
}

function pick(L) {
  const n = L.items.length, a = x => L.ages[K(x)];
  if (S.last && Date.now() - S.last.t < SKIP_MS) {
    const P = S.lists.find(l => l.id === S.last.id);
    if (P) stat(P, S.last.name, true).skipped++;
  }
  const cool = Math.min(Math.max(Math.floor(n / COOLDOWN_DIV), 1), n - 1);
  const due = L.items.filter(x => a(x) >= MAX_CYCLES * n - 1).sort((p, q) => a(q) - a(p));
  let c = due[0];
  if (!c) {
    const prev = S.last && S.last.id === L.id ? S.last.name : null;
    let pool = L.items.filter(x => a(x) >= cool);
    if (!pool.length) pool = L.items.filter(x => x !== prev);
    if (!pool.length) pool = L.items;
    const w = pool.map(x => Math.pow(a(x) + 1, WEIGHT_POWER));
    let r = Math.random() * w.reduce((s, v) => s + v, 0);
    const i = w.findIndex(v => (r -= v) < 0);
    c = pool[i < 0 ? pool.length - 1 : i];
  }
  L.items.forEach(x => { L.ages[K(x)] = a(x) + 1; });
  L.ages[K(c)] = 0;
  stat(L, c, true).offered++;
  S.last = { id: L.id, name: c, t: Date.now() };
  save();
  return c;
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function readFile(input, cb) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { cb(String(r.result)); input.value = ""; };
  r.readAsText(f);
}

function initMain() {
  const task = $("task"), acts = $("acts"), panel = $("panel");
  const box = $("box"), msg = $("msg"), nameIn = $("name"), count = $("count");
  const doneBtn = $("done"), removeBtn = $("remove"), confirmMsg = $("confirm-msg");
  const delBtn = $("del");
  const welcomeWrap = $("welcome-wrap");
  const welcome = $("welcome");
  const welcomeToggle = $("welcome-toggle");

  let cur = null, edit = null;
  nameIn.maxLength = MAX_NAME;

  const say = t => { msg.textContent = t; };
  const updateCount = () => {
    const v = nameIn.value, long = v.split(/\s+/).some(w => w.length > MAX_WORD);
    count.textContent = v.length + " van " + MAX_NAME + " tekens" + (long ? " - een woord langer dan " + MAX_WORD + " wordt afgebroken" : ", elk woord liefst hooguit " + MAX_WORD);
  };

  /* --- Welkomstblok: inklappen bij eerste actie, toggle via ⓘ ---------- */
  let welcomeCollapsed = false;
  function collapseWelcome() {
    if (welcomeCollapsed) return;
    welcomeCollapsed = true;
    welcome.classList.add("hiding");
    welcomeToggle.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      welcomeWrap.classList.add("collapsed");
      welcome.hidden = true;
    }, WELCOME_MS);
  }
  function expandWelcome() {
    welcomeCollapsed = false;
    welcome.hidden = false;
    welcomeWrap.classList.remove("collapsed");
    void welcome.offsetWidth;
    welcome.classList.remove("hiding");
    welcomeToggle.setAttribute("aria-expanded", "true");
  }
  welcomeToggle.addEventListener("click", () => {
    if (welcomeCollapsed) expandWelcome();
    else collapseWelcome();
  });

  // Eerste klik ergens op de pagina (behalve op de ⓘ-knop) klapt het blok in.
  document.addEventListener("pointerdown", e => {
    if (welcomeCollapsed) return;
    if (e.target.closest("#welcome-toggle")) return;
    collapseWelcome();
  }, true);

  /* --- Twee-staps bevestiging ------------------------------------------ */
  // We bewaren per knop de originele labeltekst zodat we die kunnen terugzetten.
  const origLabel = new WeakMap();
  [doneBtn, removeBtn].forEach(b => {
    origLabel.set(b, b.querySelector(".label").textContent);
  });

  let armed = null;
  function resetArmed() {
    if (!armed) return;
    clearTimeout(armed.timer);
    const b = armed.btn;
    b.classList.remove("confirming");
    b.querySelector(".label").textContent = origLabel.get(b);
    armed = null;
    confirmMsg.textContent = "";
  }
  function armBtn(btn) {
    if (armed && armed.btn === btn) return;
    resetArmed();
    btn.classList.add("confirming");
    btn.querySelector(".label").textContent = btn.dataset.confirm || "Bevestig";
    confirmMsg.textContent = btn.querySelector(".label").textContent;
    const timer = setTimeout(resetArmed, CONFIRM_MS);
    armed = { btn, timer };
  }
  function twoStep(btn, action) {
    btn.addEventListener("click", () => {
      if (!cur) return;
      if (armed && armed.btn === btn) { resetArmed(); action(); }
      else armBtn(btn);
    });
  }

  // De bevestigingsteksten zetten we via JS, want ze horen bij de logica.
  doneBtn.dataset.confirm = "Bevestig: uitgevoerd";
  removeBtn.dataset.confirm = "Bevestig: verwijderen";

  twoStep(doneBtn, () => {
    stat(cur.L, cur.name, true).done++;
    S.last = null;
    save();
    show(null);
  });
  twoStep(removeBtn, () => {
    applyItems(cur.L, cur.L.items.filter(x => x !== cur.name));
    show(null);
  });

  /* --- Twee-staps bevestiging op "Verwijder lijst" ---------------------- */
  const delLabel = delBtn.querySelector(".label");
  let delArmed = false, delTimer = null;
  function resetDel() {
    if (delTimer) clearTimeout(delTimer);
    delTimer = null;
    delArmed = false;
    delBtn.classList.remove("confirming");
    delLabel.textContent = delLabel.dataset.default;
  }
  delBtn.addEventListener("click", () => {
    if (!edit) return;
    if (S.lists.length < 2) return say("De laatste lijst kan niet worden verwijderd.");
    if (!delArmed) {
      delArmed = true;
      delBtn.classList.add("confirming");
      delLabel.textContent = delLabel.dataset.confirm;
      delTimer = setTimeout(resetDel, CONFIRM_MS);
      return;
    }
    resetDel();
    S.lists = S.lists.filter(L => L !== edit);
    if (S.last && S.last.id === edit.id) S.last = null;
    if (cur && cur.L === edit) show(null);
    save(); close(); render();
  });

  /* --- Tonen en bewerken ------------------------------------------------ */
  const show = (L, name, text) => {
    cur = name ? { L, name } : null;
    task.textContent = name || text || task.dataset.empty;
    acts.hidden = !name;
    resetArmed();
    task.classList.remove("drawn");
    void task.offsetWidth;
    if (name) task.classList.add("drawn");
  };
  const open = L => {
    edit = L; nameIn.value = L.name; box.value = L.items.join("\n");
    say(""); updateCount(); panel.classList.add("open");
  };
  const close = () => { edit = null; panel.classList.remove("open"); resetDel(); };
  const commit = () => {
    if (!edit) return;
    edit.name = nameIn.value.trim().slice(0, MAX_NAME) || edit.name;
    applyItems(edit, parse(box.value));
    if (cur && cur.L === edit && !edit.items.includes(cur.name)) show(null);
    close();
    render();
  };
  const draw = L => {
    if (L.items.length) return show(L, pick(L));
    open(L);
    show(null, null, "Deze lijst is nog leeg. Voeg taken toe.");
  };

  function render() {
    const g = $("grid");
    g.textContent = "";
    S.lists.forEach(L => {
      const t = document.createElement("div");
      t.className = "tile";
      const b = document.createElement("button");
      b.className = "pick";
      const sp = document.createElement("span");
      sp.textContent = L.name;
      b.append(sp);
      b.onclick = () => { commit(); draw(L); };
      const p = document.createElement("button");
      p.className = "pen";
      p.textContent = "✎";
      p.setAttribute("aria-label", "Bewerk " + L.name);
      p.onclick = () => { const same = edit === L; commit(); if (!same) open(L); };
      t.append(b, p);
      g.append(t);
    });
    if (S.lists.length < MAX_LISTS) {
      const a = document.createElement("button");
      a.className = "tile add";
      a.textContent = "+";
      a.setAttribute("aria-label", "Nieuwe lijst");
      a.onclick = () => {
        commit();
        const L = newList("Lijst " + (S.lists.length + 1));
        S.lists.push(L);
        save(); render(); open(L); nameIn.select();
      };
      g.append(a);
    }
  }

  $("surprise").onclick = () => {
    commit();
    const ok = S.lists.filter(L => L.items.length);
    if (ok.length) draw(ok[rnd(ok.length)]);
    else show(null, null, "Voeg eerst taken toe aan een lijst.");
  };
  $("save").onclick = commit;
  nameIn.oninput = updateCount;

  const text = () => parse(box.value).join("\n") + "\n";
  const fname = () => (nameIn.value.trim() || "takenlijst") + ".txt";
  $("copy").onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(text()) : Promise.reject())
    .then(() => say("Gekopieerd."), () => say("Kopiëren lukt hier niet."));
  $("dl").onclick = () => download(fname(), text());
  $("share").onclick = () => {
    if (navigator.share) {
      navigator.share({ title: nameIn.value, text: text() })
        .catch(err => { if (err && err.name !== "AbortError") say("Delen lukt hier niet."); });
    } else {
      say("Delen wordt niet ondersteund; het bestand wordt gedownload.");
      download(fname(), text());
    }
  };
  $("file").onchange = e => readFile(e.target, t => { box.value = t; say("Ingelezen. Het wordt bewaard zodra je op een andere knop drukt of op Klaar."); });

  show(null);
  render();
}

function initInfo() {
  const wrap = $("lists");
  const render = () => {
    wrap.textContent = "";
    S.lists.forEach(L => {
      const h = document.createElement("h3");
      h.textContent = L.name;
      const t = document.createElement("table");
      t.innerHTML =
        '<colgroup>' +
          '<col class="c-task">' +
          '<col class="c-num"><col class="c-num"><col class="c-num"><col class="c-num">' +
        '</colgroup>' +
        '<thead><tr>' +
          '<th>Taak</th><th>Aangeboden</th><th>Gedaan</th><th>Doorgeklikt</th><th>Verwijderd</th>' +
        '</tr></thead>';
      const b = t.createTBody();
      const rows = Object.keys(L.stats).map(k => [k.slice(2), L.stats[k]]).sort((x, y) => y[1].offered - x[1].offered);
      if (!rows.length) {
        const r = b.insertRow();
        const c = r.insertCell();
        c.colSpan = 5;
        c.textContent = "Nog niets geregistreerd.";
        c.style.textAlign = "left";
        c.style.color = "var(--muted)";
      }
      rows.forEach(([n, s]) => {
        const r = b.insertRow();
        [n + (L.items.includes(n) ? "" : " (niet meer in lijst)"), s.offered, s.done || 0, s.skipped, s.removed]
          .forEach(v => { r.insertCell().textContent = v; });
      });
      const w = document.createElement("div");
      w.className = "scroll";
      w.append(t);
      wrap.append(h, w);
    });
  };
  $("hexp").onclick = () => download("geschiedenis.json",
    JSON.stringify(S.lists.map(L => ({ name: L.name, stats: L.stats }))), "application/json");
  $("himp").onchange = e => readFile(e.target, t => {
    try {
      JSON.parse(t).forEach(d => {
        const L = S.lists.find(l => l.name === d.name);
        if (!L) return;
        Object.keys(d.stats || {}).forEach(k => {
          if (!k.startsWith("t:")) return;
          const v = d.stats[k];
          L.stats[k] = { offered: +v.offered || 0, done: +v.done || 0, skipped: +v.skipped || 0, removed: +v.removed || 0 };
        });
      });
      save(); render();
      $("msg").textContent = "Geschiedenis ingelezen voor lijsten met dezelfde naam.";
    } catch (err) { $("msg").textContent = "Dit bestand is geen geschiedenis."; }
  });
  $("hprune").onclick = () => {
    S.lists.forEach(L => Object.keys(L.stats).forEach(k => { if (!L.items.includes(k.slice(2))) delete L.stats[k]; }));
    save(); render();
  };
  render();
}

document.body.dataset.page === "info" ? initInfo() : initMain();