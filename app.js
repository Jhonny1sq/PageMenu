(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const $ = (s, r = document) => r.querySelector(s);

  const wrapper = $("#wrapper");
  const topbar = $("#topbar");
  const masterToggle = $("#masterToggle");
  const STORAGE_KEY = "bloodsense.config.v1";

  let activeTab = "aim";

  /* -----------------------------------------------------------
     TAB SWITCHING + MASTER SCOPE
     ----------------------------------------------------------- */
  const syncMaster = () => {
    masterToggle.dataset.scope = activeTab === "aim" ? "aim" : "hidden";
  };

  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      activeTab = key;
      $$(".tab").forEach(t => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      $$(".pane").forEach(p => p.classList.toggle("active", p.dataset.pane === key));
      syncMaster();
    });
  });
  syncMaster();

  /* -----------------------------------------------------------
     BAR POSITION
     ----------------------------------------------------------- */
  const posSel = $("#barPos");
  const applyBar = (pos) => {
    wrapper.dataset.bar = pos;
    const tabbar = $("#tabbar");
    if (tabbar) tabbar.style.flexDirection = (pos === "left" || pos === "right") ? "column" : "row";
  };
  if (posSel) {
    posSel.addEventListener("change", () => applyBar(posSel.value));
    applyBar(posSel.value || "top");
  }

  /* -----------------------------------------------------------
     DRAG (requestAnimationFrame)
     ----------------------------------------------------------- */
  let drag = null;
  let rafId = null;

  topbar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".tab, .btn, .master-toggle, .dropdown")) return;
    const rect = wrapper.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, originX: rect.left, originY: rect.top };
    wrapper.style.transform = "none";
    wrapper.style.left = rect.left + "px";
    wrapper.style.top = rect.top + "px";
    wrapper.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      wrapper.style.left = (drag.originX + dx) + "px";
      wrapper.style.top = (drag.originY + dy) + "px";
    });
  });

  window.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    wrapper.classList.remove("dragging");
  });

  /* -----------------------------------------------------------
     VISIBILITY (INSERT / ESC)
     ----------------------------------------------------------- */
  const hosted = !!window.chrome?.webview;  // host window owns show/hide in-game
  if (!hosted) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Insert" || e.key === "Escape") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
        e.preventDefault();
        wrapper.classList.toggle("hidden");
      }
    });
  }

  /* -----------------------------------------------------------
     MASTER TOGGLE
     ----------------------------------------------------------- */
  const flipMaster = () => {
    masterToggle.classList.toggle("on");
    masterToggle.setAttribute("aria-checked", masterToggle.classList.contains("on") ? "true" : "false");
  };
  masterToggle.addEventListener("click", flipMaster);
  masterToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipMaster(); }
  });

  /* -----------------------------------------------------------
     CHECKBOX TOGGLES (click or keyboard only on .cbox)
     ----------------------------------------------------------- */
  const toggleBox = (box) => {
    const row = box.closest(".row");
    if (!row) return;
    row.classList.toggle("on");
    const on = row.classList.contains("on");
    box.setAttribute("aria-checked", on ? "true" : "false");
    box.classList.remove("pop");
    void box.offsetWidth;
    box.classList.add("pop");
  };

  document.addEventListener("click", (e) => {
    const box = e.target.closest(".cbox");
    if (!box) return;
    e.stopPropagation();
    toggleBox(box);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const box = e.target.closest && e.target.closest(".cbox");
    if (!box) return;
    e.preventDefault();
    toggleBox(box);
  });

  /* -----------------------------------------------------------
     SLIDERS + TOOLTIP
     ----------------------------------------------------------- */
  const buildSlider = (wrap) => {
    const track = wrap.querySelector(".slider-track");
    const fill  = wrap.querySelector(".slider-fill");
    const thumb = wrap.querySelector(".slider-thumb");
    const input = wrap.querySelector("input[type='range']");
    const valEl = wrap.querySelector(".val");
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

    input.addEventListener("input", paint);
    input.addEventListener("pointerdown", () => tip.classList.add("visible"));
    input.addEventListener("pointerup", () => tip.classList.remove("visible"));
    input.addEventListener("pointerleave", () => tip.classList.remove("visible"));
    paint();

    track.addEventListener("click", (e) => {
      if (e.target === input) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const lo = parseFloat(input.min);
      const hi = parseFloat(input.max);
      const step = parseFloat(input.step) || 1;
      const snapped = Math.round((lo + pct * (hi - lo)) / step) * step;
      input.value = snapped;
      paint();
    });
  };
  $$(".slider-row").forEach(buildSlider);

  /* -----------------------------------------------------------
     SAVE / LOAD / RESET (localStorage)
     ----------------------------------------------------------- */
  const flash = (btn) => {
    btn.classList.add("flash");
    setTimeout(() => btn.classList.remove("flash"), 500);
  };

  const snapshot = () => ({
    toggles: $$(".row[data-toggle]").map(r => r.classList.contains("on")),
    sliders: $$(".slider-row input[type='range']").map(i => i.value),
    master: masterToggle.classList.contains("on"),
    bar: wrapper.dataset.bar || "top"
  });

  const restore = (s) => {
    if (!s) return;
    $$(".row[data-toggle]").forEach((r, i) => {
      if (s.toggles && s.toggles[i] != null) {
        r.classList.toggle("on", !!s.toggles[i]);
        const cb = r.querySelector(".cbox");
        if (cb) cb.setAttribute("aria-checked", s.toggles[i] ? "true" : "false");
      }
    });
    $$(".slider-row input[type='range']").forEach((i, idx) => {
      if (s.sliders && s.sliders[idx] != null) {
        i.value = s.sliders[idx];
        i.dispatchEvent(new Event("input"));
      }
    });
    masterToggle.classList.toggle("on", !!s.master);
    masterToggle.setAttribute("aria-checked", s.master ? "true" : "false");
    if (s.bar && posSel) { posSel.value = s.bar; applyBar(s.bar); }
  };

  $("#btnSave").addEventListener("click", (e) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      flash(e.currentTarget);
    } catch (_) { flash(e.currentTarget); }
  });

  $("#btnLoad").addEventListener("click", (e) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) restore(JSON.parse(raw));
      flash(e.currentTarget);
    } catch (_) { flash(e.currentTarget); }
  });

  $("#btnReset").addEventListener("click", (e) => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    $$(".row[data-toggle]").forEach(r => {
      r.classList.remove("on");
      const cb = r.querySelector(".cbox");
      if (cb) cb.setAttribute("aria-checked", "false");
    });
    masterToggle.classList.remove("on");
    masterToggle.setAttribute("aria-checked", "false");
    flash(e.currentTarget);
  });

  /* -----------------------------------------------------------
     UPTIME
     ----------------------------------------------------------- */
  const t0 = Date.now();
  const upEl = $("#uptime");
  if (upEl) {
    setInterval(() => {
      upEl.textContent = Math.floor((Date.now() - t0) / 1000) + "s";
    }, 1000);
  }
})();