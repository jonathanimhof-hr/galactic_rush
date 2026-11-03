// Registers the V2 course builders.
import { registerCourse } from './index.js';
import { buildTrench } from './trench.js';
import { buildBelt } from './belt.js';
import { buildCity } from './city.js';
import { buildRing } from './ring.js';
registerCourse('trench', buildTrench);
registerCourse('asteroids', buildBelt);
registerCourse('city', buildCity);
registerCourse('gasgiant', buildRing);
