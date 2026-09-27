/* DeskOps site.js — progressive enhancements for the DeskOps static site.
   Every feature degrades gracefully: with JS disabled, the page is fully
   readable and navigable. Features activate only when their required
   DOM elements exist. Vanilla JS, no dependencies. */
(function () {
  "use strict";

  var doc = document;
  var isArticlePage = /\/articles\//.test(location.pathname);
  // Prefix needed to reach the site root from the current page.
  var rootPrefix = isArticlePage ? "../" : "";

  /* ------------------------------------------------------------------
   * 1. Site-wide client-side search.
   * Expects in the header/nav:
   *   <form class="site-search" role="search">
   *     <input type="search" ...>  <ul class="search-results" hidden></ul>
   *   </form>
   * Fetches search-index.json once, then filters locally on each input.
   * ------------------------------------------------------------------ */
  function initSearch() {
    var form = doc.querySelector(".site-search");
    if (!form) return;
    var input = form.querySelector("input[type=search]");
    var list = form.querySelector(".search-results");
    if (!input || !list) return;

    var index = null;
    var loaded = false;

    function loadIndex() {
      if (loaded) return Promise.resolve(index);
      loaded = true;
      return fetch(rootPrefix + "search-index.json", { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("search index unavailable");
          return r.json();
        })
        .then(function (data) {
          index = Array.isArray(data) ? data : [];
          return index;
        })
        .catch(function () {
          index = [];
          return index;
        });
    }

    function score(entry, q) {
      // Simple weighted substring scoring: title > headings > excerpt.
      var t = entry.title.toLowerCase();
      var h = (entry.headings || []).join(" ").toLowerCase();
      var x = (entry.excerpt || "").toLowerCase();
      var s = 0;
      q.split(/\s+/).forEach(function (word) {
        if (!word) return;
        if (t.indexOf(word) !== -1) s += 3;
        if (h.indexOf(word) !== -1) s += 2;
        if (x.indexOf(word) !== -1) s += 1;
      });
      return s;
    }

    function render(results, q) {
      list.innerHTML = "";
      if (!results.length) {
        if (q.length > 1) {
          var li = doc.createElement("li");
          li.className = "search-none";
          li.textContent = "No articles match \u201C" + q + "\u201D.";
          list.appendChild(li);
          list.hidden = false;
        } else {
          list.hidden = true;
        }
        return;
      }
      results.slice(0, 6).forEach(function (entry) {
        var li = doc.createElement("li");
        var a = doc.createElement("a");
        a.href = rootPrefix + entry.url;
        a.textContent = entry.title;
        li.appendChild(a);
        list.appendChild(li);
      });
      list.hidden = false;
    }

    function onInput() {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        list.hidden = true;
        list.innerHTML = "";
        return;
      }
      loadIndex().then(function (idx) {
        var scored = [];
        idx.forEach(function (entry) {
          var s = score(entry, q);
          if (s > 0) scored.push({ e: entry, s: s });
        });
        scored.sort(function (a, b) {
          return b.s - a.s;
        });
        render(
          scored.map(function (x) {
            return x.e;
          }),
          input.value.trim()
        );
      });
    }

    input.addEventListener("input", onInput);
    // Prefetch the index when the field gets focus so results feel instant.
    input.addEventListener("focus", loadIndex, { once: true });

    // Close the dropdown on Escape; click-away handled below.
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        list.hidden = true;
        input.blur();
      }
    });

    doc.addEventListener("click", function (e) {
      if (!form.contains(e.target)) list.hidden = true;
    });

    // Prevent a page reload on submit; results are already linked.
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var first = list.querySelector("a");
      if (first) location.href = first.href;
    });
  }

  /* ------------------------------------------------------------------
   * 2. Article table of contents (auto-generated from h2/h3).
   * Inserts a "On this page" box before the first content h2 and
   * highlights the current section via IntersectionObserver (fallback:
   * plain anchor list with no highlighting).
   * ------------------------------------------------------------------ */
  function slugify(text, used) {
    var base = text
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    var slug = base || "section";
    var i = 1;
    while (used[slug]) {
      i += 1;
      slug = base + "-" + i;
    }
    used[slug] = true;
    return slug;
  }

  function initToc() {
    var article = doc.querySelector(".prose article");
    if (!article) return;
    var used = {};
    var headings = [];
    Array.prototype.forEach.call(article.querySelectorAll("h2, h3"), function (h) {
      // Skip chrome sections (FAQ block, "Keep reading").
      if (h.closest(".faq") || h.closest(".keep-reading")) return;
      if (!h.id) h.id = slugify(h.textContent, used);
      else if (used[h.id]) h.id = slugify(h.textContent, used);
      else used[h.id] = true;
      headings.push({ el: h, level: h.tagName === "H3" ? 3 : 2 });
    });
    if (headings.length < 2) return;

    var nav = doc.createElement("nav");
    nav.className = "toc";
    nav.setAttribute("aria-label", "Table of contents");
    var title = doc.createElement("p");
    title.className = "toc-title";
    title.textContent = "On this page";
    nav.appendChild(title);
    var ul = doc.createElement("ul");
    headings.forEach(function (item) {
      var li = doc.createElement("li");
      if (item.level === 3) li.className = "toc-h3";
      var a = doc.createElement("a");
      a.href = "#" + item.el.id;
      a.textContent = item.el.textContent;
      a.setAttribute("data-target", item.el.id);
      li.appendChild(a);
      ul.appendChild(li);
    });
    nav.appendChild(ul);

    // Insert before the first content heading.
    var first = headings[0].el;
    first.parentNode.insertBefore(nav, first);

    // Scroll-spy.
    var links = ul.querySelectorAll("a");
    function setActive(id) {
      Array.prototype.forEach.call(links, function (a) {
        var on = a.getAttribute("data-target") === id;
        a.classList.toggle("active", on);
        if (on) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    }
    if ("IntersectionObserver" in window) {
      var obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) setActive(en.target.id);
          });
        },
        { rootMargin: "-20% 0px -65% 0px" }
      );
      headings.forEach(function (item) {
        obs.observe(item.el);
      });
    }
  }

  /* ------------------------------------------------------------------
   * 3. Reading progress bar (article pages only).
   * ------------------------------------------------------------------ */
  function initProgress() {
    var article = doc.querySelector(".prose article");
    if (!article) return;
    var bar = doc.createElement("div");
    bar.className = "reading-progress";
    bar.setAttribute("aria-hidden", "true");
    doc.body.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var scrollTop = window.pageYOffset || doc.documentElement.scrollTop;
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0;
      bar.style.transform = "scaleX(" + pct / 100 + ")";
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener("resize", update);
    update();
  }

  /* ------------------------------------------------------------------
   * 4. Sortable comparison tables.
   * Makes thead th cells clickable toggles (asc/desc), numeric-aware.
   * Only tables that look like spec comparisons are touched.
   * ------------------------------------------------------------------ */
  function initSortableTables() {
    var tables = doc.querySelectorAll(".prose article table");
    Array.prototype.forEach.call(tables, function (table) {
      var thead = table.querySelector("thead");
      var tbody = table.querySelector("tbody");
      if (!thead || !tbody || tbody.rows.length < 2) return;
      table.classList.add("sortable");

      Array.prototype.forEach.call(thead.querySelectorAll("th"), function (th, col) {
        th.setAttribute("tabindex", "0");
        th.setAttribute("role", "button");
        th.title = "Sort by " + th.textContent.trim();

        function parseVal(cell) {
          var text = cell.textContent.trim();
          // Strip currency, units, commas, tildes; keep digits/dot/minus.
          var num = text.replace(/[^0-9.\-]/g, "");
          var f = parseFloat(num);
          if (num !== "" && !isNaN(f) && /[0-9]/.test(text)) return { n: f, s: text.toLowerCase() };
          return { n: null, s: text.toLowerCase() };
        }

        function sort(dir) {
          var rows = Array.prototype.slice.call(tbody.rows);
          rows.sort(function (a, b) {
            var va = parseVal(a.cells[col] || { textContent: "" });
            var vb = parseVal(b.cells[col] || { textContent: "" });
            var cmp;
            if (va.n !== null && vb.n !== null) cmp = va.n - vb.n;
            else cmp = va.s < vb.s ? -1 : va.s > vb.s ? 1 : 0;
            return dir === "desc" ? -cmp : cmp;
          });
          rows.forEach(function (r) {
            tbody.appendChild(r);
          });
        }

        function toggle() {
          var dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
          Array.prototype.forEach.call(thead.querySelectorAll("th"), function (o) {
            o.removeAttribute("aria-sort");
          });
          th.setAttribute("aria-sort", dir);
          sort(dir);
        }

        th.addEventListener("click", toggle);
        th.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      });
    });
  }

  /* ------------------------------------------------------------------
   * 5. FAQ accordions (accessible: button + aria-expanded).
   * Converts .faq dl dt/dd pairs. Without JS the definition list
   * remains fully readable.
   * ------------------------------------------------------------------ */
  function initFaq() {
    Array.prototype.forEach.call(doc.querySelectorAll(".faq dl"), function (dl) {
      var pairs = [];
      var current = null;
      Array.prototype.forEach.call(dl.children, function (child) {
        var tag = child.tagName.toLowerCase();
        if (tag === "dt") {
          current = { dt: child, dds: [] };
          pairs.push(current);
        } else if (tag === "dd" && current) {
          current.dds.push(child);
        }
      });
      pairs.forEach(function (pair, i) {
        var id = "faq-a-" + i;
        var btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "faq-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.setAttribute("aria-controls", id);
        btn.innerHTML = pair.dt.innerHTML;
        pair.dt.textContent = "";
        pair.dt.appendChild(btn);

        var panel = doc.createElement("div");
        panel.className = "faq-panel";
        panel.id = id;
        panel.hidden = true;
        pair.dds.forEach(function (dd) {
          panel.appendChild(dd);
        });
        pair.dt.parentNode.insertBefore(panel, pair.dt.nextSibling);

        btn.addEventListener("click", function () {
          var open = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!open));
          panel.hidden = open;
        });
      });
    });
  }

  /* ------------------------------------------------------------------
   * 6. Dark mode toggle (header button, localStorage, defaults to
   * prefers-color-scheme). The initial theme is set by a tiny inline
   * script in <head> to avoid a flash; here we just wire the button.
   * ------------------------------------------------------------------ */
  function initThemeToggle() {
    var btn = doc.getElementById("themeToggle");
    if (!btn) return;
    function current() {
      return doc.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }
    function label() {
      btn.setAttribute("aria-label", current() === "dark" ? "Switch to light mode" : "Switch to dark mode");
      btn.setAttribute("aria-pressed", String(current() === "dark"));
    }
    label();
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      doc.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("deskops-theme", next);
      } catch (e) {
        /* storage unavailable: theme still applies for this session */
      }
      label();
    });
  }

  /* ------------------------------------------------------------------
   * 7. Back-to-top button.
   * ------------------------------------------------------------------ */
  function initBackToTop() {
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "back-to-top";
    btn.setAttribute("aria-label", "Back to top");
    btn.innerHTML = "&uarr;";
    btn.hidden = true;
    doc.body.appendChild(btn);

    var ticking = false;
    function onScroll() {
      ticking = false;
      btn.hidden = (window.pageYOffset || doc.documentElement.scrollTop) < 600;
    }
    window.addEventListener(
      "scroll",
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(onScroll);
        }
      },
      { passive: true }
    );
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    onScroll();
  }

  /* Boot: run everything; any single failure must not break the rest. */
  [initSearch, initToc, initProgress, initSortableTables, initFaq, initThemeToggle, initBackToTop].forEach(
    function (fn) {
      try {
        fn();
      } catch (e) {
        /* graceful degradation: skip this feature */
      }
    }
  );
})();
