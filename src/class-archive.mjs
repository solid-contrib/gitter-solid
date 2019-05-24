import $rdf from 'rdflib'
import solidNamespace from 'solid-namespace'
import { loadResourceIfExists, login, setupStore } from './solid-utils'
import { confirm, question } from './input-utils'

const NS = solidNamespace($rdf)

export class Archive {
  constructor (session, store, config) {
    this._session = session
    this._store = store
    this._config = config
  }

  getChatUri(channelName) {
    const archiveBaseURI = this._config.slackArchiveURI
    if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
    return $rdf.sym(archiveBaseURI + channelName + '/index.ttl#this')
  }

  async initiateChannel(channelName) {
    const chatUri = this.getChatUri(channelName)
    let chatDoc = chatUri.doc()
    let exists = await loadResourceIfExists(chatDoc)
    if (exists) {
      return console.log(`Channel ${channel} already initiated`)
    }
    console.log(chatUri)
  }

  static async load (store = $rdf.graph()) {
    const session = await login()
    setupStore(store)
    const config = await loadConfig(store, $rdf.sym(session.webId))
    return new Archive(session, store, config)
  }
}

async function createNewConfig (store, preferences, me) {
  console.log('You don\'t have a gitter configuration. ')
  const config = $rdf.sym(preferences.dir().uri + 'slackConfiguration.ttl')
  if (await confirm('Make a Slack config file now in your pod at ' + config)) {
    console.log('    putting ' + config)
    await store.fetcher.webOperation('PUT', config.uri, {
      data: '',
      contentType: 'text/turtle'
    })
    console.log('    getting ' + config)
    await store.fetcher.load(config)
    await store.updater.update([], [$rdf.st(me, NS.solid('slackConfiguationFile'), config, preferences)])
    await store.updater.update([], [$rdf.st(config, NS.dct('title'), 'My Slack config file', config)])
    console.log('Made new Slack config: ' + config)
  } else {
    console.log('Ok, exiting, no Slack config')
    process.exit(4)
  }
}

async function loadConfig (store, me) {
  const slackConfig = await loadSlackConfig(store, me)
  return populateConfigObject(store, me, slackConfig)
}

async function loadSlackConfig (store, me) {
  await store.fetcher.load(me.doc())
  const preferences = store.the(me, NS.space('preferencesFile'), null, me.doc())
  console.log(`Loading prefs ${preferences}`)
  await store.fetcher.load(preferences)
  console.log('Loaded prefs ✅')
  const slackConfig = store.the(me, NS.solid('slackConfiguationFile'), null, preferences)
  if (slackConfig) {
    await store.fetcher.load(slackConfig)
  } else {
    await createNewConfig(store, preferences, me)
  }
  console.log('Have Slack config ✅')
  return slackConfig
}

async function populateConfigObject (store, me, slackConfig) {
  const config = {}
  const opts = ['slackArchiveURI']
  for (let opt of opts) {
    const oldValue = store.anyValue(me, NS.solid(opt))
    console.log(` Config option ${opt}: "${oldValue}"`)
    if (oldValue) {
      config[opt] = oldValue.trim()
    } else {
      console.log('\nThis must a a full https: URI ending in a slash, which folder on your pod you want gitter chat stored.')
      const newValue = await question('Value for ' + opt + '?')
      if (newValue.length > 0 && newValue.endsWith('/')) {
        await store.updater.update([], [$rdf.st(me, NS.solid(opt), newValue, slackConfig)])
        console.log(`saved config ${opt} =  ${newValue}`)
      } else {
        console.log('abort. exit.')
        process.exit(6)
      }
    }
    config[opt] = oldValue
  }
  console.log('We have all config data ✅')
  return config
}

/** Decide URI of solid chat vchanel from name of src room
 *
 * @param slackName {String} - like 'solid/chat'
 */
export function chatUriFromSlackName (slackName, archiveBaseURI) {
  if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
  const segment = slackName.split('/').map(encodeURIComponent).join('/') // Preserve the slash between org and room
  return $rdf.sym(archiveBaseURI + segment + '/index.ttl#this')
}