export function onlyDigits(v) {
    return (v ?? "").replace(/\D/g, "");
}
export function formatCPF(v) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length !== 11)
        return d;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}
export function formatTelefone(v) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length === 11)
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10)
        return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
}
/** Validação de CPF (dígitos verificadores). */
export function isValidCPF(v) {
    const cpf = onlyDigits(v);
    if (cpf.length !== 11)
        return false;
    if (/^(\d)\1{10}$/.test(cpf))
        return false;
    let sum = 0;
    for (let i = 0; i < 9; i++)
        sum += parseInt(cpf[i]) * (10 - i);
    let d1 = (sum * 10) % 11;
    if (d1 === 10)
        d1 = 0;
    if (d1 !== parseInt(cpf[9]))
        return false;
    sum = 0;
    for (let i = 0; i < 10; i++)
        sum += parseInt(cpf[i]) * (11 - i);
    let d2 = (sum * 10) % 11;
    if (d2 === 10)
        d2 = 0;
    return d2 === parseInt(cpf[10]);
}
