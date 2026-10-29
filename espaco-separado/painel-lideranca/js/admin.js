// Painel das lideranças: login, métricas e caixa de conversas.
(function () {
  const POLL_LIST_MS = 15000;
  const POLL_THREAD_MS = 8000;
  const S = { me: null, rows: [], filter: "wait", selected: null, msgCount: -1, listTimer: null, threadTimer: null };

  if (!window.isConfigured) { showSetupWarning(); }
  const siteUrl = APP_CONFIG.SITE_URL || "";
  if (siteUrl) $("#back-site").href = siteUrl;

  // ---------- helpers ----------
  const mine = () => S.rows.filter((r) => r.leader_name === S.me);
  const awaiting = (r) => r.status === "open" && r.last_sender !== "leader";
  const label = (r) => r.display_name || "Anônimo · #" + r.id.slice(0, 4).toUpperCase();

  // ---------- auth ----------
  async function init() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    if (data.session) await enter(); else showLogin();
    sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") showLogin(); });
  }

  function showLogin() {
    stopTimers();
    S.me = null; S.rows = []; S.selected = null;
    $("#view-login").hidden = false;
    $("#view-dash").hidden = true;
    $("#who").hidden = true; $("#logout").hidden = true; $("#pw-btn").hidden = true; $("#back-site").hidden = !siteUrl;
    setAccent("#6366f1");
  }

  async function enter() {
    const { data: u } = await sb.auth.getUser();
    const uid = u?.user?.id;
    const { data: rows, error } = await sb.from("leaders").select("name").eq("id", uid).limit(1);
    if (error || !rows || !rows.length) {
      await sb.auth.signOut();
      $("#login-err").textContent = "Este usuário não está cadastrado como liderança.";
      return showLogin();
    }
    S.me = rows[0].name;
    $("#view-login").hidden = true;
    $("#view-dash").hidden = false;
    $("#back-site").hidden = true;
    $("#logout").hidden = false;
    $("#pw-btn").hidden = false;
    const who = $("#who");
    who.replaceChildren(avatar(S.me, 38), h("div", {}, h("strong", { text: S.me }), h("small", { text: "Liderança" })));
    who.hidden = false;
    await loadList();
    S.listTimer = setInterval(() => { if (!document.hidden) loadList(); }, POLL_LIST_MS);
  }

  function stopTimers() {
    clearInterval(S.listTimer); clearInterval(S.threadTimer);
    S.listTimer = S.threadTimer = null;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return toast("Site ainda não configurado (js/config.js).", true);
    const btn = $("#login-btn");
    btn.disabled = true; btn.textContent = "Entrando…";
    $("#login-err").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    btn.disabled = false; btn.textContent = "Entrar";
    if (error) { $("#login-err").textContent = "E-mail ou senha incorretos."; return; }
    $("#password").value = "";
    await enter();
  });

  $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });

  // ---------- trocar senha ----------
  const dlg = $("#pw-dialog");
  $("#pw-btn").addEventListener("click", () => {
    $("#pw-form").reset(); $("#pw-err").textContent = "";
    dlg.showModal(); $("#pw-current").focus();
  });
  $("#pw-cancel").addEventListener("click", () => dlg.close());
  $("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (m) => { $("#pw-err").textContent = m; };
    const cur = $("#pw-current").value, nw = $("#pw-new").value, cf = $("#pw-confirm").value;
    err("");
    if (nw.length < 8) return err("A nova senha precisa ter pelo menos 8 caracteres.");
    if (nw !== cf) return err("A confirmação não confere com a nova senha.");
    if (nw === cur) return err("A nova senha deve ser diferente da atual.");
    const btn = $("#pw-save"); btn.disabled = true; btn.textContent = "Salvando…";
    try {
      const { data: u } = await sb.auth.getUser();
      const email = u?.user?.email;
      const { error: e1 } = await sb.auth.signInWithPassword({ email, password: cur });
      if (e1) return err("Senha atual incorreta.");
      const { error: e2 } = await sb.auth.updateUser({ password: nw });
      if (e2) { console.error(e2); return err("Não foi possível alterar. Tente uma senha mais forte."); }
      dlg.close();
      toast("Senha alterada com sucesso.");
    } finally {
      btn.disabled = false; btn.textContent = "Salvar nova senha";
    }
  });

  // ---------- dados ----------
  async function loadList() {
    const { data, error } = await sb.from("checkins")
      .select("id, mood, leader_name, display_name, status, last_sender, created_at, last_activity")
      .order("last_activity", { ascending: false }).limit(1000);
    if (error) { console.error(error); return toast("Erro ao carregar os dados.", true); }
    S.rows = data;
    renderStats(); renderDist(); renderTrend(); renderList();
  }

  // ---------- métricas ----------
  function renderStats() {
    const m = mine().filter((r) => r.leader_name);
    const wait = m.filter(awaiting).length;
    const open = m.filter((r) => r.status === "open").length;
    const since = Date.now() - 30 * 864e5;
    const last = S.rows.filter((r) => new Date(r.created_at).getTime() >= since);
    const avg = last.length ? (last.reduce((s, r) => s + r.mood, 0) / last.length) : null;
    const cards = [
      ["Aguardando sua resposta", wait, wait ? "⏳" : "✅"],
      ["Conversas abertas", open, ""],
      ["Check-ins (30 dias)", last.length, ""],
      ["Humor médio (30 dias)", avg ? avg.toFixed(1) : "—", avg ? moodOf(Math.round(avg)).emoji : ""],
    ];
    $("#stats").replaceChildren(...cards.map(([k, v, e]) =>
      h("div", { class: "card stat" }, h("div", { class: "k", text: k }),
        h("div", { class: "v" }, String(v), e ? h("small", { text: " " + e }) : null))));
    if (avg) setAccent(moodOf(Math.round(avg)).color);
  }

  function renderDist() {
    const since = Date.now() - 30 * 864e5;
    const last = S.rows.filter((r) => new Date(r.created_at).getTime() >= since);
    const total = last.length || 1;
    const rows = MOODS.slice().reverse().map((m) => {
      const n = last.filter((r) => r.mood === m.v).length;
      const bar = h("i"); bar.dataset.w = Math.round((n / total) * 100);
      const wrap = h("div", { class: "bar" }, bar); wrap.style.setProperty("--c", m.color);
      return h("div", { class: "dist-row" }, h("span", { text: m.emoji + " " + m.v }), wrap, h("span", { text: String(n) }));
    });
    $("#dist").replaceChildren(...rows);
    requestAnimationFrame(() => $$("#dist i").forEach((i) => (i.style.width = i.dataset.w + "%")));
  }

  function renderTrend() {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push(d);
    }
    const cols = days.map((d) => {
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const rs = S.rows.filter((r) => { const t = new Date(r.created_at); return t >= d && t < next; });
      const avg = rs.length ? rs.reduce((s, r) => s + r.mood, 0) / rs.length : null;
      const bar = h("i");
      if (avg) { bar.style.setProperty("--c", moodOf(Math.round(avg)).color); bar.dataset.h = (avg / 5) * 100; bar.title = `${avg.toFixed(1)} (${rs.length})`; }
      else bar.dataset.h = 3;
      bar.style.height = "0%";
      return h("div", { class: "col" }, h("b", { text: avg ? avg.toFixed(1) : "" }), bar,
        h("span", { text: String(d.getDate()).padStart(2, "0") }));
    });
    $("#trend").replaceChildren(...cols);
    requestAnimationFrame(() => $$("#trend i").forEach((i) => (i.style.height = i.dataset.h + "%")));
  }

  // ---------- lista ----------
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.filter = b.dataset.f;
    $$("#filters button").forEach((x) => x.classList.toggle("on", x === b));
    renderList();
  });

  function renderList() {
    const all = mine().filter((r) => r.leader_name);
    const f = {
      wait: all.filter(awaiting), open: all.filter((r) => r.status === "open"),
      closed: all.filter((r) => r.status === "closed"), all,
    }[S.filter];
    const box = $("#items");
    if (!f.length) {
      box.replaceChildren(h("div", { class: "thread-empty", style: { padding: "30px 10px" } },
        h("div", { style: { fontSize: "34px" }, text: S.filter === "wait" ? "🎉" : "📭" }),
        h("p", { text: S.filter === "wait" ? "Nenhuma conversa aguardando você." : "Nada por aqui ainda." })));
      return;
    }
    box.replaceChildren(...f.map((r) => {
      const m = moodOf(r.mood);
      const badge = awaiting(r) ? h("span", { class: "badge wait", text: "Responder" })
        : r.status === "closed" ? h("span", { class: "badge done", text: "Encerrada" })
        : h("span", { class: "badge open", text: "Aberta" });
      const emo = h("span", { class: "emo", text: m.emoji }); emo.style.setProperty("--c", m.color);
      const b = h("button", { class: "item" + (S.selected === r.id ? " sel" : ""), type: "button" },
        emo,
        h("span", { class: "tx" }, h("strong", { text: label(r) }), h("small", { text: `Humor ${m.v} · ${timeAgo(r.last_activity)}` })),
        badge);
      b.addEventListener("click", () => openThread(r.id));
      return b;
    }));
  }

  // ---------- conversa ----------
  async function openThread(id) {
    S.selected = id; S.msgCount = -1;
    $("#thread-empty").hidden = true; $("#thread").hidden = false;
    $("#thread-panel").classList.add("open");
    renderList();
    await refreshThread(true);
    clearInterval(S.threadTimer);
    S.threadTimer = setInterval(() => { if (!document.hidden) refreshThread(false); }, POLL_THREAD_MS);
  }

  async function refreshThread(force) {
    const r = S.rows.find((x) => x.id === S.selected);
    if (!r) return;
    const { data, error } = await sb.from("messages").select("sender, body, created_at")
      .eq("checkin_id", r.id).order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    const m = moodOf(r.mood);
    $("#t-title").textContent = label(r);
    $("#t-sub").textContent = `Humor ${m.v} ${m.emoji} · iniciado em ${new Date(r.created_at).toLocaleDateString("pt-BR")}`;
    const tg = $("#t-toggle");
    tg.textContent = r.status === "closed" ? "Reabrir" : "✔ Encerrar conversa";
    tg.onclick = () => setStatus(r.id, r.status === "closed" ? "open" : "closed");

    if (!force && data.length === S.msgCount) return;
    const box = $("#t-msgs");
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || S.msgCount < 0;
    S.msgCount = data.length;
    box.replaceChildren();
    if (!data.length) {
      box.append(h("div", { class: "empty" }, h("div", { style: { fontSize: "40px" }, text: "🙋" }),
        h("p", { text: `${label(r)} pediu para conversar com você, mas ainda não escreveu nada. Você pode dar o primeiro passo.` })));
    }
    data.forEach((msg) => {
      const mineMsg = msg.sender === "leader";
      box.append(h("div", { class: "bubble " + (mineMsg ? "me" : "them") },
        mineMsg ? null : h("span", { class: "sender", text: label(r) }),
        msg.body, h("span", { class: "meta", text: fmtTime(msg.created_at) })));
    });
    if (near) box.scrollTop = box.scrollHeight;
  }

  async function setStatus(id, status) {
    const { error } = await sb.from("checkins").update({ status }).eq("id", id);
    if (error) { console.error(error); return toast("Não foi possível atualizar.", true); }
    toast(status === "closed" ? "Conversa encerrada." : "Conversa reaberta.");
    await loadList(); await refreshThread(true);
  }

  $("#t-composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ta = $("#t-reply"); const body = ta.value.trim();
    if (!body || !S.selected) return;
    const btn = $("#t-send"); btn.disabled = true;
    const { error } = await sb.from("messages").insert({ checkin_id: S.selected, sender: "leader", body });
    btn.disabled = false;
    if (error) { console.error(error); return toast("Não foi possível enviar.", true); }
    ta.value = ""; ta.style.height = "";
    await loadList(); await refreshThread(true);
    $("#t-msgs").scrollTop = $("#t-msgs").scrollHeight;
  });
  $("#t-reply").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#t-composer").requestSubmit(); }
  });
  $("#t-reply").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  });
  $("#thread-back").addEventListener("click", () => $("#thread-panel").classList.remove("open"));

  init();
})();
