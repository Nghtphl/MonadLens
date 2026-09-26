// Checks whether the local anvil supports what lib/simulator/trace.ts needs
// (CLAUDE.md §7): N txs from N senders mined into ONE block, then
// debug_traceTransaction with prestateTracer + diffMode, giving per-tx
// storage pre/post that reflects in-block ordering.
//
// Usage: node scripts/probe-prestate-tracer.mjs
import { spawn } from "node:child_process";

const PORT = 8600 + Math.floor(Math.random() * 300);
const RPC = `http://127.0.0.1:${PORT}`;
const TX_COUNT = 3;

// Hand-assembled contract, so no solc is needed:
//   runtime: PUSH1 1 SLOAD POP                              (read-only slot1)
//            PUSH1 0 SLOAD PUSH1 1 ADD PUSH1 0 SSTORE STOP   (slot0 += 1)
//   init:    slot1 = 42; CODECOPY runtime (14 bytes @ 0x11); RETURN it
const RUNTIME = "6001545060005460010160005500";
const INIT = "0x602a600155" + "600e6011600039600e6000f3" + RUNTIME;

let id = 0;
async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function waitForRpc() {
  for (let i = 0; i < 50; i++) {
    try {
      return await rpc("eth_chainId");
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("anvil did not become ready");
}

const anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
anvil.on("error", (e) => {
  console.error(`FAIL: could not start anvil (${e.message}). Is Foundry installed?`);
  process.exit(1);
});

let ok = true;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) ok = false;
};

try {
  await waitForRpc();
  console.log(`anvil ${await rpc("web3_clientVersion")} on ${RPC}\n`);
  const accounts = await rpc("eth_accounts");

  const deployHash = await rpc("eth_sendTransaction", [{ from: accounts[0], data: INIT }]);
  const { contractAddress } = await rpc("eth_getTransactionReceipt", [deployHash]);
  const contract = contractAddress.toLowerCase();

  await rpc("evm_setAutomine", [false]);
  const hashes = [];
  for (let i = 1; i <= TX_COUNT; i++) {
    hashes.push(await rpc("eth_sendTransaction", [{ from: accounts[i], to: contract, gas: "0x186a0" }]));
  }
  await rpc("evm_mine");

  const receipts = await Promise.all(hashes.map((h) => rpc("eth_getTransactionReceipt", [h])));
  check(new Set(receipts.map((r) => r.blockNumber)).size === 1, `all ${TX_COUNT} txs mined in one block`);
  check(receipts.every((r) => r.status === "0x1"), "all txs succeeded");

  const slotKey = (n) => "0x" + n.toString(16).padStart(64, "0");
  const slot0 = slotKey(0);
  const slot1 = slotKey(1);
  const toNum = (v) => (v === undefined ? 0 : Number(BigInt(v)));
  const lower = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  let diffModeSeesPureReads = true;

  for (let i = 0; i < hashes.length; i++) {
    const diff = await rpc("debug_traceTransaction", [
      hashes[i],
      { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
    ]);
    const full = await rpc("debug_traceTransaction", [hashes[i], { tracer: "prestateTracer" }]);

    const pre = lower(lower(diff.pre)[contract]?.storage);
    const post = lower(lower(diff.post)[contract]?.storage);
    const touched = lower(lower(full)[contract]?.storage);
    console.log(`\ntx${i}`);
    console.log(`  diffMode pre.storage  = ${JSON.stringify(pre)}`);
    console.log(`  diffMode post.storage = ${JSON.stringify(post)}`);
    console.log(`  non-diff storage      = ${JSON.stringify(touched)}`);

    check(slot0 in post, `tx${i}: write to slot0 appears in diffMode post (writeSet)`);
    check(toNum(post[slot0]) === i + 1, `tx${i}: post value is ${i + 1} (sees earlier txs in the block)`);
    check(toNum(pre[slot0]) === i, `tx${i}: diffMode pre value is ${i}`);
    check(slot1 in touched, `tx${i}: read-only slot1 appears in non-diff trace (readSet source)`);
    if (!(slot1 in pre)) diffModeSeesPureReads = false;
  }

  console.log(
    diffModeSeesPureReads
      ? "\nNOTE: diffMode `pre` includes read-only slots — one trace per tx is enough."
      : "\nNOTE: diffMode `pre` OMITS read-only slots. trace.ts must take readSet from a non-diff\n" +
          "      prestateTracer call and writeSet from diffMode (two traces per tx)."
  );
} catch (e) {
  ok = false;
  console.error(`\nFAIL: ${e.message}`);
} finally {
  anvil.kill();
}

console.log(ok ? "\nRESULT: prestateTracer diffMode is usable." : "\nRESULT: NOT usable as-is — see failures above.");
process.exit(ok ? 0 : 1);
