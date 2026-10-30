// Cálculos da carteira. Usado pelo app (index.html) e pelo teste (calc.test.js).

// ops: [{data:'2026-10-19', ticker, tipo:'C'|'V', qtd, preco}]
// precos: {TICKER: preço atual}
function posicoes(ops, precos) {
  const pos = {};
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    // inicio: data da primeira compra
    const p = pos[o.ticker] ||= { ticker: o.ticker, inicio: o.data, qtd: 0, investido: 0, realizado: 0, custoVendido: 0, vendido: 0, qtdVendida: 0 };
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

// Aba Resultados: cada posição encerrada (da compra que a abriu até a venda que a zerou), com os mesmos campos de
// posicoes(). Um ativo vendido por completo e comprado de novo continua com a posição antiga aqui; a nova (aberta) não
// entra. Não muda a carteira: posicoes() segue igual para as posições abertas.
function ciclosEncerrados(ops) {
  const atual = {}, fechados = [];
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    const c = atual[o.ticker] ||= { ops: [], q: 0 };
    c.ops.push(o); c.q += o.tipo === 'C' ? o.qtd : -o.qtd;
    if (c.q === 0) { fechados.push(posicoes(c.ops, {})[0]); delete atual[o.ticker]; }
  });
  return fechados;
}

// IR sobre o lucro de um ativo encerrado: BDR/ação 15% (BDR não tem a isenção de R$ 20 mil); prejuízo não paga.
// Fundo: null = IR retido na fonte pelo próprio fundo.
// shortcut: não compensa prejuízos de outros meses nem day trade (20%); para isso, apurar por mês num ledger de IR.
const irDe = p => p.classe === 'F' ? null : Math.max(0, p.lucro) * 0.15;

// Vendas com o lucro realizado e o custo das ações vendidas, em ordem de data (Gráficos → "Incluir realizados")
function realizados(ops) {
  const pos = {}, eventos = [];
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    const p = pos[o.ticker] ||= { qtd: 0, inv: 0 };
    if (o.tipo === 'C') { p.qtd += o.qtd; p.inv += o.qtd * o.preco; return; }
    const pm = p.inv / p.qtd;
    eventos.push({ data: o.data, ticker: o.ticker, realizado: (o.preco - pm) * o.qtd, custo: pm * o.qtd });
    p.inv -= pm * o.qtd; p.qtd -= o.qtd; if (p.qtd === 0) p.inv = 0;
  });
  return eventos;
}

// Quantidade em carteira de um ticker numa data (para validar vendas)
function qtdEm(ops, ticker, data) {
  return ops.filter(o => o.ticker === ticker && o.data <= data)
    .reduce((s, o) => s + (o.tipo === 'C' ? o.qtd : -o.qtd), 0);
}

// historico: [{data, v:{TICKER:[valor, investido]}}] -> lucro de cada mês por ticker
// Lucro do mês = lucro acumulado no último registro do ativo no mês - lucro acumulado no fim do mês anterior.
// (por ativo: um ativo vendido no meio do mês some dos registros seguintes)
// ops (opcional): com vendas parciais, o lucro acumulado de um ativo ainda em carteira soma o que já foi realizado
// nessas vendas (o registro do dia só guarda a parte que sobrou); sem isso a venda parcial pareceria prejuízo.
// Ativo zerado não precisa: o registro dele já guarda o resultado total das vendas.
function mensal(historico, ops = []) {
  const h = [...historico].sort((a, b) => a.data.localeCompare(b.data));
  const fimDoMes = {}; // mês -> {ticker: [valor, investido, data do registro]}
  h.forEach(s => { const m = fimDoMes[s.data.slice(0, 7)] ||= {}; for (const [t, x] of Object.entries(s.v)) m[t] = [x[0], x[1], s.data]; });
  const vendas = realizados(ops);
  const realizadoAte = (t, d) => qtdEm(ops, t, d) > 0 ? vendas.filter(e => e.ticker === t && e.data <= d).reduce((a, e) => a + e.realizado, 0) : 0;
  const meses = Object.keys(fimDoMes).sort();
  const acum = {}; // último lucro acumulado conhecido por ticker
  return meses.map(m => {
    const linhas = {};
    let lucro = 0, investido = 0;
    Object.entries(fimDoMes[m]).forEach(([t, [valor, inv, d]]) => {
      const l = valor - inv + realizadoAte(t, d);
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

// Início da posição aberta de cada ativo: a primeira compra depois da última vez que a quantidade zerou (ou a
// primeira compra, se nunca zerou). Só ativos com posição aberta hoje. Mensal → "Ativos Abertos" ignora o que veio antes.
function inicioCiclo(ops) {
  const q = {}, ini = {};
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    if (!q[o.ticker]) ini[o.ticker] = o.data; // quantidade zerada (ou primeira operação): começa uma posição nova
    q[o.ticker] = (q[o.ticker] || 0) + (o.tipo === 'C' ? o.qtd : -o.qtd);
  });
  return Object.fromEntries(Object.entries(ini).filter(([t]) => q[t] > 0));
}

// Aba Compar.: último encerramento de cada ativo (a venda que zerou a posição) e o preço médio das vendas desse dia.
// Ativo zerado mais de uma vez aparece uma vez só, com o último encerramento (mesmo que hoje esteja recomprado).
// Devolve [{ticker, data, preco}] do encerramento mais antigo para o mais recente.
function encerramentos(ops) {
  const qtd = {}, ult = {};
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    qtd[o.ticker] = (qtd[o.ticker] || 0) + (o.tipo === 'C' ? o.qtd : -o.qtd);
    if (o.tipo !== 'V' || qtd[o.ticker] !== 0) return;
    const vendas = ops.filter(v => v.ticker === o.ticker && v.tipo === 'V' && v.data === o.data);
    const q = vendas.reduce((s, v) => s + v.qtd, 0);
    ult[o.ticker] = { ticker: o.ticker, data: o.data, preco: vendas.reduce((s, v) => s + v.qtd * v.preco, 0) / q };
  });
  return Object.values(ult).sort((a, b) => a.data.localeCompare(b.data) || a.ticker.localeCompare(b.ticker));
}

// Resultado do dia de um conjunto de ativos (Resumo, Carteira e Diário): para cada ativo, lucro agora − lucro do
// registro anterior, mas só se ele estava em carteira nesse registro (vivoAntes); ativo comprado depois (ou recomprado
// depois de zerado) conta o lucro desde a compra. Ativo sem registro agora (vendido antes) não entra.
// atual/anterior: {TICKER: [valor, investido]}. base = valor anterior + dinheiro novo aplicado (% = r / base).
// shortcut: na venda parcial no dia, o lucro realizado dessa venda não entra no resultado do dia.
function resultadoDia(atual, anterior, vivoAntes) {
  let r = 0, base = 0;
  const ts = Object.keys(atual);
  for (const t of ts) {
    const [v, inv] = atual[t], a = anterior[t] && vivoAntes(t) ? anterior[t] : null;
    r += v - inv - (a ? a[0] - a[1] : 0);
    base += a ? a[0] + Math.max(0, inv - a[1]) : inv;
  }
  return ts.length ? { r, base, p: base ? r / base : null } : null;
}

// Atualização automática dos índices (HG) só em dia útil, das 10h00 às 18h00 de Brasília.
// shortcut: não conhece os feriados da B3; num feriado em dia útil ela roda à toa (só gasta cota).
function horarioAuto(data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(data).map(x => [x.type, x.value]));
  const min = +p.hour * 60 + +p.minute;
  return !['Sat', 'Sun'].includes(p.weekday) && min >= 10 * 60 && min <= 18 * 60;
}

// Dia (AAAA-MM-DD, horário de Brasília) de um candle do brapi (date em segundos unix)
const diaBR = seg => new Date(seg * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
// Aba Dash.: variações sobre fechamentos (null quando falta o fechamento de base).
// semana: preço atual sobre o último fechamento antes da segunda-feira desta semana (de segunda a sexta; no sábado e
//   no domingo, a semana que acabou). Na segunda-feira ainda mostra a semana anterior inteira, fechada na sexta.
// mes: preço atual sobre o último fechamento antes do dia 1º deste mês.
// mesAnt: mês anterior inteiro = último fechamento do mês anterior sobre o último fechamento antes dele.
// hist: historicalDataPrice do brapi [{date, close}]; hoje: 'AAAA-MM-DD'.
function variacoes(preco, hist, hoje) {
  const desloca = (iso, dias) => { const x = new Date(iso + 'T12:00Z'); x.setUTCDate(x.getUTCDate() + dias); return x.toISOString().slice(0, 10); };
  const dow = new Date(hoje + 'T12:00Z').getUTCDay();
  const segunda = desloca(hoje, -(dow === 0 ? 6 : dow - 1)), dia1 = hoje.slice(0, 8) + '01';
  const m = new Date(dia1 + 'T12:00Z'); m.setUTCMonth(m.getUTCMonth() - 1);
  const dias = hist.filter(h => h.close != null).map(h => [diaBR(h.date), h.close]).sort((x, y) => x[0].localeCompare(y[0]));
  const antes = lim => dias.filter(([dd]) => dd < lim).pop()?.[1] ?? null; // último fechamento antes do dia lim
  const varia = (fim, ini) => fim != null && ini != null ? fim / ini - 1 : null;
  return {
    semana: dow === 1 ? varia(antes(segunda), antes(desloca(segunda, -7))) : varia(preco, antes(segunda)),
    mes: varia(preco, antes(dia1)),
    mesAnt: varia(antes(dia1), antes(m.toISOString().slice(0, 10))),
  };
}

// --- Senha do app: guarda só o hash (PBKDF2), nunca a senha ---
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); }; // em pedaços: o backup cifrado pode ser grande
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

// --- Backup protegido com a senha do app ---
// A chave do backup é tirada da senha com o mesmo PBKDF2 (hashSenha), mas com um sal próprio, diferente do da entrada.
// O arquivo leva o sal (para tirar a chave de novo a partir da senha) e é cifrado com AES-GCM de 256 bits.
const chaveAes = (chave, uso) => crypto.subtle.importKey('raw', deB64(chave), 'AES-GCM', false, [uso]);
async function cifrar(texto, chave) {
  const iv = aleatorio(12);
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAes(chave, 'encrypt'), new TextEncoder().encode(texto));
  return { iv: b64(iv), dados: b64(new Uint8Array(c)) };
}
async function decifrar({ iv, dados }, chave) { // chave errada → erro (o AES-GCM confere a integridade)
  const t = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await chaveAes(chave, 'decrypt'), deB64(dados));
  return new TextDecoder().decode(t);
}

if (typeof module !== 'undefined') module.exports = { posicoes, qtdEm, irDe, realizados, mensal, pregaoDe, tendencia, variacoes, horarioAuto, resultadoDia, encerramentos, inicioCiclo, ciclosEncerrados,
  protegerSenha, confereSenha, gerarCodigo, limpaCodigo, hashSenha, cifrar, decifrar, b64, aleatorio };
