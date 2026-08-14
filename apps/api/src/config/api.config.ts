export type ServerConfig = {
  host: string;
  port: number;
};

export type DatabaseConfig = {
  databaseUrl: string;
};

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const port = Number.parseInt(raw, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}: expected an integer between 1 and 65535`);
  }

  return port;
}

export function loadServerConfig(): ServerConfig {
  return {
    host: process.env.API_HOST?.trim() || '127.0.0.1',
    port: readPort('API_PORT', 3001),
  };
}

export function loadDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  return { databaseUrl };
}
