# Fat Fingers

Fat Fingers makes every icon in bb 50% larger when you are using it on a
phone. Desktop and tablet-with-a-mouse layouts are untouched.

bb's icons are sized for a pointer. On a phone they are the thing you are
trying to hit, and a 16px glyph is a small thing to hit. This plugin scales
them up so there is more to see and more to aim at.

Install it from the GitHub collection:

```sh
bb plugin install git:https://github.com/csells/bb-plugins.git@main --plugin fat-fingers
```

## What counts as a phone

The same thing bb thinks counts as a phone: a viewport at most 767px wide
**and** a coarse pointer (a finger). That is the media query bb uses for its
own coarse-pointer sizing, so this plugin follows bb's decision rather than
inventing a second one. A narrow desktop window with a mouse stays as it was.

The scaling applies to the bb web app opened in a phone browser, including a
remote `getbb.app` link and a home-screen install. It does not reach the
native bb mobile app, which does not run plugin frontends.

## What gets scaled

Everything bb draws as an icon: the glyphs from its icon set, the lucide
glyphs in a few shadcn primitives, and the plugin marks and provider logos it
draws as CSS masks. Diagrams, images, and other SVG content inside messages
are deliberately left alone.

Scaling uses CSS `zoom`, so the icon's layout box grows with it and its
wrapping button grows to fit. It is not a paint-only transform that leaves a
tiny hit target behind a big picture.

## Tuning

The factor lives in one CSS custom property, `--fat-fingers-scale` (default
`1.5`), set on `<html>` while the plugin is active. Override it from a bb
theme or a user stylesheet if 50% is too much or not enough.

The plugin has no settings, no commands, and no network access.

## Development

```sh
npm run typecheck
npm test
npm run build
```
