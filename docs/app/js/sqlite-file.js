// Writes a small SQLite database file from scratch: just enough of the format for the phone to
// build an Anki deck (a few tables, filled once, never changed afterwards). No indexes.
//
// The file is a run of fixed-size pages. Each table is a tree of pages: rows live in "leaf"
// pages in rowid order, and when a table needs several leaves, "interior" pages point at them.
// A row too big for its page keeps its first part there and the rest in "overflow" pages.
// Page 1 starts with the file header and holds the list of tables.

const PAGE = 4096;
const MAX_LOCAL = PAGE - 35;                               // most row bytes kept in a leaf page
const MIN_LOCAL = Math.floor(((PAGE - 12) * 32) / 255) - 23;
const encoder = new TextEncoder();

/** SQLite's variable-length integer: 7 bits per byte, most significant first. */
function varint(n) {
  let v = BigInt(n);
  const out = [Number(v & 0x7fn)];
  while ((v >>= 7n) > 0n) out.unshift(Number(v & 0x7fn) | 0x80);
  return out;
}

/** One value as [type code, bytes]. Numbers must be whole; anything else is stored as text. */
function field(value) {
  if (value === null || value === undefined) return [0, []];
  if (typeof value === "number" || typeof value === "bigint") {
    const v = BigInt(value);
    if (v === 0n) return [8, []];
    if (v === 1n) return [9, []];
    const width = [1, 2, 3, 4, 6, 8].find((w) => v >= -(1n << BigInt(w * 8 - 1)) && v < 1n << BigInt(w * 8 - 1));
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, v);
    return [[1, 2, 3, 4, 6, 8].indexOf(width) + 1, [...bytes.subarray(8 - width)]];
  }
  const bytes = encoder.encode(String(value));
  return [13 + bytes.length * 2, bytes];
}

/** A row in SQLite's record format: a header of type codes, then the values. */
function record(values) {
  const fields = values.map(field), types = fields.flatMap(([type]) => varint(type));
  let headerSize = types.length + 1;
  if (varint(headerSize).length > 1) headerSize++;  // the size counts its own bytes
  const head = [...varint(headerSize), ...types];
  const out = new Uint8Array(head.length + fields.reduce((n, [, bytes]) => n + bytes.length, 0));
  out.set(head);
  let at = head.length;
  for (const [, bytes] of fields) { out.set(bytes, at); at += bytes.length; }
  return out;
}

/**
 * The bytes of a database holding these tables.
 * `tables`: [{ name, sql: "CREATE TABLE …", rows: [{ id, values }] }]. Rows must be in rising
 * `id` order; `values` lists every column, with null in the place of an INTEGER PRIMARY KEY
 * column (SQLite keeps that one as the row's id).
 */
export function sqliteFile(tables) {
  const pages = [null];  // page 1 is written last, once every table's first page is known
  const add = (page) => pages.push(page);

  /** A tree page holding these cells. Leaf cells are whole rows; interior cells point at pages. */
  function treePage(cells, rightmost) {
    const page = new Uint8Array(PAGE), view = new DataView(page.buffer), header = rightmost ? 12 : 8;
    page[0] = rightmost ? 5 : 13;
    view.setUint16(3, cells.length);
    let end = PAGE;
    cells.forEach((cell, i) => {
      end -= cell.length;
      page.set(cell, end);
      view.setUint16(header + i * 2, end);
    });
    view.setUint16(5, end === 65536 ? 0 : end);
    if (rightmost) view.setUint32(8, rightmost);
    return page;
  }

  /** The cell for one row; the part that doesn't fit goes to overflow pages. */
  function rowCell(id, payload) {
    const lead = [...varint(payload.length), ...varint(id)];
    if (payload.length <= MAX_LOCAL) return Uint8Array.from([...lead, ...payload]);
    const fit = MIN_LOCAL + ((payload.length - MIN_LOCAL) % (PAGE - 4));
    const local = fit <= MAX_LOCAL ? fit : MIN_LOCAL;
    const chunks = [];
    for (let at = local; at < payload.length; at += PAGE - 4) chunks.push(payload.subarray(at, at + PAGE - 4));
    const first = pages.length + 1;
    chunks.forEach((chunk, i) => {
      const page = new Uint8Array(PAGE);
      new DataView(page.buffer).setUint32(0, i + 1 < chunks.length ? first + i + 1 : 0);  // next overflow page
      page.set(chunk, 4);
      add(page);
    });
    const cell = new Uint8Array(lead.length + local + 4);
    cell.set(lead);
    cell.set(payload.subarray(0, local), lead.length);
    new DataView(cell.buffer).setUint32(lead.length + local, first);
    return cell;
  }

  /** Store a table's rows; returns the number of its first ("root") page. */
  function table(rows) {
    let level = [], cells = [], used = 8;  // level: [{ page number, largest id under it }]
    const flush = (lastId) => { add(treePage(cells)); level.push({ page: pages.length, key: lastId }); cells = []; used = 8; };
    rows.forEach((row, i) => {
      const cell = rowCell(row.id, record(row.values));
      if (used + cell.length + 2 > PAGE) flush(rows[i - 1].id);
      cells.push(cell);
      used += cell.length + 2;
    });
    flush(rows.length ? rows[rows.length - 1].id : 0);
    while (level.length > 1) {  // interior pages over the level below, until one page is left
      const per = Math.floor((PAGE - 12) / 15);  // a pointer cell is at most 4 + 9 bytes, plus its 2-byte slot
      const groups = [];
      for (let i = 0; i < level.length; i += per) groups.push(level.slice(i, i + per));
      // An interior page needs at least two pages under it: a lone leftover borrows a neighbour.
      if (groups.length > 1 && groups[groups.length - 1].length < 2) groups[groups.length - 1].unshift(groups[groups.length - 2].pop());
      level = groups.map((group) => {
        const last = group.pop();  // the last page under an interior page is its "rightmost" pointer
        const pointers = group.map(({ page, key }) => {
          const cell = new Uint8Array(4 + varint(key).length);
          new DataView(cell.buffer).setUint32(0, page);
          cell.set(varint(key), 4);
          return cell;
        });
        add(treePage(pointers, last.page));
        return { page: pages.length, key: last.key };
      });
    }
    return level[0].page;
  }

  const roots = tables.map((t) => table(t.rows));
  const list = tables.map((t, i) => rowCell(i + 1, record(["table", t.name, t.name, roots[i], t.sql])));

  // Page 1: the 100-byte file header, then the list of tables as a leaf page.
  const first = new Uint8Array(PAGE), view = new DataView(first.buffer);
  first.set(encoder.encode("SQLite format 3\0"));
  view.setUint16(16, PAGE);
  first.set([1, 1, 0, 64, 32, 32], 18);  // format versions, no reserved bytes, fixed payload fractions
  view.setUint32(24, 1);                 // file change counter
  view.setUint32(28, pages.length);      // size in pages
  view.setUint32(40, 1);                 // schema cookie
  view.setUint32(44, 4);                 // schema format
  view.setUint32(56, 1);                 // text is UTF-8
  view.setUint32(92, 1);                 // the size above is valid as of change 1
  view.setUint32(96, 3045000);           // written in the format of SQLite 3.45
  first[100] = 13;
  view.setUint16(103, list.length);
  let end = PAGE;
  list.forEach((cell, i) => {
    end -= cell.length;
    first.set(cell, end);
    view.setUint16(108 + i * 2, end);
  });
  if (end < 108 + list.length * 2) throw new Error("Too many tables for one page.");
  view.setUint16(105, end);
  pages[0] = first;

  const out = new Uint8Array(pages.length * PAGE);
  pages.forEach((page, i) => out.set(page, i * PAGE));
  return out;
}
