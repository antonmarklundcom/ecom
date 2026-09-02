# Fase S3 — Playwright en CI. Pegar en una sesión nueva de SONNET, SÓLO con O2 mergeada.

Leé `fable/plan.md` ENTERO primero — más §9 (build log) y `KNOWN-ISSUES.md`. Después `CLAUDE.md`,
`.github/workflows/ci.yml`, `src/proxy.ts` (sólo el comentario del CSP) y `scripts/seed-data.ts`
(slugs del seed). Ejecutá plan §6.1 bajo el protocolo §4. Nada fuera del plan.

**Límites duros (§4.7):** no tocás `src/domain/**`, `src/lib/**`, `src/db/**`,
`src/app/actions/**`, `src/app/api/**` ni `src/proxy.ts`. Si un spec "necesita" un cambio ahí,
es un hallazgo: anotalo en `KNOWN-ISSUES.md` y en §10, y adaptá el spec.

Reglas de la fase:
- Branch `phase/s3` desde `main` actualizado. O2 sin mergear ⇒ terminala primero.
- Skills: `nextjs-deploy-hostinger` sólo si el `webServer` de Playwright pelea con el build.
- Tres specs, nombrados en el plan. Independientes entre sí. Sin `sleep`; esperas por
  selector/URL. Sin datos hardcodeados que no salgan del seed.
- `csp.spec.ts` tiene que ponerse rojo si el CSP de la rama cacheada pierde `'unsafe-inline'`.
  Probalo una vez a mano (cambiar, ver rojo, revertir) y dejá constancia en §9.
- El job `e2e` corre después de `checks`, con su timeout, y sube el reporte sólo si falla.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` en local antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.1 "Salida S3", ítem por ítem; PR mergeado con CI verde completo (incluido `e2e`).

## Después de esta fase — handoff a S4 (sesión nueva)
Cuatro puertas (§4.9): PR mergeado verde · checklist · auditoría pre-handoff · §9 commiteado.
Recién ahí: `create_session` con el mismo entorno y modo de permisos (nunca `plan`),
`model` = **Sonnet** (nunca Fable), `prompt` exactamente:
`Read fable/prompts/sonnet-4-deps-ci-docs.md in this repo and execute it.`
Sin `create_session` (CLI local): mismo modelo → seguí en esta ventana con ese archivo.
