# Phase 02 — UI Primitives (normalize + new IconButton)

## Overview
- **Priority:** P1 (blocks Phases 03–06)
- **Status:** completed
- **Description:** Normalize existing `Button`/`Input`/`Textarea` to use design tokens, add the variants/sizes the codebase actually needs, and create the missing `IconButton` primitive.

## Key Insights
- Existing primitives use raw utilities and are unused in practice:
  - `button.tsx`: `text-sm`/`text-base`, `h-8/h-10/h-12`, has variants `primary|secondary|outline|danger|ghost`, sizes `sm|md|lg`. Missing: full-width control, `font-bold` (follow-button uses bold), link-as-button (many `<Link>` styled as buttons), icon+label gap.
  - `input.tsx`: `h-10`, `text-sm`, `px-3` — but real usage everywhere is `h-11 px-4`. Normalize to match dominant pattern.
  - `textarea.tsx`: `text-sm`, `px-3 py-2` — real usage `px-4 py-3`.
- Buttons are frequently `<Link>` or `<a>`, not `<button>`. Need an `asChild`-free approach: simplest is to export the shared className builder so links can reuse it. KISS: add `buttonClasses()` helper used by both `Button` and link sites.

## Related Code Files
**Modify:**
- `apps/frontend/src/components/ui/button.tsx`
- `apps/frontend/src/components/ui/input.tsx`
- `apps/frontend/src/components/ui/textarea.tsx`

**Create:**
- `apps/frontend/src/components/ui/icon-button.tsx`
- `apps/frontend/src/components/ui/button-classes.ts` (shared variant builder, reused by Button + styled links)

## Implementation Steps

### 1. `button-classes.ts` (shared builder)
Extract variant/size class logic into a pure function so `<Link>`/`<a>` sites can opt in without wrapping:
```ts
import { cn } from '@/lib/cn';
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';
export function buttonClasses(opts: {
  variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string;
} = {}) {
  const { variant = 'primary', size = 'md', fullWidth, className } = opts;
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-sm rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' && 'h-8 px-3 text-body-sm',
    size === 'md' && 'h-10 px-4 text-body-sm',
    size === 'lg' && 'h-11 px-5 text-body-sm font-semibold',
    fullWidth && 'w-full',
    variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-container',
    variant === 'secondary' && 'bg-surface-container text-on-surface hover:bg-surface-container-high',
    variant === 'outline' && 'border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high',
    variant === 'danger' && 'bg-error text-on-error hover:opacity-90',
    variant === 'ghost' && 'text-on-surface-variant hover:bg-surface-container-high',
    className,
  );
}
```
Note: `lg` size set to `h-11` to match the dominant `h-11` button pattern across pages/forms.

### 2. `button.tsx` — consume the builder, add `fullWidth`
```ts
import { buttonClasses, type ButtonVariant, type ButtonSize } from './button-classes';
import type { ButtonHTMLAttributes } from 'react';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean;
}
export function Button({ className, variant, size, fullWidth, ...props }: ButtonProps) {
  return <button className={buttonClasses({ variant, size, fullWidth, className })} {...props} />;
}
```

### 3. `input.tsx` — normalize to dominant pattern + token type
```ts
className={cn('h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary', className)}
```

### 4. `textarea.tsx` — match form usage
```ts
className={cn('min-h-24 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-body-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary', className)}
```

### 5. `icon-button.tsx` (NEW)
Covers the repeated `rounded-full p-2 transition hover:bg-surface-container-high` pattern in header/nav and the circular icon hover used in action bars.
```tsx
import { cn } from '@/lib/cn';
import { Icon } from './icon';
import type { ButtonHTMLAttributes } from 'react';
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  fill?: boolean;
  label: string;          // required for a11y (aria-label)
  iconClassName?: string; // for glyph size e.g. text-[22px]
}
export function IconButton({ icon, fill, label, className, iconClassName, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn('inline-flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high', className)}
      {...props}
    >
      <Icon name={icon} fill={fill} className={iconClassName} />
    </button>
  );
}
```

## Todo List
- [ ] Create `button-classes.ts`
- [ ] Refactor `button.tsx` to use builder + `fullWidth`
- [ ] Normalize `input.tsx` (h-11, px-4, text-body-sm)
- [ ] Normalize `textarea.tsx` (px-4 py-3, text-body-sm)
- [ ] Create `icon-button.tsx`
- [ ] Run `next build`

## Success Criteria
- All four primitive files compile and stay under 200 lines.
- `buttonClasses()` exported and importable from styled `<Link>`/`<a>` sites in later phases.
- No site consumes them yet → no visual regression possible in this phase.

## Risk Assessment
- `Input` height change `h-10 → h-11` affects the few places already using `<Input>`. Grep `<Input` / `<Textarea` usage first; audit says they're effectively unused, so impact minimal. Confirm with grep before editing.

## Next Steps
- Unblocks Phases 03–06.
