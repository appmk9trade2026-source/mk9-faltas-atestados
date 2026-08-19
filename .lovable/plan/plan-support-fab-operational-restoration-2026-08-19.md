# Plan - Support FAB Operational Restoration

Restoration of the Support FAB functionality and visibility by adding permanent labels and fixing click behavior.

## User Review Required

> [!IMPORTANT]
> The Support FAB will now display "[icon] Suporte" permanently to improve discoverability. On mobile, it will also show the label unless space constraints on specific screens require a more compact version, but the goal is "clarity over decoration".

## Proposed Changes

### Support Component

#### [src/components/support/support-fab.tsx]
- Update the FAB trigger to a pill shape containing both the `MessageSquare` icon and "Suporte" text.
- Ensure the `Button` correctly serves as the trigger for `Popover` (desktop) and `Drawer` (mobile).
- Fix click issues by ensuring `asChild` usage is correct and no overlapping elements intercept pointer events.
- Maintain the unread badge position relative to the icon.
- Adjust responsive sizing for mobile (compact vs full label).

## Technical Details

- **Visual Style**: `bg-primary`, `text-white`, `rounded-full`, `shadow-2xl`.
- **Layout**: `flex items-center gap-2 px-4 h-12` (adjusted for pill shape).
- **Functionality**: Re-link `PopoverTrigger` to the single button.
- **Contextual Support**: Keep the logic that injects "Reportar problema desta tela" based on `isOperationalRoute`.
- **Badge**: Keep `unreadCount` badge logic.

## Verification Plan

### Automated Tests
- Run `tsgo` to ensure no regression in types.
- Check build output.

### Manual Verification
1. Open preview.
2. Verify FAB visual: `[💬] Suporte`.
3. Click the label and the icon: both must open the menu.
4. Verify "Abrir chamado", "Meus chamados", and "Base de Conhecimento" redirects/drawers.
5. Navigate to `/ausencias` and verify "Reportar problema desta tela" appears in the menu.
6. Verify mobile view (compact circular or small pill).
