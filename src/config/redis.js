const { createClient } = require('redis');

let client = null;

async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = createClient({ url });

  client.on('error', (err) => {
    console.error('Redis error:', err.message);
  });

  client.on('connect', () => {
    console.log('Redis conectado');
  });

  await client.connect();
  return client;
}

function getRedis() {
  if (!client) throw new Error('Redis no inicializado. Llama connectRedis() primero.');
  return client;
}

module.exports = { connectRedis, getRedis };
