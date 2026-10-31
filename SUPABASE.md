# Conectar Kanshi a Supabase: guía paso a paso

Con esta guía los datos pasan a guardarse en la nube, y vos y tu equipo los ven desde cualquier compu o celular, entrando con email y contraseña.

- **Editor**: carga, edita y borra datos (vos).
- **Lector**: sólo mira. No ve los botones de cargar, editar ni borrar, y aunque lo intentara por otro lado, la base de datos no lo deja modificar nada.
- Nadie puede registrarse solo: entran únicamente las personas que vos agregues. Todo usuario nuevo empieza como **lector**.

Tiempo estimado: 15 minutos. Hacé los pasos en orden.

> 🔒 **Una regla de seguridad antes de empezar.** El repositorio es público. En el código sólo se puede poner la clave **publishable** (o la vieja clave **anon public**). **Nunca** copies a ningún lado la clave **secret** ni la **service_role**: esas dan acceso total a la base de datos. Si alguna vez la pegás por error, la app no arranca y te avisa.

---

## Paso 1 · Crear las tablas y la seguridad

1. Abrí tu proyecto en [supabase.com/dashboard](https://supabase.com/dashboard).
2. En el menú de la izquierda, entrá a **SQL Editor** (el ícono `>_`).
3. Tocá **New query** (o el botón **+**).
4. Abrí este archivo en otra pestaña: [supabase/schema.sql](https://github.com/matiasflpz-creator/Kanshi/blob/main/supabase/schema.sql). Arriba a la derecha del código tocá el botón **Copy raw file** (el ícono de dos cuadraditos).
5. Volvé a Supabase, pegá todo en el editor (Ctrl+V) y tocá **Run** (abajo a la derecha, o Ctrl+Enter).
6. Tiene que aparecer **"Success. No rows returned"**. Si Supabase te muestra un aviso sobre "operaciones destructivas", confirmá con **Run this query**: el archivo no borra datos.

Esto crea las tablas (`cuentas`, `publicaciones`, `semanas`, `perfiles`), las dos cuentas iniciales ("Cuenta 1" y "Cuenta 2") y todas las reglas de seguridad. Si algún día lo volvés a ejecutar, no pasa nada: no borra lo que ya cargaste.

## Paso 2 · Cerrar el registro público

1. Menú de la izquierda: **Authentication** (el ícono de personas).
2. Entrá a **Sign In / Providers** (en algunas versiones está dentro de **Configuration**).
3. Apagá la opción **Allow new users to sign up**.
4. Tocá **Save changes**.

Así nadie puede crearse una cuenta por su cuenta. Vos vas a seguir pudiendo agregar usuarios desde el panel (paso 4 y paso 8).

> Verificá en esa misma pantalla que el proveedor **Email** esté activado (lo está de fábrica).

## Paso 3 · Decirle a Supabase dónde está la app

Esto sirve para que los links de los emails (invitación y "olvidé mi contraseña") abran tu app.

1. **Authentication** → **URL Configuration**.
2. En **Site URL** borrá lo que haya y pegá:
   ```
   https://matiasflpz-creator.github.io/Kanshi/
   ```
   Tocá **Save changes**.
3. Más abajo, en **Redirect URLs**, tocá **Add URL**, pegá la misma dirección y guardá.

## Paso 4 · Crear tu usuario

1. **Authentication** → **Users**.
2. Arriba a la derecha: **Add user** → **Create new user**.
3. Escribí tu email y una contraseña (mínimo 8 caracteres).
4. Dejá tildado **Auto Confirm User**.
5. Tocá **Create user**.

## Paso 5 · Ponerte como editor

Todo usuario nuevo es lector, así que tenés que darte el permiso de editor una sola vez.

1. Menú de la izquierda: **Table Editor** (el ícono de tabla).
2. Elegí la tabla **perfiles**. Vas a ver una fila con tu email y `lector` en la columna **rol**.
3. Hacé doble clic sobre `lector`, escribí `editor` y apretá Enter.
4. Si aparece un botón **Save**, tocalo.

<details>
<summary>Otra forma: con SQL</summary>

En **SQL Editor** → **New query**, pegá esto cambiando el email por el tuyo, y tocá **Run**:

```sql
update public.perfiles set rol = 'editor' where email = 'tu-email@ejemplo.com';
```

Tiene que decir "Success. 1 row affected" (si dice 0 rows, revisá que el email esté bien escrito).
</details>

## Paso 6 · Conectar la app a tu proyecto

Necesitás dos datos: la **dirección del proyecto** y la **clave pública**.

1. En Supabase, entrá a **Project Settings** (el engranaje, abajo a la izquierda).
2. **Dirección (URL):** en **Data API** copiá la **Project URL**. Se ve así: `https://abcdefghijkl.supabase.co`
3. **Clave pública:** en **API Keys** copiá la **Publishable key** (empieza con `sb_publishable_`). Si tu proyecto sólo muestra las claves viejas, usá la **anon public** (empieza con `eyJ`).
   ⚠️ **No** copies la que dice **secret** o **service_role**.

Ahora pegalos en la app, directo desde GitHub:

4. Abrí [js/config.js en GitHub](https://github.com/matiasflpz-creator/Kanshi/blob/main/js/config.js) y tocá el lápiz ✏️ (**Edit this file**) arriba a la derecha.
5. Pegá cada dato entre las comillas, así:
   ```js
   url: 'https://abcdefghijkl.supabase.co',
   anonKey: 'sb_publishable_xxxxxxxxxxxx',
   ```
   (respetá las comillas simples y la coma del final de cada línea).
6. Tocá **Commit changes…** y de nuevo **Commit changes**.
7. Esperá 1 o 2 minutos a que GitHub Pages publique el cambio (podés verlo en la pestaña **Actions** del repo: cuando aparece el tilde verde, está listo).

## Paso 7 · Entrar y subir los datos que ya tenías

1. Abrí la app **en la misma compu y el mismo navegador donde cargaste tus datos hasta ahora**: https://matiasflpz-creator.github.io/Kanshi/
   Si ves la versión vieja, apretá **Ctrl + F5**.
2. Por las dudas, antes de entrar podés guardar una copia: si todavía ves la app vieja, usá **Respaldo → Descargar copia de seguridad**.
3. Vas a ver la pantalla **Ingresar**. Entrá con el email y la contraseña del paso 4.
4. Arriba a la derecha tiene que decir **Editor**.
5. Aparece un aviso azul: *"Encontramos datos guardados en este navegador…"*. Tocá **Subirlos a la nube** y confirmá.
   Tus publicaciones y semanas se **agregan** a la nube (no se borra nada). Si cerraste el aviso, la misma opción está en **Respaldo → Subir a la nube los datos de este navegador**.

Listo: desde ahora entrás desde cualquier dispositivo con tu email y contraseña y ves lo mismo.

> ¿Tenías datos en el celular también? Abrí la app en el celular, entrá con tu usuario y subilos de la misma forma. Ojo: si son las mismas publicaciones que ya subiste desde la compu, vas a tenerlas repetidas.

---

## Paso 8 · Invitar a alguien de tu equipo (como lector)

**Forma recomendada: crearle el usuario con una contraseña**

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribí su email y una contraseña provisoria. Dejá tildado **Auto Confirm User**. Tocá **Create user**.
3. Mandale por WhatsApp o mail el link de la app (`https://matiasflpz-creator.github.io/Kanshi/`), su email y la contraseña provisoria.
4. Cuando entre, puede cambiarla desde el círculo con su inicial (arriba a la derecha) → **Cambiar contraseña**.

Va a entrar como **lector**: ve todo, pero no puede cambiar nada.

**Otra forma: invitación por email**

**Authentication** → **Users** → **Add user** → **Send invitation** → escribí su email. Le llega un email; al tocar el link se abre Kanshi y le pide que elija su contraseña.

> ⚠️ El servicio de emails gratuito de Supabase tiene límites muy bajos y puede que sólo envíe emails a los miembros de tu equipo de Supabase. Si la invitación no le llega (ni en spam), usá la forma recomendada. Lo mismo vale para el link de **¿Olvidaste tu contraseña?**: si no llega, borrá el usuario y crealo de nuevo con una contraseña nueva.

### Otras tareas comunes

- **Pasar a alguien de lector a editor (o al revés):** Table Editor → **perfiles** → cambiá la columna **rol** por `editor` o `lector`. La persona tiene que recargar la app para ver el cambio.
- **Sacarle el acceso a alguien:** Authentication → **Users** → los tres puntitos de esa persona → **Delete user**.
- **Ver quiénes tienen acceso:** Table Editor → **perfiles**.

---

## Problemas frecuentes

| Qué pasa | Qué hacer |
|---|---|
| La app se sigue viendo como antes, sin pantalla de ingreso | Esperá 2 minutos después de editar `config.js` y apretá **Ctrl + F5**. |
| "Email o contraseña incorrectos" | Revisá el email. Si no te acordás de la contraseña, borrá el usuario en **Users** y crealo de nuevo (tus datos no se pierden: están en las tablas, no en el usuario). Si eras editor, repetí el paso 5. |
| "Falta preparar la base de datos" | No se ejecutó bien el paso 1. Repetilo. |
| Entré pero dice **Lector** y soy el dueño | Hacé el paso 5 y recargá la app. |
| "Configuración insegura" | En `config.js` pegaste la clave **secret**. Cambiala por la **publishable** y, por seguridad, en Supabase → Project Settings → API Keys creá una clave secreta nueva y borrá la vieja. |
| "No se pudo conectar" | Revisá tu conexión a internet y recargá. |
| No veo el aviso para subir mis datos | Tenés que estar en el mismo navegador donde los cargaste y entrar como **editor**. También está en **Respaldo → Subir a la nube…** |

## Cómo está protegida la información

- Sin iniciar sesión no se puede leer nada.
- Las reglas de seguridad (Row Level Security) están **en la base de datos**: un lector no puede crear, modificar ni borrar datos, aunque intente hacerlo sin pasar por la app.
- Nadie puede cambiarse el rol a sí mismo desde la app: los roles sólo se cambian desde el panel de Supabase.
- La clave publicable que está en `config.js` es pública a propósito: por sí sola no da acceso a los datos.
- Las copias de seguridad (Respaldo) y la exportación a Excel siguen funcionando igual, para cualquier usuario.
