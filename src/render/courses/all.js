// Registers the V2 course builders.
import { registerCourse } from './index.js';
import { buildTrench } from './trench.js';
import { buildBelt } from './belt.js';
import { buildCity } from './city.js';
import { buildRing } from './ring.js';
import { buildPelagos } from './pelagos.js';
import { buildIgnara } from './ignara.js';
import { buildCanopy } from './canopy.js';
import { buildNexus } from './nexus.js';
registerCourse('trench', buildTrench);
registerCourse('asteroids', buildBelt);
registerCourse('city', buildCity);
registerCourse('gasgiant', buildRing);
registerCourse('ocean', buildPelagos); // V9
registerCourse('volcano', buildIgnara); // V9
registerCourse('jungle', buildCanopy); // V10
registerCourse('station', buildNexus); // V10
