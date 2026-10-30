/*
 * Capa de almacenamiento.
 *
 * Toda la app habla con `KanshiStorage` (load / save), nunca directamente con
 * localStorage. Así, para pasar a la nube alcanza con activar el adaptador de
 * Supabase en js/config.js, sin tocar el resto del código.
 *
 * Interfaz de un adaptador:
 *   name: string
 *   load(): Promise<Estado | null>
 *   save(estado): Promise<void>
 */
(function () {
  const LOCAL_KEY = 'kanshi:estado:v1';

  const LocalAdapter = {
    name: 'local',
    async load() {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async save(state) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    },
  };

  // Guarda el estado completo como un documento JSON en una tabla de Supabase
  // (ver supabase/schema.sql). localStorage se sigue usando como copia local,
  // así la app funciona aunque no haya conexión.
  function createSupabaseAdapter(cfg) {
    let clientPromise = null;

    function getClient() {
      if (!clientPromise) {
        clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')
          .then(({ createClient }) => createClient(cfg.url, cfg.anonKey));
      }
      return clientPromise;
    }

    return {
      name: 'supabase',
      async load() {
        try {
          const db = await getClient();
          const { data, error } = await db
            .from(cfg.table)
            .select('datos')
            .eq('id', cfg.documentId)
            .maybeSingle();
          if (error) throw error;
          if (data && data.datos) {
            await LocalAdapter.save(data.datos);
            return data.datos;
          }
        } catch (err) {
          console.warn('[Kanshi] No se pudo leer de Supabase, uso la copia local.', err);
        }
        return LocalAdapter.load();
      },
      async save(state) {
        await LocalAdapter.save(state);
        const db = await getClient();
        const { error } = await db
          .from(cfg.table)
          .upsert({ id: cfg.documentId, datos: state, actualizado: new Date().toISOString() });
        if (error) throw error;
      },
    };
  }

  const cfg = (window.KANSHI_CONFIG && window.KANSHI_CONFIG.supabase) || {};
  const useSupabase = cfg.enabled && cfg.url && cfg.anonKey;

  window.KanshiStorage = useSupabase ? createSupabaseAdapter(cfg) : LocalAdapter;
})();
