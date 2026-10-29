// Site dos liderados: check-in de humor, escolha da liderança e chat por código.
(function () {
  const TOKEN_KEY = "ee_token";
  const POLL_MS = 8000;
  const state = { mood: null, leader: null, token: null, pollTimer: null, lastCount: -1, lastStatus: null };

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

  function buildLeaders() {
    const wrap = $("#leaders");
    APP_CONFIG.LEADERS.forEach((name) => {
      const b = h("button", { type: "button", class: "leader" },
        avatar(name),
        h("span", {}, h("span", { class: "nm", text: name }), h("span", { class: "rl", text: "Liderança" })));
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
        const named = $('input[name="ident"]:checked').value === "named";
        $("#name-field").hidden = !named;
        if (named) $("#name").focus();
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
    });
    if (btn) btn.disabled = false;
    if (error) { console.error(error); return toast("Não foi possível enviar agora. Tente novamente.", true); }

    if (withLeader) {
      state.token = token;
      save(token);
      $("#done-code").textContent = token;
      $("#done-name").textContent = state.leader;
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
    $("#name-field").hidden = true;
    setAccent("#6366f1");
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
    $("#chat-sub").textContent = `${c.display_name ? "Você: " + c.display_name : "Você está anônimo(a)"} · humor ${m.v} ${m.emoji}`;
    const st = $("#chat-status");
    st.textContent = c.status === "closed" ? "✔ Encerrada" : "● Aberta";
    st.style.color = c.status === "closed" ? "var(--ok)" : "var(--muted)";

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

  async function openThread(token) {
    if (!sb) return toast("Site ainda não configurado (js/config.js).", true);
    try {
      const data = await fetchThread(token);
      if (!data) return toast("Código não encontrado. Confira e tente novamente.", true);
      state.token = token; state.lastCount = -1; state.lastStatus = null;
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
    if (error) { console.error(error); return toast("Não foi possível enviar a mensagem.", true); }
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
        $("#resume").hidden = false;
      } else if (!d) forget();
    } catch { /* ignora */ }
  }

  // ---------- init ----------
  buildMoods();
  buildLeaders();
  bindIdentity();

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

  checkResume();
})();
