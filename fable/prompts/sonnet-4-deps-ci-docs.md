# Fase S4 — Dependencias, CI y docs. Pegar en una sesión nueva de SONNET, SÓLO con S3 mergeada.

Leé `fable/plan.md` ENTERO primero — más §9 (build log) y `KNOWN-ISSUES.md`. Después `CLAUDE.md`,
`package.json`, `.github/workflows/ci.yml` y `README.md` §"Documentos". Ejecutá plan §6.2 bajo
el protocolo §4. Nada fuera del plan.

**Límites duros (§4.7):** no tocás `src/domain/**`, `src/lib/**`, `src/db/**`,
`src/app/actions/**`, `src/app/api/**` ni `src/proxy.ts`. Un bump que exige cambiar algo ahí
se revierte y se anota en §10.

Reglas de la fase:
- Branch `phase/s4` desde `main` actualizado. S3 sin mergear ⇒ terminala primero.
- `pnpm update` sólo dentro de los rangos declarados. Cero majors. `xlsx` no se toca (viene
  del tarball de O1).
- El job `pnpm-al-dia` se muda a su workflow con `schedule` + `workflow_dispatch`; su
  comentario explicativo se muda con él. `ci.yml` queda con `checks` y `e2e`.
- Docs: tres punteros (README, CLAUDE.md, PLAN.md) a `fable/plan.md`. Cortos. Sin reescribir
  nada más.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §6.2 "Salida S4", ítem por ítem; PR mergeado con CI verde completo.

## Después de esta fase — STOP. No hay fase siguiente.
Cuatro puertas (§4.9) y entrada final en §9. Después, reporte de cierre a Anton, en este orden:
1. Tabla de las cuatro fases con PR y fecha de merge.
2. Lo que quedó en `KNOWN-ISSUES.md` y en §10, una línea cada uno.
3. Pasos manuales numerados que sólo Anton puede hacer: pedirle a Meta la plantilla de
   "pedido nuevo" y cargar `WHATSAPP_CLOUD_TEMPLATE_PEDIDO_NUEVO` en el hPanel de cada tienda;
   correr `pnpm template:diff` en las tiendas ya creadas y cherry-pickear O1 y O2 (maquinaria,
   marcadas con `*`).
4. Recordatorio: este plan queda como historial; la próxima revisión arranca de nuevo con
   `fable/PROMPT.md`.
