# Sistema de diseño · App Mahou

Identidad visual de la aplicación y reglas para mantenerla coherente. Los valores viven como
**tokens** en `src/app/globals.css` (variables CSS) y `tailwind.config.ts`; los componentes no
llevan colores sueltos.

## 1. Base de marca (qué es oficial y qué no)

No hay un manual de marca de Mahou publicado. Se usa solo lo que se puede verificar:

| Elemento | Origen | Uso en la app |
|---|---|---|
| **Logotipo Mahou** (wordmark) | Recurso oficial en `public/brand/mahou-wordmark*.png` | Siempre entero y en un solo color: rojo sobre claro o blanco sobre rojo. Nunca recoloreado por partes. |
| **Emblema «M»** | Recurso oficial en `public/brand/mahou-m.png` | Barra superior del móvil y marcas de agua discretas sobre rojo. |
| **Rojo Mahou `#DE1F26`** | Color exacto del logotipo oficial | Color principal: acciones, elementos activos, cabeceras de marca. |
| **Logo rojo sobre blanco** | Envase Mahou 2017 (Enric Aguilera / Ntity) | Superficies claras y limpias; el rojo se reserva para lo importante. |

No se ha inventado tipografía corporativa ni emblemas: la tipografía del logotipo es propia de
Mahou y no se usa como fuente de texto. Para la interfaz se usa **Inter**, de lectura cómoda en
móvil.

## 2. Color

Tokens RGB (`--nombre: r g b`) usados con Tailwind como `bg-brand-600`, `text-slate-500`, etc.

**Marca (`brand`)**: 50 tinte suave · 100 · 300 · 500 · **600 Rojo Mahou** · 700 hover/pulsado · 800.

**Neutros cálidos (`slate`)**: 50 fondo de la app (blanco roto) · 100 superficies secundarias ·
200 bordes · 300 bordes de campos · 400 texto deshabilitado · 500 texto secundario · 600–700 texto
de apoyo · 900 texto principal. `white` es la superficie de tarjetas (en oscuro, gris cálido).

**Estados** (`st-*`, solo para estado de tiendas): cumplida verde, pendiente amarillo, vence pronto
naranja, atrasada rojo, sin obligación gris. **Feedback**: `red` error, `green` éxito, `amber` aviso.

**Modo oscuro** diseñado aparte (no invertido): fondo `#12100F`, tarjetas `#1E1A19`, bordes
cálidos, rojo ajustado `#E4282F` para mantener contraste con texto blanco, y barra superior en
rojo profundo `#96161C` para no deslumbrar.

**Blanco literal**: `text-white`/`bg-white` siguen el tema (en oscuro son oscuros). Sobre rojo o
sobre fotos se usa `text-[#fff]`.

## 3. Tipografía

| Clase | Uso | Tamaño |
|---|---|---|
| `.t-display` | Saludo de inicio | 32 → 40 px, 800 |
| `.t-page` | Título de página (`PageHeader`) | 26 → 30 px, 800 |
| `.t-section` | Título de tarjeta o sección | 17 px, 700 |
| `.t-eyebrow` | Antetítulo en rojo, mayúsculas | 11 px, 700 |
| texto | Cuerpo | 14 px (16 px en campos del móvil para evitar zoom) |

Cifras: `tabular-nums` y peso 800 en indicadores.

## 4. Espacio, radios y sombras

Espaciado en múltiplos de 4 px (Tailwind). Radios: tarjetas `rounded-2xl` (16 px), controles
`rounded-xl` (12 px), chips `rounded-full`, hojas modales 28 px. Sombras `shadow-card` (reposo),
`shadow-pop` (menús y modales), `shadow-brand` (elementos rojos destacados).

## 5. Componentes

- **Botones**: `.btn` (primario rojo), `.btn-secondary`, `.btn-ghost`, `.btn-danger`. Mínimo 44 px de alto.
- **Campos**: `.input` + `.label`; con error `aria-invalid="true"` (borde y anillo rojos, el texto escrito se conserva) y mensaje `.field-error`.
- **Tarjetas**: `.card`; paneles secundarios `.panel`.
- **Cabecera de página**: `PageHeader` (título, contador en chip rojo suave, subtítulo, acciones).
- **Enlaces de texto**: `.link` (rojo, subrayado al pasar el ratón).
- **Chips de filtro/pestañas**: seleccionado en rojo Mahou.
- **Modales**: `Sheet` (hoja inferior en móvil, panel centrado en escritorio).
- **Tablas**: `.data-table` en escritorio; listas de tarjetas en móvil.
- **Estados vacíos**: `EmptyState`; carga: `.skeleton`.

## 6. Navegación y tamaños de pantalla

- **< 1024 px (móvil y tablet)**: barra superior roja con emblema, buscador y alertas; barra inferior flotante (Hoy, Mapa, +, Tiendas, Más).
- **≥ 1024 px (portátil y monitor)**: barra lateral con bloque rojo de marca y secciones; barra superior clara con buscador.
- Contenido hasta 1400 px de ancho; en pantallas grandes se aprovecha con rejillas (rutas: mapa y paradas lado a lado).
- Márgenes con `safe-area-inset` para iPhone/Android con muesca.
- Probado sin scroll horizontal en 320, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920 y 2560 px.

## 7. Comportamientos comunes

- **Modales** (`useScrollLock` / `<ScrollLock/>`): bloquean el fondo, admiten anidados, conservan la posición y devuelven el foco al cerrar. Escape cierra solo el de arriba.
- **Formularios** (`FormAssist`, global): Enter pasa al siguiente campo; en el último envía si es un formulario o cierra el teclado; en textos largos hace salto de línea; los campos con su propio Enter (buscadores, etiquetas) mandan. Se evita el doble envío y el primer campo con error se centra en pantalla.
- **Tema**: automático, claro u oscuro (Ajustes → App y cuenta), guardado en el dispositivo.
