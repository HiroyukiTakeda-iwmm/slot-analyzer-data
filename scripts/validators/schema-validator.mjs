import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

export function validateSchemas(machineFiles, indexData) {
  const errors = [];
  const warnings = [];

  const machineSchema = JSON.parse(
    readFileSync(resolve(ROOT, 'schemas/machine.schema.json'), 'utf-8')
  );
  const indexSchema = JSON.parse(
    readFileSync(resolve(ROOT, 'schemas/index.schema.json'), 'utf-8')
  );

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // index.json バリデーション
  const validateIndex = ajv.compile(indexSchema);
  if (!validateIndex(indexData)) {
    for (const err of validateIndex.errors) {
      errors.push({
        file: 'machines/index.json',
        type: 'schema',
        severity: 'error',
        message: `${err.instancePath} ${err.message}`,
        detail: err,
      });
    }
  }

  // 各機種JSONバリデーション
  const validateMachine = ajv.compile(machineSchema);
  for (const { path, data } of machineFiles) {
    if (!validateMachine(data)) {
      for (const err of validateMachine.errors) {
        errors.push({
          file: path,
          type: 'schema',
          severity: 'error',
          message: `${err.instancePath} ${err.message}`,
          detail: err,
        });
      }
    }
  }

  return { errors, warnings };
}
