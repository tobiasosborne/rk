// ROLE: tracked-class, choice, and enum sections of convention-profile validation.
// PURITY: pure — no fs/network/clock (L3).

import { MACRO_TOKEN_RE, type TrackedClass } from "./profile-types";

const CLASS_RE = /^[a-z0-9][a-z0-9_-]*$/;
const SYMBOL_RE = /^\S+$/;
const CLASS_KEYS = new Set(["class", "description", "symbols", "blessed", "symbols_must_be_registered"]);
const CHOICE_KEYS = new Set(["canonical", "allowed_translations", "notes"]);

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function readTrackedClasses(raw: unknown, errors: string[]): TrackedClass[] {
  const classes: TrackedClass[] = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push('"tracked_classes" must be a non-empty array — a profile that tracks nothing checks nothing');
    return classes;
  }
  const seen = new Set<string>();
  const blessedOwner = new Map<string, string>();
  raw.forEach((value, index) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`tracked_classes[${index}] must be an object`);
      return;
    }
    const item = value as Record<string, unknown>;
    const extra = Object.keys(item).filter((field) => !CLASS_KEYS.has(field));
    if (extra.length > 0) errors.push(`tracked_classes[${index}] has unrecognized properties ${extra.join(", ")}`);
    if (typeof item.class !== "string" || !CLASS_RE.test(item.class)) {
      errors.push(`tracked_classes[${index}].class is ${JSON.stringify(item.class)}, expected a lowercase id`);
      return;
    }
    if (seen.has(item.class)) errors.push(`tracked_classes: duplicate class id "${item.class}"`);
    seen.add(item.class);
    if (typeof item.description !== "string" || item.description.length === 0) {
      errors.push(`tracked_classes[${index}] ("${item.class}") needs a non-empty "description"`);
    }
    if ("symbols_must_be_registered" in item && item.symbols_must_be_registered !== true) {
      errors.push(`tracked_classes[${index}] ("${item.class}").symbols_must_be_registered must be exactly true`);
    }
    if (typeof item.blessed !== "string" || !MACRO_TOKEN_RE.test(item.blessed)) {
      errors.push(`tracked_classes[${index}] ("${item.class}").blessed is ${JSON.stringify(item.blessed)}, expected a plain macro token`);
      return;
    }
    if (!Array.isArray(item.symbols) || item.symbols.length === 0 || !item.symbols.every((symbol) => typeof symbol === "string" && SYMBOL_RE.test(symbol))) {
      errors.push(`tracked_classes[${index}] ("${item.class}").symbols must be a non-empty array of whitespace-free raw tokens`);
      return;
    }
    const symbols = item.symbols as string[];
    if (new Set(symbols).size !== symbols.length) errors.push(`tracked_classes[${index}] ("${item.class}").symbols has duplicate entries`);
    const owner = blessedOwner.get(item.blessed);
    if (owner !== undefined && owner !== item.class) {
      errors.push(`blessed macro ${item.blessed} is claimed by two tracked classes ("${owner}" and "${item.class}")`);
    }
    blessedOwner.set(item.blessed, item.class);
    classes.push({
      class: item.class,
      description: typeof item.description === "string" ? item.description : "",
      symbols: [...symbols],
      blessed: item.blessed,
    });
  });
  return classes;
}

export function readChoices(
  raw: unknown,
  errors: string[],
): Record<string, { canonical: string; allowed_translations: string[]; notes?: string }> {
  const choices: Record<string, { canonical: string; allowed_translations: string[]; notes?: string }> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push('"choices" must be an object (an empty one is legitimate)');
    return choices;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`choices["${key}"] must be an object {canonical, allowed_translations}`);
      continue;
    }
    const choice = value as Record<string, unknown>;
    const extra = Object.keys(choice).filter((field) => !CHOICE_KEYS.has(field));
    if (extra.length > 0) errors.push(`choices["${key}"] has unrecognized properties ${extra.join(", ")}`);
    if (typeof choice.canonical !== "string" || choice.canonical.length === 0) {
      errors.push(`choices["${key}"].canonical must be a non-empty string — the campaign's canonical convention`);
      continue;
    }
    if (!stringArray(choice.allowed_translations)) {
      errors.push(`choices["${key}"].allowed_translations must be an array of non-empty strings`);
      continue;
    }
    if (new Set(choice.allowed_translations).size !== choice.allowed_translations.length) {
      errors.push(`choices["${key}"].allowed_translations must contain distinct values`);
      continue;
    }
    if ("notes" in choice && typeof choice.notes !== "string") {
      errors.push(`choices["${key}"].notes must be a string when present`);
      continue;
    }
    choices[key] = {
      canonical: choice.canonical,
      allowed_translations: [...choice.allowed_translations],
      ...(typeof choice.notes === "string" ? { notes: choice.notes } : {}),
    };
  }
  return choices;
}

export function readEnums(raw: unknown, errors: string[]): Record<string, string[]> {
  const enums: Record<string, string[]> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push('"enums" must be an object (an empty one is legitimate)');
    return enums;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!stringArray(value) || value.length === 0 || new Set(value).size !== value.length) {
      errors.push(`enums["${key}"] must be a non-empty array of distinct non-empty strings`);
    } else enums[key] = [...value];
  }
  return enums;
}
