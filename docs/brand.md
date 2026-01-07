# Brand

Open Trees uses a warm paper design system with subtle texture, soft borders, and botanical sketch line art.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg" />
  <img alt="Open Trees banner" src="assets/brand/banner-light.svg" width="100%" />
</picture>

## Assets

- Banners: `docs/assets/brand/banner-light.svg`, `docs/assets/brand/banner-dark.svg`
- Release cards: `docs/assets/brand/release-light.svg`, `docs/assets/brand/release-dark.svg`
- Pattern strip: `docs/assets/brand/pattern-light.svg`, `docs/assets/brand/pattern-dark.svg`
- Release notes template: `docs/release-notes.md`

## Color tokens

| Token | Light | Dark |
| --- | --- | --- |
| `paper` | hsl(40, 30%, 97%) | hsl(30, 5%, 10.5%) |
| `surface` | hsl(40, 25%, 95%) | hsl(30, 5%, 12%) |
| `text` | hsl(30, 15%, 15%) | hsl(40, 20%, 92%) |
| `border` | hsl(35, 15%, 85%) | hsl(30, 5%, 20%) |
| `accent` | hsl(35, 20%, 88%) | hsl(35, 12%, 20%) |
| `ring` | hsl(30, 20%, 25%) | hsl(35, 15%, 70%) |

## Typography

- Primary: Geist Sans
- Code: Geist Mono
- Titles: text-2xl, font-semibold, tracking-tight
- Body: text-sm

## Interaction cues

- Focus ring: 2px with 2px offset using the `ring` token
- Hover: subtle accent background with smooth transition-colors
- Disabled: 50% opacity

## Usage

README banner:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/banner-dark.svg" />
  <img alt="Open Trees warm paper banner" src="docs/assets/brand/banner-light.svg" width="100%" />
</picture>
```

Docs header strip:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/pattern-dark.svg" />
  <img alt="Warm paper pattern" src="assets/brand/pattern-light.svg" width="100%" />
</picture>
```

Release card:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/0xSero/open-trees/main/docs/assets/brand/release-dark.svg" />
  <img alt="Open Trees release card" src="https://raw.githubusercontent.com/0xSero/open-trees/main/docs/assets/brand/release-light.svg" width="100%" />
</picture>
```
