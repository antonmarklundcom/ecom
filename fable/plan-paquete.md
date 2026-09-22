# plan-paquete.md — ¿la maquinaria como paquete versionado?

Propuesta de diseño, **no implementada**. Espera la decisión de Anton (§6).
Escrita el 2026-09-22, después de #118, que cambió `template:sync` a una
sincronización archivo por archivo. Eso cambia bastante la comparación.

## 1. El problema

Cada tienda es una copia del template ("Use this template") que después se
rediseña. La maquinaria (`src/domain`, `src/lib`, `src/db`, `drizzle`,
`src/app/api`, `src/app/actions`, `scripts`, `tests`) tiene que seguir al
template; la piel no. Hoy eso se resuelve **sincronizando archivos**: cada
versión (`v*`) abre un PR `template/sync` en cada tienda de `tiendas.json`.

Lo que se vio con las tres tiendas reales (productos, lenceria, mascota):

- Las tiendas **sí** tocan maquinaria: lenceria tiene su propio
  `src/db/index.ts`, `src/lib/images.ts` y `src/lib/seo.ts`; mascota y
  productos no trajeron la carga por planilla. Con un paquete, esos cambios no
  tendrían dónde vivir.
- Los baselines marcados a mano mienten (mascota decía estar al día con
  código que no tenía). Un paquete con versión lo haría imposible.
- Con el sync nuevo, productos y lenceria sincronizan limpio y en verde; mascota
  queda con un conflicto real, visible en un PR en draft.

## 2. Las opciones

### A. Paquete npm privado en GitHub Packages

`@antonmarklundcom/ecom-core` publicado en `npm.pkg.github.com`; la tienda lo
importa en vez de tener `src/domain` etc.

- **Hostinger:** el build hace `pnpm install` desde el repo. GitHub Packages
  pide token **aunque el paquete sea público**: habría que cargar un
  `NPM_TOKEN` en el hPanel de cada tienda y un `.npmrc` con
  `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`. Si el token vence, **el
  deploy de todas las tiendas se rompe a la vez**, y en producción. Es el
  riesgo más serio de toda la comparación.
- **Minutos de Actions:** un workflow de publish por versión (~2 min). El CI
  de las tiendas no cambia. Todos los repos son públicos, así que es gratis
  igual.
- **Actualizar una tienda:** un PR de una línea (`"ecom-core": "1.3.0"`), vía
  Renovate o a mano. Simple de revisar.

### B. Paquete público sin registro (dependencia git)

`"ecom-core": "github:antonmarklundcom/ecom-core#v1.3.0"`, con el TypeScript
fuente adentro (sin paso de build) y `transpilePackages: ['ecom-core']` en
`next.config.ts`.

- **Hostinger:** sin token (repo público, pnpm baja el tarball de
  codeload.github.com). Hay que probar que el build de Hostinger llegue a
  GitHub, pero es el mismo camino que ya usa para clonar el repo.
- pnpm 10+ no corre scripts de build de dependencias sin `onlyBuiltDependencies`
  (ya existe en `pnpm-workspace.yaml`); con TS fuente no hace falta ninguno.
- Mismo PR de una línea que A, sin el riesgo del token.

### C. Git submodule

La maquinaria como submódulo en `src/core`.

- **Hostinger:** no está documentado que su deploy por Git inicialice
  submódulos. Si no lo hace, el build falla.
- Los submódulos se rompen fácil en sesiones de IA y en checkouts de Windows
  (rutas, CRLF, "detached HEAD" adentro). Mucho costo operativo para un
  beneficio igual al de B.

### D. Seguir con la sincronización por archivos (lo de hoy, después de #118)

- **Hostinger:** nada cambia.
- **Minutos:** el CI de cada tienda corre en su PR de distribución (gratis en
  repos públicos).
- **Divergencia por tienda:** permitida y visible. Lo que la tienda cambió se
  fusiona; un choque real queda en un PR en draft con marcadores.
- **Costo:** un PR por tienda y por versión, más grande que "subí la versión",
  y el baseline hay que cuidarlo (`template:sync` lo mueve solo).

## 3. Qué habría que resolver para A o B

1. **Imports.** `@/domain/...` pasa a `ecom-core/domain/...` en toda la piel.
   Son cientos de líneas, pero es un reemplazo mecánico.
2. **Migraciones.** `/api/setup/init` y `tests/global-setup.ts` leen
   `./drizzle` desde `process.cwd()`. El paquete tendría que exportar la ruta
   (`require.resolve('ecom-core/drizzle/meta/_journal.json')`) y el setup
   usarla. `pnpm db:generate` en una tienda dejaría de tener sentido: el schema
   vive en el paquete.
3. **Scripts.** `pnpm preflight`, `reconcile`, `backup`, `create-owner`… pasan
   a ser `bin` del paquete, o quedan wrappers de una línea en la tienda.
4. **Tests.** Los de maquinaria van al paquete (su propio CI, con MySQL); la
   tienda se queda con los e2e y los de piel.
5. **Rutas de Next.** `src/app/api/**` y `src/app/actions/**` son archivos que
   Next descubre por ruta: no pueden vivir en el paquete. Quedarían como
   reexports de una línea en la tienda, y esos sí seguirían sincronizándose.
   **Esto quiere decir que el sync no desaparece:** se achica.
6. **Lo que hoy hacen las tiendas con la maquinaria** (lenceria: db, images,
   seo) necesita puntos de extensión en `src/config/tienda.ts` antes de mover
   nada. Si no, esas tiendas no pueden migrar.

## 4. Qué se rompe en `template:sync`

Con A o B, `MAQUINARIA` se achica a los reexports de rutas y al `package.json`
(la versión del paquete). El merge archivo por archivo sigue sirviendo para
la piel común y los configs. `distribuir.yml` sigue abriendo PRs, pero con
mucho menos adentro. El baseline sigue existiendo para esa parte.

## 5. Migración de una tienda existente (si se elige B)

1. Publicar `ecom-core` v1 desde el template, con puntos de extensión para lo
   de §3.6.
2. Por tienda, un PR: borrar las carpetas de maquinaria, agregar la
   dependencia, reemplazar imports, reexports de rutas, `transpilePackages`.
   Correr su CI y su e2e.
3. Deploy en Hostinger con el setup de migraciones (§3.2). Primero una
   tienda de prueba: el camino de migraciones en producción es lo más
   delicado.

Una sesión de IA por tienda; tres tiendas hoy.

## 6. Recomendación

**D ahora; B cuando haya más tiendas.** No A ni C.

- El sync archivo por archivo (#118) ya resuelve lo que motivaba el paquete:
  las tiendas reciben la maquinaria sin cherry-picks que se frenan, y lo que
  diverge se ve en el PR.
- Con 3 tiendas, migrar a B cuesta más de lo que ahorra. El punto de quiebre
  está en unas **8 a 10 tiendas**, o antes si revisar un PR de distribución
  por tienda se vuelve el cuello de botella.
- Lo que conviene hacer ya, porque sirve para D y deja lista la puerta a B:
  sacar de la maquinaria las personalizaciones por tienda (§3.6) y llevarlas a
  `src/config/tienda.ts` o a puntos de extensión. Cada una que quede es un
  conflicto potencial en cada distribución.
- A, no: el token de GitHub Packages en el hPanel de cada tienda es un punto
  único de falla en el deploy de producción.
- C, no: el riesgo con Hostinger y con las sesiones de IA no compensa.

**Decisión pendiente (Anton):** ¿D ahora y revisar B con ~8 tiendas? ¿O
empezar B ya? En ese caso, el primer paso es §3.6 más un spike de §3.2 en una
tienda de prueba.
