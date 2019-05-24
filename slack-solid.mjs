// Slack chat data to solid

// See https://api.slack.com/methods
// See https://www.npmjs.com/package/slack
// and https://api.slack.com/methods/conversations.list

// and https://www.npmjs.com/package/slack
// and https://www.npmjs.com/package/solid-auth-cli

import yargs from 'yargs'
import dotenv from 'dotenv'
import $rdf from 'rdflib'
import solidNamespace from 'solid-namespace'
import auth from 'solid-auth-cli'

dotenv.config()

import listChannels from './src/command-list.mjs'
import archiveChannel from './src/command-archive.mjs'
import showDetailsForChannel from './src/command-details.mjs'
import diagnoseApi from './src/command-test'
import { chatUriFromSlackName, Archive } from './src/class-archive'

const ns = solidNamespace($rdf)

;(async () => {
  yargs
    .command('archive <channel>', 'Archive conversations in channel to pod', function () {}, async function (argv) {
      const archive = await Archive.load()
      await archiveChannel(archive, argv.channel)
      endProgram()
    })
    .command('details <channel>', 'Show details for channel', function () {}, async function (argv) {
      await showDetailsForChannel(argv.channel)
      endProgram()
    })
    .command('list', 'List channels available for actions', function () {},async function () {
      await listChannels()
      endProgram()
    })
    .command('test', 'Test that connection to Slack API works', function () {}, async function () {
      await diagnoseApi()
      endProgram()
    })
    .parse()
})()

function endProgram() {
  process.exit(0)
}


/* Solid Authentication
*/
/*
const SOLID_TOKEN = process.env.SOLID_TOKEN
console.log('SOLID_TOKEN ' + SOLID_TOKEN.length)
if (!SOLID_TOKEN) {
  console.log('NO SOLID TOKEN')
  process.exit(2)
}
*/

const normalOptions = {
//   headers: {Authorization: 'Bearer ' + SOLID_TOKEN}
 }
const forcingOptions = {
  // headers: {Authorization: 'Bearer ' + SOLID_TOKEN},
  force: true }

function clone (options) {
  return Object.assign({}, options)
}

// const archiveBaseURI = 'https://timbl.com/timbl/Public/Archive/'
// const peopleBaseURI = archiveBaseURI + 'Person/'
const peopleBaseURI = 'STANDIN'

/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const kb = store // shorthand -- knowledge base
const fetcher = $rdf.fetcher(store, { fetch: auth.fetch, timeout: 900000 })
const updater = new $rdf.UpdateManager(store)

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

async function putResource (doc) {
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fetcher in future
  return fetcher.putBack(doc, clone(normalOptions))
}


function suitable (x) {
  let tail = x.uri.slice(0, -1).split('/').slice(-1)[0]
  if (!'0123456789'.includes(tail[0])) return false // not numeric
  return true
  // return kb.anyValue(chatDocument, POSIX('size')) !== 0 // empty file?
}

async function firstMessage (chatChannel, backwards) { // backwards -> last message
  var folderStore = $rdf.graph()
  var folderFetcher = new $rdf.Fetcher(folderStore)
  async function earliestSubfolder (parent) {
    // console.log('            parent ' + parent)
    delete folderFetcher.requested[parent.uri]
    var resp = await folderFetcher.load(parent, clone(forcingOptions)) // Force fetch as will have changed
    // await delay(3000) // @@@@@@@ async prob??

    var kids = folderStore.each(parent, ns.ldp('contains'))
    kids = kids.filter(suitable)
    if (kids.length === 0) {
      console.log('            parent2 ' + parent)

      console.log('resp.status ' + resp.status)
      console.log('resp.statusText ' + resp.statusText)

      console.log('folderStore: <<<<<\n' + folderStore + '\n >>>>>>>> ')
      console.trace('ooops no suitable kids - full list:' + folderStore.each(parent, ns.ldp('contains')))
      console.log(' parent: ' + parent)
      console.log(' \ndoc contents: ' + folderStore.statementsMatching(null, null, null, parent))
      console.log(' connected statements: ' + folderStore.connectedStatements(parent))
      // console.log(' connected statements: ' + folderStore.connectedStatements(parent)).map(st => st.toNT()).join('\n   ')
    }

    kids.sort()
    if (backwards) kids.reverse()
    return kids[0]
  }
  let y = await earliestSubfolder(chatChannel.dir())
  let month = await earliestSubfolder(y)
  let d = await earliestSubfolder(month)
  let chatDocument = $rdf.sym(d.uri + 'chat.ttl')
  await folderFetcher.load(chatDocument, clone(normalOptions))
  let messages = folderStore.each(chatChannel, ns.wf('message'), null, chatDocument)
  if (messages.length === 0) {
    let msg = '  INCONSITENCY -- no chat message in file ' + chatDocument
    console.trace(msg)
    throw new Error(msg)
  }
  let sortMe = messages.map(message => [folderStore.any(message, ns.dct('created')), message])
  sortMe.sort()
  if (backwards) sortMe.reverse()
  console.log((backwards ? 'Latest' : 'Earliest') + ' message in solid chat is ' + sortMe[0][1])
  return sortMe[0][1]
}

async function saveEverythingBack () {
  console.log('Saving all modified files:')
  for (let uri in toBePut) {
    if (toBePut.hasOwnProperty(uri)) {
      console.log('Putting ' + uri)
      await putResource($rdf.sym(uri))
      delete fetcher.requested[uri] // invalidate read cache @@ should be done by fether in future
    }
  }
  console.log('Saved all modified files.')
  toBePut = []
}

async function authorFromSlack (fromUser) {
  /* fromUser looks like
    "id": "53307734c3599d1de448e192",
    "username": "malditogeek",
    "displayName": "Mauro Pompilio",
    "url": "/malditogeek",     meaning https://github.com/malditogeek
    "avatarUrlSmall": "https://avatars.githubusercontent.com/u/14751?",
    "avatarUrlMedium": "https://avatars.githubusercontent.com/u/14751?"
  */
  async function saveUserData (fromUser, person) {
    const doc = person.doc()
    store.add(person, ns.rdf('type'), ns.vcard('Individual'), doc)
    store.add(person, ns.rdf('type'), ns.foaf('Person'), doc)
    store.add(person, ns.vcard('fn'), fromUser.displayName, doc)
    store.add(person, ns.foaf('homepage'), 'https://github.com' + fromUser.url, doc)
    store.add(person, ns.foaf('nick'), fromUser.username, doc)
    if (fromUser.avatarUrlMedium) {
      store.add(person, ns.vcard('photo'), $rdf.sym(fromUser.avatarUrlMedium), doc)
    }
    toBePut[doc.uri] = true
  }

  var person = $rdf.sym(peopleBaseURI + encodeURIComponent(fromUser.id) + '/index.ttl#this')
  // console.log('     person id: ' + fromUser.id)
  // console.log('     person solid: ' + person)
  try {
    await fetcher.load(person.doc(), clone(normalOptions)) // If exists, fine... leave it
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('No person file yet, creating ' + person)
      await saveUserData(fromUser, person) // Patch the file into existence
      return person
    } else {
      console.log(' #### Error reading person file ' + err)
      console.log(' #### Error reading person file   ' + JSON.stringify(err))
      console.log('        err.response   ' + err.response)
      console.log('        err.response.status   ' + err.response.status)
    }
  }
  return person
}
/**  Convert src message to Solid
 *
*/
// See https://developer.slack.im/docs/messages-resource

var newMessages = 0
var oldMessages = 0

async function storeMessage (chatChannel, slackMessage) {
  var sent = new Date(slackMessage.sent) // Like "2014-03-25T11:51:32.289Z"
  // console.log('        Message sent on date ' + sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + slackMessage.id) // like "53316dc47bfc1a000000000f"
  // console.log('          Solid Message  ' + message)

  await loadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
    // console.log(`  already got ${slackMessage.sent} message ${message}`)
    oldMessages += 1
    return // alraedy got it
  }
  newMessages += 1
  console.log(`NOT got ${slackMessage.sent} message ${message}`)

  var author = await authorFromSlack(slackMessage.fromUser)
  store.add(chatChannel, ns.wf('message'), message, chatDocument)
  store.add(message, ns.sioc('content'), slackMessage.text, chatDocument)
  if (slackMessage.html && slackMessage.html !== slackMessage.text) { // is it new information?
    store.add(message, ns.sioc('richContent'), slackMessage.html, chatDocument) // @@ predicate??
  }
  store.add(message, ns.dct('created'), sent, chatDocument)
  if (slackMessage.edited) {
    store.add(message, ns.dct('modified'), new Date(slackMessage.edited), chatDocument)
  }
  store.add(message, ns.foaf('maker'), author, chatDocument)
  if (!toBePut[chatDocument.uri]) console.log('   Queueing to write  ' + chatDocument)
  toBePut[chatDocument.uri] = true
  return message
}

/** Update message friomn update operation
*
*
  Input payload Like   {"operation":"update","model":{
"id":"5c97d7ed5547f774485bbf05",
"text":"The quick red fox",
"html":"The quick red fox","sent":"2019-03-24T19:18:05.278Z","editedAt":"2019-03-24T19:18:12.757Z","fromUser":{"id":"54d26c98db8155e6700f7312","username":"timbl","displayName":"Tim Berners-Lee","url":"/timbl","avatarUrl":"https://avatars-02.slack.im/gh/uv/4/timbl","avatarUrlSmall":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=60","avatarUrlMedium":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=128","v":30,"gv":"4"},"unread":true,"readBy":3,"urls":[],"mentions":[],"issues":[],"meta":[],"v":2}}
*/
async function updateMessage (chatChannel, payload) {
  var sent = new Date(payload.sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await loadIfExists(chatDocument)
  var found = store.any(message, ns.sioc('content'))
  if (!found) {
    console.error('DID NOT FIND MESSAGE TO UPDATE ' + payload.id)
    return
  }

  console.log(`Updating  ${payload.sent} message ${message}`)

  var del = []
  var ins = []
  if (payload.text) {
    let oldText = kb.the(message, ns.sioc('content'))
    if (oldText && payload.text === oldText) {
      console.log(` text unchanged as <${oldText}>`)
    } else {
      del.push($rdf.st(message, ns.sioc('content'), oldText, chatDocument))
      ins.push($rdf.st(message, ns.sioc('content'), payload.text, chatDocument))
    }
  }
  if (payload.html) {
    let oldText = kb.the(message, ns.sioc('richContent'))
    if (oldText && payload.text === oldText.value) {
      console.log(` text unchanged as <${oldText}>`)
    } else {
      if (oldText) {
        del.push($rdf.st(message, ns.sioc('richContent'), oldText, chatDocument))
      }
      ins.push($rdf.st(message, ns.sioc('richContent'), payload.html, chatDocument))
    }
  }
  if (ins.length && payload.editedAt) {
    ins.push($rdf.st(message, ns.dct('modified'), new Date(payload.editedAt), chatDocument))
  }
  try {
    await updater.update(del, ins)
  } catch (err) {
    console.error('\n\nERROR UPDATING MESSAGE ' + err)
  }
}

async function deleteMessage (chatChannel, payload) {
  var chatDocument = chatDocumentFromDate(chatChannel, new Date()) // @@ guess now
  var message = $rdf.sym(chatDocument.uri + '#' + payload.id)
  await loadIfExists(chatDocument)
  var found = store.any(message, ns.sioc('content'))
  if (!found) {
    console.error('DID NOT FIND MESSAGE TO UPDATE ' + payload.id)
    return
  }
  console.log(`Deleting  ${payload.sent} message ${message}`)
  var del = store.connectedStatements(message)
  try {
    await updater.update(del, [])
  } catch (err) {
    console.error('\n\n Error deleting message: ' + err)
    return
  }
  console.log(' Deeleted OK.' + message)
}

/// /////////////////////////////  Do Room

async function doRoom (room) {
  console.log(`Doing room ${room.id}:  ${room.name}`)

  var slackRoom = await slack.rooms.find(room.id)
  var solidChannel = chatUriFromSlackName(room.name, archiveBaseURI)
  console.log('    solid channel ' + solidChannel)

  // var users = await slackRoom.users()

  function findEarliestId (messages) {
    var sortMe = messages.map(slackMessage => [slackMessage.sent, slackMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]
    return earliest.id
  }

  async function catchup () {
    newMessages = 0
    oldMessages = 0
    var messages = await slackRoom.chatMessages() // @@@@ ?
    console.log(' messages ' + messages.length)
    for (let slackMessage of messages) {
      await storeMessage(solidChannel, slackMessage)
    }
    await saveEverythingBack()
    if (oldMessages) {
      console.log('End catchup. Found message we alreas had.')
      return true
    }
    var newId = findEarliestId(messages)
    for (let i = 0; i < 30; i++) {
      newId = await extendBeforeId(newId)
      if (!newId) {
        console.log(`End catchup. No more slack messages after ${newMessages} new messages.`)
        return true
      }
      if (oldMessages) {
        console.log(`End catchup. Found message we already had, after ${newMessages} .`)
        return true
      }
      console.log(' ... pause ...')
      await delay(3000) // ms  give the API a rest
    }
    console.log(`FINISHED 30 CATCHUP SESSIONS. NOT DONE after ${newMessages} new messages `)
    return false
  }

  async function initialize () {
    const solidChannel = chatUriFromSlackName(room.name)
    console.log('    solid channel ' + solidChannel)
    // Make the main chat channel file
    var newChatDoc = solidChannel.doc()
    let already = await loadIfExists(newChatDoc)
    if (!already) {
      store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)
      store.add(solidChannel, ns.dc('title'), room.name + ' src chat archive', newChatDoc)
      await putResource(newChatDoc)
      console.log('New chat channel created. ' + solidChannel)
    } else {
      console.log('Chat channel doc already exists:' + solidChannel)
    }
  }

  async function extendArchiveBack () {
    let m0 = await firstMessage(solidChannel)
    let d0 = kb.anyValue(m0, ns.dct('created'))
    console.log('Before extension back, earliest message ' + d0)
    var newId = m0.uri.split('#')[1]
   // var newId = await extendBeforeId(id)
    for (let i = 0; i < 30; i++) {
      newId = await extendBeforeId(newId)
      if (!newId) return null
      console.log(' ... pause ...')
      await delay(3000) // ms  give the API a rest
    }
    return newId
  }

  /*  Like:  {"operation":"create","model":{
  "id":"5c951d6ba21ce51a20a3b3b3",
  "text":"@timbl testing the src-solid importer",
  "status":true,
  "html":"<span data-link-type=\"mention\" data-screen-name=\"timbl\" class=\"mention\">@timbl</span> testing the src-solid importer",
  "sent":"2019-03-22T17:37:47.079Z",
  "fromUser":{
      "id":"54d26c98db8155e6700f7312",
      "username":"timbl"
      ,"displayName":"Tim Berners-Lee",
      "url":"/timbl",
      "avatarUrl":"https://avatars-02.slack.im/gh/uv/4/timbl",
      "avatarUrlSmall":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=60",
      "avatarUrlMedium":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=128",
      "v":30,"gv":"4"}
   ,"unread":true,
   "readBy":0,
   "urls":[],"mentions":[{"screenName":"timbl","userId":"54d26c98db8155e6700f7312","userIds":[]}],"issues":[],"meta":[],"v":1}}

  */
  async function stream (store) {
    var events = slackRoom.streaming().chatMessages()

   // The 'snapshot' event is emitted once, with the last messages in the room
    events.on('snapshot', function (snapshot) {
      console.log(snapshot.length + ' messages in the snapshot')
    })

   // The 'chatMessages' event is emitted on each new message
    events.on('chatMessages', async function (slackEvent) {
      console.log('A slackEvent was ' + slackEvent.operation)
      console.log('Text: ', slackEvent.model.text)
      console.log('slackEvent object: ', JSON.stringify(slackEvent))
      if (slackEvent.operation === 'create') {
        var solidMessage = await storeMessage(solidChannel, slackEvent.model)
        console.log('creating solid message ' + solidMessage)
        var sts = store.connectedStatements(solidMessage)
        try {
          await updater.update([], sts)
          // await saveEverythingBack() // @@ change to patch as much more efficioent
          console.log(`Patched new message ${solidMessage} in `)
        } catch (err) {
          console.error(`Error saving new message ${solidMessage} ` + err)
          throw err
        }
      } else if (slackEvent.operation === 'remove') {
        console.log('Deleting existing message:')
        await deleteMessage(solidChannel, slackEvent.model)
      } else if (slackEvent.operation === 'update') {
        console.log('Updating existing message:')
        await updateMessage(solidChannel, slackEvent.model)
      } else if (slackEvent.operation === 'patch') {
        console.log('Ignoring patch')
      } else {
        console.warn('Unhandled src event operation: ' + slackEvent.operation)
      }
    })
    console.log('streaming ...')
  }

  /* Returns earliest id it finds so can be chained
  */
  async function extendBeforeId (id) {
    console.log(`   Looking for messages before ${id}`)
    let messages = await slackRoom.chatMessages({limit: 100, beforeId: id})
    console.log('      found ' + messages.length)
    if (messages.length === 0) {
      console.log('    END OF BACK FILL - UP TO DATE  ====== ')
      return null
    }
    for (let slackMessage of messages) {
      await storeMessage(solidChannel, slackMessage)
    }
    await saveEverythingBack()
    let m1 = await firstMessage(solidChannel)
    let d1 = kb.anyValue(m1, ns.dct('created'))
    console.log('After extension back, earliest message now ' + d1)

    var sortMe = messages.map(slackMessage => [slackMessage.sent, slackMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]

    return earliest.id
  }

  if (command === 'archive') {
    await extendArchiveBack()
  } else if (command === 'catchup') {
    await catchup()
  } else if (command === 'stream') {
    console.log('catching up to make sure we don\'t miss any when we stream')
    var ok = await catchup()
    if (!ok) {
      console.error('catching up FAILED so NOT starting stream as we would get a gap!')
      throw new Error('Not caught up. Cant stream.')
    }
    console.log('Catchup done. Now set up stream.')
    await stream(store)
  } else if (command === 'init') {
    console.log('First make the solid chat object:')
    await initialize()
    console.log('Now first catchup  recent messages:')
    await catchup()
    console.log('Now extend the archive back hopefully all the way -- but check:')
    let pickUpFrom = await extendArchiveBack()
    if (pickUpFrom) {
      console.log('Did NOT go all the way.   More archive sessions will be needed.')
    } else {
      console.log('Did go all the way. You have the whole archive to date.')
    }
    return pickUpFrom
  }
}

async function go () {
  var oneToOnes = []
  var multiRooms = []

  console.log('Target roomm name: ' + targetRoomName)

  console.log('Log into solid')
  var session = await auth.login()

  console.log('Logging into src ...')
  var user
  try {
    user = await slack.currentUser()
  } catch (err) {
    console.log('Crashed logging into src: ' + err)
    process.exit(3)
  }
  console.log('You are logged in as:', user.username)
  var rooms = await user.rooms()
  console.log('rooms ' + rooms.length)
  var roomIndex = {}
  for (let r = 0; r < rooms.length; r++) {
    var room = rooms[r]
    const oneToOne = room.oneToOne
    const noun = oneToOne ? 'OneToOne' : 'Room'
    roomIndex[room.name] = room
    if (oneToOne) {
      oneToOnes.push(room)
    } else {
      // console.log(`  ${noun} ${room.name} unread ${room.unreadItems}`)
      multiRooms.push(room)
      if (room.name === targetRoomName) {
        console.log('Target room found: ' + room.name)
      }
    }
  }

  var targetRoom = roomIndex[targetRoomName]
  if (targetRoom) {
    try {
      await doRoom(targetRoom)
    } catch (err) {
      console.log(`Error processing room ${targetRoom.name}:` + err)
      console.log(` stack` + err.stack)
      process.exit(1)
    }
    if (command !== 'stream') {
      console.log('Done, exiting. ')
      process.exit(0)
    }
  } else {
    console.log('## Cant find target room ' + targetRoomName)
  }

  await saveEverythingBack()

  console.log('ENDS')
}

var toBePut = []
// go()

// ends
