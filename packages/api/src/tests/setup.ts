// Must set env vars before any app modules are imported.
// env.ts validates at import time and process.exit(1)s on missing vars.
process.env['MONGODB_URI'] = 'mongodb://localhost:27017/code-dojo-test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-secret';
process.env['API_KEY'] = 'test-api-key-0123456789';
process.env['NODE_ENV'] = 'test';
