export { file, write } from './file';
export { dir } from './directory';
export { tmpfile } from './tmpfile';
export { rollfile } from './rollfile';

import { file } from './file';
import { dir } from './directory';

export type OTFile = ReturnType<typeof file>;
export type OTDir = ReturnType<typeof dir>;
