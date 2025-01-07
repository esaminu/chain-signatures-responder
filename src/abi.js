module.exports = [
  {
    inputs: [
      {
        internalType: "struct ChainSignatures.PublicKey",
        name: "_publicKey",
        type: "tuple",
        components: [
          { internalType: "uint256", name: "x", type: "uint256" },
          { internalType: "uint256", name: "y", type: "uint256" },
        ],
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "requestId",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "address",
        name: "requester",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "epsilon",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "payloadHash",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "path",
        type: "string",
      },
    ],
    name: "SignatureRequested",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "requestId",
        type: "bytes32",
      },
      {
        components: [
          {
            components: [
              {
                internalType: "uint256",
                name: "x",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "y",
                type: "uint256",
              },
            ],
            internalType: "struct ChainSignatures.AffinePoint",
            name: "bigR",
            type: "tuple",
          },
          {
            internalType: "uint256",
            name: "s",
            type: "uint256",
          },
          {
            internalType: "uint8",
            name: "recoveryId",
            type: "uint8",
          },
        ],
        indexed: false,
        internalType: "struct ChainSignatures.SignatureResponse",
        name: "response",
        type: "tuple",
      },
    ],
    name: "SignatureResponded",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "path",
        type: "string",
      },
      {
        internalType: "address",
        name: "requester",
        type: "address",
      },
    ],
    name: "deriveEpsilon",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [],
    name: "getPublicKey",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "x",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "y",
            type: "uint256",
          },
        ],
        internalType: "struct ChainSignatures.PublicKey",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "_requestId",
        type: "bytes32",
      },
      {
        components: [
          {
            components: [
              {
                internalType: "uint256",
                name: "x",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "y",
                type: "uint256",
              },
            ],
            internalType: "struct ChainSignatures.AffinePoint",
            name: "bigR",
            type: "tuple",
          },
          {
            internalType: "uint256",
            name: "s",
            type: "uint256",
          },
          {
            internalType: "uint8",
            name: "recoveryId",
            type: "uint8",
          },
        ],
        internalType: "struct ChainSignatures.SignatureResponse",
        name: "_response",
        type: "tuple",
      },
    ],
    name: "respond",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
