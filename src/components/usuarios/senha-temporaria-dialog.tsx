import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { definirSenhaTemporariaUsuario } from "@/lib/usuarios.functions";

type Alvo = { id: string; nome: string; email: string };

const ALPHABET = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?-_";

function gerarSenhaForte(len = 16): string {
  const all = ALPHABET + UPPER + DIGITS + SYMBOLS;
  const req = [
    ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    UPPER[Math.floor(Math.random() * UPPER.length)],
    DIGITS[Math.floor(Math.random() * DIGITS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];
  const rest = Array.from({ length: Math.max(0, len - req.length) }, () =>
    all[Math.floor(Math.random() * all.length)],
  );
  return [...req, ...rest].sort(() => Math.random() - 0.5).join("");
}

function evaluate(pw: string) {
  const checks = [
    { label: "≥ 8 caracteres", ok: pw.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(pw) },
    { label: "Letra minúscula", ok: /[a-z]/.test(pw) },
    { label: "Número", ok: /\d/.test(pw) },
    { label: "Caractere especial", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score };
}

export function SenhaTemporariaDialog({
  alvo,
  onClose,
}: {
  alvo: Alvo | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const definirFn = useServerFn(definirSenhaTemporariaUsuario);

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aceite, setAceite] = useState(false);

  const [revealSenha, setRevealSenha] = useState<string | null>(null);
  const [reveladaCopiada, setReveladaCopiada] = useState(false);

  const { checks, score } = useMemo(() => evaluate(senha), [senha]);
  const forca =
    score <= 2
      ? { label: "Fraca", cls: "bg-destructive" }
      : score <= 3
        ? { label: "Média", cls: "bg-amber-500" }
        : score === 4
          ? { label: "Boa", cls: "bg-emerald-500" }
          : { label: "Forte", cls: "bg-emerald-600" };

  const mismatch = confirmar.length > 0 && confirmar !== senha;
  const podeSubmeter =
    !!alvo && score >= 4 && !mismatch && aceite && senha === confirmar && senha.length >= 8;

  const mut = useMutation({
    mutationFn: async () => {
      if (!alvo) throw new Error("Usuário não selecionado");
      const senhaGerada = senha;
      await definirFn({
        data: {
          id: alvo.id,
          nova_senha: senhaGerada,
          motivo: motivo.trim() || null,
        },
      });
      return senhaGerada;
    },
    onSuccess: (senhaExibida) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setRevealSenha(senhaExibida);
      setSenha("");
      setConfirmar("");
      setMotivo("");
      setAceite(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function fechar() {
    setSenha("");
    setConfirmar("");
    setMotivo("");
    setAceite(false);
    setRevealSenha(null);
    setReveladaCopiada(false);
    onClose();
  }

  async function copiar() {
    if (!revealSenha) return;
    try {
      await navigator.clipboard.writeText(revealSenha);
      setReveladaCopiada(true);
      toast.success("Senha copiada para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  const open = !!alvo;

  // Diálogo de revelação (uma única vez, isolado do form)
  if (open && revealSenha) {
    return (
      <Dialog open onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Senha temporária definida
            </DialogTitle>
            <DialogDescription>
              Copie e entregue esta senha ao usuário por um canal seguro. Ela não poderá ser
              consultada novamente depois que você fechar esta janela.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-muted/40 p-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Nova senha temporária
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 select-all rounded bg-background/60 px-2 py-1.5 font-mono text-sm">
                  {revealSenha}
                </code>
                <Button size="sm" variant="secondary" onClick={copiar} className="gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            </div>
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Entrega segura</AlertTitle>
              <AlertDescription className="text-xs">
                Entregue pessoalmente ou por canal criptografado. O usuário será obrigado a criar
                uma senha pessoal no próximo login.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button onClick={fechar} disabled={!reveladaCopiada && !revealSenha}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Definir nova senha temporária
          </DialogTitle>
          <DialogDescription>
            Substitui a senha atual do usuário e força a troca no próximo login. Senhas anteriores
            nunca podem ser recuperadas.
          </DialogDescription>
        </DialogHeader>

        {alvo && (
          <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            <div className="font-medium">{alvo.nome}</div>
            <div className="text-xs text-muted-foreground">{alvo.email}</div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nova-senha-temp">Nova senha temporária</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  const g = gerarSenhaForte(16);
                  setSenha(g);
                  setConfirmar(g);
                  setShowPw(true);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerar senha forte
              </Button>
            </div>
            <div className="relative">
              <Input
                id="nova-senha-temp"
                type={showPw ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {senha.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${forca.cls} transition-all`}
                      style={{ width: `${(score / 5) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-muted-foreground">{forca.label}</span>
                </div>
                <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5">
                      {c.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmar-senha-temp">Confirmar senha temporária</Label>
            <Input
              id="confirmar-senha-temp"
              type={showPw ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
              aria-invalid={mismatch}
            />
            {mismatch && (
              <p className="text-xs text-destructive">As senhas não coincidem.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo-senha">Motivo (opcional)</Label>
            <Textarea
              id="motivo-senha"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: solicitação por telefone, usuário esqueceu senha, etc."
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <Checkbox
              id="aceite-senha"
              checked={aceite}
              onCheckedChange={(v) => setAceite(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="aceite-senha" className="text-xs leading-relaxed">
              Entendo que esta senha será exibida apenas agora e deverá ser entregue ao usuário por
              canal seguro. O usuário será obrigado a trocá-la no próximo login.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!podeSubmeter || mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Definir senha temporária
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
