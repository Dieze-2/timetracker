// Chromium pour les tests. Par défaut celui de Playwright (CI : `npx playwright
// install chromium`). Si CHROMIUM_PATH est défini, ce binaire est utilisé à la
// place (machine où un Chromium est déjà installé dans une autre version).
import { chromium as pw } from 'playwright';

const exe = process.env.CHROMIUM_PATH;
export const chromium = {
  launch: (opts = {}) => pw.launch(exe ? { ...opts, executablePath: exe } : opts),
};
