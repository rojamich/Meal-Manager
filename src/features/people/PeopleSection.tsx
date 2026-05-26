import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Person } from "../../models";
import {
  createPerson,
  deletePerson,
  listPeople,
  PEOPLE_UPDATED_EVENT,
  updatePerson
} from "../../db/repositories/peopleRepo";

const DEFAULT_COLORS = ["#2563eb", "#db2777", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export default function PeopleSection({ embedded = false }: { embedded?: boolean } = {}) {
  const [people, setPeople] = useState<Person[]>([]);

  const refresh = useCallback(async () => {
    setPeople([...(await listPeople())]);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(PEOPLE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(PEOPLE_UPDATED_EVENT, refresh);
  }, [refresh]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    const sortOrder = (people.length ? people[people.length - 1].sortOrder : 0) + 1;
    const color = DEFAULT_COLORS[people.length % DEFAULT_COLORS.length];
    await createPerson({ name, color, sortOrder });
    (e.currentTarget as HTMLFormElement).reset();
  }

  async function rename(id: string, name: string) {
    await updatePerson(id, { name });
  }

  async function recolor(id: string, color: string) {
    await updatePerson(id, { color });
  }

  async function remove(id: string) {
    await deletePerson(id);
  }

  const body = (
    <>
      {!embedded && <h3>People</h3>}
      <p className="muted">Used to assign each meal to a household member. Meals without an assignment are shared.</p>
      <form className="row" onSubmit={add}>
        <input name="name" placeholder="Name" required />
        <button type="submit">Add</button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Color</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <td data-label="Name">
                <input value={person.name} onChange={(e) => rename(person.id, e.target.value)} />
              </td>
              <td data-label="Color">
                <input
                  type="color"
                  value={person.color || "#64748b"}
                  onChange={(e) => recolor(person.id, e.target.value)}
                />
              </td>
              <td data-label="Actions">
                <button className="danger" onClick={() => remove(person.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {people.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No people yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );

  return embedded ? <div>{body}</div> : <div className="panel">{body}</div>;
}
