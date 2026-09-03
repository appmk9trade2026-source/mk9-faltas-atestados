// ============================================================
// PATCH RECOMENDADO — ausencias.functions.ts
// Trechos para substituir/adicionar no arquivo existente
// ============================================================


// ============================================================
// 1. ADICIONE ESTES HELPERS PRÓXIMOS AO TOPO DO ARQUIVO
// ============================================================

const ATESTADOS_BUCKET = "atestados";

/**
 * Normaliza o valor persistido em arquivo_url para um path utilizável
 * pelo Supabase Storage.
 *
 * O contrato preferencial é armazenar somente o path privado:
 * ausencias/<colaborador>/<arquivo>
 *
 * Também tolera formatos legados para permitir compensação segura.
 */
function normalizeStoragePath(value?: string | null): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  // Contrato ideal: path relativo já persistido.
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
        return pathname.slice(idx + marker.length).replace(/^\/+/, "");
      }
    }
  } catch {
    // Não propagar parsing de URL para o usuário.
  }

  return null;
}


/**
 * Compensação server-side.
 *
 * Utilizada quando o arquivo já foi enviado, mas a criação da ausência
 * falha posteriormente.
 */
async function cleanupOrphanAttachment(
  arquivoUrl: string | null | undefined,
  correlationId: string,
) {
  const storagePath = normalizeStoragePath(arquivoUrl);

  if (!storagePath) {
    console.warn("[ORPHAN-CLEANUP] Path inválido/ausente", {
      correlation_id: correlationId,
    });
    return;
  }

  try {
    const { error } = await supabaseAdmin.storage
      .from(ATESTADOS_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error("[ORPHAN-CLEANUP] Storage recusou remoção", {
        correlation_id: correlationId,
        storage_path: storagePath,
        code: (error as any)?.statusCode ?? null,
        message: error.message,
      });

      return;
    }

    console.info("[ORPHAN-CLEANUP] Objeto órfão removido", {
      correlation_id: correlationId,
      storage_path: storagePath,
    });
  } catch (error) {
    console.error("[ORPHAN-CLEANUP] Exceção durante compensação", {
      correlation_id: correlationId,
      storage_path: storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}


/**
 * Nunca devolve SQL/stack trace bruto para a interface.
 */
function technicalError(
  correlationId?: string,
  safeMessage = "Não foi possível concluir a operação.",
) {
  const ref = correlationId || crypto.randomUUID();

  return new Error(
    `TECHNICAL_ERROR: ${safeMessage} Código de suporte: ${ref}`,
  );
}


// ============================================================
// 2. SUBSTITUA O FINAL DE ausenciaDbError
// ============================================================

// Atualmente seu código termina expondo parte do erro original:
//
// return new Error(
//   `TECHNICAL_ERROR: ${msg.slice(0, 240) || "Falha técnica..."}`
// );
//
// Isso pode vazar detalhes do PostgreSQL.
//
// SUBSTITUA POR:

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

  const msg = (e.message ?? String(err)) || "";
  const sqlstate = e.code ?? "";

  console.error(
    "[ausencias] falha de banco",
    JSON.stringify({
      etapa,
      correlation_id: correlationId ?? null,
      sqlstate: sqlstate || null,
      message: msg,
      details: e.details ?? null,
      hint: e.hint ?? null,
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

  if (/PROJETO_FORA_DO_ESCOPO|Projeto fora do seu escopo/i.test(msg)) {
    return new Error(
      "PROJECT_SCOPE_DENIED: O projeto selecionado não pertence ao seu escopo.",
    );
  }

  if (
    sqlstate === "42501" ||
    /row-level security|permission denied|not authorized/i.test(msg)
  ) {
    return new Error(
      "PROJECT_SCOPE_DENIED: Este colaborador ou projeto não está disponível no seu escopo de acesso.",
    );
  }

  if (
    /já está vinculada a outro projeto/i.test(msg) ||
    /já está vinculada a outro supervisor/i.test(msg)
  ) {
    return new Error(`CONFLICT: ${msg.slice(0, 240)}`);
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

  if (sqlstate === "23505" || /DUPLICIDADE_AUSENCIA/i.test(msg)) {
    if (etapa === "rpc_manual") {
      return new Error(
        "CONFLICT: BLOQUEIO DE SEGURANÇA — Esta matrícula já possui um registro ativo no sistema. Verifique o histórico ou utilize a busca automática.",
      );
    }

    const limpa = msg
      .replace(/^.*DUPLICIDADE_AUSENCIA:\s*/s, "")
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
    // Não retornar mensagem SQL completa.
    return new Error(
      "INVALID_PAYLOAD: Os dados enviados não atendem às regras do lançamento.",
    );
  }

  if (
    /is not unique|ambiguous|could not identify/i.test(msg)
  ) {
    return technicalError(
      correlationId,
      "O serviço de auditoria apresentou uma inconsistência temporária.",
    );
  }

  return technicalError(correlationId);
}


// ============================================================
// 3. CORRIJA A IDEMPOTÊNCIA EM createAusencia
// ============================================================

// Você possui:
//
// .eq("acao", "AUSENCIA_CRIADA_POR_SUPERVISOR")
//
// Mas mais abaixo o audit grava:
//
// audit(..., "AUSENCIA_CRIADA", ...)
//
// SUBSTITUA POR:

const { data: existing, error: findErr } = await context.supabase
  .from("audit_logs")
  .select("registro_id, depois")
  .eq("modulo", "ausencias")
  .eq("acao", "AUSENCIA_CRIADA")
  .ilike("observacoes", `%[corr=${correlationId}]%`)
  .maybeSingle();

if (findErr) {
  console.warn("[IDEMPOTENCY] Não foi possível consultar replay", {
    correlation_id: correlationId,
    message: findErr.message,
  });
}

if (existing?.registro_id) {
  const { data: original } = await context.supabase
    .from("ausencias")
    .select("id, protocolo, colaborador_id, origem_registro")
    .eq("id", existing.registro_id)
    .maybeSingle();

  return {
    id: original?.id || existing.registro_id,
    protocolo: original?.protocolo ?? null,
    colaborador_id: original?.colaborador_id ?? null,
    colaborador_criado: false,
    code: "ALREADY_COMMITTED",
    correlation_id: correlationId,
    message:
      "Lançamento confirmado. O registro já havia sido processado com sucesso.",
  };
}


// ============================================================
// 4. CORRIJA O PERÍODO ENVIADO PARA checkConflitosSeguro
// ============================================================

// Seu código atual envia:
//
// data_fim: data.data_inicio,
//
// embora você já tenha calculado insertPayload.data_fim.
//
// SUBSTITUA POR:

const conflitos = await checkConflitosSeguro(context.supabase, {
  colaborador_id: isManual ? undefined : data.colaborador_id,
  data_inicio: insertPayload.data_inicio,
  data_fim: insertPayload.data_fim,
  tipo: tipoBase,
  origem_registro: isManual ? "MANUAL" : "AUTOMATICO",
  manual_matricula: isManual
    ? (data as any).manual_matricula || undefined
    : undefined,
  empresa_id: gate.empresaId || undefined,
});


// ============================================================
// 5. TORNE O CONTRATO DA RPC MANUAL RESILIENTE
// ============================================================

// SUBSTITUA:

const out = (res ?? {}) as {
  colaborador_id?: string;
  colaborador_criado?: boolean;
  ausencia_id?: string;
  protocolo?: string | null;
};

if (!out.ausencia_id) {
  throw new Error("CONFLICT: falha ao registrar a ausência");
}

rowId = out.ausencia_id;


// POR:

const out = (res ?? {}) as {
  colaborador_id?: string;
  colaborador_criado?: boolean;

  // Contrato canônico:
  ausencia_id?: string;

  // Compatibilidade temporária com RPC antiga:
  id?: string;

  protocolo?: string | null;
};

const resolvedAusenciaId = out.ausencia_id ?? out.id;

if (!resolvedAusenciaId) {
  console.error("[RPC-CONTRACT] ID da ausência ausente", {
    correlation_id: gate.correlationId,
    received_keys:
      res && typeof res === "object"
        ? Object.keys(res as Record<string, unknown>)
        : [],
  });

  throw technicalError(
    gate.correlationId,
    "O servidor retornou uma resposta incompleta ao registrar a ausência.",
  );
}

rowId = resolvedAusenciaId;

protocolo = out.protocolo ?? null;
colaboradorId = out.colaborador_id ?? null;
colaboradorCriado = Boolean(out.colaborador_criado);


// ============================================================
// 6. SUBSTITUA O catch FINAL DE createAusencia
// ============================================================

} catch (err: any) {
  // Compensação somente se o cliente já conseguiu subir o arquivo e a
  // criação do registro falhou posteriormente.
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

  const { logAppError } = await import("./observability.server");

  await logAppError(
    {
      traceId,
      userId: context.userId,
      module: "ausencias",
      operation: "createAusencia",
      category: "UNKNOWN",
      severity: "P1",
    },
    err,
  );

  // Não devolver Postgres/HTML/stack trace bruto.
  throw technicalError(traceId);
}


// ============================================================
// 7. NÃO DEVOLVA ERRO BRUTO NAS RPCs DE PROCESSAMENTO
// ============================================================

// Exemplo — reatribuirProcessamentoAdm.
// SUBSTITUA:
//
// if (error) throw error;
//
// POR:

if (error) {
  console.error("[PROCESSAMENTO] reatribuição falhou", {
    ausencia_id: data.ausencia_id,
    code: error.code ?? null,
    message: error.message,
  });

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível assumir este processamento.",
  );
}


// Faça o mesmo padrão em iniciarProcessamentoAdm:

if (error) {
  console.error("[PROCESSAMENTO] início falhou", {
    ausencia_id: data.ausencia_id,
    code: error.code ?? null,
    message: error.message,
  });

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível iniciar o processamento.",
  );
}


// E em concluirProcessamentoAdm:

if (error) {
  console.error("[PROCESSAMENTO] conclusão falhou", {
    ausencia_id: data.ausencia_id,
    code: error.code ?? null,
    message: error.message,
  });

  throw technicalError(
    crypto.randomUUID(),
    "Não foi possível concluir o processamento.",
  );
}

