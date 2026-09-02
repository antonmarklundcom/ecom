# Fase O1 — `xlsx` parcheado, bordes de input, `proxy()` con test. Pegar en una sesión nueva de OPUS.

Leé `fable/plan.md` ENTERO primero — más §9 (build log) y `KNOWN-ISSUES.md` si existe. Después
`CLAUDE.md`, `fable/REVIEW.md` §3 (F1, F6, F3) y §5. Ejecutá plan §5.1 bajo el protocolo de
autonomía §4. Nada fuera del plan.

Reglas de la fase:
- Branch `phase/o1` desde `main` actualizado. Si `fable/REVIEW.md` P1 tiene respuesta de Anton
  en el hilo o en el repo, manda ésa; si no, el tarball oficial de SheetJS (plan §1.3).
- Skills a cargar: `nextjs-deploy-hostinger` (para razonar si el build de Hostinger baja del
  CDN de SheetJS — no hay evidencia en contra; si dudás, vendorizá en `vendor/` y anotalo).
- Tres bloques (A `xlsx`, B Zod, C `proxy()`), tres commits como mínimo, un solo PR.
- `src/proxy.ts` no se toca salvo que el test C encuentre un bug real. Si lo encontrás:
  arreglo mínimo + entrada en §9.
- `pnpm typecheck && pnpm lint && pnpm test` con `TEST_DATABASE_URL` definida (integración
  incluida) antes de abrir el PR. `pnpm audit` no puede listar `xlsx`.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.1 "Salida O1", ítem por ítem, todos verdes; PR mergeado con CI verde completo.

## Después de esta fase — handoff a O2 (sesión nueva)
Cuatro puertas (§4.9): PR mergeado verde · checklist cumplido · auditoría pre-handoff (build +
tests de nuevo, releer tu diff mergeado como adversario, arreglar) · entrada de §9 commiteada.
Recién ahí: `create_session` con el mismo entorno y modo de permisos (nunca `plan`),
`model` = **Opus** (nunca Fable), `prompt` exactamente:
`Read fable/prompts/opus-2-aviso-pedido-nuevo.md in this repo and execute it.`
Sin `create_session` (CLI local): mismo modelo → seguí en esta ventana con ese archivo.
No hagas handoff con CI rojo, con el PR abierto o con §9 sin tu entrada.
