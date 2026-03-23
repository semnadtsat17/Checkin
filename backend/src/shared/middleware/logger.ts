/**
 * HTTP request logger middleware.
 * Logs: method, path, status, response time, and IP.
 * Colorized output in development; plain JSON lines in production.
 */
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

// ANSI color codes
const c = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
};

function colorMethod(method: string): string {
  switch (method) {
    case 'GET':    return `${c.green}${method}${c.reset}`;
    case 'POST':   return `${c.cyan}${method}${c.reset}`;
    case 'PUT':
    case 'PATCH':  return `${c.yellow}${method}${c.reset}`;
    case 'DELETE': return `${c.red}${method}${c.reset}`;
    default:       return `${c.white}${method}${c.reset}`;
  }
}

function colorStatus(status: number): string {
  if (status < 300) return `${c.green}${status}${c.reset}`;
  if (status < 400) return `${c.cyan}${status}${c.reset}`;
  if (status < 500) return `${c.yellow}${status}${c.reset}`;
  return `${c.red}${status}${c.reset}`;
}

function getIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    '-'
  );
}

export function logger(req: Request, res: Response, next: NextFunction): void {
  const startAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startAt;
    const durationMs = Number(durationNs) / 1_000_000;
    const ms = durationMs.toFixed(2);

    if (config.nodeEnv === 'production') {
      // Structured JSON log — ingest into any log aggregator
      process.stdout.write(
        JSON.stringify({
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: parseFloat(ms),
          ip: getIp(req),
        }) + '\n'
      );
    } else {
      const ts = `${c.dim}${new Date().toTimeString().slice(0, 8)}${c.reset}`;
      const method = colorMethod(req.method.padEnd(7));
      const status = colorStatus(res.statusCode);
      const duration = `${c.magenta}${ms}ms${c.reset}`;
      const url = `${c.white}${req.originalUrl}${c.reset}`;
      console.log(`${ts} ${method} ${url} ${status} ${duration}`);
    }
  });

  next();
}
