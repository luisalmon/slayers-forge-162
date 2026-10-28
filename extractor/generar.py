r"""Genera los datos del Buildcrafter (web\datos\datos.js) y sus iconos (web\iconos) desde Dauntless 1.6.2.

Lee los paks del juego instalado (solo lectura) y escribe:
  web\datos\datos.js   window.DATOS = {ventajas, celulas, piezas, partes, tipos...}
  web\iconos\*.png     iconos de piezas, partes y tipos de celula (96 px)

Uso:
  python generar.py                                  (juego en C:\Games\Dauntless_1.6.2)
  python generar.py --juego "D:\otra\Dauntless_1.6.2"
  python generar.py --idioma en                      (textos en ingles; por defecto es)
  python generar.py --sin-iconos
"""
import argparse
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ue4 import Game, read_locres, decode_texture  # noqa: E402

WEB = os.path.normpath(os.path.join(HERE, '..', 'web'))
JUEGO = r'C:\Games\Dauntless_1.6.2'
ICONO = 96

GAMEPLAY = 'Archon/Content/Gameplay/'
CATALOGS = GAMEPLAY + 'Backend/Catalogs/'
GEAR = CATALOGS + 'Gear_Catalogs/'

TIPOS_CELULA = {'Power': 'Potencia', 'Defence': 'Defensa', 'Mobility': 'Movilidad', 'Technique': 'Técnica',
                'Utility': 'Utilidad', 'Any': 'Prismática'}
ICONOS_TIPO = {'Power': 'ico_cell_power', 'Defence': 'ico_cell_defense', 'Mobility': 'ico_cell_mobility',
               'Technique': 'ico_cell_technique', 'Utility': 'ico_cell_utility', 'Any': 'ui_icon_cell_prismatic'}
ARMAS = {   # tabla -> (clave, nombre)
    'weapon_eblade': ('espada', 'Espada'),
    'weapon_gaxe': ('hacha', 'Hacha'),
    'weapon_ihammer': ('martillo', 'Martillo'),
    'weapon_cblades': ('hojas', 'Hojas encadenadas'),
    'weapon_mspear': ('pica', 'Pica de guerra'),
    'weapon_dp': ('repetidores', 'Repetidores'),
    'weapon_ac': ('golpeadores', 'Golpeadores de aether'),
}
RANURAS = {'ArmorType_HELMET': 'yelmo', 'ArmorType_CHEST': 'pecho', 'ArmorType_ARMS': 'brazos',
           'ArmorType_LEGS': 'piernas'}
ELEMENTOS = {'ORB_FLAME': 'fuego', 'ORB_FROST': 'hielo', 'ORB_SHOCK': 'rayo', 'ORB_TERRA': 'tierra',
             'ORB_RADIANT': 'radiante', 'ORB_UMBRAL': 'umbral', 'ORB_PHYSICAL': 'neutral'}
TIPO_ELEMENTO = {'FLAME': 'fuego', 'FROST': 'hielo', 'SHOCK': 'rayo', 'TERRA': 'tierra', 'RADIANT': 'radiante',
                 'UMBRAL': 'umbral', 'PHYSICAL': 'neutral', 'RAW': 'neutral'}
RESISTENCIAS = {'FlameResistance': 'fuego', 'FrostResistance': 'hielo', 'ShockResistance': 'rayo',
                'TerraResistance': 'tierra', 'RadiantResistance': 'radiante', 'UmbralResistance': 'umbral'}
PARTES = {   # sufijo de EWeaponPartType -> nombre de la ranura
    'Special': 'Especial', 'Passive': 'Pasiva', 'Legendary': 'Exótica', 'Barrel': 'Cañón', 'Receiver': 'Recámara',
    'Grip': 'Empuñadura', 'Prism': 'Prisma', 'Mod': 'Mod', 'Capacitor': 'Condensador',
}
RANK_CELULA = {'UC': 1, 'R': 2, 'E': 3}


def nivel(v):
    s = str(v or '')
    return int(s.rsplit('_', 1)[1]) if s.startswith('EUpgradeableItemLevel::Level_') else 0


def enum(v):
    return str(v or '').split('::')[-1]


def tipo_celula(v):
    t = enum(v)
    return t.split('_', 1)[1] if t.startswith('CellType_') else ''


def numero(x):
    x = round(x, 2)
    return str(int(x)) if x == int(x) else f'{x:g}'.replace('.', ',')


def magnitud(plantilla, m):
    """Sustituye los marcadores de magnitud de los textos de efectos (cell_effect_table)."""
    rep = {
        '[MAGNITUDE_PERCENT_INVERSE]': numero((1 - m) * 100) + '%',
        '[MAGNITUDE_PERCENT_MINUS_ONE]': numero((m - 1) * 100) + '%',
        '[MAGNITUDE_PERCENT]': numero(m * 100) + '%',
        '[MAGNITUDE_FLOAT]': numero(m),
        '[MAGNITUDE_NEGATED]': numero(-m),
        '[MAGNITUDE]': numero(m),
    }
    # con factor: [MAGNITUDEx10], [MAGNITUDE_PERCENTx10]
    plantilla = re.sub(r'\[MAGNITUDE(_PERCENT)?[x*](\d+(?:\.\d+)?)\]',
                       lambda g: numero(m * float(g.group(2)) * (100 if g.group(1) else 1)) + ('%' if g.group(1) else ''),
                       plantilla)
    for k, v in rep.items():
        plantilla = plantilla.replace(k, v)
    plantilla = plantilla.replace('[Legendary Attack]', '[ataque legendario]')
    return re.sub(r'<[^>]*>', '', plantilla).replace('%%', '%').strip()


class Generador:
    def __init__(self, juego, idioma, iconos, log=print):
        self.log = log
        paks = os.path.join(juego, 'Archon', 'Content', 'Paks')
        if not os.path.isdir(paks):
            raise SystemExit(f'no se encuentra el juego: {paks}')
        self.g = Game(paks, log)
        self.loc = {}
        loc = f'Archon/Content/Localization/Game/{idioma}/Game.locres'
        if self.g.has(loc):
            self.loc = read_locres(self.g.read(loc))
        else:
            log(f'  aviso: sin textos de "{idioma}"; se usa el ingles')
        self.iconos = iconos
        self.hechos = {}                                # ruta de textura -> nombre de png (o None)
        self.n_iconos = 0

    def t(self, texto):
        """FText -> texto traducido (el original si no hay traduccion)."""
        if not isinstance(texto, dict):
            return str(texto or '') if not str(texto or '').startswith('<') else ''
        tr = self.loc.get(texto.get('key') or '', '')
        return tr if tr and not tr.startswith('[PLACEHOLDER]') else texto.get('src', '')

    def icono(self, ruta, nombre):
        """Guarda la textura como iconos/<nombre>.png; devuelve el nombre del fichero o ''."""
        if not self.iconos or not isinstance(ruta, str) or not ruta.startswith('/Game/'):
            return ''
        if ruta in self.hechos:
            return self.hechos[ruta] or ''
        par = self.g.asset(ruta)
        img = decode_texture(*par, ICONO) if par else None
        fichero = None
        if img is not None:
            fichero = re.sub(r'[^A-Za-z0-9_.-]', '_', nombre) + '.png'
            img.save(os.path.join(WEB, 'iconos', fichero), optimize=True)
            self.n_iconos += 1
        self.hechos[ruta] = fichero
        return fichero or ''

    def icono_fila(self, fila, nombre):
        gid = fila.get('GenericItemData') if isinstance(fila.get('GenericItemData'), dict) else {}
        for ruta in (gid.get('Icon'), gid.get('LargeIcon'), fila.get('RewardLargeIcon')):
            f = self.icono(ruta, nombre)
            if f:
                return f
        return ''

    # -------------------------------------------------------------------------------- ventajas y celulas

    def ventajas(self):
        kw = self.g.table(GAMEPLAY + 'keyword_cell_effects')
        self.efectos = self.g.table(GAMEPLAY + 'cell_effect_table')
        out = {}
        for clave, fila in kw.items():
            tipo = tipo_celula(fila.get('CellType'))
            nombre = self.t(fila.get('Description'))
            if tipo not in TIPOS_CELULA or not nombre or nombre.startswith(('[', '~')):
                continue
            rangos = []
            maximo = 0
            for u in fila.get('UniqueRankedEffects') or []:
                for m in u.get('MagnitudesGrantedPerLevel') or []:
                    maximo = max(maximo, int(m.get('RankRequired') or 0))
            maximo = maximo or 6
            for rango in range(1, maximo + 1):
                textos = []
                for u in fila.get('UniqueRankedEffects') or []:
                    activos = [m for m in u.get('MagnitudesGrantedPerLevel') or [] if m['RankRequired'] <= rango]
                    if not activos or activos[-1].get('bEffectIsRemovedAtThisLevel'):
                        continue
                    efecto = self.efectos.get((u.get('GrantedCellEffect') or {}).get('RowName'))
                    if efecto:
                        txt = magnitud(self.t(efecto.get('Description')), activos[-1]['GrantedMagnitude'])
                        if txt:
                            textos.append(txt)
                rangos.append(textos)
            out[clave] = {'nombre': nombre, 'tipo': tipo, 'max': maximo, 'rangos': rangos, 'celulas': {}}
        return out

    def celulas(self, ventajas):
        cat = self.g.table(CATALOGS + 'generated_cell_catalog')
        out = {}
        for cid, fila in cat.items():
            ranks = fila.get('Ranks') or []
            if len(ranks) != 1:
                continue
            kw = (ranks[0].get('CellEffect') or {}).get('RowName')
            rango = RANK_CELULA.get(cid.rsplit('_', 1)[-1])
            if kw not in ventajas or not rango:
                continue
            ventajas[kw]['celulas'][str(rango)] = cid
            out[cid] = {'nombre': self.t(fila.get('DisplayName')), 'ventaja': kw, 'rango': rango}
        return out

    # -------------------------------------------------------------------------------- piezas

    def huecos(self, fila, patrones, tope):
        slots = {}
        patron = patrones.get((fila.get('CellUnlockPattern') or {}).get('RowName')) or {}
        for nv in patron.get('CellSlotsPerLevel') or []:
            if nivel(nv.get('ItemLevel')) <= tope:
                for s in nv.get('CellSlots') or []:
                    slots[s['SlotIndex']] = tipo_celula(s.get('CellType'))
        for nv in fila.get('CellSlotOverridesPerLevel') or []:
            if nivel(nv.get('ItemLevel')) <= tope:
                for s in nv.get('CellSlots') or []:
                    slots[s['SlotIndex']] = tipo_celula(s.get('CellType'))
        return [slots[i] for i in sorted(slots) if slots[i] in TIPOS_CELULA]

    def fijos(self, fila, ventajas, tope, con_magnitudes=False):
        """Ventajas (rangos) y efectos unicos (texto) que da la pieza mejorada hasta `tope`; con_magnitudes: tambien
        {efecto: magnitud acumulada}, para las descripciones con [MAGNITUDE] de las partes de arma."""
        rangos, magnitudes = {}, {}
        for nv in fila.get('PermanentCellsPerLevel') or []:
            if nivel(nv.get('ItemLevel')) > tope:
                continue
            for pe in nv.get('PermanentCellEffects') or []:
                ref = pe.get('CellEffectRef') or {}
                fila_ref = ref.get('RowName')
                if ref.get('DataTable') == 'keyword_cell_effects' and fila_ref in ventajas:
                    rangos[fila_ref] = rangos.get(fila_ref, 0) + int(pe.get('RanksGranted') or 0)
                elif ref.get('DataTable') == 'cell_effect_table' and fila_ref in self.efectos:
                    magnitudes[fila_ref] = magnitudes.get(fila_ref, 0) + float(pe.get('MagnitudeValue') or 0)
        efectos = []
        for fila_ref, m in magnitudes.items():
            txt = magnitud(self.t(self.efectos[fila_ref].get('Description')), m)
            if txt:
                efectos.append(txt)
        rangos = {k: v for k, v in rangos.items() if v > 0}
        return (rangos, efectos, magnitudes) if con_magnitudes else (rangos, efectos)

    def elemento(self, pid, fila, arma=False):
        """Elemento de la pieza. Armas: ElementalType de weapon_power_table. Armaduras: la resistencia positiva de
        armour_resistance_table. Si la pieza no esta en esas tablas, el orbe de la receta (que no es fiable: las
        legendarias de hielo copian la receta de Torgadoro, con ORB_FLAME)."""
        if arma and pid in self.poder:
            return TIPO_ELEMENTO.get(enum(self.poder[pid].get('ElementalType')).replace('ElementType_', ''), 'neutral')
        if not arma and pid in self.resistencia:
            fila_r = self.resistencia[pid]
            for clave, e in RESISTENCIAS.items():
                if (fila_r.get(clave) or 0) > 0:
                    return e
            return 'neutral'
        for c in fila.get('GlobalRecipeComponents') or []:
            e = ELEMENTOS.get((c or {}).get('RowName'))
            if e:
                return e
        return 'neutral' if arma else ''

    def parte(self, pid, fila, ventajas):
        """Parte de arma. Las de los repetidores (canon, prisma, mod...) dan ventajas y magnitudes por nivel, como las
        armas: se suman hasta su nivel maximo y la magnitud del efecto sustituye a [MAGNITUDE] en la descripcion."""
        rangos, _, magnitudes = self.fijos(fila, ventajas, nivel(fila.get('MaxUpgradeLevel')), con_magnitudes=True)
        m = next((x for x in magnitudes.values() if x), 0)
        return {'nombre': self.t(fila.get('DisplayName')) or pid, 'desc': magnitud(self.t(fila.get('Description')), m),
                'icono': self.icono_fila(fila, pid), 'ventajas': rangos}

    def valida(self, pid, fila):
        nombre = self.t(fila.get('DisplayName'))
        if fila.get('bCosmeticOnly') or not nombre or nombre.startswith(('[', '~')):
            return None
        if re.search(r'TEST|DEBUG|DONT|BORROWED|PLACEHOLDER|UNEQUIPPED', pid, re.I):
            return None
        if 'BORROWED' in str((fila.get('CellUnlockPattern') or {}).get('RowName')):
            return None
        return nombre

    def piezas(self, ventajas):
        patrones = self.g.table(GAMEPLAY + 'cell_unlock_pattern_table')
        partes_cat = self.g.table(GEAR + 'weapon_part_catalog')
        self.poder = self.g.table(GAMEPLAY + 'weapon_power_table')
        self.resistencia = self.g.table(GAMEPLAY + 'armour_resistance_table')
        piezas, partes = [], {}

        def base(pid, fila, nombre, ranura):
            tope = nivel(fila.get('MaxUpgradeLevel'))
            rangos, efectos = self.fijos(fila, ventajas, tope)
            gid = fila.get('GenericItemData') if isinstance(fila.get('GenericItemData'), dict) else {}
            rareza = enum(gid.get('RarityLevel')).lower()
            return {'id': pid, 'nombre': nombre, 'ranura': ranura, 'nivel': tope, 'icono': self.icono_fila(fila, pid),
                    'rareza': rareza, 'exotica': rareza == 'legendary',
                    'elemento': self.elemento(pid, fila, arma=ranura == 'arma'),
                    'ventajas': rangos, 'efectos': efectos, 'huecos': self.huecos(fila, patrones, tope)}

        for pid, fila in self.g.table(GEAR + 'armour_gameplay_catalog').items():
            nombre = self.valida(pid, fila)
            ranura = RANURAS.get(enum(fila.get('ArmourSlot')))
            if nombre and ranura:
                p = base(pid, fila, nombre, ranura)
                if p['ventajas'] or p['huecos'] or p['efectos']:     # (variantes cosmeticas sin nada, p.ej. PLAYASKAT)
                    piezas.append(p)
        for tabla, (clave, _) in ARMAS.items():
            filas = self.g.table(GEAR + tabla + '_gameplay_catalog')
            # Legendarias: ranura Weapon_Part_Soul (Union). Heredan la ventaja fija y el efecto unico del arma unida, que
            # tiene que ser del mismo tipo de arma y del mismo elemento (umbrio con umbrio, fuego con fuego...), y no
            # legendaria (las legendarias llevan la etiqueta "notsoulpart") ni exotica.
            unibles = [pid for pid, fila in filas.items() if self.valida(pid, fila)
                       and 'notsoulpart' not in (fila.get('Tags') or [])
                       and enum((fila.get('GenericItemData') or {}).get('RarityLevel')) != 'Legendary'
                       and not any(enum(s.get('WeaponPartType')) == 'Weapon_Part_Soul' for s in fila.get('WeaponPartSlots') or [])]
            for pid, fila in filas.items():
                nombre = self.valida(pid, fila)
                if not nombre:
                    continue
                p = base(pid, fila, nombre, 'arma')
                p['arma'] = clave
                p['partes'] = []
                for s in fila.get('WeaponPartSlots') or []:
                    tipo = enum(s.get('WeaponPartType'))
                    if tipo == 'Weapon_Part_Soul':
                        p['union'] = [u for u in unibles if self.elemento(u, filas[u], arma=True) == p['elemento']]
                        continue
                    if s.get('bHideFromUI'):
                        continue
                    opciones = [k for k, v in partes_cat.items() if enum(v.get('WeaponPartType')) == tipo]
                    p['partes'].append({'tipo': PARTES.get(tipo.rsplit('_', 1)[-1], tipo), 'clave': tipo,
                                        'defecto': s.get('DefaultWeaponPartID') or '',
                                        'bloqueada': bool(s.get('bIsLocked')), 'opciones': opciones})
                    for k in opciones + [s.get('DefaultWeaponPartID') or '']:
                        if k in partes_cat and k not in partes:
                            partes[k] = self.parte(k, partes_cat[k], ventajas)
                piezas.append(p)
        for pid, fila in self.g.table(GEAR + 'lantern_gameplay_catalog').items():
            nombre = self.valida(pid, fila)
            if not nombre:
                continue
            p = base(pid, fila, nombre, 'farol')
            p['instantaneo'] = self.t(fila.get('DescriptionInstant'))
            p['mantenido'] = self.t(fila.get('DescriptionHold'))
            piezas.append(p)
        # quitar opciones de parte sin nombre (no existen en el catalogo) y ranuras sin nada que elegir
        for p in piezas:
            for s in p.get('partes', []):
                s['opciones'] = [k for k in s['opciones'] if k in partes]
                if s['defecto'] not in partes:
                    s['defecto'] = ''
            if 'partes' in p:
                p['partes'] = [s for s in p['partes'] if s['opciones'] or s['defecto']]
        return piezas, partes

    def generar(self):
        os.makedirs(os.path.join(WEB, 'datos'), exist_ok=True)
        os.makedirs(os.path.join(WEB, 'iconos'), exist_ok=True)
        ventajas = self.ventajas()
        celulas = self.celulas(ventajas)
        piezas, partes = self.piezas(ventajas)
        tipos = {}
        for t, nombre in TIPOS_CELULA.items():
            tipos[t] = {'nombre': nombre, 'icono': self.icono('/Game/UI/Textures/Icons/cells/' + ICONOS_TIPO[t],
                                                              'tipo_' + t.lower())}
        usadas = {k for p in piezas for k in p['ventajas']} | {k for k, v in ventajas.items() if v['celulas']}
        ventajas = {k: v for k, v in ventajas.items() if k in usadas}
        datos = {
            'version': '1.6.2', 'generado': time.strftime('%Y-%m-%d %H:%M'),
            'tipos': tipos, 'armas': {c: n for c, n in ARMAS.values()},
            'ventajas': ventajas, 'celulas': celulas, 'piezas': piezas, 'partes': partes,
        }
        ruta = os.path.join(WEB, 'datos', 'datos.js')
        with open(ruta, 'w', encoding='utf-8') as f:
            f.write('// Generado por extractor\\generar.py desde los paks de Dauntless 1.6.2. No editar a mano.\n')
            f.write('window.DATOS = ')
            json.dump(datos, f, ensure_ascii=False, separators=(',', ':'))
            f.write(';\n')
        por = {}
        for p in piezas:
            k = p.get('arma') or p['ranura']
            por[k] = por.get(k, 0) + 1
        self.log(f'{len(ventajas)} ventajas, {len(celulas)} celulas, {len(piezas)} piezas {por}, '
                 f'{len(partes)} partes, {self.n_iconos} iconos')
        self.log(f'-> {ruta}')


def main():
    ap = argparse.ArgumentParser(description='Genera los datos del Buildcrafter desde Dauntless 1.6.2')
    ap.add_argument('--juego', default=JUEGO, help='carpeta del juego 1.6.2 (la que contiene Archon)')
    ap.add_argument('--idioma', default='es', help='es, en, fr, de, it, pt-BR, ru, ja')
    ap.add_argument('--sin-iconos', action='store_true')
    a = ap.parse_args()
    iconos = not a.sin_iconos
    if iconos:
        try:
            import PIL  # noqa: F401
        except ImportError:
            print('aviso: sin Pillow (pip install pillow) no hay iconos')
            iconos = False
    t = time.time()
    Generador(a.juego, a.idioma, iconos).generar()
    print(f'listo en {time.time() - t:.0f} s')


if __name__ == '__main__':
    main()
