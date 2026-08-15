import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
// Protege contra CSV Injection escapando prefixos executáveis.
export function safeCsvCell(v) {
    if (v === null || v === undefined)
        return "";
    const s = String(v);
    const trimmed = s.trimStart();
    const risky = trimmed.startsWith("=") || trimmed.startsWith("+") ||
        trimmed.startsWith("-") || trimmed.startsWith("@");
    const escaped = (risky ? "'" + s : s).replace(/"/g, '""');
    return `"${escaped}"`;
}
function stamp() {
    return new Date().toLocaleString("pt-BR");
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
export async function auditBIExport(formato, filtros) {
    try {
        await supabase
            .from("audit_logs")
            .insert({
            modulo: "bi_executivo",
            entidade: "bi-executivo",
            acao: "EXPORTACAO",
            observacoes: `Formato=${formato} · Filtros=${JSON.stringify(filtros)}`,
            origem: "bi_executivo",
            sucesso: true,
        });
    }
    catch (e) {
        console.warn("[audit bi]", e);
    }
}
function toXLSX(p) {
    const wb = XLSX.utils.book_new();
    const cab = [
        { Campo: "Relatório", Valor: p.nome },
        { Campo: "Emitido em", Valor: stamp() },
        { Campo: "Última atualização do BI", Valor: p.ultima_atualizacao ?? "—" },
        { Campo: "Build", Valor: p.build ?? "—" },
        ...Object.entries(p.filtros).map(([k, v]) => ({ Campo: k, Valor: v })),
    ];
    const capa = XLSX.utils.json_to_sheet(cab);
    XLSX.utils.book_append_sheet(wb, capa, "Resumo");
    for (const s of p.sections) {
        const rows = s.rows.length ? s.rows : [{ Info: "Sem dados" }];
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
        ws["!freeze"] = { xSplit: 0, ySplit: 1 };
        const name = s.title.slice(0, 28).replace(/[\\/*?[\]:]/g, "_") || "Dados";
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `bi-executivo-${today()}.xlsx`);
}
function toCSV(p) {
    const target = p.sections.find((s) => s.title === p.csvSection) ?? p.sections[0];
    if (!target)
        return;
    const rows = target.rows;
    const lines = [];
    lines.push(`Relatório,${safeCsvCell(p.nome)}`);
    lines.push(`Emitido,${safeCsvCell(stamp())}`);
    for (const [k, v] of Object.entries(p.filtros))
        lines.push(`${safeCsvCell(k)},${safeCsvCell(v)}`);
    lines.push("");
    if (rows.length === 0) {
        lines.push("Sem dados");
    }
    else {
        const headers = Object.keys(rows[0]);
        lines.push(headers.map(safeCsvCell).join(","));
        for (const r of rows)
            lines.push(headers.map((h) => safeCsvCell(r[h])).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bi-${(target.title || "dados").toLowerCase().replace(/\s+/g, "-")}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
function toPDF(p) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;
    const header = () => {
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(M, M - 20, 60, 28, 4, 4, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("MK9", M + 30, M - 1, { align: "center" });
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(13);
        doc.text(p.nome, M + 75, M - 3);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(90);
        doc.text(`Emitido: ${stamp()} · BI atualizado em: ${p.ultima_atualizacao ?? "—"} · Build: ${p.build ?? "—"}`, M + 75, M + 12);
        doc.setDrawColor(220);
        doc.line(M, M + 22, W - M, M + 22);
        y = M + 36;
    };
    const footer = (n, tot) => {
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Página ${n} de ${tot}`, W - M, H - 20, { align: "right" });
        doc.text("CRM MK9 · Relatório Executivo de Absenteísmo", M, H - 20);
    };
    const ensure = (h) => { if (y + h > H - 50) {
        doc.addPage();
        header();
    } };
    header();
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30);
    doc.text("Filtros aplicados", M, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const [k, v] of Object.entries(p.filtros)) {
        ensure(14);
        doc.text(`• ${k}: ${v}`, M, y);
        y += 12;
    }
    y += 6;
    for (const s of p.sections) {
        ensure(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(37, 99, 235);
        doc.text(s.title, M, y);
        y += 14;
        doc.setTextColor(30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        if (!s.rows.length) {
            doc.text("Dados insuficientes.", M, y);
            y += 16;
            continue;
        }
        const headers = Object.keys(s.rows[0]);
        const cw = (W - M * 2) / headers.length;
        ensure(18);
        doc.setFillColor(240, 244, 250);
        doc.rect(M, y - 10, W - M * 2, 16, "F");
        doc.setFont("helvetica", "bold");
        headers.forEach((h, i) => doc.text(String(h), M + 4 + i * cw, y));
        y += 12;
        doc.setFont("helvetica", "normal");
        for (const r of s.rows) {
            ensure(14);
            headers.forEach((h, i) => {
                const t = String(r[h] ?? "");
                doc.text(t.length > 34 ? t.slice(0, 33) + "…" : t, M + 4 + i * cw, y);
            });
            y += 12;
        }
        y += 10;
    }
    const tot = doc.getNumberOfPages();
    for (let i = 1; i <= tot; i++) {
        doc.setPage(i);
        footer(i, tot);
    }
    doc.save(`bi-executivo-${today()}.pdf`);
}
export async function exportBI(payload, formato) {
    if (formato === "PDF")
        toPDF(payload);
    else if (formato === "XLSX")
        toXLSX(payload);
    else
        toCSV(payload);
    await auditBIExport(formato, payload.filtros);
}
