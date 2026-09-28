/**
 * Inline styles for the standalone HTML page: system fonts only, and colors
 * for both light and dark schemes, so the page needs nothing from the network.
 */
export const HTML_STYLE = `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #59636e;
  --border: #d1d9e0;
  --code-bg: #eff1f3;
  --note-bg: #ddf4ff;
  --note-border: #0969da;
  --warn-bg: #fff8c5;
  --warn-border: #9a6700;
  --fail: #d1242f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #9198a1;
    --border: #3d444d;
    --code-bg: #262c36;
    --note-bg: #121d2f;
    --note-border: #4493f8;
    --warn-bg: #272115;
    --warn-border: #d29922;
    --fail: #f85149;
  }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main {
  max-width: 60rem;
  margin: 0 auto;
  padding: 2rem 1rem;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.25;
}
section {
  margin-top: 1.5rem;
}
code {
  background: var(--code-bg);
  border-radius: 4px;
  padding: 0.1em 0.3em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.note {
  background: var(--note-bg);
  border-left: 4px solid var(--note-border);
  padding: 0.5rem 1rem;
}
ol {
  padding-left: 2rem;
}
li {
  margin: 0 0 1.5rem;
  padding-left: 0.5rem;
}
li p {
  margin: 0 0 0.5rem;
}
li.warning {
  background: var(--warn-bg);
  border-left: 4px solid var(--warn-border);
  padding: 0.5rem;
}
li.failed {
  border-left: 4px solid var(--fail);
}
.approximate {
  color: var(--muted);
}
.failed-here {
  color: var(--fail);
}
figure {
  margin: 0.5rem 0 0;
}
img {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}`;
