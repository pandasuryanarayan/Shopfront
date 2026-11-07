import { mountChrome, boot, qs, icon } from '../ui.js';
mountChrome();
boot();
qs('#nf-icon').innerHTML = icon('compass', 44);
