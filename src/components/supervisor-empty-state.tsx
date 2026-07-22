import { UserRoundX } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Estado vazio padronizado para Supervisor sem colaboradores vinculados.
 *
 * A regra oficial (Fase 1) é `colaboradores.supervisor_usuario_id = auth.uid()`.
 * Enquanto não houver vínculo administrativo, o Supervisor não enxerga nenhum
 * registro derivado (ausências, alertas, comunicações, histórico etc.).
 *
 * Uso:
 *   const scope = useSessionScope();
 *   if (scope.isSupervisorOnly && !dados.length) return <SupervisorEmptyState />;
 */
export function SupervisorEmptyState({
  title = "Nenhum colaborador vinculado ao seu usuário",
  description = "Nenhum colaborador está vinculado ao seu usuário. Solicite ao RH ou Super Admin a atribuição administrativa.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <UserRoundX className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}
