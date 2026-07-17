import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/layout/app-shell";

export function PlaceholderPage({
  title,
  description,
  breadcrumb,
}: {
  title: string;
  description?: string;
  breadcrumb?: string[];
}) {
  return (
    <AppShell title={title} breadcrumb={breadcrumb ?? [title]}>
      {description && <p className="text-sm text-muted-foreground -mt-4">{description}</p>}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-medium">Módulo em construção</p>
            <p className="text-sm text-muted-foreground max-w-md mt-1">
              Este módulo faz parte das próximas etapas do CRM MK9. A estrutura visual já está pronta;
              as funcionalidades chegarão em breve.
            </p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
