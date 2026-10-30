# Kanshi

App web para hacer seguimiento **semanal** del desempeño de publicaciones de Mercado Libre.

- Dos cuentas (renombrables) y publicaciones ilimitadas dentro de cada una, cada una en su solapa.
- Cargás vistas, clicks y ventas **acumulados** (como los muestra Mercado Libre) y la app calcula lo que pasó en cada semana restando contra la anterior.
- Tabla semana a semana con vistas, clicks, ventas, precio, facturación (ventas × precio) y conversión (ventas ÷ vistas), con el % de cambio contra la semana anterior (verde si sube, rojo si baja).
- Gráficos de evolución de vistas y de ventas.
- Solapa **Resumen** en cada cuenta: elegís un período (ej. 30/09/2026 a 30/10/2026, o atajos como “Últimos 30 días” o “Mes anterior”) y ves vistas, clicks, ventas, facturación y conversión del período, comparadas contra el período anterior del mismo largo, con detalle por publicación y los mismos gráficos semanales. Puede abarcar una cuenta o todas.
- Datos guardados en el navegador, copia de seguridad (JSON) descargable/restaurable y exportación a Excel.
- Funciona en el celular y respeta el modo oscuro del sistema.

## Cómo usarla

No necesita instalación ni compilación: es HTML, CSS y JavaScript.

- **En tu compu:** abrí `index.html` con el navegador (necesita internet la primera vez para cargar los gráficos y el exportador de Excel).
- **Online (recomendado para usarla también desde el celular):** publicala gratis con GitHub Pages
  (Settings → Pages → *Deploy from a branch* → elegí la rama y la carpeta `/root`), Netlify o Vercel.

> Los datos quedan guardados en el navegador donde los cargás. Si usás la app en la compu y en el celular, cada uno tiene sus propios datos hasta que conectes Supabase. Descargá una copia de seguridad cada tanto.

### Cómo se calcula cada semana

| Dato | Cálculo |
|---|---|
| Vistas / clicks / ventas de la semana | acumulado de esta semana − acumulado de la semana anterior |
| Facturación | ventas de la semana × precio |
| Conversión | ventas de la semana ÷ vistas de la semana |
| % de cambio | (valor de esta semana − valor de la anterior) ÷ valor de la anterior |

Las semanas se ordenan por fecha y se numeran solas. La **Semana 1** no tiene semana anterior, así que muestra los acumulados con los que empezaste.
Si un acumulado es menor que el de la semana anterior, la app te avisa (ícono **!**) porque probablemente sea un error de carga.

## Conectar a Supabase (más adelante)

Toda la app lee y escribe a través de `js/storage.js`, que tiene dos adaptadores: `local` (por defecto) y `supabase`.

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecutá `supabase/schema.sql`.
3. En **Project Settings → API**, copiá la *Project URL* y la clave *anon public*.
4. Completá `js/config.js`:
   ```js
   supabase: { enabled: true, url: 'https://xxxx.supabase.co', anonKey: 'eyJ...', table: 'kanshi_estado', documentId: 'principal' }
   ```
5. Recargá la app. Si la tabla todavía está vacía, se usan los datos de este navegador y se suben a la nube con el próximo cambio. Por las dudas, descargá una copia de seguridad antes de activarlo.

La copia en el navegador se mantiene como respaldo local. La política de seguridad incluida en el SQL es abierta para empezar rápido; agregá Supabase Auth y políticas por usuario antes de usarla con datos sensibles.

## Estructura

```
index.html          Estructura de la página
css/styles.css      Estilos (claro/oscuro, responsive)
js/config.js        Configuración (Supabase)
js/storage.js       Capa de datos: localStorage o Supabase
js/calc.js          Cálculos semanales (sin DOM)
js/app.js           Interfaz, diálogos, gráficos, respaldo y Excel
supabase/schema.sql Tabla para Supabase
```
