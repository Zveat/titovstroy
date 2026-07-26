import { describe, expect, it } from "vitest";
import { addMasterInteraction, contactFromParsedMaster, interactionsForContact, masterSourceKey, normalizeMasterCrm, removeMasterContact, upsertMasterContact } from "./masterCrm.js";

describe("master CRM", () => {
  it("создаёт стабильный ключ записи парсера", () => {
    expect(masterSourceKey("olx", { extId:"123", phone:"+7 700" })).toBe("olx:123");
    expect(masterSourceKey("naimi", { phone:"+7 700 111-22-33" })).toBe("naimi:77001112233");
  });

  it("повторное добавление карточки обновляет, а не дублирует контакт", () => {
    const base = normalizeMasterCrm(null);
    const first = contactFromParsedMaster("olx", { extId:"1", name:"Иван" }, 10);
    const saved = upsertMasterContact(base, first, 20);
    const updated = upsertMasterContact(saved, { ...first, phone:"87001112233" }, 30);
    expect(updated.contacts).toHaveLength(1);
    expect(updated.contacts[0]).toMatchObject({ name:"Иван", phone:"87001112233", createdAt:10, updatedAt:30 });
  });

  it("хранит историю отдельно от данных парсера", () => {
    const contact = contactFromParsedMaster("naimi", { extId:"9", name:"Пётр" }, 10);
    const saved = upsertMasterContact(null, contact, 20);
    const withNote = addMasterInteraction(saved, contact.id, { note:"Уехал до следующего года", author:"Звеат" }, 30);
    expect(interactionsForContact(withNote, contact.id)[0]).toMatchObject({ note:"Уехал до следующего года", author:"Звеат" });
    expect(withNote.contacts[0].name).toBe("Пётр");
  });

  it("удаляет ручной контакт вместе с его историей", () => {
    const saved = upsertMasterContact(null, { id:"manual-1", name:"Магазин", kind:"shop" }, 10);
    const withNote = addMasterInteraction(saved, "manual-1", { note:"Есть скидка" }, 20);
    const removed = removeMasterContact(withNote, "manual-1", 30);
    expect(removed.contacts).toEqual([]);
    expect(removed.interactions).toEqual([]);
  });
});
