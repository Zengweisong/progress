# Browser Markdown modules

- Marked 18.1.1, MIT. Source: the pinned `marked` npm dependency.
- DOMPurify 3.4.17, Apache-2.0 or MPL-2.0. Source: the pinned `dompurify` npm dependency.

Run `npm ci` and `npm run vendor:markdown` to refresh these browser modules.
Only source-map comments are removed; the runtime implementations are unchanged.
The adjacent license files are copied from the upstream packages.
