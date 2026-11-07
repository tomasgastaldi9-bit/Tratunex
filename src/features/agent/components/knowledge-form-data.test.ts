import { describe, expect, it } from "vitest";
// Ruta relativa (y no "@/"): Vitest no entiende el alias "@/" en este proyecto.
import {
  KNOWLEDGE_ITEMS_MAX,
  KNOWLEDGE_TEXT_MAX,
  saveAgentKnowledgeInputSchema,
  type KnowledgeItem,
} from "../../../contracts/agent";
import {
  KNOWLEDGE_UNREADABLE_MESSAGE,
  knowledgeCounterText,
  knowledgeCounterTone,
  knowledgeFieldErrors,
  readKnowledgeForm,
  savedKnowledgeUrl,
} from "./knowledge-form-data";
import { readSavedNotice } from "./profile-form-data";

// Un producto y una pregunta válidos. Cada prueba cambia solo lo que le interesa.
const PRODUCTO: KnowledgeItem = {
  kind: "product",
  name: "Kit de limpieza para comercios",
  description: "Lavandina, detergente y trapos",
  price_hint: "Desde $3.200 + IVA",
};
const PREGUNTA: KnowledgeItem = {
  kind: "faq",
  question: "¿Hacen envíos?",
  answer: "Sí, a CABA y GBA en 24 h.",
};

/**
 * Arma un FormData igual al que manda el editor: la lista va entera, como
 * texto JSON, en el campo oculto "knowledge".
 */
function armarFormulario(campos: { knowledge: string; base_version?: string; action_id?: string }): FormData {
  const formData = new FormData();
  formData.append("knowledge", campos.knowledge);
  formData.append("base_version", campos.base_version ?? "3");
  formData.append("action_id", campos.action_id ?? "accion-de-prueba");
  return formData;
}

/** Valida lo que leyó readKnowledgeForm con el contrato y devuelve el error (falla la prueba si no hay). */
function errorDe(campos: { knowledge: string; base_version?: string }) {
  const { input } = readKnowledgeForm(armarFormulario(campos));
  const resultado = saveAgentKnowledgeInputSchema.safeParse(input);
  if (resultado.success) throw new Error("Se esperaba un error de validación");
  return resultado.error;
}

describe("readKnowledgeForm", () => {
  it("arma el pedido con la lista del campo oculto y base_version como número", () => {
    const { action_id, input } = readKnowledgeForm(
      armarFormulario({ knowledge: JSON.stringify([PRODUCTO, PREGUNTA]), base_version: "3" }),
    );

    expect(action_id).toBe("accion-de-prueba");
    expect(input).toEqual({ base_version: 3, knowledge: [PRODUCTO, PREGUNTA] });
    // Lo que arma tiene que pasar la validación del contrato tal cual.
    expect(saveAgentKnowledgeInputSchema.safeParse(input).success).toBe(true);
  });

  it("acepta la lista vacía (la empresa sacó todo)", () => {
    const { input } = readKnowledgeForm(armarFormulario({ knowledge: "[]" }));
    expect(input.knowledge).toEqual([]);
    expect(saveAgentKnowledgeInputSchema.safeParse(input).success).toBe(true);
  });

  it("con JSON roto no tira error: devuelve algo que la validación rechaza", () => {
    const leer = () => readKnowledgeForm(armarFormulario({ knowledge: "[{roto" }));
    expect(leer).not.toThrow();
    expect(saveAgentKnowledgeInputSchema.safeParse(leer().input).success).toBe(false);
  });

  it("si el JSON no es una lista, la validación lo rechaza", () => {
    const { input } = readKnowledgeForm(armarFormulario({ knowledge: '{"kind":"product"}' }));
    expect(saveAgentKnowledgeInputSchema.safeParse(input).success).toBe(false);
  });

  it("si falta el campo oculto, la validación lo rechaza (sin tirar error)", () => {
    const formData = new FormData();
    formData.append("base_version", "3");
    const { action_id, input } = readKnowledgeForm(formData);
    expect(action_id).toBe("");
    expect(saveAgentKnowledgeInputSchema.safeParse(input).success).toBe(false);
  });

  it("toma base_version vacío como inválido (NaN), y la validación lo rechaza", () => {
    const { input } = readKnowledgeForm(armarFormulario({ knowledge: "[]", base_version: "" }));
    expect(input.base_version).toBeNaN();
    expect(saveAgentKnowledgeInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("knowledgeFieldErrors", () => {
  it("marca el campo de un ítem con la clave '<posición>.<campo>'", () => {
    const lista = [PRODUCTO, { ...PRODUCTO, name: "   " }];
    const errores = knowledgeFieldErrors(errorDe({ knowledge: JSON.stringify(lista) }));
    expect(errores).toEqual({ "1.name": "Completá el nombre" });
  });

  it("junta los errores de varios campos y de varios ítems", () => {
    const lista = [{ ...PREGUNTA, question: "", answer: "" }, PRODUCTO, { ...PRODUCTO, price_hint: "x".repeat(81) }];
    const errores = knowledgeFieldErrors(errorDe({ knowledge: JSON.stringify(lista) }));
    expect(errores).toEqual({
      "0.question": "Completá la pregunta",
      "0.answer": "Completá la respuesta",
      "2.price_hint": "Usá como máximo 80 caracteres",
    });
  });

  it("pone el error de la lista entera (máximo de caracteres) en '_list'", () => {
    // 11 productos con la descripción al máximo (600) suman más de 6.000 caracteres.
    const larga = { ...PRODUCTO, description: "x".repeat(600) };
    const errores = knowledgeFieldErrors(errorDe({ knowledge: JSON.stringify(Array(11).fill(larga)) }));
    expect(errores).toEqual({
      _list: `El conocimiento supera los ${KNOWLEDGE_TEXT_MAX} caracteres. Acortá textos o sacá ítems.`,
    });
  });

  it("pone el máximo de ítems en '_list'", () => {
    const corto: KnowledgeItem = { kind: "product", name: "A", description: "", price_hint: "" };
    const errores = knowledgeFieldErrors(
      errorDe({ knowledge: JSON.stringify(Array(KNOWLEDGE_ITEMS_MAX + 1).fill(corto)) }),
    );
    expect(errores).toEqual({ _list: `Cargá como máximo ${KNOWLEDGE_ITEMS_MAX} ítems` });
  });

  it("si los datos ocultos llegaron rotos, da un mensaje en español en '_list'", () => {
    // JSON roto: la persona no escribió nada mal, así que no hay campo para marcar.
    expect(knowledgeFieldErrors(errorDe({ knowledge: "[{roto" }))).toEqual({ _list: KNOWLEDGE_UNREADABLE_MESSAGE });
    // base_version vacío: tampoco es algo que la persona pueda arreglar en un campo.
    expect(knowledgeFieldErrors(errorDe({ knowledge: "[]", base_version: "" }))).toEqual({
      _list: KNOWLEDGE_UNREADABLE_MESSAGE,
    });
    // Un tipo de ítem que no existe.
    expect(knowledgeFieldErrors(errorDe({ knowledge: '[{"kind":"promo"}]' }))).toEqual({
      _list: KNOWLEDGE_UNREADABLE_MESSAGE,
    });
  });

  it("deja un solo mensaje por clave (el primero)", () => {
    // Un ítem sin descripción ni precio (datos rotos) da dos errores, pero los
    // dos van a "_list": queda uno solo.
    const error = errorDe({ knowledge: '[{"kind":"product","name":"A"}]' });
    expect(error.issues.length).toBe(2);
    expect(knowledgeFieldErrors(error)).toEqual({ _list: KNOWLEDGE_UNREADABLE_MESSAGE });
  });
});

describe("aviso de guardado en la dirección", () => {
  /** Hace lo que hace Next: toma lo que va después del "?" y lo convierte en un objeto. */
  function parametrosDe(direccion: string): Record<string, string> {
    return Object.fromEntries(new URL(direccion, "http://localhost").searchParams);
  }

  it("arma la dirección de /agent/knowledge con la versión y si se creó (1) o no (0)", () => {
    expect(savedKnowledgeUrl({ version: 4, created: true })).toBe("/agent/knowledge?saved=4&created=1");
    expect(savedKnowledgeUrl({ version: 4, created: false })).toBe("/agent/knowledge?saved=4&created=0");
  });

  it("readSavedNotice (el del perfil) lee de vuelta exactamente lo que armó", () => {
    for (const aviso of [
      { version: 2, created: true },
      { version: 9, created: false },
    ]) {
      expect(readSavedNotice(parametrosDe(savedKnowledgeUrl(aviso)))).toEqual(aviso);
    }
  });
});

describe("contador de caracteres", () => {
  it("escribe 'N de 6.000 caracteres' con punto de miles", () => {
    expect(knowledgeCounterText(0)).toBe("0 de 6.000 caracteres");
    expect(knowledgeCounterText(1234)).toBe("1.234 de 6.000 caracteres");
  });

  it("es neutro por debajo del 90 %, warning desde el 90 % y danger si se pasa", () => {
    expect(knowledgeCounterTone(0)).toBe("neutral");
    expect(knowledgeCounterTone(KNOWLEDGE_TEXT_MAX * 0.9 - 1)).toBe("neutral");
    expect(knowledgeCounterTone(KNOWLEDGE_TEXT_MAX * 0.9)).toBe("warning");
    // Justo en el máximo todavía se puede guardar: es warning, no danger.
    expect(knowledgeCounterTone(KNOWLEDGE_TEXT_MAX)).toBe("warning");
    expect(knowledgeCounterTone(KNOWLEDGE_TEXT_MAX + 1)).toBe("danger");
  });
});
