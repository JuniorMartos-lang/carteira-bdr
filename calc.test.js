// Rodar com: node calc.test.js
const assert = require('assert');
const { posicoes, qtdEm, mensal, pregaoDe, tendencia } = require('./calc.js');
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

// Dois lotes do mesmo ticker viram uma posição com preço médio (caso SPCX34 + Aporte)
const ops = [
  { data: '2026-08-05', ticker: 'SPCX34', tipo: 'C', qtd: 100, preco: 40 },
  { data: '2026-10-07', ticker: 'SPCX34', tipo: 'C', qtd: 100, preco: 60 },
  { data: '2026-08-06', ticker: 'DISB34', tipo: 'C', qtd: 250, preco: 35.076 },
  { data: '2026-10-06', ticker: 'DISB34', tipo: 'V', qtd: 250, preco: 34.412 },
];
const [spcx, disb] = posicoes(ops, { SPCX34: 55 });
perto(spcx.pm, 50);
perto(spcx.lucro, 200 * 55 - 10000);
perto(spcx.pct, 0.1);
assert.ok(disb.encerrado);
perto(disb.lucro, -166); // igual à aba Ativos Encerrados
perto(disb.pct, -166 / 8769);

// Tipo do ativo (ação/fundo) vem dos lançamentos
const [f] = posicoes([{ data: '2026-01-01', ticker: 'FUNDO X', tipo: 'C', qtd: 1, preco: 100, classe: 'F' },
  { data: '2026-01-02', ticker: 'FUNDO X', tipo: 'C', qtd: 1, preco: 100 }], {});
assert.strictEqual(f.classe, 'F');

// Venda parcial mantém o preço médio
const [p] = posicoes([
  { data: '2026-01-01', ticker: 'X', tipo: 'C', qtd: 10, preco: 10 },
  { data: '2026-01-02', ticker: 'X', tipo: 'C', qtd: 10, preco: 20 },
  { data: '2026-01-03', ticker: 'X', tipo: 'V', qtd: 5, preco: 30 },
], { X: 15 });
perto(p.pm, 15);
perto(p.realizado, 75);
assert.strictEqual(qtdEm(ops, 'DISB34', '2026-09-01'), 250);

// Lucro mensal = diferença do lucro acumulado entre fins de mês
const m = mensal([
  { data: '2026-08-10', v: { A: [1050, 1000] } },
  { data: '2026-08-31', v: { A: [1100, 1000] } },
  { data: '2026-09-30', v: { A: [1080, 1000] } },
]);
perto(m[0].linhas.A.lucro, 100);
perto(m[1].linhas.A.lucro, -20);
perto(m[1].pct, -0.02);

// Ativo vendido no meio do mês continua contando naquele mês (caso DISB34)
const m2 = mensal([
  { data: '2026-09-30', v: { A: [1000, 1000], B: [1100, 1000] } },
  { data: '2026-10-06', v: { A: [950, 1000], B: [1100, 1000] } },
  { data: '2026-10-19', v: { B: [1200, 1000] } },
]);
perto(m2[1].linhas.A.lucro, -50);
perto(m2[1].linhas.B.lucro, 100);
perto(m2[1].linhas.A.inv, 1000);

// Data do pregão a partir do horário do brapi
assert.strictEqual(pregaoDe('2026-10-21T04:37:21.000Z'), '2026-10-20'); // qua 01h37 → fechamento de ter
assert.strictEqual(pregaoDe('2026-10-21T15:00:00.000Z'), '2026-10-21'); // qua 12h, pregão aberto
assert.strictEqual(pregaoDe('2026-10-20T21:00:00.000Z'), '2026-10-20'); // ter 18h, após o fechamento
assert.strictEqual(pregaoDe('2026-10-19T04:00:00.000Z'), '2026-10-16'); // seg 01h → sexta
assert.strictEqual(pregaoDe('2026-10-17T15:00:00.000Z'), '2026-10-16'); // sábado → sexta

// Cores do % diário (regra da planilha)
assert.deepStrictEqual(tendencia([0.01, 0.03, 0.02, 0.05, 0.04, -0.01, null, 0.02]),
  ['desce', 'sobe', 'desce', 'rec', 'desce', 'neg', '', 'desce']);
assert.deepStrictEqual(tendencia([0.05, 0.05]), ['sobe', 'rec']); // recorde repetido: verde só na última vez
assert.deepStrictEqual(tendencia([null, null]), ['', '']);

console.log('ok');
