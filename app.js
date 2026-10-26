(() => {
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const $ = (sel, root = document) => root.querySelector(sel);

  const stage = $("#stage");
  const wrapper = $("#wrapper");
  const topbar = $("#topbar");
  const body = $("#body");
  const masterToggle = $("#masterToggle");
  const toastEl = $("#toast");

  // Inside BloodSense the host window owns show/hide and the toggle key,
  // so the page must not install its own Insert handler.
  const bridge = (window.chrome && window.chrome.webview) || null;
  const hosted = !!bridge;

  const STORAGE_KEY = "bloodsense.config.v4";
  const AUTOSAVE_MS = 900;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeTab = "aim";
  let storedScale = 1;
  let busy = false; // true while capturing a keybind

  /* --------------------------------------------------------------- bridge */

  const post = (type, data) => {
    if (bridge) bridge.postMessage({ type, data: data || {} });
  };

  /* ---------------------------------------------------------------- toast */

  let toastTimer = 0;
  const toast = (msg, tone) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", tone === "err");
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1500);
  };

  /* -------------------------------------------------------------- fit/scale */

  let fitRaf = 0;
  const fit = () => {
    if (!stage) return;
    fitRaf = 0;
    const availW = stage.clientWidth - 24;
    const availH = stage.clientHeight - 24;
    const w = wrapper.offsetWidth * storedScale;
    const h = wrapper.offsetHeight * storedScale;
    const ratio = Math.min(1, availW / w, availH / h);
    wrapper.style.transform = `scale(${(storedScale * ratio).toFixed(4)})`;
  };
  const queueFit = () => {
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(fit);
  };
  window.addEventListener("resize", queueFit, { passive: true });

  /* --------------------------------------------------------------- animate */

  // Stagger the rows of the incoming pane. Index comes from DOM order so the
  // delay stays correct no matter how many controls each box holds.
  const animatePane = (pane) => {
    if (reduceMotion || !pane) return;
    const rows = $$(".row, .slider-row", pane);
    rows.forEach((row, i) => {
      row.style.animation = "none";
      row.style.animationDelay = Math.min(i, 14) * 16 + "ms";
      void row.offsetWidth;
      row.style.animation = "";
    });
  };

  /* ------------------------------------------------------------------ tabs */

  const setTab = (key, animate = true) => {
    if (key === activeTab) return;
    activeTab = key;
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === key;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === key));
    body.scrollTop = 0;
    if (animate) animatePane($(".pane.active"));
    queueFit();
    scheduleSave();
  };

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  /* ------------------------------------------------------------ layout */

  const posSel = $("#barPos");
  const applyBar = (pos) => {
    wrapper.dataset.bar = pos;
    queueFit();
  };
  posSel?.addEventListener("change", () => {
    applyBar(posSel.value);
    toast("tabs: " + posSel.value);
    scheduleSave();
  });
  applyBar(posSel?.value || "top");

  const scaleSel = $("#uiScale");
  const applyScale = (value) => {
    storedScale = parseFloat(value) || 1;
    queueFit();
  };
  scaleSel?.addEventListener("change", () => {
    applyScale(scaleSel.value);
    toast("scale: " + Math.round(storedScale * 100) + "%");
    scheduleSave();
  });
  applyScale(scaleSel?.value || "1");

  /* ------------------------------------------------------------------ drag */

  let drag = null;
  let dragRaf = 0;

  topbar.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".tab, .btn, .master-toggle, .dropdown")) return;
    const rect = wrapper.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, ox: rect.left, oy: rect.top };
    wrapper.style.transform = "none";
    wrapper.style.position = "fixed";
    wrapper.style.left = rect.left + "px";
    wrapper.style.top = rect.top + "px";
    wrapper.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!drag) return;
      const nx = drag.ox + e.clientX - drag.x;
      const ny = drag.oy + e.clientY - drag.y;
      if (dragRaf) cancelAnimationFrame(dragRaf);
      dragRaf = requestAnimationFrame(() => {
        wrapper.style.left = nx + "px";
        wrapper.style.top = ny + "px";
      });
    },
    { passive: true }
  );

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    if (dragRaf) cancelAnimationFrame(dragRaf);
    dragRaf = 0;
    wrapper.classList.remove("dragging");
    // Dragging is a browser preview affordance only; the host positions us.
    if (hosted) {
      wrapper.style.position = "";
      wrapper.style.left = "";
      wrapper.style.top = "";
      queueFit();
    }
  });

  /* ----------------------------------------------------------------- hidе */

  document.addEventListener("keydown", (e) => {
    if (hosted) return;
    if (e.key !== "Delete" && e.key !== "Escape") return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    e.preventDefault();
    wrapper.classList.toggle("hidden");
  });

  /* --------------------------------------------------------- master switch */

  const setMaster = (on) => {
    masterToggle.classList.toggle("on", on);
    masterToggle.setAttribute("aria-checked", on ? "true" : "false");
  };
  const flipMaster = () => {
    const on = !masterToggle.classList.contains("on");
    setMaster(on);
    post("master", { on });
    toast(on ? "master on" : "master off");
    scheduleSave();
  };
  masterToggle.addEventListener("click", flipMaster);
  masterToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flipMaster();
    }
  });

  /* ------------------------------------------------------------- checkboxes */

  const setRow = (row, on) => {
    row.classList.toggle("on", on);
    const box = row.querySelector(".cbox");
    if (box) box.setAttribute("aria-checked", on ? "true" : "false");
    return box;
  };

  const toggleRow = (row) => {
    const on = !row.classList.contains("on");
    const box = setRow(row, on);
    if (box && !reduceMotion) {
      box.classList.remove("pop");
      void box.offsetWidth;
      box.classList.add("pop");
    }
    post("toggle", { key: row.dataset.feature || row.textContent.trim(), on });
    scheduleSave();
  };

  document.addEventListener("click", (e) => {
    if (busy) return;
    const box = e.target.closest(".cbox");
    const row = box ? box.closest(".row") : e.target.closest(".row[data-toggle]");
    if (!row) return;
    e.stopPropagation();
    toggleRow(row);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!e.target.classList?.contains("cbox")) return;
    const row = e.target.closest(".row");
    if (!row) return;
    e.preventDefault();
    toggleRow(row);
  });

  /* ---------------------------------------------------------------- sliders */

  const setupSlider = (row) => {
    const track = row.querySelector(".slider-track");
    const fill = row.querySelector(".slider-fill");
    const thumb = row.querySelector(".slider-thumb");
    const input = row.querySelector("input[type='range']");
    const valEl = row.querySelector(".val");
    if (!track || !input || !valEl) return;

    const tip = document.createElement("div");
    tip.className = "slider-tip";
    track.appendChild(tip);

    const paint = () => {
      const v = parseFloat(input.value);
      const lo = parseFloat(input.min);
      const hi = parseFloat(input.max);
      const pct = hi === lo ? 0 : ((v - lo) / (hi - lo)) * 100;
      fill.style.width = pct + "%";
      thumb.style.left = pct + "%";
      valEl.textContent = input.value;
      tip.textContent = input.value;
      tip.style.left = pct + "%";
    };

    const commit = () => {
      paint();
      post("slider", { key: row.dataset.feature || "", value: input.value });
      scheduleSave();
    };

    input.addEventListener("input", paint, { passive: true });
    input.addEventListener("change", commit);
    input.addEventListener("pointerdown", () => tip.classList.add("visible"));
    input.addEventListener("pointerup", () => tip.classList.remove("visible"));
    input.addEventListener("pointercancel", () => tip.classList.remove("visible"));
    input.addEventListener("pointerleave", () => tip.classList.remove("visible"));
    input.addEventListener("dblclick", () => {
      const def = row.dataset.default;
      if (def == null) return;
      input.value = def;
      commit();
      toast("reset to " + def);
    });
    paint();

    track.addEventListener("click", (e) => {
      if (e.target === input) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const lo = parseFloat(input.min);
      const hi = parseFloat(input.max);
      const step = parseFloat(input.step) || 1;
      input.value = Math.round((lo + pct * (hi - lo)) / step) * step;
      commit();
    });
  };
  $$(".slider-row").forEach(setupSlider);

  /* --------------------------------------------------------------- keybinds */

  const KEY_LABELS = {
    " ": "SPACE",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Control: "CTRL",
    Shift: "SHIFT",
    Alt: "ALT",
    Escape: "ESC",
    Backspace: "BACKSPACE",
    PageUp: "PGUP",
    PageDown: "PGDN",
    Delete: "DELETE"
  };

  const labelFor = (e) => {
    if (KEY_LABELS[e.key]) return KEY_LABELS[e.key];
    if (e.key.length === 1) return e.key.toUpperCase();
    return e.key.toUpperCase();
  };

  const keybinds = {};
  $$(".keybind").forEach((chip) => {
    keybinds[chip.dataset.keybind] = chip.dataset.value;
  });

  const paintKeybinds = () => {
    $$(".keybind").forEach((chip) => {
      chip.textContent = keybinds[chip.dataset.keybind] || "—";
    });
    const hint = $("#footHint");
    if (hint) hint.textContent = keybinds.toggle + " to hide · drag the bar to move";
  };

  let capturing = null;

  const stopCapture = () => {
    if (capturing) capturing.classList.remove("listening");
    capturing = null;
    busy = false;
  };

  $$(".keybind").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (capturing === chip) return stopCapture();
      stopCapture();
      capturing = chip;
      busy = true;
      chip.classList.add("listening");
      chip.textContent = "PRESS KEY";
    });
    chip.addEventListener("blur", () => {
      if (capturing === chip) {
        stopCapture();
        paintKeybinds();
      }
    });
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopCapture();
        paintKeybinds();
        return;
      }

      const name = labelFor(e);
      const slot = capturing.dataset.keybind;
      keybinds[slot] = name;
      capturing.dataset.value = name;
      stopCapture();
      paintKeybinds();
      post("keybind", { slot, key: name });
      toast(slot + ": " + name);
      scheduleSave();
    },
    true
  );

  /* --------------------------------------------------------------- dropdowns */

  const profileSel = $("#profile");
  const footProfile = $("#footProfile");
  const syncProfile = () => {
    if (!profileSel || !footProfile) return;
    footProfile.textContent = "PROFILE: " + profileSel.value.toUpperCase();
  };
  profileSel?.addEventListener("change", () => {
    syncProfile();
    toast("profile: " + profileSel.value);
    post("profile", { name: profileSel.value });
    scheduleSave();
  });
  syncProfile();

  $$(".dropdown[data-key]").forEach((sel) => {
    sel.addEventListener("change", () => {
      post("option", { key: sel.dataset.key, value: sel.value });
      scheduleSave();
    });
  });

  /* ------------------------------------------------------------------ store */

  const snapshot = () => ({
    v: 4,
    toggles: $$(".row[data-toggle]").map((r) => r.classList.contains("on")),
    sliders: $$(".slider-row input[type='range']").map((i) => i.value),
    selects: $$(".dropdown").map((s) => s.value),
    master: masterToggle.classList.contains("on"),
    bar: wrapper.dataset.bar || "top",
    scale: scaleSel?.value || "1",
    profile: profileSel?.value || "default",
    keybinds: { ...keybinds },
    tab: activeTab
  });

  const apply = (s) => {
    if (!s) return;

    if (s.v !== 4) {
      // Older layouts had a different control order; start clean instead of
      // mapping stale indices onto unrelated toggles.
      toast("old profile ignored", "err");
      return;
    }

    $$(".row[data-toggle]").forEach((row, i) => {
      if (!s.toggles || s.toggles[i] == null) return;
      setRow(row, !!s.toggles[i]);
    });

    $$(".slider-row input[type='range']").forEach((input, i) => {
      if (!s.sliders || s.sliders[i] == null) return;
      input.value = s.sliders[i];
      input.dispatchEvent(new Event("input"));
    });

    $$(".dropdown").forEach((sel, i) => {
      if (!s.selects || s.selects[i] == null) return;
      sel.value = s.selects[i];
    });

    setMaster(!!s.master);
    if (s.bar) applyBar(s.bar);
    if (s.scale) applyScale(s.scale);
    syncProfile();
    if (s.keybinds) {
      Object.assign(keybinds, s.keybinds);
      paintKeybinds();
    }
    if (s.tab) setTab(s.tab, false);
    queueFit();
  };

  const writeStore = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      return true;
    } catch (_) {
      return false;
    }
  };

  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeStore, AUTOSAVE_MS);
  }

  const flash = (btn) => {
    btn.classList.add("flash");
    setTimeout(() => btn.classList.remove("flash"), 550);
  };

  $("#btnSave").addEventListener("click", (e) => {
    const ok = writeStore();
    flash(e.currentTarget);
    toast(ok ? "config saved" : "save failed", ok ? "" : "err");
    post("save", { profile: profileSel?.value || "default" });
  });

  $("#btnLoad").addEventListener("click", (e) => {
    let ok = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        apply(JSON.parse(raw));
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    flash(e.currentTarget);
    toast(ok ? "config loaded" : "nothing stored", ok ? "" : "err");
    if (ok) post("load", { profile: profileSel?.value || "default" });
  });

  $("#btnReset").addEventListener("click", (e) => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    $$(".row[data-toggle]").forEach((row) => setRow(row, false));
    $$(".slider-row").forEach((row) => {
      const input = row.querySelector("input[type='range']");
      if (!input || row.dataset.default == null) return;
      input.value = row.dataset.default;
      input.dispatchEvent(new Event("input"));
    });
    setMaster(false);
    flash(e.currentTarget);
    toast("reset to defaults");
    post("reset", {});
  });

  /* ------------------------------------------------------------- uptime/etc */

  const t0 = Date.now();
  const upEl = $("#uptime");
  if (upEl) {
    setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      upEl.textContent =
        String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    }, 1000);
  }

  /* ------------------------------------------------------- host interaction */

  if (hosted) {
    document.documentElement.dataset.host = "webview2";
    bridge.addEventListener("message", (e) => {
      const msg = e.data || {};
      if (msg.type === "set_status" && $("#statusTag")) {
        const tag = $("#statusTag");
        tag.innerHTML = "<i></i>";
        tag.appendChild(document.createTextNode(String(msg.data?.text || "READY")));
      } else if (msg.type === "set_visible") {
        wrapper.classList.toggle("hidden", !msg.data?.visible);
      }
    });
    post("ui_ready", { page: "menu" });
  }

  /* ------------------------------------------------------------------- boot */

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) apply(JSON.parse(raw));
  } catch (_) {}
  paintKeybinds();

  // The host hook needs the live bindings, not just the ones changed this session.
  Object.entries(keybinds).forEach(([slot, key]) => post("keybind", { slot, key }));

  requestAnimationFrame(() => {
    fit();
    animatePane($(".pane.active"));
  });
})();
