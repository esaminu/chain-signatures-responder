const { ethers } = require("ethers");
require("dotenv").config();
const CONTRACT_ABI = require("./abi");

function generateRequestId(
  addr,
  payload,
  path,
  keyVersion,
  chainId,
  algo,
  dest,
  params
) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address",
      "bytes",
      "string",
      "uint32",
      "uint256",
      "string",
      "string",
      "string",
    ],

    [addr, payload, path, keyVersion, chainId, algo, dest, params]
  );

  return ethers.keccak256(encoded);
}

// Constants
const EPSILON_DERIVATION_PREFIX = "sig.network v1.0.0 epsilon derivation";

function deriveEpsilonEth(requester, path) {
  chainId = "0x1";

  const derivationPath = `${EPSILON_DERIVATION_PREFIX},${chainId},${requester.toLowerCase()},${path}`;
  console.log(derivationPath, "<<< derivation path");
  const hash = ethers.keccak256(ethers.toUtf8Bytes(derivationPath));
  return BigInt(hash);
}

async function deriveSigningKey(path, predecessor, basePrivateKey) {
  const epsilon = deriveEpsilonEth(predecessor, path);
  const privateKeyBigInt = BigInt(basePrivateKey);
  const curveOrder = BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
  );
  const derivedPrivateKey = (privateKeyBigInt + BigInt(epsilon)) % curveOrder;
  return "0x" + derivedPrivateKey.toString(16).padStart(64, "0");
}

function modularSquareRoot(n, p) {
  if (n === 0n) return 0n;
  if (p % 4n === 3n) {
    const sqrt = powerMod(n, (p + 1n) / 4n, p);
    return sqrt;
  }
  throw new Error("Modulus not supported");
}

function powerMod(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base = base % modulus;
  while (exponent > 0n) {
    if (exponent % 2n === 1n) {
      result = (result * base) % modulus;
    }
    base = (base * base) % modulus;
    exponent = exponent / 2n;
  }
  return result;
}

async function signMessage(msgHash, privateKeyHex) {
  const msgHashHex = "0x" + msgHash.toString(16).padStart(64, "0");
  const signingKey = new ethers.SigningKey(privateKeyHex);
  const signature = signingKey.sign(msgHashHex);

  const rBigInt = BigInt(signature.r);
  const p = BigInt(
    "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F"
  );
  const ySquared = (rBigInt ** 3n + 7n) % p;
  const y = modularSquareRoot(ySquared, p);
  const recoveryId = signature.v - 27;
  const yParity = recoveryId;
  const rY = y % 2n === BigInt(yParity) ? y : p - y;

  return {
    bigR: {
      x: signature.r,
      y: "0x" + rY.toString(16).padStart(64, "0"),
    },
    s: signature.s,
    recoveryId,
  };
}

async function pollForEvents(chainSignatures, provider, lastBlockProcessed) {
  try {
    // Get current block using provider directly
    const currentBlock = await provider.getBlockNumber();

    // If we've processed this block already, wait and check again
    if (currentBlock <= lastBlockProcessed) {
      return lastBlockProcessed;
    }

    console.log(`Checking blocks ${lastBlockProcessed + 1} to ${currentBlock}`);

    // Get all SignatureRequested events from last processed block to current
    const events = await chainSignatures.queryFilter(
      chainSignatures.filters.SignatureRequested(),
      lastBlockProcessed + 1,
      currentBlock
    );

    // Process each event
    for (const event of events) {
      const {
        sender,
        payload,
        keyVersion,
        deposit,
        chainId,
        path,
        algo,
        dest,
        params,
      } = event.args;

      const requestId = generateRequestId(
        sender,
        payload,
        path,
        keyVersion,
        chainId,
        algo,
        dest,
        params
      );
      console.log("\nNew SignatureRequested event detected!", {
        requestId,
        sender,
        payload: payload.toString(),
        keyVersion: keyVersion.toString(),
        deposit: deposit.toString(),
        chainId: chainId.toString(),
        path,
        algo,
        dest,
        params,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });

      try {
        const basePrivateKey =
          process.env.NETWORK_ID === "testnet"
            ? process.env.PRIVATE_KEY_TESTNET
            : process.env.PRIVATE_KEY;

        const derivedPrivateKeyHex = await deriveSigningKey(
          path,
          sender,
          basePrivateKey
        );

        console.log("Message hash (hex):", payload);
        const signature = await signMessage(
          BigInt(payload),
          derivedPrivateKeyHex
        );

        console.log("Generated signature:", signature);

        console.log("Submitting signature...");
        const tx = await chainSignatures.respond([{ requestId, signature }]);
        const receipt = await tx.wait();

        console.log("Signature submitted successfully!");
        console.log("Transaction hash:", receipt.hash);
      } catch (error) {
        console.error("Error processing event:", error);
        await chainSignatures.respondError([
          { requestId, errorMessage: error.message },
        ]);
      }
    }

    return currentBlock;
  } catch (error) {
    console.error("Error polling for events:", error);
    return lastBlockProcessed; // Return last successful block on error
  }
}

async function main() {
  // Validate environment variables
  const requiredEnvVars =
    process.env.NETWORK_ID === "testnet"
      ? ["PRIVATE_KEY_TESTNET", "INFURA_API_KEY", "CONTRACT_ADDRESS_TESTNET"]
      : ["PRIVATE_KEY", "RPC_URL", "CONTRACT_ADDRESS"];

  requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new Error(`${varName} not found in environment variables`);
    }
  });

  // Connect to provider and contract
  const provider = new ethers.InfuraProvider(
    process.env.NETWORK_ID === "testnet" ? "base-sepolia" : "base",
    process.env.INFURA_API_KEY
  );

  const wallet = new ethers.Wallet(
    process.env.NETWORK_ID === "testnet"
      ? process.env.PRIVATE_KEY_TESTNET
      : process.env.PRIVATE_KEY,
    provider
  );

  const chainSignatures = new ethers.Contract(
    process.env.NETWORK_ID === "testnet"
      ? process.env.CONTRACT_ADDRESS_TESTNET
      : process.env.CONTRACT_ADDRESS,
    CONTRACT_ABI,
    wallet
  );

  console.log("Starting responder service...");
  console.log("Connected wallet address:", wallet.address);

  // Get current block as starting point
  let lastBlockProcessed = await provider.getBlockNumber();
  console.log(`Starting from block ${lastBlockProcessed}`);

  // Poll for events every 5 seconds
  while (true) {
    lastBlockProcessed = await pollForEvents(
      chainSignatures,
      provider,
      lastBlockProcessed
    );
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds between polls
  }
}

// Handle shutdown gracefully
process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Cleaning up...");
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

main().catch(console.error);
