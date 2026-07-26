const digits = (value) => String(value || "").replace(/\D/g, "");

export function masterSourceKey(source, master = {}) {
  const prefix = String(source || master.source || "manual").trim().toLowerCase() || "manual";
  const stable = String(master.extId || master.sourceId || "").trim()
    || digits(master.phone)
    || String(master.url || "").trim()
    || `${String(master.name || "").trim().toLowerCase()}|${String(master.city || "").trim().toLowerCase()}`;
  return `${prefix}:${stable || "unknown"}`;
}

export function normalizeMasterCrm(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    version: 1,
    contacts: Array.isArray(raw.contacts) ? raw.contacts.filter(item => item && typeof item === "object") : [],
    interactions: Array.isArray(raw.interactions) ? raw.interactions.filter(item => item && typeof item === "object") : [],
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

export function contactFromParsedMaster(source, master = {}, now = Date.now()) {
  const sourceKey = masterSourceKey(source, master);
  return {
    id: `mc_${sourceKey.replace(/[^a-z0-9_-]+/gi, "_")}`,
    source: String(source || master.source || "manual"),
    sourceKey,
    sourceId: String(master.extId || master.sourceId || ""),
    sourceUrl: String(master.url || ""),
    kind: "master",
    name: String(master.name || "Без имени"),
    phone: String(master.phone || ""),
    city: String(master.city || ""),
    specialties: Array.isArray(master.services) ? master.services.filter(Boolean) : [],
    status: "new",
    tags: [],
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertMasterContact(crmValue, contact, now = Date.now()) {
  const crm = normalizeMasterCrm(crmValue);
  const sourceKey = String(contact?.sourceKey || "");
  const id = String(contact?.id || "") || `mc_manual_${now}`;
  const index = crm.contacts.findIndex(item => (sourceKey && item.sourceKey === sourceKey) || item.id === id);
  const previous = index >= 0 ? crm.contacts[index] : null;
  const nextContact = {
    ...(previous || {}),
    ...(contact || {}),
    id: previous?.id || id,
    source: contact?.source || previous?.source || "manual",
    kind: contact?.kind || previous?.kind || "master",
    status: contact?.status || previous?.status || "new",
    specialties: Array.isArray(contact?.specialties) ? contact.specialties.filter(Boolean) : (previous?.specialties || []),
    tags: Array.isArray(contact?.tags) ? contact.tags.filter(Boolean) : (previous?.tags || []),
    createdAt: previous?.createdAt || Number(contact?.createdAt) || now,
    updatedAt: now,
  };
  const contacts = [...crm.contacts];
  if (index >= 0) contacts[index] = nextContact; else contacts.unshift(nextContact);
  return { ...crm, contacts, updatedAt: now };
}

export function addMasterInteraction(crmValue, contactId, interaction, now = Date.now()) {
  const crm = normalizeMasterCrm(crmValue);
  const note = String(interaction?.note || "").trim();
  if (!contactId || !note) return crm;
  const entry = {
    id: String(interaction?.id || `mi_${now}`),
    contactId: String(contactId),
    type: String(interaction?.type || "note"),
    note,
    author: String(interaction?.author || ""),
    authorId: String(interaction?.authorId || ""),
    createdAt: Number(interaction?.createdAt) || now,
  };
  const contacts = crm.contacts.map(contact => contact.id === contactId ? { ...contact, updatedAt: now } : contact);
  return { ...crm, contacts, interactions: [entry, ...crm.interactions], updatedAt: now };
}

export function removeMasterContact(crmValue, contactId, now = Date.now()) {
  const crm = normalizeMasterCrm(crmValue);
  return {
    ...crm,
    contacts: crm.contacts.filter(contact => contact.id !== contactId),
    interactions: crm.interactions.filter(item => item.contactId !== contactId),
    updatedAt: now,
  };
}

export function interactionsForContact(crmValue, contactId) {
  return normalizeMasterCrm(crmValue).interactions
    .filter(item => item.contactId === contactId)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

