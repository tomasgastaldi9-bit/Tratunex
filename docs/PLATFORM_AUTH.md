# Autenticación y empresa activa

El ingreso está en `/login` y la selección de empresa en `/login/companies`. Las cuentas y membresías deben existir previamente en Supabase; esta tarea no crea usuarios ni empresas automáticamente.

Los módulos de servidor deben importar `getCompanyContext` desde `src/features/platform/server/public.ts` y comprobar su resultado antes de consultar o modificar datos de empresa. La función valida la sesión con Supabase y consulta la membresía vigente; el ID de la cookie o de una ruta es solo una selección, no una prueba de acceso. En un Server Component, pasar `{ readOnlyCookies: true }` como segundo argumento; en Server Actions y Route Handlers usar el valor por defecto.

Las tablas `companies` y `company_members` permiten a cada usuario leer solo sus propias membresías y empresas. No permiten altas, cambios de roles ni bajas desde los roles de navegador. El alta administrativa y las políticas de las tablas de otros dominios necesitan implementarse por sus dueños antes de usarse.

Para correr localmente, aplicar las migraciones al Supabase local, configurar las variables públicas de `.env.example` en `.env.local` y usar `npm run dev`. `npm test` cubre reglas de servidor y `supabase test db --local` comprueba RLS. `npm run test:e2e` requiere Supabase local, sus variables de entorno y Playwright; el test rechaza una URL que no sea `127.0.0.1:54321` y elimina los usuarios y empresas sintéticos que crea.
