// Buildcrafter de Dauntless 1.6.2: constructor de builds, buscador por ventajas y lista de ventajas.
// Lee window.DATOS (datos/datos.js, generado por extractor/generar.py). Sin servidor ni dependencias.
'use strict';

const D = window.DATOS;
const $ = (s, el = document) => el.querySelector(s);
const PIEZAS = Object.fromEntries(D.piezas.map(p => [p.id, p]));
const RANURAS = [
  ['arma', 'Arma'], ['yelmo', 'Yelmo'], ['pecho', 'Pecho'], ['brazos', 'Brazos'], ['piernas', 'Piernas'], ['farol', 'Farol'],
];
const ORDEN_TIPO = ['Power', 'Technique', 'Defence', 'Mobility', 'Utility'];
const MAX_CELULA = 3;

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) e.append(h.nodeType ? h : document.createTextNode(h));
  return e;
}
const img = (f, alt = '', clase) => f ? el('img', {src: 'iconos/' + f, alt, loading: 'lazy', class: clase}) : el('span');
const tipoIcono = t => img((D.tipos[t] || {}).icono, (D.tipos[t] || {}).nombre || t, 'ico-tipo');
const nombreTipo = t => (D.tipos[t] || {}).nombre || t;
const ventaja = k => D.ventajas[k];
const normal = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ------------------------------------------------------------------------------------------------ estado

let build = vacio();

function vacio() {
  return Object.fromEntries(RANURAS.map(([r]) => [r, null]));
}

function equipar(ranura, id) {
  const p = PIEZAS[id];
  if (!p) { build[ranura] = null; return; }
  const previo = build[ranura];
  const mismo = previo && previo.id === id;
  build[ranura] = {
    id,
    celulas: p.huecos.map((_, i) => (mismo ? previo.celulas[i] : null) || null),
    partes: (p.partes || []).map((s, i) => (mismo ? previo.partes[i] : null) || s.defecto || ''),
    union: mismo ? previo.union || '' : '',
  };
}

// Arma unida a una legendaria (Union): le da su ventaja fija y su efecto unico.
const unida = e => e && e.union && PIEZAS[e.id].union && PIEZAS[e.id].union.includes(e.union) ? PIEZAS[e.union] : null;

// Enlace: #b= seis ranuras separadas por "|": id~celula,celula~parte,parte~arma unida
function codificar() {
  return RANURAS.map(([r]) => {
    const e = build[r];
    if (!e) return '';
    const cel = e.celulas.map(c => c ? `${c.k}.${c.r}` : '-').join(',');
    return `${e.id}~${cel}~${e.partes.join(',')}` + (e.union ? `~${e.union}` : '');
  }).join('|');
}

function decodificar(texto) {
  const b = vacio();
  const trozos = texto.split('|');
  RANURAS.forEach(([r], i) => {
    const t = trozos[i];
    if (!t) return;
    const [id, cel = '', par = '', union = ''] = t.split('~');
    const p = PIEZAS[id];
    if (!p || p.ranura !== r) return;                       // pieza desconocida o de otra ranura
    const celulas = cel.split(',');
    const partes = par.split(',');
    b[r] = {
      id,
      celulas: p.huecos.map((t, j) => {
        const [k, rr] = (celulas[j] || '-').split('.');
        const v = ventaja(k);
        if (!v || (t !== 'Any' && v.tipo !== t)) return null;          // celula de otro tipo: no cabe en ese hueco
        return {k, r: Math.min(MAX_CELULA, Math.max(1, +rr || MAX_CELULA))};
      }),
      partes: (p.partes || []).map((s, j) =>
        partes[j] && (partes[j] === s.defecto || s.opciones.includes(partes[j])) ? partes[j] : s.defecto || ''),
      union: p.union && p.union.includes(union) ? union : '',
    };
  });
  return b;
}

function guardar() {
  const h = codificar();
  history.replaceState(null, '', h.replace(/\|/g, '') ? '#b=' + encodeURIComponent(h) : location.pathname);
}

// Codigo de build para compartir: "SF162-" + el formato del enlace (codificar) en base64url. No depende de donde este
// instalada la pagina (el enlace file:///... de un PC no sirve en otro): se pega en "Importar codigo" de cualquier copia.
const PREFIJO = 'SF162-';

function exportarCodigo() {
  const bytes = new TextEncoder().encode(codificar());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIJO + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Acepta el codigo SF162-..., un enlace con #b=... o el texto del enlace tal cual. Devuelve la build o lanza un error.
function leerCodigo(entrada) {
  let t = (entrada || '').trim();
  const enlace = t.match(/#b=([^\s]*)/);
  if (enlace) {
    try { t = decodeURIComponent(enlace[1]); } catch (e) { throw new Error('El enlace está mal copiado.'); }
  }
  else if (t.toUpperCase().startsWith(PREFIJO)) {
    const b64 = t.slice(PREFIJO.length).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    let bin;
    try { bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4)); } catch (e) { throw new Error('El código está incompleto o mal copiado.'); }
    t = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  if (!t.includes('~')) throw new Error('Eso no parece un código de build (empieza por ' + PREFIJO + ').');
  const b = decodificar(t);
  if (!RANURAS.some(([r]) => b[r])) throw new Error('El código no contiene ninguna pieza de esta versión.');
  return b;
}

function abrirCompartir(modo) {
  const exportar = modo === 'exportar';
  const area = $('#comp-codigo');
  $('#comp-titulo').textContent = exportar ? 'Exportar build' : 'Importar build';
  $('#comp-ayuda').textContent = exportar
    ? 'Copia este código y compártelo. Cualquiera puede cargarlo en su Slayer\'s Forge 1.6.2 con «Importar código».'
    : 'Pega aquí un código de build (' + PREFIJO + '…) o un enlace con #b=…';
  area.value = exportar ? exportarCodigo() : '';
  area.readOnly = exportar;
  $('#comp-copiar').hidden = !exportar;
  $('#comp-cargar').hidden = exportar;
  avisoCompartir('');
  $('#compartir').showModal();
  if (exportar) area.select(); else area.focus();
}

function avisoCompartir(texto, error) {
  const a = $('#comp-aviso');
  a.textContent = texto;
  a.classList.toggle('error', !!error);
}

// ------------------------------------------------------------------------------------------------ totales

function totales(b) {
  const t = {};
  for (const [r] of RANURAS) {
    const e = b[r];
    if (!e) continue;
    const p = PIEZAS[e.id];
    const u = unida(e);
    for (const fuente of [p, u]) if (fuente) for (const [k, n] of Object.entries(fuente.ventajas)) t[k] = (t[k] || 0) + n;
    for (const c of e.celulas) if (c) t[c.k] = (t[c.k] || 0) + c.r;
  }
  return t;
}

// ------------------------------------------------------------------------------------------------ constructor

function pintarConstructor() {
  const cont = $('#ranuras');
  cont.replaceChildren();
  for (const [r, etiqueta] of RANURAS) cont.append(pintarRanura(r, etiqueta));
  pintarResumen();
  guardar();
}

function chipsVentajas(p) {
  return Object.entries(p.ventajas).map(([k, n]) => {
    const v = ventaja(k);
    return v ? el('span', {class: `chip tipo-${v.tipo}`}, tipoIcono(v.tipo), `${v.nombre} +${n}`) : null;
  });
}

function pintarRanura(r, etiqueta) {
  const e = build[r];
  const p = e && PIEZAS[e.id];
  const abrir = () => abrirSelectorPieza(r);
  const caja = el('div', {class: 'ranura'},
    el('button', {class: 'icono', title: 'Elegir ' + etiqueta.toLowerCase(), onclick: abrir}, p ? img(p.icono, p.nombre) : '+'));
  const info = el('div', {});
  info.append(el('div', {class: 'etiqueta-ranura'}, etiqueta + (p && p.arma ? ' · ' + D.armas[p.arma] : '')));
  if (!p) {
    info.append(el('div', {class: 'vacia nombre', onclick: abrir}, 'Sin equipar (pulsa para elegir)'));
    caja.append(info);
    return caja;
  }
  info.append(el('div', {class: 'lineas'},
    el('span', {class: `nombre rareza-${p.rareza}`, onclick: abrir}, p.nivel ? `${p.nombre} +${p.nivel}` : p.nombre),
    p.elemento ? el('span', {class: `elemento ${p.elemento}`}, p.elemento) : null,
    el('button', {class: 'boton secundario mini', onclick: () => { build[r] = null; pintarConstructor(); }}, 'Quitar')));
  const lv = el('div', {class: 'lineas'}, chipsVentajas(p));
  if (lv.childElementCount) info.append(lv);
  if (p.union) {
    const u = unida(e);
    info.append(el('div', {class: 'lineas'},
      el('span', {class: 'chip legendaria'}, 'Legendaria'),
      el('button', {class: `hueco ${u ? 'lleno' : ''}`, title: 'Arma unida: da su ventaja y su efecto único', onclick: () => abrirSelectorUnion(r)},
        u ? img(u.icono, u.nombre, 'ico-tipo') : null, u ? `Unión: ${u.nombre}` : 'Unión: elegir arma'),
      u ? chipsVentajas(u) : null));
  }
  if (p.huecos.length) {
    const hs = el('div', {class: 'lineas'});
    p.huecos.forEach((t, i) => {
      const c = e.celulas[i];
      const v = c && ventaja(c.k);
      hs.append(el('button', {class: `hueco ${v ? 'lleno' : ''} tipo-${v ? v.tipo : t}`, title: 'Hueco de ' + nombreTipo(t),
        onclick: () => abrirSelectorCelula(r, i, t)},
        tipoIcono(v ? v.tipo : t), v ? `${v.nombre} +${c.r}` : t === 'Any' ? 'Célula prismática (cualquiera)' : `Célula de ${nombreTipo(t).toLowerCase()}`));
    });
    info.append(hs);
  }
  if (p.partes && p.partes.length) {
    const ps = el('div', {class: 'lineas'});
    p.partes.forEach((s, i) => {
      const sel = el('select', {disabled: s.bloqueada, onchange: ev => { e.partes[i] = ev.target.value; pintarConstructor(); }});
      const ops = [...new Set([s.defecto, ...s.opciones].filter(Boolean))];
      if (!s.defecto) sel.append(el('option', {value: ''}, '— ninguna —'));
      for (const id of ops) sel.append(el('option', {value: id, selected: e.partes[i] === id}, D.partes[id].nombre));
      ps.append(el('label', {class: 'parte'}, s.tipo + ':', sel));
    });
    info.append(ps);
  }
  caja.append(info);
  return caja;
}

function pintarResumen() {
  const t = totales(build);
  const cont = $('#resumen');
  cont.replaceChildren();
  const claves = Object.keys(t).filter(k => ventaja(k) && t[k] > 0)
    .sort((a, b) => t[b] - t[a] || ventaja(a).nombre.localeCompare(ventaja(b).nombre));
  if (!claves.length) cont.append(el('p', {class: 'vacio'}, 'Equipa piezas y células para ver sus ventajas.'));
  for (const k of claves) {
    const v = ventaja(k);
    const n = Math.min(t[k], v.max);
    const barras = el('span', {class: 'barras'});
    for (let i = 1; i <= v.max; i++) barras.append(el('i', {class: i <= n ? 'on' : ''}));
    const textos = v.rangos[n - 1] || [];
    cont.append(el('div', {class: `ventaja-total tipo-${v.tipo}`},
      el('div', {class: 'cab'}, tipoIcono(v.tipo), el('b', {}, v.nombre), barras,
        el('span', {class: 'rango'}, '+' + n), t[k] > v.max ? el('span', {class: 'exceso'}, `(${t[k] - v.max} de sobra)`) : null),
      textos.length ? el('ul', {}, textos.map(x => el('li', {}, x))) : null));
  }
  const ef = $('#efectos');
  ef.replaceChildren();
  for (const [r, etiqueta] of RANURAS) {
    const e = build[r];
    if (!e) continue;
    const p = PIEZAS[e.id];
    for (const x of p.efectos) ef.append(el('p', {}, el('span', {class: 'origen'}, p.nombre + ': '), x));
    const u = unida(e);
    if (u) for (const x of u.efectos) ef.append(el('p', {}, el('span', {class: 'origen'}, `Unión · ${u.nombre}: `), x));
    if (p.instantaneo) ef.append(el('p', {}, el('span', {class: 'origen'}, p.nombre + ' (pulsar): '), p.instantaneo));
    if (p.mantenido) ef.append(el('p', {}, el('span', {class: 'origen'}, p.nombre + ' (mantener): '), p.mantenido));
    (p.partes || []).forEach((s, i) => {
      const parte = D.partes[e.partes[i]];
      if (parte && parte.desc) ef.append(el('p', {}, el('span', {class: 'origen'}, `${s.tipo} · ${parte.nombre}: `), parte.desc));
    });
  }
  if (!ef.childElementCount) ef.append(el('p', {class: 'vacio'}, 'Sin efectos únicos.'));
}

// ------------------------------------------------------------------------------------------------ selector

const dlg = $('#selector');
let filtrarSelector = () => {};

function abrirSelector(titulo, pintar, armas) {
  $('#sel-titulo').textContent = titulo;
  $('#sel-filtro').value = '';
  const selArma = $('#sel-arma');
  selArma.hidden = !armas;
  filtrarSelector = () => pintar(normal($('#sel-filtro').value), selArma.value);
  filtrarSelector();
  dlg.showModal();
  $('#sel-filtro').focus();
}
$('#sel-filtro').addEventListener('input', () => filtrarSelector());
$('#sel-arma').addEventListener('change', () => filtrarSelector());

function textoPieza(p) {
  const vs = Object.keys(p.ventajas).map(k => (ventaja(k) || {}).nombre || '').join(' ');
  return normal(`${p.nombre} ${vs} ${p.efectos.join(' ')} ${p.elemento}`);
}

function abrirSelectorPieza(r) {
  const actual = build.arma && PIEZAS[build.arma.id];
  const selArma = $('#sel-arma');
  if (r === 'arma') {
    selArma.replaceChildren(el('option', {value: ''}, 'Todas las armas'),
      ...Object.entries(D.armas).map(([k, n]) => el('option', {value: k, selected: actual && actual.arma === k}, n)));
  }
  const etiqueta = RANURAS.find(x => x[0] === r)[1];
  abrirSelector('Elegir ' + etiqueta.toLowerCase(), (q, arma) => {
    const lista = $('#sel-lista');
    lista.replaceChildren();
    const ps = D.piezas.filter(p => p.ranura === r && (!arma || p.arma === arma) && (!q || textoPieza(p).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const p of ps) {
      const sub = [
        p.arma ? D.armas[p.arma] : null,
        p.union ? 'Legendaria (con unión)' : p.exotica ? 'Exótica' : null,
        Object.entries(p.ventajas).map(([k, n]) => `${(ventaja(k) || {}).nombre} +${n}`).join(', ') || null,
        p.huecos.length ? 'Huecos: ' + p.huecos.map(nombreTipo).join(', ') : 'Sin huecos',
        p.elemento,
      ].filter(Boolean).join(' · ');
      lista.append(el('button', {class: 'opcion', onclick: () => { equipar(r, p.id); dlg.close(); pintarConstructor(); }},
        img(p.icono, p.nombre),
        el('div', {}, el('div', {class: `rareza-${p.rareza}`}, el('b', {}, p.nombre)), el('div', {class: 'sub'}, sub),
          p.efectos.length ? el('div', {class: 'sub'}, p.efectos[0]) : null)));
    }
    if (!ps.length) lista.append(el('p', {class: 'vacio'}, 'Nada coincide.'));
  }, r === 'arma');
}

function abrirSelectorUnion(r) {
  const p = PIEZAS[build[r].id];
  abrirSelector(`Unión de ${p.nombre}`, q => {
    const lista = $('#sel-lista');
    lista.replaceChildren(el('p', {class: 'ayuda'}, 'La legendaria hereda la ventaja fija y el efecto único del arma unida (no sus huecos).'),
      el('button', {class: 'opcion', onclick: () => { build[r].union = ''; dlg.close(); pintarConstructor(); }},
        el('span'), el('div', {}, el('b', {}, 'Sin unión'))));
    const ws = p.union.map(id => PIEZAS[id]).filter(w => w && (!q || textoPieza(w).includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const w of ws) {
      const vs = Object.entries(w.ventajas).map(([k, n]) => `${(ventaja(k) || {}).nombre} +${n}`).join(', ');
      lista.append(el('button', {class: 'opcion', onclick: () => { build[r].union = w.id; dlg.close(); pintarConstructor(); }},
        img(w.icono, w.nombre),
        el('div', {}, el('div', {class: `rareza-${w.rareza}`}, el('b', {}, w.nombre)), el('div', {class: 'sub'}, vs || 'Sin ventaja fija'),
          w.efectos.length ? el('div', {class: 'sub'}, w.efectos.join(' · ')) : null)));
    }
  }, false);
}

function abrirSelectorCelula(r, i, tipo) {
  abrirSelector(tipo === 'Any' ? 'Célula para el hueco prismático' : `Célula para el hueco de ${nombreTipo(tipo).toLowerCase()}`, q => {
    const lista = $('#sel-lista');
    lista.replaceChildren(el('button', {class: 'opcion', onclick: () => { build[r].celulas[i] = null; dlg.close(); pintarConstructor(); }},
      el('span'), el('div', {}, el('b', {}, 'Vaciar hueco'))));
    const tipos = tipo === 'Any' ? ORDEN_TIPO : [tipo];
    for (const t of tipos) {
      const vs = Object.entries(D.ventajas).filter(([k, v]) => v.tipo === t && Object.keys(v.celulas).length &&
        (!q || normal(v.nombre + ' ' + v.rangos.flat().join(' ')).includes(q)))
        .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
      if (!vs.length) continue;
      if (tipos.length > 1) lista.append(el('div', {class: `grupo-tipo tipo-${t}`}, nombreTipo(t)));
      for (const [k, v] of vs) {
        const fila = el('div', {class: 'opcion', tabindex: 0},
          tipoIcono(t),
          el('div', {}, el('b', {}, v.nombre), el('div', {class: 'sub'}, (v.rangos[2] || v.rangos[0] || [])[0] || ''),
            el('div', {class: 'lineas'}, [1, 2, 3].filter(n => v.celulas[n]).map(n =>
              el('button', {class: 'boton mini' + (n < MAX_CELULA ? ' secundario' : ''),
                onclick: ev => { ev.stopPropagation(); build[r].celulas[i] = {k, r: n}; dlg.close(); pintarConstructor(); }}, '+' + n)))));
        fila.addEventListener('click', () => { build[r].celulas[i] = {k, r: MAX_CELULA}; dlg.close(); pintarConstructor(); });
        lista.append(fila);
      }
    }
  }, false);
}

// ------------------------------------------------------------------------------------------------ buscador

const deseo = {};   // ventaja -> rango buscado

// Rangos que se pueden pedir con cada clic: +3 (una celula), +6 (el maximo) y vuelta a nada.
const PASOS = [3, 6];

function siguienteRango(k) {
  const v = D.ventajas[k];
  const pasos = PASOS.filter(n => n <= v.max);
  const i = pasos.indexOf(deseo[k] || 0);
  return i + 1 < pasos.length ? pasos[i + 1] : 0;        // 0 -> +3 -> +6 -> 0
}

function pintarListaBuscador() {
  const q = normal($('#b-filtro').value);
  const conDesc = $('#b-desc').checked;
  const cont = $('#b-ventajas');
  cont.replaceChildren();
  for (const t of ORDEN_TIPO) {
    const claves = Object.keys(D.ventajas)
      .filter(k => D.ventajas[k].tipo === t && (!q || normal(D.ventajas[k].nombre).includes(q) || deseo[k]))
      .sort((a, b) => D.ventajas[a].nombre.localeCompare(D.ventajas[b].nombre));
    const elegidas = claves.filter(k => deseo[k]).length;
    const col = el('section', {class: `columna-tipo tipo-${t}`, 'aria-label': nombreTipo(t)},
      el('h3', {class: 'cab-tipo'}, tipoIcono(t), nombreTipo(t), elegidas ? el('span', {class: 'cuenta'}, String(elegidas)) : null));
    for (const k of claves) {
      const v = D.ventajas[k];
      const n = deseo[k] || 0;
      // con "Mostrar descripcion": lo que hace a +3 y a +6 (o a su maximo)
      const desc = conDesc ? el('span', {class: 'desc'}, PASOS.filter(m => m <= v.max).map(m =>
        el('span', {class: 'desc-rango'}, el('b', {}, '+' + m), ' ' + ((v.rangos[m - 1] || []).join(' · ') || '—')))) : null;
      col.append(el('button', {
        class: `ventaja-btn ${n ? 'activa' : ''} ${conDesc ? 'con-desc' : ''}`, type: 'button', 'aria-pressed': n ? 'true' : 'false',
        title: `${v.nombre}${n ? ' +' + n : ''} · clic: ${siguienteRango(k) ? '+' + siguienteRango(k) : 'quitar'}\n` +
          (v.rangos[(n || v.max) - 1] || []).join('\n'),
        onclick: () => {
          const s = siguienteRango(k);
          if (s) deseo[k] = s; else delete deseo[k];
          pintarListaBuscador();
          programarBusqueda();
        }},
        el('span', {class: 'nom'}, v.nombre), el('span', {class: 'rango-pedido'}, n ? '+' + n : ''), desc));
    }
    if (!claves.length) col.append(el('p', {class: 'vacio'}, 'Ninguna coincide.'));
    cont.append(col);
  }
}

// Busca solo al cambiar las ventajas o los filtros. Con un pequeño retraso, para que varios clics seguidos hagan una
// sola busqueda.
let busquedaPendiente = 0;

function programarBusqueda() {
  clearTimeout(busquedaPendiente);
  busquedaPendiente = setTimeout(() => {
    if (Object.keys(deseo).length) buscar();
    else $('#b-resultados').replaceChildren();
  }, 150);
}

// Reparte células +3 en los huecos: cada ventaja que falta necesita ceil(falta/3) huecos de su tipo o prismáticos.
function reparto(falta, huecos) {
  const libres = {};
  for (const h of huecos) libres[h] = (libres[h] || 0) + 1;
  let prisma = libres.Any || 0;
  const asignado = [];
  for (const [k, n] of Object.entries(falta)) {
    if (n <= 0) continue;
    let necesita = Math.ceil(n / MAX_CELULA);
    const t = D.ventajas[k].tipo;
    const usa = Math.min(libres[t] || 0, necesita);
    libres[t] = (libres[t] || 0) - usa;
    necesita -= usa;
    for (let i = 0; i < usa; i++) asignado.push([t, k]);
    if (necesita > prisma) return null;
    prisma -= necesita;
    for (let i = 0; i < necesita; i++) asignado.push(['Any', k]);
  }
  return asignado;
}

function buscar() {
  const objetivo = Object.entries(deseo).filter(([, n]) => n > 0);
  const out = $('#b-resultados');
  out.replaceChildren();
  if (!objetivo.length) { out.append(el('p', {class: 'vacio'}, 'Elige al menos una ventaja.')); return; }
  const arma = $('#b-arma').value;
  const exoticas = $('#b-exoticas').checked;
  const legendarias = $('#b-legendarias').checked;
  const conFarol = $('#b-farol').checked;
  const quiero = Object.fromEntries(objetivo);
  const tiposQuiero = new Set(objetivo.map(([k]) => D.ventajas[k].tipo));
  const ranuras = RANURAS.map(([r]) => r).filter(r => r !== 'farol' || conFarol);
  const TIPOS_HUECO = [...ORDEN_TIPO, 'Any'];
  let aviso = '';

  // Piezas de una ranura. Arma: con "Armas legendarias" marcado, solo legendarias, cada una unida a un arma de su tipo y
  // elemento que de alguna ventaja pedida (hereda su ventaja fija); desmarcado, solo armas normales.
  function opciones(r) {
    const lista = [];
    for (const p of D.piezas) {
      if (p.ranura !== r) continue;
      if (r !== 'arma') {
        if (!p.exotica || exoticas) lista.push(p);
        continue;
      }
      if (arma && p.arma !== arma) continue;
      if (legendarias) {
        if (!p.union) continue;
        for (const id of p.union) {
          const u = PIEZAS[id];
          if (Object.keys(u.ventajas).some(k => quiero[k])) lista.push({...p, ventajas: sumar(p.ventajas, u.ventajas), unida: u});
        }
      } else if (!p.union && (!p.exotica || exoticas)) {
        lista.push(p);
      }
    }
    if (r === 'arma' && legendarias && !lista.length) {
      // ninguna union da lo pedido: legendarias con la union libre (sus dos huecos prismaticos siguen sirviendo)
      for (const p of D.piezas) if (p.ranura === 'arma' && p.union && (!arma || p.arma === arma)) lista.push({...p, unionLibre: true});
      aviso = lista.length
        ? 'Ninguna unión da las ventajas pedidas: se usan las legendarias con la unión libre.'
        : `No hay armas legendarias${arma ? ' de ' + D.armas[arma].toLowerCase() : ''} en 1.6.2: desmarca «Armas legendarias».`;
    }
    return lista;
  }

  // Grupos por ranura: piezas que aportan lo mismo a la busqueda (ventajas pedidas y huecos utiles) son una sola opcion.
  const grupos = {};
  for (const r of ranuras) {
    const firmas = new Map();
    for (const p of opciones(r)) {
      const aporta = Object.entries(p.ventajas).filter(([k]) => quiero[k]).sort();
      const huecos = p.huecos.filter(t => t === 'Any' || tiposQuiero.has(t)).sort();
      const firma = JSON.stringify([aporta, huecos]);
      if (!firmas.has(firma)) firmas.set(firma, {aporta: Object.fromEntries(aporta), huecos, piezas: []});
      firmas.get(firma).piezas.push(p);
    }
    const lista = [...firmas.values()];
    for (const g of lista) {
      g.cuenta = {};
      for (const h of g.huecos) g.cuenta[h] = (g.cuenta[h] || 0) + 1;
      g.total = representante(g).huecos.length;        // huecos de la pieza que se mostrara (cuentan como libres)
      g.esp = especial(g);
    }
    // Fuera las dominadas: otra del mismo hueco da lo mismo o mas de lo pedido, con huecos iguales o mejores (el
    // prismatico cubre cualquier tipo), tantos huecos en total y no es mas "especial" (exotica). Nunca darian un
    // resultado mejor.
    grupos[r] = lista.filter(b => !lista.some(a => a !== b && domina(a, b)))
      .sort((a, b) => a.esp - b.esp || valor(b) - valor(a));
  }
  function domina(a, b) {
    if (a.esp > b.esp || a.total < b.total) return false;
    for (const k in quiero) if ((a.aporta[k] || 0) < (b.aporta[k] || 0)) return false;
    let deficit = 0;
    for (const t of ORDEN_TIPO) deficit += Math.max(0, (b.cuenta[t] || 0) - (a.cuenta[t] || 0));
    return (a.cuenta.Any || 0) - (b.cuenta.Any || 0) >= deficit;   // (dos grupos distintos nunca son iguales en todo)
  }
  function valor(g) { return Object.values(g.aporta).reduce((s, n) => s + n, 0) + g.huecos.length * MAX_CELULA; }

  // Cotas de lo que aun pueden dar las ranuras que faltan (de i en adelante): por ventaja y por tipo de hueco.
  const n = ranuras.length;
  const supAporta = Array.from({length: n + 1}, () => ({}));
  const supHueco = Array.from({length: n + 1}, () => ({}));
  for (let i = n - 1; i >= 0; i--) {
    const gs = grupos[ranuras[i]];
    for (const k in quiero) supAporta[i][k] = (supAporta[i + 1][k] || 0) + Math.max(0, ...gs.map(g => g.aporta[k] || 0));
    for (const t of TIPOS_HUECO) supHueco[i][t] = (supHueco[i + 1][t] || 0) + Math.max(0, ...gs.map(g => g.cuenta[t] || 0));
  }
  // Poda: con lo mejor que queda, ¿caben las celulas que faltan en huecos de su tipo o prismaticos?
  function posible(i, tengo, cuenta) {
    const demanda = {};
    for (const [k, m] of objetivo) {
      const falta = m - (tengo[k] || 0) - (supAporta[i][k] || 0);
      if (falta > 0) demanda[D.ventajas[k].tipo] = (demanda[D.ventajas[k].tipo] || 0) + Math.ceil(falta / MAX_CELULA);
    }
    let sobra = 0;
    for (const t in demanda) sobra += Math.max(0, demanda[t] - (cuenta[t] || 0) - (supHueco[i][t] || 0));
    return sobra <= (cuenta.Any || 0) + (supHueco[i].Any || 0);
  }

  // Busqueda completa (con poda) quedandose con las mejores: mas huecos libres, menos exoticas y mas rango de sobra.
  const MOSTRAR = 60, t0 = performance.now();
  let mejores = [], total = 0, cortado = false;
  const nota = (elegido, asignado, tengo) => {
    const libres = elegido.reduce((s, g) => s + g.total, 0) - asignado.length;
    const extra = objetivo.reduce((s, [k, m]) => s + Math.max(0, Math.min(tengo[k] || 0, D.ventajas[k].max) - m), 0);
    return libres * 10 - elegido.reduce((s, g) => s + (g.esp === 2 ? 25 : 0), 0) + extra;
  };
  (function dfs(i, elegido, tengo, cuenta, huecos) {
    if (cortado) return;
    if ((total & 255) === 0 && performance.now() - t0 > 4000) { cortado = true; return; }
    if (!posible(i, tengo, cuenta)) return;
    if (i === n) {
      const falta = {};
      for (const [k, m] of objetivo) if (m > (tengo[k] || 0)) falta[k] = m - (tengo[k] || 0);
      const asignado = reparto(falta, huecos);
      if (!asignado) return;
      total++;
      mejores.push({elegido: [...elegido], asignado, nota: nota(elegido, asignado, tengo)});
      if (mejores.length > 4 * MOSTRAR) mejores = mejores.sort((a, b) => b.nota - a.nota).slice(0, MOSTRAR);
      return;
    }
    for (const g of grupos[ranuras[i]]) {
      const t2 = {...tengo}, c2 = {...cuenta};
      for (const [k, m] of Object.entries(g.aporta)) t2[k] = (t2[k] || 0) + m;
      for (const [h, m] of Object.entries(g.cuenta)) c2[h] = (c2[h] || 0) + m;
      elegido.push(g);
      dfs(i + 1, elegido, t2, c2, huecos.concat(g.huecos));
      elegido.pop();
      if (cortado) return;
    }
  })(0, [], {}, {}, []);
  mejores.sort((a, b) => b.nota - a.nota);

  if (aviso) out.append(el('p', {class: 'aviso-busqueda'}, aviso));
  out.append(el('p', {class: 'ayuda'}, total
    ? `${total} combinaciones${cortado ? ' (búsqueda cortada a los 4 s: puede haber más; afina los filtros)' : ''}` +
      (total > MOSTRAR ? `; se muestran las ${MOSTRAR} mejores (más huecos libres, menos exóticas)` : '') + '. ' +
      'Entre paréntesis, cuántas piezas equivalentes hay (pasa el ratón para verlas).'
    : 'No hay ninguna combinación con esas ventajas' + (cortado ? ' en el tiempo disponible.' : '.')));
  for (const res of mejores.slice(0, MOSTRAR)) out.append(pintarResultado(ranuras, res));
}

// 0 normal, 1 legendaria (con union), 2 exotica: un grupo cuenta como su pieza mas normal
function especial(g) {
  return Math.min(...g.piezas.map(p => p.exotica ? 2 : p.unida ? 1 : 0));
}

const nombreOpcion = p => p.unida ? `${p.nombre} + ${p.unida.nombre}` : p.unionLibre ? `${p.nombre} (unión libre)` : p.nombre;

// Pieza que se muestra de un grupo de equivalentes: la mas normal y, entre ellas, la de mas huecos (mas libres).
function representante(g) {
  return g.piezas.slice().sort((a, b) => especial({piezas: [a]}) - especial({piezas: [b]}) ||
    b.huecos.length - a.huecos.length)[0];
}

function sumar(a, b) {
  const t = {...a};
  for (const [k, n] of Object.entries(b)) t[k] = (t[k] || 0) + n;
  return t;
}

function pintarResultado(ranuras, res) {
  // las celulas asignadas se colocan en los huecos de cada pieza, en orden
  const cola = res.asignado.slice();
  const b = vacio();
  const piezas = el('div', {class: 'piezas'});
  ranuras.forEach((r, i) => {
    const g = res.elegido[i];
    const p = representante(g);
    const celulas = p.huecos.map(t => {
      const j = cola.findIndex(([tt, k]) => tt === t || (t === 'Any' && tt === 'Any'));
      if (j < 0) return null;
      const [, k] = cola.splice(j, 1)[0];
      return {k, r: MAX_CELULA};
    });
    b[r] = {id: p.id, celulas, partes: (p.partes || []).map(s => s.defecto || ''), union: p.unida ? p.unida.id : ''};
    piezas.append(el('div', {class: 'mini-pieza', title: g.piezas.map(nombreOpcion).join('\n')},
      img(p.icono, p.nombre), el('div', {class: `n rareza-${p.rareza}`}, nombreOpcion(p) + (g.piezas.length > 1 ? ` (${g.piezas.length})` : '')),
      // lo que da la pieza por si misma (en una legendaria, tambien lo del arma unida); en negrita si se ha pedido
      ...Object.entries(p.ventajas).filter(([k]) => ventaja(k)).map(([k, n]) =>
        el('div', {class: `aporta tipo-${ventaja(k).tipo} ${deseo[k] ? 'pedida' : ''}`, title: 'Ventaja fija de la pieza'},
          tipoIcono(ventaja(k).tipo), `${ventaja(k).nombre} +${n}`)),
      // cada hueco de la pieza: la celula que lleva o "Libre" con su tipo
      ...p.huecos.map((t, j) => {
        const c = celulas[j];
        const v = c && ventaja(c.k);
        return v
          ? el('div', {class: `celda tipo-${v.tipo}`}, tipoIcono(v.tipo), `${v.nombre} +${c.r}`)
          : el('div', {class: `celda libre tipo-${t}`, title: 'Hueco libre de ' + nombreTipo(t).toLowerCase()}, tipoIcono(t), 'Libre');
      })));
  });
  const t = totales(b);
  // Ventajas pedidas que se consiguen (con su color de tipo) y huecos libres agrupados por tipo.
  const conseguidas = Object.keys(deseo).filter(k => t[k]).sort((a, c) =>
    ORDEN_TIPO.indexOf(ventaja(a).tipo) - ORDEN_TIPO.indexOf(ventaja(c).tipo) || ventaja(a).nombre.localeCompare(ventaja(c).nombre))
    .map(k => el('span', {class: `chip tipo-${ventaja(k).tipo}`}, tipoIcono(ventaja(k).tipo), `${ventaja(k).nombre} +${Math.min(t[k], ventaja(k).max)}`));
  const porTipo = {};
  for (const r of ranuras) PIEZAS[b[r].id].huecos.forEach((h, j) => { if (!b[r].celulas[j]) porTipo[h] = (porTipo[h] || 0) + 1; });
  const libres = [...ORDEN_TIPO, 'Any'].filter(h => porTipo[h]).map(h =>
    el('span', {class: `chip libre tipo-${h}`, title: `${porTipo[h]} hueco${porTipo[h] > 1 ? 's' : ''} libre${porTipo[h] > 1 ? 's' : ''} de ${nombreTipo(h).toLowerCase()}`},
      tipoIcono(h), `${nombreTipo(h)} ×${porTipo[h]}`));
  return el('div', {class: 'resultado'}, piezas,
    el('div', {class: 'pie-res'},
      el('div', {class: 'filas-res'},
        el('div', {class: 'lineas'}, el('span', {class: 'etiqueta-res'}, 'Ventajas'), conseguidas),
        el('div', {class: 'lineas'}, el('span', {class: 'etiqueta-res'}, 'Huecos libres'),
          libres.length ? libres : el('span', {class: 'vacio'}, 'ninguno'))),
      el('button', {class: 'boton mini', onclick: () => { build = b; mostrar('constructor'); pintarConstructor(); }}, 'Abrir en el constructor')));
}

// ------------------------------------------------------------------------------------------------ lista de ventajas

function pintarVentajas() {
  const q = normal($('#v-filtro').value);
  const cont = $('#v-lista');
  cont.replaceChildren();
  const claves = Object.keys(D.ventajas).filter(k => !q || normal(D.ventajas[k].nombre + ' ' + D.ventajas[k].rangos.flat().join(' ')).includes(q))
    .sort((a, b) => ORDEN_TIPO.indexOf(D.ventajas[a].tipo) - ORDEN_TIPO.indexOf(D.ventajas[b].tipo) ||
      D.ventajas[a].nombre.localeCompare(D.ventajas[b].nombre));
  for (const k of claves) {
    const v = D.ventajas[k];
    const fuentes = D.piezas.filter(p => p.ventajas[k]).map(p => p.nombre);
    cont.append(el('div', {class: `tarjeta tipo-${v.tipo}`},
      el('div', {class: 'cab'}, tipoIcono(v.tipo), v.nombre, el('span', {class: 'tipo'}, nombreTipo(v.tipo))),
      el('ol', {}, v.rangos.map(r => el('li', {}, r.join(' · ') || '—'))),
      fuentes.length ? el('div', {class: 'sub', style: 'color:var(--tenue);font-size:12px;margin-top:4px'}, 'En: ' + fuentes.join(', ')) : null));
  }
}

// ------------------------------------------------------------------------------------------------ arranque

function mostrar(vista) {
  for (const b of document.querySelectorAll('.pestanas button')) b.setAttribute('aria-selected', b.dataset.vista === vista);
  for (const s of document.querySelectorAll('.vista')) s.hidden = s.id !== 'vista-' + vista;
  try { localStorage.setItem('bc162-vista', vista); } catch (e) { /* sin almacenamiento */ }
}

function iniciar() {
  if (!D) {
    document.body.innerHTML = '<p style="padding:20px">Faltan los datos: ejecuta <b>GENERAR DATOS.bat</b> primero.</p>';
    return;
  }
  $('#version').textContent = D.version;
  $('#pie-version').textContent = D.version;
  $('#pie-fecha').textContent = D.generado;
  for (const b of document.querySelectorAll('.pestanas button')) b.addEventListener('click', () => mostrar(b.dataset.vista));
  $('#copiar').addEventListener('click', async () => {
    guardar();
    try { await navigator.clipboard.writeText(location.href); $('#aviso').textContent = 'Enlace copiado.'; }
    catch (e) { $('#aviso').textContent = 'Copia la dirección de la barra del navegador.'; }
    setTimeout(() => { $('#aviso').textContent = ''; }, 2500);
  });
  $('#limpiar').addEventListener('click', () => { build = vacio(); pintarConstructor(); });
  $('#exportar').addEventListener('click', () => {
    if (!RANURAS.some(([r]) => build[r])) {
      $('#aviso').textContent = 'Equipa alguna pieza antes de exportar.';
      setTimeout(() => { $('#aviso').textContent = ''; }, 2500);
      return;
    }
    abrirCompartir('exportar');
  });
  $('#importar').addEventListener('click', () => abrirCompartir('importar'));
  $('#comp-copiar').addEventListener('click', async () => {
    const area = $('#comp-codigo');
    try { await navigator.clipboard.writeText(area.value); avisoCompartir('Código copiado.'); }
    catch (e) { area.select(); document.execCommand('copy'); avisoCompartir('Código copiado.'); }
  });
  $('#comp-cargar').addEventListener('click', () => {
    try {
      build = leerCodigo($('#comp-codigo').value);
      $('#compartir').close();
      mostrar('constructor');
      pintarConstructor();
      $('#aviso').textContent = 'Build cargada.';
      setTimeout(() => { $('#aviso').textContent = ''; }, 2500);
    } catch (e) {
      avisoCompartir(e.message, true);
    }
  });
  $('#b-arma').append(el('option', {value: ''}, 'Cualquiera'), ...Object.entries(D.armas).map(([k, n]) => el('option', {value: k}, n)));
  $('#b-filtro').addEventListener('input', pintarListaBuscador);
  for (const id of ['#b-arma', '#b-farol', '#b-legendarias', '#b-exoticas']) $(id).addEventListener('change', programarBusqueda);
  $('#b-desc').addEventListener('change', pintarListaBuscador);
  $('#b-limpiar').addEventListener('click', () => { for (const k in deseo) delete deseo[k]; pintarListaBuscador(); programarBusqueda(); });
  $('#v-filtro').addEventListener('input', pintarVentajas);
  const m = location.hash.match(/^#b=(.*)$/);
  if (m) {
    try { build = decodificar(decodeURIComponent(m[1])); } catch (e) { build = vacio(); }
  }
  pintarConstructor();
  pintarListaBuscador();
  pintarVentajas();
  let vista = 'constructor';
  try { vista = (!m && localStorage.getItem('bc162-vista')) || vista; } catch (e) { /* sin almacenamiento */ }
  mostrar(vista);
}

iniciar();
