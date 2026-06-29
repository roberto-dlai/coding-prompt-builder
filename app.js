"use strict";

/* Coding Prompt Builder — turns the form into a prompt.md, 100% client-side. No LLM, no network.
 *
 * The form is DATA-DRIVEN: app.js renders controls from the rules below and re-evaluates
 * dependencies on every change. This keeps selections internally consistent — e.g. ORMs
 * filter to the chosen database engine, backend frameworks filter to the chosen language,
 * and whole sections appear/disappear based on project type. Any selection that becomes
 * invalid after a change is automatically reset. */

const form = document.getElementById("spec-form");
const output = document.getElementById("preview-output");
const notice = document.getElementById("notice");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");
const resetBtn = document.getElementById("reset-btn");

const STORAGE_KEY = "coding-prompt-builder.form.v1";

/* A value counts as "set" only if it's a real, affirmative choice. */
const NOT_SET = ["", "None", "Undecided", "Not specified", "__other__"];
const isSet = (v) => !!v && !NOT_SET.includes(v);

/* ============================================================
   Option data + dependency rules
   ============================================================ */

const PROJECT_TYPES = ["Web app", "API / Service", "CLI tool", "Mobile app", "Desktop app", "Library / Package"];
const SCOPES = ["Quick prototype", "MVP", "Production-ready"];

const CLIENT_FRAMEWORKS = {
  web: ["Vanilla HTML/CSS/JS", "React", "Vue", "Svelte", "Angular", "Next.js", "Nuxt", "Remix", "Astro", "SolidJS"],
  mobile: ["React Native", "Flutter", "Swift (SwiftUI)", "Kotlin (Jetpack Compose)", "Ionic", ".NET MAUI"],
  desktop: ["Electron", "Tauri", "Qt", "Flutter", ".NET MAUI"],
};

/* Framework -> allowed languages. One entry => that language is forced. */
const FRAMEWORK_LANGS = {
  "Vanilla HTML/CSS/JS": ["JavaScript"],
  "Angular": ["TypeScript"],
  "Flutter": ["Dart"],
  "Swift (SwiftUI)": ["Swift"],
  "Kotlin (Jetpack Compose)": ["Kotlin"],
  ".NET MAUI": ["C#"],
  "Qt": ["C++", "Python"],
  // Everything else defaults to JS/TS (handled below).
};
const JS_TS = ["JavaScript", "TypeScript"];

/* UI component libraries by client framework (only shown when one fits). */
const UI_LIBS = {
  "React": ["shadcn/ui", "MUI", "Chakra UI"],
  "Next.js": ["shadcn/ui", "MUI", "Chakra UI"],
  "Remix": ["shadcn/ui", "MUI"],
  "Astro": ["shadcn/ui"],
  "SolidJS": ["Solid UI"],
  "Vue": ["Vuetify", "PrimeVue", "Element Plus"],
  "Nuxt": ["Vuetify", "PrimeVue", "Nuxt UI"],
  "Angular": ["Angular Material", "PrimeNG"],
  "Svelte": ["Skeleton", "Flowbite Svelte"],
};

const BACKEND_LANGS = ["Node.js", "Python", "Go", "Ruby", "Java", "PHP", "C#/.NET", "Rust"];

const BACKEND_FRAMEWORKS = {
  "Node.js": ["Express", "NestJS", "Fastify"],
  "Python": ["FastAPI", "Django", "Flask"],
  "Go": ["Gin", "Echo", "Fiber"],
  "Ruby": ["Rails", "Sinatra"],
  "Java": ["Spring Boot", "Quarkus"],
  "PHP": ["Laravel", "Symfony"],
  "C#/.NET": ["ASP.NET Core"],
  "Rust": ["Actix Web", "Axum"],
};

const DB_ENGINES = ["Postgres", "MySQL", "SQLite", "MongoDB", "Redis", "DynamoDB", "Firebase/Firestore", "Cassandra"];
const RELATIONAL = ["Postgres", "MySQL", "SQLite"];
const NONRELATIONAL = ["MongoDB", "Redis", "DynamoDB", "Firebase/Firestore", "Cassandra"];
const dbCategoryOf = (engine) =>
  RELATIONAL.includes(engine) ? "Relational" : NONRELATIONAL.includes(engine) ? "Non-relational" : "";

const EXTRAS = ["Containerize with Docker", "CI/CD with GitHub Actions"];

const HOSTING = {
  web: ["Vercel", "Netlify", "AWS", "GCP", "Azure", "Cloudflare", "Fly.io", "Render", "Docker / self-hosted", "Undecided"],
  mobile: ["Apple App Store", "Google Play", "Expo EAS", "Firebase App Distribution", "Undecided"],
  desktop: ["GitHub Releases", "Microsoft Store", "Mac App Store", "Self-hosted installer", "Undecided"],
};

const FEATURES = [
  "Payments (Stripe)", "Email / notifications", "File / image upload", "Real-time / WebSockets",
  "Search", "Analytics", "AI / LLM features", "Internationalization (i18n)", "Admin dashboard", "Background jobs",
];

/* Capabilities per project type — which sections apply. */
function caps(projectType) {
  switch (projectType) {
    case "API / Service":
      return { client: null, backend: "full", db: true, auth: true, api: true, host: "web", styling: false, ui: false, features: true, extras: true };
    case "CLI tool":
      return { client: null, backend: "lang", db: true, auth: false, api: false, host: null, styling: false, ui: false, features: true, extras: false };
    case "Library / Package":
      return { client: null, backend: "lang", db: false, auth: false, api: false, host: null, styling: false, ui: false, features: false, extras: false };
    case "Mobile app":
      return { client: "mobile", backend: "full", db: true, auth: true, api: true, host: "mobile", styling: false, ui: false, features: true, extras: false };
    case "Desktop app":
      return { client: "desktop", backend: "full", db: true, auth: true, api: true, host: "desktop", styling: false, ui: false, features: true, extras: true };
    default: // Web app + any "Other" project type
      return { client: "web", backend: "full", db: true, auth: true, api: true, host: "web", styling: true, ui: true, features: true, extras: true };
  }
}

/* Does the project have a server capable of running backend logic? */
function hasBackend(s) {
  const serverfulClient = ["Next.js", "Nuxt", "Remix"].includes(single(s, "clientFramework"));
  return isSet(single(s, "backendLanguage")) || serverfulClient;
}

/* Is there a TypeScript/Node context (required for tRPC)? */
function tsContext(s) {
  return (
    single(s, "frontendLanguage") === "TypeScript" ||
    ["Next.js", "Remix"].includes(single(s, "clientFramework")) ||
    single(s, "backendFramework") === "NestJS"
  );
}

/* ORM/ODM options valid for the chosen engine(s) + backend language.
   Engines are multi-select, so options are the union across all picked engines. */
function ormOptions(s) {
  const engines = multi(s, "dbEngine");
  const lang = single(s, "backendLanguage");
  const langUnset = !isSet(lang);
  const out = ["Raw queries"]; // multi-select; leaving all unchecked means "no ORM"

  const hasSQL = engines.some((e) => RELATIONAL.includes(e));
  const hasMongo = engines.includes("MongoDB");

  if (hasSQL) {
    if (lang === "Node.js" || langUnset) out.push("Prisma", "Drizzle", "TypeORM");
    if (lang === "Python" || langUnset) out.push("SQLAlchemy");
    if (lang === "Go") out.push("GORM");
    if (lang === "Ruby") out.push("ActiveRecord");
    if (lang === "Java") out.push("Hibernate / JPA");
    if (lang === "C#/.NET") out.push("Entity Framework");
    if (lang === "Rust") out.push("Diesel");
  }
  if (hasMongo) {
    if (lang === "Node.js" || langUnset) out.push("Mongoose", "Prisma");
  }
  // Redis / DynamoDB / Firestore / Cassandra: no mainstream ORM here → just None / Raw queries.
  return [...new Set(out)];
}

function authOptions(s) {
  const base = ["None", "OAuth (Google/GitHub)", "Provider (Auth0/Clerk/Supabase)"];
  if (hasBackend(s)) base.push("Email + password", "JWT", "Session-based", "Magic link");
  return base;
}

/* ============================================================
   State helpers
   ============================================================ */

/* Read RAW control values straight from the DOM. */
function readRaw() {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") {
      (data[el.name] ||= []);
      if (el.checked) data[el.name].push(el.value);
    } else if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
    } else {
      data[el.name] = el.value;
    }
  }
  return data;
}

/* Resolve a single value, expanding the "Other" sentinel to its typed text. */
function single(s, name) {
  let v = s[name];
  if (Array.isArray(v)) v = v[0];
  v = (v ?? "").toString();
  if (v === "__other__") v = (s[name + "_other"] || "").toString().trim();
  return v.trim();
}

function multi(s, name) {
  const arr = Array.isArray(s[name]) ? s[name] : s[name] ? [s[name]] : [];
  return arr
    .map((v) => (v === "__other__" ? (s[name + "_other"] || "").toString().trim() : v))
    .map((v) => v.toString().trim())
    .filter(Boolean);
}

/* ============================================================
   Rendering
   ============================================================ */

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function optInput(type, name, value, label, checked) {
  return `<label><input type="${type}" name="${esc(name)}" value="${esc(value)}"${checked ? " checked" : ""} /> ${esc(label)}</label>`;
}

/* Decide which single value is selected, honoring saved state then defaults. */
function selectedSingle(name, options, s, opts) {
  const raw = s[name];
  if (raw === "__other__" && opts.allowOther) return "__other__";
  if (raw && options.includes(raw)) return raw;
  if (opts.default && options.includes(opts.default)) return opts.default;
  if (opts.notSpecified) return "";
  return options.length === 1 ? options[0] : "";
}

function legend(label, opts) {
  const req = opts.required ? ' <em class="req">*</em>' : "";
  const optl = opts.optional ? ' <span class="muted">(optional)</span>' : "";
  return `<legend class="field-label">${esc(label)}${req}${optl}</legend>`;
}

function hintHtml(opts) {
  return opts.hint ? `<span class="hint">${esc(opts.hint)}</span>` : "";
}

function otherRadio(name, checked, text) {
  return `<label class="other-opt"><input type="radio" name="${esc(name)}" value="__other__"${checked ? " checked" : ""} /> Other:
    <input type="text" name="${esc(name)}_other" class="other-input" value="${esc(text)}" placeholder="specify…" /></label>`;
}
function otherCheckbox(name, checked, text) {
  return `<label class="other-opt"><input type="checkbox" name="${esc(name)}" value="__other__"${checked ? " checked" : ""} /> Other:
    <input type="text" name="${esc(name)}_other" class="other-input" value="${esc(text)}" placeholder="specify…" /></label>`;
}

function radioGroup(name, options, s, opts = {}) {
  const sel = selectedSingle(name, options, s, opts);
  let items = "";
  if (opts.notSpecified) items += optInput("radio", name, "", "— not specified —", sel === "");
  for (const v of options) items += optInput("radio", name, v, v, sel === v);
  if (opts.allowOther) items += otherRadio(name, sel === "__other__", s[name + "_other"] || "");
  return `<fieldset class="field">${legend(opts.label, opts)}<div class="options${opts.grid ? " grid" : ""}">${items}</div>${hintHtml(opts)}</fieldset>`;
}

function checkboxGroup(name, options, s, opts = {}) {
  const sel = Array.isArray(s[name]) ? s[name] : [];
  let items = "";
  for (const v of options) items += optInput("checkbox", name, v, v, sel.includes(v));
  if (opts.allowOther) items += otherCheckbox(name, sel.includes("__other__"), s[name + "_other"] || "");
  return `<fieldset class="field">${legend(opts.label, opts)}<div class="options${opts.grid ? " grid" : ""}">${items}</div>${hintHtml(opts)}</fieldset>`;
}

function textField(name, s, opts = {}) {
  const val = s[name] || "";
  const req = opts.required ? ' <em class="req">*</em>' : "";
  const optl = opts.optional ? ' <span class="muted">(optional)</span>' : "";
  const control = opts.textarea
    ? `<textarea name="${esc(name)}" rows="${opts.rows || 4}" placeholder="${esc(opts.placeholder || "")}">${esc(val)}</textarea>`
    : `<input type="text" name="${esc(name)}" value="${esc(val)}" placeholder="${esc(opts.placeholder || "")}" />`;
  return `<label class="field"><span class="field-label">${esc(opts.label)}${req}${optl}</span>${control}${hintHtml(opts)}</label>`;
}

/* Build the full set of section blocks for the current state. */
function buildBlocks(s) {
  const ptRaw = s.projectType || "Web app";
  const pt = ptRaw === "__other__" ? "Other" : ptRaw;
  const c = caps(pt);
  const blocks = [];
  const add = (title, fields) => blocks.push({ title, fields: fields.filter(Boolean) });

  /* Project basics */
  add("Project basics", [
    textField("projectName", s, { label: "Project name", placeholder: "e.g. TaskFlow" }),
    textField("description", s, {
      label: "High-level description", required: true, textarea: true, rows: 5,
      placeholder: "Describe what you want to build, who it's for, and the main thing it should do.",
      hint: "This is the heart of your prompt. The more context, the better the plan.",
    }),
    radioGroup("projectType", PROJECT_TYPES, s, { label: "Project type", default: "Web app", allowOther: true }),
    radioGroup("scope", SCOPES, s, { label: "Scope", notSpecified: true, allowOther: true }),
  ]);

  /* Client (frontend / mobile / desktop) */
  if (c.client) {
    const fields = [];
    const frameworks = CLIENT_FRAMEWORKS[c.client];
    const fwLabel = c.client === "mobile" ? "Mobile framework" : c.client === "desktop" ? "Desktop framework" : "Framework";
    fields.push(radioGroup("clientFramework", frameworks, s, { label: fwLabel, notSpecified: true, allowOther: true }));

    const fw = single(s, "clientFramework");
    if (isSet(fw)) {
      const langs = FRAMEWORK_LANGS[fw] || JS_TS;
      fields.push(
        radioGroup("frontendLanguage", langs, s, {
          label: "Language",
          default: langs[0],
          hint: langs.length === 1 ? `${fw} uses ${langs[0]}.` : "",
        })
      );
      if (c.styling) {
        let styles = ["Plain CSS", "Tailwind", "Sass", "Bootstrap", "CSS Modules"];
        if (fw === "Vanilla HTML/CSS/JS" || fw === "Angular") styles = styles.filter((x) => x !== "CSS Modules");
        fields.push(radioGroup("styling", styles, s, { label: "Styling", notSpecified: true, allowOther: true }));
      }
      if (c.ui && UI_LIBS[fw]) {
        fields.push(checkboxGroup("uiLibrary", UI_LIBS[fw], s, { label: "UI component library", optional: true, allowOther: true }));
      }
    }
    const title = c.client === "mobile" ? "Mobile" : c.client === "desktop" ? "Desktop" : "Frontend";
    add(title, fields);
  }

  /* Backend / language */
  if (c.backend) {
    const fields = [];
    const langLabel = c.backend === "lang" ? "Language" : "Language / runtime";
    fields.push(radioGroup("backendLanguage", BACKEND_LANGS, s, { label: langLabel, notSpecified: true, allowOther: true }));

    const bl = single(s, "backendLanguage");
    if (c.backend === "full" && isSet(bl) && BACKEND_FRAMEWORKS[bl]) {
      fields.push(radioGroup("backendFramework", BACKEND_FRAMEWORKS[bl], s, { label: "Framework", notSpecified: true, allowOther: true }));
    }
    if (c.api && hasBackend(s)) {
      let styles = ["REST", "GraphQL", "tRPC", "gRPC"];
      if (!tsContext(s)) styles = styles.filter((x) => x !== "tRPC");
      fields.push(radioGroup("apiStyle", styles, s, { label: "API style", notSpecified: true, allowOther: true }));
    }
    add(c.backend === "lang" ? "Language" : "Backend", fields);
  }

  /* Database */
  if (c.db) {
    const fields = [
      checkboxGroup("dbEngine", DB_ENGINES, s, {
        label: "Database engine(s)", allowOther: true,
        hint: "Pick one or more — you can mix relational and non-relational (e.g. Postgres + Redis). The category is inferred per engine.",
      }),
    ];
    if (multi(s, "dbEngine").length) {
      const orms = ormOptions(s);
      if (orms.length > 1) {
        fields.push(checkboxGroup("orm", orms, s, {
          label: "ORM / ODM", optional: true, allowOther: true,
          hint: "Select any that apply — with multiple databases you may use one per store (e.g. Prisma for SQL, Mongoose for MongoDB). Leave unchecked for none.",
        }));
      }
    }
    add("Database", fields);
  }

  /* Authentication */
  if (c.auth) {
    add("Authentication", [radioGroup("auth", authOptions(s), s, { label: "Method", default: "None", allowOther: true })]);
  }

  /* Hosting / Deployment */
  if (c.host) {
    const fields = [radioGroup("hosting", HOSTING[c.host], s, { label: "Target", default: "Undecided", allowOther: true })];
    if (c.extras) fields.push(checkboxGroup("extras", EXTRAS, s, { label: "Extras", allowOther: true }));
    add("Hosting / Deployment", fields);
  }

  /* Testing (always) */
  add("Testing", [
    checkboxGroup("testing", ["Unit", "Integration", "End-to-end"], s, { label: "Levels", allowOther: true }),
    textField("testingTools", s, { label: "Preferred tools", optional: true, placeholder: "e.g. Vitest, Playwright" }),
  ]);

  /* Features / integrations */
  if (c.features) {
    add("Features / integrations", [checkboxGroup("features", FEATURES, s, { label: "Select all that apply", grid: true, allowOther: true })]);
  }

  /* Constraints & preferences (always) */
  add("Constraints & preferences", [
    textField("audience", s, { label: "Target audience / expected scale", placeholder: "e.g. internal tool for ~50 users" }),
    textField("nonFunctional", s, { label: "Accessibility / performance requirements", placeholder: "e.g. WCAG AA, sub-second loads" }),
    textField("conventions", s, {
      label: "Coding conventions or extra requirements", textarea: true, rows: 4,
      placeholder: "Anything else the LLM should know: code style, libraries to avoid, naming, etc.",
    }),
  ]);

  return blocks;
}

function render(s) {
  const blocks = buildBlocks(s);
  form.innerHTML = blocks
    .map((b, i) => `<section class="card"><h2>${i + 1} · ${esc(b.title)}</h2>${b.fields.join("")}</section>`)
    .join("");
}

/* ============================================================
   prompt.md generation (deterministic, no LLM)
   ============================================================ */

function buildPrompt(raw) {
  const s = {
    projectName: single(raw, "projectName"),
    description: single(raw, "description"),
    projectType: single(raw, "projectType"),
    scope: single(raw, "scope"),
    clientFramework: single(raw, "clientFramework"),
    frontendLanguage: single(raw, "frontendLanguage"),
    styling: single(raw, "styling"),
    uiLibrary: multi(raw, "uiLibrary"),
    backendLanguage: single(raw, "backendLanguage"),
    backendFramework: single(raw, "backendFramework"),
    apiStyle: single(raw, "apiStyle"),
    dbEngine: multi(raw, "dbEngine"),
    orm: multi(raw, "orm"),
    auth: single(raw, "auth"),
    hosting: single(raw, "hosting"),
    extras: multi(raw, "extras"),
    testing: multi(raw, "testing"),
    testingTools: single(raw, "testingTools"),
    features: multi(raw, "features"),
    audience: single(raw, "audience"),
    nonFunctional: single(raw, "nonFunctional"),
    conventions: single(raw, "conventions"),
  };

  const pt = s.projectType || "Web app";
  const lines = [];
  const title = s.projectName ? `${s.projectName} — Build Request` : "Project Build Request";
  lines.push(`# ${title}`, "");

  /* Overview */
  lines.push("## Overview");
  lines.push(s.description || "_No description provided yet._");
  const meta = [];
  if (isSet(pt)) meta.push(`**Project type:** ${pt}`);
  if (isSet(s.scope)) meta.push(`**Scope:** ${s.scope}`);
  if (meta.length) lines.push("", meta.join("  ·  "));
  lines.push("");

  /* Tech stack */
  const stack = [];

  if (isSet(s.clientFramework)) {
    let v = s.clientFramework;
    if (isSet(s.frontendLanguage) && s.frontendLanguage !== "JavaScript" && v !== "Vanilla HTML/CSS/JS") {
      v += ` (${s.frontendLanguage})`;
    }
    const parts = [v];
    if (isSet(s.styling)) parts.push(s.styling);
    if (s.uiLibrary.length) parts.push(s.uiLibrary.join(", "));
    const clientLabel = /mobile/i.test(pt) ? "Mobile" : /desktop/i.test(pt) ? "Desktop" : "Frontend";
    stack.push(`- **${clientLabel}:** ${parts.join(", ")}`);
  }

  const be = [];
  if (isSet(s.backendLanguage)) {
    let v = s.backendLanguage;
    if (isSet(s.backendFramework)) v += ` / ${s.backendFramework}`;
    be.push(v);
  } else if (isSet(s.backendFramework)) {
    be.push(s.backendFramework);
  }
  if (isSet(s.apiStyle)) be.push(`${s.apiStyle} API`);
  if (be.length) {
    const backendLabel = /cli|library/i.test(pt) ? "Language" : "Backend";
    stack.push(`- **${backendLabel}:** ${be.join(", ")}`);
  }

  if (s.dbEngine.length) {
    const parts = s.dbEngine.map((e) => {
      const cat = dbCategoryOf(e);
      return cat ? `${e} (${cat})` : e;
    });
    let db = parts.join(", ");
    if (s.orm.length) db += ` · ORM/ODM: ${s.orm.join(", ")}`;
    const label = s.dbEngine.length > 1 ? "Databases" : "Database";
    stack.push(`- **${label}:** ${db}`);
  }

  if (isSet(s.auth)) stack.push(`- **Auth:** ${s.auth}`);

  const host = [];
  if (isSet(s.hosting)) host.push(s.hosting);
  if (s.extras.length) host.push(...s.extras);
  if (host.length) stack.push(`- **Hosting / DevOps:** ${host.join(", ")}`);

  if (stack.length) lines.push("## Tech Stack", ...stack, "");

  /* Features */
  if (s.features.length) {
    lines.push("## Features & Integrations");
    s.features.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  /* Testing */
  if (s.testing.length || s.testingTools) {
    lines.push("## Testing");
    if (s.testing.length) lines.push(`- Levels: ${s.testing.join(", ")}`);
    if (s.testingTools) lines.push(`- Preferred tools: ${s.testingTools}`);
    lines.push("");
  }

  /* Constraints */
  const constraints = [];
  if (s.audience) constraints.push(`- Target audience / scale: ${s.audience}`);
  if (s.nonFunctional) constraints.push(`- Accessibility / performance: ${s.nonFunctional}`);
  if (s.conventions) constraints.push(`- Conventions / notes: ${s.conventions}`);
  if (constraints.length) lines.push("## Constraints & Preferences", ...constraints, "");

  /* The instruction that makes this a usable prompt */
  lines.push("## Your Task");
  lines.push(
    "You are a senior software engineer. Using the specification above, produce a " +
      "detailed, step-by-step implementation plan. Include:",
    "",
    "1. A short architecture overview and the rationale behind key choices.",
    "2. The data model (entities, relationships, and key fields).",
    "3. A breakdown of files/modules and their responsibilities.",
    "4. Milestones in the order they should be built, with what each delivers.",
    "5. Risks, edge cases, open questions, and assumptions you are making.",
    "",
    "Do not write the full application yet — produce the plan first so we can review it."
  );

  return lines.join("\n") + "\n";
}

/* ============================================================
   Persistence + lifecycle
   ============================================================ */

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode / file:// restrictions) — ignore */
  }
}

/* Re-render the form (sanitizing now-invalid selections), then save + preview. */
function refresh() {
  const before = readRaw();
  render(before);             // rebuild DOM; invalid selections fall back to defaults
  const after = readRaw();    // post-sanitize state
  save(after);
  output.textContent = buildPrompt(after);
}

/* Light update for typing: no structural rebuild (keeps focus in text fields). */
function update() {
  const state = readRaw();
  save(state);
  output.textContent = buildPrompt(state);
}

/* ============================================================
   Actions
   ============================================================ */

function flash(message, ok) {
  notice.textContent = message;
  notice.classList.toggle("ok", !!ok);
  notice.hidden = false;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { notice.hidden = true; }, 2500);
}

function ensureDescription() {
  if (!single(readRaw(), "description")) {
    flash("Add a high-level description first — it's the core of the prompt.", false);
    const field = form.querySelector('[name="description"]');
    if (field) field.focus();
    return false;
  }
  return true;
}

async function copyPrompt() {
  if (!ensureDescription()) return;
  const text = buildPrompt(readRaw());
  try {
    await navigator.clipboard.writeText(text);
    flash("Copied to clipboard ✓", true);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Copied to clipboard ✓", true); }
    catch { flash("Couldn't copy automatically — select the preview and copy manually.", false); }
    document.body.removeChild(ta);
  }
}

function downloadPrompt() {
  if (!ensureDescription()) return;
  const blob = new Blob([buildPrompt(readRaw())], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "prompt.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  flash("Downloaded prompt.md ✓", true);
}

function resetForm() {
  if (!confirm("Clear all fields and start over?")) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  render({});
  refresh();
  flash("Form reset", true);
}

/* ============================================================
   Wire up
   ============================================================ */

form.addEventListener("input", (e) => {
  // Typing in text/textarea fields never changes the option structure.
  if (e.target && (e.target.type === "radio" || e.target.type === "checkbox")) return;
  update();
});
form.addEventListener("change", (e) => {
  if (e.target && (e.target.type === "radio" || e.target.type === "checkbox")) refresh();
  else update();
});
copyBtn.addEventListener("click", copyPrompt);
downloadBtn.addEventListener("click", downloadPrompt);
resetBtn.addEventListener("click", resetForm);

/* Init: restore saved state (if any), render, then sanitize. */
(function init() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { /* ignore */ }
  render(saved || {});
  refresh();
})();
