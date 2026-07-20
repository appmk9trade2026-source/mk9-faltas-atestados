import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/components/command-palette/command-palette";

export function CommandPaletteButton() {
  const { setOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className="h-8 gap-2 px-2 text-muted-foreground hover:text-foreground"
      aria-label="Abrir busca (Ctrl+K)"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline text-xs">Buscar...</span>
      <kbd className="hidden md:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </Button>
  );
}
