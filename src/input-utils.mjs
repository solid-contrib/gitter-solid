import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
})

export function closeInput () {
  rl.close()
}

export async function confirm (q) {
  while (1) {
    const a = await question(q)
    if (a === 'yes' || a === 'y') return true
    if (a === 'no' || a === 'n') return false
    console.log('  Please reply y or n')
  }
}

export function question (q) {
  return new Promise((resolve, reject) => {
    rl.question(q + ' ', (a) => { // space for answer not to be crowded
      console.log(`Registered answer ${a}`)
      resolve(a)
    })
  })
}