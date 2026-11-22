/**
 * Strict CSV parser for the room and bed import (Phase 2, task 9; no dependency, by decision).
 * One row per room:
 *
 *   room_type,room,block,floor,beds
 *   4-in-a-room,C-214,C,2,4          (4 beds labelled A-D)
 *   Single,C-215,C,2,Window          (one named bed)
 *   Double,C-216,C,2,Left;Right      (named beds)
 *
 * Content rules (room type exists, room is new, occupancy) are decided by public.import_inventory.
 */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 200 * 1024;
export const IMPORT_COLUMNS = ["room_type", "room", "block", "floor", "beds"] as const;
const REQUIRED = ["room_type", "room", "beds"] as const;
const MAX_BEDS = 12;

export interface ImportIssue {
  line: number;
  field: string;
  message: string;
}

export interface ImportRow {
  line: number;
  room_type: string;
  room: string;
  block: string;
  floor: string;
  beds: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  errors: ImportIssue[];
}

/** RFC 4180 fields on one line. Quoted fields may not span lines. Returns an error message on bad quoting. */
export function parseCsvLine(line: string): string[] | string {
  const fields: string[] = [];
  let i = 0;
  while (true) {
    let value = "";
    if (line[i] === '"') {
      i += 1;
      while (true) {
        if (i >= line.length) return "A quoted value is not closed.";
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += line[i];
        i += 1;
      }
      if (i < line.length && line[i] !== ",") return "Unexpected text after a closing quote.";
    } else {
      const start = i;
      while (i < line.length && line[i] !== ",") {
        if (line[i] === '"') return "A quote can only appear inside a quoted value.";
        i += 1;
      }
      value = line.slice(start, i);
    }
    fields.push(value.trim());
    if (i >= line.length) return fields;
    i += 1; // Skip the comma; a trailing comma yields one more empty field.
  }
}

/** A number means that many beds labelled A, B, C...; otherwise labels separated by ; or |. */
export function parseBeds(value: string): string[] | null {
  const text = value.trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) {
    const count = Number(text);
    if (count < 1 || count > MAX_BEDS) return null;
    return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
  }
  const labels = text.split(/[;|]/).map((label) => label.trim());
  return labels.length > MAX_BEDS || labels.some((label) => label === "") ? null : labels;
}

export function parseInventoryCsv(input: string): ParsedImport {
  const text = input.replace(/^﻿/, "");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return { rows: [], errors: [{ line: 0, field: "file", message: "This does not look like a CSV text file." }] };
  }

  const lines = text.split(/\r\n|\n|\r/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex === -1) return { rows: [], errors: [{ line: 0, field: "file", message: "The file is empty." }] };

  const header = parseCsvLine(lines[headerIndex]);
  if (typeof header === "string") return { rows: [], errors: [{ line: headerIndex + 1, field: "header", message: header }] };
  const columns = header.map((name) => name.toLowerCase().replace(/\s+/g, "_"));

  const headerErrors: ImportIssue[] = [];
  const line = headerIndex + 1;
  for (const name of columns) {
    if (!(IMPORT_COLUMNS as readonly string[]).includes(name)) {
      headerErrors.push({ line, field: "header", message: `Unknown column "${name.slice(0, 40)}". Use: ${IMPORT_COLUMNS.join(", ")}.` });
    }
  }
  for (const name of new Set(columns)) {
    if (columns.filter((c) => c === name).length > 1) headerErrors.push({ line, field: "header", message: `Column "${name.slice(0, 40)}" appears twice.` });
  }
  for (const name of REQUIRED) {
    if (!columns.includes(name)) headerErrors.push({ line, field: "header", message: `Missing column "${name}".` });
  }
  if (headerErrors.length) return { rows: [], errors: headerErrors };

  const rows: ImportRow[] = [];
  const errors: ImportIssue[] = [];
  let dataRows = 0;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "" || /^,+$/.test(lines[index].trim())) continue; // Spreadsheets leave blank rows.
    dataRows += 1;
    if (dataRows > MAX_IMPORT_ROWS) {
      return { rows: [], errors: [{ line: index + 1, field: "file", message: `An import can have at most ${MAX_IMPORT_ROWS} rooms.` }] };
    }

    const lineNumber = index + 1;
    const fields = parseCsvLine(lines[index]);
    if (typeof fields === "string") {
      errors.push({ line: lineNumber, field: "row", message: fields });
      continue;
    }
    if (fields.length !== columns.length) {
      errors.push({ line: lineNumber, field: "row", message: `Expected ${columns.length} columns, found ${fields.length}.` });
      continue;
    }
    const cell = (name: string) => fields[columns.indexOf(name)] ?? "";
    const beds = parseBeds(cell("beds"));
    if (!beds) {
      errors.push({ line: lineNumber, field: "beds", message: `Give a number of beds (1-${MAX_BEDS}) or labels like A;B.` });
      continue;
    }
    rows.push({ line: lineNumber, room_type: cell("room_type"), room: cell("room"), block: cell("block"), floor: cell("floor"), beds });
  }

  if (dataRows === 0) return { rows: [], errors: [{ line: 0, field: "file", message: "The file has no rooms." }] };
  return { rows, errors };
}
