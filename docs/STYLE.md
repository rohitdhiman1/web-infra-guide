# Formatting standard

Every module page follows one format. The reference page is **A0 — Foundations**
(`src/content/docs/apis/a0-foundations.mdx`, served at `/apis/a0-foundations/`). When in doubt, copy
what it does.

- New page: `npm run new-page -- apis/a11-authentication "A11 — Authentication"`
- Check a page: `npm run check-format` (with `-- --all` to see every issue on pages not yet migrated)
- Template: `templates/module-page.mdx`

## Page anatomy

In this order:

| # | Part | Markup | Purpose |
|---|---|---|---|
| 1 | Lead | A plain paragraph, the first thing after the imports | Says what the module solves and why it matters. Rendered larger. |
| 2 | Definition (optional) | `## What X is` + `:::note[Definition]` | A precise, quotable definition of the module's main term. |
| 3 | Concepts | `## Concepts`, then one section per concept | The core ideas, numbered A3.1, A3.2, … A page with no concepts (the capstone) marks itself `{/* format: no-concepts */}`. |
| 4 | Diagram or simulation | `## <what it shows>` + one or two sentences + the component | Something to try with your hands. |
| 5 | Lab | `## Lab A3 — <what you build>` | Spec table, key code, how to try it. |
| 6 | Self-check | `## You've got it when` + `<Checkpoint>` | What the reader can do before moving on. |

## One concept

```mdx
<span id="concept-a3-4"></span>

### <span class="concept-badge">A3.4</span> Exponential backoff with jitter

One short paragraph that states the idea.

A second short paragraph with the why or the consequence.

| Optional | table |
|---|---|
| or an | example |

<Takeaway>
One sentence the reader should remember.
</Takeaway>
```

- The `<span id>` line keeps old `#concept-a3-4` links working; the badge shows the number.
- Number concepts 1, 2, 3… with no gaps; the check enforces it.
- Every concept ends with exactly one `<Takeaway>`: a single sentence.

## Elements and when to use them

| Element | Markup | Use it for |
|---|---|---|
| Section | `## Title` | A major part of the page. Gets a divider line and space above. |
| Concept or subsection | `### Title` | A concept (with its badge), or a subsection such as "APIs you already use". |
| Small label | `#### Spec` | Labels inside a section: Spec, The key code, Try it with curl, Things to notice. Never a bold paragraph on its own line. |
| Definition | `:::note[Definition]` | Only for definitions. Don't use asides for general emphasis. |
| Takeaway | `<Takeaway>…</Takeaway>` | The one-sentence summary at the end of each concept. |
| Self-check | `<Checkpoint>` + a bullet list | Only in "You've got it when". Each bullet starts with a verb: Explain, Choose, Design. |
| Table | Markdown table | Any comparison, list of options, or spec. Prefer a table to a long paragraph. |
| Avoid / Prefer | Table with `✗ Avoid` and `✓ Prefer` columns | “Don't do this, do that.” Never two code samples side by side: they overflow on phones. |
| Code | Fenced block with a language | The few lines that matter, not whole projects. Comments on their own line when a line would be long. |
| Java + Python | `<Tabs syncKey="lab-lang">` | Lab snippets. The sync key keeps the reader's language choice across the page. |
| Links to the guide | `[3.2](/part-3-http11/#concept-3-2)` | Instead of re-explaining what the main guide already covers. |

## Writing

- **Short paragraphs:** two to four sentences. One idea each.
- **Plain words:** say “use”, not “leverage”; “so”, not “thus”.
- **Concrete examples from the running orders and payments API:** `POST /orders`, `ord_1`, €30.00.
- **Facts must be checkable:** RFC numbers, status codes and header names exactly right. Label judgement calls as such (“a sensible default, not a rule”).
- **No placeholder text** left from the template, and no `{/* comments */}` in a finished page.

## Frontmatter

```yaml
---
title: "A3 — Reliability: timeouts, retries, idempotency"
tableOfContents:
  maxHeadingLevel: 3     # concepts appear in the "On this page" bar
---
```

## Guide pages (Parts 1–15, field guide, toolkit…)

The guide pages are generated from `source/guide.md` by `npm run split-guide`, and their wording must
stay exactly as written. So they follow the same look through the generator (`formatPage()` in
`scripts/split-guide.mjs`), with these differences:

- **No Takeaways.** They would add text that isn't in the guide.
- **Diagrams stay where the guide places them,** usually right after the lead, each under a `##`
  heading taken from the diagram's title (`###` when the diagram sits inside one of the guide's own sections).
- **Concepts** become `### <badge> Title` sections. The long concept text is split into short paragraphs
  at sentence boundaries, with no words changed.
- **Labels:** “Concepts”, “In the sandbox” and “You've got it when” become `##` sections. Other
  standalone bold labels become `##` sections, or `###` inside one of the guide's own sections. The
  self-check sentence goes in a `<Checkpoint title="">` box.

- **Extra material** that isn't in the guide (such as the HTTP history timeline on Part 3) is added as a
  component through `EXTRAS` in the generator. It's inserted after the page's opening paragraph and gets a
  heading from `DIAGRAM_TITLES`, so the guide text itself never changes.

To change how guide pages look, change the generator and re-run it. Never edit the generated `.mdx` files.

## Before a page is done

1. `npm run build && npm run check-links && npm run check-format`: all green.
2. Look at it at desktop width (about 1440 px) and phone width (about 390 px), in light and dark mode.
3. Every diagram button works with a mouse and with the keyboard, and the page never scrolls sideways.
4. Add the page to the sidebar in `astro.config.mjs`, and to the module table on `/apis/`.

## Where the styling lives

- `src/styles/custom.css`: the “Content formatting system” block (lead, headings, badges, labels, Takeaway, Checkpoint) and the table styles.
- `src/components/content/`: `Takeaway.astro` and `Checkpoint.astro`.
- `astro.config.mjs`: rounded code blocks (`expressiveCode.styleOverrides`).
