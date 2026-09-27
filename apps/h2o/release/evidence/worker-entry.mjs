import manifest from './edge-manifest.json' with {type:'json'};
import {createWorker} from '../worker.mjs';
export default createWorker(manifest);
