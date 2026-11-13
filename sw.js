// Service worker: guarda uma cópia do app no celular para ele abrir sem internet.
// Com internet, busca sempre a versão nova (e atualiza a cópia); sem internet, ou se a rede demorar, usa a cópia.
// Dados, cotações e Google Drive não passam por aqui: os dados ficam no localStorage e as APIs vão direto à rede.
const CACHE = 'carteira-bdr-app';
const LOGOS = 'carteira-bdr-logos'; // logos das empresas (icons.brapi.dev) já vistos
const BASICOS = ['./', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await c.addAll(BASICOS);
  // o calc.js entra com o mesmo ?v= que a página pede, senão a página guardada não acharia o dela
  const v = (await (await c.match('./')).text()).match(/calc\.js\?v=[\d.]+/);
  if (v) await c.add(v[0]);
  self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  // só apaga caches antigos deste app (o endereço é o mesmo dos outros apps do github.io)
  for (const k of await caches.keys()) if (k.startsWith('carteira-bdr-') && ![CACHE, LOGOS].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) e.respondWith(redePrimeiro(req));
  else if (url.hostname === 'icons.brapi.dev') e.respondWith(copiaPrimeiro(req));
});

// Página e arquivos do app: tenta a rede (até 4 s); deu certo, atualiza a cópia; senão, usa a cópia.
async function redePrimeiro(req) {
  const c = await caches.open(CACHE);
  const navegacao = req.mode === 'navigate';
  const guardada = () => c.match(navegacao ? './' : req, { ignoreSearch: navegacao });
  const rede = fetch(req).then(r => {
    if (r.ok) c.put(navegacao ? './' : req, r.clone());
    return r;
  });
  try {
    return await Promise.race([rede, new Promise((_, nao) => setTimeout(() => nao(new Error('lenta')), 4000))]);
  } catch {
    return (await guardada()) || rede; // sem cópia, espera a rede mesmo
  }
}
// Logos: usa a cópia se houver (não mudam); senão busca e guarda.
async function copiaPrimeiro(req) {
  const c = await caches.open(LOGOS);
  const achou = await c.match(req);
  if (achou) return achou;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
