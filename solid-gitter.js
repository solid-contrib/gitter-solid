// Gitter chat data to solid
// like GITTER_TOKEN 1223487...984 node solid-gitter.js
// See https://developer.gitter.im/docs/welcome
// and https://developer.gitter.im/docs/rest-api

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

const targetRoom = 'Inrupt/team' // @@ for testing

const archiveBaseURI = 'https://timbl.com/timbl/Public/Archive/'
const peopleBaseURI = 'https://timbl.com/timbl/Public/Archive/Person/'

/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const fetcher = new $rdf.Fetcher(store)
// const updater = new $rdf.UpdateManager(store)

function chatDocumentFromDate (chatChannel, date) {
  let isoDate = date.toISOString() // Like "2018-05-07T17:42:46.576Z"
  var path = isoDate.split('T')[0].replace(/-/g, '/') //  Like "2018/05/07"
  path = chatChannel.dir().uri + path + '/chat.ttl'
  return $rdf.sym(path)
}

/* Test version of update
*/

async function update (ddd, sts) {
  const doc = sts[0].why
  // console.log('   Delete ' + ddd.length )
  console.log('   Insert ' + sts.length + ' in ' + doc)
  for (let i = 0; i < sts.length; i++) {
    let st = sts[i]
    console.log(`       ${i}: ${st.subject} ${st.predicate} ${st.object} .`)
  }
}
const updater = {update}

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
  return fetcher.putBack(doc, options)
}

async function loadIfExists (doc) {
  try {
    await fetcher.load(doc)
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      console.log('No file yet, creating later ' + doc)
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

async function saveEverythingBack () {
  console.log('Saving all modified files:' )
  for (uri in toBePut) {
    if (toBePut.hasOwnProperty(uri)) {
      console.log('  putting ' + uri)
      await putResource($rdf.sym(uri))
    }
  }
  console.log('Saved all modified files.' )
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
  console.log('     person id: ' + fromUser.id)
  console.log('     person solid: ' + person)
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


async function storeMessage (chatChannel, m) {
  var sent = new Date(m.sent) // Like "2014-03-25T11:51:32.289Z"
  console.log('        Message sent on date ' + sent)
  var chatDocument = chatDocumentFromDate(chatChannel, sent)
  var message = $rdf.sym(chatDocument.uri + '#' + m.id) // like "53316dc47bfc1a000000000f"
  console.log('          Solid Message  ' + message)

  await loadIfExists(chatDocument)
  if (store.holds(chatChannel, ns.wf('message'), message, chatDocument)) {
    console.log ('             Already got this. ' + m.edited)
    return // alraedy got it
  }
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
  toBePut[chatDocument.uri] = true
}

/// /////////////////////////////  Do Room

async function doRoom (room) {
  console.log('doing room ' + room.name)
  console.log('room.users ' + room.users)
  console.log('room.id ' + room.id)

  var rrr = await gitter.rooms.find(room.id)
  // var users = await rrr.users()
  var messages = await rrr.chatMessages() // @@@@ ?
  console.log(' messages ' + messages.length)
  const solidChannel = chatChannelFromGitterName(room.name)
  console.log('    solid channel ' + solidChannel)

  // Make the main chat channel file
  var newChatDoc = solidChannel.doc()
  store.add(solidChannel, ns.rdf('type'), ns.meeting('LongChat'), newChatDoc)
  store.add(solidChannel, ns.dc('title'), room.name  + ' gitter chat archive', newChatDoc)
  await putResource(newChatDoc)

  for (let m = 0; m < messages.length; m++) {
    let message = messages[m]
    console.log('      storing message of ' + message.sent) // JSON.stringify()
    // console.log('         message::  ' + JSON.stringify(message)) // JSON.stringify()
    await storeMessage(solidChannel, message)
  }
}

async function go () {
  var oneToOnes = []
  var multiRooms = []
  console.log('Logging into gitter ...')
  const user = await gitter.currentUser()
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

  var targetRoomName = 'solid/chat'
  var targetRoom = roomIndex[targetRoomName]
  if (targetRoom) {
    try {
      await doRoom(targetRoom)
    } catch (err) {
      console.log(`Error processing room ${targetRoom.name}:` + err)
      process.exit(1)
    }
  } else {
    console.log('## Cant find target room ' + targetRoomName)
  }

  var repos = await user.repos()
  console.log('repos ' + repos.length)

  var orgs = await user.orgs()
  console.log('orgs ' + orgs.length)

  saveEverythingBack()
  console.log('ENDS')
}

var toBePut = []
go()

// ends
