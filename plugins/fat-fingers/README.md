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

The scaling applies wherever bb runs on a phone: the native bb mobile app, a
phone browser opened on a remote `getbb.app` link, and a home-screen install.

## What gets scaled

Everything bb draws as an icon: the glyphs from its icon set, the lucide
glyphs in a few shadcn primitives, and the plugin marks and provider logos it
draws as CSS masks. Diagrams, images, and other SVG content inside messages
are deliberately left alone.

Scaling uses CSS `zoom`, so the icon's layout box grows with it and its
wrapping button grows to fit. It is not a paint-only transform that leaves a
tiny hit target behind a big picture.

One bb quirk is smoothed over on the way: bb's icon buttons enlarge an `svg`
glyph to at least 16px on a phone but not a plugin mark or provider logo
drawn as a CSS mask, so a plugin's own button icon (Read Aloud's speaker,
say) sat at two thirds the size of its neighbours. Those get the same 16px
floor here, so a message's action row scales as one set.

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
