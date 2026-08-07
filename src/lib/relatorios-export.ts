import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export type ExportFormat = "xlsx" | "csv" | "pdf";

export type ReportSection = {
  title: string;
  rows: Record<string, string | number>[];
};

export type ReportPayload = {
  id: string;
  nome: string;
  filtrosLabel: Record<string, string>;
  sections: ReportSection[];
  usuarioNome?: string | null;
};

function nowStamp() {
  return new Date().toLocaleString("pt-BR");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function auditExport(payload: ReportPayload, formato: ExportFormat) {
  try {
    const res = (payload as any).rawResponse;
    const observacoes = [
      `Formato=${formato}`,
      `Filtros=${JSON.stringify(payload.filtrosLabel)}`,
      res ? `Disponível=${res.total_registros_disponiveis || 0}` : null,
      res ? `Exportado=${res.total_registros_exportados || 0}` : null,
      res?.is_truncated ? "Status=TRUNCADO" : "Status=COMPLETO"
    ].filter(Boolean).join(" · ");

    await supabase.from("audit_logs" as never).insert({
      modulo: "relatorios",
      entidade: payload.id,
      acao: "EXPORTACAO" as never,
      observacoes,
      origem: "relatorios",
      sucesso: true,
    } as never);
  } catch (e) {
    console.warn("[audit relatorios]", e);
  }
}

function exportXLSX(p: ReportPayload) {
  const wb = XLSX.utils.book_new();
  const meta = [
    { Campo: "Relatório", Valor: p.nome },
    { Campo: "Emitido em", Valor: nowStamp() },
    { Campo: "Emissor", Valor: p.usuarioNome ?? "" },
    ...Object.entries(p.filtrosLabel).map(([k, v]) => ({ Campo: k, Valor: v })),
  ];
  const capa = XLSX.utils.json_to_sheet(meta);
  XLSX.utils.book_append_sheet(wb, capa, "Cabeçalho");

  for (const s of p.sections) {
    const rows = s.rows.length ? s.rows : [{ Info: "Sem dados" }];
    const sheet = XLSX.utils.json_to_sheet(rows);
    
    // Qualidade Visual e Funcional do Excel
    sheet["!autofilter"] = { ref: sheet["!ref"] ?? "A1" };
    // Congelamento da primeira linha (cabeçalho)
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
    
    // Ajuste básico de largura (heurística simples)
    if (rows.length > 0 && typeof rows[0] === 'object') {
      const cols = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, 12) }));
      sheet["!cols"] = cols;
    }

    const name = s.title.slice(0, 28).replace(/[\\/*?[\]:]/g, "_");
    XLSX.utils.book_append_sheet(wb, sheet, name || "Dados");
  }
  XLSX.writeFile(wb, `absenteismo_${todayISO()}.xlsx`);
}

function exportCSV(p: ReportPayload) {
  const lines: string[] = [];
  lines.push(`Relatório,${p.nome}`);
  lines.push(`Emitido,${nowStamp()}`);
  lines.push(`Emissor,${p.usuarioNome ?? ""}`);
  for (const [k, v] of Object.entries(p.filtrosLabel)) lines.push(`${k},${v}`);
  lines.push("");
  for (const s of p.sections) {
    lines.push(`# ${s.title}`);
    if (!s.rows.length) {
      lines.push("Sem dados");
    } else {
      const headers = Object.keys(s.rows[0]);
      lines.push(headers.join(","));
      for (const r of s.rows) {
        lines.push(headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
      }
    }
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.id}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(p: ReportPayload) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const drawHeader = () => {
    // Logo textual MK9
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin, margin - 20, 60, 28, 4, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("MK9", margin + 30, margin - 1, { align: "center" });
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(14);
    doc.text(p.nome, margin + 75, margin - 3);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(`Emitido: ${nowStamp()} · Emissor: ${p.usuarioNome ?? "-"}`, margin + 75, margin + 12);
    doc.setDrawColor(220);
    doc.line(margin, margin + 22, W - margin, margin + 22);
    y = margin + 36;
  };

  const drawFooter = (pageNum: number, total: number) => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${pageNum} de ${total}`, W - margin, H - 20, { align: "right" });
    doc.text("CRM MK9 · Relatório Oficial", margin, H - 20);
  };

  const ensureSpace = (h: number) => {
    if (y + h > H - 50) {
      doc.addPage();
      drawHeader();
    }
  };

  drawHeader();

  // Filtros
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.text("Filtros aplicados", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const entries = Object.entries(p.filtrosLabel);
  if (!entries.length) {
    doc.text("Nenhum filtro.", margin, y);
    y += 14;
  } else {
    for (const [k, v] of entries) {
      ensureSpace(14);
      doc.text(`• ${k}: ${v}`, margin, y);
      y += 12;
    }
  }
  y += 6;

  for (const s of p.sections) {
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text(s.title, margin, y);
    y += 14;
    doc.setTextColor(30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    if (!s.rows.length) {
      doc.text("Sem dados no período.", margin, y);
      y += 16;
      continue;
    }

    const headers = Object.keys(s.rows[0]);
    const colWidth = (W - margin * 2) / headers.length;
    // header
    ensureSpace(18);
    doc.setFillColor(240, 244, 250);
    doc.rect(margin, y - 10, W - margin * 2, 16, "F");
    doc.setFont("helvetica", "bold");
    headers.forEach((h, i) => doc.text(String(h), margin + 4 + i * colWidth, y));
    y += 12;
    doc.setFont("helvetica", "normal");
    for (const r of s.rows) {
      ensureSpace(14);
      headers.forEach((h, i) => {
        const txt = String(r[h] ?? "");
        const clipped = txt.length > 40 ? txt.slice(0, 39) + "…" : txt;
        doc.text(clipped, margin + 4 + i * colWidth, y);
      });
      y += 12;
    }
    y += 10;
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawFooter(i, total);
  }

  doc.save(`${p.id}-${todayISO()}.pdf`);
}

export async function exportReport(payload: ReportPayload, formato: ExportFormat) {
  if (formato === "xlsx") exportXLSX(payload);
  else if (formato === "csv") exportCSV(payload);
  else exportPDF(payload);
  await auditExport(payload, formato);
}
