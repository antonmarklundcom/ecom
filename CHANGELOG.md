# CHANGELOG.md — versiones del template

Cada versión es un tag `vX.Y.Z` sobre `main` de `antonmarklundcom/ecom`.
Publicar una versión dispara `.github/workflows/distribuir.yml`, que abre un PR
de maquinaria en cada tienda de `tiendas.json` (NEW-STORE.md § "La distribución
automática del template"). Un push a `main` ya **no** distribuye: los arreglos
se juntan acá y viajan todos juntos, así cada tienda recibe un PR por versión y
no uno por merge (cada PR corre el CI de esa tienda, y eso son minutos de
Actions).

## Cómo publicar una versión

1. Todo mergeado en `main` y CI verde.
2. `pnpm template:probar-tienda`: una tienda nueva desde ese commit tiene que
   quedar en verde (0 minutos de Actions, corre en tu máquina).
3. Acá abajo, renombrar "Sin publicar" a la versión nueva con la fecha, y dejar
   un "Sin publicar" vacío arriba. **Marcar "Migración: sí"** si algún cambio
   trae una migración en `drizzle/` (la tienda tiene que redeployar y correr
   el setup, NEW-STORE.md § "Migraciones que llegan por `template:sync`").
4. `git tag vX.Y.Z && git push origin vX.Y.Z`.

Versionado: **mayor** si una tienda tiene que hacer algo a mano además de
mergear el PR (variable nueva obligatoria, paso de deploy); **menor** para
funciones nuevas; **parche** para arreglos.

## Sin publicar

Migración: no.

- `.env.example` ya no trae un WhatsApp de ejemplo y `pnpm preflight` bloquea
  el viejo (`+595981123456`) si quedó en un `.env.local`.
- CI gasta menos minutos de Actions: sólo en PRs, cancela la corrida vieja, no
  corre en PRs de sólo docs; `e2e` sólo con el label `ci-completo`, a mano o en
  un PR de distribución; `lighthouse` sólo a mano. `distribuir.yml` y
  `pnpm-al-dia.yml` no corren en las tiendas. Hook `pre-push` con `pnpm test`.
- Las tiendas ya no heredan `fable/` ni Dependabot (`SOLO_TEMPLATE`):
  `nueva-tienda` los borra, `bootstrap:repo` no los copia, `template:sync` los
  saca.
- `template:sync` resuelve solo los conflictos en `KNOWN-ISSUES.md`, `ARCH.md`,
  `NEW-STORE.md` y `CHANGELOG.md` quedándose con el template (T7).
- La suite avisa si corre contra MariaDB (T3).
- `pnpm template:probar-tienda`.
- `tiendas.json` acepta campos de registro por tienda (dominio, hosting, notas).
