/*
 * Configuración de Kanshi.
 *
 * Por defecto los datos se guardan sólo en este navegador (localStorage).
 * Para sincronizar con Supabase:
 *   1. Creá un proyecto en https://supabase.com
 *   2. Ejecutá supabase/schema.sql en el SQL Editor del proyecto.
 *   3. Completá url y anonKey (Project Settings → API) y poné enabled: true.
 * Ver README.md para más detalles.
 */
window.KANSHI_CONFIG = {
  supabase: {
    enabled: false,
    url: '',      // ej: 'https://xxxxxxxx.supabase.co'
    anonKey: '',  // clave pública "anon"
    table: 'kanshi_estado',
    // Identificador del documento a sincronizar. Usá el mismo valor en todos tus dispositivos.
    documentId: 'principal',
  },
};
