import auth from 'solid-auth-cli'
import $rdf from 'rdflib'
import dotenv from 'dotenv'

dotenv.config()

const SOLID_IDP = process.env.SOLID_IDP
const SOLID_USERNAME = process.env.SOLID_USERNAME
const SOLID_PASSWORD = process.env.SOLID_PASSWORD

export async function loadResourceIfExists (doc, store = setupStore()) {
  try {
    await store.fetcher.load(doc)
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      // console.log('    No chat file yet, creating later ' + doc)
      return false
    } else {
      console.log(' #### Error reading  file ' + err)
      console.log('            error object  ' + JSON.stringify(err))
      console.log('        err.response   ' + err.response)
      console.log('        err.response.status   ' + err.response.status)
      process.exit(4)
    }
  }
}

export async function login () {
  const session = await auth.login({
    idp: SOLID_IDP,
    username: SOLID_USERNAME,
    password: SOLID_PASSWORD
  })
  console.log(`Logged in to Solid as ${session.webId}`)
  return session
}

export function setupStore (store = $rdf.graph()) {
  if (!store.fetcher) {
    $rdf.fetcher(store, { fetch: auth.fetch, timeout: 900000 })
  }
  if (!store.updater) {
    new $rdf.UpdateManager(store)
  }
  return store
}