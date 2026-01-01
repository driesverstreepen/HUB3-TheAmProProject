ANIMATIONS REFERENCE — HUB3
===========================

Purpose
-------
This document lists the animations currently implemented in the project, grouped by page and section. For each animation you'll find:
- a short, consistent animation name (so we can refer to it later)
- a description of the effect
- the main implementation details (Tailwind classes / JS behavior)
- where to find the code (file path) and what to change to tweak timing/behaviour

Use this as a reference when you want to apply the same animation elsewhere.

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Welcome Page — `app/WelcomePage.tsx`
––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
1) Feature cards — "Fade-Up Reveal + Hover Lift"
- Description: Outer card shell is visible immediately; inner content fades up into place when the card scrolls into view. On hover the entire outer card lifts slightly with stronger shadow.
- Visual behavior:
  - Initial: opacity 0 and translated down (translateY), inner content invisible
  - On intersect: opacity → 1 and translateY → 0 (fade-up)
  - On hover (outer card): translateY(-2) and stronger shadow
- Implementation details:
  - Component: `components/FeatureCard.tsx`
  - Intersection hook: native `IntersectionObserver` inside the component
  - Tailwind utilities used:
    - initial/active transforms: `opacity-0 translate-y-4` → `opacity-100 translate-y-0`
    - hover transform/shadow: `hover:-translate-y-2 hover:shadow-xl`
    - transition timing: `transition-all duration-900 ease-out`
  - Stagger: index-based delay applied inline with `style={{ transitionDelay: `${delay}ms` }}`. Default delay multiplier: `250ms * index`.
- Where to change:
  - `components/FeatureCard.tsx` — change `duration-900` for speed or `delay = index * 250` to adjust stagger.

2) Benefits list ("Waarom HUB3?") — "Fade-Up Staggered List"
- Description: Each row (icon + text) fades up sequentially as the list scrolled into view. Shell remains visible; text and icon animate.
- Implementation details:
  - Component: `components/AnimatedListItem.tsx` (new, used by `app/WelcomePage.tsx`)
  - IntersectionObserver threshold: 0.12
  - Tailwind utilities: `opacity-0 translate-y-3` → `opacity-100 translate-y-0`
  - Transition: `duration-900 ease-out`, stagger delay: `index * 250ms`.
- Where to change:
  - `components/AnimatedListItem.tsx` — change `duration-900` and `const delay = index * 250`.
  - `app/WelcomePage.tsx` — where the `memberBenefits` are mapped, the index is passed to `AnimatedListItem`.

3) "Hoe werkt het?" timeline / chevrons — "Static Timeline + Chevrons"
- Description: Steps are displayed in a responsive timeline. On md+ chevrons (SVG) appear between steps. We added small layout z-index fixes so chevrons appear above the connector line.
- Implementation details:
  - File: `app/WelcomePage.tsx` (timeline block)
  - No JS animation; chevrons are static SVGs. Connector line is `h-px bg-slate-200 z-0`; chevrons use `z-10`.
- Where to change:
  - To add animation (fade/slide chevrons), add CSS transitions or wrap SVG with `AnimatedListItem` style logic.

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Studio Welcome Page — `app/StudioWelcomePage.tsx`
––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
1) Pricing cards layout changes (alignment)
- Description: Cards were converted to `flex flex-col` with `flex-grow` on features and `mt-auto` for the CTA so buttons align at the bottom. No entrance animations were added here (layout only).
- Implementation details:
  - File: `app/StudioWelcomePage.tsx`
  - Key classes: `flex flex-col`, `flex-grow` on feature list, `mt-auto` on CTA, `pb-6` added for spacing.
- Where to change:
  - To add reveal/stagger similar to FeatureCard, replace static markup with `FeatureCard` or `AnimatedListItem` usage and pass index.

2) Features and other blocks
- Current state: static. If you want the same animated reveal effect, re-use `components/FeatureCard.tsx` or `AnimatedListItem.tsx`.

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Shared components and utilities
––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
1) `components/FeatureCard.tsx` — "Fade-Up Reveal + Hover Lift" (detailed above)
- Important lines:
  - IntersectionObserver logic (in-file useEffect)
  - `style={{ transitionDelay: `${delay}ms` }}` where `delay = index * 250`
  - `className` that sets `opacity-0 translate-y-4` and transitions to `opacity-100 translate-y-0`.
- Tweak points: change `duration-900` or `index` multiplier to tune behavior.

2) `components/AnimatedListItem.tsx` — "Fade-Up Staggered List Item"
- Implementation matches `FeatureCard` timing: `duration-900`, `index * 250ms` stagger.
- Use this component to animate any list row with the same pattern.

3) Accessibility (recommended)
- Respect `prefers-reduced-motion`:
  - Tailwind helpers: `motion-safe:transition-*` and `motion-reduce:transition-none`.
  - In JS: check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip `IntersectionObserver` transitions or set `transitionDelay = 0`.
- Add `aria-hidden` to decorative elements if they don't provide information.

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Naming conventions (use these when applying elsewhere)
- Fade-Up Reveal + Hover Lift — pattern used for feature cards
- Fade-Up Staggered List — pattern used for lists of benefits
- Static Timeline — timeline layout with chevrons (no animation)
- Hover Icon Pop — (not implemented yet) small icon scale on hover

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Where to apply and quick recipes
- To apply the feature animation to other pages: import `FeatureCard` and map your data with `index` prop.
- For simple list rows, wrap content in `AnimatedListItem` and pass `index`.
- To change speed or stagger globally: update the `delay` multiplier and `duration-900` values in `components/FeatureCard.tsx` and `components/AnimatedListItem.tsx`.

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Files created / edited for animations
- `components/FeatureCard.tsx` — added reveal + hover interactions
- `components/AnimatedListItem.tsx` — new; used for the "Waarom HUB3?" list
- `app/WelcomePage.tsx` — updated to use `AnimatedListItem` and updated timeline/chevrons
- `app/StudioWelcomePage.tsx` — layout changes for pricing cards (no animation added yet)

––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
Notes / Next steps
- Accessibility: I recommend adding a small check for `prefers-reduced-motion` and disabling delays/transitions for those users.
- Consistency: If you want a single source of truth for timing (duration/stagger multiplier), we can extract constants (e.g. `animations.ts`) and import them in both components.
- Reuse: If you want animation parity on the studio page I can convert the pricing features to use `FeatureCard` and/or `AnimatedListItem` in a follow-up patch.

If you want, I can:
- Add a `prefers-reduced-motion` fallback now (small patch), and
- Extract a shared `animations.ts` constants file (duration & delay multiplier) so tuning is centralized.

— End of document
