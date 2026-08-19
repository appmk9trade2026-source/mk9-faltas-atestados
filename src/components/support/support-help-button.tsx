import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { useSupport, SupportContextData } from "./support-provider";
import { cn } from "@/lib/utils";

interface SupportHelpButtonProps {
  context?: Partial<SupportContextData>;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
}

export function SupportHelpButton({ 
  context, 
  variant = "outline", 
  size = "sm", 
  className,
  label = "Preciso de ajuda"
}: SupportHelpButtonProps) {
  const { openSupport } = useSupport();

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2 text-[11px] font-bold uppercase tracking-wider", className)}
      onClick={() => openSupport(context || {})}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
