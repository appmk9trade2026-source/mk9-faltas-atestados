// Modal de Retificação de Ausência.
//
// Preserva o registro original (mesmo protocolo) e envia tudo pela RPC
// transacional. Nada de UPDATE direto e nada de decisão de prazo pelo
// relógio do navegador: o contador é apenas informativo — o banco decide.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Clock, History, Loader2, ShieldCheck, Upload, ArrowRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { BUCKET_ATESTADOS } from "@/lib/ausencias";
import {
  formatarRestante,
  listarRetificacoes,
  prazoRetificacao,
  retificarAusencia,
} from "@/lib/retificacao.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export type AusenciaRetificavel = {
  id: string;
  protocolo: string | null;
  empresa_id: string;
  projeto_id: string;
  colaborador_id: string | null;
  created_at: string;
  updated_at: string;
  data_inicio: string;
  data_fim: string;
  tipo_ausencia_id?: string | null;
  tipo_ausencia_nome?: string | null;
  opcao_periodo_id?: string | null;
  opcao_periodo_nome?: string | null;
  motivo: string | null;
  cid?: string | null;
  arquivo_url: string | null;
  origem_registro?: string | null;
  empresa?: { nome: string } | null;
  projeto?: { nome: string } | null;
  e_erro_supervisor?: boolean | null;
};

type TipoOpt = {
  id: string;
  codigo: string;
  nome: string;
  exige_documento: boolean;
  permite_cid: boolean;
};

type PeriodoOpt = { id: string; nome: string; quantidade_dias: number | null };

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR");
}

export function RetificarAusenciaDialog({
  ausencia,
  open,
  onOpenChange,
  podeIgnorarPrazo,
  nomeColaborador,
  podeVerCid = false,
}: {
  ausencia: AusenciaRetificavel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** RH e Super Admin não têm janela de 24h. */
  podeIgnorarPrazo: boolean;
  nomeColaborador: string;
  podeVerCid?: boolean;
}) {
  const queryClient = useQueryClient();
  const retificarFn = useServerFn(retificarAusencia);
  const historicoFn = useServerFn(listarRetificacoes);

  const [tipoId, setTipoId] = useState<string>("");
  const [periodoId, setPeriodoId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [motivoOperacional, setMotivoOperacional] = useState("");
  const [motivoCategoria, setMotivoCategoria] = useState<string>("");
  const [eErroSupervisor, setEErroSupervisor] = useState<boolean | null>(null);
  const [cid, setCid] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!open || !ausencia) return;
    setTipoId(ausencia.tipo_ausencia_id ?? "");
    setPeriodoId(ausencia.opcao_periodo_id ?? "");
    setDataInicio(ausencia.data_inicio);
    setMotivoOperacional("");
    setMotivoCategoria("");
    setEErroSupervisor(ausencia.e_erro_supervisor ?? null);
    setCid(ausencia.cid ?? "");
    setFile(null);
    setConfirmando(false);
  }, [open, ausencia]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, [open]);

  const tiposQ = useQuery({
    queryKey: ["tipos_ausencia_ativos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_ausencia" as never)
        .select("id, codigo, nome, exige_documento, permite_cid, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TipoOpt[];
    },
  });

  const periodosQ = useQuery({
    queryKey: ["opcoes_por_tipo", tipoId],
    enabled: open && !!tipoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_opcoes_periodo_por_tipo" as never,
        {
          _tipo_id: tipoId,
        } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as PeriodoOpt[];
    },
  });

  const historicoQ = useQuery({
    queryKey: ["ausencia_retificacoes", ausencia?.id],
    enabled: open && !!ausencia?.id,
    queryFn: () => historicoFn({ data: { ausencia_id: ausencia!.id } }),
  });

  const tipoSelecionado = useMemo(
    () => tiposQ.data?.find((t) => t.id === tipoId) ?? null,
    [tiposQ.data, tipoId],
  );

  const prazo = ausencia ? prazoRetificacao(ausencia.created_at, agora) : null;
  const bloqueadoPorPrazo = !podeIgnorarPrazo && !!prazo?.expirado;

  const exigeDocumento = tipoSelecionado?.exige_documento === true;
  const temAnexo = !!file || !!ausencia?.arquivo_url;
  const mudouAlgo =
    !!ausencia &&
    (tipoId !== (ausencia.tipo_ausencia_id ?? "") ||
      periodoId !== (ausencia.opcao_periodo_id ?? "") ||
      dataInicio !== ausencia.data_inicio ||
      !!file ||
      (podeVerCid && (cid || "") !== (ausencia.cid ?? "")));

  const podeSalvar =
    !!ausencia &&
    !bloqueadoPorPrazo &&
    !!tipoId &&
    !!periodoId &&
    !!dataInicio &&
    motivoOperacional.trim().length >= 10 &&
    !!motivoCategoria &&
    mudouAlgo &&
    (!exigeDocumento || temAnexo);

  const mut = useMutation({
    mutationFn: async () => {
      if (!ausencia) throw new Error("Ausência não selecionada");
      let arquivo: { path: string; nome: string; mime: string; tamanho: number } | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `ausencias/${ausencia.colaborador_id ?? "manual"}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_ATESTADOS)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        arquivo = { path, nome: file.name, mime: file.type, tamanho: file.size };
      }
      return retificarFn({
        data: {
          ausencia_id: ausencia.id,
          tipo_ausencia_id: tipoId,
          opcao_periodo_id: periodoId,
          data_inicio: dataInicio,
          motivo_operacional: motivoOperacional.trim(),
          motivo_categoria: motivoCategoria,
          e_erro_supervisor: eErroSupervisor === null ? undefined : eErroSupervisor,
          updated_at_check: ausencia.updated_at,
          cid: podeVerCid && cid.trim() ? cid.trim().toUpperCase() : null,
          arquivo,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Ausência retificada", {
        description: `Protocolo ${res.protocolo ?? "—"} mantido · novo tipo: ${res.tipo_novo}`,
      });
      queryClient.invalidateQueries({ queryKey: ["ausencias"] });
      queryClient.invalidateQueries({ queryKey: ["ausencia_retificacoes"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error("Não foi possível retificar", {
        description: err instanceof Error ? err.message : String(err),
      });
      setConfirmando(false);
    },
  });

  if (!ausencia) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Retificar ausência
          </DialogTitle>
          <DialogDescription>
            O lançamento original é preservado: mesmo protocolo, mesmo colaborador e histórico
            completo.
          </DialogDescription>
        </DialogHeader>

        {/* Dados imutáveis */}
        <div className="grid gap-3 rounded-xl border bg-muted/40 p-4 sm:grid-cols-2">
          <ReadOnly label="Colaborador" value={nomeColaborador} />
          <ReadOnly label="Protocolo" value={ausencia.protocolo ?? "—"} />
          <ReadOnly label="Empresa" value={ausencia.empresa?.nome ?? "—"} />
          <ReadOnly label="Projeto" value={ausencia.projeto?.nome ?? "—"} />
          <ReadOnly label="Tipo atual" value={ausencia.tipo_ausencia_nome ?? "—"} />
          <ReadOnly
            label="Período atual"
            value={`${ausencia.opcao_periodo_nome ?? "—"} · ${fmtDate(ausencia.data_inicio)} → ${fmtDate(ausencia.data_fim)}`}
          />
        </div>

        {/* Janela de 24h */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            bloqueadoPorPrazo
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-primary/20 bg-primary/5 text-foreground"
          }`}
        >
          <Clock className="h-4 w-4 shrink-0" />
          {podeIgnorarPrazo ? (
            <span>Seu perfil pode retificar sem limite de prazo.</span>
          ) : bloqueadoPorPrazo ? (
            <span>Janela de 24 horas expirada. Solicite a correção ao RH ou Super Admin.</span>
          ) : (
            <span>
              Tempo restante da janela de 24 horas:{" "}
              <strong>{formatarRestante(prazo?.restanteMs ?? 0)}</strong>
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Novo tipo de ausência</Label>
            <Select
              value={tipoId}
              onValueChange={(v) => {
                setTipoId(v);
                setPeriodoId("");
              }}
              disabled={bloqueadoPorPrazo}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {(tiposQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Período</Label>
            <Select
              value={periodoId}
              onValueChange={setPeriodoId}
              disabled={bloqueadoPorPrazo || !tipoId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                {(periodosQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data inicial</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              disabled={bloqueadoPorPrazo}
            />
          </div>

          {podeVerCid && tipoSelecionado?.permite_cid && (
            <div className="space-y-2">
              <Label>CID (opcional)</Label>
              <Input
                value={cid}
                onChange={(e) => setCid(e.target.value)}
                placeholder="Ex.: J06"
                maxLength={20}
                disabled={bloqueadoPorPrazo}
              />
            </div>
          )}

          {tipoSelecionado?.exige_documento && (
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Documento (obrigatório para este tipo)
              </Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={bloqueadoPorPrazo}
              />
              {!file && ausencia.arquivo_url && (
                <p className="text-xs text-muted-foreground">
                  Documento já anexado será mantido se nenhum novo arquivo for enviado.
                </p>
              )}
              {!file && !ausencia.arquivo_url && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Anexe o documento para concluir.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label>Motivo da retificação</Label>
            <Select value={motivoCategoria} onValueChange={setMotivoCategoria} disabled={bloqueadoPorPrazo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo estruturado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DATA_PERIODO_INCORRETO">Data/período incorreto</SelectItem>
                <SelectItem value="TIPO_INCORRETO">Tipo de ausência incorreto</SelectItem>
                <SelectItem value="ERRO_DIGITACAO_SUPERVISOR">Erro de digitação do supervisor</SelectItem>
                <SelectItem value="DOCUMENTO_INCORRETO">Documento incorreto</SelectItem>
                <SelectItem value="DUPLICIDADE">Duplicidade</SelectItem>
                <SelectItem value="LANCAMENTO_INDEVIDO">Lançamento indevido</SelectItem>
                <SelectItem value="OUTRO">Outro motivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Justificativa detalhada</Label>
            <Textarea
              rows={3}
              value={motivoOperacional}
              onChange={(e) => setMotivoOperacional(e.target.value)}
              placeholder="Descreva o motivo real da alteração..."
              maxLength={500}
              disabled={bloqueadoPorPrazo}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo de 10 caracteres. Fica registrado no histórico protegido.
            </p>
          </div>
        </div>

        {mudouAlgo && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
              <ShieldCheck className="h-4 w-4" /> Resumo das alterações
            </h4>
            <div className="space-y-2">
              {tipoId !== (ausencia.tipo_ausencia_id ?? "") && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tipo</span>
                  <div className="flex items-center gap-2 font-medium">
                    <span className="line-through opacity-50">{ausencia.tipo_ausencia_nome}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{tipoSelecionado?.nome}</span>
                  </div>
                </div>
              )}
              {periodoId !== (ausencia.opcao_periodo_id ?? "") && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Período</span>
                  <div className="flex items-center gap-2 font-medium">
                    <span className="line-through opacity-50">{ausencia.opcao_periodo_nome}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{periodosQ.data?.find(p => p.id === periodoId)?.nome}</span>
                  </div>
                </div>
              )}
              {dataInicio !== ausencia.data_inicio && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Data inicial</span>
                  <div className="flex items-center gap-2 font-medium">
                    <span className="line-through opacity-50">{fmtDate(ausencia.data_inicio)}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>{fmtDate(dataInicio)}</span>
                  </div>
                </div>
              )}
              {file && (
                <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400">
                  <span>Novo documento</span>
                  <span className="font-medium">{file.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {(historicoQ.data?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4" /> Linha do tempo
              </p>
              <ol className="space-y-3 border-l pl-4">
                {(historicoQ.data ?? []).map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{h.tipo_anterior_nome ?? "—"}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge>{h.tipo_novo_nome ?? "—"}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.retificado_em).toLocaleString("pt-BR")} · {h.papel_usuario}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{h.motivo_operacional}</p>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          {confirmando ? (
            <Button onClick={() => mut.mutate()} disabled={!podeSalvar || mut.isPending}>
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar retificação
            </Button>
          ) : (
            <Button onClick={() => setConfirmando(true)} disabled={!podeSalvar}>
              Revisar e salvar
            </Button>
          )}
        </DialogFooter>
        {confirmando && !mut.isPending && (
          <p className="text-right text-xs text-muted-foreground">
            Confirme para aplicar a retificação. O protocolo permanece o mesmo.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
