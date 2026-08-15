// Bloco único "Dados do Colaborador" — usado pelo modo AUTOMATICO (somente leitura,
// hidratado pelo colaborador encontrado) e pelo modo MANUAL (mesmos campos, editáveis).
// Não duplicar labels, ordem, ícones ou espaçamentos: esta é a única fonte de verdade.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  Mail,
  MessageSquare,
  Phone,
  User as UserIcon,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTelefone as formatPhoneBR } from "@/lib/br-format";

export type ModoDados = "AUTOMATICO" | "MANUAL";

export interface ColabResumo {
  email?: string | null;
  nome_completo?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  supervisor_nome?: string | null;
  supervisor_telefone?: string | null;
  empresa?: { nome: string } | null;
  projeto?: { nome: string } | null;
}

interface OpcaoSelect {
  id: string;
  nome: string;
}

/** Casca comum: label + ícone + obrigatoriedade + hint + erro. */
function FieldShell({
  label,
  icon: Icon,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label} {required && <span className="text-red-500" aria-hidden="false">*</span>}
      </Label>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function ReadonlyField({
  label,
  icon,
  value,
  placeholder,
  required,
  hint,
  href,
  external,
}: {
  label: string;
  icon?: LucideIcon;
  value: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  href?: string;
  external?: boolean;
}) {
  return (
    <FieldShell label={label} icon={icon} required={required} hint={hint}>
      {value && href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="block"
        >
          <Input
            readOnly
            value={value}
            placeholder={placeholder}
            className="cursor-pointer bg-muted/40 hover:bg-muted/60"
          />
        </a>
      ) : (
        <Input readOnly value={value} placeholder={placeholder} className="bg-muted/40" />
      )}
    </FieldShell>
  );
}

export interface SupervisorOpcao {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
}

export interface DadosColaboradorFieldsProps {
  modo: ModoDados;
  colaboradorEncontrado: ColabResumo | null;
  /** Campo de matrícula (busca assistida) — ocupa a 2ª coluna em ambos os modos. */
  matriculaSlot: ReactNode;
  /** Faixa/aviso opcional renderizado logo após a matrícula. */
  avisoSlot?: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  empresasDisponiveis?: OpcaoSelect[];
  projetosDisponiveis?: OpcaoSelect[];
  /**
   * Quando informado, o campo Supervisor vira uma lista fechada com apenas os
   * supervisores permitidos ao usuário (ex.: equipe do Coordenador).
   * O nome/telefone continuam sendo persistidos como snapshot.
   */
  supervisoresDisponiveis?: SupervisorOpcao[];
  usarSelectSupervisor?: boolean;
}

export function DadosColaboradorFields({
  modo,
  colaboradorEncontrado: colab,
  matriculaSlot,
  avisoSlot,
  form,
  empresasDisponiveis = [],
  projetosDisponiveis = [],
  supervisoresDisponiveis = [],
  usarSelectSupervisor = false,
}: DadosColaboradorFieldsProps) {
  const manual = modo === "MANUAL";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors = form.formState.errors as Record<string, any>;
  const err = (name: string) => errors?.[name]?.message as string | undefined;

  const empresaId = (form.watch("empresa_id") as string) || "";
  const projetoId = (form.watch("projeto_id") as string) || "";
  const supervisorUsuarioId = (form.watch("manual_supervisor_usuario_id") as string) || "";


  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* 1. E-mail */}
      {manual ? (
        <FieldShell label="E-mail" icon={Mail} error={err("manual_email")}>
          <Input
            type="email"
            maxLength={150}
            placeholder="colaborador@empresa.com"
            {...form.register("manual_email")}
          />
        </FieldShell>
      ) : (
        <ReadonlyField
          label="E-mail"
          icon={Mail}
          value={colab?.email ?? ""}
          placeholder="colaborador@empresa.com"
          href={colab?.email ? `mailto:${colab.email}` : undefined}
        />
      )}

      {/* 2. Matrícula */}
      {matriculaSlot}

      {/* Faixa informativa (colaborador não localizado / badge manual) */}
      {avisoSlot}

      {/* 3. Nome Completo */}
      {manual ? (
        <FieldShell label="Nome Completo" icon={UserIcon} required error={err("manual_nome")}>
          <Input
            maxLength={150}
            placeholder="Nome completo do colaborador"
            {...form.register("manual_nome", {
              onChange: (e) => {
                // Log de depuração para validar sincronização imediata
                const val = e.target.value;
                if (process.env.NODE_ENV === "development") {
                  console.log("onChange manual_nome:", {
                    length: val.length,
                    present: val.trim().length > 0
                  });
                }
              }
            })}
          />
        </FieldShell>
      ) : (
        <ReadonlyField
          label="Nome Completo"
          required
          icon={UserIcon}
          value={colab?.nome_completo ?? ""}
          placeholder="Nome completo do colaborador"
        />
      )}

      {/* 4. Telefone do Colaborador */}
      {manual ? (
        <FieldShell
          label="Telefone do Colaborador"
          icon={Phone}
          required
          error={err("manual_telefone")}
        >
          <Input maxLength={20} placeholder="(XX) XXXXX-XXXX" {...form.register("manual_telefone")} />
        </FieldShell>
      ) : (
        <ReadonlyField
          label="Telefone do Colaborador"
          required
          icon={Phone}
          value={colab?.telefone ? formatPhoneBR(colab.telefone) : ""}
          placeholder="(XX) XXXXX-XXXX"
          href={colab?.telefone ? `tel:+55${colab.telefone}` : undefined}
        />
      )}

      {/* 5. WhatsApp Alternativo */}
      {manual ? (
        <FieldShell
          label="WhatsApp Alternativo"
          icon={MessageSquare}
          hint="Opcional — para contato adicional"
          error={err("manual_whatsapp")}
        >
          <Input maxLength={20} placeholder="(XX) XXXXX-XXXX" {...form.register("manual_whatsapp")} />
        </FieldShell>
      ) : (
        <ReadonlyField
          label="WhatsApp Alternativo"
          icon={MessageSquare}
          hint="Opcional — para contato adicional"
          value={colab?.whatsapp ? formatPhoneBR(colab.whatsapp) : ""}
          placeholder="(XX) XXXXX-XXXX"
          href={colab?.whatsapp ? `https://wa.me/55${colab.whatsapp}` : undefined}
          external
        />
      )}

      {/* 6. Empresa */}
      {manual ? (
        <FieldShell label="Empresa" icon={Building2} required error={err("empresa_id")}>
          <Select
            value={empresaId || undefined}
            onValueChange={(v) => {
              form.setValue("empresa_id", v, { shouldValidate: true });
              form.setValue("projeto_id", "", { shouldValidate: true });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {empresasDisponiveis
                .filter((e) => e.id)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FieldShell>
      ) : (
        <ReadonlyField
          label="Empresa"
          required
          icon={Building2}
          value={colab?.empresa?.nome ?? ""}
          placeholder="Selecione..."
        />
      )}

      {/* 7. Supervisor(a) */}
      {manual && usarSelectSupervisor ? (
        <FieldShell
          label="Supervisor(a)"
          icon={UserIcon}
          required
          hint="Apenas supervisores da sua coordenação"
          error={err("manual_supervisor_usuario_id") ?? err("manual_supervisor_nome")}
        >
          <Select
            value={supervisorUsuarioId || undefined}
            onValueChange={(v) => {
              const sup = supervisoresDisponiveis.find((s) => s.id === v);
              form.setValue("manual_supervisor_usuario_id", v, { shouldValidate: true });
              form.setValue("manual_supervisor_nome", sup?.nome ?? "", { shouldValidate: true });
              if (sup?.telefone) {
                form.setValue("manual_supervisor_telefone", sup.telefone, { shouldValidate: true });
              }
            }}
            disabled={!projetoId}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={projetoId ? "Selecione o supervisor..." : "Escolha o projeto primeiro"}
              />
            </SelectTrigger>
            <SelectContent>
              {supervisoresDisponiveis
                .filter((s) => s.id)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FieldShell>
      ) : manual ? (
        <FieldShell
          label="Supervisor(a)"
          icon={UserIcon}
          required
          error={err("manual_supervisor_nome")}
        >
          <Input
            maxLength={150}
            placeholder="Nome do supervisor(a)"
            {...form.register("manual_supervisor_nome")}
          />
        </FieldShell>
      ) : (

        <ReadonlyField
          label="Supervisor(a)"
          required
          icon={UserIcon}
          value={colab?.supervisor_nome ?? ""}
          placeholder="Selecione..."
        />
      )}

      {/* 8. Telefone do Supervisor */}
      {manual ? (
        <FieldShell
          label="Telefone do Supervisor"
          icon={Phone}
          required
          error={err("manual_supervisor_telefone")}
        >
          <Input
            maxLength={20}
            placeholder="(XX) XXXXX-XXXX"
            {...form.register("manual_supervisor_telefone")}
          />
        </FieldShell>
      ) : (
        <ReadonlyField
          label="Telefone do Supervisor"
          required
          icon={Phone}
          value={colab?.supervisor_telefone ? formatPhoneBR(colab.supervisor_telefone) : ""}
          placeholder="(XX) XXXXX-XXXX"
          href={colab?.supervisor_telefone ? `tel:+55${colab.supervisor_telefone}` : undefined}
        />
      )}

      {/* 9. Projeto */}
      {manual ? (
        <FieldShell label="Projeto" icon={ClipboardList} required error={err("projeto_id")}>
          <Select
            value={projetoId || undefined}
            onValueChange={(v) => form.setValue("projeto_id", v, { shouldValidate: true })}
            disabled={!empresaId}
          >
            <SelectTrigger>
              <SelectValue placeholder={empresaId ? "Selecione..." : "Escolha a empresa primeiro"} />
            </SelectTrigger>
            <SelectContent>
              {projetosDisponiveis
                .filter((p) => p.id)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FieldShell>
      ) : (
        <ReadonlyField
          label="Projeto"
          required
          icon={ClipboardList}
          value={colab?.projeto?.nome ?? ""}
          placeholder="Selecione..."
        />
      )}
    </div>
  );
}
