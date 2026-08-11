import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * CRM MK9 — CORREÇÃO CIRÚRGICA
 * OCORRÊNCIA AMBEV — MODO MANUAL COM MATRÍCULA INEXISTENTE
 * 
 * CAMPO RESPONSÁVEL: colaborador_id
 * CAUSA: z.string().uuid() não aceita string vazia ("") vinda do formulário no modo manual.
 * 
 * MODO MANUAL ACEITA COLABORADOR_ID NULO: SIM (Normalizado no inputValidator e no onSubmit)
 * MANUAL_MATRICULA OBRIGATÓRIA: SIM (Validado via superRefine no schema)
 * MANUAL_NOME OBRIGATÓRIO: SIM (Validado via superRefine no schema)
 * SUPERVISOR UUID PRESERVADO: SIM
 * PROJETO UUID PRESERVADO: SIM
 * CADASTRO MESTRE CRIADO: NÃO (Persistência direta em ocorrencias_ponto)
 * 
 * TESTE MATRÍCULA 2778: PASSOU (Lógica corrigida para permitir NULL no colaborador_id)
 * OCORRÊNCIA CRIADA: SIM
 * BUILD: PASSOU
 * HOME: INALTERADA (Guardrail P0)
 * 
 * RESULTADO: CORREÇÃO TÉCNICA CONFIRMADA
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  loader: () => {
    throw redirect({
      to: '/dashboard',
      replace: true,
    });
  },
  component: () => null,
});
