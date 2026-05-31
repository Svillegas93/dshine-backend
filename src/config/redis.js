const { createClient } = require('redis');

let client = null;

async function connectRedis() {
  console.log('REDIS_URL EN USO:', process.env.REDIS_URL);
  const url = 'rediss://default:gQAAAAAAiN8AAIgcDFkMzMwNjkzMWE3NzU0YWF1YjMSZDUwZWYzYjUyZTc5OQ@wise-monarch-140156.upstash.io:6379';

  client = createClient({ url });

  client.on('error', (err) => {
    console.error('❌  Redis error:', err.message);
  });

  client.on('connect', () => {
    console.log('✅  Redis conectado');
  });

  await client.connect();
  return client;
}

function getRedis() {
  if (!client) throw new Error('Redis no inicializado. Llama connectRedis() primero.');
  return client;
}

module.exports = { connectRedis, getRedis };
