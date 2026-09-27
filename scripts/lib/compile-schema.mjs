import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** ajv でスキーマ（schemas/ の中のファイル名）を読み、確かめる関数を作る */
export function compileSchema(name) {
  const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas', name), 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}
