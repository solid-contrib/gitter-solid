// Gitter chat data to solid
// like GITTER_TOKEN 1223487...984 node solid-gitter.js
// See https://developer.gitter.im/docs/welcome
// and https://developer.gitter.im/docs/rest-api

const command = process.argv[2]
const targetRoomName = process.argv[3] // solid/chat
const archiveBaseURI = process.argv[4] // like 'https://timbl.com/timbl/Public/Archive/'

if (!archiveBaseURI) {
  console.error('syntax:  node solid=gitter.js  <command> <chatroom>  <solid archive root>')
  process.exit(1)
}

var Gitter = require('node-gitter')
var $rdf = require('rdflib')
const solidNamespace = require('solid-namespace')
const ns = solidNamespace($rdf)

if (!ns.wf) {
  ns.wf = new $rdf.Namespace('http://www.w3.org/2005/01/wf/flow#') //  @@ sheck why necessary
}
// see https://www.npmjs.com/package/node-gitter

const GITTER_TOKEN = process.env.GITTER_TOKEN
console.log('GITTER_TOKEN ' + GITTER_TOKEN)
const gitter = new Gitter(GITTER_TOKEN)

const SOLID_TOKEN = process.env.SOLID_TOKEN
console.log('SOLID_TOKEN ' + SOLID_TOKEN.length)
if (!SOLID_TOKEN) {
  console.log('NO SOLID TOKEN')
  process.exit(2)
}

const normalOptions = {headers: {Authorization: 'Bearer ' + SOLID_TOKEN}}
const forcingOptions = {
  headers: {Authorization: 'Bearer ' + SOLID_TOKEN},
  force: true }

function clone (options) {
  return Object.assign({}, options)
}

// const archiveBaseURI = 'https://timbl.com/timbl/Public/Archive/'
const peopleBaseURI = archiveBaseURI + 'Person/'

/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const kb = store // shorthand -- knowledge base
const fetcher = new $rdf.Fetcher(store, {timeout: 900000}) // ms
const updater = new $rdf.UpdateManager(store)
// const updater = new $rdf.UpdateManager(store)

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

/* Test version of update
*/

/*
async function update (ddd, sts) {
  const doc = sts[0].why
  // console.log('   Delete ' + ddd.length )
  console.log('   Insert ' + sts.length + ' in ' + doc)
  for (let i = 0; i < sts.length; i++) {
    let st = sts[i]
    console.log(`       ${i}: ${st.subject} ${st.predicate} ${st.object} .`)
  }
}
*/

/** Decide URI of solid chat vchanel from name of gitter room
 *
 * @param gitterName {String} - like 'solid/chat'
*/
function chatChannelFromGitterName (gitterName) {
  if (!archiveBaseURI.endsWith('/')) throw new Error('base should end with slash')
  let segment = gitterName.split('/').map(encodeURIComponent).join('/') // Preseeve the slash begween org and room
  return $rdf.sym(archiveBaseURI + segment + '/index.ttl#this')
}

/** Track gitter useres

*/

async function putResource (doc) {
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fetcher in future
  return fetcher.putBack(doc, clone(normalOptions))
}

async function loadIfExists (doc) {
  try {
    // delete fetcher.requested[doc.uri]
    await fetcher.load(doc, clone(normalOptions))
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('    No chat file yet, creating later ' + doc)
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
    console.log('            parent ' + parent)
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
  let sortMe = messages.map(gitterMessage => [folderStore.any(gitterMessage, ns.dct('created')), gitterMessage])
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

async function authorFromGitter (fromUser) {
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
/**  Convert gitter message to Solid
 *
*/
// See https://developer.gitter.im/docs/messages-resource

var newMessages = 0
var oldMessages = 0

async function storeMessage (chatChannel, gitterMessage) {
  var sent = new Date(gitterMessage.sent) // Like "2014-03-25T11:51:32.289Z"
  // console.log('        Message sent on date ' + sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + gitterMessage.id) // like "53316dc47bfc1a000000000f"
  // console.log('          Solid Message  ' + message)

  await loadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
    console.log(`  already got ${gitterMessage.sent} message ${message}`)
    oldMessages += 1
    return // alraedy got it
  }
  newMessages += 1
  console.log(`NOT got ${gitterMessage.sent} message ${message}`)

  var author = await authorFromGitter(gitterMessage.fromUser)
  store.add(chatChannel, ns.wf('message'), message, chatDocument)
  store.add(message, ns.sioc('content'), gitterMessage.text, chatDocument)
  if (gitterMessage.html && gitterMessage.html !== gitterMessage.text) { // is it new information?
    store.add(message, ns.sioc('richContent'), gitterMessage.html, chatDocument) // @@ predicate??
  }
  store.add(message, ns.dct('created'), sent, chatDocument)
  if (gitterMessage.edited) {
    store.add(message, ns.dct('modified'), new Date(gitterMessage.edited), chatDocument)
  }
  store.add(message, ns.foaf('maker'), author, chatDocument)
  if (!toBePut[chatDocument.uri]) console.log('   Queueing to write  ' + chatDocument)
  toBePut[chatDocument.uri] = true
  return message
}

/// /////////////////////////////  Do Room

async function doRoom (room) {
  console.log('doing room ' + room.name)
  console.log('room.users ' + room.users)
  console.log('room.id ' + room.id)

  var gitterRoom = await gitter.rooms.find(room.id)
  var solidChannel = chatChannelFromGitterName(room.name)
  console.log('    solid channel ' + solidChannel)

  // var users = await gitterRoom.users()

  function findEarliestId (messages) {
    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]
    return earliest.id
  }

  async function catchup () {
    newMessages = 0
    oldMessages = 0
    var messages = await gitterRoom.chatMessages() // @@@@ ?
    console.log(' messages ' + messages.length)
    for (let gitterMessage of messages) {
      await storeMessage(solidChannel, gitterMessage)
    }
    if (oldMessages) {
      console.log('End catchup. Found message we alreas had.')
      return
    }
    await saveEverythingBack()
    var newId = findEarliestId(messages)
    for (let i = 0; i < 30; i++) {
      newId = await extendBeforeId(newId)
      if (!newId) {
        console.log(`End catchup. No more gitter messages after ${newMessages} new messages.`)
        return
      }
      if (oldMessages) {
        console.log(`End catchup. Found message we already had, after ${newMessages} .`)
        return
      }
      console.log(' ... pause ...')
      await delay(3000) // ms  give the API a rest
    }
    console.log(`FINISHED 30 CATCHUP SESSIONS. NOT DONE after ${newMessages} new messages `)
  }

  async function initialize () {
    const solidChannel = chatChannelFromGitterName(room.name)
    console.log('    solid channel ' + solidChannel)
    // Make the main chat channel file
    var newChatDoc = solidChannel.doc()
    let already = await loadIfExists(newChatDoc)
    if (!already) {
      store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)
      store.add(solidChannel, ns.dc('title'), room.name + ' gitter chat archive', newChatDoc)
      await putResource(newChatDoc)
    } else {
      console.log('Chat channel doc already exists:' + newChatDoc)
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
      if (!newId) return
      console.log(' ... pause ...')
      await delay(3000) // ms  give the API a rest
    }
  }

  /*  Like:  {"operation":"create","model":{
  "id":"5c951d6ba21ce51a20a3b3b3",
  "text":"@timbl testing the gitter-solid importer",
  "status":true,
  "html":"<span data-link-type=\"mention\" data-screen-name=\"timbl\" class=\"mention\">@timbl</span> testing the gitter-solid importer",
  "sent":"2019-03-22T17:37:47.079Z",
  "fromUser":{
      "id":"54d26c98db8155e6700f7312",
      "username":"timbl"
      ,"displayName":"Tim Berners-Lee",
      "url":"/timbl",
      "avatarUrl":"https://avatars-02.gitter.im/gh/uv/4/timbl",
      "avatarUrlSmall":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=60",
      "avatarUrlMedium":"https://avatars2.githubusercontent.com/u/1254848?v=4&s=128",
      "v":30,"gv":"4"}
   ,"unread":true,
   "readBy":0,
   "urls":[],"mentions":[{"screenName":"timbl","userId":"54d26c98db8155e6700f7312","userIds":[]}],"issues":[],"meta":[],"v":1}}

  */
  async function stream (store) {
    var events = gitterRoom.streaming().chatMessages()

   // The 'snapshot' event is emitted once, with the last messages in the room
    events.on('snapshot', function (snapshot) {
      console.log(snapshot.length + ' messages in the snapshot')
    })
    var myUpdater = store.updater
    console.log('store ' + store)
    console.log('myUpdater ' + myUpdater)

   // The 'chatMessages' event is emitted on each new message
    events.on('chatMessages', async function (message) {
      console.log('A message was ' + message.operation)
      console.log('Text: ', message.model.text)
      console.log('message object: ', JSON.stringify(message))
      if (message.operation === 'create') {
        var solidMessage = await storeMessage(solidChannel, message.model)
        console.log('creating solid message ' + solidMessage)
        var sts = store.connectedStatements(solidMessage)
        try {
          await myUpdater.update([], sts)
          console.log(`Patched new message ${solidMessage} in `)
        } catch (err) {
          console.error(`Error saving new message ${solidMessage} ` + err)
          throw err
        }
      } else if (message.operation === 'patch') {
        console.log('Ignoring patch')
      } else {
        console.log('unhandled gitter event operation: ' + message.operation)
      }
    })
    console.log('streaming ...')
  }

  /* Returns earliest id it finds so can be chained
  */
  async function extendBeforeId (id) {
    console.log(`   Looking for messages before ${id}`)
    let messages = await gitterRoom.chatMessages({limit: 100, beforeId: id})
    console.log('      found ' + messages.length)
    if (messages.length === 0) {
      console.log('    END OF BACK FILL - UP TO DATE  ====== ')
      return null
    }
    for (let gitterMessage of messages) {
      await storeMessage(solidChannel, gitterMessage)
    }
    await saveEverythingBack()
    let m1 = await firstMessage(solidChannel)
    let d1 = kb.anyValue(m1, ns.dct('created'))
    console.log('After extension back, earliest message now ' + d1)

    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]

    return earliest.id
  }

  if (command === 'archive') {
    await extendArchiveBack()
  } else if (command === 'catchup') {
    await catchup()
  } else if (command === 'stream') {
    // await catchup()
    await stream(store)
  } else if (command === 'init') {
    initialize()
  }

/*
  if (command != 'archive') return
  var count = 0
  while (count < 30) { // avoid limit on requests
    count += 1
    for (var gitterMessage of messages) {
      await storeMessage(solidChannel, gitterMessage)
    }
    await saveEverythingBack()

    var sortMe = messages.map(gitterMessage => [gitterMessage.sent, gitterMessage])
    sortMe.sort()
    const earliest = sortMe[0][1]
    const latest = sortMe.slice(-1)[0][1]
    console.log(`\n\nearliest message at ${earliest.sent} : ` + earliest.id)
    console.log(`latest message at ${latest.sent} : ` + latest.id)
    var more = await gitterRoom.chatMessages({limit: 100, beforeId: earliest.id}) // @@@@ ?
    console.log(' eg now fetched one sent ' + more[0].sent)

    if (more.length === 0) {
      console.log('=============== end of messagews as none found')
      return
    }
    messages = more
  }
  */
}

async function go () {
  console.log('Target roomm name: ' + targetRoomName)
  var oneToOnes = []
  var multiRooms = []
  console.log('Logging into gitter ...')
  var user
  try {
    user = await gitter.currentUser()
  } catch (err) {
    console.log('Crashed logging into gitter: ' + err)
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
  } else {
    console.log('## Cant find target room ' + targetRoomName)
  }

  await saveEverythingBack()

/*
  var repos = await user.repos()
  console.log('repos ' + repos.length)

  var orgs = await user.orgs()
  console.log('orgs ' + orgs.length)
*/
  console.log('ENDS')
}

var toBePut = []
go()

// ends
