import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="min-h-screen bg-slate-50 p-8 font-mono text-sm text-slate-800 leading-relaxed">
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 shadow-sm p-8 whitespace-pre-wrap">
        <h1 className="text-lg font-bold border-b border-slate-200 pb-4 mb-6">
          CRM MK9 — HOMOLOGAÇÃO FUNCIONAL DA ABERTURA DE DOCUMENTOS NO PROCESSAMENTO INTERNO
        </h1>

        <div className="space-y-4 mb-8">
          <p><span className="font-bold">MODO:</span>{"\n"}TESTE / SOMENTE VALIDAÇÃO</p>
          <p><span className="font-bold">CHANGE BUDGET:</span>{"\n"}ZERO</p>
          <p><span className="font-bold">ALLOWLIST DE ESCRITA:</span>{"\n"}NENHUM ARQUIVO</p>
          <p><span className="font-bold">GUARDRAIL P0:</span>{"\n"}src/routes/index.tsx = PROTECTED / FROZEN</p>
        </div>

        <section className="mb-8">
          <h2 className="font-bold uppercase tracking-wider text-slate-500 mb-2">CONTEXTO</h2>
          <p>Foi corrigida a abertura de documentos no Processamento Interno.</p>
          <p className="mt-2">Arquivos alterados anteriormente:</p>
          <ul className="list-disc list-inside ml-4">
            <li>src/components/processamento/painel-360.tsx</li>
            <li>src/routes/_authenticated/processamento.tsx</li>
          </ul>
          <p className="mt-2">Implementação atual:</p>
          <ul className="list-disc list-inside ml-4">
            <li>mapeamento de possui_anexo;</li>
            <li>arquivo_url;</li>
            <li>arquivo_nome;</li>
            <li>arquivo_mime;</li>
            <li>geração de Signed URL;</li>
            <li>bucket "ausencias";</li>
            <li>abertura em nova aba;</li>
            <li>feedback de erro via sonner.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="font-bold uppercase tracking-wider text-slate-500 mb-2">OBJETIVO</h2>
          <p>Comprovar funcionalmente que documentos reais abrem corretamente, sem realizar novas alterações nesta etapa.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 1 — VALIDAR O FORMATO DE arquivo_url{"\n"}
            ==================================================
          </h2>
          <p>Consultar um registro real com anexo.</p>
          <p className="mt-2">Determinar exatamente o formato persistido em:</p>
          <p className="font-bold italic">arquivo_url</p>
          <p className="mt-2">Classificar:</p>
          <p>A. PATH DO STORAGE (Ex: empresa/protocolo/documento.pdf)</p>
          <p>B. URL COMPLETA (Ex: https://.../storage/v1/object/...)</p>
          <p>C. SIGNED URL ANTIGA</p>
          <p>D. NULL / vazio</p>
          <p>E. outro formato.</p>
          <p className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded">
            <span className="font-bold uppercase text-amber-800">IMPORTANTE:</span>{"\n"}
            supabase.storage.from("ausencias").createSignedUrl(...) deve receber o path correto do objeto dentro do bucket.
          </p>
          <p className="mt-4">Se arquivo_url for URL completa, NÃO declarar a abertura homologada apenas pela revisão de código.</p>
          <p className="mt-2">Nesta etapa, apenas reportar. Não corrigir.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 2 — VALIDAR EXISTÊNCIA FÍSICA{"\n"}
            ==================================================
          </h2>
          <p>Para o registro de referência:</p>
          <p className="font-bold">ANDREA CRISTINA CORREIA DA SILVA</p>
          <p>Matrícula: 2549</p>
          <p>Protocolo: AMBEVRED5-20260727-000001</p>
          <p className="mt-4">Confirmar:</p>
          <ul className="list-disc list-inside ml-4">
            <li>possui_anexo;</li>
            <li>arquivo_nome;</li>
            <li>arquivo_mime;</li>
            <li>arquivo_url/path;</li>
            <li>bucket;</li>
            <li>objeto realmente existe no Storage.</li>
          </ul>
          <p className="mt-4">Não alterar nem reuploadar.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 3 — VALIDAR SIGNED URL{"\n"}
            ==================================================
          </h2>
          <p>Gerar signed URL usando exatamente o mecanismo atual.</p>
          <p className="mt-4">Registrar somente:</p>
          <ul className="list-disc list-inside ml-4">
            <li>geração: SUCESSO/FALHA;</li>
            <li>status de erro, se houver;</li>
            <li>TTL configurado;</li>
            <li>path utilizado.</li>
          </ul>
          <p className="mt-4 italic">Não expor a signed URL completa no relatório.</p>
          <p>Não persistir a signed URL no banco.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 4 — EXECUTAR TESTE FUNCIONAL REAL{"\n"}
            ==================================================
          </h2>
          <p>Se houver sessão/interface disponível:</p>
          <p className="mt-2">Abrir: Central de Processamento → registro da Andrea → Documentos Anexados → Comprovante de Ausência → ícone de abrir.</p>
          <p className="mt-4 font-bold underline">Resultado esperado:</p>
          <ul className="list-disc list-inside ml-4">
            <li>clique responde;</li>
            <li>nova aba é aberta;</li>
            <li>documento real é carregado;</li>
            <li>sem erro de Storage;</li>
            <li>sem download corrompido;</li>
            <li>nenhum dado do registro é modificado.</li>
          </ul>
          <p className="mt-4 p-2 bg-slate-100 border border-slate-200 rounded">
            Se o ambiente não permitir interação autenticada: classificar <span className="font-bold">NÃO EXECUTADO</span>. Não declarar “confirmado via lógica”.
          </p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 5 — PDF / JPG / PNG{"\n"}
            ==================================================
          </h2>
          <div className="space-y-2">
            <p>PDF: CONFIRMADO / FALHOU / NÃO EXECUTADO</p>
            <p>JPG: CONFIRMADO / FALHOU / NÃO EXECUTADO</p>
            <p>PNG: CONFIRMADO / FALHOU / NÃO EXECUTADO</p>
          </div>
          <p className="mt-4 italic text-slate-500 text-xs italic">Não inferir JPG/PNG a partir do teste de PDF.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 6 — REGISTRO SEM ANEXO{"\n"}
            ==================================================
          </h2>
          <p>Abrir registro sem documento.</p>
          <p className="mt-2 font-bold">Esperado:</p>
          <ul className="list-disc list-inside ml-4">
            <li>não gerar signed URL;</li>
            <li>não abrir aba vazia;</li>
            <li>ação indisponível ou mensagem adequada;</li>
            <li>nenhuma exceção.</li>
          </ul>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 7 — ARQUIVO AUSENTE NO STORAGE{"\n"}
            ==================================================
          </h2>
          <p>Se metadata indicar anexo, mas o objeto físico não existir:</p>
          <p className="mt-2 font-bold italic">Esperado:</p>
          <ul className="list-disc list-inside ml-4">
            <li>mensagem amigável;</li>
            <li>nenhum crash;</li>
            <li>nenhum loop;</li>
            <li>nenhum reupload automático.</li>
          </ul>
          <p className="mt-4 italic">Não criar arquivo para fazer o teste passar.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 8 — AUTORIZAÇÃO{"\n"}
            ==================================================
          </h2>
          <p>Confirmar que o acesso ao documento continua obedecendo às regras atuais.</p>
          <p className="mt-2">Não usar: service_role no frontend; bucket público; bypass de Storage policy.</p>
          <p className="mt-4">Validar:</p>
          <p>usuário autorizado → acessa.</p>
          <p>usuário não autorizado → bloqueado.</p>
          <p className="mt-4 italic text-slate-500">Se não houver sessão apropriada: NÃO EXECUTADO.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 9 — POPUP / NOVA ABA{"\n"}
            ==================================================
          </h2>
          <p>Confirmar que a nova aba é aberta como consequência direta do clique do usuário.</p>
          <p className="mt-4">Verificar se <span className="bg-slate-100 px-1 font-bold">window.open</span> ou mecanismo equivalente não está sendo executado somente depois de uma Promise de forma que o navegador possa bloquear o popup.</p>
          <p className="mt-4 italic">Se houver bloqueio real: classificar FALHOU. Não corrigir nesta etapa.</p>
        </section>

        <section className="mb-8 border-t border-slate-100 pt-6">
          <h2 className="font-bold text-center border-y border-slate-200 py-2 mb-4">
            =================================================={"\n"}
            ETAPA 10 — REGRESSÃO{"\n"}
            ==================================================
          </h2>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>upload de documento permanece funcional;</li>
            <li>registros antigos continuam reconhecendo anexos;</li>
            <li>Processamento Interno carrega normalmente;</li>
            <li>Painel 360º continua abrindo;</li>
            <li>Dashboard não foi afetado;</li>
            <li>Auditoria não foi afetada;</li>
            <li>exclusão lógica não foi afetada.</li>
          </ul>
        </section>

        <section className="mb-12 border-2 border-red-200 bg-red-50 p-6 rounded">
          <h2 className="font-bold text-red-800 text-center border-y border-red-200 py-2 mb-4">
            =================================================={"\n"}
            REGRA DE PARADA{"\n"}
            ==================================================
          </h2>
          <p className="font-bold text-red-900 text-center uppercase mb-4">Se qualquer teste falhar: PARAR. Não modificar código.</p>
          <p>Apresentar:</p>
          <ul className="list-disc list-inside ml-4 mt-2">
            <li>camada;</li>
            <li>mensagem;</li>
            <li>path/formato utilizado;</li>
            <li>erro do Storage;</li>
            <li>arquivo/função envolvida;</li>
            <li>correção mínima recomendada.</li>
          </ul>
          <p className="mt-4 font-bold text-center italic text-red-800 underline">Aguardar autorização.</p>
        </section>

        <section className="mt-12 border-t-4 border-slate-800 pt-8">
          <h2 className="font-bold text-center border-y border-slate-800 py-2 mb-6 text-base">
            =================================================={"\n"}
            ENTREGA FINAL{"\n"}
            ==================================================
          </h2>
          
          <div className="grid grid-cols-1 gap-4 uppercase font-bold text-xs tracking-wider">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>DOCUMENTOS — PROCESSAMENTO INTERNO</span>
              <span className="text-slate-400">PENDENTE</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Formato de arquivo_url</span>
              <span className="text-slate-400">PATH / URL COMPLETA / SIGNED URL / OUTRO</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Bucket</span>
              <span className="text-slate-400">ausencias</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Objeto físico</span>
              <span className="text-slate-400">EXISTE / NÃO EXISTE</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Signed URL</span>
              <span className="text-slate-400">GERADA / FALHOU / NÃO EXECUTADO</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 text-slate-500">
              <span>Andrea — protocolo</span>
              <span>AMBEVRED5-20260727-000001</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span>Abertura funcional</span>
              <span className="text-slate-400">CONFIRMADO / FALHOU / NÃO EXECUTADO</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 text-center font-bold text-[10px] text-slate-500">
            <div className="border border-slate-200 p-2">PDF: [...]</div>
            <div className="border border-slate-200 p-2">JPG: [...]</div>
            <div className="border border-slate-200 p-2">PNG: [...]</div>
          </div>

          <div className="mt-8 space-y-2 text-xs">
            <p>Registro sem anexo: [...]</p>
            <p>Arquivo ausente: [...]</p>
            <p>Permissões: [...]</p>
            <p>Upload: PRESERVADO</p>
            <p>Alterações de código nesta homologação: NENHUMA</p>
            <p>Alterações de banco: NENHUMA</p>
            <p>Home: INALTERADA</p>
          </div>

          <div className="mt-12 bg-slate-900 text-white p-6 text-center rounded">
            <p className="text-xs uppercase tracking-[0.2em] mb-2 text-slate-400">STATUS FINAL</p>
            <p className="text-2xl font-bold mb-4 tracking-tighter">RESULTADO: NÃO EXECUTADO</p>
            <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed">
              Somente declarar HOMOLOGADO quando ao menos um documento real tiver sido aberto com sucesso pela interface publicada.
            </p>
          </div>
        </section>
      </div>
    </div>
  ),
});
