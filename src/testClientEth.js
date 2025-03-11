const { ethers } = require("ethers");
require("dotenv").config();
const { derivePublicKey } = require("./kdf");

// ABI for the ChainSignatures contract
const CONTRACT_ABI = [
  // Function to request a signature
  "function sign(tuple(bytes32 payload, string path, uint32 keyVersion, string algo, string dest, string params)) external payable",
  // Function to get the deposit amount
  "function getSignatureDeposit() external view returns (uint256)",
  // Event for signature requests
  "event SignatureRequested(address sender, bytes32 payload, uint32 keyVersion, uint256 deposit, uint256 chainId, string path, string algo, string dest, string params)",
  // Event for signature responses
  "event SignatureResponded(bytes32 indexed requestId, address responder, tuple(tuple(uint256 x, uint256 y) bigR, uint256 s, uint8 recoveryId) signature)",
  // Event for errors
  "event SignatureError(bytes32 indexed requestId, address responder, string errorMessage)",
];

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

async function main() {
  // Check for required environment variables
  if (!process.env.ETHEREUM_PRIVATE_KEY) {
    throw new Error("ETHEREUM_PRIVATE_KEY not found in environment variables");
  }
//   if (!process.env.SEPOLIA_RPC_URL) {
//     throw new Error("SEPOLIA_RPC_URL not found in environment variables");
//   }
  if (!process.env.RESPONDER_BASE_PUBLIC_KEY) {
    throw new Error(
      "RESPONDER_BASE_PUBLIC_KEY not found in environment variables"
    );
  }

  const basePublicKey = process.env.RESPONDER_BASE_PUBLIC_KEY;
  console.log("Base public key:", basePublicKey);
//   verifyResponderPublicKey(basePublicKey);

  // Connect to the Sepolia network
  const provider = new ethers.InfuraProvider(
    "sepolia",
    "e8115ff20b0f4fd6af06495b568a75e7"
  );

  // Create a wallet using the provided private key
  const wallet = new ethers.Wallet(process.env.ETHEREUM_PRIVATE_KEY, provider);
  console.log("Connected wallet address:", wallet.address);

  // Connect to the ChainSignatures contract
  const contractAddress = "0x69C6b28Fdc74618817fa380De29a653060e14009"; // Contract address on Sepolia
  const chainSignatures = new ethers.Contract(
    contractAddress,
    CONTRACT_ABI,
    wallet
  );

  // Get the required deposit amount
  const depositAmount = await chainSignatures.getSignatureDeposit();
  console.log(
    "Required deposit amount:",
    ethers.formatEther(depositAmount),
    "ETH"
  );

  // Prepare signature request parameters
  const path = "testPath";
  const payload = ethers.randomBytes(32);
  const keyVersion = 0;
  const algo = "";
  const dest = "";
  const params = "";

  // Get the current chain ID (Sepolia = 11155111)
  const chainId = await provider
    .getNetwork()
    .then((network) => network.chainId);
//   const chainId = 0x1;

  // Generate request ID
  const requestId = generateRequestId(
    wallet.address,
    payload,
    path,
    keyVersion,
    chainId,
    algo,
    dest,
    params
  );
  console.log("Requesting signature...");
  console.log("Request ID:", requestId);

  // Request a signature
  const tx = await chainSignatures.sign(
    {
      payload,
      path,
      keyVersion,
      algo,
      dest,
      params,
    },
    { value: depositAmount }
  );
  console.log("Transaction sent, waiting for confirmation...");
  console.log("Transaction hash:", tx.hash);
  await tx.wait();
  console.log("Signature requested. Waiting for response...");

  return new Promise((resolve, reject) => {
    // Using polling instead of event filtering due to potential RPC filter issues
    const checkForResponse = async () => {
      try {
        // Get the latest block number
        const latestBlock = await provider.getBlockNumber();
        console.log("Checking blocks up to", latestBlock);

        // Look back up to 500 blocks
        const fromBlock = Math.max(0, latestBlock - 500);

        // IMPORTANT: Use the correct event signature hash for the contract
        // This topic is from the actual SignatureResponded event observed on-chain
        const SIGNATURE_RESPONDED_TOPIC =
          "0x8fefda2f6c146df62efa1de95f8ff0b9c29ae07b9846e61fbce6e618897397ff";

        // Query for events directly using the specific topic and request ID
        const filter = {
          address: contractAddress,
          topics: [
            SIGNATURE_RESPONDED_TOPIC,
            ethers.zeroPadValue(requestId, 32),
          ],
          fromBlock,
          toBlock: latestBlock,
        };

        console.log("Looking for events with request ID:", requestId);
        const logs = await provider.getLogs(filter);
        console.log(`Found ${logs.length} signature response events`);

        if (logs.length === 0) {
          // If no specific events found, check for any signature events (debug)
          const allFilter = {
            address: contractAddress,
            topics: [SIGNATURE_RESPONDED_TOPIC],
            fromBlock: latestBlock - 100,
            toBlock: latestBlock,
          };

          const allLogs = await provider.getLogs(allFilter);
          console.log(
            `Found ${allLogs.length} total signature events in last 100 blocks`
          );

          for (const log of allLogs) {
            console.log("Recent event found with requestId:", log.topics[1]);
          }

          return false;
        }

        // Process found events
        for (const log of logs) {
          console.log("Signature response found!");
          console.log("Log data:", log);

          // Extract the request ID from the event
          const eventRequestId = log.topics[1];
          console.log("Event request ID:", eventRequestId);
          console.log("Our request ID:  ", ethers.zeroPadValue(requestId, 32));

          // Get the block for timestamp info
          const block = await provider.getBlock(log.blockNumber);
          console.log("Event block:", log.blockNumber);
          console.log(
            "Event timestamp:",
            new Date(block.timestamp * 1000).toISOString()
          );

          // Try to decode the event data
          try {
            // Data format from observed contract events
            // responder address (32 bytes), bigR.x (32 bytes), bigR.y (32 bytes), s (32 bytes), recoveryId (32 bytes)
            const responder = "0x" + log.data.slice(26, 66);
            const bigRx = "0x" + log.data.slice(66, 130);
            const bigRy = "0x" + log.data.slice(130, 194);
            const s = "0x" + log.data.slice(194, 258);
            const recoveryId = parseInt(log.data.slice(258, 322), 16);

            console.log("Signature data:", {
              responder,
              bigR: {
                x: bigRx,
                y: bigRy,
              },
              s,
              recoveryId,
            });

            try {
              // Derive the public key
              const derivedPublicKey = derivePublicKey(
                path,
                wallet.address,
                basePublicKey
              );

              // Prepare signature components for verification
              const sig = {
                r: bigRx,
                s,
                v: recoveryId + 27,
              };

              // Log the signature components
              console.log("Signature components for verification:", {
                r: sig.r,
                s: sig.s,
                v: sig.v,
              });

              // Attempt to recover the address from the signature
              try {
                // Recover address from the signature
                const recoveredAddress = ethers.recoverAddress(payload, sig);

                // Get the address from the derived public key
                const derivedAddress = ethers.computeAddress(derivedPublicKey);

                console.log("Recovered address:", recoveredAddress);
                console.log("Derived address:", derivedAddress);

                if (
                  recoveredAddress.toLowerCase() ===
                  derivedAddress.toLowerCase()
                ) {
                  console.log("✅ Signature verified successfully!");
                } else {
                  console.log("❌ Signature verification failed!");
                }

                resolve({
                  isValid:
                    recoveredAddress.toLowerCase() ===
                    derivedAddress.toLowerCase(),
                  recoveredAddress,
                  derivedAddress,
                });
                return true;
              } catch (error) {
                console.log("⚠️ Error recovering address:", error.message);

                // Try alternative verification methods here if needed

                resolve({
                  isValid: false,
                  error: error.message,
                });
                return true;
              }
            } catch (error) {
              console.error("Error deriving public key:", error);
              reject(error);
              return true;
            }
          } catch (error) {
            console.error("Error decoding event data:", error);
            console.log("Raw event data:", log.data);
            reject(error);
            return true;
          }
        }

        return false;
      } catch (error) {
        console.error("Error checking for signature response:", error);
        return false;
      }
    };

    // Poll every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const found = await checkForResponse();
        if (found) {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 5000);

    // Set timeout to prevent hanging
    setTimeout(() => {
      clearInterval(pollInterval);
      reject(new Error("Timeout waiting for signature response"));
    }, 600000); // 5 minutes
  });
}

main().catch(console.error);

function verifyResponderPublicKey(publicKey) {
    // Remove '0x04' prefix if present (uncompressed format indicator)
    const cleanPubKey = publicKey.startsWith('0x04') ? publicKey.slice(4) : publicKey.slice(2);
    
    // Hash the public key using keccak256
    const hash = ethers.keccak256('0x' + cleanPubKey);
    
    // Take the last 20 bytes (40 characters) to get the address
    const address = '0x' + hash.slice(26);
    
    console.log("Computed responder address:", address);
    
    // Check if it matches the expected address from the contract constructor
    const expectedAddress = "0x64b4bc39ff1393ebb8605975bd68db67aa0a31c4";
    if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error(`Responder public key doesn't match expected address ${expectedAddress}`);
    }
    
    console.log("Responder public key verified ✓");
    return address;
  }