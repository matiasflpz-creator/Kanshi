# Kanshi

App web para hacer seguimiento **semanal** del desempeño de publicaciones de Mercado Libre.

- Dos cuentas (renombrables) y publicaciones ilimitadas dentro de cada una, cada una en su solapa.
- Cargás vistas, clicks y ventas **acumulados** (como los muestra Mercado Libre) y la app calcula lo que pasó en cada semana restando contra la anterior.
- Tabla semana a semana con vistas, clicks, ventas, precio, facturación (ventas × precio) y conversión (ventas ÷ vistas), con el % de cambio contra la semana anterior (verde si sube, rojo si baja).
- Gráficos de evolución de vistas y de ventas.
- Publicaciones ordenadas de la A a la Z, en páginas de 5 con buscador por nombre, y **favoritas** (⭐) por cuenta para cada editor, guardadas en la nube.
- Solapa **Resumen** en cada cuenta: elegís un período (ej. 30/09/2026 a 30/10/2026, o atajos como “Últimos 30 días” o “Mes anterior”) y ves vistas, clicks, ventas, facturación y conversión del período, comparadas contra el período anterior del mismo largo, con detalle por publicación y los mismos gráficos semanales. Puede abarcar una cuenta o todas.
- Datos en la nube con **Supabase**: login con email y contraseña, todo el equipo ve los mismos datos, con dos roles (**editor** carga y modifica; **lector** sólo mira). Los permisos los aplica la base de datos con Row Level Security.
- Copia de seguridad (JSON) descargable/restaurable y exportación a Excel.
- Funciona en el celular y respeta el modo oscuro del sistema.

## Cómo usarla

No necesita instalación ni compilación: es HTML, CSS y JavaScript.

- **En tu compu:** abrí `index.html` con el navegador (necesita internet la primera vez para cargar los gráficos y el exportador de Excel).
- **Online (recomendado para usarla también desde el celular):** publicala gratis con GitHub Pages
  (Settings → Pages → *Deploy from a branch* → elegí la rama y la carpeta `/root`), Netlify o Vercel.

> Mientras `js/config.js` no tenga los datos de Supabase, la app funciona en **modo local**: los datos quedan sólo en el navegador donde los cargás. Para guardar en la nube, seguí [SUPABASE.md](SUPABASE.md).

### Cómo se calcula cada semana

| Dato | Cálculo |
|---|---|
| Vistas / clicks / ventas de la semana | acumulado de esta semana − acumulado de la semana anterior |
| Facturación | ventas de la semana × precio |
| Conversión | ventas de la semana ÷ vistas de la semana |
| % de cambio | (valor de esta semana − valor de la anterior) ÷ valor de la anterior |

Las semanas se ordenan por fecha y se numeran solas. La **Semana 1** no tiene semana anterior, así que muestra los acumulados con los que empezaste.
Si un acumulado es menor que el de la semana anterior, la app te avisa (ícono **!**) porque probablemente sea un error de carga.

## Datos en la nube (Supabase)

La guía completa, paso a paso, está en **[SUPABASE.md](SUPABASE.md)**: crear las tablas, cerrar el registro público, crear usuarios, ponerte como editor, conectar la app y subir los datos que tenías en el navegador.

- `js/storage.js` es la única parte que habla con el almacenamiento: modo **local** (sin configuración) o **supabase** (con `js/config.js` completo).
- `supabase/schema.sql` crea las tablas `cuentas`, `publicaciones`, `semanas`, `favoritos` (de cada editor) y `perfiles` (rol de cada usuario) con sus políticas de Row Level Security: leer requiere sesión iniciada; crear, modificar y borrar requiere rol `editor`; los roles sólo se cambian desde el panel de Supabase.
- En `js/config.js` va sólo la clave **publishable/anon** (es pública). Nunca la clave secret / service_role.

## Estructura

```
index.html          Estructura de la página
css/styles.css      Estilos (claro/oscuro, responsive)
js/config.js        Configuración (URL y clave pública de Supabase)
js/storage.js       Capa de datos y sesión: localStorage o Supabase
js/calc.js          Cálculos semanales (sin DOM)
js/app.js           Interfaz, login, diálogos, gráficos, respaldo y Excel
supabase/schema.sql Tablas, roles y seguridad para Supabase
SUPABASE.md         Guía paso a paso para conectar Supabase
```
