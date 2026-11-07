"use client";
// "use client": este editor corre en el navegador porque la lista cambia
// mientras la persona trabaja (agregar, sacar, escribir) y el contador de
// caracteres se actualiza en vivo, sin recargar la página.

// Los íconos se importan ACÁ y no se reciben de la página: un ícono es una
// función, y una página del servidor no le puede pasar funciones a un
// componente "use client" (docs/DESIGN.md, "Trampas conocidas").
import {
  BookOpen,
  CircleX,
  LetterText,
  MessageCirclePlus,
  MessageCircleQuestionMark,
  Package,
  PackagePlus,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { saveKnowledgeAction, type SaveKnowledgeState } from "@/app/agent/knowledge/actions";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  KNOWLEDGE_BODY_MAX,
  KNOWLEDGE_KIND_LABELS,
  KNOWLEDGE_NAME_MAX,
  KNOWLEDGE_PRICE_MAX,
  KNOWLEDGE_QUESTION_MAX,
  knowledgeTextLength,
  type KnowledgeItem,
} from "@/contracts/agent";
import {
  knowledgeCounterText,
  knowledgeCounterTone,
  type KnowledgeCounterTone,
  type KnowledgeItemField,
} from "./knowledge-form-data";

/**
 * Editor de la base de conocimiento (/agent/knowledge): la lista de productos
 * y preguntas frecuentes que el agente puede usar en la llamada.
 *
 * - initialItems: la lista guardada en la versión vigente (vacía si todavía no hay nada).
 * - baseVersion: la versión que está viendo la persona. Se manda oculta: si
 *   mientras tanto alguien guardó otra, el servidor avisa en vez de pisarla.
 * - actionId: identificador de este guardado, para no duplicarlo si se reintenta.
 * - canEdit: false si la persona no es admin. Ve todo, pero no puede cambiar nada.
 */
type KnowledgeEditorProps = {
  initialItems: KnowledgeItem[];
  baseVersion: number;
  actionId: string;
  canEdit: boolean;
};

/**
 * Un ítem tal como vive en pantalla: sus datos + una "clave" que lo identifica
 * mientras se edita. La clave sirve para que React sepa qué ítem es cuál al
 * agregar o sacar (prop "key"), para llevar el foco a un ítem y para que los
 * errores sigan pegados a SU ítem aunque se saque otro. No se guarda en la base.
 */
type ItemEnPantalla = { clave: string; datos: KnowledgeItem };

/** Ícono de la etiqueta de cada tipo de ítem. */
const ICONOS_TIPO: Record<KnowledgeItem["kind"], LucideIcon> = {
  product: Package,
  faq: MessageCircleQuestionMark,
};

/** Ícono del contador según su color: así se entiende sin depender del color. */
const ICONOS_CONTADOR: Record<KnowledgeCounterTone, LucideIcon> = {
  neutral: LetterText,
  warning: TriangleAlert,
  danger: CircleX,
};

/** Un ítem nuevo, con todos sus textos vacíos. */
function itemVacio(kind: KnowledgeItem["kind"]): KnowledgeItem {
  return kind === "product" ? { kind, name: "", description: "", price_hint: "" } : { kind, question: "", answer: "" };
}

export function KnowledgeEditor({ initialItems, baseVersion, actionId, canEdit }: KnowledgeEditorProps) {
  // useActionState conecta el formulario con la acción del servidor:
  //  - state: la última respuesta (al principio, lo que le pasamos acá abajo).
  //  - formAction: lo que va en <form action>; llama a saveKnowledgeAction.
  //  - pending: true mientras el servidor está guardando.
  // Ojo: useActionState usa este estado inicial UNA sola vez. Por eso la página
  // le pone key={actionId} a <KnowledgeEditor>: después de guardar, la key
  // cambia y React arma el editor desde cero con la lista recién guardada.
  const estadoInicial: SaveKnowledgeState = { message: null, fieldErrors: {}, action_id: actionId, attempt: 0 };
  const [state, formAction, pending] = useActionState(saveKnowledgeAction, estadoInicial);

  // La lista vive en el estado de React y los campos son "controlados" (value
  // + onChange). Así, cuando React 19 limpia el formulario después de enviarlo,
  // lo escrito no se pierde: los campos siempre muestran lo que hay acá.
  // Las claves de lo guardado son fijas ("guardado-0", "guardado-1"…): el
  // servidor y el navegador tienen que dibujar exactamente lo mismo.
  const [items, setItems] = useState<ItemEnPantalla[]>(() =>
    initialItems.map((datos, posicion) => ({ clave: `guardado-${posicion}`, datos })),
  );
  // Contador para armar claves nuevas ("nuevo-1", "nuevo-2"…). Es un ref y no
  // estado porque cambiarlo no tiene que volver a dibujar nada.
  const ultimaClave = useRef(0);

  // Las claves de los ítems tal como estaban al apretar "Guardar". El servidor
  // contesta los errores por POSICIÓN ("2.name" = el tercer ítem que mandamos);
  // con esta foto sabemos a qué ítem le corresponde cada error, aunque después
  // la persona saque otro y las posiciones se corran.
  const [clavesEnviadas, setClavesEnviadas] = useState<string[]>([]);

  // Dónde poner el foco del teclado después de agregar o sacar un ítem.
  // clave null = en el botón "Agregar producto" (cuando la lista quedó vacía).
  // Es un objeto nuevo en cada pedido, así el efecto de abajo corre siempre.
  const [pedidoDeFoco, setPedidoDeFoco] = useState<{ clave: string | null } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const idContador = useId();

  const lista = items.map((item) => item.datos);
  const usados = knowledgeTextLength(lista);
  const tono = knowledgeCounterTone(usados);
  const excedido = tono === "danger";

  // Después de cada respuesta con error, llevamos el foco al primer campo con
  // error (o al botón, si el error es general) para que la persona sepa dónde seguir.
  useEffect(() => {
    if (state.attempt === 0) return; // Recién abierta la página: no movemos nada.
    const formulario = formRef.current;
    const primerError = formulario?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const botonGuardar = formulario?.querySelector<HTMLElement>('button[type="submit"]');
    (primerError ?? botonGuardar)?.focus();
  }, [state.attempt]);

  // Mueve el foco cuando se lo pide agregar o sacar. Va en un efecto porque el
  // ítem nuevo recién existe en la página DESPUÉS de que React lo dibuja.
  useEffect(() => {
    if (pedidoDeFoco === null) return;
    const formulario = formRef.current;
    const { clave } = pedidoDeFoco;
    const destino =
      clave === null
        ? formulario?.querySelector<HTMLElement>("[data-agregar]")
        : // El primer campo del ítem (el nombre o la pregunta).
          formulario?.querySelector<HTMLElement>(`[data-clave="${clave}"] input, [data-clave="${clave}"] textarea`);
    destino?.focus();
  }, [pedidoDeFoco]);

  function agregar(kind: KnowledgeItem["kind"]) {
    ultimaClave.current += 1;
    const clave = `nuevo-${ultimaClave.current}`;
    // Va al final de la lista, justo arriba de los botones de agregar.
    setItems((anteriores) => [...anteriores, { clave, datos: itemVacio(kind) }]);
    setPedidoDeFoco({ clave });
  }

  function sacar(clave: string) {
    const posicion = items.findIndex((item) => item.clave === clave);
    const restantes = items.filter((item) => item.clave !== clave);
    setItems(restantes);
    // El botón "Sacar" desaparece con su ítem y el foco se perdería. Lo
    // llevamos al ítem que quedó en ese lugar (o al anterior, si era el
    // último); si no queda ninguno, al botón para agregar.
    const vecino = restantes[posicion] ?? restantes[posicion - 1];
    setPedidoDeFoco({ clave: vecino?.clave ?? null });
  }

  function cambiar(clave: string, datos: KnowledgeItem) {
    setItems((anteriores) => anteriores.map((item) => (item.clave === clave ? { ...item, datos } : item)));
  }

  function alEnviar(event: FormEvent<HTMLFormElement>) {
    // El botón ya no envía mientras guarda (ni si se pasó del máximo), pero
    // apretar Enter en un campo también envía el formulario: lo frenamos acá.
    if (pending || excedido) {
      event.preventDefault();
      return;
    }
    setClavesEnviadas(items.map((item) => item.clave));
  }

  /**
   * El error de un campo de un ítem, si el servidor marcó alguno.
   * Mientras guarda no mostramos nada: los errores de antes pueden no
   * corresponder a lo que se está mandando ahora.
   */
  function errorDe(clave: string, campo: KnowledgeItemField): string | undefined {
    const posicion = clavesEnviadas.indexOf(clave);
    // -1: el ítem se agregó después de guardar, así que el servidor no lo vio.
    if (pending || posicion === -1) return undefined;
    return state.fieldErrors[`${posicion}.${campo}`];
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={alEnviar}
      // max-w-2xl: en la compu los textos no se estiran de punta a punta (se leen mejor).
      className="flex max-w-2xl flex-col gap-5"
    >
      {/* Campos ocultos: viajan con el formulario pero no se ven. La lista
          entera va como texto JSON en uno solo. Van fuera del fieldset porque
          uno deshabilitado no manda sus campos. */}
      <input type="hidden" name="knowledge" value={JSON.stringify(lista)} />
      <input type="hidden" name="base_version" value={baseVersion} />
      <input type="hidden" name="action_id" value={state.action_id} />

      {/* Contador: cuánto se usó del máximo (todo entra en el prompt de la llamada). */}
      <div className="flex flex-col">
        {/* div: la etiqueta queda de su tamaño y no se estira a todo el ancho. */}
        <div>
          <Badge id={idContador} tone={tono} icon={ICONOS_CONTADOR[tono]}>
            {knowledgeCounterText(usados)}
          </Badge>
        </div>
        {/* aria-live: cuando aparece el aviso, el lector de pantalla lo lee.
            El número en sí no lo anunciamos: cambiaría con cada letra. */}
        <div aria-live="polite">
          {excedido && (
            <p className="mt-2 text-xs leading-snug font-bold text-danger">
              Te pasaste del máximo. Acortá textos o sacá ítems.
            </p>
          )}
        </div>
      </div>

      {/* fieldset disabled apaga TODOS los campos de adentro de una vez (si no es admin).
          min-w-0: sin esto, en el celular el fieldset no se achica y empuja la página de costado. */}
      <fieldset disabled={!canEdit} className="min-w-0">
        {items.length === 0 ? (
          canEdit ? (
            <EmptyState
              icon={BookOpen}
              title="Todavía no cargaste conocimiento"
              description="Sumá tus productos o las preguntas que más te hacen."
              action={<BotonesAgregar onAgregar={agregar} className="justify-center" />}
            />
          ) : (
            // Quien no es admin no puede cargar nada: no lo invitamos a hacerlo.
            <EmptyState
              icon={BookOpen}
              title="Todavía no hay conocimiento cargado"
              description="Pedile a una persona admin que lo cargue."
            />
          )
        ) : (
          <div className="flex flex-col gap-5">
            {/* aria-label: el lector de pantalla anuncia "Conocimiento cargado, lista, 3 elementos". */}
            <ul aria-label="Conocimiento cargado" className="flex flex-col gap-5">
              {items.map((item) => (
                // data-clave: para encontrar el ítem y ponerle el foco (ver pedidoDeFoco).
                <li key={item.clave} data-clave={item.clave}>
                  <ItemEditor
                    datos={item.datos}
                    canEdit={canEdit}
                    errorDe={(campo) => errorDe(item.clave, campo)}
                    onChange={(datos) => cambiar(item.clave, datos)}
                    onRemove={() => sacar(item.clave)}
                  />
                </li>
              ))}
            </ul>
            {canEdit && <BotonesAgregar onAgregar={agregar} />}
          </div>
        )}
      </fieldset>

      {/* Error general (por ejemplo, la base no respondió) y, si lo hay, el de
          la lista entera (demasiados ítems): qué pasó, arriba del botón. */}
      {!pending && state.message && (
        <Alert tone="danger" title={state.message}>
          {state.fieldErrors._list}
        </Alert>
      )}

      {/* Si no es admin, no hay botón: no tendría sentido apretarlo. */}
      {canEdit && (
        <div>
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            // Si se pasó del máximo no se puede guardar (el aviso de arriba dice qué hacer).
            disabled={excedido}
            // Al llegar al botón con el teclado, el lector de pantalla también lee el contador.
            aria-describedby={idContador}
          >
            {pending ? "Guardando…" : "Guardar conocimiento"}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * Los dos botones para sumar un ítem. Están en su propio componente porque
 * aparecen en dos lugares: en el estado vacío y al final de la lista.
 * flex-wrap: en el celular, si no entran uno al lado del otro, el segundo baja.
 */
function BotonesAgregar({
  onAgregar,
  className,
}: {
  onAgregar: (kind: KnowledgeItem["kind"]) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap gap-2.5", className)}>
      {/* data-agregar: acá va el foco si se saca el último ítem. */}
      <Button variant="secondary" icon={PackagePlus} onClick={() => onAgregar("product")} data-agregar>
        Agregar producto
      </Button>
      <Button variant="secondary" icon={MessageCirclePlus} onClick={() => onAgregar("faq")}>
        Agregar pregunta
      </Button>
    </div>
  );
}

/**
 * Un ítem de la lista: su etiqueta de tipo, el botón para sacarlo y sus campos.
 *
 * Va en un contenedor BLANCO con borde y no en una Card gris: los campos ya
 * son grises, y gris sobre gris no se distingue (docs/DESIGN.md).
 */
function ItemEditor({
  datos,
  canEdit,
  errorDe,
  onChange,
  onRemove,
}: {
  datos: KnowledgeItem;
  canEdit: boolean;
  errorDe: (campo: KnowledgeItemField) => string | undefined;
  onChange: (datos: KnowledgeItem) => void;
  onRemove: () => void;
}) {
  // El id de la etiqueta de tipo: con él, el lector de pantalla anuncia el
  // grupo de campos como "Producto o servicio" antes de leer cada uno.
  const idTipo = useId();

  // Para el botón "Sacar": que diga QUÉ saca ("Sacar Kit de limpieza"), y no
  // un "Sacar" suelto que no se sabe a qué ítem corresponde.
  const titulo = (datos.kind === "product" ? datos.name : datos.question).trim();
  const queSaca = titulo || (datos.kind === "product" ? "producto sin nombre" : "pregunta sin escribir");

  return (
    <div
      role="group"
      aria-labelledby={idTipo}
      className="flex flex-col gap-5 rounded-card border border-line bg-canvas p-5"
    >
      {/* flex-wrap: en el celular, si no entran, el botón baja abajo de la etiqueta. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Badge id={idTipo} icon={ICONOS_TIPO[datos.kind]}>
          {KNOWLEDGE_KIND_LABELS[datos.kind]}
        </Badge>
        {canEdit && (
          <Button variant="ghost" icon={Trash2} onClick={onRemove}>
            Sacar
            {/* Texto invisible: el lector de pantalla lee "Sacar Kit de limpieza". */}
            <span className="sr-only"> {queSaca}</span>
          </Button>
        )}
      </div>

      {datos.kind === "product" ? (
        <>
          <Input
            label="Nombre"
            required
            maxLength={KNOWLEDGE_NAME_MAX}
            value={datos.name}
            onChange={(event) => onChange({ ...datos, name: event.target.value })}
            error={errorDe("name")}
          />
          {/* Descripción y precio son opcionales: por eso no llevan "required". */}
          <Textarea
            label="Descripción"
            maxLength={KNOWLEDGE_BODY_MAX}
            value={datos.description}
            onChange={(event) => onChange({ ...datos, description: event.target.value })}
            error={errorDe("description")}
          />
          <Input
            label="Precio orientativo"
            hint="Ejemplo: Desde $3.200 + IVA. El agente no va a inventar precios que no estén acá."
            maxLength={KNOWLEDGE_PRICE_MAX}
            value={datos.price_hint}
            onChange={(event) => onChange({ ...datos, price_hint: event.target.value })}
            error={errorDe("price_hint")}
          />
        </>
      ) : (
        <>
          <Input
            label="Pregunta"
            required
            maxLength={KNOWLEDGE_QUESTION_MAX}
            value={datos.question}
            onChange={(event) => onChange({ ...datos, question: event.target.value })}
            error={errorDe("question")}
          />
          <Textarea
            label="Respuesta"
            required
            maxLength={KNOWLEDGE_BODY_MAX}
            value={datos.answer}
            onChange={(event) => onChange({ ...datos, answer: event.target.value })}
            error={errorDe("answer")}
          />
        </>
      )}
    </div>
  );
}
