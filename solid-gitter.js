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

// const archiveBaseURI = 'https://timbl.com/timbl/Public/Archive/'
const peopleBaseURI = archiveBaseURI + 'Person/'

/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const kb = store // shorthand -- knowledge base
const fetcher = new $rdf.Fetcher(store)
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
  var options = {}
  options.headers = {}
  options.headers.Authorization = 'Bearer ' + SOLID_TOKEN
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fether in future
  return fetcher.putBack(doc, options)
}

async function loadIfExists (doc) {
  try {
    await fetcher.load(doc, { force: true })
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('    No chat file yet, creating later ' + doc)
      return false
    } else {
      console.log(' #### Error reading  file ' + err)
      console.log(' #### Error reading person file   ' + JSON.stringify(err))
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
  const folderStore = $rdf.graph()
  const kb = folderStore
  const folderFetcher = new $rdf.Fetcher(folderStore)
  async function earliestSubfolder (parent) {
    console.log('            parent ' + parent)
    await folderFetcher.load(parent, {force: true}) // Force fetch as will have changed
    let kids = kb.each(parent, ns.ldp('contains'))
    kids = kids.filter(suitable)
    kids.sort()
    if (backwards) kids.reverse()
    return kids[0]
  }
  let y = await earliestSubfolder(chatChannel.dir())
  let m = await earliestSubfolder(y)
  let d = await earliestSubfolder(m)
  let chatDocument = $rdf.sym(d.uri + 'chat.ttl')
  await folderFetcher.load(chatDocument)
  let messages = kb.each(chatChannel, ns.wf('message'), null, chatDocument)
  if (messages.length === 0) {
    let msg = '  INCONSITENCY -- no chat message in file ' + chatDocument
    console.trace(msg)
    throw new Error(msg)
  }
  let sortMe = messages.map(m => [kb.any(m, ns.dct('created')), m])
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
    await fetcher.load(person.doc()) // If exists, fine... leave it
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

async function storeMessage (chatChannel, m) {
  var sent = new Date(m.sent) // Like "2014-03-25T11:51:32.289Z"
  // console.log('        Message sent on date ' + sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + m.id) // like "53316dc47bfc1a000000000f"
  // console.log('          Solid Message  ' + message)

  await loadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
    console.log(`  already got ${m.sent} message ${message}`)
    oldMessages += 1
    return // alraedy got it
  }
  newMessages += 1
  console.log(`NOT got ${m.sent} message ${message}`)

  var author = await authorFromGitter(m.fromUser)
  store.add(chatChannel, ns.wf('message'), message, chatDocument)
  store.add(message, ns.sioc('content'), m.text, chatDocument)
  if (m.html && m.html !== m.text) { // is it new information?
    store.add(message, ns.sioc('richContent'), m.html, chatDocument) // @@ predicate??
  }
  store.add(message, ns.dct('created'), sent, chatDocument)
  if (m.edited) {
    store.add(message, ns.dct('modified'), new Date(m.edited), chatDocument)
  }
  store.add(message, ns.foaf('maker'), author, chatDocument)
  if (!toBePut[chatDocument.uri]) console.log('   Queueing to write  ' + chatDocument)
  toBePut[chatDocument.uri] = true
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
    var sortMe = messages.map(m => [m.sent, m])
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

    var sortMe = messages.map(m => [m.sent, m])
    sortMe.sort()
    const earliest = sortMe[0][1]

    return earliest.id
  }

  if (command === 'archive') {
    await extendArchiveBack()
  } else if (command === 'catchup') {
    await catchup()
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

    var sortMe = messages.map(m => [m.sent, m])
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
      console.log(`  ${noun} ${room.name} unread ${room.unreadItems}`)
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
