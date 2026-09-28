import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readSchema(name) {
  return JSON.parse(readFileSync(resolve(ROOT, 'schemas', name), 'utf-8'));
}

function createAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/** ajv でスキーマ（schemas/ の中のファイル名）を読み、確かめる関数を作る */
export function compileSchema(name) {
  return createAjv().compile(readSchema(name));
}

/**
 * スキーマ（schemas/ の中のファイル名）の definitions の1つで確かめる関数を作る。
 * @param {string} name スキーマのファイル名（$id も同じ名前にしておく）
 * @param {string} definition definitions の中の名前
 * @param {string[]} refs そのスキーマが $ref で参照する、ほかのスキーマのファイル名
 */
export function compileSchemaDefinition(name, definition, refs = []) {
  const ajv = createAjv();
  for (const ref of refs) ajv.addSchema(readSchema(ref));
  ajv.addSchema(readSchema(name));
  const validate = ajv.getSchema(`${name}#/definitions/${definition}`);
  if (!validate) throw new Error(`${name} に definitions/${definition} が無い`);
  return validate;
}
