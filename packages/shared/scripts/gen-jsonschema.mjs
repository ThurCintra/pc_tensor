import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { envelopeSchema, PROTOCOL_VERSION } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'generated', 'protocol.schema.json');

const schema = zodToJsonSchema(envelopeSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
});

const document = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://pc-sentinel/protocol.schema.json',
  title: 'pc-sentinel-protocol',
  description: 'Single source of truth generated from Zod schemas. Do not edit manually.',
  version: PROTOCOL_VERSION,
  ...schema,
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`wrote ${outFile}`);
