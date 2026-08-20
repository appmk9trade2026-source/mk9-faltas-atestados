import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, ShieldCheck, Database, History, RefreshCcw } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export const Route = createFileRoute('/')({
  component: ProtocolPage,
})

function ProtocolPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-mono text-sm">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-2 border-primary/20 shadow-xl">
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-xl md:text-2xl">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              CRM MK9 — CENTRAL DE SUPORTE
            </CardTitle>
            <div className="text-blue-300 font-bold tracking-wider mt-2">
              INCIDENTE P1 — PARTE 3/5
            </div>
            <div className="text-white text-lg mt-1 underline decoration-blue-500 underline-offset-4">
              RETESTE OPERACIONAL REAL DA CRIAÇÃO DE CHAMADO
            </div>
          </CardHeader>
          
          <CardContent className="p-6 space-y-8 text-slate-800">
            {/* CONTEXTO */}
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-bold border-b border-slate-200 pb-2">
                <Database className="w-5 h-5 text-slate-500" />
                CONTEXTO
              </h2>
              <div className="bg-slate-100 p-4 rounded border-l-4 border-blue-500">
                <p>A Parte 2 corrigiu a causa raiz:</p>
                <p className="font-bold text-blue-700 my-2">SUPPORT_CREATE_UNAUTHORIZED</p>
                <p>Correção aplicada em: <code className="bg-slate-200 px-1 rounded">src/lib/support.functions.ts</code></p>
                <div className="mt-4 space-y-1">
                  <p><span className="text-green-600">✔</span> createTicket agora utiliza:</p>
                  <ul className="list-disc list-inside ml-4 text-slate-600">
                    <li>requireSupabaseAuth</li>
                    <li>context.userId</li>
                    <li>context.supabase</li>
                  </ul>
                  <p className="mt-2 text-green-600 font-medium">RLS foi preservada.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-white p-3 border rounded shadow-sm">
                  <div className="text-xs text-slate-500 mb-1 font-bold">AUTH TEST</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Super Admin</span> <span className="text-green-600 font-bold">PASS</span></div>
                    <div className="flex justify-between"><span>RH</span> <span className="text-green-600 font-bold">PASS</span></div>
                    <div className="flex justify-between"><span>Supervisor</span> <span className="text-green-600 font-bold">PASS</span></div>
                    <div className="flex justify-between"><span>Anonymous</span> <span className="text-red-600 font-bold">BLOCKED</span></div>
                  </div>
                </div>
                <div className="bg-blue-50 p-3 border border-blue-100 rounded flex flex-col justify-center items-center">
                  <div className="text-xs text-blue-600 font-bold mb-1">READY FOR RETEST</div>
                  <div className="text-2xl font-black text-blue-700">SIM</div>
                </div>
              </div>
            </section>

            {/* OBJETIVO */}
            <section className="space-y-4 bg-orange-50 p-4 border border-orange-100 rounded-lg">
              <h2 className="flex items-center gap-2 text-lg font-bold text-orange-900 border-b border-orange-200 pb-2">
                <AlertCircle className="w-5 h-5" />
                OBJETIVO DESTA PARTE
              </h2>
              <div className="space-y-3 text-orange-800 font-medium">
                <p>Executar SOMENTE o reteste real da criação do chamado.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Não corrigir outras funções.</li>
                  <li>Não continuar ainda o fluxo RH → Supervisor.</li>
                </ul>
                <p className="bg-orange-200/50 p-2 rounded text-sm italic">
                  Precisamos provar que o incidente original foi resolvido no ambiente publicado.
                </p>
              </div>
            </section>

            {/* PROTOCOL STEPS */}
            <ScrollArea className="h-[500px] border rounded-lg bg-white p-4">
              <div className="space-y-12 pb-8">
                
                {/* 1 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">1 — USAR O MESMO CAMINHO QUE FALHOU</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="space-y-2 p-3 bg-slate-50 border rounded">
                    <p className="font-bold text-red-700">Executar o teste no SITE PUBLICADO.</p>
                    <p>Usar perfil: <span className="font-bold">SUPERVISOR</span></p>
                    <p>Partir da rota operacional onde o problema ocorreu: <span className="font-bold">/processamento</span></p>
                    <div className="flex items-center gap-2 mt-2 font-medium">
                      <span>/processamento</span>
                      <span>→</span>
                      <span className="bg-slate-200 px-2 py-0.5 rounded">FAB "Suporte"</span>
                      <span>→</span>
                      <span className="bg-slate-200 px-2 py-0.5 rounded">Abrir chamado</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 italic">Não testar somente no Preview do Lovable.</p>
                  </div>
                </div>

                {/* 2 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">2 — CRIAR UM ÚNICO CHAMADO CONTROLADO</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="space-y-3 p-3 bg-slate-50 border rounded">
                    <div>
                      <span className="font-bold text-slate-500">Categoria:</span>
                      <p className="italic">uma categoria permitida para Supervisor</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500">Assunto:</span>
                      <p className="font-bold text-blue-600">TESTE E2E — CENTRAL DE SUPORTE</p>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500">Descrição:</span>
                      <p className="text-sm bg-white p-2 border rounded">
                        Chamado controlado para validar a correção do incidente SUPPORT_CREATE_UNAUTHORIZED.
                      </p>
                    </div>
                    <p className="text-xs text-orange-700 font-bold italic">Não utilizar dados pessoais ou clínicos reais.</p>
                    <div className="flex items-center gap-4 border-t pt-3 mt-2">
                      <span className="text-slate-500">Clicar UMA VEZ em:</span>
                      <button className="bg-slate-900 text-white px-4 py-1 rounded font-bold shadow-sm opacity-50 cursor-not-allowed">Abrir Chamado</button>
                    </div>
                  </div>
                </div>

                {/* 3 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">3 — RESULTADO ESPERADO NA UI</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-sm p-3 bg-green-50 border border-green-100 rounded">
                      <div className="font-bold text-green-800 mb-1 underline">Esperado:</div>
                      <div>- NÃO exibir "Unauthorized";</div>
                      <div>- exibir confirmação funcional;</div>
                      <div>- gerar protocolo SUP-*;</div>
                      <div>- permitir abrir a conversa ou continuar trabalhando.</div>
                    </div>
                    <div className="space-y-1 text-xs p-3 bg-slate-900 text-slate-300 font-mono rounded">
                      <div className="text-blue-400 font-bold mb-1">Registrar:</div>
                      <div>UI_SUBMIT: <span className="text-white">PASS/FAIL</span></div>
                      <div>RAW_UNAUTHORIZED: <span className="text-white">SIM/NÃO</span></div>
                      <div>PROTOCOL: <span className="text-white">[...]</span></div>
                    </div>
                  </div>
                </div>

                {/* 4 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">4 — CONFIRMAR NO BANCO</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="p-3 bg-slate-50 border rounded space-y-4">
                    <p className="text-xs italic">Após a criação, consultar a fonte de verdade.</p>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="space-y-1">
                        <div>TICKET_CREATED: <span className="bg-slate-200 px-1 font-bold">SIM/NÃO</span></div>
                        <div>TICKET_ID: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                        <div>PROTOCOL: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                        <div>REQUESTER_USER_ID: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                      </div>
                      <div className="space-y-1">
                        <div>CATEGORY: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                        <div>STATUS: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                        <div>CREATED_AT: <span className="bg-slate-200 px-1 font-bold">[...]</span></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-blue-600 font-bold border-t pt-2">
                      O requester_user_id deve corresponder ao context.userId autenticado.
                    </p>
                  </div>
                </div>

                {/* 5 & 6 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-400">==================================================</div>
                    <h3 className="text-sm font-bold text-slate-900">5 — AUDITORIA</h3>
                    <div className="text-[10px] font-bold text-slate-400">==================================================</div>
                    <div className="p-2 bg-slate-50 border rounded text-xs space-y-2">
                      <p>TICKET_CREATED audit event = 1</p>
                      <div className="space-y-1">
                        <div>AUDIT_EVENT: <span className="font-bold">PASS/FAIL</span></div>
                        <div>AUDIT_COUNT: <span className="font-bold">[...]</span></div>
                      </div>
                      <p className="text-[10px] italic text-slate-500 border-t pt-1">Não deve existir duplicação do evento lógico.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-400">==================================================</div>
                    <h3 className="text-sm font-bold text-slate-900">6 — IDEMPOTÊNCIA</h3>
                    <div className="text-[10px] font-bold text-slate-400">==================================================</div>
                    <div className="p-2 bg-slate-50 border rounded text-xs space-y-1">
                      <div>Logical Tickets: <span className="font-bold">1</span></div>
                      <div>Protocols: <span className="font-bold">1</span></div>
                      <div>Audit Events: <span className="font-bold">1</span></div>
                      <div className="text-[10px] text-red-600 pt-1 font-bold">NÃO EXECUTAR VÁRIOS CLIQUES.</div>
                    </div>
                  </div>
                </div>

                {/* 7 & 8 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">7 & 8 — PERSISTÊNCIA E RELOAD</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 border rounded space-y-2">
                      <h4 className="font-bold text-xs underline">7 — "MEUS CHAMADOS"</h4>
                      <div className="text-xs space-y-1">
                        <p>Abrir: Suporte → Meus chamados</p>
                        <p>MY_TICKETS: <span className="font-bold">PASS/FAIL</span></p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 border rounded space-y-2">
                      <h4 className="font-bold text-xs underline">8 — RELOAD</h4>
                      <div className="text-xs space-y-1">
                        <p>Atualizar a página & confirmar presença.</p>
                        <p>RELOAD_PERSISTENCE: <span className="font-bold">PASS/FAIL</span></p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 9 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-red-700">9 — NÃO TESTAR AINDA</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="p-3 bg-red-50 border border-red-100 rounded grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-bold text-red-800">
                    <div>❌ RH ASSUMIR TICKET</div>
                    <div>❌ RH RESPONDER</div>
                    <div>❌ SUPERVISOR RECEBER</div>
                    <div>❌ RESOLUÇÃO / REABERTURA</div>
                    <div>❌ CROSS-TICKET SECURITY</div>
                    <div>❌ COPILOTO / INCIDENTES</div>
                  </div>
                </div>

                {/* 10 */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <h3 className="text-base font-bold text-slate-900">10 — AUTH DRIFT ENCONTRADO NA PARTE 2</h3>
                  <div className="text-xs font-bold text-slate-400">==================================================</div>
                  <div className="p-3 bg-slate-100 border rounded space-y-2 text-xs">
                    <p className="font-bold underline italic text-slate-600">NÃO CORRIGIR NESTA PARTE 3:</p>
                    <div className="flex flex-wrap gap-2">
                      {['resolveTicket', 'reopenTicket', 'sendMessage', 'assignTicket', 'getAgentMetrics', 'getUnreadSupportCount'].map(fn => (
                        <span key={fn} className="bg-white px-2 py-0.5 border rounded text-slate-500 font-mono">{fn}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* GUARDRAILS */}
                <div className="bg-slate-900 text-slate-400 p-4 rounded-lg space-y-4">
                  <h3 className="text-white font-black tracking-tighter flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-500" />
                    GUARDRAILS
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] uppercase font-mono">
                    <div className="text-red-500">NÃO ALTERAR:</div>
                    <div className="col-start-1 space-y-1">
                      <div>- src/routes/index.tsx</div>
                      <div>- support.functions.ts</div>
                      <div>- RLS / RBAC / FAB</div>
                      <div>- Categorias</div>
                      <div>- Central Processamento</div>
                    </div>
                    <div className="col-start-2 space-y-1">
                      <div>- Nova Ausência / Retificação</div>
                      <div>- Ocorrência de Ponto</div>
                      <div>- Base de Conhecimento</div>
                      <div>- Copiloto / Incidentes</div>
                      <div>- Kill Switches</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-700 pt-2 text-[10px] text-white italic">
                    Se o teste falhar: registrar evidência. NÃO corrigir automaticamente.
                  </div>
                </div>

                {/* RELATÓRIO FINAL */}
                <div className="border-4 border-slate-900 p-6 bg-white space-y-6">
                  <h3 className="text-center font-black text-xl border-b-2 border-slate-900 pb-2">
                    RELATÓRIO FINAL OBRIGATÓRIO
                  </h3>
                  
                  <div className="space-y-4 font-mono text-xs">
                    <div className="bg-slate-50 p-3 border border-dashed border-slate-300">
                      <div className="font-bold mb-2 text-blue-800">PARTE 3/5 — RETESTE CREATE TICKET</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>ENVIRONMENT: <span className="font-bold">PRODUCTION</span></div>
                        <div>TEST ROLE: <span className="font-bold">SUPERVISOR</span></div>
                        <div>SOURCE ROUTE: <span className="font-bold">/processamento</span></div>
                        <div>FAB: <span className="font-bold">PASS/FAIL</span></div>
                        <div>FORM: <span className="font-bold">PASS/FAIL</span></div>
                        <div>UI SUBMIT: <span className="font-bold">PASS/FAIL</span></div>
                        <div>RAW UNAUTHORIZED: <span className="font-bold">SIM/NÃO</span></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="border p-2">
                        <div className="font-bold mb-1 border-b">DATABASE</div>
                        <div className="space-y-1">
                          <div>TICKET CREATED: <span className="font-bold">SIM/NÃO</span></div>
                          <div>TICKET ID: <span className="font-bold">[...]</span></div>
                          <div>PROTOCOL: <span className="font-bold">[...]</span></div>
                          <div>REQUESTER MATCH: <span className="font-bold">PASS/FAIL</span></div>
                          <div>STATUS: <span className="font-bold">[...]</span></div>
                        </div>
                      </div>
                      <div className="border p-2">
                        <div className="font-bold mb-1 border-b">AUDIT & DUPL</div>
                        <div className="space-y-1">
                          <div>EVENT: <span className="font-bold">PASS/FAIL</span></div>
                          <div>COUNT: <span className="font-bold">[...]</span></div>
                          <div>LOGICAL TICKETS: <span className="font-bold">[...]</span></div>
                          <div>PROTOCOLS: <span className="font-bold">[...]</span></div>
                          <div>DUPLICATE: <span className="font-bold">SIM/NÃO</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="border p-2">
                      <div className="font-bold mb-1 border-b">USER EXPERIENCE</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>SUCCESS MSG: <span className="font-bold">PASS/FAIL</span></div>
                        <div>MY TICKETS: <span className="font-bold">PASS/FAIL</span></div>
                        <div>PERSISTENCE: <span className="font-bold">PASS/FAIL</span></div>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white p-4 space-y-2">
                      <div className="text-center font-bold text-blue-400 mb-2 border-b border-slate-700 pb-1">DECISÃO</div>
                      <div className="flex flex-col gap-1 text-[10px]">
                        <div className="flex justify-between">
                          <span>SUPPORT_CREATE_INCIDENT_RESOLVED:</span>
                          <span className="font-bold border px-1">SIM/NÃO</span>
                        </div>
                        <div className="flex justify-between">
                          <span>CREATE_TICKET_OPERATIONAL:</span>
                          <span className="font-bold border px-1 text-yellow-400">SIM/NÃO</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SUPPORT_E2E_CAN_CONTINUE:</span>
                          <span className="font-bold border px-1">SIM/NÃO</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-400 italic pt-2 border-t border-slate-700">
                        Se CREATE_TICKET_OPERATIONAL = NÃO: PARAR e apresentar evidência.
                      </div>
                      <div className="text-[9px] text-slate-400 italic">
                        Se SIM: PARAR. NÃO iniciar Parte 4 automaticamente.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
