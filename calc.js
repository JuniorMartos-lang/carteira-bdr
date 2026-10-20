// Cálculos da carteira. Usado pelo app (index.html) e pelo teste (calc.test.js).

// ops: [{data:'2026-10-19', ticker, tipo:'C'|'V', qtd, preco}]
// precos: {TICKER: preço atual}
function posicoes(ops, precos) {
  const pos = {};
  [...ops].sort((a, b) => a.data.localeCompare(b.data)).forEach(o => {
    const p = pos[o.ticker] ||= { ticker: o.ticker, qtd: 0, investido: 0, realizado: 0, custoVendido: 0 };
    p.classe = o.classe || p.classe; // 'A' ação / 'F' fundo; vale o último lançamento que informou
    if (o.tipo === 'C') {
      p.qtd += o.qtd;
      p.investido += o.qtd * o.preco;
    } else {
      const pm = p.investido / p.qtd;
      p.realizado += (o.preco - pm) * o.qtd;
      p.custoVendido += pm * o.qtd;
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
      linhas[t] = { lucro: l - (acum[t] || 0), pct: (l - (acum[t] || 0)) / inv };
      acum[t] = l;
      lucro += linhas[t].lucro;
      investido += inv;
    });
    return { mes: m, linhas, lucro, pct: lucro / investido };
  });
}

if (typeof module !== 'undefined') module.exports = { posicoes, qtdEm, mensal };
