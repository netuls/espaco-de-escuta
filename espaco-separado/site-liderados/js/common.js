// Utilitários compartilhados pelas duas páginas.
(function () {
  const cfg = window.APP_CONFIG;

  window.MOODS = [
    { v: 1, emoji: "😞", label: "Muito mal", color: "#ef4444" },
    { v: 2, emoji: "😕", label: "Mal", color: "#f97316" },
    { v: 3, emoji: "😐", label: "Mais ou menos", color: "#eab308" },
    { v: 4, emoji: "🙂", label: "Bem", color: "#22c55e" },
    { v: 5, emoji: "😄", label: "Muito bem", color: "#06b6d4" },
  ];

  window.isConfigured =
    cfg && cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("SEU-PROJETO") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("SUA-ANON");

  window.sb = window.isConfigured
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

  window.$ = (sel, root = document) => root.querySelector(sel);
  window.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Criador de elementos (sempre usa textContent -> sem XSS).
  window.h = function (tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  };

  window.moodOf = (v) => window.MOODS.find((m) => m.v === Number(v)) || window.MOODS[2];

  window.fmtTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  window.timeAgo = (iso) => {
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "agora";
    const m = Math.floor(s / 60);
    if (m < 60) return `há ${m} min`;
    const hr = Math.floor(m / 60);
    if (hr < 24) return `há ${hr} h`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `há ${d} d`;
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  // Cor estável por nome (avatar das lideranças).
  const GRADS = [
    ["#6366f1", "#8b5cf6"], ["#ec4899", "#f43f5e"], ["#06b6d4", "#3b82f6"],
    ["#f59e0b", "#ef4444"], ["#10b981", "#06b6d4"],
  ];
  window.avatar = (name, size) => {
    const idx = Math.max(0, cfg.LEADERS.indexOf(name)) % GRADS.length;
    const [a, b] = GRADS[idx];
    const el = h("div", { class: "avatar", text: (name || "?").slice(0, 1).toUpperCase() });
    el.style.background = `linear-gradient(135deg, ${a}, ${b})`;
    if (size) { el.style.width = el.style.height = size + "px"; }
    return el;
  };

  let toastTimer;
  window.toast = (msg, isErr) => {
    let t = $("#toast");
    if (!t) { t = h("div", { id: "toast", class: "toast" }); document.body.append(t); }
    t.textContent = msg;
    t.classList.toggle("err", !!isErr);
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
  };

  window.setAccent = (color) => {
    document.body.style.setProperty("--accent", color || "#6366f1");
  };

  window.copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); toast("Copiado!"); }
    catch { toast("Não foi possível copiar. Selecione e copie manualmente.", true); }
  };

  window.showSetupWarning = () => {
    document.body.prepend(h("div", { class: "notice", style: { margin: "0", borderRadius: "0", textAlign: "center" },
      text: "⚙️ Configure js/config.js com a URL e a anon key do seu projeto Supabase." }));
  };
})();
