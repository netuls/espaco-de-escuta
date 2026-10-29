// Site dos liderados: check-in de humor, escolha da liderança e chat por código.
(function () {
  const TOKEN_KEY = "ee_token";
  const POLL_MS = 8000;
  const state = { mood: null, leader: null, token: null, pollTimer: null, lastCount: -1, lastStatus: null, lastAgenda: "" };

  if (!window.isConfigured) { showSetupWarning(); }
  if (APP_CONFIG.ADMIN_URL) { const a = $("#admin-link"); a.href = APP_CONFIG.ADMIN_URL; a.hidden = false; }

  // ---------- util ----------
  function genToken() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos, sem ambíguos
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let s = "";
    for (const b of bytes) s += alphabet[b % 32];
    return s.match(/.{4}/g).join("-");
  }
  const normToken = (t) => (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g)?.join("-") || "";
  const getSaved = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const save = (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* modo privado */ } };
  const forget = () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ } };

  // ---------- wizard ----------
  function goStep(n) {
    $$(".step").forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === n));
    const prog = Math.min(n, 3);
    $$(".dot").forEach((d) => d.classList.toggle("on", Number(d.dataset.dot) <= prog));
  }

  function buildMoods() {
    const wrap = $("#moods");
    MOODS.forEach((m) => {
      const b = h("button", { type: "button", class: "mood", role: "radio", "aria-checked": "false", "data-v": m.v },
        h("span", { class: "emo", text: m.emoji }),
        h("span", { class: "num", text: String(m.v) }),
        h("span", { class: "lbl", text: m.label }));
      b.style.setProperty("--c", m.color);
      b.addEventListener("click", () => {
        state.mood = m.v;
        $$(".mood").forEach((x) => {
          const on = x === b;
          x.classList.toggle("sel", on);
          x.setAttribute("aria-checked", on ? "true" : "false");
        });
        setAccent(m.color);
        $("#mood-caption").textContent = `${m.emoji}  ${m.label}`;
        $("#to-2").disabled = false;
      });
      wrap.append(b);
    });
  }

  function buildTeams() {
    const sel = $("#a-team");
    APP_CONFIG.LEADERS.forEach((n) => sel.append(h("option", { value: n, text: "Equipe " + n })));
  }

  function buildLeaders() {
    const wrap = $("#leaders");
    APP_CONFIG.LEADERS.forEach((name) => {
      const b = h("button", { type: "button", class: "leader" },
        avatar(name),
        h("span", {}, h("span", { class: "nm", text: name }), h("span", { class: "rl", text: "Liderança" })));
      b.dataset.name = name;
      b.addEventListener("click", () => { state.leader = name; $("#pick-name").textContent = name; goStep(3); });
      wrap.append(b);
    });
    const none = h("button", { type: "button", class: "leader none", text: "Por enquanto não preciso conversar — só registrar como estou" });
    none.addEventListener("click", () => submit(false));
    wrap.append(none);
  }

  function bindIdentity() {
    $$('input[name="ident"]').forEach((r) =>
      r.addEventListener("change", () => {
        syncChoices();
        const named = $('input[name="ident"]:checked').value === "named";
        $("#name-field").hidden = !named;
        if (named && !$("#name").value && A.member) $("#name").value = A.member.full_name || "";
        if (named) $("#name").focus();
      }));
  }

  const currentMode = () => ($('input[name="mode"]:checked') || {}).value || "chat";

  function syncChoices() {
    $$(".choice label").forEach((l) => {
      const i = l.querySelector("input");
      l.classList.toggle("on", !!(i && i.checked));
    });
  }

  function bindMode() {
    $$('input[name="mode"]').forEach((r) =>
      r.addEventListener("change", () => {
        syncChoices();
        const pres = currentMode() === "presencial";
        $("#mode-hint").hidden = !pres;
        $("#msg-label").textContent = pres ? "Algum dia, horário ou assunto que ajude a combinar?" : "O que você gostaria de compartilhar?";
        $("#send").textContent = pres ? "Pedir conversa presencial" : "Enviar para a liderança";
      }));
  }

  async function submit(withLeader) {
    if (!sb) return toast("Site ainda não configurado (js/config.js).", true);
    const btn = withLeader ? $("#send") : null;
    if (btn) btn.disabled = true;
    const token = genToken();
    const named = withLeader && $('input[name="ident"]:checked').value === "named";
    const name = named ? $("#name").value.trim() : "";
    if (named && !name) { if (btn) btn.disabled = false; return toast("Digite seu nome ou escolha anônimo.", true); }

    const { error } = await sb.rpc("submit_checkin", {
      p_mood: state.mood,
      p_leader: withLeader ? state.leader : null,
      p_name: named ? name : null,
      p_message: withLeader ? ($("#msg").value.trim() || null) : null,
      p_token: token,
      p_mode: withLeader ? currentMode() : "chat",
    });
    if (btn) btn.disabled = false;
    if (error) {
      console.error("submit_checkin:", error.code, error.message, error.details || "", error.hint || "");
      if (/faça login/i.test(error.message || "")) return showAuth("Sua sessão expirou. Entre novamente.");
      const missing = error.code === "PGRST202" || /p_mode|mode|function/i.test(error.message || "");
      return toast(missing
        ? "Banco desatualizado: rode supabase/migracao-agenda.sql no Supabase."
        : "Não foi possível enviar agora (" + (error.message || error.code || "erro") + ").", true);
    }

    if (withLeader) {
      state.token = token;
      save(token);
      $("#done-code").textContent = token;
      $("#done-name").textContent = state.leader;
      $("#done-text").textContent = currentMode() === "presencial"
        ? "vai agendar a conversa presencial e avisar você por aqui."
        : "vai poder responder por aqui.";
      goStep(4);
    } else {
      goStep(5);
    }
  }

  function resetWizard() {
    state.mood = null; state.leader = null;
    $$(".mood").forEach((x) => { x.classList.remove("sel"); x.setAttribute("aria-checked", "false"); });
    $("#mood-caption").textContent = "";
    $("#to-2").disabled = true;
    $("#msg").value = ""; $("#name").value = "";
    $('input[name="ident"][value="anon"]').checked = true;
    $('input[name="mode"][value="chat"]').checked = true;
    $("#mode-hint").hidden = true;
    syncChoices();
    $("#msg-label").textContent = "O que você gostaria de compartilhar?";
    $("#send").textContent = "Enviar para a liderança";
    $("#name-field").hidden = true;
    goStep(1);
  }

  // ---------- conversa ----------
  async function fetchThread(token) {
    const { data, error } = await sb.rpc("get_thread", { p_token: token });
    if (error) throw error;
    return data; // null se não existir
  }

  function renderThread(data) {
    const c = data.checkin;
    const m = moodOf(c.mood);
    $("#chat-avatar").replaceChildren(avatar(c.leader_name));
    $("#chat-title").textContent = `Conversa com ${c.leader_name}`;
    $("#chat-sub").textContent = `${c.display_name ? "Você: " + c.display_name : "Você está anônimo(a)"} · humor ${m.v} ${m.emoji} · ${c.mode === "presencial" ? "🤝 presencial" : "💬 chat"}`;
    renderAgenda(data.appointments || []);
    renderSurvey(data);
    const st = $("#chat-status");
    st.textContent = c.status === "closed" ? "✔ Encerrada" : "● Aberta";
    st.style.color = c.status === "closed" ? "var(--ok)" : "var(--muted)";
    // Conversa encerrada: some o campo de mensagem e aparece o aviso.
    $("#composer").hidden = c.status === "closed";
    $("#closed-note").hidden = c.status !== "closed";

    const box = $("#msgs");
    const count = data.messages.length;
    if (count === state.lastCount && c.status === state.lastStatus) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || state.lastCount < 0;
    state.lastCount = count; state.lastStatus = c.status;

    box.replaceChildren();
    if (!count) {
      box.append(h("div", { class: "empty" },
        h("div", { style: { fontSize: "40px" }, text: "👋" }),
        h("p", { text: `Seu pedido foi enviado. ${c.leader_name} vai ver e responder por aqui. Você também pode escrever uma mensagem agora.` })));
    }
    data.messages.forEach((msg) => {
      const mine = msg.sender === "member";
      box.append(h("div", { class: "bubble " + (mine ? "me" : "them") },
        mine ? null : h("span", { class: "sender", text: c.leader_name }),
        msg.body,
        h("span", { class: "meta", text: fmtTime(msg.created_at) })));
    });
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }

  // ---------- pesquisa de satisfação (após conversa encerrada) ----------
  const SV = { mood: null, rating: null, dismissed: false };
  const STAR_LABELS = ["Ruim", "Regular", "Boa", "Muito boa", "Excelente"];

  function buildSurvey() {
    const mw = $("#sv-moods");
    MOODS.forEach((m) => {
      const b = h("button", { type: "button", class: "mood", role: "radio", "aria-checked": "false" },
        h("span", { class: "emo", text: m.emoji }), h("span", { class: "num", text: String(m.v) }), h("span", { class: "lbl", text: m.label }));
      b.style.setProperty("--c", m.color);
      b.addEventListener("click", () => {
        SV.mood = m.v;
        $$("#sv-moods .mood").forEach((x) => { x.classList.toggle("sel", x === b); x.setAttribute("aria-checked", x === b ? "true" : "false"); });
        syncSurvey();
      });
      mw.append(b);
    });
    const sw = $("#sv-stars");
    for (let i = 1; i <= 5; i++) {
      const b = h("button", { type: "button", class: "star", role: "radio", "aria-checked": "false", "aria-label": i + " de 5", text: "★" });
      b.addEventListener("click", () => {
        SV.rating = i;
        $$("#sv-stars .star").forEach((x, idx) => { x.classList.toggle("on", idx < i); x.setAttribute("aria-checked", idx === i - 1 ? "true" : "false"); });
        $("#sv-star-label").textContent = i + "/5 · " + STAR_LABELS[i - 1];
        syncSurvey();
      });
      sw.append(b);
    }
  }
  function syncSurvey() { $("#sv-send").disabled = !(SV.mood && SV.rating); }

  function resetSurvey() {
    SV.mood = null; SV.rating = null; SV.dismissed = false;
    $$("#sv-moods .mood").forEach((x) => { x.classList.remove("sel"); x.setAttribute("aria-checked", "false"); });
    $$("#sv-stars .star").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); });
    $("#sv-star-label").textContent = ""; $("#sv-comment").value = ""; syncSurvey();
  }

  function renderSurvey(data) {
    const c = data.checkin;
    $("#survey").hidden = !(c.status === "closed" && c.leader_name && !data.feedback && !SV.dismissed);
  }

  async function sendSurvey() {
    const btn = $("#sv-send"); btn.disabled = true;
    const { error } = await sb.rpc("submit_feedback", {
      p_token: state.token, p_mood_after: SV.mood, p_rating: SV.rating, p_comment: $("#sv-comment").value.trim() || null,
    });
    if (error) { console.error("submit_feedback:", error.code, error.message); syncSurvey(); return toast("Não foi possível enviar a pesquisa agora.", true); }
    SV.dismissed = true; $("#survey").hidden = true;
    toast("Obrigado! Sua resposta ajuda muito. 💜");
  }

  const fmtWhen = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) +
      " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  // Registro dos agendamentos no painel do liderado + aviso de novidade.
  function renderAgenda(list) {
    const box = $("#agenda-box");
    const sig = JSON.stringify(list.map((a) => [a.id, a.status, a.scheduled_at, a.seen]));
    if (sig === state.lastAgenda) return;
    const first = state.lastAgenda === "";
    state.lastAgenda = sig;
    if (!list.length) { box.hidden = true; box.replaceChildren(); return; }
    const label = { scheduled: "Agendado", done: "Realizada", cancelled: "Cancelado" };
    const sorted = list.slice().sort((a, b) => {
      const rank = (x) => (x.status === "scheduled" ? 0 : 1);
      return rank(a) - rank(b) || new Date(a.scheduled_at) - new Date(b.scheduled_at);
    });
    box.replaceChildren(
      h("div", { class: "agenda-title", text: "📅 Seus agendamentos" }),
      ...sorted.map((a) => h("div", { class: "appt " + a.status + (a.seen ? "" : " new") },
        h("div", { class: "when", text: fmtWhen(a.scheduled_at) }),
        h("div", { class: "where", text: "📍 " + a.location }),
        a.notes ? h("div", { class: "notes", text: a.notes }) : null,
        h("span", { class: "tag " + a.status, text: (a.seen ? "" : "Novo · ") + label[a.status] }))));
    box.hidden = false;
    const unseen = list.some((a) => !a.seen);
    if (unseen) {
      if (!first) toast("📅 Você tem um novo agendamento!");
      sb.rpc("mark_appointments_seen", { p_token: state.token }).then(() => {}, () => {});
    }
  }

  async function openThread(token) {
    if (!sb) return toast("Site ainda não configurado (js/config.js).", true);
    try {
      const data = await fetchThread(token);
      if (!data) return toast("Código não encontrado. Confira e tente novamente.", true);
      state.token = token; state.lastCount = -1; state.lastStatus = null; state.lastAgenda = "";
      resetSurvey();
      save(token);
      setAccent(moodOf(data.checkin.mood).color);
      $("#view-main").hidden = true;
      $("#view-thread").hidden = false;
      renderThread(data);
      startPolling();
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error(e);
      toast("Não foi possível abrir a conversa agora.", true);
    }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      if (document.hidden || !state.token) return;
      try { const d = await fetchThread(state.token); if (d) renderThread(d); } catch { /* tenta de novo */ }
    }, POLL_MS);
  }
  function stopPolling() { clearInterval(state.pollTimer); state.pollTimer = null; }

  async function sendReply(e) {
    e.preventDefault();
    const ta = $("#reply");
    const body = ta.value.trim();
    if (!body) return;
    const btn = $("#reply-btn");
    btn.disabled = true;
    const { error } = await sb.rpc("send_member_message", { p_token: state.token, p_body: body });
    btn.disabled = false;
    if (error) {
      console.error(error);
      if (/encerrada/i.test(error.message || "")) {
        toast("Esta conversa foi encerrada pela liderança.", true);
        const d0 = await fetchThread(state.token);
        if (d0) { state.lastCount = -1; renderThread(d0); }
        return;
      }
      return toast("Não foi possível enviar a mensagem.", true);
    }
    ta.value = ""; ta.style.height = "";
    state.lastCount = -2;
    const d = await fetchThread(state.token);
    if (d) { state.lastCount = -1; renderThread(d); $("#msgs").scrollTop = $("#msgs").scrollHeight; }
  }

  function leaveThread() {
    stopPolling();
    $("#view-thread").hidden = true;
    $("#view-main").hidden = false;
    resetWizard();
    checkResume();
  }

  async function checkResume() {
    const t = getSaved();
    $("#resume").hidden = true;
    if (!t || !sb) return;
    try {
      const d = await fetchThread(t);
      if (d && d.checkin.leader_name) {
        $("#resume-name").textContent = d.checkin.leader_name;
        const newAppt = (d.appointments || []).some((a) => !a.seen && a.status === "scheduled");
        const needSurvey = d.checkin.status === "closed" && !d.feedback;
        $("#resume-new").textContent = newAppt ? "📅 Novo agendamento" : "📝 Pesquisa rápida";
        $("#resume-new").hidden = !(newAppt || needSurvey);
        $("#resume").hidden = false;
      } else if (!d) forget();
    } catch { /* ignora */ }
  }

  // ---------- login / cadastro ----------
  const A = { mode: "login", member: null };

  function setTab(mode) {
    A.mode = mode;
    $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === mode));
    const signup = mode === "signup";
    $("#f-name").hidden = !signup; $("#f-team").hidden = !signup;
    $("#a-pass").autocomplete = signup ? "new-password" : "current-password";
    $("#auth-btn").textContent = signup ? "Criar conta" : "Entrar";
    $("#auth-err").textContent = "";
  }

  function showAuth(msg) {
    $("#view-auth").hidden = false; $("#view-main").hidden = true; $("#view-thread").hidden = true;
    $("#who").hidden = true;
    $("#auth-err").textContent = msg || "";
  }

  // Destaca (e põe primeiro) a liderança da equipe do liderado.
  function markMyLeader(team) {
    const wrap = $("#leaders");
    $$(".leader[data-name]").forEach((b) => {
      const mine = team && b.dataset.name === team;
      const rl = b.querySelector(".rl");
      if (rl) rl.textContent = mine ? "Sua liderança" : "Liderança";
      b.classList.toggle("mine", !!mine);
      if (mine) wrap.prepend(b);
    });
  }

  function showApp(member) {
    A.member = member;
    $("#view-auth").hidden = true; $("#view-main").hidden = false;
    $("#who-name").textContent = (member.full_name || "").split(" ")[0];
    $("#who").hidden = false;
    markMyLeader(member.team);
    checkResume();
  }

  async function loadMember() {
    const { data, error } = await sb.rpc("get_member");
    return error ? null : data;
  }

  async function bootAuth() {
    if (!sb) { showAuth("Site ainda não configurado (js/config.js)."); return; }
    const { data } = await sb.auth.getSession();
    if (!data.session) return showAuth();
    const m = await loadMember();
    if (m) return showApp(m);
    await sb.auth.signOut();
    showAuth("Esta conta não está liberada para o site dos liderados. Crie uma conta escolhendo a sua equipe.");
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (!sb) return;
    const err = (m) => { $("#auth-err").textContent = m; };
    err("");
    const email = $("#a-email").value.trim(), password = $("#a-pass").value;
    const btn = $("#auth-btn"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Aguarde…";
    try {
      if (A.mode === "signup") {
        const name = $("#a-name").value.trim(), team = $("#a-team").value;
        if (!name) return err("Informe seu nome.");
        if (password.length < 8) return err("A senha precisa ter pelo menos 8 caracteres.");
        if (!team) return err("Escolha a sua equipe.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name, team } } });
        if (error) {
          console.error(error);
          return err(/registered|already/i.test(error.message) ? "Este e-mail já tem conta. Use a aba Entrar." : "Não foi possível criar a conta: " + error.message);
        }
        if (!data.session) {
          setTab("login");
          return err("Conta criada! Confirme seu e-mail (veja a caixa de entrada e o spam) e depois entre.");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return err("E-mail ou senha incorretos.");
      }
      const m = await loadMember();
      if (!m) { await sb.auth.signOut(); return err("Esta conta não está liberada. Crie uma conta escolhendo a sua equipe."); }
      $("#a-pass").value = "";
      showApp(m);
    } finally { btn.disabled = false; btn.textContent = A.mode === "signup" ? "Criar conta" : "Entrar"; }
  }

  async function logout() {
    stopPolling(); forget();
    state.token = null; state.lastAgenda = ""; state.lastCount = -1;
    try { await sb.auth.signOut(); } catch { /* noop */ }
    A.member = null;
    resetSurvey();
    resetWizard();
    $("#resume").hidden = true;
    showAuth();
  }

  // ---------- init ----------
  buildMoods();
  buildSurvey();
  buildTeams();
  buildLeaders();
  bindIdentity();
  bindMode();
  $$(".choice label").forEach((l) => l.addEventListener("click", (e) => {
    const i = l.querySelector("input");
    if (i && !i.checked) { e.preventDefault(); i.checked = true; i.dispatchEvent(new Event("change", { bubbles: true })); }
  }));
  syncChoices();

  $("#to-2").addEventListener("click", () => goStep(2));
  $$("[data-back]").forEach((b) => b.addEventListener("click", () => goStep(Number(b.dataset.back))));
  $("#send").addEventListener("click", () => submit(true));
  $("#copy-code").addEventListener("click", () => copyText($("#done-code").textContent));
  $("#open-thread").addEventListener("click", () => openThread(state.token));
  $("#again").addEventListener("click", resetWizard);
  $("#resume-btn").addEventListener("click", () => openThread(getSaved()));
  $("#recover-form").addEventListener("submit", (e) => { e.preventDefault(); openThread(normToken($("#recover-code").value)); });
  $("#leave").addEventListener("click", leaveThread);
  $("#chat-code").addEventListener("click", () => copyText(state.token));
  $("#composer").addEventListener("submit", sendReply);
  $("#reply").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
  $("#reply").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  });
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && state.token && !$("#view-thread").hidden) {
      try { const d = await fetchThread(state.token); if (d) renderThread(d); } catch { /* noop */ }
    }
  });

  $$(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#logout").addEventListener("click", logout);
  $("#sv-send").addEventListener("click", sendSurvey);
  $("#sv-skip").addEventListener("click", () => { SV.dismissed = true; $("#survey").hidden = true; });

  bootAuth();
})();
