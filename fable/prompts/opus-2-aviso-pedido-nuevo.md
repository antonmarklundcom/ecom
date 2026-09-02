# Fase O2 — Aviso de pedido nuevo al comercio. Pegar en una sesión nueva de OPUS, SÓLO con O1 mergeada.

Leé `fable/plan.md` ENTERO primero — más §9 (build log) y `KNOWN-ISSUES.md`. Después `CLAUDE.md`,
`ARCH.md` §1 y §5, `src/domain/messaging/*`, `src/app/actions/checkout.ts` y
`src/domain/create-order.ts`. Ejecutá plan §5.2 bajo el protocolo §4. Nada fuera del plan.

Reglas de la fase:
- Branch `phase/o2` desde `main` actualizado. O1 sin mergear ⇒ terminala primero.
- Skills: `paraguay-business-apps` (tono del mensaje, formato de Gs), `fable-cost-guardrail`.
- **Sin schema nuevo.** Todo entra en `order_events` con el helper existente. Si creés que hace
  falta una columna, parás y preguntás (§4.4).
- El aviso se dispara **después del commit**, sin `await` que demore la respuesta, con timeout,
  y **jamás** hace fallar el checkout. Ese test (sender que tira → pedido creado igual) es el
  que más importa de la fase.
- Sin credenciales/plantilla/`WHATSAPP_NUMBER` ⇒ apagado y `flags-apagados.test.ts` verde.
- Guards: no agregás server actions; si lo hicieras, `admin-guards.test.ts` en el mismo PR.
- `pnpm typecheck && pnpm lint && pnpm test` (integración incluida) antes del PR.
- Re-ejecutable; menores → `KNOWN-ISSUES.md`; parar sólo por §4.4.

Salida: plan §5.2 "Salida O2", ítem por ítem; PR mergeado con CI verde completo.

## Después de esta fase — cambio de modelo: handoff a S3 (sesión nueva, SONNET)
Cuatro puertas (§4.9): PR mergeado verde · checklist · auditoría pre-handoff · §9 commiteado.
Recién ahí: `create_session` con el mismo entorno y modo de permisos (nunca `plan`),
`model` = **Sonnet** (nunca Fable), `prompt` exactamente:
`Read fable/prompts/sonnet-3-e2e-playwright.md in this repo and execute it.`
Sin `create_session` (CLI local): acá cambia el modelo ⇒ **pará y reportá** a Anton qué
pegar y dónde. No hagas handoff con CI rojo, con el PR abierto o con §9 sin tu entrada.
