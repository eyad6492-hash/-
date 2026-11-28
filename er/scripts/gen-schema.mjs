// Prints the CREATE TABLE statements for every collection in worker/schema.js (used to write migrations).
import { COL_NAMES, createTableSQL } from '../worker/schema.js';
console.log(COL_NAMES.map(createTableSQL).join('\n\n'));
