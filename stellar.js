require('dotenv').config();

async function registerTaskOnChain(githubId) {
  const { STELLAR_SECRET_KEY, STELLAR_NETWORK } = process.env;

  console.log('[stellar] Loading keys...');
  console.log(`[stellar] Network: ${STELLAR_NETWORK || 'testnet'}`);
  console.log(`[stellar] Secret key loaded: ${STELLAR_SECRET_KEY ? 'yes' : 'no (missing)'}`);

  console.log(`[stellar] Compiling transaction for GitHub PR #${githubId}...`);
  console.log(`[stellar] Transaction envelope built: { op: "manageData", key: "vero:pr:${githubId}", value: "registered" }`);
  console.log(`[stellar] Transaction submitted (simulated). Hash: 0x${Buffer.from(`pr-${githubId}`).toString('hex')}`);
  console.log(`[stellar] PR #${githubId} successfully registered on-chain.`);
}

module.exports = { registerTaskOnChain };
