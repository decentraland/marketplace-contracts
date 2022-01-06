import hr from 'hardhat'

async function main() {
  await hr.run("verify:verify", {
    address: '0x480a0f4e360E8964e68858Dd231c2922f1df45Ef',
    constructorArguments: [
      process.env['OWNER'],
      process.env['FEE_COLLECTOR'],
      '0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',
      '0x90958D4531258ca11D18396d4174a007edBc2b42',
      0,
      25000
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })