const { secp256k1 } = require("@noble/curves/secp256k1");
const ethers = require("ethers");

const EPSILON_DERIVATION_PREFIX = "sig.network v1.0.0 epsilon derivation";

function deriveEpsilonEth(requester, path) {
  chainId = "0x1";

  const derivationPath = `${EPSILON_DERIVATION_PREFIX},${chainId},${requester.toLowerCase()},${path}`;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(derivationPath));
  return BigInt(hash);
}

function publicKeyToPoint(publicKey) {
  // Remove '0x04' prefix
  const cleanPubKey = publicKey.slice(4)

  const x = cleanPubKey.slice(0, 64);
  const y = cleanPubKey.slice(64, 128);

  return { x: BigInt("0x" + x), y: BigInt("0x" + y) };
}

function pointToPublicKey(point) {
  const x = point.x.toString(16).padStart(64, "0");
  const y = point.y.toString(16).padStart(64, "0");
  return "0x04" + x + y;
}

function derivePublicKey(path, requesterAddress, basePublicKey) {
  try {
    const epsilon = deriveEpsilonEth(requesterAddress, path);

    const basePoint = publicKeyToPoint(basePublicKey);

    const epsilonPoint = secp256k1.ProjectivePoint.BASE.multiply(epsilon);

    const baseProjectivePoint = new secp256k1.ProjectivePoint(
      basePoint.x,
      basePoint.y,
      1n
    );

    // Add the points: (G * ε) + basePublicKey
    const resultPoint = epsilonPoint.add(baseProjectivePoint);

    const resultAffine = resultPoint.toAffine();

    const derivedPublicKey = pointToPublicKey({
      x: resultAffine.x,
      y: resultAffine.y,
    });

    console.log("Derived public key:", derivedPublicKey);
    return derivedPublicKey;
  } catch (error) {
    console.error("Error deriving public key:", error);
    throw error;
  }
}

module.exports = { derivePublicKey };
