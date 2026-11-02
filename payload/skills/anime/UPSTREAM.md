---
name: anime
description: >
    Animation skill for Anime.js v4 (juliangarnier/anime) — the JavaScript animation engine
    for timelines, staggers, SVG line-drawing and morphing, text splitting, scroll-linked
    animation, draggables and FLIP layout transitions, all driven from JS instead of CSS.
    Use when animating with anime.js, writing createTimeline/createDraggable/animate/
    createDrawable/createMotionPath/stagger, porting v3 anime({targets}) code to v4,
    sequencing multi-step animation, drawing SVG paths, or animating numbers and objects.
    For CSS transitions and Motion (framer-motion) work, prefer the `motion` skill; use this
    one when the job needs a JS timeline, WAAPI sync or SVG path maths that CSS cannot do.
argument-hint: "[what to animate, e.g. 'timeline for a modal', 'draw an SVG logo', 'stagger 40 rows', 'spring ease']"
---

# Anime.js

A fast, multipurpose JavaScript animation engine. Everything is driven from JS and everything
you animate is a *target*; what you give it decides how it moves.

Docs: <https://animejs.com/documentation> · Repo: <https://github.com/juliangarnier/anime>
(647 files, `examples/` has runnable HTML for nearly every feature — copy from there.)

## v4 imports (v3's global `anime()` is gone)

```js
import {
  animate,             // the core: animate(targets, params)
  createTimeline,      // sequence multiple animations
  createTimer,         // a timer with callbacks, no targets
  createDraggable,     // pointer drag with bounds/snap/spring
  createAnimatable,    // JS-controlled animatable values + getters/setters
  createSpring,        // spring easing to drive other values
  createDrawable,      // SVG line drawing (replaces v3 strokeDashoffset hacks)
  createMotionPath,    // animate along an SVG path
  createScope,         // scoped media queries + revert for component lifecycles
  stagger,             // stagger() for per-target delays
  utils,               // $, $$, get, set, clamp, lerp, mapRange, random, snap, round…
  svg, text, scroll,   // svg.morphTo(), text.split(), scroll() observers
} from 'animejs';
```

## The five shapes you will actually write

```js
// 1. property animation
animate('.card', { opacity: [0, 1], y: [18, 0], duration: 500, ease: 'outQuart', delay: stagger(60) });

// 2. animating JS objects & numbers (writing the value yourself)
animate(counter, { v: 1500, duration: 1600, ease: 'outExpo', onUpdate: () => render(counter.v) });

// 3. a sequence
const tl = createTimeline({ defaults: { duration: 400, ease: 'outQuart' } });
tl.add('.step-1', { opacity: 1 })
  .add('.step-2', { opacity: 1 }, '-=200')   // relative offsets: '-=200', '<', '<<+=100'
  .add('.step-3', { opacity: 1 }, '<');      // '<' = start with the previous

// 4. SVG line drawing (this is what CSS cannot do well)
const [draw] = createDrawable('.logo path');
animate(draw, { draw: '0 1', duration: 2000, ease: 'outQuart' });

// 5. scroll-linked
animate('.panel', { y: [60, 0], autoplay: scroll({ target: '.panel', enter: 'bottom', sync: true }) });
```

## Values, units and arrays

- `x: 100` sets · `x: [0, 100]` tweens from → to · `x: (t, i) => …` per-target function
- Unitless numbers keep their current unit; pass `'100%'`, `'2rem'`, `'50vw'` explicitly
- `stagger(60)` spreads a delay; `stagger([0, 400])` spans the range; accepts functions for value staggering
- Ease strings: `'outExpo' 'outQuart' 'outCubic' 'inOutQuad' 'outElastic(1, .3)' 'linear'`
  (v4 uses these names — **not** v3's `'easeOutExpo'`). Springs: `createSpring({ stiffness, damping })` or `'spring'`.

## Gotchas learned in practice

- **`onUpdate` receives the animation instance** (`self`), not your object — read your own object
  in the closure (`animate(obj, { v: 10, onUpdate: () => setX(obj.v) })`), which is also how you
  drive React state from anime.
- **v3 → v4 migration is a rewrite, not a rename**: no global `anime()`, no `targets:` key
  (targets are the first argument), `easing` became `ease`, `direction`/`loop` moved to
  `createTimeline` params, `anime.stagger` is now the imported `stagger`.
- **React/Next**: run animations in `useEffect` and return `anim.pause()` (or `scope.revert()`)
  for cleanup, or a StrictMode double-mount doubles your animations.
- **Reduced motion is on you** — anime has no built-in `prefers-reduced-motion` handling.
  Gate it: `if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setFinal(); return; }`
- **Don't animate layout properties** (`width`, `height`, `top`) when `transform` will do.
  For FLIP-style layout changes use `animate(target, { layout: true })` from the layout module.
- **Verification caveat**: anime drives everything through `requestAnimationFrame`. In throttled
  or headless contexts rAF may not tick, so animated values can appear frozen even though the code
  is correct. Prefer scroll-listener → CSS-variable → CSS-transform for anything that must survive
  throttling (see the `motion` skill's performance notes), and reserve anime for moments where a
  JS timeline is genuinely required.

## Choosing the tool (do this before writing code)

| The job | Use |
|---|---|
| Simple enter/exit, hover, press feedback | **CSS transition** — cheapest, off main thread |
| Component mount/unmount, gestures, interruptible springs, layout animation in React | **Motion** (`motion` skill) |
| Multi-step sequence with precise offsets, SVG path drawing/morphing, text splitting, animating plain JS objects/numbers, WAAPI sync | **Anime.js** (this skill) |
| Anything repeated hundreds of times a day (keyboard actions) | **Neither** — no animation |

Prefer CSS, reach for Motion for component state, reach for Anime when the timeline or the
svg/number maths is the point. Two libraries doing the same job in one codebase is a smell.
