# Coding Prompt Builder

A tiny, zero-dependency web app for turning a project idea into a ready-to-use
`prompt.md`. Fill in a high-level description and pick your stack (frontend,
backend, database, auth, hosting, testing, features, constraints) with radio
buttons and checkboxes. The app assembles your choices into a structured prompt
that ends with a "Your Task" instruction asking an LLM to produce an
implementation plan.

## Run it

No install, no build step. Just open `index.html` in any browser:

```
open index.html      # macOS
```

(Or double-click the file.)

## How it works

- `index.html` — page shell (header + the live preview pane). The form itself is
  rendered by `app.js`.
- `theme.css` — DeepLearning.AI brand design tokens (coral/teal colors, Poppins +
  Open Sans type scale). Fonts load from Google Fonts.
- `styles.css` — component styling built on those tokens.
- `app.js` — a small data-driven form engine: it renders the controls from a config,
  builds the markdown with `buildPrompt()`, and handles copy/download/persistence.

### Smart, dependent options

The form re-evaluates itself on every change so you only ever see choices that fit
together — no contradictory specs. For example:

- **Sections adapt to project type.** A CLI tool or library hides frontend/auth/
  hosting; a mobile/desktop project swaps in native frameworks (React Native,
  Flutter, Swift, Kotlin, Electron, Tauri, …).
- **Database engine implies its category.** There's no separate relational/non-
  relational radio to contradict it, so "Non-relational + MySQL" can't happen. You
  can select **multiple engines** (e.g. Postgres + Redis) and each is labelled with
  its own inferred category in the prompt.
- **ORMs/ODMs filter to the engine *and* language** (e.g. Mongoose only for MongoDB,
  SQLAlchemy only for a Python + SQL stack) and are multi-select, so a multi-database
  app can pick one per store (e.g. Prisma for Postgres + Mongoose for MongoDB).
- **Backend frameworks filter to the language** (no "Python + Express").
- **UI libraries filter to the framework** (React-only libs hidden for Vue/Svelte).
- **tRPC** appears only in a TypeScript context; **auth methods** that need a server
  appear only when a backend is present.

Any selection that becomes invalid after a change is automatically reset.

The UI follows DeepLearning.AI brand guidelines: white surfaces, a teal featured
header, coral for the primary action (Download) and teal for secondary (Copy). The
header shows a text wordmark placeholder — swap in the official white horizontal
DeepLearning.AI logo asset when you have it.

Generation is 100% client-side string templating — no network, no API key, no LLM.
Stack groups default to "not specified," and empty / "None" / "Undecided" choices
are omitted, so the prompt contains only what you actually selected.

Your selections are saved to the browser's `localStorage`, so the form survives a
refresh. Use the **Reset** button to clear everything and start over.

## Use the output

Click **Copy** or **Download prompt.md**, then paste/give the file to your LLM of
choice (e.g. Claude) to generate the actual build plan.
