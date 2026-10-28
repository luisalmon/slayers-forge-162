"""Lectura de los ficheros de Dauntless 1.6.2 (Unreal Engine 4.25): paks, DataTables, textos e iconos.

Solo lee. Todo sale de los paks del juego instalado en este PC; nada se modifica.
  - Paks v9 sin cifrar con Zlib (los de Dauntless 1.6.2). Un pak con otro formato se salta.
  - .uasset/.uexp con propiedades etiquetadas (no "unversioned").
  - .locres version 2 o 3 (Game.locres de cada idioma).
  - Texture2D cocinadas BC7/DXT/BGRA -> PNG (necesita Pillow).
"""
import json
import os
import struct
import zlib

PAK_MAGIC = 0x5A6F12E1
MOUNT = '../../../'


# ------------------------------------------------------------------------------------------------ paks

def _fstring(b, o):
    n, = struct.unpack_from('<i', b, o)
    o += 4
    if n < 0:
        return b[o:o - 2 * n].decode('utf-16le').rstrip('\0'), o - 2 * n
    return b[o:o + n].decode('latin1').rstrip('\0'), o + n


class Pak:
    """Un .pak v8/v9: indice {ruta relativa a Archon/..: entrada} y lectura de ficheros."""

    FOOTER = 16 + 1 + 4 + 4 + 8 + 8 + 20 + 1 + 5 * 32      # v9: guid, cifrado, magia, version, indice, hash, frozen, compresores

    def __init__(self, path):
        self.path = path
        self.f = open(path, 'rb')
        self.f.seek(-self.FOOTER, 2)
        ft = self.f.read(self.FOOTER)
        magic, self.version, off, size = struct.unpack_from('<IiQQ', ft, 17)
        if magic != PAK_MAGIC or self.version not in (8, 9):
            raise ValueError(f'{os.path.basename(path)}: formato de pak no soportado')
        if ft[16]:
            raise ValueError(f'{os.path.basename(path)}: indice cifrado')
        self.f.seek(off)
        b = self.f.read(size)
        mount, o = _fstring(b, 0)
        count, = struct.unpack_from('<i', b, o)
        o += 4
        self.entries = {}
        for _ in range(count):
            name, o = _fstring(b, o)
            offset, csize, usize, method = struct.unpack_from('<qqqI', b, o)
            o += 28 + 20
            blocks = []
            if method:
                n, = struct.unpack_from('<i', b, o)
                o += 4
                blocks = [struct.unpack_from('<qq', b, o + 16 * i) for i in range(n)]
                o += 16 * n
            encrypted = b[o]
            o += 1 + 4
            full = mount + name
            rel = full[len(MOUNT):] if full.startswith(MOUNT) else full
            self.entries[rel] = (offset, csize, method, blocks, encrypted)

    def read(self, rel):
        offset, size, method, blocks, encrypted = self.entries[rel]
        if encrypted:
            raise ValueError(f'{rel}: cifrado')
        if not method:
            self.f.seek(offset + 8 * 3 + 4 + 20 + 1 + 4)
            return self.f.read(size)
        out = []
        for start, end in blocks:
            self.f.seek(offset + start)
            out.append(zlib.decompress(self.f.read(end - start)))
        return b''.join(out)


class Game:
    """Todos los paks del juego. Los de parche (_P, que van despues en orden alfabetico) pisan a los base."""

    def __init__(self, paks_dir, log=print):
        self.where = {}
        for name in sorted(os.listdir(paks_dir)):
            if not name.endswith('.pak'):
                continue
            try:
                pak = Pak(os.path.join(paks_dir, name))
            except ValueError as e:
                log(f'  aviso: se salta {e}')
                continue
            for rel in pak.entries:
                self.where[rel] = pak

    def has(self, rel):
        return rel in self.where

    def read(self, rel):
        return self.where[rel].read(rel)

    def find(self, predicate):
        return [rel for rel in self.where if predicate(rel)]

    def asset(self, path):
        """'/Game/a/b.c' o 'Archon/Content/a/b' -> (uasset, uexp) o None."""
        if path.startswith('/Game/'):
            path = 'Archon/Content/' + path[len('/Game/'):].split('.')[0]
        if not self.has(path + '.uasset') or not self.has(path + '.uexp'):
            return None
        return self.read(path + '.uasset'), self.read(path + '.uexp')

    def table(self, path):
        pair = self.asset(path)
        if pair is None:
            raise SystemExit(f'no esta en los paks: {path}')
        return read_rows(*pair)


# ------------------------------------------------------------------------------------------------ paquetes

def summary(b):
    o = 4
    legacy, = struct.unpack_from('<i', b, o)
    o += 4
    o += 4 if legacy != -4 else 0                      # LegacyUE3Version
    o += 8                                             # FileVersionUE4, Licensee
    nc, = struct.unpack_from('<i', b, o)
    o += 4 + nc * 20                                   # custom versions
    o += 4                                             # TotalHeaderSize
    _, o = _fstring(b, o)                              # FolderName
    o += 4                                             # PackageFlags
    name_count, name_off = struct.unpack_from('<ii', b, o)
    o += 8
    o += 8                                             # GatherableTextData
    exp_count, exp_off, imp_count, imp_off = struct.unpack_from('<iiii', b, o)
    return name_count, name_off, exp_count, exp_off, imp_count, imp_off


def names(b):
    name_count, name_off, *_ = summary(b)
    out, o = [], name_off
    for _ in range(name_count):
        s, o = _fstring(b, o)
        o += 4                                         # hashes
        out.append(s)
    return out


def imports(b):
    nm = names(b)
    *_, imp_count, imp_off = summary(b)
    out, o = [], imp_off
    for _ in range(imp_count):
        cp, _, cn, _, outer, on, _ = struct.unpack_from('<iiiiiii', b, o)
        o += 28
        out.append((nm[cp], nm[cn], outer, nm[on]))
    return out


def exports(b):
    _, _, exp_count, exp_off, _, _ = summary(b)
    nm = names(b)
    out, o = [], exp_off
    for _ in range(exp_count):
        ni, = struct.unpack_from('<i', b, o + 16)
        out.append(dict(name=nm[ni]))
        o += 104
    return out


NATIVE_STRUCTS = {
    'Vector': '<3f', 'Rotator': '<3f', 'Vector2D': '<2f', 'LinearColor': '<4f', 'Color': '<4B',
    'Guid': '<4I', 'IntPoint': '<2i', 'Quat': '<4f', 'DateTime': '<q', 'Timespan': '<q',
}


class Reader:
    """Propiedades etiquetadas de un .uexp. Los FText salen como {'key', 'src'} para traducirlos con el .locres."""

    def __init__(self, ua, data):
        self.nm = names(ua)
        self.imps = imports(ua)
        self.exps = exports(ua)
        self.d = data
        self.p = 0

    def i32(self):
        v, = struct.unpack_from('<i', self.d, self.p)
        self.p += 4
        return v

    def u8(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def name(self):
        i, n = struct.unpack_from('<ii', self.d, self.p)
        self.p += 8
        return self.nm[i] + (f'_{n - 1}' if n else '')

    def fstring(self):
        n = self.i32()
        if n == 0:
            return ''
        if n < 0:
            s = self.d[self.p:self.p - 2 * n].decode('utf-16le')
            self.p -= 2 * n
        else:
            s = self.d[self.p:self.p + n].decode('latin1')
            self.p += n
        return s.rstrip('\0')

    def obj(self):
        i = self.i32()
        if i < 0:
            return self.imps[-i - 1][3]
        return self.exps[i - 1]['name'] if i > 0 else None

    def tag(self):
        name = self.name()
        if name == 'None':
            return None
        t = dict(name=name, type=self.name(), size=self.i32(), index=self.i32())
        ty = t['type']
        if ty == 'StructProperty':
            t['struct'] = self.name()
            self.p += 16
        elif ty == 'BoolProperty':
            t['bool'] = self.u8()
        elif ty in ('ByteProperty', 'EnumProperty'):
            t['enum'] = self.name()
        elif ty in ('ArrayProperty', 'SetProperty'):
            t['inner'] = self.name()
        elif ty == 'MapProperty':
            t['inner'], t['value'] = self.name(), self.name()
        if self.u8():
            self.p += 16
        return t

    def props(self):
        out = {}
        while True:
            t = self.tag()
            if t is None:
                return out
            end = self.p + t['size']
            try:
                v = self.value(t)
            except Exception as ex:                    # tipo no soportado: se salta
                v = f'<{t["type"]} {t["size"]}b: {ex}>'
            self.p = end
            out[t['name'] if t['index'] == 0 else f'{t["name"]}[{t["index"]}]'] = v

    def struct(self, sname):
        if sname in NATIVE_STRUCTS:
            fmt = NATIVE_STRUCTS[sname]
            v = struct.unpack_from(fmt, self.d, self.p)
            self.p += struct.calcsize(fmt)
            return list(v)
        if sname == 'GameplayTagContainer':
            return [self.name() for _ in range(self.i32())]
        if sname == 'GameplayTag':
            return self.name()
        if sname in ('SoftObjectPath', 'SoftClassPath', 'StringAssetReference'):
            return self.soft()
        return self.props()

    def soft(self):
        path = self.name()
        sub = self.fstring()
        return path + (':' + sub if sub else '')

    def text(self):
        self.p += 4                                    # flags
        hist, = struct.unpack_from('<b', self.d, self.p)
        self.p += 1
        if hist == 0:
            _, key, src = self.fstring(), self.fstring(), self.fstring()
            return {'key': key, 'src': src}
        if hist == -1:
            return {'key': '', 'src': self.fstring() if self.i32() else ''}
        if hist == 11:                                 # StringTableEntry: tabla + clave (el texto esta en la tabla)
            tabla = self.name()
            return {'key': self.fstring(), 'src': '', 'tabla': tabla}
        raise ValueError(f'FText historia {hist}')

    def scalar(self, ty, t=None):
        if ty == 'IntProperty':
            return self.i32()
        if ty == 'UInt32Property':
            v, = struct.unpack_from('<I', self.d, self.p)
            self.p += 4
            return v
        if ty == 'Int64Property':
            v, = struct.unpack_from('<q', self.d, self.p)
            self.p += 8
            return v
        if ty == 'FloatProperty':
            v, = struct.unpack_from('<f', self.d, self.p)
            self.p += 4
            return round(v, 4)
        if ty == 'NameProperty':
            return self.name()
        if ty == 'StrProperty':
            return self.fstring()
        if ty in ('ObjectProperty', 'ClassProperty', 'InterfaceProperty'):
            return self.obj()
        if ty in ('SoftObjectProperty', 'SoftClassProperty'):
            return self.soft()
        if ty == 'BoolProperty':
            return bool(self.u8())
        if ty == 'ByteProperty':
            return self.u8() if t is not None and t.get('enum', 'None') == 'None' else self.name()
        if ty == 'EnumProperty':
            return self.name()
        if ty == 'TextProperty':
            return self.text()
        raise ValueError(f'tipo {ty}')

    def value(self, t):
        ty = t['type']
        if ty == 'BoolProperty':
            return bool(t['bool'])
        if ty == 'StructProperty':
            return self.struct(t['struct'])
        if ty in ('ArrayProperty', 'SetProperty'):
            if ty == 'SetProperty':
                self.i32()                             # elementos a borrar
            n = self.i32()
            inner = t['inner']
            if inner == 'StructProperty':
                it = self.tag()
                return [self.struct(it['struct']) for _ in range(n)]
            if inner == 'ByteProperty':
                return list(self.d[self.p:self.p + n])
            return [self.scalar(inner) for _ in range(n)]
        if ty == 'MapProperty':
            self.i32()
            n = self.i32()
            out = {}
            for _ in range(n):
                k = self.props() if t['inner'] == 'StructProperty' else self.scalar(t['inner'])
                v = self.props() if t['value'] == 'StructProperty' else self.scalar(t['value'])
                out[json.dumps(k) if isinstance(k, dict) else k] = v
            return out
        return self.scalar(ty, t)


def read_rows(ua, ue):
    """Filas de un DataTable: {nombre de fila: {propiedad: valor}}."""
    r = Reader(ua, ue)
    r.props()                                          # propiedades del UDataTable (RowStruct...)
    r.p += 4                                           # guid opcional del UObject
    rows = {}
    for _ in range(r.i32()):
        row = r.name()
        rows[row] = r.props()
    return rows


# ------------------------------------------------------------------------------------------------ textos

LOCRES_MAGIC = bytes.fromhex('0e147475674a03fc4a15909dc3377f1b')


def read_locres(data):
    """{clave: texto} de un .locres (versiones 0-3; Dauntless 1.6.2 usa la 2)."""
    def rd(fmt, p):
        return struct.unpack_from(fmt, data, p)[0], p + struct.calcsize(fmt)

    def fstr(p):
        n, p = rd('<i', p)
        if n == 0:
            return '', p
        if n < 0:
            return data[p:p - 2 * n].decode('utf-16le', 'replace').rstrip('\0'), p - 2 * n
        return data[p:p + n].decode('latin1').rstrip('\0'), p + n

    out = {}
    if data[:16] != LOCRES_MAGIC:                      # version 0: sin cabecera, cadenas en linea
        p = 0
        count, p = rd('<I', p)
        for _ in range(count):
            _, p = fstr(p)
            keys, p = rd('<I', p)
            for _ in range(keys):
                key, p = fstr(p)
                p += 4
                out[key], p = fstr(p)
        return out
    version = data[16]
    strings_off, p = rd('<q', 17)
    s = strings_off
    count, s = rd('<i', s)
    strings = []
    for _ in range(count):
        txt, s = fstr(s)
        strings.append(txt)
        if version >= 2:
            s += 4                                     # contador de referencias
    if version >= 2:
        p += 4                                         # numero total de entradas
    namespaces, p = rd('<I', p)
    for _ in range(namespaces):
        if version >= 2:
            p += 4                                     # hash del namespace
        _, p = fstr(p)
        keys, p = rd('<I', p)
        for _ in range(keys):
            if version >= 2:
                p += 4                                 # hash de la clave
            key, p = fstr(p)
            p += 4                                     # hash del texto fuente
            idx, p = rd('<i', p)
            if 0 <= idx < len(strings):
                out[key] = strings[idx]
    return out


# ------------------------------------------------------------------------------------------------ iconos

def decode_texture(ua, ue, size):
    """Texture2D cocinada -> PIL.Image RGBA de size x size (el mip mas cercano, reescalado), o None."""
    from PIL import Image
    r = Reader(ua, ue)
    r.props()
    p = r.p + 4 + 2 + 2                                # guid opcional, FStripDataFlags x2
    if struct.unpack_from('<i', ue, p)[0] != 1:        # bCooked
        return None
    p += 4 + 8 + 8                                     # nombre del formato, SkipOffset
    p += 4 + 4 + 4                                     # SizeX, SizeY, PackedData
    n, = struct.unpack_from('<i', ue, p)
    p += 4
    fmt = ue[p:p + n].rstrip(b'\0').decode()
    p += n
    p += 4                                             # FirstMip
    mips, = struct.unpack_from('<i', ue, p)
    p += 4
    best = None
    for _ in range(mips):
        p += 4                                         # bCooked
        flags, count, nbytes = struct.unpack_from('<Iii', ue, p)
        p += 12
        offset, = struct.unpack_from('<q', ue, p)
        p += 8
        data = None
        if flags & 0x100:                              # en el .ubulk: no se usa
            pass
        elif flags & 0x1:                              # al final del paquete
            start = offset - len(ua)
            if 0 <= start and start + nbytes <= len(ue):
                data = ue[start:start + nbytes]
        elif nbytes > 0:                               # en linea
            data = ue[p:p + nbytes]
            p += nbytes
        w, h = struct.unpack_from('<ii', ue, p)
        p += 12
        if data and (best is None or abs(w - size) < abs(best[0] - size)):
            best = (w, h, data)
    if not best:
        return None
    w, h, data = best
    try:
        if fmt == 'PF_BC7':
            img = Image.frombytes('RGBA', (w, h), data, 'bcn', 7)
        elif fmt == 'PF_DXT5':
            img = Image.frombytes('RGBA', (w, h), data, 'bcn', 3)
        elif fmt == 'PF_DXT1':
            img = Image.frombytes('RGBA', (w, h), data, 'bcn', 1)
        elif fmt == 'PF_B8G8R8A8':
            img = Image.frombytes('RGBA', (w, h), data, 'raw', 'BGRA')
        else:
            return None
    except Exception:
        return None
    return img if (w, h) == (size, size) else img.resize((size, size), Image.LANCZOS)
