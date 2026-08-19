import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getSupportStats, getTicketsByModule } from "@/lib/support.functions";
import { 
  BarChart3, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  FileWarning,
  MessageSquare
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export const Route = createFileRoute('/_authenticated/suporte/dashboard')({
  component: SupportDashboardPage,
});

function SupportDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['support-dashboard-stats'],
    queryFn: () => getSupportStats(),
    refetchInterval: 30000,
  });

  const { data: moduleData = [], isLoading: moduleLoading } = useQuery({
    queryKey: ['support-module-stats'],
    queryFn: () => getTicketsByModule(),
  });


  const kpis = [
    { 
      label: "Chamados Abertos", 
      value: stats?.abertos || 0, 
      icon: MessageSquare, 
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20"
    },
    { 
      label: "Em Atendimento", 
      value: stats?.em_atendimento || 0, 
      icon: Clock, 
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-900/20"
    },
    { 
      label: "Sem Responsável", 
      value: stats?.sem_responsavel || 0, 
      icon: AlertTriangle, 
      color: "text-destructive",
      bg: "bg-red-50 dark:bg-red-900/20"
    },
    { 
      label: "Resolvidos Hoje", 
      value: stats?.resolvidos_hoje || 0, 
      icon: CheckCircle2, 
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-900/20"
    }
  ];

  const formatTime = (seconds: number | null) => {
    if (!seconds) return "--";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <AppShell title="Dashboard de Suporte" breadcrumb={["Suporte", "Dashboard"]}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Gestão Operacional de Suporte</h1>
          <p className="text-muted-foreground text-sm">Monitoramento de SLAs e saúde dos módulos em tempo real.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="border-none shadow-sm overflow-hidden group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-70">
                      {kpi.label}
                    </p>
                    <p className="text-3xl font-black">{kpi.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${kpi.bg} ${kpi.color} transition-transform group-hover:scale-110`}>
                    <kpi.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                TEMPO MÉDIO DE PRIMEIRA RESPOSTA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">
                {formatTime(stats?.avg_first_response_seconds ?? null)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Meta: &lt; 4h (Prioridade Normal)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                TEMPO MÉDIO DE RESOLUÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">
                {formatTime(stats?.avg_resolution_seconds ?? null)}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Meta: &lt; 24h (Prioridade Normal)
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-bold">VOLUMETRIA POR MÓDULO</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleData.length > 0 ? moduleData : [
                  { name: 'Nova Ausência', value: 0 },
                  { name: 'Retificação', value: 0 },
                  { name: 'Ocorrência', value: 0 },
                  { name: 'Processamento', value: 0 },
                  { name: 'Permissão', value: 0 },
                ]}>

                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                  <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">STATUS DE SLA</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'No Prazo', value: 70 },
                      { name: 'Atenção', value: 20 },
                      { name: 'Atrasado', value: 10 },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 w-full gap-2 text-[10px] text-center font-bold">
                <div className="text-emerald-500">NO PRAZO</div>
                <div className="text-amber-500">ATENÇÃO</div>
                <div className="text-red-500">ATRASADO</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
