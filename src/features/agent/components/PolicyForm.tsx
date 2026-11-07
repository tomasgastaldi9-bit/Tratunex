"use client";
// "use client": este formulario corre en el navegador porque necesita saber
// si se está guardando, qué respondió el servidor y, sobre todo, recalcular
// "Así decide el agente" mientras la persona escribe los montos.

import { CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { savePolicyAction, type SavePolicyState } from "@/app/agent/rules/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { Input } from "@/components/ui/Input";
import { formatPesos, PAYMENT_TOKEN, POLICY_DECISION_LABELS, type PolicyDecision } from "@/contracts/purchases";
import { policyExamples, type PolicyFormValues } from "./policy-form-data";

/** Un proveedor del CRM para elegir: solo lo que hace falta mostrar. */
export type SupplierOption = { id: string; name: string; organization: string | null };

/**
 * Formulario de reglas de pago (/agent/rules).
 *
 * - initialValues: con qué arranca (las reglas guardadas, o vacío).
 * - suppliers: los contactos del CRM que se pueden elegir como proveedores permitidos.
 * - actionId: identificador de este guardado, para no duplicarlo si se reintenta.
 * - canEdit: false si la persona no es admin. Ve todo, pero no puede cambiar nada.
 */
type PolicyFormProps = {
  initialValues: PolicyFormValues;
  suppliers: SupplierOption[];
  actionId: string;
  canEdit: boolean;
};

// Color e ícono de cada decisión. El ícono va siempre: así la etiqueta se
// entiende aunque alguien no distinga colores (docs/DESIGN.md).
const ESTILO_DECISION: Record<PolicyDecision, { tone: BadgeTone; icon: LucideIcon }> = {
  auto_pay: { tone: "success", icon: CircleCheck },
  needs_approval: { tone: "warning", icon: Clock },
  rejected: { tone: "danger", icon: CircleX },
};

// Estilo de una casilla (checkbox): 20px y negra cuando está marcada
// (accent-ink pinta la casilla nativa con el negro del diseño).
const ESTILO_CASILLA = "size-5 shrink-0 cursor-pointer accent-ink disabled:cursor-not-allowed";

export function PolicyForm({ initialValues, suppliers, actionId, canEdit }: PolicyFormProps) {
  // useActionState conecta el formulario con la acción del servidor (como en
  // el perfil). Usa el estado inicial UNA sola vez: por eso la página le pone
  // key={actionId}, así después de guardar se arma un formulario nuevo.
  const estadoInicial: SavePolicyState = { message: null, fieldErrors: {}, action_id: actionId, attempt: 0 };
  const [state, formAction, pending] = useActionState(savePolicyAction, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);
  const idErrorProveedores = `${useId()}-error`;

  // Campos CONTROLADOS: lo que se ve vive en el estado de React. Así podemos
  // recalcular los ejemplos con cada tecla, y React 19 no los borra al enviar.
  const [maximo, setMaximo] = useState(initialValues.max_per_purchase);
  const [limite, setLimite] = useState(initialValues.auto_pay_limit);
  const [soloPermitidos, setSoloPermitidos] = useState(initialValues.only_allowed_suppliers);
  const [elegidos, setElegidos] = useState<string[]>(initialValues.allowed_supplier_ids);

  // Después de cada respuesta con error, llevamos el foco al primer campo con
  // error (o al botón, si el error es general) para que la persona sepa dónde seguir.
  useEffect(() => {
    if (state.attempt === 0) return; // Recién abierta la página: no movemos nada.
    const formulario = formRef.current;
    const primerError = formulario?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const botonGuardar = formulario?.querySelector<HTMLElement>('button[type="submit"]');
    (primerError ?? botonGuardar)?.focus();
  }, [state.attempt]);

  // Apretar Enter en un campo también envía el formulario. Si ya está
  // guardando, frenamos ese segundo envío.
  function evitarDobleEnvio(event: FormEvent<HTMLFormElement>) {
    if (pending) event.preventDefault();
  }

  /** Marca o desmarca un proveedor de la lista. */
  function alternarProveedor(id: string) {
    setElegidos((actuales) => (actuales.includes(id) ? actuales.filter((otro) => otro !== id) : [...actuales, id]));
  }

  // Los ejemplos se calculan con lo que está escrito AHORA (no con lo guardado).
  const ejemplos = policyExamples({
    max_per_purchase: maximo,
    auto_pay_limit: limite,
    only_allowed_suppliers: soloPermitidos,
    allowed_supplier_ids: elegidos,
  });
  const errores = state.fieldErrors;
  const errorProveedores = errores.allowed_supplier_ids;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={evitarDobleEnvio}
      // max-w-2xl: en la compu los campos no se estiran de punta a punta.
      className="flex max-w-2xl flex-col gap-5"
    >
      {/* Campo oculto: viaja con el formulario pero no se ve. Va fuera del
          fieldset porque uno deshabilitado no manda sus campos. */}
      <input type="hidden" name="action_id" value={state.action_id} />

      {/* fieldset disabled apaga TODOS los campos de adentro de una vez (si no es admin).
          min-w-0: sin esto, en el celular el fieldset no se achica y empuja la página de costado. */}
      <fieldset disabled={!canEdit} className="min-w-0 rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-5">
          {/* Montos en pesos enteros, como texto: el servidor los pasa a
              unidades mínimas de ARGt. inputMode muestra el teclado numérico.
              En el celular, uno abajo del otro; desde tablet (sm), lado a lado. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Máximo por compra"
              name="max_per_purchase"
              required
              inputMode="numeric"
              hint="En pesos."
              value={maximo}
              onChange={(evento) => setMaximo(evento.target.value)}
              error={errores.max_per_purchase}
            />
            <Input
              label="El agente paga solo hasta"
              name="auto_pay_limit"
              required
              inputMode="numeric"
              hint="Arriba de este monto pide tu aprobación."
              value={limite}
              onChange={(evento) => setLimite(evento.target.value)}
              error={errores.auto_pay_limit}
            />
          </div>

          {/* La moneda no se elige: en el MVP el agente paga siempre en ARGt. */}
          <p className="text-sm leading-tight">
            Moneda de pago: <span className="font-bold">{PAYMENT_TOKEN}</span>
          </p>

          {/* La casilla se manda SOLO si está marcada (value "1"); si no vino, es false. */}
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm leading-tight font-bold has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <input
              type="checkbox"
              name="only_allowed_suppliers"
              value="1"
              checked={soloPermitidos}
              onChange={(evento) => setSoloPermitidos(evento.target.checked)}
              className={ESTILO_CASILLA}
            />
            Pagar solo a proveedores permitidos
          </label>

          {/* hidden (y no "sacarla"): si se apaga el filtro, la lista se esconde
              pero sus casillas se siguen mandando, así no se pierde lo elegido
              si después se vuelve a prender. */}
          <div hidden={!soloPermitidos}>
            {suppliers.length === 0 ? (
              <p className="text-sm leading-snug text-ink-muted">
                Todavía no hay proveedores en el CRM.{" "}
                <Link href="/contacts" className="font-bold text-ink underline">
                  Ir a contactos
                </Link>
              </p>
            ) : (
              // fieldset + legend: el lector de pantalla anuncia "Proveedores permitidos, grupo".
              <fieldset className="min-w-0">
                <legend className="text-sm leading-none font-bold">Proveedores permitidos</legend>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {suppliers.map((proveedor) => (
                    <li key={proveedor.id}>
                      <label
                        className={cx(
                          // min-h-11 = 44px: fácil de tocar con el dedo. Borde rojo si hay error.
                          "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-sm",
                          "has-disabled:cursor-not-allowed has-disabled:opacity-50",
                          errorProveedores ? "border-danger" : "border-line",
                        )}
                      >
                        <input
                          type="checkbox"
                          name="allowed_supplier_ids"
                          value={proveedor.id}
                          checked={elegidos.includes(proveedor.id)}
                          onChange={() => alternarProveedor(proveedor.id)}
                          // Si hay error, cada casilla apunta al mensaje (como DayPicker).
                          aria-invalid={errorProveedores ? true : undefined}
                          aria-describedby={errorProveedores ? idErrorProveedores : undefined}
                          className={ESTILO_CASILLA}
                        />
                        {/* min-w-0 + wrap-break-word: un nombre largo baja de línea en vez
                            de empujar la página de costado en el celular. */}
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="leading-tight font-bold wrap-break-word">{proveedor.name}</span>
                          {proveedor.organization && (
                            <span className="text-xs leading-tight wrap-break-word text-ink-muted">
                              {proveedor.organization}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {/* Mismo estilo que el error de los otros campos (el de Field). */}
            {errorProveedores && (
              <p id={idErrorProveedores} className="mt-2 text-xs leading-snug font-bold text-danger">
                {errorProveedores}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Ejemplos calculados en vivo con decidePurchasePolicy: la MISMA regla
          que usa el servidor antes de pagar (ver policy-form-data.ts). */}
      {/* Borde punteado y gris muy claro: es una vista previa calculada, no algo que se edita. */}
      <Card className="flex flex-col gap-4 border-dashed border-gray-300 bg-gray-50">
        <h2 className="text-[15px] leading-none font-semibold">Así decide el agente</h2>
        {ejemplos.ok ? (
          <ul className="flex flex-col gap-4">
            {ejemplos.examples.map((ejemplo) => {
              const estilo = ESTILO_DECISION[ejemplo.check.decision];
              return (
                <li key={ejemplo.amount_atomic} className="flex flex-col gap-1.5">
                  {/* flex-wrap: en el celular, si no entra, la etiqueta baja abajo del monto. */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm leading-tight font-bold">
                      Compra de {formatPesos(ejemplo.amount_atomic)}
                    </span>
                    <Badge tone={estilo.tone} icon={estilo.icon}>
                      {POLICY_DECISION_LABELS[ejemplo.check.decision]}
                    </Badge>
                  </div>
                  <p className="text-sm leading-snug text-ink-muted">{ejemplo.check.reason}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm leading-snug text-ink-muted">{ejemplos.message}</p>
        )}
      </Card>

      {/* Error general (por ejemplo, la base no respondió): qué pasó, arriba del botón. */}
      {state.message && <Alert tone="danger" title={state.message} />}

      {/* Si no es admin, no hay botón: no tendría sentido apretarlo. */}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>
            {pending ? "Guardando…" : "Guardar reglas"}
          </Button>
        </div>
      )}
    </form>
  );
}
