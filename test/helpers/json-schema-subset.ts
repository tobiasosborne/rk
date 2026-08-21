// TEST-ONLY JSON Schema subset used to validate checked-in schemas without a runtime dependency.
// Supports exactly the keywords rk's graph/signature fixtures exercise.

type Schema = boolean | Record<string, unknown>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (!object(a) || !object(b)) return false;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  return same(ak, bk) && ak.every((key) => same(a[key], b[key]));
}

function resolve(root: Record<string, unknown>, ref: string): Schema | undefined {
  if (!ref.startsWith("#/$defs/")) return undefined;
  let value: unknown = root;
  for (const token of ref.slice(2).split("/")) {
    if (!object(value)) return undefined;
    value = value[token.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return typeof value === "boolean" || object(value) ? value : undefined;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "null": return value === null;
    case "object": return object(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    default: return false;
  }
}

function visit(schema: Schema, value: unknown, root: Record<string, unknown>, path: string): string[] {
  if (schema === true) return [];
  if (schema === false) return [`${path}: false schema rejects every value`];
  const errors: string[] = [];

  if (typeof schema.$ref === "string") {
    const target = resolve(root, schema.$ref);
    return target === undefined ? [`${path}: unresolved $ref ${schema.$ref}`] : visit(target, value, root, path);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((branch) =>
      (typeof branch === "boolean" || object(branch)) && visit(branch, value, root, path).length === 0
    ).length;
    if (matches !== 1) errors.push(`${path}: oneOf matched ${matches} branches, expected exactly 1`);
  }
  if (schema.const !== undefined && !same(value, schema.const)) errors.push(`${path}: does not equal const ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => same(value, item))) errors.push(`${path}: not in enum`);
  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
    errors.push(`${path}: expected type ${schema.type}`);
    return errors;
  }
  if (object(schema.not) || typeof schema.not === "boolean") {
    if (visit(schema.not, value, root, path).length === 0) errors.push(`${path}: forbidden by not`);
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern ${schema.pattern}`);
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push(`${path}: more than maxItems ${schema.maxItems}`);
    if (typeof schema.items === "boolean" || object(schema.items)) {
      value.forEach((item, i) => errors.push(...visit(schema.items as Schema, item, root, `${path}[${i}]`)));
    }
  }
  if (object(value)) {
    const properties = object(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) if (typeof key === "string" && !(key in value)) errors.push(`${path}: missing required '${key}'`);
    }
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) {
      errors.push(`${path}: fewer than minProperties ${schema.minProperties}`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value && (typeof child === "boolean" || object(child))) errors.push(...visit(child, value[key], root, `${path}.${key}`));
    }
    for (const key of Object.keys(value).filter((key) => !(key in properties))) {
      if (schema.additionalProperties === false) errors.push(`${path}: additional property '${key}'`);
      else if (typeof schema.additionalProperties === "boolean" || object(schema.additionalProperties)) {
        errors.push(...visit(schema.additionalProperties as Schema, value[key], root, `${path}.${key}`));
      }
    }
  }
  return errors;
}

export function validateJsonSchema(schema: unknown, value: unknown): string[] {
  if (!object(schema)) return ["$: root schema is not an object"];
  return visit(schema, value, schema, "$");
}
