// Cálculos da carteira. Usado pelo app (index.html) e pelo teste (calc.test.js).

// ops: [{data:'2026-10-19', ticker, tipo:'C'|'V', qtd, preco}]
// precos: {TICKER: preço atual}
function posicoes(ops, precos) {
  const pos = {};
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    const p = pos[o.ticker] ||= { ticker: o.ticker, qtd: 0, investido: 0, realizado: 0, custoVendido: 0, vendido: 0, qtdVendida: 0 };
    p.classe = o.classe || p.classe; // 'A' ação / 'F' fundo; vale o último lançamento que informou
    p.fim = o.data; // data da última operação (para encerrados: quando foi encerrado)
    if (o.tipo === 'C') {
      p.qtd += o.qtd;
      p.investido += o.qtd * o.preco;
    } else {
      const pm = p.investido / p.qtd;
      p.realizado += (o.preco - pm) * o.qtd;
      p.custoVendido += pm * o.qtd;
      p.vendido += o.preco * o.qtd;
      p.qtdVendida += o.qtd;
      p.investido -= pm * o.qtd;
      p.qtd -= o.qtd;
      if (p.qtd === 0) p.investido = 0; // evita resíduo de arredondamento
    }
  });
  return Object.values(pos).map(p => {
    const encerrado = p.qtd === 0;
    const preco = precos[p.ticker];
    const pm = encerrado ? null : p.investido / p.qtd;
    const valor = encerrado || preco == null ? null : p.qtd * preco;
    const lucro = encerrado ? p.realizado : valor == null ? null : valor - p.investido;
    const base = encerrado ? p.custoVendido : p.investido;
    return { ...p, encerrado, pm, preco, valor, lucro, pct: lucro == null ? null : lucro / base };
  });
}

// IR sobre o lucro de um ativo encerrado: BDR/ação 15% (BDR não tem a isenção de R$ 20 mil); prejuízo não paga.
// Fundo: null = IR retido na fonte pelo próprio fundo.
// shortcut: não compensa prejuízos de outros meses nem day trade (20%); para isso, apurar por mês num ledger de IR.
const irDe = p => p.classe === 'F' ? null : Math.max(0, p.lucro) * 0.15;

// Quantidade em carteira de um ticker numa data (para validar vendas)
function qtdEm(ops, ticker, data) {
  return ops.filter(o => o.ticker === ticker && o.data <= data)
    .reduce((s, o) => s + (o.tipo === 'C' ? o.qtd : -o.qtd), 0);
}

// historico: [{data, v:{TICKER:[valor, investido]}}] -> lucro de cada mês por ticker
// Lucro do mês = lucro acumulado no último registro do ativo no mês - lucro acumulado no fim do mês anterior.
// (por ativo: um ativo vendido no meio do mês some dos registros seguintes)
function mensal(historico) {
  const h = [...historico].sort((a, b) => a.data.localeCompare(b.data));
  const fimDoMes = {}; // mês -> {ticker: [valor, investido]}
  h.forEach(s => Object.assign(fimDoMes[s.data.slice(0, 7)] ||= {}, s.v));
  const meses = Object.keys(fimDoMes).sort();
  const acum = {}; // último lucro acumulado conhecido por ticker
  return meses.map(m => {
    const linhas = {};
    let lucro = 0, investido = 0;
    Object.entries(fimDoMes[m]).forEach(([t, [valor, inv]]) => {
      const l = valor - inv;
      linhas[t] = { lucro: l - (acum[t] || 0), pct: (l - (acum[t] || 0)) / inv, inv };
      acum[t] = l;
      lucro += linhas[t].lucro;
      investido += inv;
    });
    return { mes: m, linhas, lucro, pct: lucro / investido };
  });
}

// Data do pregão (AAAA-MM-DD) de uma cotação. O brapi marca o fechamento com a hora em que
// atualizou os dados (ex.: 01h37 do dia seguinte); antes das 10h de Brasília ainda é o pregão anterior.
// shortcut: pula só fim de semana, não feriados da B3; num feriado o fechamento do dia anterior cai no feriado.
function pregaoDe(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, p.month - 1, +p.day));
  if (+p.hour < 10) d.setUTCDate(d.getUTCDate() - 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Cor do % de lucro por dia, como a formatação condicional da aba "Agora Investimentos" da planilha.
// vals: % em ordem cronológica (null = sem posição no dia). Devolve, por dia:
// 'neg' negativo · 'rec' recorde (maior % de todos, última vez que ocorreu) ·
// 'sobe' positivo e maior que o dia anterior · 'desce' positivo e menor ou igual · '' zero/vazio
function tendencia(vals) {
  const max = Math.max(...vals.filter(v => v != null)), ultMax = vals.lastIndexOf(max);
  return vals.map((v, i) => v == null || v === 0 ? '' : v < 0 ? 'neg' : i === ultMax ? 'rec'
    : (vals[i - 1] != null && v > vals[i - 1]) || v === max ? 'sobe' : 'desce');
}

// --- Senha do app: guarda só o hash (PBKDF2), nunca a senha ---
const b64 = u8 => btoa(String.fromCharCode(...u8));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));
async function hashSenha(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deB64(sal), iterations: 150000 }, chave, 256);
  return b64(new Uint8Array(bits));
}
// cria {sal, hash} para guardar
async function protegerSenha(senha) { const sal = b64(aleatorio(16)); return { sal, hash: await hashSenha(senha, sal) }; }
async function confereSenha(senha, g) { return !!g && await hashSenha(senha, g.sal) === g.hash; }
// código de recuperação: 12 letras/números sem os que se confundem (0/O, 1/I/L), ex.: 7K3P-9QXM-2B4T
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => [...aleatorio(12)].map(x => LETRAS[x % LETRAS.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
const limpaCodigo = c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''); // aceita com ou sem traços/espaços

if (typeof module !== 'undefined') module.exports = { posicoes, qtdEm, irDe, mensal, pregaoDe, tendencia,
  protegerSenha, confereSenha, gerarCodigo, limpaCodigo };
