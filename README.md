# Slayer's Forge · Dauntless 1.6.2

Creador y buscador de builds para Dauntless 1.6.2 (build `++dauntless+rel-1.6.2-CL-271281`), en el navegador y sin servidor ni internet. No modifica el juego: solo lee sus paks para sacar los datos. Todo lo que muestra sale de esa versión; no mezcla datos de otras.

**Web:** https://luisalmon.github.io/slayers-forge-162/

> Proyecto de fans no oficial y sin ánimo de lucro. Dauntless y todo su contenido pertenecen a Phoenix Labs (ver [Licencia y aviso legal](#licencia-y-aviso-legal)).

## Ramas

| Rama | Contenido |
|---|---|
| `main` | El código: el extractor (`extractor/`) y la página (`web/`), sin datos del juego. |
| `gh-pages` | La web publicada en GitHub Pages: la página con los datos e iconos ya generados desde Dauntless 1.6.2. |

Para actualizar la web se regeneran los datos y se copia `web/` (con `datos/` e `iconos/`) a la rama `gh-pages`.

## Uso en tu PC (sin internet)

1. **`GENERAR DATOS.bat`** (una vez, y cada vez que cambie el juego).
   - Lee los paks de `C:\Games\Dauntless_1.6.2` y crea `web\datos\datos.js` y `web\iconos\`. Tarda unos segundos.
   - Necesita Python 3; Pillow, para los iconos, se instala solo si falta.
   - Otra carpeta del juego: `"GENERAR DATOS.bat" --juego "D:\ruta\Dauntless_1.6.2"`.
   - Otro idioma: `--idioma en` (también `fr`, `de`, `it`, `pt-BR`, `ru`, `ja`).
2. **`ABRIR.bat`** abre `web\index.html` en tu navegador.

## Pestañas

- **Constructor**:
  - Arma, yelmo, pecho, brazos, piernas y farol, todos al nivel de mejora máximo (+15).
  - En cada hueco eliges una célula de su tipo (los prismáticos aceptan cualquiera), de +1 a +3.
  - Las armas permiten elegir sus partes: especial y pasiva; en los repetidores, cañón, recámara, empuñadura, prisma y mod.
  - **Armas legendarias** (dos huecos prismáticos y habilidad legendaria): tienen **Unión**. Eliges un arma normal del mismo tipo **y del mismo elemento** (umbrío con umbrío, fuego con fuego…) y la legendaria hereda su ventaja fija y su efecto único, como "Terrores nocturnos" unida a "Ojos de la noche" (+3 Astucia y +50% de daño por debajo del 20% de salud). No hereda sus huecos.
  - A la derecha, el total de cada ventaja (máximo +6, con lo que sobra marcado) y lo que hace a ese rango, más los efectos únicos de las piezas, partes y farol.
  - **Exportar código** da un código de build (`SF162-…`) para compartirla con cualquiera: se pega en **Importar código** de cualquier copia de Slayer's Forge 1.6.2, esté donde esté instalada.
  - **Importar código** acepta ese código o un enlace con `#b=…`. Descarta lo que no encaje: piezas en otra ranura, células en huecos de otro tipo, partes que no son de esa ranura y uniones no permitidas.
  - **Copiar enlace** guarda la build en la dirección (`#b=…`) para abrirla después en tu PC. Como apunta a la carpeta de tu PC, para compartir usa el código.
- **Buscador**:
  - Las ventajas salen en 5 columnas, una por tipo (Potencia, Técnica, Defensa, Movilidad y Utilidad). Un clic la pide a +3, otro a +6 y otro la quita. Los resultados se actualizan solos al cambiar las ventajas o los filtros, sin botón de buscar. Busca combinaciones de piezas con células +3 que lleguen a esos rangos.
  - Filtros: tipo de arma, con o sin farol, armas legendarias e incluir exóticas.
  - **Armas legendarias** (marcada por defecto):
    - Marcada: el arma es siempre una legendaria, unida a un arma de su mismo tipo y elemento que dé alguna de las ventajas pedidas.
    - Si ninguna unión da lo pedido, se usan legendarias con la unión libre y se avisa. Los repetidores no tienen legendarias en 1.6.2.
    - Desmarcada: solo armas normales.
  - **Mostrar descripción** (debajo de la lista, desmarcada por defecto): cada ventaja muestra lo que hace a +3 y a +6.
  - Cada resultado muestra, debajo de cada pieza, la ventaja fija que da (en negrita si es una de las pedidas) y sus huecos (la célula que lleva o "Libre", con el icono y el color de su tipo) y, abajo, las ventajas conseguidas y los huecos libres agrupados por tipo (por ejemplo, Potencia ×3, Técnica ×2).
  - Se muestran las 60 mejores: más huecos libres, menos exóticas y más rango de sobra en lo pedido. Las piezas equivalentes se agrupan; entre paréntesis va cuántas hay.
  - "Abrir en el constructor" carga la build.
- **Ventajas**: todas las ventajas con lo que hacen en cada rango y qué piezas las dan.

## Cómo funciona (para retocarlo)

```
extractor\ue4.py      lectura de paks v9 (UE 4.25), DataTables, .locres e iconos (Texture2D BC7/DXT)
extractor\generar.py  arma web\datos\datos.js desde las tablas del juego
web\index.html, app.js, style.css   la página (JavaScript sin dependencias)
```

**Tablas que usa** (`Archon/Content/Gameplay/…`):

| Tabla | Para qué |
|---|---|
| `keyword_cell_effects` | Las ventajas: nombre, tipo y efectos por rango (`UniqueRankedEffects`) |
| `cell_effect_table` | Los textos de cada efecto, con `[MAGNITUDE]`, `[MAGNITUDE_PERCENT]`… sustituidos por su valor |
| `cell_unlock_pattern_table` | Los huecos de célula de cada pieza y a qué nivel se abren |
| `Backend/Catalogs/generated_cell_catalog` | Las células (+1/+2/+3 = `_UC`/`_R`/`_E`) |
| `…/Gear_Catalogs/armour_gameplay_catalog` | Armaduras |
| `…/Gear_Catalogs/weapon_*_gameplay_catalog` | Armas: `eblade`, `gaxe`, `ihammer`, `cblades`, `mspear`, `dp` (repetidores) y `ac` (golpeadores) |
| `…/Gear_Catalogs/lantern_gameplay_catalog` | Faroles |
| `…/Gear_Catalogs/weapon_part_catalog` | Partes de arma |
| `Localization/Game/<idioma>/Game.locres` | Textos traducidos |

**Detalles:**
- **Ventajas fijas de cada pieza:** `PermanentCellsPerLevel` sumado hasta `MaxUpgradeLevel`. Si apunta a `keyword_cell_effects` son rangos de ventaja; si apunta a `cell_effect_table`, efectos únicos con su magnitud acumulada.
- **Elemento:**
  - Armas: `ElementalType` de `Gameplay/weapon_power_table`.
  - Armaduras: la resistencia positiva de `Gameplay/armour_resistance_table`.
  - Si una pieza no está en esas tablas, se usa el orbe de la receta. No es fiable: las legendarias de hielo copian la receta de Torgadoro, con `ORB_FLAME`. Por eso "Infierno frío" salía de fuego y no se podía unir con "Diente de Pangar".
- **Textos de StringTable:** los nombres de los sets MINT (hielo) y GLITTER (radiante) y sus legendarias son FText de historia 11 (tabla + clave, como `WP_MS_MINT|Display Name`). Se traducen con el `.locres`. Antes esas 20 piezas se perdían.
- **Partes de arma:** su `PermanentCellsPerLevel` da la magnitud de su efecto, que sustituye a `[MAGNITUDE]` en la descripción (por ejemplo, el prisma gélido de los repetidores: 3000 de daño). En 1.6.2 ninguna parte da ventajas.
- **Sin icono:** las cuatro armaduras GLITTER, porque su textura no está en los paks de 1.6.2.
- **Legendarias y exóticas:**
  - Legendaria = arma con ranura `Weapon_Part_Soul` (la Unión). Se puede unir con las armas del mismo tipo y del mismo elemento que no tengan la etiqueta `notsoulpart`, que no sean legendarias y que no sean exóticas.
  - Exótica = rareza `Legendary` en el catálogo: tres yelmos y La Gula, Decreto Fundido, La Mano Divina y Soles Gemelos.
- **Qué se omite:**
  - piezas cosméticas, de prueba, "UNEQUIPPED" y armas prestadas de eventos (`BORROWED`);
  - variantes de armadura sin ventajas, huecos ni efectos (por ejemplo, `AR_LERAWR_PLAYASKAT_HELM`);
  - el arco, que no salió en esta versión;
  - el pak `zzzzzz_Mega400DyeBundles_P.pak`, de tintes y con otro formato.
- **Buscador:** búsqueda completa en profundidad por ranura, quedándose con las 60 mejores.
  - **Grupos:** las piezas que aportan lo mismo a la búsqueda (ventajas pedidas y huecos útiles) son una sola opción.
  - **Dominadas:** se descartan los grupos que otro del mismo hueco supera en todo, porque nunca darían un resultado mejor:
    - igual o más de cada ventaja pedida;
    - huecos iguales o mejores (el prismático cubre cualquier tipo);
    - tantos huecos en total;
    - y sin ser más exótico.
  - **Poda por tipo:** en cada paso suma lo mejor que aún pueden dar las ranuras restantes (por ventaja y por tipo de hueco) y comprueba si las células que faltan caben en huecos de su tipo o prismáticos.
  - **Reparto de células:** cada ventaja que falta necesita `ceil(falta/3)` huecos de su tipo o prismáticos.
  - **Límite:** 4 segundos; si se corta, se avisa.
  - **Validado** contra una búsqueda de fuerza bruta independiente: en todos los casos probados encuentra la misma mejor combinación.
- **Unión de legendarias:** ventaja fija y efecto único de otra arma del mismo tipo y elemento, como dice la wiki oficial y las notas del parche 1.5.3, anterior a la 1.6.2. En los datos de 1.6.2, las legendarias llevan la etiqueta `notsoulpart`, que impide unirlas entre sí.

**Formato del enlace:** `#b=` seguido de las seis ranuras separadas por `|`, cada una como `id~célula,célula~parte,parte[~arma unida]`.
- **Código de build:** `SF162-` más ese mismo texto en base64url (UTF-8). No lleva datos del juego, solo los identificadores de las piezas, ventajas y partes, así que vale en cualquier copia generada desde Dauntless 1.6.2.
- Célula: `KW_VENTAJA.rango`, o `-` si el hueco está vacío.

## Licencia y aviso legal

- **Código:** MIT (ver `LICENSE`). © 2026 Luis Almon. La licencia cubre solo el código fuente de este proyecto.
- **Contenido del juego:** Dauntless, su nombre y logotipos, y los nombres, textos, iconos, imágenes y datos de sus objetos son marcas registradas o material protegido por derechos de autor de Phoenix Labs y de sus respectivos titulares. Todos los derechos reservados a sus respectivos propietarios. Este proyecto no reclama ningún derecho sobre ese contenido.
- **Proyecto no oficial:** es un proyecto de fans, gratuito y sin ánimo de lucro. No está afiliado, asociado, patrocinado ni respaldado por Phoenix Labs.
- **Uso informativo:** el contenido del juego se muestra solo para ayudar a la comunidad a planificar builds.
- **Sin garantías:** el software se ofrece "tal cual", sin garantía de ningún tipo; los datos pueden contener errores.
- **Retirada de contenido:** si eres titular de algún contenido y quieres que se retire, abre un issue en el repositorio y se eliminará.
