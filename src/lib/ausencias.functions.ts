// ============================================================================
// CRM MK9 — PATCH CONSOLIDADO
// ============================================================================
//
// ARQUIVOS:
// 1) src/lib/ausencias.functions.ts
// 2) src/routes/_authenticated/nova-ausencia.tsx
//
// OBJETIVOS:
// - corrigir atualizado_em -> updated_at
// - impedir falso sucesso de UPDATE com zero linhas
// - garantir edição somente de PENDENTE
// - corrigir legal_confirmacao invisível na edição
// - eliminar submit silencioso
// - preservar hardening de Storage/anexo
// - preservar idempotência / auditoria
// - evitar erros técnicos brutos na UI
//
// ============================================================================


// ============================================================================
// ARQUIVO 1
// src/lib/ausencias.functions.ts
// ============================================================================


// ---------------------------------------------------------------------------
// A) ADICIONE PRÓXIMO AOS HELPERS DO TOPO
// ---------------------------------------------------------------------------

const ATESTADOS_BUCKET = "atestados";

function normalizeStoragePath(value?: string | null): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return raw
      .replace(/^\/+/, "")
      .replace(/^atestados\//, "");
  }

  try {
    const url = new URL(raw);
    const pathname = decodeURIComponent(url.pathname);

    const markers = [
      `/storage/v1/object/public/${ATESTADOS_BUCKET}/`,
      `/storage/v1/object/sign/${ATESTADOS_BUCKET}/`,
      `/storage/v1/object/${ATESTADOS_BUCKET}/`,
    ];

    for (const marker of markers) {
      const idx = pathname.indexOf(marker);

      if (idx >= 0) {
        return pathname
          .slice(idx + marker.length)
          .replace(/^\/+/, "");
      }
    }
  } catch {
    // URL inválida não deve quebrar a operação principal.
  }

  return null;
}


async function cleanupOrphanAttachment(
  arquivoUrl: string | null | undefined,
  correlationId: string,
) {
  const storagePath = normalizeStoragePath(arquivoUrl);

  if (!storagePath) {
    console.warn("[ORPHAN-CLEANUP] Path ausente/inválido", {
      correlation_id: correlationId,
    });
    return;
  }

  try {
    const { error } = await supabaseAdmin.storage
      .from(ATESTADOS_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error("[ORPHAN-CLEANUP] Falha ao remover objeto", {
        correlation_id: correlationId,
        storage_path: storagePath,
        message: error.message,
      });

      return;
    }

    console.info("[ORPHAN-CLEANUP] Objeto removido", {
      correlation_id: correlationId,
      storage_path: storagePath,
    });
  } catch (error) {
    console.error("[ORPHAN-CLEANUP] Exceção", {
      correlation_id: correlationId,
      storage_path: storagePath,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}


function technicalError(
  correlationId?: string,
  safeMessage = "Não foi possível concluir a operação.",
) {
  const ref =
    correlationId ||
    crypto.randomUUID();

  return new Error(
    `TECHNICAL_ERROR: ${safeMessage} Código de suporte: ${ref}`,
  );
}


// ---------------------------------------------------------------------------
// B) ausenciaDbError
//
// SUBSTITUA A FUNÇÃO EXISTENTE POR ESTA
// ---------------------------------------------------------------------------

function ausenciaDbError(
  err: unknown,
  etapa:
    | "insert_ausencia"
    | "rpc_manual"
    | "update_ausencia"
    | "delete_ausencia"
    | "status_ausencia",
  correlationId?: string,
): Error {
  const e = (err ?? {}) as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };

  const msg =
    (e.message ?? String(err)) || "";

  const sqlstate =
    e.code ?? "";

  console.error(
    "[ausencias] falha de banco",
    JSON.stringify({
      etapa,
      correlation_id:
        correlationId ?? null,
      sqlstate:
        sqlstate || null,
      message: msg,
      details:
        e.details ?? null,
      hint:
        e.hint ?? null,
    }),
  );

  if (/SUPERVISOR_FORA_DA_COORDENACAO/i.test(msg)) {
    return new Error(
      "PROJECT_SCOPE_DENIED: O Supervisor selecionado não pertence à sua coordenação.",
    );
  }

  if (/SUPERVISOR_OBRIGATORIO/i.test(msg)) {
    return new Error(
      "INVALID_PAYLOAD: Selecione o Supervisor responsável pelo colaborador.",
    );
  }

  if (/COLABORADOR_FORA_DO_SUPERVISOR/i.test(msg)) {
    return new Error(
      "COLLABORATOR_SCOPE_DENIED: Este colaborador existe, mas não pertence ao seu escopo atual.",
    );
  }

  if (
    /PROJETO_FORA_DO_ESCOPO|Projeto fora do seu escopo/i.test(
      msg,
    )
  ) {
    return new Error(
      "PROJECT_SCOPE_DENIED: O projeto selecionado não pertence ao seu escopo.",
    );
  }

  if (
    sqlstate === "42501" ||
    /row-level security|permission denied|not authorized/i.test(
      msg,
    )
  ) {
    return new Error(
      "PROJECT_SCOPE_DENIED: Este colaborador ou projeto não está disponível no seu escopo de acesso.",
    );
  }

  if (
    /já está vinculada a outro projeto/i.test(msg) ||
    /já está vinculada a outro supervisor/i.test(msg)
  ) {
    return new Error(
      `CONFLICT: ${msg.slice(0, 240)}`,
    );
  }

  if (
    /fora do seu escopo|não pertence à empresa informada|não está vinculado a você/i.test(
      msg,
    )
  ) {
    return new Error(
      "PROJECT_SCOPE_DENIED: Acesso negado por política de escopo.",
    );
  }

  if (
    sqlstate === "23505" ||
    /DUPLICIDADE_AUSENCIA/i.test(msg)
  ) {
    if (etapa === "rpc_manual") {
      return new Error(
        "CONFLICT: BLOQUEIO DE SEGURANÇA — Esta matrícula já possui um registro ativo no sistema. Verifique o histórico ou utilize a busca automática.",
      );
    }

    const limpa = msg
      .replace(
        /^.*DUPLICIDADE_AUSENCIA:\s*/s,
        "",
      )
      .trim();

    return new Error(
      `CONFLICT: ${
        limpa ||
        "Já existe uma ausência ativa para este colaborador neste período."
      }`,
    );
  }

  if (/PROJETO_SEM_CODIGO_PROTOCOLO/i.test(msg)) {
    return new Error(
      "CONFLICT: O projeto não possui código de protocolo configurado. Cadastre o código do projeto antes de lançar.",
    );
  }

  if (/PROTOCOLO_NAO_PODE_SER_INFORMADO/i.test(msg)) {
    return new Error(
      "INVALID_PAYLOAD: o protocolo é gerado pelo sistema e não pode ser informado.",
    );
  }

  if (
    sqlstate === "23514" ||
    sqlstate === "23503" ||
    sqlstate === "23502" ||
    sqlstate === "22P02"
  ) {
    return new Error(
      "INVALID_PAYLOAD: Os dados enviados não atendem às regras do lançamento.",
    );
  }

  if (
    /is not unique|ambiguous|could not identify/i.test(
      msg,
    )
  ) {
    return technicalError(
      correlationId,
      "O serviço de auditoria apresentou uma inconsistência temporária.",
    );
  }

  return technicalError(
    correlationId,
  );
}


// ---------------------------------------------------------------------------
// C) IDEMPOTÊNCIA createAusencia
//
// LOCALIZE:
// .eq("acao", "AUSENCIA_CRIADA_POR_SUPERVISOR")
//
// TROQUE POR:
// ---------------------------------------------------------------------------

.eq("acao", "AUSENCIA_CRIADA")


// Depois da consulta, acrescente tratamento do erro:

if (findErr) {
  console.warn(
    "[IDEMPOTENCY] Falha ao consultar replay",
    {
      correlation_id: correlationId,
      message: findErr.message,
    },
  );
}


// No retorno ALREADY_COMMITTED garanta correlation_id:

return {
  id:
    original?.id ||
    existing.registro_id,

  protocolo:
    original?.protocolo ?? null,

  colaborador_id:
    original?.colaborador_id ?? null,

  colaborador_criado: false,

  code:
    "ALREADY_COMMITTED",

  correlation_id:
    correlationId,

  message:
    "Lançamento confirmado. O registro já havia sido processado com sucesso.",
};


// ---------------------------------------------------------------------------
// D) checkConflitosSeguro DENTRO DE createAusencia
//
// TROQUE:
// data_fim: data.data_inicio
//
// POR:
// ---------------------------------------------------------------------------

const conflitos =
  await checkConflitosSeguro(
    context.supabase,
    {
      colaborador_id:
        isManual
          ? undefined
          : data.colaborador_id,

      data_inicio:
        insertPayload.data_inicio,

      data_fim:
        insertPayload.data_fim,

      tipo:
        tipoBase,

      origem_registro:
        isManual
          ? "MANUAL"
          : "AUTOMATICO",

      manual_matricula:
        isManual
          ? (data as any)
              .manual_matricula ||
            undefined
          : undefined,

      empresa_id:
        gate.empresaId ||
        undefined,
    },
  );


// ---------------------------------------------------------------------------
// E) CONTRATO RPC MANUAL
//
// SUBSTITUA O PARSE DO RETORNO DA RPC POR:
// ---------------------------------------------------------------------------

const out =
  (res ?? {}) as {
    colaborador_id?: string;
    colaborador_criado?: boolean;

    // contrato atual
    ausencia_id?: string;

    // compatibilidade temporária
    id?: string;

    protocolo?: string | null;
  };

const resolvedAusenciaId =
  out.ausencia_id ??
  out.id;

if (!resolvedAusenciaId) {
  console.error(
    "[RPC-CONTRACT] ID da ausência ausente",
    {
      correlation_id:
        gate.correlationId,

      received_keys:
        res &&
        typeof res === "object"
          ? Object.keys(
              res as Record<
                string,
                unknown
              >,
            )
          : [],
    },
  );

  throw technicalError(
    gate.correlationId,
    "O servidor retornou uma resposta incompleta ao registrar a ausência.",
  );
}

rowId =
  resolvedAusenciaId;

protocolo =
  out.protocolo ?? null;

colaboradorId =
  out.colaborador_id ?? null;

colaboradorCriado =
  Boolean(
    out.colaborador_criado,
  );


// ---------------------------------------------------------------------------
// F) CATCH FINAL DE createAusencia
// ---------------------------------------------------------------------------

} catch (err: any) {
  if (data.arquivo_url) {
    await cleanupOrphanAttachment(
      data.arquivo_url,
      traceId,
    );
  }

  if (
    err instanceof Error &&
    (
      err.message.includes("CONFLICT") ||
      err.message.includes("INVALID_PAYLOAD") ||
      err.message.includes("PROJECT_SCOPE_DENIED") ||
      err.message.includes("COLLABORATOR_SCOPE_DENIED") ||
      err.message.includes("FORBIDDEN") ||
      err.message.includes("RESOURCE_NOT_FOUND")
    )
  ) {
    throw err;
  }

  const { logAppError } =
    await import(
      "./observability.server"
    );

  await logAppError(
    {
      traceId,
      userId:
        context.userId,
      module:
        "ausencias",
      operation:
        "createAusencia",
      category:
        "UNKNOWN",
      severity:
        "P1",
    },
    err,
  );

  throw technicalError(
    traceId,
  );
}


// ============================================================================
// G) updateAusencia — SUBSTITUIR A FUNÇÃO INTEIRA
// ============================================================================

export const updateAusencia =
  createServerFn({
    method: "POST",
  })
    .middleware([
      requireSupabaseAuth,
    ])
    .inputValidator(
      (data: unknown) => {
        try {
          return updatePayloadSchema.parse(
            data,
          );
        } catch (e) {
          throw toInvalidPayload(
            e,
          );
        }
      },
    )
    .handler(
      async ({
        data,
        context,
      }) => {
        const isManual =
          data.origem_registro ===
          "MANUAL";

        const request =
          getRequest();

        const meta =
          resolveOperationMetadata(
            request,
          );

        // ----------------------------------------------------
        // Registro atual
        // ----------------------------------------------------

        const {
          data: current,
          error: loadErr,
        } =
          await context.supabase
            .from("ausencias")
            .select(
              [
                "id",
                "empresa_id",
                "projeto_id",
                "colaborador_id",
                "origem_registro",
                "status",
                "tipo",
                "tipo_detalhe",
                "dias",
                "motivo",
                "cid",
                "data_inicio",
                "data_fim",
                "localidade",
                "loja_codigo_nome",
                "acidente_trabalho_trajeto",
                "arquivo_url",
                "arquivo_nome",
                "arquivo_mime",
                "arquivo_tamanho",
                "hash_integridade",
              ].join(","),
            )
            .eq(
              "id",
              data.id,
            )
            .maybeSingle();

        if (loadErr) {
          throw technicalError(
            undefined,
            "Não foi possível carregar o registro para edição.",
          );
        }

        if (!current) {
          throw new Error(
            "RESOURCE_NOT_FOUND: ausência não encontrada",
          );
        }

        // Regra canônica:
        // edição direta apenas enquanto PENDENTE.
        if (
          current.status !==
          "PENDENTE"
        ) {
          throw new Error(
            `CONFLICT: Este registro está com status ${current.status} e não está disponível para edição direta.`,
          );
        }

        // Origem é imutável.
        if (
          (
            current.origem_registro ??
            "AUTOMATICO"
          ) !==
          data.origem_registro
        ) {
          throw new Error(
            "INVALID_PAYLOAD: a origem do registro não pode ser alterada",
          );
        }

        // Colaborador não pode ser trocado em registro automático.
        if (
          !isManual &&
          data.colaborador_id !==
            current.colaborador_id
        ) {
          throw new Error(
            "INVALID_PAYLOAD: colaborador não pode ser alterado após criação",
          );
        }

        // Empresa/projeto são imutáveis para manual.
        if (
          isManual &&
          (
            data.projeto_id !==
              current.projeto_id ||
            data.empresa_id !==
              current.empresa_id
          )
        ) {
          throw new Error(
            "INVALID_PAYLOAD: empresa/projeto não podem ser alterados após criação",
          );
        }

        // ----------------------------------------------------
        // Permission gate
        // ----------------------------------------------------

        const gate =
          await requirePermission({
            ctx: context,

            permission:
              PERMISSION_MAP.updateAbsence,

            colaboradorId:
              isManual
                ? null
                : (
                    current.colaborador_id as string
                  ),

            projetoId:
              isManual
                ? (
                    current.projeto_id as string
                  )
                : null,

            route:
              "/nova-ausencia",
          });

        // ----------------------------------------------------
        // Snapshot tipo/período
        // ----------------------------------------------------

        const [
          tipoRes,
          opcaoRes,
        ] =
          await Promise.all([
            context.supabase
              .from(
                "tipos_ausencia" as never,
              )
              .select(
                "codigo, nome, ativo",
              )
              .eq(
                "id",
                data.tipo_ausencia_id,
              )
              .maybeSingle(),

            context.supabase
              .from(
                "opcoes_periodo_ausencia" as never,
              )
              .select(
                "codigo, nome, quantidade_dias",
              )
              .eq(
                "id",
                data.opcao_periodo_id,
              )
              .maybeSingle(),
          ]);

        const tipo =
          tipoRes.data as {
            codigo: string;
            nome: string;
            ativo: boolean;
          } | null;

        const opcao =
          opcaoRes.data as {
            codigo: string;
            nome: string;
            quantidade_dias:
              | number
              | null;
          } | null;

        if (!tipo?.ativo) {
          throw new Error(
            "INVALID_PAYLOAD: tipo inválido",
          );
        }

        if (!opcao) {
          throw new Error(
            "INVALID_PAYLOAD: opção de período inválida",
          );
        }

        // ----------------------------------------------------
        // Datas
        // ----------------------------------------------------

        const dias =
          opcao.quantidade_dias ??
          1;

        const dataFim =
          new Date(
            data.data_inicio +
              "T00:00:00",
          );

        dataFim.setDate(
          dataFim.getDate() +
            Math.max(
              dias - 1,
              0,
            ),
        );

        const tipoBase =
          tipo.codigo.startsWith(
            "ATESTADO",
          )
            ? "ATESTADO"
            : tipo.codigo.startsWith(
                  "DECLARACAO",
                )
              ? "DECLARACAO"
              : tipo.codigo.startsWith(
                    "FALTA",
                  )
                ? "FALTA"
                : tipo.codigo.startsWith(
                      "SUSPENSAO",
                    )
                  ? "SUSPENSAO"
                  : "OUTROS";

        // ----------------------------------------------------
        // Acidente
        // ----------------------------------------------------

        const isAcidenteU =
          tipo.codigo ===
          "ACIDENTE_TRABALHO";

        if (isAcidenteU) {
          if (
            !data.acidente_data ||
            !data.acidente_hora ||
            !data.acidente_local?.trim() ||
            !data.acidente_descricao?.trim()
          ) {
            throw new Error(
              "INVALID_PAYLOAD: Acidente exige data, hora, local e descrição",
            );
          }
        }

        // ----------------------------------------------------
        // Dados manuais
        // ----------------------------------------------------

        const manualUpdate =
          isManual
            ? (() => {
                const {
                  manual_registrado_por:
                    _p,
                  manual_registrado_em:
                    _e,
                  ...rest
                } =
                  manualColumns(
                    data,
                    gate.userId,
                  );

                return rest;
              })()
            : {};

        // ----------------------------------------------------
        // PAYLOAD
        //
        // CRÍTICO:
        // usa updated_at, NÃO atualizado_em.
        // ----------------------------------------------------

        const updatePayload = {
          ...manualUpdate,

          tipo:
            tipoBase,

          tipo_detalhe:
            tipo.nome,

          dias_label:
            opcao.nome,

          tipo_ausencia_id:
            data.tipo_ausencia_id,

          opcao_periodo_id:
            data.opcao_periodo_id,

          motivo:
            data.motivo,

          data_inicio:
            data.data_inicio,

          data_fim:
            dataFim
              .toISOString()
              .slice(
                0,
                10,
              ),

          localidade:
            data.localidade,

          loja_codigo_nome:
            data.loja_codigo_nome,

          cid:
            data.cid &&
            data.cid.trim()
              ? data.cid
                  .trim()
                  .toUpperCase()
              : null,

          acidente_trabalho_trajeto:
            data.acidente_trabalho_trajeto,

          horario_inicio:
            data.horario_inicio ??
            null,

          horario_fim:
            data.horario_fim ??
            null,

          arquivo_url:
            data.arquivo_url ??
            current.arquivo_url,

          arquivo_nome:
            data.arquivo_nome ??
            current.arquivo_nome,

          arquivo_mime:
            data.arquivo_mime ??
            current.arquivo_mime,

          arquivo_tamanho:
            data.arquivo_tamanho ??
            current.arquivo_tamanho,

          atualizado_por_usuario_id:
            context.userId,

          // ==================================================
          // CORREÇÃO DO INCIDENTE
          // ==================================================
          updated_at:
            new Date().toISOString(),

          operacao_origem:
            "WEB",

          operacao_ip:
            meta.ip,

          operacao_user_agent:
            meta.userAgent,

          operacao_sistema_operacional:
            meta.os,

          operacao_navegador:
            meta.browser,

          operacao_dispositivo_tipo:
            meta.deviceType,

          operacao_timestamp_utc:
            new Date().toISOString(),

          ...(isAcidenteU
            ? {
                acidente_data:
                  data.acidente_data,

                acidente_hora:
                  data.acidente_hora,

                acidente_local:
                  data.acidente_local?.trim() ??
                  null,

                acidente_descricao:
                  data.acidente_descricao?.trim() ??
                  null,

                acidente_atendimento_medico:
                  data.acidente_atendimento_medico ??
                  null,

                acidente_houve_afastamento:
                  data.acidente_houve_afastamento ??
                  null,

                acidente_dias_afastamento_inicial:
                  data.acidente_dias_afastamento_inicial !=
                  null
                    ? parseInt(
                        String(
                          data.acidente_dias_afastamento_inicial,
                        ),
                      ) || 0
                    : null,

                acidente_cat_emitida:
                  data.acidente_cat_emitida ??
                  null,

                acidente_observacoes:
                  data.acidente_observacoes?.trim() ??
                  null,
              }
            : {}),
        };

        // ----------------------------------------------------
        // Integridade
        // ----------------------------------------------------

        const newHash =
          calculateIntegrityHash(
            updatePayload,
            current.hash_integridade,
          );

        (
          updatePayload as any
        ).hash_integridade =
          newHash;

        (
          updatePayload as any
        ).hash_atual =
          newHash;

        (
          updatePayload as any
        ).hash_anterior =
          current.hash_integridade;

        // ----------------------------------------------------
        // Field audit
        // ----------------------------------------------------

        const fieldsToAudit = [
          "tipo_ausencia_id",
          "opcao_periodo_id",
          "motivo",
          "data_inicio",
          "data_fim",
          "localidade",
          "loja_codigo_nome",
          "cid",
          "acidente_trabalho_trajeto",
          "horario_inicio",
          "horario_fim",
          "arquivo_url",
        ];

        const audits = [];

        const snapshot =
          await getSnapshot(
            context.supabase,
            context.userId,
          );

        for (
          const field of
          fieldsToAudit
        ) {
          const oldVal =
            (
              current as any
            )[field];

          const newVal =
            (
              updatePayload as any
            )[field];

          if (
            oldVal !==
            newVal
          ) {
            audits.push({
              ausencia_id:
                data.id,

              campo:
                field,

              valor_anterior:
                oldVal,

              valor_novo:
                newVal,

              responsavel_usuario_id:
                context.userId,

              responsavel_nome:
                snapshot?.nome,

              responsavel_papel:
                snapshot?.papel,

              correlation_id:
                gate.correlationId,
            });
          }
        }

        if (
          audits.length > 0
        ) {
          const {
            error:
              auditFieldError,
          } =
            await context.supabase
              .from(
                "ausencia_field_audit",
              )
              .insert(
                audits,
              );

          if (
            auditFieldError
          ) {
            console.error(
              "[FIELD-AUDIT] Falha",
              {
                correlation_id:
                  gate.correlationId,

                message:
                  auditFieldError.message,
              },
            );

            throw technicalError(
              gate.correlationId,
              "Não foi possível registrar a auditoria da alteração.",
            );
          }
        }

        // ----------------------------------------------------
        // UPDATE REAL
        //
        // .select().maybeSingle() impede falso sucesso.
        // ----------------------------------------------------

        const {
          data: updated,
          error,
        } =
          await context.supabase
            .from("ausencias")
            .update(
              updatePayload as never,
            )
            .eq(
              "id",
              data.id,
            )
            .eq(
              "status",
              "PENDENTE",
            )
            .select(
              "id, status, updated_at",
            )
            .maybeSingle();

        if (error) {
          throw ausenciaDbError(
            error,
            "update_ausencia",
            gate.correlationId,
          );
        }

        if (!updated) {
          console.warn(
            "[AUSENCIA-UPDATE-NOOP]",
            {
              ausencia_id:
                data.id,

              current_status:
                current.status,

              correlation_id:
                gate.correlationId,
            },
          );

          throw new Error(
            "CONFLICT: Este registro não está mais disponível para edição. Atualize a página e verifique o status atual.",
          );
        }

        // ----------------------------------------------------
        // Auditoria principal
        // ----------------------------------------------------

        await audit(
          context.supabase,
          "AUSENCIA_EDITADA",
          data.id,
          gate.correlationId,

          {
            tipo:
              current.tipo,

            tipo_detalhe:
              current.tipo_detalhe,

            motivo:
              current.motivo,

            cid:
              current.cid,

            data_inicio:
              current.data_inicio,

            data_fim:
              current.data_fim,

            localidade:
              current.localidade,

            loja_codigo_nome:
              current.loja_codigo_nome,

            acidente_trabalho_trajeto:
              current.acidente_trabalho_trajeto,
          },

          {
            tipo:
              tipoBase,

            tipo_detalhe:
              tipo.nome,

            motivo:
              updatePayload.motivo,

            cid:
              updatePayload.cid,

            data_inicio:
              updatePayload.data_inicio,

            data_fim:
              updatePayload.data_fim,

            localidade:
              updatePayload.localidade,

            loja_codigo_nome:
              updatePayload.loja_codigo_nome,

            acidente_trabalho_trajeto:
              updatePayload.acidente_trabalho_trajeto,
          },

          "edição",

          gate.empresaId,
          gate.projetoId,

          context.userId,
        );

        // ----------------------------------------------------
        // Notificação
        // ----------------------------------------------------

        const mudancaRelevante =
          current.data_inicio !==
            updatePayload.data_inicio ||
          current.data_fim !==
            updatePayload.data_fim ||
          current.tipo_detalhe !==
            updatePayload.tipo_detalhe;

        if (
          mudancaRelevante
        ) {
          await enfileirarNotificacoesAusencia(
            {
              supabase:
                context.supabase,

              ausenciaId:
                data.id,

              evento:
                "AUSENCIA_RETIFICADA",

              correlationId:
                gate.correlationId,

              userId:
                gate.userId,
            },
          );
        }

        return {
          ok: true,
          id:
            updated.id,
          status:
            updated.status,
          correlation_id:
            gate.correlationId,
        };
      },
    );


// ---------------------------------------------------------------------------
// H) PROCESSAMENTO — NÃO VAZAR ERRO SQL
// ---------------------------------------------------------------------------

// reatribuirProcessamentoAdm:

if (error) {
  console.error(
    "[PROCESSAMENTO] reatribuição falhou",
    {
      ausencia_id:
        data.ausencia_id,

      code:
        error.code ??
        null,

      message:
        error.message,
    },
  );

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível assumir este processamento.",
  );
}


// iniciarProcessamentoAdm:

if (error) {
  console.error(
    "[PROCESSAMENTO] início falhou",
    {
      ausencia_id:
        data.ausencia_id,

      code:
        error.code ??
        null,

      message:
        error.message,
    },
  );

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível iniciar o processamento.",
  );
}


// concluirProcessamentoAdm:

if (error) {
  console.error(
    "[PROCESSAMENTO] conclusão falhou",
    {
      ausencia_id:
        data.ausencia_id,

      code:
        error.code ??
        null,

      message:
        error.message,
    },
  );

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível concluir o processamento.",
  );
}


// ============================================================================
// ARQUIVO 2
// src/routes/_authenticated/nova-ausencia.tsx
// ============================================================================


// ---------------------------------------------------------------------------
// I) FORM DEFAULT
//
// MANTENHA false PARA NOVO LANÇAMENTO:
// ---------------------------------------------------------------------------

legal_confirmacao:
  false as any,


// ---------------------------------------------------------------------------
// J) PREFILL DE EDIÇÃO
//
// DENTRO DO form.reset({...}) DA EDIÇÃO,
// ADICIONE:
// ---------------------------------------------------------------------------

legal_confirmacao: true,


// Exemplo:
//
// form.reset({
//   modo_manual: ...,
//   colaborador_id: ...,
//   ...
//   acidente_trabalho_trajeto: ...,
//
//   legal_confirmacao: true,
//
//   motivo: ausencia.motivo ?? "",
//   ...
// });


// Como hardening adicional, APÓS form.reset(...):
form.setValue(
  "legal_confirmacao",
  true,
  {
    shouldValidate: false,
    shouldDirty: false,
  },
);


// ---------------------------------------------------------------------------
// K) SUBMIT
//
// SUBSTITUA O onSubmit ATUAL PELO PADRÃO ABAIXO.
// ---------------------------------------------------------------------------

onSubmit={(e) => {
  e.preventDefault();

  void form.handleSubmit(
    // ========================================================
    // VÁLIDO
    // ========================================================
    async (v) => {
      if (
        salvarMut.isPending ||
        substituirMut.isPending ||
        bloqueado
      ) {
        return;
      }

      if (
        supervisorSemProjetos &&
        !isEdit
      ) {
        toast.error(
          "Sem projetos vinculados. Procure um administrador.",
        );

        return;
      }

      if (
        !colab &&
        !isEdit &&
        !v.modo_manual
      ) {
        toast.error(
          "Busque um colaborador pela matrícula ou use o preenchimento manual.",
        );

        return;
      }

      // Confirmação jurídica somente no novo lançamento.
      if (
        !isEdit &&
        !v.legal_confirmacao
      ) {
        toast.error(
          "Confirme que as informações estão corretas antes de enviar.",
        );

        return;
      }

      // Conflitos somente no NOVO lançamento.
      if (!isEdit) {
        try {
          const tipo =
            tipoSelecionado?.codigo
              ? tipoBaseFromDetalhe(
                  tipoSelecionado.codigo,
                )
              : "FALTA";

          const confs =
            await checkConflitosFn({
              data: {
                colaborador_id:
                  v.modo_manual
                    ? null
                    : v.colaborador_id,

                data_inicio:
                  v.data_inicio,

                data_fim:
                  dataFim ||
                  v.data_inicio,

                tipo:
                  tipo as any,

                origem_registro:
                  v.modo_manual
                    ? "MANUAL"
                    : "AUTOMATICO",

                manual_matricula:
                  v.modo_manual
                    ? v.manual_matricula
                    : matriculaInput.trim(),

                empresa_id:
                  v.modo_manual
                    ? v.empresa_id
                    : null,

                projeto_id:
                  v.modo_manual
                    ? v.projeto_id
                    : null,

                _supervisor_id:
                  null,
              },
            });

          if (
            confs &&
            confs.length >
              0
          ) {
            setConflitos(
              confs,
            );

            setPendingValues(
              v,
            );

            setConflitoDialogOpen(
              true,
            );

            return;
          }
        } catch (err) {
          console.error(
            "[NovaAusencia] Falha ao verificar conflitos",
            err,
          );
        }
      }

      if (
        colab &&
        !colab.projeto
          ?.codigo_protocolo
      ) {
        toast.error(
          "O projeto do colaborador está sem código de protocolo.",
          {
            description:
              "Peça a um administrador para cadastrar em Configurações → Projetos.",
          },
        );

        return;
      }

      salvarMut.mutate(
        v,
      );
    },

    // ========================================================
    // INVÁLIDO
    // ========================================================
    (errors) => {
      console.warn(
        "[EditarAusencia] Formulário inválido",
        Object.keys(
          errors,
        ),
      );

      toast.error(
        isEdit
          ? "Não foi possível salvar as alterações."
          : "Não foi possível enviar o lançamento.",
        {
          description:
            "Revise os campos obrigatórios destacados na tela.",
        },
      );

      const firstError =
        Object.keys(
          errors,
        )[0];

      if (!firstError) {
        return;
      }

      const element =
        document.querySelector(
          `[name="${firstError}"]`,
        ) ||
        document.querySelector(
          `[id="${firstError}"]`,
        );

      if (
        element instanceof
        HTMLElement
      ) {
        element.scrollIntoView(
          {
            behavior:
              "smooth",

            block:
              "center",
          },
        );

        setTimeout(
          () => {
            element.focus();
          },
          400,
        );
      }
    },
  )(e);
}}


// ---------------------------------------------------------------------------
// L) BOTÃO
//
// MANTER TIPO submit E BLOQUEAR DUPLO ENVIO
// ---------------------------------------------------------------------------

<Button
  type="submit"
  size="lg"
  disabled={
    salvarMut.isPending ||
    substituirMut.isPending ||
    (
      !!colab &&
      !colab.projeto
        ?.codigo_protocolo
    )
  }
  className="
    min-w-[220px]
    bg-gradient-to-r
    from-blue-600
    to-indigo-700
    text-white
    hover:from-blue-700
    hover:to-indigo-800
    disabled:opacity-50
  "
>
  {salvarMut.isPending ? (
    <Loader2
      className="
        mr-2 h-4 w-4
        animate-spin
      "
    />
  ) : (
    <Send
      className="
        mr-2 h-4 w-4
      "
    />
  )}

  {salvarMut.isPending
    ? isEdit
      ? "Salvando alterações..."
      : "Enviando..."
    : isEdit
      ? "Salvar Alterações"
      : "Enviar Lançamento"}
</Button>


// ============================================================================
// FIM DO PATCH CONSOLIDADO
// ============================================================================
//
// APÓS ALTERAR:
//
// procurar no projeto inteiro por:
//
// atualizado_em
//
// Para public.ausencias, a quantidade precisa ser ZERO.
//
// O campo canônico é:
//
// updated_at
//
// NÃO criar coluna atualizado_em no banco.
//
// ============================================================================
