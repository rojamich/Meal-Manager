import { db } from "../db";
import { Person } from "../../models";
import { newId } from "../../utils/id";

export const PEOPLE_UPDATED_EVENT = "people-updated";

function emitPeopleUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PEOPLE_UPDATED_EVENT));
}

export async function listPeople() {
  return db.people.orderBy("sortOrder").toArray();
}

export async function createPerson(input: Omit<Person, "id">) {
  const person: Person = { ...input, id: newId() };
  await db.people.add(person);
  emitPeopleUpdated();
  return person;
}

export async function updatePerson(id: string, changes: Partial<Person>) {
  await db.people.update(id, changes);
  emitPeopleUpdated();
}

export async function deletePerson(id: string) {
  await db.people.delete(id);
  emitPeopleUpdated();
}
