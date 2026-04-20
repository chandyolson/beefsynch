# BeefSynch — agent notes

## Typography — locked in

**Inter is the only font** used in the app and in auth email templates. Do not introduce Space Grotesk, DM Sans, Manrope, or any other display font unless explicitly requested.

The Google Fonts `@import` in `src/index.css` must load **Inter only** (weights 400, 500, 600, 700, 800 as needed). Do not add second families to that URL.

Tailwind keeps a `font-display` utility name for headings and emphasis, but it resolves to the same Inter stack as `font-sans`—do not point `theme.extend.fontFamily.display` at a different typeface.
