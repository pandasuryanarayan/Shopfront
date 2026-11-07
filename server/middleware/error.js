import { AppError } from '../lib/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  }
  return res.status(404).sendFile('404.html', { root: config.publicDir }, (err) => {
    if (err) res.status(404).send('Not found');
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  }
  console.error('[unhandled]', err);
  const body = { error: { code: 'INTERNAL', message: 'Something went wrong on our side' } };
  if (!config.isProd) body.error.stack = err.stack;
  return res.status(500).json(body);
}
