export const DEFAULT_DOMAIN = 'Decentraland Collection'
export const DEFAULT_VERSION = '2'

export async function sendMetaTx(
  contract,
  functionSignature,
  signer,
  relayer,
  badSigner = null,
  domain = DEFAULT_DOMAIN,
  version = DEFAULT_VERSION
) {
  const signature = await getSignature(
    contract,
    functionSignature,
    signer,
    badSigner,
    domain,
    version
  )
  const r = '0x' + signature.substring(0, 64)
  const s = '0x' + signature.substring(64, 128)
  const v = '0x' + signature.substring(128, 130)

  return contract.executeMetaTransaction(signer, functionSignature, r, s, v, {
    from: relayer,
  })
}

export async function getSignature(
  contract,
  functionSignature,
  signer,
  badSigner,
  domain,
  version
) {
  const chainId = await contract.getChainId()

  const domainType = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ]

  const domainData = {
    name: domain,
    verifyingContract: contract.address,
    salt: web3.utils.padLeft(web3.utils.toHex(chainId), 64),
    version,
  }

  const metaTransactionType = [
    { name: 'nonce', type: 'uint256' },
    { name: 'from', type: 'address' },
    { name: 'functionSignature', type: 'bytes' },
  ]

  let nonce = await contract.getNonce(signer)

  let message = {
    nonce: nonce,
    from: badSigner ? badSigner : signer,
    functionSignature: functionSignature,
  }

  const dataToSign = {
    types: {
      EIP712Domain: domainType,
      MetaTransaction: metaTransactionType,
    },
    domain: domainData,
    primaryType: 'MetaTransaction',
    message: message,
  }

  const signature = await new Promise((res, rej) =>
    web3.currentProvider.send(
      {
        method: 'eth_signTypedData_v4',
        params: [signer, dataToSign],
        jsonrpc: '2.0',
        id: 999999999999,
      },
      function(err, result) {
        if (err || result.error) {
          return rej(err || result.error)
        }
        return res(result.result)
      }
    )
  )

  return signature.substring(2)
}

export async function getDomainSeparator(contract) {
  const chainId = await contract.getChainId()

  return web3.utils.soliditySha3({
    t: 'bytes',
    v: web3.eth.abi.encodeParameters(
      ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
      [
        web3.utils.soliditySha3({
          t: 'string',
          v:
            'EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)',
        }),
        web3.utils.soliditySha3({ t: 'string', v: 'Decentraland Collection' }),
        web3.utils.soliditySha3({ t: 'string', v: '2' }),
        contract.address,
        web3.utils.padLeft(web3.utils.toHex(chainId), 64),
      ]
    ),
  })
}
