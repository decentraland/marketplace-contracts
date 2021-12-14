import hr from 'hardhat'

async function main() {
  await hr.run("verify:verify", {
    address: '0x5A467398dfa9d5C663a656423A2D055f538198A4',
    constructorArguments: [
      process.env['OWNER'],
      process.env['FEE_COLLECTOR'],
      '0x882Da5967c435eA5cC6b09150d55E8304B838f45',
      '0x68838E6068a3a925a78546E475dE73C75e4F2651',
      10000,
      15000
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })