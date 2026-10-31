/*
 * Configuración de Kanshi.
 *
 * Mientras url y anonKey estén vacíos, la app funciona en "modo local":
 * los datos quedan sólo en este navegador.
 *
 * Para guardar en la nube con Supabase, completá los dos valores con los de tu
 * proyecto (Supabase → Project Settings → API Keys / Data API). Ver
 * SUPABASE.md para el paso a paso.
 *
 * ⚠ El repositorio es público. Acá va SÓLO la clave pública
 *   ("publishable" o "anon"). NUNCA pegues la clave "secret" ni la
 *   "service_role": esas dan acceso total a la base de datos.
 */
window.KANSHI_CONFIG = {
  supabase: {
    url: '',      // ej: 'https://abcdefghijkl.supabase.co'
    anonKey: '',  // ej: 'sb_publishable_...' (o la clave "anon" que empieza con 'eyJ')
  },
};
