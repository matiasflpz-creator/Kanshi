/*
 * Capa de datos y sesión.
 *
 * La app nunca habla directo con localStorage ni con Supabase: usa
 * `KanshiBackend`. Hay dos modos:
 *   - 'local':    sin configuración de Supabase. Todo queda en este navegador
 *                 y quien abre la app puede editar.
 *   - 'supabase': con js/config.js completo. Pide login, los datos viven en la
 *                 nube y los permisos (editor / lector) los aplica la base de
 *                 datos con Row Level Security (ver supabase/schema.sql).
 *
 * Interfaz común:
 *   mode, canSignIn
 *   load(): Promise<{ accounts }>
 *   apply(op, data): Promise<void>   guarda un cambio (ver OPS más abajo)
 *   readLocal(): datos guardados en este navegador (o null)
 *   loadFavorites(): Promise<string[]>   ids de las publicaciones favoritas del usuario
 *   setFavorite(postId, on): Promise<void>
 *
 * Cada cambio se describe con un objeto `op`:
 *   { type: 'renameAccount', id, name }
 *   { type: 'addPost', accountId, post }
 *   { type: 'updatePost', id, fields: { name?, firstIsBaseline? } }
 *   { type: 'deletePost', id }
 *   { type: 'addWeek', postId, week }
 *   { type: 'updateWeek', id, fields: { date, views, clicks, sales, price } }
 *   { type: 'deleteWeek', id }
 *   { type: 'replaceAll' }   reemplaza todo por `data` (restaurar / subir datos)
 */
(function () {
  const LOCAL_KEY = 'kanshi:estado:v1';
  const LOCAL_FAVS_KEY = 'kanshi:favoritos';

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[Kanshi] No se pudieron leer los datos locales.', err);
      return null;
    }
  }

  // ---------- Modo local ----------

  const LocalBackend = {
    mode: 'local',
    readLocal,
    async load() {
      return readLocal();
    },
    async apply(op, data) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 1, accounts: data.accounts }));
    },
    async loadFavorites() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_FAVS_KEY)) || [];
      } catch (err) {
        return [];
      }
    },
    async setFavorite(postId, on) {
      const favs = new Set(await this.loadFavorites());
      if (on) favs.add(postId);
      else favs.delete(postId);
      localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify([...favs]));
    },
  };

  // ---------- Modo Supabase ----------

  // Tipo de link de email con el que se abrió la app (invitación o recuperar
  // contraseña). Se lee antes de crear el cliente, que limpia la URL.
  function linkParams() {
    return new URLSearchParams(location.hash.replace(/^#/, '') || location.search);
  }

  function createSupabaseBackend(cfg) {
    const params = linkParams();
    const initialLinkType = params.get('type');
    const initialLinkError = params.get('error_description') || params.get('error') || null;
    const db = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    // Lee todas las filas de una tabla (Supabase devuelve como máximo 1000 por pedido).
    async function selectAll(table, columns, order) {
      const PAGE = 1000;
      const out = [];
      for (let from = 0; ; from += PAGE) {
        let q = db.from(table).select(columns).range(from, from + PAGE - 1);
        order.forEach((col) => { q = q.order(col, { ascending: true }); });
        const { data, error } = await q;
        if (error) throw error;
        out.push(...data);
        if (data.length < PAGE) return out;
      }
    }

    const check = ({ error }) => { if (error) throw error; };

    const weekRow = (w) => ({
      fecha: w.date,
      vistas: w.views,
      clicks: w.clicks,
      ventas: w.sales,
      precio: w.price,
    });

    return {
      mode: 'supabase',
      readLocal,
      initialLinkType,
      initialLinkError,

      // ----- Sesión -----
      async getSession() {
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        return data.session;
      },
      onAuthChange(cb) {
        db.auth.onAuthStateChange((event, session) => cb(event, session));
      },
      async signIn(email, password) {
        check(await db.auth.signInWithPassword({ email, password }));
      },
      async signOut() {
        await db.auth.signOut();
      },
      async sendPasswordReset(email) {
        const redirectTo = location.origin + location.pathname;
        check(await db.auth.resetPasswordForEmail(email, { redirectTo }));
      },
      async updatePassword(password) {
        check(await db.auth.updateUser({ password }));
      },
      async getRole(userId) {
        const { data, error } = await db.from('perfiles').select('rol').eq('id', userId).maybeSingle();
        if (error) throw error;
        return data && data.rol === 'editor' ? 'editor' : 'lector';
      },

      // ----- Datos -----
      async load() {
        const [cuentas, pubs, semanas] = await Promise.all([
          selectAll('cuentas', 'id, nombre', ['orden', 'creado']),
          selectAll('publicaciones', 'id, cuenta_id, nombre, semana1_punto_partida', ['orden', 'creado']),
          selectAll('semanas', 'id, publicacion_id, fecha, vistas, clicks, ventas, precio, creado', ['fecha', 'creado']),
        ]);
        const posts = new Map();
        const accounts = cuentas.map((c) => ({ id: c.id, name: c.nombre, posts: [] }));
        const byId = new Map(accounts.map((a) => [a.id, a]));
        pubs.forEach((p) => {
          const post = { id: p.id, name: p.nombre, firstIsBaseline: p.semana1_punto_partida, weeks: [] };
          posts.set(p.id, post);
          const acc = byId.get(p.cuenta_id);
          if (acc) acc.posts.push(post);
        });
        semanas.forEach((s) => {
          const post = posts.get(s.publicacion_id);
          if (!post) return;
          post.weeks.push({
            id: s.id,
            date: s.fecha,
            views: Number(s.vistas),
            clicks: Number(s.clicks),
            sales: Number(s.ventas),
            price: Number(s.precio),
            createdAt: Date.parse(s.creado) || 0,
          });
        });
        return { accounts };
      },

      // Favoritos: las políticas de la base sólo dejan ver y cambiar los propios,
      // y sólo a editores. usuario_id lo completa la base con el usuario logueado.
      async loadFavorites() {
        const rows = await selectAll('favoritos', 'publicacion_id', ['creado']);
        return rows.map((r) => r.publicacion_id);
      },
      async setFavorite(postId, on) {
        if (on) {
          const { error } = await db.from('favoritos').insert({ publicacion_id: postId });
          // 23505 = ya estaba marcada (por ejemplo, desde otro dispositivo).
          if (error && error.code !== '23505') throw error;
        } else {
          check(await db.from('favoritos').delete().eq('publicacion_id', postId));
        }
      },

      async apply(op, data) {
        switch (op.type) {
          case 'renameAccount':
            return check(await db.from('cuentas').update({ nombre: op.name }).eq('id', op.id));
          case 'addPost': {
            const acc = data.accounts.find((a) => a.id === op.accountId);
            return check(await db.from('publicaciones').insert({
              id: op.post.id,
              cuenta_id: op.accountId,
              nombre: op.post.name,
              semana1_punto_partida: !!op.post.firstIsBaseline,
              orden: acc ? acc.posts.indexOf(op.post) : 0,
            }));
          }
          case 'updatePost': {
            const row = {};
            if ('name' in op.fields) row.nombre = op.fields.name;
            if ('firstIsBaseline' in op.fields) row.semana1_punto_partida = !!op.fields.firstIsBaseline;
            return check(await db.from('publicaciones').update(row).eq('id', op.id));
          }
          case 'deletePost':
            return check(await db.from('publicaciones').delete().eq('id', op.id));
          case 'addWeek':
            return check(await db.from('semanas').insert(Object.assign({ id: op.week.id, publicacion_id: op.postId }, weekRow(op.week))));
          case 'updateWeek':
            return check(await db.from('semanas').update(weekRow(op.fields)).eq('id', op.id));
          case 'deleteWeek':
            return check(await db.from('semanas').delete().eq('id', op.id));
          case 'replaceAll':
            // Función de la base de datos: borra y vuelve a cargar todo en una sola transacción.
            return check(await db.rpc('reemplazar_todo', { datos: { accounts: data.accounts } }));
          default:
            throw new Error('Operación desconocida: ' + op.type);
        }
      },
    };
  }

  // Detecta si por error se pegó una clave secreta (da acceso total y no debe
  // estar nunca en el código de una página pública).
  function isSecretKey(key) {
    if (/^sb_secret_/.test(key)) return true;
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'service_role';
    } catch (err) {
      return false;
    }
  }

  const cfg = (window.KANSHI_CONFIG && window.KANSHI_CONFIG.supabase) || {};
  const configured = !!(cfg.url && cfg.anonKey);

  if (configured && isSecretKey(cfg.anonKey)) {
    window.KanshiBackend = { mode: 'unavailable', reason: 'secret-key', readLocal };
  } else if (configured && !window.supabase) {
    // La librería no cargó (sin internet o bloqueada): no se puede entrar.
    window.KanshiBackend = { mode: 'unavailable', reason: 'offline', readLocal };
  } else {
    window.KanshiBackend = configured ? createSupabaseBackend(cfg) : LocalBackend;
  }
})();
