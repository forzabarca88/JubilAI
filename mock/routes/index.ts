/** Router assembly for the mock server */

import { Router } from 'express';
import modelsRouter from './models';
import debatesRouter from './debates';
import turnsRouter from './turns';
import verdictsRouter from './verdicts';
import validateRouter from './validate';

const router = Router();

router.use(modelsRouter);
router.use(debatesRouter);
router.use(turnsRouter);
router.use(verdictsRouter);
router.use(validateRouter);

export default router;
