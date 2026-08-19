# Plan: Support FAB Visual Upgrade (Professional Avatar)

Improve the visual presentation of the global Support FAB by replacing the simple chat icon with a professional digital assistant avatar for "Suporte MK9".

## User Review Required

> [!IMPORTANT]
> The new avatar is a stylized digital assistant mascot (minimalist robot/headset icon) following the MK9 Design System. No actual person's photo is used.

- **Visual Style**: Circular avatar with modern, amigável technology mascot.
- **Micro-interactions**: Subtle hover expansion/tooltip and a discrete "pulse" animation when unread messages exist.
- **Contextual Awareness**: Preserves the "Report problem of this screen" logic for operational modules.

## Technical Details

### Frontend Changes

- **New Component**: `src/components/support/support-avatar.tsx`
  - SVG-based stylized mascot with MK9 primary blue gradient.
  - Optional "Online" indicator (green dot).
- **FAB Refactoring**: `src/components/support/support-fab.tsx`
  - Replace `MessageSquare` icon with `SupportAvatar`.
  - Add `Tooltip` for desktop hover state ("Suporte MK9").
  - Add `animate-pulse` conditionally when `unreadCount > 0` (discrete).
  - Ensure Z-index and safe-area compatibility are maintained.

### Backend Changes

- None. Logic for unread counts, RBAC, and RLS is preserved.

## Verification Plan

### Automated Tests
- Run `tsgo` to ensure component types are correct.
- Verify production build.

### Manual Verification
- **Desktop**: Check hover tooltip and avatar rendering.
- **Mobile**: Check compact circular avatar and Bottom Sheet trigger.
- **Badge**: Send a mock notification (or check existing ones) to verify unread badge positioning over the avatar.
- **Context**: Navigate to `/ausencias` and verify "Reportar problema desta tela" still appears in the menu.
