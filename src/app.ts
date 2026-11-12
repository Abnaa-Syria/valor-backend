import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { storage } from './lib/storage';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // cross-origin resource policy: lets the dashboard (another origin) play uploaded videos.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' || req.url?.startsWith('/uploads/') === true },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Uploaded files (v1 local storage). Video players use range requests, which express.static supports.
  app.use('/uploads', express.static(storage.rootDir, { fallthrough: false, index: false, maxAge: '7d' }));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
